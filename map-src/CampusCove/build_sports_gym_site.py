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

KEY = "sports_gym"
OUT = os.path.join(L.OUT_ROOT, "park", KEY)
GYM_OUT = os.path.join(L.OUT_ROOT, "work", KEY)
FX0, FX1, FZ0, FZ1 = SP.FOOTPRINTS[KEY]
SX0, SX1, SZ0, SZ1 = SP.DOOR_STUBS[KEY]
Y = SP.Y
GYM_POS = (-435.5, -211.0)
GYM_YAW = -math.pi / 2
TEAM_OF_END = {"east": "red", "west": "blue"}
SCOREBOARD_SCREEN = {"x": -408.3, "y": 6.05, "z": -208.3, "width": 1.88, "height": 1.24, "facing": [-1, 0]}

ext = json.load(open(os.path.join(GYM_OUT, "exterior.layout.json")))
inner = json.load(open(os.path.join(GYM_OUT, "interior.layout.json")))
ox, oy, oz = ext["interiorOffset"]
cos_y, sin_y = math.cos(GYM_YAW), math.sin(GYM_YAW)


def to_world(lx, ly, lz):
    return [round(GYM_POS[0] + lx * cos_y + lz * sin_y, 4), round(ly, 4), round(GYM_POS[1] - lx * sin_y + lz * cos_y, 4)]


def interior_to_world(x, y, z):
    return to_world(x + ox, y + oy, z + oz)


def world_bounds(b):
    a = interior_to_world(b["minX"], 0.0, b["minZ"])
    c = interior_to_world(b["maxX"], 0.0, b["maxZ"])
    return {"minX": min(a[0], c[0]), "maxX": max(a[0], c[0]), "minZ": min(a[2], c[2]), "maxZ": max(a[2], c[2])}


def world_box(b):
    flat = world_bounds(b)
    return {"minX": flat["minX"], "maxX": flat["maxX"], "minY": round(b["minY"] + oy, 4), "maxY": round(b["maxY"] + oy, 4), "minZ": flat["minZ"], "maxZ": flat["maxZ"]}


def world_hoop(b):
    rim = interior_to_world(b["x"], b["y"], b["z"])
    return {"x": rim[0], "y": round(rim[1], 4), "z": rim[2], "rimRadius": b["rimRadius"], "board": world_box(b["board"])}


def world_xz(x, z):
    p = interior_to_world(x, 0.0, z)
    return {"x": p[0], "z": p[2]}


court_in = inner["court"]
goals, baskets = {}, {}
for end, g in court_in["goals"].items():
    line = interior_to_world(0.0, 0.0, g["lineZ"])[0]
    a, c = world_xz(g["minX"], g["lineZ"]), world_xz(g["maxX"], g["lineZ"])
    inward = 1 if interior_to_world(0.0, 0.0, g["lineZ"] + g["out"])[0] > line else -1
    goals[TEAM_OF_END[end]] = {"lineX": line, "inward": inward, "minZ": min(a["z"], c["z"]), "maxZ": max(a["z"], c["z"]), "height": g["height"], "depth": g["depth"]}
for end, b in court_in["baskets"].items():
    baskets[TEAM_OF_END[end]] = {**world_hoop(b), "threePointRadius": b["threePointRadius"]}
coach = interior_to_world(*inner["npcs"]["coach"])
court = {
    "version": 1,
    "floorY": oy,
    "ceilingY": round(court_in["ceilingY"] + oy, 4),
    "arena": world_bounds(court_in["arena"]),
    "playArea": world_bounds(court_in["playArea"]),
    "court": world_bounds(court_in["court"]),
    "centre": world_xz(*court_in["centre"]),
    "coach": {"x": coach[0], "z": coach[2]},
    "goals": goals,
    "baskets": baskets,
    "sideBaskets": [world_hoop(b) for b in court_in["sideBaskets"]],
    "scoreboard": SCOREBOARD_SCREEN,
}
for key in ("arena", "playArea", "court"):
    b = court[key]
    assert FX0 < b["minX"] and b["maxX"] < FX1 and FZ0 < b["minZ"] and b["maxZ"] < FZ1, (key, b)

