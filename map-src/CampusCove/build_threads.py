import importlib
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else os.getcwd()
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import lib_common as L
importlib.reload(L)
import bpy

KEY = "cove_threads"
NAME = "Cove Threads"
OUT = os.path.join(L.OUT_ROOT, "store", KEY)
H = 5.0
X0, X1, Z0, Z1 = -15.0, 15.0, -21.0, 5.0
PLINTH_H = 0.22
TAG_AHEAD = 1.15

DEPARTMENTS = {
    "hair": ("HAIR", "#f4b3c8", ["short", "long", "curly", "buzz", "ponytail"]),
    "head_accessory": ("HEADSETS", "#b9b2d8", ["gamer", "studio", "cat_ear", "neon", "pilot"]),
    "top": ("TOPS", "#a7d8c0", ["tee", "tank", "hoodie", "varsity", "sweater"]),
    "bottom": ("PANTS", "#9fd3e6", ["jeans", "joggers", "cargo", "shorts", "skirt"]),
    "shoes": ("SHOES", "#f5d25e", ["sneakers", "high_tops", "boots", "slides", "runners"]),
}
ROWS = {
    "hair": dict(start=(-13.4, -1.5), step=(0, -2.0), facing=(1, 0)),
    "head_accessory": dict(start=(-13.4, -11.5), step=(0, -2.0), facing=(1, 0)),
    "top": dict(start=(-8.0, -19.4), step=(4.0, 0), facing=(0, 1)),
    "bottom": dict(start=(13.4, -19.5), step=(0, 2.0), facing=(-1, 0)),
    "shoes": dict(start=(13.4, -9.5), step=(0, 2.0), facing=(-1, 0)),
}

sc = L.new_build_scene("STORE_" + KEY + "_interior")
coll = bpy.data.collections.new("Interior")
sc.collection.children.link(coll)
cols = L.Collisions(coll)
M = L.std_mats(wall="#fbf4ef", floor=("#e9dccb", "planks", "#d8c7b0"))
M["accent"] = L.make_mat("IN_ThreadsTeal", "#2f6f63", 0.7, "noise", 0.02)
M["pink"] = L.make_mat("IN_ThreadsPink", "#f4b3c8", 0.8, "noise", 0.02)
M["sign"] = L.make_mat("IN_ThreadsSignGlow", "#ffffff", 0.4, "noise", 0.0, emit="#ffffff", emit_strength=1.0)
M["plinth"] = L.make_mat("IN_ThreadsPlinth", "#f6f3ee", 0.5, "noise", 0.01)
M["rail"] = L.make_mat("IN_ThreadsRail", "#c9a23f", 0.3, "noise", 0.02)
M["mirror"] = L.make_mat("IN_ThreadsMirror", "#dfe9ef", 0.05, "noise", 0.0)
M["rug"] = L.make_mat("IN_ThreadsRug", "#efe3d3", 1.0, "stripes", 0.03, accent="#e3d3bf")
FOLDED = [L.make_mat(f"IN_ThreadsFolded{i}", c, 0.9, "noise", 0.03) for i, c in enumerate(("#8a7ab8", "#4d6fa3", "#e7c98f", "#c46b4f", "#2f6f63", "#f2f0ea"))]
DM = {slot: L.make_mat(f"IN_Dept_{slot}", color, 0.9, "noise", 0.02) for slot, (_, color, _) in DEPARTMENTS.items()}

objs = []


def add(o):
    objs.append(o)
    return o


def rect(name, gx0, gz0, gx1, gz1, y0, h, mat, col=False, tile=2.0):
    cx, cz = (gx0 + gx1) / 2, (gz0 + gz1) / 2
    sx, sz = abs(gx1 - gx0), abs(gz1 - gz0)
    o = add(L.box(coll, name, cx, cz, y0, sx, sz, h, mat, tile=tile))
    if col:
        cols.add(name, cx, cz, y0, sx, sz, h)
    return o


