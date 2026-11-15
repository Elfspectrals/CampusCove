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
import lib_boxing as B
importlib.reload(B)
import bpy

KEY = "sports_boxing"
NAME = "Cove Boxing Club"
OUT = os.path.join(L.OUT_ROOT, "work", KEY)

X0, X1, Z0, Z1, T, H = -8.6, 8.6, -17.8, 5.0, 0.2, 5.2
WIN_Y = (0.6, 2.6)
HIGH_WIN_Y = (3.0, 4.6)
FRONT_WINDOWS = ((-7.4, -3.4), (3.4, 7.4))
SIDE_WINDOWS = ((-15.6, -12.4), (-10.6, -7.4), (-5.6, -2.4), (-0.6, 2.6))
CHANGING_Z = -13.8
CHANGING_DOOR = (-7.2, -6.0)
RING = B.Ring(cx=-1.6, cz=-6.4)
BAG_X = 6.2
BAG_ZS = (-2.6, -6.4, -10.2)

sc = L.new_build_scene("WORK_" + KEY + "_interior")
coll = bpy.data.collections.new("Interior")
sc.collection.children.link(coll)
cols = L.Collisions(coll)
M = L.std_mats(wall="#e9e4da", floor=("#8c6a4a", "planks", "#74563b"))
M.update(B.ring_materials())
M["red"] = L.make_mat("IN_BoxingRed", "#b8322c", 0.7, "noise", 0.03)
M["mat_floor"] = L.make_mat("IN_BoxingTrainingMat", "#2f3438", 0.95, "noise", 0.03)
M["locker"] = L.make_mat("IN_BoxingLocker", "#4f6f8f", 0.5, "stripes", 0.02, accent="#46637f")
M["bench"] = L.make_mat("IN_BoxingBenchWood", "#a87a4f", 0.7, "planks", 0.04, accent="#8c6440")
M["board"] = L.make_mat("IN_BoxingBoard", "#1d2126", 0.6, "noise", 0.01)
M["sign"] = L.make_mat("IN_BoxingSignText", "#ffffff", 0.4, "noise", 0.0, emit="#ffffff", emit_strength=0.8)
M["brick"] = L.make_mat("IN_BoxingBrick", "#9a4f3a", 0.9, "tiles", 0.05, accent="#d8cfc0")

objs = []
objs.append(L.box(coll, "House_Floor_Main", 0, (Z0 + Z1) / 2, -0.1, X1 - X0, Z1 - Z0, 0.1, M["floor"], tile=2.0))
objs.append(L.box(coll, "Ceiling", 0, (Z0 + Z1 + 0.2) / 2, H, X1 - X0 + 0.4, Z1 - Z0 + 0.4, 0.1, M["ceil"], tile=2.0))
objs += L.wall(coll, "Walls_Front", "x", Z1 + 0.1, T, X0 - T, X1 + T, H, M["wall"],
               openings=[(a, b, *WIN_Y) for a, b in FRONT_WINDOWS] + [L.DOOR_OPENING], cols=cols, glass=M["glass"], col_tag="Wall_Front")
objs += L.wall(coll, "Walls_Back", "x", Z0 - 0.1, T, X0 - T, X1 + T, H, M["brick"], cols=cols, col_tag="Wall_Back")
for side, x in (("W", X0 - 0.1), ("E", X1 + 0.1)):
    objs += L.wall(coll, f"Walls_{side}", "z", x, T, Z0, Z1 + 0.2, H, M["wall"], openings=[(a, b, *HIGH_WIN_Y) for a, b in SIDE_WINDOWS],
                   cols=cols, glass=M["glass"], col_tag=f"Wall_{side}")
objs.append(L.box(coll, "Door_Entrance", 0, Z1 + 0.1, 0.01, 1.18, 0.06, 2.18, M["glass"], bevel=0.02))
objs.append(L.box(coll, "Door_Entrance_Handle", 0.42, Z1 - 0.03, 0.98, 0.04, 0.12, 0.04, M["metal"]))
objs.append(L.box(coll, "Entry_Doormat", 0, Z1 - 0.5, 0.0, 1.2, 0.7, 0.012, M["mat"]))
objs.append(L.box(coll, "Wall_AccentStripe", 0, Z0 + 0.03, 1.0, X1 - X0 - 0.2, 0.04, 0.25, M["red"]))

objs += L.wall(coll, "Walls_Changing", "x", CHANGING_Z, 0.15, X0, X1, 2.8, M["wall"],
               openings=[(*CHANGING_DOOR, 0.0, 2.2)], cols=cols, col_tag="Wall_Changing")
objs.append(L.box(coll, "Wall_ChangingTop", 0, CHANGING_Z, 2.8, X1 - X0, 0.15, 0.08, M["metal"]))
for k, x in enumerate(range(-3, 8)):
    objs.append(L.furn(coll, f"Locker_{k:02d}", x * 0.8 - 0.4, Z0 + 0.3, math.pi, [
        (0, 0, 0.0, 0.76, 0.5, 1.9, M["locker"], 0.01), (0.25, -0.26, 1.0, 0.04, 0.02, 0.18, M["steel"])]))
