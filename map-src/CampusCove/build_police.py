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
import lib_buildings as B
importlib.reload(B)
import bpy

KEY = "police"
NAME = "Cove Police"
OUT = os.path.join(L.OUT_ROOT, "work", KEY)
X0, X1, Z0, Z1 = -15.0, 15.0, -19.0, 5.0
T = 0.2
HALL_X = 6.0
HALL_BACK_Z = -5.0
H_HALL = 6.6
H_ROOM = 3.6
WIN_LOW = (0.9, 2.5)
WIN_HALL = (0.9, 4.4)
FRONT_HALL_WINDOWS = ((-4.6, -2.4), (2.4, 4.6))
FRONT_ROOM_WINDOWS = ((-13.4, -11.4), (-9.6, -7.6), (7.6, 9.6), (11.4, 13.4))
WEST_WINDOWS = ((-12.5, -10.5), (-8.0, -6.0))
EAST_WINDOWS = ((-12.5, -10.5), (-8.0, -6.0), (0.0, 2.0))
CELL_XS = ((-5.4, -1.8), (-1.8, 1.8), (1.8, 5.4))
CELL_FRONT_Z = -15.4
CELL_WALL = 0.16
BARS_TOP = 2.5
BAR = 0.035
BAR_STEP = 0.13
CELL_DOOR_W = 1.0
HALL_FLOOR_TILE = 4.0
HD = 12.4
PORTICO_DEPTH = 4.6
PORTICO_HALF_W = 7.0
STEP_DEPTH = 0.6
STEP_HALF_W = 7.6

sc = L.new_build_scene("WORK_" + KEY + "_interior")
coll = bpy.data.collections.new("Interior")
sc.collection.children.link(coll)
cols = L.Collisions(coll)
M = L.std_mats(wall="#ece6da", floor=("#c9c3b6", "tiles", "#b7b0a2"))
M["hall_floor"], _ = B._texture_mat("IN_PoliceHallFloor", "black_white_checkerboard_marble_floor", "#ffffff")
M["lino"], LINO_TILE = B._texture_mat("IN_PoliceOfficeFloor", "store_floor", "#d4dbdf")
M["concrete"], CONCRETE_TILE = B._texture_mat("IN_PoliceCellFloor", "grey_concrete_wall", "#b4b2ac")
M["cellwall"], _ = B._texture_mat("IN_PoliceCellWall", "grey_concrete_wall", "#ffffff")
M["navy"] = L.make_mat("IN_PoliceNavy", "#1f3350", 0.6, "noise", 0.02)
M["gold"] = L.make_mat("IN_PoliceGold", "#c9a24a", 0.4, "noise", 0.03)
M["wainscot"] = L.make_mat("IN_PoliceWainscot", "#5a3d2a", 0.6, "planks", 0.04, accent="#4a3122")
M["stone"] = L.make_mat("IN_PoliceStone", "#d9d2c3", 0.8, "noise", 0.03)
M["bars"] = L.make_mat("IN_CellBars", "#4a4f57", 0.35, "noise", 0.02)
M["tray"] = L.make_mat("IN_MealTray", "#d98c3a", 0.5, "noise", 0.02)

objs = []


def add(o):
    objs.append(o)
    return o


def walls(*args, **kwargs):
    objs.extend(L.wall(coll, *args, **kwargs))


def joined(name, parts):
    return add(L.join(coll, name, parts) if len(parts) > 1 else parts[0])


def floor(name, x0, z0, x1, z1, mat, tile=2.0):
    add(L.box(coll, name, (x0 + x1) / 2, (z0 + z1) / 2, -0.1, x1 - x0, z1 - z0, 0.1, mat, tile=tile))


def retile(items, tile):
    for o in items:
        for loop_uv in o.data.uv_layers.active.data:
            loop_uv.uv = loop_uv.uv / tile
    return items


def ceiling(name, x0, z0, x1, z1, y, mat):
    add(L.box(coll, name, (x0 + x1) / 2, (z0 + z1) / 2, y, x1 - x0, z1 - z0, 0.1, mat, tile=2.0))


