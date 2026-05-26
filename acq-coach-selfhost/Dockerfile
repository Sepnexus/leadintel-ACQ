# syntax=docker/dockerfile:1.7
# All-in-one image: Postgres 15 + GoTrue (Supabase Auth) + PostgREST + nginx
# + the Vite frontend served as static files. One container, two HTTP ports
# (3000 = frontend, 54321 = Supabase API gateway).
# Edge functions run in a SIBLING container (acq-edge).

# ─── Stage 1: build the Vite frontend → static files ──────────
FROM node:20-bookworm-slim AS web-builder
WORKDIR /build

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ARG VITE_PAYMENTS_CLIENT_TOKEN
ARG VITE_OTHER_APP_URL
ARG VITE_OTHER_APP_NAME
ARG VITE_LAUNCHER_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID \
    VITE_PAYMENTS_CLIENT_TOKEN=$VITE_PAYMENTS_CLIENT_TOKEN \
    VITE_OTHER_APP_URL=$VITE_OTHER_APP_URL \
    VITE_OTHER_APP_NAME=$VITE_OTHER_APP_NAME \
    VITE_LAUNCHER_URL=$VITE_LAUNCHER_URL

COPY apps/web/package.json apps/web/package-lock.json* ./
# Lovable's package-lock.json is out of sync with package.json (dev deps
# like @stripe/react-stripe-js / @playwright/test). Use `npm install` which
# is more forgiving than `npm ci`.
RUN npm install --no-audit --no-fund --legacy-peer-deps

COPY apps/web/ ./
RUN npm run build

# ─── Stage 2: runtime ──────────
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PATH=/usr/lib/postgresql/15/bin:$PATH

# Postgres 15 + pg_cron + nginx + utilities.
# NOTE: pg_net is intentionally OMITTED — there's no Debian package. The cron
# jobs that depend on net.http_post() won't run locally, but every other piece
# of the app works. Production deploy will install pg_net from source.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg lsb-release procps xz-utils tini \
      postgresql-15 postgresql-contrib-15 postgresql-client-15 \
      postgresql-15-cron \
      nginx libpq5 \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /var/log/nginx /var/lib/nginx /var/lib/postgresql/data \
             /var/run/postgresql /var/www/html \
 && chown -R postgres:postgres /var/lib/postgresql /var/run/postgresql

# GoTrue (Auth) + PostgREST: pull binaries from the official images
COPY --from=supabase/gotrue:v2.158.1     /usr/local/bin/auth              /usr/local/bin/auth
COPY --from=supabase/gotrue:v2.158.1     /usr/local/etc/auth/migrations   /usr/local/etc/auth/migrations
COPY --from=postgrest/postgrest:v12.2.3  /bin/postgrest                   /usr/local/bin/postgrest
RUN chmod +x /usr/local/bin/auth /usr/local/bin/postgrest

# Drop the built Vite static files into nginx's web root
COPY --from=web-builder /build/dist /var/www/html

# Init + runtime scripts
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
