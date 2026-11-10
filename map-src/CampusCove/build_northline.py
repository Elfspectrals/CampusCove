"""Northline: the clothing department store of the Cove Parkview Mall (docs/MALL.md). Same layout contract as Cove
Threads (build_threads.py), so useClothingStore reads it unchanged: 25 modular pieces on rails, shelves and head forms,
4 dressed mannequins on a podium, a counter with a clerk, a mirror. H&M mood: white, mirrored pillars, strings of bulbs.
The rails, shoe wall, head-form tables, folded-clothes tables, round rails, display cubes, podium, plants and checkout
counter are zone props in zones/northline.json (build_shop_decor.py), not baked here.

Outputs: out/store/northline/{interior.glb, interior.colsrc.glb, interior.layout.json, exterior.glb, exterior.colsrc.glb,
exterior.layout.json, preview.png}. Then build_house_lightmaps.py -- store northline, npm run assets:optimize -- store.
"""
import importlib
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
import bpy

KEY = "northline"
NAME = "Northline"
OUT = os.path.join(L.OUT_ROOT, "store", KEY)
H = 4.8
X0, X1, Z0, Z1 = -16.0, 16.0, -25.0, 5.0
BODY_SCALE = 0.936
BODY_LIFT = 0.009
RAIL_Y = 1.95
TAG_Y = 0.72
SHELF_Y = 1.05
TABLE_Y = 0.9
HEAD_Y = 1.55
DEPARTMENTS = {
    "top": "TOPS",
    "bottom": "BOTTOMS",
    "shoes": "FOOTWEAR",
    "hair": "HAIR STUDIO",
    "head_accessory": "ACCESSORIES",
}
ITEMS = {
    "hair": ["short", "long", "curly", "buzz", "ponytail"],
    "head_accessory": ["gamer", "studio", "cat_ear", "neon", "pilot"],
    "top": ["tee", "tank", "hoodie", "varsity", "sweater"],
    "bottom": ["jeans", "joggers", "cargo", "shorts", "skirt"],
    "shoes": ["sneakers", "high_tops", "boots", "slides", "runners"],
}
PIECE_TOP = {"top": 1.707, "bottom": 1.05}
OUTFITS = [
    [("hair", "long"), ("top", "sweater"), ("bottom", "skirt"), ("shoes", "boots")],
    [("hair", "short"), ("top", "varsity"), ("bottom", "jeans"), ("shoes", "high_tops")],
    [("head_accessory", "studio"), ("top", "hoodie"), ("bottom", "cargo"), ("shoes", "runners")],
    [("hair", "buzz"), ("top", "tee"), ("bottom", "shorts"), ("shoes", "slides")],
]


def root_y_for_top(top_in_body, world_top):
    return round(world_top - top_in_body * BODY_SCALE - BODY_LIFT, 3)


sc = L.new_build_scene("STORE_" + KEY + "_interior")
coll = bpy.data.collections.new("Interior")
sc.collection.children.link(coll)
cols = L.Collisions(coll)
M = L.std_mats(wall="#f7f6f3", floor=("#e4e0d8", "tiles", "#d3cfc6"))
M["mirror"] = L.make_mat("IN_NorthMirror", "#cfd8dd", 0.08, "noise", 0.02, emit="#dde6ea", emit_strength=0.25)
M["black"] = L.make_mat("IN_NorthBlack", "#1b1d22", 0.6, "noise", 0.01)
M["sign"] = L.make_mat("IN_NorthSign", "#ffffff", 0.4, "noise", 0.0, emit="#ffffff", emit_strength=1.0)
M["neon"] = L.make_mat("IN_NorthNeon", "#ffffff", 0.3, "noise", 0.0, emit="#fff6e8", emit_strength=2.2)
M["bulb"] = L.make_mat("IN_NorthBulb", "#fff2d6", 0.4, "noise", 0.0, emit="#ffe0a8", emit_strength=1.8)
M["wire"] = L.make_mat("IN_NorthWire", "#2a2d33", 0.6, "noise", 0.02)
M["navy"] = L.make_mat("IN_NorthNavy", "#1f2a5a", 0.7, "noise", 0.02)
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
    cu = bpy.data.curves.new(name + "_cu", "FONT")
    cu.body = body
    cu.size = size
    cu.extrude = 0.0
    cu.resolution_u = 1
    cu.align_x = "CENTER"
    cu.align_y = "BOTTOM"
    tmp = bpy.data.objects.new(name + "_tmp", cu)
    coll.objects.link(tmp)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    coll.objects.unlink(tmp)
    bpy.data.objects.remove(tmp)
    bpy.data.curves.remove(cu)
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    ob.rotation_euler = (math.pi / 2, 0, yaw)
    ob.location = L.b(gx, gz, y0)
    coll.objects.link(ob)
    return add(ob)


