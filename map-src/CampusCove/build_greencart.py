"""GreenCart: the supermarket of the Cove Parkview Mall (docs/MALL.md). Layout contract of Cove Home (departments +
displays with a price tag), read by useFurnitureStore with items/food/<key>/model.glb: the six Campus Cafe foods are on
sale, every other shelf slot is listed in `slots[]` (code null) for later products.

A real supermarket plan: entrance east with carts and promo bins, produce then bakery near the entrance, dairy and fresh
food at the back, a perimeter loop, six double-sided gondolas in a grid, promo end caps, five checkouts by the exit.
Outputs: out/store/greencart/{interior.glb, interior.colsrc.glb, interior.layout.json, exterior.glb, exterior.colsrc.glb,
exterior.layout.json, preview.png}. Then build_house_lightmaps.py -- store greencart, npm run assets:optimize -- store.
"""
import importlib
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

KEY = "greencart"
NAME = "GreenCart"
OUT = os.path.join(L.OUT_ROOT, "store", KEY)
H = 5.0
X0, X1, Z0, Z1 = -20.0, 20.0, -31.0, 5.0
SHELF_YS = (0.35, 0.85, 1.35, 1.85)
rng = random.Random(41)

FOODS = {
    "coffee": ("food_coffee", "Latte", "Hot latte to go, a little speed boost.", [0.1, 0.16, 0.1]),
    "orange_juice": ("food_orange_juice", "Orange Juice", "Fresh orange juice, two portions.", [0.08, 0.22, 0.08]),
    "water_bottle": ("food_water_bottle", "Water Bottle", "Still water, four sips.", [0.08, 0.24, 0.08]),
    "croissant": ("food_croissant", "Croissant", "Butter croissant, baked this morning.", [0.16, 0.08, 0.1]),
    "sandwich": ("food_sandwich", "Club Sandwich", "Club sandwich, four bites.", [0.16, 0.12, 0.16]),
    "cookie": ("food_cookie", "Cookie", "Chocolate chip cookie.", [0.1, 0.03, 0.1]),
}
DEPARTMENTS = {
    "produce": ("FRUITS & VEGETABLES", "#3c9a3c"),
    "bakery": ("BAKERY", "#d8a860"),
    "fresh": ("FISH & MEAT", "#3f7f8c"),
    "dairy": ("DAIRY & FRESH", "#8fb7d9"),
    "frozen": ("FROZEN", "#5ac8e8"),
    "breakfast": ("BREAKFAST", "#f0b429"),
    "drinks": ("DRINKS", "#2b7bbf"),
    "snacks": ("SNACKS", "#e54b4b"),
    "pasta": ("PASTA & RICE", "#c47c4c"),
    "household": ("HOUSEHOLD", "#a985e0"),
    "checkout": ("CHECKOUT", "#3c9a3c"),
}
GONDOLAS = ["breakfast", "drinks", "snacks", "pasta", "household", "frozen"]
DISPLAY_SLOTS = {"breakfast": [(-1, 2, -17.0)], "drinks": [(1, 1, -16.0), (1, 1, -18.0)]}

