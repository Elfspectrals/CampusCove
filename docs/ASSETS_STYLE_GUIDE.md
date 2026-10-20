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
