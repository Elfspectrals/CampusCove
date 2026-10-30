"""Summit Sports: the mall's sportswear store, on two merged Al Fresca cells (docs/MALL.md). Same layout contract as
Cove Threads (v2: counter, clerk, departments, displays, outfits, mirror), read by useClothingStore: the three tops
and three bottoms added to front/scripts/skins/wear.py hang on rails, two dressed mannequins stand on a podium.

Outputs out/store/summit_sports/{interior,exterior}.glb, *.colsrc.glb, *.layout.json, preview.png.
Then build_house_lightmaps.py -- store summit_sports, npm run assets:optimize -- store.
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

KEY = "summit_sports"
NAME = "Summit Sports"
OUT = os.path.join(L.OUT_ROOT, "store", KEY)
H = 4.2
X0, X1, Z0, Z1 = -15.1, 15.1, -3.5, 5.0
BODY_SCALE = 0.936
BODY_LIFT = 0.009
RAIL_Y = 1.95
TAG_Y = 0.72
DEPARTMENTS = {"top": "PERFORMANCE TOPS", "bottom": "TRAINING BOTTOMS"}
ITEMS = {"top": ["track_jacket", "jersey", "sports_bra"], "bottom": ["track_pants", "basketball_shorts", "leggings"]}
PIECE_TOP = {"top": 1.707, "bottom": 1.05}
OUTFITS = [
    [("hair", "short"), ("top", "track_jacket"), ("bottom", "track_pants"), ("shoes", "runners")],
    [("hair", "buzz"), ("top", "jersey"), ("bottom", "basketball_shorts"), ("shoes", "high_tops")],
]
rng = random.Random(71)


def root_y_for_top(top_in_body, world_top):
    return round(world_top - top_in_body * BODY_SCALE - BODY_LIFT, 3)


sc = L.new_build_scene("STORE_" + KEY + "_interior")
coll = bpy.data.collections.new("Interior")
sc.collection.children.link(coll)
cols = L.Collisions(coll)
M = L.std_mats(wall="#f2f2ef", floor=("#2f3338", "noise", "#262a2e"))
M["yellow"] = L.make_mat("IN_SummitYellow", "#f0b429", 0.6, "noise", 0.02)
M["black"] = L.make_mat("IN_SummitBlack", "#1b1d22", 0.6, "noise", 0.01)
M["white"] = L.make_mat("IN_SummitWhite", "#fbfaf8", 0.5, "noise", 0.01)
M["chrome"] = L.make_mat("IN_SummitChrome", "#d9dde2", 0.15, "noise", 0.02)
M["sign"] = L.make_mat("IN_SummitSign", "#ffffff", 0.4, "noise", 0.0, emit="#ffffff", emit_strength=1.0)
M["lightbox"] = L.make_mat("IN_SummitLightbox", "#fdfcf8", 0.4, "noise", 0.0, emit="#fffaf0", emit_strength=0.8)
M["line"] = L.make_mat("IN_SummitLine", "#f0b429", 0.7, "noise", 0.0, emit="#f0b429", emit_strength=0.3)
M["rubber"] = L.make_mat("IN_SummitRubber", "#3a3f47", 0.9, "noise", 0.03)
M["form"] = L.make_mat("IN_SummitForm", "#f2efe9", 0.4, "noise", 0.01)
M["mat_blue"] = L.make_mat("IN_SummitMatBlue", "#1f5fae", 0.9, "noise", 0.03)
M["mat_red"] = L.make_mat("IN_SummitMatRed", "#e0534f", 0.9, "noise", 0.03)
M["ball"] = L.make_mat("IN_SummitBall", "#f28c28", 0.7, "noise", 0.04, accent="#1b1d22")
STACK_COLORS = ("#1f2a5a", "#f0b429", "#2fa17a", "#e0534f", "#f2f0ea", "#2a2c33", "#b73cc9", "#38a3c9")
STACK = [L.make_mat(f"IN_SummitStack{i}", c, 0.9, "stripes", 0.03, accent=c) for i, c in enumerate(STACK_COLORS)]
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


def tag_at(gx, gz, yaw, y=TAG_Y):
    return {"position": [round(gx, 3), y, round(gz, 3)], "yaw": round(yaw, 4)}


def dept_board(slot, gx, gz):
    add(L.box(coll, f"Sign_{slot}_Board", gx, gz, 3.0, 3.0, 0.06, 0.55, M["black"]))
    text(f"Sign_{slot}_Text", DEPARTMENTS[slot], gx, gz + 0.04, 3.14, 0.3, M["sign"], 0.0)
    dept_info.append({"id": slot, "label": DEPARTMENTS[slot], "sign": [round(gx, 3), 3.3, round(gz, 3)]})


def hanging_rail(slot, x_start, z_wall):
    keys = ITEMS[slot]
    z = z_wall + 0.42
    x_end = x_start + 1.25 * (len(keys) - 1)
    for sx_ in (x_start - 0.75, x_end + 0.75):
        add(L.box(coll, f"Rail_{slot}_Bracket{int(sx_ * 10)}", sx_, z_wall + 0.25, RAIL_Y + 0.02, 0.04, 0.5, 0.04, M["chrome"]))
    add(L.box(coll, f"Rail_{slot}_Bar", (x_start + x_end) / 2, z, RAIL_Y, x_end - x_start + 1.6, 0.03, 0.03, M["chrome"]))
    add(L.box(coll, f"Rail_{slot}_Light", (x_start + x_end) / 2, z_wall + 0.03, 0.0, x_end - x_start + 1.8, 0.05, 2.7, M["lightbox"]))
    dept_board(slot, (x_start + x_end) / 2, z_wall + 0.06)
    for i, key in enumerate(keys):
        gx = x_start + i * 1.25
        add(L.box(coll, f"Hanger_{slot}_{key}", gx, z, RAIL_Y - 0.06, 0.03, 0.03, 0.09, M["chrome"]))
        y = root_y_for_top(PIECE_TOP[slot], RAIL_Y - 0.08)
        displays.append({"slot": slot, "key": key, "department": slot,
                         "position": [round(gx, 3), y, round(z, 3)], "yaw": 0.0,
                         "center": [round(gx, 3), round(RAIL_Y - 0.45, 3), round(z, 3)],
                         "tag": tag_at(gx, z_wall + 0.1, 0.0)})
    cols.add(f"Rail_{slot}", (x_start + x_end) / 2, z_wall + 0.45, 0.0, x_end - x_start + 1.8, 0.9, 2.2)


def fold_table(name, gx, gz, w, d):
    add(L.box(coll, f"{name}_Top", gx, gz, 0.86, w, d, 0.04, M["white"], bevel=0.01))
    add(L.box(coll, f"{name}_Body", gx, gz, 0.0, w - 0.3, d - 0.3, 0.86, M["black"]))
    n = max(1, int(w / 0.42))
    for i in range(n):
        for r in range(2):
            add(L.box(coll, f"{name}_Stack{i}_{r}", gx - w / 2 + (i + 0.5) * w / n, gz - d / 4 + r * d / 2, 0.9, 0.36, d / 2 - 0.1, 0.14 + 0.05 * ((i + r) % 3), STACK[(i + r * 3) % len(STACK)]))
    cols.add(name, gx, gz, 0.0, w, d, 1.1)


# ---------------------------------------------------------------- shell
rect("House_Floor_Summit", X0 - 0.2, Z0 - 0.2, X1 + 0.2, Z1 + 0.2, -0.1, 0.1, M["floor"], tile=3.0)
rect("Ceiling", X0 - 0.2, Z0 - 0.2, X1 + 0.2, Z1 + 0.3, H, 0.15, M["ceil"], tile=3.0)
win = (0.9, 3.2)
objs += L.wall(coll, "Walls_Front", "x", Z1 + 0.1, 0.2, X0 - 0.2, X1 + 0.2, H, M["wall"],
               openings=[(-14.0, -2.0, *win), (-0.6, 0.6, 0.0, 2.2), (2.0, 14.0, *win)], cols=cols, glass=M["glass"], col_tag="Wall_Front")
objs += L.wall(coll, "Walls_Back", "x", Z0 - 0.1, 0.2, X0 - 0.2, X1 + 0.2, H, M["black"], cols=cols, col_tag="Wall_Back")
objs += L.wall(coll, "Walls_W", "z", X0 - 0.1, 0.2, Z0, Z1 + 0.2, H, M["wall"], cols=cols, col_tag="Wall_W")
objs += L.wall(coll, "Walls_E", "z", X1 + 0.1, 0.2, Z0, Z1 + 0.2, H, M["wall"], cols=cols, col_tag="Wall_E")
add(L.box(coll, "Door_Entrance", 0, 5.1, 0.01, 1.18, 0.06, 2.18, M["glass"], bevel=0.02))
add(L.box(coll, "Door_Entrance_Frame", 0, 5.06, 2.2, 1.4, 0.1, 0.12, M["yellow"]))
add(L.box(coll, "Entry_Doormat", 0, 4.4, 0.0, 2.0, 1.0, 0.012, M["mat"]))
add(L.box(coll, "Sky_Front", 0, 16, -3.0, 60, 0.05, 12.0, M["sky"]))
# running-track lines on the floor and the mountain logo on the back wall
for i, gz in enumerate((-1.5, 0.0, 1.5)):
    rect(f"Line_{i}", X0 + 1.0, gz - 0.04, X1 - 1.0, gz + 0.04, 0.0, 0.006, M["line"])
add(L.cone(coll, "Logo_Mountain", 0.0, Z0 + 0.12, 2.4, 0.9, 0.0, 1.2, M["yellow"], seg=3))
text("Brand_Text", "SUMMIT", 0.0, Z0 + 0.1, 1.9, 0.6, M["sign"], 0.0)
text("Brand_Tag", "train higher", 0.0, Z0 + 0.1, 1.55, 0.26, M["yellow"], 0.0)
li = 0
for gx in (-12.0, -6.0, 0.0, 6.0, 12.0):
    for gz in (-2.5, 1.2, 3.8):
        add(L.box(coll, f"Light_{li:02d}", gx, gz, H - 0.07, 1.8, 0.4, 0.07, M["lamp"]))
        li += 1

# ---------------------------------------------------------------- rails, tables, props
hanging_rail("top", -12.0, Z0)
hanging_rail("bottom", 8.5, Z0)
fold_table("FoldTable_W", -6.0, 0.5, 3.0, 1.2)
fold_table("FoldTable_E", 6.0, 0.5, 3.0, 1.2)
# dumbbell rack, yoga mats and a treadmill as props, a basketball hoop on the east wall
add(L.box(coll, "DumbRack_Frame", -13.5, 2.0, 0.0, 1.0, 2.2, 0.9, M["rubber"]))
for i in range(6):
    gz = 1.1 + i * 0.36
    add(L.cyl(coll, f"Dumb{i}_Bar", -13.5, gz, 0.92, 0.015, 0.4, M["chrome"], seg=6))
    add(L.cyl(coll, f"Dumb{i}_A", -13.75, gz, 0.9, 0.07 + 0.01 * (i % 3), 0.08, M["rubber"], seg=8))
    add(L.cyl(coll, f"Dumb{i}_B", -13.25, gz, 0.9, 0.07 + 0.01 * (i % 3), 0.08, M["rubber"], seg=8))
cols.add("DumbRack", -13.5, 2.0, 0.0, 1.0, 2.3, 1.1)
for i in range(5):
    add(L.cyl(coll, f"YogaMat{i}", -11.0 + i * 0.25, 3.8, 0.0, 0.1, 0.6 + 0.05 * (i % 2), M["mat_blue"] if i % 2 else M["mat_red"], seg=8))
cols.add("YogaMats", -10.5, 3.8, 0.0, 1.5, 0.4, 0.7)
add(L.furn(coll, "Treadmill", 12.5, 2.0, -math.pi / 2, [(0, 0, 0.0, 0.8, 1.8, 0.18, M["rubber"], 0.02), (0, 0, 0.18, 0.6, 1.6, 0.03, M["black"]), (0, -0.8, 0.18, 0.7, 0.1, 1.2, M["chrome"]), (0, -0.85, 1.3, 0.7, 0.2, 0.25, M["lightbox"], 0.02)]))
cols.add("Treadmill", 12.5, 2.0, 0.0, 1.9, 0.9, 1.6)
add(L.box(coll, "Hoop_Board", X1 - 0.1, 0.0, 2.6, 0.06, 1.2, 0.9, M["white"]))
add(L.box(coll, "Hoop_Square", X1 - 0.12, 0.0, 2.75, 0.02, 0.5, 0.4, M["yellow"]))
add(L.cyl(coll, "Hoop_Ring", X1 - 0.4, 0.0, 2.75, 0.23, 0.03, M["ball"], seg=12))
add(L.cyl(coll, "Hoop_Ball", X1 - 0.6, 1.0, 0.0, 0.12, 0.24, M["ball"], seg=10))
cols.add("Hoop_Ball", X1 - 0.6, 1.0, 0.0, 0.3, 0.3, 0.3)
MIRROR = {"position": [round(X0 + 0.09, 3), 1.27, -1.0], "yaw": round(math.pi / 2, 4), "size": [1.4, 2.2]}
add(L.box(coll, "Mirror_Frame", X0 + 0.04, -1.0, 0.1, 0.06, 1.6, 2.4, M["black"], bevel=0.02))
add(L.box(coll, "Mirror_Base", X0 + 0.15, -1.0, 0.0, 0.25, 1.7, 0.1, M["black"]))
# podium with the two dressed mannequins
PLAT = (0.0, -0.3)
add(L.cyl(coll, "Mannequin_Platform", PLAT[0], PLAT[1], 0.0, 1.8, 0.14, M["white"], seg=24))
add(L.cyl(coll, "Mannequin_PlatformEdge", PLAT[0], PLAT[1], 0.14, 1.8, 0.02, M["yellow"], seg=24))
cols.add("Mannequin_Platform", PLAT[0], PLAT[1], 0.0, 3.4, 2.2, 1.9)
outfits = []
for i, pieces in enumerate(OUTFITS):
    gx = PLAT[0] - 0.8 + i * 1.6
    gz = PLAT[1] - 0.2
    outfits.append({"pieces": [{"slot": s, "key": k} for s, k in pieces],
                    "position": [round(gx, 3), 0.14, round(gz, 3)], "yaw": round(0.12 - i * 0.24, 4),
                    "center": [round(gx, 3), 1.1, round(gz, 3)],
                    "tag": tag_at(gx, gz + 0.75, 0.0, y=0.4)})
    add(L.cyl(coll, f"Mannequin_TagPost{i}", gx, gz + 0.75, 0.14, 0.02, 0.18, M["chrome"], seg=6))
add(L.box(coll, "Podium_Board", PLAT[0], PLAT[1] - 2.4, 3.0, 3.0, 0.06, 0.55, M["black"]))
text("Podium_Text", "TEAM LOOKS", PLAT[0], PLAT[1] - 2.36, 3.14, 0.3, M["sign"], 0.0)
counter_x, counter_z = 10.0, 3.2
add(L.furn(coll, "Counter", counter_x, counter_z, 0.0, [
    (0, 0, 0.0, 3.6, 0.9, 1.0, M["black"], 0.02),
    (0, 0, 1.0, 3.8, 1.0, 0.06, M["yellow"], 0.01),
    (-1.1, -0.1, 1.06, 0.45, 0.35, 0.3, M["chrome"], 0.01),
]))
cols.add("Counter", counter_x, counter_z, 0.0, 3.8, 1.0, 1.1)
add(L.box(coll, "Counter_SignBoard", counter_x, counter_z - 0.3, 2.5, 2.2, 0.06, 0.55, M["yellow"]))
text("Counter_SignText", "CHECKOUT", counter_x, counter_z - 0.26, 2.62, 0.3, M["black"], 0.0)
CLERK = {"position": [round(counter_x - 1.1, 3), 0.0, round(counter_z - 0.95, 3)], "yaw": 0.0}

bad = L.check_grounded(objs, allow=L.ALLOW_INTERIOR + ("Ceiling", "Line_", "Logo_", "Brand_", "Sign_", "Rail_", "Hanger_", "FoldTable_", "Dumb", "Hoop_Board",
                                                      "Hoop_Square", "Hoop_Ring", "Mirror_Frame", "Mannequin_", "Podium_", "Counter_Sign", "YogaMat"))
print("SUMMIT grounded violations:", bad)
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
    "version": 2, "key": KEY, "name": NAME, "spawn": [0.0, 1.6, 3.7],
    "exit": {"position": [0.0, 4.75], "radius": 1.4},
    "bounds": {"minX": X0, "maxX": X1, "minZ": Z0, "maxZ": Z1},
    "counter": [counter_x, 1.15, counter_z + 1.1], "clerk": CLERK,
    "departments": dept_info, "displays": displays, "outfits": outfits, "mirror": MIRROR,
})
tris = sum(len(p.vertices) - 2 for o in merged if o.type == "MESH" for p in o.data.polygons)
print("summit interior:", len(objs), "objects ->", len(merged), "nodes,", tris, "tris,", len(cols.items), "collision boxes,", len(displays), "displays,", len(outfits), "outfits")

# ---------------------------------------------------------------- shell
W, HB = 31.27, 4.9
hd = 4.5
INTERIOR_BACK_OUTER_Z = Z0 - 0.2
WINDOWS = ((-14.0, -2.0), (2.0, 14.0))
WIN_Y = (0.9, 3.2)
sc2 = L.new_build_scene("STORE_" + KEY + "_exterior")
coll2 = bpy.data.collections.new("Exterior")
sc2.collection.children.link(coll2)
E = {
    "found": L.make_mat("EX_Foundation", "#8d8f94", 0.9, "noise", 0.03),
    "wall": L.make_mat("EX_SummitWall", "#f1f1ec", 0.85, "noise", 0.02),
    "black": L.make_mat("EX_SummitBlack", "#1b1d22", 0.6, "noise", 0.01),
    "yellow": L.make_mat("EX_SummitYellow", "#f0b429", 0.6, "noise", 0.02),
    "sign": L.make_mat("EX_SummitSign", "#ffffff", 0.4, "noise", 0.0, emit="#ffffff", emit_strength=1.3),
    "roof": L.make_mat("EX_RoofGravel", "#6f7076", 0.95, "noise", 0.05),
    "glass": L.make_mat("EX_Glass", "#9fd6ea", 0.1, "noise", 0.02, alpha=0.45),
    "frame": L.make_mat("EX_FrameDark", "#2a2e35", 0.4, "noise", 0.02),
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
xo.append(L.box(coll2, "EX_Band", 0, zc, HB - 0.4, W, DN, 0.4, E["black"], tile=1.5))
xo.append(L.box(coll2, "EX_Roof", 0, zc, HB, W + 0.3, DN + 0.3, 0.2, E["roof"], tile=3.0))
xo.append(L.box(coll2, "EX_Fascia", 0, hd + 0.04, 3.4, W, 0.08, 1.1, E["black"]))
xo.append(L.box(coll2, "EX_FasciaLine", 0, hd + 0.06, 3.4, W, 0.06, 0.1, E["yellow"]))
xo.append(L.cone(coll2, "EX_Logo", -6.0, hd + 0.12, 3.6, 0.5, 0.0, 0.75, E["yellow"], seg=3))
xo.append(L.text_mesh(coll2, "EX_SignText", "SUMMIT SPORTS", 1.0, hd + 0.1, 3.7, 0.65, 0.05, E["sign"]))
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
xo.append(L.box(coll2, "EX_DoorFrame", 0, hd + 0.04, 2.4, 1.44, 0.1, 0.12, E["yellow"]))
bad = L.check_grounded(xo, allow=("EX_Shell", "EX_Band", "EX_Roof", "EX_Sign", "EX_Fascia", "EX_Logo", "Door", "EX_Door", "EX_Window", "EX_Mullion"))
print("EXTERIOR grounded violations:", bad)
assert not bad, bad
L.export_glb(os.path.join(OUT, "exterior.glb"), xo)
L.export_glb(os.path.join(OUT, "exterior.colsrc.glb"), xo + cols_e.items)
L.write_json(os.path.join(OUT, "exterior.layout.json"), {
    "version": 1, "key": KEY, "name": NAME, "footprint": [W, round(DN, 3)], "footprintCenterZ": round(zc, 4), "doorLocal": [0.0, 1.25, hd],
    "interiorOffset": [round(c, 4) for c in interior_offset],
    "collision": [{"cx": 0.0, "cz": round(zc, 4), "hx": W / 2 + 0.2, "hz": round(DN / 2 + 0.2, 4), "hy": HB / 2}],
})
L.snapshot(sc2, os.path.join(OUT, "preview.png"), (-16, 5, hd + 18), (0, 2.5, -3), lens=28, res=(768, 512))
print("summit exterior:", len(xo), "objects, interiorOffset", interior_offset, "depth", round(DN, 3))
