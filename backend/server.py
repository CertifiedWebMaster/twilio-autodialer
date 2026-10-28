import csv
import io
import json
import logging
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional

import requests
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
from pymongo import ReturnDocument
from starlette.concurrency import run_in_threadpool
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import StreamingResponse
from twilio.base.exceptions import TwilioException
from twilio.twiml.voice_response import VoiceResponse

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

try:
    from backend.clerk_auth import clerk_router, require_user
    from backend import twilio_service as tw, ai_service as ai, storage_service as store
except ModuleNotFoundError:
    from clerk_auth import clerk_router, require_user
    import twilio_service as tw
    import ai_service as ai
    import storage_service as store

mongo = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = mongo[os.environ["DB_NAME"]]

app = FastAPI()
api = APIRouter(prefix="/api")
log = logging.getLogger("autodialer")

ROLES = ["admin", "agent"]
DEFAULT_ROLE = "agent"
RETIRED_ROLES = {}
RANK = {r: len(ROLES) - i for i, r in enumerate(ROLES)}
ENV = "live" if os.environ.get("CLERK_PUBLISHABLE_KEY", "").startswith("pk_live_") else "preview"
IN_ENV = {"env": {"$in": [ENV, None]}}

OUTCOMES = ["interested", "not_interested", "voicemail", "no_answer", "busy", "wrong_number", "callback", "do_not_call"]
STALE_LOCK = timedelta(minutes=30)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


def effective_role(role) -> str:
    role = RETIRED_ROLES.get(role, role)
    return role if role in ROLES else DEFAULT_ROLE


@app.on_event("startup")
async def startup():
    for old, new in RETIRED_ROLES.items():
        await db.users.update_many({"role": old}, {"$set": {"role": new}})
    await db.contacts.create_index([("list_id", 1), ("status", 1), ("order", 1)])
    await db.calls.create_index([("agent_id", 1), ("created_at", -1)])
    await db.dnc.create_index("phone", unique=True)
    try:
        await run_in_threadpool(store.init_storage)
    except Exception as e:
        log.error(f"Storage init failed: {e}")


# ---------- auth / members ----------

def _clerk_profile(user_id: str) -> dict:
    r = requests.get(f"https://api.clerk.com/v1/users/{user_id}", timeout=10,
                     headers={"Authorization": f"Bearer {os.environ['CLERK_SECRET_KEY']}", "User-Agent": "emergent-app"})
    r.raise_for_status()
    u = r.json()
    emails = u.get("email_addresses") or []
    primary = next((e["email_address"] for e in emails if e["id"] == u.get("primary_email_address_id")), "")
    verified = {e["email_address"].lower() for e in emails if (e.get("verification") or {}).get("status") == "verified"}
    name = " ".join(x for x in [u.get("first_name"), u.get("last_name")] if x) or primary.split("@")[0]
    return {"email": primary, "name": name, "image_url": u.get("image_url", ""), "verified": verified}


def _is_admin(profile: dict) -> bool:
    admins = {e.strip().lower() for e in os.environ.get("ADMIN_EMAIL", "").split(",") if e.strip()}
    return bool(admins & profile["verified"])


async def current_member(user: dict = Depends(require_user)) -> dict:
    uid = user["user_id"]
    member = await db.users.find_one({"user_id": uid}, {"_id": 0})
    if member is None or not member.get("role") or not member.get("email"):
        profile = await run_in_threadpool(_clerk_profile, uid)
        info = {"email": profile["email"], "name": profile["name"], "image_url": profile["image_url"]}
        if member is None or not member.get("role"):
            role = "admin" if _is_admin(profile) else DEFAULT_ROLE
            await db.users.update_one({"user_id": uid, "role": {"$in": [None, ""]}}, {"$set": {"role": role}})
            member = await db.users.find_one_and_update(
                {"user_id": uid}, {"$setOnInsert": {"user_id": uid, "role": role, "created_at": now_iso()}},
                upsert=True, projection={"_id": 0}, return_document=ReturnDocument.AFTER)
        await db.users.update_one({"user_id": uid}, {"$set": info})
        member = {**member, **info}
    if member.get("env") != ENV:
        await db.users.update_one({"user_id": uid}, {"$set": {"env": ENV}})
    return {**member, "env": ENV, "role": effective_role(member["role"])}