floor("House_Floor_Hall", -HALL_X, HALL_BACK_Z, HALL_X, Z1 + T, M["hall_floor"], tile=HALL_FLOOR_TILE)
floor("House_Floor_Lockers", X0 - T, HALL_BACK_Z, -HALL_X, Z1 + T, M["floor"])
floor("House_Floor_Briefing", HALL_X, HALL_BACK_Z, X1 + T, Z1 + T, M["floor"])
floor("House_Floor_Office", X0 - T, CELL_FRONT_Z, X1 + T, HALL_BACK_Z, M["lino"], tile=LINO_TILE)
floor("House_Floor_OfficeW", X0 - T, Z0 - T, CELL_XS[0][0], CELL_FRONT_Z, M["lino"], tile=LINO_TILE)
floor("House_Floor_OfficeE", CELL_XS[-1][1], Z0 - T, X1 + T, CELL_FRONT_Z, M["lino"], tile=LINO_TILE)
floor("House_Floor_Cells", CELL_XS[0][0], Z0 - T, CELL_XS[-1][1], CELL_FRONT_Z, M["concrete"], tile=CONCRETE_TILE)
ceiling("Ceiling_Hall", -HALL_X, HALL_BACK_Z, HALL_X, Z1, H_HALL, M["ceil"])
ceiling("Ceiling_Lockers", X0, HALL_BACK_Z, -HALL_X, Z1, H_ROOM, M["ceil"])
ceiling("Ceiling_Briefing", HALL_X, HALL_BACK_Z, X1, Z1, H_ROOM, M["ceil"])
ceiling("Ceiling_Office", X0, Z0, X1, HALL_BACK_Z, H_ROOM, M["ceil"])

front_openings = [(a, b, *WIN_HALL) for a, b in FRONT_HALL_WINDOWS] + [(a, b, *WIN_LOW) for a, b in FRONT_ROOM_WINDOWS] + [L.DOOR_OPENING]
walls("Walls_Front", "x", Z1 + T / 2, T, X0 - T, X1 + T, H_HALL, M["wall"], openings=front_openings, cols=cols, glass=M["glass"], col_tag="Wall_Front")
walls("Walls_Back", "x", Z0 - T / 2, T, X0 - T, X1 + T, H_HALL, M["wall"], cols=cols, col_tag="Wall_Back")
walls("Walls_W", "z", X0 - T / 2, T, Z0, Z1 + T, H_HALL, M["wall"], openings=[(a, b, *WIN_LOW) for a, b in WEST_WINDOWS], cols=cols, glass=M["glass"], col_tag="Wall_W")
walls("Walls_E", "z", X1 + T / 2, T, Z0, Z1 + T, H_HALL, M["wall"], openings=[(a, b, *WIN_LOW) for a, b in EAST_WINDOWS], cols=cols, glass=M["glass"], col_tag="Wall_E")
for side, sx in (("W", -1), ("E", 1)):
    walls(f"Walls_Hall{side}", "z", sx * HALL_X, T, HALL_BACK_Z, Z1, H_HALL, M["wall"], openings=[(1.4, 2.6, 0.0, 2.3)], cols=cols, col_tag=f"Wall_Hall{side}")
walls("Walls_HallBack", "x", HALL_BACK_Z, T, -HALL_X - T / 2, HALL_X + T / 2, H_HALL, M["wall"], openings=[(-2.0, 2.0, 0.0, 3.0)], cols=cols, col_tag="Wall_HallBack")
walls("Walls_LockersBack", "x", HALL_BACK_Z, T, X0, -HALL_X - T / 2, H_ROOM, M["wall"], openings=[(-10.6, -9.4, 0.0, 2.3)], cols=cols, col_tag="Wall_LockersBack")
walls("Walls_BriefingBack", "x", HALL_BACK_Z, T, HALL_X + T / 2, X1, H_ROOM, M["wall"], openings=[(9.4, 10.6, 0.0, 2.3)], cols=cols, col_tag="Wall_BriefingBack")

