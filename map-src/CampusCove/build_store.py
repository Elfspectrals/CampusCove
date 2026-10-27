"""Cove Home: the furniture store (an IKEA-like walk-through showroom). Run inside Blender: exec(open(<this file>).read()).

Interior (game space, same entrance contract as the houses): x [-15, 15], z [-50, 5.2], door at z=+5.1, ceiling 6 m.
One-way route, marked by yellow floor arrows:
  entrance hall (z -4..5)  ->  lane W heading -Z (living, bedroom, kitchen)  ->  back aisle heading +X (workspace, kids)
  ->  lane E heading +Z (bathroom, storage, plants, outdoor)  ->  checkouts  ->  door.
The furniture itself is NOT in interior.glb: the game loads assets/decor/<key>/model.glb at every `displays[]` entry of
interior.layout.json (so the showroom always shows the exact item that is sold) and draws the price tag at `tag`.
Item footprints come from out/decor/furniture.manifest.json (written by build_furniture.py).

Outputs: out/store/cove_home/{interior.glb, interior.colsrc.glb, interior.layout.json}
         + exterior / retail park via build_store_ext.py.
"""
import importlib
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else r"C:\Users\Utilisateur\CampusCove\map-src\CampusCove"
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import lib_common as L
importlib.reload(L)
import bpy

KEY = "cove_home"
OUT = os.path.join(L.OUT_ROOT, "store", KEY)
H = 6.0          # warehouse ceiling
HP = 2.6         # room-set partitions
PATH_HW = 1.5    # half width of the walking route
X0, X1, Z0, Z1 = -15.0, 15.0, -50.0, 5.0

# ---------------------------------------------------------------- catalogue (mirrors build_furniture.py + the 5 original decor pieces)
manifest = json.load(open(os.path.join(L.OUT_ROOT, "decor", "furniture.manifest.json"), encoding="utf-8"))
manifest.update({  # original decor set (build_decor.py), game [w, h, d]
    "wooden_chair": [0.46, 1.0, 0.44], "dining_table": [1.4, 1.05, 0.85], "floor_lamp": [0.49, 1.74, 0.49],
    "potted_plant": [0.56, 1.36, 0.56], "bookshelf": [1.0, 1.8, 0.34],
})
LEGACY_CODES = {"wooden_chair": "chair_campus_basic", "floor_lamp": "lamp_study", "dining_table": "decor_dining_table",
                "potted_plant": "decor_potted_plant", "bookshelf": "decor_bookshelf"}


def code_of(key):
    return LEGACY_CODES.get(key, "decor_" + key)


# names + descriptions shown on the in-store item card (item_defs has no description column)
import ast
_src = open(os.path.join(HERE, "build_furniture.py"), encoding="utf-8").read()
_lit = _src[_src.index("FURNITURE = [") + len("FURNITURE = "):_src.index("]\n\nM = {") + 1]
BLURB = {k: desc for k, _n, _d, _p, _r, _s, desc in ast.literal_eval(_lit)}
BLURB.update({
    "wooden_chair": "Solid wood chair with a teal cushion.", "floor_lamp": "Brass floor lamp with a warm shade.",
    "dining_table": "Light oak table for four, flowers included.", "potted_plant": "Leafy plant in a terracotta pot.",
    "bookshelf": "Four-shelf bookcase, books included.",
})


