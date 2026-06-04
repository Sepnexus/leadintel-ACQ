SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help

help:
	@awk 'BEGIN{FS=":.*##"} /^[a-zA-Z_-]+:.*##/{printf "  \033[36m%-22s\033[0m %s\n",$$1,$$2}' $(MAKEFILE_LIST)

# ── one-time network bootstrap ─────────────────────────────
network:  ## Create the shared platform-shared docker network (idempotent)
	@docker network inspect platform-shared >/dev/null 2>&1 \
	  && echo "  platform-shared already exists" \
	  || (docker network create platform-shared && echo "  created platform-shared")

# ── setup ──────────────────────────────────────────────────
setup:  ## First-time: create .env + generate passwords
	@if [ ! -f .env ]; then \
	  cp .env.example .env; \
	  PG_PW=$$(openssl rand -hex 24); APP_PW=$$(openssl rand -hex 24); ADM_PW=$$(openssl rand -hex 24); \
	  sed -i.bak "s|CHANGE_ME_platform_db_superuser_password|$$PG_PW|; \
	              s|CHANGE_ME_platform_app_runtime_password|$$APP_PW|; \
	              s|CHANGE_ME_platform_admin_password|$$ADM_PW|" .env && rm .env.bak; \
	  echo "[setup] wrote .env with fresh passwords"; \
	else echo "[setup] .env exists, skipping"; fi

# ── lifecycle ──────────────────────────────────────────────
up: network  ## Start platform-db (depends on the shared network existing)
	docker compose up -d

down:  ## Stop platform-db (KEEP volume)
	docker compose down

nuke:  ## Stop + wipe volume (DESTROYS platform users + audit log!)
	docker compose down -v

logs:  ## Tail platform-db logs
	docker logs -f platform-db

psql:  ## psql shell into platform-db
	@PG_PW=$$(grep '^POSTGRES_PASSWORD=' .env | tail -1 | cut -d= -f2-); \
	 docker exec -it -e PGPASSWORD="$$PG_PW" platform-db \
	   psql -h 127.0.0.1 -U postgres -d platform

# ── backfill ───────────────────────────────────────────────
backfill:  ## Mirror existing ACQ + Lead Intel auth.users into platform.users
	./scripts/backfill.sh

verify:  ## Show current platform.users + access counts
	@PG_PW=$$(grep '^POSTGRES_PASSWORD=' .env | tail -1 | cut -d= -f2-); \
	docker exec -i -e PGPASSWORD="$$PG_PW" platform-db psql -h 127.0.0.1 -U postgres -d platform -At -F $$'\t' -c "$$(cat scripts/verify.sql)"
