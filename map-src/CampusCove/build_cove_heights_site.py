"""Cove Heights gated estate + Cove Road (v1 playable shell, docs/GATED_COMMUNITY.md).

Outputs: out/park/cove_heights/{cove_heights.glb, cove_road.glb, cove_road_mall.glb, cove_heights.layout.json}.
Then `npm run assets:optimize -- park cove_heights` and `node scripts/apply-cove-heights.mjs` (from front/).

The estate sits north of the mall. It is drawn in its plan frame (docs/GATED_COMMUNITY.md § 4-8, wall x 100..260,
z -330..-190) and moved as a whole by OFFSET; Cove Road is drawn in world coordinates: it branches off the mall avenue
(north side, x = -73.2), runs north along the mall's east side, turns west north of the mall and ends in the estate's
entry boulevard from the east. Every piece comes from the shared builders in lib_site.py.
"""
import importlib
import math
import os
import sys

if "__file__" not in globals():
    raise RuntimeError('Run with exec(open(p).read(), {"__file__": p}) so the script can find lib_common.py')
HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import lib_common as L
importlib.reload(L)
import lib_site as S
importlib.reload(S)
import bpy

PI = math.pi
OUT = os.path.join(L.OUT_ROOT, "park", "cove_heights")

# ---------------------------------------------------------------- plan (game space, north = -Z)
WALL = {"x0": 100.0, "x1": 260.0, "z0": -330.0, "z1": -190.0}  # z1 = south wall (town side), z0 = north wall
LOOP = {"xw": 127.65, "xe": 232.35, "zs": -217.65, "zn": -294.35, "r": 8.0}
BLVD = {"x0": 174.0, "x1": 189.6, "z_end": -214.65}
ROAD_Z = -164.0              # Cove Road leg along the boulevard's south end, plan frame
OFFSET = (-431.0, 18.0)      # plan frame -> world: estate centred north of the mall (wall x -331..-171, z -312..-172)
DX, DZ = OFFSET
ROAD_X = -73.2               # Cove Road north leg centreline: avenue gap between Mall_Tree002 (-81.1) and Avenue_Bin0_0 (-65.3)
AVENUE_EDGE_Z = -17.3        # back of the mall avenue's north sidewalk (build_mall.py: z -12, road 7, walk 1.8)
ROAD_ZW = ROAD_Z + DZ        # west leg centreline in the world (-146)
FILLET = (ROAD_X - 12.0, ROAD_ZW + 12.0, 12.0)  # centre x, z, centreline radius: north leg turns west
ROAD_END_X = 189.6 + DX      # boulevard carriageway east edge (world)

ZONES = {
    "cove_heights": {"minX": 99.0 + DX, "maxX": 261.0 + DX, "minZ": -331.0 + DZ, "maxZ": -169.95 + DZ},
    "cove_road": {"minX": 172.05 + DX, "maxX": ROAD_X + 5.95, "minZ": ROAD_ZW - 5.95, "maxZ": FILLET[1]},
    "cove_road_mall": {"minX": ROAD_X - 5.95, "maxX": ROAD_X + 5.95, "minZ": FILLET[1], "maxZ": AVENUE_EDGE_Z},
}


def W2(x, z):
    """Plan frame -> world."""
    return x + DX, z + DZ

Y = {"lawn": 0.02, "lot": 0.04, "asphalt": 0.04, "line": 0.06, "drive": 0.06, "path": 0.06, "track": 0.05, "plaza": 0.08, "walk": 0.12,
     "curb": 0.14, "verge": 0.03}

sc = L.new_build_scene("PARK_cove_heights")
colls = {}
for key in ZONES:
    c = bpy.data.collections.new(key)
    sc.collection.children.link(c)
    colls[key] = c
est = S.Site(colls["cove_heights"], "Cove", seed=41)
road = S.Site(colls["cove_road"], "CoveRoad", seed=42)
mall_leg = S.Site(colls["cove_road_mall"], "CoveRoad", seed=43)