def text(name, body, gx, gz, y0, size, mat, yaw):
    o = L.text_mesh(coll, name, body, gx, gz, y0, size, 0.03, mat, facing="+z")
    o.rotation_euler = (math.pi / 2, 0, yaw)
    return add(o)


def facing_yaw(fx, fz):
    return math.atan2(fx, fz)


rect("House_Floor_Threads", X0 - 0.2, Z0 - 0.2, X1 + 0.2, Z1 + 0.2, -0.1, 0.1, M["floor"], tile=3.0)
rect("Ceiling", X0 - 0.2, Z0 - 0.2, X1 + 0.2, Z1 + 0.3, H, 0.15, M["ceil"], tile=3.0)
win = (0.9, 3.4)
objs += L.wall(coll, "Walls_Front", "x", Z1 + 0.1, 0.2, X0 - 0.2, X1 + 0.2, H, M["wall"],
               openings=[(-13.0, -3.0, *win), (-0.6, 0.6, 0.0, 2.2), (3.0, 13.0, *win)], cols=cols, glass=M["glass"], col_tag="Wall_Front")
objs += L.wall(coll, "Walls_Back", "x", Z0 - 0.1, 0.2, X0 - 0.2, X1 + 0.2, H, M["wall"], cols=cols, col_tag="Wall_Back")
objs += L.wall(coll, "Walls_W", "z", X0 - 0.1, 0.2, Z0, Z1 + 0.2, H, M["wall"], cols=cols, col_tag="Wall_W")
objs += L.wall(coll, "Walls_E", "z", X1 + 0.1, 0.2, Z0, Z1 + 0.2, H, M["wall"], cols=cols, col_tag="Wall_E")
add(L.box(coll, "Door_Entrance", 0, 5.1, 0.01, 1.18, 0.06, 2.18, M["glass"], bevel=0.02))
add(L.box(coll, "Door_Entrance_Frame", 0, 5.06, 2.2, 1.4, 0.1, 0.12, M["accent"]))
add(L.box(coll, "Entry_Doormat", 0, 4.4, 0.0, 2.0, 1.0, 0.012, M["mat"]))
add(L.box(coll, "Sky_Front", 0, 16, -3.0, 60, 0.05, 14.0, M["sky"]))
for nm, a, b2, axis, fixed in [("N", X0, X1, "x", Z0 + 0.03), ("W", Z0, Z1, "z", X0 + 0.03), ("E", Z0, Z1, "z", X1 - 0.03)]:
    if axis == "x":
        add(L.box(coll, f"Wall_Stripe{nm}", (a + b2) / 2, fixed, 3.7, b2 - a, 0.04, 0.25, M["accent"]))
    else:
        add(L.box(coll, f"Wall_Stripe{nm}", fixed, (a + b2) / 2, 3.7, 0.04, b2 - a, 0.25, M["accent"]))
text("Wall_Logo", NAME.upper(), 0, Z0 + 0.06, 3.0, 0.9, M["accent"], 0.0)

