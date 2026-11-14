import importlib
import json
import math
import os
import sys

if "__file__" not in globals():
    raise RuntimeError('Run with exec(open(p).read(), {"__file__": p}) so the script can find lib_common.py')
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lib_common as L
importlib.reload(L)
import lib_sports as S
importlib.reload(S)
import bpy

KEY = "sports_ice_rink"
NAME = "Cove Ice Rink"
OUT = os.path.join(L.OUT_ROOT, "work", KEY)
RULES = json.load(open(os.path.join(L.FRONT_ASSETS, "sports", "rules", "skating.json"), encoding="utf-8"))

DOOR_Z = (S.DOOR_STUBS[KEY][2] + S.DOOR_STUBS[KEY][3]) / 2
FRONT_X = S.FOOTPRINTS[KEY][1] - 3.0
INTERIOR_TO_WORLD_X = FRONT_X - (L.SHELL_THICKNESS + L.SHELL_GAP + L.INTERIOR_FRONT_OUTER_Z)


def iz_of(world_x):
    return world_x - INTERIOR_TO_WORLD_X


def ix_of(world_z):
    return DOOR_Z - world_z


X0, X1, Z1, T, H = -21.8, 21.8, 5.0, 0.2, 9.0
Z0 = Z1 - 74.6
LOBBY_Z = -5.0
WIN_Y = (0.5, 3.0)
HIGH_WIN_Y = (6.0, 8.2)
FRONT_WINDOWS = ((-16.0, -6.0), (6.0, 16.0))
SIDE_WINDOWS = tuple((z - 3.0, z + 3.0) for z in (-12.0, -24.0, -36.0, -48.0, -60.0))

rb = RULES["rink"]["bounds"]
RINK_X0, RINK_X1 = sorted((ix_of(rb["minZ"]), ix_of(rb["maxZ"])))
RINK_Z0, RINK_Z1 = sorted((iz_of(rb["minX"]), iz_of(rb["maxX"])))
CORNER = RULES["rink"]["cornerRadius"]
BOARD_H = RULES["rink"]["boards"]["height"]
BOARD_T = 0.12
BOARD_COL_H = 1.8
GATES = [(ix_of(g["z"]), g["width"]) for g in RULES["rink"]["boards"]["gates"]]
WALKWAY = 2.0
STAND_X = RINK_X1 + WALKWAY
STAND_ROWS = 4
ROW_DEPTH = (X1 - STAND_X) / STAND_ROWS
ROW_RISE = 0.45
AISLE_W = 2.0
assert abs(RINK_X1 - RINK_X0 - RULES["rink"]["sizeM"][1]) < 1e-6 and abs(RINK_Z1 - RINK_Z0 - RULES["rink"]["sizeM"][0]) < 1e-6
assert RINK_Z1 <= LOBBY_Z - WALKWAY + 0.01 and RINK_Z0 >= Z0 + WALKWAY, ("rink does not fit the hall", RINK_Z0, RINK_Z1)

sc = L.new_build_scene("WORK_" + KEY + "_interior")
coll = bpy.data.collections.new("Interior")
sc.collection.children.link(coll)
cols = L.Collisions(coll)
M = L.std_mats(wall="#e9eef2", floor=("#3d4650", "noise", "#343c45"))
M["ice"] = L.make_mat("IN_RinkIce", "#e8f4fb", 0.08, "noise", 0.015)
M["board"] = L.make_mat("IN_RinkBoard", "#f6f7f8", 0.5, "noise", 0.01)
M["kick"] = L.make_mat("IN_RinkKickPlate", "#f2c230", 0.6, "noise", 0.02)
M["rail"] = L.make_mat("IN_RinkRail", "#2f6fb0", 0.5, "noise", 0.02)
M["red"] = L.make_mat("IN_RinkLineRed", "#c8323c", 0.5, "noise", 0.0)
M["blue"] = L.make_mat("IN_RinkLineBlue", "#2f6fb0", 0.5, "noise", 0.0)
M["crease"] = L.make_mat("IN_RinkCrease", "#8fc3ea", 0.4, "noise", 0.0)
M["cone"] = L.make_mat("IN_RinkCone", "#f07a2a", 0.6, "noise", 0.02)
M["start"] = L.make_mat("IN_RinkStartLine", "#16181c", 0.5, "stripes", 0.0, accent="#f6f7f8")
M["seat"] = L.make_mat("IN_StandSeat", "#2f6fb0", 0.6, "noise", 0.02)
M["tier"] = L.make_mat("IN_StandConcrete", "#b8bec4", 0.9, "noise", 0.03)
M["bench"] = L.make_mat("IN_SkateBench", "#9c6b43", 0.7, "planks", 0.04, accent="#7e5433")
M["locker"] = L.make_mat("IN_Locker", "#5d8fb8", 0.5, "stripes", 0.02, accent="#4f7ea6")
M["rubber"] = L.make_mat("IN_RubberMat", "#2b3138", 0.95, "stripes", 0.03, accent="#252a30")
M["sign"] = L.make_mat("IN_RinkSignText", "#ffffff", 0.4, "noise", 0.0, emit="#ffffff", emit_strength=0.8)
M["board_dark"] = L.make_mat("IN_ScoreBoard", "#1f2a33", 0.6, "noise", 0.01)
M["screen"] = L.make_mat("IN_ScoreScreen", "#0f2a3d", 0.4, "stripes", 0.0, accent="#3fb6f0", emit="#3fb6f0", emit_strength=0.7)

