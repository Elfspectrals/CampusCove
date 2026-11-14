# Sports complex: master plan

> Validated on 2026-11-14 (decisions in § 11). Product decisions: `.claude/rules/roadmap.md`, sections
> "Sports complex" and "Town bus". How each sport is played: `docs/sports/README.md` and one file per sport.
> Neighbours: `docs/GATED_COMMUNITY.md` (Cove Heights, Cove Road). Kit rules: `docs/BUILD_KIT.md`.

Every value is in game space `(x, z)` in metres, `y` up, the same frame as `world.manifest.json` and the zone JSONs.
North is −Z, east is +X. Every rectangle is axis-aligned and written `x minX → maxX, z minZ → maxZ`.

## 1. Summary

| Item | Value |
|---|---|
| Fenced site (fence centreline) | x −586 → −362, z −426 → −186 · 224 × 240 m = 53 760 m² |
| Entrance precinct (outside the fence) | x −526 → −429.5, z −186 → −140.05: turning bulb, car park, gate plaza, bus stop, ATM, reception |
| Road | Cove Road west leg extended 201 m west along z −146, from the boulevard (x −257) to the bulb (centre −474, −156) |
| Distance from Cove Heights | fence 31 m west of the estate wall (x −331); estate zone ends at x −332 |
| Walk from the town's west hedge gate | ≈ 550 m (321 m to the boulevard, 201 m of spur, ≈ 30 m to the gate) |
| Ground | flat, `y = 0`, no heightmap in this area (§ 9) |
| Open | 24 h; gate and every venue door need a valid day or week pass |
| World bounds | today ±500: the site does **not** fit; grow to ±650 (§ 2) |

## 2. Site bounds and world bounds

- The site sits west of Cove Heights (x −332 → −170, z −313 → −152) and north of the mall zone (z ≥ −135). Nothing is
  built in x < −332, z < −140 today (checked against `town.collision.json` and `mall.collision.json`).
- The fenced site needs 224 m in x because the 400 m track alone is 185 × 110 m with its stand; the strip between the
  estate and today's west border (x −500) is 168 m wide. **The world must grow west.**
- Pick: `node front/scripts/apply-world-bounds.mjs 650` (square ±650, run by the core session). The west border lands
  64 m outside the fence, past the low-tier fog (120 m) from most of the site. ±600 would leave 14 m: too tight for the
  border wall and the backdrop. The script also re-centres `Sky_Ring` and `Ground` in `town.glb`; the socket needs a
  restart to read the new `bounds`.

## 3. Road extension

