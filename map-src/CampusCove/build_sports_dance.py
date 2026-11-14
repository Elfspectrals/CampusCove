import importlib
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

KEY = "sports_dance"
NAME = "Cove Dance Studio"
OUT = os.path.join(L.OUT_ROOT, "work", KEY)

X0, X1, Z0, Z1, T, H = -5.8, 5.8, -14.2, 5.0, 0.2, 4.0
PARTITION_Z = 0.2
PARTITION_DOOR = (-1.3, 1.3, 0.0, 2.6)
WIN_Y = (0.5, 2.6)
CLERESTORY_Y = (2.5, 3.6)
FRONT_WINDOWS = ((-5.2, -2.2), (2.2, 5.2))
SIDE_WINDOWS = ((-12.8, -10.0), (-8.4, -5.6), (-4.0, -1.2))
MIRROR_Z = Z0 + 0.06
COACH_Z = -12.6
SPOT_Z = -8.6
SPOT_XS = (-3.0, -1.0, 1.0, 3.0)
PLAY_AREA = (-5.0, 5.0, -13.4, -4.4)
LANE_COLOURS = ("#ff5fa2", "#38c6f4", "#ffd23f", "#5fd068")

sc = L.new_build_scene("WORK_" + KEY + "_interior")
coll = bpy.data.collections.new("Interior")
sc.collection.children.link(coll)
cols = L.Collisions(coll)
M = L.std_mats(wall="#f1ede6", floor=("#e2c597", "planks", "#c9a874"))
M["lobby_floor"] = L.make_mat("IN_DanceLobbyFloor", "#c9c6bf", 0.8, "tiles", 0.03, accent="#b9b6ae")
M["plum"] = L.make_mat("IN_DancePlum", "#7b3f72", 0.7, "noise", 0.03)
M["mirror"] = L.make_mat("IN_DanceMirror", "#dde8ee", 0.04, "noise", 0.0)
M["mirror_frame"] = L.make_mat("IN_DanceMirrorFrame", "#3a3f45", 0.4, "noise", 0.01)
M["locker"] = L.make_mat("IN_DanceLocker", "#4f7fa8", 0.6, "stripes", 0.02, accent="#46739a")
M["curtain"] = L.make_mat("IN_DanceCurtain", "#a04e8c", 0.95, "stripes", 0.05, accent="#8d437b")
M["sign"] = L.make_mat("IN_DanceSignText", "#ffffff", 0.4, "noise", 0.0, emit="#ffffff", emit_strength=0.8)
M["seat"] = L.make_mat("IN_DanceSeat", "#7b3f72", 0.8, "noise", 0.03)
for i, hex_colour in enumerate(LANE_COLOURS):
    M[f"lane{i}"] = L.make_mat(f"IN_DanceSpot{i}", hex_colour, 0.6, "noise", 0.0, emit=hex_colour, emit_strength=0.25)

objs = []
objs.append(L.box(coll, "House_Floor_Main", 0, (Z0 + PARTITION_Z) / 2, -0.1, X1 - X0, PARTITION_Z - Z0, 0.1, M["floor"], tile=1.5))
objs.append(L.box(coll, "House_Floor_Lobby", 0, (PARTITION_Z + Z1) / 2, -0.1, X1 - X0, Z1 - PARTITION_Z, 0.1, M["lobby_floor"], tile=2.0))
objs.append(L.box(coll, "Ceiling", 0, (Z0 + Z1 + 0.2) / 2, H, X1 - X0 + 0.4, Z1 - Z0 + 0.4, 0.1, M["ceil"], tile=2.0))
objs += L.wall(coll, "Walls_Front", "x", Z1 + 0.1, T, X0 - T, X1 + T, H, M["wall"],
               openings=[(a, b, *WIN_Y) for a, b in FRONT_WINDOWS] + [L.DOOR_OPENING], cols=cols, glass=M["glass"], col_tag="Wall_Front")
