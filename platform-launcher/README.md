# Closer Control — Unified Platform Launcher

React (Vite) app served by nginx on **port 8080**. Single login → unified
dashboard → open ACQ Coach or Lead Intel already signed in.

## Why dual-login + token handoff (not one-token SSO)

ACQ Coach (`:54421`) and Lead Intel (`:54422`) are **two independent Supabase /
GoTrue backends** with **different JWT secrets** and **separate user tables**. A
token minted by one is cryptographically rejected by the other. The launcher,
the two apps, and their APIs are also on **different ports = different origins**,
so localStorage cannot be shared between them.

So the launcher:

1. **Dual login** — on submit, fires the password grant against *both* GoTrue
   backends with the same email+password (`src/auth.ts → dualLogin`). Requires
   the same password on both backends (both are `CloserControl2025!`). If one
   backend rejects, that product's card falls back to "Open App (sign in)".
2. **Token handoff** — "Open App" navigates to the app with the session in a URL
   fragment: `http://localhost:3100/#cc_sso=<base64 {access_token, refresh_token}>`.
3. Each app's `src/main.tsx` consumes the fragment, calls
   `supabase.auth.setSession(...)`, and strips it from the URL before rendering.

## Files

- `src/theme.ts` — shared dark/light tokens (localStorage key `acqcoach_theme`)
- `src/config.ts` — fetches `/config.json` (URLs + public anon keys)
- `src/auth.ts` — dual login, session storage, handoff link builder, super-admin
  check, per-user product access
- `src/Login.tsx` — single login form + theme toggle
- `src/Dashboard.tsx` — product cards, Open App handoff, super-admin Manage Access
- `entrypoint.sh` — writes `config.json` at container start (anon keys baked as defaults)
- `Dockerfile` — multi-stage: Vite build → nginx static serve

## Deploy

The launcher is **stateless** — safe to rebuild/recreate:

```bash
cd platform-launcher && docker compose up -d --build
```

⚠️ **Port 8080 gotcha:** a Vite dev server (`/loop` preview, `.claude/launch.json`
"acq-coach") can squat on host port 8080 and shadow this container. If
`curl localhost:8080` shows the wrong app, stop the dev server holding the port,
then `docker compose restart launcher`.

## Product access (super-admin)

Stored in `localStorage["cc_product_access_<userId>"] = {acq, leadintel}`.
Super-admin status is detected via a best-effort read of Lead Intel's
`public.users.role`. Toggles + "Manage Access" only render for super admins.

## Password management — keep both backends in sync

Because the dual-login requires the **same password on both backends**, passwords
must always be changed atomically. The launcher enforces this automatically.

### ✅ Correct way — use the launcher

1. Go to `http://localhost:8080`
2. Click **⚙ Account** (top-right header)
3. Fill in current password, new password, confirm
4. Click **Update Password**

The launcher verifies the current password on both backends, then updates ACQ
Coach and Lead Intel simultaneously. If Lead Intel fails, it rolls back ACQ Coach
automatically and shows the error. Both backends stay in sync.

### ⚠️ Manual fallback — only if the launcher can't be used

If both backends already have different passwords and you need to force-sync them,
update both containers with the same value:

```bash
docker exec acq-coach psql -U postgres -d acqcoach -c "
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
  UPDATE auth.users
  SET encrypted_password = crypt('NEW_PASSWORD_HERE', gen_salt('bf'))
  WHERE email = 'your@email.com';"

docker exec leadintel psql -U postgres -d leadintel -c "
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
  UPDATE auth.users
  SET encrypted_password = crypt('NEW_PASSWORD_HERE', gen_salt('bf'))
  WHERE email = 'your@email.com';"
```

Always change passwords through the launcher Settings to keep both apps in sync.
Manual changes bypass the rollback safety net.
