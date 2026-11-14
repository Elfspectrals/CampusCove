"""Cove Sports Park reception pavilion, interior: lobby, the pass counter facing the door, waiting benches and the site map.
Outputs: out/work/sports_reception/{interior.glb,interior.colsrc.glb,interior.layout.json}, then the exterior
(build_sports_reception_ext.py), the lightmap (`build_house_lightmaps.py -- work sports_reception`),
`npm run assets:optimize -- work sports_reception` and build_sports_site.py. Plan: docs/sports/MASTER_PLAN.md § 4."""
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
import lib_sports as S
importlib.reload(S)
import bpy

KEY = "sports_reception"
NAME = "Cove Sports Park"
OUT = os.path.join(L.OUT_ROOT, "work", KEY)

X0, X1, Z0, Z1, T, H = -5.3, 5.3, -10.2, 5.0, 0.2, 3.4
WIN_Y = (0.5, 2.6)
SIDE_WIN_Y = (0.9, 2.6)
FRONT_WINDOWS = ((-4.7, -1.3), (1.3, 4.7))
WEST_WINDOWS = ((-8.8, -6.0), (-4.0, -1.2))
EAST_WINDOWS = ((-8.8, -6.0), (-4.0, -1.2), (0.8, 3.8))
COUNTER_Z = -2.0
COUNTER_W = 6.0
CLERK_Z = COUNTER_Z - 0.95

sc = L.new_build_scene("WORK_" + KEY + "_interior")
coll = bpy.data.collections.new("Interior")
sc.collection.children.link(coll)
cols = L.Collisions(coll)
M = L.std_mats(wall="#eeece6", floor=("#c9c6bf", "tiles", "#b9b6ae"))
M["teal"] = L.make_mat("IN_SportsTeal", "#2a9d8f", 0.7, "noise", 0.03)
M["counter"] = L.make_mat("IN_SportsCounter", "#f4f2ec", 0.5, "noise", 0.01)
M["court"] = L.make_mat("IN_SportsMapCourt", "#4f7fa8", 0.8, "noise", 0.0)
M["track"] = L.make_mat("IN_SportsMapTrack", "#c2795a", 0.8, "noise", 0.0)
M["grass"] = L.make_mat("IN_SportsMapGrass", "#7db45a", 0.9, "noise", 0.0)
M["hall"] = L.make_mat("IN_SportsMapHall", "#e8e4da", 0.8, "noise", 0.0)
M["board"] = L.make_mat("IN_SportsBoard", "#1f2a33", 0.6, "noise", 0.01)
M["sign"] = L.make_mat("IN_SportsSignText", "#ffffff", 0.4, "noise", 0.0, emit="#ffffff", emit_strength=0.8)
M["screen"] = L.make_mat("IN_SportsScreen", "#173a34", 0.4, "stripes", 0.0, accent="#3fd1b0", emit="#2fc9a8", emit_strength=0.6)
M["seat"] = L.make_mat("IN_SportsSeat", "#2a9d8f", 0.8, "noise", 0.03)

objs = []
objs.append(L.box(coll, "House_Floor_Main", 0, (Z0 + Z1) / 2, -0.1, X1 - X0, Z1 - Z0, 0.1, M["floor"], tile=2.0))
objs.append(L.box(coll, "Ceiling", 0, (Z0 + Z1 + 0.2) / 2, H, X1 - X0 + 0.4, Z1 - Z0 + 0.4, 0.1, M["ceil"], tile=2.0))
objs += L.wall(coll, "Walls_Front", "x", Z1 + 0.1, T, X0 - T, X1 + T, H, M["wall"],
               openings=[(a, b, *WIN_Y) for a, b in FRONT_WINDOWS] + [L.DOOR_OPENING], cols=cols, glass=M["glass"], col_tag="Wall_Front")
objs += L.wall(coll, "Walls_Back", "x", Z0 - 0.1, T, X0 - T, X1 + T, H, M["wall"], cols=cols, col_tag="Wall_Back")
objs += L.wall(coll, "Walls_W", "z", X0 - 0.1, T, Z0, Z1 + 0.2, H, M["wall"], openings=[(a, b, *SIDE_WIN_Y) for a, b in WEST_WINDOWS],
               cols=cols, glass=M["glass"], col_tag="Wall_W")
