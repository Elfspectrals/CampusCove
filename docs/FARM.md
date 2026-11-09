# Cove Farm — la ferme

Zone `farm` au sud du verger (`x -42,6 → -2`, `z -200 → -130`), entrée par la porte nord à `x = -8,5` depuis le verger.
Une maison de fermier et une grange (fermées, sans intérieur) ; les champs et le décor se posent dans l'éditeur de zone
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

## Fichiers

| Couche | Fichiers |
|---|---|
| Blender | `build_farm_site.py` (maison et grange en kit `lib_kit`, clôture `L.fence_run`, chemins), `lib_common.zone_decor` (champs et décors cuits), `build_grocery_items.py` (`FARM` : modèles `make model` importés, colorés par `L.project_ref_image`) |
| Assets | `park/farm_site/`, `items/farm/{corn,potato,cabbage,pumpkin,corn_plant,potato_plant}/`, `crops/crops.json`, `zones/farm.json`, `world.manifest.json` (zone `farm` + `crops`) |
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

- Pas de vente des récoltes au fermier (seulement la cueillette).
- Pas d'accès aménagé depuis le verger : on traverse sa lisière sud jusqu'à la porte.