DEPARTMENTS = {
    "living": ("LIVING ROOM", "#7fb7b2", ("#c9a36a", "planks", "#a98550")),
    "bedroom": ("BEDROOM", "#b9b2d8", ("#dcc39a", "planks", "#c4a87c")),
    "kitchen": ("KITCHEN & DINING", "#a7d8c0", ("#ece6da", "tiles", "#d6cfc0")),
    "office": ("WORKSPACE", "#c4c9d1", ("#8a6a4a", "planks", "#6e5338")),
    "kids": ("KIDS & PLAY", "#f5d25e", ("#f6e3b4", "checker", "#f2a65a")),
    "bathroom": ("BATHROOM", "#9fd3e6", ("#f4f7f8", "tiles", "#cfe3ea")),
    "storage": ("STORAGE", "#e4cfa8", ("#c9a36a", "planks", "#a98550")),
    "plants": ("PLANTS & DECOR", "#a9c99a", ("#d39a72", "tiles", "#b97f58")),
    "outdoor": ("OUTDOOR", "#9bd0f0", ("#79b765", "noise", "#6aa857")),
}
ITEMS = {
    "living": ["sofa_classic", "sofa_corner", "armchair_lounge", "coffee_table_round", "tv_bench", "side_table", "pouf_knit", "rug_round", "floor_lamp_arc", "floor_lamp"],
    "bedroom": ["bed_double", "bed_single", "nightstand", "wardrobe", "dresser", "mirror_standing"],
    "kitchen": ["dining_table", "wooden_chair", "round_dining_table", "dining_bench", "bar_stool", "kitchen_counter", "fridge_retro", "stove_oven"],
    "office": ["computer_setup", "desk_study", "office_chair", "filing_cabinet", "desk_lamp"],
    "kids": ["bunk_bed", "arcade_cabinet", "toy_chest", "bean_bag"],
    "bathroom": ["bathtub", "sink_vanity", "toilet", "towel_rack"],
    "storage": ["bookshelf", "cube_shelf", "coat_rack"],
    "plants": ["aquarium", "monstera", "potted_plant", "cactus", "vase_tulips", "globe"],
    "outdoor": ["garden_bench", "parasol", "bbq_grill", "sun_lounger"],
}
# collision footprint overrides [w, d] (the parasol canopy is overhead)
COL_OVERRIDE = {"parasol": [0.5, 0.5]}

# route: each aisle = start point of its centre line, travel direction, sides that get room-sets, sections (dept, length)
# side +1 = right of the travel direction, -1 = left.  wall_at: distance from the path centre to the wall behind each side.
AISLES = [
    dict(name="W", start=(-8.0, -4.0), d=(0, -1), sides={-1: 7.0, +1: 8.0}, sections=[("living", 13.0), ("bedroom", 10.5), ("kitchen", 10.5)]),
    dict(name="B", start=(-15.0, -43.5), d=(1, 0), sides={-1: 6.5}, sections=[("office", 15.0), ("kids", 15.0)]),
    dict(name="E", start=(8.0, -38.0), d=(0, 1), sides={-1: 7.0, +1: 8.0}, sections=[("bathroom", 8.5), ("storage", 8.5), ("plants", 8.5), ("outdoor", 8.5)]),
]

# ================================================================ scene + materials
sc = L.new_build_scene("STORE_" + KEY + "_interior")
coll = bpy.data.collections.new("Interior")
sc.collection.children.link(coll)
cols = L.Collisions(coll)
M = L.std_mats(wall="#f4f2ec", floor=("#c9c6bf", "tiles", "#b9b6ae"))
M["path"] = L.make_mat("IN_StorePath", "#ece6d6", 0.7, "noise", 0.02)
M["arrow"] = L.make_mat("IN_StoreArrow", "#f7c21b", 0.6, "noise", 0.02)
M["blue"] = L.make_mat("IN_StoreBlue", "#1f5fae", 0.7, "noise", 0.02)
M["yellow"] = L.make_mat("IN_StoreYellow", "#f7c21b", 0.5, "noise", 0.0, emit="#f7c21b", emit_strength=0.6)
M["white"] = L.make_mat("IN_StoreWhite", "#fbfaf7", 0.6, "noise", 0.01)
M["beam"] = L.make_mat("IN_StoreBeam", "#5d6670", 0.6, "noise", 0.02)
M["rack"] = L.make_mat("IN_StoreRack", "#e07a2e", 0.6, "noise", 0.02)
M["carton"] = L.make_mat("IN_Carton", "#b98c5a", 0.9, "stripes", 0.04, accent="#a47a4c")
M["conveyor"] = L.make_mat("IN_Conveyor", "#2a2d33", 0.6, "stripes", 0.02, accent="#1c1e22")
DM = {}
for dep, (_, wall_c, floor_c) in DEPARTMENTS.items():
    DM[dep] = {"wall": L.make_mat(f"IN_Dept_{dep}_Wall", wall_c, 0.9, "noise", 0.02),
               "floor": L.make_mat(f"IN_Dept_{dep}_Floor", floor_c[0], 0.7, floor_c[1], 0.04, accent=floor_c[2])}

objs = []


