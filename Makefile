# CampusCove — `make help`
# GNU make (Git Bash / `choco install make` on Windows).

.DEFAULT_GOAL := help

# dev stack reads .env.prod when it exists, the root .env otherwise
ENV_FILE := $(if $(wildcard .env.prod),.env.prod,.env)
COMPOSE := docker compose --env-file $(ENV_FILE)
ART    := $(COMPOSE) exec -T backend php artisan
# this PC's network address for LiveKit: the adapter holding the default route on Windows
# (Windows' ipconfig has no getifaddr and prints its help instead), en0/en1 on macOS, hostname -I on Linux
ifeq ($(OS),Windows_NT)
LAN_IP ?= $(strip $(shell powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lan-ip.ps1))
else
LAN_IP ?= $(shell ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || hostname -I 2>/dev/null | cut -d' ' -f1)
endif
# exported rather than prefixed (VAR=x cmd) so the recipes also run under cmd.exe when make is called from PowerShell
export LIVEKIT_NODE_IP := $(or $(LAN_IP),127.0.0.1)

help: ## List commands
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-22s %s\n", $$1, $$2}'

# --- docker ---

up: front-install socket-install ## Start the stack (front 5173, api 8000, socket 3000, db 5432, voice 7880); voice uses this PC's network address (LAN_IP=... to force it)
	$(COMPOSE) up -d

up-build: front-install socket-install ## Start the stack, rebuilding images
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

front-install: ## Install front dependencies (run by up, so the host builds share-local and tests with them)
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
ifneq (,$(filter model model-checked model-install,$(firstword $(MAKECMDGOALS))))
MODEL_PROMPT := $(wordlist 2,$(words $(MAKECMDGOALS)),$(MAKECMDGOALS))
%:
	@:
endif
ifeq (texture,$(firstword $(MAKECMDGOALS)))
TEXTURE_PROMPT := $(wordlist 2,$(words $(MAKECMDGOALS)),$(MAKECMDGOALS))
%:
	@:
endif
slug = $(shell echo '$(1)' | tr 'A-Z' 'a-z' | tr -cs 'a-z0-9' '_' | sed 's/^_//;s/_$$//' | cut -c1-40)
MODEL_IMAGE = $(filter %.png %.jpg %.jpeg %.webp,$(MODEL_PROMPT))
MODEL_SLUG = $(or $(SLUG),$(call slug,$(if $(MODEL_IMAGE),$(basename $(notdir $(MODEL_IMAGE))),$(MODEL_PROMPT))))
TEXTURE_KEY = $(call slug,$(TEXTURE_PROMPT))
HEIGHT ?= 1.0
TRIS ?= 800
VIEW ?= quarter
SEED ?= 42
REFS ?=
SLUG ?=
TEXTURE ?= $(if $(MODEL_IMAGE),ref,wood)
EXTRA_VIEWS ?= back side
KEY ?=
CHECK ?=
TRIES ?= 6
SHAPE ?= hunyuan3d-dit-v2-0-turbo
STEPS ?= 5
OCTREE ?= 256
AI_3D := $(HOME)/test3Dmodel/Hunyuan3D-2
AI_IMAGE_PYTHON := $(HOME)/image-inpaint-mps/.venv/bin/python
BLENDER := /Applications/Blender.app/Contents/MacOS/Blender
AI_OUT = map-src/CampusCove/out/ai/$(MODEL_SLUG)

AI_SCRIPTS = $(CURDIR)/map-src/CampusCove
AI_REF_VIEWS = $(if $(filter ref,$(TEXTURE)),$(EXTRA_VIEWS))
AI_VIEW_FILES = $(foreach view,$(AI_REF_VIEWS),$(CURDIR)/$(AI_OUT)/ref_$(view).png)

