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

PI = math.pi
KEY = "sports_dance"
OUT = os.path.join(L.OUT_ROOT, "park", KEY)
STUDIO_OUT = os.path.join(L.OUT_ROOT, "work", KEY)
Y = SP.Y
FX0, FX1, FZ0, FZ1 = SP.FOOTPRINTS[KEY]
DOOR_Z = -200.5
WEST_FACE_X = -395.0
STUDIO_YAW = -PI / 2
PATH_W = 3.0
APRON_W = 1.5

ext = json.load(open(os.path.join(STUDIO_OUT, "exterior.layout.json")))
inner = json.load(open(os.path.join(STUDIO_OUT, "interior.layout.json")))
STUDIO_POS = (WEST_FACE_X + ext["doorLocal"][2], DOOR_Z)
ox, oy, oz = ext["interiorOffset"]
cos_y, sin_y = math.cos(STUDIO_YAW), math.sin(STUDIO_YAW)


def to_world(lx, ly, lz):
    return [round(STUDIO_POS[0] + lx * cos_y + lz * sin_y, 3), round(ly, 3), round(STUDIO_POS[1] - lx * sin_y + lz * cos_y, 3)]


def interior_to_world(p):
    return to_world(p[0] + ox, p[1] + oy, p[2] + oz)


sc = L.new_build_scene("PARK_" + KEY)
coll = bpy.data.collections.new(KEY)
sc.collection.children.link(coll)
site = S.Site(coll, "SportsDance", seed=81)
shared = SP.site_materials()
M = {
    "lawn": shared["lawn"],
    "paving": shared["paving"],
    "iron": L.make_mat("TW_SportsFencePost", "#2e3236", 0.6, "noise", 0.02),
    "wood": L.make_mat("TW_SportsBenchWood", "#9c6b43", 0.85, "planks", 0.05, accent="#7e5433"),
    "trunk": L.make_mat("TW_SportsTrunk", "#7a5a3c", 0.85, "planks", 0.05, accent="#5c4229"),
    "leaf": L.make_mat("TW_SportsLeaf", "#6e9a4c", 0.9, "noise", 0.07),
    "leaf_light": L.make_mat("TW_SportsLeafLight", "#8fb262", 0.9, "noise", 0.07),
    "leaf_dark": L.make_mat("TW_SportsLeafDark", "#3f6b3c", 0.9, "noise", 0.06),
}

door = to_world(*ext["doorLocal"])
body = ext["collision"][0]
body_center = to_world(0.0, 0.0, ext["footprintCenterZ"])
fp_w, fp_d = ext["footprint"]
plinth = (body_center[0] - fp_d / 2 - 0.2, body_center[0] + fp_d / 2 + 0.2, body_center[2] - fp_w / 2 - 0.2, body_center[2] + fp_w / 2 + 0.2)
assert FX0 <= plinth[0] and plinth[1] <= FX1 and FZ0 <= plinth[2] and plinth[3] <= FZ1, ("studio outside its footprint", plinth)

S.rect(site, "SD_Lawn", FX0, FZ0, FX1, FZ1, 0.0, Y["lawn"], M["lawn"], tile=3.0)
S.rect(site, "SD_Path", FX0, DOOR_Z - PATH_W / 2, plinth[0], DOOR_Z + PATH_W / 2, 0.0, Y["paving"], M["paving"], tile=2.0)
S.rect(site, "SD_Apron", plinth[0] - APRON_W, plinth[2], plinth[0], plinth[3], 0.0, Y["paving"], M["paving"], tile=2.0)
S.tree(site, "SD_Tree0", -396.0, -193.0, M, scale=0.95)
S.tree(site, "SD_Tree1", -396.0, -208.0, M, scale=1.05)
S.tree(site, "SD_Tree2", -373.5, -192.5, M, kind="cypress", scale=0.8)
S.bench(site, "SD_Bench0", -396.9, -204.6, PI / 2, M)

site.cols.append({"name": f"COL_Work_{KEY}", "cx": body_center[0], "cz": body_center[2], "hx": round(body["hz"], 3), "hz": round(body["hx"], 3),
                  "hy": body["hy"], "cy": body["hy"], "yaw": 0.0})
for c in site.cols:
    assert FX0 <= c["cx"] - c["hx"] + 1e-6 and c["cx"] + c["hx"] <= FX1 + 1e-6 and FZ0 <= c["cz"] - c["hz"] + 1e-6 and c["cz"] + c["hz"] <= FZ1 + 1e-6, c
feet = [o for o in site.objs if o.type == "MESH" and ("Bench" in o.name or o.name.endswith("_Trunk"))]
bad = L.check_grounded(feet)
assert not bad, bad

L.export_glb(os.path.join(OUT, f"{KEY}.glb"), site.objs, use_active_scene=True)
print(f"{KEY}: {len(site.objs)} objects, {site.tris()} tris, {len(site.cols)} COL")

spots = [interior_to_world(p) for p in inner["dance"]["spots"]]
ax0, ax1, az0, az1 = inner["dance"]["playArea"]
corners = [interior_to_world((x, 0.0, z)) for x in (ax0, ax1) for z in (az0, az1)]
coach = interior_to_world(inner["npcs"]["danceCoach"])
L.write_json(os.path.join(OUT, f"{KEY}.layout.json"), {
    "version": 1,
    "zone": {"minX": FX0, "maxX": FX1, "minZ": FZ0, "maxZ": FZ1},
    "studio": {
        "kind": "work", "key": KEY, "name": ext["name"], "job": "sports",
        "position": [STUDIO_POS[0], 0.0, STUDIO_POS[1]], "rotationY": round(STUDIO_YAW, 4),
        "door": door, "footprint": [round(fp_w, 3), round(fp_d, 3)], "interiorOffset": ext["interiorOffset"],
    },
    "dance": {
        "coach": [coach[0], coach[2]],
        "coachPosition": coach,
        "coachYaw": round(math.atan2(spots[0][0] - coach[0], 0.0), 4),
        "playArea": {"minX": min(c[0] for c in corners), "maxX": max(c[0] for c in corners),
                     "minZ": min(c[2] for c in corners), "maxZ": max(c[2] for c in corners)},
        "spots": [[p[0], p[2]] for p in spots],
    },
    "collision": site.cols,
})
print("studio door", door, "coach", coach, "spots", spots)
L.snapshot(sc, os.path.join(OUT, "site_preview.png"), (-385.0, 40.0, -170.0), (-385.0, 0.0, -200.5), lens=28, res=(960, 640))
