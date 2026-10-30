# Twilio LIVE readiness tests (safe: never places calls, never claims real contacts)
import base64
import json
import os

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
LIVE = "+18506050135"


def h(role):
    return {"Authorization": f"Bearer {TOK[role]['token']}"}


@pytest.fixture(scope="module")
def tlist():
    csv = "name,phone\nTEST_One,850-555-0111\nTEST_Two,850-555-0112\n"
    r = requests.post(f"{API}/lists", headers=h("admin"), data={"name": "TEST_live_list"},
                      files={"file": ("TEST_live.csv", csv.encode(), "text/csv")})
    assert r.status_code == 200, r.text
    d = r.json()["list"]
    yield d
    requests.delete(f"{API}/lists/{d['id']}", headers=h("admin"))
    mdb.calls.delete_many({"list_id": d["id"]})


# status
def test_status_admin():
    r = requests.get(f"{API}/twilio/status", headers=h("admin"))
    assert r.status_code == 200
    d = r.json()
    assert d["has_credentials"] is True and d["connected"] is True and d["caller_id"] == LIVE


def test_status_no_auth():
    assert requests.get(f"{API}/twilio/status").status_code == 401


# caller ids
def test_caller_ids_agent():
    r = requests.get(f"{API}/twilio/caller-ids", headers=h("agent"))
    assert r.status_code == 200
    d = r.json()
    nums = {n["number"] for n in d["numbers"]}
    assert d["default"] == LIVE
    assert LIVE in nums and "+14079065477" in nums, d


def test_numbers_admin_only():
    assert requests.get(f"{API}/twilio/numbers", headers=h("agent")).status_code == 403
    r = requests.get(f"{API}/twilio/numbers", headers=h("admin"))
    assert r.status_code == 200 and LIVE in {n["number"] for n in r.json()}


# token
@pytest.mark.parametrize("role", ["admin", "agent"])
def test_token_jwt(role):
    r = requests.get(f"{API}/twilio/token", headers=h(role))
    assert r.status_code == 200, r.text
    d = r.json()
    parts = d["token"].split(".")
    assert len(parts) == 3
    payload = json.loads(base64.urlsafe_b64decode(parts[1] + "=" * (-len(parts[1]) % 4)))
    assert payload["grants"]["identity"] == d["identity"] == TOK[role]["id"]
    assert payload["grants"]["voice"]["outgoing"]["application_sid"].startswith("AP")


def test_token_no_auth():
    assert requests.get(f"{API}/twilio/token").status_code == 401


# webhooks
def test_voice_bad_signature():
    assert requests.post(f"{API}/twilio/voice", data={"call_id": "x", "From": "client:x"}).status_code == 403
    r = requests.post(f"{API}/twilio/voice", data={"call_id": "x"}, headers={"X-Twilio-Signature": "bogus"})
    assert r.status_code == 403


def test_dial_status_bad_signature():
    r = requests.post(f"{API}/twilio/dial-status?call_id=x", data={"DialCallStatus": "completed"},
                      headers={"X-Twilio-Signature": "bogus"})
    assert r.status_code == 403


# dialer/next with bogus caller id must 400 and not claim
def test_next_bogus_caller_test_list(tlist):
    before_calls = mdb.calls.count_documents({"list_id": tlist["id"]})
    r = requests.post(f"{API}/dialer/next", headers=h("admin"),
                      json={"list_id": tlist["id"], "caller_id": "+19999999999"})
    assert r.status_code == 400, r.text
    assert "caller ID" in r.json()["detail"]
    assert mdb.contacts.count_documents({"list_id": tlist["id"], "status": "in_progress"}) == 0
    assert mdb.contacts.count_documents({"list_id": tlist["id"], "attempts": {"$gt": 0}}) == 0
    assert mdb.calls.count_documents({"list_id": tlist["id"]}) == before_calls


def test_next_bogus_caller_agent_unknown_list():
    r = requests.post(f"{API}/dialer/next", headers=h("agent"),
                      json={"list_id": "nonexistent", "caller_id": "+19999999999"})
    assert r.status_code == 400
