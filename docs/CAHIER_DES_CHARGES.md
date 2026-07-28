# Cahier des charges — CampusCove

> Document de synthèse fonctionnelle et technique.
> Périmètre : **fonctionnalités réellement implémentées** dans le projet.
> Date : Juin 2026 · Version 1.0

---

## 1. Présentation du projet

**CampusCove** est une application web de **campus virtuel social en 3D**. L'utilisateur crée un compte, personnalise son avatar, achète des objets avec une monnaie virtuelle, explore une ville 3D en temps réel avec d'autres joueurs, puis entre dans son appartement personnel qu'il décore avec ses objets.

### Boucle d'usage principale

```
Inscription → Personnalisation de l'avatar (Locker) → Achat d'objets (Shop)
→ Exploration de la ville 3D multijoueur → Appartement personnel → Décoration
```

### Acteurs

| Acteur | Description |
|--------|-------------|
| **Visiteur (Guest)** | Non connecté : landing, inscription, connexion, consultation du shop |
| **Joueur (User)** | Compte authentifié : profil, avatar, achats, jeu 3D, appartement, amis |
| **Administrateur (Admin)** | Back-office : gestion des utilisateurs, du catalogue shop et des inventaires |

---

## 2. Architecture technique

Architecture **3-tiers** découplée, orchestrée via **Docker Compose**.

```
┌────────────┐      ┌──────────────┐      ┌──────────────┐
│  Frontend  │──────│   Backend    │──────│  PostgreSQL  │
│  Vue 3 SPA │ HTTP │  Laravel API │  SQL │   (données)  │
│  (Three.js)│      │   (REST)     │      └──────────────┘
└─────┬──────┘      └──────┬───────┘
      │ WebSocket          │ HTTP (auth + persistance)
      │             ┌──────┴───────┐
      └─────────────│ Socket Server│
                    │  (Colyseus)  │
                    └──────────────┘
```

| Service | Rôle | Port |
|---------|------|------|
| `front/` | SPA Vue 3 + client de jeu 3D | 5173 |
| `backend/` | API REST Laravel (logique métier, auth, économie) | 8000 |
| `socket/` | Serveur temps réel Colyseus (présence, mouvement, déco) | 3000 |
| `postgres` | Base de données PostgreSQL 16 | 5432 |

**Principe d'autorité** : le **backend Laravel fait foi** (économie, inventaire, appartements). Le serveur socket agit comme **relais temps réel** et proxy authentifié vers Laravel.

---

## 3. Stack technologique

### Frontend (`front/`)

| Domaine | Technologie | Version |
|---------|-------------|---------|
| Framework | **Vue 3** | ^3.5.24 |
| Langage | **TypeScript** | ~5.9.3 |
| Build | **Vite** | ^7.2.4 |
| Routing | **vue-router** | ^4.5.0 |
| Styles | **Tailwind CSS** | ^3.4.16 |
| Rendu 3D | **Three.js** | ^0.170.0 |
| Physique (placement) | **@dimforge/rapier3d-compat** | ^0.19.3 |
| Client temps réel | **@colyseus/sdk** | ^0.17.41 |

> Pas de store externe (Pinia/Vuex) ni d'Axios : gestion d'état locale + `fetch` natif. Session stockée en `localStorage`.

### Backend (`backend/`)

| Domaine | Technologie | Version |
|---------|-------------|---------|
| Langage | **PHP** | ^8.2 |
| Framework | **Laravel** | ^12.0 |
| Auth (tokens API) | **Laravel Sanctum** | ^4.0 |
| ORM | **Eloquent** | — |
| Base de données | **PostgreSQL 16** | — |

### Socket (`socket/`)

| Domaine | Technologie | Version |
|---------|-------------|---------|
| Serveur temps réel | **Colyseus** | ^0.17.10 |
| Transport | **WebSocket** | — |

### Infrastructure