displays = []
dept_info = []


def tag_at(gx, gz, yaw, y=TAG_Y):
    return {"position": [round(gx, 3), y, round(gz, 3)], "yaw": round(yaw, 4)}


def dept_board(slot, gx, gz, yaw, along_x):
    add(L.box(coll, f"Sign_{slot}_Board", gx, gz, 3.2, 2.8 if along_x else 0.06, 0.06 if along_x else 2.8, 0.62, M["black"]))
    fx, fz = math.sin(yaw), math.cos(yaw)
    text(f"Sign_{slot}_Text", DEPARTMENTS[slot], gx + fx * 0.04, gz + fz * 0.04, 3.36, 0.34, M["sign"], yaw)
    dept_info.append({"id": slot, "label": DEPARTMENTS[slot], "sign": [round(gx, 3), 3.5, round(gz, 3)]})


def hanging_rail(slot, x_start, z_wall):
    keys = ITEMS[slot]
    z = z_wall + 0.42
    x_end = x_start + 1.25 * (len(keys) - 1)
    dept_board(slot, (x_start + x_end) / 2, z_wall + 0.06, 0.0, True)
    for i, key in enumerate(keys):
        gx = x_start + i * 1.25
        y = root_y_for_top(PIECE_TOP[slot], RAIL_Y - 0.08)
        displays.append({
            "slot": slot, "key": key, "department": slot,
            "position": [round(gx, 3), y, round(z, 3)], "yaw": 0.0,
            "center": [round(gx, 3), round(RAIL_Y - 0.45, 3), round(z, 3)],
            "tag": tag_at(gx, z_wall + 0.1, 0.0),
        })


def shoe_wall(x_wall, z_start):
    keys = ITEMS["shoes"]
    x = x_wall + 0.25
    z_end = z_start + 1.25 * (len(keys) - 1)
    zc = (z_start + z_end) / 2
    dept_board("shoes", x_wall + 0.06, zc, math.pi / 2, False)
    for i, key in enumerate(keys):
        gz = z_start + i * 1.25
        displays.append({
            "slot": "shoes", "key": key, "department": "shoes",
            "position": [round(x, 3), round(SHELF_Y - BODY_LIFT, 3), round(gz, 3)], "yaw": round(math.pi / 2, 4),
            "center": [round(x, 3), round(SHELF_Y + 0.12, 3), round(gz, 3)],
            "tag": tag_at(x_wall + 0.1, gz, math.pi / 2),
        })


def head_table(slot, x_wall, z_start):
    keys = ITEMS[slot]
    x = x_wall - 0.55
    z_end = z_start + 1.2 * (len(keys) - 1)
    zc = (z_start + z_end) / 2
    dept_board(slot, x_wall - 0.06, zc, -math.pi / 2, False)
    for i, key in enumerate(keys):
        gz = z_start + i * 1.2
        displays.append({
            "slot": slot, "key": key, "department": slot,
            "position": [round(x, 3), round(HEAD_Y - 1.745 * BODY_SCALE - BODY_LIFT, 3), round(gz, 3)], "yaw": round(-math.pi / 2, 4),
            "center": [round(x, 3), HEAD_Y, round(gz, 3)],
            "tag": tag_at(x - 0.42, gz, -math.pi / 2, y=0.62),
        })


def pillar(name, gx, gz):
    add(L.box(coll, f"{name}_Core", gx, gz, 0.0, 0.7, 0.7, H, M["mirror"]))
    add(L.box(coll, f"{name}_Base", gx, gz, 0.0, 0.8, 0.8, 0.12, M["black"]))
    cols.add(name, gx, gz, 0.0, 0.8, 0.8, H)


# ---------------------------------------------------------------- shell
rect("House_Floor_Northline", X0 - 0.2, Z0 - 0.2, X1 + 0.2, Z1 + 0.2, -0.1, 0.1, M["floor"], tile=3.0)
rect("Ceiling", X0 - 0.2, Z0 - 0.2, X1 + 0.2, Z1 + 0.3, H, 0.15, M["ceil"], tile=3.0)
win = (0.9, 3.6)
objs += L.wall(coll, "Walls_Front", "x", Z1 + 0.1, 0.2, X0 - 0.2, X1 + 0.2, H, M["wall"],
               openings=[(-14.0, -3.0, *win), (-0.6, 0.6, 0.0, 2.2), (3.0, 14.0, *win)], cols=cols, glass=M["glass"], col_tag="Wall_Front")
