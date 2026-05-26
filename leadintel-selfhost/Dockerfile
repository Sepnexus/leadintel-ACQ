# syntax=docker/dockerfile:1.7
# Lead Intel: all-in-one image, edge functions in sibling leadintel-edge container.

# ─── Stage 1: build the Vite frontend ──────────
FROM node:20-bookworm-slim AS web-builder
WORKDIR /build

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ARG VITE_OTHER_APP_URL
ARG VITE_OTHER_APP_NAME
ARG VITE_LAUNCHER_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID \
    VITE_OTHER_APP_URL=$VITE_OTHER_APP_URL \
    VITE_OTHER_APP_NAME=$VITE_OTHER_APP_NAME \
    VITE_LAUNCHER_URL=$VITE_LAUNCHER_URL

COPY apps/web/package.json apps/web/package-lock.json* ./
# Lovable's lockfile is often out of sync; use npm install
RUN npm install --no-audit --no-fund --legacy-peer-deps

COPY apps/web/ ./
RUN npm run build

# ─── Stage 2: runtime ──────────
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PATH=/usr/lib/postgresql/15/bin:$PATH

# Postgres 15 + pg_cron + nginx. pg_net omitted (no Debian package) — cron
# jobs that use net.http_post() won't run locally, but everything else does.
# supabase_vault is also a from-source extension; we stub vault.create_secret()
# in post-migrations.sql if the extension is unavailable.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg lsb-release procps xz-utils tini \
      postgresql-15 postgresql-contrib-15 postgresql-client-15 \
      postgresql-15-cron \
      nginx libpq5 \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /var/log/nginx /var/lib/nginx /var/lib/postgresql/data \
             /var/run/postgresql /var/www/html \
 && chown -R postgres:postgres /var/lib/postgresql /var/run/postgresql

COPY --from=supabase/gotrue:v2.158.1     /usr/local/bin/auth              /usr/local/bin/auth
COPY --from=supabase/gotrue:v2.158.1     /usr/local/etc/auth/migrations   /usr/local/etc/auth/migrations
COPY --from=postgrest/postgrest:v12.2.3  /bin/postgrest                   /usr/local/bin/postgrest
RUN chmod +x /usr/local/bin/auth /usr/local/bin/postgrest

COPY --from=web-builder /build/dist /var/www/html

COPY supabase/migrations           /docker-init/migrations
COPY docker/schema-init.sql        /docker-init/schema-init.sql
COPY docker/post-migrations.sql    /docker-init/post-migrations.sql
COPY docker/init-db.sh             /docker-init/init-db.sh
COPY docker/start.sh               /start.sh
COPY docker/nginx.conf             /etc/nginx/nginx.conf
RUN chmod +x /docker-init/init-db.sh /start.sh

VOLUME ["/var/lib/postgresql/data"]
EXPOSE 3000 54321 5432

ENTRYPOINT ["/usr/bin/tini", "--", "/start.sh"]