M = {
    "lawn": L.make_mat("TW_CoveLawn", "#7fb35a", 1.0, "noise", 0.06),
    "lot": L.make_mat("TW_CoveLotLawn", "#8cc062", 1.0, "stripes", 0.04, accent="#80b357"),
    "verge": L.make_mat("TW_CoveVergeGrass", "#78ad55", 1.0, "noise", 0.06),
    "asphalt": L.make_mat("TW_CoveAsphalt", "#3b3c40", 0.95, "noise", 0.05),
    "line": L.make_mat("TW_CoveRoadLine", "#efe8d6", 0.8, "noise", 0.02),
    "curb": L.make_mat("TW_CoveCurbPaving", "#c9c2b2", 0.9, "noise", 0.04),
    "walk": L.make_mat("TW_CovePaving", "#d8ccb2", 0.9, "tiles", 0.05, accent="#c4b79b"),
    "drive": L.make_mat("TW_CoveCobble", "#a8927a", 0.95, "tiles", 0.07, accent="#8d7964"),
    "plaza": L.make_mat("TW_CovePlazaFlagstone", "#e0d3b8", 0.9, "tiles", 0.05, accent="#cdbd9e"),
    "track": L.make_mat("TW_CoveTrackPaving", "#c2795a", 0.95, "noise", 0.05),
    "pool": L.make_mat("TW_CovePoolPaving", "#e8dcc4", 0.85, "tiles", 0.04, accent="#d6c7aa"),
    "court": L.make_mat("TW_CoveCourtPaving", "#4f7fa8", 0.9, "noise", 0.03),
    "plaster": L.make_mat("TW_CoveWallPlaster", "#f2ead6", 0.95, "noise", 0.04),
    "stone": L.make_mat("TW_CoveWallStone", "#c6b596", 0.95, "tiles", 0.06, accent="#b09f80"),
    "coping": L.make_mat("TW_CoveCoping", "#c0613a", 0.85, "tiles", 0.05, accent="#a8502f"),
    "iron": L.make_mat("TW_CoveIron", "#1f2124", 0.6, "noise", 0.03),
    "brass": L.make_mat("TW_CoveBrass", "#c9a24a", 0.4, "noise", 0.03),
    "gold": L.make_mat("TW_CoveGoldText", "#d9b45a", 0.4, "noise", 0.02),
    "boom": L.make_mat("TW_CoveBoom", "#e8e4dc", 0.7, "stripes", 0.0, accent="#c8352e"),
    "boom_head": L.make_mat("TW_CoveBoomHead", "#d9b13a", 0.6, "noise", 0.03),
    "lamp": L.make_mat("TW_CoveLampGlow", "#fff1c4", 0.5, "noise", 0.0, emit="#ffd27a", emit_strength=1.4),
    "wood": L.make_mat("TW_CoveBenchWood", "#9c6b43", 0.85, "planks", 0.05, accent="#7e5433"),
    "postbox": L.make_mat("TW_CovePostbox", "#2f5d4a", 0.6, "noise", 0.03),
    "sign": L.make_mat("TW_CoveSignBoard", "#2f5d4a", 0.7, "noise", 0.02),
    "sign_text": L.make_mat("TW_CoveSignText", "#f3ece0", 0.8, "noise", 0.0),
    "water": L.make_mat("TW_CoveFountainWater", "#5fa8c8", 0.15, "noise", 0.05),
    "hedge_low": L.make_mat("TW_CoveHedgeLow", "#4f8a3e", 0.95, "noise", 0.07),
    "trunk": L.make_mat("TW_CoveTrunk", "#7a5a3c", 0.85, "planks", 0.05, accent="#5c4229"),
    "leaf": L.make_mat("TW_CoveLeaf", "#6e9a4c", 0.9, "noise", 0.07),
    "leaf_light": L.make_mat("TW_CoveLeafLight", "#8fb262", 0.9, "noise", 0.07),
    "leaf_dark": L.make_mat("TW_CoveLeafCypress", "#3f6b3c", 0.9, "noise", 0.06),
}
B = {  # building materials (EX_ = exterior architecture)
    "plaster": L.make_mat("EX_cove_Plaster", "#f2edd7", 0.95, "noise", 0.04),
    "floor": L.make_mat("EX_cove_Floor", "#cdbd9e", 0.9, "tiles", 0.05, accent="#b9a886"),
    "trim": L.make_mat("EX_cove_Trim", "#e2d6bb", 0.9, "noise", 0.03),
    "roof": L.make_mat("EX_cove_RoofTile", "#c0613a", 0.85, "tiles", 0.06, accent="#a24f2e"),
    "glass": L.make_mat("EX_cove_Glass", "#9cc3d6", 0.1, "noise", 0.02, alpha=0.45),
    "door": L.make_mat("EX_cove_Door", "#6b4a2f", 0.8, "planks", 0.05, accent="#563a24"),
}
HM = {  # lot landscaping around the houses (the houses themselves come from build_house_v2.py)
    "boxwood": L.make_mat("TW_CoveBoxwoodLeaf", "#3f6f37", 0.9, "noise", 0.07),
    "hydrangea": L.make_mat("TW_CoveHydrangeaFlower", "#f3f1e4", 0.9, "noise", 0.08, accent="#dfe6c8"),
    "hedge_low": M["hedge_low"],
}

LOOP_SEC = S.road_section(6.0, 0.15, 0.0, 1.5, Y)
ROAD_SEC = S.road_section(6.0, 0.15, 1.0, 1.8, Y)
BANDS_ROAD = ROAD_SEC[0]
BANDS_LOOP = LOOP_SEC[0]
RM = {"asphalt": M["asphalt"], "curb": M["curb"], "verge": M["verge"], "walk": M["walk"]}


def leg(s, name, a, b, bands, cuts=(), end_left=None, end_right=None, end_asphalt=None):
    """Straight road leg a -> b. cuts: [(along0, along1)] removed from the left (outer) side bands.
    end_*: alternative end point coordinate along the travel axis for that side (axis-aligned legs only)."""
    ln = math.hypot(b[0] - a[0], b[1] - a[1])
    ux, uz = (b[0] - a[0]) / ln, (b[1] - a[1]) / ln
    for i, (key, o0, o1, top) in enumerate(bands):
        left = o0 >= 0 and key != "asphalt"
        end = end_asphalt if key == "asphalt" else (end_left if left else end_right)
        stop = ln if end is None else end
        pieces = [(0.0, stop)]
        if left:
            for c0, c1 in cuts:
                nxt = []
                for p0, p1 in pieces:
                    if c1 <= p0 or c0 >= p1:
                        nxt.append((p0, p1))
                        continue
                    if c0 > p0:
                        nxt.append((p0, c0))
                    if c1 < p1:
                        nxt.append((c1, p1))
                pieces = nxt
        for j, (p0, p1) in enumerate(pieces):
            if p1 - p0 < 0.01:
                continue
            S.strip(s, f"{name}_{key}{i}_{j}", a[0] + ux * p0, a[1] + uz * p0, a[0] + ux * p1, a[1] + uz * p1, o0, o1, 0.0, top, RM[key])


