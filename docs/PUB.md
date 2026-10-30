# The Salty Shamrock — pub irlandais

Contrat partagé entre les quatre couches (Blender, API Laravel, socket Colyseus, front Three.js/Vue). Toute valeur
qui doit être identique dans deux couches est listée ici ; le code ne porte pas de commentaire pour la rappeler.

Décisions produit (validées le 29/10/2026) :

- Grand pub au fond, **au-delà de la clôture du Cove Pond, côté est** (loin du centre) ; un chemin décoré y mène depuis
  une nouvelle porte dans la clôture du parc. On y va pour l'ambiance : feu de cheminée, bar en L, tables, box, recoin
  fléchettes, « mètre de shots », toilettes, jardin à bière, et un salon caché au sous-sol, derrière le videur.
- Boissons alcoolisées (stout, lager, vin rouge, whisky, vodka) avec un verre différent chacune. Commande au comptoir
  (instantané) ou au barman PNJ (il tire la pinte ~3 s, le verre glisse jusqu'au point de service, on le ramasse).
- Ivresse (0..100) côté serveur : pompette ≥ 30 (léger tangage), ivre ≥ 60 (fort tangage, flou, marche ralentie
  visuellement), **black-out à 100** : écran noir « You blacked out… », réveil dans un lit de la Cove Clinic, facture
  de 40 coins, rien de perdu, ivresse remise à 30 (gueule de bois qui se dissipe).
- Mini-jeux : **Drink Fast** (barre d'équilibre maintien/relâche d'un seul bouton, solo contre le chrono ou course
  entre les joueurs assis au bar, ouverte à tous ou en défiant un voisin de tabouret ; trop pencher le verre le renverse,
  +2 s par renversement ; chaque pinte se vide côte à côte à l'écran, les autres voient les coureurs lever leur
  pinte et un tableau des scores au-dessus du bar), **Meter Shot** (vider 10 shots le plus vite possible en cliquant), **Darts** (visée
  avec tangage, 3 fléchettes chacun, chacun son tour, meilleur total). Récompenses en coins par l'API.
- S'asseoir sur n'importe quel siège du pub (tabourets, chaises, banquettes, fauteuils, bancs du jardin), visible par
  les autres joueurs.
- Cabaret caché : une porte banale « CELLAR » (fûts et caisses à côté) gardée par le videur. Lui parler ouvre une
  boîte de dialogue avec un champ texte ; la phrase de la semaine (aujourd'hui « Paris wiener ») ouvre la porte 20 s.
  Derrière : palier, réserve, puis un escalier droit le long du mur du fond qui descend au sous-sol (sol 3,2 m
  plus bas). Dedans : le salon rouge d'origine agrandi, moquette rouge
  sombre, rideaux de velours, douze panneaux de lumière rouge, scène à liseré néon rose avec barre chromée (décor),
  néon cœur, deux causeuses en velours face à la scène, table miroir et seau à champagne, petit bar en acajou.
- Sans la phrase, passer la porte ouverte par un autre joueur ne marche pas : le videur s'interpose, repousse le
  joueur ~1 m devant lui et lance « Not without the word, pal. »
  Suggestif, jamais explicite.

## 1. Fichiers et propriétaires

| Couche | Fichiers |
|---|---|
| Blender | `map-src/CampusCove/build_pub.py` (intérieur + PNJ + `Door_Secret`), `build_pub_ext.py`, `build_pub_site.py` (chemin, jardin, décor, points monde), `build_drink_items.py` (5 verres), `build_pond.py` (porte est dans la clôture + encoche dans la crête), `front/scripts/apply-pub.mjs`, `front/scripts/skins/clips.py` (clip `Sit`), `front/public/assets/**`, `docs/ASSETS_STYLE_GUIDE.md` §12 |
| API | `backend/**` : migration `alcohol_per_portion`, `FoodCatalog` (groupe `drinks`), `PubController` + `PubService`, `/survival/hangover`, `tests/Feature/PubApiTest.php` |
| Socket | `socket/src/pub.ts`, `socket/src/pubGames.ts`, `socket/src/pubConstants.ts`, `socket/src/darts.ts` (+ tests), retouches `world.ts`, `types.ts`, `players.ts`, `movement.ts`, `survival.ts`, `survivalStats.ts`, `CityRoom.ts` |
| Front A | `front/src/**` sauf la liste Front B : catalogue, manifeste, `game/pub/seats.ts`, `game/pub/intoxication.ts`, composables `useSeats`, `usePub`, `usePubGames`, `useIntoxication`, composants `GamePubMenu.vue`, `GamePubSecretDialog.vue`, `GameDrunkEffects.vue`, câblage `GameView.vue`, `useGameRealtime.ts`, `types/gameRealtime.ts`, `gameRoomConstants.ts` |
| Front B | **nouveaux fichiers uniquement** : `front/src/game/pub/drinkFast.ts`, `darts.ts`, `meterShot.ts` (+ `*.test.ts`), `front/src/components/game/GameDrinkFast.vue`, `GameMeterShot.vue`, `GameDarts.vue` |

## 2. Assets

Clé bâtiment `pub`, nom `The Salty Shamrock`, métier `barman`, `kind: 'work'` (comme la clinique).

```
front/public/assets/work/pub/{interior.glb, interior.collision.json, interior.layout.json, exterior.glb,
                              exterior.collision.json, exterior.layout.json, lightmap.jpg, preview.png}
front/public/assets/park/pub_site/{pub_site.glb, pub_site.collision.json, pub_site.layout.json}
front/public/assets/items/drinks/<asset>/{model.glb, preview.png}   asset ∈ stout, lager, red_wine, whisky, vodka
front/public/assets/sfx/pub/{pour.mp3, glass_down.mp3, dart_hit.mp3, clink.mp3, ambience.mp3}  (optionnel, Earshot)
```

### Intérieur (`build_pub.py`, coordonnées locales : mètres, sol y=0, porte d'entrée en z≈+5, salles vers -Z)

Coque `walk_in_shell` plus large et plus profonde que la clinique (≈ 20 m × 20 m, `interior_back` ≈ -15), ≤ 12 000
triangles. Pierre apparente + poutres sombres, bois foncé, vert bouteille et laiton, lampes style Tiffany, panneaux
de nœuds celtiques, blason à la harpe, photos encadrées (cf. images d'inspiration : pub en pierre avec cheminée, bar
sombre en L avec tireuses chromées, tabourets à assise verte).

Noms de nœuds que le code lit :

| Nœud | Rôle |
|---|---|
| `NPC_Bartender` | barman derrière le bar (mesh statique, même facture que `NPC_Nurse`) ; le front le fait pivoter vers les tireuses pendant le service |
| `NPC_Bouncer` | videur devant la porte du personnel |
| `Door_Secret` | porte à charnière (`hinged_door`) de la porte du personnel, fermée par défaut ; le front l'ouvre (rotation) quand le serveur le dit. Sa boîte de collision s'appelle `COL_Door_Secret` et le front la désactive porte ouverte |
| `Dartboard` | cible, bull à 1,73 m du sol |
| `ShotPlank` | planche d'un mètre avec 10 verres à shot `Shot_01..10` (enfants, pour les cacher un à un) |
| `Tap_01..03` | tireuses sur le bar |
| `Bell` | cloche « last orders » au-dessus du bar |
| `seat_<kind>_NN` | un mesh par siège, pivot au sol sous le siège |

`interior.layout.json` (en plus de `spawn`, `exit`, `stations`) :

```jsonc
{
  "npcs": { "bartender": [x, 0, z], "bouncer": [x, 0, z] },
  "bartenderYaw": 0.0,
  "counter": [x, 0, z],              // où se tient le client pour commander sans le PNJ (côté client du bar)
  "taps": [x, 1.05, z],              // où le verre se remplit (dessus du bar, côté barman)
  "serve": [x, 1.05, z],             // où le verre plein attend d'être ramassé (dessus du bar, côté client)
  "bell": [x, 1.9, z],
  "secretDoor": { "position": [x, 0, z], "yaw": 0.0 },
  "secretRoom": { "minX": .., "maxX": .., "minZ": .., "maxZ": .. },   // enclos palier + escalier, en local
  "basement": { "minX": .., "maxX": .., "minZ": .., "maxZ": .., "floorY": -3.2 },   // cave, en local
  "levels": [ { "id": "L0", "y": 0, ... }, { "id": "B1", "y": -3.2, ... } ],   // même format que les maisons à étage
  "stairs": [ { "name": "Stair_Cellar", ..., "y0": -3.2, "y1": 0, "rise": "-x" } ],
  "seats": [ { "id": "stool_01", "kind": "stool", "position": [x, 0.72, z], "yaw": 1.5708 }, ... ],
  "darts": { "board": [x, 1.73, z], "boardYaw": 0.0, "oche": [x, 0, z] },
  "shots": { "plank": [x, 1.05, z], "yaw": 0.0, "player": [x, 0, z] }
}
```

- `seats[].position` = dessus de l'assise (où les hanches se posent) ; `yaw` = direction regardée assis
  (0 = vers -Z, même convention que les stations). `kind` ∈ `stool` (6 tabourets au bar, `stool_01..06`,
  seuls sièges valables pour Drink Fast), `chair`, `bench`, `armchair`, `sofa` (salon caché : `sofa_*`),
  `garden` (jardin, dans `pub_site`). Au moins 30 sièges au total.
- `darts.oche` = pieds du joueur à 2,37 m du mur de la cible, face à elle. `darts.boardYaw` = direction de la
  normale de la cible (vers la salle).
- `shots.player` = pieds du joueur face à la planche.
- Toilettes : deux pièces au fond (« LADS », « LASSES ») avec cabines, lavabos, miroirs ; pas de logique.

### Extérieur et site

`build_pub_ext.py` : même contrat que `build_clinic_ext.py` (`exterior.layout.json` avec `footprint`,
`footprintCenterZ`, `doorLocal`, `interiorOffset`, `collision`). Façade pierre + boiseries vert bouteille, lettrage
doré « THE SALTY SHAMROCK », enseigne suspendue au trèfle, lanternes, tonneaux, bancs, ≤ 2 500 triangles.

`build_pub_site.py` → `park/pub_site` : porte dans la clôture du Cove Pond côté est (vers `x ≈ 32`, sur le cercle
`r = 79.6`), encoche dans la crête de sapins, chemin de ~80 m en dalles/gravier qui serpente jusqu'au pub placé vers
`(90, -130)` (porte tournée vers l'arrivée), **décoré sur toute sa longueur** : lanternes, murets de pierre sèche,
tonneaux, panneaux « THE SALTY SHAMROCK → », pont en bois sur un petit ruisseau, arbres (sorbiers, chênes), haies,
statue de lutin, bancs, puis un **jardin à bière** devant le pub (tables de pique-nique `seat_garden_NN`, guirlandes
lumineuses, parasols). Le fichier `pub_site.layout.json` reprend la forme de `clinic_site.layout.json` : `bounds`,
`gate`, `pub` (bâtiment `kind: 'work'`), `collision`, et `points` = toutes les entrées de la section 3 du layout
intérieur **converties en coordonnées monde** (positions, yaw et bornes de `secretRoom` tournés par `rotationY`).

`front/scripts/apply-pub.mjs` (idempotent, comme `apply-clinic.mjs`) : découpe la porte dans la clôture/crête du
pond si ce n'est pas déjà fait par `build_pond.py`, fusionne les collisions `COL_Pub_*`, écrit la zone `pub` et
`manifest.pub = site.points` dans `world.manifest.json`, étend `manifest.bounds`.

### Verres (`build_drink_items.py` → `items/drinks/<asset>`)

| Code | Asset | Verre |
|---|---|---|
| `drink_stout` | `stout` | pinte droite, liquide quasi noir, col de mousse crème |
| `drink_lager` | `lager` | pinte, liquide doré translucide, mousse blanche |
| `drink_red_wine` | `red_wine` | verre à vin à pied, rouge grenat |
| `drink_whisky` | `whisky` | tumbler bas, ambré, un glaçon |
| `drink_vodka` | `vodka` | verre à shot, transparent |

Même contrat que `build_food_items.py` (pivot, taille en main, `preview.png`, ~300 triangles).

### Pose assise

`front/scripts/skins/clips.py` : clip `Sit` (pose fixe, 60 frames : hanches descendues d'environ 0,45 m, cuisses à
l'horizontale, genoux pliés à 90°, mains sur les cuisses), généré pour les trois skins **et** le corps de base
(`run_wear.py`). Le front joue `Sit` sur un avatar assis ; si le GLB n'a pas le clip, il descend l'avatar et garde
`Idle`. `npm run skins:check` doit rester vert.

## 3. Manifeste de monde

`world.manifest.json` :

```jsonc
"zones": [ ..., { "key": "pub", "optional": true, "bounds": {...}, "modelUrl": "/assets/park/pub_site/pub_site.glb",
                  "gate": { "x": .., "z": .., "width": .. },
                  "buildings": [ { "kind": "work", "key": "pub", "name": "The Salty Shamrock", "job": "barman",
                                   "position": [..], "rotationY": .., "door": [..], "footprint": [..], "interiorOffset": [..] } ] } ],
"pub": {
  "bartender": [x, y, z], "bartenderYaw": 0.0, "bouncer": [x, y, z],
  "counter": [x, y, z], "taps": [x, y, z], "serve": [x, y, z], "bell": [x, y, z],
  "secretDoor": { "position": [x, y, z], "yaw": 0.0 },
  "secretRoom": { "minX": .., "maxX": .., "minZ": .., "maxZ": .. },
  "basement": { "minX": .., "maxX": .., "minZ": .., "maxZ": .., "floorY": y },   // optionnel
  "seats": [ { "id": "stool_01", "kind": "stool", "position": [x, y, z], "yaw": 0.0 }, ... ],
  "darts": { "board": [x, y, z], "boardYaw": 0.0, "oche": [x, y, z] },
  "shots": { "plank": [x, y, z], "yaw": 0.0, "player": [x, y, z] }
}
```

Lu par `front/src/game/world/worldManifest.ts` (`WorldManifest['pub']`, type `PubLayout`) et `socket/src/world.ts`
(`worldPub()`), qui lève une erreur explicite si une entrée manque.

## 4. API Laravel

### Boissons

Migration : colonne `alcohol_per_portion` (smallint, défaut 0) sur `item_defs`, écrite par `ShopSeeder::food` /
`foodColumns`. `FoodCatalog::item` gagne un paramètre `alcohol` (défaut 0), groupe `drinks` :

| Code | Nom | Portions | Soif / portion | Alcool / portion | Prix |
|---|---|---|---|---|---|
| `drink_stout` | Pint of Stout | 3 | 8 | 8 | 25 |
| `drink_lager` | Pint of Lager | 3 | 8 | 7 | 22 |
| `drink_red_wine` | Red Wine | 2 | 4 | 10 | 30 |
| `drink_whisky` | Whisky | 1 | 0 | 25 | 40 |
| `drink_vodka` | Vodka Shot | 1 | 0 | 25 | 35 |

`SurvivalService::consume` renvoie en plus `alcohol` (int). Ces boissons ne doivent **pas** apparaître au Campus
Cafe : le front filtre par préfixe de code (`drink_`), l'API ne change rien au catalogue du café.

### Endpoints (groupe `auth:sanctum` + `account.active`, mêmes conventions que `/survival/*`)

| Route | Corps | Effet | Réponse |
|---|---|---|---|
| `POST /pub/order` | `{ code }` | débite le prix de la boisson (ledger `pub_order`), donne 1 exemplaire | `{ code, price, balance_after }` ; rejets `unknown_drink` (404), coins insuffisants (code existant des achats) |
| `POST /pub/play` | `{ game }` | débite le droit d'entrée (ledger `pub_play`) : `drink_fast` 20, `meter_shot` 35, `darts` 10 | `{ game, fee, alcohol, balance_after }` avec `alcohol` : `drink_fast` 24, `meter_shot` 50, `darts` 0 ; rejet `unknown_game` (422) |
| `POST /pub/reward` | `{ game, placement, score }` | crédite via `CoinRewardService` selon le barème ; **un gain par jeu et par compte toutes les 60 s**, sinon `coins: 0, cooldown: true` (200, pas d'erreur) | `{ coins, cooldown, balance_after }` |
| `POST /survival/hangover` | — | facture 40 coins (ou tout le solde s'il est inférieur, comme l'hôpital), ledger `hangover`, **ne retire rien d'autre** | `{ billed, balance_after }` |

Barème de `POST /pub/reward` (`placement` : 1, 2, 3 ou 0 = solo ; `score` = ms pour Drink Fast et Meter Shot,
points pour Darts) :

| Jeu | Coins |
|---|---|
| `drink_fast` | 1er 40, 2e 15, solo 15 si `score` < 20 000 ms, sinon 0 |
| `meter_shot` | `score` < 6 000 ms → 30 ; < 9 000 → 15 ; sinon 0 |
| `darts` | 1er 30 (+20 si `score` ≥ 100) ; solo 10 si `score` ≥ 60 |

Tests `PubApiTest` : commande OK et solde, boisson inconnue, coins insuffisants, droit d'entrée, barème et cooldown,
facture de gueule de bois sans perte d'objets.

## 5. Socket Colyseus

Nouveaux champs `Player` : `seatId: string | null`, `intoxication: number` (0..100), `pubSecretUntil: number`,
`pubShots: { startedAt: number, seed: number } | null`. `publicPlayer` expose `seatId`.

Constantes (`socket/src/pubConstants.ts`, miroir côté front dans `gameRoomConstants.ts`) :

| Nom | Valeur |
|---|---|
| `SEAT_REACH` | 2.5 m (XZ, du joueur au siège) |
| `COUNTER_REACH` / `BOUNCER_REACH` | 2.6 m |
| `BARTENDER_REACH` | 3.6 m (tous les tabourets du bar restent à portée du barman) |
| `POUR_MS` | 3000 |
| `SECRET_PHRASES` | `['paris wiener']`, rotation hebdomadaire (comparaison après `trim`, minuscules, espaces multiples réduits) |
| `SECRET_OPEN_MS` | 20 000 |
| `INTOXICATION_MAX` | 100 ; black-out à ≥ 100, retombe à `HANGOVER_INTOXICATION` = 30 au réveil |
| `INTOXICATION_DECAY_PER_S` | 1/6 (× `SURVIVAL_TIME_SCALE`) |
| `RACE_LOBBY_MS` | 5000 ; `RACE_TIMEOUT_MS` 45 000 ; `RACE_MAX_PROGRESS_PER_S` 0.125 (finir en 8 s au plus vite) ; `RACE_PROGRESS_MIN_INTERVAL_MS` 200 |
| `SHOTS_MIN_MS` | 1500 (10 × 150 ms) ; tolérance : `ms` entre `elapsed − 1500` et `elapsed + 500` |
| `DARTS_LOBBY_MS` | 8000 ; `DARTS_TURN_MS` 20 000 ; `DARTS_MAX_PLAYERS` 4 ; `DARTS_THROWS` 3 ; `DARTS_MAX_OFFSET_CM` 25 |

### Messages client → serveur

| Message | Payload | Règles serveur |
|---|---|---|
| `sit` | `{ seatId }` | siège connu, libre, à `SEAT_REACH`, joueur dans la zone du pub (`work:pub`), ni KO ni en récupération ; pose `player.seatId`, téléporte le joueur sur le siège (x, z du siège, y = `seat.y − 0.72 + 1.6` pour que l'œil soit à `seat.y + 0.88`) |
| `stand` | — | libère le siège. Un `move` reçu assis vaut `stand` |
| `pub_order` | `{ code, via: 'counter' \| 'bartender' }` | `code` ∈ boissons, à portée du point correspondant ; appelle `POST /pub/order` avec le token du joueur ; `bartender` → broadcast `pub_pouring` puis `pub_served` après `POUR_MS` ; `counter` → `pub_served` immédiat |
| `pub_secret` | `{ phrase }` | à portée du videur ; bonne phrase → `pubSecretUntil = now + SECRET_OPEN_MS`, `pub_secret_result { ok: true, untilMs }`, broadcast zone `pub_secret_door { open: true }`, puis `{ open: false }` quand plus personne n'a d'accès en cours ni ne se trouve dans `secretRoom` (re-vérifié toutes les 5 s tant que quelqu'un y est, pour ne jamais enfermer un joueur) ; mauvaise → `pub_secret_result { ok: false }` |
| `pub_bell` | — | à portée du bar, 10 s de cooldown par joueur ; broadcast zone `pub_bell { sessionId }` |
| `pub_race_open` | — | assis sur `stool_*`, aucune course en cours dans la salle ; `POST /pub/play` ; crée la course (`startsAt = now + RACE_LOBBY_MS`, `seed`), broadcast zone `pub_race_lobby` |
| `pub_race_join` | — | course en lobby, assis sur `stool_*` ; `POST /pub/play` ; rebroadcast `pub_race_lobby` |
| `pub_race_leave` | — | le joueur ferme l'écran de course : forfait immédiat (comme se lever), la course se termine si plus personne ne court |
| `pub_race_progress` | `{ progress, spills }` | course lancée, joueur inscrit, au plus un toutes les `RACE_PROGRESS_MIN_INTERVAL_MS` ; `progress` borné à `précédent + RACE_MAX_PROGRESS_PER_S × dt` ; ≥ 1 = arrivé ; `spills` (verre trop penché au-dessus des bandes) ne fait que monter, plafonné à `RACE_MAX_SPILLS` ; chaque renversement ajoute `RACE_SPILL_PENALTY_MS` (2 s) au temps final, le classement `pub_race_end` est trié sur ce temps corrigé |
| `pub_race_challenge` | `{ targetSessionId }` | les deux sur un tabouret, à ≤ `CHALLENGE_REACH` (4 m) au même étage, aucune course ouverte, aucun défi en attente, un défi par joueur toutes les 5 s ; défi valable 15 s ; codes d'erreur `challenge_*` / `race_in_progress` |
| `pub_race_challenge_reply` | `{ fromSessionId, accept }` | le joueur défié ; accepter ouvre une course à deux (chacun paie l'entrée) avec 3 s de compte à rebours, d'autres joueurs assis peuvent encore rejoindre |
| `pub_shots_start` | — | à 2,5 m de `shots.player`, pas de partie en cours ; `POST /pub/play` ; `pub_shots_ready { seed, startedAt }` |
| `pub_shots_done` | `{ ms }` | partie en cours, `ms` plausible (voir constantes) ; ajoute l'alcool, `POST /pub/reward`, `pub_shots_result { ms, coins }`, broadcast `user_action { action: 'drink', code: 'drink_vodka' }` |
| `pub_darts_join` | — | à 3 m de `darts.oche`, partie en lobby ou aucune, < `DARTS_MAX_PLAYERS` ; `POST /pub/play` ; lobby de `DARTS_LOBBY_MS` après la première inscription |
| `pub_darts_throw` | `{ x, y }` | c'est son tour, il lui reste des fléchettes, `|x|,|y| ≤ DARTS_MAX_OFFSET_CM` (cm depuis le bull) ; score par `dartsScore(x, y)` ; tour suivant ; tour non joué en `DARTS_TURN_MS` = fléchette perdue (0) |

### Messages serveur → client

| Message | Payload | Audience |
|---|---|---|
| `user_seated` | `{ sessionId, seatId: string \| null }` | visibles (zone) ; `user_joined` porte aussi `seatId` |
| `survival` | gagne `intoxication: number` | joueur |
| `survival_knocked_out` | gagne `cause: 'health' \| 'alcohol'` | joueur |
| `survival_hospital_bill` | gagne `cause`, `lostItems`/`lostClothes` = 0 pour l'alcool | joueur |
| `pub_pouring` | `{ sessionId, code, durationMs }` | zone (émetteur inclus) |
| `pub_served` | `{ code }` | joueur |
| `pub_error` | `{ message, code }` (`errorPayload`) | joueur |
| `pub_secret_result` | `{ ok, untilMs? }` | joueur |
| `pub_secret_door` | `{ open }` | zone |
| `pub_bouncer_block` | `{ sessionId, accountId, line }` | zone (joueur repoussé inclus) |
| `pub_bell` | `{ sessionId }` | zone |
| `pub_race_lobby` | `{ hostSessionId, players: string[], startsAt }` | zone |
| `pub_race_start` | `{ seed, players: string[] }` | zone |
| `pub_race_state` | `{ players: [{ sessionId, progress, spills }] }` | zone, ≤ 5 Hz, immédiat quand un `spills` monte |
| `pub_race_end` | `{ ranking: [{ sessionId, ms, spills }], rewards: [{ sessionId, coins }] }` (`ms` pénalités incluses) | zone |
| `pub_race_challenged` | `{ fromSessionId, expiresAt }` | joueur défié |
| `pub_race_challenge_sent` | `{ toSessionId, expiresAt }` | joueur qui défie |
| `pub_race_challenge_result` | `{ toSessionId, accepted, reason?: 'declined' \| 'expired' \| 'busy' \| 'cancelled' }` | joueur qui défie |
| `pub_race_challenge_cancelled` | `{ fromSessionId }` | joueur défié (expiration, ou le joueur qui défie s'est levé / est parti) |
| `pub_shots_ready` / `pub_shots_result` | voir ci-dessus | joueur |
| `pub_darts_lobby` | `{ players: string[], startsAt }` | zone |
| `pub_darts_state` | `{ players: [{ sessionId, darts: [{ x, y, score }], total }], turn: sessionId \| null, throwsLeft, turnEndsAt }` | zone |
| `pub_darts_end` | `{ ranking: [{ sessionId, total }], rewards: [{ sessionId, coins }] }` | zone |

### Règles communes

- Ivresse : `applyPortion` ajoute `alcohol` ; `tickSurvival` fait décroître `intoxication` ; à ≥ 100, `blackOut`
  = même séquence que `knockOut` (KO 6 s, réveil dans un lit de la clinique, 5 s de récupération) mais appelle
  `POST /survival/hangover` et remet `intoxication` à 30. Les jeux et commandes en cours sont abandonnés.
- Un joueur assis qui bouge, se fait KO ou quitte la salle libère son siège et abandonne la course Drink Fast.
- Volume secret = `pub.secretRoom` (XZ, toute hauteur) ∪ `pub.basement` quand les pieds sont à plus de 1 m sous le
  sol du bar (hauteur de seuil de `secretDoor`). `moveRejection` refuse d'**entrer** dans ce volume si
  `now > pubSecretUntil` ; en sortir (remonter l'escalier) est toujours permis. Un refus repousse le joueur ~1 m
  devant le videur (`position_correction`) et diffuse `pub_bouncer_block` (au plus une fois toutes les 2 s par joueur).
- Toutes les portées du pub (comptoir, cloche, videur, jeux, sièges) vérifient aussi la hauteur : rien ne traverse
  le plancher entre le bar et la cave.
- Phrase : `currentSecretPhrase(now)` prend `SECRET_PHRASES[semaines depuis le lundi 2024-01-01 00:00 UTC % n]`.
  La liste ne contient que `paris wiener` pour l'instant ; ajouter des phrases suffit à les faire tourner chaque
  semaine (indices cachés dans le pub : à faire).
- Récompenses : le socket appelle `POST /pub/reward` avec le token de chaque joueur concerné, puis diffuse le
  résultat. L'alcool des jeux (`alcohol` renvoyé par `/pub/play`) est ajouté à la fin de la partie, pas au début.
- `dartsScore(x, y)` (cm depuis le centre, y vers le haut) : bull 50 si `r ≤ 0.635`, 25 si `r ≤ 1.59`, triple si
  `9.9 ≤ r ≤ 10.7`, double si `16.2 ≤ r ≤ 17.0`, 0 si `r > 17.0` ; secteurs de 18° dans le sens horaire depuis le haut :
  20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5. Même fonction (et mêmes tests) côté front.

## 6. Front

### Catalogue et manifeste (Front A)

- `catalog.ts` : `WorkKey` + `'pub'`, `WorkJob` + `'barman'`, `work('pub', 'The Salty Shamrock', 'barman')`,
  `CONSUMABLE_FOLDERS` + `['drink_', 'drinks']`, `isAlcoholItem(code)` = préfixe `drink_` dans
  `utils/itemShopPresentation.ts` ; le Campus Cafe exclut ces articles.
- `worldManifest.ts` : `PubLayout` et `WorldManifest['pub']`.
- `gameRoomConstants.ts` : miroir des constantes de la section 5 utiles au client (`SEAT_REACH`,
  `COUNTER_REACH`, `POUR_MS`, `SECRET_OPEN_MS`, `RACE_MAX_PROGRESS_PER_S`, `DARTS_MAX_OFFSET_CM`, seuils
  d'ivresse `TIPSY_AT` 30 / `DRUNK_AT` 60).

### Logique pure `front/src/game/pub/` (testée avec `node:test`)

- `seats.ts` (A) : `nearestFreeSeat(position, seats, occupied)`, `SEATED_EYE_ABOVE_SEAT` = 0.88, `seatCameraYaw`.
- `intoxication.ts` (A) : `intoxicationStage(value)` → `'sober' | 'tipsy' | 'drunk'`, `swayAmplitude(value)` (0 à
  30 → 0, 60 → 0.012 rad, 100 → 0.03 rad de roulis, période ~3 s, plus un balancement latéral de la caméra),
  `drunkScreenEffects(value)` → `{ blur: 0..1, doubleVision: 0..1, warmth: 0..1 }`, `drunkWalkFactor(value)` (1 → 0.75).
  Respecte `reduceCameraMotion` (pas de roulis, effets d'écran seulement).
- `drinkFast.ts` (B) : simulation déterministe `createDrinkFastSim(seed)` : curseur `y ∈ [0, 1]` avec vitesse ;
  gravité constante vers le bas, poussée vers le haut tant que le bouton est maintenu, perturbations pseudo-
  aléatoires (seed → mêmes rafales pour tous les coureurs) qui s'intensifient avec le temps ; zones :
  `0.42–0.58` vert vif → boire à `RACE_MAX_PROGRESS_PER_S` (0.125/s), `0.28–0.72` vert clair → 0.07/s, `0.12–0.88`
  rouge → 0.03/s, au-delà → « glissant » : pas de progrès et commandes affaiblies (× 0.35) pendant 0.6 s.
  `step(dt, holding)` → `{ y, progress, zone }`. Entrée : `Space`, clic gauche ou touche `interact`.
- `darts.ts` (B) : `dartsScore(x, y)` (identique au socket), `aimSway(t, intoxication, seed)` → décalage (cm) du
  réticule : lissajous lente d'amplitude 1.5 cm sobre, 6 cm pompette, 12 cm ivre ; `throwOffset(aim, intoxication)`
  = petite erreur gaussienne en plus.
- `meterShot.ts` (B) : `shotLayout(seed)` (ordre d'extinction), `shotsScore(ms)` → `{ coins }` miroir du barème.

### Composables et composants

- `useSeats` (A) : prompt « Sit » sur le siège libre le plus proche (priorité après portes et comptoirs), clic
  `interact` → `sit`, toute touche de déplacement ou saut → `stand` ; caméra posée à `seat.y + 0.88` ; `user_seated`
  → l'avatar distant joue `Sit` (ou descend de 0.45 m) et est placé sur le siège.
- `usePub` (A) : prompts « Order » au comptoir et sur le barman, « Talk » sur le videur, « Ring » sur la cloche ;
  `GamePubMenu.vue` (même squelette que `GameCafeMenu.vue`, boissons `drink_` du catalogue, prix) ; à `pub_pouring`
  le barman pivote vers `taps`, un verre (modèle de la boisson) apparaît sur `taps` et se remplit (échelle y du
  liquide) pendant `durationMs`, puis glisse vers `serve` ; à `pub_served` le verre attend sur `serve`, prompt
  « Pick up » → le verre disparaît et le hotbar sélectionne l'article ; `GamePubSecretDialog.vue` : dialogue du
  videur (« You look lost, friend. ») avec champ texte, réponse `pub_secret_result` (« Mind the stairs. Don't
  tell. » / « Never heard of it. ») ; `pub_secret_door` ouvre/ferme `Door_Secret` et sa collision.
- `useIntoxication` (A) : lit `intoxication` du message `survival`, applique le roulis/balancement à la caméra
  (dans la boucle de `useGameMovement`, après le placement), `GameDrunkEffects.vue` (flou radial, double image
  légère via `filter`/calque décalé, vignette chaude), facteur de marche visuel ; black-out = réutilise
  `GameSurvivalEffects` avec `cause: 'alcohol'` → texte « You blacked out… » / « You wake up at Cove Clinic with a
  headache. Bill: 40 coins ».
- `usePubGames` (A) : état des trois jeux depuis les messages socket, envoi des messages, ouverture/fermeture des
  trois composants, bannières d'arrivée et de gains (coins) via `say`.
- Composants Front B (props/emits imposés, pas d'accès au socket ni au store) :
  - `GameDrinkFast.vue` : props `{ seed: number, players: { sessionId: string; pseudo: string; progress: number; me: boolean }[], startsAt: number, finished: boolean }`,
    emits `progress(value: number)` (≤ 5 Hz) et `close()`. Dessine la jauge verticale avec les 4 zones, le curseur,
    la pinte qui se vide, la ligne des concurrents, le compte à rebours.
  - `GameMeterShot.vue` : props `{ seed: number, startedAt: number, result: { ms: number; coins: number } | null }`,
    emits `done(ms: number)` et `close()`. Planche en vue de dessus avec 10 shots cliquables ; chrono ; au dixième
    clic émet `done`.
  - `GameDarts.vue` : props `{ players: { sessionId: string; pseudo: string; darts: { x: number; y: number; score: number }[]; total: number; me: boolean }[], turn: string | null, mySessionId: string, throwsLeft: number, turnEndsAt: number, intoxication: number, ranking: { sessionId: string; total: number }[] | null }`,
    emits `throw(x: number, y: number)` et `close()`. Cible SVG aux vraies proportions, réticule qui tangue, clic =
    lancer, fléchettes de chacun colorées, tableau des scores.

### Câblage `GameView.vue`

Minimal : instancier les composables, passer les prompts à `useInteractionTargets` (priorité : portes > comptoirs >
sièges > jeux), monter les composants, relier `onKeyDown` (`stand` sur les touches de déplacement). Pas de logique
dans la vue.

## 7. Ordre et vérification

1. Assets → `npm run assets:optimize -- work|park|items`, `node scripts/apply-pub.mjs`, skins si clip `Sit`.
2. API → `make test`, `make migrate`, `make seed-shop`.
3. Socket → `cd socket && npm run typecheck && npm test`.
4. Front → `npx vue-tsc -b`, tests `node --experimental-strip-types --test "src/**/*.test.ts"`, `npx knip`.
5. Playtest (`playtest-game`) à deux onglets : s'asseoir, commander au comptoir et au barman, boire jusqu'au
   black-out, les trois jeux, le videur et la porte secrète, un joueur hors zone ne reçoit rien.