objs = []
objs.append(L.box(coll, "House_Floor_Main", 0, (Z0 + Z1) / 2, -0.1, X1 - X0, Z1 - Z0, 0.1, M["floor"], tile=3.0))
objs.append(L.box(coll, "Ceiling", 0, (Z0 + Z1 + 0.2) / 2, H, X1 - X0 + 0.4, Z1 - Z0 + 0.4, 0.1, M["ceil"], tile=4.0))
objs += L.wall(coll, "Walls_Front", "x", Z1 + 0.1, T, X0 - T, X1 + T, H, M["wall"],
               openings=[(a, b, *WIN_Y) for a, b in FRONT_WINDOWS] + [L.DOOR_OPENING], cols=cols, glass=M["glass"], col_tag="Wall_Front")
objs += L.wall(coll, "Walls_Back", "x", Z0 - 0.1, T, X0 - T, X1 + T, H, M["wall"], cols=cols, col_tag="Wall_Back")
objs += L.wall(coll, "Walls_W", "z", X0 - 0.1, T, Z0, Z1 + 0.2, H, M["wall"], openings=[(a, b, *HIGH_WIN_Y) for a, b in SIDE_WINDOWS],
               cols=cols, glass=M["glass"], col_tag="Wall_W")
objs += L.wall(coll, "Walls_E", "z", X1 + 0.1, T, Z0, Z1 + 0.2, H, M["wall"], openings=[(a, b, *HIGH_WIN_Y) for a, b in SIDE_WINDOWS],
               cols=cols, glass=M["glass"], col_tag="Wall_E")
objs.append(L.box(coll, "Door_Entrance", 0, Z1 + 0.1, 0.01, 1.18, 0.06, 2.18, M["glass"], bevel=0.02))
objs.append(L.box(coll, "Door_Entrance_Handle", 0.42, Z1 - 0.03, 0.98, 0.04, 0.12, 0.04, M["metal"]))
objs.append(L.box(coll, "Entry_Doormat", 0, Z1 - 0.6, 0.0, 2.0, 1.0, 0.012, M["mat"]))
for side, x in (("W", X0 + 0.04), ("E", X1 - 0.04)):
    objs.append(L.box(coll, f"Door_FireExit{side}", x, 0.0, 0.0, 0.06, 1.8, 2.2, M["door"]))
    objs.append(L.box(coll, f"Wall_FireExitSign{side}", x, 0.0, 2.35, 0.05, 0.6, 0.22, M["sign"]))

objs.append(L.box(coll, "House_Floor_Ice", (RINK_X0 + RINK_X1) / 2, (RINK_Z0 + RINK_Z1) / 2, 0.0, RINK_X1 - RINK_X0, RINK_Z1 - RINK_Z0, 0.012, M["ice"], tile=6.0))


