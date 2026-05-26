SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help

help:
	@awk 'BEGIN{FS=":.*##"} /^[a-zA-Z_-]+:.*##/{printf "  \033[36m%-22s\033[0m %s\n",$$1,$$2}' $(MAKEFILE_LIST)

build:  ## Build the images locally
	docker compose build

up:  ## Start the containers (uses .env)
	docker compose up -d

down:  ## Stop and remove containers (KEEP volume)
	docker compose down

nuke:  ## Stop + remove containers AND volume
	docker compose down -v

logs:  ## Tail main container logs
	docker logs -f leadintel

logs-edge:  ## Tail edge-runtime logs
	docker logs -f leadintel-edge

psql:  ## Open psql inside the main container
	@PG_PW=$$(grep '^POSTGRES_PASSWORD=' .env | tail -1 | cut -d= -f2-); \
	 PG_DB=$$(grep '^POSTGRES_DB=' .env | tail -1 | cut -d= -f2-); \
	 docker exec -it -e PGPASSWORD="$$PG_PW" leadintel \
	   psql -h 127.0.0.1 -U postgres -d "$${PG_DB:-leadintel}"

keys:  ## Print fresh JWT/Postgres/CRON secrets
	@bash docker/gen-keys.sh

restore:  ## Restore from ../closercontrolleadintel/backups/backend-export/
	./scripts/restore-from-lovable.sh

sync-app:  ## Re-mirror the frontend + functions + migrations from closercontrolleadintel
	@./scripts/sync-from-lovable-repo.sh
