import importlib
import json
import math
import os
import sys

if "__file__" not in globals():
    raise RuntimeError('Run with exec(open(p).read(), {"__file__": p}) so the script can find lib_common.py')
HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import lib_common as L
importlib.reload(L)
import lib_site as S
importlib.reload(S)
import lib_sports as SP
importlib.reload(SP)
import bpy

KEY = "sports_climbing"
OUT = os.path.join(L.OUT_ROOT, "park", KEY)
HALL_OUT = os.path.join(L.OUT_ROOT, "work", KEY)
Y = SP.Y
FX0, FX1, FZ0, FZ1 = SP.FOOTPRINTS[KEY]
APRON = 1.0
PATH_HALF = 2.0

ext = json.load(open(os.path.join(HALL_OUT, "exterior.layout.json")))
inner = json.load(open(os.path.join(HALL_OUT, "interior.layout.json")))
pos_x, _, pos_z = ext["position"]
yaw = ext["rotationY"]
ox, oy, oz = ext["interiorOffset"]
cos_y, sin_y = math.cos(yaw), math.sin(yaw)


def to_world(lx, ly, lz):
    return [round(pos_x + lx * cos_y + lz * sin_y, 3), round(ly, 3), round(pos_z - lx * sin_y + lz * cos_y, 3)]


def interior_to_world(p):
    return to_world(p[0] + ox, p[1] + oy, p[2] + oz)


sc = L.new_build_scene("PARK_" + KEY)
coll = bpy.data.collections.new(KEY)
sc.collection.children.link(coll)
site = S.Site(coll, "SportsClimbing", seed=91)
shared = SP.site_materials()
M = {
    "lawn": shared["lawn"],
    "paving": shared["paving"],
    "iron": L.make_mat("TW_SportsFencePost", "#2e3236", 0.6, "noise", 0.02),
    "lamp": L.make_mat("TW_SportsLampGlow", "#fff1c4", 0.5, "noise", 0.0, emit="#ffd27a", emit_strength=1.4),
    "wood": L.make_mat("TW_SportsBenchWood", "#9c6b43", 0.85, "planks", 0.05, accent="#7e5433"),
    "trunk": L.make_mat("TW_SportsTrunk", "#7a5a3c", 0.85, "planks", 0.05, accent="#5c4229"),
    "leaf": L.make_mat("TW_SportsLeaf", "#6e9a4c", 0.9, "noise", 0.07),
    "leaf_light": L.make_mat("TW_SportsLeafLight", "#8fb262", 0.9, "noise", 0.07),
}

door = to_world(*ext["doorLocal"])
body = ext["collision"][0]
body_center = to_world(0.0, 0.0, ext["footprintCenterZ"])
fp_w, fp_d = ext["footprint"]
hall = (body_center[0] - fp_d / 2 - 0.2, body_center[0] + fp_d / 2 + 0.2, body_center[2] - fp_w / 2 - 0.2, body_center[2] + fp_w / 2 + 0.2)
assert FX0 <= hall[0] and hall[1] <= FX1 and FZ0 <= hall[2] and hall[3] <= FZ1, ("hall outside its footprint", hall)
assert abs(hall[1] - door[0] - 0.2) < 0.05, ("the door must be on the east face", door, hall)

ax0, ax1, az0, az1 = hall[0] - APRON, hall[1] + APRON, hall[2] - APRON, hall[3] + APRON
S.rect(site, "SCl_Apron", ax0, az0, ax1, az1, 0.0, Y["paving"], M["paving"], tile=2.0)
S.rect(site, "SCl_Path", ax1, door[2] - PATH_HALF, FX1, door[2] + PATH_HALF, 0.0, Y["paving"], M["paving"], tile=2.0)
for k, (x0, x1, z0, z1) in enumerate(((FX0, FX1, FZ0, az0), (FX0, FX1, az1, FZ1), (FX0, ax0, az0, az1), (ax1, FX1, az0, door[2] - PATH_HALF),
                                      (ax1, FX1, door[2] + PATH_HALF, az1))):
    S.rect(site, f"SCl_Lawn{k}", x0, z0, x1, z1, 0.0, Y["lawn"], M["lawn"], tile=3.0)
for k, dz in enumerate((-4.0, 4.0)):
    S.bench(site, f"SCl_Bench{k}", hall[1] + 0.55, door[2] + dz, math.pi / 2, M)
S.street_lamp(site, "SCl_Lamp", FX1 - 0.7, door[2] - PATH_HALF - 0.8, M)
for k, z in enumerate((FZ0 + 0.9, FZ1 - 0.9)):
    S.tree(site, f"SCl_Tree{k}", FX1 - 0.9, z, M, scale=0.7)

site.cols.append({"name": "COL_Work_sports_climbing", "cx": body_center[0], "cz": body_center[2], "hx": round(body["hz"], 3), "hz": round(body["hx"], 3),
                  "hy": body["hy"], "cy": body["hy"], "yaw": 0.0})
for c in site.cols:
    assert FX0 <= c["cx"] - c["hx"] and c["cx"] + c["hx"] <= FX1 and FZ0 <= c["cz"] - c["hz"] and c["cz"] + c["hz"] <= FZ1, ("collision outside the footprint", c)
feet = [o for o in site.objs if o.type == "MESH" and (o.name.endswith("_Base") or "Bench" in o.name or o.name.endswith("_Trunk"))]
assert not L.check_grounded(feet)

L.export_glb(os.path.join(OUT, f"{KEY}.glb"), site.objs, use_active_scene=True)
L.write_json(os.path.join(OUT, f"{KEY}.layout.json"), {
    "version": 1,
    "zone": {"minX": FX0, "maxX": FX1, "minZ": FZ0, "maxZ": FZ1},
    "hall": {
        "kind": "work", "key": KEY, "name": ext["name"], "job": "sports",
        "position": [pos_x, 0.0, pos_z], "rotationY": round(yaw, 4),
        "door": door, "footprint": [round(fp_w, 3), round(fp_d, 3)], "interiorOffset": ext["interiorOffset"],
    },
    "points": {
        "shoeAttendant": interior_to_world(inner["npcs"]["shoeAttendant"]),
    },
    "collision": site.cols,
})
print(f"{KEY}: {len(site.objs)} objects, {site.tris()} tris, {len(site.cols)} COL, door {door}, hall {hall}")
