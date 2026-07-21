# Deploy Sepnexus Platform to your Hostinger VPS

All 8 services on the existing `srv844822.hstgr.cloud` box, sharing the
existing Traefik on `root_default` (same setup as iBuyKC dashboards). One
public domain — `closercontrol.srv844822.hstgr.cloud` — fronts the launcher, with `/auth` and
`/admin-api` proxied through to the internal-only platform services.

---

## Prerequisites

- SSH access to `root@srv844822.hstgr.cloud`
- Docker + docker compose v2 already on the VPS (they are — iBuyKC uses them)
- Traefik already running on `root_default` (it is — same network)

> **No DNS changes needed.** All five subdomains live under
> `*.srv844822.hstgr.cloud` — Hostinger's built-in wildcard that already
> resolves to the VPS. Traefik on the box already issues certs for the
> wildcard (same setup iBuyKC dashboards use). Skip straight to Step 1.

If you want to verify the wildcard resolves before you start (from your
laptop, before SSH-ing in):

```bash
for h in closercontrol acq api-acq leadintel api-leadintel; do
  dig +short $h.srv844822.hstgr.cloud
done
# All should return the same VPS IP (93.127.194.153).
```

---

## Step 1 — On the VPS: clone repo + generate secrets

```bash
ssh root@srv844822.hstgr.cloud

cd /root
git clone git@github.com:Sepnexus/leadintel-ACQ.git sepnexus-platform
cd sepnexus-platform

# Generate all the secrets (prints to screen)
bash scripts/gen-vps-secrets.sh
```

You'll see output like:

```
JWT_SECRET=abc123...
TOKEN_ENCRYPTION_KEY=def456...
PLATFORM_POSTGRES_PASSWORD=...
ACQ_POSTGRES_PASSWORD=...
...
```

**Copy the entire block** — you'll paste it into `.env.vps` in the next step.

---

## Step 2 — Create `.env.vps`

```bash
cp .env.vps.example .env.vps
nano .env.vps
```

In nano:

1. The first block (`LAUNCHER_HOST`, `ACQ_HOST`, etc.) — leave defaults if you want
   the default `*.srv844822.hstgr.cloud` subdomains. Change if you want different hostnames.
2. **Replace all the `PASTE_FROM_GEN_SECRETS` lines** with the block from Step 1
   (paste the whole block; the placeholder lines get overwritten). Or skip the
   hand-editing entirely with the auto-merge:

   ```bash
   bash scripts/gen-vps-secrets.sh > /root/sepnexus-secrets.txt
   chmod 600 /root/sepnexus-secrets.txt
   grep -E '^[A-Z_]+=' /root/sepnexus-secrets.txt | while IFS= read -r line; do
     key="${line%%=*}"
     sed -i "s|^${key}=.*|${line}|" .env.vps
   done
   ```
3. Fill `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `OPENAI_API_KEY`,
   `ANTHROPIC_API_KEY`, `DEEPGRAM_API_KEY` from your provider dashboards.
   (You can leave them blank for a first-boot smoke test and add them later
   via Platform Admin → Settings.)
4. Optionally change `DEFAULT_USER_PASSWORD`.

Save: `Ctrl+O`, Enter, `Ctrl+X`.

**Then fan the values out into the six per-project `.env` files** (the compose
stack reads those, not `.env.vps` directly):

```bash
bash scripts/write-project-envs.sh
```

You should see `✓ <project>/.env` for all six projects. Re-run this any time
you edit `.env.vps` — the per-project files are generated, never hand-edited.

---

## Step 3 — Pre-flight (30 sec)

```bash
echo "--- existing containers (iBuyKC + Traefik should be here) ---"
docker ps --format 'table {{.Names}}\t{{.Status}}'

echo "--- root_default network exists? ---"
docker network ls | grep root_default

