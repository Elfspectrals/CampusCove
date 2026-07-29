# CampusCove — local installation

This document describes how to install and run the project on your machine. It does not cover features or architecture.

> **Command hub:** all common commands are centralized in the root [Makefile](Makefile) — run `make help` to list them (requires GNU make; on Windows use Git Bash with make installed, e.g. `choco install make`).

## Prerequisites

- **Docker** (recommended): Docker Engine and Docker Compose, or
- **Without Docker**: Node.js (LTS), PHP 8.2+ with extensions Laravel needs, [Composer](https://getcomposer.org/), and PostgreSQL 16 (or compatible).

---

## Option A — Docker (simplest)

From the repository root:

```bash
docker compose up --build
```

- **Frontend**: http://localhost:5173  
- **Backend API**: http://localhost:8000 (health: http://localhost:8000/api/health)  
- **Socket.io**: http://localhost:3000  
- **PostgreSQL**: `localhost:5432` — database `campus_cove`, user `postgres`, password `secret`

The compose file runs `composer install` and migrations in the backend container and `npm install` in the frontend container. Named volumes keep `vendor` and `node_modules` inside Docker so host folders stay clean; see **Cleaning dependencies** below.

---

## Option B — Without Docker

Run services in this order: **database → backend → socket → frontend**.

### 1. PostgreSQL

Create a database named `campus_cove`. In `backend/.env` (copy from `backend/.env.example`), set:

```env
DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=campus_cove
DB_USERNAME=postgres
DB_PASSWORD=<your-password>
```

Adjust `APP_URL` if needed (e.g. `http://localhost:8000`).

### 2. Backend (Laravel)

```bash
cd backend
cp .env.example .env
composer install
php artisan key:generate
php artisan migrate
php artisan serve
```

Leave this process running (default: http://127.0.0.1:8000).

### 3. Socket server (Node)

```bash
cd socket
npm install
npm start
```

Runs on port **3000** by default (see `socket/server.js` if you change it).

### 4. Frontend (Vue + Vite)

```bash
cd front
npm install
npm run dev
```

Default dev server: **5173**. The Vite config proxies `/api` to `http://localhost:8000`; Socket defaults to `http://localhost:3000`. Override with `VITE_API_URL` / `VITE_SOCKET_URL` only if your URLs differ.

### Proximity voice

Voice is disabled for each player until they explicitly enable it in the game. Signaling uses the authenticated Colyseus room; microphone audio uses WebRTC, does not pass through the Colyseus application server, and is not recorded by CampusCove. Depending on the ICE configuration, WebRTC may send audio directly or through the configured TURN relay.

The local defaults work for same-device or LAN testing. Production deployments should configure restricted TURN credentials in the socket environment, ideally with `VOICE_ICE_TRANSPORT_POLICY=relay` when hiding peer network addresses is required. See `socket/.env.example` for every voice setting. TURN credentials delivered to browsers are visible to those browsers, so prefer short-lived credentials and never commit production secrets.

### Gameplay options and Cove Rush

The in-game Settings panel supports remappable movement, interaction, inventory, apartment rotation, and push-to-talk controls, plus sensitivity, inverted look, FOV, graphics presets, shadows, antialiasing, resolution scale, frame-rate caps, particles, bloom, HDR lighting, and an FPS overlay.

The city’s Cove Rush hub offers a lightweight server-authoritative orb course: play solo for a session best or queue for a nearby 1v1. Both racers receive equal start positions and a shared countdown; checkpoint order, movement, timing, forfeits, and results are validated by the Colyseus room. It has no NPC task or economy reward.

### Tests with Docker

Run backend tests through the dedicated test profile so `RefreshDatabase` can never touch the normal `campus_cove` database:

```bash
make backend-test
```

This uses an isolated `campus_cove_test` PostgreSQL service backed by temporary memory. `docker compose run --rm backend composer test` is intentionally not the documented test command because the normal backend service points at the development database.

---

## Game map (LobbyMap)

The city map served to players is the optimized `front/public/maps/LobbyMap.glb`. The raw Unreal Engine export lives in `map-src/LobbyMap/` (gitignored, never served).

When you re-export from Unreal: drop the export (`LobbyMap.gltf` + `.bin` + textures) into `map-src/LobbyMap/`, then run:

```bash
cd front
npm run map:optimize
```

This regenerates `front/public/maps/LobbyMap.glb` (Draco geometry compression, WebP textures capped at 1024 px, GPU instancing) **and** `LobbyMap.collision.json` (walk collision for Rapier).

### Apartment interior

Source: `map-src/Appartment/Stylized_Interior_Appartment_1.glb` (gitignored). Optimized outputs: `front/public/maps/ApartmentInterior.glb` (+ `.low`) **and** `ApartmentInterior.collision.json`.

```bash
cd front
npm run apartment:optimize
# or: make apartment-optimize
```

Enter your apartment from the lobby near Opera (Press **I**). Others stay in the city zone. Walls and furniture use the collision sidecar so you no longer walk through them.

### Collision sidecars (any asset)

`make optimize`, `map-optimize`, and `apartment-optimize` all run `extract-collision.mjs`, which writes a `.collision.json` next to the GLB (footprint cuboids for walls + furniture; decorative meshes skipped).

```bash
# From an already-optimized GLB only:
make collision-extract MODEL=public/maps/ApartmentInterior.glb
# or:
cd front && npm run collision:extract -- public/models/ChairCampusBasic.glb
```

---

## Cleaning dependencies (project hygiene goal)

The goal is to keep installs **explicit and reproducible** so every Node app has its own correct `node_modules`, and the PHP app has `vendor/` from Composer—no mixed or stale trees.

| Location    | Install command   | What to reset if something is broken        |
|------------|-------------------|---------------------------------------------|
| `front/`   | `npm install`     | Delete `front/node_modules` and reinstall   |
| `socket/`  | `npm install`     | Delete `socket/node_modules` and reinstall  |
| `backend/` | `composer install`| Delete `backend/vendor` and run Composer again |

There is no root `package.json`; install **per folder** (`front`, `socket`). With Docker, rely on the compose-managed volumes for `node_modules`/`vendor` unless you intentionally develop with bind mounts and local installs.

After pulling changes, run `npm install` / `composer install` again in the folders that changed.