def require_role(*roles: str):
    async def check(member: dict = Depends(current_member)) -> dict:
        if member["role"] not in roles:
            raise HTTPException(status_code=403, detail="Not allowed")
        return member
    return check


@api.get("/")
async def root():
    return {"ok": True}


@api.get("/me")
async def me(member: dict = Depends(current_member)):
    return member


@api.get("/users")
async def list_users(admin: dict = Depends(require_role("admin"))):
    people = await db.users.find(IN_ENV, {"_id": 0}).sort("created_at", 1).to_list(1000)
    return {"roles": [r for r in ROLES if RANK[r] <= RANK[admin["role"]]],
            "users": [{**p, "role": effective_role(p.get("role"))} for p in people]}


class RoleIn(BaseModel):
    role: str


@api.patch("/users/{user_id}/role")
async def set_role(user_id: str, body: RoleIn, admin: dict = Depends(require_role("admin"))):
    if body.role not in ROLES or RANK[body.role] > RANK[admin["role"]]:
        raise HTTPException(status_code=403, detail="Not allowed")
    target = await db.users.find_one({"user_id": user_id, **IN_ENV}, {"_id": 0})
    if target is None:
        raise HTTPException(status_code=404, detail="Not found")
    if (effective_role(target.get("role")) == "admin" and body.role != "admin"
            and await db.users.count_documents({"role": "admin", **IN_ENV}) <= 1):
        raise HTTPException(status_code=409, detail="Keep at least one admin")
    await db.users.update_one({"user_id": user_id}, {"$set": {"role": body.role}})
    return {"user_id": user_id, "role": body.role}


# ---------- contact lists ----------

def normalize_phone(raw: str) -> Optional[str]:
    raw = (raw or "").strip()
    digits = re.sub(r"\D", "", raw)
    if raw.startswith("+"):
        return f"+{digits}" if 8 <= len(digits) <= 15 else None
    if raw.startswith("00") and 10 <= len(digits) - 2 <= 15:
        return f"+{digits[2:]}"
    if len(digits) == 10:
        return f"+1{digits}"
    if len(digits) == 11 and digits.startswith("1"):
        return f"+{digits}"
    return None


PHONE_KEYS = ("phone", "number", "mobile", "cell", "tel")


def parse_csv(text: str) -> List[dict]:
    rows = list(csv.reader(io.StringIO(text)))
    rows = [r for r in rows if any(c.strip() for c in r)]
    if not rows:
        return []
    header = [h.strip().lower() for h in rows[0]]
    phone_idx = next((i for i, h in enumerate(header) if any(k in h for k in PHONE_KEYS)), None)
    if phone_idx is None:
        if normalize_phone(rows[0][0]):
            return [{"phone_raw": r[0], "name": r[1].strip() if len(r) > 1 else "", "extra": {}} for r in rows]
        raise HTTPException(status_code=400, detail="Couldn't find a phone column. Add a header like 'phone'.")
    find = lambda *names: next((i for i, h in enumerate(header) if h in names), None)
    name_i = find("name", "full name", "fullname", "contact", "contact name")
    first_i, last_i = find("first name", "firstname", "first_name", "first"), find("last name", "lastname", "last_name", "last")
    used = {i for i in (phone_idx, name_i, first_i, last_i) if i is not None}
    out = []
    for r in rows[1:]:
        cell = lambda i: r[i].strip() if i is not None and i < len(r) else ""
        name = cell(name_i) or " ".join(x for x in (cell(first_i), cell(last_i)) if x)
        extra = {rows[0][i].strip(): cell(i) for i in range(len(header)) if i not in used and cell(i)}
        out.append({"phone_raw": cell(phone_idx), "name": name, "extra": extra})
    return out


async def list_scope(member: dict) -> dict:
    return {} if member["role"] == "admin" else {"assigned_to": member["user_id"]}


async def get_list_or_404(list_id: str, member: dict) -> dict:
    doc = await db.lists.find_one({"id": list_id, **(await list_scope(member))}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="List not found")
    return doc


async def list_stats(list_ids: List[str]) -> dict:
    stats = {i: {"pending": 0, "in_progress": 0, "callback": 0, "completed": 0} for i in list_ids}
    async for row in db.contacts.aggregate([
        {"$match": {"list_id": {"$in": list_ids}}},
        {"$group": {"_id": {"l": "$list_id", "s": "$status"}, "n": {"$sum": 1}}},
    ]):
        stats[row["_id"]["l"]][row["_id"]["s"]] = row["n"]
    return stats