objs += L.wall(coll, "Walls_Back", "x", Z0 - 0.1, T, X0 - T, X1 + T, H, M["wall"], cols=cols, col_tag="Wall_Back")
objs += L.wall(coll, "Walls_W", "z", X0 - 0.1, T, Z0, Z1 + 0.2, H, M["wall"], openings=[(a, b, *CLERESTORY_Y) for a, b in SIDE_WINDOWS],
               cols=cols, glass=M["glass"], col_tag="Wall_W")
objs += L.wall(coll, "Walls_E", "z", X1 + 0.1, T, Z0, Z1 + 0.2, H, M["wall"], openings=[(a, b, *CLERESTORY_Y) for a, b in SIDE_WINDOWS],
               cols=cols, glass=M["glass"], col_tag="Wall_E")
objs += L.wall(coll, "Walls_Partition", "x", PARTITION_Z, T, X0, X1, H, M["wall"], openings=[PARTITION_DOOR], cols=cols, col_tag="Wall_Partition")
objs.append(L.box(coll, "Door_Entrance", 0, Z1 + 0.1, 0.01, 1.18, 0.06, 2.18, M["glass"], bevel=0.02))
objs.append(L.box(coll, "Door_Entrance_Handle", 0.42, Z1 - 0.03, 0.98, 0.04, 0.12, 0.04, M["metal"]))
objs.append(L.box(coll, "Entry_Doormat", 0, Z1 - 0.5, 0.0, 1.2, 0.7, 0.012, M["mat"]))
objs.append(L.box(coll, "Wall_PartitionHeader", 0, PARTITION_Z + 0.11, 2.6, 2.8, 0.02, 0.3, M["plum"]))
objs.append(L.text_mesh(coll, "Wall_StudioSign", "STUDIO", 0, PARTITION_Z + 0.13, 2.66, 0.18, 0.01, M["sign"]))

objs.append(L.box(coll, "Wall_Mirror", 0, MIRROR_Z + 0.01, 0.15, X1 - X0 - 0.8, 0.02, 2.6, M["mirror"]))
objs.append(L.box(coll, "Wall_MirrorFrameTop", 0, MIRROR_Z + 0.02, 2.75, X1 - X0 - 0.7, 0.04, 0.06, M["mirror_frame"]))
objs.append(L.box(coll, "Wall_MirrorFrameBottom", 0, MIRROR_Z + 0.02, 0.09, X1 - X0 - 0.7, 0.04, 0.06, M["mirror_frame"]))
objs.append(L.box(coll, "Wall_StudioStripe", 0, MIRROR_Z + 0.01, 3.1, X1 - X0 - 0.2, 0.02, 0.3, M["plum"]))
objs.append(L.text_mesh(coll, "Wall_StudioName", "COVE DANCE STUDIO", 0, MIRROR_Z + 0.04, 3.16, 0.2, 0.01, M["sign"]))


for i, x in enumerate(SPOT_XS):
    objs.append(L.box(coll, f"DanceSpot_{i}", x, SPOT_Z, 0.0, 0.9, 0.9, 0.006, M[f"lane{i}"]))

for k in range(5):
    x = X0 + 0.35
    z = 3.9 - k * 0.62
    objs.append(L.furn(coll, f"Locker_{k:02d}", x, z, -math.pi / 2, [
        (0, 0, 0.0, 0.58, 0.5, 1.9, M["locker"], 0.01), (0.18, -0.26, 1.0, 0.04, 0.02, 0.2, M["metal"]),
        (0, -0.26, 1.6, 0.4, 0.02, 0.02, M["metal"]), (0, -0.26, 1.66, 0.4, 0.02, 0.02, M["metal"])]))
cols.add("Lockers", X0 + 0.35, 3.9 - 2 * 0.62, 0.0, 0.55, 5 * 0.62, 1.9)
objs.append(L.furn(coll, "LobbyBench_01", X0 + 1.2, 2.66, -math.pi / 2, [
    (-1.1, 0, 0.0, 0.08, 0.4, 0.42, M["metal"]), (1.1, 0, 0.0, 0.08, 0.4, 0.42, M["metal"]),
    (0, 0, 0.42, 2.4, 0.42, 0.06, M["seat"], 0.01)]))
