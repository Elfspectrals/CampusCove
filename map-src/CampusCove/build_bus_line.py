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
import bpy

PI = math.pi
OUT = os.path.join(L.OUT_ROOT, "park", "bus_line")
ROUTE = json.load(open(os.path.join(HERE, "bus_route.json"), encoding="utf-8"))

BUS_LENGTH, BUS_WIDTH, BUS_HEIGHT = 12.0, 2.55, 3.0
FLOOR_Y = 0.4
ROAD_TOP = 0.035
PAD_TOP = 0.1
POLE_H = 2.9

sc = L.new_build_scene("PARK_bus_line")
bus_coll = bpy.data.collections.new("city_bus")
line_coll = bpy.data.collections.new("bus_line")
sc.collection.children.link(bus_coll)
sc.collection.children.link(line_coll)
line = S.Site(line_coll, "BusLine", seed=91)

M = {
    "paint": L.make_mat("BS_BusPaint", "#f3f0e7", 0.5, "noise", 0.02),
    "band": L.make_mat("BS_BusBand", "#2a9d8f", 0.5, "noise", 0.02),
    "trim": L.make_mat("BS_BusTrim", "#2b2e33", 0.6, "noise", 0.02),
    "bus_glass": L.make_mat("BS_BusGlass", "#a9d6e5", 0.1, "noise", 0.01, alpha=0.3),
    "tyre": L.make_mat("BS_BusTyre", "#1d1e21", 0.9, "noise", 0.03),
    "hub": L.make_mat("BS_BusHub", "#b9bcc0", 0.4, "noise", 0.02),
    "floor": L.make_mat("BS_BusFloor", "#5d6168", 0.9, "stripes", 0.03, accent="#53575d"),
    "seat": L.make_mat("BS_BusSeat", "#3d5a80", 0.9, "noise", 0.05),
    "pole": L.make_mat("BS_BusGrabPole", "#e9c46a", 0.4, "noise", 0.02),
    "head": L.make_mat("BS_BusHeadlight", "#fff4d0", 0.4, "noise", 0.0, emit="#fff1c4", emit_strength=1.2),
    "tail": L.make_mat("BS_BusTaillight", "#c0392b", 0.5, "noise", 0.0, emit="#e04a3a", emit_strength=0.8),
    "dest": L.make_mat("BS_BusDestination", "#ffb703", 0.5, "noise", 0.0, emit="#ffb703", emit_strength=0.9),
    "asphalt": L.make_mat("TW_BusLineAsphalt", "#3b3c40", 0.95, "noise", 0.05),
    "walk": L.make_mat("TW_BusLinePaving", "#d8ccb2", 0.9, "tiles", 0.05, accent="#c4b79b"),
    "iron": L.make_mat("TW_BusLinePole", "#2e3236", 0.6, "noise", 0.02),
    "frame": L.make_mat("TW_BusLineShelterFrame", "#3a3f45", 0.5, "noise", 0.02),
    "glass": L.make_mat("TW_BusLineShelterGlass", "#bfe4f2", 0.1, "noise", 0.01, alpha=0.35),
    "wood": L.make_mat("TW_BusLineBenchWood", "#9c6b43", 0.85, "planks", 0.05, accent="#7e5433"),
    "sign": L.make_mat("TW_BusLineSignBoard", "#2a9d8f", 0.7, "noise", 0.02),
    "sign_text": L.make_mat("TW_BusLineSignText", "#f3f1ea", 0.8, "noise", 0.0),
}


