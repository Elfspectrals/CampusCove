"""GreenCart: the supermarket of the Cove Parkview Mall (docs/MALL.md). Layout contract of Cove Home (departments +
displays with a price tag), read by useFurnitureStore with items/<group>/<key>/model.glb: the bananas and apples on their
produce tables and the croissants, bread and cookies on the bakery counter are on display.

A real supermarket plan: entrance east with a cart pen and promo bins, produce then bakery near the entrance, dairy and
fresh food at the back, a perimeter loop, six aisles in a grid, five checkouts by the exit. Only the shell is baked here:
walls, floor with its loop and department zones, ceiling, beams and lights, wall bands, doormat, door, sky, brand text and
the department, aisle and checkout signs. The gondolas, wall fridges, chillers and every fixture (checkout lanes, carts,
produce and bakery counters, fish counter, promo bins and pallets, bins, plants) are zone props in zones/greencart.json:
shelf props stocked with the items on sale, and decor pieces of build_shop_decor.py. Every axis-aligned box is
registered in a lib_kit.Kit so the interior is checked for coplanar overlaps and contained boxes before export.
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
LOOP_Y = 0.008
AISLE_SIGN_Z = -8.6

FOODS = {
    "croissant": ("food_croissant", "Croissant", "Butter croissant, baked this morning.", [0.16, 0.08, 0.1]),
    "cookie": ("food_cookie", "Cookie", "Chocolate chip cookie.", [0.1, 0.03, 0.1]),
    "apple": ("grocery_apple", "Apple", "Crisp red apple, two bites.", [0.08, 0.095, 0.08]),
    "banana": ("grocery_banana", "Banana", "Ripe banana, two portions.", [0.19, 0.085, 0.045]),
    "bread": ("grocery_bread", "Sliced Bread", "Sliced loaf in its bag, four slices.", [0.27, 0.12, 0.125]),
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
AISLES = ["breakfast", "drinks", "snacks", "pasta", "household", "frozen"]
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
M["white"] = L.make_mat("IN_CartWhite", "#fbfbf8", 0.5, "noise", 0.01)
M["loop"] = L.make_mat("IN_CartLoop", "#c9d8c2", 0.7, "tiles", 0.02, accent="#b8c7b1")
M["sign"] = L.make_mat("IN_CartSign", "#ffffff", 0.4, "noise", 0.0, emit="#ffffff", emit_strength=1.0)
M["cart"] = L.make_mat("IN_CartMetal", "#b9bec6", 0.35, "noise", 0.03)
M["beam"] = L.make_mat("IN_CartBeam", "#9aa0a8", 0.6, "noise", 0.02)
M["banner"] = L.make_mat("IN_CartPromoBanner", "#f6d04d", 0.6, "stripes", 0.02, accent="#d9473a")
M["mark"] = L.make_mat("IN_CartFloorMark", "#f1d34a", 0.8, "noise", 0.02)
ZM = {dep: L.make_mat(f"IN_CartZone_{dep}", c, 0.8, "noise", 0.02) for dep, c in (("produce", "#cfe5c6"), ("bakery", "#f0dcb9"), ("fresh", "#d7e3ec"))}
DM = {dep: L.make_mat(f"IN_CartDept_{dep}", c, 0.8, "noise", 0.02) for dep, (_, c) in DEPARTMENTS.items()}

objs = []
displays = []
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


def food_display(key, dep, gx, gy, gz, yaw, tag_x, tag_z, tag_y=1.32, stack=(1, 1)):
    """One food on sale; `stack` = (columns, rows) of copies the front lines up on the spot, so a 10 cm cookie
    reads as a filled shelf facing instead of a lone crumb."""
    code, name, blurb, size = FOODS[key]
    displays.append({"key": key, "code": code, "department": dep, "description": blurb,
                     "position": [round(gx, 3), round(gy, 3), round(gz, 3)], "yaw": round(yaw, 4), "size": size, "stack": list(stack),
                     "tag": {"position": [round(tag_x, 3), tag_y, round(tag_z, 3)], "yaw": round(yaw, 4)}})


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

# ---------------------------------------------------------------- entrance: floor arrows
for i, (gx, gz) in enumerate(((2.3, 3.0), (4.0, 1.2), (6.5, 0.6))):
    chevron(i, gx, gz)

# ---------------------------------------------------------------- produce (east, by the entrance)
hanging_sign("produce", 14.0, -3.0, math.pi / 2, width=4.0)
for key, gx, stack in PRODUCE_DISPLAYS:
    food_display(key, "produce", gx, 0.8, -1.0, 0.0, gx, -1.75, tag_y=1.3, stack=stack)

# ---------------------------------------------------------------- bakery (back east)
hanging_sign("bakery", 14.0, -22.0, math.pi / 2, width=3.0)
for i, gz in enumerate((-21.0, -25.0)):
    pendant(f"Lamp_Bakery{i}", 13.5, gz)
for key, gz, stack in BAKERY_DISPLAYS:
    food_display(key, "bakery", 13.4, 1.05, gz, -math.pi / 2, 12.7, gz, tag_y=1.3, stack=stack)

# ---------------------------------------------------------------- fish & meat (back centre), dairy (back west + west wall), frozen
hanging_sign("fresh", 0.0, -27.0, 0.0, width=3.0)
for i, gx in enumerate((-3.0, 0.0, 3.0)):
    pendant(f"Lamp_Fresh{i}", gx, -28.5)
hanging_sign("dairy", -13.0, -27.0, 0.0, width=3.4)
hanging_sign("frozen", -17.0, -8.0, math.pi / 2, width=3.0)

# ---------------------------------------------------------------- the aisle signs over the grid of shelves
for i, dep in enumerate(AISLES):
    gx = -15.0 + i * 4.0
    kbox(f"AisleSign_{dep}", gx, AISLE_SIGN_Z, 3.5, 2.4, 0.06, 0.5, DM[dep])
    # the board's front face is at AISLE_SIGN_Z + 0.03: the text sits just in front of it (it was buried inside the board)
    text(f"AisleSign_{dep}_Text", DEPARTMENTS[dep][0], gx, AISLE_SIGN_Z + 0.05, 3.62, 0.24, M["sign"], 0.0)
    dept_info.append({"id": dep, "label": DEPARTMENTS[dep][0], "color": DEPARTMENTS[dep][1], "sign": [round(gx, 3), 3.75, round(AISLE_SIGN_Z, 3)]})
for i in range(5):
    gx = -13.0 + i * 4.0
    kbox(f"Num_{i}", gx, -17.75, 3.6, 0.9, 0.06, 0.6, DM[AISLES[i]])
    text(f"Num_{i}_Text", str(i + 1), gx, -17.7, 3.72, 0.36, M["sign"], 0.0)
    text(f"Num_{i}_TextBack", str(i + 1), gx, -17.8, 3.72, 0.36, M["sign"], math.pi)
    for j, dx in enumerate((-0.3, 0.3)):
        add(L.cyl(coll, f"Num_{i}_Wire{j}", gx + dx, -17.75, 4.2, 0.01, H - 4.2, M["cart"], seg=4))
for i, gx in enumerate((-14.0, -6.0, 2.0, 10.0)):
    kbox(f"Banner_{i}", gx, -5.0, 3.4, 1.2, 0.04, 0.9, M["banner"])
    for j, dx in enumerate((-0.5, 0.5)):
        add(L.cyl(coll, f"Banner_{i}_Wire{j}", gx + dx, -5.0, 4.3, 0.01, H - 4.3, M["cart"], seg=4))

# ---------------------------------------------------------------- checkouts (front west) and the exit lane
hanging_sign("checkout", -10.0, 1.0, 0.0, width=3.0)

K.report(kit)
bad = L.check_grounded(objs, allow=L.ALLOW_INTERIOR + ("Ceiling", "Beam_", "Sign_", "Brand_", "Loop_", "AisleSign_", "Wall_Band", "Banner_", "Num_",
                                                      "Poster_", "Lamp_", "Zone_", "Mark_"))
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
    "departments": dept_info, "displays": displays,
    "counter": [-12.0, 1.0, 2.6],
    "clerk": {"position": [-10.0, 0.0, 2.6], "yaw": round(-math.pi / 2, 4)},
})
tris = sum(len(p.vertices) - 2 for o in merged if o.type == "MESH" for p in o.data.polygons)
print("greencart interior:", len(objs), "objects ->", len(merged), "nodes,", tris, "tris,", len(cols.items), "collision boxes,", len(displays), "displays")

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