objs += L.wall(coll, "Walls_E", "z", X1 + 0.1, T, Z0, Z1 + 0.2, H, M["wall"], openings=[(a, b, *SIDE_WIN_Y) for a, b in EAST_WINDOWS],
               cols=cols, glass=M["glass"], col_tag="Wall_E")
objs.append(L.box(coll, "Door_Entrance", 0, Z1 + 0.1, 0.01, 1.18, 0.06, 2.18, M["glass"], bevel=0.02))
objs.append(L.box(coll, "Door_Entrance_Handle", 0.42, Z1 - 0.03, 0.98, 0.04, 0.12, 0.04, M["metal"]))
objs.append(L.box(coll, "Entry_Doormat", 0, Z1 - 0.5, 0.0, 1.2, 0.7, 0.012, M["mat"]))
objs.append(L.box(coll, "Wall_AccentStripe", 0, Z0 + 0.03, 1.1, X1 - X0 - 0.2, 0.04, 0.3, M["teal"]))

objs.append(L.furn(coll, "pass_counter", 0, COUNTER_Z, math.pi, [
    (0, 0, 0.0, COUNTER_W, 0.8, 1.0, M["counter"], 0.02), (0, 0, 1.0, COUNTER_W + 0.1, 0.9, 0.05, M["marble"], 0.01),
    (0, -0.41, 0.12, COUNTER_W - 0.2, 0.02, 0.24, M["teal"]), (0, -0.41, 0.55, COUNTER_W - 0.2, 0.02, 0.1, M["teal"])]))
cols.add("PassCounter", 0, COUNTER_Z, 0.0, COUNTER_W + 0.1, 0.9, 1.05)
objs.append(L.furn(coll, "PassCounter_Props", 0, COUNTER_Z, 0.0, [
    (-1.6, 0.15, 1.05, 0.5, 0.06, 0.34, M["black"]), (-1.6, 0.12, 1.12, 0.46, 0.02, 0.26, M["screen"]),
    (1.2, -0.1, 1.05, 0.28, 0.2, 0.08, M["black"]), (1.2, -0.12, 1.13, 0.2, 0.02, 0.06, M["screen"]),
    (0.2, 0.0, 1.05, 0.3, 0.22, 0.02, M["counter"])]))
objs.append(L.box(coll, "Wall_PassSignBoard", 0, Z0 + 0.06, 2.35, 4.2, 0.06, 0.6, M["board"]))
objs.append(L.text_mesh(coll, "Wall_PassSignText", "SPORTS PASS", 0, Z0 + 0.1, 2.47, 0.34, 0.01, M["sign"]))

MAP_Z, MAP_W, MAP_Y0, MAP_H = 2.3, 2.6, 0.9, 1.6
SITE_X0, SITE_X1, SITE_Z0, SITE_Z1 = -586.0, -362.0, -426.0, -186.0
MAP_LOOK = {"sports_athletics": "track", "sports_tennis": "court", "sports_petanque": "grass"}


def map_box(name, x0, x1, z0, z1, depth, mat):
    """A rectangle of the site plan on the west wall: game east to the viewer's right, game north up."""
    u0, u1 = ((x - SITE_X0) / (SITE_X1 - SITE_X0) * (MAP_W - 0.2) - (MAP_W - 0.2) / 2 for x in (x0, x1))
    v0, v1 = ((SITE_Z1 - z) / (SITE_Z1 - SITE_Z0) * (MAP_H - 0.3) + 0.1 for z in (z1, z0))
    return L.box(coll, name, X0 + depth, MAP_Z - (u0 + u1) / 2, MAP_Y0 + v0, 0.01, u1 - u0, v1 - v0, mat)