# ================================================================ Cove Road
# north leg: from the back of the avenue sidewalk to the fillet (travel north, left = west)
fx, fz, fr = FILLET
leg(mall_leg, "CR_NorthLeg", (ROAD_X, AVENUE_EDGE_Z), (ROAD_X, fz), BANDS_ROAD)
S.dashed_line(mall_leg, "CR_NorthLine", (ROAD_X, AVENUE_EDGE_Z - 2.0), (ROAD_X, fz), 0.12, Y["asphalt"], Y["line"], M["line"])
S.road_arc(road, "CR_Fillet", fx, fz, fr, -0.5 * PI, 0.0, ROAD_SEC, RM)
# west leg (travel west, left = south): asphalt to the boulevard carriageway, north bands stop at its east sidewalk,
# south bands run on to close the boulevard's south end
west_a = (fx, ROAD_ZW)
leg(road, "CR_WestLeg", west_a, W2(172.05, ROAD_Z), BANDS_ROAD, end_right=fx - W2(191.55, 0)[0], end_asphalt=fx - ROAD_END_X)
S.dashed_line(road, "CR_WestLine", west_a, (ROAD_END_X + 4.0, ROAD_ZW), 0.12, Y["asphalt"], Y["line"], M["line"])
for k, z in enumerate(range(-30, -131, -20)):
    S.street_lamp(mall_leg, f"CR_LampN{k:02d}", ROAD_X + 3.65, z, M)
for k, x in enumerate(range(-95, -236, -20)):
    S.street_lamp(road, f"CR_LampW{k:02d}", x, ROAD_ZW + 3.65, M)
S.signpost(mall_leg, "CR_Signpost", ROAD_X + 7.6, -22.0, [("Cove Heights", 0.0), ("Mall", PI / 2)], M)

# ================================================================ estate ground
S.rect(est, "CH_SiteLawn", 99.0, -169.95, 261.0, -331.0, 0.0, Y["lawn"], M["lawn"], tile=3.0)

# ---------------------------------------------------------------- loop (left of travel = outer side)
r = LOOP["r"]
cSW, cNW, cNE, cSE = (135.65, -225.65), (135.65, -286.35), (224.35, -286.35), (224.35, -225.65)
# south leg, travel west from x 224.35: boulevard cut x 172.05 .. 191.55 on the outer (south) side
leg(est, "CH_LoopS", (224.35, LOOP["zs"]), (135.65, LOOP["zs"]), BANDS_LOOP, cuts=[(224.35 - 191.55, 224.35 - 172.05)])
leg(est, "CH_LoopW", (LOOP["xw"], -225.65), (LOOP["xw"], -286.35), BANDS_LOOP)
leg(est, "CH_LoopN", (135.65, LOOP["zn"]), (224.35, LOOP["zn"]), BANDS_LOOP, cuts=[(177.0 - 135.65, 183.0 - 135.65)])
leg(est, "CH_LoopE", (LOOP["xe"], -286.35), (LOOP["xe"], -225.65), BANDS_LOOP)
for nm, c, a0 in (("SW", cSW, PI / 2), ("NW", cNW, PI), ("NE", cNE, 1.5 * PI), ("SE", cSE, 0.0)):
    S.road_arc(est, f"CH_LoopCorner{nm}", c[0], c[1], r, a0, a0 + PI / 2, LOOP_SEC, RM)
for nm, a, b in (("S", (224.35, LOOP["zs"]), (135.65, LOOP["zs"])), ("W", (LOOP["xw"], -225.65), (LOOP["xw"], -286.35)),
                 ("N", (135.65, LOOP["zn"]), (224.35, LOOP["zn"])), ("E", (LOOP["xe"], -286.35), (LOOP["xe"], -225.65))):
    S.dashed_line(est, f"CH_LoopLine{nm}", a, b, 0.12, Y["asphalt"], Y["line"], M["line"])

# ---------------------------------------------------------------- entry boulevard (z -161 -> loop)
zb0 = ROAD_Z + 3.0  # -161: Cove Road south carriageway edge
S.rect(est, "CH_BlvdAsphalt", BLVD["x0"], zb0, BLVD["x1"], BLVD["z_end"], 0.0, Y["asphalt"], M["asphalt"])
# Cove Road joins from the east: the east edge starts at the road's north edge, the west edge closes on its south bands
S.rect(est, "CH_BlvdWalkW", 172.05, zb0 + 0.15, 173.85, BLVD["z_end"], 0.0, Y["walk"], M["walk"])
S.rect(est, "CH_BlvdCurbW", 173.85, zb0, 174.0, BLVD["z_end"], 0.0, Y["curb"], M["curb"])
S.rect(est, "CH_BlvdCurbE", 189.6, ROAD_Z - 3.0, 189.75, BLVD["z_end"], 0.0, Y["curb"], M["curb"])
S.rect(est, "CH_BlvdWalkE", 189.75, ROAD_Z - 3.0, 191.55, BLVD["z_end"], 0.0, Y["walk"], M["walk"])
# island (guardhouse) and divider (resident lane), raised paving inside a curb ring
for nm, (x0_, z0_, x1_, z1_) in {"S": (178.0, -172.0, 182.0, -172.15), "N": (178.0, -204.85, 182.0, -205.0),
                                 "W": (178.0, -172.15, 178.15, -204.85), "E": (181.85, -172.15, 182.0, -204.85)}.items():
    S.rect(est, f"CH_IslandCurb{nm}", x0_, z0_, x1_, z1_, 0.0, Y["curb"], M["curb"])
