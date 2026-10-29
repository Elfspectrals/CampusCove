import importlib
import math
import os
import random
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
BODY_SCALE = 0.936
BODY_LIFT = 0.009
RAIL_Y = 1.95
TAG_Y = 0.72
SHELF_Y = 1.05
TABLE_Y = 0.9
HEAD_Y = 1.55

DEPARTMENTS = {
    "hair": "HAIR",
    "head_accessory": "HEADSETS",
    "top": "TOPS",
    "bottom": "PANTS",
    "shoes": "SHOES",
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
    [("hair", "curly"), ("top", "hoodie"), ("bottom", "jeans"), ("shoes", "sneakers")],
    [("head_accessory", "cat_ear"), ("top", "tank"), ("bottom", "skirt"), ("shoes", "boots")],
    [("hair", "ponytail"), ("top", "varsity"), ("bottom", "joggers"), ("shoes", "high_tops")],
    [("head_accessory", "gamer"), ("top", "tee"), ("bottom", "cargo"), ("shoes", "runners")],
]


def root_y_for_top(top_in_body, world_top):
    return round(world_top - top_in_body * BODY_SCALE - BODY_LIFT, 3)


sc = L.new_build_scene("STORE_" + KEY + "_interior")
coll = bpy.data.collections.new("Interior")
sc.collection.children.link(coll)
cols = L.Collisions(coll)
M = L.std_mats(wall="#fbfaf7", floor=("#d9b98f", "planks", "#c7a57a"))
M["shelf"] = L.make_mat("IN_ThreadsShelf", "#f6f4ef", 0.5, "noise", 0.01)
M["wood"] = L.make_mat("IN_ThreadsWood", "#d8b282", 0.6, "planks", 0.03, accent="#c49c6c")
M["rail"] = L.make_mat("IN_ThreadsRail", "#b9bec6", 0.3, "noise", 0.02)
M["red"] = L.make_mat("IN_ThreadsRed", "#d8322b", 0.6, "noise", 0.01)
M["redglow"] = L.make_mat("IN_ThreadsRedGlow", "#ff3b30", 0.4, "noise", 0.0, emit="#ff3b30", emit_strength=1.0)
M["sign"] = L.make_mat("IN_ThreadsSignGlow", "#ffffff", 0.4, "noise", 0.0, emit="#ffffff", emit_strength=1.0)
M["lightbox"] = L.make_mat("IN_ThreadsLightbox", "#fdfcf8", 0.4, "noise", 0.0, emit="#fffaf0", emit_strength=0.8)
M["form"] = L.make_mat("IN_ThreadsForm", "#f2efe9", 0.4, "noise", 0.01)
M["platform"] = L.make_mat("IN_ThreadsPlatform", "#fbfaf7", 0.45, "noise", 0.01)
STACK_COLORS = ("#e9e4da", "#f0b8a8", "#d8322b", "#2b3a67", "#4d6fa3", "#e7c98f", "#2f6f63", "#8a7ab8", "#c9d86b", "#5a5f68", "#f4b3c8", "#f2f0ea")
STACK = [L.make_mat(f"IN_ThreadsStack{i}", c, 0.9, "stripes", 0.03, accent=c) for i, c in enumerate(STACK_COLORS)]
rng = random.Random(11)

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


