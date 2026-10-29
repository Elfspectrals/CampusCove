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
import bpy

KEY = "clinic"
NAME = "Cove Clinic"
OUT = os.path.join(L.OUT_ROOT, "work", KEY)
PARTITION_Z = -2.6

sc = L.new_build_scene("WORK_" + KEY + "_interior")
coll = bpy.data.collections.new("Interior")
sc.collection.children.link(coll)
cols = L.Collisions(coll)
M = L.std_mats(wall="#f4f6f3", floor=("#dfe9e4", "tiles", "#cbd9d2"))
M["accent"] = L.make_mat("IN_ClinicMint", "#7cc6b4", 0.9, "noise", 0.03)
M["red"] = L.make_mat("IN_ClinicRed", "#e0534f", 0.6, "noise", 0.02)
M["white"] = L.make_mat("IN_ClinicWhite", "#fbfbf8", 0.5, "noise", 0.01)
M["sheet"] = L.make_mat("IN_BedSheet", "#eef5f8", 0.95, "noise", 0.02)
M["blanket"] = L.make_mat("IN_BedBlanket", "#8fc3dc", 0.95, "stripes", 0.03, accent="#7db3cd")
M["curtain"] = L.make_mat("IN_Curtain", "#bfe0dc", 0.95, "stripes", 0.02, accent="#acd3ce")
M["seat"] = L.make_mat("IN_WaitingSeat", "#6aa9c9", 0.9, "noise", 0.03)
M["screen"] = L.make_mat("IN_MonitorScreen", "#1c3b2f", 0.4, "stripes", 0.0, accent="#4be38a", emit="#2fd17a", emit_strength=0.6)
M["scrubs"] = L.make_mat("IN_NurseScrubs", "#7fb9d6", 0.9, "noise", 0.03)
M["skin"] = L.make_mat("IN_NurseSkin", "#e9b48f", 0.8, "noise", 0.02)
M["hair"] = L.make_mat("IN_NurseHair", "#5a3a28", 0.9, "noise", 0.04)
M["pill_a"] = L.make_mat("IN_PillBoxA", "#f2c14e", 0.6, "noise", 0.02)
M["pill_b"] = L.make_mat("IN_PillBoxB", "#e07a7a", 0.6, "noise", 0.02)
M["pill_c"] = L.make_mat("IN_PillBoxC", "#7cc6b4", 0.6, "noise", 0.02)
M["water"] = L.make_mat("IN_WaterJug", "#9fd6ea", 0.1, "noise", 0.01, alpha=0.6)
side_windows = ((-7.0, -4.0), (1.5, 3.5))
objs = L.interior_shell(coll, cols, M, M["accent"], win_w=side_windows, win_e=side_windows,
                        light_pts=((-4, -6), (0, -6), (4, -6), (-4, 0.5), (4, 0.5), (0, 3)))
objs += L.wall(coll, "Walls_Partition", "x", PARTITION_Z, 0.12, -7.0, 7.0, 3.0, M["wall"], openings=[(-1.2, 1.2, 0.0, 2.3)], cols=cols, col_tag="Wall_Partition")
objs.append(L.box(coll, "Wall_PartitionStripe", -4.1, PARTITION_Z + 0.07, 1.3, 5.8, 0.02, 0.3, M["accent"]))
objs.append(L.box(coll, "Wall_PartitionStripeE", 4.1, PARTITION_Z + 0.07, 1.3, 5.8, 0.02, 0.3, M["accent"]))
objs.append(L.box(coll, "Wall_PartitionCross", 0, PARTITION_Z + 0.07, 2.45, 0.5, 0.02, 0.14, M["red"]))
objs.append(L.box(coll, "Wall_PartitionCrossV", 0, PARTITION_Z + 0.07, 2.27, 0.14, 0.02, 0.5, M["red"]))