def board_run(name, ax, az, bx, bz, gaps=()):
    length = math.hypot(bx - ax, bz - az)
    ux, uz = (bx - ax) / length, (bz - az) / length
    yaw = math.atan2(ux, uz)
    cuts = sorted((c - w / 2, c + w / 2) for c, w in gaps)
    pieces, cur = [], 0.0
    for a, b in cuts:
        pieces.append((cur, a))
        cur = b
    pieces.append((cur, length))
    for k, (s0, s1) in enumerate(pieces):
        if s1 - s0 < 0.05:
            continue
        mid = (s0 + s1) / 2
        cx, cz = ax + ux * mid, az + uz * mid
        seg = s1 - s0
        objs.append(L.furn(coll, f"Rink_Board_{name}{k}", cx, cz, yaw, [
            (0, 0, 0.0, BOARD_T, seg, BOARD_H, M["board"]),
            (0, 0, 0.0, BOARD_T + 0.02, seg, 0.25, M["kick"]),
            (0, 0, BOARD_H, BOARD_T + 0.08, seg, 0.06, M["rail"]),
        ]))
        cols.add(f"RinkBoard_{name}{k}", cx, cz, 0.0, BOARD_T, seg, BOARD_COL_H, rot=yaw)


c = CORNER
board_run("W", RINK_X0, RINK_Z0 + c, RINK_X0, RINK_Z1 - c)
board_run("E", RINK_X1, RINK_Z0 + c, RINK_X1, RINK_Z1 - c)
board_run("Front", RINK_X0 + c, RINK_Z1, RINK_X1 - c, RINK_Z1, gaps=[(gx - (RINK_X0 + c), w) for gx, w in GATES])
board_run("Back", RINK_X0 + c, RINK_Z0, RINK_X1 - c, RINK_Z0)
for name, (ax, az, bx, bz) in {"NW": (RINK_X0, RINK_Z1 - c, RINK_X0 + c, RINK_Z1), "NE": (RINK_X1 - c, RINK_Z1, RINK_X1, RINK_Z1 - c),
                               "SW": (RINK_X0, RINK_Z0 + c, RINK_X0 + c, RINK_Z0), "SE": (RINK_X1 - c, RINK_Z0, RINK_X1, RINK_Z0 + c)}.items():
    board_run(name, ax, az, bx, bz)
for k, (z, label) in enumerate(((RINK_Z1, "Front"), (RINK_Z0, "Back"))):
    objs.append(L.box(coll, f"Glass_RinkEnd{label}", (RINK_X0 + RINK_X1) / 2, z, BOARD_H + 0.06, RINK_X1 - RINK_X0 - 2 * c, 0.03, 1.4, M["glass"]))

LINE_Y, LINE_H = 0.012, 0.002
mid_z = (RINK_Z0 + RINK_Z1) / 2
width = RINK_X1 - RINK_X0 - 0.4
objs.append(L.box(coll, "Ice_LineCentre", 0, mid_z, LINE_Y, width, 0.3, LINE_H, M["red"]))
for k, dz in enumerate((-7.5, 7.5)):
    objs.append(L.box(coll, f"Ice_LineBlue{k}", 0, mid_z + dz, LINE_Y, width, 0.3, LINE_H, M["blue"]))
for k, z in enumerate((RINK_Z0 + 4.0, RINK_Z1 - 4.0)):
    objs.append(L.box(coll, f"Ice_LineGoal{k}", 0, z, LINE_Y, width - 2 * c, 0.05, LINE_H, M["red"]))
    crease = L.cyl(coll, f"Ice_Crease{k}", 0, z + (1.0 if k == 0 else -1.0), LINE_Y, 1.8, LINE_H, M["crease"], seg=16)
    objs.append(crease)
    for j, fx in enumerate((-6.7, 6.7)):
        fz = z + (6.0 if k == 0 else -6.0)
        objs.append(L.cyl(coll, f"Ice_FaceoffDot{k}{j}", fx, fz, LINE_Y, 0.3, LINE_H, M["red"], seg=10))
        for s in range(16):
            a = 2 * math.pi * s / 16
            objs.append(L.box(coll, f"Ice_FaceoffRing{k}{j}_{s:02d}", fx + 4.5 * math.sin(a), fz + 4.5 * math.cos(a), LINE_Y, 0.05, 1.8, LINE_H, M["red"], rot=a + math.pi / 2))
for s in range(24):
    a = 2 * math.pi * s / 24
    objs.append(L.box(coll, f"Ice_CentreRing{s:02d}", 4.5 * math.sin(a), mid_z + 4.5 * math.cos(a), LINE_Y, 0.05, 1.2, LINE_H, M["blue"], rot=a + math.pi / 2))
