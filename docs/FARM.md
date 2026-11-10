# Cove Farm — la ferme

Zone `farm` au sud du verger (`x -42,6 → -2`, `z -200 → -130`), entrée par la porte nord à `x = -8,5` depuis le verger.
Une maison de fermier et une grange visitables ; les champs, les enclos, les animaux et le décor se posent dans l'éditeur de zone
([MALL_EDITOR.md](MALL_EDITOR.md#décorer-une-zone-du-monde-ouvert)).

## Champs modulaires

Un champ est un objet de l'éditeur (dossier **Fields**) : culture, taille (1 à 60 m de côté), motif **rows**, **staggered**
(une rangée sur deux décalée d'un demi-plant) ou **scattered** (grille bousculée, déterministe par champ), position et
rotation. Les plants sont calculés une seule fois, en TS (`front/src/game/crops/crops.ts`, `fieldPlants`), et enregistrés
dans `zones/<zone>.json` (`plants: [x, y, z, yaw]`) ; le parseur refuse un fichier dont les plants ne correspondent plus
au champ. Le bake (`npm run zone:bake -- farm`) pose la terre et les plants dans le GLB de la zone et écrit leurs
positions dans `world.manifest.json` (`crops: [{ zone, crop, position }]`).

Les cultures sont décrites dans `front/public/assets/crops/crops.json` (lu par le front, l'endpoint de l'éditeur et le
bake Python) : libellé, objet ramassé, modèle du plant, espacement dans la rangée (`spacing`) et entre rangées (`rowGap`).
Le chou et la citrouille utilisent le même modèle comme plant et comme objet.

## Vente des récoltes

Le fermier tient la zone acheteur **Farmer's stand** (carte **Sellers** de l'éditeur) : maïs et pommes de terre à 3
pièces jusqu'à 300 par jour puis 1, chou à 4 jusqu'à 200, citrouille à 6 jusqu'à 100, puis 1. En jeu, viser le fermier
ouvre le menu de vente (`zone_sell` → socket, qui vérifie qu'on est à 3 m de lui → `POST /api/zone/sell`).

## Animaux

Un animal est un objet de l'éditeur (dossier **Animals**) : espèce, position, rotation et taille de son enclos
(`size`, 1 à 30 m de côté, cadre jaune dans l'éditeur). Il n'est pas cuit : `/game` le charge et le fait errer dans ce
rectangle. Le trajet est calculé par `animalPose` (`front/src/game/animals/animals.ts`) à partir de l'horloge, sans
message réseau : chaque cycle, l'animal marche d'un point tiré au sort (graine `<id>#<cycle>`) au suivant, puis se repose
en broutant ou immobile. Tous les joueurs voient le même trajet, au décalage de leurs horloges près.

Les espèces sont dans `front/public/assets/animals/animals.json` (libellé, vitesse en m/s, repos en s). Chaque
`animals/<clé>/model.glb` porte un squelette et trois clips `idle`, `walk`, `graze`.

| Espèce | Source |
|---|---|
| `cow`, `pig`, `sheep`, `dog`, `hen`, `rooster` | `make model` (vue de profil, pattes écartées), squelette, poids et clips générés par `build_animals.py` |

Les animaux n'ont pas de collision : l'enclos se ferme avec les décors `fence_panel`, `fence_gate` ou `wire_panel`, et
on y laisse le passage libre (un animal traverse les décors posés dans son rectangle).

Nouvel animal :

```bash
make model "a single brown goat standing side view with four legs apart" HEIGHT=0.8 TRIS=1200
```

ajouter l'espèce dans `animals.json` et dans `ANIMALS` de `build_animals.py` (dossier `out/ai/<slug>`, tête à droite de
l'image = `head=1`, `legs`, hauteurs relatives `leg_top`, `neck`, `skull`), puis :

```bash
blender --background --factory-startup --python-expr "ONLY_ANIMALS=['<clé>']; p='map-src/CampusCove/build_animals.py'; exec(open(p).read(), {'__file__': p, 'ONLY_ANIMALS': ONLY_ANIMALS})"
node front/scripts/optimize-assets.mjs animals <clé>
```

## Pack de la ferme

Règle `.claude/rules/assets.md` : un lieu arrive avec ses propres assets, même non vendus.

| Bloc | Contenu | Source |
|---|---|---|
| Bâtiments | Maison et grange visitables : portes ouvertes, sols, stalles, grenier à foin sur poteaux, échelle, poutres, lanterne | objets **building** de `zones/farm.json`, construits par `lib_buildings.py` (kit `lib_kit`) |
| Décor (catégorie **Farm** de l'éditeur) | `scarecrow`, `hay_bale_round`, `water_trough`, `milk_churn`, `feed_sacks`, `wooden_barrel`, `chicken_coop`, `stone_well`, `watering_can`, `vegetable_crate`, `chicken_feeder`, `tool_rack`, `fence_panel`, `fence_gate`, `wire_panel`, `mud_patch`, `hay_rack` | `make model` importés et colorés par `build_farm_decor.py` ; pièces fines ou plates (outils, clôtures, grillage, boue, râtelier) en builder, `fence_panel` reprend `L.fence_run` |
| Animaux | vache, cochon, mouton, chien, poule, coq | voir [Animaux](#animaux) |
| Consommables (groupe `farm`, non vendus) | `farm_egg`, `farm_milk`, plus les récoltes | `make model` via `build_grocery_items.py` (`FARM`) |
| Tenue | `head_accessory/bandana`, `top/flannel_jacket` (+ bras FPS), `shoes/rubber_boots`, avec `straw_hat`, `plaid_shirt`, `farm_apron`, `dungarees`, `boots` | `front/scripts/skins/wear.py` |

Premier aménagement dans `zones/farm.json` : cuisine, table et lit dans la maison ; foin, sacs, tonneau, bidon, outils et
lait dans la grange ; poulailler et œufs, abreuvoir, puits, épouvantails dans la cour et les champs ; un fermier et un
ouvrier agricole habillés du pack ; un poulailler grillagé entre la maison et la grange (deux poules, un coq,
mangeoire), un pré au sud (vache, deux moutons, râtelier), une porcherie avec sa boue le long de la clôture est (deux
cochons) et le chien dans la cour. Le grenier est du décor : on n'y monte pas.

Nouveau décor : `make model "<prompt>"`, ajouter la clé et le dossier `out/ai/<slug>` dans `DECOR` de
`build_farm_decor.py`, puis :

```bash
blender --background --factory-startup --python-expr "ONLY_DECOR=['<clé>']; p='map-src/CampusCove/build_farm_decor.py'; exec(open(p).read(), {'__file__': p, 'ONLY_DECOR': ONLY_DECOR})"
node front/scripts/optimize-assets.mjs decor <clé>
node front/scripts/apply-decor-collision.mjs front/public/assets/decor/<clé>/model.glb
make texture-parts
```

et ajouter la clé à la catégorie `farm` de `decor/categories.json`.

## Fichiers

| Couche | Fichiers |
|---|---|
| Blender | `build_farm_site.py` (clôture `L.fence_run`, chemins, bâtiments du fichier de zone via `lib_buildings.zone_buildings`), `lib_common.zone_decor` (champs et décors cuits), `build_grocery_items.py` (`FARM` : modèles `make model` importés, colorés par `L.project_ref_image`) |
| Assets | `park/farm_site/`, `items/farm/{corn,potato,cabbage,pumpkin,corn_plant,potato_plant,egg,milk}/`, `decor/<pack>/`, `wear/<pack>/`, `crops/crops.json`, `zones/farm.json`, `world.manifest.json` (zone `farm` + `crops`) |
| API | `FarmService`, `FarmController`, `FarmRejectedException`, route realtime `POST /api/farm/pick`, `FoodCatalog` (`farm_corn`, `farm_potato`, `farm_cabbage`, `farm_pumpkin`), `tests/Feature/FarmApiTest.php` |
| Socket | `socket/src/farm.ts` (+ test), `world.ts` (`parseCropPlants`), `CityRoom.ts`, `farmPick` du joueur |
| Front | `game/crops/crops.ts` (+ test), `game/farm.ts`, `composables/game/useFarm.ts`, `GameView.vue` (barre de cueillette partagée avec le verger) |

## Valeurs partagées

| Valeur | Où |
|---|---|
| Cultures `corn`, `potato`, `cabbage`, `pumpkin` → `farm_<culture>` | `crops.json`, `FarmService::CROPS`, socket `world.ts` (`CROPS`), front `Crop` |
| Cueillette **3000 ms**, 250 ms de tolérance réseau | socket `farm.ts`, front `game/farm.ts` (`PICK_MS`) |
| Portée d'un plant **2 m** (invite à 1,6 m) | socket `PLANT_REACH`, front `PLANT_KEEP_REACH` / `PLANT_PROMPT_REACH` |
| Intervalle minimum **2500 ms** entre deux cueillettes, toutes cultures | `FarmService::MIN_PICK_INTERVAL_MS` |

La culture vient du plant côté socket, jamais du client. L'index d'un plant est sa place dans `manifest.crops`.

## Messages

| Client → socket | Socket → API | Réponse |
|---|---|---|
| `farm_pick_start { plant }` | — | `farm_error` si plant inconnu ou trop loin |
| `farm_pick` (après 3 s) | `POST /api/farm/pick { crop }` | `farm_picked { code, quantity }` |

Codes : `farm_unknown_plant`, `farm_too_far`, `farm_not_picking`, `farm_too_fast`, `farm_pick_failed` (socket) ;
`pick_too_fast`, `basket_full` (API).

## Reconstruire

```bash
make model "a single tall corn plant with green leaves and two yellow corn cobs" HEIGHT=1.9 TRIS=700
blender --background --factory-startup --python-expr "ONLY_ITEMS=['corn_plant']; p='map-src/CampusCove/build_grocery_items.py'; exec(open(p).read(), {'__file__': p, 'ONLY_ITEMS': ONLY_ITEMS})"
node front/scripts/optimize-assets.mjs items farm
npm --prefix front run zone:bake -- farm
```

Les dossiers `out/ai/<slug>/` de chaque modèle sont dans `FARM` de `build_grocery_items.py`.

## Points ouverts

- Les œufs et le lait ne se récoltent pas encore : le fermier ne les achète pas.
- Pas d'accès aménagé depuis le verger : on traverse sa lisière sud jusqu'à la porte.
