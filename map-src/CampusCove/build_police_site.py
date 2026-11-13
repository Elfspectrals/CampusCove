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
import lib_buildings as B
importlib.reload(B)
import bpy

POLICE_POS = (100.0, 34.0)
POLICE_YAW = -math.pi / 2
GATE = {"x": 44.6, "z": 12.0, "width": 11.0}
BOUNDS = {"minX": 46.6, "maxX": 122.0, "minZ": 8.0, "maxZ": 56.0}
PATH_W = 2.6
EYE_HEIGHT = 1.6
LOT = (58.0, 38.0, 74.0, 55.0)
BAY_W = 2.6
BAY_D = 5.0
LINE_W = 0.12
OUT = os.path.join(L.OUT_ROOT, "park", "police_site")
POLICE_OUT = os.path.join(L.OUT_ROOT, "work", "police")

ext = json.load(open(os.path.join(POLICE_OUT, "exterior.layout.json")))
inner = json.load(open(os.path.join(POLICE_OUT, "interior.layout.json")))
ox, oy, oz = ext["interiorOffset"]
cos_y, sin_y = math.cos(POLICE_YAW), math.sin(POLICE_YAW)


def to_world(lx, ly, lz):
    return [round(POLICE_POS[0] + lx * cos_y + lz * sin_y, 3), round(ly, 3), round(POLICE_POS[1] - lx * sin_y + lz * cos_y, 3)]


def interior_to_world(p):
    return to_world(p[0] + ox, p[1] + oy, p[2] + oz)


def world_bounds(corners):
    xs, zs = zip(*[(p[0], p[2]) for p in map(interior_to_world, corners)])
    return {"minX": min(xs), "maxX": max(xs), "minZ": min(zs), "maxZ": max(zs)}


door = to_world(*ext["doorLocal"])
steps_end_x = to_world(0.0, 0.0, ext["stepsEndZ"])[0]

sc = L.new_build_scene("PARK_police_site")
coll = bpy.data.collections.new("PoliceSite")
sc.collection.children.link(coll)
P = {
    "line": L.make_mat("TW_ParkingLinePolice", "#f2f0e6", 0.8, "noise", 0.02),
    "curb": L.make_mat("TW_CurbPolice", "#9a9a9a", 0.8, "noise", 0.03),
    "grass": L.make_mat("TW_GrassPolice", "#79b765", 1.0, "noise", 0.06),
    "metal": L.make_mat("TW_MetalPolice", "#3a3f47", 0.4, "noise", 0.03),
    "lamp": L.make_mat("TW_LampGlowPolice", "#fff1c4", 0.5, "noise", 0.0, emit="#fff1c4"),
    "navy": L.make_mat("TW_PoliceNavy", "#1f3350", 0.7, "noise", 0.02),
    "sign": L.make_mat("TW_PoliceSignGlow", "#ffffff", 0.4, "noise", 0.0, emit="#ffffff", emit_strength=1.2),
    "leaf": L.make_mat("TW_LeafPolice", "#4f9d54", 0.9, "noise", 0.06),
    "trunk": L.make_mat("TW_TrunkPolice", "#7a5638", 0.8, "planks", 0.04, accent="#5e4129"),
}
P["paving"], PAVING_TILE = B._texture_mat("TW_PavingPolice", "paving", "#ffffff")
P["asphalt"], ASPHALT_TILE = B._texture_mat("TW_AsphaltPolice", "dark_grey_asphalt", "#ffffff")
so = []
col = []


def add_col(name, gx, gz, sx, sz, h):
    col.append({"name": name, "cx": round(gx, 3), "cz": round(gz, 3), "hx": round(sx / 2, 3), "hz": round(sz / 2, 3), "hy": round(h / 2, 3), "cy": round(h / 2, 3), "yaw": 0.0})


lawn_x0 = GATE["x"] + 4.0
so.append(L.box(coll, "PS_Lawn", (lawn_x0 + BOUNDS["maxX"]) / 2, (BOUNDS["minZ"] + BOUNDS["maxZ"]) / 2, 0.0, BOUNDS["maxX"] - lawn_x0,
                BOUNDS["maxZ"] - BOUNDS["minZ"], 0.02, P["grass"], tile=2.0))
