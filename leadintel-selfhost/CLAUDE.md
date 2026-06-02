# Lead Intel Selfhost — Claude Rules

## ⚠️ CRITICAL: Never rebuild the Lead Intel Docker container

**Rebuilding or recreating the `leadintel` container wipes the database.**
The database lives inside the container (volume: `leadintel_pgdata`), but the
`start.sh` init script re-initializes Postgres on every fresh container start,
destroying all tenant data, contacts, sync history, and user accounts.

### ✅ Correct deployment for frontend/code changes

```bash
# 1. Build the frontend
cd leadintel-selfhost/apps/web && npm run build

# 2. Hot-copy dist files into the RUNNING container (no restart)
docker cp leadintel-selfhost/apps/web/dist/. leadintel:/var/www/html/

# 3. Reload nginx to serve the new bundle (no container restart)
docker exec leadintel nginx -s reload
```

### ✅ Correct deployment for edge function changes

Edge functions are served by the `leadintel-edge` container (separate from the
database container). Rebuilding/restarting `leadintel-edge` is safe:

```bash
cd leadintel-selfhost && docker compose up -d leadintel-edge
```

### ❌ Never do these for `leadintel`

```bash
# ALL of these wipe the database:
docker compose up -d --build leadintel
docker compose up -d leadintel          # (recreates container)
docker rm leadintel && docker run ...
docker compose down && docker compose up
```

### 🔁 If the container was accidentally recreated

Immediately restore the database:

```bash
cd leadintel-selfhost && make restore
```

This restores from `../closercontrolleadintel/backups/backend-export/`.

After restore, reset the super-admin password (it gets overwritten by the backup):

```bash
docker exec leadintel psql -U postgres -d leadintel -c "
CREATE EXTENSION IF NOT EXISTS pgcrypto;
UPDATE auth.users
SET encrypted_password = crypt('CloserControl2025!', gen_salt('bf'))
WHERE email = 'deon.joseph@closercontrol.com';"
```

## Dev server (preview only)

The Vite dev server at port 8083 requires `.env.local` in `apps/web/`:

```
VITE_SUPABASE_URL=http://localhost:54422
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzc5OTE0NTgwLCJleHAiOjIwOTUyNzQ1ODB9.UkqBCF2fE78tsbl4QAhhoqBktG2lSChZTBFEjYHfZjA
VITE_SUPABASE_PROJECT_ID=leadintel-selfhost
```

The dev server uses the SAME Supabase backend as the Docker container (port 54422).
Logins at port 3101 (Docker) and port 8083 (dev server) are separate localStorage
origins — login separately for each.
