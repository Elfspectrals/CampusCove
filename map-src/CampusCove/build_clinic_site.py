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
import bpy

CLINIC_POS = (-112.0, 12.0)
CLINIC_YAW = math.pi / 2
GATE = {"x": -44.6, "z": 12.0, "width": 11.0}
PATH_W = 2.6
EYE_HEIGHT = 1.6
BED_TOP = 0.65
OUT = os.path.join(L.OUT_ROOT, "park", "clinic_site")
CLINIC_OUT = os.path.join(L.OUT_ROOT, "work", "clinic")

ext = json.load(open(os.path.join(CLINIC_OUT, "exterior.layout.json")))
inner = json.load(open(os.path.join(CLINIC_OUT, "interior.layout.json")))
ox, oy, oz = ext["interiorOffset"]
cos_y, sin_y = math.cos(CLINIC_YAW), math.sin(CLINIC_YAW)


def to_world(lx, ly, lz):
    return [round(CLINIC_POS[0] + lx * cos_y + lz * sin_y, 3), round(ly, 3), round(CLINIC_POS[1] - lx * sin_y + lz * cos_y, 3)]


def interior_to_world(p):
    return to_world(p[0] + ox, p[1] + oy, p[2] + oz)


door = to_world(*ext["doorLocal"])
step_end_x = door[0] + 2.4

sc = L.new_build_scene("PARK_clinic_site")
coll = bpy.data.collections.new("ClinicSite")
sc.collection.children.link(coll)
P = {
    "paving": L.make_mat("TW_PavingClinic", "#c9c2b4", 0.9, "tiles", 0.03, accent="#b0a99b"),
    "curb": L.make_mat("TW_CurbClinic", "#9a9a9a", 0.8, "noise", 0.03),
    "grass": L.make_mat("TW_GrassClinic", "#79b765", 1.0, "noise", 0.06),
    "metal": L.make_mat("TW_MetalClinic", "#3a3f47", 0.4, "noise", 0.03),
    "lamp": L.make_mat("TW_LampGlowClinic", "#fff1c4", 0.5, "noise", 0.0, emit="#fff1c4"),
    "mint": L.make_mat("TW_ClinicMint", "#2f6f63", 0.7, "noise", 0.02),
    "sign": L.make_mat("TW_ClinicSignGlow", "#ffffff", 0.4, "noise", 0.0, emit="#ffffff", emit_strength=1.2),
    "red": L.make_mat("TW_ClinicCrossGlow", "#e0534f", 0.4, "noise", 0.0, emit="#ff6b62", emit_strength=1.2),
    "leaf": L.make_mat("TW_LeafClinic", "#4f9d54", 0.9, "noise", 0.06),
    "trunk": L.make_mat("TW_TrunkClinic", "#7a5638", 0.8, "planks", 0.04, accent="#5e4129"),
}
so = []
col = []


def add_col(name, gx, gz, sx, sz, h):
    col.append({"name": name, "cx": round(gx, 3), "cz": round(gz, 3), "hx": round(sx / 2, 3), "hz": round(sz / 2, 3), "hy": round(h / 2, 3), "cy": round(h / 2, 3), "yaw": 0.0})


LAWN = (-134.0, -98.0, -6.0, 30.0)
so.append(L.box(coll, "CS_Lawn", (LAWN[0] + LAWN[1]) / 2, (LAWN[2] + LAWN[3]) / 2, 0.0, LAWN[1] - LAWN[0], LAWN[3] - LAWN[2], 0.02, P["grass"], tile=2.0))
path_x0, path_x1 = step_end_x - 0.2, GATE["x"] - 0.5
so.append(L.box(coll, "CS_Path", (path_x0 + path_x1) / 2, GATE["z"], 0.0, path_x1 - path_x0, PATH_W, 0.04, P["paving"], tile=2.0))
for side, dz in (("N", -PATH_W / 2 - 0.1), ("S", PATH_W / 2 + 0.1)):
    so.append(L.box(coll, f"CS_Curb{side}", (path_x0 + path_x1) / 2, GATE["z"] + dz, 0.0, path_x1 - path_x0, 0.2, 0.08, P["curb"]))
so.append(L.box(coll, "CS_Forecourt", step_end_x + 3.0, GATE["z"], 0.0, 6.0, 9.0, 0.035, P["paving"], tile=2.0))

