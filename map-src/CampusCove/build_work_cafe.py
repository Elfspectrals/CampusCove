"""Cafe / Resto (job: Restauration). Run inside Blender: exec(open(<this file>).read()).

Interior (house contract): x [-7, 7], z [-9, 5.2], door z=+5.1.
Stations: 3 kitchen ranges (station_resto_01..03, cooks face -Z), 2 espresso bar spots (04..05, barista faces -X),
          2 pass/serving spots (06..07). Diner tables + chairs (seat_diner_NN) are decor.
Outputs: out/work/cafe/{interior,exterior}.glb (+ colsrc, layout json)
"""
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

KEY = "cafe"
OUT = os.path.join(L.OUT_ROOT, "work", KEY)
H = 3.0

sc = L.new_build_scene("WORK_" + KEY + "_interior")
coll = bpy.data.collections.new("Interior")
sc.collection.children.link(coll)
cols = L.Collisions(coll)
M = L.std_mats(wall="#f6ead7", floor=("#c79a68", "checker", "#b98a58"))
M["accent"] = L.make_mat("IN_WallGreen", "#4f9d6b", 0.9, "noise", 0.03)
M["tile"] = L.make_mat("IN_KitchenTile", "#e9ecef", 0.25, "tiles", 0.02, accent="#c9ced3")
M["red"] = L.make_mat("IN_ChairRed", "#c8553d", 0.95, "noise", 0.04)
M["cloth"] = L.make_mat("IN_Tablecloth", "#f7f3ea", 0.95, "checker", 0.02, accent="#d94f4f")
M["flame"] = L.make_mat("IN_Burner", "#ff8a3d", 0.4, "noise", 0.0, emit="#ff8a3d")
M["menu"] = L.make_mat("IN_MenuBoard", "#2b3a33", 0.8, "stripes", 0.02, accent="#34463d")
M["cup"] = L.make_mat("IN_Cup", "#f2f2f2", 0.5, "noise", 0.01)
objs = L.interior_shell(coll, cols, M, M["accent"], win_w=((-6.75, -4.25), (-2.75, -0.25), (1.0, 3.5)), win_e=((-2.75, -0.25), (1.0, 3.5)))
# kitchen floor tile
objs.append(L.box(coll, "Kitchen_Floor", 0, -7.0, 0.0, 14.0, 4.0, 0.012, M["tile"], tile=1.0))

stations = []
# ---- kitchen ranges along the back wall + hoods
for i, cx in enumerate((-5.5, -3.0, -0.5), start=1):
    tag = f"{i:02d}"
    parts = [(0, 0, 0.0, 1.4, 0.8, 0.9, M["steel"], 0.02), (0, 0, 0.9, 1.45, 0.85, 0.04, M["black"], 0.01)]
    for bx in (-0.3, 0.3):
        for bz in (-0.18, 0.18):
            parts.append((bx, bz, 0.94, 0.22, 0.22, 0.03, M["flame"]))
    parts += [(0, -0.3, 1.9, 1.2, 0.5, 0.45, M["steel"], 0.02), (0, -0.3, 2.35, 0.3, 0.3, 0.65, M["steel"])]
    rng = L.furn(coll, f"desk_resto_{tag}", cx, -8.45, 0.0, parts)
    objs.append(rng)
    cols.add(f"Range_{tag}", cx, -8.45, 0.0, 1.45, 0.85, 1.0)
    stations.append({"id": f"station_resto_{tag}", "job": "resto", "role": "cuisine", "desk": f"desk_resto_{tag}",
                     "position": [cx, 0.0, -7.5], "yaw": 0.0, "lookAt": [cx, 1.0, -8.45]})
# prep island, fridge
objs.append(L.furn(coll, "PrepIsland", 3.4, -7.4, 0.0, [(0, 0, 0.0, 2.4, 1.0, 0.9, M["steel"], 0.02), (0, 0, 0.9, 2.5, 1.1, 0.04, M["marble"], 0.01),
                                                      (-0.6, 0, 0.94, 0.5, 0.3, 0.06, M["walnut"]), (0.5, 0.1, 0.94, 0.3, 0.3, 0.3, M["metal"], 0.02)]))
cols.add("PrepIsland", 3.4, -7.4, 0.0, 2.5, 1.1, 0.95)
objs.append(L.furn(coll, "Fridge", 6.3, -8.4, 0.0, [(0, 0, 0.0, 0.9, 0.8, 1.9, M["steel"], 0.03), (-0.1, 0.41, 1.0, 0.05, 0.03, 0.5, M["black"])]))
cols.add("Fridge", 6.3, -8.4, 0.0, 0.9, 0.8, 1.9)

# ---- pass counter (z=-5.4) with 2 server spots in front
objs.append(L.furn(coll, "PassCounter", -3.0, -5.4, 0.0, [(0, 0, 0.0, 7.0, 0.7, 1.0, M["walnut"], 0.02), (0, 0, 1.0, 7.2, 0.9, 0.05, M["marble"], 0.01),
                                                         (-2.0, -0.05, 1.05, 0.28, 0.28, 0.12, M["cup"], 0.01), (-1.6, 0.0, 1.05, 0.28, 0.28, 0.12, M["cup"], 0.01), (1.5, 0.0, 1.05, 0.4, 0.4, 0.1, M["steel"], 0.01)]))