cols.add("LobbyBench_01", X0 + 1.2, 2.66, 0.0, 0.45, 2.4, 0.5)

for k, z in enumerate((3.6, 1.6)):
    bx = X1 - 0.8
    objs.append(L.furn(coll, f"ChangingBooth_{k:02d}", bx, z, 0.0, [
        (0, -0.85, 0.0, 1.4, 0.06, 2.2, M["wall"]), (0.72, 0, 0.0, 0.06, 1.7, 2.2, M["wall"]),
        (-0.72, 0.0, 2.15, 0.04, 1.7, 0.04, M["steel"]), (-0.72, 0.0, 0.25, 0.03, 1.5, 1.9, M["curtain"])]))
    objs.append(L.box(coll, f"ChangingBooth_{k:02d}_Hook", bx + 0.6, z, 1.6, 0.04, 0.3, 0.04, M["steel"]))
cols.add("ChangingBooths", X1 - 0.8, 2.6, 0.0, 1.6, 3.8, 2.2)

objs.append(L.plant(coll, M, "Plant_01", X1 - 0.45, PARTITION_Z + 0.6))
cols.add("Plant_01", X1 - 0.45, PARTITION_Z + 0.6, 0.0, 0.5, 0.5, 1.3)
objs.append(L.plant(coll, M, "Plant_02", X0 + 0.45, PARTITION_Z + 0.6))
cols.add("Plant_02", X0 + 0.45, PARTITION_Z + 0.6, 0.0, 0.5, 0.5, 1.3)

light_pts = [(-2.6, 3.0), (2.6, 3.0)] + [(x, z) for z in (-1.6, -5.4, -9.2, -12.6) for x in (-3.4, 0.0, 3.4)]
for i, (lx, lz) in enumerate(light_pts):
    objs.append(L.box(coll, f"Light_{i:02d}", lx, lz, H - 0.05, 1.4, 0.4, 0.05, M["lamp"]))
for nm, gx, gz, sx, sz in [("Sky_Back", 0, Z0 - 6, 44, 0.05), ("Sky_Front", 0, Z1 + 6, 44, 0.05),
                          ("Sky_West", X0 - 6, (Z0 + Z1) / 2, 0.05, 44), ("Sky_East", X1 + 6, (Z0 + Z1) / 2, 0.05, 44)]:
    objs.append(L.box(coll, nm, gx, gz, -3.0, sx, sz, 10.0, M["sky"]))

bad = L.check_grounded(objs, allow=L.ALLOW_INTERIOR + ("Ceiling", "ChangingBooth_"))
print("INTERIOR grounded violations:", bad)
assert not bad, bad
L.export_glb(os.path.join(OUT, "interior.glb"), objs)
L.export_glb(os.path.join(OUT, "interior.colsrc.glb"), objs + cols.items)
L.write_json(os.path.join(OUT, "interior.layout.json"), {
    "version": 1, "key": KEY, "name": NAME, "spawn": [0.0, 1.6, 3.7],
    "exit": {"position": [0.0, 4.75], "radius": 1.4},
    "stations": [],
    "npcs": {"danceCoach": [0.0, 0.0, COACH_Z]},
    "counters": {},
    "seats": [],
    "dance": {"spots": [[x, 0.0, SPOT_Z] for x in SPOT_XS], "playArea": list(PLAY_AREA)},
})


def triangles(items):
    return sum(len(p.vertices) - 2 for o in items if o.type == "MESH" for p in o.data.polygons)


print("interior:", len(objs), "objects,", len(cols.items), "collision boxes,", triangles(objs), "triangles")
L.snapshot(sc, os.path.join(OUT, "interior_preview.png"), (0, 2.8, 3.6), (0, 1.2, -14), lens=20, res=(960, 640), hide_prefixes=("Ceiling", "Sky_"))

exec(open(os.path.join(HERE, "build_sports_dance_ext.py"), encoding="utf-8").read())
