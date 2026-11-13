"""Cove Storage site: lawn, path from the east hedge gate, lamps and way sign. Run build_storage_warehouse.py first. Outputs: out/park/storage_site/{storage_site.glb,storage_site.layout.json}, then `npm run assets:optimize -- park` and `node scripts/apply-storage.mjs`."""
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

STORAGE_POS = (150.0, 9.0)
STORAGE_YAW = -math.pi / 2
GATE = {"x": 45.12, "z": 8.97, "width": 6.0}
PATH_W = 2.6
OUT = os.path.join(L.OUT_ROOT, "park", "storage_site")
STORAGE_OUT = os.path.join(L.OUT_ROOT, "work", "storage")

ext = json.load(open(os.path.join(STORAGE_OUT, "exterior.layout.json")))
inner = json.load(open(os.path.join(STORAGE_OUT, "interior.layout.json")))
ox, oy, oz = ext["interiorOffset"]
cos_y, sin_y = math.cos(STORAGE_YAW), math.sin(STORAGE_YAW)


def to_world(lx, ly, lz):
    return [round(STORAGE_POS[0] + lx * cos_y + lz * sin_y, 3), round(ly, 3), round(STORAGE_POS[1] - lx * sin_y + lz * cos_y, 3)]


def interior_to_world(p):
    return to_world(p[0] + ox, p[1] + oy, p[2] + oz)


def world_yaw(local_yaw):
    return round((local_yaw + STORAGE_YAW) % (2 * math.pi), 4)


door = to_world(*ext["doorLocal"])
step_end_x = door[0] - 2.0

sc = L.new_build_scene("PARK_storage_site")
coll = bpy.data.collections.new("StorageSite")
sc.collection.children.link(coll)
P = {
    "paving": L.make_mat("TW_PavingStorage", "#c9c2b4", 0.9, "tiles", 0.03, accent="#b0a99b"),
    "asphalt": L.make_mat("TW_AsphaltStorage", "#5d6064", 0.95, "noise", 0.04),
    "curb": L.make_mat("TW_CurbStorage", "#9a9a9a", 0.8, "noise", 0.03),
    "grass": L.make_mat("TW_GrassStorage", "#79b765", 1.0, "noise", 0.06),
    "metal": L.make_mat("TW_MetalStorage", "#3a3f47", 0.4, "noise", 0.03),
    "lamp": L.make_mat("TW_LampGlowStorage", "#fff1c4", 0.5, "noise", 0.0, emit="#fff1c4"),
    "board": L.make_mat("TW_StorageSignBoard", "#20262b", 0.7, "noise", 0.02),
    "sign": L.make_mat("TW_StorageSignGlow", "#ffd36a", 0.4, "noise", 0.0, emit="#ffc84a", emit_strength=1.2),
}
so = []
col = []


def add_col(name, gx, gz, sx, sz, h):
    col.append({"name": name, "cx": round(gx, 3), "cz": round(gz, 3), "hx": round(sx / 2, 3), "hz": round(sz / 2, 3), "hy": round(h / 2, 3), "cy": round(h / 2, 3), "yaw": 0.0})


LAWN = (GATE["x"] + 0.5, 178.0, -14.0, 32.0)
so.append(L.box(coll, "SS_Lawn", (LAWN[0] + LAWN[1]) / 2, (LAWN[2] + LAWN[3]) / 2, 0.0, LAWN[1] - LAWN[0], LAWN[3] - LAWN[2], 0.02, P["grass"], tile=2.0))
path_x0, path_x1 = GATE["x"] + 0.5, step_end_x + 0.2
so.append(L.box(coll, "SS_Path", (path_x0 + path_x1) / 2, GATE["z"], 0.0, path_x1 - path_x0, PATH_W, 0.04, P["paving"], tile=2.0))
for side, dz in (("N", -PATH_W / 2 - 0.1), ("S", PATH_W / 2 + 0.1)):
    so.append(L.box(coll, f"SS_Curb{side}", (path_x0 + path_x1) / 2, GATE["z"] + dz, 0.0, path_x1 - path_x0, 0.2, 0.08, P["curb"]))