def counter(name, cx, cz, top_mat):
    return L.furn(coll, name, cx, cz, 0.0, [
        (0, 0, 0.0, 2.6, 0.8, 1.0, M["white"], 0.02), (0, 0, 1.0, 2.7, 0.9, 0.05, top_mat, 0.01),
        (0, -0.41, 0.15, 2.4, 0.02, 0.2, M["accent"])])


objs.append(counter("nurse_desk", -4.6, 1.0, M["marble"]))
cols.add("NurseDesk", -4.6, 1.0, 0.0, 2.7, 0.9, 1.05)
objs.append(L.furn(coll, "NurseDesk_Props", -4.6, 1.0, 0.0, [
    (-0.8, 0.1, 1.05, 0.5, 0.06, 0.32, M["black"]), (-0.8, 0.12, 1.37, 0.46, 0.02, 0.26, M["screen"]),
    (0.5, 0.05, 1.05, 0.3, 0.22, 0.03, M["white"]), (0.9, 0.0, 1.05, 0.08, 0.08, 0.14, M["red"])]))
objs.append(L.furn(coll, "NPC_Nurse", -4.6, -0.05, math.pi, [
    (-0.11, 0, 0.0, 0.14, 0.18, 0.82, M["scrubs"], 0.02), (0.11, 0, 0.0, 0.14, 0.18, 0.82, M["scrubs"], 0.02),
    (0, 0, 0.82, 0.44, 0.24, 0.6, M["scrubs"], 0.04), (0, -0.125, 1.18, 0.12, 0.01, 0.12, M["red"]),
    (-0.28, -0.04, 0.86, 0.11, 0.13, 0.54, M["scrubs"], 0.02), (0.28, -0.04, 0.86, 0.11, 0.13, 0.54, M["scrubs"], 0.02),
    (0, 0, 1.42, 0.1, 0.1, 0.06, M["skin"]), (0, 0, 1.48, 0.26, 0.26, 0.28, M["skin"], 0.05),
    (0, 0.04, 1.68, 0.28, 0.22, 0.12, M["hair"], 0.03), (0, 0.02, 1.76, 0.24, 0.2, 0.08, M["white"], 0.02),
    (0, -0.105, 1.79, 0.07, 0.01, 0.03, M["red"]), (-0.06, -0.13, 1.6, 0.03, 0.01, 0.03, M["black"]), (0.06, -0.13, 1.6, 0.03, 0.01, 0.03, M["black"])]))
cols.add("Nurse", -4.6, -0.05, 0.0, 0.7, 0.4, 1.8)
objs.append(L.furn(coll, "NurseCabinet", -5.2, -2.25, math.pi, [
    (0, 0, 0.0, 3.0, 0.5, 1.8, M["white"], 0.02), (-0.75, -0.26, 0.3, 1.4, 0.02, 1.3, M["accent"]), (0.75, -0.26, 0.3, 1.4, 0.02, 1.3, M["accent"])]))
cols.add("NurseCabinet", -5.2, -2.25, 0.0, 3.0, 0.5, 1.8)

objs.append(counter("pharmacy_counter", 4.6, 1.0, M["marble"]))
cols.add("PharmacyCounter", 4.6, 1.0, 0.0, 2.7, 0.9, 1.05)
objs.append(L.furn(coll, "PharmacyCounter_Props", 4.6, 1.0, 0.0, [
    (-0.7, 0.05, 1.05, 0.36, 0.26, 0.24, M["black"]), (-0.7, -0.08, 1.2, 0.3, 0.02, 0.08, M["screen"]),
    (0.4, 0.0, 1.05, 0.22, 0.14, 0.12, M["pill_a"]), (0.7, 0.05, 1.05, 0.18, 0.12, 0.16, M["pill_b"]), (0.95, -0.05, 1.05, 0.2, 0.14, 0.1, M["pill_c"])]))
