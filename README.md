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

---

## Game map (LobbyMap)

The city map served to players is the optimized `front/public/maps/LobbyMap.glb`. The raw Unreal Engine export lives in `map-src/LobbyMap/` (gitignored, never served).

When you re-export from Unreal: drop the export (`LobbyMap.gltf` + `.bin` + textures) into `map-src/LobbyMap/`, then run:

```bash
cd front
npm run map:optimize
```

This regenerates `front/public/maps/LobbyMap.glb` (Draco geometry compression, WebP textures capped at 1024 px, GPU instancing).

### Apartment interior

Built in Blender from scripts in `map-src/CampusApartment/` (gitignored): `build_interior.py`, `build_exterior.py` (helpers in `apt_lib.py`, generated textures in `textures/`). Export the `APT_Interior` and `APT_Exterior` collections to `CampusApartmentInterior.glb` / `CampusApartmentExterior.glb` in that folder, then run:

```bash
cd front
npm run apartment:optimize
# or: make apartment-optimize
```

Outputs: `front/public/maps/CampusApartmentInterior.glb` (+ `.low`) and `front/public/maps/CampusApartmentExterior.glb`. The exterior is added to the city when LobbyMap loads; its node transforms already place it west of the Opera. The interior keeps per-object nodes (`--join false`) so `House_Floor_*` floors stay tagged and walls/furniture collide.

Enter your apartment from the lobby at the **Campus Cove** building's front door (Press **I**). Others stay in the city zone.

### New Nation showroom (`/NewNation`)

A 3D plaza that previews every shop item on a pedestal (apartment assets on the inner ring, skins and other items on the outer booths). Click an item, or use ←/→, to fly to it and buy. Four walk-in model apartments ring the plaza (Cozy Classic, Scandi Loft, Neon Studio, Terracotta Sun). Use **Walk around** (WASD, drag or Q/E to turn, N/B for the next or previous home), the home buttons, or the minimap to visit them. The style variants are built by running `map-src/CampusApartment/build_interior.py` with a `THEME` (see the overrides block in that script) and exported as `CampusApartmentInterior_<theme>.glb`. Source: `map-src/NewNation/build_newnation.py` (gitignored). After exporting the `NN_Map` collection to `map-src/NewNation/NewNation.glb`, run `npm run newnation:optimize` in `front/`. Display slot positions are written by the Blender build to `front/public/maps/NewNation.slots.json`, because gltf-transform strips empty nodes.

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