@api.post("/lists")
async def create_list(name: str = Form(...), file: UploadFile = File(...), member: dict = Depends(current_member)):
    raw = await file.read()
    if len(raw) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File is larger than 10 MB")
    text = raw.decode("utf-8-sig", errors="replace")
    parsed = parse_csv(text)
    dnc = {d["phone"] async for d in db.dnc.find({}, {"_id": 0, "phone": 1})}
    list_id, seen, contacts, invalid, dup, blocked = new_id(), set(), [], 0, 0, 0
    for row in parsed:
        phone = normalize_phone(row["phone_raw"])
        if not phone:
            invalid += 1
            continue
        if phone in seen:
            dup += 1
            continue
        if phone in dnc:
            blocked += 1
            continue
        seen.add(phone)
        contacts.append({"id": new_id(), "list_id": list_id, "order": len(contacts), "name": row["name"],
                         "phone": phone, "extra": row["extra"], "status": "pending", "attempts": 0,
                         "outcome": None, "notes": "", "callback_at": None, "locked_by": None,
                         "last_call_at": None, "created_at": now_iso()})
    if not contacts:
        raise HTTPException(status_code=400, detail="No valid phone numbers found in this file")
    stored = await run_in_threadpool(store.put_object, f"{store.APP_NAME}/lists/{list_id}.csv", raw, "text/csv")
    doc = {"id": list_id, "name": name.strip() or file.filename, "created_by": member["user_id"],
           "created_by_name": member.get("name", ""), "assigned_to": [member["user_id"]],
           "total": len(contacts), "created_at": now_iso(), "file_path": stored["path"], "file_name": file.filename}
    await db.lists.insert_one(dict(doc))
    await db.contacts.insert_many(contacts)
    return {"list": doc, "imported": len(contacts), "invalid": invalid, "duplicates": dup, "do_not_call": blocked}


@api.get("/lists")
async def get_lists(member: dict = Depends(current_member)):
    lists = await db.lists.find(await list_scope(member), {"_id": 0}).sort("created_at", -1).to_list(500)
    stats = await list_stats([l["id"] for l in lists])
    return [{**l, "stats": stats[l["id"]]} for l in lists]


@api.get("/lists/{list_id}")
async def get_list(list_id: str, member: dict = Depends(current_member)):
    doc = await get_list_or_404(list_id, member)
    return {**doc, "stats": (await list_stats([list_id]))[list_id]}


@api.get("/lists/{list_id}/contacts")
async def get_contacts(list_id: str, status: Optional[str] = None, member: dict = Depends(current_member)):
    await get_list_or_404(list_id, member)
    q = {"list_id": list_id, **({"status": status} if status else {})}
    return await db.contacts.find(q, {"_id": 0}).sort("order", 1).to_list(5000)


class AssignIn(BaseModel):
    assigned_to: List[str]


@api.patch("/lists/{list_id}/assign")
async def assign_list(list_id: str, body: AssignIn, admin: dict = Depends(require_role("admin"))):
    await get_list_or_404(list_id, admin)
    valid = {u["user_id"] async for u in db.users.find({"user_id": {"$in": body.assigned_to}, **IN_ENV}, {"user_id": 1})}
    await db.lists.update_one({"id": list_id}, {"$set": {"assigned_to": [u for u in body.assigned_to if u in valid]}})
    return await get_list(list_id, admin)


@api.post("/lists/{list_id}/requeue")
async def requeue(list_id: str, admin: dict = Depends(require_role("admin"))):
    await get_list_or_404(list_id, admin)
    res = await db.contacts.update_many(
        {"list_id": list_id, "status": "completed", "outcome": {"$in": ["no_answer", "busy", "voicemail"]}},
        {"$set": {"status": "pending"}})
    return {"requeued": res.modified_count}


@api.delete("/lists/{list_id}")
async def delete_list(list_id: str, admin: dict = Depends(require_role("admin"))):
    await get_list_or_404(list_id, admin)
    ids = [c["id"] async for c in db.contacts.find({"list_id": list_id}, {"id": 1})]
    await db.files.update_many({"contact_id": {"$in": ids}}, {"$set": {"is_deleted": True}})
    await db.lists.delete_one({"id": list_id})
    await db.contacts.delete_many({"list_id": list_id})
    return {"deleted": True}


