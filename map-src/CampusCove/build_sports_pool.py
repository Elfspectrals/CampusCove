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
import lib_sports as SP
importlib.reload(SP)
import bpy

KEY = "sports_pool"
OUT = os.path.join(L.OUT_ROOT, "park", KEY)
FP = SP.FOOTPRINTS[KEY]
HOLE = (FP[0] + 0.5, FP[1] - 0.5, FP[2] + 0.5, FP[3] - 0.5)
STUB = SP.DOOR_STUBS[KEY]

T = 0.3
H = 10.0
HALL = (-534.5, -484.0, -228.7, -198.3)
IN_X0, IN_X1, IN_Z0, IN_Z1 = HALL[0] + T, HALL[1] - T, HALL[2] + T, HALL[3] - T
LOBBY_WALL_X = -491.5
DOOR_Z = (-213.5, -210.5)
DOOR_H = 2.6

POOL_Z = (-219.5, -204.5)
PIT = (-533.0, -520.0, *POOL_Z)
BASIN = (-519.0, -494.0, *POOL_Z)
WATER_Y = -0.3
WADE_Y = -1.3
BASIN_FLOOR = -2.0
PIT_FLOOR = -4.5
LANES = 6
LANE_W = 2.5
START_X = BASIN[1]
TURN_X = BASIN[0]

STAND_ROWS = 5
STAND_RISE = 0.45
STAND_DEPTH = 0.9
STAND_FRONT_Z = -223.0
STAND_X = (-519.0, -494.0)

BOARDS = [
    {"id": "board_1m", "heightM": 1.0, "kind": "board", "x": (-522.4, -521.6), "board_z": (-207.0, -203.0), "stair_z": (-203.0, -201.6)},
    {"id": "board_3m", "heightM": 3.0, "kind": "board", "x": (-527.0, -526.2), "board_z": (-207.6, -203.6), "stair_z": (-203.6, -199.0)},
    {"id": "platform_5m", "heightM": 5.0, "kind": "platform", "x": (-532.6, -530.2), "board_z": (-206.6, -203.6), "stair_z": (-203.6, -198.9),
     "stair_x": (-532.0, -530.8)},
]
EDGE_DEPTH = 1.2
EXIT_STEPS = [
    {"name": "BasinStart", "rect": (START_X - 1.4, START_X, POOL_Z[0], POOL_Z[0] + 1.2), "rise": "+x"},
    {"name": "BasinTurn", "rect": (TURN_X, TURN_X + 1.4, POOL_Z[0], POOL_Z[0] + 1.2), "rise": "-x"},
    {"name": "Pit", "rect": (PIT[0], PIT[0] + 1.4, POOL_Z[0], POOL_Z[0] + 1.2), "rise": "-x"},
]
COACH = (-492.7, -221.2)
BLOCK_X = START_X + 0.35