objs.append(L.cyl(coll, "Ice_CentreDot", 0, mid_z, LINE_Y, 0.3, LINE_H, M["blue"], seg=10))

oval = RULES["raceOval"]
(ax_w, az_w), (bx_w, bz_w) = oval["a"], oval["b"]
spine = sorted([(ix_of(az_w), iz_of(ax_w)), (ix_of(bz_w), iz_of(bx_w))], key=lambda p: p[1])
(sx, sz0), (_, sz1) = spine
radius = oval["radius"]
perimeter = 2 * (sz1 - sz0) + 2 * math.pi * radius


def stadium_point(d):
    straight = sz1 - sz0
    if d < straight:
        return sx + radius, sz0 + d
    d -= straight
    if d < math.pi * radius:
        a = d / radius
        return sx + radius * math.cos(a), sz1 + radius * math.sin(a)
    d -= math.pi * radius
    if d < straight:
        return sx - radius, sz1 - d
    a = (d - straight) / radius
    return sx - radius * math.cos(a), sz0 - radius * math.sin(a)


for k in range(RULES["raceOval"]["cones"]):
    cx, cz = stadium_point(perimeter * k / RULES["raceOval"]["cones"])
    objs.append(L.furn(coll, f"Ice_ConeBase{k:02d}", cx, cz, 0.0, [(0, 0, LINE_Y, 0.34, 0.34, 0.03, M["cone"])]))
    objs.append(L.cone(coll, f"Ice_Cone{k:02d}", cx, cz, LINE_Y + 0.03, 0.13, 0.02, 0.42, M["cone"], seg=8))
start_iz = iz_of(oval["startLineX"])
lane_ix = sorted(ix_of(z) for z in (bz_w + radius, rb["maxZ"]))
objs.append(L.box(coll, "Ice_StartLine", (lane_ix[0] + lane_ix[1]) / 2, start_iz, LINE_Y + LINE_H, lane_ix[1] - lane_ix[0], 0.5, LINE_H, M["start"], tile=0.5))

for side, sign in (("W", -1), ("E", 1)):
    for r in range(STAND_ROWS):
        x_in = STAND_X + r * ROW_DEPTH
        width_r = X1 - x_in
        cx = sign * (x_in + width_r / 2)
        objs.append(L.box(coll, f"Stand_{side}_Tier{r}", cx, (RINK_Z0 + RINK_Z1) / 2, 0.0, width_r, RINK_Z1 - RINK_Z0, ROW_RISE * (r + 1), M["tier"], tile=2.0))
        seat_x = sign * (x_in + 0.35)
        half = (RINK_Z1 - RINK_Z0 - 0.4 - AISLE_W) / 2
        for k, sz in enumerate((RINK_Z0 + 0.2 + half / 2, RINK_Z1 - 0.2 - half / 2)):
            objs.append(L.box(coll, f"Stand_{side}_Seats{r}{k}", seat_x, sz, ROW_RISE * (r + 1), 0.45, half, 0.42, M["seat"], tile=0.5))

for k, bx in enumerate((-12.0, -7.0, 7.0, 12.0)):
    objs.append(L.furn(coll, f"SkateBench_{k:02d}", bx, LOBBY_Z + 1.4, 0.0, [
        (-1.1, 0, 0.0, 0.08, 0.42, 0.44, M["metal"]), (1.1, 0, 0.0, 0.08, 0.42, 0.44, M["metal"]),
        (0, 0, 0.44, 2.4, 0.45, 0.06, M["bench"], 0.01)]))
    cols.add(f"SkateBench_{k:02d}", bx, LOBBY_Z + 1.4, 0.0, 2.5, 0.5, 0.5)
objs.append(L.box(coll, "Entry_RubberRunner", 0, (LOBBY_Z + RINK_Z1) / 2, 0.0, 9.0, LOBBY_Z - RINK_Z1 + 3.2, 0.012, M["rubber"], tile=1.0))
for side, x in (("W", X0 + 0.3), ("E", X1 - 0.3)):
    for k in range(6):
        lz = Z1 - 2.0 - k * 0.9
        objs.append(L.furn(coll, f"Locker_{side}{k}", x, lz, math.pi / 2 if side == "W" else -math.pi / 2, [
            (0, 0, 0.0, 0.85, 0.5, 1.9, M["locker"], 0.01), (0.3, -0.26, 1.0, 0.05, 0.02, 0.2, M["steel"])]))
    cols.add(f"Lockers_{side}", x, Z1 - 2.0 - 2.25, 0.0, 0.6, 5.4, 1.9)

