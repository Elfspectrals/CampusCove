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
| `make seed-housing` | 8 cubes ville |
| `make expire-leases` | Reset locations housing expirées |
| `make set-admin EMAIL=a@b.c` | Droits admin |
| `make set-money ACCOUNT=1 CURRENCY=coins SUM=2000` | Solde (id ou email) |
| `make fill-outfit ACCOUNT=1` | Starter wearables + outfit |
| `make test` | Tests backend |
| `make rebuild-socket` | Rebuild Colyseus (pas de volume) |
| `make map-optimize` | LobbyMap GLB + collision |
| `make apartment-optimize` | Appart GLB + collision |

`CURRENCY` : `coins` ou `premium`. Relog après `set-admin`.

## Appartement Campus Cove & New Nation

- **Intérieur d'appartement** : `CampusApartmentInterior.glb` (+ `.low`), construit dans Blender (`map-src/CampusApartment/`, ignoré par git). Collision générée au chargement depuis le modèle (pas de `.collision.json`).
- **Bâtiment Campus Cove** : `CampusApartmentExterior.glb`, ajouté à la carte de Paris (`/map-paris`) à l'ouest de l'Opéra.
- **`/NewNation`** : showroom 3D des articles de la boutique + quatre appartements témoins visitables (Cozy Classic, Scandi Loft, Neon Studio, Terracotta Sun). Mode marche (WASD, glisser ou Q/E pour tourner, N/B pour changer d'appartement) et mini-carte cliquable. Sources : `map-src/NewNation/`.

```bash
make apartment-optimize   # intérieur + extérieur
make newnation-optimize   # carte New Nation
```
