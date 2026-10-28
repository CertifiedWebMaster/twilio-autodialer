import os

from twilio.jwt.access_token import AccessToken
from twilio.jwt.access_token.grants import VoiceGrant
from twilio.request_validator import RequestValidator
from twilio.rest import Client

APP_NAME = "AutoDialer Browser Calling"


def creds():
    return os.environ.get("TWILIO_ACCOUNT_SID", ""), os.environ.get("TWILIO_AUTH_TOKEN", "")


def has_creds() -> bool:
    sid, token = creds()
    return bool(sid and token)


def client() -> Client:
    sid, token = creds()
    return Client(sid, token)


def setup_app(existing: dict, base_url: str) -> dict:
    """Create (or refresh) the API key and TwiML app used for browser calling."""
    c = client()
    sid, _ = creds()
    out = dict(existing or {})
    if out.get("account_sid") != sid:
        out = {}
    voice_url = f"{base_url}/api/twilio/voice"
    if out.get("twiml_app_sid"):
        c.applications(out["twiml_app_sid"]).update(voice_url=voice_url, voice_method="POST")
    else:
        app = c.applications.create(friendly_name=APP_NAME, voice_url=voice_url, voice_method="POST")
        out["twiml_app_sid"] = app.sid
    if not out.get("api_key_sid"):
        key = c.new_keys.create(friendly_name="AutoDialer browser tokens")
        out["api_key_sid"], out["api_key_secret"] = key.sid, key.secret
    out["account_sid"] = sid
    out["base_url"] = base_url
    return out


def list_numbers() -> list:
    c = client()
    nums = [{"number": n.phone_number, "label": n.friendly_name, "type": "Twilio number"}
            for n in c.incoming_phone_numbers.list(limit=100)]
    nums += [{"number": n.phone_number, "label": n.friendly_name, "type": "Verified caller ID"}
             for n in c.outgoing_caller_ids.list(limit=100)]
    return nums


def voice_token(settings: dict, identity: str) -> str:
    sid, _ = creds()
    token = AccessToken(sid, settings["api_key_sid"], settings["api_key_secret"], identity=identity, ttl=3600)
    token.add_grant(VoiceGrant(outgoing_application_sid=settings["twiml_app_sid"], incoming_allow=False))
    return token.to_jwt()


def valid_signature(url: str, params: dict, signature: str) -> bool:
    _, auth_token = creds()
    return RequestValidator(auth_token).validate(url, params, signature)