sc = L.new_build_scene("PARK_" + KEY)
coll = bpy.data.collections.new(KEY)
sc.collection.children.link(coll)
s = S.Site(coll, "SportsPool", seed=81)
shared = SP.site_materials()
M = {
    "lawn": shared["lawn"],
    "paving": shared["paving"],
    "deck": L.make_mat("TW_SportsPoolTilePaving", "#e7eef0", 0.6, "tiles", 0.03, accent="#d3dde0"),
    "edge": L.make_mat("TW_SportsPoolEdgeTile", "#2f6fa8", 0.5, "tiles", 0.03, accent="#285f90"),
    "basin": L.make_mat("TW_SportsPoolBasinTile", "#6fc2df", 0.5, "tiles", 0.03, accent="#5fb0cc"),
    "line": L.make_mat("TW_SportsPoolLaneLine", "#1d3f6b", 0.6, "noise", 0.0),
    "water": L.make_mat("TW_SportsPoolWater", "#3fa7d6", 0.05, "noise", 0.02, alpha=0.55),
    "rope_red": L.make_mat("TW_SportsPoolRopeRed", "#d64545", 0.5, "noise", 0.0),
    "rope_white": L.make_mat("TW_SportsPoolRopeWhite", "#f3f3f0", 0.5, "noise", 0.0),
    "rope_blue": L.make_mat("TW_SportsPoolRopeBlue", "#2f5fb8", 0.5, "noise", 0.0),
    "wall": L.make_mat("TW_SportsPoolWall", "#eef0ec", 0.9, "noise", 0.02),
    "plinth": L.make_mat("TW_SportsPoolPlinth", "#9aa3a8", 0.9, "noise", 0.03),
    "roof": L.make_mat("TW_SportsPoolRoof", "#5c6670", 0.9, "noise", 0.02),
    "ceiling": L.make_mat("TW_SportsPoolCeiling", "#f4f3ee", 0.95, "noise", 0.01),
    "glass": L.make_mat("TW_SportsPoolGlass", "#bfe4f2", 0.1, "noise", 0.01, alpha=0.35),
    "frame": L.make_mat("TW_SportsPoolFrame", "#3a3f45", 0.5, "noise", 0.02),
    "steel": L.make_mat("TW_SportsPoolSteel", "#c3c8ce", 0.3, "noise", 0.02),
    "board": L.make_mat("TW_SportsPoolDiveBoard", "#f1f1ec", 0.6, "noise", 0.01),
    "tread": L.make_mat("TW_SportsPoolStep", "#d8dee0", 0.8, "stripes", 0.02, accent="#c7cfd2"),
    "concrete": L.make_mat("TW_SportsPoolConcrete", "#c9c6bf", 0.9, "noise", 0.03),
    "seat": L.make_mat("TW_SportsPoolSeat", "#2a9d8f", 0.8, "noise", 0.03),
    "block": L.make_mat("TW_SportsPoolStartBlock", "#f2f2ee", 0.5, "noise", 0.01),
    "lane_no": L.make_mat("TW_SportsPoolText", "#1d3f6b", 0.6, "noise", 0.0),
    "sign": L.make_mat("TW_SportsPoolSignBoard", "#2a9d8f", 0.7, "noise", 0.02),
    "sign_text": L.make_mat("TW_SportsPoolSignText", "#f3f1ea", 0.8, "noise", 0.0),
    "locker": L.make_mat("TW_SportsPoolLocker", "#3d7fb8", 0.6, "stripes", 0.02, accent="#356fa0"),
    "wood": L.make_mat("TW_SportsPoolBenchWood", "#c9a36a", 0.6, "planks", 0.04, accent="#a98550"),
    "lamp": L.make_mat("TW_SportsPoolLightGlow", "#fffbe8", 0.5, "noise", 0.0, emit="#fff4d0", emit_strength=1.2),
    "board_led": L.make_mat("TW_SportsPoolClockGlow", "#101418", 0.5, "noise", 0.0, emit="#ffb340", emit_strength=1.0),
}


def rect_minus(outer, holes):
    x0, x1, z0, z1 = outer
    cuts = sorted({x0, x1, *[v for h in holes for v in (h[0], h[1]) if x0 < v < x1]})
    out = []
    for a, b in zip(cuts, cuts[1:]):
        mid = (a + b) / 2
        spans = sorted((max(h[2], z0), min(h[3], z1)) for h in holes if h[0] < mid < h[1] and h[2] < z1 and h[3] > z0)
        cur = z0
        for s0, s1 in spans:
            if s0 > cur:
                out.append((a, b, cur, s0))
            cur = max(cur, s1)
        if cur < z1:
            out.append((a, b, cur, z1))
    return out


def as_rect(r):
    return {"minX": round(r[0], 3), "maxX": round(r[1], 3), "minZ": round(r[2], 3), "maxZ": round(r[3], 3)}


def slab(name, r, y0, y1, mat, tile=2.0):
    return S.rect(s, name, r[0], r[2], r[1], r[3], y0, y1, mat, tile=tile)


def solid(name, r, y0, y1, mat=None, tile=2.0):
    if mat is not None:
        slab(name, r, y0, y1, mat, tile)
    s.col(name, (r[0] + r[1]) / 2, (r[2] + r[3]) / 2, r[1] - r[0], r[3] - r[2], y1 - y0, y0=y0)


