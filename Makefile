# CampusCove — `make help`
# GNU make (Git Bash / `choco install make` on Windows).

.DEFAULT_GOAL := help

# dev stack reads .env.prod when it exists, the root .env otherwise
ENV_FILE := $(if $(wildcard .env.prod),.env.prod,.env)
COMPOSE := docker compose --env-file $(ENV_FILE)
ART    := $(COMPOSE) exec -T backend php artisan

help: ## List commands
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-22s %s\n", $$1, $$2}'

# --- docker ---

up: ## Start the stack (front 5173, api 8000, socket 3000, db 5432)
	$(COMPOSE) up -d

up-build: ## Start the stack, rebuilding images
	$(COMPOSE) up -d --build

down: ## Stop the stack (keeps volumes), the optional Stripe CLI relay included
	$(COMPOSE) --profile stripe down

logs: ## Tail Docker logs
	$(COMPOSE) logs -f

rebuild-socket: ## Rebuild + restart Colyseus (needed after socket/ changes)
	$(COMPOSE) up -d --build socket

socket-rebuild: rebuild-socket ## Alias of rebuild-socket

# --- production (docker-compose.prod.yml, secrets in .env.prod; DOCKER_CONTEXT=<ctx> for a remote server) ---

PROD := docker compose --env-file .env.prod -f docker-compose.prod.yml

prod-key: ## Print a fresh APP_KEY for .env.prod
	@docker run --rm php:8.3-cli-alpine php -r "echo 'base64:'.base64_encode(random_bytes(32)).PHP_EOL;"

prod-up: ## Build and start the production stack (Caddy on 80/443, https://$DOMAIN)
	$(PROD) up -d --build

prod-down: ## Stop the production stack (keeps volumes)
	$(PROD) down

prod-ps: ## Production containers and their health
	$(PROD) ps

prod-logs: ## Tail production logs
	$(PROD) logs -f

# --- front ---

front-install: ## Install front dependencies
	cd front && npm install

front-dev: ## Front dev server (http://localhost:5173)
	cd front && npm run dev

front-build: ## Production build of the front
	cd front && npm run build

typecheck: ## Type-check the front (vue-tsc)
	cd front && npx vue-tsc --noEmit

share-local: ## Public link to the local stack for playtesters (needs make up + cloudflared; Ctrl+C stops)
	cd front && node scripts/share-local.mjs

sharelocal: share-local ## Alias of share-local

# --- 3D assets ---

assets-optimize: ## Optimize Blender exports (map-src/CampusCove/out) into front/public/assets (+ collision JSON)
	cd front && npm run assets:optimize

store-apply: ## Wire the Cove Home store into the town (collision + world.manifest.json), after assets-optimize
	cd front && npm run store:apply

newnation-optimize: ## Rebuild the /NewNation showroom map from map-src/NewNation/
	cd front && npm run newnation:optimize

collision-extract: ## Collision JSON from a GLB (MODEL=path/to/Foo.colsrc.glb)
	cd front && npm run collision:extract -- $(MODEL)

# * local only: needs Jerome's Mac (~/test3Dmodel/Hunyuan3D-2, ~/image-inpaint-mps, Blender.app)
ifeq (model,$(firstword $(MAKECMDGOALS)))
MODEL_PROMPT := $(wordlist 2,$(words $(MAKECMDGOALS)),$(MAKECMDGOALS))
%:
	@:
endif
MODEL_SLUG = $(shell echo '$(MODEL_PROMPT)' | tr 'A-Z' 'a-z' | tr -cs 'a-z0-9' '_' | sed 's/^_//;s/_$$//' | cut -c1-40)
HEIGHT ?= 1.0
TRIS ?= 800
AI_3D := $(HOME)/test3Dmodel/Hunyuan3D-2
AI_IMAGE_PYTHON := $(HOME)/image-inpaint-mps/.venv/bin/python
BLENDER := /Applications/Blender.app/Contents/MacOS/Blender
AI_OUT = map-src/CampusCove/out/ai/$(MODEL_SLUG)