objs.append(L.box(coll, "Wall_SiteMap", X0 + 0.04, MAP_Z, MAP_Y0, 0.04, MAP_W, MAP_H, M["board"]))
objs.append(map_box("Wall_SiteMapGround", SITE_X0, SITE_X1, SITE_Z0, SITE_Z1, 0.065, M["grass"]))
for key, (fx0, fx1, fz0, fz1) in S.FOOTPRINTS.items():
    objs.append(map_box(f"Wall_SiteMap_{key}", fx0, fx1, fz0, fz1, 0.075, M[MAP_LOOK.get(key, "hall")]))
site_map_title = L.text_mesh(coll, "Wall_SiteMapTitle", "SITE MAP", X0 + 0.09, MAP_Z, MAP_Y0 + MAP_H - 0.2, 0.14, 0.0, M["sign"])
site_map_title.rotation_euler[2] = math.pi / 2
objs.append(site_map_title)

for k, cz in enumerate((1.0, 3.2), start=1):
    objs.append(L.furn(coll, f"WaitingBench_{k:02d}", X1 - 0.45, cz, -math.pi / 2, [
        (-0.8, 0, 0.0, 0.08, 0.42, 0.42, M["metal"]), (0.8, 0, 0.0, 0.08, 0.42, 0.42, M["metal"]),
        (0, 0, 0.42, 1.8, 0.45, 0.06, M["seat"], 0.01), (0, 0.2, 0.48, 1.8, 0.06, 0.42, M["seat"], 0.01)]))
    cols.add(f"WaitingBench_{k:02d}", X1 - 0.45, cz, 0.0, 0.5, 1.9, 0.9)
objs.append(L.plant(coll, M, "Plant_01", X0 + 0.45, 4.3))
cols.add("Plant_01", X0 + 0.45, 4.3, 0.0, 0.5, 0.5, 1.3)
objs.append(L.plant(coll, M, "Plant_02", X1 - 0.45, 4.3))
cols.add("Plant_02", X1 - 0.45, 4.3, 0.0, 0.5, 0.5, 1.3)

light_pts = ((-2.6, 3.0), (2.6, 3.0), (-2.6, -0.5), (2.6, -0.5), (-2.6, -4.5), (2.6, -4.5), (-2.6, -8.3), (2.6, -8.3))
for i, (lx, lz) in enumerate(light_pts):
    objs.append(L.box(coll, f"Light_{i:02d}", lx, lz, H - 0.05, 1.4, 0.4, 0.05, M["lamp"]))
for nm, gx, gz, sx, sz in [("Sky_Back", 0, Z0 - 6, 40, 0.05), ("Sky_Front", 0, Z1 + 6, 40, 0.05),
                          ("Sky_West", X0 - 6, (Z0 + Z1) / 2, 0.05, 40), ("Sky_East", X1 + 6, (Z0 + Z1) / 2, 0.05, 40)]:
    objs.append(L.box(coll, nm, gx, gz, -3.0, sx, sz, 10.0, M["sky"]))

bad = L.check_grounded(objs, allow=L.ALLOW_INTERIOR + ("Ceiling", "PassCounter_Props"))
print("INTERIOR grounded violations:", bad)
assert not bad, bad
L.export_glb(os.path.join(OUT, "interior.glb"), objs)
L.export_glb(os.path.join(OUT, "interior.colsrc.glb"), objs + cols.items)
L.write_json(os.path.join(OUT, "interior.layout.json"), {
    "version": 1, "key": KEY, "name": NAME, "spawn": [0.0, 1.6, 3.7],
    "exit": {"position": [0.0, 4.75], "radius": 1.4},
    "stations": [],
    "npcs": {"passClerk": [0.0, 0.0, CLERK_Z]},
    "counters": {"pass": [0.0, 0.0, COUNTER_Z]},
    "seats": [],
})


def triangles(items):
    return sum(len(p.vertices) - 2 for o in items if o.type == "MESH" for p in o.data.polygons)


print("interior:", len(objs), "objects,", len(cols.items), "collision boxes,", triangles(objs), "triangles")
L.snapshot(sc, os.path.join(OUT, "interior_preview.png"), (0, 2.6, 4.4), (0, 1.2, -8), lens=20, res=(960, 640), hide_prefixes=("Ceiling", "Sky_"))

exec(open(os.path.join(HERE, "build_sports_reception_ext.py"), encoding="utf-8").read())