def add(o):
    objs.append(o)
    return o


def rect(name, gx0, gz0, gx1, gz1, y0, h, mat, col=False, tile=2.0):
    """Axis-aligned box from two game-space corners."""
    cx, cz = (gx0 + gx1) / 2, (gz0 + gz1) / 2
    sx, sz = abs(gx1 - gx0), abs(gz1 - gz0)
    o = add(L.box(coll, name, cx, cz, y0, sx, sz, h, mat, tile=tile))
    if col:
        cols.add(name, cx, cz, y0, sx, sz, h)
    return o


def facing_yaw(fx, fz):
    """Game yaw (three.js rotation.y) that turns a +Z-facing model towards (fx, fz)."""
    return math.atan2(fx, fz)


def text(name, body, gx, gz, y0, size, mat, yaw):
    o = L.text_mesh(coll, name, body, gx, gz, y0, size, 0.03, mat, facing="+z")
    o.rotation_euler = (math.pi / 2, 0, yaw)
    return add(o)


def arrow(name, gx, gz, fx, fz):
    """Yellow floor arrow pointing along (fx, fz): shaft + head (two flat boxes, the head rotated 45 deg)."""
    yaw = facing_yaw(fx, fz)
    add(L.box(coll, name + "_Shaft", gx - fx * 0.25, gz - fz * 0.25, 0.0, 0.22 if fz else 0.7, 0.7 if fz else 0.22, 0.012, M["arrow"]))
    for s in (-1, 1):
        # two slanted bars forming a chevron
        rx, rz = fz, -fx  # right of the arrow direction
        bx, bz = gx + fx * 0.05 + rx * s * 0.18, gz + fz * 0.05 + rz * s * 0.18
        add(L.box(coll, f"{name}_Head{'L' if s < 0 else 'R'}", bx, bz, 0.0, 0.18, 0.55, 0.013, M["arrow"], rot=yaw - s * math.radians(40)))


# ================================================================ shell
rect("House_Floor_Store", X0 - 0.2, Z0 - 0.2, X1 + 0.2, Z1 + 0.2, -0.1, 0.1, M["floor"], tile=3.0)
rect("Ceiling", X0 - 0.2, Z0 - 0.2, X1 + 0.2, Z1 + 0.3, H, 0.15, M["ceil"], tile=3.0)
win = (0.9, 3.6)
objs += L.wall(coll, "Walls_Front", "x", Z1 + 0.1, 0.2, X0 - 0.2, X1 + 0.2, H, M["white"],
               openings=[(-12.0, -3.0, *win), (-0.6, 0.6, 0.0, 2.2), (3.0, 12.0, *win)], cols=cols, glass=M["glass"], col_tag="Wall_Front")
objs += L.wall(coll, "Walls_Back", "x", Z0 - 0.1, 0.2, X0 - 0.2, X1 + 0.2, H, M["white"], cols=cols, col_tag="Wall_Back")
objs += L.wall(coll, "Walls_W", "z", X0 - 0.1, 0.2, Z0, Z1 + 0.2, H, M["white"], cols=cols, col_tag="Wall_W")
objs += L.wall(coll, "Walls_E", "z", X1 + 0.1, 0.2, Z0, Z1 + 0.2, H, M["white"], cols=cols, col_tag="Wall_E")
add(L.box(coll, "Door_Entrance", 0, 5.1, 0.01, 1.18, 0.06, 2.18, M["glass"], bevel=0.02))
add(L.box(coll, "Door_Entrance_Frame", 0, 5.06, 2.2, 1.4, 0.1, 0.12, M["blue"]))
add(L.box(coll, "Door_Entrance_Sign", 0, 4.98, 2.4, 1.4, 0.04, 0.3, M["yellow"]))
add(L.box(coll, "Entry_Doormat", 0, 4.4, 0.0, 2.0, 1.0, 0.012, M["mat"]))
for nm, gx, gz, sx, sz in [("Sky_Front", 0, 16, 60, 0.05)]:
    add(L.box(coll, nm, gx, gz, -3.0, sx, sz, 14.0, M["sky"]))
# exposed roof structure + blue stripe along the walls
for i, gz in enumerate(range(-46, 5, 6)):
    add(L.box(coll, f"Light_Beam{i:02d}", 0, gz, H - 0.45, 30.2, 0.25, 0.45, M["beam"]))