forecourt_x0 = steps_end_x - 7.0
FORECOURT_D = 22.0
forecourt_z0 = POLICE_POS[1] - FORECOURT_D / 2
turn_x = forecourt_x0 + 2.0
path_x0, path_x1 = GATE["x"] + 0.5, turn_x + PATH_W / 2
path_z0, path_z1 = GATE["z"] + PATH_W / 2, forecourt_z0
curb_off = PATH_W / 2 + 0.1
so.append(L.box(coll, "PS_PathEast", (path_x0 + path_x1) / 2, GATE["z"], 0.0, path_x1 - path_x0, PATH_W, 0.04, P["paving"], tile=PAVING_TILE))
so.append(L.box(coll, "PS_PathNorth", turn_x, (path_z0 + path_z1) / 2, 0.0, PATH_W, path_z1 - path_z0, 0.04, P["paving"], tile=PAVING_TILE))
outer_x1, inner_x1 = path_x1 + 0.2, turn_x - curb_off - 0.1
so.append(L.box(coll, "PS_CurbN", (path_x0 + outer_x1) / 2, GATE["z"] - curb_off, 0.0, outer_x1 - path_x0, 0.2, 0.08, P["curb"]))
so.append(L.box(coll, "PS_CurbS", (path_x0 + inner_x1) / 2, GATE["z"] + curb_off, 0.0, inner_x1 - path_x0, 0.2, 0.08, P["curb"]))
outer_z0, inner_z0 = GATE["z"] - curb_off - 0.1, GATE["z"] + curb_off + 0.1
so.append(L.box(coll, "PS_CurbE", turn_x + curb_off, (outer_z0 + path_z1) / 2, 0.0, 0.2, path_z1 - outer_z0, 0.08, P["curb"]))
so.append(L.box(coll, "PS_CurbW", turn_x - curb_off, (inner_z0 + path_z1) / 2, 0.0, 0.2, path_z1 - inner_z0, 0.08, P["curb"]))
so.append(L.box(coll, "PS_Forecourt", (forecourt_x0 + steps_end_x + 1.0) / 2, POLICE_POS[1], 0.0, steps_end_x + 1.0 - forecourt_x0, FORECOURT_D, 0.035, P["paving"],
                tile=PAVING_TILE))

lx0, lz0, lx1, lz1 = LOT
so.append(L.box(coll, "PS_Asphalt", (lx0 + lx1) / 2, (lz0 + lz1) / 2, 0.0, lx1 - lx0, lz1 - lz0, 0.03, P["asphalt"], tile=ASPHALT_TILE))
bays = []
for row, (bx0, facing) in enumerate(((lx0 + 0.5, 1), (lx1 - 0.5 - BAY_D, -1))):
    z = lz0 + 1.5
    k = 0
    while z + BAY_W <= lz1 - 0.5 + 1e-6:
        so.append(L.box(coll, f"PS_Line{row}_{k}", bx0 + BAY_D / 2, z, 0.03, BAY_D, LINE_W, 0.008, P["line"]))
        bays.append({"row": row, "center": [round(bx0 + BAY_D / 2, 3), 0.0, round(z + BAY_W / 2, 3)], "noseYaw": 0.0 if facing < 0 else math.pi})
        z += BAY_W
        k += 1
    so.append(L.box(coll, f"PS_Line{row}_{k}", bx0 + BAY_D / 2, z, 0.03, BAY_D, LINE_W, 0.008, P["line"]))
    end_x = bx0 + (BAY_D if facing > 0 else 0.0)
    so.append(L.box(coll, f"PS_LineEnd{row}", end_x, (lz0 + 1.5 + z) / 2, 0.03, LINE_W, z - lz0 - 1.5, 0.008, P["line"]))
for side, (cx, cz, sx, sz) in {"W": (lx0 - 0.1, (lz0 + lz1) / 2, 0.2, lz1 - lz0), "E": (lx1 + 0.1, (lz0 + lz1) / 2, 0.2, lz1 - lz0),
                               "S": ((lx0 + lx1) / 2, lz1 + 0.1, lx1 - lx0 + 0.4, 0.2)}.items():
    so.append(L.box(coll, f"PS_LotCurb{side}", cx, cz, 0.0, sx, sz, 0.08, P["curb"]))