- **Docker / Docker Compose** (4 services + volumes nommés)
- **PostgreSQL 16 Alpine** (extensions `pgcrypto`, `citext`)
- **CORS** configuré pour `localhost:5173` et `localhost:3000`

---

## 4. Fonctionnalités implémentées

### 4.1 Authentification & compte

- Inscription **email + mot de passe**, connexion, déconnexion (tokens **Sanctum**).
- Système de **pseudo + tag numérique** (0–9999), affiché en `pseudo#0420`.
- **Modération** : compte vérifié à la connexion et sur les routes protégées (ban / suspension).
- Octroi automatique de **3 skins de corps gratuits** à l'inscription (cosmetics de départ).
- *Réinitialisation de mot de passe* : formulaire présent, envoi d'email non encore branché (stub).

### 4.2 Profil & accueil (`/home`)

- Hub de profil avec **soldes des deux monnaies** (`coins` / `premium`).
- Panneau **amis** latéral et bouton **Lancer le jeu**.
- *(Certaines statistiques — niveau, succès, ancienneté — sont actuellement des placeholders.)*

### 4.3 Boutique (Shop)

- Catalogue à **double monnaie** : `coins` et/ou `premium`.
- Achat → débit du portefeuille + attribution de l'objet.
- Gestion du **stock**, des objets **uniques par compte**, des flags de **publication / activation**.
- Deux sections : objets d'appartement (`/shop`) et cosmétiques (`/shop-skin`).
- Modale de **confirmation d'achat**.

### 4.4 Casier & inventaire (Locker)

- **Casier de cosmétiques** par compte, avec filtres par catégorie.
- **Équipement de l'avatar** sur **6 emplacements** : `body`, `hair`, `top`, `bottom`, `shoes`, `head_accessory`.
- **Couleurs personnalisées** (hex) par emplacement.
- **Aperçu 3D** de l'avatar dans le casier.
- Inventaire de jeu : **hotbar (9 slots)** + **layout 36 slots** persistés via l'API.

### 4.5 Amis (Social)