hall_rect = HALL
ground_cover = []
for i, r in enumerate(rect_minus(FP, [(hall_rect[0] + 0.1, hall_rect[1] - 0.1, hall_rect[2] + 0.1, hall_rect[3] - 0.1)])):
    slab(f"SP_GroundPaving_{i:02d}", r, 0.0, SP.Y["paving"], M["paving"])
    ground_cover.append(r)
stub_link = (FP[1] - 3.0, FP[1], STUB[2], STUB[3])

water_rects = [PIT[:4], BASIN[:4]]
COPING = 0.05
water_holes = [(r[0] + COPING, r[1] - COPING, r[2] + COPING, r[3] - COPING) for r in water_rects]
for i, r in enumerate(rect_minus((IN_X0 - T, IN_X1 + T, IN_Z0 - T, IN_Z1 + T), water_holes)):
    slab(f"SP_DeckTilePaving_{i:02d}", r, -0.1, 0.02, M["deck"], tile=1.0)
    ground_cover.append(r)
for name, r, floor in (("Pit", PIT, PIT_FLOOR), ("Basin", BASIN, BASIN_FLOOR)):
    slab(f"SP_{name}_Floor", r, floor - 0.1, floor, M["basin"], tile=1.0)
    slab(f"SP_{name}_WallN", (r[0], r[1], r[2] - 0.2, r[2]), floor, 0.0, M["basin"], tile=1.0)
    slab(f"SP_{name}_WallS", (r[0], r[1], r[3], r[3] + 0.2), floor, 0.0, M["basin"], tile=1.0)
    slab(f"SP_{name}_WallW", (r[0] - 0.2, r[0], r[2], r[3]), floor, 0.0, M["basin"], tile=1.0)
    slab(f"SP_{name}_WallE", (r[1], r[1] + 0.2, r[2], r[3]), floor, 0.0, M["basin"], tile=1.0)
    slab(f"SP_{name}_Water", r, WATER_Y - 0.01, WATER_Y, M["water"], tile=4.0)
    ground_cover.append(r)
    for side, er in (("N", (r[0], r[1], r[2] - 0.3, r[2])), ("S", (r[0], r[1], r[3], r[3] + 0.3)),
                     ("W", (r[0] - 0.3, r[0], r[2], r[3])), ("E", (r[1], r[1] + 0.3, r[2], r[3]))):
        gaps = [st["rect"] for st in EXIT_STEPS if st["rect"][0] >= r[0] - 1e-6 and st["rect"][1] <= r[1] + 1e-6]
        pieces = [er]
        for g in gaps:
            gap = (g[0] - 0.3, g[1] + 0.3, g[2] - 0.3, g[3]) if side in ("W", "E") else (g[0], g[1], g[2] - 0.3, g[3])
            pieces = [p for q in pieces for p in rect_minus(q, [gap])]
        for k, p in enumerate(pieces):
            solid(f"WaterEdge_{name}{side}_{k}", p, floor, -0.05)

for lane in range(LANES + 1):
    z = POOL_Z[0] + lane * LANE_W
    if 0 < lane < LANES:
        mats = (M["rope_red"], M["rope_white"]) if lane in (1, LANES - 1) else (M["rope_blue"], M["rope_white"])
        for k in range(10):
            x0 = BASIN[0] + k * 2.5
            slab(f"SP_LaneRope_{lane}_{k:02d}", (x0, x0 + 2.5, z - 0.05, z + 0.05), WATER_Y - 0.05, WATER_Y + 0.04, mats[k % 2], tile=1.0)