lamp_off = PATH_W / 2 + 0.8
lamps = [(gx, GATE["z"] + lamp_off * (1 if i % 2 == 0 else -1)) for i, gx in enumerate(range(50, int(turn_x) - 2, 10))]
lamps.append((turn_x - lamp_off, (path_z0 + path_z1) / 2))
for i, (gx, gz) in enumerate(lamps):
    so.append(L.cyl(coll, f"PS_Lamp{i}_Pole", gx, gz, 0.0, 0.07, 3.2, P["metal"], seg=6))
    so.append(L.box(coll, f"PS_Lamp{i}_Head", gx, gz, 3.2, 0.5, 0.5, 0.3, P["lamp"], bevel=0.03))
    add_col(f"COL_Police_Lamp{i}", gx, gz, 0.3, 0.3, 3.4)

trees = [(54.0, 20.0), (62.0, 24.0), (70.0, 18.0), (52.0, 30.0), (66.0, 31.0), (118.0, 12.0), (118.0, 52.0), (84.0, 52.0), (96.0, 53.0), (108.0, 53.0),
         (90.0, 12.0), (102.0, 12.0), (117.0, 30.0), (52.0, 46.0)]
for i, (gx, gz) in enumerate(trees):
    so.append(L.cyl(coll, f"PS_TreeTrunk{i}", gx, gz, 0.0, 0.22, 1.6, P["trunk"], seg=6))
    so.append(L.cone(coll, f"PS_TreeA{i}", gx, gz, 1.4, 1.6, 0.3, 2.4, P["leaf"], seg=7))
    add_col(f"COL_Police_Tree{i}", gx, gz, 0.6, 0.6, 3.0)

sign_x, sign_z = GATE["x"] + 3.0, GATE["z"] - PATH_W / 2 - 1.4
so.append(L.box(coll, "PS_WayPost", sign_x, sign_z, 0.0, 0.14, 0.14, 2.3, P["metal"]))
so.append(L.box(coll, "PS_WayBoard", sign_x, sign_z, 1.5, 0.12, 2.4, 0.8, P["navy"]))
way_text = L.text_mesh(coll, "PS_WayText", "POLICE  >", sign_x - 0.07, sign_z, 1.68, 0.34, 0.03, P["sign"])
way_text.rotation_euler = (math.pi / 2, 0, -math.pi / 2)
so.append(way_text)
add_col("COL_Police_WaySign", sign_x, sign_z, 0.3, 2.4, 2.3)

bad = L.check_grounded(so, allow=("PS_Lawn", "PS_Path", "PS_Curb", "PS_Forecourt", "PS_Asphalt", "PS_Line", "PS_LotCurb", "PS_Lamp", "PS_Tree", "PS_Way"))
print("SITE grounded violations:", bad)
assert not bad, bad

fp_w, fp_d = ext["footprint"]
body_center = to_world(0.0, 0.0, ext["footprintCenterZ"])
body = ext["collision"][0]
add_col("COL_Work_police", body_center[0], body_center[2], 2 * body["hz"], 2 * body["hx"], 2 * body["hy"])

L.export_glb(os.path.join(OUT, "police_site.glb"), so)
L.write_json(os.path.join(OUT, "police_site.layout.json"), {
    "version": 1,
    "bounds": BOUNDS,
    "gate": GATE,
    "police": {
        "key": "police", "name": ext["name"], "job": "police",
        "position": [POLICE_POS[0], 0.0, POLICE_POS[1]], "rotationY": round(POLICE_YAW, 4),
        "door": door, "footprint": [fp_w, fp_d], "interiorOffset": ext["interiorOffset"],
    },
    "points": {
        "desk": interior_to_world(inner["points"]["desk"]),
        "officer": interior_to_world(inner["npcs"]["officer"]),
        "lockers": interior_to_world(inner["points"]["lockers"]),
        "wantedBoard": interior_to_world(inner["points"]["wantedBoard"]),
        "cells": [{"id": c["id"], "position": interior_to_world([c["position"][0], EYE_HEIGHT, c["position"][2]]), "door": interior_to_world(c["door"]),
                   "tap": interior_to_world(c["tap"]), "hatch": interior_to_world(c["hatch"]),
                   "bounds": world_bounds(c["bounds"])} for c in inner["cells"]],
    },
    "parking": bays,
    "collision": col,
})
tris = sum(len(p.vertices) - 2 for o in so for p in o.data.polygons)
print("site:", len(so), "objects,", tris, "triangles,", len(col), "collision boxes, door", door)
