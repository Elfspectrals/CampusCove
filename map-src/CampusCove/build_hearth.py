"""Hearth & Hollow: the home-decor concept store of the Cove Parkview Mall (docs/MALL.md). Same layout contract as Cove
Home (build_store.py) so useFurnitureStore reads it: a curated set of 26 Cove Home pieces (decor/<key>/model.glb,
codes decor_*) shown on wooden tables, plinths and the floor of an industrial hall (sawtooth skylights, steel trusses,
brick wall, timber panels, a big slatted pendant), each with a price tag.

Reads out/decor/furniture.manifest.json (build_furniture.py) for the item footprints.
Outputs: out/store/hearth_hollow/{interior.glb, interior.colsrc.glb, interior.layout.json, exterior.glb, exterior.colsrc.glb,
exterior.layout.json, preview.png}. Then build_house_lightmaps.py -- store hearth_hollow, npm run assets:optimize -- store.
"""
import ast
import importlib
import json
import math
import os
import random
import sys

if "__file__" not in globals():
    raise RuntimeError('Run with exec(open(p).read(), {"__file__": p}) so the script can find lib_common.py')
HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import lib_common as L
importlib.reload(L)
import bpy

KEY = "hearth_hollow"
NAME = "Hearth & Hollow"
OUT = os.path.join(L.OUT_ROOT, "store", KEY)
H = 5.2
X0, X1, Z0, Z1 = -15.0, 15.0, -25.0, 5.0
TABLE_Y = 0.78
rng = random.Random(31)

manifest = json.load(open(os.path.join(L.OUT_ROOT, "decor", "furniture.manifest.json"), encoding="utf-8"))
manifest.update({
    "wooden_chair": [0.46, 1.0, 0.44], "dining_table": [1.4, 1.05, 0.85], "floor_lamp": [0.49, 1.74, 0.49],
    "potted_plant": [0.56, 1.36, 0.56], "bookshelf": [1.0, 1.8, 0.34],
})
LEGACY_CODES = {"wooden_chair": "chair_campus_basic", "floor_lamp": "lamp_study", "dining_table": "decor_dining_table",
                "potted_plant": "decor_potted_plant", "bookshelf": "decor_bookshelf"}
_src = open(os.path.join(HERE, "build_furniture.py"), encoding="utf-8").read()
_lit = _src[_src.index("FURNITURE = [") + len("FURNITURE = "):_src.index("]\n\nM = {") + 1]
BLURB = {k: desc for k, _n, _d, _p, _r, _s, desc in ast.literal_eval(_lit)}
BLURB.update({
    "wooden_chair": "Solid wood chair with a teal cushion.", "floor_lamp": "Brass floor lamp with a warm shade.",
    "potted_plant": "Leafy plant in a terracotta pot.", "bookshelf": "Four-shelf bookcase, books included.",
})


def code_of(key):
    return LEGACY_CODES.get(key, "decor_" + key)


DEPARTMENTS = {
    "living": ("LIVING", "#c47c4c"),
    "light_plants": ("LIGHT & PLANTS", "#7fb24a"),
    "shelving": ("SHELVES & MIRRORS", "#9b7653"),
    "kitchen_bath": ("KITCHEN & BATH", "#3aa89a"),
    "outdoor": ("OUTDOOR", "#5b8fd9"),
}
# department -> [(key, spot kind)]; "table" items stand on a shared wooden table, "floor" items stand on the floor
ISLANDS = {
    "living": [("armchair_lounge", "floor"), ("coffee_table_round", "floor"), ("pouf_knit", "floor"), ("rug_round", "floor"), ("side_table", "floor"), ("floor_lamp_arc", "floor")],
    "light_plants": [("floor_lamp", "floor"), ("monstera", "floor"), ("potted_plant", "floor"), ("desk_lamp", "table"), ("cactus", "table"), ("vase_tulips", "table")],
    "shelving": [("bookshelf", "floor"), ("cube_shelf", "floor"), ("coat_rack", "floor"), ("mirror_standing", "floor"), ("nightstand", "floor"), ("globe", "table")],
    "kitchen_bath": [("bar_stool", "floor"), ("dining_bench", "floor"), ("wooden_chair", "floor"), ("towel_rack", "floor"), ("aquarium", "floor")],
    "outdoor": [("garden_bench", "floor"), ("parasol", "floor"), ("sun_lounger", "floor"), ("bbq_grill", "floor")],
}
COL_OVERRIDE = {"parasol": [0.5, 0.5]}