echo "--- disk + RAM headroom ---"
df -h / | tail -1
free -h
```

**Stop here if:** disk is over 85% used, free RAM under 1.5 GB, or
`root_default` doesn't show up. Tell me what you see and we'll plan around it
before bringing more containers up.

---

## Step 4 — First boot (5-10 min — first build pulls Postgres, GoTrue, Node images)

```bash
docker compose --env-file .env.vps -f docker-compose.vps.yml up -d --build
```

Watch the platform-db boot first (its init scripts seed the platform schema):

```bash
docker logs -f --tail 60 platform-db
```

You should see:

```
[init] applying /docker-entrypoint-initdb.d/01-*.sql
[init] applying /docker-entrypoint-initdb.d/02-*.sql
...
[init] applying /docker-entrypoint-initdb.d/12-admin-set-password.sql
database system is ready to accept connections
```

`Ctrl+C` to stop tailing. Container keeps running.

---

## Step 5 — Verify it's live

Wait 30-60 sec for Traefik to issue SSL certs, then:

```bash
curl -I https://closercontrol.srv844822.hstgr.cloud/health
curl -I https://closercontrol.srv844822.hstgr.cloud/auth/health
curl -I https://closercontrol.srv844822.hstgr.cloud/admin-api/health
curl -I https://acq.srv844822.hstgr.cloud/
curl -I https://leadintel.srv844822.hstgr.cloud/
```

All should return `HTTP/2 200`.

Open **https://closercontrol.srv844822.hstgr.cloud** in your browser. You should see the
Sepnexus / Closer Control launcher login page.

---

## Step 6 — Create the first super-admin user

The fresh `platform-db` has the schema but no users yet. SSH approach:

```bash
docker exec -it platform-db psql -U postgres -d platform <<SQL
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        confirmation_token, recovery_token,
                        email_change_token_new, email_change,
                        created_at, updated_at, is_sso_user, is_anonymous)
VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'admin@sepnexus.com',
  -- bcrypt of 'ChangeMeOnFirstLogin@2026'; replace with your own hash later
  crypt('ChangeMeOnFirstLogin@2026', gen_salt('bf', 10)),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  '', '', '', '',
  now(), now(), false, false
)
RETURNING id, email;
SQL
```

Take the returned `id`, then mark them as Platform Admin:

```bash
USER_ID=<paste-uuid-here>

docker exec -it platform-db psql -U postgres -d platform -c "
INSERT INTO platform.users (id, email, full_name, is_platform_admin, created_at, updated_at)
VALUES ('${USER_ID}'::uuid, 'admin@sepnexus.com', 'Platform Admin', true, now(), now());

INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
VALUES ('${USER_ID}', '${USER_ID}'::uuid,
        jsonb_build_object('sub','${USER_ID}','email','admin@sepnexus.com','email_verified',false,'phone_verified',false),
        'email', now(), now());
