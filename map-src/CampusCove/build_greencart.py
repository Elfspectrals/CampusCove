"""GreenCart: the supermarket of the Cove Parkview Mall (docs/MALL.md). Layout contract of Cove Home (departments +
displays with a price tag), read by useFurnitureStore with items/<group>/<key>/model.glb: the six Campus Cafe foods and
the twelve grocery items are on sale, every other gondola slot is listed in `slots[]` (code null) for later products.

A real supermarket plan: entrance east with a cart pen and promo bins, produce then bakery near the entrance, dairy and
fresh food at the back, a perimeter loop, six double-sided gondolas in a grid with promo pyramids on the end caps, five
checkouts by the exit. Every axis-aligned box is registered in a lib_kit.Kit so the interior is checked for coplanar
overlaps and contained boxes before export.
Outputs: out/store/greencart/{interior.glb, interior.colsrc.glb, interior.layout.json, exterior.glb, exterior.colsrc.glb,
exterior.layout.json, preview.png}. Then build_house_lightmaps.py -- store greencart, npm run assets:optimize -- store.
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
import lib_kit as K
importlib.reload(K)
import bpy

KEY = "greencart"
NAME = "GreenCart"
OUT = os.path.join(L.OUT_ROOT, "store", KEY)
H = 5.0
X0, X1, Z0, Z1 = -20.0, 20.0, -31.0, 5.0
SHELF_YS = (0.35, 0.85, 1.35, 1.85)
FRIDGE_YS = (0.45, 0.95, 1.45)
LOOP_Y = 0.008
STACK_GAP = 0.02

FOODS = {
    "coffee": ("food_coffee", "Latte", "Hot latte to go, a little speed boost.", [0.1, 0.16, 0.1]),
    "orange_juice": ("food_orange_juice", "Orange Juice", "Fresh orange juice, two portions.", [0.08, 0.22, 0.08]),
    "water_bottle": ("food_water_bottle", "Water Bottle", "Still water, four sips.", [0.08, 0.24, 0.08]),
    "croissant": ("food_croissant", "Croissant", "Butter croissant, baked this morning.", [0.16, 0.08, 0.1]),
    "sandwich": ("food_sandwich", "Club Sandwich", "Club sandwich, four bites.", [0.16, 0.12, 0.16]),
    "cookie": ("food_cookie", "Cookie", "Chocolate chip cookie.", [0.1, 0.03, 0.1]),
    "apple": ("grocery_apple", "Apple", "Crisp red apple, two bites.", [0.08, 0.095, 0.08]),
    "banana": ("grocery_banana", "Banana", "Ripe banana, two portions.", [0.19, 0.085, 0.045]),
    "bread": ("grocery_bread", "Sliced Bread", "Sliced loaf in its bag, four slices.", [0.27, 0.12, 0.125]),
    "milk": ("grocery_milk", "Milk", "Carton of fresh milk, three glasses.", [0.07, 0.2, 0.075]),
    "cheese": ("grocery_cheese", "Cheese Wedge", "Wedge of cheese, three portions.", [0.12, 0.06, 0.09]),
    "eggs": ("grocery_eggs", "Half-Dozen Eggs", "Half a dozen eggs, three portions.", [0.15, 0.13, 0.15]),
    "cereal": ("grocery_cereal", "Cereal", "Box of cereal, four bowls.", [0.19, 0.28, 0.11]),
    "pasta": ("grocery_pasta", "Pasta", "Box of pasta, four plates.", [0.16, 0.24, 0.04]),
    "soda": ("grocery_soda", "Soda Can", "Fizzy soda, two sips.", [0.067, 0.122, 0.067]),
    "chips": ("grocery_chips", "Chips", "Bag of crisps, three handfuls.", [0.2, 0.28, 0.08]),
    "chocolate": ("grocery_chocolate", "Chocolate Bar", "Chocolate bar, four squares.", [0.16, 0.012, 0.08]),
    "yogurt": ("grocery_yogurt", "Yogurt", "Fruit yogurt cup, two spoons.", [0.074, 0.1, 0.074]),
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
DISPLAY_SLOTS = {
    "breakfast": [("coffee", -1, 2, -17.0, (4, 2)), ("cereal", 1, 2, -18.858, (4, 2))],
    "drinks": [("water_bottle", 1, 1, -16.0, (5, 2)), ("orange_juice", 1, 1, -18.0, (5, 2)), ("soda", -1, 1, -16.642, (6, 3))],
    "snacks": [("chips", -1, 2, -16.642, (4, 2)), ("chocolate", 1, 1, -18.858, (3, 3))],
    "pasta": [("pasta", -1, 1, -18.858, (5, 3))],
}
FRIDGE_WEST_DISPLAYS = [("milk", 0, -17.0, (5, 2), -17.35), ("yogurt", 1, -17.0, (5, 3), -16.65), ("sandwich", 1, -20.0, (3, 2), -20.35),
                        ("cheese", 1, -23.0, (3, 2), -23.0), ("eggs", 2, -20.0, (3, 2), -19.65)]
BAKERY_DISPLAYS = [("croissant", -21.0, (3, 2)), ("bread", -23.0, (3, 2)), ("cookie", -25.0, (4, 3))]
PRODUCE_DISPLAYS = [("banana", 12.0, (5, 3)), ("apple", 16.0, (6, 4))]

sc = L.new_build_scene("STORE_" + KEY + "_interior")
coll = bpy.data.collections.new("Interior")
sc.collection.children.link(coll)
cols = L.Collisions(coll)
kit = K.Kit()
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
M["fridge"] = L.make_mat("IN_CartFridge", "#dff1ff", 0.15, "noise", 0.01, alpha=0.2, emit="#dff1ff", emit_strength=0.12)
M["panel"] = L.make_mat("IN_CartPanel", "#e9f4fb", 0.2, "noise", 0.01, emit="#dff1ff", emit_strength=0.7)
M["ice"] = L.make_mat("IN_CartIce", "#dff3fb", 0.3, "noise", 0.03)
M["bread"] = L.make_mat("IN_CartBread", "#d2a15a", 0.9, "noise", 0.05)
M["sign"] = L.make_mat("IN_CartSign", "#ffffff", 0.4, "noise", 0.0, emit="#ffffff", emit_strength=1.0)
M["cart"] = L.make_mat("IN_CartMetal", "#b9bec6", 0.35, "noise", 0.03)
M["beam"] = L.make_mat("IN_CartBeam", "#9aa0a8", 0.6, "noise", 0.02)
M["dark"] = L.make_mat("IN_CartDark", "#2a2e35", 0.6, "noise", 0.02)
M["rail"] = L.make_mat("IN_CartTagRail", "#f7f4ec", 0.5, "stripes", 0.01, accent="#f6d04d")
M["banner"] = L.make_mat("IN_CartPromoBanner", "#f6d04d", 0.6, "stripes", 0.02, accent="#d9473a")
M["mark"] = L.make_mat("IN_CartFloorMark", "#f1d34a", 0.8, "noise", 0.02)
ZM = {dep: L.make_mat(f"IN_CartZone_{dep}", c, 0.8, "noise", 0.02) for dep, c in (("produce", "#cfe5c6"), ("bakery", "#f0dcb9"), ("fresh", "#d7e3ec"))}
FRUITS = {"orange": L.make_mat("IN_CartOrange", "#f28c28", 0.7, "noise", 0.04), "apple": L.make_mat("IN_CartApple", "#d9473a", 0.5, "noise", 0.04),
          "lettuce": L.make_mat("IN_CartLettuce", "#79b765", 0.9, "noise", 0.06), "lemon": L.make_mat("IN_CartLemon", "#f6d04d", 0.6, "noise", 0.04),
          "melon": L.make_mat("IN_CartMelon", "#a9c99a", 0.8, "noise", 0.05), "aubergine": L.make_mat("IN_CartAubergine", "#5a2a6b", 0.5, "noise", 0.04),
          "tomato": L.make_mat("IN_CartTomato", "#e24b4a", 0.5, "noise", 0.04)}
DM = {dep: L.make_mat(f"IN_CartDept_{dep}", c, 0.8, "noise", 0.02) for dep, (_, c) in DEPARTMENTS.items()}

WHITE, KRAFT, ORANGE, YELLOW, BLUE, RED, GREEN, DEEPRED, SKY = "#f7f4ec", "#c9a36a", "#f28c28", "#f6d04d", "#1f5fae", "#d9473a", "#79b765", "#c8102e", "#9fd8f2"
TEAL, DARK, PURPLE, SILVER, VIOLET, COCOA, APRICOT, BISCUIT, CORAL = "#2fa17a", "#2a2e35", "#a985e0", "#c9ccd2", "#6a3aa8", "#4a2a17", "#f2a65a", "#d99a55", "#e0533d"
SAND, GOLD, CYAN, PINK, LIME, CHEESE, RIND, AMBER, ROSE = "#e8d7b4", "#d4af37", "#5ac8e8", "#f4b3c8", "#9ad24a", "#f2c93c", "#e07a1f", "#f0b429", "#f27aa6"
PM = {}


def pmat(c):
    return PM.setdefault(c, L.make_mat(f"IN_CartP_{c[1:]}", c, 0.6, "noise", 0.03))


def block(h, pal):
    return {"kind": "block", "h": h, "pal": pal}


def bevel(h, pal):
    return {"kind": "bevel", "h": h, "pal": pal}


def band(h, pal, bh, by, cols=None):
    return {"kind": "band", "h": h, "pal": pal, "bh": bh, "by": by, "cols": cols}


def cap(h, pal, ch, cols=None, inset=(0.02, 0.02)):
    return {"kind": "cap", "h": h, "pal": pal, "ch": ch, "cols": cols, "inset": inset}


def wrap(h, pal, bh, by, cols):
    return {"kind": "wrap", "h": h, "pal": pal, "bh": bh, "by": by, "cols": cols}


def pile(h, pal):
    return {"kind": "pile", "h": h, "pal": pal}


STYLES = {
    "breakfast": [block(0.36, [KRAFT, WHITE]), band(0.30, [ORANGE, YELLOW, BLUE, RED, GREEN], 0.06, 0.20, [WHITE]),
                  band(0.30, [YELLOW, BLUE, RED, GREEN, ORANGE], 0.06, 0.20, [WHITE]), block(0.18, [ORANGE, DEEPRED, YELLOW])],
    "drinks": [block(0.32, [SKY]), cap(0.28, [RED, YELLOW, TEAL, BLUE], 0.07, [DARK], (0.07, 0.08)),
               cap(0.22, [ORANGE, GREEN, PURPLE, YELLOW], 0.02, [WHITE], (0.01, 0.165)), block(0.13, [SILVER, RED, BLUE])],
    "snacks": [block(0.30, [YELLOW, RED, TEAL]), bevel(0.26, [YELLOW, RED, TEAL, BLUE, ORANGE]),
               band(0.16, [VIOLET, COCOA, DEEPRED, APRICOT], 0.04, 0.06, [WHITE]), block(0.22, [BISCUIT, WHITE, CORAL])],
    "pasta": [block(0.20, [WHITE, SAND]), band(0.26, [BLUE, YELLOW], 0.14, 0.06), cap(0.16, [DEEPRED, CORAL, TEAL], 0.02, [GOLD]),
              block(0.11, [GREEN, YELLOW, RED])],
    "household": [block(0.30, [BLUE, WHITE]), wrap(0.28, [WHITE], 0.10, 0.08, [TEAL, PURPLE, ORANGE, CYAN]),
                  cap(0.24, [WHITE], 0.06, [PURPLE]), block(0.14, [YELLOW, TEAL, CORAL])],
    "frozen": [block(0.22, [CYAN, WHITE, GREEN]), pile(0.06, [RED, YELLOW]), cap(0.14, [PINK, WHITE, VIOLET], 0.02, [SILVER]),
               block(0.20, [CYAN, YELLOW])],
}
FRIDGE_STYLES = {
    "Fridge_Produce": [bevel(0.14, [GREEN, LIME]), cap(0.24, [ORANGE, YELLOW, RED], 0.05, [DARK], (0.05, 0.10)), cap(0.08, [WHITE], 0.02, [ORANGE, RED, GREEN])],
    "Fridge_Dairy": [band(0.22, [WHITE], 0.05, 0.06, [BLUE, RED]), cap(0.10, [WHITE], 0.02, [ROSE, TEAL, CYAN]), block(0.08, [CHEESE, WHITE, RIND])],
    "Fridge_West": [cap(0.06, [PINK], 0.02, [WHITE], (0.0, 0.0)), block(0.05, [CORAL, APRICOT]), cap(0.08, [WHITE], 0.04, [TEAL, AMBER, CORAL], (0.0, 0.0))],
}

objs = []
displays = []
slots = []
dept_info = []


def add(o):
    objs.append(o)
    return o


def kbox(name, cx, cz, y0, sx, sz, h, mat, bevel=0.0, tile=1.0):
    """Axis-aligned box registered in the kit (centre-bottom at (cx, y0, cz)), then built with lib_common.box."""
    kit.add(name, cx - sx / 2, cz - sz / 2, cx + sx / 2, cz + sz / 2, y0, y0 + h, mat, bevel=bevel, tile=tile)
    return add(L.box(coll, name, cx, cz, y0, sx, sz, h, mat, bevel=bevel, tile=tile))


def kpart(name, gx, gz, yaw, lx, lz, y0, sx, sz, h, mat, bevel=0.0):
    """Box of a piece of furniture given in its local frame (lib_common.furn convention) and turned by `yaw`."""
    kit.part(name, gx, gz, yaw, lx, lz, y0, sx, sz, h, mat, bevel=bevel)
    c, s = math.cos(yaw), math.sin(yaw)
    return add(L.box(coll, name, gx + lx * c + lz * s, gz - (lx * s - lz * c), y0, sx, sz, h, mat, rot=yaw, bevel=bevel))


def rect(name, gx0, gz0, gx1, gz1, y0, h, mat, col=False, tile=2.0):
    cx, cz = (gx0 + gx1) / 2, (gz0 + gz1) / 2
    sx, sz = abs(gx1 - gx0), abs(gz1 - gz0)
    o = kbox(name, cx, cz, y0, sx, sz, h, mat, tile=tile)
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
    kpart(f"Sign_{dep}_Board", gx, gz, yaw, 0, 0, y, width, 0.08, 0.6, DM[dep])
    for o_ in (-width / 2 + 0.3, width / 2 - 0.3):
        add(L.cyl(coll, f"Sign_{dep}_Wire{int(o_ * 10)}", gx + o_ * math.cos(yaw), gz - o_ * math.sin(yaw), y + 0.6, 0.01, H - y - 0.6, M["cart"], seg=4))
    text(f"Sign_{dep}_Text", label, gx + fx * 0.06, gz + fz * 0.06, y + 0.14, 0.3, M["sign"], yaw)
    text(f"Sign_{dep}_TextBack", label, gx - fx * 0.06, gz - fz * 0.06, y + 0.14, 0.3, M["sign"], yaw + math.pi)
    dept_info.append({"id": dep, "label": label, "color": DEPARTMENTS[dep][1], "sign": [round(gx, 3), y + 0.3, round(gz, 3)]})


def stack_half(key, stack):
    return (stack[0] * FOODS[key][3][0] + (stack[0] - 1) * STACK_GAP) / 2


def food_display(key, dep, gx, gy, gz, yaw, tag_x, tag_z, tag_y=1.32, stack=(1, 1)):
    """One food on sale; `stack` = (columns, rows) of copies the front lines up on the spot, so a 10 cm cookie
    reads as a filled shelf facing instead of a lone crumb."""
    code, name, blurb, size = FOODS[key]
    displays.append({"key": key, "code": code, "department": dep, "description": blurb,
                     "position": [round(gx, 3), round(gy, 3), round(gz, 3)], "yaw": round(yaw, 4), "size": size, "stack": list(stack),
                     "tag": {"position": [round(tag_x, 3), tag_y, round(tag_z, 3)], "yaw": round(yaw, 4)}})


def goods(name, cx, cz, y, along_x, along, deep, style, ci, hi, face):
    """One group of fake goods: a coloured body whose height varies with `hi`, plus the detail its `style` asks for
    (brand band on the aisle face, cap on top, bevelled bag, wrapped label, pile of flat boxes). `face` = unit vector
    towards the aisle."""
    pal = style["pal"]
    h = style["h"] * (1 + 0.15 * (hi % 3 - 1))
    body = pmat(pal[ci % len(pal)])
    cols_ = style.get("cols") or pal
    detail = pmat(cols_[(ci + (1 if style.get("cols") is None else 0)) % len(cols_)])
    fx, fz = face
    kind = style["kind"]

    def dims(a, d):
        return (a, d) if along_x else (d, a)

    if kind == "bevel":
        kbox(name, cx, cz, y, *dims(along - 0.04, deep - 0.02), h, body, bevel=0.04)
    elif kind == "wrap":
        kbox(name, cx, cz, y, *dims(along - 0.04, deep - 0.04), h, body)
        kbox(name + "d", cx, cz, y + style["by"], *dims(along, deep), style["bh"], detail)
    elif kind == "pile":
        kbox(name, cx, cz, y, *dims(along, deep), h, body)
        kbox(name + "d", cx + (0.03 if along_x else 0.0), cz + (0.0 if along_x else 0.03), y + h, *dims(along, deep), h, detail)
    else:
        kbox(name, cx, cz, y, *dims(along, deep), h, body)
        if kind == "band":
            kbox(name + "d", cx + fx * (deep / 2 + 0.01), cz + fz * (deep / 2 + 0.01), y + style["by"], *dims(along - 0.02, 0.02), style["bh"], detail)
        elif kind == "cap":
            ia, idp = style["inset"]
            kbox(name + "d", cx, cz, y + h, *dims(along - 2 * ia, deep - 2 * idp), style["ch"], detail)


def products(name, cx, cz, y, along_x, length, depth, style, seed, lv, face, free=(), pitch=0.8, gap=0.06):
    """Fill a shelf face with groups of fake goods, `pitch` m per group and `gap` between them. `free` = (coordinate
    along the shelf, half-length) windows kept empty for a real product on display; each stretch between windows is
    filled on its own so the shelf stays full right up to the display."""
    c = cx if along_x else cz
    lo, hi = c - length / 2, c + length / 2
    stretches, a = [], lo
    for f, hw in sorted(free):
        if f - hw - 0.04 > a:
            stretches.append((a, f - hw - 0.04))
        a = max(a, f + hw + 0.04)
    if hi > a:
        stretches.append((a, hi))
    k = 0
    for s0, s1 in stretches:
        n = int((s1 - s0 + gap) / pitch)
        for i in range(n):
            p = s0 + (i + 0.5) * (s1 - s0) / n
            goods(f"{name}_{k}", p if along_x else cx, cz if along_x else p, y, along_x, pitch - gap, depth, style, k + seed, k + lv, face)
            k += 1


def gondola(dep, gx, z0, z1, index):
    """Double-sided shelving along z: base, back panel between two end panels, 4 shelf levels each side with a price
    rail and a row of goods, a category flag on top; the FROZEN gondola gets glass doors on both faces."""
    length = z1 - z0
    zc = (z0 + z1) / 2
    kbox(f"Gondola_{dep}_Base", gx, zc, 0.0, 1.0, length, 0.12, M["shelf"])
    kbox(f"Gondola_{dep}_Back", gx, zc, 0.12, 0.08, length - 0.08, 2.08, M["shelf"])
    for e, ze in ((0, z0 + 0.02), (1, z1 - 0.02)):
        kbox(f"Gondola_{dep}_End{e}", gx, ze, 0.12, 1.0, 0.04, 2.08, M["shelf"])
    for side in (-1, 1):
        for lv, y in enumerate(SHELF_YS):
            kbox(f"Gondola_{dep}_Shelf{side + 1}_{lv}", gx + side * 0.27, zc, y, 0.46, length - 0.08, 0.03, M["shelf"])
            kbox(f"Gondola_{dep}_Rail{side + 1}_{lv}", gx + side * 0.51, zc, y - 0.01, 0.02, length - 0.08, 0.045, M["rail"], tile=3.2)
            n = max(1, int((length - 0.2) / 2.2))
            for i in range(n):
                sz = z0 + 0.1 + (i + 0.5) * (length - 0.2) / n
                slots.append({"aisle": dep, "shelf": lv, "position": [round(gx + side * 0.3, 3), round(y + 0.03, 3), round(sz, 3)],
                              "yaw": round(math.pi / 2 if side > 0 else -math.pi / 2, 4), "code": None})
            free = [(z, stack_half(key, stack)) for key, s_, lv_, z, stack in DISPLAY_SLOTS.get(dep, ()) if s_ == side and lv_ == lv]
            products(f"Gondola_{dep}_Prod{side + 1}_{lv}", gx + side * 0.3, zc, y + 0.03, False, length - 0.2, 0.36, STYLES[dep][lv],
                     2 * lv + 5 * index, lv, (side, 0), free=free)
    kbox(f"Gondola_{dep}_Flag", gx, zc, 2.2, 0.06, 1.6, 0.5, DM[dep])
    text(f"Gondola_{dep}_FlagText", DEPARTMENTS[dep][0], gx + 0.05, zc, 2.32, 0.22, M["sign"], math.pi / 2)
    text(f"Gondola_{dep}_FlagTextB", DEPARTMENTS[dep][0], gx - 0.05, zc, 2.32, 0.22, M["sign"], -math.pi / 2)
    if dep == "frozen":
        for side in (-1, 1):
            kbox(f"Gondola_{dep}_Glass{side + 1}", gx + side * 0.55, zc, 0.3, 0.04, length - 0.08, 1.9, M["fridge"])
            for j in range(17):
                pz = z0 + 0.04 + 0.03 + j * (length - 0.14) / 16
                kbox(f"Gondola_{dep}_Post{side + 1}_{j}", gx + side * 0.595, pz, 0.3, 0.05, 0.06, 1.9, M["cart"])
                kbox(f"Gondola_{dep}_Handle{side + 1}_{j}", gx + side * 0.635, pz, 1.0, 0.03, 0.03, 0.4, M["cart"])
    cols.add(f"Gondola_{dep}", gx, zc, 0.0, 1.4 if dep == "frozen" else 1.1, length, 2.2)


def promo_pyramid(name, gx, gz, depth, levels, colour, y0):
    """Pallet with a pyramid of promo goods, 1.2 m wide and `depth` deep."""
    kbox(f"{name}_Pallet", gx, gz, y0, 1.2, depth, 0.15, M["crate"])
    y = y0 + 0.15
    for i, (w, d, h) in enumerate(((1.1, depth - 0.1, 0.45), (0.8, depth * 0.65, 0.40), (0.5, depth * 0.4, 0.35))[:levels]):
        kbox(f"{name}_Tier{i}", gx, gz, y, w, d, h, pmat(colour))
        y += h


def end_cap(dep, gx):
    """Promo pyramid at the entrance end of a gondola, with the yellow PROMO sign on a mast."""
    gz = GZ1 + 0.5
    promo_pyramid(f"Cap_{dep}", gx, gz, 1.0, 3, STYLES[dep][1]["pal"][0], 0.0)
    kbox(f"Cap_{dep}_Mast", gx, gz + 0.47, 0.15, 0.04, 0.04, 1.85, M["cart"])
    kbox(f"Cap_{dep}_Sign", gx, gz + 0.515, 1.6, 0.9, 0.05, 0.4, M["yellow"])
    text(f"Cap_{dep}_SignText", "PROMO", gx, gz + 0.56, 1.68, 0.22, M["red"], 0.0)
    cols.add(f"Cap_{dep}", gx, gz + 0.05, 0.0, 1.2, 1.1, 1.5)


def wall_fridge(name, gx0, gz0, gx1, gz1, face, styles, free=(), glazed=True):
    """Hollow refrigerated wall unit opening towards `face` (unit vector from the wall into the store): back, sides and
    plinth, three 0.64 m shelves of goods on a plane 0.45 m from the wall, a glass front on its door rails with posts
    and handles every 0.9 m, a lit header under the lime top band. `free` = (coordinate, half-length, level) windows.
    `glazed=False` leaves the front open (a dairy chiller): the products on sale are seen and clicked directly."""
    fx, fz = face
    along_x = fx == 0
    length = (gx1 - gx0) if along_x else (gz1 - gz0)

    def world(u, v):
        if along_x:
            return gx0 + u, gz0 + v
        return (gx0 + v if fx > 0 else gx1 - v), gz0 + u

    def fb(part, u0, u1, v0, v1, y0, y1, mat, tile=1.0):
        xa, za = world(u0, v0)
        xb, zb = world(u1, v1)
        return kbox(f"{name}_{part}", (xa + xb) / 2, (za + zb) / 2, y0, abs(xb - xa), abs(zb - za), y1 - y0, mat, tile=tile)

    fb("Back", 0.06, length - 0.06, 0.0, 0.06, LOOP_Y, 2.2, M["white"])
    fb("Side0", 0.0, 0.06, 0.0, 0.8, LOOP_Y, 2.2, M["white"])
    fb("Side1", length - 0.06, length, 0.0, 0.8, LOOP_Y, 2.2, M["white"])
    fb("Plinth", 0.06, length - 0.06, 0.06, 0.86, LOOP_Y, 0.12, M["conveyor"])
    fb("DoorSill", 0.06, length - 0.06, 0.80, 0.86, 0.12, 0.30, M["cart"])
    if glazed:
        fb("Glass", 0.06, length - 0.06, 0.80, 0.84, 0.30, 2.00, M["fridge"])
    fb("DoorHead", 0.06, length - 0.06, 0.80, 0.86, 2.00, 2.10, M["cart"])
    fb("Header", 0.06, length - 0.06, 0.06, 0.80, 2.00, 2.20, M["white"])
    fb("Strip", 0.06, length - 0.06, 0.80, 0.83, 2.17, 2.20, M["panel"])
    fb("Top", -0.05, length + 0.05, -0.05, 0.85, 2.20, 2.45, M["lime"])
    doors = max(1, round((length - 0.12) / 0.9)) if glazed else 0
    for j in range(doors + 1 if glazed else 0):
        u = 0.09 + j * (length - 0.18) / doors
        fb(f"Post{j}", u - 0.03, u + 0.03, 0.84, 0.90, 0.30, 2.00, M["cart"])
        fb(f"Handle{j}", u - 0.015, u + 0.015, 0.90, 0.93, 1.00, 1.50, M["cart"])
    for lv, y in enumerate(FRIDGE_YS):
        fb(f"Shelf{lv}", 0.06, length - 0.06, 0.06, 0.70, y, y + 0.03, M["shelf"])
        fb(f"Rail{lv}", 0.06, length - 0.06, 0.70, 0.72, y - 0.01, y + 0.035, M["rail"], tile=3.2)
        px, pz = world(length / 2, 0.45)
        products(f"{name}_Prod{lv}", px, pz, y + 0.03, along_x, length - 0.22, 0.48, styles[lv], 3 + lv, lv, face,
                 free=[(f, hw) for f, hw, l_ in free if l_ == lv], gap=0.10)
    xa, za = world(-0.05, -0.1)
    xb, zb = world(length + 0.05, 0.95)
    cols.add(name, (xa + xb) / 2, (za + zb) / 2, 0.0, abs(xb - xa), abs(zb - za), 2.45)


def open_chiller(name, gx0, gx1, gz0, gz1):
    """Open multi-deck chiller facing +z: a chilled well with goods on ice, a back panel carrying two shelves of goods
    between two end panels, a lit lime header."""
    cx, zc, w, d = (gx0 + gx1) / 2, (gz0 + gz1) / 2, gx1 - gx0, gz1 - gz0
    kbox(f"{name}_Well", cx, zc, LOOP_Y, w, d, 0.6 - LOOP_Y, M["white"])
    kbox(f"{name}_RimBack", cx, gz0 + 0.03, 0.6, w, 0.06, 0.3, M["white"])
    kbox(f"{name}_RimFront", cx, gz1 - 0.03, 0.6, w, 0.06, 0.3, M["white"])
    kbox(f"{name}_RimW", gx0 + 0.03, zc, 0.6, 0.06, d - 0.12, 0.3, M["white"])
    kbox(f"{name}_RimE", gx1 - 0.03, zc, 0.6, 0.06, d - 0.12, 0.3, M["white"])
    kbox(f"{name}_Ice", cx, zc, 0.6, w - 0.12, d - 0.12, 0.1, M["ice"])
    products(f"{name}_WellProd", cx, zc, 0.7, True, w - 0.3, 0.5, FRIDGE_STYLES["Fridge_West"][2], 11, 0, (0, 1), gap=0.10)
    kbox(f"{name}_End0", gx0 + 0.03, zc, 0.9, 0.06, d, 1.1, M["white"])
    kbox(f"{name}_End1", gx1 - 0.03, zc, 0.9, 0.06, d, 1.1, M["white"])
    kbox(f"{name}_Back", cx, gz0 + 0.03, 0.9, w - 0.12, 0.06, 1.1, M["white"])
    for j, y in enumerate((1.1, 1.5)):
        kbox(f"{name}_Shelf{j}", cx, gz0 + 0.235, y, w - 0.12, 0.35, 0.03, M["shelf"])
        kbox(f"{name}_Rail{j}", cx, gz0 + 0.42, y - 0.01, w - 0.12, 0.02, 0.045, M["rail"], tile=3.2)
        products(f"{name}_Prod{j}", cx, gz0 + 0.23, y + 0.03, True, w - 0.3, 0.30, FRIDGE_STYLES["Fridge_Dairy"][j + 1], 13 + j, j + 1, (0, 1), gap=0.10)
    kbox(f"{name}_Top", cx, zc, 2.0, w + 0.1, d + 0.1, 0.2, M["lime"])
    kbox(f"{name}_Strip", cx, gz1 + 0.035, 1.97, w - 0.12, 0.03, 0.03, M["panel"])
    cols.add(name, cx, zc, 0.0, w + 0.1, d + 0.1, 2.2)


def chest_freezer(i, gx, gz):
    """Chest freezer: a box up to the bags, a rim around four bags of frozen goods, a glass lid."""
    kbox(f"Freezer_{i}", gx, gz, LOOP_Y, 1.8, 1.7, 0.55 - LOOP_Y, M["white"])
    for j, (dx, dz, sx, sz) in enumerate(((-0.875, 0.0, 0.05, 1.7), (0.875, 0.0, 0.05, 1.7), (0.0, -0.825, 1.7, 0.05), (0.0, 0.825, 1.7, 0.05))):
        kbox(f"Freezer_{i}_Rim{j}", gx + dx, gz + dz, 0.55, sx, sz, 0.35, M["white"])
    pal = STYLES["frozen"][3]["pal"]
    for j in range(4):
        kbox(f"Freezer_{i}_Bag{j}", gx + (-0.4 if j % 2 else 0.4), gz + (-0.38 if j < 2 else 0.38), 0.55, 0.7, 0.6, 0.25, pmat(pal[(i + j) % len(pal)]))
    kbox(f"Freezer_{i}_Lid", gx, gz, 0.9, 1.7, 1.6, 0.04, M["fridge"])


def produce_table(name, gx, gz, fruit=None):
    kbox(f"{name}_Body", gx, gz, LOOP_Y, 1.8, 1.2, 0.7 - LOOP_Y, M["crate"])
    kbox(f"{name}_Rim", gx, gz, 0.7, 1.9, 1.3, 0.1, M["crate"])
    if fruit:
        for i in range(12):
            ox, oz = -0.7 + (i % 4) * 0.46, -0.35 + (i // 4) * 0.35
            add(L.cyl(coll, f"{name}_Fruit{i}", gx + ox, gz + oz, 0.8, 0.14, 0.2, FRUITS[fruit], seg=8))
    cols.add(name, gx, gz, 0.0, 1.9, 1.3, 0.9)


def checkout(i, gx, gz, closed=False):
    """Checkout: body and belt, register with its customer screen on the light mast, card terminal, belt divider,
    bags hanging on the cashier side, cashier seat; `closed` chains the customer lane (west side) with a CLOSED sign."""
    kbox(f"Checkout_{i}_Body", gx, gz, 0.0, 1.0, 3.4, 0.9, M["white"], bevel=0.02)
    kbox(f"Checkout_{i}_Belt", gx, gz, 0.9, 0.7, 3.0, 0.05, M["conveyor"])
    kbox(f"Checkout_{i}_Register", gx, gz + 1.3, 0.95, 0.5, 0.35, 0.3, M["cart"], bevel=0.01)
    kbox(f"Checkout_{i}_Mast", gx, gz + 1.62, 0.9, 0.04, 0.04, 1.6, M["cart"])
    kbox(f"Checkout_{i}_Screen", gx, gz + 1.585, 1.3, 0.4, 0.03, 0.3, M["dark"])
    kbox(f"Checkout_{i}_ScreenFace", gx, gz + 1.56, 1.32, 0.36, 0.02, 0.26, M["panel"])
    kbox(f"Checkout_{i}_Terminal", gx - 0.42, gz + 1.0, 0.9, 0.12, 0.08, 0.05, M["conveyor"])
    kbox(f"Checkout_{i}_Divider", gx, gz - 1.0, 0.95, 0.3, 0.03, 0.03, M["green"])
    for j, (dz, mat) in enumerate(((0.5, "white"), (0.85, "green"), (1.2, "white"))):
        kbox(f"Checkout_{i}_Bag{j}", gx + 0.51, gz + dz, 0.5, 0.02, 0.3, 0.35, M[mat])
    kbox(f"Checkout_{i}_Seat", gx + 0.8, gz - 0.6, 0.0, 0.42, 0.42, 0.48, M["conveyor"])
    kbox(f"Checkout_{i}_SeatBack", gx + 0.8, gz - 0.78, 0.48, 0.42, 0.06, 0.4, M["conveyor"])
    kbox(f"Checkout_{i}_Light", gx, gz + 1.5, 2.5, 0.5, 0.5, 0.3, M["yellow"], bevel=0.05)
    text(f"Checkout_{i}_Num", str(i + 1), gx, gz + 1.5, 2.8, 0.3, M["green"], 0.0)
    cols.add(f"Checkout_{i}", gx, gz, 0.0, 1.0, 3.4, 1.0)
    cols.add(f"Checkout_{i}_Seat", gx + 0.8, gz - 0.65, 0.0, 0.5, 0.5, 0.9)
    if closed:
        kbox(f"Checkout_{i}_Closed", gx - 1.0, gz - 1.9, 0.85, 1.0, 0.02, 0.02, M["red"])
        kbox(f"Checkout_{i}_ClosedSign", gx - 1.0, gz - 1.9, 0.65, 0.36, 0.02, 0.2, M["red"])
        text(f"Checkout_{i}_ClosedText", "CLOSED", gx - 1.0, gz - 1.93, 0.69, 0.1, M["sign"], math.pi)
        for j, dx in enumerate((-1.5, -0.5)):
            add(L.cyl(coll, f"Checkout_{i}_ClosedPost{j}", gx + dx, gz - 1.9, 0.0, 0.02, 0.85, M["cart"], seg=6))
        cols.add(f"Checkout_{i}_Closed", gx - 1.0, gz - 1.9, 0.0, 1.1, 0.1, 0.9)


def cart(name, gx, gz, yaw, body=0.95):
    """Shopping cart (basket on posts, red handle bar) turned by `yaw`; a short `body` is a cart nested into the one
    in front of it, so a row of them reads as a nest."""
    kpart(f"{name}_Basket", gx, gz, yaw, 0, 0, 0.55, 0.6, body, 0.45, M["cart"])
    kpart(f"{name}_Handle", gx, gz, yaw, 0, body / 2 - 0.025, 1.0, 0.64, 0.05, 0.12, M["red"])
    posts = ((-0.25, -body / 2 + 0.1), (0.25, -body / 2 + 0.1), (-0.25, body / 2 - 0.1), (0.25, body / 2 - 0.1)) if body > 0.6 else ((-0.25, 0.0), (0.25, 0.0))
    for j, (lx, lz) in enumerate(posts):
        kpart(f"{name}_Post{j}", gx, gz, yaw, lx, lz, 0.0, 0.05, 0.05, 0.55, M["cart"])


def basket_stack(name, gx, gz):
    kbox(f"{name}_Core", gx, gz, 0.06, 0.4, 0.28, 0.82, M["green"])
    for j in range(8):
        kbox(f"{name}_{j}", gx, gz, 0.12 * j, 0.45, 0.32, 0.06, M["green"])
    for side in (-1, 1):
        kbox(f"{name}_Handle{side + 1}", gx + side * 0.18, gz, 0.9, 0.02, 0.3, 0.02, M["cart"])
    cols.add(name, gx, gz, 0.0, 0.6, 0.5, 1.1)


def bin_(name, gx, gz, y0=0.0):
    add(L.cyl(coll, f"{name}_Body", gx, gz, y0, 0.28, 0.85, M["dark"], seg=8))
    add(L.cyl(coll, f"{name}_Lid", gx, gz, y0 + 0.85, 0.3, 0.05, M["green"], seg=8))
    cols.add(name, gx, gz, 0.0, 0.6, 0.6, 0.9)


def pendant(name, gx, gz, y=2.6):
    add(L.cone(coll, f"{name}_Shade", gx, gz, y, 0.25, 0.08, 0.22, M["beam"], seg=8))
    add(L.cyl(coll, f"{name}_Bulb", gx, gz, y - 0.05, 0.05, 0.08, M["lamp"], seg=6))
    add(L.cyl(coll, f"{name}_Wire", gx, gz, y + 0.22, 0.01, H - y - 0.22, M["cart"], seg=4))


def poster(dep, axis, fixed, at, inward):
    """Framed department picture high on a wall; `inward` = the side of the wall plane the store is on."""
    if axis == "x":
        kbox(f"Poster_{dep}_Frame", at, fixed + inward * 0.01, 3.15, 2.5, 0.02, 1.3, M["white"])
        kbox(f"Poster_{dep}", at, fixed + inward * 0.035, 3.2, 2.4, 0.03, 1.2, DM[dep])
    else:
        kbox(f"Poster_{dep}_Frame", fixed + inward * 0.01, at, 3.15, 0.02, 2.5, 1.3, M["white"])
        kbox(f"Poster_{dep}", fixed + inward * 0.035, at, 3.2, 0.03, 2.4, 1.2, DM[dep])


def chevron(i, gx, gz):
    for j, (dz, rot) in enumerate(((0.175, math.pi / 4), (-0.175, -math.pi / 4))):
        add(L.box(coll, f"Mark_Chevron{i}_{j}", gx, gz + dz, 0.0, 0.5, 0.12, 0.006, M["mark"], rot=rot))


# ---------------------------------------------------------------- shell
rect("Ceiling", X0 - 0.2, Z0 - 0.2, X1 + 0.2, Z1 + 0.3, H, 0.15, M["ceil"], tile=3.0)
win = (0.9, 3.4)
objs += L.wall(coll, "Walls_Front", "x", Z1 + 0.1, 0.2, X0 - 0.2, X1 + 0.2, H, M["wall"],
               openings=[(-18.0, -3.0, *win), (-0.6, 0.6, 0.0, 2.2), (3.0, 18.0, *win)], cols=cols, glass=M["glass"], col_tag="Wall_Front")
objs += L.wall(coll, "Walls_Back", "x", Z0 - 0.1, 0.2, X0 - 0.2, X1 + 0.2, H, M["wall"], cols=cols, col_tag="Wall_Back")
objs += L.wall(coll, "Walls_W", "z", X0 - 0.1, 0.2, Z0, Z1 + 0.2, H, M["wall"], cols=cols, col_tag="Wall_W")
objs += L.wall(coll, "Walls_E", "z", X1 + 0.1, 0.2, Z0, Z1 + 0.2, H, M["wall"], cols=cols, col_tag="Wall_E")
kbox("Door_Entrance", 0, 5.1, 0.01, 1.18, 0.06, 2.18, M["glass"], bevel=0.02)
kbox("Door_Entrance_Frame", 0, 5.06, 2.2, 1.4, 0.1, 0.12, M["green"])
kbox("Sky_Front", 0, 16, -3.0, 70, 0.05, 14.0, M["sky"])
for nm, a, b2, axis, fixed in [("N", X0 + 0.05, X1 - 0.05, "x", Z0 + 0.03), ("W", Z0, Z1, "z", X0 + 0.03), ("E", Z0, Z1, "z", X1 - 0.03)]:
    if axis == "x":
        kbox(f"Wall_Band{nm}", (a + b2) / 2, fixed, 2.6, b2 - a, 0.04, 0.5, M["green"])
    else:
        kbox(f"Wall_Band{nm}", fixed, (a + b2) / 2, 2.6, 0.04, b2 - a, 0.5, M["green"])
# perimeter loop floor (the racetrack), department zones and queue marks cut into the slab, then the exposed beams + light rows
floors = K.Kit()
floors.floor("House_Floor_GreenCart", X0 - 0.2, Z0 - 0.2, X1 + 0.2, Z1 + 0.2, 0.0, M["floor"], tile=3.0)
for name, x0, z0, x1, z1, mat in (("Loop_W", X0, Z0 + 3.5, X0 + 3.0, 0.0, M["loop"]), ("Loop_N", X0, Z0, X1, Z0 + 3.5, M["loop"]),
                                   ("Loop_E", X1 - 3.0, Z0 + 3.5, X1, Z1, M["loop"]), ("Loop_S", X0 + 3.0, -1.0, 10.0, 0.0, M["loop"]),
                                   ("Zone_produce", 10.0, -11.0, X1 - 3.0, 0.0, ZM["produce"]), ("Zone_bakery", 10.5, -27.0, X1 - 3.0, -19.0, ZM["bakery"]),
                                   ("Zone_fresh", X0 + 3.0, Z0 + 3.5, 6.0, -24.5, ZM["fresh"])):
    floors.floor(name, x0, z0, x1, z1, LOOP_Y, mat, thick=0.1 + LOOP_Y, replace=True)
floors.floor("Entry_Doormat", -1.0, 3.9, 1.0, 4.9, 0.012, M["mat"], thick=0.112, replace=True)
for i in range(5):
    floors.floor(f"Mark_Wait{i}", -18.3 + i * 3.0, -0.95, -17.7 + i * 3.0, -0.35, LOOP_Y + 0.006, M["mark"], thick=0.106 + LOOP_Y, replace=True)
for j in range(7):
    floors.floor(f"Mark_Dash{j}", -18.3 + 2.4 * j, -0.25, -17.7 + 2.4 * j, -0.15, LOOP_Y + 0.006, M["mark"], thick=0.106 + LOOP_Y, replace=True)
for o in floors.build(coll, cols=cols, prefix="Floor", merge=False):
    add(o)
for fb_ in floors.boxes:
    kit.add(fb_.name, fb_.x0, fb_.z0, fb_.x1, fb_.z1, fb_.y0, fb_.y1, fb_.mat)
for i, gz in enumerate(range(-28, 5, 6)):
    kbox(f"Beam_{i}", 0.0, gz, H - 0.5, X1 - X0 + 0.2, 0.25, 0.5, M["beam"])
li = 0
for gx in (-15.0, -5.0, 5.0, 15.0):
    for gz in range(-28, 5, 5):
        kbox(f"Light_{li:02d}", gx, gz + 0.5, H - 0.07, 3.0, 0.45, 0.07, M["lamp"])
        li += 1
text("Brand_Text", "GREENCART", 0.0, Z1 - 0.6, 3.7, 0.7, M["green"], math.pi)
text("Brand_Tag", "fresh every day", 0.0, Z1 - 0.6, 3.35, 0.28, M["lime"], math.pi)
poster("produce", "z", X1, -5.0, -1)
poster("bakery", "x", Z0, 12.0, 1)
poster("fresh", "x", Z0, 0.0, 1)
poster("dairy", "x", Z0, -13.0, 1)
poster("checkout", "z", X0, -2.0, 1)

# ---------------------------------------------------------------- entrance: cart pen, promo bins, baskets, flowers
for row, gz in enumerate((3.3, 2.3)):
    cart(f"Cart_{row}_0", 4.8, gz, math.pi / 2)
    for i in range(1, 6):
        cart(f"Cart_{row}_{i}", 5.275 + 0.42 * (i - 0.5), gz, math.pi / 2, body=0.42)
for j, gz in enumerate((1.85, 3.85)):
    kbox(f"Pen_Rail{j}", 5.9, gz, 0.9, 3.4, 0.05, 0.05, M["cart"])
    for i, gx in enumerate((4.3, 5.9, 7.5)):
        kbox(f"Pen_Post{j}_{i}", gx, gz, 0.0, 0.05, 0.05, 0.9, M["cart"])
cols.add("Carts", 5.9, 2.85, 0.0, 3.6, 2.1, 1.1)
for i, (gx, gz) in enumerate(((-2.6, 1.5), (2.2, 0.8))):
    kbox(f"PromoBin_{i}", gx, gz, 0.0, 1.2, 1.2, 0.9, M["yellow"], bevel=0.03)
    products(f"PromoBin_{i}_Prod", gx, gz, 0.9, True, 1.0, 1.0, block(0.3, [RED, TEAL, BLUE]), 9 + i, 0, (0, 1))
    cols.add(f"PromoBin_{i}", gx, gz, 0.0, 1.2, 1.2, 1.1)
for i, (gx, gz) in enumerate(((2.3, 3.0), (4.0, 1.2), (6.5, 0.6))):
    chevron(i, gx, gz)
kbox("Flowers_Stand", 15.0, 3.0, 0.0, 2.4, 1.0, 0.8, M["crate"])
for i in range(6):
    add(L.cyl(coll, f"Flowers_{i}", 14.1 + i * 0.36, 3.0, 0.8, 0.12, 0.5, list(FRUITS.values())[i], seg=6))
cols.add("Flowers_Stand", 15.0, 3.0, 0.0, 2.4, 1.0, 1.3)
basket_stack("Basket_Entrance", -3.0, 4.2)
basket_stack("Basket_Exit", -18.6, 0.6)
bin_("Bin_Door", 2.0, 4.3)
bin_("Bin_Exit", -18.6, 1.6)
kbox("Desk_Body", -15.5, 4.2, 0.0, 1.6, 0.6, 1.0, M["white"])
kbox("Desk_Top", -15.5, 4.2, 1.0, 1.7, 0.7, 0.05, M["lime"])
cols.add("Desk", -15.5, 4.2, 0.0, 1.7, 0.7, 1.1)

# ---------------------------------------------------------------- produce (east, by the entrance)
hanging_sign("produce", 14.0, -3.0, math.pi / 2, width=4.0)
for i, (gx, gz, fruit) in enumerate(((12.0, -1.0, None), (16.0, -1.0, None), (12.0, -4.0, "orange"), (16.0, -4.0, "lemon"),
                                      (12.0, -7.0, "lettuce"), (16.0, -7.0, "melon"), (12.0, -10.0, "aubergine"), (16.0, -10.0, "tomato"))):
    produce_table(f"Produce_{i}", gx, gz, fruit)
for key, gx, stack in PRODUCE_DISPLAYS:
    food_display(key, "produce", gx, 0.8, -1.0, 0.0, gx, -1.75, tag_y=1.3, stack=stack)
add(L.cyl(coll, "Scale_Post", 14.0, -5.5, LOOP_Y, 0.03, 0.9, M["cart"], seg=6))
kbox("Scale_Body", 14.0, -5.5, 0.9, 0.4, 0.4, 0.25, M["cart"])
add(L.cyl(coll, "Scale_Mast", 14.0, -5.5, 1.15, 0.015, 0.3, M["cart"], seg=6))
kbox("Scale_Screen", 14.0, -5.5, 1.45, 0.3, 0.02, 0.15, M["panel"])
cols.add("Scale", 14.0, -5.5, 0.0, 0.5, 0.5, 1.6)
add(L.cyl(coll, "Bags_Post", 14.0, -2.5, LOOP_Y, 0.03, 0.9, M["cart"], seg=6))
add(L.cyl(coll, "Bags_Roll", 14.0, -2.5, 0.9, 0.08, 0.35, M["white"], seg=8))
cols.add("Bags", 14.0, -2.5, 0.0, 0.3, 0.3, 1.3)
wall_fridge("Fridge_Produce", X1 - 0.9, -12.0, X1 - 0.1, -4.0, (-1, 0), FRIDGE_STYLES["Fridge_Produce"])
bin_("Bin_Produce", 18.5, 0.5, LOOP_Y)
bin_("Bin_East", 18.5, -18.5, LOOP_Y)

# ---------------------------------------------------------------- bakery (back east)
hanging_sign("bakery", 14.0, -22.0, math.pi / 2, width=3.0)
kbox("Bakery_Counter", 13.5, -23.0, LOOP_Y, 1.0, 7.0, 1.0 - LOOP_Y, M["crate"])
kbox("Bakery_CounterTop", 13.5, -23.0, 1.0, 1.1, 7.2, 0.05, M["white"])
kbox("Bakery_CounterGlass", 13.0, -23.0, 1.05, 0.04, 7.0, 0.6, M["glass"])
for i in range(3):
    kbox(f"Bakery_Rail{i}", 12.99, -25.3 + i * 2.3, 0.95, 0.02, 2.2, 0.045, M["rail"], tile=3.2)
cols.add("Bakery_Counter", 13.5, -23.0, 0.0, 1.1, 7.2, 1.6)
for lv, y in enumerate((0.6, 1.2, 1.8)):
    kbox(f"Bakery_Shelf{lv}", X1 - 0.4, -23.0, y, 0.6, 7.0, 0.04, M["crate"])
    for i in range(10):
        add(L.cyl(coll, f"Bakery_Bread{lv}_{i}", X1 - 0.4, -26.2 + i * 0.7, y + 0.04, 0.12, 0.28, M["bread"], seg=7))
cols.add("Bakery_Shelves", X1 - 0.4, -23.0, 0.0, 0.7, 7.2, 2.2)
for i, gx in enumerate((10.0, 12.0)):
    kbox(f"Bakery_Oven{i}", gx, Z0 + 0.6, LOOP_Y, 1.6, 1.0, 2.0, M["cart"], bevel=0.02)
    kbox(f"Bakery_OvenDoor{i}", gx, Z0 + 0.08, 0.7, 1.2, 0.04, 0.8, M["panel"])
cols.add("Bakery_Ovens", 11.0, Z0 + 0.6, 0.0, 3.8, 1.0, 2.0)
add(L.cyl(coll, "Barrel_Body", 11.0, -20.0, LOOP_Y, 0.3, 0.6, M["crate"], seg=10))
for i in range(8):
    a = i * math.pi / 4
    add(L.cyl(coll, f"Barrel_Baguette{i}", 11.0 + 0.2 * math.cos(a), -20.0 + 0.2 * math.sin(a), 0.55, 0.03, 0.7, M["bread"], seg=4))
cols.add("Barrel", 11.0, -20.0, 0.0, 0.7, 0.7, 1.3)
for i, gz in enumerate((-21.0, -25.0)):
    pendant(f"Lamp_Bakery{i}", 13.5, gz)
for key, gz, stack in BAKERY_DISPLAYS:
    food_display(key, "bakery", 13.4, 1.05, gz, -math.pi / 2, 12.7, gz, tag_y=1.3, stack=stack)

# ---------------------------------------------------------------- fish & meat (back centre), dairy (back west + west wall)
hanging_sign("fresh", 0.0, -27.0, 0.0, width=3.0)
kbox("Fresh_Counter", 0.0, -28.5, LOOP_Y, 10.0, 1.2, 0.95 - LOOP_Y, M["white"])
kbox("Fresh_Ice", 0.0, -28.5, 0.95, 9.6, 1.0, 0.15, M["ice"])
kbox("Fresh_Glass", 0.0, -27.85, 1.0, 10.0, 0.04, 0.7, M["glass"])
for i in range(8):
    kbox(f"Fresh_Fish{i}", -4.0 + i * 1.1, -28.5, 1.1, 0.5, 0.22, 0.1, FRUITS["aubergine" if i % 2 else "lettuce"], bevel=0.03)
for i in range(3):
    kbox(f"Fresh_Rail{i}", -3.3 + i * 3.3, -27.89, 0.9, 3.2, 0.02, 0.045, M["rail"], tile=3.2)
for i, gx in enumerate((-3.5, -1.0, 1.5, 4.0)):
    slate = add(L.box(coll, f"Slate_{i}", gx, -27.8, 1.72, 0.5, 0.02, 0.35, M["dark"]))
    slate.rotation_euler = (-math.radians(15), 0.0, 0.0)
for i, gx in enumerate((-3.0, 0.0, 3.0)):
    pendant(f"Lamp_Fresh{i}", gx, -28.5)
cols.add("Fresh_Counter", 0.0, -28.5, 0.0, 10.0, 1.2, 1.7)
bin_("Bin_Fresh", -1.0, -26.3, LOOP_Y)
hanging_sign("dairy", -13.0, -27.0, 0.0, width=3.4)
wall_fridge("Fridge_Dairy", -19.0, Z0 + 0.1, -8.0, Z0 + 0.9, (0, 1), FRIDGE_STYLES["Fridge_Dairy"])
wall_fridge("Fridge_West", X0 + 0.1, -26.0, X0 + 0.9, -14.0, (1, 0), FRIDGE_STYLES["Fridge_West"],
            free=[(z, stack_half(key, stack), lv) for key, lv, z, stack, _ in FRIDGE_WEST_DISPLAYS], glazed=False)
for key, lv, gz, stack, tag_z in FRIDGE_WEST_DISPLAYS:
    food_display(key, "dairy", X0 + 0.55, FRIDGE_YS[lv] + 0.03, gz, math.pi / 2, X0 + 1.35, tag_z, tag_y=1.35 if lv < 2 else 1.0, stack=stack)
open_chiller("Chiller", -16.9, -6.9, -27.5, -26.7)
hanging_sign("frozen", -17.0, -8.0, math.pi / 2, width=3.0)
for i in range(4):
    chest_freezer(i, X0 + 1.1, -10.5 + i * 2.0)
cols.add("Freezers", X0 + 1.1, -7.5, 0.0, 1.9, 8.0, 1.1)
bin_("Bin_West", -19.0, -12.6, LOOP_Y)

# ---------------------------------------------------------------- the grid of gondolas
GZ0, GZ1 = -24.5, -11.0
for i, dep in enumerate(GONDOLAS):
    gondola(dep, -15.0 + i * 4.0, GZ0, GZ1, i)
    end_cap(dep, -15.0 + i * 4.0)
for i, dep in enumerate(GONDOLAS):
    gx = -15.0 + i * 4.0
    kbox(f"AisleSign_{dep}", gx, GZ1 + 2.4, 3.5, 2.4, 0.06, 0.5, DM[dep])
    # the board's front face is at GZ1 + 2.43: the text sits just in front of it (it was buried inside the board)
    text(f"AisleSign_{dep}_Text", DEPARTMENTS[dep][0], gx, GZ1 + 2.45, 3.62, 0.24, M["sign"], 0.0)
    dept_info.append({"id": dep, "label": DEPARTMENTS[dep][0], "color": DEPARTMENTS[dep][1], "sign": [round(gx, 3), 3.75, round(GZ1 + 2.4, 3)]})
for dep in ("drinks", "pasta", "frozen"):
    gx = -15.0 + GONDOLAS.index(dep) * 4.0
    promo_pyramid(f"Cap_{dep}_Back", gx, GZ0 - 0.3, 0.6, 2, STYLES[dep][1]["pal"][0], LOOP_Y)
    cols.add(f"Cap_{dep}_Back", gx, GZ0 - 0.3, 0.0, 1.2, 0.6, 1.1)
for i in range(5):
    gx = -13.0 + i * 4.0
    kbox(f"Num_{i}", gx, -17.75, 3.6, 0.9, 0.06, 0.6, DM[GONDOLAS[i]])
    text(f"Num_{i}_Text", str(i + 1), gx, -17.7, 3.72, 0.36, M["sign"], 0.0)
    text(f"Num_{i}_TextBack", str(i + 1), gx, -17.8, 3.72, 0.36, M["sign"], math.pi)
    for j, dx in enumerate((-0.3, 0.3)):
        add(L.cyl(coll, f"Num_{i}_Wire{j}", gx + dx, -17.75, 4.2, 0.01, H - 4.2, M["cart"], seg=4))
for i, gx in enumerate((-14.0, -6.0, 2.0, 10.0)):
    kbox(f"Banner_{i}", gx, -5.0, 3.4, 1.2, 0.04, 0.9, M["banner"])
    for j, dx in enumerate((-0.5, 0.5)):
        add(L.cyl(coll, f"Banner_{i}_Wire{j}", gx + dx, -5.0, 4.3, 0.01, H - 4.3, M["cart"], seg=4))
# the sold foods on their shelves (the matching slot is marked taken)
for dep, entries in DISPLAY_SLOTS.items():
    gx = -15.0 + GONDOLAS.index(dep) * 4.0
    for key, side, lv, gz, stack in entries:
        food_display(key, dep, gx + side * 0.3, SHELF_YS[lv] + 0.03, gz, side * math.pi / 2, gx + side * 0.9, gz, tag_y=1.35 if lv < 2 else 1.0, stack=stack)
for d in displays:
    if d["department"] not in GONDOLAS:
        continue
    nearest = min(slots, key=lambda s: (s["aisle"] != d["department"], sum(abs(a - b) for a, b in zip(s["position"], d["position"]))))
    nearest["code"] = d["code"]

# ---------------------------------------------------------------- checkouts (front west) and the exit lane
hanging_sign("checkout", -10.0, 1.0, 0.0, width=3.0)
for i in range(5):
    checkout(i, -17.0 + i * 3.0, 1.8, closed=i >= 3)
for gx in (-18.8, 18.8):
    add(L.plant(coll, M, f"Plant_{int(gx)}", gx, 4.3))
    cols.add(f"Plant_{int(gx)}", gx, 4.3, 0.0, 0.5, 0.5, 1.3)

K.report(kit)
bad = L.check_grounded(objs, allow=L.ALLOW_INTERIOR + ("Ceiling", "Beam_", "Sign_", "Brand_", "Gondola_", "Fridge_", "Freezer_", "Produce_", "Bakery_",
                                                      "Fresh_", "Checkout_", "PromoBin_", "Flowers_", "Cart_", "Loop_", "AisleSign_", "TagPost_", "Wall_Band",
                                                      "Cap_", "Banner_", "Num_", "Poster_", "Lamp_", "Slate_", "Scale_", "Bags_", "Chiller_",
                                                      "Basket_", "Desk_", "Pen_", "Bin_", "Barrel_", "Zone_", "Mark_"))
print("GREENCART grounded violations:", bad)
assert not bad, bad

STRUCTURE_NODES = ("House_Floor", "Ceiling", "Walls_", "Wall_Band", "Beam_", "Loop_", "Zone_", "Entry_Doormat", "Door_Entrance", "Sky_")
by_mat = {}
merged = []
for o in objs:
    if o.name.startswith(STRUCTURE_NODES):
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
# the band is a hollow ring on the shell walls: a solid slab put its underside at (or below) the interior ceiling
xo += L.perimeter(coll2, "EX_Band", W, hd, zb, HB - 0.5, 0.5, L.SHELL_THICKNESS, E["green"], tile=1.5)
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