sc = L.new_build_scene("STORE_" + KEY + "_interior")
coll = bpy.data.collections.new("Interior")
sc.collection.children.link(coll)
cols = L.Collisions(coll)
M = L.std_mats(wall="#e9c98a", floor=("#8a6a4a", "planks", "#6e5338"))
M["brick"] = L.make_mat("IN_HearthBrick", "#9c5a44", 0.95, "tiles", 0.06, accent="#c9b7a4")
M["timber"] = L.make_mat("IN_HearthTimber", "#c9a36a", 0.7, "planks", 0.05, accent="#a98550")
M["ochre"] = L.make_mat("IN_HearthOchre", "#e0b85a", 0.95, "noise", 0.04)
M["steel"] = L.make_mat("IN_HearthSteel", "#2f3338", 0.55, "noise", 0.03)
M["shed"] = L.make_mat("IN_HearthLightPanelShed", "#eef6fb", 0.3, "noise", 0.01, emit="#f4f8ff", emit_strength=0.9)
M["concrete"] = L.make_mat("IN_HearthConcrete", "#b9b3a8", 0.9, "noise", 0.03)
M["table"] = L.make_mat("IN_HearthTable", "#b8884f", 0.6, "planks", 0.04, accent="#96693a")
M["slat"] = L.make_mat("IN_HearthSlat", "#3b3630", 0.7, "noise", 0.02)
M["bulb"] = L.make_mat("IN_HearthLightPanelBulb", "#fff0cf", 0.4, "noise", 0.0, emit="#ffd98a", emit_strength=1.8)
M["sign"] = L.make_mat("IN_HearthSign", "#fff7ea", 0.4, "noise", 0.0, emit="#fff1d6", emit_strength=0.9)
M["black"] = L.make_mat("IN_HearthBlack", "#1d1f24", 0.6, "noise", 0.01)
M["tag"] = L.make_mat("IN_HearthTagPost", "#4a4f57", 0.5, "noise", 0.02)
OBJ_COLORS = ("#e0533d", "#f6d04d", "#3f7f8c", "#f07fa8", "#2f6f63", "#1f5fae", "#f2a65a", "#a985e0", "#79b765", "#f7f4ec")
OBJS = [L.make_mat(f"IN_HearthObj{i}", c, 0.6, "noise", 0.03) for i, c in enumerate(OBJ_COLORS)]
DM = {dep: L.make_mat(f"IN_HearthDept_{dep}", c, 0.8, "noise", 0.02) for dep, (_, c) in DEPARTMENTS.items()}

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


def facing_yaw(fx, fz):
    return math.atan2(fx, fz)


def knick_shelf(name, gx, gz, length, along_x, yaw_face):
    """Wall shelving of colourful small objects (decor only, nothing sold)."""
    depth = 0.38
    sx, sz = (length, depth) if along_x else (depth, length)
    for lv in range(4):
        y = 0.4 + lv * 0.55
        add(L.box(coll, f"{name}_Board{lv}", gx, gz, y, sx, sz, 0.035, M["timber"]))
        n = int(length / 0.45)
        for i in range(n):
            off = -length / 2 + (i + 0.5) * length / n
            ox, oz = (gx + off, gz) if along_x else (gx, gz + off)
            kind = rng.randint(0, 2)
            m = OBJS[(i + lv * 3) % len(OBJS)]
            if kind == 0:
                add(L.box(coll, f"{name}_Obj{lv}_{i}", ox, oz, y + 0.035, 0.22, 0.22, 0.18 + 0.06 * (i % 3), m))
            elif kind == 1:
                add(L.cyl(coll, f"{name}_Obj{lv}_{i}", ox, oz, y + 0.035, 0.09, 0.26 + 0.05 * (i % 2), m, seg=6))
            else:
                add(L.cyl(coll, f"{name}_Obj{lv}_{i}", ox, oz, y + 0.035, 0.12, 0.12, m, seg=6))
    for k in (-1, 1):
        px, pz = (gx + k * length / 2, gz) if along_x else (gx, gz + k * length / 2)
        add(L.box(coll, f"{name}_Post{k + 1}", px, pz, 0.0, 0.05 if along_x else depth, depth if along_x else 0.05, 2.1, M["steel"]))
    cols.add(name, gx, gz, 0.0, sx + 0.1, sz + 0.1, 2.1)


