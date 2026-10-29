import importlib
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else os.getcwd()
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import lib_common as L
importlib.reload(L)
import bpy

KEY = "cove_threads"
NAME = "Cove Threads"
OUT = os.path.join(L.OUT_ROOT, "store", KEY)
OUT_SITE = os.path.join(L.OUT_ROOT, "store", "threads_site")
W, HB = 31.0, 6.4
hd = 4.5
INTERIOR_BACK_OUTER_Z = -21.2
ROAD_Z = 12.0
ROAD_HALF_W = 1.3
SPUR_X = -88.0
DOOR_Z = 33.0
STORE_POS = (SPUR_X, DOOR_Z + hd)
WINDOWS = ((-13.0, -3.0), (3.0, 13.0))
WIN_Y = (0.9, 3.4)

sc = L.new_build_scene("STORE_" + KEY + "_exterior")
coll = bpy.data.collections.new("Exterior")
sc.collection.children.link(coll)
E = {
    "found": L.make_mat("EX_Foundation", "#8d8f94", 0.9, "noise", 0.03),
    "pink": L.make_mat("EX_ThreadsPink", "#f2c4cf", 0.85, "stripes", 0.03, accent="#ebb7c4"),
    "teal": L.make_mat("EX_ThreadsTeal", "#2f6f63", 0.7, "noise", 0.02),
    "cream": L.make_mat("EX_ThreadsCream", "#fbf4ef", 0.8, "noise", 0.02),
    "sign": L.make_mat("EX_ThreadsSignGlow", "#ffffff", 0.4, "noise", 0.0, emit="#ffffff", emit_strength=1.2),
    "roof": L.make_mat("EX_RoofGravel", "#6f7076", 0.95, "noise", 0.05),
    "glass": L.make_mat("EX_Glass", "#9fd6ea", 0.1, "noise", 0.02, alpha=0.45),
    "frame": L.make_mat("EX_FrameDark", "#2a2e35", 0.4, "noise", 0.02),
    "metal": L.make_mat("EX_Metal", "#9aa0a8", 0.5, "noise", 0.03),
}
xo = []
cols_e = L.Collisions(coll)
shell, interior_offset, zb = L.walk_in_shell(coll, cols_e, W, hd, HB - 0.6, E["pink"], E["glass"],
                                             [(a, b, *WIN_Y) for a, b in WINDOWS], [], [], interior_back=INTERIOR_BACK_OUTER_Z)
xo += shell
DN = hd - zb
zc = (hd + zb) / 2
xo.append(L.box(coll, "EX_Plinth", 0, zc, 0.0, W + 0.4, DN + 0.4, 0.19, E["found"], bevel=0.02, tile=2.0))
xo.append(L.box(coll, "EX_Walls", 0, zc, HB - 0.6, W, DN, 0.6, E["teal"], tile=1.5))
xo.append(L.box(coll, "EX_Roof", 0, zc, HB, W + 0.5, DN + 0.5, 0.3, E["roof"], tile=3.0))
xo.append(L.text_mesh(coll, "EX_SignText", NAME.upper(), 0.0, hd + 0.06, 4.25, 1.4, 0.1, E["sign"]))
for i, (x0, x1) in enumerate(WINDOWS):
    cx = (x0 + x1) / 2
    xo.append(L.box(coll, f"EX_WindowTop{i}", cx, hd + 0.06, WIN_Y[1] + 0.2, x1 - x0 + 0.2, 0.08, 0.15, E["frame"]))
    xo.append(L.box(coll, f"EX_WindowSill{i}", cx, hd + 0.06, WIN_Y[0] + 0.05, x1 - x0 + 0.2, 0.12, 0.15, E["frame"]))
    for k in range(5):
        xo.append(L.box(coll, f"EX_Awning{i}_{k}", x0 + (k + 0.5) * (x1 - x0) / 5, hd + 0.7, WIN_Y[1] + 0.35, (x1 - x0) / 5, 1.3, 0.08,
                        E["teal"] if k % 2 == 0 else E["cream"]))
xo.append(L.hinged_door(coll, [
    (0, 0.0, 1.18, 0.06, 2.18, E["glass"], 0.0),
    (0, 0.0, 1.18, 0.08, 0.1, E["frame"], 0.0),
    (0, 2.08, 1.18, 0.08, 0.1, E["frame"], 0.0),
    (0.45, 0.95, 0.05, 0.14, 0.05, E["metal"], 0.0),
], -0.59, hd - 0.1, 0.2))
xo.append(L.box(coll, "EX_DoorFrame", 0, hd + 0.04, 2.4, 1.44, 0.1, 0.12, E["teal"]))
xo.append(L.box(coll, "EX_DoorCanopy", 0, hd + 0.8, 2.75, 3.0, 1.6, 0.12, E["teal"]))
bad = L.check_grounded(xo, allow=("EX_Shell", "EX_Walls", "EX_Roof", "EX_Sign", "Door", "EX_Door", "EX_Window", "EX_Awning"))
print("EXTERIOR grounded violations:", bad)
assert not bad, bad
L.export_glb(os.path.join(OUT, "exterior.glb"), xo)
L.export_glb(os.path.join(OUT, "exterior.colsrc.glb"), xo + cols_e.items)
L.snapshot(sc, os.path.join(OUT, "preview.png"), (-16, 6, hd + 22), (0, 3.0, 0), lens=28, res=(768, 512))

