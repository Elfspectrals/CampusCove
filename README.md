# CampusCove

Docker. À la racine du repo. `make help` liste tout.

## Lancer

```bash
make up
```

| Service | URL |
|---|---|
| Front | http://localhost:5173 |
| API | http://localhost:8000/api/health |
| Socket | http://localhost:3000 |
| Postgres | `localhost:5432` · db `campus_cove` · user `postgres` · pass `secret` |

```bash
make down
make logs
make up-build
```

## Make

| Commande | Effet |
|---|---|
| `make migrate` | Migrations |
| `make seed` | Shop + housing |
| `make seed-shop` | Catalogue shop / wearables |
| `make seed-housing` | 10 maisons de la ville |
| `make expire-leases` | Reset locations housing expirées |
| `make set-admin EMAIL=a@b.c` | Droits admin |
| `make set-money ACCOUNT=1 CURRENCY=coins SUM=2000` | Solde (id ou email) |
| `make fill-outfit ACCOUNT=1` | Starter wearables + outfit |
| `make test` | Tests backend |
| `make rebuild-socket` | Rebuild Colyseus (pas de volume) |
| `make assets-optimize` | Assets Blender → `front/public/assets` (+ collisions) |
| `make newnation-optimize` | Carte du showroom `/NewNation` |

`CURRENCY` : `coins` ou `premium`. Relog après `set-admin`.

## Organisation du code

| Dossier | Rôle |
|---|---|
| `front/src/api/` | Appels à l'API Laravel. `http.ts` = client unique (`apiRequest`), `session.ts` = token, utilisateur et cache du portefeuille |
| `front/src/views/` | Pages (une par route). `GameView.vue` ne fait qu'assembler les composables du jeu |
| `front/src/composables/game/` | Logique du jeu `/game` : mouvement, temps réel (`useGameRealtime` + `useRemoteAvatars`), cibles d'interaction, environnement, maisons, inventaire, placement de meubles |
| `front/src/game/` | Code Three.js sans Vue : scène (`gameScene.ts`), environnements, `collision/` (Rapier), `placement/` (physique + fantôme), `town/` (maisons, bâtiments, pêche, terrain), `newNation/` (showroom) |
| `socket/` | Serveur Colyseus : `server.js` (démarrage) + `src/` (`CityRoom`, intérieurs, joueurs, appels backend) |
| `backend/app/Console/Commands/` | Commandes Artisan (`setAdmin`, `setMoney`, `fillOutfit`, `housing:*`) |

Garde-fous : `cd front && npx knip` (code / exports morts), `make typecheck`, `npm run test:unit`, `make test`.

## Assets 3D (Blender)

Tous les assets du jeu sont construits dans Blender (via le MCP Blender) par les scripts Python de `map-src/CampusCove/` (seules les sorties `out/` sont ignorées par git), en low-poly texturé :

| Dossier `front/public/assets/` | Contenu |
|---|---|
| `skins/<clé>/` | 8 skins : `campus_classic` (gratuit, par défaut), `street_runner`, `scholar`, `explorer`, `night_owl` (low-poly statiques) + 3 skins premium semi-réalistes riggés avec clips `Idle`/`Walk`/`Run` : `neon_ronin`, `street_luxe`, `astral_oracle` (sources Blender dans `front/scripts/skins/`) (`model.glb`, `preview.png`) |
| `decor/<clé>/` | 5 objets de déco : `wooden_chair`, `dining_table`, `floor_lamp`, `potted_plant`, `bookshelf` |
| `houses/house_01…10/` | 10 maisons : `exterior.glb`, `interior.glb` (un intérieur par maison), `interior.collision.json`, `preview.png` |
| `work/<clé>/` | Quartier d'affaires : `tech_hub` (dev), `boutique` (commerce), `cafe` (resto) — `exterior.glb`, `interior.glb`, collisions, `interior.layout.json` (postes de travail), `preview.png` ; `work/district/` = décor du quartier. Voir `docs/ASSETS_STYLE_GUIDE.md` §8 |
| `town/` | La mini-ville (`town.glb`, `town.collision.json`, `town.layout.json` : spawn, position et porte de chaque maison) |
| `showroom/` | Carte de `/NewNation` |

Le code y accède via le catalogue central `front/src/game/assets/catalog.ts` ; les clés et codes boutique correspondent aux seeders (`ShopSeeder`, `HousingUnitSeeder`, `StarterCosmeticGrantService`).

Reconstruire : lancer `build_skins.py`, `build_decor.py`, `build_houses.py` puis `build_town.py` dans Blender, puis :

```bash
make assets-optimize      # compression Draco/WebP + collisions (COL_* → *.collision.json)
make newnation-optimize   # carte New Nation
```

- **`/game`** : la mini-ville avec l'hôtel de ville au centre ; les 10 maisons sont les logements achetables / louables (`housing_units.model_key`).
- **`/NewNation`** : showroom 3D des articles de la boutique + 4 maisons témoins visitables (Maple Cottage, Mint Villa, Neon Loft, Terracotta Casa). Mode marche (WASD, glisser ou Q/E pour tourner, N/B pour changer de maison) et mini-carte cliquable.