for i, gx in enumerate(range(-52, -100, -12)):
    gz = GATE["z"] + (PATH_W / 2 + 0.8) * (1 if i % 2 == 0 else -1)
    so.append(L.cyl(coll, f"CS_Lamp{i}_Pole", gx, gz, 0.0, 0.07, 3.2, P["metal"], seg=6))
    so.append(L.box(coll, f"CS_Lamp{i}_Head", gx, gz, 3.2, 0.5, 0.5, 0.3, P["lamp"], bevel=0.03))
    add_col(f"COL_Clinic_Lamp{i}", gx, gz, 0.3, 0.3, 3.4)

trees = [(-100.5, 3.0), (-100.5, 21.0), (-126.0, -2.0), (-126.0, 26.0), (-70.0, 5.5), (-82.0, 19.0)]
for i, gx in enumerate(range(-58, -100, -12)):
    gz = GATE["z"] - (PATH_W / 2 + 3.0) * (1 if i % 2 == 0 else -1)
    if all(math.hypot(gx - tx, gz - tz) > 4.0 for tx, tz in trees):
        trees.append((gx, gz))
for i, (gx, gz) in enumerate(trees):
    so.append(L.cyl(coll, f"CS_TreeTrunk{i}", gx, gz, 0.0, 0.22, 1.6, P["trunk"], seg=6))
    so.append(L.cone(coll, f"CS_TreeA{i}", gx, gz, 1.4, 1.6, 0.3, 2.4, P["leaf"], seg=7))
    add_col(f"COL_Clinic_Tree{i}", gx, gz, 0.6, 0.6, 3.0)

sign_x, sign_z = GATE["x"] - 3.0, GATE["z"] - PATH_W / 2 - 1.4
so.append(L.box(coll, "CS_WayPost", sign_x, sign_z, 0.0, 0.14, 0.14, 2.3, P["metal"]))
so.append(L.box(coll, "CS_WayBoard", sign_x, sign_z, 1.5, 0.12, 2.4, 0.8, P["mint"]))
so.append(L.text_mesh(coll, "CS_WayText", "CLINIC  >", sign_x + 0.07, sign_z, 1.68, 0.34, 0.03, P["sign"], facing="+x"))
add_col("COL_Clinic_WaySign", sign_x, sign_z, 0.3, 2.4, 2.3)

bad = L.check_grounded(so, allow=("CS_Lawn", "CS_Path", "CS_Curb", "CS_Forecourt", "CS_Lamp", "CS_Tree", "CS_Way"))
print("SITE grounded violations:", bad)
assert not bad, bad

fp_w, fp_d = ext["footprint"]
body_center = to_world(0.0, 0.0, ext["footprintCenterZ"])
body = ext["collision"][0]
add_col("COL_Work_clinic", body_center[0], body_center[2], 2 * body["hz"], 2 * body["hx"], 2 * body["hy"])

L.export_glb(os.path.join(OUT, "clinic_site.glb"), so)
L.write_json(os.path.join(OUT, "clinic_site.layout.json"), {
    "version": 1,
    "bounds": {"minX": LAWN[0], "maxX": GATE["x"], "minZ": LAWN[2], "maxZ": LAWN[3]},
    "gate": GATE,
    "clinic": {
        "key": "clinic", "name": ext["name"], "job": "medic",
        "position": [CLINIC_POS[0], 0.0, CLINIC_POS[1]], "rotationY": CLINIC_YAW,
        "door": door, "footprint": [fp_w, fp_d], "interiorOffset": ext["interiorOffset"],
    },
    "points": {
        "nurse": interior_to_world(inner["npcs"]["nurse"]),
        "pharmacy": interior_to_world(inner["counters"]["pharmacy"]),
        "beds": [{"id": b["id"], "position": interior_to_world([b["position"][0], EYE_HEIGHT, b["position"][2]]), "bed": interior_to_world([b["bed"][0], BED_TOP, b["bed"][2]]),
                  "yaw": round((b["yaw"] + CLINIC_YAW) % (2 * math.pi), 4)} for b in inner["beds"]],
    },
    "collision": col,
})
tris = sum(len(p.vertices) - 2 for o in so for p in o.data.polygons)
print("site:", len(so), "objects,", tris, "triangles,", len(col), "collision boxes, door", door)
