"""Candy Cloud: the mall's sweet shop, in its Wonderland Plaza cell (docs/MALL.md). Cove Home layout contract with
`displays[].key` = asset folder (items/sweets/<key>) and `code` = candy_*, read by useFurnitureStore: the six sweets of
build_sweets_items.py sit in jars, on a pick-and-mix island, a lollipop tree and the counter, each with a price tag.

Outputs out/store/candy_cloud/{interior,exterior}.glb, *.colsrc.glb, *.layout.json, preview.png.
Then build_house_lightmaps.py -- store candy_cloud, npm run assets:optimize -- store.
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

KEY = "candy_cloud"
NAME = "Candy Cloud"
OUT = os.path.join(L.OUT_ROOT, "store", KEY)
H = 4.2
X0, X1, Z0, Z1 = -12.0, 12.0, -3.5, 5.0
rng = random.Random(61)
SWEETS = {
    "cotton_candy": ("candy_cotton", "fair", "Spun sugar cloud, freshly made at the machine.", [0.2, 0.365, 0.155]),
    "lollipop": ("candy_lollipop", "lollipops", "Swirl lollipop on a stick.", [0.09, 0.21, 0.02]),
    "candy_bag": ("candy_bag", "pickmix", "A bag of gummies from the pick & mix.", [0.12, 0.168, 0.055]),
    "licorice": ("candy_licorice", "pickmix", "Four twists of black licorice.", [0.057, 0.17, 0.06]),
    "bubble_gum": ("candy_gum", "counter", "Pack of bubble gum, five sticks.", [0.076, 0.095, 0.023]),
    "candy_apple": ("candy_apple", "fair", "Red candy apple, glossy and crunchy.", [0.085, 0.218, 0.085]),
}
DEPARTMENTS = {
    "pickmix": ("PICK & MIX", "#f7a1c4"),
    "lollipops": ("LOLLIPOPS", "#e0534f"),
    "fair": ("FAIR TREATS", "#38a3c9"),
    "counter": ("COUNTER", "#79b765"),
}

sc = L.new_build_scene("STORE_" + KEY + "_interior")
coll = bpy.data.collections.new("Interior")
sc.collection.children.link(coll)
cols = L.Collisions(coll)
M = L.std_mats(wall="#d7f1ea", floor=("#fbe6ef", "checker", "#f7c6d9"))
M["pink"] = L.make_mat("IN_CandyPink", "#f7a1c4", 0.6, "noise", 0.02)
M["mint"] = L.make_mat("IN_CandyMint", "#9fe0cf", 0.6, "noise", 0.02)
M["cream"] = L.make_mat("IN_CandyCream", "#fdf6ee", 0.5, "noise", 0.01)
M["stripe"] = L.make_mat("IN_CandyStripe", "#e0534f", 0.6, "stripes", 0.02, accent="#fdf6ee")
M["stripe2"] = L.make_mat("IN_CandyStripeMint", "#9fe0cf", 0.6, "stripes", 0.02, accent="#fdf6ee")
M["jar"] = L.make_mat("IN_CandyJar", "#e6f6fb", 0.1, "noise", 0.01, alpha=0.35)
M["sign"] = L.make_mat("IN_CandySign", "#ffffff", 0.4, "noise", 0.0, emit="#fff1f7", emit_strength=1.0)
M["cloud"] = L.make_mat("IN_CandyCloud", "#ffffff", 0.9, "noise", 0.02, emit="#ffffff", emit_strength=0.4)
M["tag"] = L.make_mat("IN_CandyTagPost", "#b8b0c4", 0.5, "noise", 0.02)
M["machine"] = L.make_mat("IN_CandyMachine", "#d94f8a", 0.4, "noise", 0.02)
M["chrome"] = L.make_mat("IN_CandyChrome", "#d9dde2", 0.2, "noise", 0.02)
FILLS = [L.make_mat(f"IN_CandyFill{i}", c, 0.4, "noise", 0.05) for i, c in enumerate(("#e0534f", "#f6d04d", "#79b765", "#38a3c9", "#a985e0", "#f28c28", "#f4b3c8", "#2fa17a"))]
DM = {dep: L.make_mat(f"IN_CandyDept_{dep}", c, 0.8, "noise", 0.02) for dep, (_, c) in DEPARTMENTS.items()}
objs = []
displays = []
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


def hanging_sign(dep, gx, gz, yaw):
    label, _ = DEPARTMENTS[dep]
    fx, fz = math.sin(yaw), math.cos(yaw)
    add(L.box(coll, f"Sign_{dep}_Board", gx, gz, 3.0, 2.4, 0.08, 0.55, DM[dep], rot=yaw, bevel=0.03))
    text(f"Sign_{dep}_Text", label, gx + fx * 0.06, gz + fz * 0.06, 3.12, 0.3, M["sign"], yaw)
    text(f"Sign_{dep}_TextB", label, gx - fx * 0.06, gz - fz * 0.06, 3.12, 0.3, M["sign"], yaw + math.pi)
    for o_ in (-0.9, 0.9):
        add(L.cyl(coll, f"Sign_{dep}_Wire{int(o_ * 10)}", gx + o_ * math.cos(yaw), gz - o_ * math.sin(yaw), 3.55, 0.01, H - 3.55, M["chrome"], seg=4))
    dept_info.append({"id": dep, "label": label, "color": DEPARTMENTS[dep][1], "sign": [round(gx, 3), 3.3, round(gz, 3)]})


def jar(name, gx, gz, y, r, h, fill):
    add(L.cyl(coll, f"{name}_Fill", gx, gz, y, r - 0.02, h * 0.7, fill, seg=10))
    add(L.cyl(coll, f"{name}_Glass", gx, gz, y, r, h, M["jar"], seg=10))
    add(L.cyl(coll, f"{name}_Lid", gx, gz, y + h, r + 0.01, 0.04, M["chrome"], seg=10))


def display(key, gx, gy, gz, yaw, tag_x, tag_z, tag_y=1.3):
    code, dep, blurb, size = SWEETS[key]
    add(L.cyl(coll, f"TagPost_{key}", tag_x, tag_z, 0.0, 0.02, tag_y - 0.25, M["tag"], seg=6))
    displays.append({"key": key, "code": code, "department": dep, "description": blurb,
                     "position": [round(gx, 3), round(gy, 3), round(gz, 3)], "yaw": round(yaw, 4), "size": size,
                     "tag": {"position": [round(tag_x, 3), tag_y, round(tag_z, 3)], "yaw": round(yaw, 4)}})


# ---------------------------------------------------------------- shell
rect("House_Floor_Candy", X0 - 0.2, Z0 - 0.2, X1 + 0.2, Z1 + 0.2, -0.1, 0.1, M["floor"], tile=1.0)
rect("Ceiling", X0 - 0.2, Z0 - 0.2, X1 + 0.2, Z1 + 0.3, H, 0.15, M["ceil"], tile=3.0)
win = (0.9, 3.2)
objs += L.wall(coll, "Walls_Front", "x", Z1 + 0.1, 0.2, X0 - 0.2, X1 + 0.2, H, M["wall"],
               openings=[(-11.0, -2.0, *win), (-0.6, 0.6, 0.0, 2.2), (2.0, 11.0, *win)], cols=cols, glass=M["glass"], col_tag="Wall_Front")
objs += L.wall(coll, "Walls_Back", "x", Z0 - 0.1, 0.2, X0 - 0.2, X1 + 0.2, H, M["pink"], cols=cols, col_tag="Wall_Back")
objs += L.wall(coll, "Walls_W", "z", X0 - 0.1, 0.2, Z0, Z1 + 0.2, H, M["wall"], cols=cols, col_tag="Wall_W")
objs += L.wall(coll, "Walls_E", "z", X1 + 0.1, 0.2, Z0, Z1 + 0.2, H, M["wall"], cols=cols, col_tag="Wall_E")
add(L.box(coll, "Door_Entrance", 0, 5.1, 0.01, 1.18, 0.06, 2.18, M["glass"], bevel=0.02))
add(L.box(coll, "Door_Entrance_Frame", 0, 5.06, 2.2, 1.4, 0.1, 0.12, M["pink"]))
add(L.box(coll, "Entry_Doormat", 0, 4.4, 0.0, 2.0, 1.0, 0.012, M["mat"]))
add(L.box(coll, "Sky_Front", 0, 16, -3.0, 50, 0.05, 12.0, M["sky"]))
li = 0
for gx in (-9.0, -4.5, 0.0, 4.5, 9.0):
    for gz in (-2.5, 1.0, 3.8):
        add(L.cyl(coll, f"Light_{li:02d}", gx, gz, H - 0.08, 0.4, 0.08, M["lamp"], seg=12))
        li += 1
# clouds floating under the ceiling and the brand on the back wall
for i in range(7):
    gx, gz = -10.0 + i * 3.3, -1.0 + (i % 2) * 2.5
    for k, (ox, oz, r) in enumerate(((0, 0, 0.5), (0.45, 0.1, 0.38), (-0.42, -0.05, 0.36), (0.1, 0.3, 0.3))):
        add(L.cyl(coll, f"Cloud{i}_{k}", gx + ox, gz + oz, 3.3, r, 0.35, M["cloud"], seg=10))
text("Brand_Text", "CANDY CLOUD", 0.0, Z0 + 0.1, 3.35, 0.6, M["sign"], 0.0)
text("Brand_Tag", "sweets for everyone", 0.0, Z0 + 0.1, 3.0, 0.26, M["sign"], 0.0)
# candy-cane pillars and striped awning over the counter
for gx in (-6.0, 6.0):
    add(L.cyl(coll, f"Cane_{int(gx)}", gx, 1.5, 0.0, 0.18, H, M["stripe"], seg=10))
    cols.add(f"Cane_{int(gx)}", gx, 1.5, 0.0, 0.5, 0.5, H)
# back wall shelves of jars
for lv, y in enumerate((0.9, 1.6, 2.3)):
    add(L.box(coll, f"Shelf_Back{lv}", 0.0, Z0 + 0.3, y, X1 - X0 - 1.0, 0.4, 0.04, M["cream"]))
    for i in range(22):
        gx = -10.5 + i * 1.0
        jar(f"Jar{lv}_{i}", gx, Z0 + 0.3, y + 0.04, 0.14 + 0.03 * (i % 2), 0.4 + 0.08 * ((i + lv) % 3), FILLS[(i + lv * 3) % len(FILLS)])
cols.add("Shelf_Back", 0.0, Z0 + 0.3, 0.0, X1 - X0 - 1.0, 0.6, 3.0)
# pick & mix island in the middle: hexagon of bins
add(L.cyl(coll, "PickMix_Base", 0.0, 0.5, 0.0, 1.6, 0.9, M["mint"], seg=6))
for k in range(6):
    a = 2 * math.pi * k / 6
    gx, gz = 1.1 * math.cos(a), 0.5 + 1.1 * math.sin(a)
    add(L.box(coll, f"PickMix_Bin{k}", gx, gz, 0.9, 0.55, 0.45, 0.25, M["jar"], rot=-a))
    add(L.box(coll, f"PickMix_Fill{k}", gx, gz, 0.9, 0.5, 0.4, 0.18, FILLS[k % len(FILLS)], rot=-a))
add(L.cyl(coll, "PickMix_Post", 0.0, 0.5, 0.9, 0.05, 1.6, M["stripe2"], seg=8))
cols.add("PickMix", 0.0, 0.5, 0.0, 3.4, 3.4, 1.2)
display("candy_bag", 0.0, 0.9, -0.9, 0.0, 0.0, -1.6)
display("licorice", -1.2, 0.9, 1.2, math.pi / 2, -1.9, 1.5, tag_y=1.3)
# lollipop tree (west)
add(L.cyl(coll, "LollyTree_Base", -8.0, -1.0, 0.0, 0.5, 0.1, M["cream"], seg=12))
add(L.cyl(coll, "LollyTree_Trunk", -8.0, -1.0, 0.1, 0.06, 1.6, M["stripe"], seg=8))
for k in range(10):
    a = 2 * math.pi * k / 10
    r = 0.45 + 0.2 * (k % 2)
    add(L.cyl(coll, f"LollyTree_Stick{k}", -8.0 + r * math.cos(a), -1.0 + r * math.sin(a), 1.0 + 0.2 * (k % 3), 0.008, 0.3, M["cream"], seg=4))
    add(L.cyl(coll, f"LollyTree_Head{k}", -8.0 + r * math.cos(a), -1.0 + r * math.sin(a), 1.3 + 0.2 * (k % 3), 0.07, 0.02, FILLS[k % len(FILLS)], seg=10))
cols.add("LollyTree", -8.0, -1.0, 0.0, 1.6, 1.6, 2.0)
display("lollipop", -8.0, 1.7, -1.0, 0.0, -8.0, -0.1, tag_y=1.2)
# fair treats: cotton candy machine and the candy apple tray (east)
add(L.furn(coll, "CottonMachine", 7.5, -1.5, 0.0, [(0, 0, 0.0, 1.0, 1.0, 0.85, M["machine"], 0.03), (0, 0, 0.85, 1.1, 1.1, 0.08, M["chrome"], 0.02), (0, 0, 0.93, 0.9, 0.9, 0.25, M["jar"], 0.02)]))
cols.add("CottonMachine", 7.5, -1.5, 0.0, 1.1, 1.1, 1.3)
display("cotton_candy", 7.5, 0.93, -1.5, 0.0, 7.5, -0.7, tag_y=1.35)
add(L.furn(coll, "AppleTray", 9.8, 1.0, 0.0, [(0, 0, 0.0, 1.0, 0.7, 0.85, M["cream"], 0.02), (0, 0, 0.85, 1.1, 0.8, 0.05, M["chrome"], 0.01)]))
cols.add("AppleTray", 9.8, 1.0, 0.0, 1.1, 0.8, 1.0)
for k in range(6):
    add(L.cyl(coll, f"AppleTray_Apple{k}", 9.5 + (k % 3) * 0.3, 0.8 + (k // 3) * 0.35, 0.9, 0.06, 0.12, FILLS[0], seg=8))
display("candy_apple", 9.4, 0.9, 1.3, 0.0, 9.4, 1.6, tag_y=1.3)
# counter with register and the gum rack
add(L.furn(coll, "Counter", -5.0, 3.0, 0.0, [
    (0, 0, 0.0, 3.4, 0.9, 0.95, M["pink"], 0.03),
    (0, 0, 0.95, 3.6, 1.0, 0.06, M["cream"], 0.01),
    (-1.0, -0.05, 1.01, 0.45, 0.35, 0.3, M["chrome"], 0.01),
]))
cols.add("Counter", -5.0, 3.0, 0.0, 3.6, 1.0, 1.1)
add(L.box(coll, "Awning", -5.0, 2.6, 2.6, 4.0, 1.6, 0.1, M["stripe"]))
add(L.box(coll, "Counter_SignBoard", -5.0, 2.65, 2.2, 2.2, 0.08, 0.5, M["mint"], bevel=0.03))
text("Counter_SignText", "PAY HERE", -5.0, 2.71, 2.32, 0.28, M["sign"], 0.0)
add(L.box(coll, "GumRack", -3.8, 3.0, 1.01, 0.5, 0.4, 0.5, M["cream"]))
display("bubble_gum", -3.8, 1.51, 3.0, 0.0, -3.4, 3.6, tag_y=1.25)
for i, dep in enumerate(("pickmix", "lollipops", "fair", "counter")):
    hanging_sign(dep, (0.0, -8.0, 8.5, -5.0)[i], (-2.4, -2.6, -2.8, 0.8)[i], 0.0)

bad = L.check_grounded(objs, allow=L.ALLOW_INTERIOR + ("Ceiling", "Sign_", "Brand_", "Cloud", "Shelf_", "Jar", "PickMix_", "LollyTree_", "AppleTray_Apple",
                                                      "Awning", "Counter_Sign", "GumRack", "TagPost_"))
print("CANDY grounded violations:", bad)
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
L.snapshot(sc, os.path.join(OUT, "interior_preview.png"), (0.0, 1.6, 3.6), (0.0, 1.3, -4.0), lens=14, res=(960, 640))
L.export_glb(os.path.join(OUT, "interior.colsrc.glb"), merged + cols.items)
L.write_json(os.path.join(OUT, "interior.layout.json"), {
    "version": 1, "key": KEY, "name": NAME, "spawn": [0.0, 1.6, 3.7],
    "exit": {"position": [0.0, 4.75], "radius": 1.4},
    "bounds": {"minX": X0, "maxX": X1, "minZ": Z0, "maxZ": Z1},
    "departments": dept_info, "displays": displays,
})
tris = sum(len(p.vertices) - 2 for o in merged if o.type == "MESH" for p in o.data.polygons)
print("candy interior:", len(objs), "objects ->", len(merged), "nodes,", tris, "tris,", len(cols.items), "collision boxes,", len(displays), "displays")

# ---------------------------------------------------------------- shell
W, HB = 25.07, 4.9
hd = 4.5
INTERIOR_BACK_OUTER_Z = Z0 - 0.2
WINDOWS = ((-11.0, -2.0), (2.0, 11.0))
WIN_Y = (0.9, 3.2)
sc2 = L.new_build_scene("STORE_" + KEY + "_exterior")
coll2 = bpy.data.collections.new("Exterior")
sc2.collection.children.link(coll2)
E = {
    "found": L.make_mat("EX_Foundation", "#8d8f94", 0.9, "noise", 0.03),
    "wall": L.make_mat("EX_CandyWall", "#fbe6ef", 0.85, "noise", 0.02),
    "pink": L.make_mat("EX_CandyPink", "#f7a1c4", 0.6, "noise", 0.02),
    "stripe": L.make_mat("EX_CandyStripe", "#e0534f", 0.6, "stripes", 0.02, accent="#fdf6ee"),
    "sign": L.make_mat("EX_CandySign", "#ffffff", 0.4, "noise", 0.0, emit="#fff1f7", emit_strength=1.3),
    "roof": L.make_mat("EX_RoofGravel", "#6f7076", 0.95, "noise", 0.05),
    "glass": L.make_mat("EX_Glass", "#9fd6ea", 0.1, "noise", 0.02, alpha=0.45),
    "frame": L.make_mat("EX_FrameWhite", "#f4f2ec", 0.5, "noise", 0.02),
    "metal": L.make_mat("EX_Metal", "#9aa0a8", 0.5, "noise", 0.03),
}
xo = []
cols_e = L.Collisions(coll2)
shell, interior_offset, zb = L.walk_in_shell(coll2, cols_e, W, hd, HB - 0.4, E["wall"], E["glass"],
                                             [(a, b, *WIN_Y) for a, b in WINDOWS], [], [], interior_back=INTERIOR_BACK_OUTER_Z)
xo += shell
DN = hd - zb
zc = (hd + zb) / 2
xo.append(L.box(coll2, "EX_Plinth", 0, zc, 0.0, W + 0.2, DN + 0.2, 0.19, E["found"], bevel=0.02, tile=2.0))
xo.append(L.box(coll2, "EX_Band", 0, zc, HB - 0.4, W, DN, 0.4, E["pink"], tile=1.5))
xo.append(L.box(coll2, "EX_Roof", 0, zc, HB, W + 0.3, DN + 0.3, 0.2, E["roof"], tile=3.0))
xo.append(L.box(coll2, "EX_Fascia", 0, hd + 0.04, 3.4, W, 0.08, 1.1, E["stripe"]))
xo.append(L.box(coll2, "EX_SignBoard", 0, hd + 0.08, 3.55, 7.0, 0.06, 0.85, E["pink"], bevel=0.04))
xo.append(L.text_mesh(coll2, "EX_SignText", "CANDY CLOUD", 0.0, hd + 0.14, 3.7, 0.6, 0.05, E["sign"]))
for i, (x0, x1) in enumerate(WINDOWS):
    cx = (x0 + x1) / 2
    xo.append(L.box(coll2, f"EX_WindowTop{i}", cx, hd + 0.06, WIN_Y[1] + 0.02, x1 - x0 + 0.2, 0.08, 0.12, E["frame"]))
    xo.append(L.box(coll2, f"EX_WindowSill{i}", cx, hd + 0.06, WIN_Y[0] - 0.06, x1 - x0 + 0.2, 0.12, 0.12, E["frame"]))
    for k in range(1, 3):
        xo.append(L.box(coll2, f"EX_Mullion{i}_{k}", x0 + k * (x1 - x0) / 3, hd + 0.05, WIN_Y[0], 0.06, 0.08, WIN_Y[1] - WIN_Y[0], E["frame"]))
    for k in range(6):
        xo.append(L.box(coll2, f"EX_Awning{i}_{k}", x0 + (k + 0.5) * (x1 - x0) / 6, hd + 0.5, WIN_Y[1] + 0.3, (x1 - x0) / 6, 0.9, 0.08, E["stripe"] if k % 2 == 0 else E["frame"]))
xo.append(L.hinged_door(coll2, [
    (0, 0.0, 1.18, 0.06, 2.18, E["glass"], 0.0),
    (0, 0.0, 1.18, 0.08, 0.1, E["frame"], 0.0),
    (0, 2.08, 1.18, 0.08, 0.1, E["frame"], 0.0),
    (0.45, 0.95, 0.05, 0.14, 0.05, E["metal"], 0.0),
], -0.59, hd - 0.1, 0.2))
xo.append(L.box(coll2, "EX_DoorFrame", 0, hd + 0.04, 2.4, 1.44, 0.1, 0.12, E["pink"]))
bad = L.check_grounded(xo, allow=("EX_Shell", "EX_Band", "EX_Roof", "EX_Sign", "EX_Fascia", "Door", "EX_Door", "EX_Window", "EX_Mullion", "EX_Awning"))
print("EXTERIOR grounded violations:", bad)
assert not bad, bad
L.export_glb(os.path.join(OUT, "exterior.glb"), xo)
L.export_glb(os.path.join(OUT, "exterior.colsrc.glb"), xo + cols_e.items)
L.write_json(os.path.join(OUT, "exterior.layout.json"), {
    "version": 1, "key": KEY, "name": NAME, "footprint": [W, round(DN, 3)], "footprintCenterZ": round(zc, 4), "doorLocal": [0.0, 1.25, hd],
    "interiorOffset": [round(c, 4) for c in interior_offset],
    "collision": [{"cx": 0.0, "cz": round(zc, 4), "hx": W / 2 + 0.2, "hz": round(DN / 2 + 0.2, 4), "hy": HB / 2}],
})
L.snapshot(sc2, os.path.join(OUT, "preview.png"), (-14, 5, hd + 16), (0, 2.5, -3), lens=28, res=(768, 512))
print("candy exterior:", len(xo), "objects, interiorOffset", interior_offset, "depth", round(DN, 3))