def bus_body():
    hl, hw = BUS_LENGTH / 2, BUS_WIDTH / 2
    wall = 0.08
    side_x = hw - wall / 2
    window_y0, window_y1 = 1.15, 2.45
    parts = [
        (0, 0, 0.32, BUS_WIDTH, BUS_LENGTH, FLOOR_Y - 0.32, M["floor"]),
        (0, 0, BUS_HEIGHT - 0.2, BUS_WIDTH, BUS_LENGTH, 0.2, M["paint"], 0.04),
        (0, 0, window_y1, BUS_WIDTH, BUS_LENGTH, BUS_HEIGHT - 0.2 - window_y1, M["band"]),
        (0, 1.5, BUS_HEIGHT, 1.6, 2.6, 0.22, M["trim"], 0.03),
    ]
    for sx in (-side_x, side_x):
        parts.append((sx, 0, 0.32, wall, BUS_LENGTH, window_y0 - 0.32 - 0.25, M["paint"]))
        parts.append((sx, 0, window_y0 - 0.25, wall, BUS_LENGTH, 0.25, M["band"]))
        for k in range(7):
            parts.append((sx, -hl + 0.15 + k * (BUS_LENGTH - 0.3) / 6, window_y0, wall, 0.16, window_y1 - window_y0, M["trim"]))
    door_z0, door_z1 = -hl + 0.8, -hl + 2.0
    parts.append((side_x + 0.01, (door_z0 + door_z1) / 2, 0.32, wall, door_z1 - door_z0, window_y0 - 0.32, M["trim"]))
    for lz in (-hl + wall / 2, hl - wall / 2):
        parts.append((0, lz, 0.32, BUS_WIDTH, wall, 0.9, M["paint"]))
        parts.append((0, lz, 1.22, BUS_WIDTH, wall, 0.08, M["band"]))
    parts.append((0, hl - wall / 2, window_y1 - 0.45, BUS_WIDTH, wall, 0.45, M["paint"]))
    parts += [
        (0, -hl - 0.06, 0.32, BUS_WIDTH - 0.1, 0.16, 0.3, M["trim"], 0.03),
        (0, hl + 0.06, 0.32, BUS_WIDTH - 0.1, 0.16, 0.3, M["trim"], 0.03),
        (-0.9, -hl - 0.02, 0.75, 0.42, 0.05, 0.16, M["head"]),
        (0.9, -hl - 0.02, 0.75, 0.42, 0.05, 0.16, M["head"]),
        (-1.0, hl + 0.02, 0.85, 0.3, 0.05, 0.3, M["tail"]),
        (1.0, hl + 0.02, 0.85, 0.3, 0.05, 0.3, M["tail"]),
        (0, -hl - 0.03, window_y1 + 0.06, 1.8, 0.05, 0.32, M["dest"]),
    ]
    for row in range(9):
        lz = -hl + 3.0 + row * 0.95
        for sx in (-0.85, 0.85):
            if sx > 0 and row == 0:
                continue
            parts += [(sx, lz, FLOOR_Y, 0.62, 0.45, 0.42, M["seat"]), (sx, lz + 0.22, FLOOR_Y + 0.42, 0.62, 0.08, 0.5, M["seat"])]
    for lz in (-3.2, 0.0, 3.2):
        parts.append((0, lz, FLOOR_Y, 0.05, 0.05, 1.9, M["pole"]))
    return L.furn(bus_coll, "Bus_Body", 0.0, 0.0, 0.0, parts)


def bus_glass():
    hl, hw = BUS_LENGTH / 2, BUS_WIDTH / 2
    window_y0, window_y1 = 1.15, 2.45
    door_z0, door_z1 = -hl + 0.8, -hl + 2.0
    parts = [(sx, 0, window_y0, 0.02, BUS_LENGTH - 0.3, window_y1 - window_y0, M["bus_glass"]) for sx in (-hw + 0.04, hw - 0.04)]
    parts += [
        (hw + 0.06, (door_z0 + door_z1) / 2, 0.45, 0.02, door_z1 - door_z0 - 0.2, window_y0 - 0.55, M["bus_glass"]),
        (0, -hl + 0.04, 1.3, BUS_WIDTH - 0.2, 0.02, window_y1 - 1.3 + 0.1, M["bus_glass"]),
        (0, hl - 0.04, 1.3, BUS_WIDTH - 0.3, 0.02, window_y1 - 0.45 - 1.3, M["bus_glass"]),
    ]
    return L.furn(bus_coll, "Bus_Glass", 0.0, 0.0, 0.0, parts)


