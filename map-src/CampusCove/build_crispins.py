"""Crispin's Hardware: the mall's hardware store, in its North Plaza cell (docs/MALL.md). Cove Home layout contract
(departments + displays with a price tag), read by useFurnitureStore with decor/<key>/model.glb: the six pieces of
build_hardware_items.py are on display among pegboard walls, orange racks, a paint corner and a lumber rack.

Reads out/decor/hardware.manifest.json. Outputs out/store/crispins_hardware/{interior,exterior}.glb, *.colsrc.glb,
*.layout.json, preview.png. Then build_house_lightmaps.py -- store crispins_hardware, npm run assets:optimize -- store.
"""
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

KEY = "crispins_hardware"
NAME = "Crispin's Hardware"
OUT = os.path.join(L.OUT_ROOT, "store", KEY)
H = 4.2
X0, X1, Z0, Z1 = -7.8, 7.8, -5.8, 5.0
rng = random.Random(53)
manifest = json.load(open(os.path.join(L.OUT_ROOT, "decor", "hardware.manifest.json"), encoding="utf-8"))
ITEMS = {
    "workbench": ("tools", "Solid workbench with a vice and a tool rail.", (-6.3, -1.5), math.pi / 2),
    "stepladder": ("tools", "Aluminium stepladder with a safety platform.", (-6.5, -4.4), math.pi / 2),
    "toolbox": ("tools", "Red steel toolbox, latches included.", (-2.5, -1.0), 0.0),
    "paint_cans": ("paint", "Pallet of paint cans in four colours.", (1.5, -4.5), 0.0),
    "wheelbarrow": ("garden", "Green garden wheelbarrow on a rubber wheel.", (5.8, -1.6), -math.pi / 2),
    "metal_shelving": ("storage", "Orange warehouse shelving, boxes included.", (5.6, -5.2), 0.0),
}
DEPARTMENTS = {
    "tools": ("TOOLS", "#e07a2e"),
    "paint": ("PAINT", "#1f5fae"),
    "garden": ("GARDEN", "#3c7a3c"),
    "storage": ("STORAGE", "#5d6670"),
}

sc = L.new_build_scene("STORE_" + KEY + "_interior")
coll = bpy.data.collections.new("Interior")
sc.collection.children.link(coll)
cols = L.Collisions(coll)
M = L.std_mats(wall="#e9dcc4", floor=("#a9a7a0", "noise", "#9a9892"))
M["peg"] = L.make_mat("IN_HwPegboard", "#d9c7a4", 0.9, "tiles", 0.03, accent="#c9b58f")
M["orange"] = L.make_mat("IN_HwOrange", "#e07a2e", 0.6, "noise", 0.02)
M["dark"] = L.make_mat("IN_HwDark", "#2f3338", 0.55, "noise", 0.03)
M["rack"] = L.make_mat("IN_HwRack", "#9aa0a8", 0.45, "noise", 0.03)
M["carton"] = L.make_mat("IN_Carton", "#b98c5a", 0.9, "stripes", 0.04, accent="#a47a4c")
M["sign"] = L.make_mat("IN_HwSign", "#ffffff", 0.4, "noise", 0.0, emit="#ffffff", emit_strength=1.0)
M["counter"] = L.make_mat("IN_HwCounter", "#4a4f57", 0.5, "noise", 0.03)
M["lumber"] = L.make_mat("IN_HwLumber", "#d8b78a", 0.8, "planks", 0.05, accent="#c49c6c")
M["plinth"] = L.make_mat("IN_HwPlinth", "#f2efe8", 0.6, "noise", 0.01)
M["tag"] = L.make_mat("IN_HwTagPost", "#4a4f57", 0.5, "noise", 0.02)
CHIPS = [L.make_mat(f"IN_HwChip{i}", c, 0.6, "noise", 0.02) for i, c in enumerate(("#e0533d", "#f6d04d", "#3f7f8c", "#79b765", "#1f5fae", "#a985e0", "#f2a65a", "#f7f4ec", "#2f6f63", "#f07fa8"))]
TOOLS = [L.make_mat(f"IN_HwTool{i}", c, 0.5, "noise", 0.03) for i, c in enumerate(("#e07a2e", "#2f3338", "#9aa0a8", "#1f5fae", "#f6d04d"))]
DM = {dep: L.make_mat(f"IN_HwDept_{dep}", c, 0.8, "noise", 0.02) for dep, (_, c) in DEPARTMENTS.items()}
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
    add(L.box(coll, f"Sign_{dep}_Board", gx, gz, 3.0, 2.4, 0.08, 0.55, DM[dep], rot=yaw))
    text(f"Sign_{dep}_Text", label, gx + fx * 0.06, gz + fz * 0.06, 3.12, 0.3, M["sign"], yaw)
    text(f"Sign_{dep}_TextB", label, gx - fx * 0.06, gz - fz * 0.06, 3.12, 0.3, M["sign"], yaw + math.pi)
    for o_ in (-0.9, 0.9):
        add(L.cyl(coll, f"Sign_{dep}_Wire{int(o_ * 10)}", gx + o_ * math.cos(yaw), gz - o_ * math.sin(yaw), 3.55, 0.01, H - 3.55, M["metal"], seg=4))
    dept_info.append({"id": dep, "label": label, "color": DEPARTMENTS[dep][1], "sign": [round(gx, 3), 3.3, round(gz, 3)]})