"
```

Now log into **https://closercontrol.srv844822.hstgr.cloud** with `admin@sepnexus.com` /
`ChangeMeOnFirstLogin@2026`. Once in, use **🔑 Set password** in Platform
Admin → Users to give yourself + your team real passwords.

---

## Updating later

> ## ⚠️ READ THIS FIRST — restarting `leadintel` has wiped data before
>
> **Never restart or recreate the `leadintel` container, and always pass
> `--no-deps` when touching anything that depends on it.**
>
> What actually happens (the earlier "start.sh re-initializes Postgres"
> explanation was wrong): `docker/init-db.sh` detects the existing cluster and
> **replays every migration** on each start, logging "replaying migrations
> (idempotent)". Two migrations were not idempotent — `20260424225732` was
> `TRUNCATE ghl_contact_tags; TRUNCATE ghl_contacts CASCADE;`, a one-time April
> cleanup that re-ran destructively on every restart. Both were neutralised to
> `SELECT 1` on 2026-07-21 (commit d582e18), so this specific hazard is
> disarmed — but the rule stands, because any future non-idempotent migration
> would arm it again.
>
> **2026-07-21 incident:** `docker compose up -d --force-recreate leadintel-edge`
> pulled `leadintel` in as a compose dependency and restarted it. The TRUNCATE
> replayed and emptied every tenant's synced GHL data — contacts and tags
> directly, then opportunities, conversations, messages, tasks and ghl_users via
> CASCADE. Notes and tenant_pipelines survived (nothing cascades to them), and
> that asymmetry is what identified the cause. Tenants, tokens, users, wallets
> and all platform data were untouched, and everything was recovered by
> re-syncing from GHL — but it cost hours, and every customer saw an empty app
> meanwhile.
>
> Naming one service does **not** limit the blast radius. Use `--no-deps`:
>
> ```bash
> docker compose -f docker-compose.vps.yml up -d --no-deps --force-recreate leadintel-edge
> ```
>
> Before and after ANY deploy that could reach it, prove the data survived:
>
> ```bash
> docker exec leadintel psql -U postgres -d leadintel -tAc \
>   "SELECT (SELECT count(*) FROM tenants) t, (SELECT count(*) FROM ghl_contacts) c;"
> ```
>
> For code-only updates to Lead Intel, use the safe recipe below.
>
> ⚠️ **This VPS host has NO `npm`/Node** — `npm run build` fails with
> `command not found`. Build the frontend *inside Docker* (`docker compose
> build` only builds an image; it never starts or recreates the running
> container, so the DB is untouched), then extract and hot-copy the dist:
>
> ```bash
> cd /root/sepnexus-platform
> # 1. Build image only (bakes correct prod VITE URLs from the env). DB untouched.
> docker compose --env-file .env.vps -f docker-compose.vps.yml build leadintel
> # 2. Extract dist via a throwaway, NEVER-started container (start.sh never runs):
> cid=$(docker create leadintel:latest)
> rm -rf /tmp/li-dist && docker cp "$cid":/var/www/html/. /tmp/li-dist && docker rm "$cid"
> # 3. (optional) confirm prod API baked in — expect api-leadintel.<host>:
> grep -rao 'api-leadintel[a-zA-Z0-9.\-]*' /tmp/li-dist/assets/ | head -1
> # 4. Hot-copy into the RUNNING container + reload:
> docker cp /tmp/li-dist/. leadintel:/var/www/html/
> docker exec leadintel nginx -s reload
> ```
>
> For Lead Intel **edge function** changes, `leadintel-edge` is a separate
> container with no DB of its own — but it `depends_on` leadintel, so it must
> be recreated with `--no-deps` or compose restarts leadintel too (this is
> exactly what caused the 2026-07-21 wipe):
>
> ```bash
> cd /root/sepnexus-platform/leadintel-selfhost
> docker compose up -d --no-deps --build leadintel-edge
> ```
>
> The functions are bind-mounted (`./supabase/functions:/home/deno/functions:ro`),
> so a `git pull` plus recreating the edge container is all a function change
> needs — no image rebuild.
>
> The other 7 services (acq-coach, platform-db, platform-auth,
> platform-admin-api, platform-launcher, acq-edge, leadintel-edge) ARE safe
> to `--build`. Their data either lives on named volumes or doesn't exist.

### Safe per-service update (excludes leadintel):

```bash
ssh root@srv844822.hstgr.cloud
cd /root/sepnexus-platform
git pull

# Whatever services you actually changed — list them explicitly. NEVER
# include `leadintel` here until the start.sh wipe-on-init bug is fixed.
docker compose --env-file .env.vps -f docker-compose.vps.yml up -d --build \
  platform-admin-api platform-launcher acq-coach
```

### Bulk update (LI excluded for safety):

```bash
# Update everything EXCEPT leadintel. Safe.
docker compose --env-file .env.vps -f docker-compose.vps.yml up -d --build \
  $(docker compose --env-file .env.vps -f docker-compose.vps.yml config --services | grep -vw leadintel | xargs)