for nm, a, b2, axis, fixed in [("N", X0, X1, "x", Z0 + 0.03), ("W", Z0, Z1, "z", X0 + 0.03), ("E", Z0, Z1, "z", X1 - 0.03)]:
    if axis == "x":
        add(L.box(coll, f"Wall_Stripe{nm}", (a + b2) / 2, fixed, 4.4, b2 - a, 0.04, 0.5, M["blue"]))
    else:
        add(L.box(coll, f"Wall_Stripe{nm}", fixed, (a + b2) / 2, 4.4, 0.04, b2 - a, 0.5, M["blue"]))

# ================================================================ entrance hall (z -4 .. 5)
objs += L.wall(coll, "Walls_Hall", "x", -4.0, 0.2, X0, X1, 3.4, M["blue"],
               openings=[(-9.5, -6.5, 0.0, 3.4), (6.5, 9.5, 0.0, 3.4)], cols=cols, col_tag="Wall_Hall")
text("Hall_Logo", "COVE HOME", 0, -3.86, 1.6, 1.3, M["yellow"], 0.0)
text("Hall_Tagline", "Walk the arrows. Find your home.", 0, -3.86, 0.95, 0.38, M["white"], 0.0)
# start + exit signs above the lane mouths
for nm, gx, body in (("Start", -8.0, "START  >"), ("Exit", 8.0, "CHECKOUT")):
    add(L.box(coll, f"Hall_{nm}Board", gx, -3.85, 2.55, 2.9, 0.08, 0.7, M["yellow"]))
    text(f"Hall_{nm}Text", body, gx, -3.79, 2.68, 0.42, M["blue"], 0.0)
# info desk (west) and yellow bag bins
add(L.furn(coll, "Hall_InfoDesk", -11.0, 1.0, 0.0, [(0, 0, 0.0, 3.0, 0.9, 1.0, M["white"], 0.02), (0, 0, 1.0, 3.2, 1.0, 0.06, M["blue"], 0.01)]))
cols.add("Hall_InfoDesk", -11.0, 1.0, 0.0, 3.2, 1.0, 1.06)
add(L.box(coll, "Hall_InfoSign", -11.0, 1.4, 1.06, 0.9, 0.08, 0.9, M["yellow"]))
text("Hall_InfoText", "?", -11.0, 1.33, 1.2, 0.6, M["blue"], 0.0)
for i, gx in enumerate((-5.2, -4.2)):
    add(L.furn(coll, f"Hall_BagBin{i}", gx, 3.0, 0.0, [(0, 0, 0.0, 0.8, 0.8, 0.9, M["blue"], 0.02), (0, 0, 0.9, 0.7, 0.7, 0.25, M["yellow"], 0.03)]))
cols.add("Hall_BagBins", -4.7, 3.0, 0.0, 1.9, 0.9, 1.2)
# checkouts (east): two counters, the lane E exit walks between them
for i, gx in enumerate((4.6, 11.6)):
    add(L.furn(coll, f"Hall_Checkout{i}", gx, -0.5, 0.0, [
        (0, 0, 0.0, 1.0, 3.0, 0.9, M["white"], 0.02),
        (0, 0, 0.9, 0.7, 2.6, 0.05, M["conveyor"]),
        (0, 1.2, 0.95, 0.5, 0.35, 0.3, M["black"], 0.01),
        (0, 1.3, 1.3, 0.04, 0.04, 1.2, M["metal"]),
    ]))
    add(L.box(coll, f"Hall_CheckoutLight{i}", gx, 0.8, 2.5, 0.5, 0.5, 0.3, M["yellow"], bevel=0.05))
    cols.add(f"Hall_Checkout{i}", gx, -0.5, 0.0, 1.0, 3.0, 1.0)
