# Cove Orchard — le verger, premier métier

Contrat partagé entre les quatre couches (Blender, API Laravel, socket Colyseus, front Three.js/Vue). Toute valeur
qui doit être identique dans deux couches est listée ici ; le code ne porte pas de commentaire pour la rappeler.

Décisions produit (validées les 02 et 03/11/2026) :

- Premier métier du jeu : on cueille des pommes (nourriture gratuite) et on les revend au fermier, un vrai PNJ debout
  derrière son étal. C'est la première marche pour gagner de l'argent.
- Verger **derrière l'étang, à gauche** (le pub est à droite) : une porte ouest dans la clôture du Cove Pond, symétrique
  de celle du pub, puis un chemin éclairé jusqu'à l'étal et au verger clôturé de 12 pommiers.
- Cueillette **infinie, façon Altis Life** : maintenir la touche d'interaction **3 s** près d'un arbre donne une pomme.
  Relâcher la touche ou s'éloigner de l'arbre annule la cueillette.
- Prix : **3 coins** la pomme. Pas de plafond journalier (il bloquerait ceux qui veulent farmer) mais un **prix dégressif** :
  les 300 premières pommes vendues par compte sur 24 h glissantes paient 3 coins, les suivantes 1 coin.
- Intervalle minimum de **2,5 s** entre deux cueillettes, vérifié par l'API (le socket ne fait pas foi pour le temps).
- Le fermier porte une tenue en pièces modulaires (chapeau de paille, chemise à carreaux avec tablier, salopette,
  bottes), au même format que les vêtements des joueurs, pour pouvoir les vendre plus tard (règle `CLAUDE.md`).
- Modèle de la pomme : **provisoire**, copie de `items/sweets/candy_apple`. À remplacer par la pomme de l'épicerie une
  fois `feat/mall-cleanup-kit` fusionnée.

## 1. Fichiers et propriétaires

| Couche | Fichiers |
|---|---|
| Blender | `map-src/CampusCove/build_pond.py` (porte ouest, encoche dans la crête, chemin depuis la boucle, décor retiré du passage), `build_orchard_site.py` (chemin, étal, verger, abri, colliders, points monde), `front/scripts/skins/wear.py` (tenue du fermier), `front/scripts/apply-orchard.mjs` |
| Assets | `front/public/assets/park/orchard_site/`, `park/pond/`, `town/town.collision.json`, `world.manifest.json` (zone `orchard` + section `orchard`), `wear/{head_accessory/straw_hat,top/plaid_shirt,top/farm_apron,bottom/dungarees}/`, `items/farm/apple/` (provisoire) |
| API | `backend/app/Support/FoodCatalog.php` (`farm_apple`), `OrchardController`, `OrchardService`, `OrchardRejectedException`, routes `realtime` dans `routes/api.php`, `tests/Feature/OrchardApiTest.php` |
| Socket | `socket/src/orchard.ts` (+ `orchard.test.ts`), `world.ts` (`parseOrchard`), `CityRoom.ts` (4 messages), `types.ts` / `players.ts` (`orchardPick`, `lastPickStartAt`) |
| Front | `front/src/game/orchard.ts` (+ test), `composables/game/useOrchard.ts`, `components/game/GameOrchardSellMenu.vue`, `game/store/storeClerk.ts` (options `outfit` / `brighten`), `game/assets/catalog.ts` (préfixe `farm_`), `useGameRealtime.ts`, `GameView.vue`, `types/gameRealtime.ts`, `game/world/worldManifest.ts` |

## 2. Valeurs partagées