model: ## * Prompt -> image -> 3D -> cleaned GLB + collision.json in map-src/CampusCove/out/ai/<slug>/ (make model "a wooden lantern" HEIGHT=1.2 TRIS=400)
	@test -n "$(MODEL_PROMPT)" || { echo 'usage: make model "a single wooden lantern" [HEIGHT=1.2] [TRIS=400]'; exit 1; }
	mkdir -p $(AI_OUT)
	$(AI_IMAGE_PYTHON) $(AI_3D)/campuscove_image.py "$(MODEL_PROMPT)" $(CURDIR)/$(AI_OUT)/ref.png
	cd $(AI_3D) && HY3DGEN_MODELS=models HF_HUB_OFFLINE=1 PYTORCH_ENABLE_MPS_FALLBACK=1 .venv/bin/python campuscove_shape.py $(CURDIR)/$(AI_OUT)/ref.png $(CURDIR)/$(AI_OUT)/raw.glb hunyuan3d-dit-v2-0-turbo 5
	$(BLENDER) -b --factory-startup -P map-src/CampusCove/clean_ai_mesh.py -- $(CURDIR)/$(AI_OUT)/raw.glb $(CURDIR)/$(AI_OUT)/model.glb $(MODEL_SLUG) $(HEIGHT) $(TRIS)
	node front/scripts/apply-decor-collision.mjs $(AI_OUT)/model.glb


# --- gem shop demo (Stripe TEST MODE only, docs/STRIPE.md) ---
# Stripe CLI in Docker (service stripe-cli, profile stripe): needs STRIPE_SECRET_KEY=sk_test_... in $(ENV_FILE),
# no Stripe CLI on the machine. Events: backend/resources/stripe-webhook-events.txt.

STRIPE_CLI := $(COMPOSE) --profile stripe

stripe-secret: ## Print the webhook signing secret of the Docker Stripe CLI (-> STRIPE_WEBHOOK_SECRET in .env.prod, or the root .env)
	$(STRIPE_CLI) run --rm --no-deps stripe-cli --print-secret

stripe-listen: ## Start the Docker Stripe CLI relay in the background (test-mode webhooks -> backend)
	$(STRIPE_CLI) up -d stripe-cli
	@echo "Relay started in the background: make stripe-logs (follow), make stripe-stop (stop)."

stripe-logs: ## Follow the Stripe CLI relay logs (Ctrl+C stops following, not the relay)
	$(STRIPE_CLI) logs -f stripe-cli

stripe-stop: ## Stop the Stripe CLI relay only (the rest of the stack keeps running)
	$(STRIPE_CLI) stop stripe-cli

gems-reconcile: ## Re-sync gem orders with Stripe (ORDER=<public id> for one order, refunds included)
	$(ART) gems:reconcile $(if $(ORDER),--order=$(ORDER))

# --- backend (Docker artisan) ---

migrate: ## Run migrations
	$(ART) migrate --force

seed: ## Seed shop + housing
	$(ART) db:seed --force

seed-shop: ## Seed shop catalog / wearables
	$(ART) db:seed --class=ShopSeeder --force

seed-housing: ## Seed the 10 town houses (housing units)
	$(ART) db:seed --class=HousingUnitSeeder --force

purge-legacy-housing: ## Delete legacy housing cubes + their rooms/furniture (OCCUPIED=1 to include occupied ones)
	$(ART) housing:purge-legacy $(if $(OCCUPIED),--occupied)

fix-housing: seed-housing purge-legacy-housing ## Seed the 10 town houses + purge old cubes (OCCUPIED=1 to include occupied ones)

collect-taxes: ## Collect due house taxes, seize unpaid houses
	$(ART) housing:collect-taxes

set-admin: ## Grant admin (EMAIL=a@b.c)
	$(ART) setAdmin $(EMAIL)

set-money: ## Set wallet (ACCOUNT=id|email CURRENCY=coins|premium SUM=2000)
	$(ART) setMoney $(ACCOUNT) $(CURRENCY) $(SUM)

fill-outfit: ## Starter wearables + outfit (ACCOUNT=id|email)
	$(ART) fillOutfit $(ACCOUNT)

test: ## Backend tests
	$(ART) test

backend-install: ## Composer install (local, no Docker)
	cd backend && composer install

backend-serve: ## Laravel API locally (http://localhost:8000)
	cd backend && php artisan serve

# --- socket (local, no Docker) ---

socket-install: ## Install socket dependencies
	cd socket && npm install

socket-start: ## Run socket locally (port 3000)
	cd socket && npm start

.PHONY: help up up-build down logs rebuild-socket socket-rebuild \
	front-install front-dev front-build typecheck share-local sharelocal \
	assets-optimize store-apply newnation-optimize collision-extract model \
	migrate seed seed-shop seed-housing purge-legacy-housing fix-housing collect-taxes set-admin set-money fill-outfit test \
	backend-install backend-serve socket-install socket-start stripe-secret stripe-listen stripe-logs stripe-stop gems-reconcile