add(L.plant(coll, M, "Hall_Plant0", -14.2, 4.3))
add(L.plant(coll, M, "Hall_Plant1", 14.2, 4.3))
cols.add("Hall_Plant0", -14.2, 4.3, 0.0, 0.5, 0.5, 1.3)
cols.add("Hall_Plant1", 14.2, 4.3, 0.0, 0.5, 0.5, 1.3)
# route through the hall: door -> start (lane W mouth), checkout -> door
rect("Path_HallA", -9.5, -4.0, 0.0, -1.0, 0.0, 0.006, M["path"])
rect("Path_HallB", -1.5, -1.0, 1.5, 4.0, 0.0, 0.006, M["path"])
rect("Path_HallC", 6.5, -4.0, 9.5, 1.0, 0.0, 0.006, M["path"])
rect("Path_HallD", 1.5, 1.0, 9.5, 4.0, 0.0, 0.006, M["path"])
for i, (gx, gz, fx, fz) in enumerate([(0, 2.6, 0, -1), (-2.5, -2.5, -1, 0), (-5.5, -2.5, -1, 0),
                                      (8.0, -2.0, 0, 1), (8.0, 0.4, 0, 1), (5.5, 2.5, -1, 0), (2.8, 2.5, -1, 0)]):
    arrow(f"Arrow_Hall{i:02d}", gx, gz, fx, fz)

# ================================================================ divider between the two lanes
objs += L.wall(coll, "Walls_Divider", "z", 0.0, 0.25, -38.0, -4.0, 3.4, M["white"], cols=cols, col_tag="Wall_Divider")