| Part | Geometry |
|---|---|
| Junction | The west leg already ends on the boulevard (asphalt to x −241.4, south bands to x −258.95). The spur continues the same `road` section west: asphalt from the boulevard carriageway west edge x −257.0, side bands from x −258.95. |
| Cove Heights edit (needed) | `build_cove_heights_site.py` draws the boulevard west curb (x −257.15 → −257.0) and west sidewalk (x −258.95 → −257.15) from z −143 north, across the spur. Both must start at z −149 (the road's north carriageway edge), the mirror of the boulevard east edge (`ROAD_Z - 3.0`). Two values, then rebuild `cove_heights.glb`. |
| Spur | Centreline z −146, x −257.0 → −458.05 (201 m). Section `road`: 6.0 m carriageway (±3.0, dashed centre line), 0.15 m curbs, 1.0 m grass verge, 1.8 m sidewalks, reserve z −151.95 → −140.05. |
| Lamps | `street_lamp` 4.0 m on the south verge (z −142.35) every 20 m, x −275 → −455 (10), same rhythm as the west leg. |
| Signpost | `S.signpost` on the south verge at (−262.0, −142.35): "Sports complex" (west), "Cove Heights" (north). |
| Turning bulb | Centre (−474, −156), offset 10 m north so its south edge stays on the spur's south edge (tangent at x −474). Carriageway disc R 13.0, curb ring 13.0 → 13.15, verge 13.15 → 14.15, sidewalk 14.15 → 15.95. Reserve z −171.95 → −140.05, x −489.95 → −458.05. R 13.0 at the kerb turns a 12 m bus without reversing (garbage-truck standard is 9.0). |
| Joins | Asphalt is one surface: the spur rectangle and the bulb disc never overlap (no coplanar faces). Ring bands are cut where the spur (east) and the car park aisle (west, z −153 → −159) enter. |

The bulb is a dead end: both town buses run out and back on the 201 m spur and turn in the bulb. The bus plan should
know this.

## 4. Entrance precinct (outside the fence)

| Element | Position and size |
|---|---|
| Bus stop | Westbound kerb (north lane, before the bulb). Pole on the north verge at (−457.0, −149.65). Bus stands x −457 → −445, centre z −147.5. Shelter 4.0 × 1.5 m, glass and frame (builder), centre (−448.5, −153.6), open side south, on a pad x −453.5 → −443.5, z −151.95 → −154.95 behind the sidewalk. Boarding point (−452.0, −150.6). Stop id `sports_complex` for the bus plan. |
| Link path | 4.0 m paving, x −457.5 → −453.5, z −151.95 → −172: bus stop to the gate plaza, along the reception's west edge. |
| Gate plaza | Paving x −490 → −453.5, z −172 → −186, in front of the gate. It meets the bulb sidewalk at its north arc; no step over 0.15. |
| Reception | Zone `sports_reception`, footprint x −453.5 → −429.5, z −183 → −155 (24 × 28). Pavilion about 16 × 12 m, single storey, inside it. Main door on the west face toward the plaza, near z −178. Pass NPC at a counter facing the door; climbing shoes lent here. |
| ATM | `decor/atm` runtime item at (−455.5, −180.0), screen facing west, 1.5 m clear in front, on the plaza beside the reception. |
| Car park | x −526 → −490, z −166 → −146, entered from the bulb's west side. Aisle 6.0 m, z −159 → −153, x −524 → bulb. South row 12 stalls 2.5 × 5.0 (x −522 → −492, z −153 → −148). North row 2 accessible stalls 3.6 × 5.0 nearest the plaza (x −499.2 → −492) and 10 stalls 2.5 × 5.0 (x −524.2 → −499.2), z −164 → −159. **24 stalls.** Footpath 2.0 m x −492 → −490, z −166 → −172 to the plaza. |
| Lamps | 2 on the bulb north verge (−474, −169.65) and car park west end (−525, −156); 2 on the plaza (−488, −184), (−459, −184). |

## 5. Fence, gate and inside circulation

**Fence** (municipal welded mesh, anthracite `TW_SportsFence`): 2.4 m high, posts 0.08 × 0.08 every 2.5 m, mesh panels
as alpha-clipped planes, concrete plinth 0.25 wide y 0 → 0.20. One `COL_SportsSite_Fence*` box per straight run, 0.30 thick,
2.6 high. Clear zone 3.0 m on both sides kept free of trees and footprints: nothing inside x −583 → −365, z −423 → −189
may stand closer to the fence.

**Main gate** on the south fence, centred x −474, line z −186, pedestrian only (players are on foot):

| x span | Piece |
|---|---|
| −477.6 → −477.2 | pier P1 (0.4 × 0.4 × 2.6, light concrete, pass reader) |
| −477.2 → −476.0 | entry speed gate E1 (glass flaps, pass) |
| −476.0 → −475.6 | pier P2 |
| −475.6 → −474.4 | entry speed gate E2 (pass) |
| −474.4 → −474.0 | pier P3 |
| −474.0 → −472.4 | wide gate W, both ways, pass (accessible) |
| −472.4 → −472.0 | pier P4 |
| −472.0 → −470.8 | exit gate X, outward only, always free (a pass that expired on site lets the player leave) |
| −470.8 → −470.4 | pier P5 |

Each passage has a toggle collider in the manifest (`COL_SportsSite_GateE1` ...), the Cove Heights `gate.toggle` pattern.
Pass trigger x −477.6 → −472.4, z −188.5 → −186.15, checked by the socket. **Service gate** (locked swing gate, 6.0 m,
decor, `S.swing_gate`) on the south fence at x −404 → −398, on the axis of the east side street; no drive outside it.

**Inside circulation** (paving top 0.06, verges lawn 0.02; every street keeps 6 m clear for a fire lane):

| Id | Rectangle | Width | Note |
|---|---|---|---|
| Promenade | x −479 → −469, z −310 → −186 | 10 m (8 paving + 1 verge each side) | gate to the track stand; lamps on both verges every 20 m from z −196 |
| C1 cross street | x −583 → −365, z −250 → −242 | 8 m | between the two building rows |
| C2 north street | x −583 → −365, z −310 → −301 | 9 m | in front of the track stand |
| SW side street | x −543 → −537, z −242 → −189 | 6 m | climbing and pool |
| SE side street | x −404 → −398, z −242 → −189 | 6 m | gym, dance, boxing; ends at the service gate |
| Door stubs | 4.0 m wide, from the street paving to the footprint edge | | pool z −214 → −210, gym z −213 → −209, ice rink z −277.5 → −273.5, tennis z −273.5 → −269.5 |

Other core pieces inside the fence: site lawn, utility compound (transformer, telecom, waste) x −580 → −566,
z −270 → −255 with a 2.2 m screen wall, east green with benches and trees (x −414 → −365, z −301 → −275 and
x −386 → −365, z −275 → −250), lamps on C1 and C2 every 25 m, trees outside the clear zones.

## 6. Reserved footprints

Outer size = playing area + run-offs + stands + support rooms + walls; footprint = outer size + 3.0 m margin on every
side, so each session designs its building freely inside. No two footprints overlap and each has a face on a street.

| Zone id | Footprint (x, z) | Size | Outer size inside it | Main door, facing | Coach spot hint |
|---|---|---|---|---|---|
| `sports_gym` | −467 → −404, −231 → −191 | 63 × 40 | 57 × 34, about 10 m high: court 44 × 24 (long axis x) + 2.0 run-off = 48 × 28, stands 4 rows on one long side (5.5 m), lobby, changing and store 8 m on one short side | west face at z −211, faces the promenade (west); fire exit on the SE street | stand side, halfway line, outside the run-off |
| `sports_pool` | −537 → −481, −233 → −191 | 56 × 42 | 50 × 36, about 10 m high: basin 25 × 15 (6 lanes of 2.5 m, long axis x), diving pit 13 × 15 (4.5 m deep, 1 m and 3 m boards, 5 m platform, 3.4 m clear above it), decks 3 to 4 m, stands 5.5 m on one long side, entrance and changing 8 m | east face at z −212, faces the promenade (east) | deck at the start end, beside the blocks |
| `sports_ice_rink` | −562 → −481, −301 → −250 | 81 × 51 | 75 × 45, about 9 m high: rink 60 × 30 inside boards, 2 m walkway, stands 5 m on both long sides, lobby and skate area 10 m on one short side | east face at z −275.5, faces the promenade (east); side doors on C1 and C2 | at the rink gate by the benches |
| `sports_boxing` | −398 → −368, −240 → −216 | 30 × 24 | 24 × 18, about 6 m high: ring 6.1 inside the ropes on a 7.3 m platform, 3 m around it, punch bag corner, changing 4 m | west face at z −228, faces the SE street (west) | neutral corner of the ring |
| `sports_climbing` | −580 → −543, −216 → −191 | 37 × 25 | 31 × 19, about 14 m high (tallest building): lead wall about 18 m wide and 12 m high (4 routes + twin pair), 4 m fall zone, 6 boulders on mats, shoe desk 5 m | east face at z −203.5, faces the SW street (east) | foot of the lead wall between the twin routes |
| `sports_dance` | −398 → −372, −210 → −191 | 26 × 19 | 20 × 13, about 5 m high: studio 15 × 12 with the mirror wall, lobby and changing 5 m | west face at z −200.5, faces the SE street (west) | in front of the mirror wall, facing the room |
| `sports_tennis` | −467 → −420, −293 → −250 | 47 × 43 | 40.6 × 36.6: 2 courts (long axis z), each 18.29 × 36.57 with ITF run-offs, a 4.0 m coach strip between them (x −445.5 → −441.5), 3 m mesh fence and one gated entry | west side at z −271.5, from the promenade | (−443.5, −271.5), in the strip at the net line |
| `sports_petanque` | −414 → −386, −275 → −250 | 28 × 25 | 22 × 21: 4 pistes 4 × 15 (long axis z) with 0.2 m boards, end aisles, benches, coach strip | south side at x −400, from C1 | south end of the pistes |
| `sports_athletics` | −566.5 → −381.5, −420 → −310 | 185 × 110 | 400 m track, 8 lanes of 1.22 m (8 runners), inner kerb radius 36.5, straights 84.39 m: envelope 176.9 × 92.5 centred (−474, −369.75); home straight on the south side, finish line at x −431.8, 100 m start at x −531.8 in the west chute, 17 m run-off past the finish; 7 v 7 pitch 55 × 35 (proposed) with 5 × 2 m goals in the infield; small stand 52 × 8 m (6 rows) x −486 → −434, z −322 → −314, facing north | stand from C2 at x −474, on the promenade axis | outside lane 8 near the finish line, about (−428, −320) |

Footprint check: every gap between footprints is a street (6 to 10 m), a door stub corridor or lawn of at least 4 m
(ice rink to the utility compound). Every footprint stays outside the 3.0 m fence clear zone.

## 7. Overview

```
 z      x  -586        -543 -537         -481  -479 -469 -467         -404 -398           -362
-426    +-------------------------------- fence N ---------------------------------------+
        |   ATHLETICS  -566.5..-381.5 / -420..-310   track 8 lanes, 7 v 7 pitch          |
        |                       stand -486..-434 / -322..-314                            |
-310    |================================ C2 north street ===============================|
        | util |  ICE RINK -562..-481 / -301..-250  | P  | TENNIS -467..-420  |  PETANQUE  |
        | -580 |                                    | R  |  / -293..-250      | -414..-386 |
        | -566 |                                    | O  |                    | / -275..-250
-250    |================================ C1 cross street ===============================|
        | CLIMBING  |SW| POOL -537..-481          | M  | GYM -467..-404     |SE| DANCE    |
        | -580..-543|  | / -233..-191             |    | / -231..-191       |  | BOXING   |
-186    +---------------------------- fence S ---[GATE -474]--------------------[svc -401]-+
                   CAR PARK -526..-490   (BULB -474,-156)   PLAZA  LINK  RECEPTION -453.5..-429.5
                                                               BUS STOP -457..-445
-146    <========= spur z -146, x -458 ................................. x -257 boulevard =====>
```

Land use inside the fence:

| Use | Area | Share |
|---|---|---|
| Venue footprints (9) | 34 213 m² | 63.6 % |
| Streets and promenade | 5 412 m² | 10.1 % |
| Utility compound | 210 m² | 0.4 % |
| Lawn, planting, fence clear zone | 13 925 m² | 25.9 % |
| Indoor floor area (outer sizes of the 6 halls) | ≈ 8 400 m² | FAR ≈ 0.16 |

Outside the fence: spur 2 392 m², precinct 4 434 m² (bulb 799, car park 720, plaza 511, reception footprint 672).

## 8. Who builds what, and the seams

**Core session** builds: the world growth, the Cove Heights junction edit, the spur, bulb, car park, plaza, link path,
bus stop decor, ATM item, the reception pavilion and its NPC, the fence, the main and service gates, the inside streets,
door stubs, lamps, utility compound, green areas and the site lawn. It also owns the pass check at the gate and at venue
doors and the placeholder JSON per sport (roadmap).

**Each venue session** owns everything inside its footprint: ground, building, interior, stands, aprons, paths from the
footprint edge to its doors, lights, its coach and extras, its sport data.

| Seam | Rule |
|---|---|
| Shared constants | The core creates `map-src/CampusCove/lib_sports.py` with `FOOTPRINTS`, `DOOR_STUBS`, the `Y` stack and the shared site materials (`TW_SportsLawn`, `TW_SportsPaving`). Venue scripts import it read-only. A footprint changes only through this document and that file. |
| Ground | The core site lawn covers the fenced rectangle **minus** the 9 footprints (holes). Each venue lays its own ground inside its footprint with the same `TW_SportsLawn` / `TW_SportsPaving` settings, so its lightmap holds its own shadows and contact shading. At the footprint edge: flat `y = 0` base, lawn top 0.02, paving top 0.06, never a step over 0.15. No venue face may cross its footprint edge. |
| Y stack (tops) | lawn 0.02, asphalt 0.04, verge 0.03, paving and paths 0.06, plaza 0.08, sidewalk 0.12, curb 0.14 (same as Cove Heights). |
| Zones | Core: `sports_road` (x −429.5 → −258.95, z −151.95 → −140.05), `sports_entrance` (x −526 → −429.5, z −186 → −140.05), `sports_reception` (its footprint, nested in `sports_entrance`), `sports_complex` (the fenced rectangle). Each venue adds one manifest zone with its key above and `bounds` = its footprint, nested in `sports_complex` the way `cove_road_mall` sits in `mall`. |
| Files | Venue outputs go to `map-src/CampusCove/out/sports/<id>/` and ship to `front/public/assets/sports/<id>/`; build scripts `build_sports_<id>*.py`. |
| Collisions | Prefixes: `COL_SportsRoad_`, `COL_SportsSite_`, `COL_SportsReception_`, and per venue `COL_SportsGym_`, `COL_SportsPool_`, `COL_SportsIceRink_`, `COL_SportsBoxing_`, `COL_SportsClimbing_`, `COL_SportsDance_`, `COL_SportsTennis_`, `COL_SportsPetanque_`, `COL_SportsAthletics_`. Each session has its own `front/scripts/apply-sports-<id>.mjs` that removes only its prefix, merges its boxes into `town.collision.json` and upserts its own manifest zone (idempotent, like `apply-police.mjs`). Every box must sit inside the session's footprint. |
| Pass at doors | A venue's manifest `buildings[]` entry (and the outdoor venues' entry points) carries a pass flag whose name the core sets in its contract doc; the core's socket check reads it. Venues never write their own pass logic. |
| Shared files | `world.manifest.json`, `town.collision.json` and `zones/index.json` are touched by every apply script: rebase, then re-run your apply script. |