# ---------------------------------------------------------------- hall
rect("House_Floor_Hearth", X0 - 0.2, Z0 - 0.2, X1 + 0.2, Z1 + 0.2, -0.1, 0.1, M["floor"], tile=3.0)
win = (0.9, 3.4)
objs += L.wall(coll, "Walls_Front", "x", Z1 + 0.1, 0.2, X0 - 0.2, X1 + 0.2, H, M["wall"],
               openings=[(-13.0, -3.0, *win), (-0.6, 0.6, 0.0, 2.2), (3.0, 13.0, *win)], cols=cols, glass=M["glass"], col_tag="Wall_Front")
objs += L.wall(coll, "Walls_Back", "x", Z0 - 0.1, 0.2, X0 - 0.2, X1 + 0.2, H, M["brick"], cols=cols, col_tag="Wall_Back")
objs += L.wall(coll, "Walls_W", "z", X0 - 0.1, 0.2, Z0, Z1 + 0.2, H, M["ochre"], cols=cols, col_tag="Wall_W")
objs += L.wall(coll, "Walls_E", "z", X1 + 0.1, 0.2, Z0, Z1 + 0.2, H, M["timber"], cols=cols, col_tag="Wall_E")
add(L.box(coll, "Door_Entrance", 0, 5.1, 0.01, 1.18, 0.06, 2.18, M["glass"], bevel=0.02))
add(L.box(coll, "Door_Entrance_Frame", 0, 5.06, 2.2, 1.4, 0.1, 0.12, M["steel"]))
add(L.box(coll, "Entry_Doormat", 0, 4.4, 0.0, 2.0, 1.0, 0.012, M["mat"]))
add(L.box(coll, "Sky_Front", 0, 16, -3.0, 60, 0.05, 14.0, M["sky"]))
# sawtooth roof: 4 sheds, each a sloped opaque panel (stepped boxes) + a vertical emissive glass pane
SHED_W = (Z1 - Z0 + 0.4) / 4
for s in range(4):
    z_hi = Z1 + 0.2 - s * SHED_W
    z_lo = z_hi - SHED_W
    add(L.box(coll, f"Ceiling_Shed{s}", 0.0, (z_hi + z_lo) / 2, H + 0.6, X1 - X0 + 0.4, SHED_W, 0.15, M["ceil"], tile=3.0))
    add(L.box(coll, f"Light_Shed{s}", 0.0, z_hi - 0.5, H, X1 - X0 - 0.6, 0.9, 0.08, M["shed"]))
    add(L.box(coll, f"Truss_Beam{s}", 0.0, z_lo + 0.3, H - 0.5, X1 - X0 + 0.2, 0.22, 0.5, M["steel"]))
    for gx in (-12.0, -6.0, 0.0, 6.0, 12.0):
        add(L.box(coll, f"Truss_Hanger{s}_{int(gx)}", gx, z_lo + 0.3, H, 0.08, 0.08, 0.6, M["steel"]))
for gx in (-13.0, 13.0):
    add(L.box(coll, f"Truss_Rail{int(gx)}", gx, (Z0 + Z1) / 2, H - 0.4, 0.2, Z1 - Z0, 0.4, M["steel"]))
