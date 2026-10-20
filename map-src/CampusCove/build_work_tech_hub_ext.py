"""Tech Hub exterior (2-storey glass/concrete office). Footprint 16 x 14 m, door on +Z, origin = ground center.
Run inside Blender after build_work_tech_hub.py (or standalone). Outputs out/work/tech_hub/exterior.glb,
exterior.colsrc.glb, exterior.layout.json (door point + footprint)."""
import importlib
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else r"C:\Users\zombo\CampusCove\map-src\CampusCove"
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import lib_common as L
importlib.reload(L)
import bpy

KEY = "tech_hub"
OUT = os.path.join(L.OUT_ROOT, "work", KEY)
W, D = 16.0, 14.0
sc = L.new_build_scene("WORK_" + KEY + "_exterior")
coll = bpy.data.collections.new("Exterior")
sc.collection.children.link(coll)
cols = L.Collisions(coll)
E = {
    "found": L.make_mat("EX_Foundation", "#8d8f94", 0.9, "noise", 0.03),
    "conc": L.make_mat("EX_Concrete", "#c9cacd", 0.9, "noise", 0.03),
    "panel": L.make_mat("EX_PanelWhite", "#f1f1ee", 0.8, "tiles", 0.015, accent="#d9d9d4"),
    "teal": L.make_mat("EX_AccentTeal", "#2f9a9b", 0.7, "noise", 0.03),
    "glass": L.make_mat("EX_Glass", "#9fd6ea", 0.1, "noise", 0.02, alpha=0.45),
    "frame": L.make_mat("EX_FrameDark", "#2a2e35", 0.4, "noise", 0.02),
    "roof": L.make_mat("EX_RoofDark", "#4a4e57", 0.9, "noise", 0.03),
    "neon": L.make_mat("EX_Neon", "#38e8ff", 0.3, "noise", 0.0, emit="#38e8ff"),
    "pot": L.make_mat("EX_Terracotta", "#b9633f", 0.8, "noise", 0.04),
    "leaf": L.make_mat("EX_Leaf", "#4f9d54", 0.9, "noise", 0.06),
    "door": L.make_mat("EX_DoorGlass", "#5b7f94", 0.2, "noise", 0.02, alpha=0.55),
    "step": L.make_mat("EX_Paving", "#b8b2a6", 0.9, "tiles", 0.03, accent="#a49e92"),
    "metal": L.make_mat("EX_Metal", "#9aa0a8", 0.5, "noise", 0.03),
}
objs = []
hw, hd = W / 2, D / 2

objs.append(L.box(coll, "EX_Plinth", 0, 0, 0.0, W + 0.4, D + 0.4, 0.2, E["found"], bevel=0.02, tile=2.0))
objs.append(L.box(coll, "EX_GroundFloor", 0, 0, 0.2, W, D, 3.3, E["conc"], tile=2.0))
objs.append(L.box(coll, "EX_UpperFloor", 0, 0, 3.5, W, D, 3.3, E["panel"], tile=2.0))
objs.append(L.box(coll, "EX_Band", 0, 0, 3.4, W + 0.2, D + 0.2, 0.18, E["teal"], tile=2.0))
objs.append(L.box(coll, "EX_RoofSlab", 0, 0, 6.8, W + 0.6, D + 0.6, 0.25, E["roof"], tile=2.0))
for nm, gx, gz, sx, sz in [("EX_ParapetN", 0, -hd - 0.25, W + 0.6, 0.15), ("EX_ParapetS", 0, hd + 0.25, W + 0.6, 0.15),
                           ("EX_ParapetW", -hw - 0.25, 0, 0.15, D + 0.6), ("EX_ParapetE", hw + 0.25, 0, 0.15, D + 0.6)]:
    objs.append(L.box(coll, nm, gx, gz, 7.05, sx, sz, 0.5, E["panel"]))

# --- front storefront: two glass bays + door
zf = hd + 0.03
for side, (x0, x1) in (("L", (-7.5, -1.5)), ("R", (1.5, 7.5))):
    cx = (x0 + x1) / 2
    objs.append(L.box(coll, f"EX_Storefront{side}", cx, zf, 0.5, x1 - x0, 0.06, 2.7, E["glass"]))
    for i in range(4):
        objs.append(L.box(coll, f"EX_Mullion{side}{i}", x0 + i * (x1 - x0) / 3, zf + 0.02, 0.45, 0.1, 0.08, 2.8, E["frame"]))
    objs.append(L.box(coll, f"EX_StoreTop{side}", cx, zf + 0.02, 3.15, x1 - x0, 0.08, 0.1, E["frame"]))
    objs.append(L.box(coll, f"EX_StoreBase{side}", cx, zf + 0.02, 0.4, x1 - x0, 0.08, 0.1, E["frame"]))
objs.append(L.box(coll, "EX_DoorGlass", 0, zf, 0.2, 2.2, 0.06, 2.6, E["door"]))
for i, x in enumerate((-1.2, 0.0, 1.2)):
    objs.append(L.box(coll, f"EX_DoorFrame{i}", x, zf + 0.02, 0.2, 0.1, 0.1, 2.7, E["frame"]))
