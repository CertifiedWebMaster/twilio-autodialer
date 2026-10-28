# AutoDialer API regression tests: auth, roles, lists/CSV, attachments, AI SSE, disposition, twilio webhooks
import json
import os
import uuid
from datetime import datetime, timezone

import pytest
import requests
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
TOK = json.load(open("/tmp/tokens.json"))
mdb = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
REAL_LIST = "b1d19d81-7f35-4f7b-a5fb-a91ea503cb94"

CSV = ("name,phone,city\n"
       "TEST_Alice,(850) 555-0101,Navarre\n"
       "TEST_Bob,850-555-0102,Pensacola\n"
       "TEST_Dup,8505550101,X\n"
       "TEST_Bad,123,Y\n"
       "TEST_Intl,+44 20 7946 0958,London\n"
       "TEST_Dnc,850-555-0199,Z\n")


def h(role):
    return {"Authorization": f"Bearer {TOK[role]['token']}"}


@pytest.fixture(scope="module")
def tlist():
    mdb.dnc.update_one({"phone": "+18505550199"}, {"$set": {"phone": "+18505550199", "added_by": "TEST"}}, upsert=True)
    r = requests.post(f"{API}/lists", headers=h("admin"), data={"name": "TEST_list"},
                      files={"file": ("TEST_contacts.csv", CSV.encode(), "text/csv")})
    assert r.status_code == 200, r.text
    d = r.json()
    yield d
    lid = d["list"]["id"]
    requests.delete(f"{API}/lists/{lid}", headers=h("admin"))
    mdb.calls.delete_many({"list_id": lid})
    mdb.files.delete_many({"contact_id": {"$in": [c["id"] for c in mdb.contacts.find({"list_id": lid})]}})
    mdb.dnc.delete_many({"phone": {"$in": ["+18505550199", "+18505550102"]}})


# --- auth ---
def test_no_token_401():
    for p in ["/me", "/lists", "/calls", "/stats", "/users"]:
        assert requests.get(API + p).status_code == 401, p


def test_me_roles():
    assert requests.get(f"{API}/me", headers=h("admin")).json()["role"] == "admin"
    a = requests.get(f"{API}/me", headers=h("agent")).json()
    assert a["role"] == "agent" and "_id" not in a


def test_agent_forbidden():
    assert requests.get(f"{API}/users", headers=h("agent")).status_code == 403
    assert requests.post(f"{API}/twilio/setup", headers=h("agent")).status_code == 403
    assert requests.patch(f"{API}/lists/{REAL_LIST}/assign", headers=h("agent"), json={"assigned_to": []}).status_code == 403
    assert requests.patch(f"{API}/users/x/role", headers=h("agent"), json={"role": "admin"}).status_code == 403


def test_admin_users():
    r = requests.get(f"{API}/users", headers=h("admin"))
    assert r.status_code == 200 and set(r.json()["roles"]) == {"admin", "agent"}


# --- lists ---
def test_csv_import_counts(tlist):
    assert tlist["imported"] == 3
    assert tlist["duplicates"] == 1 and tlist["invalid"] == 1 and tlist["do_not_call"] == 1
    lid = tlist["list"]["id"]
    cs = requests.get(f"{API}/lists/{lid}/contacts", headers=h("admin")).json()
    phones = {c["name"]: c["phone"] for c in cs}
    assert phones["TEST_Alice"] == "+18505550101" and phones["TEST_Intl"] == "+442079460958"
    assert cs[0]["extra"].get("city") == "Navarre"


def test_csv_no_phone_column():
    r = requests.post(f"{API}/lists", headers=h("admin"), data={"name": "TEST_bad"},
                      files={"file": ("x.csv", b"foo,bar\na,b\n", "text/csv")})
    assert r.status_code == 400


def test_list_file_download(tlist):
    r = requests.get(f"{API}/lists/{tlist['list']['id']}/file", headers=h("admin"))
    assert r.status_code == 200 and r.content.decode() == CSV
    assert "attachment" in r.headers["content-disposition"]