for lane in range(LANES):
    zc = POOL_Z[1] - (lane + 0.5) * LANE_W
    slab(f"SP_LaneLine_{lane + 1}", (BASIN[0] + 2.0, BASIN[1] - 2.0, zc - 0.12, zc + 0.12), BASIN_FLOOR, BASIN_FLOOR + 0.01, M["line"], tile=1.0)
    slab(f"SP_LaneT_{lane + 1}_Turn", (BASIN[0] + 2.0, BASIN[0] + 2.1, zc - 0.5, zc + 0.5), BASIN_FLOOR, BASIN_FLOOR + 0.01, M["line"], tile=1.0)
    slab(f"SP_LaneT_{lane + 1}_Start", (BASIN[1] - 2.1, BASIN[1] - 2.0, zc - 0.5, zc + 0.5), BASIN_FLOOR, BASIN_FLOOR + 0.01, M["line"], tile=1.0)
    s.add(L.furn(coll, f"SP_StartBlock_{lane + 1}", BLOCK_X, zc, -math.pi / 2, [
        (0, 0, 0.0, 0.5, 0.5, 0.45, M["steel"]), (0, -0.05, 0.45, 0.55, 0.65, 0.25, M["block"], 0.02)]))
    s.col(f"StartBlock_{lane + 1}", BLOCK_X, zc, 0.55, 0.65, 0.7)
    num = L.text_mesh(coll, f"SP_StartBlock_{lane + 1}_Text", str(lane + 1), BLOCK_X + 0.36, zc, 0.3, 0.22, 0.01, M["lane_no"])
    num.rotation_euler[2] = math.pi / 2
    s.add(num)

for st in EXIT_STEPS:
    x0, x1, z0, z1 = st["rect"]
    for k in range(4):
        t = (k + 1) / 5
        y = WADE_Y + (0.0 - WADE_Y) * t
        if st["rise"] == "+x":
            r = (x0 + (x1 - x0) * (k / 4), x1, z0, z1)
        else:
            r = (x0, x1 - (x1 - x0) * (k / 4), z0, z1)
        slab(f"SP_ExitStep_{st['name']}_{k}", r, y - 0.25, y, M["tread"], tile=1.0)

for bd in BOARDS:
    bx0, bx1 = bd["x"]
    y = bd["heightM"]
    tag = bd["id"]
    slab(f"SP_Dive_{tag}_Board", (bx0, bx1, *bd["board_z"]), y - 0.12, y, M["board"], tile=1.0)
    sx0, sx1 = bd.get("stair_x", bd["x"])
    z0, z1 = bd["stair_z"]
    steps = max(3, round(y / 0.25))
    for k in range(steps):
        ty = y * (k + 1) / steps
        zz = z1 - (z1 - z0) * (k + 1) / steps
        slab(f"SP_Dive_{tag}_Step_{k:02d}", (sx0, sx1, zz, zz + (z1 - z0) / steps), ty - 0.08, ty, M["tread"], tile=1.0)
    for side, xs in (("W", (sx0 - 0.08, sx0)), ("E", (sx1, sx1 + 0.08))):
        solid(f"Dive_{tag}_Stringer{side}", (xs[0], xs[1], z0, z1), 0.0, y + 1.0, M["steel"])
    if bd["heightM"] >= 3.0:
        deck_part = (bx0, bx1, bd["board_z"][0], POOL_Z[1] - 0.0) if bd["board_z"][0] > POOL_Z[1] else (bx0, bx1, POOL_Z[1], bd["board_z"][1])
        solid(f"Dive_{tag}_Tower", deck_part, 0.0, y - 0.12, M["concrete"])
        for side, xs in (("W", (bx0 - 0.05, bx0)), ("E", (bx1, bx1 + 0.05))):
            slab(f"SP_Dive_{tag}_Rail{side}", (xs[0], xs[1], bd["board_z"][1] - 1.6, bd["board_z"][1]), y, y + 1.0, M["steel"], tile=1.0)
    else:
        slab(f"SP_Dive_{tag}_Stand", (bx0 + 0.1, bx1 - 0.1, POOL_Z[1] + 0.2, bd["board_z"][1]), 0.0, y - 0.12, M["steel"], tile=1.0)