sc2 = L.new_build_scene("STORE_threads_site")
pc = bpy.data.collections.new("ThreadsSite")
sc2.collection.children.link(pc)
P = {
    "paving": L.make_mat("TW_PavingThreads", "#c9c2b4", 0.9, "tiles", 0.03, accent="#b0a99b"),
    "curb": L.make_mat("TW_CurbThreads", "#9a9a9a", 0.8, "noise", 0.03),
    "grass": L.make_mat("TW_GrassThreads", "#79b765", 1.0, "noise", 0.06),
    "metal": L.make_mat("TW_MetalThreads", "#3a3f47", 0.4, "noise", 0.03),
    "lamp": L.make_mat("TW_LampGlowThreads", "#fff1c4", 0.5, "noise", 0.0, emit="#fff1c4"),
    "teal": L.make_mat("TW_ThreadsTeal", "#2f6f63", 0.7, "noise", 0.02),
    "sign": L.make_mat("TW_ThreadsSignGlow", "#ffffff", 0.4, "noise", 0.0, emit="#ffffff", emit_strength=1.2),
    "flower": L.make_mat("TW_ThreadsFlowers", "#f4b3c8", 0.9, "noise", 0.06),
    "leaf": L.make_mat("TW_LeafThreads", "#4f9d54", 0.9, "noise", 0.06),
}
so = []
col = []


def add_col(name, gx, gz, sx, sz, h):
    col.append({"name": name, "cx": round(gx, 3), "cz": round(gz, 3), "hx": round(sx / 2, 3), "hz": round(sz / 2, 3), "hy": round(h / 2, 3), "cy": round(h / 2, 3), "yaw": 0.0})


sx, sz = STORE_POS
back_z = sz - zb
spur_z0, spur_z1 = ROAD_Z + ROAD_HALF_W, DOOR_Z - 3.0
so.append(L.box(pc, "TS_Lawn", sx, (DOOR_Z - 4.0 + back_z + 2.0) / 2, 0.0, W + 6.0, back_z + 2.0 - (DOOR_Z - 4.0), 0.02, P["grass"], tile=2.0))
so.append(L.box(pc, "TS_Spur", sx, (spur_z0 + spur_z1) / 2, 0.0, 2.6, spur_z1 - spur_z0, 0.04, P["paving"], tile=2.0))
for side, dx in (("W", -1.4), ("E", 1.4)):
    so.append(L.box(pc, f"TS_Curb{side}", sx + dx, (spur_z0 + spur_z1) / 2, 0.0, 0.2, spur_z1 - spur_z0, 0.08, P["curb"]))
so.append(L.box(pc, "TS_Forecourt", sx, DOOR_Z - 1.5, 0.0, 12.0, 3.0, 0.035, P["paving"], tile=2.0))
for i, dx in enumerate((-5.0, 5.0)):
    so.append(L.cyl(pc, f"TS_Lamp{i}_Pole", sx + dx, DOOR_Z - 2.6, 0.0, 0.07, 3.2, P["metal"], seg=6))
    so.append(L.box(pc, f"TS_Lamp{i}_Head", sx + dx, DOOR_Z - 2.6, 3.2, 0.5, 0.5, 0.3, P["lamp"], bevel=0.03))
    add_col(f"COL_Threads_Lamp{i}", sx + dx, DOOR_Z - 2.6, 0.3, 0.3, 3.4)
for i, dx in enumerate((-3.2, 3.2)):
    so.append(L.box(pc, f"TS_Planter{i}", sx + dx, DOOR_Z - 0.6, 0.0, 2.2, 0.7, 0.5, P["teal"], bevel=0.03))
    so.append(L.box(pc, f"TS_Flowers{i}", sx + dx, DOOR_Z - 0.6, 0.5, 2.0, 0.5, 0.18, P["flower"], bevel=0.05))
    add_col(f"COL_Threads_Planter{i}", sx + dx, DOOR_Z - 0.6, 2.2, 0.7, 0.7)
way_x, way_z = sx + 2.6, ROAD_Z + ROAD_HALF_W + 1.0
so.append(L.box(pc, "TS_WayPost", way_x, way_z, 0.0, 0.14, 0.14, 2.3, P["metal"]))
so.append(L.box(pc, "TS_WayBoard", way_x, way_z, 1.5, 0.12, 2.6, 0.8, P["teal"]))
for facing, dx in (("+x", 0.07), ("-x", -0.07)):
    so.append(L.text_mesh(pc, f"TS_WayText{facing}", "COVE THREADS", way_x + dx, way_z, 1.7, 0.3, 0.03, P["sign"], facing=facing))
add_col("COL_Threads_WaySign", way_x, way_z, 0.3, 2.6, 2.3)

bad = L.check_grounded(so, allow=("TS_Lawn", "TS_Spur", "TS_Curb", "TS_Forecourt", "TS_Lamp", "TS_Planter", "TS_Flowers", "TS_Way"))
print("SITE grounded violations:", bad)
assert not bad, bad

L.export_glb(os.path.join(OUT_SITE, "threads_site.glb"), so)
door_local = [0.0, 1.25, hd]
L.write_json(os.path.join(OUT_SITE, "threads_site.layout.json"), {
    "version": 1,
    "bounds": {"minX": round(sx - W / 2 - 3.0, 3), "maxX": round(sx + W / 2 + 3.0, 3), "minZ": round(ROAD_Z + ROAD_HALF_W, 3), "maxZ": round(back_z + 2.0, 3)},
    "store": {
        "key": KEY, "name": NAME,
        "position": [sx, 0.0, sz], "rotationY": math.pi,
        "door": [round(sx - door_local[0], 3), door_local[1], round(sz - door_local[2], 3)],
        "footprint": [W, DN],
        "interiorOffset": [round(c, 4) for c in interior_offset],
    },
    "collision": col,
})
print("threads site:", len(so), "objects,", len(col), "collision boxes, door z", sz - door_local[2], "back z", back_z)