S.rect(est, "CH_IslandPaving", 178.15, -172.15, 181.85, -204.85, 0.0, Y["walk"], M["walk"])
S.rect(est, "CH_DividerCurb", 185.5, -186.0, 186.1, -194.0, 0.0, Y["curb"], M["curb"])
S.dashed_line(est, "CH_BlvdLaneLine", (185.8, zb0 - 2.0), (185.8, -185.5), 0.12, Y["asphalt"], Y["line"], M["line"])
S.dashed_line(est, "CH_BlvdLaneLine2", (185.8, -194.5), (185.8, -213.0), 0.12, Y["asphalt"], Y["line"], M["line"])

# ---------------------------------------------------------------- emergency lane
S.rect(est, "CH_EmergencyLane", 177.0, -297.35, 183.0, -329.85, 0.0, Y["asphalt"], M["asphalt"])

# ================================================================ perimeter wall
W = WALL


def pilasters_along(axis, fixed, a0, a1, skip=()):
    n = int(round((a1 - a0) / 5.0))
    out = []
    for k in range(n + 1):
        v = round(a0 + 5.0 * k, 3)
        if any(abs(v - s_) < 1e-6 for s_ in skip):
            continue
        out.append(v)
    return out


def wall_line(name, axis, fixed, stops):
    """Pilasters at `stops` (values along the axis); wall bays between pilaster faces. Openings handled by the caller."""
    for i, v in enumerate(stops):
        p = (v, fixed) if axis == "x" else (fixed, v)
        S.pilaster(est, f"{name}_Pil{i:02d}", p[0], p[1], M)


def bay(name, axis, fixed, a, b):
    pa = (a, fixed) if axis == "x" else (fixed, a)
    pb = (b, fixed) if axis == "x" else (fixed, b)
    S.wall_run(est, name, pa, pb, M, col=False)


south_stops = pilasters_along("x", W["z1"], W["x0"], W["x1"], skip=(175.0, 180.0, 185.0, 190.0))
north_stops = pilasters_along("x", W["z0"], W["x0"], W["x1"], skip=(180.0,))
west_stops = pilasters_along("z", W["x0"], W["z0"], W["z1"])
east_stops = pilasters_along("z", W["x1"], W["z0"], W["z1"])
wall_line("CH_WallS", "x", W["z1"], south_stops)
wall_line("CH_WallN", "x", W["z0"], north_stops)
wall_line("CH_WallW", "z", W["x0"], west_stops[1:-1])
wall_line("CH_WallE", "z", W["x1"], east_stops[1:-1])

PIERS_S = {"W2": 171.75, "W1": 173.55, "E1": 190.05, "E2": 191.85}
PIERS_N = {"NW": 176.45, "NE": 183.55}


def bays_between(name, axis, fixed, stops, blocks):
    """Wall bays between consecutive pilasters, clipped by blocks [(a, b)] (piers / openings)."""
    for i, (u, v) in enumerate(zip(stops, stops[1:])):
        a, b = u + 0.2, v - 0.2
        segs = [(a, b)]
        for c0, c1 in blocks:
            nxt = []
            for p0, p1 in segs:
                if c1 <= p0 or c0 >= p1:
                    nxt.append((p0, p1))
                    continue
                if c0 > p0:
                    nxt.append((p0, c0))
                if c1 < p1:
                    nxt.append((c1, p1))
            segs = nxt
        for j, (p0, p1) in enumerate(segs):
            bay(f"{name}_Bay{i:02d}_{j}", axis, fixed, p0, p1)


bays_between("CH_WallS", "x", W["z1"], south_stops, [(171.47, 192.13)])
bays_between("CH_WallN", "x", W["z0"], north_stops, [(176.17, 183.83)])
bays_between("CH_WallW", "z", W["x0"], west_stops, [])
bays_between("CH_WallE", "z", W["x1"], east_stops, [])
# continuous collision runs (the bays are visual only)
for nm, cx, cz, sx, sz in (("WallS_W", (99.8 + 171.47) / 2, W["z1"], 171.47 - 99.8, 0.42), ("WallS_E", (192.13 + 260.2) / 2, W["z1"], 260.2 - 192.13, 0.42),
                           ("WallN_W", (99.8 + 176.17) / 2, W["z0"], 176.17 - 99.8, 0.42), ("WallN_E", (183.83 + 260.2) / 2, W["z0"], 260.2 - 183.83, 0.42),
                           ("WallW", W["x0"], (W["z0"] + W["z1"]) / 2, 0.42, 140.4), ("WallE", W["x1"], (W["z0"] + W["z1"]) / 2, 0.42, 140.4)):
    est.col(nm, cx, cz, sx, sz, 2.9)