# ---------- dialer ----------

async def get_settings() -> dict:
    return await db.settings.find_one({"key": "twilio"}, {"_id": 0}) or {}


def twilio_ready(s: dict) -> bool:
    sid, _ = tw.creds()
    return tw.has_creds() and s.get("account_sid") == sid and bool(s.get("twiml_app_sid"))


async def release_agent_locks(uid: str):
    async for c in db.contacts.find({"locked_by": uid, "status": "in_progress"}, {"_id": 0, "id": 1, "prev_status": 1}):
        await db.contacts.update_one({"id": c["id"]}, {"$set": {"status": c.get("prev_status") or "pending", "locked_by": None}})
    await db.calls.update_many({"agent_id": uid, "outcome": None, "status": {"$in": ["queued", "initiated"]}},
                               {"$set": {"status": "skipped"}})


async def claim_contact(list_id: str, uid: str) -> Optional[dict]:
    now = datetime.now(timezone.utc)
    await db.contacts.update_many(
        {"list_id": list_id, "status": "in_progress", "locked_at": {"$lt": (now - STALE_LOCK).isoformat()}},
        {"$set": {"status": "pending", "locked_by": None}})
    lock = {"status": "in_progress", "locked_by": uid, "locked_at": now.isoformat()}
    queries = [({"list_id": list_id, "status": "callback", "callback_at": {"$lte": now.isoformat()}}, [("callback_at", 1)], "callback"),
               ({"list_id": list_id, "status": "pending"}, [("order", 1)], "pending")]
    for q, sort, prev in queries:
        while True:
            c = await db.contacts.find_one_and_update(q, {"$set": {**lock, "prev_status": prev}, "$inc": {"attempts": 1}},
                                                      sort=sort, projection={"_id": 0}, return_document=ReturnDocument.AFTER)
            if not c:
                break
            if await db.dnc.find_one({"phone": c["phone"]}):
                await db.contacts.update_one({"id": c["id"]}, {"$set": {"status": "completed", "outcome": "do_not_call", "locked_by": None}})
                continue
            return c
    return None


class NextIn(BaseModel):
    list_id: str
    caller_id: Optional[str] = None


_numbers_cache = {"at": 0.0, "nums": []}


async def caller_numbers(fresh: bool = False) -> list:
    now = datetime.now(timezone.utc).timestamp()
    if fresh or now - _numbers_cache["at"] > 60:
        _numbers_cache["nums"] = await run_in_threadpool(tw.list_numbers)
        _numbers_cache["at"] = now
    return _numbers_cache["nums"]


@api.post("/dialer/next")
async def dialer_next(body: NextIn, member: dict = Depends(current_member)):
    s = await get_settings()
    if not twilio_ready(s):
        raise HTTPException(status_code=409, detail="Twilio isn't connected yet. An admin must connect it in Settings.")
    caller = body.caller_id or s.get("caller_id")
    if not caller:
        raise HTTPException(status_code=409, detail="Pick a caller ID first.")
    if body.caller_id and body.caller_id != s.get("caller_id"):
        try:
            allowed = {n["number"] for n in await caller_numbers()}
        except TwilioException:
            allowed = set()
        if body.caller_id not in allowed:
            raise HTTPException(status_code=400, detail="That caller ID isn't on your Twilio account")
    lst = await get_list_or_404(body.list_id, member)
    await release_agent_locks(member["user_id"])
    contact = await claim_contact(body.list_id, member["user_id"])
    if not contact:
        return {"done": True}
    call = {"id": new_id(), "call_sid": None, "contact_id": contact["id"], "list_id": lst["id"], "list_name": lst["name"],
            "agent_id": member["user_id"], "agent_name": member.get("name", ""), "to": contact["phone"],
            "contact_name": contact["name"], "from": caller, "status": "queued", "duration": 0,
            "outcome": None, "notes": "", "callback_at": None, "created_at": now_iso(), "ended_at": None}
    await db.calls.insert_one(dict(call))
    return {"done": False, "call": call, "contact": contact}