## 9. Terrain notes for the topographer

Reviewed by the topographer on 2026-11-14 (measured on the GLBs, nothing edited).

- Walk height `y = 0`, no heightmap (the only relief in the world is the pond). The town `Ground` disc
  (`build_town.py`, top at −0.024) has a 722 m radius today: the NW fence corner (−586, −426) is 724.5 m from the
  origin, so **the site is only fully covered after the world grows to ±650** (disc 934 m, `Sky_Ring` 929 m). The
  growth lands first, before anything is built there. `Sky_Ring` today runs through the site.
- **Pool below grade**: basin (about 2 m) and diving pit (4.5 m) are building levels with stairs or ladders, like the pub
  cellar at −3.2 (`houseLevels.ts` `capsuleLift`); their walls go in the pool's interior collision. The `Ground` disc
  only matters for what is seen, and it is double-sided, so it must not cross the basin. A hand-made hole is unsafe:
  `fitTownBackdrop` (`front/scripts/lib/worldBackdrop.mjs`) rescales every vertex on each run of `apply-world-bounds` or
  `apply-store`. **Pick**: `fitTownBackdrop` rebuilds the `Ground` top from its 72 rim points plus hole rectangles read
  from a `groundHole` flag on manifest zones (documented in `docs/OPEN_WORLD.md`). The core session builds this
  mechanism with no hole; the pool session adds the flag on `sports_pool` (hole x −536.5 → −481.5, z −232.5 → −191.5,
  0.5 m inside its footprint) and covers the whole footprint with its own ground, and its `apply-sports-pool.mjs` fails
  if any point of the hole is left uncovered. A raised deck at +4.6 m (27 risers, a 14.6 m hall) is the costly
  alternative.