model: ## * Prompt or image path -> image -> 3D -> cleaned GLB + collision.json + meta.json in map-src/CampusCove/out/ai/<slug>/ (make model "a wooden lantern" or make model path/to/image.png, HEIGHT=1.2 TRIS=400 [VIEW=side] [SEED=7] [SLUG=name] [TEXTURE=wood|ref] [EXTRA_VIEWS="back side"] [REFS="a.png b.png"] [SHAPE=hunyuan3d-dit-v2-0 STEPS=30 OCTREE=384]); an image gets TEXTURE=ref: its back and side views are generated and baked into model.glb
	@test -n "$(MODEL_PROMPT)" || { echo 'usage: make model "a single wooden lantern" [HEIGHT=1.2] [TRIS=400]'; exit 1; }
	@test -n "$(MODEL_SLUG)" || { echo 'no usable name in "$(MODEL_PROMPT)": pass SLUG=my_name'; exit 1; }
	$(AI_IMAGE_PYTHON) $(AI_SCRIPTS)/ai_meta.py check $(AI_OUT) "$(MODEL_PROMPT)"
	mkdir -p $(AI_OUT)
	cd $(AI_OUT) && rm -f ref*.png mask*.png atlas.png raw.glb model.glb collision.json meta.json
	$(if $(MODEL_IMAGE),sips -s format png "$(abspath $(MODEL_IMAGE))" --out $(CURDIR)/$(AI_OUT)/ref.png,$(AI_IMAGE_PYTHON) $(AI_SCRIPTS)/campuscove_image.py "$(MODEL_PROMPT)" $(CURDIR)/$(AI_OUT)/ref.png --view $(VIEW) --seed $(SEED) $(foreach ref,$(REFS),--ref $(ref)))
	$(if $(or $(MODEL_IMAGE),$(AI_REF_VIEWS)),$(AI_IMAGE_PYTHON) $(AI_SCRIPTS)/ref_views.py $(CURDIR)/$(AI_OUT)/ref.png $(if $(MODEL_IMAGE),--normalise) --seed $(SEED) $(AI_REF_VIEWS))
	$(if $(CHECK),cd $(AI_3D) && HF_HUB_OFFLINE=1 .venv/bin/python $(AI_SCRIPTS)/check_ai_image.py $(CURDIR)/$(AI_OUT)/ref.png $(CHECK))
	cd $(AI_3D) && HF_HUB_OFFLINE=1 .venv/bin/python $(AI_SCRIPTS)/ai_mask.py $(CURDIR)/$(AI_OUT)/ref.png $(AI_VIEW_FILES)
	cd $(AI_3D) && HY3DGEN_MODELS=models HF_HUB_OFFLINE=1 PYTORCH_ENABLE_MPS_FALLBACK=1 .venv/bin/python $(AI_SCRIPTS)/campuscove_shape.py $(CURDIR)/$(AI_OUT)/ref.png $(CURDIR)/$(AI_OUT)/raw.glb --model $(SHAPE) --steps $(STEPS) --octree $(OCTREE)
	$(BLENDER) -b --factory-startup -P $(AI_SCRIPTS)/clean_ai_mesh.py -- $(CURDIR)/$(AI_OUT)/raw.glb $(CURDIR)/$(AI_OUT)/model.glb $(MODEL_SLUG) $(HEIGHT) $(TRIS)
	$(if $(filter ref,$(TEXTURE)),$(AI_IMAGE_PYTHON) $(AI_SCRIPTS)/ref_atlas.py $(CURDIR)/$(AI_OUT) && $(BLENDER) -b --factory-startup -P $(AI_SCRIPTS)/bake_ref_atlas.py -- $(CURDIR)/$(AI_OUT)/model.glb $(CURDIR)/$(AI_OUT))
	node front/scripts/apply-decor-collision.mjs $(AI_OUT)/model.glb
	$(AI_IMAGE_PYTHON) $(AI_SCRIPTS)/texture_parts.py model $(AI_OUT) $(PARTS)
	$(AI_IMAGE_PYTHON) $(AI_SCRIPTS)/ai_meta.py write $(AI_OUT) "input=$(MODEL_PROMPT)" seed=$(SEED) view=$(VIEW) height=$(HEIGHT) tris=$(TRIS) shape=$(SHAPE) steps=$(STEPS) octree=$(OCTREE) texture=$(TEXTURE) "extra_views=$(AI_REF_VIEWS)"

model-install: ## * Copy make model's result into front/public/assets/decor/<KEY>/ and list it in a decor category (make model-install "a wooden lantern" KEY=lantern CATEGORY=lighting); never overwrites
	@test -n "$(KEY)" -a "$(origin CATEGORY)" = "command line" || { echo 'usage: make model-install "<prompt or image path>" KEY=lantern CATEGORY=lighting'; exit 1; }
	$(AI_IMAGE_PYTHON) $(AI_SCRIPTS)/install_ai_decor.py $(AI_OUT) front/public/assets/decor $(KEY) $(CATEGORY)