add(L.box(coll, "Door_Entrance", 0, Z1 + T / 2, 0.01, 1.18, 0.06, 2.18, M["door"], bevel=0.02))
add(L.box(coll, "Door_Entrance_Handle", 0.42, Z1 - 0.03, 0.98, 0.04, 0.12, 0.04, M["metal"]))
add(L.box(coll, "Door_Entrance_Sign", 0, Z1 - 0.01, 2.37, 0.5, 0.02, 0.16, M["navy"]))
add(L.box(coll, "Entry_Doormat", 0, 4.4, 0.0, 1.4, 0.8, 0.012, M["mat"]))

inner = HALL_X - T / 2
for i, (a, b) in enumerate(((HALL_BACK_Z + 0.1, 1.4), (2.6, Z1))):
    for side, sx in (("W", -1), ("E", 1)):
        add(L.box(coll, f"Wall_Wainscot{side}{i}", sx * (inner - 0.015), (a + b) / 2, 0.0, 0.03, b - a, 1.0, M["wainscot"]))
for i, (a, b) in enumerate(((-inner, -2.0), (2.0, inner))):
    add(L.box(coll, f"Wall_WainscotBack{i}", (a + b) / 2, HALL_BACK_Z + T / 2 + 0.015, 0.0, b - a, 0.03, 1.0, M["wainscot"]))
for i, (a, b) in enumerate(((-inner, -4.6), (-2.4, -0.6), (0.6, 2.4), (4.6, inner))):
    add(L.box(coll, f"Wall_WainscotFront{i}", (a + b) / 2, Z1 - 0.015, 0.0, b - a, 0.03, 0.85, M["wainscot"]))
for i, z in enumerate((HALL_BACK_Z + 0.45, -0.6, Z1 - 0.35)):
    for side, sx in (("W", -1), ("E", 1)):
        add(L.box(coll, f"Wall_Pilaster{side}{i}", sx * (inner - 0.06), z, 0.0, 0.12, 0.5, H_HALL, M["stone"]))
for i, z in enumerate((-2.5, 0.0, 2.5)):
    add(L.box(coll, f"Beam_Hall{i}", 0.0, z, H_HALL - 0.4, 2 * inner, 0.3, 0.4, M["stone"]))
add(L.box(coll, "Wall_CorniceHall", 0.0, HALL_BACK_Z + T / 2 + 0.06, H_HALL - 0.3, 2 * inner, 0.12, 0.3, M["stone"]))
emblem = L.cyl(coll, "Wall_Emblem", 0.0, HALL_BACK_Z + T / 2 + 0.03, 4.4, 0.7, 0.05, M["navy"], seg=16)
emblem.rotation_euler = (math.pi / 2, 0, 0)
emblem.location = L.b(0.0, HALL_BACK_Z + T / 2, 5.1)
add(emblem)
badge = L.cyl(coll, "Wall_EmblemBadge", 0.0, 0.0, 0.0, 0.42, 0.04, M["gold"], seg=5)
badge.rotation_euler = (math.pi / 2, 0, 0)
badge.location = L.b(0.0, HALL_BACK_Z + T / 2 + 0.05, 5.1)
add(badge)
add(L.text_mesh(coll, "Wall_HallText", "COVE POLICE", 0.0, HALL_BACK_Z + T / 2 + 0.01, 3.55, 0.42, 0.02, M["gold"]))

lights = []
for i, (lx, lz) in enumerate(((-3.0, -2.5), (3.0, -2.5), (-3.0, 2.5), (3.0, 2.5))):
    add(L.box(coll, f"Light_Hall{i}", lx, lz, 4.6, 1.0, 1.0, 0.1, M["lamp"]))
    add(L.cyl(coll, f"Light_Hall{i}_Wire", lx, lz, 4.7, 0.015, H_HALL - 4.7, M["metal"], seg=4))
office_lights = [(x, z) for x in (-12.0, -8.0, 8.0, 12.0) for z in (-7.0, -11.0, -16.5)] + [(x, z) for x in (-3.0, 3.0) for z in (-7.0, -11.0)]
office_lights += [((a + b) / 2, -17.2) for a, b in CELL_XS]
office_lights += [(x, z) for x in (-12.5, -8.5, 8.5, 12.5) for z in (-1.5, 2.5)]
for i, (lx, lz) in enumerate(office_lights):
    add(L.box(coll, f"Light_{i:02d}", lx, lz, H_ROOM - 0.05, 1.4, 0.4, 0.05, M["lamp"]))