cols.add("PassCounter", -3.0, -5.4, 0.0, 7.2, 0.9, 1.05)
for j, cx in enumerate((-4.2, -1.8), start=6):
    tag = f"{j:02d}"
    stations.append({"id": f"station_resto_{tag}", "job": "resto", "role": "service", "desk": "PassCounter",
                     "position": [cx, 0.0, -4.5], "yaw": 0.0, "lookAt": [cx, 1.0, -5.4]})

# ---- espresso bar on the east side (baristas on the east, facing -X)
objs.append(L.furn(coll, "desk_resto_bar", 5.2, -2.0, 0.0, [
    (0, 0, 0.0, 0.7, 4.6, 1.05, M["walnut"], 0.02), (0, 0, 1.05, 0.8, 4.7, 0.05, M["marble"], 0.01),
    (-0.1, 1.0, 1.1, 0.5, 0.6, 0.5, M["steel"], 0.03), (-0.1, -0.8, 1.1, 0.35, 0.35, 0.4, M["black"], 0.03),
    (0.05, 0.1, 1.1, 0.25, 0.25, 0.1, M["cup"], 0.01), (0.05, -0.3, 1.1, 0.25, 0.25, 0.1, M["cup"], 0.01)]))
cols.add("Bar", 5.2, -2.0, 0.0, 0.8, 4.7, 1.1)
for j, cz in enumerate((-3.0, -1.0), start=4):
    tag = f"{j:02d}"
    stations.append({"id": f"station_resto_{tag}", "job": "resto", "role": "barista", "desk": "desk_resto_bar",
                     "position": [6.3, 0.0, cz], "yaw": math.pi / 2, "lookAt": [5.2, 1.0, cz]})
for k, cz in enumerate((-3.6, -2.0, -0.4), start=1):
    objs.append(L.furn(coll, f"seat_diner_stool_{k:02d}", 4.1, cz, 0.0, [(0, 0, 0.62, 0.36, 0.36, 0.06, M["red"], 0.01), (0, 0, 0.0, 0.06, 0.06, 0.62, M["metal"]), (0, 0, 0.0, 0.4, 0.05, 0.04, M["metal"]), (0, 0, 0.0, 0.05, 0.4, 0.04, M["metal"])]))

# ---- dining tables (2 chairs each)
n = 0
for (tx, tz) in [(-5.2, 3.0), (-3.0, 3.0), (-5.2, 0.4), (-3.0, 0.4), (3.2, 3.0), (5.3, 3.0)]:
    n += 1
    objs.append(L.furn(coll, f"DinerTable_{n:02d}", tx, tz, 0.0, [(0, 0, 0.0, 0.1, 0.1, 0.7, M["metal"]), (0, 0, 0.0, 0.6, 0.06, 0.04, M["metal"]), (0, 0, 0.7, 0.9, 0.9, 0.05, M["cloth"], 0.01)]))
    cols.add(f"DinerTable_{n:02d}", tx, tz, 0.0, 0.9, 0.9, 0.75)
    objs.append(L.furn(coll, f"seat_diner_{2 * n - 1:02d}", tx, tz + 0.75, 0.0, L.chair_parts(M, M["red"], M["walnut"])))
    objs.append(L.furn(coll, f"seat_diner_{2 * n:02d}", tx, tz - 0.75, math.pi, L.chair_parts(M, M["red"], M["walnut"])))

# ---- menu board + plants
objs.append(L.box(coll, "Wall_MenuBoard", -3.0, -8.93, 1.4, 3.2, 0.04, 1.0, M["menu"]))
for k in range(5):
    objs.append(L.box(coll, f"Wall_MenuLine{k}", -4.0 + k * 0.5, -8.9, 1.6 + 0.12 * (k % 2), 0.38, 0.02, 0.06, M["cup"]))
for i, (px, pz) in enumerate([(-6.4, 4.4), (6.4, 4.4), (-6.4, -4.0)], start=1):
    objs.append(L.plant(coll, M, f"Plant_{i:02d}", px, pz))
    cols.add(f"Plant_{i:02d}", px, pz, 0.0, 0.4, 0.4, 1.0)

bad = L.check_grounded(objs, allow=L.ALLOW_INTERIOR + ("Kitchen_Floor",))
print("INTERIOR grounded violations:", bad)
assert not bad, bad
L.export_glb(os.path.join(OUT, "interior.glb"), objs)
L.export_glb(os.path.join(OUT, "interior.colsrc.glb"), objs + cols.items)
L.write_json(os.path.join(OUT, "interior.layout.json"), {
    "version": 1, "key": KEY, "job": "resto", "name": "Campus Cafe", "spawn": [0.0, 1.6, 3.7],
    "exit": {"position": [0.0, 4.75], "radius": 1.4}, "stations": stations, "seats": [],
})
print("interior:", len(objs), "objects,", len(cols.items), "collision boxes,", len(stations), "stations")

exec(open(os.path.join(HERE, "build_work_cafe_ext.py"), encoding="utf-8").read())
