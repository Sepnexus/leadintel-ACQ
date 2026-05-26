#!/usr/bin/env bash
# Database-only first-boot initialization for Closer Control Lead Intel.
# Idempotent.

set -euo pipefail

PGDATA=/var/lib/postgresql/data
SOCKETDIR=/var/run/postgresql
PGBIN=/usr/lib/postgresql/15/bin

mkdir -p "$SOCKETDIR"
chown -R postgres:postgres "$PGDATA" "$SOCKETDIR" 2>/dev/null || true

log() { echo "[init-db] $*"; }

if [ -s "$PGDATA/PG_VERSION" ]; then
  log "existing Postgres cluster detected; replaying migrations (idempotent)"
  su -s /bin/bash postgres -c "$PGBIN/pg_ctl -D $PGDATA -l $PGDATA/migrate-server.log -w start" >/dev/null
  for f in /docker-init/migrations/*.sql; do
    [ -f "$f" ] || continue
    log "  ↳ $(basename "$f")"
    su -s /bin/bash postgres -c \
      "psql -h $SOCKETDIR -U postgres -d ${POSTGRES_DB:-leadintel} -v ON_ERROR_STOP=0 -f $f" \
      >/dev/null 2>&1 || true
  done
  su -s /bin/bash postgres -c "$PGBIN/pg_ctl -D $PGDATA -m fast stop" >/dev/null
  log "migration replay done"
  exit 0
fi

log "fresh cluster — initializing"

su -s /bin/bash postgres -c \
  "$PGBIN/initdb -D $PGDATA --auth-host=md5 --auth-local=trust -E UTF8 --locale=C.UTF-8"

cat >> "$PGDATA/pg_hba.conf" <<EOF
host all all 127.0.0.1/32 md5
host all all ::1/128      md5
# Allow the edge-runtime sidecar (Docker bridge network)
host all all 172.16.0.0/12 md5
host all all 192.168.0.0/16 md5
host all all 10.0.0.0/8 md5
EOF

cat >> "$PGDATA/postgresql.conf" <<EOF
listen_addresses = '*'
unix_socket_directories = '$SOCKETDIR'
shared_preload_libraries = 'pg_cron'
cron.database_name = '${POSTGRES_DB:-leadintel}'
EOF

log "starting Postgres for init"
su -s /bin/bash postgres -c \
  "$PGBIN/pg_ctl -D $PGDATA -l $PGDATA/init-server.log -w start"

for i in $(seq 1 30); do
  if su -s /bin/bash postgres -c \
       "psql -h $SOCKETDIR -U postgres -d postgres -c 'select 1'" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

PSQL_AS_PG() {
  su -s /bin/bash postgres -c \
    "psql -h $SOCKETDIR -U postgres -d ${2:-postgres} -v ON_ERROR_STOP=1 $1"
}

log "setting postgres superuser password and creating app database"
PSQL_AS_PG "-c \"alter user postgres with password '$POSTGRES_PASSWORD';\" -c \"create database $POSTGRES_DB;\""

log "bootstrapping roles + auth schema (schema-init.sql)"
PSQL_AS_PG \
  "-c \"set app.authenticator_password = '$AUTHENTICATOR_PASSWORD';\" \
   -c \"set app.auth_admin_password    = '$AUTH_ADMIN_PASSWORD';\" \
   -f /docker-init/schema-init.sql" \
  "$POSTGRES_DB"

log "running GoTrue migrations (creates auth.users etc.)"
API_EXTERNAL_URL="$SITE_URL" \
GOTRUE_DB_MIGRATIONS_PATH=/usr/local/etc/auth/migrations \
GOTRUE_DB_DATABASE_URL="postgres://supabase_auth_admin:${AUTH_ADMIN_PASSWORD}@127.0.0.1:5432/${POSTGRES_DB}?search_path=auth" \
GOTRUE_JWT_SECRET="$JWT_SECRET" \
GOTRUE_SITE_URL="$SITE_URL" \
GOTRUE_API_HOST=127.0.0.1 \
GOTRUE_API_PORT=9999 \
GOTRUE_DB_DRIVER=postgres \
  /usr/local/bin/auth migrate

log "applying user migrations (Lovable's 30 Lead Intel migration files)"
for f in /docker-init/migrations/*.sql; do
  [ -f "$f" ] || continue
  log "  ↳ $(basename "$f")"
  PSQL_AS_PG "-f $f" "$POSTGRES_DB"
done

log "running post-migrations.sql (extensions + grants)"
PSQL_AS_PG "-f /docker-init/post-migrations.sql" "$POSTGRES_DB"

log "stopping init Postgres (start.sh will boot it for real, with pg_cron preloaded)"
su -s /bin/bash postgres -c "$PGBIN/pg_ctl -D $PGDATA -m fast stop"

log "init complete"
