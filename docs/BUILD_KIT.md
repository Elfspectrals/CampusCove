# Kit de blocs de bâtiment (`map-src/CampusCove/lib_kit.py`)

Kit Python pour les scripts de build Blender (`build_*.py`) : des blocs modulaires (sol, mur, vitrine, dalle, toit,
rayonnage…) qui s'enregistrent comme des boîtes alignées sur les axes dans un `Kit`, des contrôles qui relisent ce
registre avant la génération, puis `kit.build(coll)` qui fabrique les objets Blender via `lib_common`. Il ne remplace
pas `lib_common.py` (il l'utilise : `box`, `join`, `gable_roof`, `make_mat`, `Collisions`) et ne touche pas aux scripts
existants.

## 1. Le problème

Les bâtiments générés empilent des boîtes coplanaires — deux sols au même `y` qui se recouvrent, cloisons de cellules
voisines l'une dans l'autre, bandeau traversant les pilastres, bande de toit dans la ferme — et le jeu les affiche en
**z-fighting** (scintillement). À l'inverse, des rangées laissent des **trous** : enveloppe ouverte au bout d'une rangée,
fente entre une coque de 4,5 m et un plafond à 4,8 m, angle où deux murs s'arrêtent sans se rejoindre. Les deux défauts
ne se voient qu'en jeu, après l'optimisation des assets. Le kit les rend détectables dans Blender headless, avant export.

## 2. Règles d'assemblage

1. **Deux blocs qui se touchent partagent une arête ou une face intérieure, jamais une face coplanaire visible.** Un
   bloc posé sur un autre a sa face du dessous sur la face du dessus de l'autre (normales opposées : invisible, OK) ; deux
   blocs côte à côte ont leurs faces de bout l'une contre l'autre. Ce qui est interdit : deux faces **de même sens** dans
   le même plan avec une aire commune (deux dessus de sol au même `y`, deux faces avant dans le même plan).
2. **Deux surfaces parallèles visibles distinctes sont écartées d'au moins `MIN_GAP = 0.02` m.** Un sol fini se pose
   **sur** la dalle (`floor(y = dessus de dalle + épaisseur)`), pas dedans ; un lettrage se place à 2 cm d'un panneau.
3. **Un sol ne recouvre jamais un sol déjà enregistré au même `y`.** `floor()` lève une `KitError` ; `replace=True`
   découpe l'ancien autour du nouveau (jusqu'à 4 rectangles restants).
4. **Les murs s'arrêtent aux angles, un `corner()` remplit le carré.** Mur en `x` de `a0` à `a1`, mur en `z` qui
   s'arrête à `fixed ± thick/2`, poteau d'angle de `thick × thick`. Une rangée ne se ferme pas « par chance » avec le mur
   de la rangée perpendiculaire : on déclare la pièce et `check_enclosure` prouve qu'elle est close.
5. **Les ouvertures voulues (porte, passage) sont déclarées**, soit par `openings=` de `wall()` / `door=` de
   `shopfront()`, soit par `kit.opening()`. Le contrôle d'enveloppe ne compte pas ces trous-là.
6. **Un nom par boîte**, unique dans le kit (`KitError` sinon) ; une boîte dégénérée (dimension nulle) est refusée.
7. **Les boîtes de collision sont des boîtes du kit** : `collide=True` sur une boîte visible, ou une boîte
   `visible=False, collide=True` pour une enveloppe de collision (un rayonnage entier, un banc). Elles sortent dans un
   `lib_common.Collisions` (`COL_<nom>`) comme dans `build_mall.py`.
8. **Les UV sont en coordonnées monde** (`tile` en mètres) : deux sols voisins se raccordent sans couture quel que soit
   leur centre.

## 3. Conventions

- Repère jeu de `lib_common` : `x`, `z` au sol en mètres, `y` la hauteur ; l'export glTF passe en Y-up. Une boîte est
  `(x0, z0, x1, z1, y0, y1)` ; les murs sont **centrés** sur leur ligne `fixed` et épais de `thick`.
