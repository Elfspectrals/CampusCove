# CampusCove

A Habbo hotel–like virtual campus for students, built with Vue 3 (TypeScript), Laravel, PostgreSQL, and Three.js.

## Stack

- **front**: Vue 3 + TypeScript + Vite + Tailwind CSS + Three.js + Socket.io client
- **backend**: Laravel 12 API (Sanctum auth)
- **socket**: Node.js Socket.io server (multi-user positions)
- **database**: PostgreSQL 16

## Quick start (Docker)

From the project root:

```bash
docker compose up --build
```

- **Frontend**: http://localhost:5173 (login/register → 3D FPS game)
- **Backend API**: http://localhost:8000  
- **API health**: http://localhost:8000/api/health  
- **Socket.io**: http://localhost:3000  
- **PostgreSQL**: `localhost:5432` (user: `postgres`, password: `secret`, database: `campus_cove`)

> **Si vous voyez « Ce site est inaccessible » / ERR_CONNECTION_REFUSED sur localhost:8000**  
> Le backend Laravel n’est pas démarré. Démarrez-le (voir [Sans Docker](#local-development-without-docker) ci‑dessous) ou lancez tout avec `docker compose up`.

### Proof of concept

- **Auth**: Register/Login with email, pseudo, password (Laravel + Sanctum).
- **3D world**: FPS view with ZQSD / WASD movement, mouse look (click to lock pointer).
- **Multi-user**: Each connected user is a colored sphere; positions sync via Socket.io.

Backend runs migrations on first start. To run them again:

```bash
docker compose exec backend php artisan migrate
```

## Local development (without Docker)

**Ordre à respecter :** 1) Base de données (PostgreSQL ou SQLite) → 2) Backend (port 8000) → 3) Socket (port 3000) → 4) Front (port 5173). Si le front affiche « connexion refusée », c’est que le backend n’est pas lancé.

### PostgreSQL

Create a database `campus_cove` and set in `backend/.env`:

```env
DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=campus_cove
DB_USERNAME=postgres
DB_PASSWORD=secret
```

### Backend (obligatoire pour l’API)

```bash
cd backend
cp .env.example .env
composer install
php artisan key:generate
php artisan migrate
php artisan serve
```

Laissez cette fenêtre ouverte. Quand vous voyez « Server running on [http://127.0.0.1:8000] », testez : http://localhost:8000/api/health

### Frontend

```bash
cd front
npm install
npm run dev
```

### Socket (for multi-user 3D)

```bash
cd socket
npm install
npm start
```

## Project structure

```
CampusCove/
├── front/          # Vue 3 + TypeScript + Vite + Three.js
├── backend/        # Laravel API (auth, users)
├── socket/        # Socket.io server (positions, colors)
├── docker-compose.yml
└── README.md
```

## Next steps (Habbo-like features)

- **Rooms** and **furniture** (API + 3D assets)
- **Chat** and interactions between students
- **Avatars** instead of spheres
- **Inventory** and items