- Cove Heights junction: the plan's numbers match the build. The boulevard west sidewalk (x −258.95 → −257.15) and
  curb (x −257.15 → −257.0) start at z −143 today and must start at z −149, the mirror of the east side
  (`build_cove_heights_site.py` lines 194-197). The small corner x −258.95 → −257.15, z −149 → −149.15 stays sidewalk
  without a curb, as on the east corner (0.08 step, accepted). The spur's north sidewalk (0.12) meets the estate lawn
  (0.02) with a 0.10 step.
- World edge at ±650: west fence 64 m and north fence 224 m from the border wall; from the NW corner the sky ring is
  about 205 m away, past the low and medium fog. Restart the socket after the growth (it reads the manifest bounds).
- `topo:check`: today a point with no ground drawn passes silently. The core adds a `void` failure (zone sample with
  no ground, skipped inside building levels) and walkable material names (`Turf|Court|Track|Gravel`) to `GROUND`.
  Every core and venue zone needs a `modelUrl` to be sampled. Curbs at 0.14 stay under the 0.15 step threshold.
- Raised floors (stands, ring, rink, track stand, diving boards) are inside footprints and walk on `buildingFloorAt`.

## 10. Risks

- Interiors show at about 20 m and hide at 26 m from a building (`docs/OPEN_WORLD.md`). For halls of 50 to 75 m that
  distance may show an empty shell when walking up; each hall session checks it.
- The spur makes every bus loop 400 m longer (out and back).
- Fence: 928 m of mesh; budget about 5 000 triangles with alpha-clipped panels.

## 11. Decisions (2026-11-14)

1. The world grows to ±650 m (`apply-world-bounds.mjs 650`), run by the core session before anything is built there.
2. The core session makes the two-value junction edit in `build_cove_heights_site.py` and rebuilds `cove_heights.glb`.
3. Explorer task: the complex counts once, as `sports_complex` (past the gate, so with a pass). The nested venue,
   reception, entrance and road zones are not explorer zones.
4. Pool below grade: the `groundHole` mechanism of § 9; the core builds it with no hole, the pool session adds its hole.
5. Gear is sold at Summit Sports, the mall's existing sportswear shop, instead of a second sports shop: one place for
   sportswear and gear. Its catalogue takes the gear items as each venue session adds them.
6. Outdoor pitch 55 × 35 m with 5 × 2 m goals, up to 7 v 7.
7. The car park stays empty (painted stalls, no parked cars).
8. Name on the signs and the bus stop: "Cove Sports Park".