objs += L.wall(coll, "Walls_Back", "x", Z0 - 0.1, 0.2, X0 - 0.2, X1 + 0.2, H, M["wall"], cols=cols, col_tag="Wall_Back")
objs += L.wall(coll, "Walls_W", "z", X0 - 0.1, 0.2, Z0, Z1 + 0.2, H, M["wall"], cols=cols, col_tag="Wall_W")
objs += L.wall(coll, "Walls_E", "z", X1 + 0.1, 0.2, Z0, Z1 + 0.2, H, M["wall"], cols=cols, col_tag="Wall_E")
add(L.box(coll, "Door_Entrance", 0, 5.1, 0.01, 1.18, 0.06, 2.18, M["glass"], bevel=0.02))
add(L.box(coll, "Door_Entrance_Frame", 0, 5.06, 2.2, 1.4, 0.1, 0.12, M["black"]))
add(L.box(coll, "Entry_Doormat", 0, 4.4, 0.0, 2.0, 1.0, 0.012, M["mat"]))
add(L.box(coll, "Sky_Front", 0, 16, -3.0, 64, 0.05, 14.0, M["sky"]))
# mirror strip along the upper walls + the brand neon on the back wall
for nm, a, b2, axis, fixed in [("N", X0, X1, "x", Z0 + 0.03), ("W", Z0, Z1, "z", X0 + 0.03), ("E", Z0, Z1, "z", X1 - 0.03)]:
    if axis == "x":
        add(L.box(coll, f"Wall_Mirror{nm}", (a + b2) / 2, fixed, 3.3, b2 - a, 0.04, 1.2, M["mirror"]))
    else:
        add(L.box(coll, f"Wall_Mirror{nm}", fixed, (a + b2) / 2, 3.3, 0.04, b2 - a, 1.2, M["mirror"]))
text("Neon_Brand", NAME.upper(), 0.0, Z0 + 0.09, 3.55, 0.75, M["neon"], 0.0)
text("Neon_Tagline", "women · men · kids", 0.0, Z0 + 0.09, 3.15, 0.3, M["neon"], 0.0)

# strings of bulbs under the ceiling, like the H&M reference
for i, gz in enumerate(range(-22, 4, 4)):
    add(L.box(coll, f"Fairy_Wire{i}", 0.0, gz, 4.35, X1 - X0 - 0.6, 0.015, 0.015, M["wire"]))
    for k, gx in enumerate(range(-15, 16, 2)):
        add(L.box(coll, f"Fairy_Bulb{i}_{k}", gx + (0.6 if i % 2 else 0.0), gz, 4.2, 0.09, 0.09, 0.14, M["bulb"], bevel=0.03))
li = 0
for gx in (-10.0, 0.0, 10.0):
    for gz in (-20.0, -12.0, -4.0, 3.0):
        add(L.box(coll, f"Light_{li:02d}", gx, gz, H - 0.06, 1.6, 0.5, 0.06, M["lamp"]))
        li += 1

for i, (gx, gz) in enumerate(((-7.0, -7.0), (7.0, -7.0), (-7.0, -16.0), (7.0, -16.0))):
    pillar(f"Pillar_{i}", gx, gz)

# ---------------------------------------------------------------- departments (same display maths as Cove Threads)
hanging_rail("top", -12.5, Z0)
hanging_rail("bottom", 7.5, Z0)
shoe_wall(X0, -19.0)
head_table("hair", X1, -21.0)
head_table("head_accessory", X1, -12.0)

MIRROR = {"position": [round(X0 + 0.09, 3), 1.27, -8.5], "yaw": round(math.pi / 2, 4), "size": [1.4, 2.2]}
add(L.box(coll, "Mirror_Frame", X0 + 0.04, -8.5, 0.1, 0.06, 1.6, 2.4, M["black"], bevel=0.02))
add(L.box(coll, "Mirror_Base", X0 + 0.15, -8.5, 0.0, 0.25, 1.7, 0.1, M["black"]))