sc = L.new_build_scene("STORE_" + KEY + "_interior")
coll = bpy.data.collections.new("Interior")
sc.collection.children.link(coll)
cols = L.Collisions(coll)
M = L.std_mats(wall="#f3f3ef", floor=("#d6d4ce", "tiles", "#c5c3bd"))
M["green"] = L.make_mat("IN_CartGreen", "#3c9a3c", 0.6, "noise", 0.02)
M["lime"] = L.make_mat("IN_CartLime", "#9ad24a", 0.6, "noise", 0.02)
M["yellow"] = L.make_mat("IN_CartPromo", "#f7c21b", 0.5, "noise", 0.0, emit="#f7c21b", emit_strength=0.5)
M["red"] = L.make_mat("IN_CartRed", "#d9473a", 0.6, "noise", 0.02)
M["white"] = L.make_mat("IN_CartWhite", "#fbfbf8", 0.5, "noise", 0.01)
M["shelf"] = L.make_mat("IN_CartShelf", "#e4e6e8", 0.5, "noise", 0.02)
M["loop"] = L.make_mat("IN_CartLoop", "#c9d8c2", 0.7, "tiles", 0.02, accent="#b8c7b1")
M["crate"] = L.make_mat("IN_CartCrate", "#4f8a3c", 0.8, "planks", 0.04, accent="#3f6f30")
M["conveyor"] = L.make_mat("IN_Conveyor", "#2a2d33", 0.6, "stripes", 0.02, accent="#1c1e22")
M["fridge"] = L.make_mat("IN_CartFridge", "#e9f4fb", 0.2, "noise", 0.01, emit="#dff1ff", emit_strength=0.7)
M["ice"] = L.make_mat("IN_CartIce", "#dff3fb", 0.3, "noise", 0.03)
M["bread"] = L.make_mat("IN_CartBread", "#d2a15a", 0.9, "noise", 0.05)
M["sign"] = L.make_mat("IN_CartSign", "#ffffff", 0.4, "noise", 0.0, emit="#ffffff", emit_strength=1.0)
M["cart"] = L.make_mat("IN_CartMetal", "#b9bec6", 0.35, "noise", 0.03)
M["beam"] = L.make_mat("IN_CartBeam", "#9aa0a8", 0.6, "noise", 0.02)
PRODUCT_COLORS = ("#e0533d", "#f6d04d", "#3f7f8c", "#2f6f63", "#1f5fae", "#f2a65a", "#a985e0", "#f7f4ec", "#c8102e", "#79b765", "#5a3fb5", "#f4b3c8")
PRODUCTS = [L.make_mat(f"IN_CartProduct{i}", c, 0.6, "noise", 0.03) for i, c in enumerate(PRODUCT_COLORS)]
FRUITS = {"orange": L.make_mat("IN_CartOrange", "#f28c28", 0.7, "noise", 0.04), "apple": L.make_mat("IN_CartApple", "#d9473a", 0.5, "noise", 0.04),
          "lettuce": L.make_mat("IN_CartLettuce", "#79b765", 0.9, "noise", 0.06), "lemon": L.make_mat("IN_CartLemon", "#f6d04d", 0.6, "noise", 0.04),
          "melon": L.make_mat("IN_CartMelon", "#a9c99a", 0.8, "noise", 0.05), "aubergine": L.make_mat("IN_CartAubergine", "#5a2a6b", 0.5, "noise", 0.04)}
DM = {dep: L.make_mat(f"IN_CartDept_{dep}", c, 0.8, "noise", 0.02) for dep, (_, c) in DEPARTMENTS.items()}

objs = []
displays = []
slots = []
dept_info = []


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


def hanging_sign(dep, gx, gz, yaw, width=3.0, y=3.6):
    label, _ = DEPARTMENTS[dep]
    fx, fz = math.sin(yaw), math.cos(yaw)
    add(L.box(coll, f"Sign_{dep}_Board", gx, gz, y, width, 0.08, 0.6, DM[dep], rot=yaw))
    for o_ in (-width / 2 + 0.3, width / 2 - 0.3):
        add(L.cyl(coll, f"Sign_{dep}_Wire{int(o_ * 10)}", gx + o_ * math.cos(yaw), gz - o_ * math.sin(yaw), y + 0.6, 0.01, H - y - 0.6, M["cart"], seg=4))
    text(f"Sign_{dep}_Text", label, gx + fx * 0.06, gz + fz * 0.06, y + 0.14, 0.3, M["sign"], yaw)
    text(f"Sign_{dep}_TextBack", label, gx - fx * 0.06, gz - fz * 0.06, y + 0.14, 0.3, M["sign"], yaw + math.pi)
    dept_info.append({"id": dep, "label": label, "color": DEPARTMENTS[dep][1], "sign": [round(gx, 3), y + 0.3, round(gz, 3)]})


def food_display(key, dep, gx, gy, gz, yaw, tag_x, tag_z, tag_y=1.32, stack=(1, 1)):
    """One food on sale; `stack` = (columns, rows) of copies the front lines up on the spot, so a 10 cm cookie
    reads as a filled shelf facing instead of a lone crumb."""
    code, name, blurb, size = FOODS[key]
    add(L.cyl(coll, f"TagPost_{key}", tag_x, tag_z, 0.0, 0.02, tag_y - 0.25, M["cart"], seg=6))
    displays.append({"key": key, "code": code, "department": dep, "description": blurb,
                     "position": [round(gx, 3), round(gy, 3), round(gz, 3)], "yaw": round(yaw, 4), "size": size, "stack": list(stack),
                     "tag": {"position": [round(tag_x, 3), tag_y, round(tag_z, 3)], "yaw": round(yaw, 4)}})


