SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help

help:
	@awk 'BEGIN{FS=":.*##"} /^[a-zA-Z_-]+:.*##/{printf "  \033[36m%-22s\033[0m %s\n",$$1,$$2}' $(MAKEFILE_LIST)

setup:  ## Generate .env from platform-db creds
	@if [ ! -f .env ]; then \
	  ADM_PW=$$(grep '^PLATFORM_ADMIN_PASSWORD=' ../platform-db/.env | tail -1 | cut -d= -f2-); \
	  echo "PLATFORM_ADMIN_DB_URL=postgres://platform_admin:$$ADM_PW@platform-db:5432/platform" > .env; \
	  echo "[setup] wrote .env"; \
	else \
	  echo "[setup] .env exists, skipping"; \
	fi

build:  ## Build the image
	docker compose build

up:  ## Start the admin-api container
	docker compose up -d

down:  ## Stop the container
	docker compose down

logs:  ## Tail logs
	docker logs -f platform-admin-api

restart:  ## Recreate the container
	docker compose up -d --force-recreate