for i, (gx, gz) in enumerate(((-7.5, -3.0), (7.5, -3.0), (-7.5, -15.0), (7.5, -15.0))):
    add(L.cyl(coll, f"Column_{i}", gx, gz, 0.0, 0.18, H, M["steel"], seg=10))
    cols.add(f"Column_{i}", gx, gz, 0.0, 0.4, 0.4, H)
# the big slatted pendant over the middle island
add(L.cyl(coll, "Pendant_Cord", 0.0, -9.0, 3.4, 0.02, H - 3.4, M["steel"], seg=4))
add(L.cyl(coll, "Pendant_Hub", 0.0, -9.0, 3.1, 0.35, 0.3, M["slat"], seg=12))
add(L.cyl(coll, "Light_Pendant", 0.0, -9.0, 3.05, 0.3, 0.05, M["bulb"], seg=12))
for k in range(18):
    a = 2 * math.pi * k / 18
    add(L.box(coll, f"Pendant_Slat{k}", 1.3 * math.cos(a), -9.0 + 1.3 * math.sin(a), 3.25, 2.4, 0.04, 0.02, M["slat"], rot=-a))
# hanging bulbs on cords along the walls
li = 0
for gx in (-12.0, -6.0, 0.0, 6.0, 12.0):
    for gz in (-21.0, -13.0, -5.0, 2.0):
        add(L.cyl(coll, f"Bulb_Cord{li}", gx, gz, 3.6, 0.01, H - 3.6, M["steel"], seg=4))
        add(L.box(coll, f"Light_{li:02d}", gx, gz, 3.45, 0.16, 0.16, 0.2, M["bulb"], bevel=0.05))
        li += 1
# brand letters on the brick wall + ochre wall graphics
text("Brand_Text", "HEARTH & HOLLOW", 0.0, Z0 + 0.1, 3.4, 0.75, M["sign"], 0.0)
text("Brand_Tag", "objects for a slow home", 0.0, Z0 + 0.1, 3.0, 0.3, M["sign"], 0.0)
for i, body in enumerate(("make", "room", "for", "beauty")):
    text(f"Ochre_Word{i}", body, X0 + 0.1, 1.5 - i * 1.3, 2.0, 0.5, M["black"], math.pi / 2)
knick_shelf("Knick_E1", X1 - 0.25, -6.0, 6.0, False, -math.pi / 2)
knick_shelf("Knick_E2", X1 - 0.25, -17.0, 6.0, False, -math.pi / 2)
knick_shelf("Knick_W1", X0 + 0.25, -16.0, 7.0, False, math.pi / 2)
knick_shelf("Knick_Back", -9.5, Z0 + 0.25, 6.0, True, 0.0)
knick_shelf("Knick_Back2", 9.5, Z0 + 0.25, 6.0, True, 0.0)

# ---------------------------------------------------------------- islands
displays = []
dept_info = []