def rack(name, gx, gz, length, along_x, levels=3):
    sx, sz = (length, 0.9) if along_x else (0.9, length)
    for px in (-length / 2 + 0.05, length / 2 - 0.05):
        for pz in (-0.4, 0.4):
            ox, oz = (gx + px, gz + pz) if along_x else (gx + pz, gz + px)
            add(L.box(coll, f"{name}_Post{int(px * 10)}{int(pz * 10)}", ox, oz, 0.0, 0.06, 0.06, 2.4, M["orange"]))
    for lv in range(levels):
        y = 0.15 + lv * 0.75
        add(L.box(coll, f"{name}_Shelf{lv}", gx, gz, y, sx, sz, 0.04, M["rack"]))
        n = int(length / 0.6)
        for i in range(n):
            off = -length / 2 + (i + 0.5) * length / n
            ox, oz = (gx + off, gz) if along_x else (gx, gz + off)
            if (i + lv) % 3 == 0:
                add(L.box(coll, f"{name}_Box{lv}_{i}", ox, oz, y + 0.04, 0.45 if along_x else 0.7, 0.7 if along_x else 0.45, 0.35 + 0.1 * (i % 2), M["carton"]))
            else:
                add(L.cyl(coll, f"{name}_Can{lv}_{i}", ox, oz, y + 0.04, 0.12, 0.3, TOOLS[(i + lv) % len(TOOLS)], seg=8))
    cols.add(name, gx, gz, 0.0, sx + 0.1, sz + 0.1, 2.4)


# ---------------------------------------------------------------- shell
rect("House_Floor_Crispins", X0 - 0.2, Z0 - 0.2, X1 + 0.2, Z1 + 0.2, -0.1, 0.1, M["floor"], tile=3.0)
rect("Ceiling", X0 - 0.2, Z0 - 0.2, X1 + 0.2, Z1 + 0.3, H, 0.15, M["ceil"], tile=3.0)
win = (0.9, 3.2)
objs += L.wall(coll, "Walls_Front", "x", Z1 + 0.1, 0.2, X0 - 0.2, X1 + 0.2, H, M["wall"],
               openings=[(-6.8, -2.0, *win), (-0.6, 0.6, 0.0, 2.2), (2.0, 6.8, *win)], cols=cols, glass=M["glass"], col_tag="Wall_Front")