def test_status_filter(tlist):
    lid = tlist["list"]["id"]
    assert len(requests.get(f"{API}/lists/{lid}/contacts?status=pending", headers=h("admin")).json()) == 3
    assert requests.get(f"{API}/lists/{lid}/contacts?status=completed", headers=h("admin")).json() == []


def test_agent_cannot_see_unassigned(tlist):
    lid = tlist["list"]["id"]
    assert requests.get(f"{API}/lists/{lid}", headers=h("agent")).status_code == 404
    assert all(l["id"] != lid for l in requests.get(f"{API}/lists", headers=h("agent")).json())


# --- attachments ---
def test_attachments_crud(tlist):
    cid = requests.get(f"{API}/lists/{tlist['list']['id']}/contacts", headers=h("admin")).json()[0]["id"]
    r = requests.post(f"{API}/contacts/{cid}/attachments", headers=h("admin"),
                      files={"file": ("TEST_note.txt", b"hello attach", "text/plain")})
    assert r.status_code == 200, r.text
    fid = r.json()["id"]
    lst = requests.get(f"{API}/contacts/{cid}/attachments", headers=h("admin")).json()
    assert any(f["id"] == fid for f in lst)
    d = requests.get(f"{API}/attachments/{fid}/download", headers=h("admin"))
    assert d.status_code == 200 and d.content == b"hello attach"
    assert requests.get(f"{API}/contacts/{cid}/attachments", headers=h("agent")).status_code == 404
    assert requests.delete(f"{API}/attachments/{fid}", headers=h("admin")).json()["deleted"]
    assert requests.get(f"{API}/attachments/{fid}/download", headers=h("admin")).status_code == 404


# --- assign + disposition + calls scoping ---
def _mk_call(tlist, agent_id, idx=0):
    c = requests.get(f"{API}/lists/{tlist['list']['id']}/contacts", headers=h("admin")).json()[idx]
    call = {"id": "TEST_" + str(uuid.uuid4()), "contact_id": c["id"], "list_id": tlist["list"]["id"], "list_name": "TEST_list",
            "agent_id": agent_id, "to": c["phone"], "status": "completed", "duration": 0, "outcome": None,
            "notes": "", "created_at": datetime.now(timezone.utc).isoformat()}
    mdb.calls.insert_one(dict(call))
    return call, c


def test_assign_and_agent_flow(tlist):
    lid = tlist["list"]["id"]
    r = requests.patch(f"{API}/lists/{lid}/assign", headers=h("admin"),
                       json={"assigned_to": [TOK["admin"]["id"], TOK["agent"]["id"], "bogus"]})
    assert r.status_code == 200 and set(r.json()["assigned_to"]) == {TOK["admin"]["id"], TOK["agent"]["id"]}
    assert requests.get(f"{API}/lists/{lid}", headers=h("agent")).status_code == 200
    # agent call; admin call
    acall, _ = _mk_call(tlist, TOK["agent"]["id"], 0)
    dcall, _ = _mk_call(tlist, TOK["admin"]["id"], 1)
    ids = [c["id"] for c in requests.get(f"{API}/calls", headers=h("agent")).json()]
    assert acall["id"] in ids and dcall["id"] not in ids
    assert requests.get(f"{API}/calls/{dcall['id']}", headers=h("agent")).status_code == 404
    assert requests.post(f"{API}/calls/{dcall['id']}/disposition", headers=h("agent"), json={"outcome": "busy"}).status_code == 404
    # disposition validations
    assert requests.post(f"{API}/calls/{acall['id']}/disposition", headers=h("agent"), json={"outcome": "zzz"}).status_code == 400
    assert requests.post(f"{API}/calls/{acall['id']}/disposition", headers=h("agent"), json={"outcome": "callback"}).status_code == 400
    r = requests.post(f"{API}/calls/{acall['id']}/disposition", headers=h("agent"),
                      json={"outcome": "callback", "notes": "TEST call me", "callback_at": "2030-01-01T10:00:00Z"})
    assert r.status_code == 200 and r.json()["outcome"] == "callback"
    cs = requests.get(f"{API}/lists/{lid}/contacts?status=callback", headers=h("admin")).json()
    assert len(cs) == 1 and cs[0]["notes"] == "TEST call me"
    # do not call
    r = requests.post(f"{API}/calls/{dcall['id']}/disposition", headers=h("admin"), json={"outcome": "do_not_call"})
    assert r.status_code == 200
    assert mdb.dnc.find_one({"phone": dcall["to"]}) is not None
    # filters
    f = requests.get(f"{API}/calls?outcome=do_not_call&list_id={lid}", headers=h("admin")).json()
    assert [c["id"] for c in f] == [dcall["id"]]