objs.append(L.box(coll, "EX_DoorHeader", 0, zf + 0.02, 2.85, 2.5, 0.1, 0.12, E["frame"]))

# --- upper floor windows (continuous band) on 4 sides
objs.append(L.box(coll, "EX_WinFront", 0, hd + 0.03, 4.2, 14.8, 0.06, 1.9, E["glass"]))
objs.append(L.box(coll, "EX_WinBack", 0, -hd - 0.03, 4.2, 14.8, 0.06, 1.9, E["glass"]))
objs.append(L.box(coll, "EX_WinW", -hw - 0.03, 0, 4.2, 0.06, 12.8, 1.9, E["glass"]))
objs.append(L.box(coll, "EX_WinE", hw + 0.03, 0, 4.2, 0.06, 12.8, 1.9, E["glass"]))
for i in range(6):
    x = -7.4 + i * (14.8 / 5)
    objs.append(L.box(coll, f"EX_UpMullionF{i}", x, hd + 0.05, 4.15, 0.1, 0.06, 2.0, E["frame"]))
    objs.append(L.box(coll, f"EX_UpMullionB{i}", x, -hd - 0.05, 4.15, 0.1, 0.06, 2.0, E["frame"]))
for i in range(5):
    z = -6.2 + i * (12.4 / 4)
    objs.append(L.box(coll, f"EX_UpMullionW{i}", -hw - 0.05, z, 4.15, 0.06, 0.1, 2.0, E["frame"]))
    objs.append(L.box(coll, f"EX_UpMullionE{i}", hw + 0.05, z, 4.15, 0.06, 0.1, 2.0, E["frame"]))
for side, sx in (("W", -hw - 0.03), ("E", hw + 0.03)):
    objs.append(L.box(coll, f"EX_GFWin{side}", sx, 0, 0.9, 0.06, 9.0, 1.6, E["glass"]))

# --- awning, posts, steps, sign
objs.append(L.box(coll, "EX_Awning", 0, hd + 1.1, 3.0, 4.6, 2.2, 0.14, E["teal"], bevel=0.02))
for sx in (-2.15, 2.15):
    objs.append(L.box(coll, f"EX_AwningPost{'L' if sx < 0 else 'R'}", sx, hd + 2.05, 0.0, 0.12, 0.12, 3.0, E["metal"]))
objs.append(L.box(coll, "EX_Step", 0, hd + 1.1, 0.0, 5.2, 2.0, 0.12, E["step"], tile=2.0))
objs.append(L.box(coll, "EX_SignBack", 0, hd + 0.07, 3.65, 6.2, 0.1, 0.7, E["frame"]))
objs.append(L.text_mesh(coll, "EX_SignText", "TECH HUB", 0, hd + 0.16, 3.72, 0.5, 0.04, E["neon"]))

# --- roof props
for i, (ax, az) in enumerate([(-4.5, -3.0), (4.0, 2.5)]):
    objs.append(L.box(coll, f"EX_AC_{i}", ax, az, 7.05, 2.0, 1.4, 0.9, E["metal"], bevel=0.04))
objs.append(L.cyl(coll, "EX_Antenna", 5.5, -4.5, 7.05, 0.07, 3.6, E["metal"], seg=6))
objs.append(L.cone(coll, "EX_Dish", 5.5, -4.5, 8.7, 0.1, 0.6, 0.3, E["metal"], seg=8))

# --- entrance plants
for sx in (-3.4, 3.4):
    objs.append(L.cyl(coll, f"EX_PlantPot{'L' if sx < 0 else 'R'}", sx, hd + 1.3, 0.12, 0.35, 0.5, E["pot"], seg=8))
    objs.append(L.cone(coll, f"EX_PlantLeaf{'L' if sx < 0 else 'R'}", sx, hd + 1.3, 0.62, 0.5, 0.05, 1.0, E["leaf"], seg=7))

cols.add("TechHub_Body", 0, 0, 0.0, W + 0.4, D + 0.4, 7.6)
bad = L.check_grounded(objs, allow=("EX_Band", "EX_Roof", "EX_Parapet", "EX_Upper", "EX_Win", "EX_UpMullion", "EX_Store", "EX_Mullion", "EX_Door", "EX_Awning", "EX_Sign", "EX_AC_", "EX_Antenna", "EX_Dish", "EX_Plant", "EX_GroundFloor", "EX_GFWin"))
print("EXTERIOR grounded violations:", bad)
assert not bad, bad
L.export_glb(os.path.join(OUT, "exterior.glb"), objs)
L.export_glb(os.path.join(OUT, "exterior.colsrc.glb"), objs + cols.items)
L.write_json(os.path.join(OUT, "exterior.layout.json"), {
    "version": 1, "key": KEY, "name": "Tech Hub", "footprint": [W, D], "doorLocal": [0.0, 1.25, hd + 2.6],
    "collision": [{"cx": 0.0, "cz": 0.0, "hx": W / 2 + 0.2, "hz": D / 2 + 0.2, "hy": 3.8}],
})
print("exterior objects:", len(objs))
