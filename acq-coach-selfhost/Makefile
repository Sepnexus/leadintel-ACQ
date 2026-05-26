SHELL := /usr/bin/env bash

.DEFAULT_GOAL := help

help:  ## Show this help
	@awk 'BEGIN{FS=":.*##"} /^[a-zA-Z_-]+:.*##/{printf "  \033[36m%-22s\033[0m %s\n",$$1,$$2}' $(MAKEFILE_LIST)

# ---------- local (laptop) ----------

build:  ## Build the image locally
	docker compose build

up:  ## Start the containers (uses .env)
	docker compose up -d

down:  ## Stop and remove containers (KEEP volume)
	docker compose down

nuke:  ## Stop + remove containers AND volume (destroys local DB!)
	docker compose down -v

logs:  ## Tail main container logs
	docker logs -f acq-coach

logs-edge:  ## Tail edge-runtime container logs
	docker logs -f acq-edge

psql:  ## Open psql inside the main container
	@PG_PW=$$(grep '^POSTGRES_PASSWORD=' .env | tail -1 | cut -d= -f2-); \
	 PG_DB=$$(grep '^POSTGRES_DB=' .env | tail -1 | cut -d= -f2-); \
	 docker exec -it -e PGPASSWORD="$$PG_PW" acq-coach \
	   psql -h 127.0.0.1 -U postgres -d "$${PG_DB:-acqcoach}"

# ---------- secrets ----------

keys:  ## Print fresh JWT/Postgres/CRON secrets (paste into .env)
	@bash docker/gen-keys.sh

# ---------- data ----------

restore:  ## Restore from ../my-acq-coach-5b771b53/backups/migration-export/
	./scripts/restore-from-lovable.sh

# ---------- mirroring ----------

sync-app:  ## Re-mirror the frontend + functions + migrations from my-acq-coach-5b771b53
	@./scripts/sync-from-lovable-repo.sh