| Valeur | Où | Remarque |
|---|---|---|
| Code de l'objet `farm_apple`, groupe `farm`, asset `apple` | `FoodCatalog.php`, `front/src/game/orchard.ts` (`APPLE_CODE`), `catalog.ts` (`farm_` → `items/farm/`) | 2 bouchées de +5 faim et +2 soif chacune ; pas en boutique ; pile max 20 |
| Durée de cueillette **3000 ms** | `socket/src/orchard.ts` (`PICK_MS`), `front/src/game/orchard.ts` (`PICK_MS`) | le socket tolère 250 ms de latence |
| Intervalle minimum **2500 ms** | `OrchardService::MIN_PICK_INTERVAL_MS` | par compte, en cache |
| Portée d'un arbre **2,5 m** | socket `TREE_REACH`, front `TREE_KEEP_REACH` | le front n'affiche l'invite qu'à 2,2 m (`TREE_PROMPT_REACH`) pour ne pas se faire refuser au bord |
| Portée du fermier **3 m** | socket `FARMER_REACH` ; front 2,8 m (visée) | |
| Prix **3** / **1** coins, **300** pommes sur 24 h | `OrchardService` | front `APPLE_PRICE` pour l'affichage |
| Points `orchard.trees[]`, `orchard.farmer`, `orchard.farmerYaw` | `world.manifest.json` (écrits par `apply-orchard.mjs`) | l'index d'arbre est celui du tableau ; `farmerYaw` suit la convention caméra (0 = face à -Z), le front ajoute π pour le modèle |

## 3. Messages

| Client → socket | Socket → API | Réponse |
|---|---|---|
| `orchard_pick_start { tree }` | — (le socket note l'arbre et l'heure) | `orchard_error` si arbre inconnu, trop loin ou relancé moins de 300 ms après le précédent départ (`PICK_RESTART_MS`) ; sinon `user_picking { sessionId, picking: true }` aux autres joueurs |
| `orchard_pick_cancel` (relâché, éloigné, fenêtre quittée) | — | `user_picking { sessionId, picking: false }` aux autres joueurs ; ignoré sans cueillette en cours |
| `orchard_pick` (après 3 s) | `POST /api/orchard/pick` | `orchard_picked { code, quantity }` ; `user_picking { picking: false }` aux autres joueurs dès qu'une cueillette en cours se termine |
| `orchard_sell { quantity }` | `POST /api/orchard/sell` | `orchard_sold { sold, coins, balance_after, full_price_left }` |

Erreurs : `orchard_error { message, code }`. Codes socket : `orchard_unknown_tree`, `orchard_too_far`,
`orchard_not_picking`, `orchard_too_fast`, `orchard_pick_cooldown`, `orchard_bad_quantity`, `no_orchard`. Codes API : `pick_too_fast`,
`basket_full`, `not_enough_apples`. Une pomme entamée ne se vend pas.

`user_picking` joue le clip `Pick` (3 s, une fois) sur l'avatar distant ; `picking: false` le ramène en fondu vers
Idle / Walk / Run. Un skin sans clip `Pick` l'ignore.

## 4. Reconstruire

```bash
# Blender (MCP ou headless), dans cet ordre : build_pond.py puis build_orchard_site.py
cd front && npm run assets:optimize -- park
node scripts/apply-pond.mjs && node scripts/apply-orchard.mjs
# tenue du fermier
blender --background --factory-startup --python front/scripts/skins/run_wear.py -- previews
npm run wear:check
```

`run_wear.py` réexporte toutes les pièces : ne committer que celles qui ont changé.

## 5. Tester

- `php artisan test --filter=OrchardApiTest`, `npx tsx --test src/orchard.test.ts` (socket),
  `npm run test:unit` (front).
- En jeu : depuis le spawn, étang, boucle ouest, **passerelle sur le ruisseau (x ≈ -17,8)**, porte ouest, chemin. Face à
  l'étal (≈ -31,6 ; -94,5) l'invite « Sell apples » apparaît ; dans le verger, l'invite « Pick » à moins de 2,2 m d'un
  tronc.

## 6. Points ouverts

- Remplacer la pomme provisoire par le modèle de l'épicerie après la fusion de `feat/mall-cleanup-kit`.
- Les pièces de la tenue du fermier ne sont pas en vente.
