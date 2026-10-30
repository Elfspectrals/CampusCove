# Cove Parkview Mall — centre commercial

Contrat partagé entre les couches (Blender, front Three.js/Vue, socket, API). Toute valeur identique dans deux couches est
listée ici ; le code ne porte pas de commentaire pour la rappeler.

Décisions produit (validées le 30/10/2026) :

- Un **grand** centre commercial inspiré du Willamette Parkview Mall de Dead Rising : un anneau de plazas autour d'un parc
  extérieur central (Leisure Park), 2 niveaux dans trois plazas, food court, coulisses (couloirs de service, quai de
  livraison, entrepôt, salle de sécurité, accès au toit). Posé **à l'ouest, au-delà de la Cove Clinic**, entrée face à la
  ville ; un chemin décoré y mène depuis le parvis de la clinique.
- V1 : la structure complète est là (sols, étages, escalators, vitrines, enseignes, parc), mais **seules trois enseignes
  ouvrent** et vendent déjà les articles existants : **Northline** (vêtements, cf. H&M : blanc, miroirs, guirlandes),
  **Hearth & Hollow** (décoration : halle industrielle, briques, bois, étagères), **GreenCart** (supermarché type
  Leclerc/Lidl : parcours périphérique, allées en grille, têtes de gondole, caisses). Ce sont de nouvelles enseignes ; Cove
  Threads et Cove Home restent où elles sont.
- Toutes les autres cellules sont décrites dans `mall.layout.json` (`cells[]` : catégorie, nom, statut `planned` ou
  `construction`) pour être ouvertes plus tard sans toucher à la structure.
- Aucune vente côté serveur n'est spécifique au centre : le catalogue `/shop/items` est global, chaque boutique n'est
  qu'une vue filtrée (vêtements par URL de modèle, meubles et nourriture par code). Pas d'alcool ni de médicaments au
  supermarché (le pub et la clinique restent les seuls points de vente).

## 1. Fichiers et propriétaires

| Couche | Fichiers |
|---|---|
| Blender | `map-src/CampusCove/build_mall.py` (structure, parc, coulisses, parvis, chemin, `mall.layout.json`), `build_northline.py`, `build_hearth.py`, `build_greencart.py` (intérieur + coque chacun), `build_house_lightmaps.py -- store northline hearth_hollow greencart` |
| Outillage | `front/scripts/apply-mall.mjs` (zone `mall` du manifeste), `front/scripts/optimize-assets.mjs` (catégorie `store`) |
| Front | `game/assets/catalog.ts` (`NORTHLINE`, `HEARTH_HOLLOW`, `GREENCART`, `MALL`), `game/world/worldManifest.ts` (`layoutUrl` de zone), `game/town/openHouses.ts` (niveaux d'une zone), `composables/game/useFurnitureStore.ts` et `useClothingStore.ts` (paramètre `store`), `components/game/GameStoreItemCard.vue` (`brand`), câblage `GameView.vue` |
| Socket | rien de nouveau : les trois boutiques sont des bâtiments `kind: 'store'` lus par `socket/src/world.ts` (portes publiques) ; redémarrer le conteneur après `apply-mall.mjs` |
| API | rien |

## 2. Assets

```
front/public/assets/store/mall/{mall.glb, mall.collision.json, mall.layout.json}
front/public/assets/store/<key>/{interior.glb, interior.collision.json, interior.layout.json, exterior.glb,
                                  exterior.collision.json, exterior.layout.json, lightmap.jpg, preview.png}
                                  key ∈ northline, hearth_hollow, greencart
```

### Plan (coordonnées monde, mètres, nord = -Z, est = +X)

Anneau extérieur `x ∈ [-380, -160]`, `z ∈ [-90, 90]`, profondeur d'aile 40 m : couloir de service 2,5 m (nord, ouest,
sud) + cellules extérieures 9,5 m + allée 16 m + cellules intérieures 12 m côté parc. Parc `x ∈ [-340, -200]`,
`z ∈ [-50, 50]`. Les quatre coins (40 × 40) sont des cours ouvertes d'une seule hauteur où les allées se rejoignent.

