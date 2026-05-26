# ACQ Coach — self-host

Single-VPS deploy of the `my-acq-coach-5b771b53` Lovable project. Cloned from
the proven `metrics-loom` skeleton (`revenue.sepnexus.com` in prod), adapted
for ACQ's quirks.

## Architecture (2 containers)

```
                Traefik (root host)
                ┌──────┴──────┐
                ▼             ▼
        acq.sepnexus.com   acq-api.sepnexus.com
                │             │
                │   ┌─────────┴───────────┐
                │   │                     │
                ▼   ▼                     ▼
        ┌─────────────────────┐    ┌─────────────────┐
        │     acq-coach       │    │    acq-edge     │
        │  ───────────────    │    │  Deno / Edge    │
        │  • Postgres 15      │    │  Runtime        │
        │  • GoTrue (auth)    │◄───┤  9 functions    │
        │  • PostgREST        │    │  + _shared/     │
        │  • nginx (3000+54k) │    │                 │
        │  • Vite static SPA  │    │                 │
        └─────────────────────┘    └─────────────────┘
        single image, 4 procs       supabase/edge-runtime
```

`acq-edge` reaches the main container at `http://acq-coach:54321` via Docker
DNS. `acq-coach`'s nginx proxies `/functions/v1/*` to `acq-edge:9000`.

## Quick start (laptop test)

```bash
# 1. Mirror the Lovable repo into apps/web + supabase/{migrations,functions}
make sync-app

# 2. Generate fresh secrets
cp .env.example .env
make keys >> .env       # appends; then delete the CHANGE_ME lines from .env

# 3. Edit .env — set PUBLIC_HOST, PUBLIC_API_HOST, SITE_URL,
#    VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY (= ANON_KEY value),
#    and all per-function secrets (OPENAI_API_KEY, DEEPGRAM_API_KEY,
#    STRIPE_*, CRON_SECRET).

# 4. Build + boot (frontend env vars bake at build time, so build = required)
make build && make up
make logs       # main container
make logs-edge  # edge-runtime container

# 5. Restore the Lovable data
make restore
```

## What's different from metrics-loom

| Topic | metrics-loom | acq-coach-selfhost |
|---|---|---|
| Containers | 1 (everything-in-one) | **2** — added `acq-edge` sidecar for the 9 Deno functions |
| Lovable empty-`TO`-clause sed fix | needed | **not needed** — ACQ's export is clean |
| FK restore | 161-line `restore-constraints.sql` | **PKs + UNIQUEs only** (ACQ has no FKs) |
| Sequences | restored | **none** — ACQ uses `gen_random_uuid()` for all PKs |
| Vault | unused but enabled | **dropped from schema-init.sql** |
| Stripe integration | n/a | **needs `_shared/stripe.ts` rewrite** to drop Lovable connector gateway (see TODO below) |
| pg_cron + pg_net | not used | **preloaded** for cron-sync + auto-recharge-cron jobs |
| Postgres `listen_addresses` | `127.0.0.1` only | `*` — needs to be reachable from `acq-edge` sidecar |

## Open TODOs before this can go live

1. **Rewrite `supabase/functions/_shared/stripe.ts`** — currently calls
   `connector-gateway.lovable.dev/stripe` with `LOVABLE_API_KEY`. Replace with
   the official Stripe Deno SDK so it works off-Lovable. Affects:
   `create-topup-session`, `payments-webhook`, `auto-recharge-cron`.
2. **Fill in `auth-config.md`** from the Supabase dashboard (Site URL,
   redirect URLs, Google OAuth client ID if used, email template
   customizations, JWT expiry).
3. **Rotate `CRON_SECRET`** — the one in `backups/migration-export/cron-jobs.sql`
   leaked through pg_cron's cleartext storage. After restore, generate a fresh
   one with `make keys`, update `cron-jobs.sql` AND the `CRON_SECRET` env var
   in the `acq-edge` container, then re-apply `cron-jobs.sql`.
4. **Verify the `handle_new_user` trigger fires correctly** by signing up a
   new user post-restore and checking that a `profiles` row appears.
5. **Replace Lovable Payments Client** in `apps/web/.../TopupCheckout.tsx` —
   currently uses `VITE_PAYMENTS_CLIENT_TOKEN`; swap for Stripe Elements or
   Stripe Checkout.

## Deploy to VPS

See `docs/DEPLOY.md` (TODO — adapt from `metrics-loom/docs/DEPLOY.md`).

## File map

```
.
├── apps/web/                     ← MIRRORED from ../my-acq-coach-5b771b53/
├── supabase/
│   ├── migrations/               ← MIRRORED — 28 Lovable migration files
│   └── functions/                ← MIRRORED — 9 edge fns + _shared/ + main/ (auto-gen)
├── docker/
│   ├── gen-keys.sh               BOILERPLATE — JWT + password generator
│   ├── init-db.sh                ACQ-tuned — pg_cron preload, DB name "acqcoach"
│   ├── schema-init.sql           BOILERPLATE — Supabase roles + auth schema
│   ├── post-migrations.sql       ACQ-tuned — enables pg_cron, pg_net
│   ├── restore-constraints.sql   ACQ-specific — PKs + UNIQUEs only (no FKs)
│   ├── nginx.conf                ACQ-tuned — adds /functions/v1/ → acq-edge route
│   └── start.sh                  ACQ-tuned — DB name, Google OAuth env passthrough
├── scripts/
│   ├── sync-from-lovable-repo.sh ACQ-new — mirrors Lovable repo into apps/, supabase/
│   └── restore-from-lovable.sh   ACQ-tuned — uses public_schema.sql + public_data.sql,
│                                              applies cron-jobs.sql, ACQ row counts
├── docker-compose.yml            ACQ-new — 2 services (acq-coach + acq-edge)
├── Dockerfile                    ACQ-tuned — adds postgresql-15-cron + pg-net
├── .env.example                  ACQ-specific — 16 env vars
├── .dockerignore                 BOILERPLATE
├── .gitignore                    ACQ-tuned
├── Makefile                      ACQ-tuned — adds logs-edge, sync-app targets
└── README.md                     this file
```
