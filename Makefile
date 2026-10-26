# CampusCove — `make help`
# GNU make (Git Bash / `choco install make` on Windows).

.DEFAULT_GOAL := help

COMPOSE := docker compose
ART     := $(COMPOSE) exec -T backend php artisan

help: ## List commands
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-22s %s\n", $$1, $$2}'

# --- docker ---

up: ## Start the stack (front 5173, api 8000, socket 3000, db 5432)
	$(COMPOSE) up -d

up-build: ## Start the stack, rebuilding images
	$(COMPOSE) up -d --build

down: ## Stop the stack (keeps volumes)
	$(COMPOSE) down

logs: ## Tail Docker logs
	$(COMPOSE) logs -f

rebuild-socket: ## Rebuild + restart Colyseus (needed after socket/ changes)
	$(COMPOSE) up -d --build socket

socket-rebuild: rebuild-socket ## Alias of rebuild-socket

# --- front ---

front-install: ## Install front dependencies
	cd front && npm install

front-dev: ## Front dev server (http://localhost:5173)
	cd front && npm run dev

front-build: ## Production build of the front
	cd front && npm run build

typecheck: ## Type-check the front (vue-tsc)
	cd front && npx vue-tsc --noEmit

# --- 3D assets ---

assets-optimize: ## Optimize Blender exports (map-src/CampusCove/out) into front/public/assets (+ collision JSON)
	cd front && npm run assets:optimize

store-apply: ## Wire the Cove Home store into the town (collision + town.layout.json), after assets-optimize
	cd front && npm run store:apply

newnation-optimize: ## Rebuild the /NewNation showroom map from map-src/NewNation/
	cd front && npm run newnation:optimize

collision-extract: ## Collision JSON from a GLB (MODEL=path/to/Foo.colsrc.glb)
	cd front && npm run collision:extract -- $(MODEL)

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

expire-leases: ## Reset expired housing rentals
	$(ART) housing:expire-leases

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
	front-install front-dev front-build typecheck \
	assets-optimize store-apply newnation-optimize collision-extract \
	migrate seed seed-shop seed-housing purge-legacy-housing fix-housing expire-leases set-admin set-money fill-outfit test \
	backend-install backend-serve socket-install socket-start