displays = []
dept_info = []
for slot, (label, _color, keys) in DEPARTMENTS.items():
    row = ROWS[slot]
    (sx0, sz0), (dx, dz), (fx, fz) = row["start"], row["step"], row["facing"]
    yaw = facing_yaw(fx, fz)
    first = (sx0, sz0)
    last = (sx0 + dx * 4, sz0 + dz * 4)
    pad = 1.1
    if fx:
        wx = sx0 - fx * 1.25
        rect(f"Dept_{slot}_Panel", wx - 0.03, min(first[1], last[1]) - pad, wx + 0.03, max(first[1], last[1]) + pad, 0.0, 3.4, DM[slot])
        rect(f"Dept_{slot}_Rug", sx0 - 0.9, min(first[1], last[1]) - pad, sx0 + 0.9, max(first[1], last[1]) + pad, 0.0, 0.01, M["rug"])
    else:
        wz = sz0 - fz * 1.25
        rect(f"Dept_{slot}_Panel", min(first[0], last[0]) - pad * 1.6, wz - 0.03, max(first[0], last[0]) + pad * 1.6, wz + 0.03, 0.0, 3.4, DM[slot])
        rect(f"Dept_{slot}_Rug", min(first[0], last[0]) - pad * 1.6, sz0 - 0.9, max(first[0], last[0]) + pad * 1.6, sz0 + 0.9, 0.0, 0.01, M["rug"])
    mid = ((first[0] + last[0]) / 2, (first[1] + last[1]) / 2)
    sgx, sgz = mid[0] - fx * 1.2, mid[1] - fz * 1.2
    add(L.box(coll, f"Sign_{slot}_Board", sgx, sgz, 3.6, 3.4 if fz else 0.1, 0.1 if fz else 3.4, 0.8, DM[slot]))
    text(f"Sign_{slot}_Text", label, sgx + fx * 0.07, sgz + fz * 0.07, 3.82, 0.4, M["accent"], yaw)
    dept_info.append({"id": slot, "label": label, "color": DEPARTMENTS[slot][1], "sign": [round(sgx, 3), 4.0, round(sgz, 3)]})
    for i, key in enumerate(keys):
        gx, gz = sx0 + dx * i, sz0 + dz * i
        add(L.cyl(coll, f"Plinth_{slot}_{key}", gx, gz, 0.0, 0.42, PLINTH_H, M["plinth"], seg=16))
        cols.add(f"Plinth_{slot}_{key}", gx, gz, 0.0, 0.84, 0.84, 1.9)
        tx, tz = gx + fx * TAG_AHEAD, gz + fz * TAG_AHEAD
        add(L.cyl(coll, f"TagPost_{slot}_{key}", tx, tz, 0.0, 0.025, 1.05, M["metal"], seg=6))
        add(L.cyl(coll, f"TagFoot_{slot}_{key}", tx, tz, 0.0, 0.16, 0.03, M["metal"], seg=10))
        displays.append({
            "slot": slot, "key": key, "department": slot,
            "position": [round(gx, 3), PLINTH_H, round(gz, 3)], "yaw": round(yaw, 4), "size": [0.6, 1.95, 0.5],
            "tag": {"position": [round(tx, 3), 1.32, round(tz, 3)], "yaw": round(yaw, 4)},
        })

for i, (gx, gz) in enumerate(((-4.5, -8.0), (4.5, -8.0))):
    parts = [(px, 0, 0.0, 0.06, 0.06, 1.6, M["rail"]) for px in (-1.2, 1.2)]
    parts.append((0, 0, 1.55, 2.5, 0.05, 0.05, M["rail"]))
    for k in range(9):
        parts.append((-1.0 + k * 0.25, 0, 0.75, 0.05, 0.5, 0.75, FOLDED[(k + i) % len(FOLDED)], 0.01))
    for pz in (-0.3, 0.3):
        parts.append((0, pz, 0.0, 2.6, 0.06, 0.04, M["rail"]))
    add(L.furn(coll, f"Rack_{i}", gx, gz, 0.0, parts))
    cols.add(f"Rack_{i}", gx, gz, 0.0, 2.7, 0.7, 1.7)
add(L.cyl(coll, "Table_Center", 0.0, -8.0, 0.0, 1.1, 0.85, M["oak"], seg=20))
for k in range(5):
    a = 2 * math.pi * k / 5
    add(L.box(coll, f"Table_Folded{k}", 0.6 * math.cos(a), -8.0 + 0.6 * math.sin(a), 0.85, 0.4, 0.3, 0.06 + 0.04 * (k % 3), FOLDED[k], bevel=0.01))
