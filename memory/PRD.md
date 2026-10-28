# AutoDialer — PRD

## Original request
"Import and launch this so it functions as an auto dialer" — https://github.com/CertifiedWebMaster/twilio-autodialer (Laravel 5.4, 2018; plays recorded messages/SMS). The user chose to rebuild it on React + FastAPI + MongoDB.

## User choices
- Real calls via Twilio; the agent talks in the browser (Twilio Voice JS SDK, power dialer that auto-advances)
- Features: CSV contact list upload, call outcomes and notes
- Team with separate logins: Clerk Google sign-in; admin = ADMIN_EMAIL gosolarsys@gmail.com; everyone else is an agent
- ChatGPT (gpt-6-sol, Emergent key; recommended defaults were used): AI tidy notes and AI talking points (SSE streaming)
- Object storage (recommended defaults were used): the original CSV is kept and can be downloaded; attachments on contacts/calls

## Architecture
- backend/server.py (routes), clerk_auth.py, twilio_service.py (auto-creates the TwiML app and API key from the Account SID and Auth Token; tokens; signature validation), ai_service.py, storage_service.py
- Webhooks: /api/twilio/voice (returns a Dial to the contact with answerOnBridge), /api/twilio/dial-status. Both are signature-checked against the stored base_url.
- Frontend (CRA + Tailwind, dark theme): Dialer, Lists, ListDetail (drawer), Calls, Team, Settings

## Implemented (2026-10-28)
- Everything above, tested by the testing agent (iteration_1): backend 17/17 passed. The frontend gaps it found were then fixed.

## Blockers
- Twilio credentials are now valid (Trial account). Setup is done: TwiML app + API key created; the webhook points to the preview URL; signed webhooks were verified. The account has NO phone numbers and NO verified caller IDs, so the user must get a trial number. A trial account can only call verified numbers.
- The user's real Google accounts (floridaroofconsultants@gmail.com, theycallmedude09@gmail.com) are agents. Only gosolarsys@gmail.com becomes admin. Confirm whether to add these accounts as admins.

## Backlog
- P0: valid Twilio keys → Connect in Settings → pick a caller ID → real end-to-end test call
- P1: call recordings, inbound callbacks, per-agent leaderboard, mobile card layout for tables
- DONE (2026-10-28): AI outcome suggestion ("Suggest from notes" in wrap-up; POST /api/ai/suggest-outcome; prefills callback time)
- P2: Q&A about call history, local-presence caller IDs