shelf = [(0, 0.2, 0.0, 3.2, 0.05, 2.2, M["white"], 0.01), (-1.575, 0, 0.0, 0.05, 0.45, 2.2, M["white"], 0.01),
         (1.575, 0, 0.0, 0.05, 0.45, 2.2, M["white"], 0.01), (0, 0, 2.15, 3.2, 0.45, 0.05, M["white"], 0.01), (0, 0, 0.0, 3.2, 0.45, 0.1, M["white"])]
box_mats = (M["pill_a"], M["pill_b"], M["pill_c"], M["red"])
for row, y in enumerate((0.45, 1.0, 1.55)):
    shelf.append((0, -0.05, y - 0.04, 3.1, 0.4, 0.03, M["oak"]))
    for k in range(7):
        shelf.append((-1.35 + k * 0.45, -0.12, y, 0.3, 0.2, 0.22 + 0.06 * ((k + row) % 3), box_mats[(k + row) % 4], 0.01))
objs.append(L.furn(coll, "PharmacyShelf", 5.3, -2.25, math.pi, shelf))
cols.add("PharmacyShelf", 5.3, -2.25, 0.0, 3.2, 0.45, 2.2)
objs.append(L.box(coll, "Wall_PharmacyCross", 5.3, PARTITION_Z + 0.07, 2.35, 0.5, 0.02, 0.14, M["pill_c"]))
objs.append(L.box(coll, "Wall_PharmacyCrossV", 5.3, PARTITION_Z + 0.07, 2.17, 0.14, 0.02, 0.5, M["pill_c"]))

for k, cz in enumerate((2.9, 3.6, 4.3), start=1):
    objs.append(L.furn(coll, f"seat_waiting_{k:02d}", -6.4, cz, -math.pi / 2, L.chair_parts(M, M["seat"])))
objs.append(L.furn(coll, "WaitingTable", -6.4, 2.2, 0.0, [(0, 0, 0.0, 0.5, 0.5, 0.45, M["oak"], 0.02), (0.05, 0.0, 0.45, 0.3, 0.22, 0.03, M["pill_b"])]))
cols.add("Waiting", -6.4, 3.25, 0.0, 0.6, 2.6, 0.9)
objs.append(L.furn(coll, "WaterCooler", 6.5, 4.2, 0.0, [(0, 0, 0.0, 0.4, 0.4, 1.0, M["white"], 0.03), (0, 0, 1.0, 0.3, 0.3, 0.45, M["water"], 0.03)]))
cols.add("WaterCooler", 6.5, 4.2, 0.0, 0.45, 0.45, 1.45)
objs.append(L.plant(coll, M, "Plant_01", 6.4, 3.3))
cols.add("Plant_01", 6.4, 3.3, 0.0, 0.4, 0.4, 1.0)

beds = []
for i, bx in enumerate((-4.6, 0.0, 4.6), start=1):
    tag = f"{i:02d}"
    objs.append(L.furn(coll, f"bed_{tag}", bx, -7.85, 0.0, [
        (0, 0, 0.0, 1.0, 2.0, 0.5, M["steel"], 0.02), (0, 0, 0.5, 0.95, 1.95, 0.14, M["sheet"], 0.03),
        (0, 0.3, 0.64, 0.97, 1.3, 0.05, M["blanket"], 0.02), (0, -0.75, 0.64, 0.6, 0.35, 0.12, M["sheet"], 0.04),
        (0, -0.98, 0.0, 1.04, 0.06, 1.0, M["steel"], 0.02), (0, 0.98, 0.0, 1.04, 0.06, 0.58, M["steel"], 0.02)]))
    cols.add(f"Bed_{tag}", bx, -7.85, 0.0, 1.04, 2.0, 0.7)
    objs.append(L.furn(coll, f"BedSide_{tag}", bx + 0.95, -8.55, math.pi, [
        (0, 0, 0.0, 0.5, 0.45, 0.7, M["white"], 0.02), (0, 0.02, 0.7, 0.34, 0.22, 0.26, M["black"], 0.01), (0, -0.1, 0.74, 0.3, 0.02, 0.18, M["screen"])]))
    cols.add(f"BedSide_{tag}", bx + 0.95, -8.55, 0.0, 0.5, 0.45, 1.0)
    objs.append(L.furn(coll, f"IVStand_{tag}", bx - 0.85, -8.3, 0.0, [
        (0, 0, 0.0, 0.4, 0.06, 0.04, M["metal"]), (0, 0, 0.0, 0.06, 0.4, 0.04, M["metal"]), (0, 0, 0.0, 0.04, 0.04, 1.8, M["steel"]),
        (0, 0, 1.75, 0.3, 0.03, 0.03, M["steel"]), (0.1, 0, 1.4, 0.12, 0.05, 0.25, M["water"])]))
    beds.append({"id": f"bed_{tag}", "bed": [bx, 0.0, -7.85], "position": [bx, 0.0, -6.0], "yaw": math.pi})
