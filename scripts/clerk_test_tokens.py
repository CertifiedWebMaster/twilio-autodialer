import os, json, sys, urllib.request
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")
SK = os.environ["CLERK_SECRET_KEY"]


def bapi(path, body=None, method="POST"):
    req = urllib.request.Request("https://api.clerk.com/v1" + path, data=json.dumps(body).encode() if body is not None else None,
                                 method=method, headers={"Authorization": "Bearer " + SK, "Content-Type": "application/json", "User-Agent": "emergent-test"})
    return json.load(urllib.request.urlopen(req))


def user(email, first):
    found = bapi(f"/users?email_address={urllib.parse.quote(email)}", method="GET")
    if found:
        return found[0]
    return bapi("/users", {"email_address": [email], "password": "Test-pass-12345!", "skip_password_checks": True, "first_name": first})


import urllib.parse
out = {}
for key, email, first in [("admin", "admin+clerk_test@example.com", "Ada"), ("agent", "agent+clerk_test@example.com", "Sam")]:
    u = user(email, first)
    s = bapi("/sessions", {"user_id": u["id"]})
    tok = bapi(f"/sessions/{s['id']}/tokens", {"expires_in_seconds": 3600})["jwt"]
    out[key] = {"id": u["id"], "token": tok}
    if len(sys.argv) > 1 and sys.argv[1] == "ticket":
        out[key]["ticket"] = bapi("/sign_in_tokens", {"user_id": u["id"], "expires_in_seconds": 3600})["token"]
json.dump(out, open("/tmp/tokens.json", "w"))
print({k: v["id"] for k, v in out.items()})