objs.append(L.box(coll, "Wall_SignBoard", 0, Z1 - 0.06, 3.6, 7.0, 0.06, 0.8, M["board_dark"]))
objs.append(L.text_mesh(coll, "Wall_SignText", "COVE ICE RINK", 0, Z1 - 0.1, 3.78, 0.42, 0.01, M["sign"], facing="-z"))
objs.append(L.furn(coll, "ScoreBoard", 0, mid_z, 0.0, [
    (0, 0, 6.0, 4.0, 4.0, 1.6, M["board_dark"]), (0, -2.01, 6.2, 3.6, 0.02, 1.2, M["screen"]), (0, 2.01, 6.2, 3.6, 0.02, 1.2, M["screen"]),
    (0, 0, 7.6, 0.08, 0.08, H - 7.6, M["metal"])]))

for i in range(5):
    for j, lz in enumerate((Z1 - 3.0, *[RINK_Z1 - 6.0 - 12.0 * k for k in range(5)])):
        objs.append(L.box(coll, f"Light_{i}{j}", -16.0 + 8.0 * i, lz, H - 0.05, 2.4, 0.6, 0.05, M["lamp"]))
for nm, gx, gz, sx_, sz_ in [("Sky_Back", 0, Z0 - 8, 80, 0.05), ("Sky_Front", 0, Z1 + 8, 80, 0.05),
                             ("Sky_West", X0 - 8, (Z0 + Z1) / 2, 0.05, 100), ("Sky_East", X1 + 8, (Z0 + Z1) / 2, 0.05, 100)]:
    objs.append(L.box(coll, nm, gx, gz, -3.0, sx_, sz_, 16.0, M["sky"]))

bad = L.check_grounded(objs, allow=L.ALLOW_INTERIOR + ("Ceiling", "ScoreBoard", "Glass_", "Ice_", "Stand_"))
print("INTERIOR grounded violations:", bad)
assert not bad, bad
L.export_glb(os.path.join(OUT, "interior.glb"), objs)
L.export_glb(os.path.join(OUT, "interior.colsrc.glb"), objs + cols.items)
coach = (GATES[0][0] + 3.0, RINK_Z1 + 1.6)
L.write_json(os.path.join(OUT, "interior.layout.json"), {
    "version": 1, "key": KEY, "name": NAME, "spawn": [0.0, 1.6, Z1 - 1.3],
    "exit": {"position": [0.0, Z1 - 0.25], "radius": 1.4},
    "stations": [],
    "npcs": {"rinkCoach": [round(coach[0], 3), 0.0, round(coach[1], 3)]},
    "seats": [],
    "levels": [{"id": "L0", "y": 0.0, "height": H, "rects": [{"minX": X0, "maxX": X1, "minZ": Z0, "maxZ": Z1}]}] + [
        {"id": f"Stand{side}{r}", "y": round(ROW_RISE * (r + 1), 3), "height": round(H - ROW_RISE * (r + 1), 3),
         "rects": [{"minX": round(min(sign * x0, sign * x1), 3), "maxX": round(max(sign * x0, sign * x1), 3), "minZ": round(RINK_Z0, 3), "maxZ": round(RINK_Z1, 3)}]}
        for side, sign in (("W", -1), ("E", 1)) for r in range(STAND_ROWS)
        for x0, x1 in [(STAND_X + r * ROW_DEPTH, STAND_X + (r + 1) * ROW_DEPTH)]],
    "stairs": [],
})


def triangles(items):
    return sum(len(p.vertices) - 2 for o in items if o.type == "MESH" for p in o.data.polygons)


print("interior:", len(objs), "objects,", len(cols.items), "collision boxes,", triangles(objs), "triangles")
L.snapshot(sc, os.path.join(OUT, "interior_preview.png"), (0, 7.5, Z1 - 1.5), (0, 0.5, RINK_Z0), lens=18, res=(960, 640), hide_prefixes=("Ceiling", "Sky_"))

exec(open(os.path.join(HERE, "build_sports_ice_rink_ext.py"), encoding="utf-8").read())
