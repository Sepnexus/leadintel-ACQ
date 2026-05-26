# Local verification — all three stacks running

Right now (as of this commit) all three containers are running. Open these:

| URL | What's there |
|---|---|
| **http://localhost:8080** | Launcher — two cards, live status pills |
| **http://localhost:3100** | ACQ Coach frontend |
| **http://localhost:3101** | Lead Intel frontend |
| http://localhost:54421 | ACQ Supabase API gateway |
| http://localhost:54422 | Lead Intel Supabase API gateway |

## What's loaded (verified at restore time)

### ACQ Coach (http://localhost:3100)
- 8 users (login as `akshay@sepnexus.com` with your prod password)
- 4 customer accounts (`ghl_accounts`)
- 7,012 contacts
- 41,551 messages
- 1,904 calls + 251 call scores
- 21,185 sync runs (history)
- 35 RLS policies, 7 triggers, 12 functions — all restored

### Lead Intel (http://localhost:3101)
- 23 users (login as `deon.joseph@closercontrol.com` — super admin)
- 24 tenants, 21 tenant memberships
- **126,892 contacts**, 813,025 tags, 140,696 notes
- 62,927 conversations, **711,010 messages**
- 2,368 GHL users mirrored
- 264 lead intelligence rows
- 70 RLS policies, 30 FKs — all restored
- ⚠️ `ghl_opportunities`, `ghl_tasks`, `sync_history` are empty because Lovable's `03_public_data_big.dump` was truncated by Lovable when exporting. Re-export from Lovable later if needed.

## Day-to-day commands

```bash
cd "/Users/akshaypalsingh/Desktop/NEw/Lead and ACQ"

make ps         # show all containers
make logs-acq   # tail ACQ logs (main + edge)
make logs-leadintel
make down       # stop everything (keeps data volumes)
make up         # bring back up
make nuke       # ⚠️ stops + wipes data volumes — full reset
make psql-acq   # psql shell into ACQ database
make psql-leadintel
```

## What works ✅

- Launcher page with live status pings
- AppSwitcher chip top-right of each app (jumps to other app / launcher)
- Email/password login for all 31 users with their existing bcrypt hashes
- Full schema, RLS policies, functions, FKs, triggers
- PostgREST auto-generated REST API
- Edge-runtime container booted (functions invoked via `/functions/v1/<name>`)
- Frontend builds + serves at localhost ports

## What doesn't work yet 🚫

| Issue | Why | Fix later |
|---|---|---|
| **Stripe wallet top-up + auto-recharge** | Edge functions call `connector-gateway.lovable.dev/stripe` | Task #7: rewrite `_shared/stripe.ts` to use Stripe SDK directly |
| **Google OAuth login** | No client ID configured | Grab from Supabase dashboard → put in `.env` (`GOTRUE_EXTERNAL_GOOGLE_*`) |
| **pg_cron HTTP jobs (`net.http_post`)** | `pg_net` isn't a Debian package | For local you don't need cron. Production deploy will install pg_net from source |
| **Lead Intel: opportunities/tasks/sync_history** | Lovable export `.dump` file is truncated | Re-export from Lovable, replace `03_public_data_big.dump`, re-run `make restore-leadintel` |
| **`vault.cron_secret`** | `supabase_vault` extension not installed | Cron secret already in env var; vault step is now a no-op |
| **AI scoring / TTS / GHL sync** | API keys missing from `.env` | Paste `OPENAI_API_KEY`, `DEEPGRAM_API_KEY`, `ANTHROPIC_API_KEY`, `GHL_PIT_TOKEN` into the relevant `.env` and restart |

## Known landmines fixed during this build (for reference)

1. ✅ `postgresql-15-pg-net` doesn't exist in Debian — dropped, made it optional via `DO $$ EXCEPTION` block
2. ✅ Lovable's `package-lock.json` is out of sync with `package.json` — switched `npm ci` → `npm install --legacy-peer-deps`
3. ✅ Port conflicts with existing `open-webui` (3000) and `supabase_kong_ibuykc_dashboard` (54321) — moved to 3100/3101 + 54421/54422
4. ✅ Lovable's dumps are PG 17+ — strip `SET transaction_timeout`, strip `CREATE SCHEMA public;`
5. ✅ `auth.identities.email` is GENERATED in GoTrue v2.158 — sed-strip from INSERTs
6. ✅ `trg_tenants_create_wallet` collides with explicit wallet rows — `DISABLE TRIGGER USER` around data load
7. ✅ `.dump` custom-format is v1.16 (PG 17) — sidecar `postgres:17` container converts to plain SQL, pipes to PG 15
8. ✅ Duplicate `POSTGRES_PASSWORD=` lines in `.env` — `tail -1` in grep helpers (Docker Compose does last-wins natively)
9. ✅ `supabase_vault` extension unavailable — wrapped in `IF EXISTS` checks; `upsert_cron_secret()` no-ops if missing
10. ✅ ACQ's `public_schema.sql` contains COPY data, Lead Intel's `01_public_schema.sql` is DDL-only — restore script handles both
