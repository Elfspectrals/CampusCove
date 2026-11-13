"""Cove Storage site, south of the pond park: lawn, path from the pond's storage gate, forecourt and lamps. Run build_pond.py and build_storage_warehouse.py first. Outputs: out/park/storage_site/{storage_site.glb,storage_site.layout.json}, then `npm run assets:optimize -- park` and `node scripts/apply-storage.mjs`."""
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

PATH_W = 2.6
OUT = os.path.join(L.OUT_ROOT, "park", "storage_site")
STORAGE_OUT = os.path.join(L.OUT_ROOT, "work", "storage")
pond_gate = json.load(open(os.path.join(L.OUT_ROOT, "park", "pond", "pond.layout.json")))["storageGate"]
GATE = {"x": pond_gate["x"], "z": pond_gate["z"], "width": pond_gate["width"]}
STORAGE_POS = (GATE["x"], -110.0)
STORAGE_YAW = 0.0

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
step_end_z = door[2] + 2.0

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
}
so = []
col = []


def add_col(name, gx, gz, sx, sz, h):
    col.append({"name": name, "cx": round(gx, 3), "cz": round(gz, 3), "hx": round(sx / 2, 3), "hz": round(sz / 2, 3), "hy": round(h / 2, 3), "cy": round(h / 2, 3), "yaw": 0.0})


LAWN = (GATE["x"] - 13.0, GATE["x"] + 13.0, -132.0, -84.0)
so.append(L.box(coll, "SS_Lawn", (LAWN[0] + LAWN[1]) / 2, (LAWN[2] + LAWN[3]) / 2, 0.0, LAWN[1] - LAWN[0], LAWN[3] - LAWN[2], 0.02, P["grass"], tile=2.0))
FORECOURT_D = 6.0
path_z0, path_z1 = GATE["z"] - 1.5, step_end_z + FORECOURT_D - 0.2
so.append(L.box(coll, "SS_Path", GATE["x"], (path_z0 + path_z1) / 2, 0.0, PATH_W, path_z0 - path_z1, 0.04, P["paving"], tile=2.0))
for side, dx in (("W", -PATH_W / 2 - 0.1), ("E", PATH_W / 2 + 0.1)):
    so.append(L.box(coll, f"SS_Curb{side}", GATE["x"] + dx, (path_z0 + path_z1) / 2, 0.0, 0.2, path_z0 - path_z1, 0.08, P["curb"]))
so.append(L.box(coll, "SS_Forecourt", GATE["x"], step_end_z + FORECOURT_D / 2, 0.0, 14.0, FORECOURT_D, 0.035, P["asphalt"], tile=2.0))

for i, dx in enumerate((-6.5, 6.5)):
    gx, gz = GATE["x"] + dx, step_end_z + FORECOURT_D - 0.5
    so.append(L.cyl(coll, f"SS_Lamp{i}_Pole", gx, gz, 0.0, 0.07, 3.2, P["metal"], seg=6))
    so.append(L.box(coll, f"SS_Lamp{i}_Head", gx, gz, 3.2, 0.5, 0.5, 0.3, P["lamp"], bevel=0.03))
    add_col(f"COL_Storage_Lamp{i}", gx, gz, 0.3, 0.3, 3.4)

bad = L.check_grounded(so, allow=("SS_Lawn", "SS_Path", "SS_Curb", "SS_Forecourt", "SS_Lamp"))
print("SITE grounded violations:", bad)
assert not bad, bad

fp_w, fp_d = ext["footprint"]
body_center = to_world(0.0, 0.0, ext["footprintCenterZ"])
body = ext["collision"][0]
add_col("COL_Work_storage", body_center[0], body_center[2], 2 * body["hx"], 2 * body["hz"], 2 * body["hy"])

L.export_glb(os.path.join(OUT, "storage_site.glb"), so)
L.write_json(os.path.join(OUT, "storage_site.layout.json"), {
    "version": 1,
    "bounds": {"minX": LAWN[0], "maxX": LAWN[1], "minZ": LAWN[2], "maxZ": GATE["z"]},
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
L.snapshot(sc, os.path.join(OUT, "site_preview.png"), (GATE["x"], 30, GATE["z"] + 10), (GATE["x"], 0, -110), lens=24, res=(960, 540))