def products(name, cx, cz, length, depth, y, along_x, seed_row, free=()):
    """A shelf face of packed goods: one coloured block per 0.8 m, heights vary so it reads as boxes and cans.
    `free` = coordinates along the shelf left empty for a real product on display."""
    n = max(1, int(length / 0.8))
    for i in range(n):
        off = -length / 2 + (i + 0.5) * length / n
        gx, gz = (cx + off, cz) if along_x else (cx, cz + off)
        if any(abs((gx if along_x else gz) - f) < 0.6 for f in free):
            continue
        m = PRODUCTS[(i + seed_row * 5) % len(PRODUCTS)]
        w = length / n - 0.08
        add(L.box(coll, f"{name}_{i}", gx, gz, y, w if along_x else depth - 0.1, depth - 0.1 if along_x else w, 0.26 + 0.07 * ((i + seed_row) % 3), m))


def gondola(dep, gx, z0, z1, index):
    """Double-sided shelving along z: back panel, 4 shelf levels each side, a promo end cap at the entrance end."""
    length = z1 - z0
    zc = (z0 + z1) / 2
    add(L.box(coll, f"Gondola_{dep}_Back", gx, zc, 0.0, 0.08, length, 2.2, M["shelf"]))
    add(L.box(coll, f"Gondola_{dep}_Base", gx, zc, 0.0, 1.0, length, 0.12, M["shelf"]))
    for side in (-1, 1):
        fx = gx + side * 0.5
        for lv, y in enumerate(SHELF_YS):
            add(L.box(coll, f"Gondola_{dep}_Shelf{side + 1}_{lv}", gx + side * 0.27, zc, y, 0.46, length, 0.03, M["shelf"]))
            n = max(1, int((length - 0.2) / 2.2))
            for i in range(n):
                sz = z0 + 0.1 + (i + 0.5) * (length - 0.2) / n
                slots.append({"aisle": dep, "shelf": lv, "position": [round(gx + side * 0.3, 3), round(y + 0.03, 3), round(sz, 3)],
                              "yaw": round(math.pi / 2 if side > 0 else -math.pi / 2, 4), "code": None})
            products(f"Gondola_{dep}_Prod{side + 1}_{lv}", gx + side * 0.3, zc, length - 0.2, 0.4, y + 0.03, False, lv + index * 2,
                     free=[z for s_, lv_, z in DISPLAY_SLOTS.get(dep, ()) if s_ == side and lv_ == lv])
    # category flags on top
    add(L.box(coll, f"Gondola_{dep}_Flag", gx, zc, 2.2, 0.06, 1.6, 0.5, DM[dep]))
    text(f"Gondola_{dep}_FlagText", DEPARTMENTS[dep][0], gx + 0.04, zc, 2.32, 0.22, M["sign"], math.pi / 2)
    text(f"Gondola_{dep}_FlagTextB", DEPARTMENTS[dep][0], gx - 0.04, zc, 2.32, 0.22, M["sign"], -math.pi / 2)
    # end cap (promo) at the front end, with a yellow sign
    add(L.box(coll, f"Gondola_{dep}_Cap", gx, z1 + 0.5, 0.0, 1.0, 1.0, 1.4, M["shelf"]))
    for lv, y in enumerate((0.5, 1.0)):
        add(L.box(coll, f"Gondola_{dep}_CapShelf{lv}", gx, z1 + 0.5, y, 0.96, 0.96, 0.03, M["shelf"]))
        products(f"Gondola_{dep}_CapProd{lv}", gx, z1 + 0.55, 0.9, 0.9, y + 0.03, True, lv + 7 + index)
    add(L.box(coll, f"Gondola_{dep}_CapSign", gx, z1 + 1.02, 1.4, 0.9, 0.05, 0.4, M["yellow"]))
    text(f"Gondola_{dep}_CapText", "PROMO", gx, z1 + 1.05, 1.48, 0.22, M["red"], 0.0)
    cols.add(f"Gondola_{dep}", gx, (z0 + z1 + 1.0) / 2, 0.0, 1.1, length + 1.0, 2.2)