sc = L.new_build_scene("PARK_" + KEY)
coll = bpy.data.collections.new(KEY)
sc.collection.children.link(coll)
site = S.Site(coll, "SportsGym", seed=81)
shared = SP.site_materials()
M = {
    "lawn": shared["lawn"],
    "paving": shared["paving"],
    "iron": L.make_mat("TW_SportsGymIron", "#33373d", 0.5, "noise", 0.03),
    "lamp": L.make_mat("TW_SportsGymLampGlow", "#fff1c4", 0.5, "noise", 0.0, emit="#fff1c4"),
    "wood": L.make_mat("TW_SportsGymBenchWood", "#a77a4f", 0.8, "planks", 0.05, accent="#8c6440"),
    "hedge": L.make_mat("TW_SportsGymHedge", "#4f8a3c", 1.0, "noise", 0.08),
}

S.rect(site, "SG_Lawn", FX0, FZ0, FX1, FZ1, 0.0, Y["lawn"], M["lawn"])
door = to_world(*ext["doorLocal"])
plinth_w = ext["footprint"][1] / 2 + 0.2
body_center = to_world(0.0, 0.0, ext["footprintCenterZ"])
front_x = body_center[0] - plinth_w
back_x = body_center[0] + plinth_w
S.rect(site, "SG_Apron", FX0, SZ0, front_x, SZ1, 0.0, Y["paving"], M["paving"])
S.rect(site, "SG_ExitPath", back_x, door[2] - 1.0, FX1, door[2] + 1.0, 0.0, Y["paving"], M["paving"])
for i, dz in enumerate((-4.2, 4.2)):
    S.street_lamp(site, f"SG_Lamp{i}", FX0 + 1.3, door[2] + dz, M)
for i, dz in enumerate((-6.6, 6.6)):
    S.bench(site, f"SG_Bench{i}", FX0 + 1.3, door[2] + dz, -math.pi / 2, M)
for i, (z0, z1) in enumerate(((FZ0 + 0.6, SZ0 - 7.6), (SZ1 + 7.6, FZ1 - 0.6))):
    S.hedge_run(site, f"SG_Hedge{i}", (FX0 + 0.7, z0), (FX0 + 0.7, z1), M, mat="hedge")

body = ext["collision"][0]
site.cols.append({"name": "COL_Work_sports_gym", "cx": body_center[0], "cz": body_center[2], "hx": round(body["hz"], 3), "hz": round(body["hx"], 3),
                  "hy": body["hy"], "cy": body["hy"], "yaw": 0.0})
assert FX0 <= front_x and back_x <= FX1, ("gymnasium outside its footprint", front_x, back_x)
for c in site.cols:
    assert FX0 <= c["cx"] - c["hx"] and c["cx"] + c["hx"] <= FX1 and FZ0 <= c["cz"] - c["hz"] and c["cz"] + c["hz"] <= FZ1, c
feet = [o for o in site.objs if o.type == "MESH" and (o.name.endswith("_Base") or "Bench" in o.name)]
bad = L.check_grounded(feet)
assert not bad, bad

L.export_glb(os.path.join(OUT, f"{KEY}.glb"), site.objs)
L.write_json(os.path.join(OUT, f"{KEY}.layout.json"), {
    "version": 1,
    "bounds": {"minX": FX0, "maxX": FX1, "minZ": FZ0, "maxZ": FZ1},
    "gym": {
        "kind": "work", "key": KEY, "name": ext["name"], "job": "sports",
        "position": [GYM_POS[0], 0.0, GYM_POS[1]], "rotationY": round(GYM_YAW, 4),
        "door": door, "footprint": [round(f, 3) for f in ext["footprint"]], "interiorOffset": ext["interiorOffset"],
    },
    "coach": {"position": coach, "yaw": 0.0},
    "court": court,
    "collision": site.cols,
})
print("site:", len(site.objs), "objects,", site.tris(), "triangles,", len(site.cols), "collision boxes, door", door, "coach", coach)
L.snapshot(sc, os.path.join(OUT, "site_preview.png"), (-480.0, 40.0, -170.0), (-435.0, 0.0, -211.0), lens=24, res=(960, 540))