# ---------------------------------------------------------------- main gate (south wall)
for nm, x in PIERS_S.items():
    S.gate_pier(est, f"CH_Pier{nm}", x, W["z1"], M)
S.iron_leaf(est, "CH_PortalW", (173.25, W["z1"]), (0.0, -1.0), 1.22, M, h=2.0)   # open into the estate
S.iron_leaf(est, "CH_PortalE", (190.35, W["z1"]), (0.0, -1.0), 1.22, M, h=2.0)
S.boom_barrier(est, "CH_BoomEgress", 178.2, W["z1"], 4.0, M, direction=-1.0)
S.boom_barrier(est, "CH_BoomVisitor", 181.8, W["z1"], 3.5, M)
S.boom_barrier(est, "CH_BoomResident", 185.8, W["z1"], 3.5, M)
for nm, x in (("BoomEgressPost", 178.2), ("BoomVisitorPost", 181.8), ("BoomResidentPost", 185.8)):
    est.col(nm, x, W["z1"], 0.35, 0.35, 1.2)
S.rail(est, "CH_IslandRail", (178.45, W["z1"]), (181.55, W["z1"]), M)
est.add(L.box(est.coll, "CH_RfidPedestal", 185.8, -188.6, Y["curb"], 0.4, 0.4, 1.3, M["iron"], bevel=0.03))
est.add(L.box(est.coll, "CH_RfidScreen", 185.8, -188.38, 1.1, 0.3, 0.04, 0.22, M["lamp"]))
est.col("RfidPedestal", 185.8, -188.6, 0.45, 0.45, 1.45)
est.add(L.box(est.coll, "CH_BadgeReader", 190.05, W["z1"] + 0.3, 1.1, 0.18, 0.04, 0.26, M["lamp"]))
S.pavilion_shell(est, "CH_Gatehouse", 180.0, -184.5, 3.5, 5.0, B, y_floor=Y["curb"] + 0.02, wall_h=2.7, t=0.2, ridge="z", roof_h=0.7,
                 windows={"N": [(178.7, 181.3, 0.9, 2.3)], "E": [(-186.3, -182.7, 0.9, 2.3)], "W": [(-186.3, -182.7, 0.9, 2.3)],
                          "S": [(180.8, 181.5, 0.9, 2.3)]},
                 door=("S", 179.4, 180.6, 2.1))
S.monument_sign(est, "CH_MonumentW", 168.0, -173.0, PI, "COVE HEIGHTS", M)
S.monument_sign(est, "CH_MonumentE", 195.6, -173.0, PI, "COVE HEIGHTS", M)
for k, (x, z, h) in enumerate(((180.0, -173.5, 4.5), (171.0, -176.0, 4.5), (192.6, -176.0, 4.5), (180.0, -196.0, 4.5), (180.0, -202.0, 4.5))):
    S.street_lamp(est, f"CH_LampGate{k}", x, z, M, h=h)

GATE_TOGGLE = [
    {"name": "COL_Cove_PortalW", "cx": 172.65, "cz": W["z1"], "hx": 0.62, "hz": 0.15, "cy": 1.1, "hy": 1.1, "yaw": 0.0},
    {"name": "COL_Cove_BoomEgress", "cx": 176.0, "cz": W["z1"], "hx": 2.0, "hz": 0.15, "cy": 0.6, "hy": 0.6, "yaw": 0.0},
    {"name": "COL_Cove_BoomVisitor", "cx": 183.75, "cz": W["z1"], "hx": 1.75, "hz": 0.15, "cy": 0.6, "hy": 0.6, "yaw": 0.0},
    {"name": "COL_Cove_BoomResident", "cx": 187.85, "cz": W["z1"], "hx": 1.75, "hz": 0.15, "cy": 0.6, "hy": 0.6, "yaw": 0.0},
    {"name": "COL_Cove_PortalE", "cx": 190.95, "cz": W["z1"], "hx": 0.62, "hz": 0.15, "cy": 1.1, "hy": 1.1, "yaw": 0.0},
]
CHECKPOINT = {"id": "cove_heights_main", "position": [190.95, 0.0, -188.0], "yaw": 0.0,
              "trigger": {"minX": 189.75, "maxX": 191.55, "minZ": -189.72, "maxZ": -186.0}}

# ---------------------------------------------------------------- emergency gate (north wall)
for nm, x in PIERS_N.items():
    S.gate_pier(est, f"CH_Pier{nm}", x, W["z0"], M)
S.swing_gate(est, "CH_EmergencyGate", 176.73, 183.27, W["z0"], M)