- Demande d'ami par **pseudo + tag**, acceptation, blocage, suppression.
- Listes des amis acceptés et des demandes en attente.
- *(La présence en ligne / en jeu n'est pas encore reliée au temps réel.)*

### 4.6 Jeu 3D multijoueur (`/game`)

- Hub **ville 3D** en vue première personne (contrôles **pointer lock**).
- **Synchronisation temps réel** des autres joueurs via Colyseus (jusqu'à **30 joueurs** par instance ville).
- Avatars **GLB** affichant le loadout cosmétique et les couleurs de chaque joueur.
- **Appartement personnel** : entrée/sortie, **placement / déplacement / récupération** de meubles, persistance via Laravel et synchronisation temps réel.
- Validation des collisions de placement via **Rapier3D**.
- HUD de jeu : hotbar, inventaire, prompts d'interaction, indications de portes.

### 4.7 Back-office Administrateur

- **Bascule mode admin** (réservée aux comptes `is_admin`), routes protégées par middleware.
- **Gestion des utilisateurs** : CRUD, suppression douce / restauration, suspension, ban, reset de mot de passe.
- **Gestion du catalogue Shop** : création / édition / suppression / actions groupées, upload d'assets (preview / modèle), publication, stock, prix.
- **Gestion des inventaires** : recherche de joueurs, attribution / retrait / quantité, équipement, reset.
- **Commandes CLI** (Artisan) : `setAdmin`, `setMoney`, `fillOutfit`.

---

## 5. Modèle de données (synthèse)

| Domaine | Tables principales |
|---------|-------------------|
| **Identité & auth** | `accounts`, `account_handles` (pseudo#tag), `account_auth_local` (email/mot de passe), `roles` / `permissions` |
| **Économie** | `wallets` (coins/premium), `wallet_ledger`, `transactions` |
| **Objets** | `item_defs` (kind : furniture / cosmetic / consumable / apartment_asset…) |
| **Inventaire cosmétique** | `account_locker_cosmetics`, `account_cosmetic_equipment` |
| **Inventaire objets** | `containers`, `inventory_stacks`, `item_instances`, `account_inventory_layout` |
| **Boutique** | `shop_catalog_items`, `account_shop_purchases` |
| **Logement** | `servers`, `buildings`, `rooms`, `room_furnitures`, `room_memberships` |
| **Social** | `friendships` (paire canonique + statut pending/accepted/blocked) |

---

## 6. API REST (principaux endpoints)

Préfixe : `/api` · Auth : `Authorization: Bearer {token}` (Sanctum).

### Public

| Méthode | Route | Rôle |
|---------|-------|------|
| GET | `/health` | Health check |
| POST | `/register` · `/login` · `/forgot-password` | Auth |
| GET | `/shop/items` | Catalogue publié |
| GET | `/assets/public/{path}` | Assets statiques (skins, GLB) |

### Authentifié

| Méthode | Route | Rôle |
|---------|-------|------|
| GET | `/user` · POST `/logout` | Session |
| GET/POST/DELETE | `/friends...` | Gestion des amis |
| POST | `/shop/purchase` | Achat |
| GET/PUT | `/inventory` · `/inventory/layout` | Inventaire & hotbar |
| GET/PUT | `/character/cosmetics` | Loadout & couleurs |
| POST/PATCH | `/apartments/state` · `/spawn` · `/transform` · `/pickup` | Appartement |

### Admin (`/api/admin/...`)

- `users` (CRUD + suspend / ban / reset)
- `shop/items` (CRUD + bulk)
- `inventories` (grant / revoke / set-quantity / equip / reset)

---

## 7. Temps réel (Socket — Colyseus)

- Une room **`city`** (`CityRoom`), capacité 30 joueurs (configurable).
- **Authentification** du client validée auprès de Laravel (`GET /api/user`).
- **Zones** : `city` (tous visibles) et `apartment` (isolé par propriétaire).
- **Client → serveur** : `move`, `appearance`, `enter/exit_apartment`, `apartment_spawn/transform/pickup_request`, `apartment_inventory_request`.
- **Serveur → client** : `init`, `user_joined/left/moved`, `appearance_updated`, `apartment_init`, `apartment_object_upserted/removed`, gestion d'erreurs.

---

## 8. Pages / vues frontend

| Route | Vue | Accès |
|-------|-----|-------|
| `/` | Landing | Guest |
| `/login`, `/register`, `/forgot-password` | Auth | Guest |
| `/shop`, `/shop-skin` | Boutique | Public |
| `/home` | Profil / hub | Joueur |
| `/locker` | Casier & équipement | Joueur |
| `/friends` | Amis | Joueur |
| `/game` | Jeu 3D plein écran | Joueur |
| `/admin/users`, `/admin/shop`, `/admin/inventories` | Back-office | Admin |

> Layout commun `AppShellLayout` (sidebar + portefeuille + bascule admin), sauf `GameView` en plein écran.

---

## 9. Exigences non-fonctionnelles (constats)

| Domaine | Élément |
|---------|---------|
| **Sécurité** | Tokens Sanctum, middleware `account.active` (ban/suspension), middleware `admin`, CORS restreint |
| **Performance temps réel** | Diffusion ciblée par zone de visibilité, cap à 30 joueurs/instance |
| **Cohérence des données** | Backend autoritatif ; économie et appartements persistés côté Laravel |
| **Déploiement** | Conteneurisation Docker complète, variables d'environnement (`VITE_API_URL`, `VITE_SOCKET_URL`, DB) |
| **Données démo** | Seeder `ShopSeeder` + commandes Artisan (cf. `COMMANDPHP.md`) |

---

*Document généré à partir de l'analyse du code source (frontend Vue, backend Laravel, serveur Colyseus, schéma PostgreSQL).*