# ================================================================ room-sets along the route
displays = []
dept_info = []
for A in AISLES:
    dx, dz = A["d"]
    rx, rz = -dz, dx          # right of the travel direction
    sx0, sz0 = A["start"]
    s = 0.0
    total = sum(L_ for _, L_ in A["sections"])
    # walking route strip + arrows along this aisle
    ex, ez = sx0 + dx * total, sz0 + dz * total
    if dx:
        rect(f"Path_{A['name']}", min(sx0, ex), sz0 - PATH_HW, max(sx0, ex), sz0 + PATH_HW, 0.0, 0.006, M["path"])
    else:
        rect(f"Path_{A['name']}", sx0 - PATH_HW, min(sz0, ez), sx0 + PATH_HW, max(sz0, ez), 0.0, 0.006, M["path"])
    k = 0
    a = 2.0
    while a < total - 1.0:
        arrow(f"Arrow_{A['name']}{k:02d}", sx0 + dx * a, sz0 + dz * a, dx, dz)
        a += 3.5
        k += 1

    for dep, length in A["sections"]:
        label, _, _ = DEPARTMENTS[dep]
        keys = ITEMS[dep]
        # greedy split of the items over the sides (shortest row first)
        rows = {side: [] for side in A["sides"]}
        used = {side: 0.0 for side in A["sides"]}
        for key in keys:
            side = min(rows, key=lambda sd: used[sd])
            rows[side].append(key)
            used[side] += manifest[key][0] + 0.7
        for side, wall_d in A["sides"].items():
            # room-set: floor patch + painted back wall + side partitions
            p0, p1 = PATH_HW, wall_d - 0.15
            corners = [(sx0 + dx * s + rx * side * p0, sz0 + dz * s + rz * side * p0),
                       (sx0 + dx * (s + length) + rx * side * p1, sz0 + dz * (s + length) + rz * side * p1)]
            rect(f"Dept_{dep}_Floor{side:+d}", corners[0][0], corners[0][1], corners[1][0], corners[1][1], 0.0, 0.01, DM[dep]["floor"])
            bw = wall_d - 0.12  # paint panel just in front of the wall
            b0 = (sx0 + dx * (s + 0.1) + rx * side * bw, sz0 + dz * (s + 0.1) + rz * side * bw)
            b1 = (sx0 + dx * (s + length - 0.1) + rx * side * (bw + 0.04), sz0 + dz * (s + length - 0.1) + rz * side * (bw + 0.04))
            rect(f"Dept_{dep}_Wall{side:+d}", b0[0], b0[1], b1[0], b1[1], 0.0, HP if A["name"] != "B" else 3.2, DM[dep]["wall"])
            for edge in (s, s + length):
                q0 = (sx0 + dx * edge + rx * side * (PATH_HW + 0.3), sz0 + dz * edge + rz * side * (PATH_HW + 0.3))
                q1 = (sx0 + dx * edge + rx * side * wall_d, sz0 + dz * edge + rz * side * wall_d)
                if (A["name"] == "W" and edge == 0.0) or (A["name"] == "B" and edge in (0.0, 30.0)) or (A["name"] == "E" and edge == total):
                    continue  # an outer / hall wall is already there
                tag = f"Part_{A['name']}_{dep}_{int(edge * 10)}{side:+d}"
                t = 0.075
                if dx:
                    rect(tag, q0[0] - t, min(q0[1], q1[1]), q0[0] + t, max(q0[1], q1[1]), 0.0, HP, M["white"], col=True)
                else:
                    rect(tag, min(q0[0], q1[0]), q0[1] - t, max(q0[0], q1[0]), q0[1] + t, 0.0, HP, M["white"], col=True)
            # items in a row along the path, centred in the section, facing the path
            row = rows[side]
            widths = [manifest[key][0] for key in row]
            span = sum(widths) + 0.7 * (len(row) - 1)
            if span > length - 0.6:
                print(f"WARNING {dep} side {side}: row {span:.1f} m > section {length} m")
            cur = s + (length - span) / 2
            fx, fz = -rx * side, -rz * side           # items face the path
            yaw = facing_yaw(fx, fz)
            for key, w in zip(row, widths):
                w_, h_, d_ = manifest[key]
                along = cur + w / 2
                perp = PATH_HW + 0.9 + d_ / 2
                if key == "rug_round":
                    perp = PATH_HW + 0.5 + d_ / 2
                gx, gz = sx0 + dx * along + rx * side * perp, sz0 + dz * along + rz * side * perp
                y0 = 0.0
                if max(w_, d_) < 0.45 and h_ < 0.8:   # small items stand on a white plinth
                    y0 = 0.45
                    add(L.box(coll, f"Plinth_{key}", gx, gz, 0.0, 0.6, 0.6, 0.45, M["white"], bevel=0.02))
                    cols.add(f"Plinth_{key}", gx, gz, 0.0, 0.6, 0.6, 0.45)
                cw, cd = COL_OVERRIDE.get(key, [w_, d_])
                if h_ > 0.05:
                    # rotated by a multiple of 90 deg: swap the footprint when the item faces +-X
                    if fx:
                        cols.add(f"Item_{key}", gx, gz, y0, cd, cw, h_)
                    else:
                        cols.add(f"Item_{key}", gx, gz, y0, cw, cd, h_)
                # price-tag post at the path edge, near the item's left corner (seen from the path)
                t_along = along - w / 2 + 0.3 if w > 0.8 else along
                tperp = PATH_HW + 0.35
                tx, tz = sx0 + dx * t_along + rx * side * tperp, sz0 + dz * t_along + rz * side * tperp
                add(L.cyl(coll, f"TagPost_{key}", tx, tz, 0.0, 0.025, 1.05, M["metal"], seg=6))
                add(L.cyl(coll, f"TagFoot_{key}", tx, tz, 0.0, 0.16, 0.03, M["metal"], seg=10))
                displays.append({
                    "key": key, "code": code_of(key), "department": dep, "description": BLURB[key],
                    "position": [round(gx, 3), y0, round(gz, 3)], "yaw": round(yaw, 4), "size": [w_, h_, d_],
                    "tag": {"position": [round(tx, 3), 1.32, round(tz, 3)], "yaw": round(yaw, 4)},
                })
                cur += w + 0.7
        # hanging department sign at the start of the section, facing the people walking in
        sgx, sgz = sx0 + dx * (s + 0.6), sz0 + dz * (s + 0.6)
        syaw = facing_yaw(-dx, -dz)
        add(L.box(coll, f"Sign_{dep}_Board", sgx, sgz, 3.5, 4.4 if dz else 0.12, 0.12 if dz else 4.4, 1.0, M["blue"]))
        add(L.box(coll, f"Sign_{dep}_Edge", sgx, sgz, 3.42, 4.5 if dz else 0.14, 0.14 if dz else 4.5, 0.1, M["yellow"]))
        for o_ in (-1.8, 1.8):
            hx, hz = sgx + (o_ if dz else 0), sgz + (0 if dz else o_)
            add(L.cyl(coll, f"Sign_{dep}_Wire{int(o_)}", hx, hz, 4.5, 0.012, H - 4.5, M["metal"], seg=4))
        text(f"Sign_{dep}_Text", label, sgx - dx * 0.08, sgz - dz * 0.08, 3.75, 0.42, M["yellow"], syaw)
        text(f"Sign_{dep}_TextBack", label, sgx + dx * 0.08, sgz + dz * 0.08, 3.75, 0.42, M["yellow"], syaw + math.pi)
        dept_info.append({"id": dep, "label": label, "color": DEPARTMENTS[dep][1], "sign": [round(sgx, 3), 3.9, round(sgz, 3)]})
        s += length

