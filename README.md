# CampusCove — local installation

This document describes how to install and run the project on your machine. It does not cover features or architecture.

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

## Cleaning dependencies (project hygiene goal)

The goal is to keep installs **explicit and reproducible** so every Node app has its own correct `node_modules`, and the PHP app has `vendor/` from Composer—no mixed or stale trees.

| Location    | Install command   | What to reset if something is broken        |
|------------|-------------------|---------------------------------------------|
| `front/`   | `npm install`     | Delete `front/node_modules` and reinstall   |
| `socket/`  | `npm install`     | Delete `socket/node_modules` and reinstall  |
| `backend/` | `composer install`| Delete `backend/vendor` and run Composer again |

There is no root `package.json`; install **per folder** (`front`, `socket`). With Docker, rely on the compose-managed volumes for `node_modules`/`vendor` unless you intentionally develop with bind mounts and local installs.

After pulling changes, run `npm install` / `composer install` again in the folders that changed.