- `yaw` des meubles : convention de `lib_common.furn` — `0` regarde `-Z`, `-π/2` regarde `+x`, `π/2` regarde `-x`, `π`
  regarde `+Z` ; **multiple de π/2 obligatoire** (les boîtes restent alignées sur les axes). Dans le repère local d'un
  meuble, `-z` est l'avant.
- Matériaux : `lib_common.make_mat` (préfixes du guide des assets : `TW_`, `IN_`, `EX_`).
- Le kit ne couvre que les boîtes (plus la rampe et le toit à deux pentes, dont il connaît les faces planes). Cylindres,
  cônes, lettrages (`lib_common.cyl`, `cone`, `text_mesh`, `text()` des scripts) se créent à côté et sont exportés avec
  `kit.objects` ; leur règle est la même : 2 cm d'écart avec toute face parallèle.

## 4. Blocs

Tous sont des méthodes de `Kit` et renvoient la ou les `Box` créées sauf mention. Hauteurs d'ouverture relatives au
`y0` du bloc.

| Bloc | Signature | Rôle |
|---|---|---|
| `add` | `add(name, x0, z0, x1, z1, y0, y1, mat, visible=True, collide=False, tile=1.0, bevel=0.0)` | boîte brute |
| `part` | `part(name, gx, gz, yaw, lx, lz, y0, sx, sz, h, mat, visible=True, collide=False, bevel=0.0, tile=1.0)` | boîte en repère local tourné de `yaw` (pour composer un meuble) |
| `opening` | `opening(name, x0, z0, x1, z1, y0, y1)` | trou voulu dans l'enveloppe |
| `floor` | `floor(name, x0, z0, x1, z1, y, mat, thick=0.1, tile=2.0, replace=False)` | sol dont le dessus est à `y` ; refuse un recouvrement au même `y` |
| `slab` | `slab(name, x0, z0, x1, z1, y0, thick, mat, tile=2.0)` | dalle `y0 → y0 + thick` (plafond, étage), son dessus compte comme un sol |
| `roof_slab` | `roof_slab(name, x0, z0, x1, z1, y0, mat, thick=0.3, tile=4.0)` | dalle de toit |
| `wall` | `wall(name, axis, fixed, a0, a1, y0, h, thick, mat, openings=[(a, b, y_lo, y_hi)], collide=True, tile=2.0)` | mur centré sur `fixed`, découpé en pièces pleines / allège / linteau autour des ouvertures |
| `corner` | `corner(name, gx, gz, y0, h, thick, mat, thick_z=None, collide=True)` | poteau d'angle où deux murs s'arrêtent |
| `shopfront` | `shopfront(name, axis, fixed, a0, a1, y0, h, mat_wall, mat_glass, low=0.5, fascia=(3.4, None), thick=0.2, pilaster=0.3, door=(a, b, h_porte), mat_fascia=None)` | pilastres (`thick + 0.2` de profondeur), mur bas, vitre, bandeau entre les pilastres, mur au-dessus ; `door` coupe mur bas et vitre et déclare l'ouverture |
| `door_frame` | `door_frame(name, axis, fixed, a0, a1, y0, h, thick, mat, leaf=None, jamb=0.08, head=0.12, proud=0.03)` | montants et traverse dans une ouverture, 3 cm en saillie du mur ; `leaf` = matériau d'un vantail de 5 cm |
| `pillar` | `pillar(name, gx, gz, y0, h, mat, w=0.6, collide=True)` | poteau carré |
| `railing` | `railing(name, axis, fixed, a0, a1, y0, mat_glass, mat_rail, h=1.1, gaps=[(g0, g1)])` | garde-corps vitré (socle, vitre, main courante) + une COL par tronçon |
| `stair` | `stair(name, x0, z0, x1, z1, y0, y1, rise, steps, mat)` → dict | marches pleines, `rise` ∈ `+x -x +z -z` ; renvoie l'entrée `stairs[]` du layout (pas de COL : le joueur marche sur le layout) |
| `ramp` | `ramp(name, x0, z0, x1, z1, y0, y1, rise, mat, base=None)` → dict | escalator / rampe (prisme), pleine jusqu'à `base` ; même retour que `stair` |
| `gable_roof` | `gable_roof(name, x0, z0, x1, z1, y0, h, mat, ridge_axis="x")` | toit à deux pentes (`lib_common.gable_roof`) |
| `truss` | `truss(name, axis, a0, a1, p0, p1, y0, mat, step=6.0, depth=0.5, w=0.4, purlins=3)` | fermes tous les `step` m le long de `axis`, pannes coupées entre les fermes à mi-hauteur |
| `shelf_unit` | `shelf_unit(name, gx, gz, yaw, w, d, h, shelves, mat, mat_shelf=None)` → `[(x0, z0, x1, z1, y)]` | rayonnage (fond, joues, plinthe, `shelves` tablettes dont la plinthe, dessus, une COL) ; renvoie les surfaces où poser des produits |
| `counter` | `counter(name, gx, gz, yaw, w, d, h, mat, mat_top)` | comptoir + plateau débordant, une COL |
| `display_table` | `display_table(name, gx, gz, yaw, w, d, h, mat, mat_top=None)` | table à quatre pieds, une COL |
| `podium` | `podium(name, gx, gz, yaw, w, d, h, mat)` | estrade (boîte qui collisionne) |
| `mannequin` | `mannequin(name, gx, gz, yaw, mat, y0=0.0)` | silhouette simple de 1,76 m, posée sur `y0` |
| `hanging_sign` | `hanging_sign(name, gx, gz, yaw, w, h, y, ceiling_y, mat, mat_wire)` → `Box` | panneau suspendu par deux fils au plafond ; le texte va à 2 cm de ses faces |
| `price_tag` | `price_tag(name, gx, gz, yaw, mat_post, mat_tag, h=1.05)` → `(x, y, z)` | pied d'étiquette, renvoie le centre de la plaque (`displays[].tag.position`) |
| `planter` | `planter(name, gx, gz, w, d, mat_box, mat_leaf, h=0.55)` | jardinière + feuillage |
| `bench` | `bench(name, gx, gz, yaw, mat_seat, mat_leg, w=1.7, d=0.45)` | banc à dossier, une COL |
| `build` | `build(coll, cols=None, prefix="Kit", merge=True)` → objets | objets Blender joints par matériau (`<prefix>_<matériau>`), `COL_` dans `cols` (`lib_common.Collisions`, créé sur `coll` si `None`, puis `kit.cols`) |

