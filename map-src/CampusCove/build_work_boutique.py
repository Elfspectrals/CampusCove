"""Boutique (job: Commerce / Vente). Run inside Blender: exec(open(<this file>).read()).

Interior (game space, same contract as the houses): x [-7, 7], z [-9, 5.2], door at z=+5.1.
Stations: 3 checkouts (station_commerce_01..03, cashier stands behind the counter facing +Z)
          2 advisor desks (station_commerce_04..05) + stockroom behind the partition.
Outputs: out/work/boutique/{interior.glb, interior.colsrc.glb, interior.layout.json, exterior.glb, exterior.colsrc.glb, exterior.layout.json}
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

KEY = "boutique"
OUT = os.path.join(L.OUT_ROOT, "work", KEY)
H = 3.0

# ================================================================ INTERIOR
sc = L.new_build_scene("WORK_" + KEY + "_interior")
coll = bpy.data.collections.new("Interior")
sc.collection.children.link(coll)
cols = L.Collisions(coll)
M = L.std_mats(wall="#f3ece0", floor=("#d8c4a0", "planks", "#b9a07a"))
M["accent"] = L.make_mat("IN_WallCoral", "#e0675a", 0.9, "noise", 0.03)
M["stripe"] = L.make_mat("IN_AwningStripe", "#e0675a", 0.9, "stripes", 0.02, accent="#f6efe6")
M["screen"] = L.make_mat("IN_Screen", "#2a6ed8", 0.3, "stripes", 0.03, accent="#3a86ff", emit="#2a6ed8")
M["carton"] = L.make_mat("IN_Carton", "#b98c5a", 0.9, "stripes", 0.04, accent="#a47a4c")
goods = [L.make_mat(f"IN_Goods{i}", c, 0.7, "noise", 0.05) for i, c in enumerate(["#e0675a", "#4aa3df", "#f2c14e", "#6cc08b", "#a678de", "#f08a4b"])]
cloth = [L.make_mat(f"IN_Cloth{i}", c, 0.95, "stripes", 0.04, accent=a) for i, (c, a) in enumerate([("#4aa3df", "#3a8fc9"), ("#e0675a", "#c9564a"), ("#f2c14e", "#dcab3a"), ("#6cc08b", "#58ab76")])]
objs = L.interior_shell(coll, cols, M, M["accent"])

# ---- partition + stockroom (z < -7.2), door gap at x 5.0..6.2
objs += L.wall(coll, "Walls_Stock", "x", -7.3, 0.15, -7.0, 7.0, H, M["wall"], openings=[(5.0, 6.2, 0.0, 2.2)], cols=cols, col_tag="Wall_Stock")
for i, (cx, cz) in enumerate([(-5.8, -8.4), (-4.6, -8.4), (-5.2, -8.4), (-2.4, -8.4), (-1.2, -8.4), (0.4, -8.4), (1.6, -8.4)]):
    h = 0.5 + 0.4 * (i % 3)
    objs.append(L.box(coll, f"Stock_Carton_{i:02d}", cx, cz, 0.0, 0.9, 0.7, h, M["carton"], bevel=0.015))
cols.add("Stock_Left", -4.6, -8.4, 0.0, 3.0, 0.8, 1.4)
cols.add("Stock_Mid", -0.4, -8.4, 0.0, 4.2, 0.8, 1.4)
objs.append(L.furn(coll, "Stock_Shelf", 4.6, -8.55, 0.0, [(0, 0, 0.0, 3.0, 0.5, 0.06, M["metal"]), (0, 0, 0.8, 3.0, 0.5, 0.06, M["metal"]), (0, 0, 1.6, 3.0, 0.5, 0.06, M["metal"]),
                                                          (-1.45, 0, 0.0, 0.06, 0.5, 2.0, M["metal"]), (1.45, 0, 0.0, 0.06, 0.5, 2.0, M["metal"])]))
cols.add("Stock_Shelf", 4.6, -8.55, 0.0, 3.0, 0.5, 2.0)

# ---- 3 checkout counters (cashier behind, facing +Z)
stations = []
for i, cx in enumerate((-4.0, 0.0, 4.0), start=1):
    tag = f"{i:02d}"
    counter = L.furn(coll, f"desk_commerce_{tag}", cx, -4.4, 0.0, [
        (0, 0, 0.0, 2.0, 0.8, 0.95, M["walnut"], 0.02),
        (0, 0, 0.95, 2.1, 0.9, 0.05, M["marble"], 0.01),
        (-0.5, -0.05, 1.0, 0.45, 0.35, 0.03, M["black"]),
        (-0.5, -0.05, 1.03, 0.04, 0.04, 0.15, M["black"]),
        (-0.5, -0.12, 1.18, 0.4, 0.03, 0.28, M["black"]),
        (-0.5, -0.095, 1.2, 0.36, 0.01, 0.24, M["screen"]),
        (0.5, 0.0, 1.0, 0.3, 0.3, 0.12, M["steel"], 0.02),
    ])
    objs.append(counter)
    cols.add(f"Desk_commerce_{tag}", cx, -4.4, 0.0, 2.1, 0.9, 1.0)
    # stool for the cashier (optional seat)
    objs.append(L.furn(coll, f"seat_commerce_{tag}", cx, -5.5, 0.0, [(0, 0, 0.55, 0.36, 0.36, 0.06, M["accent"], 0.01), (0, 0, 0.0, 0.06, 0.06, 0.55, M["metal"]), (0, 0, 0.0, 0.4, 0.05, 0.04, M["metal"])]))
    stations.append({"id": f"station_commerce_{tag}", "job": "commerce", "role": "caisse", "seat": f"seat_commerce_{tag}", "desk": f"desk_commerce_{tag}",
                     "position": [cx, 0.0, -5.5], "yaw": math.pi, "lookAt": [cx, 1.0, -3.4]})

# ---- 2 advisor desks near the entrance (advisor stands behind, facing the door)
for j, cx in enumerate((-4.6, 4.6), start=4):
    tag = f"{j:02d}"
    desk = L.furn(coll, f"desk_commerce_{tag}", cx, 1.6, 0.0, [
        (0, 0, 0.0, 1.5, 0.7, 0.9, M["oak"], 0.02),
        (0, 0, 0.9, 1.6, 0.8, 0.05, M["walnut"], 0.01),
        (0.3, 0, 0.95, 0.4, 0.28, 0.02, M["black"]),
        (0.3, -0.06, 0.97, 0.38, 0.02, 0.26, M["screen"]),
    ])
    objs.append(desk)
    cols.add(f"Desk_commerce_{tag}", cx, 1.6, 0.0, 1.6, 0.8, 0.95)
    objs.append(L.furn(coll, f"seat_commerce_{tag}", cx, 0.7, math.pi, L.chair_parts(M, M["accent"])))
    stations.append({"id": f"station_commerce_{tag}", "job": "commerce", "role": "conseiller", "seat": f"seat_commerce_{tag}", "desk": f"desk_commerce_{tag}",
                     "position": [cx, 0.0, 0.7], "yaw": math.pi, "lookAt": [cx, 1.0, 2.5]})

# ---- display islands (goods on top), wall shelves, clothes racks
for i, (cx, cz) in enumerate([(-2.4, -0.9), (2.4, -0.9)]):
    parts = [(0, 0, 0.0, 2.2, 1.2, 0.85, M["oak"], 0.02), (0, 0, 0.85, 2.3, 1.3, 0.04, M["walnut"], 0.01)]
    for k in range(6):
        parts.append((-0.8 + (k % 3) * 0.8, -0.3 + (k // 3) * 0.55, 0.89, 0.35, 0.3, 0.18 + 0.06 * (k % 2), goods[(i + k) % len(goods)], 0.015))
    objs.append(L.furn(coll, f"DisplayIsland_{i + 1:02d}", cx, cz, 0.0, parts))
    cols.add(f"DisplayIsland_{i + 1:02d}", cx, cz, 0.0, 2.3, 1.3, 0.95)
for side, sx, rot in (("W", -6.6, -math.pi / 2), ("E", 6.6, math.pi / 2)):
    for k, cz in enumerate((-5.6, -3.2, -0.8, 1.6)):
        if side == "W" and cz > 0:  # keep the west window zone readable
            pass
        parts = [(0, 0, 0.0, 0.1, 1.9, 2.0, M["walnut"], 0.01)] + [(0.0, 0, 0.45 + 0.5 * lv, 0.45, 1.8, 0.05, M["oak"]) for lv in range(3)]
        for lv in range(3):
            for g in range(4):
                parts.append((0.0, -0.7 + g * 0.45, 0.5 + 0.5 * lv, 0.3, 0.3, 0.22, goods[(k + lv + g) % len(goods)], 0.01))
        objs.append(L.furn(coll, f"WallShelf_{side}{k + 1}", sx, cz, rot, parts))
        cols.add(f"WallShelf_{side}{k + 1}", sx, cz, 0.0, 0.5, 1.9, 2.0)
for k, cx in enumerate((-3.4, -2.2, 2.2, 3.4)):
    pts = [(0, 0, 0.0, 0.8, 0.05, 0.05, M["metal"]), (-0.38, 0, 0.0, 0.04, 0.04, 1.5, M["metal"]), (0.38, 0, 0.0, 0.04, 0.04, 1.5, M["metal"]), (0, 0, 1.5, 0.8, 0.04, 0.04, M["metal"])]
    for g in range(5):
        pts.append((-0.3 + g * 0.15, 0, 0.7, 0.1, 0.3, 0.8, cloth[(k + g) % len(cloth)], 0.01))
    objs.append(L.furn(coll, f"ClothesRack_{k + 1}", cx, 3.0, 0.0, pts))
    cols.add(f"ClothesRack_{k + 1}", cx, 3.0, 0.0, 0.8, 0.4, 1.5)
objs.append(L.plant(coll, M, "Plant_01", -6.3, 4.3))
cols.add("Plant_01", -6.3, 4.3, 0.0, 0.4, 0.4, 1.0)
objs.append(L.plant(coll, M, "Plant_02", 6.3, 4.3))
cols.add("Plant_02", 6.3, 4.3, 0.0, 0.4, 0.4, 1.0)

bad = L.check_grounded(objs, allow=L.ALLOW_INTERIOR)
print("INTERIOR grounded violations:", bad)
assert not bad, bad
L.export_glb(os.path.join(OUT, "interior.glb"), objs)
L.export_glb(os.path.join(OUT, "interior.colsrc.glb"), objs + cols.items)
L.write_json(os.path.join(OUT, "interior.layout.json"), {
    "version": 1, "key": KEY, "job": "commerce", "name": "Boutique", "spawn": [0.0, 1.6, 3.7],
    "exit": {"position": [0.0, 4.75], "radius": 1.4}, "stations": stations, "seats": [],
})
print("interior:", len(objs), "objects,", len(cols.items), "collision boxes,", len(stations), "stations")

# ================================================================ EXTERIOR
exec(open(os.path.join(HERE, "build_work_boutique_ext.py"), encoding="utf-8").read())
