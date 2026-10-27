# Guide de style des assets 3D (référence pour les bâtiments métier)

Relevé fait sur les GLB existants de `front/public/assets/` (maisons 1 à 10, déco, ville).
À relire avant toute création d'asset dans Blender.

## 1. Style visuel

- **Low-poly texturé**, formes simples, bords légèrement biseautés, couleurs pastel douces.
- Textures peintes/procédurales (une par matériau, pas de couleur unie). Rugosité haute (0.85–0.95) pour tissus/murs/toits, basse (0.20–0.35) pour carrelage, marbre, verre.
- Pas de PBR complexe : uniquement base color + roughness.
- Références visuelles : `houses/house_01/preview.png` (extérieur), `decor/wooden_chair/preview.png` (meuble).

## 2. Budgets

| Type | Triangles | Remarques |
|---|---|---|
| Meuble (`decor/*`) | ~600 | 1 nœud, 2 matériaux |
| Extérieur maison | ~1 100 | 1 nœud, ~8 matériaux |
| Intérieur maison | ~5 200 | ~44 nœuds, ~20 matériaux |
| Ville | ~25 000 | 12 nœuds |

Un bâtiment métier peut aller jusqu'à ~12 000 triangles pour l'intérieur (plus grand qu'une maison), l'extérieur reste sous ~2 500.

## 3. Préfixes de matériaux

`IN_` intérieur, `EX_` extérieur, `DC_` déco, `TW_` ville. Exemple : `IN_WoodDark`, `EX_house_01_Roof`, `DC_FabricTeal`.
Les matériaux spécifiques à un bâtiment portent la clé du bâtiment (`IN_house_01_Sofa`).

## 4. Conventions d'un intérieur (contrat avec le code)

Source : `front/src/game/gameRoomConstants.ts` (doit rester synchro avec `socket/`).

- **Unité** : mètre. Sol à `y = 0`. Plafond à `y = 2.8` (dalle 2.8 → 2.9). Hauteur de pièce côté code : 3.
- **Porte d'entrée** sur le mur avant à `z = +5` (`Door_Entrance`, `Door_Entrance_Handle`, `Door_Entrance_Sign`), pièces qui s'étendent vers `-Z`.
- **Spawn d'arrivée** : `(0, 1.6, 3.7)`. **Déclencheur de sortie** : `(0, 4.75)`, rayon 1.4.
- **Emprise maison** : x ≈ -3.9 → 3.9, z ≈ -2.1 → 5.2 (~7.8 × 7.3 m).
- Nœuds standards : `House_Floor_*`, `Walls`, `Ceiling`, `Window_*` + `Window_*_Glass`, `Light_*`, `Entry_Doormat`, `Rug`, `Sky_Back/East/Front/West` (décor de ciel, ignorés par les collisions).
- **Collisions** : meshes `COL_<Nom>` (boîtes simples) dans le fichier source, extraits par `front/scripts/extract-collision.mjs` vers `interior.collision.json`. Ne jamais dépendre des collisions auto.
- Ajouter une entrée dans `front/src/game/assets/catalog.ts` et `ShopSeeder` / seeders concernés quand un asset est lié au backend.

## 5. Arborescence et export

```
front/public/assets/<type>/<clé>/
  exterior.glb  interior.glb  interior.collision.json  preview.png
```

- Les scripts de build Blender vivent dans `map-src/CampusCove/*.py`. Depuis le 2026-10-20 **seuls les `.py` sont versionnés** (`.gitignore`) ; les exports bruts (`out/`, `.blend`, `.glb`) restent ignorés. Les scripts des 10 maisons d'origine (`build_houses.py`, `build_town.py`…) sont toujours absents : seuls les bâtiments métier ont leurs scripts.
- Puis `make assets-optimize` (Draco + WebP 1024).
- Export glTF avec Y-up, échelle 1, transformations appliquées.

## 6. Bug connu : meubles enfoncés dans le sol

Mesure faite sur les 10 intérieurs (bas du mesh en `y`, le sol est à `y = 0`) :

| Meuble | Bas du mesh | Enfoncement |
|---|---|---|
| Chair (x4) | -0.450 | 45 cm sous le sol |
| CoffeeTable | -0.400 | 40 cm |
| TV (maisons 4 à 10) | -0.250 | 25 cm |
| Sofa | -0.150 | 15 cm |
| Bed | +0.025 | OK (non enfoncé) |

**Corrigé le 2026-10-20** dans les 10 `interior.glb` (objets remontés pour que leur bas soit à `y = 0`) et dans les `COL_*` correspondants de `interior.collision.json`. Les scripts de build d'origine ne sont pas versionnés : une reconstruction depuis `map-src/` réintroduirait le défaut.

Cause probable : l'origine de l'objet est placée au centre de la géométrie au lieu du bas, puis l'objet est posé à une hauteur fausse dans le script de build.

### Règles pour tous les nouveaux meubles

1. **Origine de chaque meuble au centre-bas** (pieds sur `y = 0` local).
2. Placer l'objet en `location.z = hauteur_du_sol`, jamais en `hauteur / 2`.
3. **Vérification obligatoire avant export** : `min(y)` du mesh monde ∈ `[0.000, 0.030]`, sinon corriger.
4. Les tapis/rugs sont les seuls objets autorisés à avoir un haut sous `0.015`.
5. Chaque objet interactif porte un nom stable (voir §7).

## 7. Nommage des postes de travail (bâtiments métier)

Pour permettre à un autre agent de coder les métiers :

- `seat_<zone>_<nn>` : chaise ou siège utilisable (ex. `seat_dev_01`).
- `desk_<zone>_<nn>` : plan de travail.
- `station_<métier>_<nn>` : **point d'interaction** du poste (empty placé là où se tient le joueur, orienté vers l'écran/le comptoir). C'est ce nœud que le code ciblera pour lancer le farm.
- `COL_<Nom>` : collision de chaque meuble.
- `zone_<métier>` : empty central de la zone.

