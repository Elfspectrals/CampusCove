# Cove Farm — la ferme

Zone `farm` au sud du verger (`x -42,6 → -2`, `z -200 → -130`), entrée par la porte nord à `x = -8,5` depuis le verger.
Une maison de fermier, une grange (fermées, sans intérieur) et deux champs où l'on cueille. Le décor de la ferme se
pose dans l'éditeur de zone ([MALL_EDITOR.md](MALL_EDITOR.md#décorer-une-zone-du-monde-ouvert)).

## Fichiers

| Couche | Fichiers |
|---|---|
| Blender | `map-src/CampusCove/build_farm_site.py` (kit `lib_kit` pour maison et grange, `L.fence_run`, plants de maïs et de pommes de terre instanciés), `build_grocery_items.py` (`FARM` : `corn`, `potato`) |
| Assets | `park/farm_site/`, `items/farm/{corn,potato}/`, `town/town.collision.json` (`COL_Farm_*`), `world.manifest.json` (zone `farm` + section `farm.fields`) écrits par `front/scripts/apply-farm.mjs` |
| API | `FarmService`, `FarmController`, `FarmRejectedException`, route realtime `POST /api/farm/pick`, `FoodCatalog` (`farm_corn`, `farm_potato`), `tests/Feature/FarmApiTest.php` |
| Socket | `socket/src/farm.ts` (+ test), `world.ts` (`parseFarm`), `CityRoom.ts`, `farmPick` du joueur |
| Front | `front/src/game/farm.ts` (+ test), `composables/game/useFarm.ts`, `GameView.vue` (barre de cueillette partagée avec le verger) |

## Valeurs partagées

| Valeur | Où |
|---|---|
| Cultures `corn` → `farm_corn`, `potato` → `farm_potato` | `FarmService::CROPS`, socket `world.ts` (`CROPS`), front `Crop` |
| Champs `farm.fields[] {crop, minX, maxX, minZ, maxZ}` | `build_farm_site.py` (`FIELDS`) → `world.manifest.json` |
| Cueillette **3000 ms**, 250 ms de tolérance réseau | socket `farm.ts`, front `game/farm.ts` (`PICK_MS`) |
| Le joueur est **dans** le champ (le socket tolère 0,5 m de bord) | socket `FIELD_MARGIN`, front `fieldAt` |
| Intervalle minimum **2500 ms** entre deux cueillettes, toutes cultures | `FarmService::MIN_PICK_INTERVAL_MS` |

La culture vient du champ côté socket, jamais du client.

## Messages

| Client → socket | Socket → API | Réponse |
|---|---|---|
| `farm_pick_start { field }` | — | `farm_error` si champ inconnu ou joueur hors du champ |
| `farm_pick` (après 3 s) | `POST /api/farm/pick { crop }` | `farm_picked { code, quantity }` |

Codes : `farm_unknown_field`, `farm_too_far`, `farm_not_picking`, `farm_too_fast`, `farm_pick_failed` (socket) ;
`pick_too_fast`, `basket_full` (API).

## Reconstruire

```bash
npm --prefix front run zone:bake -- farm
blender --background --factory-startup --python-expr "ONLY_ITEMS=['corn','potato']; p='map-src/CampusCove/build_grocery_items.py'; exec(open(p).read(), {'__file__': p, 'ONLY_ITEMS': ONLY_ITEMS})"
node front/scripts/optimize-assets.mjs items farm
```

## Points ouverts

- Pas de vente des récoltes au fermier (seulement la cueillette).
- Pas d'accès aménagé depuis le verger : on traverse sa lisière sud jusqu'à la porte.