def bus_wheels():
    out = []
    for i, (wx, wz) in enumerate([(sx, lz) for sx in (-1.1, 1.1) for lz in (-BUS_LENGTH / 2 + 2.4, BUS_LENGTH / 2 - 2.9)]):
        for part, radius, width, mat in (("Tyre", 0.5, 0.32, M["tyre"]), ("Hub", 0.26, 0.34, M["hub"])):
            w = L.cyl(bus_coll, f"Bus_Wheel{i}_{part}", 0.0, 0.0, 0.0, radius, width, mat, seg=12)
            w.rotation_euler = (0, PI / 2, 0)
            w.location = L.b(wx - width / 2, wz, 0.5)
            out.append(w)
    return out


bus_objs = [bus_body(), bus_glass(), *bus_wheels()]


def road_link(rid, pts, width):
    for i, ((ax, az), (bx, bz)) in enumerate(zip(pts, pts[1:])):
        S.strip(line, f"BL_{rid}_Road{i}", ax, az, bx, bz, -width / 2, width / 2, 0.0, ROAD_TOP, M["asphalt"], tile=3.0)
    for i, (x, z) in enumerate(pts[1:-1] if pts[0] != pts[-1] else pts[:-1]):
        S.disc(line, f"BL_{rid}_Corner{i}", x, z, width / 2, 0.0, ROAD_TOP, M["asphalt"], seg=16, tile=3.0)


for road in ROUTE["roads"]:
    road_link(road["id"], [tuple(p) for p in road["centreline"]], road["width"])


def bus_stop_pole(name, x, z):
    line.add(L.cyl(line.coll, f"{name}_Pole", x, z, 0.0, 0.04, POLE_H, M["iron"], seg=8))
    line.add(L.box(line.coll, f"{name}_Flag", x, z, 2.35, 0.5, 0.03, 0.5, M["sign"]))
    for side, dz, flip in (("S", 0.02, 0.0), ("N", -0.02, PI)):
        t = L.text_mesh(line.coll, f"{name}_Text{side}", "BUS", x, z + dz, 2.5, 0.18, 0.005, M["sign_text"], resolution=2)
        t.rotation_euler = (PI / 2, 0, flip)
        line.add(t)
    line.col(f"{name}_Pole", x, z, 0.2, 0.2, 2.0)


built = set()
for stop in ROUTE["stops"]:
    if stop.get("existing"):
        continue
    for side in ("A", "B"):
        e = stop[side]
        key = (tuple(e["pole"]), None if e["shelter"] is None else tuple(e["shelter"]["center"]))
        if key in built:
            continue
        built.add(key)
        tag = f"BL_{stop['id']}_{side}"
        bus_stop_pole(tag, *e["pole"])
        if e["shelter"] is None:
            continue
        cx, cz = e["shelter"]["center"]
        rot = e["shelter"]["rot"]
        along_x = abs(math.sin(rot)) < 0.5
        sx, sz = (4.6, 2.1) if along_x else (2.1, 4.6)
        S.rect(line, f"{tag}_Pad", cx - sx / 2, cz - sz / 2, cx + sx / 2, cz + sz / 2, 0.0, PAD_TOP, M["walk"])
        S.bus_shelter(line, f"{tag}_Shelter", cx, cz, rot, stop["name"].upper(), M)

os.makedirs(OUT, exist_ok=True)
L.export_glb(os.path.join(OUT, "city_bus.glb"), bus_objs, use_active_scene=True)
L.export_glb(os.path.join(OUT, "bus_line.glb"), line.objs, use_active_scene=True)
bus_tris = sum(len(p.vertices) - 2 for o in bus_objs if o.type == "MESH" for p in o.data.polygons)
print(f"city_bus: {len(bus_objs)} objects, {bus_tris} tris")
print(f"bus_line: {len(line.objs)} objects, {line.tris()} tris, {len(line.cols)} COL, {len(built)} stop sides")
L.write_json(os.path.join(OUT, "bus_line.layout.json"), {"version": 1, "busFloorY": FLOOR_Y, "busSize": [BUS_WIDTH, BUS_HEIGHT, BUS_LENGTH], "collision": line.cols})
L.snapshot(sc, os.path.join(OUT, "preview.png"), (9.0, 4.5, -10.0), (0.0, 1.4, 0.0), lens=28, res=(960, 640), hide_prefixes=("BL_",))