Le bâtiment suit la même convention d'entrée que les maisons (porte à `z = +5`, spawn `(0, 1.6, 3.7)`).

## 8. Quartier d'affaires (bâtiments métier)

Au sud de la ville, derrière une ouverture de 12 m dans la haie (piliers « BUSINESS / DISTRICT »). On y va à pied par une avenue qui part de la place. Trois bâtiments face à une plaza ; porte tournée vers la ville (`rotationY = π`).

| Clé | Métier (`job`) | Bâtiment | Postes (`stations` dans `interior.layout.json`) | Intérieur |
|---|---|---|---|---|
| `tech_hub` | `dev` | Immeuble 2 étages verre/béton, enseigne néon | 8 × `station_dev_01..08` (bureaux doubles écrans) | Open space, salle de réunion vitrée (6 `seat_meeting_*`), salle serveurs, lounge |
| `boutique` | `commerce` | Boutique de plain-pied, auvent rayé | 3 caisses `station_commerce_01..03` + 2 conseillers `04..05` | Îlots de produits, rayonnages, portants, réserve |
| `cafe` | `resto` | Café à toit de tuiles, terrasse et parasols | 3 cuisines `station_resto_01..03`, 2 bars `04..05`, 2 passe-plats `06..07` | Salle (6 tables, `seat_diner_*`), comptoir passe-plats, bar à café |

Fichiers (`front/public/assets/work/<clé>/`) : `exterior.glb`, `interior.glb`, `interior.collision.json`, `exterior.collision.json`, `interior.layout.json`, `exterior.layout.json`, `preview.png`. Plus `work/district/{district.glb,district.layout.json}` (scenery + collisions + placements).

`interior.layout.json` : `spawn`, `exit` (`position`, `radius`), `stations[]` = `{id, job, role, desk, seat?, position:[x,0,z], yaw, lookAt}`. Le **yaw 0 regarde vers -Z** ; `position` est l'endroit où se tient le joueur. C'est ce fichier que le code des métiers doit lire (les nœuds vides n'existent pas dans le GLB : l'optimiseur les supprime).

Les types et le chargement sont dans `front/src/game/assets/catalog.ts` (`WORKS`, `WORK_DISTRICT`) et `front/src/game/roomEnvironments.ts` (placement depuis `town.layout.json` → `work`). **Entrée** : libre et gratuite, sans base de données. Le client détecte la porte via `layout.work[].door` (`game/workBuildings.ts`), envoie `enter_work {workKey}`, le socket (`onEnterWork`) met le joueur en zone `apartment` avec `workKey` (visibilité par bâtiment) et `apartment_init.workKey` charge `work/<clé>/interior.glb`. La sortie réutilise `exit_apartment` et replace le joueur devant la porte (`WORK_DOORS` dans `socket/server.js`, à garder synchro avec `town.layout.json`).

### Reconstruire