for nm, gx, gz, sx, sz in (("Sky_Back", 0, -27, 60, 0.05), ("Sky_Front", 0, 17, 60, 0.05), ("Sky_West", -23, -5, 0.05, 60), ("Sky_East", 23, -5, 0.05, 60)):
    add(L.box(coll, nm, gx, gz, -3.0, sx, sz, 14.0, M["sky"]))


cells = []
cell_wall_xs = sorted({x for pair in CELL_XS for x in pair})
for i, x in enumerate(cell_wall_xs):
    objs.extend(retile(L.wall(coll, f"Walls_Cell{i}", "z", x, CELL_WALL, Z0, CELL_FRONT_Z + CELL_WALL / 2, H_ROOM, M["cellwall"], cols=cols, col_tag=f"Wall_Cell{i}"), CONCRETE_TILE))
add(L.box(coll, "Wall_CellLintel", 0.0, CELL_FRONT_Z, BARS_TOP, cell_wall_xs[-1] - cell_wall_xs[0] + CELL_WALL, CELL_WALL, H_ROOM - BARS_TOP, M["cellwall"], tile=CONCRETE_TILE))
for n, (x0, x1) in enumerate(CELL_XS, start=1):
    tag = f"Cell_{n:02d}"
    cx = (x0 + x1) / 2
    fixed0 = x0 + CELL_WALL / 2
    hinge_x = x1 - CELL_WALL / 2
    door_x0 = hinge_x - CELL_DOOR_W
    jamb = L.box(coll, f"{tag}_Bars_Jamb", door_x0, CELL_FRONT_Z, 0.0, 0.06, 0.08, BARS_TOP, M["bars"])
    add(L.bar_grille(coll, f"{tag}_Bars", fixed0, door_x0, CELL_FRONT_Z, BARS_TOP, M["bars"], extra=[jamb], bar=BAR, step=BAR_STEP))
    cols.add(f"{tag}_Bars", (fixed0 + door_x0) / 2, CELL_FRONT_Z, 0.0, door_x0 - fixed0, 0.12, BARS_TOP)
    leaf0 = door_x0 + 0.04
    add(L.bar_door(coll, f"{tag}_Door", hinge_x, leaf0, CELL_FRONT_Z, BARS_TOP, M["bars"], M["metal"], bar=BAR, step=BAR_STEP))
    cols.add(f"{tag}_Door", (leaf0 + hinge_x) / 2, CELL_FRONT_Z, 0.0, hinge_x - leaf0, 0.12, BARS_TOP)
    hatch_x = (fixed0 + door_x0) / 2 + 0.25
    hatch = [
        L.box(coll, f"{tag}_Hatch_Shelf", hatch_x, CELL_FRONT_Z, 0.9, 0.62, 0.5, 0.04, M["steel"]),
        L.box(coll, f"{tag}_Hatch_Top", hatch_x, CELL_FRONT_Z, 1.16, 0.62, 0.22, 0.04, M["steel"]),
        L.box(coll, f"{tag}_Hatch_SideL", hatch_x - 0.29, CELL_FRONT_Z, 0.94, 0.04, 0.22, 0.22, M["steel"]),
        L.box(coll, f"{tag}_Hatch_SideR", hatch_x + 0.29, CELL_FRONT_Z, 0.94, 0.04, 0.22, 0.22, M["steel"]),
        L.box(coll, f"{tag}_Hatch_Tray", hatch_x, CELL_FRONT_Z - 0.12, 0.94, 0.4, 0.24, 0.025, M["tray"]),
    ]
    joined(f"{tag}_Hatch", hatch)
    tap_x = cx + 0.35
    tap_z = Z0 + 0.01
    tap = [
        L.box(coll, f"{tag}_Tap_Plate", tap_x, tap_z + 0.01, 0.6, 0.5, 0.02, 0.55, M["steel"]),
        L.box(coll, f"{tag}_Tap_Basin", tap_x, tap_z + 0.17, 0.72, 0.42, 0.3, 0.14, M["steel"], bevel=0.02),
        L.box(coll, f"{tag}_Tap_Spout", tap_x, tap_z + 0.09, 0.98, 0.04, 0.14, 0.04, M["metal"]),
        L.box(coll, f"{tag}_Tap_Button", tap_x + 0.12, tap_z + 0.03, 1.02, 0.06, 0.03, 0.06, M["metal"]),
    ]
    joined(f"{tag}_Tap", tap)
    cols.add(f"{tag}_Tap", tap_x, tap_z + 0.17, 0.6, 0.5, 0.34, 0.5)
    cells.append({
        "id": f"cell_{n:02d}",
        "position": [round(cx + 0.2, 3), 0.0, -16.4],
        "door": [round((leaf0 + hinge_x) / 2, 3), 0.0, CELL_FRONT_Z],
        "tap": [round(tap_x, 3), 0.86, round(tap_z + 0.17, 3)],
        "hatch": [round(hatch_x, 3), 0.94, CELL_FRONT_Z],
        "bunk": [round(x0 + 0.68, 3), 0.0, -17.85],
        "toilet": [round(x1 - 0.45, 3), 0.0, -18.6],
        "bounds": [[round(x0 + CELL_WALL / 2, 3), 0.0, Z0], [round(x1 - CELL_WALL / 2, 3), 0.0, round(CELL_FRONT_Z - CELL_WALL / 2, 3)]],
    })