# corners of the route (lane W -> back aisle -> lane E)
rect("Path_TurnW", -9.5, -45.0, -6.5, -38.0, 0.0, 0.006, M["path"])
rect("Path_TurnE", 6.5, -45.0, 9.5, -38.0, 0.0, 0.006, M["path"])
arrow("Arrow_TurnW", -8.0, -41.0, 0, -1)
arrow("Arrow_TurnE", 8.0, -41.0, 0, 1)

# self-serve racks in the middle of the back aisle (north side, between the two lanes)
for i, gx in enumerate((-4.0, 0.0, 4.0)):
    parts = [(0, 0, 0.0, 3.6, 1.0, 0.08, M["rack"])]
    for lv in range(3):
        parts.append((0, 0, 0.9 + lv * 1.0, 3.6, 1.0, 0.08, M["rack"]))
    for px in (-1.75, 1.75):
        parts.append((px, 0, 0.0, 0.1, 1.0, 3.1, M["blue"]))
    for lv, y in enumerate((0.08, 0.98, 1.98)):
        for b_ in range(3):
            parts.append((-1.15 + b_ * 1.15, 0, y, 0.95, 0.8, 0.55 + 0.1 * ((b_ + lv) % 2), M["carton"], 0.01))
    add(L.furn(coll, f"Rack_{i}", gx, -39.6, math.pi, parts))
    cols.add(f"Rack_{i}", gx, -39.6, 0.0, 3.7, 1.1, 3.2)
add(L.box(coll, "Rack_SignBoard", 0.0, -40.2, 3.4, 5.5, 0.08, 0.7, M["yellow"]))
text("Rack_SignText", "SELF-SERVE WAREHOUSE", 0.0, -40.26, 3.55, 0.36, M["blue"], math.pi)

# ceiling light rows over the route
li = 0
for gx in (-8.0, 8.0):
    for gz in range(-36, -4, 5):
        add(L.box(coll, f"Light_{li:02d}", gx, gz + 0.5, 4.9, 0.5, 3.0, 0.08, M["lamp"]))
        add(L.cyl(coll, f"Light_{li:02d}_Wire", gx, gz + 0.5, 4.98, 0.01, H - 4.98, M["metal"], seg=4))
        li += 1
for gx in range(-12, 13, 6):
    add(L.box(coll, f"Light_{li:02d}", gx, -43.5, 4.9, 3.0, 0.5, 0.08, M["lamp"]))
    li += 1
for gx in (-10.0, -4.0, 4.0, 10.0):
    add(L.box(coll, f"Light_{li:02d}", gx, 0.5, 4.9, 3.0, 0.5, 0.08, M["lamp"]))
    li += 1

bad = L.check_grounded(objs, allow=L.ALLOW_INTERIOR + ("Ceiling", "Hall_", "Sign_", "Text", "Rack_Sign", "Wall_Stripe", "Path_", "Dept_", "Arrow_", "Part_"))
print("STORE grounded violations:", bad)
assert not bad, bad

# fewer draw calls: one object per material (collision boxes stay separate)
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
L.export_glb(os.path.join(OUT, "interior.colsrc.glb"), merged + cols.items)
L.write_json(os.path.join(OUT, "interior.layout.json"), {
    "version": 1, "key": KEY, "name": "Cove Home", "spawn": [0.0, 1.6, 3.7],
    "exit": {"position": [0.0, 4.75], "radius": 1.4},
    "bounds": {"minX": X0, "maxX": X1, "minZ": Z0, "maxZ": Z1},
    "departments": dept_info, "displays": displays,
})
print("store interior:", len(objs), "objects ->", len(merged), "nodes,", len(cols.items), "collision boxes,", len(displays), "displays")
result = {"objects": len(objs), "nodes": len(merged), "cols": len(cols.items), "displays": len(displays), "bad": bad}
