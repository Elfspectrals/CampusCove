# CampusCove command hub.
# Run `make help` (or just `make`) to list all commands.
# Requires GNU make; on Windows use Git Bash or `choco install make`.

.DEFAULT_GOAL := help

# ---------------------------------------------------------------- help

help: ## List all available commands
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'

# ---------------------------------------------------------------- docker (full stack)

up: ## Start the whole stack with Docker (front 5173, api 8000, socket 3000, db 5432)
	docker compose up -d

up-build: ## Start the stack, rebuilding all images
	docker compose up -d --build

down: ## Stop the Docker stack (keeps data volumes)
	docker compose down

rebuild-socket: ## Rebuild + restart only the socket server (needed after ANY socket/ change)
	docker compose up -d --build socket

logs: ## Tail logs of all Docker services
	docker compose logs -f

# ---------------------------------------------------------------- front (Vue + Three.js)

front-install: ## Install front dependencies
	cd front && npm install

front-dev: ## Run the front dev server locally (http://localhost:5173)
	cd front && npm run dev

front-build: ## Production build of the front
	cd front && npm run build

typecheck: ## Type-check the front (vue-tsc)
	cd front && npx vue-tsc --noEmit

# ---------------------------------------------------------------- 3D assets

# Usage: make optimize MODEL=path/to/model.glb [NAME=MyModel]
# Also writes Name.collision.json (Rapier cuboids) next to the GLB.
optimize: ## Optimize a .glb/.gltf into front/public/models/ + TS loader + collision JSON
	cd front && npm run optimize -- $(MODEL) $(NAME)

map-optimize: ## Rebuild LobbyMap GLBs + LobbyMap.collision.json
	cd front && npm run map:optimize

apartment-optimize: ## Rebuild ApartmentInterior GLBs + ApartmentInterior.collision.json
	cd front && npm run apartment:optimize

collision-extract: ## Extract collision JSON from an existing GLB (MODEL=public/maps/Foo.glb)
	cd front && npm run collision:extract -- $(MODEL)

# ---------------------------------------------------------------- backend (Laravel)

backend-install: ## Install backend dependencies (Composer)
	cd backend && composer install

backend-serve: ## Run the Laravel API locally (http://localhost:8000)
	cd backend && php artisan serve

migrate: ## Run database migrations (inside Docker)
	docker compose exec -T backend php artisan migrate

seed: ## Re-seed shop items + cosmetics (inside Docker)
	docker compose exec -T backend php artisan db:seed --class=ShopSeeder

# ---------------------------------------------------------------- socket (Colyseus)

socket-install: ## Install socket server dependencies
	cd socket && npm install

socket-start: ## Run the socket server locally (port 3000)
	cd socket && npm start

.PHONY: help up up-build down rebuild-socket logs front-install front-dev front-build typecheck optimize map-optimize apartment-optimize collision-extract backend-install backend-serve migrate seed socket-install socket-start