bad = L.check_grounded(objs, allow=L.ALLOW_INTERIOR + ("Ceiling", "Beam_", "Cell_", "Wall_"))
print("INTERIOR grounded violations:", bad)
assert not bad, bad
L.export_glb(os.path.join(OUT, "interior.glb"), objs)
L.export_glb(os.path.join(OUT, "interior.colsrc.glb"), objs + cols.items)

interior_front_z = HD - L.SHELL_THICKNESS - L.SHELL_GAP - L.INTERIOR_FRONT_OUTER_Z
portico_z0 = HD - interior_front_z
portico_z1 = portico_z0 + PORTICO_DEPTH
L.write_json(os.path.join(OUT, "interior.layout.json"), {
    "version": 1, "key": KEY, "name": NAME, "spawn": [0.0, 1.6, 3.7],
    "exit": {"position": [0.0, 4.75], "radius": 1.4},
    "levels": [{"id": "L0", "y": 0.0, "height": H_ROOM, "rects": [
        {"minX": X0, "maxX": X1, "minZ": Z0, "maxZ": round(portico_z0, 3)},
        {"minX": -PORTICO_HALF_W, "maxX": PORTICO_HALF_W, "minZ": round(portico_z0, 3), "maxZ": round(portico_z1, 3)},
    ]}],
    "stairs": [{"name": "Stair_Portico", "minX": -STEP_HALF_W, "maxX": STEP_HALF_W, "minZ": round(portico_z1, 3), "maxZ": round(portico_z1 + STEP_DEPTH, 3),
                "y0": -L.INTERIOR_FLOOR_Y, "y1": 0.0, "rise": "-z"}],
    "stations": [
        {"id": "station_police_desk", "role": "front_desk", "desk": "service_desk", "position": [0.0, 0.0, -0.4], "yaw": 0.0, "lookAt": [0.0, 1.5, -2.5]},
    ],
    "npcs": {"officer": [0.0, 0.0, -2.5]},
    "points": {"desk": [0.0, 0.0, -1.6], "lockers": [-10.5, 0.0, 0.0], "wantedBoard": [5.6, 0.0, -2.6]},
    "cells": cells,
})


def triangles(items):
    return sum(len(p.vertices) - 2 for o in items if o.type == "MESH" for p in o.data.polygons)


print("interior:", len(objs), "objects,", len(cols.items), "collision boxes,", triangles(objs), "triangles")

exec(open(os.path.join(HERE, "build_police_ext.py"), encoding="utf-8").read())