def wall_fridge(name, gx0, gz0, gx1, gz1, along_x):
    cx, cz = (gx0 + gx1) / 2, (gz0 + gz1) / 2
    sx, sz = abs(gx1 - gx0), abs(gz1 - gz0)
    add(L.box(coll, f"{name}_Body", cx, cz, 0.0, sx, sz, 2.2, M["white"]))
    glass_off = (0, -sz / 2 - 0.02) if along_x else (sx / 2 + 0.02, 0)
    if along_x:
        add(L.box(coll, f"{name}_Glass", cx, gz0 - 0.02, 0.3, sx - 0.2, 0.04, 1.7, M["fridge"]))
        for lv, y in enumerate((0.45, 0.95, 1.45)):
            products(f"{name}_Prod{lv}", cx, gz0 - 0.1, sx - 0.3, 0.3, y, True, lv + 3)
    else:
        add(L.box(coll, f"{name}_Glass", gx1 + 0.02, cz, 0.3, 0.04, sz - 0.2, 1.7, M["fridge"]))
        for lv, y in enumerate((0.45, 0.95, 1.45)):
            products(f"{name}_Prod{lv}", gx1 - 0.1, cz, sz - 0.3, 0.3, y, False, lv + 5)
    add(L.box(coll, f"{name}_Top", cx, cz, 2.2, sx + 0.1, sz + 0.1, 0.25, M["lime"]))
    cols.add(name, cx, cz, 0.0, sx + 0.3, sz + 0.3, 2.4)


