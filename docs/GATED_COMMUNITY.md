# Cove Heights — Gated Community Master Plan

> **Civil Architect Document** · CampusCove Open World
> Version 1.3 · November 2026 (v1 shell built: `build_cove_heights_site.py` + `lib_site.py`; estate moved north of the mall)
> Governed by `.claude/agents/civil-architect.md`. Topography rules: `.claude/agents/topographer.md`. Kit rules: `docs/BUILD_KIT.md`.

> **Plan frame vs world (v1.3).** The estate (§ 2–4 and § 6–14) is drawn in a *plan frame* (wall x 100 → 260,
> z −330 → −190) and placed in the world by **OFFSET = (−431, +18)**: world = plan + offset, so the wall runs
> x −331 → −171, z −312 → −172, north of the mall. Cove Road (§ 5) is given in world coordinates.
> `build_cove_heights_site.py` applies the offset to every estate object, collision box and layout point.

Every value in this document is in **game space** `(x, z)` in metres, `y` up. **North is −Z, east is +X** (`docs/ASSETS_STYLE_GUIDE.md`
§ 9 "Plan", `front/src/game/world/minimap.ts`). Phase tags: **[v1]** = first build pass ("playable shell"), **[v2]** = amenities
and dressing, **[v3]** = houses and live gameplay. Section 16 sums them up.

---

## 1. Executive Summary

**Zone keys**: `cove_heights` (the estate and its forecourt) and `cove_road` (the connector from the town).
**Site vision**: an upscale, Mediterranean-style gated estate north of the mall: cream plaster
walls, terracotta coping and roofs, dark iron gates, a central park and a clubhouse. 16 residential lots (4 estate villas,
12 executive homes) around one residential loop, a guarded main gate on the town-facing (south) wall, an emergency gate on the
north wall.

| Parameter | Value |
|-----------|-------|
| Walled estate (wall centrelines) | x 100 → 260, z −330 → −190 · 160 m (X) × 140 m (Z) = 22 400 m² |
| Forecourt outside the wall (gate queue, utility node, signs) | x 152 → 197.2, z −190 → −169.95 |
| `cove_heights` zone bounds | `minX 99, maxX 261, minZ −331, maxZ −169.95` |
| `cove_road` + `cove_road_mall` zone bounds | see § 5.6 (Cove Road branches off the mall avenue) |
| Estate centre | plan (180, −260) = world (−251, −242), north of the mall |
| Walk from the town's west hedge gate to the main gate | ≈ 347 m (avenue 29 m + Cove Road 292 m + boulevard 26 m) |
| Ground | flat, `y = 0` (see § 3.3); no heightmap |
| Resident lots | 16 (A-01…A-04, B-01…B-12), decor plots in v1, stable IDs for HousingService later |
| Target population | 16–32 players (1–2 per lot) |
| Build script | `map-src/CampusCove/build_cove_heights_site.py` **(new)** + shared builders `map-src/CampusCove/lib_site.py` **(new)** |
| Blender outputs | `map-src/CampusCove/out/park/cove_heights/` : `cove_heights.glb`, `cove_road.glb`, `cove_road_mall.glb`, `cove_heights.layout.json` (collision boxes inside the layout) |
| Shipped assets | `front/public/assets/park/cove_heights/` (same names); collisions merged into `town/town.collision.json` by `apply-cove-heights.mjs` |

Neighbours (world, from `front/public/assets/world.manifest.json`): mall x −420…−42.6, z −135…135 (its north buildings
reach z −128); orchard x −42.6…−2, z −130…−72. Nothing else occupies x −332…−67, z −313…−135; the estate's forecourt road
(world z −140 → −152) keeps 5 m from the mall zone.

---

## 2. Zoning & Land-Use Table

Areas are computed from the coordinates of § 4–8 and sum exactly to the walled area (wall centrelines, 22 400 m²).

| Zone | Area (m²) | % of site | Description |
|------|-----------|-----------|-------------|
| Residential – Villa (Type A) | 3 136.0 | 14.0 % | 4 lots × 28 × 28 m (784 m²), north band |
| Residential – Executive (Type B) | 4 800.0 | 21.4 % | 12 lots × 20 × 20 m (400 m²), west, east and south bands |
| Loop road reserve | 3 246.3 | 14.5 % | 349.07 m centreline × 9.3 m (carriageway 2 094.4, sidewalks 1 047.2, curbs 104.7) |
| Entry boulevard (inside the wall) | 448.5 | 2.0 % | 19.5 m × 23 m (z −190 → −213), lanes, island, sidewalks |
| Emergency lane | 186.0 | 0.8 % | 6.0 m × 31 m (z −299 → −330) |
| Clubhouse & leisure parcel | 2 000.0 | 8.9 % | 80 × 25 m: clubhouse 240, pool deck 216, court 240, lawns |
| Central park | 2 640.0 | 11.8 % | 80 × 33 m: fountain plaza, jogging loop, axes, gazebo, playground |
| Promenade | 240.0 | 1.1 % | 80 × 3 m paved walk between clubhouse parcel and park |
| Bio-swale | 238.0 | 1.1 % | 17 × 14 m, south-east corner square |
| South-west pocket garden | 540.0 | 2.4 % | 27 × 20 m, south-west corner square |
| Perimeter buffer band | 1 687.5 | 7.5 % | wall footprint + 3.0 m band inside the wall centreline, minus the two road crossings |
| Other landscape | 3 237.7 | 14.5 % | inner-block margins 1 540.3, emergency-lane strips 504, NW/NE pockets 504, band-end strips 240, SE square rest 222, boulevard side strips 90, loop-corner wedges 137.4 |
| **TOTAL** | **22 400.0** | **100 %** | 160 × 140 m |

Outside the wall, in the `cove_heights` zone: forecourt carriageway and sidewalks 585 m² (19.5 × 30 m), utility node 143 m²,
service apron 21 m².

| Ratio | Value |
|-------|-------|
| Open green space (park + pocket garden + swale + buffer + other landscape) | 8 343.2 m² = **37.2 %** |
| Communal land (open green + clubhouse parcel + promenade) | 10 583.2 m² = **47.2 %** (≥ 30 % required) |
| Circulation (loop + boulevard + emergency lane + promenade) | 4 120.8 m² = 18.4 % |
| Type A coverage / FAR at build-out [v3] | 272 / 784 = 0.347 (≤ 0.35) · FAR 0.69 (2 storeys) |
| Type B coverage / FAR at build-out [v3] | 175 / 400 = 0.4375 (≤ 0.45) · FAR 0.875 (2 storeys) |
| Site coverage / FAR at build-out [v3] | 3 428 m² = 15.3 % · GFA 6 616 m² → FAR 0.295 |

---

## 3. Coordinate System & Engine Rules

### 3.1 Axes and origins

- Game space `(x, z)` horizontal, `y` elevation. Blender `b(gx, gz, h) → (gx, −gz, h)` (`lib_common.b`). glTF export is Y-up.
- **North = −Z**: the wall at z = −190 faces the town and is the **south** wall; z = −330 is the **north** wall.
- Every object has its origin at the **centre-bottom** of its footprint; `L.check_grounded()` runs on all non-kit objects.
- Yaw (`lib_common.furn`, `lib_kit`): `0` looks −Z (north), `−π/2` looks +X, `π/2` looks −X, `π` looks +Z. Kit parts use
  multiples of π/2 only.
- Player capsule radius 0.35 m, height 1.8 m. Minimum walk passage 0.8 m; anything narrower than 0.7 m is treated as closed.

### 3.2 Vertical stack (MIN_GAP = 0.02 m between parallel visible faces)

| Layer | y bottom → top | Material |
|-------|----------------|----------|
| Town `Ground` disc (existing, `town.glb`) | top 0.00 | `TW_Grass` (existing) |
| Site lawn (one box over the zone, z ≤ −160) / connector verges | 0.00 → 0.02 | `TW_CoveLawn` / `TW_CoveVergeGrass` |
| Lot lawn | 0.02 → 0.04 | `TW_CoveLotLawn` |
| Carriageways (asphalt) | 0.00 → 0.04 | `TW_CoveAsphalt` |
| Lane markings | 0.04 → 0.06 | `TW_CoveRoadLine` |
| Driveways, park paths, promenade, pads, service apron | → 0.06 | `TW_CoveCobble` / `TW_CovePaving` |
| Plazas (fountain, clubhouse forecourt) | → 0.08 | `TW_CovePlazaFlagstone` |
| Clubhouse floor slab | 0.00 → 0.10 | `EX_cove_Floor` |
| Sidewalks, traffic islands | 0.00 → 0.12 | `TW_CovePaving` |
| Curbs (step 0.14 above ground, 0.10 above asphalt) | 0.00 → 0.14 | `TW_CoveCurb` |
| Lot hedges (walk-over) | 0.02 → 0.42 | `TW_CoveHedgeLow` |
| Wall plinth / wall / coping / pilaster / cap | 0 → 0.30 / 0 → 2.60 / 2.60 → 2.70 / 0 → 2.80 / 2.80 → 2.88 | see § 6.1 |

Kit boxes at the same top `y` never share area (`kit.floor` refuses it); ribbons and arcs (Cove Road, loop corners) are outside
the kit and follow the same table by construction.

### 3.3 Topography and walk height

- The site is flat. The only heightmap near it is the pond's (grid x −48…48, z −86…−4); its relief is 0 for |x| ≥ 47.5, so
  nothing at x ≥ 46.6 or z ≥ −4 is affected. Cove Heights ships **no heightmap**: walk height is `0 + 1.6 m` everywhere.
- `npm run topo:check` (`front/scripts/check-topography.mjs`) uses `TOLERANCE = 0.15` and `MAX_STEP = 0.75`. Consequences:
  - every walkable surface tops out at ≤ 0.14 m (curbs 0.14, sidewalks 0.12): no step logic is needed, the eye stays at 1.6 m;
  - any solid between 0.15 and 0.75 m needs a `COL_` box, except `Hedge`/`Rock` material up to 0.45 m (`LOW_DECOR`):
    lot hedges are 0.40 m high (top 0.42) on purpose so they need no collision;
  - no sunken pool or swale in v1 (a −0.8 m pool or −0.3 m channel would be "floating" without a heightmap);
  - walkable materials must match `GROUND = /Grass|…|Paving|…|Asphalt|Cobble|…|Flagstone|…|Lawn/`, soft decor must match
    `SOFT` (`Leaf`, `Reed`, `Line`…). The names in § 10 do.
- `MAX_STEP = 0.30` of the civil standard is respected trivially (highest walkable step 0.14 m).

---

## 4. Circulation & Road Geometry (estate)

### 4.1 Road cross-sections

Offsets are lateral distances from the centreline (negative = left when looking along the drawing direction).

| Section | Carriageway | Curbs | Verge | Sidewalks | Reserve |
|---------|-------------|-------|-------|-----------|---------|
| `loop` (secondary) | 6.0 m (±3.0), two lanes of 3.0 m | 0.15 m (±3.0…3.15) | — | 1.5 m both sides (±3.15…4.65) | 9.3 m |
| `road` (Cove Road, § 5) | 6.0 m (±3.0) | 0.15 m | 1.0 m grass (±3.15…4.15), lamps | 1.8 m both sides (±4.15…5.95) | 11.9 m |
| `throat` (Cove Road inside the town) | 5.0 m (±2.5) | 0.15 m (±2.5…2.65) | — | 1.5 m (±2.65…4.15) | 8.3 m |
| `boulevard` (primary, gate) | 15.6 m between curbs: egress 4.0 + island 4.0 + visitor 3.5 + divider 0.6 + resident 3.5 | 0.15 m | — (lamps on the island) | 1.8 m both sides | 19.5 m |
| `lane` (emergency) | 6.0 m, flush edges | — | — | — | 6.0 m |

### 4.2 Residential loop [v1]

```
Centreline: rounded rectangle, straight legs on x = 127.65 / 232.35 and z = -217.65 / -294.35
Corner radius (centreline): R = 8.0 m, corner centres (135.65, -225.65) (135.65, -286.35) (224.35, -286.35) (224.35, -225.65)
Straights: south and north legs x 135.65 → 224.35 (88.7 m), west and east legs z -225.65 → -286.35 (60.7 m)
Centreline length: 2 × 88.7 + 2 × 60.7 + 2π × 8 = 349.07 m
Reserve outer edge (= lot front lines): x = 123.0 / 237.0, z = -213.0 / -299.0 ; corners r = 12.65
Reserve inner edge (= inner block):     x = 132.3 / 227.7, z = -222.3 / -289.7 ; corners r = 3.35
At the corners: carriageway r 5.0–11.0, curbs r 4.85–5.0 and 11.0–11.15, sidewalks r 3.35–4.85 and 11.15–12.65
Outer curb radius 11.15 m ≥ 9.0 m turning standard; two-way; no dead ends anywhere (no cul-de-sacs)
Lane line: dashed centre line, 0.12 m wide, 3 m dash / 3 m gap, y 0.04 → 0.06
```

Junctions (T, square corners, pedestrians only so no corner radii):

| Junction | Where | What is cut |
|----------|-------|-------------|
| Boulevard → loop south leg | x 174.0 → 189.6 | loop outer curb and sidewalk end at x 173.85 / 174.0 (west) and 189.75 / 189.6 (east); boulevard sidewalks end at z −213.0 and abut the loop sidewalk |
| Loop north leg → emergency lane | x 177.0 → 183.0 | loop north curb (z −297.35…−297.5) and sidewalk (z −297.5…−299.0) are cut; the lane asphalt runs from the loop carriageway edge z −297.35 to the gate |
| Lot driveways | 16 points, § 7 | nothing cut in v1 (sidewalk and curb stay continuous; dropped curbs are [v3]) |

### 4.3 Entry boulevard (primary) [v1]

```
Extent:      z = -168.0 (end of the forecourt flare, § 5.4) → -214.65 (loop carriageway edge); the wall crosses it at z = -190
x layout:    west sidewalk 172.05–173.85 | curb 173.85–174.0 | egress lane 174.0–178.0 | island 178.0–182.0
             | visitor lane 182.0–185.5 | divider 185.5–186.1 (z -186.0 → -194.0 only) | resident lane 186.1–189.6
             | curb 189.6–189.75 | east sidewalk 189.75–191.55
Island:      x 178.0–182.0, z -172.0 (south nose) → -205.0 (north nose): paving 0.12 inside a 0.15 m curb ring at 0.14
Lane lines:  solid line between egress lane and island noses; dashed visitor/resident line z -168 → -186 and -194 → -213
Stacking:    split lanes z -172.0 → -190.0 = 18.0 m between the external road (Cove Road ends at z -160) and the barrier line
Inside:      no taper; the carriageway keeps its 15.6 m to the loop so every curb stays a straight kit box
```

The visitor lane is next to the guard window (island side, driver on the left); the resident lane has an RFID pedestal on the
divider. Players are on foot: lanes are walkable surfaces, the lane split only drives the barrier layout (§ 6.2).

### 4.4 Emergency lane [v1]

```
Carriageway: x 177.0–183.0, z -297.35 (loop carriageway edge) → -329.85 (wall inner face), asphalt 0.04, no curbs
Strips:      grass x 168–177 and 183–192 between villas A-02 and A-03, no tree within 1.0 m of the asphalt
Gate:        § 6.3; outside the gate the plain is empty (no road in v1)
```

### 4.5 Driveways and lot entries [v1]

Driveways start at the lot front line (back of the sidewalk) and run into the lot; § 7 gives every rectangle.
Type A: 3.0 × 5.0 m, Type B: 2.4 × 5.0 m, `TW_CoveCobble`, top 0.06 on the lot lawn (0.04). Every driveway meets a **straight**
part of the loop (checked in § 7.4).

---

## 5. Connector Road — Cove Road [v1, built] (world coordinates)