def stacks(name, cx, cz, w, d, y0, row, along_x):
    n = max(1, int(w / 0.42))
    for i in range(n):
        h = 0.16 + 0.05 * rng.randint(0, 3)
        off = -w / 2 + (i + 0.5) * w / n
        gx, gz = (cx + off, cz) if along_x else (cx, cz + off)
        add(L.box(coll, f"{name}_{i}", gx, gz, y0, 0.36 if along_x else d, d if along_x else 0.36, h, STACK[(i // 2 + row * 3) % len(STACK)]))


def shelving_wall(name, cx, cz, length, along_x, levels=6):
    depth = 0.42
    px, pz = (cx, cz + depth / 2) if along_x else (cx + depth / 2, cz)
    sx, sz = (length, depth) if along_x else (depth, length)
    bx, bz = (cx, cz + 0.02) if along_x else (cx + 0.02, cz)
    add(L.box(coll, f"{name}_Back", bx, bz, 0.0, length if along_x else 0.04, 0.04 if along_x else length, 2.7, M["shelf"]))
    for lv in range(levels):
        y = 0.12 + lv * 0.44
        add(L.box(coll, f"{name}_Board{lv}", px, pz, y, sx, sz, 0.03, M["shelf"]))
        stacks(f"{name}_Stack{lv}", px, pz, length - 0.1, depth - 0.08, y + 0.03, lv, along_x)
    posts = int(length / 1.2)
    for k in range(posts + 1):
        o_ = -length / 2 + k * length / posts
        add(L.box(coll, f"{name}_Post{k}", px + (o_ if along_x else 0), pz + (0 if along_x else o_), 0.0, 0.04 if along_x else depth, depth if along_x else 0.04, 2.7, M["shelf"]))
    cols.add(name, px, pz, 0.0, sx, sz, 2.7)


rect("House_Floor_Threads", X0 - 0.2, Z0 - 0.2, X1 + 0.2, Z1 + 0.2, -0.1, 0.1, M["floor"], tile=3.0)
rect("Ceiling", X0 - 0.2, Z0 - 0.2, X1 + 0.2, Z1 + 0.3, H, 0.15, M["ceil"], tile=3.0)
win = (0.9, 3.4)
objs += L.wall(coll, "Walls_Front", "x", Z1 + 0.1, 0.2, X0 - 0.2, X1 + 0.2, H, M["wall"],
               openings=[(-13.0, -3.0, *win), (-0.6, 0.6, 0.0, 2.2), (3.0, 13.0, *win)], cols=cols, glass=M["glass"], col_tag="Wall_Front")
objs += L.wall(coll, "Walls_Back", "x", Z0 - 0.1, 0.2, X0 - 0.2, X1 + 0.2, H, M["wall"], cols=cols, col_tag="Wall_Back")
objs += L.wall(coll, "Walls_W", "z", X0 - 0.1, 0.2, Z0, Z1 + 0.2, H, M["wall"], cols=cols, col_tag="Wall_W")
objs += L.wall(coll, "Walls_E", "z", X1 + 0.1, 0.2, Z0, Z1 + 0.2, H, M["wall"], cols=cols, col_tag="Wall_E")
add(L.box(coll, "Door_Entrance", 0, 5.1, 0.01, 1.18, 0.06, 2.18, M["glass"], bevel=0.02))
add(L.box(coll, "Door_Entrance_Frame", 0, 5.06, 2.2, 1.4, 0.1, 0.12, M["red"]))
add(L.box(coll, "Entry_Doormat", 0, 4.4, 0.0, 2.0, 1.0, 0.012, M["mat"]))
add(L.box(coll, "Sky_Front", 0, 16, -3.0, 60, 0.05, 14.0, M["sky"]))

displays = []
dept_info = []


def tag_at(gx, gz, yaw, y=TAG_Y):
    return {"position": [round(gx, 3), y, round(gz, 3)], "yaw": round(yaw, 4)}


def wall_sign(slot, gx, gz, yaw, along_x):
    add(L.box(coll, f"Sign_{slot}_Board", gx, gz, 3.25, 2.6 if along_x else 0.06, 0.06 if along_x else 2.6, 0.6, M["red"]))
    fx, fz = math.sin(yaw), math.cos(yaw)
    text(f"Sign_{slot}_Text", DEPARTMENTS[slot], gx + fx * 0.04, gz + fz * 0.04, 3.4, 0.36, M["sign"], yaw)
    dept_info.append({"id": slot, "label": DEPARTMENTS[slot], "sign": [round(gx, 3), 3.55, round(gz, 3)]})


def hanging_rail(slot, x_start, z_wall):
    keys = ITEMS[slot]
    z = z_wall + 0.42
    x_end = x_start + 1.25 * (len(keys) - 1)
    for sx_ in (x_start - 0.75, x_end + 0.75):
        add(L.box(coll, f"Rail_{slot}_Bracket{int(sx_ * 10)}", sx_, z_wall + 0.25, RAIL_Y + 0.02, 0.04, 0.5, 0.04, M["rail"]))
    add(L.box(coll, f"Rail_{slot}_Bar", (x_start + x_end) / 2, z, RAIL_Y, x_end - x_start + 1.6, 0.03, 0.03, M["rail"]))
    add(L.box(coll, f"Rail_{slot}_Light", (x_start + x_end) / 2, z_wall + 0.03, 0.0, x_end - x_start + 1.8, 0.05, 2.7, M["lightbox"]))
    wall_sign(slot, (x_start + x_end) / 2, z_wall + 0.06, 0.0, True)
    for i, key in enumerate(keys):
        gx = x_start + i * 1.25
        add(L.box(coll, f"Hanger_{slot}_{key}", gx, z, RAIL_Y - 0.06, 0.03, 0.03, 0.09, M["rail"]))
        top = PIECE_TOP[slot]
        y = root_y_for_top(top, RAIL_Y - 0.08)
        displays.append({
            "slot": slot, "key": key, "department": slot,
            "position": [round(gx, 3), y, round(z, 3)], "yaw": 0.0,
            "center": [round(gx, 3), round(RAIL_Y - 0.45, 3), round(z, 3)],
            "tag": tag_at(gx, z_wall + 0.1, 0.0),
        })
    cols.add(f"Rail_{slot}", (x_start + x_end) / 2, z_wall + 0.45, 0.0, x_end - x_start + 1.8, 0.9, 2.2)


def shoe_wall(x_wall, z_start):
    keys = ITEMS["shoes"]
    x = x_wall + 0.25
    z_end = z_start + 1.25 * (len(keys) - 1)
    zc = (z_start + z_end) / 2
    length = z_end - z_start + 1.4
    for lv, y in enumerate((0.35, SHELF_Y - 0.03, 1.75)):
        add(L.box(coll, f"ShoeShelf_{lv}", x, zc, y, 0.5, length, 0.03, M["wood"]))
    for k, zz in enumerate((zc - length / 2, zc + length / 2)):
        add(L.box(coll, f"ShoeShelf_Side{k}", x, zz, 0.0, 0.5, 0.04, 2.2, M["wood"]))
    add(L.box(coll, "ShoeShelf_Back", x_wall + 0.03, zc, 0.0, 0.05, length, 2.2, M["lightbox"]))
    wall_sign("shoes", x_wall + 0.06, zc, math.pi / 2, False)
    for i, key in enumerate(keys):
        gz = z_start + i * 1.25
        displays.append({
            "slot": "shoes", "key": key, "department": "shoes",
            "position": [round(x, 3), round(SHELF_Y - BODY_LIFT, 3), round(gz, 3)], "yaw": round(math.pi / 2, 4),
            "center": [round(x, 3), round(SHELF_Y + 0.12, 3), round(gz, 3)],
            "tag": tag_at(x_wall + 0.1, gz, math.pi / 2),
        })
    cols.add("ShoeShelf", x, zc, 0.0, 0.55, length, 2.2)


def head_table(slot, x_wall, z_start):
    keys = ITEMS[slot]
    x = x_wall - 0.55
    z_end = z_start + 1.2 * (len(keys) - 1)
    zc = (z_start + z_end) / 2
    length = z_end - z_start + 1.2
    add(L.box(coll, f"HeadTable_{slot}_Top", x, zc, TABLE_Y - 0.04, 0.8, length, 0.04, M["wood"]))
    add(L.box(coll, f"HeadTable_{slot}_Body", x, zc, 0.0, 0.7, length - 0.1, TABLE_Y - 0.04, M["shelf"]))
    wall_sign(slot, x_wall - 0.06, zc, -math.pi / 2, False)
    for i, key in enumerate(keys):
        gz = z_start + i * 1.2
        add(L.cyl(coll, f"HeadForm_{slot}_{key}_Neck", x, gz, TABLE_Y, 0.045, HEAD_Y - TABLE_Y - 0.08, M["form"], seg=10))
        add(L.box(coll, f"HeadForm_{slot}_{key}_Base", x, gz, TABLE_Y, 0.2, 0.2, 0.03, M["form"], bevel=0.01))
        head = add(L.box(coll, f"HeadForm_{slot}_{key}_Head", x, gz, HEAD_Y - 0.1, 0.16, 0.18, 0.21, M["form"], bevel=0.07))
        displays.append({
            "slot": slot, "key": key, "department": slot,
            "position": [round(x, 3), round(HEAD_Y - 1.745 * BODY_SCALE - BODY_LIFT, 3), round(gz, 3)], "yaw": round(-math.pi / 2, 4),
            "center": [round(x, 3), HEAD_Y, round(gz, 3)],
            "tag": tag_at(x - 0.42, gz, -math.pi / 2, y=0.62),
        })
    cols.add(f"HeadTable_{slot}", x, zc, 0.0, 0.8, length, 1.7)


hanging_rail("top", -10.0, Z0)
hanging_rail("bottom", 5.0, Z0)
shoe_wall(X0, -15.0)
head_table("hair", X1, -16.0)
head_table("head_accessory", X1, -8.0)

shelving_wall("FoldWall_Back", 0.0, Z0, 3.2, True)
add(L.box(coll, "FoldWall_Back_Banner", 0.0, Z0 + 0.08, 3.0, 3.6, 0.05, 0.8, M["red"]))
text("FoldWall_Back_BannerText", NAME.upper(), 0.0, Z0 + 0.12, 3.2, 0.42, M["sign"], 0.0)
shelving_wall("FoldWall_W", X0, -4.0, 5.0, False)
add(L.box(coll, "FoldWall_W_Promo", X0 + 0.06, -4.0, 2.9, 0.06, 3.0, 0.9, M["red"]))
text("FoldWall_W_PromoText", "NEW SEASON", X0 + 0.11, -4.0, 3.15, 0.38, M["sign"], math.pi / 2)

for tier, (r, y0, h) in enumerate(((1.7, 0.0, 0.5), (1.2, 0.5, 0.35), (0.7, 0.85, 0.3))):
    add(L.cyl(coll, f"RoundTable_Tier{tier}", 0.0, -9.0, y0, r, h, M["shelf"] if tier != 1 else M["wood"], seg=28))
    ring_r = r - 0.2
    count = int(2 * math.pi * ring_r / 0.45)
    for k in range(count):
        a = 2 * math.pi * k / count
        add(L.box(coll, f"RoundTable_Stack{tier}_{k}", ring_r * math.cos(a), -9.0 + ring_r * math.sin(a), y0 + h, 0.34, 0.3, 0.12 + 0.04 * (k % 3), STACK[(k + tier * 4) % len(STACK)], rot=-a))
cols.add("RoundTable", 0.0, -9.0, 0.0, 3.4, 3.4, 1.3)

for i, gx in enumerate((-5.0, 5.0)):
    add(L.box(coll, f"Cube_{i}_Body", gx, -14.0, 0.0, 1.4, 1.4, 1.0, M["lightbox"], bevel=0.02))
    add(L.box(coll, f"Cube_{i}_Top", gx, -14.0, 1.0, 1.5, 1.5, 0.04, M["shelf"]))
    for k in range(4):
        add(L.box(coll, f"Cube_{i}_Stack{k}", gx - 0.45 + k * 0.3, -14.0, 1.04, 0.26, 0.34, 0.14 + 0.05 * (k % 2), STACK[(k + 2 + i * 5) % len(STACK)]))
    cols.add(f"Cube_{i}", gx, -14.0, 0.0, 1.5, 1.5, 1.1)

MIRROR = {"position": [round(X0 + 0.09, 3), 1.27, -7.9], "yaw": round(math.pi / 2, 4), "size": [1.3, 2.1]}
add(L.box(coll, "Mirror_Frame", X0 + 0.04, -7.9, 0.12, 0.06, 1.5, 2.3, M["wood"], bevel=0.02))
add(L.box(coll, "Mirror_Base", X0 + 0.15, -7.9, 0.0, 0.25, 1.6, 0.12, M["wood"]))

PLAT = (-8.0, 0.0)
add(L.cyl(coll, "Mannequin_Platform", PLAT[0], PLAT[1], 0.0, 2.4, 0.14, M["platform"], seg=32))
cols.add("Mannequin_Platform", PLAT[0], PLAT[1], 0.0, 4.4, 2.6, 1.9)
outfits = []
for i, pieces in enumerate(OUTFITS):
    a = math.radians(-40 + i * 26.7)
    gx, gz = PLAT[0] + 1.6 * math.sin(a), PLAT[1] - 0.4 + 0.5 * math.cos(a)
    outfits.append({
        "pieces": [{"slot": s, "key": k} for s, k in pieces],
        "position": [round(gx, 3), 0.14, round(gz, 3)], "yaw": round(math.radians(10 - i * 7), 4),
        "center": [round(gx, 3), 1.1, round(gz, 3)],
        "tag": tag_at(gx, gz + 0.75, 0.0, y=0.4),
    })
    add(L.cyl(coll, f"Mannequin_TagPost{i}", gx, gz + 0.75, 0.14, 0.02, 0.18, M["rail"], seg=6))

counter_x, counter_z = 8.5, 0.5
add(L.furn(coll, "Counter", counter_x, counter_z, 0.0, [
    (0, 0, 0.0, 4.0, 1.0, 1.0, M["shelf"], 0.02),
    (0, 0, 1.0, 4.2, 1.1, 0.06, M["wood"], 0.01),
    (0, -0.52, 0.2, 4.0, 0.04, 0.6, M["red"]),
    (-1.2, -0.1, 1.06, 0.45, 0.35, 0.3, M["black"], 0.01),
    (0.8, 0.0, 1.06, 0.7, 0.5, 0.12, STACK[4], 0.01),
]))
cols.add("Counter", counter_x, counter_z, 0.0, 4.2, 1.1, 1.1)
add(L.box(coll, "Counter_SignBoard", counter_x, counter_z - 0.3, 2.6, 2.6, 0.08, 0.7, M["red"]))
text("Counter_SignText", "PAY HERE", counter_x, counter_z - 0.24, 2.75, 0.4, M["sign"], 0.0)
# the clerk is a modular character spawned by the front (useClothingStore), standing behind the till
CLERK = {"position": [round(counter_x - 1.2, 3), 0.0, round(counter_z - 1.05, 3)], "yaw": 0.0}
for gx in (-13.8, 13.8):
    add(L.plant(coll, M, f"Plant_{int(gx)}", gx, 4.2))
    cols.add(f"Plant_{int(gx)}", gx, 4.2, 0.0, 0.5, 0.5, 1.3)

add(L.cyl(coll, "Ceiling_Cove", 0.0, -9.0, H - 0.35, 3.2, 0.2, M["ceil"], seg=32))
add(L.cyl(coll, "Light_Cove", 0.0, -9.0, H - 0.4, 2.8, 0.05, M["lamp"], seg=32))
li = 0
for gx in (-10.0, -5.0, 5.0, 10.0):
    for gz in (-17.0, -12.0, -6.0, -1.0, 3.0):
        add(L.cyl(coll, f"Light_{li:02d}", gx, gz, H - 0.06, 0.35, 0.05, M["lamp"], seg=12))
        li += 1

bad = L.check_grounded(objs, allow=L.ALLOW_INTERIOR + ("Ceiling", "Sign_", "Counter_Sign", "Rail_", "Hanger_", "ShoeShelf_", "HeadTable_", "HeadForm_",
                                                      "FoldWall_", "RoundTable_", "Cube_", "Mannequin_TagPost", "Mirror_Frame"))
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
    "version": 2, "key": KEY, "name": NAME, "spawn": [0.0, 1.6, 3.7],
    "exit": {"position": [0.0, 4.75], "radius": 1.4},
    "bounds": {"minX": X0, "maxX": X1, "minZ": Z0, "maxZ": Z1},
    "counter": [counter_x, 1.15, counter_z + 1.2], "clerk": CLERK,
    "departments": dept_info, "displays": displays, "outfits": outfits, "mirror": MIRROR,
})
tris = sum(len(p.vertices) - 2 for o in merged if o.type == "MESH" for p in o.data.polygons)
print("threads interior:", len(objs), "objects ->", len(merged), "nodes,", tris, "tris,", len(cols.items), "collision boxes,", len(displays), "displays,", len(outfits), "outfits")