def produce_table(name, gx, gz, fruit):
    add(L.box(coll, f"{name}_Body", gx, gz, 0.0, 1.8, 1.2, 0.7, M["crate"]))
    add(L.box(coll, f"{name}_Rim", gx, gz, 0.7, 1.9, 1.3, 0.1, M["crate"]))
    for i in range(12):
        ox, oz = -0.7 + (i % 4) * 0.46, -0.35 + (i // 4) * 0.35
        add(L.cyl(coll, f"{name}_Fruit{i}", gx + ox, gz + oz, 0.8, 0.14, 0.2, FRUITS[fruit], seg=8))
    cols.add(name, gx, gz, 0.0, 1.9, 1.3, 0.9)


def checkout(i, gx, gz):
    add(L.furn(coll, f"Checkout_{i}", gx, gz, 0.0, [
        (0, 0, 0.0, 1.0, 3.4, 0.9, M["white"], 0.02),
        (0, 0, 0.9, 0.7, 3.0, 0.05, M["conveyor"]),
        (0, 1.4, 0.95, 0.5, 0.35, 0.3, M["cart"], 0.01),
        (0, 1.5, 1.3, 0.04, 0.04, 1.2, M["cart"]),
        (0, -1.5, 0.0, 0.3, 0.3, 1.0, M["green"], 0.01),
    ]))
    add(L.box(coll, f"Checkout_{i}_Light", gx, gz + 1.5, 2.5, 0.5, 0.5, 0.3, M["yellow"], bevel=0.05))
    text(f"Checkout_{i}_Num", str(i + 1), gx, gz + 1.5, 2.8, 0.3, M["green"], 0.0)
    cols.add(f"Checkout_{i}", gx, gz, 0.0, 1.0, 3.4, 1.0)


def cart(name, gx, gz, yaw):
    add(L.furn(coll, name, gx, gz, yaw, [
        (0, 0, 0.55, 0.6, 0.95, 0.45, M["cart"], 0.02),
        (0, 0.5, 0.95, 0.6, 0.05, 0.15, M["red"], 0.01),
        (-0.25, -0.4, 0.0, 0.05, 0.05, 0.55, M["cart"]), (0.25, -0.4, 0.0, 0.05, 0.05, 0.55, M["cart"]),
        (-0.25, 0.4, 0.0, 0.05, 0.05, 0.55, M["cart"]), (0.25, 0.4, 0.0, 0.05, 0.05, 0.55, M["cart"]),
    ]))


# ---------------------------------------------------------------- shell
rect("House_Floor_GreenCart", X0 - 0.2, Z0 - 0.2, X1 + 0.2, Z1 + 0.2, -0.1, 0.1, M["floor"], tile=3.0)
rect("Ceiling", X0 - 0.2, Z0 - 0.2, X1 + 0.2, Z1 + 0.3, H, 0.15, M["ceil"], tile=3.0)
win = (0.9, 3.4)
objs += L.wall(coll, "Walls_Front", "x", Z1 + 0.1, 0.2, X0 - 0.2, X1 + 0.2, H, M["wall"],
               openings=[(-18.0, -3.0, *win), (-0.6, 0.6, 0.0, 2.2), (3.0, 18.0, *win)], cols=cols, glass=M["glass"], col_tag="Wall_Front")
objs += L.wall(coll, "Walls_Back", "x", Z0 - 0.1, 0.2, X0 - 0.2, X1 + 0.2, H, M["wall"], cols=cols, col_tag="Wall_Back")
objs += L.wall(coll, "Walls_W", "z", X0 - 0.1, 0.2, Z0, Z1 + 0.2, H, M["wall"], cols=cols, col_tag="Wall_W")
objs += L.wall(coll, "Walls_E", "z", X1 + 0.1, 0.2, Z0, Z1 + 0.2, H, M["wall"], cols=cols, col_tag="Wall_E")
add(L.box(coll, "Door_Entrance", 0, 5.1, 0.01, 1.18, 0.06, 2.18, M["glass"], bevel=0.02))
add(L.box(coll, "Door_Entrance_Frame", 0, 5.06, 2.2, 1.4, 0.1, 0.12, M["green"]))
add(L.box(coll, "Entry_Doormat", 0, 4.4, 0.0, 2.0, 1.0, 0.012, M["mat"]))
add(L.box(coll, "Sky_Front", 0, 16, -3.0, 70, 0.05, 14.0, M["sky"]))
for nm, a, b2, axis, fixed in [("N", X0, X1, "x", Z0 + 0.03), ("W", Z0, Z1, "z", X0 + 0.03), ("E", Z0, Z1, "z", X1 - 0.03)]:
    if axis == "x":
        add(L.box(coll, f"Wall_Band{nm}", (a + b2) / 2, fixed, 2.6, b2 - a, 0.04, 0.5, M["green"]))
    else:
        add(L.box(coll, f"Wall_Band{nm}", fixed, (a + b2) / 2, 2.6, 0.04, b2 - a, 0.5, M["green"]))
# perimeter loop floor (the racetrack) and the exposed beams + light rows
rect("Loop_W", X0, Z0, X0 + 3.0, Z1 - 5.0, 0.0, 0.008, M["loop"])
rect("Loop_N", X0, Z0, X1, Z0 + 3.5, 0.0, 0.008, M["loop"])
rect("Loop_E", X1 - 3.0, Z0, X1, Z1, 0.0, 0.008, M["loop"])
rect("Loop_S", X0 + 3.0, -1.0, X1 - 3.0, 0.0, 0.0, 0.008, M["loop"])
for i, gz in enumerate(range(-28, 5, 6)):
    add(L.box(coll, f"Beam_{i}", 0.0, gz, H - 0.5, X1 - X0 + 0.2, 0.25, 0.5, M["beam"]))
li = 0
for gx in (-15.0, -5.0, 5.0, 15.0):
    for gz in range(-28, 5, 5):
        add(L.box(coll, f"Light_{li:02d}", gx, gz + 0.5, H - 0.07, 3.0, 0.45, 0.07, M["lamp"]))
        li += 1
text("Brand_Text", "GREENCART", 0.0, Z1 - 0.6, 3.7, 0.7, M["green"], math.pi)
text("Brand_Tag", "fresh every day", 0.0, Z1 - 0.6, 3.35, 0.28, M["lime"], math.pi)

# ---------------------------------------------------------------- entrance: carts, promo bins, flowers
for i in range(5):
    cart(f"Cart_{i}", 5.0 + i * 0.7, 3.2, math.pi / 2)
cols.add("Carts", 6.4, 3.2, 0.0, 4.2, 1.0, 1.1)
add(L.box(coll, "Cart_Rail", 6.4, 2.6, 0.0, 4.4, 0.05, 1.0, M["cart"]))
for i, gx in enumerate((-3.5, -5.5)):
    add(L.box(coll, f"PromoBin_{i}", gx, 1.5, 0.0, 1.2, 1.2, 0.9, M["yellow"], bevel=0.03))
    products(f"PromoBin_{i}_Prod", gx, 1.5, 1.0, 1.0, 0.9, True, i + 9)
    cols.add(f"PromoBin_{i}", gx, 1.5, 0.0, 1.2, 1.2, 1.1)
add(L.box(coll, "Flowers_Stand", 15.0, 3.0, 0.0, 2.4, 1.0, 0.8, M["crate"]))
for i in range(6):
    add(L.cyl(coll, f"Flowers_{i}", 14.1 + i * 0.36, 3.0, 0.8, 0.12, 0.5, list(FRUITS.values())[i], seg=6))
cols.add("Flowers_Stand", 15.0, 3.0, 0.0, 2.4, 1.0, 1.3)

# ---------------------------------------------------------------- produce (east, by the entrance)
hanging_sign("produce", 14.0, -3.0, math.pi / 2, width=4.0)
for i, (gx, gz, fruit) in enumerate(((12.0, -1.0, "orange"), (16.0, -1.0, "apple"), (12.0, -4.0, "lettuce"), (16.0, -4.0, "lemon"), (12.0, -7.0, "melon"), (16.0, -7.0, "aubergine"))):
    produce_table(f"Produce_{i}", gx, gz, fruit)
wall_fridge("Fridge_Produce", X1 - 0.9, -12.0, X1 - 0.1, -4.0, False)

# ---------------------------------------------------------------- bakery (back east)
hanging_sign("bakery", 14.0, -22.0, math.pi / 2, width=3.0)
add(L.box(coll, "Bakery_Counter", 13.5, -23.0, 0.0, 1.0, 7.0, 1.0, M["crate"]))
add(L.box(coll, "Bakery_CounterTop", 13.5, -23.0, 1.0, 1.1, 7.2, 0.05, M["white"]))
add(L.box(coll, "Bakery_CounterGlass", 13.0, -23.0, 1.05, 0.04, 7.0, 0.6, M["glass"]))
cols.add("Bakery_Counter", 13.5, -23.0, 0.0, 1.1, 7.2, 1.6)
for lv, y in enumerate((0.6, 1.2, 1.8)):
    add(L.box(coll, f"Bakery_Shelf{lv}", X1 - 0.4, -23.0, y, 0.6, 7.0, 0.04, M["crate"]))
    for i in range(10):
        add(L.cyl(coll, f"Bakery_Bread{lv}_{i}", X1 - 0.4, -26.2 + i * 0.7, y + 0.04, 0.12, 0.28, M["bread"], seg=7))
cols.add("Bakery_Shelves", X1 - 0.4, -23.0, 0.0, 0.7, 7.2, 2.2)
for i, gx in enumerate((10.0, 12.0)):
    add(L.box(coll, f"Bakery_Oven{i}", gx, Z0 + 0.6, 0.0, 1.6, 1.0, 2.0, M["cart"], bevel=0.02))
    add(L.box(coll, f"Bakery_OvenDoor{i}", gx, Z0 + 0.08, 0.7, 1.2, 0.04, 0.8, M["fridge"]))
cols.add("Bakery_Ovens", 11.0, Z0 + 0.6, 0.0, 3.8, 1.0, 2.0)
food_display("croissant", "bakery", 13.4, 1.05, -21.0, -math.pi / 2, 12.7, -21.0, tag_y=1.3, stack=(3, 2))
food_display("cookie", "bakery", 13.4, 1.05, -25.0, -math.pi / 2, 12.7, -25.0, tag_y=1.3, stack=(4, 3))

# ---------------------------------------------------------------- fish & meat (back centre), dairy (back west + west wall)
hanging_sign("fresh", 0.0, -27.0, 0.0, width=3.0)
add(L.box(coll, "Fresh_Counter", 0.0, -28.5, 0.0, 10.0, 1.2, 0.95, M["white"]))
add(L.box(coll, "Fresh_Ice", 0.0, -28.5, 0.95, 9.6, 1.0, 0.15, M["ice"]))
add(L.box(coll, "Fresh_Glass", 0.0, -27.85, 1.0, 10.0, 0.04, 0.7, M["glass"]))
for i in range(8):
    add(L.box(coll, f"Fresh_Fish{i}", -4.0 + i * 1.1, -28.5, 1.1, 0.5, 0.22, 0.1, FRUITS["aubergine" if i % 2 else "lettuce"], bevel=0.03))
cols.add("Fresh_Counter", 0.0, -28.5, 0.0, 10.0, 1.2, 1.7)
hanging_sign("dairy", -13.0, -27.0, 0.0, width=3.4)
wall_fridge("Fridge_Dairy", -19.0, Z0 + 0.1, -8.0, Z0 + 0.9, True)
wall_fridge("Fridge_West", X0 + 0.1, -26.0, X0 + 0.9, -14.0, False)
food_display("sandwich", "dairy", X0 + 0.75, 0.98, -20.0, math.pi / 2, X0 + 1.4, -20.0, tag_y=1.3, stack=(3, 2))
hanging_sign("frozen", -17.0, -8.0, math.pi / 2, width=3.0)
for i in range(4):
    add(L.box(coll, f"Freezer_{i}", X0 + 1.1, -10.5 + i * 2.0, 0.0, 1.8, 1.7, 0.9, M["white"], bevel=0.02))
    add(L.box(coll, f"Freezer_{i}_Lid", X0 + 1.1, -10.5 + i * 2.0, 0.9, 1.7, 1.6, 0.04, M["fridge"]))
cols.add("Freezers", X0 + 1.1, -7.5, 0.0, 1.9, 8.0, 1.1)

# ---------------------------------------------------------------- the grid of gondolas
GZ0, GZ1 = -24.5, -11.0
for i, dep in enumerate(GONDOLAS):
    gondola(dep, -15.0 + i * 4.0, GZ0, GZ1, i)
for i, dep in enumerate(GONDOLAS):
    gx = -15.0 + i * 4.0
    add(L.box(coll, f"AisleSign_{dep}", gx, GZ1 + 2.4, 3.5, 2.4, 0.06, 0.5, DM[dep]))
    text(f"AisleSign_{dep}_Text", DEPARTMENTS[dep][0], gx, GZ1 + 2.36, 3.62, 0.24, M["sign"], 0.0)
    dept_info.append({"id": dep, "label": DEPARTMENTS[dep][0], "color": DEPARTMENTS[dep][1], "sign": [round(gx, 3), 3.75, round(GZ1 + 2.4, 3)]})
# the sold foods on their shelves (the matching slot is marked taken)
food_display("coffee", "breakfast", -15.3, SHELF_YS[2] + 0.03, -17.0, -math.pi / 2, -15.9, -17.0, tag_y=1.0, stack=(4, 2))
food_display("water_bottle", "drinks", -10.7, SHELF_YS[1] + 0.03, -16.0, math.pi / 2, -10.1, -16.0, tag_y=1.0, stack=(5, 2))
food_display("orange_juice", "drinks", -10.7, SHELF_YS[1] + 0.03, -18.0, math.pi / 2, -10.1, -18.0, tag_y=1.0, stack=(5, 2))
for d in displays:
    if d["department"] not in GONDOLAS:
        continue
    nearest = min(slots, key=lambda s: (s["aisle"] != d["department"], sum(abs(a - b) for a, b in zip(s["position"], d["position"]))))
    nearest["code"] = d["code"]

# ---------------------------------------------------------------- checkouts (front west) and the exit lane
hanging_sign("checkout", -10.0, 1.0, 0.0, width=3.0)
for i in range(5):
    checkout(i, -17.0 + i * 3.0, 1.8)
add(L.box(coll, "Basket_Stack", -3.0, 4.2, 0.0, 0.5, 0.5, 1.1, M["green"]))
cols.add("Basket_Stack", -3.0, 4.2, 0.0, 0.6, 0.6, 1.2)
for gx in (-18.8, 18.8):
    add(L.plant(coll, M, f"Plant_{int(gx)}", gx, 4.3))
    cols.add(f"Plant_{int(gx)}", gx, 4.3, 0.0, 0.5, 0.5, 1.3)

bad = L.check_grounded(objs, allow=L.ALLOW_INTERIOR + ("Ceiling", "Beam_", "Sign_", "Brand_", "Gondola_", "Fridge_", "Freezer_", "Produce_", "Bakery_",
                                                      "Fresh_", "Checkout_", "PromoBin_", "Flowers_", "Cart_", "Loop_", "AisleSign_", "TagPost_", "Wall_Band"))
print("GREENCART grounded violations:", bad)
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
L.snapshot(sc, os.path.join(OUT, "interior_preview.png"), (0.0, 1.6, 3.6), (-2.0, 1.3, -14.0), lens=16, res=(960, 640))
L.export_glb(os.path.join(OUT, "interior.colsrc.glb"), merged + cols.items)
L.write_json(os.path.join(OUT, "interior.layout.json"), {
    "version": 1, "key": KEY, "name": NAME, "spawn": [0.0, 1.6, 3.7],
    "exit": {"position": [0.0, 4.75], "radius": 1.4},
    "bounds": {"minX": X0, "maxX": X1, "minZ": Z0, "maxZ": Z1},
    "departments": dept_info, "displays": displays, "slots": slots,
    "counter": [-12.0, 1.0, 2.6],
    "clerk": {"position": [-10.0, 0.0, 2.6], "yaw": round(-math.pi / 2, 4)},
})
tris = sum(len(p.vertices) - 2 for o in merged if o.type == "MESH" for p in o.data.polygons)
print("greencart interior:", len(objs), "objects ->", len(merged), "nodes,", tris, "tris,", len(cols.items), "collision boxes,", len(displays), "displays,", len(slots), "slots")

# ---------------------------------------------------------------- shell
W, HB = X1 - X0, 6.0
hd = 4.5
INTERIOR_BACK_OUTER_Z = Z0 - 0.2
WINDOWS = ((-18.0, -3.0), (3.0, 18.0))
WIN_Y = (0.9, 3.4)
sc2 = L.new_build_scene("STORE_" + KEY + "_exterior")
coll2 = bpy.data.collections.new("Exterior")
sc2.collection.children.link(coll2)
E = {
    "found": L.make_mat("EX_Foundation", "#8d8f94", 0.9, "noise", 0.03),
    "wall": L.make_mat("EX_CartWhite", "#f1f1ec", 0.85, "noise", 0.02),
    "green": L.make_mat("EX_CartGreen", "#3c9a3c", 0.6, "noise", 0.02),
    "lime": L.make_mat("EX_CartLime", "#9ad24a", 0.6, "noise", 0.02),
    "sign": L.make_mat("EX_CartSign", "#ffffff", 0.4, "noise", 0.0, emit="#ffffff", emit_strength=1.4),
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
xo.append(L.box(coll2, "EX_Band", 0, zc, HB - 0.5, W, DN, 0.5, E["green"], tile=1.5))
xo.append(L.box(coll2, "EX_Roof", 0, zc, HB, W + 0.4, DN + 0.4, 0.25, E["roof"], tile=3.0))
xo.append(L.box(coll2, "EX_RoofUnit", -8.0, zc - 6.0, HB + 0.25, 3.0, 2.0, 1.2, E["metal"], bevel=0.03))
xo.append(L.box(coll2, "EX_Fascia", 0, hd + 0.04, 3.6, W, 0.08, 1.4, E["green"]))
xo.append(L.text_mesh(coll2, "EX_SignText", "GREENCART", 0.0, hd + 0.1, 3.9, 0.9, 0.06, E["sign"]))
xo.append(L.box(coll2, "EX_SignCart", 8.2, hd + 0.1, 4.0, 0.9, 0.06, 0.6, E["lime"], bevel=0.05))
for i, (x0, x1) in enumerate(WINDOWS):
    cx = (x0 + x1) / 2
    xo.append(L.box(coll2, f"EX_WindowTop{i}", cx, hd + 0.06, WIN_Y[1] + 0.02, x1 - x0 + 0.2, 0.08, 0.12, E["frame"]))
    xo.append(L.box(coll2, f"EX_WindowSill{i}", cx, hd + 0.06, WIN_Y[0] - 0.06, x1 - x0 + 0.2, 0.12, 0.12, E["frame"]))
    for k in range(1, 5):
        xo.append(L.box(coll2, f"EX_Mullion{i}_{k}", x0 + k * (x1 - x0) / 5, hd + 0.05, WIN_Y[0], 0.06, 0.08, WIN_Y[1] - WIN_Y[0], E["frame"]))
for i, gx in enumerate((-5.5, 5.5)):
    xo.append(L.furn(coll2, f"EX_CartBay{i}", gx, hd + 1.2, 0.0, [
        (0, 0, 0.0, 3.0, 1.6, 0.05, E["metal"]), (-1.45, 0, 0.0, 0.08, 1.6, 1.1, E["metal"]), (1.45, 0, 0.0, 0.08, 1.6, 1.1, E["metal"]),
        (0, 0, 2.2, 3.2, 1.8, 0.1, E["lime"], 0.02), (-1.45, -0.7, 0.0, 0.08, 0.08, 2.2, E["metal"]), (1.45, -0.7, 0.0, 0.08, 0.08, 2.2, E["metal"])]))
    cols_e.add(f"CartBay{i}", gx, hd + 1.2, 0.0, 3.2, 1.8, 1.2)
xo.append(L.hinged_door(coll2, [
    (0, 0.0, 1.18, 0.06, 2.18, E["glass"], 0.0),
    (0, 0.0, 1.18, 0.08, 0.1, E["frame"], 0.0),
    (0, 2.08, 1.18, 0.08, 0.1, E["frame"], 0.0),
    (0.45, 0.95, 0.05, 0.14, 0.05, E["metal"], 0.0),
], -0.59, hd - 0.1, 0.2))
xo.append(L.box(coll2, "EX_DoorFrame", 0, hd + 0.04, 2.4, 1.44, 0.1, 0.12, E["green"]))
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
L.snapshot(sc2, os.path.join(OUT, "preview.png"), (-22, 7, hd + 26), (0, 3.0, -6), lens=28, res=(768, 512))
etris = sum(len(p.vertices) - 2 for o in xo for p in o.data.polygons)
print("greencart exterior:", len(xo), "objects,", etris, "tris, interiorOffset", interior_offset, "depth", round(DN, 3))
