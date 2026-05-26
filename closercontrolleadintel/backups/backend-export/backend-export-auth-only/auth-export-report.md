# Auth + Cron + Vault Export (Closer Control)

Counts (Query 5):
- auth.users: 23
- auth.identities: 23
- auth.sessions: 32
- auth.refresh_tokens: 235
- vault.secrets: 1

## Files in this directory
- `04_auth_users.sql` — 23 INSERT statements for auth.users
- `05_auth_identities.sql` — 23 INSERT statements for auth.identities (all `provider = email`)
- `07_cron_jobs.sql` — recreate the 2 pg_cron jobs
- `08_vault_secrets.md` — vault.secrets metadata + decrypted cron_secret value

## Dashboard items (not in the DB — must be read from Supabase Dashboard manually)

The following can NOT be queried from the database and were not available via any tool here. You'll need to open the Supabase dashboard for this project to capture them:

- **Authentication → Providers**
  - Email: confirm whether "Confirm email" is on/off
  - Google: OAuth Client ID + Authorized Redirect URL
- **Authentication → URL Configuration**: Site URL + redirect URL allow-list
- **Authentication → Email Templates**: Confirm signup / Magic Link / Invite user / Reset password (custom HTML or default)
- **Project Settings → API**: JWT expiry (default 3600s unless changed)
- **Project Settings → Auth → Advanced**: "Enable email confirmations" ON/OFF

The previous README in this bundle reported "Auto-confirm email signups: enabled" — that means email confirmations are effectively OFF on this project (signups become immediately usable). All 23 existing users have `email_confirmed_at` populated, consistent with auto-confirm on.

## Sessions / refresh tokens
Sessions (32) and refresh_tokens (235) were intentionally NOT exported — they'll be invalidated by the rehost anyway. Users will simply re-login on the new stack; their bcrypt passwords in `04_auth_users.sql` carry over to GoTrue.