```bash
# dans Blender (via MCP), dans cet ordre :
#   exec(open(r"...\map-src\CampusCove\build_work_tech_hub.py").read())   # interieur
#   exec(open(r"...\map-src\CampusCove\build_work_tech_hub_ext.py").read())
#   build_work_boutique.py, build_work_cafe.py   (interieur + exterieur dans un seul script)
#   build_work_district.py                       # lit les exterior.layout.json
cd front
npm run assets:optimize -- work     # Draco/WebP, collisions, layouts, previews -> public/assets/work
node scripts/apply-work-district.mjs   # ouvre la haie, retire 2 arbres de l'avenue, ecrit collisions + town.layout.json
```

`apply-work-district.mjs` est idempotent. Il modifie `town.glb`, `town.collision.json` et `town.layout.json`.

### Règles supplémentaires apprises en les construisant

- Toujours utiliser `lib_common.py` : origine centre-bas, `check_grounded()` qui bloque l'export si un meuble est sous le sol, export qui n'embarque pas les autres objets de la scène Blender.
- Un poste doit laisser un couloir libre de ±1,2 m autour de l'axe porte → spawn (`x = 0`), sinon les joueurs apparaissent dans un meuble.
- Les nœuds vides (empties) ne survivent pas à `gltf-transform optimize` : mettre les points d'interaction dans le JSON de layout.

## 9. Cove Pond (étang de pêche et parc)

Au nord de la ville, derrière une ouverture de 12 m dans la haie (piliers « COVE / POND »), symétrique du quartier d'affaires. On y va à pied par une allée qui part de la route circulaire (`x ∈ [-3, 3]`, `z` de -21 à -48). Le parc occupe tout le croissant entre la haie (`r = 46.6`) et une clôture en bois (`r = 69.6`), limité à `|x| ≤ 46`, soit environ 2 500 m² où l'on peut marcher.

### Style « nature »

Mêmes règles que le reste de la ville (low-poly à facettes, textures procédurales 64 px, préfixe `TW_`), avec une palette plus douce et plus variée :

| Élément | Couleur | Rugosité |
|---|---|---|
| Prairie (`TW_PondMeadow` / `TW_PondMeadowLight`) | `#7dbb62` / `#93c96d`, en taches alternées | 1.0 |
| Collines derrière la clôture (`TW_PondHill`) | `#5f9e55` | 1.0 |
| Berge sable (`TW_PondSand`) / fond de l'eau (`TW_PondBed`) | `#d9c89a` / `#5d7a5a` | 0.95 |
| Eau (`TW_PondWater`) | `#4fa9c8`, animée côté front | 0.12 |
| Sentier (`TW_PondPath`) | `#cdb994` | 0.95 |
| Feuillages (`TW_LeafPond*`, `TW_PineNeedles`, `TW_WillowLeaf`) | `#3e8546` → `#93c45a`, sapin `#2f6f47`, saule `#8fbf5f` | 0.9 |
| Cerisiers (`TW_Blossom` / `TW_BlossomLight`) | `#f2a7c3` / `#f8cadb` | 0.85 |
| Bouleau (`TW_BirchBark`) | `#ece8dc` | 0.8 |
| Fleurs (`TW_Flower*`) | rose `#f07fa8`, jaune `#f6d04d`, blanc `#f7f4ec`, violet `#a985e0` | 0.7 |
| Ponton, belvédère, clôture (`TW_JettyPlanks`, `TW_JettyPost`) | `#b08655` motif `planks`, poteaux `#6e4f33` | 0.85 |
| Toit du belvédère (`TW_GazeboRoof`) | `#8f4f3a` | 0.85 |
| Panneau de spot / bouée (`TW_FishSpotSign`, `TW_BuoyRed`, `TW_BuoyWhite`) | `#2f8f9d` / `#e0533d` / `#f4f1ea` | 0.6 / 0.5 |
| Kiosque (`TW_KioskWall` / `TW_KioskRoof`) | `#e8d7b4` / auvent rayé `#3f7f8c` × `#f1ede2` | 0.9 / 0.85 |

Arbres : 5 modèles procéduraux, tous avec des sphères low-poly déformées au hasard pour un aspect organique.

- **Feuillu rond** : tronc conique et 3 à 4 boules de feuillage de teintes différentes.
- **Sapin** : 3 étages de cônes.
- **Bouleau** : tronc blanc fin et feuillage haut, vert clair.
- **Saule** : couronne aplatie et 12 branches tombantes, au bord de l'eau.
- **Cerisier** : un feuillu rond aux feuilles roses.