def island(dep, cx, cz, dx, dz):
    """One department: a wooden table for the small pieces, floor spots around it for the big ones, a hanging sign."""
    label, color = DEPARTMENTS[dep]
    items = ISLANDS[dep]
    table_items = [k for k, kind in items if kind == "table"]
    floor_items = [k for k, kind in items if kind == "floor"]
    if table_items:
        tw = 0.7 * len(table_items) + 0.5
        add(L.box(coll, f"Table_{dep}_Top", cx, cz, TABLE_Y - 0.05, tw, 0.9, 0.05, M["table"], bevel=0.01))
        for k, (ox, oz) in enumerate(((-tw / 2 + 0.15, -0.3), (tw / 2 - 0.15, -0.3), (-tw / 2 + 0.15, 0.3), (tw / 2 - 0.15, 0.3))):
            add(L.box(coll, f"Table_{dep}_Leg{k}", cx + ox, cz + oz, 0.0, 0.07, 0.07, TABLE_Y - 0.05, M["steel"]))
        cols.add(f"Table_{dep}", cx, cz, 0.0, tw, 0.9, TABLE_Y + 0.4)
        for i, key in enumerate(table_items):
            gx = cx - tw / 2 + 0.6 + i * 0.7
            gz = cz
            w_, h_, d_ = manifest[key]
            tx, tz = gx, cz + 0.75
            add(L.cyl(coll, f"TagPost_{key}", tx, tz, 0.0, 0.02, 0.95, M["tag"], seg=6))
            displays.append({"key": key, "code": code_of(key), "department": dep, "description": BLURB[key],
                             "position": [round(gx, 3), TABLE_Y, round(gz, 3)], "yaw": 0.0, "size": [w_, h_, d_],
                             "tag": {"position": [round(tx, 3), 1.22, round(tz, 3)], "yaw": 0.0}})
    n = len(floor_items)
    for i, key in enumerate(floor_items):
        w_, h_, d_ = manifest[key]
        a = 2 * math.pi * i / n + math.pi / 2
        gx, gz = cx + dx * math.cos(a), cz + dz * math.sin(a)
        yaw = facing_yaw(cx - gx, cz - gz) + math.pi
        y0 = 0.0
        if max(w_, d_) < 0.5 and h_ < 0.9:
            y0 = 0.4
            add(L.box(coll, f"Plinth_{key}", gx, gz, 0.0, 0.6, 0.6, 0.4, M["concrete"], bevel=0.02))
            cols.add(f"Plinth_{key}", gx, gz, 0.0, 0.6, 0.6, 0.4)
        cw, cd = COL_OVERRIDE.get(key, [w_, d_])
        if h_ > 0.05:
            side = max(cw, cd)
            cols.add(f"Item_{key}", gx, gz, y0, side, side, h_)
        r_tag = math.hypot(gx - cx, gz - cz) + max(cw, cd) / 2 + 0.3
        tx, tz = cx + r_tag * math.cos(a), cz + r_tag * math.sin(a)
        add(L.cyl(coll, f"TagPost_{key}", tx, tz, 0.0, 0.025, 1.05, M["tag"], seg=6))
        add(L.cyl(coll, f"TagFoot_{key}", tx, tz, 0.0, 0.16, 0.03, M["tag"], seg=10))
        displays.append({"key": key, "code": code_of(key), "department": dep, "description": BLURB[key],
                         "position": [round(gx, 3), y0, round(gz, 3)], "yaw": round(yaw, 4), "size": [w_, h_, d_],
                         "tag": {"position": [round(tx, 3), 1.32, round(tz, 3)], "yaw": round(facing_yaw(cx - tx, cz - tz) + math.pi, 4)}})
    add(L.box(coll, f"Sign_{dep}_Board", cx, cz, 3.0, 2.6, 0.08, 0.55, DM[dep]))
    for o_ in (-1.1, 1.1):
        add(L.cyl(coll, f"Sign_{dep}_Wire{int(o_ * 10)}", cx + o_, cz, 3.55, 0.01, H - 3.55, M["steel"], seg=4))
    text(f"Sign_{dep}_Text", label, cx, cz + 0.06, 3.12, 0.3, M["sign"], 0.0)
    text(f"Sign_{dep}_TextBack", label, cx, cz - 0.06, 3.12, 0.3, M["sign"], math.pi)
    dept_info.append({"id": dep, "label": label, "color": color, "sign": [round(cx, 3), 3.3, round(cz, 3)]})


island("living", -8.5, -9.0, 3.2, 2.6)
island("light_plants", 0.0, -3.0, 3.0, 2.2)
island("shelving", 8.5, -9.0, 3.2, 2.6)
island("kitchen_bath", -7.0, -19.0, 3.0, 2.4)
island("outdoor", 7.0, -19.0, 3.4, 2.4)