PLAT = (-8.5, 0.5)
outfits = []
for i, pieces in enumerate(OUTFITS):
    a = math.radians(-40 + i * 26.7)
    gx, gz = PLAT[0] + 1.7 * math.sin(a), PLAT[1] - 0.4 + 0.5 * math.cos(a)
    outfits.append({
        "pieces": [{"slot": s, "key": k} for s, k in pieces],
        "position": [round(gx, 3), 0.14, round(gz, 3)], "yaw": round(math.radians(10 - i * 7), 4),
        "center": [round(gx, 3), 1.1, round(gz, 3)],
        "tag": tag_at(gx, gz + 0.75, 0.0, y=0.4),
    })
add(L.box(coll, "Podium_Board", PLAT[0], PLAT[1] - 3.2, 3.2, 3.2, 0.06, 0.62, M["black"]))
text("Podium_Text", "NEW ARRIVALS", PLAT[0], PLAT[1] - 3.16, 3.36, 0.34, M["sign"], 0.0)

counter_x, counter_z = 9.5, 1.0
add(L.box(coll, "Counter_SignBoard", counter_x, counter_z - 0.3, 2.6, 2.6, 0.08, 0.7, M["black"]))
text("Counter_SignText", "CHECKOUT", counter_x, counter_z - 0.24, 2.75, 0.4, M["sign"], 0.0)
CLERK = {"position": [round(counter_x - 1.3, 3), 0.0, round(counter_z - 1.05, 3)], "yaw": 0.0}

bad = L.check_grounded(objs, allow=L.ALLOW_INTERIOR + ("Ceiling", "Sign_", "Counter_Sign", "Mirror_Frame", "Wall_Mirror", "Neon_", "Fairy_",
                                                      "Pillar_", "Podium_"))
print("NORTHLINE grounded violations:", bad)
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
    merged.append(L.join(coll, f"Store_{m}", group) if len(group) > 1 else group[0])

L.export_glb(os.path.join(OUT, "interior.glb"), merged)
L.snapshot(sc, os.path.join(OUT, "interior_preview.png"), (0.0, 1.6, 3.6), (0.0, 1.3, -12.0), lens=16, res=(960, 640))
L.export_glb(os.path.join(OUT, "interior.colsrc.glb"), merged + cols.items)
L.write_json(os.path.join(OUT, "interior.layout.json"), {
    "version": 2, "key": KEY, "name": NAME, "spawn": [0.0, 1.6, 3.7],
    "exit": {"position": [0.0, 4.75], "radius": 1.4},
    "bounds": {"minX": X0, "maxX": X1, "minZ": Z0, "maxZ": Z1},
    "counter": [counter_x, 1.15, counter_z + 1.2], "clerk": CLERK,
    "departments": dept_info, "displays": displays, "outfits": outfits, "mirror": MIRROR,
})
tris = sum(len(p.vertices) - 2 for o in merged if o.type == "MESH" for p in o.data.polygons)
print("northline interior:", len(objs), "objects ->", len(merged), "nodes,", tris, "tris,", len(cols.items), "collision boxes,", len(displays), "displays,", len(outfits), "outfits")

# ---------------------------------------------------------------- shell (storefront flush with the mall cells, body outside the ring)
W, HB = X1 - X0, 5.5
hd = 4.5
INTERIOR_BACK_OUTER_Z = Z0 - 0.2
WINDOWS = ((-14.0, -3.0), (3.0, 14.0))
WIN_Y = (0.9, 3.6)
sc2 = L.new_build_scene("STORE_" + KEY + "_exterior")
coll2 = bpy.data.collections.new("Exterior")
sc2.collection.children.link(coll2)
E = {
    "found": L.make_mat("EX_Foundation", "#8d8f94", 0.9, "noise", 0.03),
    "wall": L.make_mat("EX_NorthWhite", "#f4f2ee", 0.85, "noise", 0.02),
    "band": L.make_mat("EX_NorthBlack", "#1b1d22", 0.6, "noise", 0.01),
    "red": L.make_mat("EX_NorthRed", "#c8102e", 0.6, "noise", 0.01),
    "sign": L.make_mat("EX_NorthSign", "#ffffff", 0.4, "noise", 0.0, emit="#ffffff", emit_strength=1.4),
    "roof": L.make_mat("EX_RoofGravel", "#6f7076", 0.95, "noise", 0.05),
    "glass": L.make_mat("EX_Glass", "#9fd6ea", 0.1, "noise", 0.02, alpha=0.45),
    "frame": L.make_mat("EX_FrameDark", "#2a2e35", 0.4, "noise", 0.02),
    "metal": L.make_mat("EX_Metal", "#9aa0a8", 0.5, "noise", 0.03),
}
xo = []
cols_e = L.Collisions(coll2)
shell, interior_offset, zb = L.walk_in_shell(coll2, cols_e, W, hd, HB - 0.5, E["wall"], E["glass"],
                                             [(a, b, *WIN_Y) for a, b in WINDOWS], [], [], interior_back=INTERIOR_BACK_OUTER_Z)