stand_rects = []
for k in range(1, STAND_ROWS + 1):
    z1 = STAND_FRONT_Z - STAND_DEPTH * (k - 1)
    z0 = STAND_FRONT_Z - STAND_DEPTH * k if k < STAND_ROWS else IN_Z0
    y = STAND_RISE * k
    r = (STAND_X[0], STAND_X[1], z0, z1)
    slab(f"SP_Stand_Row{k}_Step", r, 0.0, y, M["concrete"], tile=1.0)
    stand_rects.append((r, y))
    for n in range(int((STAND_X[1] - STAND_X[0]) / 0.6)):
        cx = STAND_X[0] + 0.3 + n * 0.6
        if n % 2 == 0:
            s.add(L.box(coll, f"SP_Stand_Row{k}_Seat{n:02d}", cx, z1 - 0.3, y, 0.45, 0.4, 0.06, M["seat"]))
for side, xs in (("W", (STAND_X[0] - 0.15, STAND_X[0])), ("E", (STAND_X[1], STAND_X[1] + 0.15))):
    solid(f"Stand_End{side}", (xs[0], xs[1], IN_Z0, STAND_FRONT_Z - 0.0), 0.0, STAND_RISE * STAND_ROWS + 1.0, M["wall"])
stand_back = (STAND_X[0], STAND_X[1], IN_Z0, STAND_FRONT_Z)

def wall_x(name, z, x0, x1, gaps=(), glazing=None):
    pieces = rect_minus((x0, x1, z - T / 2, z + T / 2), [(g[0], g[1], z - 1, z + 1) for g in gaps])
    for k, p in enumerate(pieces):
        if glazing:
            slab(f"SP_{name}_{k}_Low", p, 0.0, glazing[0], M["wall"])
            slab(f"SP_{name}_{k}_Glass", (p[0], p[1], z - 0.05, z + 0.05), glazing[0], glazing[1], M["glass"], tile=4.0)
            slab(f"SP_{name}_{k}_High", p, glazing[1], H, M["wall"])
            for m in range(int((p[1] - p[0]) / 3.0) + 1):
                fx = min(p[0] + m * 3.0, p[1] - 0.1)
                slab(f"SP_{name}_{k}_Mullion{m:02d}", (fx, fx + 0.1, z - 0.08, z + 0.08), glazing[0], glazing[1], M["frame"], tile=1.0)
        else:
            slab(f"SP_{name}_{k}", p, 0.0, H, M["wall"])
        slab(f"SP_{name}_{k}_Plinth", (p[0], p[1], z - T / 2 - 0.03, z + T / 2 + 0.03), 0.0, 0.4, M["plinth"])
        s.col(f"{name}_{k}", (p[0] + p[1]) / 2, z, p[1] - p[0], T, H)
    for g in gaps:
        slab(f"SP_{name}_Lintel_{g[0]:.0f}", (g[0], g[1], z - T / 2, z + T / 2), DOOR_H, H, M["wall"])


def wall_z(name, x, z0, z1, gaps=(), height=H, glazing=None):
    pieces = rect_minus((x - T / 2, x + T / 2, z0, z1), [(x - 1, x + 1, g[0], g[1]) for g in gaps])
    for k, p in enumerate(pieces):
        if glazing:
            slab(f"SP_{name}_{k}_Low", p, 0.0, glazing[0], M["wall"])
            slab(f"SP_{name}_{k}_Glass", (x - 0.05, x + 0.05, p[2], p[3]), glazing[0], glazing[1], M["glass"], tile=4.0)
            slab(f"SP_{name}_{k}_High", p, glazing[1], height, M["wall"])
        else:
            slab(f"SP_{name}_{k}", p, 0.0, height, M["wall"])
        s.col(f"{name}_{k}", x, (p[2] + p[3]) / 2, T, p[3] - p[2], height)
    for g in gaps:
        slab(f"SP_{name}_Lintel_{g[0]:.0f}", (x - T / 2, x + T / 2, g[0], g[1]), DOOR_H, height, M["wall"])