cols.add("Lockers", 2.4, Z0 + 0.3, 0.0, 8.9, 0.55, 1.9)
for k, x in enumerate((-4.5, 1.5)):
    objs.append(L.furn(coll, f"ChangingBench_{k:02d}", x, -15.8, 0.0, [
        (-1.0, 0, 0.0, 0.08, 0.36, 0.44, M["metal"]), (1.0, 0, 0.0, 0.08, 0.36, 0.44, M["metal"]),
        (0, 0, 0.44, 2.4, 0.4, 0.06, M["bench"], 0.01)]))
    cols.add(f"ChangingBench_{k:02d}", x, -15.8, 0.0, 2.4, 0.45, 0.5)

ring_objs, ring_cols, ring_data = RING.build(coll, M)
objs += ring_objs
for c in ring_cols:
    cols.add(*c)

objs.append(L.box(coll, "Wall_BagMat", BAG_X, sum(BAG_ZS) / 3, 0.0, 2.6, BAG_ZS[0] - BAG_ZS[-1] + 2.6, 0.02, M["mat_floor"]))

for k, (x, z, rot) in enumerate(((-7.7, -5.0, -math.pi / 2), (-7.7, -8.8, -math.pi / 2), (-5.4, 0.2, 0.0), (-2.2, 0.2, 0.0))):
    objs.append(L.furn(coll, f"SpectatorBench_{k:02d}", x, z, rot, [
        (-0.8, 0, 0.0, 0.08, 0.42, 0.42, M["metal"]), (0.8, 0, 0.0, 0.08, 0.42, 0.42, M["metal"]),
        (0, 0, 0.42, 1.8, 0.45, 0.06, M["bench"], 0.01), (0, 0.2, 0.48, 1.8, 0.06, 0.42, M["bench"], 0.01)]))
    sx, sz = (0.5, 1.9) if rot else (1.9, 0.5)
    cols.add(f"SpectatorBench_{k:02d}", x, z, 0.0, sx, sz, 0.9)

objs.append(L.box(coll, "Wall_ClubBoard", 0, Z0 + 0.06 + 0.6, 3.2, 5.2, 0.06, 0.9, M["board"]))
objs.append(L.text_mesh(coll, "Wall_ClubSign", "COVE BOXING CLUB", 0, Z0 + 0.1 + 0.6, 3.45, 0.42, 0.01, M["sign"]))
objs.append(L.plant(coll, M, "Plant_01", X0 + 0.45, 4.4))
cols.add("Plant_01", X0 + 0.45, 4.4, 0.0, 0.5, 0.5, 1.3)
objs.append(L.plant(coll, M, "Plant_02", X1 - 0.45, 4.4))
cols.add("Plant_02", X1 - 0.45, 4.4, 0.0, 0.5, 0.5, 1.3)

light_pts = [(x, z) for z in (2.5, -11.0, -15.8) for x in (-4.8, 0.0, 4.8)] + [(BAG_X, z) for z in BAG_ZS]
for i, (lx, lz) in enumerate(light_pts):
    objs.append(L.box(coll, f"Light_{i:02d}", lx, lz, H - 0.05, 1.4, 0.4, 0.05, M["lamp"]))
objs += RING.lights(coll, M, H)
for nm, gx, gz, sx, sz in [("Sky_Back", 0, Z0 - 6, 50, 0.05), ("Sky_Front", 0, Z1 + 6, 50, 0.05),
                          ("Sky_West", X0 - 6, (Z0 + Z1) / 2, 0.05, 50), ("Sky_East", X1 + 6, (Z0 + Z1) / 2, 0.05, 50)]:
    objs.append(L.box(coll, nm, gx, gz, -3.0, sx, sz, 10.0, M["sky"]))

bad = L.check_grounded(objs, allow=L.ALLOW_INTERIOR + ("Ceiling", "Ring_", "Locker_"))
print("INTERIOR grounded violations:", bad)
assert not bad, bad
L.export_glb(os.path.join(OUT, "interior.glb"), objs)
L.export_glb(os.path.join(OUT, "interior.colsrc.glb"), objs + cols.items)
L.write_json(os.path.join(OUT, "interior.layout.json"), {
    "version": 1, "key": KEY, "name": NAME, "spawn": [0.0, 1.6, 3.7],
    "exit": {"position": [0.0, 4.75], "radius": 1.4},
    "stations": [],
    "npcs": {"coach": ring_data["coach"]},
    "seats": [],
    "levels": [
        {"id": "L0", "y": 0.0, "height": H, "rects": [{"minX": X0, "maxX": X1, "minZ": Z0, "maxZ": Z1}]},
        {"id": "RING", "y": RING.deck_y, "height": H - RING.deck_y, "rects": [ring_data["deck"]]},
    ],
    "stairs": ring_data["stairs"],
    "boxing": {"ring": ring_data["ring"], "corners": ring_data["corners"], "exits": ring_data["exits"],
               "bags": [[BAG_X, 0.0, z] for z in BAG_ZS]},
})


def triangles(items):
    return sum(len(p.vertices) - 2 for o in items if o.type == "MESH" for p in o.data.polygons)


print("interior:", len(objs), "objects,", len(cols.items), "collision boxes,", triangles(objs), "triangles")
L.snapshot(sc, os.path.join(OUT, "interior_preview.png"), (6.5, 3.6, 4.0), (-1.6, 0.8, -7.0), lens=20, res=(960, 640), hide_prefixes=("Ceiling", "Sky_"))

exec(open(os.path.join(HERE, "build_sports_boxing_ext.py"), encoding="utf-8").read())