# Then hot-copy Lead Intel frontend separately, as shown in the warning box.
```

Database data on the OTHER services (platform-db, acq-coach) survives — those
use proper Docker volumes (`platform_pgdata`, `acq_pgdata`) that persist across
container rebuilds.

### Resolved 2026-07-21: the leadintel wipe-on-restart bug

`init-db.sh` already detects an existing cluster and skips initialisation — the
old "start.sh re-initializes Postgres" diagnosis was wrong. The real hazard was
that it **replays every migration** on each start, and two migrations were
one-time cleanups that are destructive on replay:

- `20260424225732` — `TRUNCATE ghl_contact_tags; TRUNCATE ghl_contacts CASCADE;`
- `20260427210112` — `DELETE FROM day_briefing_cache;`

Both are now no-ops (`SELECT 1`), keeping migration ordering intact, with the
incident recorded in each file. Verify on the VPS after any pull:

```bash
grep -c '^TRUNCATE' leadintel-selfhost/supabase/migrations/20260424225732_*.sql   # must be 0
```

**Rule for new migrations:** anything that deletes data must be safe to run a
second time — guard it with a marker row, or a WHERE clause that matches nothing
on the second pass. A migration in this repo is not applied once; it is applied
on every container start, forever.

Still deferred: a `docker compose up -d --build leadintel` (fresh container)
remains untested and is not part of any routine — keep using the build-and-copy
recipe above for frontend changes.

---

## Common problems

**`network root_default not found`**
```bash
docker network ls   # confirm the name
# If it's named differently, update networks: external: true name: <real-name>
# in each docker-compose.vps.yml
```

**Traefik 404 on closercontrol.srv844822.hstgr.cloud**
```bash
# Confirm launcher is on root_default:
docker inspect platform-launcher --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'
# Should print: root_default
# Confirm Traefik labels were picked up:
docker inspect platform-launcher --format '{{json .Config.Labels}}' | python3 -m json.tool | grep traefik
```

**SSL cert won't issue**
```bash
docker logs root-traefik-1 2>&1 | grep -i closercontrol.srv844822.hstgr.cloud | tail -20
# Most common: DNS not propagated yet. Wait, retry.
```

**Container keeps restarting**
```bash
docker logs --tail 200 <container-name>
# platform-db logs show schema-init errors
# platform-auth needs JWT_SECRET to be a string (>= 32 chars)
# admin-api needs PLATFORM_ADMIN_DB_URL to point at platform-db (the docker hostname)
```

**Login returns "Database error querying schema"**
You hit the bug we just fixed locally. The fix is in commit
`a692388 Password reset: NULL-token columns trip GoTrue Go-driver`. Make sure
`git log -1` shows commit `a692388` or later before you re-run `up -d --build`.

**Wipe and start over (DESTROYS ALL DATA)**
```bash
docker compose --env-file .env.vps -f docker-compose.vps.yml down -v
docker compose --env-file .env.vps -f docker-compose.vps.yml up -d --build
```

---

## What lives where after deploy

| Service | Visible at | Internal hostname (in `root_default`) |
|---|---|---|
| Launcher (HQ login + Admin) | https://closercontrol.srv844822.hstgr.cloud | platform-launcher |
| ACQ Coach web | https://acq.srv844822.hstgr.cloud | acq-coach |
| ACQ Supabase gateway | https://api-acq.srv844822.hstgr.cloud | acq-coach (port 54321) |
| Lead Intel web | https://leadintel.srv844822.hstgr.cloud | leadintel |
| LI Supabase gateway | https://api-leadintel.srv844822.hstgr.cloud | leadintel (port 54321) |
| Platform Auth (GoTrue) | internal only · proxied at `/auth/*` | platform-auth |
| Platform Admin API | internal only · proxied at `/admin-api/*` | platform-admin-api |
| Platform DB | internal only | platform-db |
| ACQ edge functions | internal only | acq-edge |
| LI edge functions | internal only | leadintel-edge |

---

## Rollback / remove

```bash
cd /root/sepnexus-platform
docker compose --env-file .env.vps -f docker-compose.vps.yml down       # keep data
docker compose --env-file .env.vps -f docker-compose.vps.yml down -v    # wipe data
```

iBuyKC dashboards and any other containers on the box are untouched.