wall_x("Wall_Stands", HALL[2] + T / 2, HALL[0], HALL[1])
wall_x("Wall_Dive", HALL[3] - T / 2, HALL[0], HALL[1], glazing=(2.4, 8.0))
wall_z("Wall_West", HALL[0] + T / 2, HALL[2] + T, HALL[3] - T, glazing=(3.0, 8.0))
wall_z("Wall_Entrance", HALL[1] - T / 2, HALL[2] + T, HALL[3] - T, gaps=[DOOR_Z])
wall_z("Wall_Lobby", LOBBY_WALL_X - T / 2, HALL[2] + T, HALL[3] - T, gaps=[DOOR_Z])
slab("SP_Roof", (HALL[0] - 0.3, HALL[1] + 0.3, HALL[2] - 0.3, HALL[3] + 0.3), H, H + 0.35, M["roof"], tile=4.0)
slab("SP_Ceiling", (IN_X0, IN_X1, IN_Z0, IN_Z1), H - 0.02, H, M["ceiling"], tile=4.0)
for i in range(6):
    for j in range(3):
        lx = IN_X0 + 4.0 + i * 7.5
        lz = IN_Z0 + 6.0 + j * 9.0
        slab(f"SP_Light_{i}_{j}", (lx - 1.2, lx + 1.2, lz - 0.3, lz + 0.3), H - 0.1, H - 0.02, M["lamp"], tile=1.0)

slab("SP_Clock_Board", (START_X + 0.6, START_X + 0.7, POOL_Z[0] + 3.0, POOL_Z[1] - 3.0), 4.0, 5.6, M["frame"], tile=1.0)
slab("SP_Clock_Face", (START_X + 0.55, START_X + 0.6, POOL_Z[0] + 3.3, POOL_Z[1] - 3.3), 4.15, 5.45, M["board_led"], tile=1.0)
s.col("Clock_Post", START_X + 0.65, (POOL_Z[0] + POOL_Z[1]) / 2, 0.2, 0.2, 4.0)
slab("SP_Clock_Post", (START_X + 0.55, START_X + 0.75, -212.1, -211.9), 0.0, 4.0, M["steel"], tile=1.0)

for k, z in enumerate((-226.5, -224.0, -201.0, -199.6)):
    s.add(L.furn(coll, f"SP_Lobby_Bench_{k}", -488.0, z, 0.0, [
        (-1.1, 0, 0.0, 0.08, 0.4, 0.42, M["steel"]), (1.1, 0, 0.0, 0.08, 0.4, 0.42, M["steel"]), (0, 0, 0.42, 2.4, 0.42, 0.06, M["wood"], 0.01)]))
    s.col(f"Lobby_Bench_{k}", -488.0, z, 2.5, 0.5, 0.5)
for k in range(10):
    z0 = IN_Z0 + 0.1 + k * 0.62 if k < 5 else IN_Z1 - 0.1 - (k - 4) * 0.62
    slab(f"SP_Lobby_Locker_{k:02d}", (IN_X1 - 0.55, IN_X1 - 0.05, z0, z0 + 0.6), 0.0, 1.9, M["locker"], tile=1.0)
s.col("Lobby_LockersStands", IN_X1 - 0.3, IN_Z0 + 0.1 + 5 * 0.31, 0.5, 5 * 0.62, 1.9)
s.col("Lobby_LockersDive", IN_X1 - 0.3, IN_Z1 - 0.1 - 5 * 0.31 - 0.62, 0.5, 5 * 0.62, 1.9)

sign_z = (DOOR_Z[0] + DOOR_Z[1]) / 2
slab("SP_Sign_Board", (HALL[1], HALL[1] + 0.08, sign_z - 3.0, sign_z + 3.0), 3.2, 4.3, M["sign"], tile=1.0)
sign = L.text_mesh(coll, "SP_Sign_Text", "COVE POOL", HALL[1] + 0.1, sign_z, 3.45, 0.6, 0.02, M["sign_text"])
sign.rotation_euler[2] = math.pi / 2
s.add(sign)
slab("SP_Entrance_Path", stub_link, SP.Y["paving"], SP.Y["paving"] + 0.01, M["deck"], tile=1.0)