Une façade sur une rangée : la vitrine de chaque cellule court du centre d'une cloison mitoyenne au centre de la
suivante (`a0 = x_cloison`, `a1 = x_cloison_suivante`) ; aux bouts de rangée elle va jusqu'au nu extérieur du mur de
bout (`x0 - thick/2`). Les cloisons partent de la face arrière des pilastres (`z = fixed + (thick + 0.2) / 2`) et
s'arrêtent au nu intérieur du mur du fond ; ce dernier s'arrête aux `corner()` de bout.

### Exemple : une boutique

```python
kit = K.Kit()
kit.floor("Floor", -0.1, -0.2, 10.1, 12.1, 0.0, M["floor"], tile=3.0)
kit.shopfront("Front", "x", 0.0, -0.1, 10.1, 0.0, H, M["wall"], M["glass"], door=(4.4, 5.6, 2.2), mat_fascia=M["band"])
kit.door_frame("Door", "x", 0.0, 4.4, 5.6, 0.0, 2.2, 0.2, M["dark"], leaf=M["glass"])
kit.wall("SideW", "z", 0.0, 0.2, 11.9, 0.0, H, 0.2, M["wall"])
kit.wall("SideE", "z", 10.0, 0.2, 11.9, 0.0, H, 0.2, M["wall"])
kit.wall("Back", "x", 12.0, 0.1, 9.9, 0.0, H, 0.2, M["wall"], openings=[(8.0, 9.0, 0.0, 2.1)])
kit.corner("CornerW", 0.0, 12.0, 0.0, H, 0.2, M["wall"]); kit.corner("CornerE", 10.0, 12.0, 0.0, H, 0.2, M["wall"])
kit.slab("Ceiling", -0.1, -0.2, 10.1, 12.1, H, 0.3, M["slab"]); kit.roof_slab("Roof", -0.4, -0.5, 10.4, 12.4, H + 0.3, M["roof"])
for x0, z0, x1, z1, y in kit.shelf_unit("Shelf", 5.0, 11.6, 0.0, 4.0, 0.6, 2.2, 4, M["wood"]):
    kit.add(f"Goods_{round(y * 100)}", x0 + 0.1, z0 + 0.05, x1 - 0.1, z1 - 0.05, y, y + 0.3, M["red"])
K.report(kit, rooms=[(0.0, 0.0, 10.0, 12.0, 0.0, H)])
objs = kit.build(coll, prefix="Shop")
L.export_glb(path, objs); L.export_glb(path_colsrc, objs + kit.cols.items)
```