| Plaza (`plazas[].id`) | Emprise | Niveaux | Toit | Contenu |
|---|---|---|---|---|
| `entrance` | x [-200, -160], z [-50, 50] | 2 | fermes ouvertes au-dessus du vide | entrée principale (x = -160, z ∈ [-8, 8]), mode, chaussures, bijoux, services |
| `paradise` | x [-300, -160], z [-90, -50] | 2 (x [-300, -200]) | id. | mode, jouets, livres, musique, cinéma ; **Hearth & Hollow** en ancre sur le mur nord |
| `north_plaza` | x [-380, -300], z [-90, -50] | 1 | dalle sur les cellules | **GreenCart** en ancre sur le mur nord, quincaillerie, cellules en travaux (palissades, échafaudages) |
| `wonderland` | x [-380, -340], z [-50, 50] | 2 | fermes | enfants, aire de jeux centrale, sport, arcade |
| `food_court` | x [-380, -300], z [50, 90] | 1 | dalle | comptoirs de restauration sur le mur sud et le mur ouest, tables communes, décor western |
| `al_fresca` | x [-300, -160], z [50, 90] | 1 | **aucun** (plein air) | rue pavée, fontaine, auvents ; **Northline** en ancre sur le mur sud |
| `leisure_park` | x [-340, -200], z [-50, 50] | — | — | pelouse, allées, tour de l'horloge, bassin, arbres, bancs, plaque d'égout |

Les ancres (`stores[]`, bâtiments `kind: 'store'`) ont leur façade **alignée sur le front des cellules** (z = -78 au nord,
z = +78 au sud) et leur corps dépasse hors de l'anneau :

| Clé | Nom | Position | `rotationY` | Porte | Coque (`exterior.layout.json`) |
|---|---|---|---|---|---|
| `northline` | Northline | (-236, 0, 82.5) | π | (-236, 1.25, 78) | 32 × ~30.8, H 4.8 |
| `hearth_hollow` | Hearth & Hollow | (-250, 0, -82.5) | 0 | (-250, 1.25, -78) | 30 × ~30.8, H 5.2 |
| `greencart` | GreenCart | (-340, 0, -82.5) | 0 | (-340, 1.25, -78) | 40 × ~36.8, H 5.0 |

Niveaux : rez `y = 0` partout ; étage `y = 6` (dalle 5,6 → 6,0) sur les balcons de 5 m des plazas à deux niveaux ; toit-
terrasse `y = 11.6` au-dessus de l'entrepôt du coin nord-est (hélisurface). Escalators : rampes de 1,4 × 10,4 m dans le
vide central, deux par plaza à deux niveaux, balustrades pleines du sol au garde-corps ; escalier en deux volées dans
l'entrepôt vers le toit.

Coulisses : couloir de service `STAFF ONLY` derrière les cellules extérieures (nord, ouest, sud, interrompu par les
ancres), portes depuis les cours des coins, quai de livraison avec rideau métallique sur le mur nord (x ≈ -300), entrepôt
+ salle de sécurité dans le coin nord-est (x [-200, -160], z [-90, -78]), accès au toit.

Parvis : dallage `x ∈ [-160, -146]`, `z ∈ [-14, 14]`, totem « COVE PARKVIEW MALL », bancs, bacs ; chemin de 3 m depuis
le parvis de la clinique (passe au sud du bâtiment) avec lampadaires et panneau « MALL > ».

### `mall.layout.json`