water_set = [PIT[:4], BASIN[:4]]
blocked = water_set + [stand_back]
deck_rects = rect_minus(FP, blocked)
levels = [
    {"id": "L0", "y": 0.0, "height": H, "rects": [as_rect(r) for r in deck_rects]},
    {"id": "Water", "y": WADE_Y, "height": H - WADE_Y, "rects": [as_rect(r) for r in water_set]},
]
for k, (r, y) in enumerate(stand_rects, start=1):
    levels.append({"id": f"Stand{k}", "y": round(y, 3), "height": round(H - y, 3), "rects": [as_rect(r)]})
for bd in BOARDS:
    levels.append({"id": bd["id"], "y": bd["heightM"], "height": round(H - bd["heightM"], 3), "rects": [as_rect((bd["x"][0], bd["x"][1], *bd["board_z"]))]})
stairs = []
for st in EXIT_STEPS:
    stairs.append({"name": f"Stair_Exit{st['name']}", **as_rect(st["rect"]), "y0": WADE_Y, "y1": 0.0, "rise": st["rise"]})
for bd in BOARDS:
    sx = bd.get("stair_x", bd["x"])
    stairs.append({"name": f"Stair_{bd['id']}", **as_rect((sx[0], sx[1], *bd["stair_z"])), "y0": 0.0, "y1": bd["heightM"], "rise": "-z"})

for c in s.cols:
    assert FP[0] - 1e-6 <= c["cx"] - c["hx"] and c["cx"] + c["hx"] <= FP[1] + 1e-6, c
    assert FP[2] - 1e-6 <= c["cz"] - c["hz"] and c["cz"] + c["hz"] <= FP[3] + 1e-6, c

lanes = []
for lane in range(LANES):
    zc = round(POOL_Z[1] - (lane + 0.5) * LANE_W, 3)
    lanes.append({"lane": lane + 1, "z": zc, "block": [round(START_X + 0.9, 3), 0.0, zc]})

L.export_glb(os.path.join(OUT, f"{KEY}.glb"), s.objs, use_active_scene=True)
L.write_json(os.path.join(OUT, f"{KEY}.layout.json"), {
    "version": 1,
    "key": KEY,
    "bounds": as_rect(FP),
    "groundHole": as_rect(HOLE),
    "groundCover": [as_rect(r) for r in ground_cover],
    "levels": levels,
    "stairs": stairs,
    "pool": {
        "lengthM": round(BASIN[1] - BASIN[0], 3),
        "startX": START_X,
        "turnX": TURN_X,
        "lanes": lanes,
        "water": [as_rect(r) for r in water_set],
        "waterY": WATER_Y,
        "wadeY": WADE_Y,
        "depthsM": {"basin": -BASIN_FLOOR, "pit": -PIT_FLOOR},
        "exits": [as_rect(st["rect"]) for st in EXIT_STEPS],
        "coach": [COACH[0], 0.0, COACH[1]],
    },
    "diving": {
        "pit": as_rect(PIT[:4]),
        "boards": [{"id": bd["id"], "heightM": bd["heightM"], "kind": bd["kind"], "position": [round((bd["x"][0] + bd["x"][1]) / 2, 3), bd["heightM"], bd["board_z"][0]],
                    "edgeZone": as_rect((bd["x"][0], bd["x"][1], bd["board_z"][0], bd["board_z"][0] + 1.2))} for bd in BOARDS],
    },
    "collision": s.cols,
})
print(f"{KEY}: {len(s.objs)} objects, {s.tris()} tris, {len(s.cols)} COL, {len(levels)} levels, {len(stairs)} stairs")
if os.environ.get("SPORTS_POOL_PREVIEW", "1") == "1":
    L.snapshot(sc, os.path.join(OUT, "preview.png"), (-490.0, 20.0, -240.0), (-516.0, -1.0, -210.0), lens=22, res=(1280, 800),
                hide_prefixes=("SP_Roof", "SP_Ceiling", "SP_Wall_Stands", "SP_Light", "SP_Wall_Lobby", "SP_Wall_Entrance"))