Cove Road **branches off the mall avenue** (`build_mall.py`: avenue centreline z = −12, 7 m carriageway, 1.8 m sidewalks,
from the town's west hedge gate (−44.6, −12) to the mall), runs north along the mall's east side and turns west into the
estate's entry boulevard. Town and mall assets are untouched.

### 5.1 Junction with the mall avenue

- T-junction on the avenue's north side at **x = −73.2**: the only gap wide enough for the 11.9 m reserve
  (x −79.15 → −67.25) between `COL_Mall_Tree002` (−81.1, −19.5) and `COL_Avenue_Bin0_0` (−65.3, −17.7). The parking lot
  (x −140 → −100) and its signpost (−99, −20) stay west of it.
- The avenue is not modified: its north curb and sidewalk run across the mouth (continuous-sidewalk crossing, 0.10–0.15 m,
  walk-over). Cove Road starts at the back of that sidewalk, z = −17.3.
- Signpost `CR_Signpost` at (−65.6, −22.0): "Cove Heights" (north) / "Mall" (west).

### 5.2 Centreline (world x, z)

| Point | Position | Note |
|-------|----------|------|
| J0 | (−73.2, −17.3) | back of the avenue's north sidewalk |
| C1 | (−73.2, −134.0) → (−85.2, −146.0) | fillet R 12 m, centre (−85.2, −134), turning west; clear of the mall zone (z ≥ −135) and its north buildings (z ≥ −128) |
| C2 | (−241.4, −146.0) | west leg ends on the boulevard carriageway's east edge (plan x 189.6) |

Length ≈ 116.7 (north leg) + 18.8 (fillet) + 156.2 (west leg) = **292 m** from the avenue to the boulevard.

### 5.3 Cross-section

`road` everywhere: 6.0 m carriageway (dashed centre line), 0.15 m curbs, 1.0 m grass verge (top 0.03), 1.8 m sidewalks
(±5.95 m reserve).

### 5.4 Boulevard junction

The west leg meets the boulevard's south end from the east: its asphalt runs to the boulevard carriageway east edge; its
north curb/verge/sidewalk stop at the boulevard east sidewalk (plan x 191.55), which starts at the road's north edge; its
south curb/verge/sidewalk run on to plan x 172.05 and close the boulevard's south end. The boulevard carriageway starts at
plan z −161. Monument signs at plan (168, −173) and (195.6, −173).

### 5.5 Furniture and collisions

- Lamps (`street_lamp`, h 4.0, 0.35 × 0.35 × 2.0 COL): north leg east verge (x −69.55) every 20 m from z −30 to −130 (6);
  west leg south verge (z −142.35) every 20 m from x −95 to −235 (8).
- Trees along the road: [v2].

### 5.6 Zones (world)

| Zone | GLB | Bounds |
|------|-----|--------|
| `cove_road_mall` | `cove_road_mall.glb` (north leg + signpost) | x −79.15 → −67.25, z −134 → −17.3 (inside the mall zone's rectangle) |
| `cove_road` | `cove_road.glb` (fillet + west leg) | x −258.95 → −67.25, z −151.95 → −134 |
| `cove_heights` | `cove_heights.glb` (estate, boulevard, forecourt) | x −332 → −170, z −313 → −151.95 |

---

## 6. Perimeter & Security Architecture

### 6.1 Perimeter wall [v1]

```
Centrelines:   x = 100 / 260 (z -190 → -330), z = -190 / -330 (x 100 → 260)
Wall:          0.30 m thick, y 0 → 2.60, TW_CoveWallPlaster
Plinth (grade beam): 0.36 m wide, y 0 → 0.30, TW_CoveWallStone (faces 0.03 proud of the wall)
Coping:        0.36 m wide, y 2.60 → 2.70, TW_CoveCoping (terracotta)
Pilasters:     0.40 × 0.40 m, y 0 → 2.80, TW_CoveWallStone, every 5.0 m from the corners
               (x = 100, 105 … 260 on the N/S walls; z = -190, -195 … -330 on the E/W walls)
Pilaster caps: 0.50 × 0.50 m, y 2.80 → 2.88, TW_CoveCoping
Corners:       kit.corner 0.40 m at (100,-190) (260,-190) (100,-330) (260,-330)
Skipped pilasters (inside openings): x 175, 180, 185, 190 on the south wall; x 180 on the north wall
Face offsets:  wall ±0.15, plinth/coping ±0.18, pilaster ±0.20, piers ±0.28 → no coplanar faces (≥ 0.02 apart)
Clear zone:    2.5 m inside and outside the wall faces kept free of trees and solids; every lot line is 2.85 m from the
               inner face (hedge face 2.65 m); trees ≥ 6.8 m
```

Wall runs stop at pilaster and pier faces (`kit.wall` between them), the collision runs are continuous (§ 11).

### 6.2 Main gate (south wall, town side) [v1 shell, gate logic v3]

Cross-section on the wall line z = −190 (west → east):

| x from → to | Element | Visual (v1) | Collision |
|-------------|---------|-------------|-----------|
| … → 171.47 | south wall, west run | wall + pilaster at 170 | permanent `COL_Cove_WallS_W` |
| 171.47 → 172.03 | Pier W2, 0.56 × 0.56 × 3.20, cap 0.66 × 0.10 | `TW_CoveWallStone` | permanent |
| 172.03 → 173.27 | **Portal W** (exit), clear 1.24 m | iron leaf, modelled **open** against Pier W1 | **toggle** `COL_Cove_PortalW` |
| 173.27 → 173.83 | Pier W1 | stone | permanent |
| 173.83 → 174.00 | gap 0.17 m (not passable) | curb | — |
| 174.00 → 178.00 | Egress lane | boom arm, modelled **raised** | **toggle** `COL_Cove_BoomEgress` |
| 178.00 → 182.00 | Island: boom posts at x 178.2 and 181.8, rail between | iron rail 1.0 m | permanent `COL_Cove_IslandRail` |
| 182.00 → 185.50 | Visitor lane | boom raised | **toggle** `COL_Cove_BoomVisitor` |
| 185.50 → 186.10 | Divider: resident boom post at x 185.8 | rail | permanent `COL_Cove_DividerRail` |
| 186.10 → 189.60 | Resident lane | boom raised | **toggle** `COL_Cove_BoomResident` |
| 189.60 → 189.77 | gap 0.17 m | curb | — |
| 189.77 → 190.33 | Pier E1 | stone, badge reader on its south face (2 cm proud) | permanent |
| 190.33 → 191.57 | **Portal E** (entry, checkpoint), clear 1.24 m | iron leaf open | **toggle** `COL_Cove_PortalE` |
| 191.57 → 192.13 | Pier E2 | stone | permanent |
| 192.13 → … | south wall, east run | | permanent `COL_Cove_WallS_E` |

```
Guardhouse (pavilion_shell):  centre (180.0, -184.5) on the island, 3.5 (x) × 5.0 (z), floor on the island paving (y 0.12)
  walls 0.20 thick, y 0.12 → 2.92 ; roof slab 2.92 → 3.12 ; gable roof 3.12 → 3.82 (ridge along z), EX_cove_Plaster / EX_cove_RoofTile
  360° glazing: one opening per face, sill 0.9, head 2.3 above the floor, EX_cove_Glass ; door on the south face x 179.4–180.6
  2.85 m from the wall outer face (outside the 2.5 m outer clear zone)
Boom barriers:  posts 0.25 × 0.25 × 1.10 (TW_CoveIron); arms 0.10 × 0.10, 4.0 / 3.5 / 3.5 m, TW_CoveBoom (red/white stripes),
                modelled vertical (open) in v1; closed height 0.95 m
RFID pedestal:  (185.8, -188.6) on the divider, 0.4 × 0.4 × 1.3, permanent COL
Guard point:    (180.0, 0, -184.5), yaw -π/2 (faces the visitor lane) — NPC is [v3]
Monument signs: "COVE HEIGHTS", 3.2 × 0.7 × 1.8 stone plinth with gold lettering 2 cm proud, yaw π (faces arrivals):
                (168.0, -166.0) and (195.6, -166.0)
```

**Residents-only by design, open in v1.** The gate is fully walkable in v1: the five toggle boxes are **not** exported in
`cove_heights.colsrc.glb`; they are listed in `cove_heights.layout.json` → `gate.toggle[]` (§ 14) so the runtime can add them
later. With all five active, the line z = −190 is sealed (every gap ≤ 0.17 m) and the only way in is Portal E, whose box the
client skips for players allowed in (same mechanism as a locked house door, `docs/OPEN_WORLD.md` § 8).

**Pedestrian checkpoint** (layout `checkpoint`):

```
id:        "cove_heights_main"
position:  (190.95, 0, -188.0), yaw 0 (faces into the estate)
trigger:   x 189.75 → 191.55, z -189.72 → -186.0 (the east sidewalk in front of Portal E, up to Pier E1/E2's south faces)
v1:        exported, unused by the client (no prompt, no block)
```

### 6.3 Emergency gate (north wall) [v1]

```
Opening:     x 176.73 → 183.27 (6.54 m clear) between piers NW (176.45, -330) and NE (183.55, -330), 0.56 × 0.56 × 3.20
Leaves:      two swing leaves x 176.75–179.99 and 180.01–183.25, 0.06 m thick, y 0.06 → 2.26, TW_CoveIron bar pattern, closed
Lock:        padlock prop on the meeting stiles; locked in v1 (permanent COL), event hook reserved [v3]
Approach:    emergency lane § 4.4 (opposite side of the estate from the main gate)
```

### 6.4 CCTV [v2]

10 cameras (`cctv`): piers W1 and E1, guardhouse roof corners (2), the four wall corners, emergency piers (2). No collision
(mounted ≥ 2.6 m).

---

## 7. Plot Subdivision Matrix [v1 plots, v3 houses]

### 7.1 Lot rules

| | Type A — Estate villa | Type B — Executive home |
|-|------------------------|--------------------------|
| Lot | 28 × 28 m (784 m²) | 20 × 20 m (400 m²) |
| Setbacks (from lot lines) | front 4.3, side 3.0, rear 4.0 | front 4.0, side 2.0, rear 3.5 |
| Curb face → facade | 4.3 + 1.65 = 5.95 m | 4.0 + 1.65 = 5.65 m |
| Envelope | 22.0 × 19.7 m | 16.0 × 12.5 m |
| Max house footprint (v3) | 16 × 17 m = 272 m² (34.7 %) | 14 × 12.5 m = 175 m² (43.75 %) |
| Driveway | 3.0 × 5.0 m | 2.4 × 5.0 m |
| v1 content | lot lawn, low hedge on side and rear lines (0.40 m, centred on the line, one hedge per shared line), driveway, postbox with the lot ID | same |

Postbox (`postbox`): 0.25 × 0.4 box on a 1.0 m post, lot ID in `text_mesh` 2 cm proud, 0.6 m from the driveway edge, 0.4 m
inside the front line, `COL_Cove_Postbox_<id>` 0.35 × 0.45 × 1.2. Entry point = driveway mouth on the front line; entry yaw
looks into the lot.

### 7.2 Lots

| ID | Type | Bounds x | Bounds z | Centre | Faces | Driveway (x0–x1, z0–z1) | Entry (x, z) | Entry yaw | Postbox |
|----|------|----------|----------|--------|-------|-------------------------|--------------|-----------|---------|
| B-01 | B | 150–170 | −193 – −213 | (160, −203) | N | 163.8–166.2, −208 – −213 | (165.0, −213.0) | π | (163.2, −212.6) |
| B-02 | B | 130–150 | −193 – −213 | (140, −203) | N | 138.8–141.2, −208 – −213 | (140.0, −213.0) | π | (138.2, −212.6) |
| B-03 | B | 103–123 | −213 – −233 | (113, −223) | E | 118–123, −228.3 – −230.7 | (123.0, −229.5) | π/2 | (122.6, −227.7) |
| B-04 | B | 103–123 | −233 – −253 | (113, −243) | E | 118–123, −246.8 – −249.2 | (123.0, −248.0) | π/2 | (122.6, −246.2) |
| B-05 | B | 103–123 | −253 – −273 | (113, −263) | E | 118–123, −266.8 – −269.2 | (123.0, −268.0) | π/2 | (122.6, −266.2) |
| B-06 | B | 103–123 | −273 – −293 | (113, −283) | E | 118–123, −275.8 – −278.2 | (123.0, −277.0) | π/2 | (122.6, −275.2) |
| A-01 | A | 112–140 | −299 – −327 | (126, −313) | S | 136.5–139.5, −299 – −304 | (138.0, −299.0) | 0 | (135.9, −299.4) |
| A-02 | A | 140–168 | −299 – −327 | (154, −313) | S | 158.5–161.5, −299 – −304 | (160.0, −299.0) | 0 | (157.9, −299.4) |
| A-03 | A | 192–220 | −299 – −327 | (206, −313) | S | 198.5–201.5, −299 – −304 | (200.0, −299.0) | 0 | (202.1, −299.4) |
| A-04 | A | 220–248 | −299 – −327 | (234, −313) | S | 220.5–223.5, −299 – −304 | (222.0, −299.0) | 0 | (224.1, −299.4) |
| B-07 | B | 237–257 | −273 – −293 | (247, −283) | W | 237–242, −275.8 – −278.2 | (237.0, −277.0) | −π/2 | (237.4, −275.2) |
| B-08 | B | 237–257 | −253 – −273 | (247, −263) | W | 237–242, −266.8 – −269.2 | (237.0, −268.0) | −π/2 | (237.4, −266.2) |
| B-09 | B | 237–257 | −233 – −253 | (247, −243) | W | 237–242, −246.8 – −249.2 | (237.0, −248.0) | −π/2 | (237.4, −246.2) |
| B-10 | B | 237–257 | −213 – −233 | (247, −223) | W | 237–242, −228.3 – −230.7 | (237.0, −229.5) | −π/2 | (237.4, −227.7) |
| B-11 | B | 214–234 | −193 – −213 | (224, −203) | N | 218.8–221.2, −208 – −213 | (220.0, −213.0) | π | (221.8, −212.6) |
| B-12 | B | 194–214 | −193 – −213 | (204, −203) | N | 197.8–200.2, −208 – −213 | (199.0, −213.0) | π | (200.8, −212.6) |

IDs run clockwise in plan from the gate (south-west → west → north → east → south-east). "Faces" is the compass side of the
lot that fronts the loop.

### 7.2b First house — Colonial Villa on A-02 [v3 started, walk-in, for sale]

A real house of the game, like the 10 town houses: it can be bought (20 000 coins, daily property tax), entered through its
hinged front door, furnished from Cove Home, locked and shared with keys. Built by the house generator
`map-src/CampusCove/build_house_v2.py` (key `cove_villa_a02`, palette `colonial`), which cuts every window in both shells
(real see-through glass) and builds the interior, the stair and the collision from the same plan; lighting is baked by
`build_house_lightmaps.py`.

```
Key / name:     cove_villa_a02 / "Colonial Villa" — front/src/game/assets/catalog.ts, HousingUnitSeeder (buy, 20 000)
Lot point:      plan (150, -309.3) = world (-281, -291.3), rotationY 0 (front looks +Z, south)
Door point:     world (-281, 1.25, -286.5); interiorOffset [0, 0.2, -1.405]
Main block:     13.0 x 10.6 m, two storeys (duplex plan: entry + stair, bath, living, kitchen / landing, 3 bedrooms),
                gable roof + centre cross gable over the door, chimney, front porch with railings
Garage wing:    `wing` option of the generator, east side, 7.4 x 8.0 m, one storey, walk-in and furnishable: concrete
                floor, side window, doorway from the living room; street-facing gable roof, closed carriage door (visual)
Interior bounds (seeder): x -6.295..13.695, z -5.0..5.2, maxY 5.6
Zone wiring:    `buildings` of the cove_heights zone + the `COL_House_cove_villa_a02` placeholder in town.collision.json
                (apply-cove-heights.mjs, from cove_heights.layout.json "houses")
Lot dressing:   garage apron, front path to the porch step, lamp post, boxwood hedge, white hydrangeas (estate GLB)
```

Rebuild: `build_house_v2.py` with `HOUSE_KEYS = ["cove_villa_a02"]` → `npm run assets:optimize -- houses cove_villa_a02` →
`blender --background --factory-startup --python map-src/CampusCove/build_house_lightmaps.py -- cove_villa_a02` → optimize
again → copy `preview.png` → `make seed`. The garage doorway has a white lining and casings; two-storey
shells are cut per storey so a ground-floor doorway never meets an upstairs window in the same run.

### 7.2c House programme [v3, design]

The 16 lots get 16 different houses, each a model of its own, like an upscale American gated suburb where the
Architectural Review Committee (ARC) never lets two neighbours look alike. Every house is a `build_house_v2.py` entry
(interior contract unchanged: floor y 0, front outer face z 5.2, door at x 0, rooms toward −Z), so variety comes from the
generator options and palettes, not from hand-modelled one-offs (CLAUDE.md modular rule). Keys: villas `cove_villa_a0N`,
executive homes `cove_home_b0N`. Sources: the style catalog, floor plans and desirability research in
[`research/luxury-suburban-houses/REPORT.md`](research/luxury-suburban-houses/REPORT.md) (notes in `notes/`).

#### 7.2c.1 Design guidelines (anti-monotony rules)

Terms: **adjacent** = lots sharing a lot line. **Visible pairs** = lots that see each other across open ground: B-01/B-12
(boulevard, the gateway pair), A-02/A-03 (emergency lane), B-02/B-03 (SW pocket garden), B-06/A-01 (NW corner),
A-04/B-07 (NE corner), B-10/B-11 (SE swale). The inner block is communal, so no lot faces another across the loop.

| # | Rule | How it is checked |
|---|------|-------------------|
| R1 | **One model per lot.** No model key, plan width or palette is used twice in the estate, mirrored copies included. | `HOUSES` keys and palettes unique |
| R2 | **Style groups do not touch.** Groups: *Classical* (Colonial, Georgian, French Country), *Vernacular/Coastal* (Cape Cod, Lowcountry, Shingle), *Picturesque* (Tudor, Queen Anne, Craftsman), *Mediterranean* (Tuscan, Mission), *Modern* (Modern Farmhouse, Scandinavian, Prairie, Mid-Century, Contemporary). Adjacent lots and visible pairs belong to different groups. | table 7.2c.2 |
| R3 | **Colour families.** Body colour belongs to one family: **W** white/cream, **Y** yellow/ochre/sand, **R** red brick, **G** green/sage, **B** blue/grey-blue, **D** dark (charcoal/black), **N** natural wood/tan, **P** pink/lilac, **S** stone/greige. Adjacent lots and visible pairs use different families; no family on more than 4 lots (25 %). Front door colours are all different. | table 7.2c.2 (W 4, N 3, Y 2, D 2, others 1) |
| R4 | **Roofs.** Adjacent lots differ in primary roof form (side gable `gable_x`, front gable `gable_z`, hip, flat, gambrel, shed). A form used on several lots (side gable: 6) carries a different secondary element each time (cross gable, dormers, gallery, portico, end chimneys, steep half-timbered cross gable). Roof colours of adjacent lots differ. | table 7.2c.2 |
| R5 | **Massing rhythm.** Each 4-lot band (west, east) has at least one single-storey home and no more than three two-storey homes in a row. The boulevard frontage (B-01, B-12) is the gateway and stays two-storey on both sides. | west 1-2-2-2, east 1-2-1-2 |
| R6 | **Staggered facades.** Facades of adjacent lots are at least 0.6 m apart in setback (executives alternate 4.0 / 5.0 m, villas 5.0–6.3 m). The gateway pair mirrors on purpose (both 4.0 m). | column *s* in 7.2c.3 |
| R7 | **Garages never lead.** Garage doors take at most 40 % of the street frontage; the garage face is never in front of the main facade (no "snout houses"); it sits at least 5.0 m behind the front lot line (the driveway length; less only with a paved apron). Adjacent lots use a different garage expression (flush wing, recessed wing, two-bay wing, carport, no garage) or door style (carriage, plank, flush, glass). The two forced garage-to-garage pairs (B-05/B-06, B-07/B-08, driveways paired on the shared line by § 7.2) differ in both wing roof and door style. | 7.2c.2 garage column |
| R8 | **Entries.** Every house has a different entry type (porch, loggia, portico, gallery, wrap porch, stoop, canopy, pergola). Open porches, loggias and steps may project up to 2.8 m into the front setback and stay ≥ 1.4 m from the front lot line; eaves up to 1.2 m into side setbacks; an open wrap porch may take up to 2.0 m of a side setback when the neighbouring building stays ≥ 4.0 m away. | generator porch depth |
| R9 | **Windows.** Shutters only on traditional styles (Classical, Vernacular, Picturesque, Tuscan). Window frame colour (white / black / bronze / wood) differs on adjacent lots. | `frame` palette key |
| R10 | **Unifying elements** (the estate still reads as one place): standard postbox with the lot ID, 0.40 m lot hedges, cobble driveways, one 2.6 m lot lamp by the front path, warm 2700 K lanterns, house numbers in the same gold lettering. | site build, unchanged per lot |
| R11 | **Envelope and coverage.** Main block + wing stay inside the § 7.1 envelope; coverage ≤ 35 % (villa) / ≤ 45 % (executive). | 7.2c.3 |

#### 7.2c.2 Lot assignments

Prices: town houses cost 2 400–5 200 coins; executive homes 10 000–15 500 (single-storey 10 000–11 500, two-storey
12 000–15 500); villas 20 000–32 000. Families and groups as in R2/R3. "+x" / "−x" = side of the garage in the house's own
frame (+x is on the right seen from the street); "−x" needs a mirrored wing (7.2c.5 #2).

| Lot | Model (key) | Style · group | St. | Roof | Palette idea (body / trim / roof / door) · family | Garage | Signature feature | Price |
|-----|-------------|---------------|-----|------|-------------------------------------------------|--------|-------------------|-------|
| A-01 | **Villa Serena** (`cove_villa_a01`) | Tuscan Mediterranean · Med | 2 | hip, terracotta, rise 2.6 | sand-ochre stucco `#e6c495` / cast stone `#efe3cc` / terracotta `#c2643f` / walnut `#5a3a22`, olive shutters, bronze frames · **Y** | two-bay wing +x, flat roof terrace, two plank doors; motor court flared from the driveway | three-arch loggia carrying a wrought-iron balcony with French doors | 26 000 |
| A-02 | Colonial Villa (`cove_villa_a02`, built) | American Colonial · Classical | 2 | side gable + centred cross gable, charcoal | white clapboard `#f4f2ec` / white / `#3e4248` / teal `#365f63` · **W** | two-bay wing +x, street gable, one carriage door | columned front porch under the cross gable | 20 000 |
| A-03 | Harbor Shingle House (`cove_villa_a03`) | New England Shingle · Vernacular | 2 | gambrel (side), weathered cedar `#7d7468` | natural cedar shakes `#b8875a` / white `#f7f5ef` / cedar grey / barn red `#8e2f2a`, white frames · **N** | two-bay wing −x, street gable, white carriage doors | wrap-around porch turning the east corner | 28 000 |
| A-04 | Skyline Residence (`cove_villa_a04`) | Contemporary · Modern | 2 | flat, stepped volumes | graphite render `#4a4d52` + cedar slat panels `#a8774f` + white soffits / black frames / dark deck / oak `#b98b58` · **D** | two-bay wing −x pushed to the envelope, flat roof terrace; flush aluminium doors; motor court from the edge driveway | garage roof terrace with timber pergola and glass balustrade | 32 000 |
| B-01 | Tidewater House (`cove_home_b01`) | Lowcountry coastal · Vernacular | 2 | side gable, silver standing seam `#a6abb0` | butter yellow `#f0d98c` / white / silver / haint blue `#8fb8c9` · **Y** | single wing −x, recessed 1.5 m, white carriage door | full-width two-tier gallery (double porch) | 14 000 |
| B-02 | Maison Lavande (`cove_home_b02`) | French Country · Classical | 2 | steep hip, slate `#5d6670` | greige limestone `#d8d3c8` / cream / slate / French blue `#3f5d73`, blue-grey shutters · **S** | none: the centred driveway becomes a gravel *cour d'honneur* with two lanterns and clipped hornbeam | symmetric five-bay facade with tall French windows | 15 500 |
| B-03 | Nantucket Cape (`cove_home_b03`) | Cape Cod · Vernacular | 1 | steep side gable (rise 3.6), charcoal `#4b4f55` | grey-blue shingles `#9fb3c2` / white / charcoal / red `#a33a33`, flower boxes · **B** | single wing +x on a cottage, flush, white carriage door (door 0.5 m off the driveway axis, 0.6 m flare) | twin gable dormers | 10 000 |
| B-04 | Oak Park Prairie (`cove_home_b04`) | Prairie · Modern | 2 | low hip (rise 1.6), 1.2 m flying eaves, bronze `#5e5148` | tan roman brick `#c9a27a` / dark walnut bands `#5a4632` / bronze / walnut, bronze frames · **N** | single wing +x, recessed 1.0 m, low hip, flush walnut door | ribbon window bands under the broad eaves | 13 500 |
| B-05 | Ashbury Tudor (`cove_home_b05`) | Tudor Revival · Picturesque | 2 | steep side gable + steep off-centre cross gable, slate `#565a5f` | cream render `#efe6d2` + dark oak half-timber `#4a3426` / oak / slate / arched plank door `#6b4a2e` · **W** | single wing +x, flush, steep street gable, oak carriage door with arched lites | half-timbered cross gable with a front brick chimney | 13 000 |
| B-06 | Nordhaven (`cove_home_b06`) | Scandinavian modern · Modern | 2 | steep front gable (rise 4.0), no eaves, black standing seam `#2e3034` | black-stained battens `#26282b` / black / black / light oak `#c8a06a`, no shutters · **D** | single wing −x, recessed 1.0 m, flat black box, vertical cedar-slat door | glass gable end (full-height gable window) | 12 500 |
| B-07 | Rosemary Victorian (`cove_home_b07`) | Queen Anne · Picturesque | 2 | steep front gable, slate `#5b5f68` | lilac-blush `#d9b3c4`, fish-scale gable / cream spindles / slate / plum `#6a3550` · **P** | single wing +x, recessed 2.0 m, street gable, cream carriage door | polygonal bay window under the fish-scale gable + spindle porch | 14 500 |
| B-08 | Casa Mision (`cove_home_b08`) | Spanish Mission · Med | 1 | flat with shaped parapet, red tile pent canopy | white lime stucco `#f3eee4` / dark wood vigas / red tile `#b5543a` / turquoise `#2f8f8a` · **W** | single cottage wing −x, flush, flat parapet, arched plank door | curvilinear *espadaña* parapet with a bell niche | 11 000 |
| B-09 | Hartwell House (`cove_home_b09`) | Georgian · Classical | 2 | side gable, slate `#4a5058`, twin end chimneys | red brick `#9e4a36` / white `#f4f1e8` / slate / glossy black `#1e2024`, black shutters · **R** | single wing −x, recessed 1.0 m, hip, white carriage door with black hardware | pedimented two-column portico | 15 000 |
| B-10 | Palm Canyon (`cove_home_b10`) | Mid-Century Modern · Modern | 1 | shed (mono-pitch, rise 1.2) with clerestory | teak vertical siding `#8a5a36` + white panels / white / pebble `#9a9690` / mustard `#e0a23a` · **N** | open carport −x beside the house (2.9 × 6.0 m, slim black posts) on an extended driveway | breeze-block screen wall + clerestory band | 11 500 |
| B-11 | Arroyo Craftsman (`cove_home_b11`) | Craftsman · Picturesque | 2 | low side gable + front cross gable, 0.9 m eaves, brown `#5a4a3c` | sage-olive `#8f9e78` / cream / brown / stained fir `#8a5a32` · **G** | single wing +x, flush, low street gable, stained door with top lites | tapered columns on stone piers + knee brackets and rafter tails | 12 000 |
| B-12 | Hollow Creek Farmhouse (`cove_home_b12`) | Modern Farmhouse · Modern | 2 | front gable, black standing seam `#2b2d31` | white board-and-batten `#f5f4f0` / black frames / black / natural oak `#b88a5a` · **W** | single wing +x, recessed 1.0 m, street gable, black carriage door | full-width porch under a black standing-seam porch roof | 14 500 |

Rule check: R2 groups along the bands are west Vern-Mod-Pict-Mod, east Mod-Class-Med-Pict, south Class-Vern | Mod-Pict,
north Med-Class | Vern-Mod; R3 families west B-N-W-D, east N-R-W-P, south S-Y | W-G, north Y-W | N-D; R4 roofs west
gable_x-hip-gable_x-gable_z, east shed-gable_x-flat-gable_z, south hip-gable_x | gable_z-gable_x, north hip-gable_x |
gambrel-flat.

#### 7.2c.3 Fitting the lots

The house is placed by its **lot point** (the generator origin) and `rotationY` (front looks +Z in the house frame).
In the lot frame, *u* runs along the house's +x and *v* toward the street from the lot centre (executive half-depth 10 m,
villa 14 m). World plan point = lot centre + (u cos θ + v sin θ, −u sin θ + v cos θ), θ = rotationY: **S-facing 0,
E-facing π/2, W-facing −π/2, N-facing π**. With ZF = 4.0 everywhere, the facade is at v = v₀ + 4.0, so v₀ = half-depth −
s − 4.0. *d* = driveway axis offset from the lot centre, along u. A single garage wing is w = 4.0 m (3.6 m clear, 2.6 m
door); the garage centre sits on the driveway, which bounds the main width: W ≤ min(d, 6) + 6 (executive), W ≤ min(d, 7.3)
+ 7.3 (villa, 7.4 m wing). House depth = 5.61 − `back`.

| Lot | rotY | Garage side | d | Facade setback s | W max | W × back | Wing w × d (recess) | (u₀, v₀) | Footprint | Coverage |
|-----|------|-------------|---|------------------|-------|----------|----------------------|----------|-----------|----------|
| A-01 | 0 | +x | 12 | 5.3 | 14.6 | 14.0 × −5.6 | 7.4 × 8.4 (0) | (−3.5, 4.7) | 219.1 | 27.9 % |
| A-02 | 0 | +x | 6 | 6.3 | 13.3 | 13.0 × −5.0 | 7.4 × 8.0 (0) | (−4.0, 3.7) | 197.1 | 25.1 % |
| A-03 | 0 | −x | 6 | 6.0 | 13.3 | 13.0 × −6.0 | 7.4 × 8.0 (0) | (4.2, 4.0) | 210.1 | 26.8 % |
| A-04 | 0 | −x | 12 | 5.0 | 14.6 | 14.0 × −6.4 | 7.4 × 8.0 (0) | (3.4, 5.0) | 227.3 | 29.0 % |
| B-01 | π | −x | 5 | 4.0 | 11 | 11.0 × −5.6 | 4.0 × 7.0 (1.5) | (2.5, 2.0) | 151.3 | 37.8 % |
| B-02 | π | none | 0 | 5.0 | 14 | 14.0 × −5.6 | — | (0, 1.0) | 157.0 | 39.3 % |
| B-03 | π/2 | +x | 6.5 | 5.0 | 12 | 12.0 × −5.0 (1 st.) | 4.0 × 7.0 (0), door at u 6.0 | (−2.0, 1.0) | 155.3 | 38.8 % |
| B-04 | π/2 | +x | 5 | 4.0 | 11 | 11.0 × −5.0 | 4.0 × 7.0 (1.0) | (−2.5, 2.0) | 144.7 | 36.2 % |
| B-05 | π/2 | +x | 5 | 5.0 | 11 | 11.0 × −5.4 | 4.0 × 7.0 (0) | (−2.5, 1.0) | 149.1 | 37.3 % |
| B-06 | π/2 | −x | 6 | 4.0 | 12 | 10.0 × −5.4 | 4.0 × 7.0 (1.0) | (1.0, 2.0) | 138.1 | 34.5 % |
| B-07 | −π/2 | +x | 6 | 4.0 | 12 | 12.0 × −5.6 | 4.0 × 6.5 (2.0) | (−2.0, 2.0) | 160.5 | 40.1 % |
| B-08 | −π/2 | −x | 5 | 5.0 | 11 | 11.0 × −5.0 (1 st.) | 4.0 × 7.0 (0) | (2.5, 1.0) | 144.7 | 36.2 % |
| B-09 | −π/2 | −x | 5 | 4.0 | 11 | 11.0 × −5.6 | 4.0 × 7.0 (1.0) | (2.5, 2.0) | 151.3 | 37.8 % |
| B-10 | −π/2 | −x (carport) | 6.5 | 5.0 | 13.3 | 13.0 × −5.0 (1 st.) | carport 2.9 × 6.0 | (1.4, 1.0) | 155.3 | 38.8 % |
| B-11 | π | +x | 4 | 5.0 | 10 | 10.0 × −5.4 | 4.0 × 7.0 (0) | (−3.0, 1.0) | 138.1 | 34.5 % |
| B-12 | π | +x | 5 | 4.0 | 11 | 11.0 × −5.6 | 4.0 × 7.0 (1.0) | (−2.5, 2.0) | 151.3 | 37.8 % |

Notes: the duplex plan works from W ≈ 9 m; the cottage plan needs **W ≥ 11.0** (its bedroom partition at −xi + 4.4 must
clear the 1.2 m door), which is why the narrow B-11 lot (d = 4) is two-storey. On A-01 and A-04 the v1 driveway lies
outside the side setback line (§ 7.1 envelope ends 1 m short of its axis), so the garage is pushed to the envelope edge and
a paved motor court joins the two. B-10's driveway is extended 6.0 m into the lot under the carport. Every rear face stays
≥ 3.5 m (executive) / 4.0 m (villa) from the rear line.

#### 7.2c.4 Villa Serena on A-01 [built: cove_villa_a01, for sale 26 000]

**Why A-01.** It is the Colonial's west neighbour and the first house seen from the park's north path. A Tuscan villa
gives the strongest contrast allowed by R2–R4 (Mediterranean vs Classical, sand-ochre vs white, terracotta hip vs charcoal
gables, arched loggia vs columned porch, flat roof-terrace garage vs gabled garage) and matches the estate's own identity
(cream plaster walls, terracotta coping, § 1). It also brings the hip roof, which four more lots and the wing variants reuse.

**Placement**

```
Lot A-01: x 112–140, z −299 … −327, faces S, envelope x 115–137, z −303.3 … −323
Lot point:     plan (122.5, −308.3) = world (−308.5, −290.3), rotationY 0
Facade:        plan z −304.3 (setback 5.3 m; A-02 is at 6.3 → R6 stagger 1.0 m)
Main block:    plan x 115.5 → 129.5, z −304.3 → −315.51 (14.0 × 11.21)
Garage wing:   plan x 129.5 → 136.9, z −304.3 → −312.7 (7.4 × 8.4), doors centred at x 131.65 and 134.75
Loggia:        plan x 117.1 → 127.9, z −304.3 → −301.9, step to −301.5 (projection 2.8 m, 2.5 m left to the lot line)
Door point:    world (−308.5, 1.25, −285.5)  (= origin + ZF + 0.8, the site build's formula)
interiorOffset [0, 0.2, −1.405]
Seeder bounds: minX −6.795, maxX 14.195, minZ −5.6, maxZ 5.2, maxY 5.6 · price 26 000 · colour '#E6C495'
Coverage:      156.9 + 62.2 = 219.1 m² (27.9 %), GFA 2 × 156.9 + 62.2 = 376 m²
```

Derived generator values (T 0.2, GAP 0.005, FY 0.2): x_out 6.795, xi 6.595, OZ −1.405, ZB −7.21, DEPTH 11.21, ZC −1.605,
H_SHELL 6.10, y_eave 6.15. Wing: x 7.0 → 14.4, shell height 3.30; interior xi 13.995, zb −2.59, side window at z 1.205 ± 0.7;
living → garage doorway at z 2.8 ± 0.5 (unchanged rule). Garage room 7.34 × 7.59 m.

**HOUSES entry** (new keys marked in 7.2c.4 "new options"; everything else exists):

```python
"cove_villa_a01": dict(name="Villa Serena", W=14.0, ZF=4.0, back=-5.6, floors=2, mirror=False, palette="tuscan",
                       roof="hip", rise=2.6, cross=None, chimney=(-4.8, -2.0), windows="classic", flowers=False,
                       porch="loggia",
                       loggia=dict(w=10.8, d=2.4, pier=0.45, piers=(-5.175, -1.75, 1.75, 5.175), spring=2.25,
                                   arch_rise=0.55, side_rise=0.45, top=3.0, cornice=0.2, balcony=True),
                       french_front=True,
                       wing=dict(w=7.4, d=8.4, roof="flat", doors=2, door_w=2.6, door_h=2.3, door_style="plank")),
```

**Palette** (`PALETTES["tuscan"]`; the last line holds new optional keys, each falling back to today's fixed material when
absent, so the 11 existing houses do not change):

```python
"tuscan": dict(wall="#e6c495", wall_pat="noise", wall_acc="#d4ad7a", trim="#efe3cc", roof="#c2643f", roof_acc="#a5502f",
               shutter="#5b7046", door="#5a3a22", in_wall="#f5ecdc", in_bed="#eadcc4", floor="#c47a52", floor_acc="#a9643f",
               floor_pat="tiles", cabinet="#6c7a58", worktop="#ece4d6",
               frame="#3b3129", ridge="#a5502f", garage="#6e4a2c", garage_panel="#5d3e25", deck="#c97b55",
               deck_acc="#ad6443", chimney="stucco"),
```

**Feature map**

| Feature | Status | Notes |
|---------|--------|-------|
| Duplex plan (entry + stair, bath, living, kitchen / landing, 3 bedrooms), W 14, back −5.6 | exists | rooms scale with W and `back`; terracotta tile floors via `floor_pat="tiles"` |
| Walk-in garage wing on +x, doorway from the living room | exists | w 7.4, d 8.4 are plain values |
| Window cutting in both shells, glass, interior casings | exists | |
| `windows="classic"` dressing with shutters | exists | olive shutters from the palette |
| Chimney | exists | material and hood are new (below) |
| Hip roof (`roof="hip"`) | **new** | N1 |
| Palette keys `frame`, `ridge`, `garage`, `garage_panel`, `deck`, `chimney` | **new** | N2 |
| Loggia porch (`porch="loggia"`) + shared `L.arch_panel` | **new** | N3 |
| Balcony railing + shared `L.railing` | **new** | N4 |
| French door at the upstairs front (`french_front`) | **new** | N5 |
| Wing `roof="flat"` (terrace + parapet), `doors=2`, `door_style="plank"` | **new** | N6 |

**New generator options (geometry, exterior frame: origin at the lot point, front face z = ZF = 4.0, y up)**

*N1 — hip roof.* Shared builder `L.hip_roof(coll, name, gx, gz, y_drip, sx, sz, rise, thick, mat)` in `lib_common.py`:
a closed prism over the drip rectangle sx × sz centred on (gx, gz). Ridge along the longer side, inset by min(sx, sz)/2 from
every drip edge (45° hips, equal pitch on all four slopes); ridge length |sx − sz| (0 → pyramid). Top verts: 4 drip corners
at `y_drip`, 2 ridge ends at `y_drip + rise`; underside: one flat soffit quad at `y_drip − thick`; 4 vertical edge strips.
16 triangles. The generator's `hip_roof_main` computes, with eave e = `h.get("eave", EAVE)` (0.6) and pitch
t = rise / (min(W, DEPTH) / 2):
```
drip rectangle  sx = W + 2e = 15.2, sz = DEPTH + 2e = 12.41, centre (0, ZC = −1.605)
y_drip (top)    = y_eave + 0.18 − e·t = 6.15 + 0.18 − 0.6 × 0.4639 = 6.052     (0.18 = top of the gable slabs above their plane)
ridge           x −1.395 → +1.395 at z ZC, y = y_eave + rise + 0.18 = 8.93 (24.9°)
soffit          y 5.892 (thick 0.16); the roof top over the wall line is 6.33 > shell top 6.15, the walls end inside the prism
fascia          4 boxes 0.06 thick, y 5.85 → 6.07, outer face 0.04 beyond the drip edge; front/back runs 15.36 long so their
                ends stand 0.03 clear of the side runs' faces (MIN_GAP)
ridge cap       EX_RidgeCap 3.09 × 0.24 × 0.12 on the ridge, E["ridge"]
hip caps        EX_RidgeHip0..3 = L.beam from each ridge end to its two drip corners, section 0.20 × 0.10, E["ridge"]
```
`L.beam(coll, name, p0, p1, w, h, mat)` is a new shared builder (a box oriented from p0 to p1; not grounded, so its
prefix is allow-listed like the roof slabs); it also serves half-timbering, rafter tails and handrails later.
No gable vents for hips. Allow-list prefixes: `EX_Roof`, `EX_Ridge`, `EX_Fascia` (existing).

*N2 — palette-driven materials.* In `build_exterior`: `E["frame"]` = `EX_<key>_Frame` from `C["frame"]` (else `E["trim"]`),
used by `dress()` for JambA, JambB, Mullion and Transom only (head and sill stay trim = cast stone); `E["ridge"]` from
`C["ridge"]` (else `E["metal"]`) for ridge and hip caps; `E["garage"]`/`E["garage_panel"]` named `EX_<key>_GarageDoor*`
when the palette has them (else the shared white ones); `E["deck"]` = `EX_<key>_Deck` tiles from `deck`/`deck_acc` (else
`EX_PorchDeck`); `chimney="stucco"` builds `EX_Chimney` in `E["siding"]`, its cap in `E["trim"]`, plus `EX_ChimneyHood` =
`L.hip_roof` 1.2 × 1.2, rise 0.3, thick 0.06, `E["roof"]`, on the cap (top 9.30 → cap 9.42 → hood 9.72; the stack rises
2.1 m above the west slope at x −4.8, z ZC − 2.0).

*N3 — loggia* (`porch="loggia"`, values from `h["loggia"]`):
```
floor      EX_LoggiaFloor   x −5.4 → 5.4, z 4.0 → 6.4, y 0 → 0.16, E["deck"]           (same top as the porch deck)
step       EX_LoggiaStep    x −1.2 → 1.2, z 6.4 → 6.8, y 0 → 0.08, E["step"]
piers      EX_LoggiaPier0..3 0.45 × 0.45, centres x −5.175 −1.75 1.75 5.175, z 6.175, y 0.16 → 3.0, E["siding"]
bases      EX_LoggiaPierBase 0.55 × 0.55, y 0.16 → 0.46, E["trim"];  imposts 0.53 × 0.53, y 2.17 → 2.25, E["trim"]
pilasters  EX_LoggiaPilaster0/1 x ±5.175, z 4.0 → 4.12 (0.45 × 0.12), y 0.16 → 3.0, against the shell face
front arch L.arch_panel(axis "x", fixed z 6.175, depth 0.45, spring 2.25, rise 0.55, top 3.0, seg 8) for the bays
           x −4.95 → −1.975, −1.525 → 1.525, 1.975 → 4.95; crowns at 2.80 (R 2.287 / 2.389 / 2.287)
side arch  same at x ±5.175 (axis "z"), z 4.12 → 5.95, rise 0.45 (crown 2.70)
keystones  0.22 × 0.47 at each front crown, y 2.70 → 3.00, E["trim"] (0.01 proud of each arch face)
cornice    EX_LoggiaCornice x −5.5 → 5.5, z 4.0 → 6.5, y 3.0 → 3.2, E["trim"] (soffit of the loggia, edge of the balcony)
balcony    EX_BalconyDeck x −5.38 → 5.38, z 4.07 → 6.38, y 3.2 → 3.22, E["deck"] (the 3.08–3.24 floor band shows as a skirting)
```
Each arch bay frames an opening behind it: the centre bay the door, the side bays the living window (x 2.25–4.85) and the
west window (x −3.80 to −2.20); the porch lamp at x 1.0 stays inside the centre bay. `L.arch_panel(coll, name, axis,
fixed, a0, a1, y_spring, rise, y_top, depth, mat, seg=8)` is a new shared builder: segmental arch, radius
R = (c²/4 + f²) / 2f, centre y = spring + f − R, intrados points at angles −φ₀…φ₀ (φ₀ = asin(c / 2R)); built as `seg`
vertical strips (front and back quads from the arc up to `y_top`, an intrados soffit quad per strip, one top quad), ≈ 50
triangles a bay; the ends against the piers are not built. Reused later by B-08 (Mission arcade, espadaña), garden gates and
the clubhouse. Collision: the four front piers get `COL_` boxes in the **site** build (below); the floor (0.16) and step
(0.08) are walk-over. With `porch="loggia"` the generator skips the bush pair at ±(porch_w/2 + 0.7) and keeps the pair at
±(hw − 0.4); `pw` for that test is `loggia.w`.

*N4 — balcony railing.* Shared builder `L.railing(coll, name, pts, y0, h, step, mat, post=0.08, bar=0.025)`: top rail
0.05 × 0.05 at y0 + h − 0.05, bottom rail at y0 + 0.12, square bars every `step`, newel posts at each point. Here
`pts = [(−5.35, 4.10), (−5.35, 6.40), (5.35, 6.40), (5.35, 4.10)]`, y0 3.22, h 0.95, step 0.30, `EX_MetalDark`
(≈ 50 bars). Visual only (the balcony is not walkable in v3). The porch rails of `porch()` can later move to it.

*N5 — French door* (`french_front=True`): in `duplex()` the Bed1 front window (level 1, centred on rmid = 1.33, 2.2 wide →
x 0.23 → 2.43) is recorded with `kind="french"`, `y=(0.05, 2.30)` (world 3.25 → 5.50, above the balcony deck). Exterior:
glass is cut as for a window (y0 > 0.01); `dress()` builds jambs, head, mullion and transom in `E["frame"]` and the shutters,
no sill or flower box. Interior: casings like a doorway (no sill) **plus a blocking box** `COL_Window_<i>_French` filling the
hole (x 0.23 → 2.43, the wall thickness, y 3.05 → 5.30), because an interior hole has no collision and the player must not
step out. `kind="french"` is a general option of `Plan.window`.

*N6 — wing variants.* `wing["roof"]`: `"gable_z"` (default, today) or `"flat"`; `wing["doors"]`: 1 (default) or 2;
`wing["door_style"]`: `"carriage"` (default) or `"plank"`. For Villa Serena (cx = 10.7, doors centred at cx ± 1.55):
```
flat roof   EX_WingRoofDeck  x 7.0 → 14.22, z −4.22 → 3.82, y 3.35 → 3.43, E["deck"] (on EX_WingShellTop 3.30 → 3.35)
parapet     EX_WingParapetF  x 7.0 → 14.22, z 3.82 → 4.08, y 3.30 → 3.85, E["siding"]
            EX_WingParapetB  x 7.0 → 14.22, z −4.48 → −4.22
            EX_WingParapetE  x 14.22 → 14.48, z −4.48 → 4.08
            (faces 0.03 clear of the corner boards: main EX_Corner+1F front face 4.05, wing corner boards x 14.45 / z −4.45)
caps        EX_WingParapetCapF x 7.0 → 14.18, z 3.78 → 4.12 · CapB x 7.0 → 14.18, z −4.52 → −4.18 · CapE x 14.18 → 14.52,
            z −4.52 → 4.12 · y 3.85 → 3.91, E["trim"] (front/back caps stop at the east cap: no overlapping top faces)
            the upstairs east windows (sill 4.10) stay above the caps
doors       EX_GarageDoor0/1 2.6 × 0.06 × 2.3 at x 9.15 / 12.25, z 4.03, E["garage"] with vertical planks (UVs turned 90°,
            new helper rot_uvs90); 2 iron straps per door 2.2 × 0.02 × 0.06 at y 0.55 and 1.85, z 4.07, E["metal"];
            3 casings per door (head door_w + 0.36, jambs 0.18); 0.5 m of siding between the doors
lanterns    x 7.30 and 14.10 (door edges ± 0.55)
interior    two Garage_DoorInside boxes at the same x; nothing else changes
```
With `roof="flat"` the wing's gable, ridge cap, gable vent and fascia are skipped. Allow-list: `EX_Wing`, `EX_Garage`
(existing).

Triangle cost of the new parts ≈ 1.6 k (hip 0.1 k, loggia 0.5 k, railing 0.7 k, wing terrace and doors 0.25 k).

**Lot dressing** (`build_cove_heights_site.py`, plan coordinates, same helpers as A-02):

```python
VILLA_A01 = {"key": "cove_villa_a01", "name": "Villa Serena", "lot": "A-01", "origin": (122.5, -308.3), "zf": 4.0,
             "interiorOffset": [0.0, 0.2, -1.405], "price": 26000, "garage_doors": ((9.15, 2.6), (12.25, 2.6))}
# front_z = -304.3
S.rect(est, "CH_LotA01_MotorCourt", 130.2, -300.5, 136.5, -304.3, Y["lot"], Y["drive"], M["drive"])  # meets the v1 driveway at x 136.5
S.rect(est, "CH_LotA01_FrontPath", 121.7, -299.0, 123.3, -301.5, Y["lot"], Y["drive"], M["drive"])   # to the loggia step
S.street_lamp(est, "CH_LotA01_PostLamp", 124.1, -300.2, M, h=2.6)
S.hedge_run(est, "CH_LotA01_HedgeW", (117.3, -301.4), (121.1, -301.4), HM, w=0.5)
S.hedge_run(est, "CH_LotA01_HedgeE", (123.9, -301.4), (127.7, -301.4), HM, w=0.5)
S.tree(est, "CH_LotA01_Cypress0", 116.2, -302.4, M, "cypress", 0.9)
S.tree(est, "CH_LotA01_Cypress1", 128.7, -302.4, M, "cypress", 0.9)
for k, px in enumerate((-5.175, -1.75, 1.75, 5.175)):            # loggia piers (the house collision does not cover them)
    est.col(f"LotA01_LoggiaPier{k}", 122.5 + px, -302.125, 0.45, 0.45, 3.0)
est.col("HousePlaceholder", 122.5 + 3.7, -308.3 - 1.605, 21.4, 11.21, 6.0)
est.cols[-1]["name"] = "COL_House_cove_villa_a01"
HOUSES = [VILLA_A02, VILLA_A01]
```
The postbox (135.9, −299.4) stays outside the motor court (z ≤ −300.5).

**Wiring and rebuild.** `catalog.ts` `house('cove_villa_a01', 'Villa Serena')`; `HousingUnitSeeder`
`['cove_villa_a01', 'buy', 26000, -308.5, 1.25, -285.5, '#E6C495']` and the bounds above; then the § 7.2b sequence with
`HOUSE_KEYS = ["cove_villa_a01"]`, the site build, `apply-cove-heights.mjs`, `make seed`. Rebuild `cove_villa_a02` once
after N2/N6 land to confirm the defaults left it byte-for-byte equivalent (same materials, same node names).

#### 7.2c.6 Harbor Shingle House on A-03 [built: cove_villa_a03, for sale 28 000]

**Why A-03.** It is the first house seen after the emergency lane and the counterpart of the Colonial across it (visible
pair A-02/A-03). A New England Shingle summer house is the warmest contrast the rules allow: natural cedar shakes against
white clapboard, a side gambrel against side gables, a wrap-around porch against a front porch, and an informal "living
hall" plan inside against the formal centre hall. It also brings four generator features that other lots reuse: the
mirrored wing (garage on −x), the gambrel, the `shakes` wall texture and the wrap porch.

**Rule check** (adjacent: A-04; visible pair: A-02)

| Rule | A-03 | A-04 (adjacent) | A-02 (visible pair) | Result |
|------|------|-----------------|---------------------|--------|
| R1 | key `cove_villa_a03`, palette `harbor`, W 13.0 | W 14.0 | **W 13.0** | key and palette unique; plan width repeats A-02, accepted (Decisions below) |
| R2 | Vernacular | Modern | Classical | ok |
| R3 | N (cedar), door barn red `#8e2f2a` | D | W | ok; N is used 3 times (A-03, B-04, B-10) |
| R4 | gambrel, weathered cedar `#7d7468` | flat, dark deck | side gable + cross gable, charcoal | ok |
| R6 | setback 6.0 | 5.0 | 6.3 | stagger 1.0 m with A-04 |
| R7 | two-bay wing −x, street gable, two white carriage doors, flush, 6.0 m behind the front line; doors 5.2 m of 20.4 m frontage (25 %) | flat terrace, flush aluminium | one wide carriage door | ok |
| R8 | wrap porch (unique entry); front run 2.4 m + step 0.4 m = 2.8 m, 3.2 m from the front line | | | ok; the east run takes 1.6 m of the 3.0 m side setback (roof 1.9 m), allowed for open wrap porches, 4.4 m to A-04's garage |
| R9 | shutters (traditional), white frames | black frames | white frames | ok (R9 is checked on adjacent lots) |
| R10 | postbox, 0.40 m hedges, cobble driveway and apron, 2.6 m lot lamp | | | ok |
| R11 | main + wing inside the envelope; 26.8 % (31.6 % with the porch decks) | | | ok |

Across the lane the two garage wings face each other (A-02 east wing, A-03 west wing): different style group, body
colour, roof form and door count, so the pair still reads as two different houses.

**Placement**

```
Lot A-03: x 192–220, z −299 … −327, faces S, envelope x 195–217, z −303.3 … −323
Lot point:     plan (210.2, −309.0) = world (−220.8, −291.0), rotationY 0      (lot centre (206, −313) + (u₀, v₀) = (4.2, 4.0))
Facade:        plan z −305.0 (setback 6.0 m; A-04 is at 5.0 → R6 stagger 1.0 m)
Main block:    plan x 203.7 → 216.7, z −305.0 → −316.61 (13.0 × 11.61)
Garage wing:   plan x 196.3 → 203.7, z −305.0 → −313.0 (7.4 × 8.0), centre x 200.0 on the driveway axis,
               doors centred at x 201.55 and 198.45 (house x −8.65, −11.75)
Wrap porch:    front run plan x 208.6 → 218.6, z −305.0 → −302.6, step to −302.2 (projection 2.8 m, 3.2 m left to the lot line)
               east run plan x 216.7 → 218.6, z −312.2 → −305.0; roof drip to x 218.9 (1.1 m from the lot line at x 220)
Door point:    world (−220.8, 1.25, −286.2)  (= origin + ZF + 0.8, the site build's formula)
interiorOffset [0, 0.2, −1.405]
Seeder bounds: minX −13.695, maxX 6.295, minZ −6.0, maxZ 5.2, maxY 5.6 · price 28 000 · colour '#B8875A'
Coverage:      150.9 + 59.2 = 210.1 m² (26.8 %), porch decks 37.7 m² more; GFA 2 × 150.9 + 59.2 = 361 m²
```

Derived generator values (T 0.2, GAP 0.005, FY 0.2): x_out = W/2 − T − GAP = 6.295, xi = 6.095, OZ = ZF − T − GAP − 5.2 =
−1.405, ZB = OZ + back − GAP − T = −7.61, DEPTH = ZF − ZB = 11.61, ZC = −1.805, H_SHELL = FY + 5.6 + 0.3 = 6.10,
y_eave 6.15; interior zi_f 5.0, zi_b −5.8. Wing (east frame, mirrored to −x by H1): x_in 6.5, x_ext 13.9, xo 13.695,
xi 13.495, zb = 5.2 − 8.0 + 3T + 2GAP = −2.19, shell height 3.30; side window at z 1.405 ± 0.7 on the west end; garage room
7.34 × 7.19 m. The mudroom → garage doorway is set by the harbor plan (7.2d.1): west wall, z 0.2 → 1.2.

**HOUSES entry** (new keys marked in the feature map; everything else exists):

```python
"cove_villa_a03": dict(name="Harbor Shingle House", W=13.0, ZF=4.0, back=-6.0, floors=2, mirror=False, palette="harbor",
                       roof="gambrel_x", rise=3.3, eave=0.45, gambrel=dict(run=1.0, knee=1.5, rake=0.3),
                       cross=None, chimney=(2.6, 0.45), windows="classic", flowers=False,
                       porch="wrap",
                       wrap=dict(corner="east", x0=-1.6, d=2.4, side_d=1.9, z1=-3.2, high=2.86, drop=0.40, over=0.3, step_w=1.8,
                                 posts=((-1.48, 6.28), (1.15, 6.28), (3.527, 6.28), (5.903, 6.28), (8.28, 6.28),
                                        (8.28, 3.94), (8.28, 1.6), (8.28, -0.74), (8.28, -3.08),
                                        (-1.48, 4.12), (6.62, -3.08))),
                       wing=dict(w=7.4, d=8.0, rise=2.2, side="west", doors=2, door_w=2.6, door_h=2.3, door_style="carriage"),
                       interior=dict(plan="harbor", style="harbor")),
```

**Palette** (`PALETTES["harbor"]`; `frame` and `garage` are left out on purpose: frames fall back to the white trim and the
carriage doors to the shared white `EX_GarageDoor`):

```python
"harbor": dict(wall="#b8875a", wall_pat="shakes", wall_acc="#8a623e", trim="#f7f5ef", roof="#7d7468", roof_acc="#6a625a",
               shutter="#3e4f45", door="#8e2f2a", in_wall="#f4f2ea", in_bed="#e2eaee", floor="#c9a77c", floor_acc="#ad8c62",
               cabinet="#e9ece8", worktop="#4b4f52",
               ridge="#6a625a", deck="#8c9196", deck_acc="#767b80", deck_pat="planks"),
```

**Feature map**

| Feature | Status | Notes |
|---------|--------|-------|
| Two-storey shell, both shells cut per storey, glass, casings | exists | W 13.0, back −6.0 |
| `windows="classic"` with shutters, chimney (brick, `E["found"]` cap) | exists | chimney top rule for the gambrel is new (H6) |
| Walk-in two-bay wing, `doors=2`, carriage style, street gable | exists | N6 options |
| Wing on −x (`wing.side="west"`) | **new** | H1 |
| Side gambrel roof (`roof="gambrel_x"`) + shared `L.prism_x` | **new** | H2 |
| Cedar shake texture (`wall_pat="shakes"`) | **new** | H3 |
| Wrap-around porch (`porch="wrap"`) + shared `L.lean_to_corner` | **new** | H4 |
| Harbor interior plan (`interior.plan="harbor"`) and style kit | **new** | H5, geometry in 7.2d.1 |
| Palette key `deck_pat`; French door dressing on side walls | **new** | H6 |

**New generator options (geometry, exterior frame: origin at the lot point, front face z = ZF = 4.0, y up)**

*H1: mirrored wing* (`wing["side"]`: `"east"` default, `"west"`). Every wing number stays computed in the east frame
(x_in = W/2, x_ext, xo, xi as today) and one sign s = −1 for west, +1 for east carries it to the right side:
- `Plan.__init__`: store `s` in `self.wing`; the garage light becomes `("Garage", 0, s·(hw + xo − T)/2, zc)`. The assert
  becomes `h["floors"] == 2 and not h["mirror"]` (message: "the garage wing needs a two-storey, unmirrored plan"); the
  duplex and the estate plan each assert `self.wing["s"] == 1` (their garage doorway is on the east wall); the harbor plan
  asserts `s == −1`.
- `build_garage`: `GB = Mirror(B.coll, B.cols, s)` and every `B.box` / `B.wall` of the function goes through `GB`
  (floor, walls, skin, ceiling, doorway lining and casings, door insides, window casings). The doorway is still found by
  `kind == "door"`; its z values do not change with the side.
- `wing_exterior`: `WB = Mirror(coll, None, s)`; every `L.box(coll, name, x, …)` becomes `WB.box(name, x, …)`, every
  `B.wall` becomes `WB.wall`, `dress(B, …)` becomes `dress(WB, …)` (face x1, outward +1 in the east frame).
  `L.gable_roof(…, cx, …)` takes `WB.x(cx)`. The two slabs: location `L.b(WB.x(cx + sgn·run/2), zc, h_mid)`, rotation
  `(0, s·sgn·angle, 0)`, and their names follow the real side: with s = −1 the house-side slope (the east-frame "W", run =
  half) is named `EX_WingRoofE` and the overhanging one `EX_WingRoofW`. Node names otherwise unchanged (allow-list
  unchanged).
- `Plan.layout`: wing rect `r(*sorted((s·xi, s·g["xi"])), g["zb"], g["zf"])` → x −13.495 → −6.095, z −2.19 → 5.0.
- `build_interior` sky boxes: with s = −1, `Sky_West` at x −max(13, x_ext + 1.5) = −15.4 and `Sky_East` back at 13.
- `build()` print: minX = −wing xo, maxX = x_out when s = −1 (−13.695 / 6.295).
- Site build: the placeholder box is centred at origin x − 3.7 (house x −13.9 → 6.5).

For A-03 the doors are centred at east-frame cx ± 1.55 = 8.65 / 11.75 → house x −8.65 / −11.75; lanterns at −6.80 and
−13.60. Cost: 0 triangles.

*H2: side gambrel roof* (`roof="gambrel_x"`, values from `h["gambrel"]`, `h["rise"]`, `h["eave"]`). The second floor stays
a full storey under the knee (walls to 6.10, interior contract unchanged); the gambrel holds an attic lit by a window in
each gable end. Shared builder `L.prism_x(coll, name, poly, x0, x1, mat, tile=1.0)` in `lib_common.py`: extrudes a closed
polygon `poly = [(z, y), …]` along game x from x0 to x1 (two n-gon caps triangulated with `bmesh.ops.triangulate`, n side
quads, `_mesh_from` with recalculated normals; 2(n − 2) + 2n triangles). It covers gable, gambrel, shed and saltbox
profiles later. New `gambrel_roof_x(coll, E, h, W, DEPTH, ZC, y_eave)` in the generator, with hd = DEPTH/2 = 5.805, lower
run r = 1.0, knee rise k = 1.5 (56.3°), upper rise rise − k = 1.8 over 4.805 (20.5°), eave e = 0.45, rake 0.3,
t = k / r = 1.5:
```
gable mass   EX_Gables  L.prism_x, E["siding"], x ±6.49, poly (wall line inset 0.01):
             (3.99, 6.15) (2.99, 7.65) (−1.805, 9.45) (−6.60, 7.65) (−7.60, 6.15)          16 tris
roof plate   EX_Roof    L.prism_x, E["roof"], tile 0.7, x ±6.80 (W/2 + rake); outer line = full-depth profile + 0.18
             (0.02 clear of the mass, then 0.16 thick), extended by the eave along the lower pitch:
             O0 (ZC + hd + e, y_eave + 0.18 − e·t) = (4.45, 5.655)   O1 (ZC + hd − r, y_eave + k + 0.18) = (3.00, 7.83)
             O2 (ZC, y_eave + rise + 0.18) = (−1.805, 9.63)         O3 (−6.61, 7.83)   O4 (−8.06, 5.655)
             poly = O0…O4 then the same points 0.16 lower in reverse order (10 points)            36 tris
ridge cap    EX_RidgeCap   13.65 × 0.24 × 0.12, centre (0, ZC), y 9.61 → 9.73, E["ridge"]
fascia       EX_FasciaFront / EX_FasciaBack  13.66 × 0.06 × 0.22 at z 4.48 / −8.09, y 5.455 → 5.675, E["trim"]
             (inner face on the drip face of the plate, top 2 cm above the drip)
rake boards  EX_FasciaRakeW0..3 / EX_FasciaRakeE0..3 = L.beam(O_k − 0.08 y → O_k+1 − 0.08 y) at x ±6.83, w 0.06, h 0.20,
             E["trim"] (inner face on the plate end face at ±6.80)
attic window per gable end, s = −1 (W) / +1 (E), centred on z ZC, names EX_WinGable<W|E>_*:
             Lite    x s·6.505, 0.03 × 1.10 (z −2.355 → −1.255), y 6.70 → 7.90, E["glass_dark"]
             Head    x s·6.53, 0.08 × 1.30, y 7.90 → 8.02, E["trim"]   Sill x s·6.55, 0.12 × 1.36, y 6.62 → 6.70, E["trim"]
             JambA/B x s·6.53, 0.08 × 0.10 at z −2.405 / −1.205, y 6.70 → 7.90, E["frame"]
             Mullion x s·6.525, 0.04 × 0.05, y 6.70 → 7.90 · Transom x s·6.525, 0.04 × 1.10, y 7.40 → 7.45, E["frame"]
             (head top 8.02 stays 1.19 below the mass at z −2.455)
```
No gable vents. `EX_ShellTop` (6.10 → 6.15) stays under the mass. Every L1 window head (5.40, dressing top 5.52) stays
below the plate: 0.09 m out from the wall its underside is at 6.04. The wing roof meets the west wall at about 3.45, far
under the west rake (lowest point 5.50). Chimney (H6): `h["chimney"] = (2.6, 0.45)` puts the stack over the inglenook (7.2d.1) at x 2.6,
z ZC + 0.45 = −1.355, its back face on the ridge line. Allow-list prefixes: `EX_Roof`, `EX_Gables`, `EX_Ridge`, `EX_Fascia`,
`EX_Win` (existing). About 0.35 k triangles.

*H3: cedar shakes* (`wall_pat="shakes"`, new pattern in `make_texture`, 64 px):
```
course = y // 8 (8 courses a tile, so it tiles in y); row = y % 8
width  = (9, 13, 11)[course % 3];  offset = (course · 23) % 64;  idx = (x + offset) // width
row 0               → accent (shadow under the butt of the course)
row 1               → (base + accent) / 2
(x + offset) % width == 0 → accent (vertical joint, staggered course to course)
else                → base + k + tone, tone = (((idx · 73 + course · 151) % 11) − 5) / 5 × 0.05 (fixed per shingle)
```
The width cycle does not divide 64, so one narrower shingle falls on the x seam; irregular widths are the look of shakes.
UVs: the walls are box-mapped at tile 2.0; with `shakes`, `scale_uvs(…, 1.5, 1.5)` replaces the plank factors (1.0, 3.0) on
the main shell, `EX_Gables`, the wing shell and `EX_WingGables`: a course shows 0.167 m, shingles 0.19–0.27 m wide. The
other patterns keep their factors. Material `EX_cove_villa_a03_Siding` from `wall` / `wall_acc`. No triangle cost.

*H4: wrap-around porch* (`porch="wrap"`, values from `h["wrap"]`). Deck outer edges: front z_o = ZF + d = 6.4, side
x_o = hw + side_d = 8.4; post line 0.12 inside them (z 6.28, x 8.28). Both runs drop 0.40 from the wall to the drip, so the
two roof planes meet on a straight hip.
```
deck       EX_PorchDeckFront x −1.6 → 8.4, z 4.0 → 6.4, y 0 → 0.16, E["deck"], tile 1.0
           EX_PorchDeckSide  x 6.5 → 8.4, z −3.2 → 4.0, y 0 → 0.16 (abuts the front piece at z 4.0, no overlap)
step       EX_PorchStep      x −0.9 → 0.9, z 6.4 → 6.8, y 0 → 0.08, E["step"] (centred on the door)
posts      EX_PorchPost0..10 0.16 × 0.16, y 0.16 → 2.45, E["trim"], at h["wrap"]["posts"]: front line x −1.48, 1.15,
           3.527, 5.903, 8.28 (corner); side line z 3.94, 1.6, −0.74, −3.08; wall posts (−1.48, 4.12) and (6.62, −3.08)
beams      EX_PorchBeamFront x −1.56 → 8.36, z 6.20 → 6.36 · EX_PorchBeamSide x 8.20 → 8.36, z −3.16 → 6.20
           EX_PorchBeamWest x −1.56 → −1.40, z 4.0 → 6.20 · EX_PorchBeamEnd x 6.5 → 8.20, z −3.16 → −3.00
           all y 2.29 → 2.45, E["trim"] (abutting, never overlapping)
roof       EX_PorchRoof = L.lean_to_corner(coll, "EX_PorchRoof", x0=−1.8, x_wall=6.5, x_out=8.7, z_wall=4.0, z_out=6.7,
           z1=−3.4, y_high=2.86, y_low=2.46, thick=0.10, mat=E["roof"])
           (overhang 0.3 at the drips, 0.2 at the west and south ends)
fascia     EX_FasciaPorchFront x −1.8 → 8.76, z 6.70 → 6.76 · EX_FasciaPorchSide x 8.70 → 8.76, z −3.4 → 6.70
           y 2.25 → 2.47, E["trim"]
railing    EX_RailPorch     = L.railing(pts [(1.15, 6.28), (8.28, 6.28), (8.28, −3.08), (6.62, −3.08)], y0 0.16, h 0.9,
           step 0.30, E["trim"], post=0.10, bar=0.04)                   (22 + 30 + 4 bars)
           EX_RailPorchWest = L.railing([(−1.48, 4.12), (−1.48, 6.28)], same values) (6 bars)
           every railing point is a porch post, so the 0.10 newels stay inside the 0.16 posts
bushes     with porch "wrap": EX_BushBase/Top0 at (−2.4, ZF + 0.6) and 1 at (−6.1, ZF + 0.5); no bush on the porch side
```
Shared builder `L.lean_to_corner(coll, name, x0, x_wall, x_out, z_wall, z_out, z1, y_high, y_low, thick, mat, tile=0.7)`:
an L-shaped lean-to along a front wall (z = z_wall, from x0) that turns the corner at x_wall and runs down the side wall to
z1. Top vertices A (x0, z_wall, yh), B (x0, z_out, yl), C (x_out, z_out, yl), D (x_wall, z_wall, yh), E (x_out, z1, yl),
F (x_wall, z1, yh); the same six points `thick` lower for the underside. Faces: front slope A-D-C-B, side slope D-F-E-C
(both planar, meeting on the hip D-C), the two undersides, and six edge quads (A-B, B-C, C-E, E-F, F-D, D-A). 20
triangles. Slopes here: front 0.40 / 2.7 (8.4°), side 0.40 / 2.2 (10.3°). The wall-side faces lie on the shell faces
(back to back, hidden); the corner boards pass through the roof.

Heights: the roof underside meets the walls at 2.76. Under it: hall and parlour front windows (dressing top 2.52), east
French door (2.62), parlour east windows (2.52); the floor band (3.08) and the L1 sills (4.10) stay above it. The posts
end 2–3 cm inside the roof. Window dressing: the front-side wall west of the porch carries the stair landing window
(7.2d.1), whose right shutter ends at x −1.858, 0.06 clear of the roof's west end (−1.8). The sunroom east window's
shutter ends at z −3.435, 3.5 cm behind the roof end.

Collisions in the **site** build (the house collision does not cover them): 11 posts 0.16 × 0.16 × 2.45 and four rail
boxes 0.10 thick, 1.06 high (front x 1.15 → 8.28 at z 6.28, side z −3.08 → 6.28 at x 8.28, end x 6.62 → 8.28 at z −3.08,
west z 4.12 → 6.28 at x −1.48). The deck (0.16) and the step (0.08) are walk-over; the opening between the posts at
x −1.48 and 1.15 is the way in. About 1.1 k triangles (railing 0.8 k).

*H5: harbor interior plan* (`interior=dict(plan="harbor", style="harbor")`): new `Plan.harbor()`, `build_stair_l()` and
`build_harbor()` in `build_house_v2.py`, three builders in `lib_interior.py`, a `harbor` style kit. Geometry, rooms,
layout and collisions in 7.2d.1.

*H6: small additive keys.*
- `E["deck"]` uses `C.get("deck_pat", "tiles")` (Villa Serena keeps tiles; A-03 gets painted grey planks).
- `build_exterior`, side windows: `dress(…, shutters=not small and w["kind"] != "french", french=w["kind"] == "french")`,
  so a French door on a side wall gets jambs and head, no sill, no shutters (A-01 has none, unchanged).
- Chimney top: with `roof="gambrel_x"`, top = y_eave + rise + 1.1 = 10.55 (0.92 above the ridge); other roofs keep
  their formula.
- `PALETTES` accept the new pattern name; `M["panel"]` (interior wainscot) takes `S.get("panel_pat", "tiles")` and
  `S.get("panel_acc", "#d9d5ca")`.

Triangle cost of the new exterior parts ≈ 1.5 k (gambrel 0.35 k, porch 1.1 k).

**Lot dressing** (`build_cove_heights_site.py`, plan coordinates, same helpers as A-01):

```python
VILLA_A03 = {"key": "cove_villa_a03", "name": "Harbor Shingle House", "lot": "A-03", "origin": (210.2, -309.0), "zf": 4.0,
             "interiorOffset": [0.0, 0.2, -1.405], "price": 28000}
hx, hz = VILLA_A03["origin"]
front_z = hz + VILLA_A03["zf"]                                                       # -305.0
HM_BLUE = dict(HM, hydrangea=L.make_mat("TW_CoveHydrangeaBlueFlower", "#8aa6d8", 0.9, "noise", 0.08, accent="#b3a3d6"))
S.rect(est, "CH_LotA03_GarageApron", 196.95, -304.0, 203.05, front_z, Y["lot"], Y["drive"], M["drive"])
S.rect(est, "CH_LotA03_ApronW", 196.95, -302.6, 198.5, -304.0, Y["lot"], Y["drive"], M["drive"])   # flares beside
S.rect(est, "CH_LotA03_ApronE", 201.5, -302.6, 203.05, -304.0, Y["lot"], Y["drive"], M["drive"])   # the v1 driveway
S.rect(est, "CH_LotA03_FrontPath", hx - 0.8, -299.0, hx + 0.8, -302.2, Y["lot"], Y["drive"], M["drive"])  # to the porch step
S.street_lamp(est, "CH_LotA03_PostLamp", hx + 1.6, -300.2, M, h=2.6)
S.hedge_run(est, "CH_LotA03_HedgeW", (204.6, -304.3), (207.2, -304.3), HM, w=0.5)
S.hydrangeas(est, "CH_LotA03_Hydrangea", 211.6, 217.6, -301.9, HM_BLUE, n=4)
with open(os.path.join(L.FRONT_ASSETS, "houses", VILLA_A03["key"], "exterior.layout.json"), encoding="utf-8") as f:
    for c in json.load(f)["collision"]:                       # PorchPost0..10, PorchRailFront / Side / End / West
        est.col(f"LotA03_{c['name']}", hx + c["x"], hz + c["z"], c["sx"], c["sz"], c["h"])
est.col("HousePlaceholderA03", hx - 3.7, hz - 1.805, 20.4, 11.61, 6.0)
est.cols[-1]["name"] = f"COL_House_{VILLA_A03['key']}"
HOUSES = [VILLA_A02, VILLA_A01, VILLA_A03]
```
The apron runs in front of both garage doors (door edges x 197.15 → 202.85) and flares 1.4 m toward the street beside the
3.0 m driveway without overlapping it. The postbox (202.1, −299.4) stays clear of the apron (z ≤ −302.6). The house's two
bushes (204.1, −304.5) and (207.8, −304.4) frame the boxwood hedge; the blue hydrangeas run in front of the porch, east of
the path, and stay 0.5 m off the lamp. The porch post list lives only in `h["wrap"]["posts"]`: the house build derives
the post and rail collision boxes from it (`wrap_porch_collision`, house frame) and writes them to
`out/houses/cove_villa_a03/exterior.layout.json`, which `assets:optimize -- houses` ships next to the interior layout;
the site build reads that committed file from `front/public/assets/houses/` (so it runs without a fresh house build).

**Wiring and rebuild.** `catalog.ts` `house('cove_villa_a03', 'Harbor Shingle House')`; `HousingUnitSeeder`
`['cove_villa_a03', 'buy', 28000, -220.8, 1.25, -286.2, '#B8875A']` and the bounds above; then the § 7.2b sequence with
`HOUSE_KEYS = ["cove_villa_a03"]`, the site build, `apply-cove-heights.mjs`, `make seed`. Rebuild `cove_villa_a01` and
`cove_villa_a02` once after H1, H3 and H6 land to confirm the defaults left them equivalent (same node names, materials and
triangle counts).

**Decisions** (2026-11-12): R8 amended for open wrap porches (≤ 2.0 m into a side setback, ≥ 4.0 m to the
neighbouring building). A-03 keeps W 13.0 like A-02: they differ in depth, plan and every visible element. The porch
post list lives in the HOUSES entry only; the site build reads the collision boxes the house build derives from it.
The interior counts 12 424 triangles, 0.4 k over the 12 k ceiling: accepted for this house (2026-11-12).

**Pieces and where they come from** (every piece is a building part or a simple shape, so none is a `make model` job):

| Piece | Source | Why |
|---|---|---|
| Shell walls, window cuts, plinth, corner boards | existing `L.wall`, `L.perimeter`, `dress()` | same builders as every house |
| Cedar shakes | new `wall_pat="shakes"` in `L.make_texture` | a wall texture, recoloured by the palette |
| Gambrel roof and gable ends | new shared `L.prism_x`, used by `gambrel_roof_x` | any extruded profile (gambrel, barn, dormer) |
| Gable windows, chimney | existing `dress()`, chimney boxes | same window trim as the facades |
| Wrap porch deck, posts, beams, fascia | `L.box` through `Mirror` | plain boxes; `corner` picks the east or west corner |
| Porch roof | new shared `L.lean_to_corner` | a lean-to that turns a corner, reusable for any wrap porch |
| Porch railings | existing `L.railing` | shared with the Tuscan balcony |
| Garage wing and carriage doors | existing `wing_exterior`, mirrored by `wing.side="west"` | one wing builder for both sides |
| Two-flight stair | new `build_stair_l`, driven by `Plan.flights` | any stair with a landing |
| Stone fireplace, inglenook, mudroom bench | new `LI.fireplace(style="stone")`, `LI.inglenook`, `LI.mudroom_bench` | parameterised fittings for the next villas |
| Kitchen, island, hood, bathrooms, wardrobes, closet rails, beams | existing `lib_interior.py` builders | reused as they are |
| Lot dressing: apron, path, lamp, hedge, hydrangeas, postbox | existing `lib_site.py` builders | same estate furniture as A-01 and A-02 |

#### 7.2c.7 Skyline Residence on A-04 [built: cove_villa_a04, for sale 32 000]

**Why A-04.** It closes the south band at the NE corner, beside the Harbor Shingle House and across the corner from the
Rosemary Victorian (visible pair A-04/B-07). A Contemporary house is the strongest contrast the rules allow next to a
cedar gambrel: dark render and flat stepped boxes against shakes and a curved roof, a cantilevered timber frame over the
entry against a wrap porch, flush aluminium garage doors against carriage doors. It is the most expensive house of the
estate, so it also carries the most volume inside: a double-height living room with a two-storey glass wall, a floating
stair and a glass gallery (7.2d.2). It brings six features that other lots reuse: the stepped flat roof, the `slats`
texture with cladding panels, the timber frame entry, flush garage doors, the glass balustrade and the pergola builder.

**Rule check** (adjacent: A-03; visible pair: B-07)

| Rule | A-04 | A-03 (adjacent) | B-07 (visible pair) | Result |
|------|------|-----------------|---------------------|--------|
| R1 | key `cove_villa_a04`, palette `skyline`, W 14.0 | W 13.0 | W 12.0 | key and palette unique; W 14.0 repeats A-01, accepted (Decisions below) |
| R2 | Modern | Vernacular | Picturesque | ok |
| R3 | D (graphite), door warm oak `#b98b58` | N | P | ok, D on 2 lots (B-06, A-04); the door differs from B-06's `#c8a06a` (Decisions below) |
| R4 | flat, stepped parapets, roof membrane `#3a3c40` | gambrel, `#7d7468` | steep front gable, slate | ok |
| R6 | setback 5.0 | 6.0 | (other band) | stagger 1.0 m with A-03 |
| R7 | two-bay wing −x, flush with the facade, 5.0 m behind the front line, flat terrace roof, two flush aluminium doors; doors 5.2 m of 21.4 m frontage (24 %) | street gable, carriage doors | single wing +x, carriage | ok: wing roof and door style both differ from A-03 |
| R8 | entry type **canopy**: a cantilevered timber frame whose bottom slab shelters the door; it projects 1.47 m, 3.53 m left to the front line | wrap porch | spindle porch | ok (no other estate lot uses a canopy) |
| R9 | no shutters (Modern), black frames | white frames | | ok |
| R10 | postbox, 0.40 m lot hedges, cobble motor court and path, 2.6 m lot lamp | | | ok |
| R11 | main + wing inside the envelope (wing on the west line x 223.0, main block 0.6 m inside the east line); 29.0 % | | | ok |

A-03's east porch roof drips at plan x 218.9; the wing's west face is at x 223.0: 4.1 m between the buildings, the
R8 amendment's 4.0 m minimum.

**Placement**

```
Lot A-04: x 220–248, z −299 … −327, faces S, envelope x 223–245, z −303.3 … −323
Lot point:     plan (237.4, −308.0) = world (−193.6, −290.0), rotationY 0      (lot centre (234, −313) + (u₀, v₀) = (3.4, 5.0))
Facade:        plan z −304.0 (setback 5.0 m; A-03 is at 6.0 → R6 stagger 1.0 m)
Main block:    plan x 230.4 → 244.4, z −304.0 → −316.01 (14.0 × 12.01)
               low volume x 230.4 → 238.4 (parapet top 6.71), tall volume x 238.4 → 244.4 (parapet top 7.61)
Garage wing:   plan x 223.0 → 230.4, z −304.0 → −312.0 (7.4 × 8.0), on the west envelope line;
               doors centred at x 228.25 and 225.15 (house x −9.15, −12.25), door edges 223.85 → 229.55
Timber frame:  plan x 231.1 → 238.3, z −303.93 → −302.53 (projection 1.47 m), soffit at y 2.84, top 6.45
Entry pad:     plan x 235.9 → 238.15, z −304.0 → −302.53, y 0 → 0.12
Motor court:   plan x 223.5 → 230.0, z −300.5 → −304.0, joined to the v1 driveway (x 220.5 → 223.5) on its east edge
Door point:    world (−193.6, 1.25, −285.2)  (= origin + ZF + 0.8, the site build's formula)
interiorOffset [0, 0.2, −1.405]
Seeder bounds: minX −14.195, maxX 6.795, minZ −6.4, maxZ 5.2, maxY 5.6 · price 32 000 · colour '#4A4D52'
Coverage:      168.1 + 59.2 = 227.3 m² (29.0 %); GFA 2 × 168.1 + 59.2 = 395 m², 371 m² of floor once the 24.5 m² void is taken out
```

Derived generator values (T 0.2, GAP 0.005, FY 0.2): x_out = W/2 − T − GAP = 6.795, xi = 6.595,
OZ = ZF − T − GAP − 5.2 = −1.405, ZB = OZ + back − GAP − T = −8.01, DEPTH = ZF − ZB = 12.01, ZC = −2.005,
H_SHELL = FY + 5.6 + 0.3 = 6.10, y_eave 6.15; interior zi_f 5.0, zi_b −6.2. Wing (east frame, mirrored to −x by H1):
x_in 7.0, x_ext 14.4, xo 14.195, xi 13.995, zb = 5.2 − 8.0 + 3T + 2GAP = −2.19, shell height 3.30; side window at
z 1.405 ± 0.7 on the west end; garage room 7.34 × 7.19 m; layout wing rect x −13.995 → −6.595, z −2.19 → 5.0; Sky_West at
x −15.9. These match A-03's wing exactly (same w, d, side); only the main block differs.

**HOUSES entry** (new keys marked in the feature map; everything else exists):

```python
"cove_villa_a04": dict(name="Skyline Residence", W=14.0, ZF=4.0, back=-6.4, floors=2, mirror=False, palette="skyline",
                       roof="flat", step=dict(x=1.0, rise=0.9), cross=None, chimney=None, windows="modern", flowers=False,
                       porch="frame",
                       frame=dict(x0=-6.30, x1=0.90, d=1.4, y0=2.84, y1=6.45, slab=0.24, fin=0.12, pad=(-1.5, 0.75)),
                       clad=[("front", -6.16, 0.76, 3.26, 6.19), ("front", -2.0, 0.76, 0.27, 2.82)],
                       wing=dict(w=7.4, d=8.0, side="west", roof="flat", doors=2, door_w=2.6, door_h=2.3, door_style="flush",
                                 terrace=dict(walkable=True, glass=1.1, pergola=dict(u0=0.3, u1=4.7, half=3.4, h=2.5))),
                       interior=dict(plan="skyline", style="skyline",
                                     lines=dict(spine=-2.0, void_x=1.0, feature_z=0.34, service_z=-2.2, study_z=2.0,
                                                mud_x=-3.68, back_l1=-0.8, closet_z=-2.92, bath2=(1.66, 3.66)),
                                     windows=SKYLINE_A04_WINDOWS)),
```
`SKYLINE_A04_WINDOWS` is the window list of 7.2d.2, written as a module-level constant next to `HOUSES` (or inline).

**Palette** (`PALETTES["skyline"]`; `clad`, `clad_acc` and `soffit` are new optional keys, absent on every other palette):

```python
"skyline": dict(wall="#4a4d52", wall_pat="noise", wall_acc="#43464b", trim="#1e1f22", roof="#3a3c40", roof_acc="#333539",
                shutter="#1e1f22", door="#b98b58", in_wall="#f2f1ed", in_bed="#e6e3dc", floor="#cfae82", floor_acc="#b8956a",
                cabinet="#2f3134", worktop="#ecebe7",
                frame="#1e1f22", garage="#8c9095", garage_panel="#7c8085", deck="#3b3a38", deck_acc="#2f2e2c", deck_pat="planks",
                clad="#a8774f", clad_acc="#7d5534", soffit="#f2f2ee"),
```
`trim` is black on purpose: it drives the window heads and sills, the corner boards, the floor band, the parapet caps,
the door casing and the garage casings, which on a contemporary house are black metal flashings. `shutter` is required by
`build_exterior` but unused (modern windows have none). The garage material keeps its `planks` pattern: at tile 0.5 it
draws a horizontal reveal every 0.125 m, the ribbed look of an aluminium sectional door.

**Feature map**

| Feature | Status | Notes |
|---------|--------|-------|
| Two-storey shell, cut per storey, glass, casings, floor band | exists | W 14.0, back −6.4 |
| `windows="modern"` dressing (slim black jambs and head, no mullion, no shutters) | exists | |
| Floor-to-ceiling glazing as `kind="french"` openings (no sill, blocking box inside) | exists | used as picture windows (7.2c.5 #8) |
| Walk-in two-bay wing on −x, `roof="flat"` terrace and parapet, `doors=2` | exists | H1, N6 |
| `deck_pat="planks"`, palette `frame` / `garage` / `deck` keys | exists | N2, H6 |
| Stepped flat roof (`step`) | **new** | S1 |
| `slats` texture, palette `clad` / `soffit` keys, cladding panels (`clad`) | **new** | S2 |
| Timber frame entry (`porch="frame"`) | **new** | S3 |
| Flush garage doors (`door_style="flush"`) | **new** | S4 |
| Glass balustrade (`L.railing(glass=...)`) and the wing terrace (`wing.terrace`) with `L.pergola` | **new** | S5 |
| Skyline interior plan (`interior.plan="skyline"`) and style kit | **new** | S6, geometry in 7.2d.2 |

**New generator options (geometry, exterior frame: origin at the lot point, front face z = ZF = 4.0, y up)**

*S1: stepped flat roof* (`roof="flat"` with `h["step"] = dict(x, rise)`). Without `step`, `flat_roof` is unchanged
(houses 07, 08, 09). With it, `flat_roof_stepped(coll, B, E, h, W, DEPTH, ZC, H, ZF, ZB)` builds the same deck and vent and
splits the parapet in two volumes at x = `step.x` (house frame, through `B` so a mirrored house flips it): the part on the
+x side is `rise` taller. Values from the `flat_roof` parapet (`L.perimeter(W + 0.12, ZF + 0.06, ZB − 0.06, H, 0.55, 0.26)`):
outer line x ±7.06, front z 3.80 → 4.06, back z −8.07 → −7.81, thickness 0.26, low top H + 0.55 = 6.65, tall top 6.65 + 0.9
= 7.55; caps 0.06 thick, 0.04 wider than the parapet on each side.
```
deck       EX_RoofDeck   13.8 × 11.81 at (0, ZC), y 6.15 → 6.23, E["roof"]             (as flat_roof)
vent       EX_RoofVent   1.2 × 0.9 at (−3.5, −3.005), y 6.23 → 6.83, E["metal"]        (as flat_roof, in the low volume)
low        EX_ParapetFront    x −7.06 → 1.0,  z 3.80 → 4.06,  y 6.10 → 6.65, E["siding"]
           EX_ParapetBack     x −7.06 → 1.0,  z −8.07 → −7.81
           EX_ParapetW        x −7.06 → −6.80, z −7.81 → 3.80
tall       EX_ParapetHighFront x 1.0 → 7.06,  z 3.80 → 4.06,  y 6.10 → 7.55
           EX_ParapetHighBack  x 1.0 → 7.06,  z −8.07 → −7.81
           EX_ParapetHighE     x 6.80 → 7.06, z −7.81 → 3.80
           EX_ParapetStep      x 1.0 → 1.26,  z −7.81 → 3.80   (the step face seen above the low parapet)
low caps   EX_ParapetCapFront x −7.10 → 1.0, z 3.76 → 4.10 · CapBack x −7.10 → 1.0, z −8.11 → −7.77 ·
           CapW x −7.10 → −6.76, z −7.77 → 3.76 · y 6.65 → 6.71, E["trim"]
tall caps  EX_ParapetHighCapFront x 0.96 → 7.10, z 3.76 → 4.10 · HighCapBack x 0.96 → 7.10, z −8.11 → −7.77 ·
           HighCapE x 6.76 → 7.10, z −7.77 → 3.76 · StepCap x 0.96 → 1.30, z −7.77 → 3.76 · y 7.55 → 7.61, E["trim"]
```
Caps abut and never overlap (no coplanar tops); the low caps end against the tall parapet's west face at x 1.0. The step
line x 1.0 is the west edge of the double-height living room (7.2d.2), so the tall box is the volume you feel inside.
Allow-list: `EX_Parapet`, `EX_RoofVent` (existing). About 0.17 k triangles (0.1 k more than a plain flat roof).

*S2: cedar slats and cladding panels.*
- New pattern `slats` in `L.make_texture` (64 px, vertical boards): `slat, col = x // 8, x % 8`; col 0 → accent (shadow
  gap); col 1 → (base + accent) / 2; else base + k + tone, tone = (((slat · 37) % 7) − 3) / 3 × 0.04 (fixed per board).
  Eight boards a tile, so it tiles in x and y. At L.box's default tile 1.0 a board is 0.125 m.
- Palette keys: `E["clad"] = L.make_mat(f"EX_{key}_Clad", C["clad"], 0.75, "slats", 0.03, accent=C["clad_acc"])` and
  `E["soffit"] = L.make_mat(f"EX_{key}_Soffit", C["soffit"], 0.6, "noise", 0.01)` when the palette has them (else
  `E["siding"]` and `E["trim"]`).
- `clad_panels(B, E, h, ops_by_side, ZF, ZB, hw)`: for each `(side, a0, a1, y0, y1)` of `h["clad"]` a panel 0.02 thick whose
  back face stands 0.015 off the shell face (front: z ZF + 0.015 → ZF + 0.035), built with `B.wall(f"EX_Clad{i}", …,
  solid=False, glass=None, y0=y0)`, height y1 − y0, holes = the shell openings of that side (the same lifted `ops` list the
  shell uses, both storeys) that overlap the span, clipped to the panel and shifted to panel-local y. UVs
  `scale_uvs(…, 2.0, 1.0)` (L.wall pieces are mapped at tile 2.0), so boards stay 0.125 m. Window jambs and heads
  (face + 0.06) stand 2.5 cm proud of the panel face.
- A-04's two panels: `EX_Clad0` lines the frame behind its opening, x −6.16 → 0.76, y 3.26 → 6.19 (2 cm clear of the
  fins, the floor band top 3.24 and the top slab 6.21), holes for the suite and bed 2 windows; `EX_Clad1` is the entry
  wall under the canopy, x −2.0 → 0.76, y 0.27 → 2.82 (above the plinth 0.25, under the soffit 2.84), holes for the door
  and the sidelight. Allow-list prefix `EX_Clad` (new). About 0.17 k triangles.

*S3: timber frame entry* (`porch="frame"`, values from `h["frame"]`): the "cantilevered upper box" of the style, here a
deep open frame around the upper floor of the low volume; its bottom slab is the entry canopy. `frame_porch(coll, B, E,
ZF, fr)`, all boxes through `B`, frame depth from z0 = ZF + 0.07 (clear of the floor band 4.05, the parapet 4.06 and the
window heads 4.06) to z1 = z0 + d:
```
bottom     EX_FrameBottom x −6.30 → 0.90, z 4.07 → 5.47, y 2.86 → 3.10 (y0 + 0.02, slab 0.24), E["clad"]
soffit     EX_FrameSoffit x −6.27 → 0.87, z 4.10 → 5.44, y 2.84 → 2.86, E["soffit"]   (inset 3 cm: no edge lines up)
top        EX_FrameTop    x −6.30 → 0.90, z 4.07 → 5.47, y 6.21 → 6.45 (y1 − slab), E["clad"]
fins       EX_FrameSideW  x −6.30 → −6.18 · EX_FrameSideE x 0.78 → 0.90 · z 4.07 → 5.47, y 3.10 → 6.21, E["clad"]
pad        EX_EntryPad    x −1.5 → 0.75 (fr["pad"]), z 4.0 → 5.47, y 0 → 0.12, E["step"]   (grounded)
```
Checks: the soffit (2.84) clears the door head (2.62), the porch lamp cap (2.27) and the study window head (2.68); the top
(6.45) stays under the low parapet top (6.65) and 1 cm in front of the parapet face; the east fin ends 0.1 m short of the
tall volume (x 1.0), so the frame reads as a timber box set against the taller graphite box. The pad rises 0.08 above the
lot lawn, then 0.08 to the threshold. With `porch="frame"` the generator builds no bushes (the site build plants the bed).
Collision: none (the frame is above head height, the pad is walk-over). Allow-list prefix `EX_Frame` (new). About 0.07 k
triangles.

*S4: flush garage doors* (`wing["door_style"] = "flush"`): in `wing_exterior` the flush branch builds only the door slab
`EX_GarageDoor0/1` (2.6 × 0.06 × 2.3 at x −9.15 / −12.25, z 4.03, `E["garage"]`, tile 0.5) and the three casings per door
(black trim). No straps, no panels, no lites: 0.77 k triangles fewer than two carriage doors. Lanterns at x −7.30 and
−14.10 as today.

*S5: glass balustrade, wing terrace and pergola.*
- `L.railing(…, glass=None)` gets one optional argument. With a material: posts and top rails as today, no bottom rail and
  no bars, and one pane per segment `{name}_Glass{i}`: length ln − post, 0.02 thick, from y0 + 0.03 to y0 + h − 0.045
  (5 mm into the top rail, so no faces touch), rotated like the rails. Without it the railing is unchanged (A-01, A-03).
- `LI.balustrade(…, style="glass")`: `L.railing(B.coll, name, [at(a0), at(a1)], y, h, step, M["dark"], post=0.05,
  bar=0.018, glass=M["glass"])`, same collision as the other styles. Used by the gallery (7.2d.2).
- `L.pergola(coll, name, x0, x1, z0, z1, y0, h, mat, post=0.12, beam=(0.10, 0.22), slat=(0.05, 0.14), step=0.35,
  over=0.15)` (new shared builder): four posts post × post at the corners (inset post/2), y0 → y0 + h; two beams along z on
  the posts (x0 + post/2 and x1 − post/2), z z0 − over → z1 + over, y0 + h → y0 + h + 0.22; n = max(2, round((z1 − z0) /
  step)) slats along x, x0 − over → x1 + over, centred at z0 + (z1 − z0)(k + 0.5)/n, on the beams. Symmetric, so a
  mirrored caller only sorts x0, x1. Reusable for the clubhouse terrace, a pool deck or a carport roof.
- `wing["terrace"]` (only with `roof="flat"`): a **walkable** roof terrace on the wing, reached from the primary suite.
  It lives inside the existing interior system: the interior is placed in place in the open world
  (`placeOpenHouseInterior`, interior position = `interiorOffset` under the lot transform), walk height comes from the
  interior `layout.json` levels (`surfaceHeight`), blocking from the interior `COL_` boxes, and the socket only checks
  `interior_bounds` (`unitAt`), which already include the wing. So the terrace is one more L1 rect plus collision boxes;
  no exterior level system is added. `walkable=False` (or no `terrace`) keeps today's visual flat wing.

  *Heights* (exterior y = interior y + FY; the deck top must equal the L1 floor, interior 3.0 = exterior 3.20):
```
wing shell H     FY + L1_Y − 0.10 = 3.10      (today FY + L0_H + 0.3 = 3.30; unchanged without walkable)
EX_WingShellTop  3.10 → 3.12 (0.02 instead of 0.05)
EX_WingRoofDeck  3.12 → 3.20 = interior L1_Y: feet on the deck and on the suite floor are at the same height, no step
parapets         EX_WingParapetF/B/E 3.10 → 3.65, caps 3.65 → 3.71 (same 0.55 + 0.06, 0.2 lower than today)
corner boards    EX_WingCornerF/B to H + 0.05 = 3.15
garage (L0)      unchanged: walls to L0_H 2.8, Ceiling_Garage 2.8 → 2.9 interior (3.00 → 3.10 exterior, under the shell
                 top), clear height 2.8 m (≥ 2.6)
```
  *What is drawn where.* The interior GLB is hidden beyond `INTERIOR_HIDE_DISTANCE`, the exterior never is, so every
  visible terrace piece (deck, parapet, glass, pergola, threshold, doorway lining) stays in **exterior.glb**, drawn once.
  The interior adds no terrace mesh: only the layout rect and `COL_` boxes in `interior.colsrc.glb`. No floor slab is
  doubled, so nothing z-fights. The interior `Sky_*` boxes are stripped in the open world (`HIDDEN_INTERIOR_NODES`), so
  the town shows from the terrace; in the preview build `Sky_West` stands at x −15.9, past the terrace.

  *Geometry* (east frame, mirrored by `WB`; guard lines 0.1 m inside the seeder bounds so a player centre never leaves
  `interior_bounds`):
```
guard lines      front z_int = Z_FRONT_OUT − 0.1 = 5.1 (ext 3.695) · outer x = wing xo − 0.095 = 14.1 (house −14.1) ·
                 back z_int = wing zb − 0.2 = −2.39 (ext −3.795) · house side: the main wall
glass            EX_WingTerraceGlass = L.railing(pts [(x_in + 0.08, 3.695), (14.1, 3.695), (14.1, −3.795), (x_in + 0.08, −3.795)]
                 with x through WB.x, y0 = deck top 3.20, h = terrace["glass"] 1.1 (top 4.30), step 1.0, E["metal"],
                 post=0.05, glass=E["glass"]); it stands on the deck, set back 0.13 to 0.43 m from the parapet, which stays
                 as the deck's upstand outside it
pergola          EX_WingPergola = L.pergola(sorted WB.x(x_in + u0), WB.x(x_in + u1)), zc − half → zc + half, y0 = 3.20, h 2.5,
                 E["clad"]) → A-04: x −7.3 → −11.7, z −3.4 → 3.4; posts x −7.36 / −11.64, z ±3.34, 3.20 → 5.70; beams
                 5.70 → 5.92; 19 slats x −7.15 → −11.85, 5.92 → 6.06, under the main parapet (6.10) and 0.10 off the wall
doorway lining   EX_WingTerraceThreshold x −7.0 → −6.655, z −0.005 → 1.595, y 3.14 → 3.20, E["step"] (meets the deck edge at
                 x −7.0 and the suite slab at −6.655, tops level, no overlap) · EX_WingTerraceJambA/B 0.03 thick at
                 z 0.01 / 1.58, x −7.0 → −6.6, y 3.20 → 5.50 · EX_WingTerraceHead same span at y 5.47 → 5.50, E["trim"]
```
  *Doorway.* The suite's west opening becomes `kind="terrace"`: z 1.4 → 3.0, y (0.0, 2.3) on L1. Interior: hole in the
  inner wall, room-side casings like a doorway, no sill and **no blocking box**. Exterior: on the upper shell piece the
  opening starts at the piece's base (local y 0), so `L.wall` puts no glass in it, and `dress(…, french=True)` gives
  black jambs and head. Generic code: `kind == "terrace"` is treated like `"french"` for dressing and casings and like
  `"door"` for the missing sill and glass, and is never picked as the garage doorway (that lookup keeps `kind == "door"`).

  *Layout and collisions* (interior frame, written by the plan when `terrace.walkable`):
```
L1 rect          Terrace (−14.06, −6.595, −2.35, 5.06): it touches the suite rect at x −6.595 across the doorway reveal
COL_Terrace_GuardFront  centre (−10.37, 5.1),  7.54 × 0.08, y 3.0 → 4.2
COL_Terrace_GuardBack   centre (−10.37, −2.39), 7.54 × 0.08, y 3.0 → 4.2
COL_Terrace_GuardWest   centre (−14.1, 1.355), 0.08 × 7.57, y 3.0 → 4.2
COL_Terrace_Post0..3    0.12 × 0.12 at (−7.36 | −11.64, 4.745 | −1.935), y 3.0 → 5.5
```
  The guards rise 1.2 m above the deck, past the visible glass (1.1) and the jump apex (`JUMP_VELOCITY` 6.5, `GRAVITY` 22 →
  0.96 m). The capsule is not lifted during a jump anyway: `capsuleLiftInBuilding` uses the feet on the floor, so the
  capsule (0 → 1.8 above the feet) meets every box that rises above the deck. The main block's L1 walls collide to 5.6,
  so nobody steps onto the main roof; the pergola beams and slats are 2.5 m up and have no level rect, so they cannot be
  stood on. The garage below keeps its L0 rect at y 0; the terrace rect at 3.0 is out of `STEP_UP` from it, so the
  levels never mix. Lock: the terrace is reached only through the suite, inside the house, so the front door lock rules
  apply unchanged.
  Allow-list: `EX_Wing` (existing). About 0.5 k exterior triangles (pergola 0.3 k, glass 0.12 k, lining 0.05 k); 0
  interior triangles (collision and layout only).

*S6: skyline interior plan* (`interior=dict(plan="skyline", …)`): new `Plan.skyline()`, `build_skyline()` and
`build_stair_float()` in `build_house_v2.py`, two small style additions in `lib_interior.py`, a `skyline` style kit.
Geometry, rooms, layout and collisions in 7.2d.2.

Exterior triangles: the new parts add about 0.95 k and the flush doors save 0.77 k against carriage doors; the exterior
should count about 5 k (A-03: 6.7 k).

**Lot dressing** (`build_cove_heights_site.py`, plan coordinates, same helpers as A-01 and A-03):

```python
VILLA_A04 = {"key": "cove_villa_a04", "name": "Skyline Residence", "lot": "A-04", "origin": (237.4, -308.0), "zf": 4.0,
             "interiorOffset": [0.0, 0.2, -1.405], "price": 32000}
sx_, sz_ = VILLA_A04["origin"]
front_z = sz_ + VILLA_A04["zf"]                                                     # -304.0
S.rect(est, "CH_LotA04_MotorCourt", 223.5, -300.5, 230.0, front_z, Y["lot"], Y["drive"], M["drive"])  # east of the v1 driveway
S.rect(est, "CH_LotA04_FrontPath", sx_ - 0.8, -299.0, sx_ + 0.8, front_z + 1.47, Y["lot"], Y["drive"], M["drive"])  # to the pad
S.street_lamp(est, "CH_LotA04_PostLamp", sx_ + 1.6, -300.2, M, h=2.6)
S.hedge_run(est, "CH_LotA04_HedgeE", (239.2, front_z + 0.8), (243.8, front_z + 0.8), HM, w=0.5)   # under the living glass
S.tree(est, "CH_LotA04_Tree0", 246.2, -302.0, M, "round", 0.9)
est.col("HousePlaceholderA04", sx_ - 3.7, sz_ - 2.005, 21.4, 12.01, 6.0)
est.cols[-1]["name"] = f"COL_House_{VILLA_A04['key']}"
HOUSES = [VILLA_A02, VILLA_A01, VILLA_A03, VILLA_A04]
```
The motor court runs in front of both garage doors (door edges x 223.85 → 229.55) and meets the 3.0 m driveway on its east
edge without overlapping it; the postbox (224.1, −299.4, collision to z −299.625) stays clear of it (z ≤ −300.5). The path
ends on the entry pad (z −302.53). The low boxwood hedge (0.40 m, walk-over) runs 0.8 m in front of the two-storey living
glass (plan x 238.9 → 243.5); the round tree softens the tall volume's east corner and stays 1.8 m inside the east lot
line. No exterior collision file: the frame is above head height, the pad is walk-over, and the terrace guards and pergola posts are interior `COL_` boxes (S5).
The placeholder covers house x −14.4 → 7.0 and the main block depth (21.4 × 12.01, centred at origin + (−3.7, ZC)).

**Wiring and rebuild.** `catalog.ts`: add `'cove_villa_a04'` to the key union and `house('cove_villa_a04', 'Skyline
Residence')`; `HousingUnitSeeder`: `['cove_villa_a04', 'buy', 32000, -193.6, 1.25, -285.2, '#4A4D52']` and
`'cove_villa_a04' => ['minX' => -14.195, 'maxX' => 6.795, 'minZ' => -6.4, 'maxZ' => 5.2, 'maxY' => 5.6]`; then the § 7.2b
sequence with `HOUSE_KEYS = ["cove_villa_a04"]`, the site build, `apply-cove-heights.mjs`, `make seed`. The build prints
the seeder bounds and `interiorOffset`; check them against the values above. Rebuild `cove_villa_a01` (its flat wing must keep the 3.30 shell), `cove_villa_a03`
and `house_07`..`house_09` once after S1, S2, S4 and S5 land to confirm the defaults left them equivalent (same node names,
materials and triangle counts).

**Decisions** (2026-11-12): A-04 keeps W 14.0 like A-01, an exception like A-03/A-02: they differ in depth (−6.4
against −5.6), plan, roof, volumes and every visible element, and they are not adjacent. A-04's front door is a warm oak
`#b98b58` so no two doors share a colour (R3); B-06's planned `#c8a06a` stays. The garage roof terrace is walkable from
the primary suite (S5), built inside the interior system: one more L1 rect, a real doorway and collision boxes.

**Pieces and where they come from** (every piece is a building part or a simple shape, so none is a `make model` job):

| Piece | Source | Why |
|---|---|---|
| Shell walls, window cuts, plinth, corner boards, floor band | existing `L.wall`, `L.perimeter`, `dress()` | same builders as every house |
| Graphite render | existing `noise` pattern from the palette | a wall material |
| Cedar slats | new `slats` pattern in `L.make_texture` | a wall texture, recoloured by any palette |
| Cedar cladding panels with window holes | new `clad_panels` (generator), driven by `h["clad"]` | any accent cladding on any side (B-10 teak, B-12 battens) |
| Stepped flat roof, parapets and caps | new `flat_roof_stepped`, driven by `h["step"]` | any two-height flat house |
| Picture windows and the two-storey glass wall | existing `kind="french"` openings and `dress()` | glazing to the floor with its blocking box |
| Timber frame, soffit, entry pad | new `frame_porch` (`L.box` through `Mirror`), driven by `h["frame"]` | plain boxes; the frame sizes come from the entry |
| Garage wing on −x, flat terrace roof | existing `wing_exterior` with `side="west"`, `roof="flat"` | one wing builder for every villa |
| Flush aluminium garage doors | new `door_style="flush"` branch of `wing_exterior` | a door style for the next modern houses |
| Terrace glass balustrade | `L.railing` with the new `glass` argument | shared with the gallery guards and any balcony |
| Walkable terrace: lowered wing shell, deck at the L1 floor, doorway lining, layout rect, guard and post collisions | `wing.terrace` with `walkable=True` in `wing_exterior` and the plan | any flat-roof wing next to an upper room |
| Terrace pergola | new shared `L.pergola` | posts, beams and slats for any pergola, carport or pool deck |
| Floating stair, glass guard, slat lining, stair collisions | new `build_stair_float` (driven by `P.flights[0]`) | any straight stair cantilevered from a wall |
| Gallery and landing glass guards, slab-edge bands | `LI.balustrade(style="glass")` (panes named `Glass_…` so the bake leaves them out) and `L.box` in `build_skyline`, from the room rects | any glass guard on a floor edge |
| Linear fireplace | new `LI.fireplace(style="linear")` | a style of the existing fireplace builder |
| Kitchen, island, hood, baths, wardrobes, closet rails, bookshelves, mudroom bench | existing `lib_interior.py` and `build_kitchen` | reused as they are (pantry shelves = `LI.bookshelves` with a goods material) |
| Lot dressing: motor court, path, lamp, hedge, tree, postbox | existing `lib_site.py` builders | same estate furniture as the other villas |

#### 7.2c.5 Generator extension wishlist (impact on uniqueness ÷ effort)

| # | Extension | Lots it unlocks | Impact | Effort |
|---|-----------|-----------------|--------|--------|
| 1 | Palette-driven exterior materials (N2) + per-house `eave` and `shutters` flags | all | high | XS |
| 2 | Wing variants: mirrored wing (−x, every `L.box`/`L.b` in `wing_exterior` through `Mirror`, seeder minX from the wing) [A-03 builds it: 7.2c.6 H1], wing on the cottage plan (doorway in the east living wall), `wing.setback` (recessed front; doorway centre clamped to the wing's depth ± 0.8), `doors` 1/2, `door_style` carriage/plank/flush/glass [A-04 builds `flush`: 7.2c.7 S4], wing `roof` gable_z/flat/hip (N6), flat-roof `terrace` with glass and pergola [A-04 builds it: 7.2c.7 S5] | 14 lots (all but B-02, B-10) | high | S–M |
| 3 | Per-house `rotationY` in the site build (`houses[].rotationY`, door point = origin + R(θ)·(0, ZF + 0.8)); today it is hard-wired to 0 | all B lots | required | XS |
| 4 | Hip roof `L.hip_roof` + `L.beam` caps (N1); pyramid case for chimney hoods and the gazebo | A-01, B-02, B-04, B-09 wing | high | S |
| 5 | Wall textures in `make_texture`: `battens` (board-and-batten), `shakes` (shingles [A-03 builds it: 7.2c.6 H3], fish-scale variant), `slats` with `clad` panels [A-04 builds it: 7.2c.7 S2], half-timber overlay with `L.beam` | B-03, B-05, B-06, B-07, B-12, A-03, A-04 | high | S each |
| 6 | Porch kinds: `loggia` + `L.arch_panel` (N3), `portico` (2 columns + pediment), `gallery` (two-tier porch), `wrap` (porch turning a corner) [A-03 builds it: 7.2c.6 H4, `L.lean_to_corner`; `corner="east"|"west"` picks the corner, posts in house coordinates], `craftsman` (tapered posts on stone piers), `frame` (cantilevered timber frame whose bottom slab is the entry canopy) [A-04 builds it: 7.2c.7 S3] | A-01, B-09, B-01, A-03, B-07, B-11, A-04 | high | S–M each |
| 7 | `kind="french"` windows with blocking collision (N5) + `L.railing` (N4) with a `glass` pane variant [A-04 builds it: 7.2c.7 S5], Juliet and full balconies | A-01, B-01, B-02, B-07, A-04 | medium-high | S |
| 8 | Front window presets: `symmetric` (centred door, equal bays: B-02, B-09), `ribbon` (B-04), `picture` floor-to-ceiling (B-06 gable, B-10, A-04) [A-04 glazes with plain `kind="french"` openings, no preset needed: 7.2d.2], `bay` (projecting polygonal bay box, B-07) | 6 lots | medium-high | M |
| 9 | Roof forms: `shed`/`butterfly` (B-10), `gambrel_x` (A-03) [A-03 builds it: 7.2c.6 H2, `L.prism_x`], cross gable on `gable_z` (B-07), steep crisp gable via `eave=0` (B-06), stepped flat parapet `step` [A-04 builds it: 7.2c.7 S1] | 5 lots | medium | S–M each |
| 10 | Dormers on a `gable_x` front slope (gable box + mini prism + dressed window, visual) | B-03 (+ option B-12) | medium | M |
| 11 | Chimney list (twin end chimneys) and chimney materials | B-09, B-05, B-02 | low-medium | XS |
| 12 | Detail kit with `L.beam`: exposed rafter tails and knee brackets, vigas, half-timbering | B-11, B-08, B-05 | medium | S |
| 13 | Mission parapet (shaped espadaña panel with a bell niche, from `L.arch_panel`) | B-08 | medium | S |
| 14 | Carport builder (slim posts + flat slab + fascia, or `L.pergola` from A-04) and site-side driveway extension | B-10 | low-medium | S |
| 15 | Interior plan variants: villa plan [first variant built: estate plan, 7.2d; second built: harbor plan for A-03, 7.2d.1; third built: skyline plan for A-04, 7.2d.2], open-plan modern [A-04's skyline plan], 3-bed bungalow | all (felt from inside) | high | L |
| 16 | Walkable balconies / roof terraces, turrets [A-04 builds a walkable garage roof terrace inside the interior system: `wing.terrace.walkable`, deck at the L1 floor, extra L1 rect, guard collisions, 7.2c.7 S5; no exterior level system needed] | A-01, A-04, B-07 | low for the effort | L |

Recommended order: 1 → 3 → 2 (mirror + setback first) → 4 → 6 (loggia) → 7, which is exactly what Villa Serena needs, then 5
and 8, which give the executive homes most of their character.

### 7.2d Villa interiors: the estate, harbor and skyline plans and style kits [estate built for A-01 and A-02, harbor built for A-03, skyline built for A-04]

Item 15 of the wishlist, first variant. The town houses keep their duplex; a villa entry with
`interior=dict(plan="estate", style=..., stair="west"|"east", ...)` in `build_house_v2.py` gets a luxury plan instead
(research: [`research/luxury-suburban-houses/REPORT.md`](research/luxury-suburban-houses/REPORT.md) — volume and the
number of named rooms read as luxury more than finishes). Shell, interior contract, seeder bounds and `interiorOffset`
are unchanged; the windows follow the rooms, so the facades are regenerated with them.

| Level | Rooms (plan written with the stair west, mirrored when `stair="east"`) |
|---|---|
| L0 | Centre hall 3.2 m wide, **double height**, the stair rising away from the door (its top boxed in where it enters the great room); a *side room* behind the stair wall, reached from the great room; an *open room* through a 2.8 m opening; **great room** across the back: family end with fireplace (west), kitchen with island, hood and pendants (east, door to the garage); powder room in the west back corner |
| L1 | Corridor and **gallery** over the hall (guard + slab-edge band), bedrooms 2 and 3 on the stair side (built-in wardrobes), bath 2 at the back, **primary suite** on the other side: bedroom, walk-in closet, bath with freestanding tub, double vanity, shower and WC |

`layout.json` L1 rects leave out the stair well and the void; collisions: gallery guard, stair side and an under-stair block.
Fittings are parameterised builders in `map-src/CampusCove/lib_interior.py` (fireplace, island, range hood, wardrobe,
bookshelves, closet rail, shower, WC, vanity, tub, coffers, beams, tray ceiling, chandelier, balustrade), reused by
the next villas. Reception rooms and bedrooms stay empty for the player's Cove Home furniture.

| Style kit | Colonial Villa (A-02, `colonial`) | Villa Serena (A-01, `tuscan`) |
|---|---|---|
| Plan | stair west; library study (west) + formal dining (east) | stair east; living room (west) + dining off the kitchen (east) |
| Hall | black-and-white marble checkerboard, wainscoting, brass candle chandelier | stone tiles, plaster arches, wrought-iron chandelier |
| Walls / ceilings | crown moulding, wainscoting in hall and dining, hunter-green study, navy dining, coffered family ceiling, tray ceiling in the suite | warm plaster, arched openings, dark timber beams in living, great room and suite, terracotta floors |
| Stair / gallery | mahogany handrail on white spindles, capped newel | iron balusters, dark handrail, iron gallery railing |
| Fireplace | painted mantel, black firebox, overmantel painting | stone jambs, timber lintel, plaster hood to the ceiling |
| Kitchen | white shaker cabinets, marble island, stainless hood | olive cabinets, open timber shelves, butcher-block island, plaster hood |

Triangles: interiors ~11.7 k (A-02) and ~10.8 k (A-01), against ~5.2 k for a town house: within the 12 k work-interior
ceiling, accepted for the premium homes.

#### 7.2d.1 The harbor plan for A-03 [built]

Second variant of wishlist item 15. A New England shingle summer house is lived in around one big **living hall**, not
a formal foyer: you step from the porch straight into it, a dog-leg stair climbs along the front wall to a landing with
its own window and turns up a narrow stair well, a fieldstone fireplace sits in an **inglenook** with two built-in
settles, and the service side (mudroom, powder room, kitchen) runs to the garage on the west. Sources: the "service strip
between kitchen and garage" and the mudroom-off-the-garage pattern in
[`notes/floor_plans.md`](research/luxury-suburban-houses/notes/floor_plans.md), the Vernacular cues (cedar shingles,
wrap porch, informal massing) in [`notes/traditional_styles.md`](research/luxury-suburban-houses/notes/traditional_styles.md).

| | Estate plan (A-01, A-02) | Harbor plan (A-03) |
|---|---|---|
| Entry | centre hall, double height, gallery | living hall (the main living room), single height, beamed ceiling |
| Stair | one straight flight on the hall axis, rising away from the door | dog-leg: 4 treads along the front wall, landing, 11 treads toward the back, boxed in on L1 |
| Fire | in the great room, back wall | inglenook on the hall's east wall, two settles and a header beam |
| Reception | side room + open room in front, great room across the back | parlour (east, French doors onto the porch), sunroom across the back east |
| Service | kitchen beside the garage door, powder at the back | mudroom with bench (garage door), powder off the mudroom, kitchen with island behind |
| L1 | suite on one side, 2 bedrooms, bath 2 | suite (bedroom, bath, walk-through closet), 3 bedrooms incl. a bunk room, bath 2 |

Written for the west wing only (`Plan.harbor()` asserts `wing.s == −1`, `floors == 2`, `not mirror`), no mirroring.
House frame: xi 6.095, zi_f 5.0, zi_b −5.8, PT 0.12, e = PT/2; a partition "at x" is its centre line, its faces at ±e.

```
L0   x: −6.095        −3.43                          0.06             2.6          6.095
z 5.0  ┌─────────────┬───────────────────────────door──────────────┬──────────────┐
       │ Powder      │ landing ◄── flight 1 (4)        ┃           │ Parlour      │
z 3.0  ├──── d ──────┤   │                    inglenook┃ opening   │   French door│ east
       │ Mudroom     │   │ flight 2 (11)       settles ┃ 1.9–4.4   │   onto the   │ porch
garage │   bench     │   ▼                     fire ▣  ┃           │   porch      │
 door  │             │        Living hall      settles ┃           │              │
z −1.54├──── d ──────┴──── opening −3.0…−1.0 ──┬─ d ───┴────────────┴──── d ───────┤
       │ Kitchen: run on the back + west wall, │ Sunroom (slate floor,            │
       │ island, plaster hood                   │ panelled walls)                 │
z −5.8 └────────────────────────────────────────┴─────────────────────────────────┘
```

**L0 rooms** (rect x0, x1, z0, z1; level 0)

| Room | Rect | Floor | Paint / finish | Light |
|---|---|---|---|---|
| Hall | −3.37, 2.54, −1.48, 5.0 | wood | `hall`, no wainscot | manual (below) |
| Mudroom | −6.095, −3.49, −1.48, 2.94 | `foyer` (slate) | `mudroom`, `panel=True` (beadboard) | centre |
| Powder | −6.095, −3.49, 3.06, 5.0 | bath | `wainscot=True`, `baseboard=False` | centre |
| Parlour | 2.66, 6.095, −1.48, 5.0 | wood | `parlour` (wainscot dropped for the triangle budget) | centre |
| Kitchen | −6.095, 0.0, −5.8, −1.6 | wood | none | manual |
| Sunroom | 0.12, 6.095, −5.8, −1.6 | `foyer` (slate) | `sunroom`, `panel=True` | centre |

**L0 partitions** (name, axis, fixed, a0 → a1, doors (a, b[, h, style]))

| Partition | Line | Doors |
|---|---|---|
| `Walls_Row` | x-axis at z −1.54, x −6.095 → 6.095 | mudroom → kitchen (−5.2, −4.3); hall → kitchen (−3.0, −1.0, 2.4, cased); hall → sunroom (0.25, 1.15); parlour → sunroom (3.9, 4.8) |
| `Walls_HallW` | z-axis at x −3.43, z −1.54 → 5.0, **h = L1_Y** (it lines the stair well) | none |
| `Walls_HallE` | z-axis at x 2.6, z −1.54 → 5.0 | hall → parlour (1.9, 4.4, 2.4, cased) |
| `Walls_Powder` | x-axis at z 3.0, x −6.095 → −3.43 | powder door (−5.3, −4.5) |
| `Walls_KitchenE` | z-axis at x 0.06, z −5.8 → −1.54 | kitchen → sunroom (−4.4, −2.6, 2.4, cased) |

Path from the front door to the garage: hall → cased opening → kitchen → mudroom door → garage doorway.

**L1 rooms** (level 1)

| Room | Rect | Floor | Paint / finish | Notes |
|---|---|---|---|---|
| CorridorW | −6.095, −3.37, −0.69, 0.6375 | wood | | `open=("E",)`, `light=False` |
| StairHead | −3.37, −2.17, −0.69, 0.6375 | wood | | `open=("W", "E", "N")`, `light=False`; ends flush with the top tread |
| CorridorE | −2.17, 2.54, −0.69, 0.6375 | wood | | `open=("W",)`, `light=False` |
| StairWell | −3.37, −2.17, 0.6375, 5.0 | **None** (void over flight 2 and the landing) | `hall`, `baseboard=False` | `light=False` |
| Bunk | −6.095, −3.49, 0.7575, 5.0 | wood | `bunk` | bedroom 3, empty |
| Bed2 | −2.05, 2.54, 0.7575, 5.0 | wood | `bed` | over the hall front and flight 1 |
| Suite | 2.66, 6.095, −0.69, 5.0 | wood | `suite` | primary bedroom |
| Bed4 | −6.095, −2.35, −5.8, −0.81 | wood | `bed` | |
| Bath2 | −2.23, 0.35, −5.8, −0.81 | bath | `wainscot=True`, `baseboard=False` | |
| Closet | 0.47, 2.54, −5.8, −0.81 | wood | | walk-through from the primary bath |
| PrimaryBath | 2.66, 6.095, −5.8, −0.81 | bath | `wainscot=True`, `baseboard=False` | |

The corridor is three rooms so its floor can stop at the top tread over the stair mouth only (one room with `open=("N",)`
would leave a 6 cm slot under the bedroom partitions; one without it would overlap the top tread).

**L1 partitions**

| Partition | Line | Doors |
|---|---|---|
| `Walls_FrontRowW` | x-axis at z 0.6975, x −6.095 → −3.43 | bunk (−5.2, −4.3) |
| `Walls_FrontRowE` | x-axis at z 0.6975, x −2.11 → 2.6 | bed 2 (−1.6, −0.7) |
| `Walls_WellW` | z-axis at x −3.43, z 0.6375 → 5.0 | none |
| `Walls_WellE` | z-axis at x −2.11, z 0.6375 → 5.0 | none |
| `Walls_SuiteW` | z-axis at x 2.6, z −5.8 → 5.0 | corridor → suite (−0.5, 0.4); primary bath → closet (−5.3, −4.5) |
| `Walls_BackRow` | x-axis at z −0.75, x −6.095 → 6.095 | bed 4 (−3.3, −2.5); bath 2 (−1.6, −0.8); suite → primary bath (4.1, 4.9) |
| `Walls_Bed4E` | z-axis at x −2.29, z −5.8 → −0.75 | none |
| `Walls_Bath2E` | z-axis at x 0.41, z −5.8 → −0.75 | none |

**Windows** (`Plan.window(side, a, b, level, y, kind)`; y = (0.9, 2.2) unless given). Spacing was checked with the
exterior shutters (width min(0.55, 0.38·w), 0.12 off the opening) so no two shutters, casings or porch parts overlap.

| Side | L0 | L1 |
|---|---|---|
| front | powder (−5.15, −4.45) y (1.5, 2.1); **landing** (−3.22, −2.32) y (1.4, 2.4); hall (1.3, 2.2); parlour (3.6, 5.2) | bunk (−5.45, −4.35); stair well (−3.22, −2.32); bed 2 (−0.9, 0.0) and (1.3, 2.2); suite (3.6, 5.2) |
| back | kitchen sink (−4.0475, −2.4475) y (1.05, 2.15); sunroom (0.8, 2.4) and (3.8, 5.4) | bed 4 (−5.0, −3.4); bath 2 (−1.1, −0.5) y (1.5, 2.1); closet (1.2, 1.8) y (1.5, 2.1); primary bath (3.8, 5.0) y (1.0, 2.0) |
| east | parlour (−1.1, −0.1); **French door** (0.8, 2.4) y (0.05, 2.30) `kind="french"`; parlour (3.3, 4.5); sunroom (−4.7, −2.7) | suite (0.0, 1.2) and (2.8, 4.0); primary bath (−4.0, −2.8) y (1.0, 2.0) |
| west | **garage doorway** (0.2, 1.2) y (0, DOOR_H) `kind="door"`; kitchen (−4.0, −3.1) | corridor (−0.48, 0.42); bunk (2.3, 3.5); bed 4 (−3.9, −2.7) |

The landing window and the stair-well window above it make a stacked pair off the storey rhythm, a shingle-style cue
seen from the street; the landing window sits west of the porch roof. The kitchen west window stays clear of the return
cabinet (it ends at z −4.2) and its shutter ends 4 cm before the wing's back wall. The parlour French door is visual only:
the generic `COL_Window_<i>_French` box blocks it (it opens onto the porch, which the player reaches from outside). West
L0 and L1 openings above z −2.595 face the wing: only the doorway on L0; the L1 west windows sit above the wing roof
(its house-side edge is at 3.45).

**Stair** (`build_stair_l(B, M, P)`, from `P.flights`; run 0.2875, rise 0.1875, 16 risers to L1_Y 3.0, width 1.2)

```
flight 1   Stair_F1Step00..03  rises −x along the front wall: tread i x [−1.02 − (i+1)·0.2875, −1.02 − i·0.2875],
           z 3.8 → 5.0, solid box from y 0 to (i+1)·0.1875 (0.75 at x −2.17), run + 0.005 long as in build_stair;
           Stair_F1Nose00..03 0.04 × 1.2 × 0.03 on the +x edge of each tread, M["trim"]
landing    Stair_Landing  x −3.37 → −2.17, z 3.8 → 5.0, y 0 → 0.9375 (the 5th riser); Stair_LandingNose on its x −2.17 edge
flight 2   Stair_F2Step00..10  rises −z along Walls_HallW: tread k z [3.8 − (k+1)·0.2875, 3.8 − k·0.2875], x −3.37 → −2.17,
           solid from y 0 to 0.9375 + (k+1)·0.1875 (3.0 at z 0.6375); Stair_F2Nose00..10 on the +z edge of each tread
rails      Stair_F1Handrail L.beam (−1.02, 3.76, 0.95) → (−2.17, 3.76, 1.70), 0.06 × 0.06, M["rail"]
           Stair_F2Handrail L.beam (−2.13, 3.8, 1.8875) → (−2.13, 0.6375, 3.95), 0.06 × 0.06, M["rail"]
           (runs into Fit_WellHeader and Walls_WellE above 2.75, hidden there)
           Stair_F1Stringer L.beam (−1.02, 3.80, 0.06) → (−2.17, 3.80, 0.81); Stair_F2Stringer (−2.17, 3.8, 0.9975) →
           (−2.17, 0.6375, 3.06); 0.04 × 0.25, M["stair"]
balusters  0.035 square, 0.95 high, M["trim"]: flight 1 treads 1 and 3 at z 3.76 (x −1.451, −2.026, from 0.375 / 0.75);
           flight 2 treads 1, 3, 5, 7, 9 at x −2.13 (z 3.369, 2.794, 2.219, 1.644, 1.069, from 1.3125 / 1.6875 /
           2.0625 / 2.4375 / 2.8125)
newels     Stair_NewelFoot (−0.96, 3.76) 0.12 square, y 0 → 1.15 + cap 0.16 × 0.06 (M["rail"]);
           Stair_NewelTurn (−2.13, 3.76) y 0 → 2.09 + cap
header     Fit_WellHeader x −2.23 → −2.05, z 0.6375 → 5.0, y 2.75 → 3.0, M["trim"]: carries Walls_WellE over the hall and
           closes the slot between the L0 ceiling and that wall; clear height on the last tread of flight 1 is 2.0 m
```
Headroom: flight 1 and the landing stay under the L1 floor (top tread 0.75 + 1.8 = 2.55, landing 2.74 < 2.8); flight 2
climbs in the open well. The L1 well is closed by walls on three sides and open only at its mouth, the top tread, so it
needs no gallery guard.

**layout.json** (`Plan.layout` takes `P.l1_rects` and, when `P.flights` is set, writes its stairs instead of `Stair_Main`)

```
L0 rects   (−6.095, 6.095, −5.8, 5.2) and the wing (−13.495, −6.095, −2.19, 5.0)
L1 rects   (−6.095, 6.095, −5.8, 0.6375)      back row and corridor
           (−6.095, −3.37, 0.6375, 5.0)       bunk room and Walls_WellW
           (−2.17, 6.095, 0.6375, 5.0)        bed 2 (over flight 1 and the landing corner) and the suite
stairs     Stair_F1      x −2.17 → −1.02, z 3.8 → 5.0, y0 0, y1 0.75, rise "-x"
           Stair_Landing x −3.37 → −2.17, z 3.8 → 5.0, y0 0.9375, y1 0.9375, rise "-z" (a flat stair; houseLevels.ts accepts it)
           Stair_F2      x −3.37 → −2.17, z 0.6375 → 3.8, y0 0.9375, y1 3.0, rise "-z"
```
Each step between pieces is one riser (0.1875 < STEP_UP 1). The L1 rects leave out the well (x −3.37 → −2.17, z 0.6375 →
5.0).

**Collisions** (besides the walls, which collide through `L.wall`): `Stair_F1Side` centre (−1.595, 3.76), 1.15 × 0.08,
y 0 → 2.8 (no stepping onto flight 1 from the hall side); `Stair_F2Side` centre (−2.13, 2.21875), 0.08 × 3.1625, y 0 → 3.0
(above it, `Walls_WellE` collides on L1); fittings collide through their builders (fireplace, settles, bench, island,
kitchen run and return, vanities, WCs, showers, tub, wardrobes, closet rails); the French door box. Garage doorway: the
wing lining and casings of `build_garage` through H1.

**Fittings** (`build_harbor(B, M, P)`; wall anchors `((x, z), facing)` on the room-side face)

| Where | Builder |
|---|---|
| Hall | `LI.fireplace(B, "Fit_Fireplace", ((2.54, 0.05), "-x"), 0, L0_H, M, "stone")` (new style) · `LI.inglenook(B, "Fit_Inglenook", ((2.54, 0.05), "-x"), 0, M, width=2.9, depth=1.3, header_y=2.25)` (new) · `LI.beams(B, "Fit_BeamHall", −2.05, 2.54, −1.48, 5.0, L0_H, M, axis="z", spacing=1.15)` → beams at x −1.476, −0.329, 0.819, 1.966 · well header and stair (above) |
| Kitchen | `build_kitchen(KB, M, P)` with `KB = Mirror(coll, cols, −1)` and `P.kitchen = dict(x0=0.4, x1=xi, ret_z=zb + 1.6, sink_x=3.2475, hood=(1.05, 0.9), uppers="shelf", west=True)` in the mirrored frame: run on the back wall x −6.095 → −0.4, return on the west wall z −5.18 → −4.2, sink at x −3.2475 under the back window, open shelves at x −2.2475 → −1.55 and −6.095 → −4.6475 · `Fit_Cooktop` box (−1.05, −5.47), 0.76 × 0.5 × 0.012 at K_H + 0.04, M["dark"] · `LI.range_hood(B, "Fit_Hood", ((−1.05, −5.8), "+z"), 0, L0_H, M, "plaster")` · `LI.island(B, "Fit_Island", −3.2475, −3.68, 0, 2.4, 0.9, M, pendants=2, ceil_y=L0_H)` |
| Mudroom | `LI.mudroom_bench(B, "Fit_MudBench", ((−3.49, 0.8), "-x"), 0, 2.4, M)` (new), z −0.4 → 2.0, facing the garage doorway |
| Powder | `LI.vanity(B, "Fit_PowderVanity", ((−6.095, 4.4), "+x"), 0, 0.6, M)` · `LI.wc(B, "Fit_PowderWC", ((−3.49, 4.3), "-x"), 0, M)` |
| Bed 2, bed 4 | `LI.wardrobe(B, "Fit_WardrobeBed2", ((−2.05, 2.9), "+x"), Y1, 2.0, M)` · `LI.wardrobe(B, "Fit_WardrobeBed4", ((−2.35, −3.3), "-x"), Y1, 2.0, M)` |
| Bath 2 | `LI.shower(B, "Fit_Bath2Shower", (−2.23, −5.8), 1, 1, Y1, M)` · `LI.vanity(B, "Fit_Bath2Vanity", ((0.35, −3.6), "-x"), Y1, 0.9, M)` · `LI.wc(B, "Fit_Bath2WC", ((0.35, −2.2), "-x"), Y1, M)` |
| Primary bath | `LI.tub(B, "Fit_Tub", 4.3, −4.5, Y1, 1.7, 0.8, "x", M)` · `LI.vanity(B, "Fit_SuiteVanity", ((2.66, −2.5), "+x"), Y1, 1.5, M, basins=2, depth=0.55)` · `LI.shower(B, "Fit_SuiteShower", (6.095, −0.81), −1, −1, Y1, M)` · `LI.wc(B, "Fit_SuiteWC", ((6.095, −2.4), "-x"), Y1, M)` |
| Closet | `LI.closet_rail(B, "Fit_ClosetRailW", ((0.47, −3.3), "+x"), Y1, 4.0, M)` · `LI.closet_rail(B, "Fit_ClosetRailE", ((2.54, −2.65), "-x"), Y1, 3.3, M)` (1.17 m aisle) |
| Suite | `LI.beams(B, "Fit_BeamSuite", 2.66, 6.095, −0.69, 5.0, Y1T, M, axis="x", spacing=5.69 / 4)` → beams at z 0.021, 1.444, 2.866, 4.289 |

Hall, parlour, sunroom, bunk room, bedrooms and suite stay empty for Cove Home furniture.

New builders in `lib_interior.py` (wall-anchor convention of the module):
- `fireplace(…, style="stone")`: `_Hearth` 1.96 × 0.5 × 0.05 stone (1.96 so its ends stay 2 cm off the settles);
  `_Firebox` 0.86 × 0.22 × 0.78 soot at y + 0.05; `_JambA/B` 0.42 × 0.3 × 0.78 stone, shift ∓0.64; `_Lintel`
  1.7 × 0.3 × 0.34 stone at y + 0.83; `_Mantel` 1.9 × 0.34 × 0.12 `M["beam"]` at y + 1.17; `_Breast` 1.5 × 0.22 stone from
  y + 1.29 to the ceiling; `wcol` 1.96 × 0.5 × 1.3.
- `inglenook(B, name, wall, y, M, width=2.9, depth=1.3, header_y=2.25)`: per side (shift ∓(width/2 − 0.225)) a settle
  `_BaseA/B` 0.45 × depth × 0.40, `_SeatA/B` 0.47 × (depth + 0.02) × 0.05 at y + 0.40, `_BackA/B` 0.06 × depth × 1.40 on the
  outer edge (shift ∓(width/2 − 0.03)); two `_PostA/B` 0.1 × 0.1 from the floor to the header at depth − 0.1, shift
  ∓(width/2 − 0.05); `_Header` width × 0.2 × 0.22 at y + header_y, `off = depth − 0.2`; all `M["beam"]`;
  `wcol` per settle 0.45 × depth × 1.4. Here the settles cover z −1.40 → 1.50, mouth at x 1.24, header x 1.24 → 1.44.
- `mudroom_bench(B, name, wall, y, along, M, depth=0.45)`: `_Base` along × depth × 0.40 `M["closet"]`; `_Seat`
  (along + 0.04) × (depth + 0.03) × 0.05 `M["beam"]` at y + 0.40; `_Back` along × 0.02 × 1.35 `M["closet"]` from y + 0.45;
  `_HookRail` along × 0.03 × 0.12 `M["beam"]` at y + 1.55, off 0.02; `int(along / 0.4)` `_Hook<k>` 0.03 × 0.08 × 0.03
  `M["fixture"]` at y + 1.57 (on the rail face, not floating under it), off 0.05, evenly spread; `_Shelf` (along + 0.04) × 0.30 × 0.03 `M["closet"]` at y + 1.80;
  `wcol` (along + 0.04) × (depth + 0.03) × 0.5.

**Lights** (rooms with `light=True` get a centre lamp): `("Hall", 0, 0.245, 0.4)`, `("HallFront", 0, 0.245, 3.2)`
(between the beams at −0.329 and 0.819), `("Kitchen", 0, −1.6, −2.6)`, `("KitchenSink", 0, −3.2475, −4.6)`,
`("StairWell", 1, −2.77, 2.8)`, `("CorridorW", 1, −4.7, −0.03)`, `("CorridorE", 1, 0.2, −0.03)`; the island pendants.

**Code hooks.** `Plan.__init__` dispatches `interior.plan == "harbor"` to `self.harbor()`, which fills rooms,
partitions, windows, `self.flights`, `self.l1_rects`, `self.kitchen` and `self.fit = dict(plan="harbor", S=S, I=I)` and
leaves `self.stair` and `self.bath` at None. `build_interior` creates the `P.fit` materials as today (the harbor kit
provides every key read there); it calls `build_kitchen` with `KB`
when `P.kitchen.get("west")`, `build_stair_l` when `P.flights`, and `build_harbor` instead of `build_estate` when
`P.fit.get("plan") == "harbor"`. No new allow-list prefix (`Stair_`, `Fit_`, `Kitchen_`, `Garage_` exist).

**Style kit** (`STYLES["harbor"]`):

```python
"harbor": dict(foyer=("tiles", "#5e6366", "#4a4f52", 0.6), stone="#9a948a", rail="#6b4c32", baluster="trim",
               metal="#b08d57", fire="stone", island="#b8895a", hood="plaster", uppers="shelf", beam="#8a6d4e",
               shelf="#c9a77c", closet="#f1efe8", art="#4f6f86", art2="#e6dcc6", plaster="#f4f2ea",
               vanity_top="#e9e7e1", stair_pat="planks", panel_pat="stripes", panel_acc="#e6e4dc",
               paints=dict(hall="#f1ede2", mudroom="#dfe6e2", parlour="#e6ecea", sunroom="#e4eef0", bunk="#d6e4ec",
                           suite="#ebefe9")),
```

| Style kit | Harbor Shingle House (A-03, `harbor`) |
|---|---|
| Plan | living hall with a dog-leg stair and inglenook; parlour (east) and sunroom (back east); mudroom, powder and kitchen on the garage side |
| Floors | white oak planks; slate tiles in the mudroom and the sunroom |
| Walls / ceilings | white beadboard wainscot (mudroom, sunroom), sea-glass and pale blue paints, weathered oak beams in the hall and the suite |
| Stair | oak handrail on white square balusters, capped newels, boxed well upstairs with its own window |
| Fireplace | fieldstone surround and chimney breast, oak mantel, inglenook settles under an oak header |
| Kitchen | pale grey-white cabinets, soapstone worktops, open oak shelves, white plaster hood, butcher-block island |
| Baths | white marble vanity tops, aged-brass fixtures, freestanding tub in the primary bath |

Triangles: about 10.5 k by count of the pieces above (stairs 0.5 k, kitchen 1.0 k, inglenook and fireplace 0.3 k, baths
0.9 k, beams 0.1 k; walls, skins and trims as in the estate plan), inside the 12 k ceiling. The build prints `interior
tris`; if it goes over 12 k, drop the sunroom beadboard ceiling and the parlour wainscot first.
Built: the first build counted 12 724 (more rooms, windows and wall skins than the estate plan), so both were dropped:
**12 424** interior, 6 732 exterior. Still 0.4 k over the 12 k ceiling; the next cuts would be lamp segments or fewer
L1 windows (open).

#### 7.2d.2 The skyline plan for A-04 [built]

Third variant of wishlist item 15. A contemporary house is lived in as one open space under volume, not as a sequence of
rooms off a hall: the door opens on a stone-floored entry that flows into the dining area and the great room behind it,
and to the right into a **double-height living room** (5.6 m) lit by a two-storey glass wall on the street and a glass
wall on the garden. A **floating stair** of cantilevered oak treads climbs across the back of that volume, against a
cedar-slatted feature wall, to a landing and a **glass gallery** that overlooks the living room. The service side
(study, powder, walk-in pantry, mudroom) is a band along the garage, and the classic grocery path runs garage →
mudroom → pantry → kitchen. Sources: "one double-height volume with an overlooking gallery", oversized glazing to the
garden and the pantry-mudroom adjacency in [`notes/floor_plans.md`](research/luxury-suburban-houses/notes/floor_plans.md);
the Contemporary massing, glazing and materials in
[`notes/modern_styles.md`](research/luxury-suburban-houses/notes/modern_styles.md) § 7.

| | Estate plan (A-01, A-02) | Harbor plan (A-03) | Skyline plan (A-04) |
|---|---|---|---|
| Entry | centre hall, double height, gallery | living hall, single height, beams | stone entry open to the dining area and the living room |
| Volume | double-height hall | none | double-height living room with a two-storey glass wall |
| Stair | straight flight on the hall axis, rising away from the door (−z), boxed by walls | dog-leg along the front wall | straight flight across the house (+x), open treads cantilevered from a slatted wall, glass guard |
| Upper floor | gallery over the hall | boxed stair well | landing and gallery with glass guards over the living room |
| Kitchen | east, by the garage door | west, behind the mudroom | west end of a full-width great room, island, garden glass wall |
| Service | powder at the back | mudroom with bench, powder off it | study, powder off the entry, walk-in pantry between mudroom and kitchen |
| L1 | suite on one side, 2 bedrooms, bath 2 | suite, 3 bedrooms, bath 2 | suite over the whole west band (bedroom, walk-through closet, bath, doorway onto the walkable terrace), 3 bedrooms, bath 2 |

Written for the west wing only (`Plan.skyline()` asserts `wing.s == −1`, `floors == 2`, `not mirror`). The plan code has
no house literal: it reads the lines below from `interior["lines"]`, derives every room, door, flight and light from them
and from xi, zf, zb, and takes its windows from `interior["windows"]`. A-04 values: xi 6.595, zf 5.0, zb −6.2, PT 0.12,
e = PT/2; a partition "at x" is its centre line.

```
lines (A-04)   spine SP −2.0 · void_x VX 1.0 · feature_z FZ 0.34 · service_z SZ −2.2 · study_z STZ 2.0 · mud_x MX −3.68
               back_l1 BZ −0.8 · closet_z CZ −2.92 · bath2 (B2W, B2E) (1.66, 3.66)
derived        RUN 0.2875, RISE L1_Y / 16 = 0.1875, SX1 = VX + 16·RUN = 5.6 (stair top)
               stair band z FZ + e → FZ + e + STAIR_W = 0.4 → 1.6 · FRZ = FZ + PT = 0.46 (bed 2 front line)
asserts        SX1 + 0.9 ≤ xi (landing ≥ 0.9 m: 6.5 ≤ 6.595); the garage doorway lies inside the wing
               (wing zb + 0.15 ≤ a, b ≤ wing zf − 0.15: −2.04 ≤ −1.9, −0.9 ≤ 4.85); every room rect has a positive size
```

```
L0   x: −6.595        −3.68      −2.0        1.0                                  5.6     6.595
z 5.0  ┌─────────────────────────┬──── door ───┬──────── two-storey glass wall ────────┐
       │ Study, shelves on the   │ Entry       │ Living, double height                 │
       │ back wall               d  sidelight  │                         linear fire ▐ │
z 2.0  ├───────────┬─────────────┤             │                                     ▐ │
       │ Mudroom   │ Powder      d             │ stair foot ► floating treads ► top    │
garage d bench     ├─────────────┤             ├── feature wall, cedar slats ──┤ pass  │
 door  │ lockers   │ Pantry      d      Dining (open to the entry, the great room and the pass)
z −2.2 ├───────────┴─────────────┘ . . . . . . . . . . . . . . . . . . . . . . . . . . │
       │ Great room: kitchen run, island and hood (west) · family end, garden glass (east) │
z −6.2 └──────────────────────────────────────────────────────────────────────────────────┘
```

**L0 rooms** (rect x0, x1, z0, z1; level 0; the dotted line z −2.2 has no wall east of the spine: the slabs of the dining
area and the great room meet on it)

| Room | Rect (formula → A-04) | Floor | Paint / finish | Light |
|---|---|---|---|---|
| Entry | SP + e, VX, FZ + e, zf → −1.94, 1.0, 0.4, 5.0 | `foyer` (limestone) | none, `open=("E",)` | centre |
| Living | VX, xi, FZ + e, zf → 1.0, 6.595, 0.4, 5.0 | wood | none, `open=("W",)` | manual (L1 ceiling) |
| Dining | SP + e, xi, SZ + e, FZ − e → −1.94, 6.595, −2.14, 0.28 | wood | none | centre |
| Great | −xi, xi, zb, SZ − e → −6.595, 6.595, −6.2, −2.26 | wood | none | centre |
| Study | −xi, SP − e, STZ + e, zf → −6.595, −2.06, 2.06, 5.0 | wood | `study` | centre |
| Powder | MX + e, SP − e, FZ + e, STZ − e → −3.62, −2.06, 0.4, 1.94 | bath | `wainscot=True`, `baseboard=False` | centre |
| Pantry | MX + e, SP − e, SZ + e, FZ − e → −3.62, −2.06, −2.14, 0.28 | tile | none | centre |
| Mudroom | −xi, MX − e, SZ + e, STZ − e → −6.595, −3.74, −2.14, 1.94 | `foyer` | `mudroom` | centre |

The entry, living, dining and great room are unpainted on purpose: the walls of the double-height volume run from the L0
shell (to 3.0) into the L1 shell, and one wall material from floor to ceiling leaves no seam at 2.8.

**L0 partitions**

| Partition | Line | Doors |
|---|---|---|
| `Walls_Spine` | z-axis at x SP −2.0, z SZ → zf (−2.2 → 5.0) | pantry → dining (SZ + 0.3, SZ + 1.1) = (−1.9, −1.1); powder (FZ + 0.26, FZ + 1.06) = (0.6, 1.4); study (STZ + 1.0, STZ + 1.9) = (3.0, 3.9) |
| `Walls_ServiceBack` | x-axis at z SZ −2.2, x −xi → SP | none |
| `Walls_MudE` | z-axis at x MX −3.68, z SZ → STZ | mudroom → pantry (SZ + 0.3, SZ + 1.1) = (−1.9, −1.1) |
| `Walls_PowderS` | x-axis at z FZ 0.34, x MX → SP | none |
| `Walls_StudyBack` | x-axis at z STZ 2.0, x −xi → SP | none |
| `Walls_Feature` | x-axis at z FZ 0.34, x VX → SX1 (1.0 → 5.6), **h = L1_Y** (it carries the gallery edge) | none |

Paths: front door → entry → dining → great room; stair → gallery → corridor → suite → terrace doorway → garage roof terrace; entry → stair foot (walk +x along z 0.4 → 1.6); living ↔ dining through
the entry or the 0.92 m pass under the landing (x 5.68 → 6.595); garage doorway → mudroom → pantry → dining and kitchen.

**L1 rooms** (level 1)

| Room | Rect (formula → A-04) | Floor | Paint / finish | Notes |
|---|---|---|---|---|
| Suite | −xi, SP − e, BZ + e, zf → −6.595, −2.06, −0.74, 5.0 | wood | `suite` | primary bedroom, 26.0 m², doorway onto the walkable terrace |
| Closet | −xi, SP − e, CZ + e, BZ − e → …, −2.86, −0.86 | wood | | walk-through |
| PrimaryBath | −xi, SP − e, zb, CZ − e → …, −6.2, −2.98 | bath | `wainscot=True`, `baseboard=False` | |
| Corridor | SP + e, VX, BZ + e, FZ + e → −1.94, 1.0, −0.74, 0.4 | wood | | `open=("E",)`, `light=False` |
| Gallery | VX, xi, BZ + e, FZ + e → 1.0, 6.595, −0.74, 0.4 | wood | | `open=("W", "N")`, `light=False`; the slab stops on the void edge |
| Landing | SX1, xi, FZ + e, FZ + e + STAIR_W → 5.6, 6.595, 0.4, 1.6 | wood | | `open=("S", "W", "N")`, `light=False`; the top tread meets it at x 5.6 |
| StairVoid | VX, SX1, 0.4, 1.6 | **None** | none, `baseboard=False` | `light=False` |
| LivingVoid | VX, xi, 1.6, zf | **None** | none, `baseboard=False` | `light=False` |
| Bed2 | SP + e, VX − PT, FRZ + e, zf → −1.94, 0.88, 0.52, 5.0 | wood | `bed` | front, inside the timber frame |
| Bed3 | SP + e, B2W − e, zb, BZ − e → −1.94, 1.6, −6.2, −0.86 | wood | `bed` | |
| Bath2 | B2W + e, B2E − e, zb, BZ − e → 1.72, 3.6, −6.2, −0.86 | bath | `wainscot=True`, `baseboard=False` | |
| Bed4 | B2E + e, xi, zb, BZ − e → 3.72, 6.595, −6.2, −0.86 | wood | `bed` | |

**L1 partitions**

| Partition | Line | Doors |
|---|---|---|
| `Walls_SpineL1` | z-axis at x SP, z zb → zf | corridor → suite (BZ + 0.2, BZ + 1.1) = (−0.6, 0.3) |
| `Walls_BackRowL1` | x-axis at z BZ −0.8, x −xi → xi | suite → closet centred(closet mid −4.3275, 0.9) = (−4.7775, −3.8775); bed 3 (SP + 0.6, SP + 1.5) = (−1.4, −0.5); bath 2 centred((B2W + B2E)/2, 0.8) = (2.26, 3.06); bed 4 centred((B2E + e + xi)/2, 0.9) = (4.7075, 5.6075) |
| `Walls_ClosetBack` | x-axis at z CZ −2.92, x −xi → SP | closet → bath (−4.7775, −3.8775) |
| `Walls_Bed2Front` | x-axis at z FRZ 0.46, x SP → VX − e | bed 2 (SP + 0.5, SP + 1.4) = (−1.5, −0.6) |
| `Walls_Bed2E` | z-axis at x VX − e 0.94, z FZ + e → zf (0.4 → 5.0); its void face is the void edge x 1.0 | none |
| `Walls_Bath2W` / `Walls_Bath2E` | z-axis at x B2W 1.66 / B2E 3.66, z zb → BZ | none |

**Windows** (`interior["windows"]`, each `(side, a, b, level, y, kind)`; WIN = (0.9, 2.2), DOOR_H 2.1). Centres follow the
rooms (study, suite and living windows are centred on their rooms; the sink window on the sink).

| Side | L0 | L1 |
|---|---|---|
| front | study (−5.3275, −3.3275) y (0.6, 2.4); sidelight (−1.6, −1.0) y (0.05, 2.4) `french`; living (1.4975, 6.0975) y (0.05, 2.75) `french` | suite (−5.5775, −3.0775) y (0.05, 2.45) `french`; bed 2 (−1.33, 0.27) WIN; living upper (1.4975, 6.0975) y (0.05, 2.45) `french` |
| back | kitchen sink (−4.395, −2.795) y (1.05, 2.15); garden glass (0.4, 3.1) and (3.3, 6.0) y (0.05, 2.6) `french` | primary bath (−5.0275, −3.6275) y (1.0, 2.0); bed 3 (−1.0, 0.8) WIN; bath 2 (2.2, 3.1) y (1.5, 2.1); bed 4 (4.4, 6.0) WIN |
| east | dining (−1.7, −0.5) WIN; great room (−5.4, −3.4) WIN | gallery and landing slot (−0.5, 1.4) y (0.05, 2.45) `french`; bed 4 (−4.4, −2.8) WIN |
| west | **garage doorway** (SZ + 0.3, SZ + 1.3) = (−1.9, −0.9) y (0, DOOR_H) `door`; kitchen (−4.3, −3.1) WIN | suite → terrace doorway (1.4, 3.0) y (0.0, 2.3) `terrace` (open, no glass, no blocking box) |

The living glass is two stacked openings: the L0 one ends at 2.95 (head to 3.03), the black floor band (3.08 → 3.24) reads
as the transom and the L1 one starts at 3.25, so from the street it is one two-storey glazed bay; inside, a 0.3 m strip of
wall separates the two panes. The terrace doorway sits on the L1 floor: the deck top (exterior 3.20) is the L1 floor height, so the player walks out level. West openings above z −2.595 face the wing: only the doorway on L0 and the terrace door on L1 (above
the wing roof, onto the walkable terrace). The kitchen west window (exterior z −5.705 → −4.505) stays behind the wing's back face (−4.0) and above the
return cabinet (which ends at z −4.6). Every `french` opening gets the generic blocking box `COL_Window_<i>_French`; the `terrace` doorway does not.

**Stair** (`build_stair_float(B, M, P)`, from `P.flights[0]`; 16 treads, run 0.2875, rise 0.1875, width 1.2, rise "+x",
wall on the S side (z0), open on the N side (z1)):

```
treads     Stair_Tread00..15  x [x0 + i·run, x0 + (i+1)·run], z 0.4 → 1.6, y (i+1)·rise − 0.06 → (i+1)·rise, M["stair"]
           (open risers: each tread floats 0.06 thick; their back ends run into the slat lining of the feature wall;
           tread 15 ends at x 5.6 under the landing edge, top 3.0 = L1_Y)
guard      Glass_StairGuard  L.beam((x0, z1 − 0.03, rise + 0.52), (x1, z1 − 0.03, L1_Y + 0.52), 0.02, 0.88, M["glass"])
           (the line from the first tread (1.0, 0.1875) to the landing (5.6, 3.0), slope 31.4°; vertical extent 1.03)
handrail   Stair_Handrail    L.beam((x0, z1 − 0.03, rise + 1.06), (x1, z1 − 0.03, L1_Y + 1.06), 0.05, 0.05, M["dark"])
wall       Fit_FeatureSlats  x VX → SX1, z FZ + e + 0.005 → + 0.025 (0.405 → 0.425), y 0 → L1_Y + 0.02, M["slats"]
           (also hides the gallery slab end and the feature wall top over the void)
bands      Fit_VoidEdgeW     x VX → VX + 0.03, z 0.4 → zf, y L0_H → L1_Y + 0.02, M["trim"]   (under Walls_Bed2E)
           Fit_LandingEdgeN  x SX1 → xi, z 1.6 → 1.63, y L0_H → L1_Y + 0.02, M["trim"]
           Fit_LandingEdgeW  x SX1 − 0.03 → SX1, z 0.4 → 1.6, y L0_H → L1_Y − 0.06, M["trim"]   (under the top tread)
guards L1  LI.balustrade(B, "Fit_GalleryGuard", "x", FZ + e − 0.04, VX, SX1, L1_Y, M, "glass")      z 0.36, x 1.0 → 5.6
           LI.balustrade(B, "Fit_LandingGuard", "x", FZ + e + STAIR_W − 0.04, SX1, xi, L1_Y, M, "glass")   z 1.56, x 5.6 → 6.595
```
The builder is written for any x-running flight (`rise` "+x" or "−x", `open` "N" or "S" in the flight dict): it mirrors
tread order and the open side from them, so the next modern house can reuse it with its own rect.

**layout.json** (`Plan.layout` already writes `P.l1_rects` and `P.flights`)

```
L0 rects   (−6.595, 6.595, −6.2, 5.2) and the wing (−13.995, −6.595, −2.19, 5.0)
L1 rects   (−6.595, 6.595, −6.2, 0.4)       back row, corridor and gallery
           (−6.595, 1.0, 0.4, 5.0)          suite and bed 2 (west of the void)
           (5.6, 6.595, 0.4, 1.6)           landing
           (−14.06, −6.595, −2.35, 5.06)    garage roof terrace (7.2c.7 S5), over the L0 wing rect
stairs     Stair_Main  x 1.0 → 5.6, z 0.4 → 1.6, y0 0, y1 3.0, rise "+x"   (houseLevels.ts accepts "+x")
```
The L1 rects leave out the void (x 1.0 → 6.595, z 1.6 → 5.0) and the stair band (x 1.0 → 5.6, z 0.4 → 1.6). The terrace rect
stays inside the seeder bounds (minX −14.195, maxZ 5.2).

**Collisions** (besides the walls): `Stair_Side` centre (3.3, 1.62), 4.6 × 0.08, y 0 → 4.05 (the open side, from the
floor to the guard top: nobody walks under the treads or steps off into the living room); `Stair_End` centre (5.64, 1.0),
0.08 × 1.2, y 0 → L0_H (closes the space under the high end from the pass); the gallery and landing guards (from
`LI.balustrade`, 1.05 high); fittings through their builders; the `french` blocking boxes; the terrace guards and pergola posts (`COL_Terrace_*`, 7.2c.7 S5). The space under the flight is
enclosed by the feature wall, `Stair_Side` and `Stair_End`; at the foot the level code puts the player on the ramp.

**Fittings** (`build_skyline(B, M, P)`; every position from a room rect through `rect(nm, level)` as in `build_harbor`;
wall anchors `((x, z), facing)` on the room-side face)

| Where | Builder (A-04 result) |
|---|---|
| Living | `LI.fireplace(B, "Fit_Fireplace", ((liv.x1, (liv.z0 + STAIR_W + liv.z1)/2), "-x"), 0, L1_Y + L1_H, M, "linear")` (new style; east wall, centre z 3.3, breast to the 5.6 ceiling) · `Fit_FeatureSlats` and the stair (above) |
| Great | `build_kitchen(KB, M, P)` with `KB = Mirror(coll, cols, −1)` and `P.kitchen = dict(x0=xi − 5.0, x1=xi, ret_z=zb + 1.6, sink_x=xi − 3.0, hood=(xi − 1.2, 0.9), uppers=S["uppers"], west=True)`: run x −6.595 → −1.595 on the back wall, return z −5.58 → −4.6 on the west wall, sink at x −3.595 under the back window, wall cabinets x −2.595 → −1.595 and −6.595 → −5.895 · `Fit_Cooktop` box (−5.395, −5.87), 0.76 × 0.5 × 0.012 at K_H + 0.04 · `LI.range_hood(B, "Fit_Hood", ((−5.395, great.z0), "+z"), 0, L0_H, M, "steel")` · `LI.island(B, "Fit_Island", −(xi − 2.5), great.z0 + 2.5, 0, 3.0, 1.0, M, pendants=3, ceil_y=L0_H)` → body x −5.595 → −2.595, z −4.2 → −3.2 (1.38 m to the run, 0.94 m to the service wall) |
| Study | `LI.bookshelves(B, "Fit_StudyShelves", (((st.x0 + st.x1)/2, st.z0), "+z"), 0, min(3.0, st.x1 − st.x0 − 1.2), M)` → x −5.8275 → −2.8275 on the back wall |
| Pantry | `LI.bookshelves(B, "Fit_PantryShelves", (((pa.x0 + pa.x1)/2, pa.z1), "-z"), 0, pa.x1 − pa.x0 − 0.16, {**M, "books": M["pantry"]}, h=2.2)` → 1.4 m of shelves with jars and boxes on the north wall, clear of both doors |
| Powder | `LI.wc(B, "Fit_PowderWC", ((pw.x0, pw.z1 − 0.44), "+x"), 0, M)` → x −3.62 → −2.90, z 1.28 → 1.72 · `LI.vanity(B, "Fit_PowderVanity", ((pw.x1 − 0.44, pw.z1), "-z"), 0, 0.6, M)` → x −2.8 → −2.2 |
| Mudroom | `LI.mudroom_bench(B, "Fit_MudBench", ((mud.x1, mud.z1 − 1.34), "-x"), 0, 1.6, M)` → z −0.2 → 1.4, facing the garage door · `LI.wardrobe(B, "Fit_MudLockers", ((mud.x0 + 1.35, mud.z1), "-z"), 0, 1.9, M, doors=3)` → x −6.195 → −4.295 |
| Bed 2, 3, 4 | `LI.wardrobe` 2.0 long on one side wall, centred on the room depth: bed 2 ((bed2.x0, mid), "+x"); bed 3 ((bed3.x1, mid), "-x"); bed 4 ((bed4.x0, mid), "+x") |
| Bath 2 | `LI.shower(B, "Fit_Bath2Shower", (b2.x0, b2.z0), 1, 1, Y1, M)` · `LI.vanity(B, "Fit_Bath2Vanity", ((b2.x0, b2.z1 − 2.4), "+x"), Y1, 1.5, M, basins=2, depth=0.55)` · `LI.wc(B, "Fit_Bath2WC", ((b2.x1, b2.z0 + 1.6), "-x"), Y1, M)` |
| Primary bath | `LI.tub(B, "Fit_Tub", (pb.x0 + pb.x1)/2, pb.z0 + 0.7, Y1, 1.7, 0.8, "x", M)` under the back window · `LI.vanity(B, "Fit_SuiteVanity", ((pb.x1, (pb.z0 + pb.z1)/2), "-x"), Y1, 1.5, M, basins=2, depth=0.55)` · `LI.shower(B, "Fit_SuiteShower", (pb.x0, pb.z1), 1, −1, Y1, M)` · `LI.wc(B, "Fit_SuiteWC", ((pb.x0, pb.z0 + 1.6), "+x"), Y1, M)` |
| Closet | `LI.closet_rail(B, "Fit_ClosetRailW", ((cl.x0, mid), "+x"), Y1, cl.z1 − cl.z0 − 0.2, M)` · `Fit_ClosetRailE` on (cl.x1, mid) facing "-x" (1.8 m each, 3.6 m aisle across the walk-through doors) |

Entry, living, dining, family end, suite and bedrooms stay empty for Cove Home furniture.

New builder styles in `lib_interior.py` (wall-anchor convention of the module):
- `fireplace(…, style="linear")`: `_Breast` 2.6 × 0.30 from y to ceil_h, M["stone"]; `_Bench` 3.0 × 0.50 × 0.38, M["stone"]
  (a long low plinth across the breast); `_Firebox` 1.6 × 0.02 × 0.42 at y + 0.62, `off=0.30` (its back face on the breast
  face), M["soot"]; `_Glow` 1.4 × 0.01 × 0.06 at y + 0.66, `off=0.32`, M["candle"] (a warm ember line the bake keeps
  emissive); `wcol` bench 3.0 × 0.5 × 0.45 and `wcol(B, f"{name}Breast", …)` 2.6 × 0.30 × 2.0.
- `balustrade(…, style="glass")`: see S5.

**Lights** (rooms with `light=True` get a centre lamp): `("LivingHigh", 1, (VX + xi)/2, (FZ + e + STAIR_W + zf)/2)` = (3.7975,
3.3) and `("StairHigh", 1, (VX + SX1)/2, FZ + e + STAIR_W/2)` = (3.3, 1.0), both on the 5.6 ceiling of the void;
`("Gallery", 1, 3.7975, −0.17)`, `("Corridor", 1, −0.47, −0.17)`; the three island pendants.

**Code hooks.** `Plan.__init__` dispatches `interior.plan == "skyline"` to `self.skyline()`, which fills rooms,
partitions, windows, `self.flights` (one flight, `rise="+x"`, `open="N"`), `self.l1_rects`, `self.kitchen` and
`self.fit = dict(plan="skyline", S=S, I=I)`, and leaves `self.stair` and `self.bath` at None. In `build_interior`:
`build_stair_l` is called only for the harbor plan; the fittings dispatch becomes `{"harbor": build_harbor, "skyline":
build_skyline}.get(P.fit.get("plan"), build_estate)`; `build_skyline` calls `build_stair_float`. When the kit has them,
`build_interior` adds `M["slats"] = L.make_mat(f"IN_{key}_Slats", S["slats"], 0.7, "slats", 0.04, accent=S["slats_acc"])`
and `M["pantry"] = L.make_mat("IN_PantryGoods", S["pantry"][0], 0.8, "stripes", 0.08, accent=S["pantry"][1])`. No new
allow-list prefix (`Stair_`, `Fit_`, `Glass_`, `Kitchen_`, `Garage_` exist).

**Style kit** (`STYLES["skyline"]`):

```python
"skyline": dict(foyer=("tiles", "#cfccc4", "#bdb9b0", 1.2), stone="#3d3f42", rail="#1e1f22", baluster="trim",
                metal="#2a2b2e", fire="linear", island="#ecebe7", hood="steel", uppers="cabinet", beam="#8a6d4e",
                shelf="#c9a77c", closet="#ecebe7", art="#4a4d52", art2="#a8774f", plaster="#f2f1ed",
                vanity_top="#ecebe7", stair_pat="planks", slats="#a8774f", slats_acc="#7d5534",
                pantry=("#d8c8a6", "#6f8a63"),
                paints=dict(study="#3f4a4f", mudroom="#dcdedd", suite="#e9e6df")),
```

| Style kit | Skyline Residence (A-04, `skyline`) |
|---|---|
| Plan | open entry, dining and great room; double-height living room with a floating stair and a glass gallery; study, powder, pantry and mudroom on the garage side |
| Floors | pale oak planks; large limestone tiles in the entry and the mudroom |
| Walls / ceilings | warm white walls and flat ceilings throughout, a cedar-slatted feature wall carrying the stair, a deep slate study |
| Stair | open oak treads cantilevered from the slat wall, frameless glass guard with a black handrail, glass gallery and landing guards |
| Fireplace | linear fire in a basalt breast running the full 5.6 m height, low basalt bench |
| Kitchen | graphite flat-panel cabinets and wall units, white quartz worktops and island, stainless hood |
| Baths | white quartz vanity tops, black fixtures, freestanding tub under the window in the primary bath |

Triangles: about 11.3 k by count of the pieces above (walls, skins and trims about 7.0 k with fewer painted rooms than the
harbor plan; kitchen 1.0 k; baths 0.9 k; shelves 0.4 k; wardrobes, lockers, bench and closet rails 0.6 k; stair and guards
0.3 k; fireplace 0.1 k; garage, doors and lights 1.0 k), inside the 12 k ceiling. The build prints `interior tris`; if it
goes over 12 k, drop the pantry shelves (0.2 k), then the east dining window, then the study shelves.

### 7.3 Non-lot land around the bands

| Area | Bounds | Use |
|------|--------|-----|
| South-west corner square | x 103–130, z −193…−213 | pocket garden [v1]: lawn, trees, 2 benches |
| South-east corner square | x 234–257, z −193…−213 | bio-swale x 237–254, z −196…−210 [v1 lawn, v2 planting] |
| North-west / north-east pockets | x 103–112 / 248–257, z −299…−327 | trees [v1] |
| Band-end strips | x 103–123 / 237–257, z −293…−299 | lawn |
| Boulevard side strips | x 170–172.05 and 191.55–194, z −193…−213 | lawn (between lots B-01/B-12 and the boulevard sidewalks) |
| Emergency-lane strips | x 168–177 and 183–192, z −299…−327 | lawn, 2 lamps |

### 7.4 Geometry audit (re-run by the build, `check_disjoint`)

- No two of: 16 lots, clubhouse parcel, promenade, park, boulevard, emergency lane, swale, pocket garden and the four straight
  loop reserves overlap (allowed contacts: boulevard ↔ loop south reserve, emergency lane ↔ loop north reserve).
- No lot or parcel enters a loop corner reserve (distance to each corner centre ≥ 12.65 m; A-01 and A-04 touch it exactly at
  the tangent points (140, −299) and (220, −299)).
- Clubhouse parcel, promenade and park lie inside the inner block (x 132.3…227.7, z −222.3…−289.7).
- Every lot is 2.85 m from the wall inner faces; every driveway meets a straight loop leg
  (straights: x 135.65…224.35 / z −225.65…−286.35).

---

## 8. Communal Amenities

### 8.1 Clubhouse & leisure parcel — x 140–220, z −225 → −250

```
Clubhouse (pavilion_shell) [v1 shell, v3 walk-in]
  Centre (180.0, -233.0), footprint x 170–190, z -227 → -239 (20 × 12 m), front (south) faces the boulevard axis
  Floor slab 0.00 → 0.10 ; walls 0.25 thick, 0.10 → 3.70 ; roof slab 3.70 → 4.00 ; gable roof 4.00 → 6.20 (ridge along x)
  South face: double door x 179.1–180.9, h 2.4 (leaf closed in v1), 4 windows 2.0 × 1.6 sill 0.9
  North face (park): 4 windows ; east/west faces: 2 windows each
  v1: closed shell, one footprint COL ; v3: walk-in interior (lounge 10 × 8, gym 8 × 8, admin desk, toilets) per OPEN_WORLD.md
  Forecourt: TW_CovePlazaFlagstone x 172–188, z -222.3 → -226.9 (top 0.08), door point (180.0, 0, -226.4)
Pool [v1 pad, v2 basin]
  Deck pad x 144–162, z -228 → -240 (18 × 12, TW_CovePoolPaving, top 0.06)
  v2: raised decorative basin, water x 147–159, z -231 → -237 (12 × 6), coping 0.30 wide y 0 → 0.45,
      water TW_PondWater at y 0.40, one COL 12.6 × 6.6 × 1.0 at (153, -234). Sunken pool and swimming: later (needs walk height)
Pickleball court [v1 pad, v2 court]
  Fenced pad x 199–211, z -227 → -247 (12 × 20, TW_CoveCourtPaving top 0.06), long axis north–south
  v2: court x 201.95–208.05, z -230.295 → -243.705 (6.10 × 13.41, top 0.08), lines top 0.10 (TW_CoveCourtLine),
      net across z -237.0 with posts at x 201.6 / 208.4, chain-link fence 2.4 m with a 1.2 m gate on the west side
      (x 199, z -236.4 → -237.6), 4 fence COL boxes (west one split around the gate)
  (A tennis court needs a 36.6 × 18.3 m fence and does not fit next to the clubhouse.)
Spacing: deck → clubhouse 8 m, clubhouse → court fence 9 m
```

### 8.2 Promenade — x 140–220, z −250 → −253 [v1]

Paved walk (`TW_CovePaving`, top 0.06) between the parcel and the park; lamps on the park side (§ 9).

### 8.3 Central park — x 140–220, z −253 → −286 [v1, gazebo and playground v2]

```
Fountain plaza: disc r 6.0 at (180.0, -269.5), TW_CovePlazaFlagstone top 0.08
Fountain (fountain builder): basin r 2.5, rim y 0.08 → 0.58, water TW_PondWater at 0.53, column + bowl, COL 5.2 × 5.2 × 1.0
N–S axis path: x 179–181, z -253 → -289.7 (stops at the plaza, top 0.06)
E–W axis path: z -268.5 → -270.5, x 132.3 → 227.7 (loop inner sidewalk to loop inner sidewalk)
Jogging loop: square-cornered rectangle, centreline x 145 / 215, z -257.5 / -281.5, 1.5 m wide, top 0.06, 188 m;
              the axis paths abut it (cut with kit.floor(replace=True), never overlapping at the same y)
Gazebo [v2]: octagonal, 6 m across, centre (162, -276), floor top 0.12 (one 0.12 step, no walk height needed), roof h 4.5
Playground [v2]: soft pad x 194–206, z -272 → -280 (TW_CovePlaySoftFloor top 0.06), play set with COL
Lawn: site lawn TW_CoveLawn
```

### 8.4 Utility node — outside the wall, west of the forecourt [v2]

```
Compound: x 152–165, z -175 → -186 (13 × 11 m), walls 0.25 thick, h 2.2, TW_CoveWallPlaster, 1.5 m gate on the east face
          (z -179.75 → -181.25); 3.85 m from the wall outer face; screened by a 1.6 m hedge on its south and west sides
Apron:    TW_CoveCobble x 165–172.05, z -178.5 → -181.5 (top 0.06) to the forecourt west sidewalk
Contents: transformer cabinet, telecom box, 4 wheeled bins, 2 recycling cages (props, COL each)
COL:      4 wall boxes (east one split around the gate)
v1:       footprint reserved (lawn), nothing built
```

Placing it outside the wall keeps service access off the residents' roads and out of the inner clear zone.

### 8.5 Bio-swale — x 237–254, z −196 → −210 [v2]

Flat in v2 too (no depression without a heightmap): `TW_CoveSwaleGrass` (top 0.02 is the site lawn's height, so the swale is
cut out of the site lawn with `replace=True`), reeds `TW_CoveReed` (soft, no COL), a grate decal at the loop's south-east
corner as the inlet. A real −0.3 m channel needs a zone heightmap (topographer).

---

## 9. Street Furniture & Lighting Schedule

| Item | Qty | Positions | Builder / height | Phase |
|------|-----|-----------|------------------|-------|
| Lamps, Cove Road | ≈ 15 | § 5.5 | `street_lamp`, 4.0 m | v1 |
| Lamps, forecourt | 3 | island nose (180, −173.5), (171.4, −176.0), (192.2, −176.0) | `street_lamp`, 4.5 m | v1 |
| Lamps, boulevard island | 2 | (180, −196.0), (180, −202.0) | `street_lamp`, 4.5 m | v1 |
| Lamps, loop | 14 | inner lawn 5.15 m from the centreline: south leg z −222.8 at x 140/160/200/220; north leg z −289.2 at x 140/160/200/220; west leg x 132.8 and east leg x 227.2 at z −236/−256/−276 | `street_lamp`, 4.0 m | v1 |
| Lamps, park | 8 | (165, −255.6) (195, −255.6) (165, −283.6) (195, −283.6) (142.9, −258) (142.9, −281) (217.1, −258) (217.1, −281) | `street_lamp`, 3.5 m | v1 |
| Lamps, emergency lane | 2 | (175.5, −310), (184.5, −310) | `street_lamp`, 4.0 m | v1 |
| Benches, park | 8 | (155, −255.6) yaw 0 · (205, −255.6) 0 · (155, −283.6) π · (205, −283.6) π · (142.9, −262) −π/2 · (142.9, −277) −π/2 · (217.1, −262) π/2 · (217.1, −277) π/2 | `kit.bench` | v1 |
| Benches, pocket garden | 2 | (115, −205), (122, −205), yaw 0 | `kit.bench` | v1 |
| Trees | 20 | inner strips x 136 / 224 at z −236, −246, −256, −282 (8); park (152, −262) (166, −262) (194, −262) (208, −262) (150, −277) (211, −277) (6); pockets (110, −200) (122, −207) (107, −310) (107, −320) (252, −310) (252, −320) (6) | `tree`, trunk COL 0.6 × 0.6 × 2.0 | v1 |
| Postboxes | 16 | § 7.2 | `postbox` | v1 |
| Monument signs | 2 | § 6.2 | `monument_sign` | v1 |
| Town pillars + signpost | 2 + 1 | § 5.1, § 5.5 | `gate_pier`, `signpost` | v1 |
| Street name signs | 4 | loop corners, outer sidewalk back edge | `signpost` | v2 |
| Fire hydrants | 8 | loop, every ~45 m on the inner lawn | `hydrant`, COL 0.3 | v2 |
| CCTV cameras | 10 | § 6.4 | `cctv` | v2 |

---

## 10. Material Palette Summary

All materials are `lib_common.make_mat` (64 px procedural texture, Principled BSDF). Zone-specific names follow the site
convention (`TW_Pub*`, `TW_Mall*`): **new** keys are prefixed `TW_Cove*` / `EX_cove_*`. Only two existing keys are reused.
`DC_` stays reserved for furniture items shipped in `decor/` (style guide § 3), so street props here are `TW_`.

| Element | Material key | Status | Base colour · pattern | Topo-check class |
|---------|--------------|--------|-----------------------|------------------|
| Pool / fountain / swale water | `TW_PondWater` | existing (animated by `pondWater.ts` when the zone sets `animatedWater`) | #4fa9c8 | water |
| Town hedge stubs | `TW_Hedge` | existing name (`build_town.py`), re-created at the town hedge colour | #4c7f3e · noise | soft-ish, has COL |
| Site lawn | `TW_CoveLawn` | new | #84b864 · noise | GROUND (Lawn) |
| Lot lawn | `TW_CoveLotLawn` | new | #93c46f · noise | GROUND (Lawn) |
| Connector verges | `TW_CoveVergeGrass` | new | #7aae5c · noise | GROUND (Grass) |
| Carriageway | `TW_CoveAsphalt` | new | #4a4d52 · noise | GROUND (Asphalt) |
| Lane markings | `TW_CoveRoadLine` | new | #f1ead2 | SOFT (Line) |
| Curbs | `TW_CoveCurb` | new | #cfc8b8 · noise | solid < 0.15 m |
| Sidewalks, paths, islands | `TW_CovePaving` | new | #d9cdb2 · tiles, accent #c4b799 | GROUND (Paving) |
| Driveways, service apron | `TW_CoveCobble` | new | #a8977c · tiles | GROUND (Cobble) |
| Plazas | `TW_CovePlazaFlagstone` | new | #cbbfa6 · tiles | GROUND (Flagstone) |
| Pool deck | `TW_CovePoolPaving` | new | #e6dccb · tiles | GROUND (Paving) |
| Court pad / court surface / lines | `TW_CoveCourtPaving` / `TW_CoveCourtPavingBlue` / `TW_CoveCourtLine` | new | #8f9a8a / #3f7fae / #f4f1ea | GROUND (Paving) / GROUND (Paving) / SOFT (Line) |
| Playground pad | `TW_CovePlaySoftFloor` | new | #c8553d | GROUND (SoftFloor) |
| Swale | `TW_CoveSwaleGrass`, `TW_CoveReed` | new | #6f9e57, #9cb86a | GROUND (Grass), SOFT (Reed) |
| Lot hedges | `TW_CoveHedgeLow` | new | #4f8f4a · noise | LOW_DECOR (Hedge ≤ 0.45) |
| Wall render | `TW_CoveWallPlaster` | new | #efe6d2 · noise | solid, COL |
| Pilasters, piers, plinth, sign plinths | `TW_CoveWallStone` | new | #c8b99a · tiles | solid, COL |
| Coping, caps | `TW_CoveCoping` | new | #c0613a · tiles | solid |
| Iron (gates, rails, lamp poles, posts) | `TW_CoveIron` | new | #26282c | solid, COL |
| Boom arms | `TW_CoveBoom` | new | #e8e4dc · stripes, accent #c8423a | solid |
| Lamp glow | `TW_CoveLampGlow` | new | #fff1c4, emit #ffd27a 1.4 | SOFT (Glow) |
| Signs / lettering | `TW_CoveSignBoard` / `TW_CoveGold` | new | #2f4a3a / #e3b84a emit 0.6 | Text 2 cm proud |
| Trees | `TW_CoveTrunk`, `TW_LeafCove`, `TW_LeafCoveLight` | new | #7a5638, #4f9d54, #6fb85a | SOFT (Leaf), trunk COL |
| Building walls | `EX_cove_Plaster` | new | #f2edd7 · noise | COL per building |
| Building roofs | `EX_cove_RoofTile` | new | #c0613a · stripes, accent #a24f2f | — |
| Trims, frames | `EX_cove_Trim` | new | #e9e2cf | — |
| Glazing | `EX_cove_Glass` | new | #9fc3d6, alpha 0.45 | — |
| Doors | `EX_cove_Door` | new | #7a5638 · planks | — |
| Floors | `EX_cove_Floor` | new | #d8c8a8 · tiles | hidden in v1 |

---

## 11. Collision Specification Summary

> **As built (v1.2)**: no `*.colsrc.glb`; the build writes every box to `cove_heights.layout.json` → `collision` and
> `apply-cove-heights.mjs` merges them into `town.collision.json` (orchard pattern). Boxes are named `COL_Cove_*` (estate)
> and `COL_CoveRoad_*` (road). The list below is the design; `build_cove_heights_site.py` is the source of truth.

`COL_` boxes come from kit boxes (`collide=True` or `visible=False, collide=True`) and from `L.Collisions.add` for props; they
are exported in `cove_heights.colsrc.glb` / `cove_road.colsrc.glb` and become the zones' `collisionUrl` files
(`front/src/game/town/openHouses.ts` composes every zone `collisionUrl`). Format below:
`(name, cx, cz, sx, sz, h)` with the box on `y = 0`, rotation 0 unless stated.

### 11.1 Permanent in v1 — `cove_heights.collision.json`

```python
# perimeter (0.40 thick to cover pilasters and plinth, 2.90 high to the caps)
("Cove_WallS_W",   135.635, -190.0,  71.67,  0.40, 2.90)   # x 99.8 → 171.47
("Cove_WallS_E",   226.165, -190.0,  68.07,  0.40, 2.90)   # x 192.13 → 260.2
("Cove_WallN_W",   137.985, -330.0,  76.37,  0.40, 2.90)   # x 99.8 → 176.17
("Cove_WallN_E",   222.015, -330.0,  76.37,  0.40, 2.90)   # x 183.83 → 260.2
("Cove_WallW",     100.0,   -260.0,   0.40, 140.40, 2.90)
("Cove_WallE",     260.0,   -260.0,   0.40, 140.40, 2.90)
# main gate (south)
("Cove_PierW2",    171.75,  -190.0,   0.56,  0.56, 3.30)
("Cove_PierW1",    173.55,  -190.0,   0.56,  0.56, 3.30)
("Cove_PierE1",    190.05,  -190.0,   0.56,  0.56, 3.30)
("Cove_PierE2",    191.85,  -190.0,   0.56,  0.56, 3.30)
("Cove_IslandRail",180.0,   -190.0,   4.00,  0.30, 1.10)
("Cove_DividerRail",185.8,  -190.0,   0.60,  0.30, 1.10)
("Cove_RfidPedestal",185.8, -188.6,   0.40,  0.40, 1.30)
("Cove_Gatehouse", 180.0,   -184.5,   3.50,  5.00, 3.90)
("Cove_SignW",     168.0,   -166.0,   3.20,  0.70, 1.80)
("Cove_SignE",     195.6,   -166.0,   3.20,  0.70, 1.80)
# emergency gate (north), locked in v1
("Cove_PierNW",    176.45,  -330.0,   0.56,  0.56, 3.30)
("Cove_PierNE",    183.55,  -330.0,   0.56,  0.56, 3.30)
("Cove_GateEmergency", 180.0, -330.0, 6.54,  0.30, 2.40)
# buildings and park
("Cove_Clubhouse", 180.0,   -233.0,  20.20, 12.20, 4.00)
("Cove_Fountain",  180.0,   -269.5,   5.20,  5.20, 1.00)
# props: generated by their builders
#   Cove_Lamp_00…   0.35 × 0.35 × 2.0   (29 lamps, § 9)
#   Cove_Tree_00…   0.60 × 0.60 × 2.0   (20 trees)
#   Cove_Bench_00…  from kit.bench      (10)
#   Cove_Postbox_<lot id> 0.35 × 0.45 × 1.2 (16)
```

Not collided on purpose: lot hedges (0.40 m `TW_CoveHedgeLow`, `LOW_DECOR`), curbs (0.14), sidewalks, islands (0.12),
pads and plazas (≤ 0.08), lane lines, foliage.

### 11.2 Permanent in v1 — `cove_road.collision.json`

```python
("CoveRoad_TownPillarN", 42.05, 18.66, 0.60, 0.60, 2.20, yaw=bearing 23.93°)
("CoveRoad_TownPillarS", 44.98,  9.62, 0.60, 0.60, 2.20, yaw=bearing 12.07°)
("CoveRoad_HedgeStubN",  40.88, 20.965, 4.57, 1.00, 1.60, rotated along (41.92, 18.93) → (39.84, 23.00))
("CoveRoad_HedgeStubS",  45.325, 7.665, 3.37, 1.00, 1.60, rotated along (45.61, 6.00) → (45.04, 9.33))
("CoveRoad_Signpost",   126.19, 15.19, 0.30, 0.30, 2.00)
#   CoveRoad_Lamp_00…  0.35 × 0.35 × 2.0 (≈ 15)
```

Removed from `town.collision.json` by the apply script: `COL_Hedge_44`, `COL_Hedge_45`, `COL_Hedge_46`, `COL_Tree_1_0`,
`COL_Tree_1_1`.

### 11.3 Toggleable — layout `gate.toggle[]`, NOT exported in v1

```python
("Cove_BoomEgress",   176.0,  -190.0, 4.00, 0.30, 2.00)
("Cove_BoomVisitor",  183.75, -190.0, 3.50, 0.30, 2.00)
("Cove_BoomResident", 187.85, -190.0, 3.50, 0.30, 2.00)
("Cove_PortalW",      172.65, -190.0, 1.24, 0.30, 2.00)
("Cove_PortalE",      190.95, -190.0, 1.24, 0.30, 2.00)   # the checkpoint portal
```

Boxes are 2.0 m high although the arms sit at 0.95 m: a closed barrier stops walkers, who could otherwise duck under it.

### 11.4 Later

[v2] pool basin, court fence (4), utility compound walls (4) and props, gazebo posts, play set, hydrants (8).
[v3] houses (per-lot hull collisions), clubhouse hull with a door opening instead of the footprint box.

---

## 12. Builders (modular rule, CLAUDE.md)

Every building and repeated prop is a composition of parameterised builders. New shared builders go into
**`map-src/CampusCove/lib_site.py` (new)**, imported next to `lib_common` and `lib_kit` like the existing scripts. Builders that
already exist as local functions in other site scripts (`build_pub_site.py` `ribbon` / `lantern` / `hedge` / `signpost` /
`tree` / `bench`, `build_pond.py` `lamp` / `bench` / `tree_*`, `build_town.py` `street_lamp` / `fountain` / `ring`,
`mall_lib.Ctx.lamp` / `tree` / `way_sign`, `mall_decor._fountain`) are context-bound copies; they are not reusable as-is and those
scripts are not migrated by this work (CLAUDE.md: untouched parts are not rewritten).

### 12.1 Existing, reused as-is

| Builder | Module | Used for |
|---------|--------|----------|
| `new_build_scene`, `make_mat`, `make_texture` | `lib_common.py` | scene, all materials |
| `box` (with `rot`), `cyl`, `cone`, `join`, `text_mesh` | `lib_common.py` | rotated pieces, round parts, lettering |
| `Collisions.add` (with `rot`) | `lib_common.py` | prop and rotated COL boxes |
| `check_grounded`, `export_glb`, `write_json`, `snapshot` | `lib_common.py` | checks, exports, previews |
| `Kit.add`, `part`, `floor` (`replace=True`), `slab`, `roof_slab` | `lib_kit.py` | lawns, roads, sidewalks, curbs, pads, slabs |
| `Kit.wall` (`openings=`), `corner`, `pillar`, `opening`, `door_frame`, `gable_roof` | `lib_kit.py` | perimeter wall, pilasters, buildings |
| `Kit.bench`, `Kit.planter` | `lib_kit.py` | benches, island planters |
| `report` (`check_coplanar_overlaps`, `check_contained`, `check_enclosure`) | `lib_kit.py` | build gate (raises on any defect) |
| `build_decor.py` builders | — | nothing outdoors; `build_potted_plant` can dress the clubhouse interior in v3 |

### 12.2 New in `lib_site.py`

| Builder | Signature (sketch) | Composed of | Phase |
|---------|--------------------|-------------|-------|
| `fillet_polyline` | `(points, radii, step=0.5) → [(x, z)]` | geometry | v1 |
| `offset_band` | `(coll, name, centreline, d0, d1, y0, y1, mat, d0_end=None, d1_end=None)` | bmesh ribbon with side faces (generalises the pub/pond `ribbon`; per-station offsets for tapers and the flare) | v1 |
| `arc_band` | `(coll, name, centre, r0, r1, a0, a1, y0, y1, mat, seg)` | bmesh annular sector (loop corners, fountain plaza) | v1 |
| `road_section` | `(kit_or_coll, name, centreline, section)` | `offset_band` per layer, or `kit.floor` / `kit.add` on straight axis-aligned legs | v1 |
| `dashed_line` | `(coll, name, centreline, offset, dash, gap, w, y0, mat)` | `box` with `rot` | v1 |
| `check_disjoint` | `(rects, allow) → [(a, b)]` | plan audit of § 7.4, raises in the build | v1 |
| `check_corridor_clear` | `(town_collision_json, centreline, half_width, ignore) → [(name, gap)]` | asserts ≥ 0.5 m from every town COL box except the removed ones | v1 |
| `perimeter_wall` | `(kit, name, axis, fixed, a0, a1, spec, openings, pilaster_skip)` | `kit.wall` + plinth `kit.add` + coping `kit.add` + `kit.pillar` + caps + `kit.corner` | v1 |
| `gate_pier` | `(kit, name, gx, gz, w, h, mat, cap_mat)` | `kit.pillar` + cap | v1 |
| `pavilion_shell` | `(kit, name, x0, z0, x1, z1, y0, wall_h, thick, mats, windows, door, roof_h, ridge_axis)` | `kit.wall` (window and door openings) + `kit.corner` + `kit.door_frame` + `kit.slab` + `kit.gable_roof`; one builder for the guardhouse and the clubhouse | v1 |
| `boom_barrier` | `(coll, name, post, length, direction, raised=True) → toggle box` | post `box` + arm `box` (stripes) | v1 |
| `ped_gate` | `(coll, name, axis, fixed, a0, a1, open=True) → toggle box` | iron frame `box`es, leaf swung open | v1 |
| `swing_gate` | `(kit, name, axis, fixed, a0, a1, h, leaves=2, locked=True)` | leaf frames and bars (`kit.add`), padlock | v1 |
| `traffic_island` | `(kit, name, x0, z0, x1, z1)` | paving `kit.floor` + 4 curb `kit.add` | v1 |
| `street_lamp` | `(coll, cols, name, gx, gz, h, mats)` | `cyl` base/pole, `sphere`-like globe (`cyl` seg 10), cap `cone`, COL | v1 |
| `tree` | `(coll, cols, name, gx, gz, kind, s, mats)` | trunk `cyl` + crowns, trunk COL | v1 |
| `hedge_run` | `(coll, cols, name, x0, z0, x1, z1, w, h, mat, collide)` | rotated `box` between two points (+ COL when `collide`) | v1 |
| `postbox` | `(coll, cols, name, gx, gz, yaw, label, mats)` | post + box + `text_mesh` label, COL | v1 |
| `monument_sign` | `(kit, coll, name, gx, gz, yaw, text, mats)` | plinth `kit.add` + cap + `text_mesh` | v1 |
| `signpost` | `(coll, cols, name, gx, gz, yaw, labels, mats)` | post + arrow boards + `text_mesh`, COL | v1 |
| `fountain` | `(coll, cols, name, gx, gz, r, mats)` | basin `cyl`, water `cyl`, column, bowl (`cone`), COL | v1 |
| `pool_basin` | `(kit, name, x0, z0, x1, z1, coping, water_y, mats)` | coping `kit.add` × 4 + water box | v2 |
| `chainlink_fence` | `(kit, name, x0, z0, x1, z1, h, gate, mats)` | posts `kit.pillar` + mesh panels + COL per side | v2 |
| `court_lines` | `(coll, name, x0, z0, x1, z1, kind)` | thin `box`es | v2 |
| `gazebo_octagon` | `(coll, cols, name, gx, gz, d, h, mats)` | posts, rail, floor, cone roof | v2 |
| `cctv`, `hydrant`, `bin_wheeled`, `recycling_cage`, `utility_cabinet`, `reed_clump`, `play_set` | `(coll, cols, name, gx, gz, yaw, mats)` | boxes / cylinders | v2 |

---

## 13. Blender Build Blueprint (Data Structures)

For `map-src/CampusCove/build_cove_heights_site.py`. Game-space values; `L` = `lib_common`, `K` = `lib_kit`, `S` = `lib_site`.

```python
import math
OUT = os.path.join(L.OUT_ROOT, "park", "cove_heights")
PI = math.pi

# ── ZONES ────────────────────────────────────────────────────────────────────
BOUNDS      = {"minX": 99.0, "maxX": 261.0, "minZ": -331.0, "maxZ": -160.0}
ROAD_BOUNDS = {"minX": 46.6, "maxX": 186.0, "minZ": -160.0, "maxZ": 23.0}
WALL_RECT   = (100.0, -330.0, 260.0, -190.0)        # wall centrelines x0, z0, x1, z1
LAWN_RECT   = (99.0, -331.0, 261.0, -160.0)         # site lawn, y 0.00 → 0.02

# ── VERTICAL STACK (tops) ────────────────────────────────────────────────────
Y = {"lawn": 0.02, "lot_lawn": 0.04, "asphalt": 0.04, "line": 0.06, "path": 0.06, "plaza": 0.08,
     "club_floor": 0.10, "sidewalk": 0.12, "curb": 0.14, "hedge_low": 0.42}

# ── PERIMETER ────────────────────────────────────────────────────────────────
WALL = {"thick": 0.30, "h": 2.60, "plinth_w": 0.36, "plinth_h": 0.30, "coping_w": 0.36, "coping_h": 0.10,
        "pilaster_w": 0.40, "pilaster_h": 2.80, "cap_w": 0.50, "cap_h": 0.08, "every": 5.0,
        "col_thick": 0.40, "col_h": 2.90}
PIER = {"w": 0.56, "h": 3.20, "cap_w": 0.66, "cap_h": 0.10}
WALL_OPENINGS = {   # (a0, a1) along the wall between pier outer faces; pilasters skipped inside
    "S": {"opening": (171.47, 192.13), "skip": (175.0, 180.0, 185.0, 190.0)},
    "N": {"opening": (176.17, 183.83), "skip": (180.0,)},
}

# ── ROAD SECTIONS: (layer, d0, d1) lateral offsets from the centreline ───────
SECTIONS = {
    "loop":   [("sidewalk", -4.65, -3.15), ("curb", -3.15, -3.0), ("asphalt", -3.0, 3.0),
               ("curb", 3.0, 3.15), ("sidewalk", 3.15, 4.65)],
    "road":   [("sidewalk", -5.95, -4.15), ("verge", -4.15, -3.15), ("curb", -3.15, -3.0), ("asphalt", -3.0, 3.0),
               ("curb", 3.0, 3.15), ("verge", 3.15, 4.15), ("sidewalk", 4.15, 5.95)],
    "throat": [("sidewalk", -4.15, -2.65), ("curb", -2.65, -2.5), ("asphalt", -2.5, 2.5),
               ("curb", 2.5, 2.65), ("sidewalk", 2.65, 4.15)],
}

# ── LOOP ─────────────────────────────────────────────────────────────────────
LOOP = {"x": (127.65, 232.35), "z": (-217.65, -294.35), "r": 8.0, "section": "loop",
        "corners": [(135.65, -225.65), (135.65, -286.35), (224.35, -286.35), (224.35, -225.65)],
        "cuts": {"S": (174.0, 189.6), "N": (177.0, 183.0)}}       # carriageway spans of the T junctions

# ── BOULEVARD + FORECOURT (x spans, z from → to) ─────────────────────────────
BOULEVARD = {
    "z": (-168.0, -214.65),
    "spans": [("sidewalk", 172.05, 173.85), ("curb", 173.85, 174.0), ("asphalt", 174.0, 189.6),
              ("curb", 189.6, 189.75), ("sidewalk", 189.75, 191.55)],
    "island":  {"x": (178.0, 182.0), "z": (-172.0, -205.0)},
    "divider": {"x": (185.5, 186.1), "z": (-186.0, -194.0)},
    "flare":   {"z": (-160.0, -168.0)},                               # § 5.4 edge table
}

# ── GATE ─────────────────────────────────────────────────────────────────────
GATE = {
    "line_z": -190.0,
    "piers": {"W2": 171.75, "W1": 173.55, "E1": 190.05, "E2": 191.85},
    "portals": {"W": (172.03, 173.27), "E": (190.33, 191.57)},
    "booms": [  # name, post (x, z), lane span, arm direction
        ("Egress",   (178.2, -190.0), (174.0, 178.0), "-x"),
        ("Visitor",  (181.8, -190.0), (182.0, 185.5), "+x"),
        ("Resident", (185.8, -190.0), (186.1, 189.6), "+x"),
    ],
    "boom_h": 0.95, "boom_raised_v1": True,
    "gatehouse": {"cx": 180.0, "cz": -184.5, "w": 3.5, "d": 5.0, "y0": 0.12, "wall_h": 2.8, "thick": 0.2,
                  "roof_h": 0.7, "ridge": "z", "door": ("S", 179.4, 180.6, 2.1), "sill": 0.9, "head": 2.3},
    "rfid": (185.8, -188.6),
    "guard": {"position": (180.0, 0.0, -184.5), "yaw": -PI / 2},
    "checkpoint": {"id": "cove_heights_main", "position": (190.95, 0.0, -188.0), "yaw": 0.0,
                   "trigger": {"minX": 189.75, "maxX": 191.55, "minZ": -189.72, "maxZ": -186.0}},
    "signs": [(168.0, -166.0), (195.6, -166.0)],
}
TOGGLE_COLS = [  # name, cx, cz, sx, sz, h — layout gate.toggle[], never in colsrc in v1
    ("Cove_BoomEgress", 176.0, -190.0, 4.0, 0.3, 2.0), ("Cove_BoomVisitor", 183.75, -190.0, 3.5, 0.3, 2.0),
    ("Cove_BoomResident", 187.85, -190.0, 3.5, 0.3, 2.0), ("Cove_PortalW", 172.65, -190.0, 1.24, 0.3, 2.0),
    ("Cove_PortalE", 190.95, -190.0, 1.24, 0.3, 2.0),
]
EMERGENCY = {"line_z": -330.0, "piers": (176.45, 183.55), "opening": (176.73, 183.27),
             "leaves": [(176.75, 179.99), (180.01, 183.25)], "leaf_y": (0.06, 2.26), "locked": True,
             "lane": {"x": (177.0, 183.0), "z": (-297.35, -329.85)}}

# ── LOTS ─────────────────────────────────────────────────────────────────────
# (id, type, x0, x1, z0, z1, faces, driveway (x0, x1, z0, z1), entry (x, z), entry_yaw, postbox (x, z))
LOTS = [
    ("B-01", "B", 150, 170, -213, -193, "N", (163.8, 166.2, -213.0, -208.0), (165.0, -213.0), PI, (163.2, -212.6)),
    ("B-02", "B", 130, 150, -213, -193, "N", (138.8, 141.2, -213.0, -208.0), (140.0, -213.0), PI, (138.2, -212.6)),
    ("B-03", "B", 103, 123, -233, -213, "E", (118.0, 123.0, -230.7, -228.3), (123.0, -229.5), PI / 2, (122.6, -227.7)),
    ("B-04", "B", 103, 123, -253, -233, "E", (118.0, 123.0, -249.2, -246.8), (123.0, -248.0), PI / 2, (122.6, -246.2)),
    ("B-05", "B", 103, 123, -273, -253, "E", (118.0, 123.0, -269.2, -266.8), (123.0, -268.0), PI / 2, (122.6, -266.2)),
    ("B-06", "B", 103, 123, -293, -273, "E", (118.0, 123.0, -278.2, -275.8), (123.0, -277.0), PI / 2, (122.6, -275.2)),
    ("A-01", "A", 112, 140, -327, -299, "S", (136.5, 139.5, -304.0, -299.0), (138.0, -299.0), 0.0, (135.9, -299.4)),
    ("A-02", "A", 140, 168, -327, -299, "S", (158.5, 161.5, -304.0, -299.0), (160.0, -299.0), 0.0, (157.9, -299.4)),
    ("A-03", "A", 192, 220, -327, -299, "S", (198.5, 201.5, -304.0, -299.0), (200.0, -299.0), 0.0, (202.1, -299.4)),
    ("A-04", "A", 220, 248, -327, -299, "S", (220.5, 223.5, -304.0, -299.0), (222.0, -299.0), 0.0, (224.1, -299.4)),
    ("B-07", "B", 237, 257, -293, -273, "W", (237.0, 242.0, -278.2, -275.8), (237.0, -277.0), -PI / 2, (237.4, -275.2)),
    ("B-08", "B", 237, 257, -273, -253, "W", (237.0, 242.0, -269.2, -266.8), (237.0, -268.0), -PI / 2, (237.4, -266.2)),
    ("B-09", "B", 237, 257, -253, -233, "W", (237.0, 242.0, -249.2, -246.8), (237.0, -248.0), -PI / 2, (237.4, -246.2)),
    ("B-10", "B", 237, 257, -233, -213, "W", (237.0, 242.0, -230.7, -228.3), (237.0, -229.5), -PI / 2, (237.4, -227.7)),
    ("B-11", "B", 214, 234, -213, -193, "N", (218.8, 221.2, -213.0, -208.0), (220.0, -213.0), PI, (221.8, -212.6)),
    ("B-12", "B", 194, 214, -213, -193, "N", (197.8, 200.2, -213.0, -208.0), (199.0, -213.0), PI, (200.8, -212.6)),
]
SETBACK = {"A": {"front": 4.3, "side": 3.0, "rear": 4.0, "max_house": (16.0, 17.0)},
           "B": {"front": 4.0, "side": 2.0, "rear": 3.5, "max_house": (14.0, 12.5)}}
LOT_HEDGE = {"w": 0.40, "y0": 0.02, "h": 0.40, "lines": ("side", "rear"), "collide": False}

# ── COMMUNAL ─────────────────────────────────────────────────────────────────
CLUB_PARCEL = (140.0, -250.0, 220.0, -225.0)
CLUBHOUSE   = {"x": (170.0, 190.0), "z": (-239.0, -227.0), "floor_top": 0.10, "wall_h": 3.6, "thick": 0.25,
               "roof_slab": 0.30, "roof_h": 2.2, "ridge": "x", "door": ("S", 179.1, 180.9, 2.4),
               "windows": {"S": 4, "N": 4, "E": 2, "W": 2}, "win": (2.0, 1.6, 0.9), "walk_in": False}
CLUB_FORECOURT = (172.0, -226.9, 188.0, -222.3)
POOL_PAD    = (144.0, -240.0, 162.0, -228.0)        # v2 basin water (147, -237, 159, -231)
COURT_PAD   = (199.0, -247.0, 211.0, -227.0)        # v2 court (201.95, -243.705, 208.05, -230.295)
PROMENADE   = (140.0, -253.0, 220.0, -250.0)
PARK        = (140.0, -286.0, 220.0, -253.0)
FOUNTAIN    = {"cx": 180.0, "cz": -269.5, "basin_r": 2.5, "plaza_r": 6.0}
PATHS = [("AxisNS", 179.0, -289.7, 181.0, -253.0), ("AxisEW", 132.3, -270.5, 227.7, -268.5)]
JOG_LOOP    = {"x": (145.0, 215.0), "z": (-281.5, -257.5), "w": 1.5}
GAZEBO      = {"cx": 162.0, "cz": -276.0, "d": 6.0, "h": 4.5, "phase": "v2"}
PLAYGROUND  = {"rect": (194.0, -280.0, 206.0, -272.0), "phase": "v2"}
SWALE       = {"rect": (237.0, -210.0, 254.0, -196.0), "phase": "v2"}
POCKET_SW   = (103.0, -213.0, 130.0, -193.0)
UTILITY     = {"rect": (152.0, -186.0, 165.0, -175.0), "apron": (165.0, -181.5, 172.05, -178.5), "phase": "v2"}

# ── COVE ROAD ────────────────────────────────────────────────────────────────
ROAD = {
    "points": [(22.35, 7.26), (52.32, 17.0), (128.0, 17.0), (128.0, -150.0), (180.0, -150.0), (180.0, -160.0)],
    "radii":  [None, 25.0, 15.0, 15.0, 10.0, None],
    "throat": {"bearing_deg": 18.0, "along": (23.5, 47.0), "section": "throat", "proud_until": 24.0},
    "taper":  {"along": (47.0, 51.0)},
    "section": "road",
    "lamps":  {"every": 20.0, "from_along": 57.0, "offset": 3.65, "side": "away_from_pub", "h": 4.0},
    "signpost": (126.19, 15.19),
}
TOWN_CUT = {
    "colliders": ["COL_Hedge_44", "COL_Hedge_45", "COL_Hedge_46", "COL_Tree_1_0", "COL_Tree_1_1"],
    "hedge": {"bearing_deg": (7.5, 30.0), "radius": (44.5, 47.5)},
    "trees": [(31.4, 10.2), (36.1, 11.7)], "tree_radius": 2.4,
    "pillars": [("N", 42.05, 18.66, 23.93), ("S", 44.98, 9.62, 12.07)],          # (tag, x, z, bearing°), 0.6 × 0.6 × 2.2
    "stubs": [("N", (41.92, 18.93), (39.84, 23.00)), ("S", (45.61, 6.00), (45.04, 9.33))],   # 1.0 × 1.6
}

# ── FURNITURE ────────────────────────────────────────────────────────────────
LAMPS = {   # (x, z, h); Cove Road lamps are generated from ROAD["lamps"]
    "forecourt": [(180.0, -173.5, 4.5), (171.4, -176.0, 4.5), (192.2, -176.0, 4.5)],
    "island":    [(180.0, -196.0, 4.5), (180.0, -202.0, 4.5)],
    "loop":      [(x, -222.8, 4.0) for x in (140, 160, 200, 220)] + [(x, -289.2, 4.0) for x in (140, 160, 200, 220)]
                 + [(132.8, z, 4.0) for z in (-236, -256, -276)] + [(227.2, z, 4.0) for z in (-236, -256, -276)],
    "park":      [(165, -255.6, 3.5), (195, -255.6, 3.5), (165, -283.6, 3.5), (195, -283.6, 3.5),
                  (142.9, -258, 3.5), (142.9, -281, 3.5), (217.1, -258, 3.5), (217.1, -281, 3.5)],
    "lane":      [(175.5, -310.0, 4.0), (184.5, -310.0, 4.0)],
}
BENCHES = [(155, -255.6, 0.0), (205, -255.6, 0.0), (155, -283.6, PI), (205, -283.6, PI),
           (142.9, -262, -PI / 2), (142.9, -277, -PI / 2), (217.1, -262, PI / 2), (217.1, -277, PI / 2),
           (115, -205, 0.0), (122, -205, 0.0)]
TREES = [(x, z) for x in (136.0, 224.0) for z in (-236, -246, -256, -282)] + \
        [(152, -262), (166, -262), (194, -262), (208, -262), (150, -277), (211, -277)] + \
        [(110, -200), (122, -207), (107, -310), (107, -320), (252, -310), (252, -320)]
```

Build order inside the script:
1. `S.check_disjoint(...)` on § 7.4 rects and `S.check_corridor_clear(...)` against
   `front/public/assets/town/town.collision.json`; raise on any finding.
2. Estate kit: lawn, lot lawns, loop straights, boulevard, lane, pads, paths, wall runs, piers, island, divider, buildings
   (`pavilion_shell`) → `K.report(kit, rooms=[gatehouse, clubhouse])` → `kit.build(coll, prefix="CH", merge=True)` for site
   ground, `merge=False` for the two buildings so their pieces stay separate named nodes in the source GLB.
3. Non-kit pieces: loop corner `arc_band`s, fountain, plaza, lamps, trees, postboxes, signs, hedges, booms, portal leaves,
   emergency leaves → `L.check_grounded(objs, allow=("CH_Lawn", "CH_Hedge", ...))`.
4. Cove Road: `fillet_polyline` → `road_section` (throat, taper, road, flare), pillars, stubs, lamps, signpost
   (prefix `CR_`), its own `Collisions`.
5. Exports: `cove_heights.glb`, `cove_heights.colsrc.glb`, `cove_road.glb`, `cove_road.colsrc.glb`,
   `cove_heights.layout.json`; `L.snapshot` previews of the gate and the park.

Triangle budget: estate ≤ 18 000, Cove Road ≤ 4 000 (the town is ~25 000, the pub site ~12 500).

---

## 14. Layout JSON & Manifest Entries

> **As built (v1.2)**: three zones without `collisionUrl` (`cove_heights`, `cove_road`, `cove_road_mall`) and a
> `coveHeights` block in the manifest; see `front/scripts/apply-cove-heights.mjs`.

### 14.1 `cove_heights.layout.json` (written by the build, shipped as-is by `assets:optimize -- park`)

```json
{
  "version": 1,
  "zone": "cove_heights",
  "bounds": { "minX": 99.0, "maxX": 261.0, "minZ": -331.0, "maxZ": -160.0 },
  "road": {
    "key": "cove_road",
    "bounds": { "minX": 46.6, "maxX": 186.0, "minZ": -160.0, "maxZ": 23.0 },
    "centreline": [[22.35, 7.26], [52.32, 17.0], [128.0, 17.0], [128.0, -150.0], [180.0, -150.0], [180.0, -160.0]],
    "radii": [null, 25.0, 15.0, 15.0, 10.0, null],
    "length": 319.0
  },
  "townCut": {
    "colliders": ["COL_Hedge_44", "COL_Hedge_45", "COL_Hedge_46", "COL_Tree_1_0", "COL_Tree_1_1"],
    "hedgeBearingDeg": [7.5, 30.0], "hedgeRadius": [44.5, 47.5],
    "trees": [[31.4, 10.2], [36.1, 11.7]], "treeRadius": 2.4
  },
  "gate": {
    "x": 181.8, "z": -190.0, "width": 20.66, "open": true,
    "toggle": [
      { "name": "COL_Cove_BoomEgress",   "cx": 176.0,  "cy": 1.0, "cz": -190.0, "hx": 2.0,  "hy": 1.0, "hz": 0.15 },
      { "name": "COL_Cove_BoomVisitor",  "cx": 183.75, "cy": 1.0, "cz": -190.0, "hx": 1.75, "hy": 1.0, "hz": 0.15 },
      { "name": "COL_Cove_BoomResident", "cx": 187.85, "cy": 1.0, "cz": -190.0, "hx": 1.75, "hy": 1.0, "hz": 0.15 },
      { "name": "COL_Cove_PortalW",      "cx": 172.65, "cy": 1.0, "cz": -190.0, "hx": 0.62, "hy": 1.0, "hz": 0.15 },
      { "name": "COL_Cove_PortalE",      "cx": 190.95, "cy": 1.0, "cz": -190.0, "hx": 0.62, "hy": 1.0, "hz": 0.15 }
    ]
  },
  "checkpoint": {
    "id": "cove_heights_main", "position": [190.95, 0.0, -188.0], "yaw": 0.0,
    "trigger": { "minX": 189.75, "maxX": 191.55, "minZ": -189.72, "maxZ": -186.0 },
    "guard": { "position": [180.0, 0.0, -184.5], "yaw": -1.5708 }
  },
  "emergencyGate": { "x": 180.0, "z": -330.0, "width": 6.54, "locked": true },
  "clubhouse": { "position": [180.0, 0.0, -233.0], "door": [180.0, 0.0, -226.4], "walkIn": false },
  "fountain": [180.0, 0.0, -269.5],
  "lots": [
    {
      "id": "A-01", "type": "villa", "status": "decor",
      "bounds": { "minX": 112, "maxX": 140, "minZ": -327, "maxZ": -299 },
      "center": [126.0, 0.0, -313.0],
      "entry": [138.0, 0.0, -299.0], "entryYaw": 0.0,
      "postbox": [135.9, 0.0, -299.4]
    }
  ]
}
```

`lots` holds all 16 entries of § 7.2 (`type` = `"villa"` for A, `"executive"` for B). IDs never change; HousingService keys
them as `cove_heights:<id>` [v3].

### 14.2 Manifest zones (written by `front/scripts/apply-cove-heights.mjs`)

```json
{
  "key": "cove_heights", "optional": true,
  "bounds": { "minX": 99.0, "maxX": 261.0, "minZ": -331.0, "maxZ": -160.0 },
  "modelUrl": "/assets/park/cove_heights/cove_heights.glb",
  "collisionUrl": "/assets/park/cove_heights/cove_heights.collision.json",
  "animatedWater": true,
  "gate": { "x": 181.8, "z": -190.0, "width": 20.66 },
  "checkpoint": { "id": "cove_heights_main", "position": [190.95, 0.0, -188.0] },
  "lots": [ { "id": "A-01", "type": "villa", "entry": [138.0, 0.0, -299.0], "entryYaw": 0.0 } ]
},
{
  "key": "cove_road", "optional": true,
  "bounds": { "minX": 46.6, "maxX": 186.0, "minZ": -160.0, "maxZ": 23.0 },
  "modelUrl": "/assets/park/cove_heights/cove_road.glb",
  "collisionUrl": "/assets/park/cove_heights/cove_road.collision.json"
}
```

---

## 15. Rebuild Sequence

The Blender build, the asset optimiser and the zone's apply script, as for the pub and the orchard (`docs/PUB.md` § 7,
`docs/ORCHARD.md` § 4, `.claude/agents/topographer.md`). From the repo root in Git Bash:

```bash
B="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"
"$B" --background --factory-startup --python-expr "p='map-src/CampusCove/build_cove_heights_site.py'; exec(open(p).read(), {'__file__': p})"

cd front
npm run assets:optimize -- park cove_heights        # out/park/cove_heights → public/assets/park/cove_heights (+ collision JSON)
node scripts/apply-cove-heights.mjs                  # NEW script, see below
npm run topo:check -- cove_heights cove_road cove_road_mall
docker restart campuscove-socket campuscove-front    # the socket reads world.manifest.json at start; dev containers miss edits
```

`front/scripts/apply-cove-heights.mjs` (idempotent, orchard pattern):
1. checks `public/assets/park/cove_heights/cove_heights.layout.json`, otherwise asks for `npm run assets:optimize -- park cove_heights`;
2. replaces every `COL_Cove_*` / `COL_CoveRoad_*` box of `town.collision.json` with the layout's `collision` list (no
   per-zone collision file, no `*.colsrc.glb`) and grows its bounds;
3. upserts the zones `cove_heights`, `cove_road`, `cove_road_mall` in `world.manifest.json` and writes `manifest.coveHeights`
   (spawn, gates, toggle list, checkpoint, clubhouse door, lots with `housingKey`).

No town edit: Cove Road branches off the mall avenue (§ 5). Playtest (`playtest-game` skill): leave the town by the west
hedge gate, turn north at the signpost, walk Cove Road to the gate, through the lanes, around the loop; **C** shows the
collision boxes (none on the lanes or portals in v1).

---

## 16. Build Phases

| Phase | Content |
|-------|---------|
| **v1 — playable shell** | site lawn and lot lawns; Cove Road from the mall avenue (north leg, fillet, east leg) with lamps and signpost; boulevard, island, divider; loop with curbs and sidewalks; emergency lane; perimeter wall, pilasters, piers; guardhouse shell; booms raised and portal leaves open (visual only); emergency gate locked; 16 empty lots (low hedges, driveways, postboxes with IDs); clubhouse closed shell; promenade; park (plaza, fountain, axes, jogging loop, benches, trees); pool and court pads; lamps, monument signs, signpost; all permanent collisions; layout JSON with lots, gate toggles and checkpoint |
| **v2 — amenities** | pool basin, pickleball court and fence, gazebo, playground, utility node, bio-swale planting, CCTV, hydrants, street name signs, Cove Road trees |
| **v3 — gameplay** | houses on lots (reuse the house builders), HousingService wiring (`cove_heights:<id>`), dropped curbs at driveways, gate logic (toggle boxes, checkpoint prompt, guard NPC, server-side check), walk-in clubhouse, emergency-gate events |

---

## 17. Open Questions / Design Decisions Pending

| # | Question | Default assumption |
|---|----------|--------------------|
| 1 | `cove_road_mall` lies inside the mall zone's rectangle. | Accepted: it is the mall avenue's side road; `cove_road` and `cove_heights` overlap nothing (1 m sliver of `cove_road` at z −134…−135) |
| 2 | The avenue's north curb and sidewalk run across the junction mouth (continuous-sidewalk crossing). Cut them in `build_mall.py`? | No for v1: the mall is not rebuilt; walkable as is |
| 3 | `assets:optimize` joins the nodes of every `park` GLB (`--join` except `interior.glb`), so booms and gate leaves cannot move at runtime. | v1 is static (booms raised, leaves open). v3 needs an un-joined `cove_gate.glb` and a `keepNodes` rule in `front/scripts/optimize-assets.mjs` |
| 4 | How do lots join housing: `cove_heights:<id>` units in `HousingUnitSeeder.php`, prices, one-house-per-account rule? | Decor in v1; seeded in v3 with the entry point as the door point |
| 5 | Should lot hedges stop visitors once a lot is sold? | v1 walk-over (0.40 m, no box); v3 adds a hull or fence collision per owned lot |
| 6 | Pool: decorative only, or swimming? | Decorative raised basin in v2; sunken + swim needs a heightmap and a swim mechanic |
| 7 | Clubhouse interior: walk-in (open-world standard) or closed? | Closed shell in v1, walk-in in v3 |
| 8 | The emergency gate opens onto the empty plain; a future road north? | Locked in v1, event hook reserved |
| 9 | Tennis court instead of pickleball? | Pickleball: a tennis fence (36.6 × 18.3 m) does not fit next to the clubhouse |
| 10 | The pond's east side has no collision fence (style guide § 11): players can already reach the plain around the estate from there. | Out of scope; the estate wall is the barrier for the estate itself |

---

## 18. Changes from v1.0

- **Compass fixed**: north = −Z. The town-facing wall (z −190) is the south wall: main gate south, emergency gate north.
- **No overlaps**: lots, loop, clubhouse, court, swale and utility node no longer intersect (§ 7.4 audit, rerun by the build).
- **Loop redrawn**: centreline x 127.65 / 232.35, z −217.65 / −294.35, R 8; every lot fronts a straight leg; lot lines 2.85 m
  from the wall.
- **Cul-de-sacs removed**: villas moved to the north band and front the loop directly; no dead ends.
- **Executive lots redistributed**: 4 west, 4 east, 4 south (two each side of the boulevard), 20 × 20 m each.
- **Clubhouse** has one centre (180, −233); the court is now a pickleball court (13.41 × 6.10 m in a 12 × 20 m fence) east of
  it, the pool west of it.
- **Emergency gate** has its own 6 m lane between A-02 and A-03; no road conflict.
- **Bio-swale** moved to the south-east corner square, flat (no −0.3 m channel); **utility node** moved outside the wall by
  the forecourt (out of the clear zone).
- **Zoning table** recomputed from the geometry (sums to 22 400 m²); villa footprint cap corrected to 16 × 17 m
  (35 % of 784 m² = 274 m²; 18 × 17 = 306 m² was over); coverage and FAR separated.
- **Gate** redesigned: barrier line on the wall, 18 m split-lane queue outside, egress + visitor + resident lanes, two
  pedestrian portals; permanent vs toggleable collisions; pedestrian checkpoint (point + trigger); open in v1.
- **Cove Road added** (§ 5): T-junction on the mall avenue at x −73.2 → north along the mall → west into the boulevard,
  292 m; town and mall untouched.
- **v1.3: estate moved north of the mall** (OFFSET −431, +18) at the user's request; v1.2 had it north-east of the pub.
- **Vertical stack** with 2 cm gaps; curbs 0.14 m and sidewalks 0.12 m (below the topo-check tolerance); no sunken pool or
  swale without a heightmap; lot hedges 0.40 m walk-over.
- **Materials**: invented keys replaced by zone-prefixed `TW_Cove*` / `EX_cove_*` (marked new) whose names match the topo-check
  classes; existing `TW_PondWater` and `TW_Hedge` reused.
- **Builders** listed (§ 12), new shared module `lib_site.py`; `pavilion_shell` serves both buildings.
- **Outputs and rebuild** aligned on the real pipeline: `park` asset category (there is no `residential` one),
  `build_cove_heights_site.py`, `npm run assets:optimize -- park cove_heights`, new `front/scripts/apply-cove-heights.mjs`,
  `topo:check`, container restarts. Removed `build_cove_heights_preview.py`, `scripts/apply-cove-heights.mjs` at the repo root
  and `make dev`.
- **Lots** carry stable IDs, entry points and yaws in the layout and the manifest for HousingService; the in-estate spawn point
  was dropped.
- **Phasing** (v1 / v2 / v3) tagged throughout.