```jsonc
{
  "version": 1, "key": "mall", "name": "Cove Parkview Mall",
  "bounds": { "minX": -420, "maxX": -144, "minZ": -130, "maxZ": 130 },
  "entrance": { "position": [-160, 0, 0], "yaw": -1.5708, "width": 16 },
  "levels": [ { "id": "L0", "y": 0, "height": 6, "rects": [ ... ] },
              { "id": "L1", "y": 6, "height": 5, "rects": [ ... balcons ... ] },
              { "id": "L2", "y": 11.6, "height": 4, "rects": [ ... toit ... ] } ],
  "stairs": [ { "name": "Esc_entrance_N", "minX": .., "maxX": .., "minZ": .., "maxZ": .., "y0": 0, "y1": 6, "rise": "-z" } ],
  "plazas": [ { "id": "entrance", "name": "Entrance Plaza", "bounds": {...}, "floors": 2, "roof": "truss", "outdoor": false } ],
  "cells":  [ { "id": "E01", "plaza": "entrance", "level": 0, "side": "outer", "category": "clothing_women",
                "label": "WOMEN'S FASHION", "name": "Mae & Fern", "status": "planned",
                "bounds": {...}, "front": { "x": .., "z": .., "yaw": 0.0 }, "width": 10, "depth": 12 } ],
  "stores": [ { "key": "northline", "name": "Northline", "category": "clothing_department", "plaza": "al_fresca",
                "position": [-236, 0, 82.5], "rotationY": 3.1416 } ],
  "links":  [ { "from": "entrance", "to": "paradise", "via": "court_ne" } ],
  "backstage": { "serviceCorridors": [ {...} ], "warehouse": {...}, "securityRoom": {...}, "loadingDock": {...}, "roofAccess": "Stair_roof_a" }
}
```

- `levels` / `stairs` : même forme que les maisons (§4 du guide des assets) mais **en coordonnées monde**. Le front les
  enregistre comme un « bâtiment » de plus (`openHouses.ts`, `buildingFloorAt`) ; `extract-collision.mjs` lit ce fichier
  à côté de `mall.colsrc.glb` pour garder les boîtes de l'étage et du toit.
- `cells[].front.yaw` : direction regardée depuis l'allée vers la vitrine (0 = vers -Z, convention des stations).
- `cells[].status` ∈ `planned` (vitrine vide, panneau « OPENING SOON »), `construction` (palissade, échafaudage),
  `open` (réservé : une cellule ouverte devient un bâtiment `store`, voir `stores[]`).
- Catégories (`cells[].category`, étiquette `label`) : `clothing_women`, `clothing_men`, `clothing_kids`,
  `clothing_luxury`, `clothing_sport`, `shoes`, `eyewear`, `jewelry`, `cosmetics`, `sports`, `toys`, `books`, `music`,
  `electronics`, `camera`, `phones`, `gifts`, `home_decor`, `hardware`, `pharmacy`, `pet`, `gym`, `arcade`, `cinema`,
  `restaurant`, `fast_food`, `cafe`, `ice_cream`, `bakery`, `play`, `services` ; ancres : `clothing_department`,
  `home_decor`, `grocery`.

### Intérieurs des trois enseignes (repère local : sol y = 0, porte en z ≈ +5, salles vers -Z)

**Northline** (`build_northline.py`, 32 × 30 m, H 4.8) : même contrat que Cove Threads (`interior.layout.json` v2 :
`counter`, `clerk`, `departments`, `displays[{slot, key, department, position, yaw, center, tag}]`, `outfits[]`,
`mirror`), lu par `useClothingStore`. Rayons `top` (TOPS), `bottom` (BOTTOMS), `shoes` (FOOTWEAR), `hair` (HAIR STUDIO),
`head_accessory` (ACCESSORIES) ; les 25 pièces modulaires + 4 mannequins habillés sur un podium. Ambiance H&M : murs et
piliers miroir, guirlandes d'ampoules au plafond, tables blanches à piles pliées, portants ronds chromés, panneaux noirs
« WOMEN · MEN · KIDS », néon de l'enseigne sur le mur du fond.

**Hearth & Hollow** (`build_hearth.py`, 30 × 30 m, H 5.2) : même contrat que Cove Home (`departments`, `displays[{key,
code, department, description, position, yaw, size, tag}]`), lu par `useFurnitureStore`. Sélection de 26 meubles et
objets du catalogue Cove Home (plantes, lampes, textiles, petits meubles, miroirs, extérieur), exposés sur tables et
estrades en bois dans une halle : toit en sheds vitrés, fermes d'acier, mur de briques, lambris, grande suspension en
lamelles, étagères d'objets colorés.