objs += L.wall(coll, "Walls_Back", "x", Z0 - 0.1, 0.2, X0 - 0.2, X1 + 0.2, H, M["peg"], cols=cols, col_tag="Wall_Back")
objs += L.wall(coll, "Walls_W", "z", X0 - 0.1, 0.2, Z0, Z1 + 0.2, H, M["peg"], cols=cols, col_tag="Wall_W")
objs += L.wall(coll, "Walls_E", "z", X1 + 0.1, 0.2, Z0, Z1 + 0.2, H, M["peg"], cols=cols, col_tag="Wall_E")
add(L.box(coll, "Door_Entrance", 0, 5.1, 0.01, 1.18, 0.06, 2.18, M["glass"], bevel=0.02))
add(L.box(coll, "Door_Entrance_Frame", 0, 5.06, 2.2, 1.4, 0.1, 0.12, M["orange"]))
add(L.box(coll, "Entry_Doormat", 0, 4.4, 0.0, 2.0, 1.0, 0.012, M["mat"]))
add(L.box(coll, "Sky_Front", 0, 16, -3.0, 40, 0.05, 12.0, M["sky"]))
for nm, a, b2, axis, fixed in [("N", X0, X1, "x", Z0 + 0.03), ("W", Z0, Z1, "z", X0 + 0.03), ("E", Z0, Z1, "z", X1 - 0.03)]:
    if axis == "x":
        add(L.box(coll, f"Wall_Band{nm}", (a + b2) / 2, fixed, 2.9, b2 - a, 0.04, 0.4, M["orange"]))
    else:
        add(L.box(coll, f"Wall_Band{nm}", fixed, (a + b2) / 2, 2.9, 0.04, b2 - a, 0.4, M["orange"]))
text("Brand_Text", "CRISPIN'S", 0.0, Z0 + 0.1, 3.45, 0.55, M["sign"], 0.0)
text("Brand_Tag", "tools · paint · garden", 0.0, Z0 + 0.1, 3.1, 0.26, M["sign"], 0.0)
li = 0
for gx in (-5.0, 0.0, 5.0):
    for gz in (-4.0, -0.5, 3.0):
        add(L.box(coll, f"Light_{li:02d}", gx, gz, H - 0.07, 1.8, 0.4, 0.07, M["lamp"]))
        li += 1
# pegboard tools along the west wall (hanging), a lumber rack on the east wall, paint chips on the back wall
for i in range(14):
    gz = -5.2 + i * 0.7
    add(L.box(coll, f"Peg_Tool{i}", X0 + 0.08, gz, 1.5 + 0.2 * (i % 3), 0.06, 0.08 + 0.04 * (i % 2), 0.3 + 0.1 * (i % 3), TOOLS[i % len(TOOLS)]))
for lv, y in enumerate((0.5, 1.3, 2.1)):
    add(L.box(coll, f"Lumber_Bracket{lv}", X1 - 0.3, 2.5, y, 0.6, 2.4, 0.05, M["dark"]))
    for k in range(5):
        add(L.box(coll, f"Lumber_Plank{lv}_{k}", X1 - 0.3, 1.5 + k * 0.5, y + 0.05, 0.1 + 0.05 * (k % 2), 2.6 - 0.2 * (k % 3), 0.1, M["lumber"]))