so.append(L.box(coll, "SS_Forecourt", step_end_x - 4.0, GATE["z"], 0.0, 8.0, 14.0, 0.035, P["asphalt"], tile=2.0))

for i, gx in enumerate(range(52, int(step_end_x - 6), 12)):
    gz = GATE["z"] + (PATH_W / 2 + 0.8) * (1 if i % 2 == 0 else -1)
    so.append(L.cyl(coll, f"SS_Lamp{i}_Pole", gx, gz, 0.0, 0.07, 3.2, P["metal"], seg=6))
    so.append(L.box(coll, f"SS_Lamp{i}_Head", gx, gz, 3.2, 0.5, 0.5, 0.3, P["lamp"], bevel=0.03))
    add_col(f"COL_Storage_Lamp{i}", gx, gz, 0.3, 0.3, 3.4)

sign_x, sign_z = GATE["x"] + 3.0, GATE["z"] + PATH_W / 2 + 1.4
so.append(L.box(coll, "SS_WayPost", sign_x, sign_z, 0.0, 0.14, 0.14, 2.3, P["metal"]))
so.append(L.box(coll, "SS_WayBoard", sign_x, sign_z, 1.5, 0.12, 2.6, 0.8, P["board"]))
way_text = L.text_mesh(coll, "SS_WayText", "STORAGE  >", sign_x - 0.07, sign_z, 1.68, 0.32, 0.0, P["sign"])
way_text.rotation_euler[2] = -math.pi / 2
so.append(way_text)
add_col("COL_Storage_WaySign", sign_x, sign_z, 0.3, 2.6, 2.3)

bad = L.check_grounded(so, allow=("SS_Lawn", "SS_Path", "SS_Curb", "SS_Forecourt", "SS_Lamp", "SS_Way"))
print("SITE grounded violations:", bad)
assert not bad, bad

fp_w, fp_d = ext["footprint"]
body_center = to_world(0.0, 0.0, ext["footprintCenterZ"])
body = ext["collision"][0]
add_col("COL_Work_storage", body_center[0], body_center[2], 2 * body["hz"], 2 * body["hx"], 2 * body["hy"])

L.export_glb(os.path.join(OUT, "storage_site.glb"), so)
L.write_json(os.path.join(OUT, "storage_site.layout.json"), {
    "version": 1,
    "bounds": {"minX": GATE["x"], "maxX": LAWN[1], "minZ": LAWN[2], "maxZ": LAWN[3]},
    "gate": GATE,
    "storage": {
        "key": "storage", "name": ext["name"],
        "position": [STORAGE_POS[0], 0.0, STORAGE_POS[1]], "rotationY": STORAGE_YAW,
        "door": door, "footprint": [fp_w, fp_d], "interiorOffset": ext["interiorOffset"],
    },
    "points": {
        "auctioneer": interior_to_world(inner["npcs"]["auctioneer"]),
        "lotBoard": interior_to_world(inner["lotBoard"]),
        "units": [{
            "id": u["id"], "door": u["door"],
            "threshold": interior_to_world(u["threshold"]),
            "inside": interior_to_world([u["inside"]["cx"], 0.0, u["inside"]["cz"]]),
            "size": [u["inside"]["sx"], u["inside"]["h"], u["inside"]["sz"]],
            "yaw": world_yaw(u["facing"]),
        } for u in inner["units"]],
    },
    "collision": col,
})
tris = sum(len(p.vertices) - 2 for o in so for p in o.data.polygons)
print("site:", len(so), "objects,", tris, "triangles,", len(col), "collision boxes, door", door)
L.snapshot(sc, os.path.join(OUT, "site_preview.png"), (40, 30, 9), (140, 0, 9), lens=24, res=(960, 540))
