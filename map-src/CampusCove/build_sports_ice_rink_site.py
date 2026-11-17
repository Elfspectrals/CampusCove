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

KEY = "sports_ice_rink"
OUT = os.path.join(L.OUT_ROOT, "park", KEY)
HALL_OUT = os.path.join(L.OUT_ROOT, "work", KEY)
FP = SP.FOOTPRINTS[KEY]
ZONE = {"minX": FP[0], "maxX": FP[1], "minZ": FP[2], "maxZ": FP[3]}
STUB = SP.DOOR_STUBS[KEY]
DOOR_Z = (STUB[2] + STUB[3]) / 2
FRONT_X = FP[1] - 3.0
YAW = math.pi / 2
FORECOURT_HALF = 10.0

ext = json.load(open(os.path.join(HALL_OUT, "exterior.layout.json")))
inner = json.load(open(os.path.join(HALL_OUT, "interior.layout.json")))
POS = (FRONT_X - ext["doorLocal"][2], DOOR_Z)
ox, oy, oz = ext["interiorOffset"]
cos_y, sin_y = math.cos(YAW), math.sin(YAW)


def to_world(lx, ly, lz):
    return [round(POS[0] + lx * cos_y + lz * sin_y, 3), round(ly, 3), round(POS[1] - lx * sin_y + lz * cos_y, 3)]


def interior_to_world(p):
    return to_world(p[0] + ox, p[1] + oy, p[2] + oz)


sc = L.new_build_scene("PARK_" + KEY)
coll = bpy.data.collections.new(KEY)
sc.collection.children.link(coll)
site = S.Site(coll, "SportsIceRink", seed=81)
shared = SP.site_materials()
M = {
    "lawn": shared["lawn"],
    "paving": shared["paving"],
    "iron": L.make_mat("TW_SportsIceRinkBenchIron", "#2e3236", 0.6, "noise", 0.02),
    "wood": L.make_mat("TW_SportsIceRinkBenchWood", "#9c6b43", 0.85, "planks", 0.05, accent="#7e5433"),
    "trunk": L.make_mat("TW_SportsIceRinkTrunk", "#7a5a3c", 0.85, "planks", 0.05, accent="#5c4229"),
    "leaf": L.make_mat("TW_SportsIceRinkLeaf", "#6e9a4c", 0.9, "noise", 0.07),
    "leaf_light": L.make_mat("TW_SportsIceRinkLeafLight", "#8fb262", 0.9, "noise", 0.07),
    "leaf_dark": L.make_mat("TW_SportsIceRinkLeafDark", "#3f6b3c", 0.9, "noise", 0.06),
}

fw, fd = ext["footprint"]
body_center = to_world(0.0, 0.0, ext["footprintCenterZ"])
plinth = (body_center[0] - fd / 2 - 0.2, body_center[0] + fd / 2 + 0.2, body_center[2] - fw / 2 - 0.2, body_center[2] + fw / 2 + 0.2)
assert ZONE["minX"] <= plinth[0] and plinth[1] <= ZONE["maxX"] and ZONE["minZ"] <= plinth[2] and plinth[3] <= ZONE["maxZ"], ("hall outside its footprint", plinth)

forecourt = (plinth[1], ZONE["maxX"], DOOR_Z - FORECOURT_HALF, DOOR_Z + FORECOURT_HALF)
for k, (a, b_, c, d) in enumerate([(ZONE["minX"], plinth[1], ZONE["minZ"], ZONE["maxZ"]),
                                   (plinth[1], ZONE["maxX"], ZONE["minZ"], forecourt[2]),
                                   (plinth[1], ZONE["maxX"], forecourt[3], ZONE["maxZ"])]):
    S.rect(site, f"SIR_Lawn{k}", a, c, b_, d, 0.0, SP.Y["lawn"], M["lawn"], tile=3.0)
S.rect(site, "SIR_Forecourt", forecourt[0], forecourt[2], forecourt[1], forecourt[3], 0.0, SP.Y["paving"], M["paving"])
for side, z in (("N", forecourt[2] + 1.0), ("S", forecourt[3] - 1.0)):
    S.bench(site, f"SIR_Bench{side}", (forecourt[0] + forecourt[1]) / 2, z, 0.0 if side == "S" else math.pi, M)
for k, (x, z) in enumerate(((ZONE["maxX"] - 1.2, ZONE["minZ"] + 6.0), (ZONE["maxX"] - 1.2, ZONE["maxZ"] - 6.0),
                            (ZONE["maxX"] - 1.2, DOOR_Z - 17.0), (ZONE["maxX"] - 1.2, DOOR_Z + 17.0))):
    S.tree(site, f"SIR_Tree{k}", x, z, M, scale=0.9 + 0.1 * (k % 2))

site.cols.append({"name": "COL_Work_sports_ice_rink", "cx": body_center[0], "cz": body_center[2], "hx": round(ext["collision"][0]["hz"], 3),
                  "hz": round(ext["collision"][0]["hx"], 3), "hy": ext["collision"][0]["hy"], "cy": ext["collision"][0]["hy"], "yaw": 0.0})
for c in site.cols:
    assert ZONE["minX"] <= c["cx"] - abs(c["hx"]) + 1e-6 and c["cx"] + abs(c["hx"]) <= ZONE["maxX"] + 1e-6, c
    assert ZONE["minZ"] <= c["cz"] - abs(c["hz"]) + 1e-6 and c["cz"] + abs(c["hz"]) <= ZONE["maxZ"] + 1e-6, c
feet = [o for o in site.objs if o.type == "MESH" and ("Bench" in o.name or o.name.endswith("_Trunk"))]
bad = L.check_grounded(feet)
assert not bad, bad

L.export_glb(os.path.join(OUT, f"{KEY}.glb"), site.objs, use_active_scene=True)
coach = interior_to_world(inner["npcs"]["rinkCoach"])
L.write_json(os.path.join(OUT, f"{KEY}.layout.json"), {
    "version": 1,
    "zone": ZONE,
    "building": {
        "kind": "work", "key": KEY, "name": ext["name"], "job": "sports",
        "position": [POS[0], 0.0, POS[1]], "rotationY": round(YAW, 4),
        "door": to_world(*ext["doorLocal"]), "footprint": [round(fw, 3), round(fd, 3)], "interiorOffset": ext["interiorOffset"],
    },
    "points": {"rinkCoach": coach, "coachYaw": round(YAW, 4)},
    "collision": site.cols,
})
print(f"{KEY}: {len(site.objs)} objects, {site.tris()} tris, {len(site.cols)} COL, door {to_world(*ext['doorLocal'])}, coach {coach}")
L.snapshot(sc, os.path.join(OUT, "site_preview.png"), (-470.0, 60.0, -240.0), (-521.0, 0.0, -275.0), lens=24, res=(960, 640))
