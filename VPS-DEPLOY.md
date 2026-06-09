# Deploy Sepnexus Platform to your Hostinger VPS

All 8 services on the existing `srv844822.hstgr.cloud` box, sharing the
existing Traefik on `root_default` (same setup as iBuyKC dashboards). One
public domain — `app.sepnexus.com` — fronts the launcher, with `/auth` and
`/admin-api` proxied through to the internal-only platform services.

---

## Prerequisites

- SSH access to `root@srv844822.hstgr.cloud`
- DNS control for `sepnexus.com` (you'll add 5 A records)
- Docker + docker compose v2 already on the VPS (they are — iBuyKC uses them)
- Traefik already running on `root_default` (it is — same network)

---

## Step 1 — DNS records (do this first; cert issuance needs DNS resolving)

Point five subdomains at the VPS IP `93.127.194.153`:

```
A   app.sepnexus.com            → 93.127.194.153
A   acq.sepnexus.com            → 93.127.194.153
A   acq-api.sepnexus.com        → 93.127.194.153
A   leadintel.sepnexus.com      → 93.127.194.153
A   leadintel-api.sepnexus.com  → 93.127.194.153
```

Wait 5 minutes for DNS to propagate, then verify:

```bash
for h in app acq acq-api leadintel leadintel-api; do
  dig +short $h.sepnexus.com
done
# All should return 93.127.194.153
```

---

## Step 2 — On the VPS: clone repo + generate secrets

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

## Step 3 — Create `.env.vps`

```bash
cp .env.vps.example .env.vps
nano .env.vps
```

In nano:

1. The first block (`LAUNCHER_HOST`, `ACQ_HOST`, etc.) — leave defaults if you want
   the `.sepnexus.com` subdomains. Change if you want different hostnames.
2. **Replace all the `PASTE_FROM_GEN_SECRETS` lines** with the block from Step 2
   (paste the whole block; the placeholder lines get overwritten).
3. Fill `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `OPENAI_API_KEY`,
   `ANTHROPIC_API_KEY`, `DEEPGRAM_API_KEY` from your provider dashboards.
   (You can leave them blank for a first-boot smoke test and add them later
   via Platform Admin → Settings.)
4. Optionally change `DEFAULT_USER_PASSWORD`.

Save: `Ctrl+O`, Enter, `Ctrl+X`.

---

## Step 4 — Pre-flight (30 sec)

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

## Step 5 — First boot (5-10 min — first build pulls Postgres, GoTrue, Node images)

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

## Step 6 — Verify it's live

Wait 30-60 sec for Traefik to issue SSL certs, then:

```bash
curl -I https://app.sepnexus.com/health
curl -I https://app.sepnexus.com/auth/health
curl -I https://app.sepnexus.com/admin-api/health
curl -I https://acq.sepnexus.com/
curl -I https://leadintel.sepnexus.com/
```

All should return `HTTP/2 200`.

Open **https://app.sepnexus.com** in your browser. You should see the
Sepnexus / Closer Control launcher login page.

---

## Step 7 — Create the first super-admin user

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

Now log into **https://app.sepnexus.com** with `admin@sepnexus.com` /
`ChangeMeOnFirstLogin@2026`. Once in, use **🔑 Set password** in Platform
Admin → Users to give yourself + your team real passwords.

---

## Updating later

> ## ⚠️ READ THIS FIRST — `leadintel` container WIPES DATA on rebuild
>
> The `leadintel` container's `start.sh` re-initializes Postgres every fresh
> container start. So a naive `docker compose up -d --build leadintel`
> **destroys all tenants, contacts, sync history, and user accounts** on the
> VPS. See `leadintel-selfhost/CLAUDE.md`.
>
> Until that's fixed in the image (see Open issues below), use the safe
> recipe **for code-only updates to Lead Intel**:
>
> ```bash
> cd /root/sepnexus-platform/leadintel-selfhost/apps/web && npm run build
> docker cp dist/. leadintel:/var/www/html/
> docker exec leadintel nginx -s reload
> ```
>
> For Lead Intel **edge function** changes, rebuilding `leadintel-edge` is
> safe (separate container, no DB):
>
> ```bash
> cd /root/sepnexus-platform/leadintel-selfhost
> docker compose up -d --build leadintel-edge
> ```
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

### Open issue: fix the leadintel wipe-on-init bug

The right fix is to update `leadintel-selfhost/docker/start.sh` to detect
"data already exists" and skip the init step — same pattern the iBuyKC
`init-db.sh` uses. This is a deferred task; once landed, the safe-update
recipe above can drop the special-case for `leadintel`.

---

## Common problems

**`network root_default not found`**
```bash
docker network ls   # confirm the name
# If it's named differently, update networks: external: true name: <real-name>
# in each docker-compose.vps.yml
```

**Traefik 404 on app.sepnexus.com**
```bash
# Confirm launcher is on root_default:
docker inspect platform-launcher --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'
# Should print: root_default
# Confirm Traefik labels were picked up:
docker inspect platform-launcher --format '{{json .Config.Labels}}' | python3 -m json.tool | grep traefik
```

**SSL cert won't issue**
```bash
docker logs root-traefik-1 2>&1 | grep -i app.sepnexus.com | tail -20
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
| Launcher (HQ login + Admin) | https://app.sepnexus.com | platform-launcher |
| ACQ Coach web | https://acq.sepnexus.com | acq-coach |
| ACQ Supabase gateway | https://acq-api.sepnexus.com | acq-coach (port 54321) |
| Lead Intel web | https://leadintel.sepnexus.com | leadintel |
| LI Supabase gateway | https://leadintel-api.sepnexus.com | leadintel (port 54321) |
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