counter_x, counter_z = 10.5, 1.5
add(L.furn(coll, "Counter", counter_x, counter_z, 0.0, [
    (0, 0, 0.0, 3.4, 0.9, 0.95, M["timber"], 0.02),
    (0, 0, 0.95, 3.6, 1.0, 0.06, M["concrete"], 0.01),
    (-1.0, -0.05, 1.01, 0.45, 0.35, 0.3, M["black"], 0.01),
    (0.9, 0.0, 1.01, 0.5, 0.4, 0.3, OBJS[3], 0.02),
]))
cols.add("Counter", counter_x, counter_z, 0.0, 3.6, 1.0, 1.1)
add(L.box(coll, "Counter_SignBoard", counter_x, counter_z - 0.35, 2.5, 2.2, 0.08, 0.6, M["slat"]))
text("Counter_SignText", "PAY HERE", counter_x, counter_z - 0.29, 2.62, 0.34, M["sign"], 0.0)
for gx in (-13.5, 13.5):
    add(L.plant(coll, M, f"Plant_{int(gx)}", gx, 4.0))
    cols.add(f"Plant_{int(gx)}", gx, 4.0, 0.0, 0.5, 0.5, 1.3)

bad = L.check_grounded(objs, allow=L.ALLOW_INTERIOR + ("Ceiling", "Truss_", "Pendant_", "Bulb_", "Brand_", "Ochre_", "Knick_", "Table_", "Sign_",
                                                      "Counter_Sign", "Plinth_", "TagPost_", "TagFoot_", "Column_"))
print("HEARTH grounded violations:", bad)
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
L.snapshot(sc, os.path.join(OUT, "interior_preview.png"), (0.0, 1.6, 3.6), (0.0, 1.5, -12.0), lens=16, res=(960, 640))
L.export_glb(os.path.join(OUT, "interior.colsrc.glb"), merged + cols.items)
L.write_json(os.path.join(OUT, "interior.layout.json"), {
    "version": 1, "key": KEY, "name": NAME, "spawn": [0.0, 1.6, 3.7],
    "exit": {"position": [0.0, 4.75], "radius": 1.4},
    "bounds": {"minX": X0, "maxX": X1, "minZ": Z0, "maxZ": Z1},
    "departments": dept_info, "displays": displays,
    "counter": [counter_x, 1.15, round(counter_z - 0.8, 3)],
    "clerk": {"position": [counter_x, 0.0, round(counter_z + 0.8, 3)], "yaw": round(math.pi, 4)},
})
tris = sum(len(p.vertices) - 2 for o in merged if o.type == "MESH" for p in o.data.polygons)
print("hearth interior:", len(objs), "objects ->", len(merged), "nodes,", tris, "tris,", len(cols.items), "collision boxes,", len(displays), "displays")

# ---------------------------------------------------------------- shell
W, HB = X1 - X0, 5.5
hd = 4.5
INTERIOR_BACK_OUTER_Z = Z0 - 0.2
WINDOWS = ((-13.0, -3.0), (3.0, 13.0))
WIN_Y = (0.9, 3.4)
sc2 = L.new_build_scene("STORE_" + KEY + "_exterior")
coll2 = bpy.data.collections.new("Exterior")
sc2.collection.children.link(coll2)
E = {
    "found": L.make_mat("EX_Foundation", "#8d8f94", 0.9, "noise", 0.03),
    "brick": L.make_mat("EX_HearthBrick", "#9c5a44", 0.95, "tiles", 0.06, accent="#c9b7a4"),
    "timber": L.make_mat("EX_HearthTimber", "#b8884f", 0.7, "planks", 0.05, accent="#96693a"),
    "steel": L.make_mat("EX_HearthSteel", "#2f3338", 0.55, "noise", 0.03),
    "sign": L.make_mat("EX_HearthSign", "#fff7ea", 0.4, "noise", 0.0, emit="#fff1d6", emit_strength=1.2),
    "roof": L.make_mat("EX_RoofGravel", "#6f7076", 0.95, "noise", 0.05),
    "glass": L.make_mat("EX_Glass", "#9fd6ea", 0.1, "noise", 0.02, alpha=0.45),
    "frame": L.make_mat("EX_FrameDark", "#2a2e35", 0.4, "noise", 0.02),
    "metal": L.make_mat("EX_Metal", "#9aa0a8", 0.5, "noise", 0.03),
    "leaf": L.make_mat("EX_Leaf", "#4f9d54", 0.9, "noise", 0.06),
}
xo = []
cols_e = L.Collisions(coll2)
shell, interior_offset, zb = L.walk_in_shell(coll2, cols_e, W, hd, HB - 0.5, E["brick"], E["glass"],
                                             [(a, b, *WIN_Y) for a, b in WINDOWS], [], [], interior_back=INTERIOR_BACK_OUTER_Z)