@api.post("/dialer/skip/{call_id}")
async def dialer_skip(call_id: str, member: dict = Depends(current_member)):
    call = await db.calls.find_one({"id": call_id, "agent_id": member["user_id"]}, {"_id": 0})
    if not call:
        raise HTTPException(status_code=404, detail="Not found")
    c = await db.contacts.find_one({"id": call["contact_id"]}, {"_id": 0, "prev_status": 1})
    await db.contacts.update_one({"id": call["contact_id"], "locked_by": member["user_id"]},
                                 {"$set": {"status": (c or {}).get("prev_status") or "pending", "locked_by": None},
                                  "$inc": {"order": 100000}})
    await db.calls.update_one({"id": call_id}, {"$set": {"status": "skipped"}})
    return {"skipped": True}


@api.post("/dialer/release")
async def dialer_release(member: dict = Depends(current_member)):
    await release_agent_locks(member["user_id"])
    return {"released": True}


class DispositionIn(BaseModel):
    outcome: str
    notes: str = ""
    callback_at: Optional[str] = None


@api.post("/calls/{call_id}/disposition")
async def disposition(call_id: str, body: DispositionIn, member: dict = Depends(current_member)):
    if body.outcome not in OUTCOMES:
        raise HTTPException(status_code=400, detail="Unknown outcome")
    cb = None
    if body.outcome == "callback":
        if not body.callback_at:
            raise HTTPException(status_code=400, detail="Pick a callback date and time")
        try:
            cb = datetime.fromisoformat(body.callback_at.replace("Z", "+00:00")).astimezone(timezone.utc).isoformat()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid callback date")
    scope = {} if member["role"] == "admin" else {"agent_id": member["user_id"]}
    call = await db.calls.find_one({"id": call_id, **scope}, {"_id": 0})
    if not call:
        raise HTTPException(status_code=404, detail="Not found")
    notes = body.notes.strip()[:5000]
    await db.calls.update_one({"id": call_id}, {"$set": {"outcome": body.outcome, "notes": notes, "callback_at": cb,
                                                         "disposed_at": now_iso()}})
    await db.contacts.update_one({"id": call["contact_id"]}, {"$set": {
        "status": "callback" if cb else "completed", "outcome": body.outcome, "notes": notes, "callback_at": cb,
        "last_call_at": call["created_at"], "locked_by": None}})
    if body.outcome == "do_not_call":
        await db.dnc.update_one({"phone": call["to"]}, {"$setOnInsert": {"phone": call["to"], "added_by": member["user_id"],
                                                                         "created_at": now_iso()}}, upsert=True)
    return await db.calls.find_one({"id": call_id}, {"_id": 0})


@api.get("/calls")
async def get_calls(agent_id: Optional[str] = None, outcome: Optional[str] = None, list_id: Optional[str] = None,
                    member: dict = Depends(current_member)):
    q = {"status": {"$ne": "skipped"}}
    if member["role"] != "admin":
        q["agent_id"] = member["user_id"]
    elif agent_id:
        q["agent_id"] = agent_id
    if outcome:
        q["outcome"] = outcome
    if list_id:
        q["list_id"] = list_id
    return await db.calls.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)


@api.get("/stats")
async def stats(member: dict = Depends(current_member)):
    start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    q = {"created_at": {"$gte": start}, "status": {"$nin": ["skipped", "queued"]}}
    if member["role"] != "admin":
        q["agent_id"] = member["user_id"]
    calls = await db.calls.find(q, {"_id": 0, "duration": 1, "outcome": 1, "status": 1}).to_list(10000)
    return {"calls_today": len(calls),
            "connected": sum(1 for c in calls if (c.get("duration") or 0) > 0),
            "interested": sum(1 for c in calls if c.get("outcome") == "interested"),
            "talk_seconds": sum(c.get("duration") or 0 for c in calls)}


# ---------- twilio ----------

def public_base(request: Request) -> str:
    host = (request.headers.get("x-forwarded-host") or request.headers.get("host", "")).split(",")[0].strip()
    return f"https://{host}"


@api.get("/twilio/status")
async def twilio_status(member: dict = Depends(current_member)):
    s = await get_settings()
    return {"has_credentials": tw.has_creds(), "connected": twilio_ready(s), "caller_id": s.get("caller_id"),
            "webhook_base": s.get("base_url")}