# ================================================================ lots (v1: decor plots with stable IDs)
LOTS = [
    ("B-01", "B", 150, 170, -193, -213, "N", (163.8, 166.2, -208, -213), (165.0, -213.0), PI, (163.2, -212.6)),
    ("B-02", "B", 130, 150, -193, -213, "N", (138.8, 141.2, -208, -213), (140.0, -213.0), PI, (138.2, -212.6)),
    ("B-03", "B", 103, 123, -213, -233, "E", (118, 123, -228.3, -230.7), (123.0, -229.5), PI / 2, (122.6, -227.7)),
    ("B-04", "B", 103, 123, -233, -253, "E", (118, 123, -246.8, -249.2), (123.0, -248.0), PI / 2, (122.6, -246.2)),
    ("B-05", "B", 103, 123, -253, -273, "E", (118, 123, -266.8, -269.2), (123.0, -268.0), PI / 2, (122.6, -266.2)),
    ("B-06", "B", 103, 123, -273, -293, "E", (118, 123, -275.8, -278.2), (123.0, -277.0), PI / 2, (122.6, -275.2)),
    ("A-01", "A", 112, 140, -299, -327, "S", (136.5, 139.5, -299, -304), (138.0, -299.0), 0.0, (135.9, -299.4)),
    ("A-02", "A", 140, 168, -299, -327, "S", (158.5, 161.5, -299, -304), (160.0, -299.0), 0.0, (157.9, -299.4)),
    ("A-03", "A", 192, 220, -299, -327, "S", (198.5, 201.5, -299, -304), (200.0, -299.0), 0.0, (202.1, -299.4)),
    ("A-04", "A", 220, 248, -299, -327, "S", (220.5, 223.5, -299, -304), (222.0, -299.0), 0.0, (224.1, -299.4)),
    ("B-07", "B", 237, 257, -273, -293, "W", (237, 242, -275.8, -278.2), (237.0, -277.0), -PI / 2, (237.4, -275.2)),
    ("B-08", "B", 237, 257, -253, -273, "W", (237, 242, -266.8, -269.2), (237.0, -268.0), -PI / 2, (237.4, -266.2)),
    ("B-09", "B", 237, 257, -233, -253, "W", (237, 242, -246.8, -249.2), (237.0, -248.0), -PI / 2, (237.4, -246.2)),
    ("B-10", "B", 237, 257, -213, -233, "W", (237, 242, -228.3, -230.7), (237.0, -229.5), -PI / 2, (237.4, -227.7)),
    ("B-11", "B", 214, 234, -193, -213, "N", (218.8, 221.2, -208, -213), (220.0, -213.0), PI, (221.8, -212.6)),
    ("B-12", "B", 194, 214, -193, -213, "N", (197.8, 200.2, -208, -213), (199.0, -213.0), PI, (200.8, -212.6)),
]
hedges = set()
lots_out = []
for lid, typ, x0, x1, z0, z1, face, drv, entry, eyaw, pbox in LOTS:
    tag = lid.replace("-", "")
    S.rect(est, f"CH_Lot{tag}_Lawn", x0, z0, x1, z1, Y["lawn"], Y["lot"], M["lot"], tile=3.0)
    S.rect(est, f"CH_Lot{tag}_Driveway", drv[0], drv[2], drv[1], drv[3], 0.0, Y["drive"], M["drive"])
    S.postbox(est, f"CH_Lot{tag}_Postbox", pbox[0], pbox[1], eyaw + PI, lid, M)
    lines = {"S": ((x0, z0), (x1, z0)), "N": ((x0, z1), (x1, z1)), "W": ((x0, z0), (x0, z1)), "E": ((x1, z0), (x1, z1))}
    for side, seg in lines.items():
        if side == face:
            continue
        key = tuple(sorted((tuple(round(v, 2) for v in seg[0]), tuple(round(v, 2) for v in seg[1]))))
        hedges.add(key)
    lots_out.append({"id": lid, "type": "villa" if typ == "A" else "executive", "bounds": {"minX": x0, "maxX": x1, "minZ": min(z0, z1), "maxZ": max(z0, z1)},
                     "center": [round((x0 + x1) / 2, 3), 0.0, round((z0 + z1) / 2, 3)], "entry": [entry[0], 0.0, entry[1]], "entryYaw": round(eyaw, 4),
                     "faces": face, "housingKey": f"cove_heights:{lid}"})
for k, (a, b) in enumerate(sorted(hedges)):
    S.hedge_run(est, f"CH_LotHedge{k:02d}", a, b, M)

# ================================================================ houses (walk-in, buyable: build_house_v2.py -> assets/houses/<key>/)
# The house is an open-world `house` building of the cove_heights zone (apply-cove-heights.mjs), not part of this GLB.
# Its origin = the lot point below; exterior front face at +ZF (4.0), door at x 0, garage wing on +x (local 6.5..13.9).
# A-02 (x 140..168, z -299..-327, front S): main block x 143.5..156.5, garage door centre x 160.2 on the lot driveway.
VILLA_A02 = {"key": "cove_villa_a02", "name": "Colonial Villa", "lot": "A-02", "origin": (150.0, -309.3), "zf": 4.0,
             "interiorOffset": [0.0, 0.2, -1.405],  # printed by build_house_v2.py (FY, ZF - T - GAP - 5.2)
             "price": 20000, "garage_door": (10.2, 4.9)}