xo += shell
DN = hd - zb
zc = (hd + zb) / 2
xo.append(L.box(coll2, "EX_Plinth", 0, zc, 0.0, W + 0.3, DN + 0.3, 0.19, E["found"], bevel=0.02, tile=2.0))
xo.append(L.box(coll2, "EX_Band", 0, zc, HB - 0.5, W, DN, 0.5, E["steel"], tile=1.5))
xo.append(L.box(coll2, "EX_Roof", 0, zc, HB, W + 0.4, DN + 0.4, 0.25, E["roof"], tile=3.0))
for s in range(4):
    xo.append(L.box(coll2, f"EX_Shed{s}", 0, zc + DN / 2 - (s + 0.5) * DN / 4, HB + 0.25, W - 1.0, DN / 4 - 0.4, 0.9, E["glass"]))
xo.append(L.box(coll2, "EX_Fascia", 0, hd + 0.04, 3.6, W, 0.08, 1.3, E["timber"]))
xo.append(L.text_mesh(coll2, "EX_SignText", "HEARTH & HOLLOW", 0.0, hd + 0.1, 3.95, 0.7, 0.06, E["sign"]))
for i, (x0, x1) in enumerate(WINDOWS):
    cx = (x0 + x1) / 2
    xo.append(L.box(coll2, f"EX_WindowTop{i}", cx, hd + 0.06, WIN_Y[1] + 0.02, x1 - x0 + 0.2, 0.08, 0.12, E["frame"]))
    xo.append(L.box(coll2, f"EX_WindowSill{i}", cx, hd + 0.06, WIN_Y[0] - 0.06, x1 - x0 + 0.2, 0.12, 0.12, E["frame"]))
    for k in range(1, 3):
        xo.append(L.box(coll2, f"EX_Mullion{i}_{k}", x0 + k * (x1 - x0) / 3, hd + 0.05, WIN_Y[0], 0.06, 0.08, WIN_Y[1] - WIN_Y[0], E["frame"]))
    xo.append(L.box(coll2, f"EX_Planter{i}", cx, hd + 0.5, 0.0, 2.4, 0.6, 0.5, E["steel"], bevel=0.02))
    xo.append(L.box(coll2, f"EX_PlanterLeaf{i}", cx, hd + 0.5, 0.5, 2.2, 0.45, 0.3, E["leaf"], bevel=0.08))
    cols_e.add(f"Planter{i}", cx, hd + 0.5, 0.0, 2.4, 0.6, 0.6)
xo.append(L.hinged_door(coll2, [
    (0, 0.0, 1.18, 0.06, 2.18, E["glass"], 0.0),
    (0, 0.0, 1.18, 0.08, 0.1, E["frame"], 0.0),
    (0, 2.08, 1.18, 0.08, 0.1, E["frame"], 0.0),
    (0.45, 0.95, 0.05, 0.14, 0.05, E["metal"], 0.0),
], -0.59, hd - 0.1, 0.2))
xo.append(L.box(coll2, "EX_DoorFrame", 0, hd + 0.04, 2.4, 1.44, 0.1, 0.12, E["steel"]))
bad = L.check_grounded(xo, allow=("EX_Shell", "EX_Band", "EX_Roof", "EX_Shed", "EX_Sign", "EX_Fascia", "Door", "EX_Door", "EX_Window", "EX_Mullion", "EX_PlanterLeaf"))
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
print("hearth exterior:", len(xo), "objects,", etris, "tris, interiorOffset", interior_offset, "depth", round(DN, 3))