@api.post("/twilio/setup")
async def twilio_setup(request: Request, admin: dict = Depends(require_role("admin"))):
    if not tw.has_creds():
        raise HTTPException(status_code=409, detail="Add your Twilio Account SID and Auth Token first")
    if not tw.creds()[0].startswith("AC"):
        raise HTTPException(status_code=400, detail="The saved Twilio Account SID must start with 'AC' (an 'SK' value is an API key, not the Account SID)")
    try:
        s = await run_in_threadpool(tw.setup_app, await get_settings(), public_base(request))
    except TwilioException as e:
        raise HTTPException(status_code=400, detail=f"Twilio rejected the request: {getattr(e, 'msg', None) or e}")
    await db.settings.update_one({"key": "twilio"}, {"$set": {**s, "key": "twilio", "updated_at": now_iso()}}, upsert=True)
    return await twilio_status(admin)


@api.get("/twilio/numbers")
async def twilio_numbers(admin: dict = Depends(require_role("admin"))):
    if not tw.has_creds():
        raise HTTPException(status_code=409, detail="Twilio credentials missing")
    if not tw.creds()[0].startswith("AC"):
        raise HTTPException(status_code=400, detail="The saved Twilio Account SID must start with 'AC'")
    try:
        return await caller_numbers(fresh=True)
    except TwilioException as e:
        raise HTTPException(status_code=400, detail=f"Twilio rejected the request: {getattr(e, 'msg', None) or e}")


@api.get("/twilio/caller-ids")
async def twilio_caller_ids(member: dict = Depends(current_member)):
    s = await get_settings()
    nums = []
    if tw.has_creds() and tw.creds()[0].startswith("AC"):
        try:
            nums = await caller_numbers()
        except TwilioException:
            nums = []
    return {"default": s.get("caller_id"), "numbers": nums}


class VerifyIn(BaseModel):
    number: str
    name: str = ""


@api.post("/twilio/verify-caller")
async def twilio_verify_caller(body: VerifyIn, admin: dict = Depends(require_role("admin"))):
    number = normalize_phone(body.number)
    if not number:
        raise HTTPException(status_code=400, detail="Enter a valid phone number")
    if not tw.has_creds() or not tw.creds()[0].startswith("AC"):
        raise HTTPException(status_code=409, detail="Twilio credentials missing")
    try:
        code = await run_in_threadpool(tw.verify_caller, number, body.name.strip()[:60])
    except TwilioException as e:
        raise HTTPException(status_code=400, detail=f"Twilio rejected the request: {getattr(e, 'msg', None) or e}")
    return {"number": number, "validation_code": code}


class CallerIn(BaseModel):
    caller_id: str


@api.patch("/twilio/caller-id")
async def set_caller(body: CallerIn, admin: dict = Depends(require_role("admin"))):
    nums = {n["number"] for n in await twilio_numbers(admin)}
    if body.caller_id not in nums:
        raise HTTPException(status_code=400, detail="That number isn't on your Twilio account")
    await db.settings.update_one({"key": "twilio"}, {"$set": {"caller_id": body.caller_id, "key": "twilio"}}, upsert=True)
    return await twilio_status(admin)


@api.get("/twilio/token")
async def twilio_token(member: dict = Depends(current_member)):
    s = await get_settings()
    if not twilio_ready(s):
        raise HTTPException(status_code=409, detail="Twilio isn't connected yet")
    return {"token": tw.voice_token(s, member["user_id"]), "identity": member["user_id"]}


async def verified_form(request: Request, path: str) -> dict:
    s = await get_settings()
    params = dict(await request.form())
    url = f"{s.get('base_url', '')}{path}"
    if request.url.query:
        url += f"?{request.url.query}"
    if not s.get("base_url") or not tw.valid_signature(url, params, request.headers.get("x-twilio-signature", "")):
        raise HTTPException(status_code=403, detail="Invalid Twilio signature")
    return params


def twiml(resp: VoiceResponse) -> Response:
    return Response(content=str(resp), media_type="application/xml")


@api.post("/twilio/voice")
async def twilio_voice(request: Request):
    params = await verified_form(request, "/api/twilio/voice")
    resp = VoiceResponse()
    call = await db.calls.find_one({"id": params.get("call_id", "")}, {"_id": 0})
    if not call or params.get("From") != f"client:{call['agent_id']}" or call["status"] != "queued":
        resp.say("This call could not be placed.")
        return twiml(resp)
    s = await get_settings()
    await db.calls.update_one({"id": call["id"]}, {"$set": {"call_sid": params.get("CallSid"), "status": "initiated"}})
    dial = resp.dial(caller_id=call.get("from") or s["caller_id"], answer_on_bridge=True, timeout=30, method="POST",
                     action=f"{s['base_url']}/api/twilio/dial-status?call_id={call['id']}")
    dial.number(call["to"])
    return twiml(resp)