for j, cx in enumerate((-2.3, 2.3), start=1):
    objs.append(L.box(coll, f"Curtain_{j:02d}", cx, -7.6, 0.1, 0.04, 2.6, 2.1, M["curtain"]))
    objs.append(L.box(coll, f"Wall_CurtainRail_{j:02d}", cx, -7.6, 2.75, 0.05, 2.8, 0.04, M["steel"]))
    cols.add(f"Curtain_{j:02d}", cx, -7.6, 0.0, 0.08, 2.6, 2.2)
objs.append(L.box(coll, "Wall_FirstAidPoster", -6.88, -5.2, 1.2, 0.02, 0.9, 1.2, M["white"]))
objs.append(L.box(coll, "Wall_FirstAidPosterCross", -6.86, -5.2, 1.75, 0.02, 0.4, 0.12, M["red"]))
objs.append(L.box(coll, "Wall_FirstAidPosterCrossV", -6.86, -5.2, 1.61, 0.02, 0.12, 0.4, M["red"]))
objs.append(L.plant(coll, M, "Plant_02", 6.4, -3.3))
cols.add("Plant_02", 6.4, -3.3, 0.0, 0.4, 0.4, 1.0)

bad = L.check_grounded(objs, allow=L.ALLOW_INTERIOR + ("NurseDesk_Props", "PharmacyCounter_Props", "Curtain_"))
print("INTERIOR grounded violations:", bad)
assert not bad, bad
L.export_glb(os.path.join(OUT, "interior.glb"), objs)
L.export_glb(os.path.join(OUT, "interior.colsrc.glb"), objs + cols.items)
L.write_json(os.path.join(OUT, "interior.layout.json"), {
    "version": 1, "key": KEY, "name": NAME, "spawn": [0.0, 1.6, 3.7],
    "exit": {"position": [0.0, 4.75], "radius": 1.4},
    "stations": [
        {"id": "station_clinic_nurse", "role": "consultation", "desk": "nurse_desk", "position": [-4.6, 0.0, 2.1], "yaw": 0.0, "lookAt": [-4.6, 1.5, -0.05]},
        {"id": "station_clinic_pharmacy", "role": "pharmacy", "desk": "pharmacy_counter", "position": [4.6, 0.0, 2.1], "yaw": 0.0, "lookAt": [4.6, 1.0, 1.0]},
    ],
    "npcs": {"nurse": [-4.6, 0.0, -0.05]}, "counters": {"pharmacy": [4.6, 0.0, 1.0]},
    "beds": beds, "seats": [],
})

def triangles(items):
    return sum(len(p.vertices) - 2 for o in items if o.type == "MESH" for p in o.data.polygons)


print("interior:", len(objs), "objects,", len(cols.items), "collision boxes,", triangles(objs), "triangles")

exec(open(os.path.join(HERE, "build_clinic_ext.py"), encoding="utf-8").read())