model-checked: ## * make model with CHECK=quadruped|biped, retried on the next seeds until the concept image passes (TRIES=6)
	@test -n "$(CHECK)" || { echo 'usage: make model-checked "a cow standing" VIEW=side CHECK=quadruped [TRIES=6]'; exit 1; }
	@for seed in $$(seq $(SEED) $$(($(SEED) + $(TRIES) - 1))); do \
		$(MAKE) --no-print-directory model "$(MODEL_PROMPT)" HEIGHT=$(HEIGHT) TRIS=$(TRIS) VIEW=$(VIEW) SEED=$$seed CHECK=$(CHECK) REFS="$(REFS)" PARTS="$(PARTS)" SHAPE=$(SHAPE) STEPS=$(STEPS) OCTREE=$(OCTREE) && exit 0; \
		echo "seed $$seed refused, trying the next one"; \
	done; echo "no seed out of $(TRIES) passed the check"; exit 1

model-test: ## * Tests of the make model Blender cleanup (headless Blender) and of its views, atlas, meta and install helpers
	$(BLENDER) -b --factory-startup --python-exit-code 1 -P map-src/CampusCove/test_clean_ai_mesh.py
	$(BLENDER) -b --factory-startup --python-exit-code 1 -P map-src/CampusCove/test_bake_ref_atlas.py
	cd map-src/CampusCove && $(AI_IMAGE_PYTHON) test_ai_tools.py

animal-skin-test: ## * Tests of the animal auto-skinning on a worm, fish, bird, tiger, octopus and every shipped animal (headless Blender)
	$(BLENDER) -b --factory-startup --python-exit-code 1 -P map-src/CampusCove/test_animal_skin.py

TILE ?= 2.0
SIZE ?= 1024
CATEGORY ?= other

texture: ## * Prompt -> seamless tileable texture in front/public/assets/textures/<key>/ + categories.json (make texture "a wooden wall stained with blood" TILE=2.0 SIZE=1024 CATEGORY=wood)
	@test -n "$(TEXTURE_PROMPT)" || { echo 'usage: make texture "a wooden wall stained with blood" [TILE=2.0] [SIZE=1024] [CATEGORY=wood]'; exit 1; }
	$(AI_IMAGE_PYTHON) map-src/CampusCove/make_texture.py "$(TEXTURE_PROMPT)" $(TEXTURE_KEY) $(TILE) $(SIZE) $(CATEGORY) map-src/CampusCove/out/ai_textures/$(TEXTURE_KEY)
	$(AI_IMAGE_PYTHON) map-src/CampusCove/texture_parts.py texture front/public/assets/textures/$(TEXTURE_KEY) $(PARTS)

texture-parts: ## * Split every library texture and decor model map into recolourable parts (mask + parts list, PARTS labels on make texture/model)
	$(AI_IMAGE_PYTHON) map-src/CampusCove/texture_parts.py all front/public/assets

texture-test: ## * Tests of the make texture seamless wrap and texture library files
	$(AI_IMAGE_PYTHON) map-src/CampusCove/test_make_texture.py
	$(AI_IMAGE_PYTHON) map-src/CampusCove/test_texture_parts.py


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

playtest-accounts: ## Create or reset the two local playtest accounts (credentials in PlaytestAccountSeeder)
	$(ART) db:seed --class=PlaytestAccountSeeder --force

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

socket-install: ## Install socket dependencies (run by up, so the host runs the socket tests with them)
	cd socket && npm install

socket-start: ## Run socket locally (port 3000)
	cd socket && npm start

.PHONY: help up up-build down logs rebuild-socket socket-rebuild \
	front-install front-dev front-build typecheck share-local sharelocal \
	assets-optimize store-apply newnation-optimize collision-extract model model-test texture texture-test texture-parts \
	migrate seed seed-shop seed-housing purge-legacy-housing fix-housing collect-taxes set-admin set-money fill-outfit test \
	backend-install backend-serve socket-install socket-start stripe-secret stripe-listen stripe-logs stripe-stop gems-reconcile