Les buissons, les massifs de fleurs et les touffes d'herbe sont dispersés au hasard (graine fixe), en évitant l'eau, les sentiers et le mobilier.

Environ 28 000 triangles après optimisation, dont environ 9 000 pour le terrain.

### Relief

Le terrain est une grille de 1 m (`PD_Terrain`) calculée par `terrain_h(x, z)` dans `build_pond.py` :

- **Collines douces** où l'on marche (jusqu'à 2,6 m, pente maximale d'environ 18°), avec une légère ondulation partout ailleurs.
- **L'étang au fond d'un creux** : la berge monte d'environ 30 cm entre l'eau et le sentier.
- **Le lit du ruisseau et de la mare** est creusé au niveau de l'eau.
- **Derrière la clôture**, une crête de 5 à 7 m couverte de sapins masque le pied du décor de ciel.
- **Le relief retombe à 0** contre la haie, au portail et aux bords `x = ±47`, pour se raccorder au sol de la ville.

Le sol de la ville (`Ground`) est un grand disque d'un seul tenant qu'on ne peut pas creuser : le terrain ne descend donc jamais sous `y = 0`. L'eau est à `y = 0.045`, au-dessus d'un fond à `0.015`.

**La hauteur du joueur suit le relief.** `pond.layout.json` contient `heightmap` (`x0, z0, cell, cols, rows, heights[]`, grille de 1 m de `x = -48` à `48` et de `z = -76` à `-4`). Ce sont les hauteurs où l'on marche : le terrain, plus le dessus du ponton, du pont et du plancher du belvédère. Côté front :

- `front/src/game/terrainHeight.ts` interpole ces hauteurs (bilinéaire) et renvoie 0 hors de la grille.
- `useGameMovement.ts` fait `y = 1.6 + terrainHeightAt(x, z)`, en ville seulement. Les avatars des autres joueurs suivent déjà le `y` envoyé au serveur.
- Les collisions restent des boîtes posées à `y = 0`, assez hautes pour toucher la capsule du joueur quelle que soit la hauteur du sol.

### Eau animée

`front/src/game/pondWater.ts` remplace au chargement le matériau `TW_PondWater` (étang, ruisseau, mare) par une copie animée : des ondulations calculées dans le shader (normales et couleur qui bougent avec le temps), légèrement transparente. Tout se fait dans le fragment shader, parce que `gltf-transform optimize` simplifie les maillages plats et qu'on ne peut donc pas compter sur des sommets intermédiaires pour faire des vagues. Si le matériau n'est pas trouvé, un avertissement s'affiche dans la console et l'eau reste statique.

### Plan (espace de jeu, nord = -Z)

- **Centre**
  - **Étang** : ellipse centrée en `(0, -58.5)`, rayons 14 × 5,5 m. Lys d'eau, roseaux, 3 canards, une barque amarrée au ponton.
  - **Boucle de balade** autour de l'étang : 1,6 m de large, rayons intérieurs 17 × 8. Elle porte des bancs tournés vers l'eau et des lampadaires.
  - **Ponton** : part de la berge sud à `x = 5`, plateforme en T de `z = -55.8` à `-58.3`, plancher à `y = 0.13`.
- **Aile ouest**
  - Un bosquet de sapins, de bouleaux et de feuillus.
  - Le **ruisseau** part de l'étang vers une **mare** (`(-39, -41.5)`, rayons 3,6 × 3). La boucle le franchit sur un pont en bois.
  - Un sentier, des tables de pique-nique et une couverture.
