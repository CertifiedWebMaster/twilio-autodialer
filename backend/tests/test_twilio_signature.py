# Twilio webhook signature tests with CURRENT TWILIO_AUTH_TOKEN (safe: nonexistent call ids only, no dial)
import json
import os
import uuid

import requests
from dotenv import load_dotenv
from twilio.request_validator import RequestValidator

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
TOK = json.load(open("/tmp/tokens.json"))
V = RequestValidator(os.environ["TWILIO_AUTH_TOKEN"])
LIVE = "+18506050135"


def h(role):
    return {"Authorization": f"Bearer {TOK[role]['token']}"}


def fake_id():
    return f"TEST_nonexistent_{uuid.uuid4().hex}"


# voice webhook: valid signature passes, no dial
def test_voice_valid_signature_no_dial():
    url = f"{API}/twilio/voice"
    params = {"call_id": fake_id(), "From": "client:x", "CallSid": "CAtest"}
    sig = V.compute_signature(url, params)
    r = requests.post(url, data=params, headers={"X-Twilio-Signature": sig})
    assert r.status_code == 200, r.text
    assert "This call could not be placed." in r.text
    assert "<Dial" not in r.text
    assert "application/xml" in r.headers.get("content-type", "")


# voice webhook: bogus signature rejected
def test_voice_bogus_signature_403():
    url = f"{API}/twilio/voice"
    params = {"call_id": fake_id(), "From": "client:x", "CallSid": "CAtest"}
    r = requests.post(url, data=params, headers={"X-Twilio-Signature": "bogus+sig="})
    assert r.status_code == 403
    assert "Invalid Twilio signature" in r.text


# voice webhook: signature for tampered params rejected
def test_voice_tampered_params_403():
    url = f"{API}/twilio/voice"
    params = {"call_id": fake_id(), "From": "client:x", "CallSid": "CAtest"}
    sig = V.compute_signature(url, params)
    params["From"] = "client:y"
    r = requests.post(url, data=params, headers={"X-Twilio-Signature": sig})
    assert r.status_code == 403


# dial-status: valid signature -> 200 empty Response
def test_dial_status_valid_signature():
    url = f"{API}/twilio/dial-status?call_id=nonexistent"
    params = {"CallSid": "CAtest", "DialCallStatus": "completed"}
    sig = V.compute_signature(url, params)
    r = requests.post(url, data=params, headers={"X-Twilio-Signature": sig})
    assert r.status_code == 200, r.text
    body = r.text.strip()
    assert body.endswith("<Response />") or body.endswith("<Response/>"), body


# dial-status: bogus signature 403
def test_dial_status_bogus_signature():
    url = f"{API}/twilio/dial-status?call_id=nonexistent"
    r = requests.post(url, data={"CallSid": "CAtest"}, headers={"X-Twilio-Signature": "nope"})
    assert r.status_code == 403


# admin status
def test_status_admin_connected():
    r = requests.get(f"{API}/twilio/status", headers=h("admin"))
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["connected"] is True and d["caller_id"] == LIVE


# voice token
def test_token_admin_and_agent():
    for role in ("admin", "agent"):
        r = requests.get(f"{API}/twilio/token", headers=h(role))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["token"].count(".") == 2 and d["identity"]


def test_token_no_auth():
    assert requests.get(f"{API}/twilio/token").status_code == 401
