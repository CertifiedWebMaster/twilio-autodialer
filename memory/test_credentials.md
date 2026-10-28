# Test credentials

Auth: Emergent-managed Clerk (Google sign-in only on the UI). Test users are created via Clerk Backend API.
Run `/root/.venv/bin/python /app/scripts/clerk_test_tokens.py` (add `ticket` arg for UI sign-in tickets) -> writes /tmp/tokens.json
with {admin:{id,token,ticket}, agent:{id,token,ticket}}.

- admin+clerk_test@example.com — role admin (set directly in db.users, env preview)
- agent+clerk_test@example.com — role agent
UI sign-in: open <preview_url>/sign-in?__clerk_ticket=<ticket>
Real admin email (ADMIN_EMAIL): gosolarsys@gmail.com — gets admin on first sign-in.