- **Aile est**
  - Une colline avec le **belvédère** (`(35, -55)`, plancher à 2,75 m, une marche à l'entrée, un banc à l'intérieur).
  - Des cerisiers, des tables de pique-nique et une couverture.
  - Le **kiosque à appâts** (`(22.5, -51.5)`, comptoir tourné vers l'ouest, futur PNJ sans logique).
- **Partout**
  - 13 bancs, 14 lampadaires le long des sentiers (plus 6 dans l'allée), 6 poubelles et un panneau indicateur au portail (« GAZEBO > », « < GROVE »).
  - Environ 60 arbres dans le parc et 26 sur la crête, des buissons, 18 massifs de fleurs, 160 touffes d'herbe et des rochers.

### Zones de pêche (contrat avec la logique de pêche)

Chaque spot est visible dans le monde : un piquet avec un panneau bleu-vert à côté du joueur, et une bouée rouge et blanche dans l'eau devant lui.

Les données sont dans `town.layout.json` → `pond` (type `TownLayout['pond']` dans `front/src/game/assets/catalog.ts`) :

```jsonc
"pond": {
  "gate": { "x": 0, "z": -46, "width": 12.2 },
  "center": [0, 0, -58.5],
  "fishingSpots": [
    { "id": "fish_jetty_01", "kind": "jetty", "position": [3.5, 0.13, -57.7], "yaw": 0, "radius": 1.0, "lookAt": [3.5, 0.045, -60.1] }
    // fish_jetty_01..03 au bout du ponton
    // fish_bank_01..05 sur les berges (sud-ouest, est, nord-ouest, nord, nord-est)
    // fish_mare_01 au bord de la mare
  ],
  "kiosk": { "position": [20.2, 0.265, -51.5], "yaw": -1.5708 }
}
```

- `position` : là où se tient le joueur, avec `y` = hauteur du sol à cet endroit. `radius` : rayon dans lequel il peut lancer la pêche.
- `kind` : `jetty`, `bank` ou `mare`. Ça permet par exemple d'avoir des poissons différents dans la mare.
- `yaw` : orientation du joueur face à l'eau (`0` regarde vers -Z, même convention que les stations des métiers).
- `lookAt` : position de la bouée, utile pour viser le lancer.
- `kiosk.position` : là où se tient le joueur devant le comptoir.

### Collisions

Boîtes `COL_Pond_*` dans `town.collision.json` :

- un anneau autour de l'étang, ouvert seulement à l'entrée du ponton ;
- des garde-fous invisibles autour du ponton, qui reste ouvert visuellement pour pêcher ;
- le ruisseau, découpé en segments, interrompu au pont dont les barrières prennent le relais ;
- un anneau autour de la mare ;
- les barrières et les poteaux du belvédère, en laissant l'entrée ouverte ;
- la clôture du fond ;
- les arbres, les buissons, les gros rochers, les bancs, les tables, les poubelles, les lampadaires et le kiosque.

Les extrémités est et ouest sont fermées par les limites du monde (`x = ±46.4`). La limite sud du monde descend à `minZ = -71`.

### Reconstruire

Dans Blender (via MCP), **sur Windows comme sur Mac** :

```python
p = r"<chemin du repo>/map-src/CampusCove/build_pond.py"
exec(open(p).read(), {"__file__": p})
```

Passer `{"__file__": p}` est obligatoire : le script en déduit le dossier de `lib_common.py` et de `out/`, sans chemin écrit en dur. Sans cette variable, il s'arrête avec une erreur explicite. Cette forme marche aussi pour les autres `build_*.py`, qui sinon retombent sur un chemin Windows écrit en dur.

```bash
cd front
npm run assets:optimize -- park   # out/park/pond -> public/assets/park/pond (pond.glb, pond.layout.json)
node scripts/apply-pond.mjs       # ouvre la haie au nord, retire les 2 arbres de l'allée, écrit collisions + town.layout.json
```

`apply-pond.mjs` est idempotent et indépendant d'`apply-work-district.mjs` : chacun ne touche que ses propres boîtes (`COL_Pond_*` / `COL_Work_*`) et sa propre limite (`minZ` / `maxZ`).

Pour déplacer un élément, modifier les constantes en tête de `build_pond.py` (`CZ`, `RX`, `HILLS`, `GAZEBO_C`, `KIOSK`…) puis relancer les trois étapes. Les arbres sont replacés automatiquement autour.

## 10. Objets de pêche (poissons et cannes)

Items tenus ou collectés, pas des décors : un GLB par objet, sans collision ni layout. Script : `map-src/CampusCove/build_fishing_items.py` (Blender via MCP, lancé avec `{"__file__": p}` comme `build_pond.py`).

### Style

Même base que le reste (§1) : low-poly à facettes, textures procédurales 64 px, base color + roughness uniquement. Préfixe de matériaux **`IT_`** (`IT_Fish_<clé>_Body`, `IT_Rod_Gold`…). La rareté se lit à la couleur et à l'éclat, pas à la complexité du maillage :

| Rareté | Poissons / cannes | Traitement |
|---|---|---|
| Commune | gardon (`roach`), perche (`perch`) / canne en bois (`wood`) | Couleurs naturelles douces, rugosité 0.55–0.8, pas d'émission |
| Rare | truite (`trout`), carpe koï (`koi`) / canne dorée (`gold`) | Motifs plus marqués (damier), nageoires roses, rugosité 0.25–0.5 ; canne en or `#e8bd3c`, rugosité 0.3, gemme rouge |
| Légendaire / premium | arowana doré (`golden_arowana`) / canne premium (`premium`) | Or `#f0b82e` + émission orange sur le poisson ; carbone sombre `#23262e` avec bandes néon cyan/violet émissives sur la canne |

### Budgets et conventions

- Poisson : ~350 triangles, 8 à 10 matériaux max, longueur réelle en mètres (gardon 0,30 m → arowana 0,80 m). Couché sur le ventre, **museau vers +X**, origine centre-bas.
- Canne : ~500 triangles, debout sur sa crosse (`z` de 0 à 2,2–2,4 m), pointe courbée vers +X, moulinet côté +Y, origine centre-bas (la crosse). Le point de prise en main est à ~0,25 m de l'origine.
- Vérification `min(y) ∈ [0, 0.03]` avant export (le script lève une erreur sinon).
- Sortie : `out/items/<fish|rods>/<clé>/{model.glb,preview.png}` puis `npm run assets:optimize -- items` → `front/public/assets/items/<fish|rods>/<clé>/` (GLB Draco, textures WebP 512, preview.png copié).
- `preview.png` : rendu Blender 512 px, fond transparent, caméra orthographique 3/4 (la canne est inclinée de ~35°). Les cartes d'inventaire/collection sont dessinées dans Figma à partir de ces previews.
- Ajouter l'entrée correspondante dans `front/src/game/assets/catalog.ts` quand la logique de pêche sera codée (rien n'est branché pour l'instant).

### Rareté et pièces légendaires

- Enum côté front : `Rarity` dans `front/src/game/rarity.ts` (`Common`, `Uncommon`, `Rare`, `Epic`, `Legendary`) avec `RARITY_META` (libellé, couleur, lueur). Les couleurs reprennent les variables `--cc-r-*` de `style.css` ; le showroom `/NewNation` colore l'étiquette 3D, l'anneau au sol, le badge et la bordure du panneau selon ce tier.
- **Les pièces légendaires font exception au budget de triangles** (arowana ~4 600, canne premium ~2 400) : le but est l'effet « WHOAH ». Elles cumulent matériaux émissifs forts (`emit_strength` dans `make_mat`), anneaux de halo au sol, rayons de lumière et étincelles flottantes. Le `preview.png` des légendaires est rendu en EEVEE (lumière réelle) au lieu de Workbench.

## 11. Taille du monde (limites jouables)

- Les limites du monde sont un seul rectangle `bounds`, écrit dans `town.collision.json` **et** `world.manifest.json`. Le jeu pose ses murs invisibles dessus, le serveur socket refuse les positions en dehors (`out_of_world`), et le planificateur `/admin/planner` les dessine.
- Le monde fait **1 km × 1 km** (de −500 à +500 m sur X et Z autour de la place), pour que les futures zones tiennent dedans sans retoucher la bordure.
- L'anneau d'horizon (`Sky_Ring`) et le disque de sol (`Ground`) de `town.glb` sont recentrés et agrandis sur ces limites. Au-delà du brouillard (250 m, 120 m en qualité basse) ils se fondent dans la couleur du ciel : le bord du monde se lit comme une brume.
- Les scripts `apply-*.mjs` ne font que **agrandir** les limites (`min` / `max`), donc les relancer ne réduit jamais le monde.

```bash
cd front
npm run world:bounds          # carré de ±500 m (défaut)
npm run world:bounds -- 800   # autre demi-taille, en mètres
docker restart campuscove-socket   # le socket relit world.manifest.json au démarrage
```

La place est entourée d'une haie, ouverte seulement au nord (étang) et au sud (quartier d'affaires) : une nouvelle zone a besoin de sa propre ouverture dans la haie, comme `apply-pond.mjs` / `apply-work-district.mjs`.

**Attention :** le côté est du parc de l'étang n'a qu'une clôture décorative sans collision (`PD_Fence*`, x ≈ 46). Tant que le monde s'arrêtait à x = 75,5 le mur de bordure fermait ce côté ; avec le monde de 1 km, on peut sortir par l'étang (vers x 48, z −37) et marcher dans la plaine vide autour. Une clôture avec collision est à ajouter avant d'ouvrir le jeu au public si on ne veut pas que les joueurs s'y promènent.