xo += shell
DN = hd - zb
zc = (hd + zb) / 2
xo.append(L.box(coll2, "EX_Plinth", 0, zc, 0.0, W + 0.3, DN + 0.3, 0.19, E["found"], bevel=0.02, tile=2.0))
# the band is a hollow ring on the shell walls: a solid slab put its underside at (or below) the interior ceiling
xo += L.perimeter(coll2, "EX_Band", W, hd, zb, HB - 0.5, 0.5, L.SHELL_THICKNESS, E["band"], tile=1.5)
xo.append(L.box(coll2, "EX_Roof", 0, zc, HB, W + 0.4, DN + 0.4, 0.25, E["roof"], tile=3.0))
xo.append(L.box(coll2, "EX_Fascia", 0, hd + 0.04, 3.75, W, 0.08, 1.2, E["band"]))
xo.append(L.text_mesh(coll2, "EX_SignText", NAME.upper(), 0.0, hd + 0.1, 4.0, 0.8, 0.06, E["sign"]))
xo.append(L.box(coll2, "EX_SignDot", 7.4, hd + 0.1, 4.1, 0.3, 0.06, 0.3, E["red"]))
for i, (x0, x1) in enumerate(WINDOWS):
    cx = (x0 + x1) / 2
    xo.append(L.box(coll2, f"EX_WindowTop{i}", cx, hd + 0.06, WIN_Y[1] + 0.02, x1 - x0 + 0.2, 0.08, 0.12, E["frame"]))
    xo.append(L.box(coll2, f"EX_WindowSill{i}", cx, hd + 0.06, WIN_Y[0] - 0.06, x1 - x0 + 0.2, 0.12, 0.12, E["frame"]))
    for k in range(1, 4):
        xo.append(L.box(coll2, f"EX_Mullion{i}_{k}", x0 + k * (x1 - x0) / 4, hd + 0.05, WIN_Y[0], 0.06, 0.08, WIN_Y[1] - WIN_Y[0], E["frame"]))
xo.append(L.hinged_door(coll2, [
    (0, 0.0, 1.18, 0.06, 2.18, E["glass"], 0.0),
    (0, 0.0, 1.18, 0.08, 0.1, E["frame"], 0.0),
    (0, 2.08, 1.18, 0.08, 0.1, E["frame"], 0.0),
    (0.45, 0.95, 0.05, 0.14, 0.05, E["metal"], 0.0),
], -0.59, hd - 0.1, 0.2))
xo.append(L.box(coll2, "EX_DoorFrame", 0, hd + 0.04, 2.4, 1.44, 0.1, 0.12, E["band"]))
bad = L.check_grounded(xo, allow=("EX_Shell", "EX_Band", "EX_Roof", "EX_Sign", "EX_Fascia", "Door", "EX_Door", "EX_Window", "EX_Mullion"))
print("EXTERIOR grounded violations:", bad)
assert not bad, bad
L.export_glb(os.path.join(OUT, "exterior.glb"), xo)
L.export_glb(os.path.join(OUT, "exterior.colsrc.glb"), xo + cols_e.items)
L.write_json(os.path.join(OUT, "exterior.layout.json"), {
    "version": 1, "key": KEY, "name": NAME, "footprint": [W, round(DN, 3)], "footprintCenterZ": round(zc, 4), "doorLocal": [0.0, 1.25, hd],
    "interiorOffset": [round(c, 4) for c in interior_offset],
    "collision": [{"cx": 0.0, "cz": round(zc, 4), "hx": W / 2 + 0.2, "hz": round(DN / 2 + 0.2, 4), "hy": HB / 2}],
})
L.snapshot(sc2, os.path.join(OUT, "preview.png"), (-18, 6, hd + 22), (0, 3.0, -4), lens=28, res=(768, 512))
etris = sum(len(p.vertices) - 2 for o in xo for p in o.data.polygons)
print("northline exterior:", len(xo), "objects,", etris, "tris, interiorOffset", interior_offset, "depth", round(DN, 3))
