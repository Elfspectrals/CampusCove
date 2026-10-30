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
| `make collect-taxes` | Prélève les taxes des maisons, saisit les impayées |
| `make set-admin EMAIL=a@b.c` | Droits admin |
| `make set-money ACCOUNT=1 CURRENCY=coins SUM=2000` | Solde (id ou email) |
| `make fill-outfit ACCOUNT=1` | Starter wearables + outfit |
| `make test` | Tests backend |
| `make rebuild-socket` | Rebuild Colyseus (pas de volume) |
| `make assets-optimize` | Assets Blender → `front/public/assets` (+ collisions) |
| `make store-apply` | Branche le magasin Cove Home dans la ville (collisions + zone `retail_park` de `world.manifest.json`) |
| `make newnation-optimize` | Carte du showroom `/NewNation` |

`CURRENCY` : `coins` ou `premium`. Relog après `set-admin`.

## Organisation du code

| Dossier | Rôle |
|---|---|
| `front/src/api/` | Appels à l'API Laravel. `http.ts` = client unique (`apiRequest`), `session.ts` = token, utilisateur et cache du portefeuille |
| `front/src/views/` | Pages (une par route). `GameView.vue` ne fait qu'assembler les composables du jeu |
| `front/src/composables/game/` | Logique du jeu `/game` : mouvement, temps réel (`useGameRealtime` + `useRemoteAvatars`), cibles d'interaction, environnement, maisons, inventaire, placement de meubles |
| `front/src/game/` | Code Three.js sans Vue : scène (`gameScene.ts`), environnements, `collision/` (Rapier), `placement/` (physique + fantôme), `town/` (maisons, bâtiments, pêche, terrain), `newNation/` (showroom) |
| `socket/` | Serveur Colyseus : `server.ts` (démarrage) + `src/` (`CityRoom`, intérieurs, joueurs, appels backend) |
| `backend/app/Console/Commands/` | Commandes Artisan (`setAdmin`, `setMoney`, `fillOutfit`, `housing:*`) |

Garde-fous : `cd front && npx knip` (code / exports morts), `make typecheck`, `npm run test:unit`, `make test`.

## Assets 3D (Blender)

Tous les assets du jeu sont construits dans Blender (via le MCP Blender) par les scripts Python de `map-src/CampusCove/` (seules les sorties `out/` sont ignorées par git), en low-poly texturé :

| Dossier `front/public/assets/` | Contenu |
|---|---|
| `skins/<clé>/` | 8 skins : `campus_classic` (gratuit, par défaut), `street_runner`, `scholar`, `explorer`, `night_owl` (low-poly statiques) + 3 skins premium semi-réalistes riggés avec clips `Idle`/`Walk`/`Run` : `neon_ronin`, `street_luxe`, `astral_oracle` (sources Blender dans `front/scripts/skins/`) (`model.glb`, `preview.png`) |
| `decor/<clé>/` | 50 meubles / objets de déco (`model.glb`, `preview.png`) : les 5 d'origine (`wooden_chair`, `dining_table`, `floor_lamp`, `potted_plant`, `bookshelf`, `build_decor.py`) + la gamme Cove Home (45 pièces, `build_furniture.py`, liste `FURNITURE`) |
| `store/` | Magasin de meubles **Cove Home** (style IKEA) au bout est de la place du quartier d'affaires : `cove_home/` (`exterior.glb`, `interior.glb`, collisions, `interior.layout.json` = 9 rayons + 50 présentoirs avec code boutique et position de l'étiquette prix), `park/` (parvis, haies, totem, `park.layout.json`) |
| `store/mall/`, `store/{northline,hearth_hollow,greencart}/` | **Cove Parkview Mall**, le centre commercial à l'ouest de la clinique (`mall.glb`, `mall.collision.json`, `mall.layout.json` = plazas, 124 cellules avec catégorie et statut, niveaux et escalators) et ses trois enseignes ouvertes : Northline (vêtements), Hearth & Hollow (déco), GreenCart (supermarché), puis en cellule Crispin's Hardware (bricolage), Candy Cloud (bonbons) et Summit Sports (sport). Accès par la porte nord-ouest de la haie et son avenue. Voir `docs/MALL.md` et `docs/ASSETS_STYLE_GUIDE.md` §13 |
| `houses/house_01…10/` | 10 maisons : `exterior.glb`, `interior.glb` (un intérieur par maison), `interior.collision.json`, `preview.png` |
| `work/<clé>/` | Quartier d'affaires : `tech_hub` (dev), `boutique` (commerce), `cafe` (resto) — `exterior.glb`, `interior.glb`, collisions, `interior.layout.json` (postes de travail), `preview.png` ; `work/district/` = décor du quartier. Voir `docs/ASSETS_STYLE_GUIDE.md` §8 |
| `town/` | La mini-ville (`town.glb`, `town.collision.json`, `town.layout.json` : spawn, position et porte de chaque maison) |
| `showroom/` | Carte de `/NewNation` |

Le code y accède via le catalogue central `front/src/game/assets/catalog.ts` ; les clés et codes boutique correspondent aux seeders (`ShopSeeder`, `HousingUnitSeeder`, `StarterCosmeticGrantService`).

Reconstruire : lancer `build_skins.py`, `build_decor.py`, `build_furniture.py`, `build_houses.py`, `build_town.py`, puis `build_store.py` et `build_store_ext.py` dans Blender (le magasin lit `out/decor/furniture.manifest.json`, écrit par `build_furniture.py`), puis :

```bash
make assets-optimize      # compression Draco/WebP + collisions (COL_* → *.collision.json)
make store-apply          # magasin Cove Home → town.collision.json + world.manifest.json
cd front && node scripts/apply-mall.mjs   # centre commercial → zone `mall` de world.manifest.json
make newnation-optimize   # carte New Nation
make seed-shop            # les 50 meubles (codes decor_*) dans le catalogue
```

**Acheter des meubles** : il n'y a plus de boutique web pour les meubles (onglet retiré de la nav, `/shop` redirige vers les skins). On les achète dans `/game` en entrant dans **Cove Home** : parcours fléché au sol (salon → chambre → cuisine → bureau → enfants → salle de bain → rangement → plantes → extérieur → caisses), chaque meuble est exposé avec son étiquette prix ; viser un meuble affiche sa fiche, clic gauche (ou `I`) pour l'acheter. Les modèles exposés sont les mêmes `decor/<clé>/model.glb` que ceux posés dans les maisons (`useFurnitureStore`).

- **`/game`** : la mini-ville avec l'hôtel de ville au centre ; les 10 maisons sont les logements achetables / louables (`housing_units.model_key`). Le magasin Cove Home est au bout est de la place du quartier d'affaires : on y entre à pied par sa porte publique (bâtiment `store` de la zone `retail_park` du manifeste).
- **`/NewNation`** : showroom 3D des articles de la boutique + 4 maisons témoins visitables (Maple Cottage, Mint Villa, Neon Loft, Terracotta Casa). Mode marche (WASD, glisser ou Q/E pour tourner, N/B pour changer de maison) et mini-carte cliquable.