@api.post("/twilio/dial-status")
async def twilio_dial_status(request: Request, call_id: str):
    params = await verified_form(request, "/api/twilio/dial-status")
    await db.calls.update_one({"id": call_id}, {"$set": {
        "status": params.get("DialCallStatus", "completed"), "duration": int(params.get("DialCallDuration") or 0),
        "dial_sid": params.get("DialCallSid"), "ended_at": now_iso()}})
    return twiml(VoiceResponse())


@api.get("/calls/{call_id}")
async def get_call(call_id: str, member: dict = Depends(current_member)):
    scope = {} if member["role"] == "admin" else {"agent_id": member["user_id"]}
    call = await db.calls.find_one({"id": call_id, **scope}, {"_id": 0})
    if not call:
        raise HTTPException(status_code=404, detail="Not found")
    return call


# ---------- files ----------

@api.get("/lists/{list_id}/file")
async def download_list_file(list_id: str, member: dict = Depends(current_member)):
    lst = await get_list_or_404(list_id, member)
    if not lst.get("file_path"):
        raise HTTPException(status_code=404, detail="No original file stored for this list")
    data, _ = await run_in_threadpool(store.get_object, lst["file_path"])
    name = re.sub(r'[^\w.\- ]', "_", lst.get("file_name") or "contacts.csv")
    return Response(content=data, media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{name}"'})


async def get_contact_or_404(contact_id: str, member: dict) -> dict:
    c = await db.contacts.find_one({"id": contact_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Contact not found")
    lst = await get_list_or_404(c["list_id"], member)
    return {**c, "list_name": lst["name"]}


MAX_ATTACHMENT = 15 * 1024 * 1024


@api.post("/contacts/{contact_id}/attachments")
async def add_attachment(contact_id: str, file: UploadFile = File(...), call_id: Optional[str] = Form(None),
                         member: dict = Depends(current_member)):
    await get_contact_or_404(contact_id, member)
    data = await file.read()
    if not data or len(data) > MAX_ATTACHMENT:
        raise HTTPException(status_code=400, detail="File must be between 1 byte and 15 MB")
    ext = file.filename.rsplit(".", 1)[-1].lower()[:8] if "." in (file.filename or "") else "bin"
    fid = new_id()
    ctype = file.content_type or "application/octet-stream"
    stored = await run_in_threadpool(store.put_object, f"{store.APP_NAME}/attachments/{contact_id}/{fid}.{ext}", data, ctype)
    doc = {"id": fid, "contact_id": contact_id, "call_id": call_id, "storage_path": stored["path"],
           "original_filename": file.filename, "content_type": ctype, "size": len(data), "is_deleted": False,
           "uploaded_by": member["user_id"], "uploaded_by_name": member.get("name", ""), "created_at": now_iso()}
    await db.files.insert_one(dict(doc))
    return doc


@api.get("/contacts/{contact_id}/attachments")
async def list_attachments(contact_id: str, member: dict = Depends(current_member)):
    await get_contact_or_404(contact_id, member)
    return await db.files.find({"contact_id": contact_id, "is_deleted": False}, {"_id": 0}).sort("created_at", -1).to_list(200)


async def get_file_or_404(file_id: str, member: dict) -> dict:
    f = await db.files.find_one({"id": file_id, "is_deleted": False}, {"_id": 0})
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    await get_contact_or_404(f["contact_id"], member)
    return f


@api.get("/attachments/{file_id}/download")
async def download_attachment(file_id: str, member: dict = Depends(current_member)):
    f = await get_file_or_404(file_id, member)
    data, _ = await run_in_threadpool(store.get_object, f["storage_path"])
    name = re.sub(r'[^\w.\- ]', "_", f["original_filename"] or "file")
    return Response(content=data, media_type=f["content_type"], headers={"Content-Disposition": f'attachment; filename="{name}"'})


@api.delete("/attachments/{file_id}")
async def delete_attachment(file_id: str, member: dict = Depends(current_member)):
    f = await get_file_or_404(file_id, member)
    if member["role"] != "admin" and f["uploaded_by"] != member["user_id"]:
        raise HTTPException(status_code=404, detail="File not found")
    await db.files.update_one({"id": file_id}, {"$set": {"is_deleted": True}})
    return {"deleted": True}


# ---------- AI ----------

async def ai_provider() -> str:
    doc = await db.settings.find_one({"key": "ai"}, {"_id": 0}) or {}
    return doc.get("provider") if doc.get("provider") in ai.MODELS else "openai"


@api.get("/ai/settings")
async def get_ai_settings(member: dict = Depends(current_member)):
    return {"provider": await ai_provider(), "options": [{"key": k, "label": v} for k, v in ai.LABELS.items()]}


class AiSettingsIn(BaseModel):
    provider: str


@api.patch("/ai/settings")
async def set_ai_settings(body: AiSettingsIn, admin: dict = Depends(require_role("admin"))):
    if body.provider not in ai.MODELS:
        raise HTTPException(status_code=400, detail="Unknown AI provider")
    await db.settings.update_one({"key": "ai"}, {"$set": {"key": "ai", "provider": body.provider, "updated_at": now_iso()}}, upsert=True)
    return await get_ai_settings(admin)

def sse(gen, on_done=None):
    async def run():
        full = []
        try:
            async for chunk in gen:
                full.append(chunk)
                yield f"data: {json.dumps({'t': chunk})}\n\n"
            if on_done:
                await on_done("".join(full))
        except Exception as e:
            log.error(f"AI stream failed: {e}")
            yield f"data: {json.dumps({'error': 'AI is unavailable right now. Try again in a moment.'})}\n\n"
        yield "data: [DONE]\n\n"
    return StreamingResponse(run(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


class SuggestIn(BaseModel):
    call_id: str
    notes: str
    local_now: str = ""


@api.post("/ai/suggest-outcome")
async def ai_suggest(body: SuggestIn, member: dict = Depends(current_member)):
    if not body.notes.strip():
        raise HTTPException(status_code=400, detail="Write a few notes first")
    call = await get_call(body.call_id, member)
    contact = await db.contacts.find_one({"id": call["contact_id"]}, {"_id": 0}) or {}
    try:
        raw = await ai.complete(ai.OUTCOME_PROMPT, ai.outcome_input(body.notes[:5000], contact, call, body.local_now[:40]), await ai_provider())
        data = json.loads(raw[raw.find("{"): raw.rfind("}") + 1])
    except Exception as e:
        log.error(f"AI suggest failed: {e}")
        raise HTTPException(status_code=502, detail="AI couldn't suggest an outcome. Pick one yourself.")
    outcome = data.get("outcome")
    if outcome not in OUTCOMES:
        raise HTTPException(status_code=502, detail="AI couldn't suggest an outcome. Pick one yourself.")
    cb = data.get("callback_at") if outcome == "callback" else None
    if cb and not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}", str(cb)):
        cb = None
    return {"outcome": outcome, "reason": str(data.get("reason") or "")[:140], "callback_at": cb}


class TidyIn(BaseModel):
    call_id: str
    notes: str
    outcome: Optional[str] = None


@api.post("/ai/tidy-notes")
async def ai_tidy(body: TidyIn, member: dict = Depends(current_member)):
    if not body.notes.strip():
        raise HTTPException(status_code=400, detail="Write a few notes first")
    call = await get_call(body.call_id, member)
    contact = await db.contacts.find_one({"id": call["contact_id"]}, {"_id": 0}) or {}
    return sse(ai.stream(ai.NOTES_PROMPT, ai.notes_input(body.notes[:5000], contact, body.outcome), await ai_provider()))


@api.post("/ai/talking-points/{contact_id}")
async def ai_points(contact_id: str, member: dict = Depends(current_member)):
    contact = await get_contact_or_404(contact_id, member)
    history = await db.calls.find({"contact_id": contact_id, "outcome": {"$ne": None}}, {"_id": 0}).sort("created_at", -1).to_list(5)

    async def save(text):
        await db.contacts.update_one({"id": contact_id}, {"$set": {"talking_points": text}})
    return sse(ai.stream(ai.POINTS_PROMPT, ai.contact_input(contact, history), await ai_provider()), save)


app.include_router(api)
app.include_router(clerk_router)
app.add_middleware(CORSMiddleware, allow_credentials=True,
                   allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","), allow_methods=["*"], allow_headers=["*"])