ox, oz = VILLA_A02["origin"]
front_z = oz + VILLA_A02["zf"]           # -305.3
gd_x, gd_w = VILLA_A02["garage_door"]
S.rect(est, "CH_LotA02_GarageApron", ox + gd_x - gd_w / 2, -304.0, ox + gd_x + gd_w / 2, front_z, 0.0, Y["drive"], M["drive"])
S.rect(est, "CH_LotA02_FrontPath", ox - 0.8, -299.0, ox + 0.8, front_z + 2.6, Y["lot"], Y["drive"], M["drive"])  # to the porch step
S.street_lamp(est, "CH_LotA02_PostLamp", ox - 1.6, -300.2, M, h=2.6)
S.hedge_run(est, "CH_LotA02_HedgeW", (ox - 6.3, front_z + 1.6), (ox - 4.4, front_z + 1.6), HM, w=0.6)
S.hydrangeas(est, "CH_LotA02_HydrangeaW", ox - 6.2, ox - 4.5, front_z + 2.3, HM, n=3)
S.hydrangeas(est, "CH_LotA02_HydrangeaE", ox + 4.1, ox + 6.0, front_z + 2.0, HM, n=2)
# placeholder box the open-house loader swaps for the real interior collision (openHouses.ts composeTownCollisionData)
est.col("HousePlaceholder", ox + 3.7, oz - 1.3, 20.4, 10.6, 6.0)
est.cols[-1]["name"] = f"COL_House_{VILLA_A02['key']}"
HOUSES = [VILLA_A02]

# ================================================================ communal
# clubhouse & leisure parcel
S.pavilion_shell(est, "CH_Clubhouse", 180.0, -233.0, 20.0, 12.0, B, y_floor=0.0, wall_h=3.6, t=0.25, ridge="x", roof_h=2.2,
                 windows={"S": [(172.5, 174.5, 0.9, 2.5), (175.5, 177.5, 0.9, 2.5), (182.5, 184.5, 0.9, 2.5), (185.5, 187.5, 0.9, 2.5)],
                          "N": [(172.0, 174.0, 0.9, 2.5), (176.0, 178.0, 0.9, 2.5), (182.0, 184.0, 0.9, 2.5), (186.0, 188.0, 0.9, 2.5)],
                          "E": [(-236.0, -234.0, 0.9, 2.5), (-232.0, -230.0, 0.9, 2.5)], "W": [(-236.0, -234.0, 0.9, 2.5), (-232.0, -230.0, 0.9, 2.5)]},
                 door=("S", 179.1, 180.9, 2.4))
club_sign = L.text_mesh(est.coll, "CH_ClubSignText", "COVE CLUB", 180.0, -226.85, 2.75, 0.4, 0.02, M["gold"], resolution=2)
est.add(club_sign)
S.rect(est, "CH_ClubForecourt", 172.0, -222.3, 188.0, -226.9, 0.0, Y["plaza"], M["plaza"])
S.rect(est, "CH_PoolDeck", 144.0, -228.0, 162.0, -240.0, Y["lawn"], Y["path"], M["pool"])
S.rect(est, "CH_CourtPad", 199.0, -227.0, 211.0, -247.0, Y["lawn"], Y["path"], M["court"])
S.rect(est, "CH_Promenade", 140.0, -250.0, 220.0, -253.0, Y["lawn"], Y["path"], M["walk"])
# park
S.disc(est, "CH_FountainPlaza", 180.0, -269.5, 6.0, Y["lawn"], Y["plaza"], M["plaza"], seg=28)
S.fountain(est, "CH_Fountain", 180.0, -269.5, 2.5, M)
S.rect(est, "CH_ParkAxisNS", 179.0, -253.0, 181.0, -289.7, Y["lawn"], Y["path"], M["walk"])
S.rect(est, "CH_ParkAxisEW_W", 132.3, -268.5, 179.0, -270.5, Y["lawn"], Y["path"], M["walk"])
S.rect(est, "CH_ParkAxisEW_E", 181.0, -268.5, 227.7, -270.5, Y["lawn"], Y["path"], M["walk"])
for nm, (ax, az, bx, bz) in {"S": (144.25, -257.5, 215.75, -257.5), "N": (144.25, -281.5, 215.75, -281.5)}.items():
    S.rect(est, f"CH_Track{nm}", ax, az + 0.75, bx, bz - 0.75, Y["lawn"], Y["track"], M["track"])
for nm, x in (("W", 145.0), ("E", 215.0)):
    S.rect(est, f"CH_Track{nm}", x - 0.75, -258.25, x + 0.75, -280.75, Y["lawn"], Y["track"], M["track"])
for k, (x, z, rot) in enumerate(((180.0 - 7.2, -266.0, -PI / 2), (180.0 + 7.2, -266.0, PI / 2), (180.0 - 7.2, -273.0, -PI / 2), (180.0 + 7.2, -273.0, PI / 2))):
    S.bench(est, f"CH_ParkBench{k}", x, z, rot, M)
for k, (x, z) in enumerate(((165, -255.6), (195, -255.6), (165, -283.6), (195, -283.6), (142.9, -262), (142.9, -277), (217.1, -262), (217.1, -277))):
    S.street_lamp(est, f"CH_LampPark{k}", x, z, M, h=3.5)
for k, (x, z) in enumerate(((140, -222.8), (160, -222.8), (200, -222.8), (220, -222.8), (140, -289.2), (160, -289.2), (200, -289.2), (220, -289.2),
                            (132.8, -236), (132.8, -256), (132.8, -276), (227.2, -236), (227.2, -256), (227.2, -276))):
    S.street_lamp(est, f"CH_LampLoop{k:02d}", x, z, M)
for k, (x, z) in enumerate(((175.5, -306.0), (184.5, -320.0))):
    S.street_lamp(est, f"CH_LampLane{k}", x, z, M)

# planting
for k, (x, z, s_) in enumerate(((155, -263, 1.0), (205, -263, 1.05), (155, -277, 0.95), (205, -277, 1.0), (110, -199, 1.1), (122, -201, 0.95),
                                (112, -208, 1.0))):
    S.tree(est, f"CH_Tree{k:02d}", x, z, M, "round", s_)
