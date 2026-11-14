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

KEY = "sports_boxing"
OUT = os.path.join(L.OUT_ROOT, "park", KEY)
HALL_OUT = os.path.join(L.OUT_ROOT, "work", KEY)
X0, X1, Z0, Z1 = SP.FOOTPRINTS[KEY]
DOOR_Z = -228.0
YAW = -math.pi / 2
APRON_HALF = 3.0

ext = json.load(open(os.path.join(HALL_OUT, "exterior.layout.json")))
inner = json.load(open(os.path.join(HALL_OUT, "interior.layout.json")))
centre_x = (X0 + X1) / 2
POS = (centre_x + ext["footprintCenterZ"], DOOR_Z)
cos_y, sin_y = math.cos(YAW), math.sin(YAW)
ox, oy, oz = ext["interiorOffset"]


def to_world(lx, ly, lz):
    return [round(POS[0] + lx * cos_y + lz * sin_y, 3), round(ly, 3), round(POS[1] - lx * sin_y + lz * cos_y, 3)]


def interior_to_world(p):
    return to_world(p[0] + ox, p[1] + oy, p[2] + oz)


sc = L.new_build_scene("PARK_" + KEY)
coll = bpy.data.collections.new(KEY)
sc.collection.children.link(coll)
site = S.Site(coll, "SportsBoxing", seed=81)
shared = SP.site_materials()
M = {
    "lawn": shared["lawn"],
    "paving": shared["paving"],
    "wood": L.make_mat("TW_SportsBenchWood", "#9c6b43", 0.85, "planks", 0.05, accent="#7e5433"),
    "iron": L.make_mat("TW_SportsFencePost", "#2e3236", 0.6, "noise", 0.02),
}

door = to_world(*ext["doorLocal"])
fp_w, fp_d = ext["footprint"]
body_x = to_world(0.0, 0.0, ext["footprintCenterZ"])[0]
plinth = (body_x - fp_d / 2 - 0.2, body_x + fp_d / 2 + 0.2, POS[1] - fp_w / 2 - 0.2, POS[1] + fp_w / 2 + 0.2)
assert X0 <= plinth[0] and plinth[1] <= X1 and Z0 <= plinth[2] and plinth[3] <= Z1, ("hall outside its footprint", plinth)

S.rect(site, "SBx_Lawn", X0, Z0, X1, Z1, 0.0, SP.Y["lawn"], M["lawn"], tile=3.0)
S.rect(site, "SBx_Apron", X0, DOOR_Z - APRON_HALF, plinth[0], DOOR_Z + APRON_HALF, 0.0, SP.Y["paving"], M["paving"], tile=2.0)
for k, z in enumerate((DOOR_Z - 2.2, DOOR_Z + 2.2)):
    S.bench(site, f"Bench{k}", plinth[0] - 0.45, z, -math.pi / 2, M)

site.cols.append({"name": "COL_Work_sports_boxing", "cx": body_x, "cz": POS[1], "hx": round(ext["collision"][0]["hz"], 3),
                  "hz": round(ext["collision"][0]["hx"], 3), "hy": ext["collision"][0]["hy"], "cy": ext["collision"][0]["hy"], "yaw": 0.0})
for c in site.cols:
    assert X0 - 1e-6 <= c["cx"] - c["hx"] and c["cx"] + c["hx"] <= X1 + 1e-6 and Z0 - 1e-6 <= c["cz"] - c["hz"] and c["cz"] + c["hz"] <= Z1 + 1e-6, c

L.export_glb(os.path.join(OUT, f"{KEY}.glb"), site.objs, use_active_scene=True)
print(f"{KEY}: {len(site.objs)} objects, {site.tris()} tris, {len(site.cols)} COL")

box = inner["boxing"]
ring = box["ring"]
L.write_json(os.path.join(OUT, f"{KEY}.layout.json"), {
    "version": 1,
    "zone": {"minX": X0, "maxX": X1, "minZ": Z0, "maxZ": Z1},
    "hall": {
        "kind": "work", "key": KEY, "name": ext["name"], "job": "sports",
        "position": [POS[0], 0.0, POS[1]], "rotationY": round(YAW, 4),
        "door": door, "footprint": [round(fp_w, 3), round(fp_d, 3)], "interiorOffset": ext["interiorOffset"],
    },
    "boxing": {
        "ring": {"centre": interior_to_world(ring["centre"]), "half": ring["half"]},
        "corners": {k: interior_to_world(v) for k, v in box["corners"].items()},
        "exits": {k: interior_to_world(v) for k, v in box["exits"].items()},
        "coach": interior_to_world(inner["npcs"]["coach"]),
        "coachYaw": round(YAW, 4),
        "bags": [interior_to_world(b) for b in box["bags"]],
    },
    "adminTeleport": {"position": [round(X0 + 1.0, 3), 0.0, DOOR_Z], "yaw": round(YAW, 4)},
    "collision": site.cols,
})
print("door", door, "coach", interior_to_world(inner["npcs"]["coach"]), "ring", interior_to_world(ring["centre"]))