(`H = 4.8`, `M` = dictionnaire de `make_mat`, `import lib_kit as K` après avoir mis `map-src/CampusCove` dans
`sys.path` comme les `build_*.py`.) Le mur du fond va de `0.1` à `9.9` et les cloisons de `0.2` (dos des pilastres) à
`11.9` : les deux `corner()` ferment les angles arrière, les pilastres ferment les angles avant.

## 5. Contrôles

| Fonction | Trouve | Retour |
|---|---|---|
| `check_coplanar_overlaps(kit, tol=1e-3, gap=MIN_GAP)` | deux boîtes visibles dont une face **de même sens** est dans le même plan (à moins de `gap`) avec une aire commune > `tol` | `[(nom_a, nom_b, face, plan, aire)]`, face ∈ `x- x+ y- y+ z- z+` |
| `check_contained(kit)` | boîte visible entièrement contenue dans une autre (géométrie inutile) | `[(intérieure, extérieure)]` |
| `check_enclosure(kit, rooms, step=0.5, probe=0.12)` | pour chaque pièce `(x0, z0, x1, z1, y0, y1)` donnée sur les **axes des murs**, le dessus du sol et le dessous du plafond : échantillons des six faces (grille `step`) qu'aucune boîte visible ni ouverture déclarée ne couvre à `probe` près | `[(index_pièce, face, u, v)]` |
| `report(kit, rooms=())` | lance les trois, imprime le résumé et les premiers résultats, **lève `KitError`** au moindre résultat | `(overlaps, contained, holes)` |

Les contrôles trient les faces par plan puis balaient chaque plan (pas de O(n²) global) : ~5 000 boîtes se vérifient en
moins d'une seconde. Les faces opposées en contact (dessous d'un meuble sur un sol, bout d'un mur contre un pilastre)
ne sont pas des défauts et ne sont pas signalées. Les boîtes `visible=False` (collisions) ne sont jamais contrôlées.

Séquence dans un script : construire le kit, `K.report(kit, rooms=[...])`, puis `kit.build(coll)`, `check_grounded`
sur les objets hors kit, exports `glb` / `colsrc.glb` avec `kit.cols.items`, `snapshot`. Un échec de `report()` arrête
le build headless comme un `assert` de `check_grounded`.

## 6. Lancer un essai

```bash
B=/Applications/Blender.app/Contents/MacOS/Blender
$B --background --factory-startup --python-expr "p='map-src/CampusCove/build_xxx.py'; exec(open(p).read(), {'__file__': p})"
```

Le script importe `lib_kit` à côté de `lib_common` (`import lib_kit as K` après `importlib.reload(L)`), exactement
comme les scripts existants importent `lib_common`.