def test_requeue(tlist):
    lid = tlist["list"]["id"]
    call, c = _mk_call(tlist, TOK["admin"]["id"], 2)
    requests.post(f"{API}/calls/{call['id']}/disposition", headers=h("admin"), json={"outcome": "no_answer"})
    assert requests.post(f"{API}/lists/{lid}/requeue", headers=h("agent")).status_code == 403
    r = requests.post(f"{API}/lists/{lid}/requeue", headers=h("admin"))
    assert r.status_code == 200 and r.json()["requeued"] >= 1


# --- AI SSE ---
def _sse(r):
    texts, done, err = [], False, None
    for line in r.iter_lines(decode_unicode=True):
        if not line or not line.startswith("data: "):
            continue
        p = line[6:]
        if p == "[DONE]":
            done = True
            break
        d = json.loads(p)
        if "error" in d:
            err = d["error"]
        texts.append(d.get("t", ""))
    return "".join(texts), done, err


def test_ai_talking_points(tlist):
    cid = requests.get(f"{API}/lists/{tlist['list']['id']}/contacts", headers=h("admin")).json()[0]["id"]
    r = requests.post(f"{API}/ai/talking-points/{cid}", headers=h("admin"), stream=True, timeout=120)
    assert r.status_code == 200 and "text/event-stream" in r.headers["content-type"]
    text, done, err = _sse(r)
    assert done and err is None and len(text) > 20, (text, err)


def test_ai_tidy_notes(tlist):
    call, _ = _mk_call(tlist, TOK["admin"]["id"], 0)
    assert requests.post(f"{API}/ai/tidy-notes", headers=h("admin"), json={"call_id": call["id"], "notes": " "}).status_code == 400
    r = requests.post(f"{API}/ai/tidy-notes", headers=h("admin"), stream=True, timeout=120,
                      json={"call_id": call["id"], "notes": "guy said roof leaking call back next tues maybe", "outcome": "callback"})
    assert r.status_code == 200
    text, done, err = _sse(r)
    assert done and err is None and "Summary" in text, (text, err)


# --- twilio ---
def test_twilio_status_and_setup():
    s = requests.get(f"{API}/twilio/status", headers=h("agent"))
    assert s.status_code == 200 and s.json()["connected"] is False
    r = requests.post(f"{API}/twilio/setup", headers=h("admin"))
    assert r.status_code in (400, 409) and r.json()["detail"], r.text
    print("setup:", r.status_code, r.json())


def test_dialer_next_409(tlist):
    r = requests.post(f"{API}/dialer/next", headers=h("admin"), json={"list_id": tlist["list"]["id"]})
    assert r.status_code == 409


def test_twilio_webhooks_reject():
    assert requests.post(f"{API}/twilio/voice", data={"call_id": "x"}).status_code == 403
    assert requests.post(f"{API}/twilio/dial-status?call_id=x", data={"DialCallStatus": "completed"},
                         headers={"X-Twilio-Signature": "bogus"}).status_code == 403