for k, (x, z) in enumerate(((107.5, -305), (107.5, -315), (252.5, -305), (252.5, -315), (165, -306), (195, -320), (171, -320), (189, -306),
                            (141, -246.5), (219, -246.5))):
    S.tree(est, f"CH_Cypress{k:02d}", x, z, M, "cypress", 1.0)
for k, (x, z, rot) in enumerate(((118.0, -197.5, PI), (126.0, -205.0, PI / 2))):
    S.bench(est, f"CH_GardenBench{k}", x, z, rot, M)

# ================================================================ audit, export
rects = {lid: (x0, min(z0, z1), x1, max(z0, z1)) for lid, _, x0, x1, z0, z1, *_ in LOTS}
rects.update({"clubParcel": (140, -250, 220, -225), "promenade": (140, -253, 220, -250), "park": (140, -286, 220, -253),
              "loopS": (123, -222.3, 237, -213), "loopN": (123, -299, 237, -289.7), "loopW": (123, -289.7, 132.3, -222.3),
              "loopE": (227.7, -289.7, 237, -222.3), "boulevard": (172.05, -213, 191.55, -161), "lane": (177, -330, 183, -299)})
bad = S.check_disjoint(rects, allowed={("boulevard", "loopS")})
print("COVE overlaps:", bad)
assert not bad, bad

for s in (est, road, mall_leg):  # furniture that must stand on y = 0 (the known "sunk furniture" bug)
    feet = [o for o in s.objs if o.type == "MESH" and (o.name.endswith("_Base") or "Bench" in o.name or o.name.endswith("_Postbox")
                                                       or o.name.endswith("_Post") or o.name.endswith("_Trunk"))]
    g = L.check_grounded(feet)
    assert not g, g

# ---------------------------------------------------------------- plan frame -> world (the estate only; the road is world already)
for o in est.objs:
    o.location.x += DX
    o.location.y -= DZ  # blender y = -game z
for c in est.cols + GATE_TOGGLE:
    c["cx"] = round(c["cx"] + DX, 3)
    c["cz"] = round(c["cz"] + DZ, 3)


def wp(x, z):
    return [round(x + DX, 3), 0.0, round(z + DZ, 3)]


for lot in lots_out:
    b_ = lot["bounds"]
    lot["bounds"] = {"minX": b_["minX"] + DX, "maxX": b_["maxX"] + DX, "minZ": b_["minZ"] + DZ, "maxZ": b_["maxZ"] + DZ}
    lot["center"] = wp(lot["center"][0], lot["center"][2])
    lot["entry"] = wp(lot["entry"][0], lot["entry"][2])
t_ = CHECKPOINT["trigger"]
CHECKPOINT["position"] = wp(CHECKPOINT["position"][0], CHECKPOINT["position"][2])
CHECKPOINT["trigger"] = {"minX": t_["minX"] + DX, "maxX": t_["maxX"] + DX, "minZ": t_["minZ"] + DZ, "maxZ": t_["maxZ"] + DZ}

L.export_glb(os.path.join(OUT, "cove_heights.glb"), est.objs, use_active_scene=True)
L.export_glb(os.path.join(OUT, "cove_road.glb"), road.objs, use_active_scene=True)
L.export_glb(os.path.join(OUT, "cove_road_mall.glb"), mall_leg.objs, use_active_scene=True)
L.write_json(os.path.join(OUT, "cove_heights.layout.json"), {
    "version": 1,
    "offset": {"x": DX, "z": DZ},
    "zones": ZONES,
    "spawn": dict(zip(("x", "z"), W2(180.0, -196.0)), yaw=0.0),
    "mainGate": dict(zip(("x", "z"), W2(180.0, W["z1"])), yaw=0.0),
    "emergencyGate": dict(zip(("x", "z"), W2(180.0, W["z0"])), yaw=PI, locked=True),
    "gate": {"residentsOnly": True, "enforced": False, "toggle": GATE_TOGGLE},
    "checkpoint": CHECKPOINT,
    "guardPoint": wp(180.0, -184.5),
    # admin teleport: outside the gate on the visitor lane (plan x 182..185.5), 14 m before the barrier line, looking north
    "adminTeleport": {"position": wp(183.75, -176.0), "yaw": 0.0},
    "clubhouseDoor": wp(180.0, -226.4),
    "junction": {"x": ROAD_X, "z": AVENUE_EDGE_Z, "road": "mall_avenue"},
    "lots": lots_out,
    "houses": [{"kind": "house", "key": h["key"], "name": h["name"], "lot": h["lot"], "position": wp(*h["origin"]), "rotationY": 0,
                "door": [wp(*h["origin"])[0], 1.25, round(h["origin"][1] + h["zf"] + 0.8 + DZ, 3)], "offer": "buy", "price": h["price"],
                "interiorOffset": h["interiorOffset"]} for h in HOUSES],
    "collision": est.cols + road.cols + mall_leg.cols,
})
print("cove_heights:", len(est.objs), "objects,", est.tris(), "tris,", len(est.cols), "COL")
print("cove_road:", len(road.objs), "objects,", road.tris(), "tris;", "cove_road_mall:", len(mall_leg.objs), "objects,", mall_leg.tris(), "tris")
