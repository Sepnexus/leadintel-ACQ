# Sepnexus Platform — ACQ Coach + Lead Intel (self-hosted)

Migration of two Lovable Cloud apps to self-hosted Docker. Phase 1: both apps
run independently locally with a shared launcher. Phase 2 (later): merge into
a single shell with unified auth.

## Layout

```
.
├── platform-launcher/             tiny static launcher on :8080
├── acq-coach-selfhost/            Postgres + GoTrue + PostgREST + Vite SPA
│   ├── apps/web/                  mirrored from ../my-acq-coach-5b771b53/
│   └── supabase/{migrations,functions}/  mirrored
├── leadintel-selfhost/            same shape as acq-coach-selfhost/
│   ├── apps/web/                  mirrored from ../closercontrolleadintel/
│   └── supabase/{migrations,functions}/  mirrored
├── my-acq-coach-5b771b53/         original Lovable repo + backups/migration-export/
└── closercontrolleadintel/        original Lovable repo + backups/backend-export/
```

## Prereqs

- Docker Desktop (≥ 8 GB RAM, ~15 GB free disk)
- Git LFS — **install before cloning**:
  ```bash
  brew install git-lfs       # macOS
  apt install git-lfs        # Debian/Ubuntu
  git lfs install            # one-time per machine
  ```
  If you already cloned without LFS, run `git lfs pull` afterwards to fetch
  the dump files.

## First-run setup

```bash
git clone https://github.com/Sepnexus/leadintel-ACQ.git
cd leadintel-ACQ
git lfs pull   # downloads the ~470 MB of Lovable DB dumps

# Generate fresh secrets, write .env in both selfhost dirs
make setup

# Edit acq-coach-selfhost/.env and leadintel-selfhost/.env:
#   - Delete the CHANGE_ME lines (keys at the bottom override them)
#   - Add OPENAI_API_KEY, DEEPGRAM_API_KEY, ANTHROPIC_API_KEY
#   - Add Stripe + GHL keys if you want billing/sync to work locally

make build     # 5–10 min first time
make up        # boots launcher + acq-coach + leadintel
make restore   # loads Lovable's DB dumps into Postgres
make verify    # smoke-checks all 5 health endpoints
```

Then open:

| URL | What |
|---|---|
| http://localhost:8080 | Launcher (two cards) |
| http://localhost:3100 | ACQ Coach |
| http://localhost:3101 | Lead Intel |

## Architecture

```
                  http://localhost:8080  (launcher)
                  ├── card "ACQ"        → :3100
                  └── card "Lead Intel" → :3101

  ┌─────────────────────┐     ┌──────────────────────┐
  │  acq-coach + edge   │     │  leadintel + edge    │
  │  ─────────────────  │     │  ──────────────────  │
  │  Postgres 15        │     │  Postgres 15         │
  │  GoTrue v2.158.1    │     │  GoTrue v2.158.1     │
  │  PostgREST v12.2.3  │     │  PostgREST v12.2.3   │
  │  nginx :3000/:54321 │     │  nginx :3000/:54321  │
  │  Deno edge-runtime  │     │  Deno edge-runtime   │
  │  :8080  bridge      │     │  :8080  bridge       │
  └─────────────────────┘     └──────────────────────┘
     ↕ :3100 → 3000              ↕ :3101 → 3000
     ↕ :54421 → 54321            ↕ :54422 → 54321
```

Each app is its own self-contained stack with isolated Postgres + auth.
Crosstalk only happens via the AppSwitcher (top-right chip) which links the
sibling app's URL.

## What works today (verified end-to-end)

- Email/password login (bcrypt hashes preserved from Lovable export)
- PostgREST + RLS (role-gated queries return correct row counts)
- Edge functions (router uses `EdgeRuntime.userWorkers.create()`, all 38 functions across both apps invoke)
- AppSwitcher chip jumps between apps + back to launcher
- Launcher live status pings (CORS-clean `/health` endpoints)
- Full schema, indexes, RLS, FKs, triggers, functions restored
- Pre-existing user data (8 ACQ users, 23 Lead Intel users, 24 tenants, ~1M GHL rows)

## What doesn't work yet (known)

| Limitation | Why | Fix later |
|---|---|---|
| Stripe billing/topup | Edge functions call `connector-gateway.lovable.dev` | Rewrite `supabase/functions/_shared/stripe.ts` to use Stripe SDK directly |
| Google OAuth | No client ID configured | Grab from Supabase dashboard → `GOTRUE_EXTERNAL_GOOGLE_*` in `.env` |
| `pg_cron` HTTP jobs | `pg_net` not in Debian repos | Build pg_net from source OR run external cron container |
| Lead Intel: `ghl_opportunities` / `ghl_tasks` / `sync_history` empty | Lovable's `03_public_data_big.dump` was truncated by Lovable when exporting | Re-export from Lovable, replace dump file, re-run `make restore-leadintel` |
| AI scoring / TTS / GHL sync | API keys not in `.env` | Add `OPENAI_API_KEY` / `DEEPGRAM_API_KEY` / etc. and `make up` |

## Useful commands

```bash
make help          # see all targets
make ps            # show all containers
make logs-acq      # tail ACQ logs (main + edge)
make logs-leadintel
make psql-acq      # psql shell into ACQ database
make psql-leadintel
make down          # stop containers (keep data volumes)
make nuke          # stop + wipe data volumes (full reset)
make sync          # re-mirror Lovable repos into selfhost/apps/web
make restart       # down + up
```

## Re-syncing from Lovable

If Lovable Cloud pushes updates to the original repos:

```bash
cd my-acq-coach-5b771b53
mv .git-lovable-origin .git    # temporarily restore the original remote
git pull
mv .git .git-lovable-origin    # put it back so it doesn't interfere with the monorepo

cd ..
make sync                      # mirror changes into acq-coach-selfhost/apps/web/
make build && make up          # rebuild + restart
```

Same pattern for `closercontrolleadintel`.

## Detailed verification walkthrough

See [VERIFY-LOCAL.md](./VERIFY-LOCAL.md).