cols.add("Table_Center", 0.0, -8.0, 0.0, 2.2, 2.2, 0.9)
for i, gx in enumerate((-3.0, 3.0)):
    add(L.furn(coll, f"Mirror_{i}", gx, -14.5, 0.0, [
        (0, 0, 0.0, 1.2, 0.12, 0.1, M["rail"]),
        (0, 0, 0.1, 1.0, 0.05, 2.0, M["mirror"]),
        (0, 0.04, 0.1, 1.1, 0.04, 2.1, M["rail"]),
    ]))
    cols.add(f"Mirror_{i}", gx, -14.5, 0.0, 1.2, 0.3, 2.2)
add(L.furn(coll, "Bench_Center", 0.0, -14.0, 0.0, [(0, 0, 0.0, 2.0, 0.6, 0.42, M["pink"], 0.04)]))
cols.add("Bench_Center", 0.0, -14.0, 0.0, 2.0, 0.6, 0.45)

counter_x, counter_z = 8.5, 0.5
add(L.furn(coll, "Counter", counter_x, counter_z, 0.0, [
    (0, 0, 0.0, 4.0, 1.0, 1.0, M["accent"], 0.02),
    (0, 0, 1.0, 4.2, 1.1, 0.06, M["oak"], 0.01),
    (-1.2, -0.1, 1.06, 0.45, 0.35, 0.3, M["black"], 0.01),
    (0.8, 0.0, 1.06, 0.7, 0.5, 0.12, FOLDED[3], 0.01),
]))
cols.add("Counter", counter_x, counter_z, 0.0, 4.2, 1.1, 1.1)
add(L.box(coll, "Counter_SignBoard", counter_x, counter_z - 0.3, 2.6, 2.6, 0.08, 0.7, M["pink"]))
text("Counter_SignText", "PAY HERE", counter_x, counter_z - 0.24, 2.75, 0.4, M["accent"], 0.0)
for gx in (-13.8, 13.8):
    add(L.plant(coll, M, f"Plant_{int(gx)}", gx, 4.2))
    cols.add(f"Plant_{int(gx)}", gx, 4.2, 0.0, 0.5, 0.5, 1.3)

li = 0
for gx in (-9.0, -3.0, 3.0, 9.0):
    for gz in (-17.0, -11.0, -5.0, 1.0):
        add(L.box(coll, f"Light_{li:02d}", gx, gz, H - 0.1, 1.6, 1.6, 0.08, M["lamp"]))
        li += 1

bad = L.check_grounded(objs, allow=L.ALLOW_INTERIOR + ("Ceiling", "Sign_", "Counter_Sign", "Dept_", "Wall_Logo", "Table_Folded"))
print("THREADS grounded violations:", bad)
assert not bad, bad

by_mat = {}
merged = []
for o in objs:
    if o.name.startswith(("Door_Entrance", "Sky_")):
        merged.append(o)
        continue
    m = o.data.materials[0].name if o.type == "MESH" and o.data.materials else "none"
    by_mat.setdefault(m, []).append(o)
for m, group in by_mat.items():
    merged.append(L.join(coll, f"Threads_{m}", group) if len(group) > 1 else group[0])

L.export_glb(os.path.join(OUT, "interior.glb"), merged)
L.export_glb(os.path.join(OUT, "interior.colsrc.glb"), merged + cols.items)
L.write_json(os.path.join(OUT, "interior.layout.json"), {
    "version": 1, "key": KEY, "name": NAME, "spawn": [0.0, 1.6, 3.7],
    "exit": {"position": [0.0, 4.75], "radius": 1.4},
    "bounds": {"minX": X0, "maxX": X1, "minZ": Z0, "maxZ": Z1},
    "counter": [counter_x, 1.15, counter_z + 1.2],
    "departments": dept_info, "displays": displays,
})
tris = sum(len(p.vertices) - 2 for o in merged if o.type == "MESH" for p in o.data.polygons)
print("threads interior:", len(objs), "objects ->", len(merged), "nodes,", tris, "tris,", len(cols.items), "collision boxes,", len(displays), "displays")