cols.add("Lumber_Rack", X1 - 0.3, 2.5, 0.0, 0.7, 2.8, 2.4)
for k in range(40):
    add(L.box(coll, f"Chip{k}", -3.4 + (k % 10) * 0.22, Z0 + 0.06, 1.2 + (k // 10) * 0.24, 0.18, 0.02, 0.2, CHIPS[k % len(CHIPS)]))
add(L.box(coll, "Chip_Board", -2.4, Z0 + 0.04, 1.1, 2.4, 0.02, 1.1, M["plinth"]))
# central gondola and two side racks
rack("Rack_Mid", 0.0, -1.5, 5.0, False)
rack("Rack_Back", -1.5, Z0 + 0.6, 4.0, True, levels=2)
# checkout and key-cutting kiosk by the door
add(L.furn(coll, "Counter", 4.5, 2.5, 0.0, [
    (0, 0, 0.0, 3.0, 1.0, 0.95, M["counter"], 0.02),
    (0, 0, 0.95, 3.2, 1.1, 0.06, M["plinth"], 0.01),
    (-0.9, -0.05, 1.01, 0.45, 0.35, 0.3, M["dark"], 0.01),
]))
cols.add("Counter", 4.5, 2.5, 0.0, 3.2, 1.1, 1.1)
add(L.box(coll, "Counter_SignBoard", 4.5, 2.2, 2.5, 2.0, 0.08, 0.55, M["orange"]))
text("Counter_SignText", "PAY HERE", 4.5, 2.26, 2.62, 0.3, M["sign"], 0.0)
add(L.furn(coll, "KeyKiosk", -5.0, 3.0, 0.0, [(0, 0, 0.0, 1.2, 0.8, 1.0, M["dark"], 0.02), (0, -0.1, 1.0, 0.8, 0.5, 0.6, M["rack"], 0.02), (0, 0.35, 1.0, 1.0, 0.1, 0.8, M["plinth"], 0.01)]))
cols.add("KeyKiosk", -5.0, 3.0, 0.0, 1.3, 0.9, 1.7)
text("KeyKiosk_Text", "KEYS CUT", -5.0, 3.41, 1.3, 0.22, M["dark"], 0.0)
for i, dep in enumerate(("tools", "paint", "garden", "storage")):
    hanging_sign(dep, (-5.5, 0.0, 5.5, 3.0)[i], (-1.0, -3.5, -1.0, -4.5)[i], 0.0 if i != 3 else -math.pi / 2)

# ---------------------------------------------------------------- the six pieces on display
for key, (dep, blurb, (gx, gz), yaw) in ITEMS.items():
    w_, h_, d_ = manifest[key]
    y0 = 0.0
    if key == "toolbox":
        y0 = 0.9
        add(L.box(coll, "Plinth_toolbox", gx, gz, 0.0, 0.9, 0.7, 0.9, M["plinth"], bevel=0.02))
        cols.add("Plinth_toolbox", gx, gz, 0.0, 0.9, 0.7, 0.9)
    side = max(w_, d_)
    cols.add(f"Item_{key}", gx, gz, y0, side if yaw in (0.0, math.pi) else d_, d_ if yaw in (0.0, math.pi) else w_, h_)
    fx, fz = math.sin(yaw), math.cos(yaw)
    tx, tz = gx + fx * (side / 2 + 0.45), gz + fz * (side / 2 + 0.45)
    add(L.cyl(coll, f"TagPost_{key}", tx, tz, 0.0, 0.025, 1.05, M["tag"], seg=6))
    add(L.cyl(coll, f"TagFoot_{key}", tx, tz, 0.0, 0.16, 0.03, M["tag"], seg=10))
    displays.append({"key": key, "code": "decor_" + key, "department": dep, "description": blurb,
                     "position": [round(gx, 3), y0, round(gz, 3)], "yaw": round(yaw, 4), "size": [w_, h_, d_],
                     "tag": {"position": [round(tx, 3), 1.32, round(tz, 3)], "yaw": round(yaw, 4)}})

bad = L.check_grounded(objs, allow=L.ALLOW_INTERIOR + ("Ceiling", "Sign_", "Brand_", "Wall_Band", "Peg_", "Lumber_", "Chip", "Rack_", "Counter_Sign",
                                                      "KeyKiosk_Text", "TagPost_", "TagFoot_", "Plinth_"))
print("CRISPINS grounded violations:", bad)
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
L.snapshot(sc, os.path.join(OUT, "interior_preview.png"), (0.0, 1.6, 3.6), (0.0, 1.3, -6.0), lens=16, res=(960, 640))
L.export_glb(os.path.join(OUT, "interior.colsrc.glb"), merged + cols.items)
L.write_json(os.path.join(OUT, "interior.layout.json"), {
    "version": 1, "key": KEY, "name": NAME, "spawn": [0.0, 1.6, 3.7],
    "exit": {"position": [0.0, 4.75], "radius": 1.4},
    "bounds": {"minX": X0, "maxX": X1, "minZ": Z0, "maxZ": Z1},
    "departments": dept_info, "displays": displays,
    "counter": [4.5, 1.15, 1.5],
    "clerk": {"position": [4.5, 0.0, 3.6], "yaw": round(math.pi, 4)},
})
tris = sum(len(p.vertices) - 2 for o in merged if o.type == "MESH" for p in o.data.polygons)
print("crispins interior:", len(objs), "objects ->", len(merged), "nodes,", tris, "tris,", len(cols.items), "collision boxes,", len(displays), "displays")

# ---------------------------------------------------------------- shell (flush with the mall cell fronts)
W, HB = 16.6, 4.9
hd = 4.5
INTERIOR_BACK_OUTER_Z = Z0 - 0.2
WINDOWS = ((-6.8, -2.0), (2.0, 6.8))
WIN_Y = (0.9, 3.2)
sc2 = L.new_build_scene("STORE_" + KEY + "_exterior")
coll2 = bpy.data.collections.new("Exterior")
sc2.collection.children.link(coll2)
E = {
    "found": L.make_mat("EX_Foundation", "#8d8f94", 0.9, "noise", 0.03),
    "wall": L.make_mat("EX_HwWall", "#e2d5bd", 0.85, "noise", 0.03),
    "orange": L.make_mat("EX_HwOrange", "#e07a2e", 0.6, "noise", 0.02),
    "dark": L.make_mat("EX_HwDark", "#2f3338", 0.55, "noise", 0.03),
    "sign": L.make_mat("EX_HwSign", "#ffffff", 0.4, "noise", 0.0, emit="#ffffff", emit_strength=1.3),
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
xo.append(L.box(coll2, "EX_Band", 0, zc, HB - 0.4, W, DN, 0.4, E["dark"], tile=1.5))
xo.append(L.box(coll2, "EX_Roof", 0, zc, HB, W + 0.3, DN + 0.3, 0.2, E["roof"], tile=3.0))
xo.append(L.box(coll2, "EX_Fascia", 0, hd + 0.04, 3.4, W, 0.08, 1.1, E["orange"]))
xo.append(L.text_mesh(coll2, "EX_SignText", "CRISPIN'S HARDWARE", 0.0, hd + 0.1, 3.65, 0.6, 0.05, E["sign"]))
for i, (x0, x1) in enumerate(WINDOWS):
    cx = (x0 + x1) / 2
    xo.append(L.box(coll2, f"EX_WindowTop{i}", cx, hd + 0.06, WIN_Y[1] + 0.02, x1 - x0 + 0.2, 0.08, 0.12, E["frame"]))
    xo.append(L.box(coll2, f"EX_WindowSill{i}", cx, hd + 0.06, WIN_Y[0] - 0.06, x1 - x0 + 0.2, 0.12, 0.12, E["frame"]))
    xo.append(L.box(coll2, f"EX_Mullion{i}", cx, hd + 0.05, WIN_Y[0], 0.06, 0.08, WIN_Y[1] - WIN_Y[0], E["frame"]))
xo.append(L.hinged_door(coll2, [
    (0, 0.0, 1.18, 0.06, 2.18, E["glass"], 0.0),
    (0, 0.0, 1.18, 0.08, 0.1, E["frame"], 0.0),
    (0, 2.08, 1.18, 0.08, 0.1, E["frame"], 0.0),
    (0.45, 0.95, 0.05, 0.14, 0.05, E["metal"], 0.0),
], -0.59, hd - 0.1, 0.2))
xo.append(L.box(coll2, "EX_DoorFrame", 0, hd + 0.04, 2.4, 1.44, 0.1, 0.12, E["orange"]))
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
L.snapshot(sc2, os.path.join(OUT, "preview.png"), (-10, 5, hd + 14), (0, 2.5, -3), lens=28, res=(768, 512))
print("crispins exterior:", len(xo), "objects, interiorOffset", interior_offset, "depth", round(DN, 3))