**GreenCart** (`build_greencart.py`, 40 × 36 m, H 5.0) : contrat Cove Home avec `displays[].key` = dossier de l'asset
(`items/food/<key>`) et `code` = `food_*` ; `useFurnitureStore` charge `items/food/<key>/model.glb`. Parcours réel de
supermarché : entrée côté est avec chariots, **fruits et légumes puis boulangerie à l'entrée**, laitier et frais **au fond**,
boucle périphérique, 6 gondoles double face en grille au centre (`BREAKFAST`, `DRINKS`, `SNACKS`, `PASTA & RICE`,
`HOUSEHOLD`, `FROZEN`), têtes de gondole promo, batterie de 5 caisses à la sortie (mur avant, côté ouest). Articles vendus
(ceux du Campus Cafe, sans alcool ni médicaments) : `food_coffee`, `food_orange_juice`, `food_water_bottle`,
`food_croissant`, `food_sandwich`, `food_cookie`. Les emplacements libres sont listés dans `slots[]` (`{aisle, shelf,
position, yaw, code: null}`) pour les futurs produits.

## 3. Manifeste de monde

```jsonc
"zones": [ ..., { "key": "mall", "optional": true, "bounds": {...}, "modelUrl": "/assets/store/mall/mall.glb",
                  "collisionUrl": "/assets/store/mall/mall.collision.json",
                  "layoutUrl": "/assets/store/mall/mall.layout.json",
                  "animatedWater": true,
                  "gate": { "x": -160, "z": 0, "width": 16 },
                  "buildings": [ { "kind": "store", "key": "northline", "name": "Northline", "position": [..],
                                   "rotationY": .., "door": [..], "footprint": [..], "interiorOffset": [..] }, ... ] } ]
```

Écrit par `front/scripts/apply-mall.mjs` (idempotent) : `position`/`rotationY` viennent de `mall.layout.json.stores[]`,
`footprint`/`interiorOffset`/porte de chaque `store/<key>/exterior.layout.json`. Les collisions du centre viennent de son
propre `collisionUrl` (pas de fusion dans `town.collision.json`) ; les bornes du monde (±500 m) ne bougent pas.

## 4. Front

- `catalog.ts` : `NORTHLINE`, `HEARTH_HOLLOW`, `GREENCART` (mêmes champs que `COVE_THREADS` / `COVE_HOME`),
  `StoreKey` élargi, `MALL` (`layoutUrl`).
- `worldManifest.ts` : `WorldZone.layoutUrl?` ; `openHouses.ts` : une zone avec `layoutUrl` dont le fichier a des
  `levels` devient un `BuildingFloor` (matrice identité, `bounds` = bornes de la zone, `baseY` 0), ajouté **après** les
  intérieurs pour que `houseKeyAt` rende la boutique quand on est dedans et `mall` dans les allées.
- `useFurnitureStore(deps)` : `deps.store?` = `{ key, name, interiorLayoutUrl, modelUrl(display) }` (défaut Cove Home) ;
  instancié trois fois dans `GameView.vue` (Cove Home, Hearth & Hollow, GreenCart). `GameStoreItemCard` reçoit `brand`.
- `useClothingStore(deps)` : `deps.store?` = `{ key, interiorLayoutUrl, clerkColors }` (défaut Cove Threads) ; le
  bloqueur du vendeur est `<key>_clerk`. Instancié deux fois (Cove Threads, Northline) ; la vue affiche le panier et la
  caisse de celle où se trouve le joueur.

## 5. Ordre et vérification

1. Blender headless (Mac) :
   ```bash
   B=/Applications/Blender.app/Contents/MacOS/Blender
   for s in build_northline build_hearth build_greencart build_mall; do
     $B --background --factory-startup --python-expr "p='map-src/CampusCove/$s.py'; exec(open(p).read(), {'__file__': p})"
   done
   $B --background --factory-startup --python map-src/CampusCove/build_house_lightmaps.py -- store northline hearth_hollow greencart
   cd front && npm run assets:optimize -- store && node scripts/apply-mall.mjs
   docker restart campuscove-socket
   ```
2. Front : `npx vue-tsc -b`, `node --experimental-strip-types --test "src/**/*.test.ts"`, `npx knip`.
3. Playtest (`playtest-game`) : marcher de la clinique au centre, monter un escalator, entrer dans les trois enseignes,
   acheter un vêtement (panier + caisse), un meuble et un aliment, vérifier la collision (touche C).
