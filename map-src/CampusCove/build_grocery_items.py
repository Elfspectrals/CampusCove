"""GreenCart grocery items: twelve hand-held consumables (group `grocery`, backend/app/Support/FoodCatalog.php).

Same contract as build_food_items.py: metres, origin centre-bottom, a few hundred triangles, IT_ materials,
out/items/grocery/<key>/{model.glb,preview.png}. Then `cd front && npm run assets:optimize -- items`.
"""
import importlib
import math
import os
import sys

import bmesh

if "__file__" not in globals():
    raise RuntimeError('Run with exec(open(p).read(), {"__file__": p}) so the script can find lib_common.py')
HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import lib_common as L
importlib.reload(L)
import bpy
from mathutils import Vector

ONLY = globals().get("ONLY_ITEMS")

sc = L.new_build_scene("ITEMS_grocery")
coll = bpy.data.collections.new("GroceryItems")
sc.collection.children.link(coll)


def finish(name, bm, mat, tile=0.05):
    bm.normal_update()
    L._box_uv(bm, tile)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    return ob


def tube(name, r0, r1, z0, h, mat, seg=12, x=0.0, y=0.0):
    """Capped frustum along +Z."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r0, radius2=r1, depth=h)
    for v in bm.verts:
        v.co += Vector((x, y, z0 + h / 2))
    return finish(name, bm, mat)


def blob(name, center, size, mat, seg=8, rings=5):
    """Squashed UV sphere: center (x, y, z), size = full extents."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=0.5)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2])) + Vector(center)
    return finish(name, bm, mat)


def cube(name, center, size, mat):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2])) + Vector(center)
    return finish(name, bm, mat)


def extrude_outline(name, outline, to_3d, mat):
    """Closed 2D outline extruded between two parallel planes; to_3d(u, v, side) maps a point to (x, y, z)."""
    bm = bmesh.new()
    lo = [bm.verts.new(to_3d(u, v, 0)) for u, v in outline]
    hi = [bm.verts.new(to_3d(u, v, 1)) for u, v in outline]
    bm.faces.new(lo[::-1])
    bm.faces.new(hi)
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return finish(name, bm, mat)


def prism(name, outline, z0, h, mat):
    """Extruded 2D outline (x, y) from z0 to z0 + h."""
    return extrude_outline(name, outline, lambda x, y, s: (x, y, z0 + s * h), mat)


def prism_x(name, outline_yz, x0, length, mat):
    """Extruded 2D outline (y, z) from x0 to x0 + length."""
    return extrude_outline(name, outline_yz, lambda y, z, s: (x0 + s * length, y, z), mat)


def slab_y(name, outline_xz, y0, thick, mat):
    """Extruded 2D outline (x, z) from y0 to y0 + thick."""
    return extrude_outline(name, outline_xz, lambda x, z, s: (x, y0 + s * thick, z), mat)


def sweep(name, profile, path, mat):
    """Profile (list of (u, v) around the local section) swept along path = [(center, radius_scale, tangent)]."""
    bm = bmesh.new()
    rings = []
    for center, scale, tangent in path:
        t = Vector(tangent).normalized()
        side = t.cross(Vector((0, 0, 1)))
        if side.length < 1e-6:
            side = Vector((0, 1, 0))
        side.normalize()
        up = side.cross(t).normalized()
        rings.append([bm.verts.new(Vector(center) + (side * u + up * v) * scale) for u, v in profile])
    n = len(profile)
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.faces.new(rings[0][::-1])
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return finish(name, bm, mat)


def flatten_y(ob, pivot_y, factor):
    for v in ob.data.vertices:
        v.co.y = pivot_y + (v.co.y - pivot_y) * factor
    ob.data.update()
    return ob


def regular_polygon(radius, n, phase=0.0):
    return [(radius * math.cos(phase + 2 * math.pi * i / n), radius * math.sin(phase + 2 * math.pi * i / n)) for i in range(n)]


def sawtooth(x0, x1, base, tip, teeth):
    pts = [(x0, base), (x1, base)]
    step = (x1 - x0) / teeth
    for i in range(teeth, 0, -1):
        pts.append((x0 + (i - 0.5) * step, tip))
        pts.append((x0 + (i - 1) * step, base + (tip - base) * 0.25))
    return pts


# ---------------------------------------------------------------- items
def banana():
    peel = L.make_mat("IT_Banana_Peel", "#f3d13a", 0.6, "noise", 0.05, accent="#e0b82a")
    tip = L.make_mat("IT_Banana_Tip", "#5b3a1e", 0.8, "noise", 0.04)
    length, bend, radius = 0.18, 0.045, 0.02
    profile = regular_polygon(1.0, 5, phase=math.pi / 2)
    steps = 9

    def point(i):
        s = i / (steps - 1)
        x = -length / 2 + s * length
        z = radius + bend * (1 - (2 * s - 1) ** 2)
        return Vector((x, 0, z))

    path = []
    for i in range(steps):
        s = i / (steps - 1)
        taper = radius * (0.55 + 0.45 * math.sin(math.pi * s))
        tangent = point(min(i + 1, steps - 1)) - point(max(i - 1, 0))
        path.append((point(i), taper, tangent))
    body = sweep("Body", profile, path, peel)
    tips = []
    for name, i, direction in (("TipA", 0, -1), ("TipB", steps - 1, 1)):
        p, scale, tangent = path[i]
        t = Vector(tangent).normalized() * direction
        tips.append(sweep(name, regular_polygon(1.0, 5, math.pi / 2),
                          [(p, scale * 0.9, t), (p + t * 0.012, scale * 0.35, t)], tip))
    return [body, *tips]


def bread_loaf():
    crust = L.make_mat("IT_Bread_Crust", "#c98a3e", 0.9, "noise", 0.07, accent="#a96d2c")
    bag = L.make_mat("IT_Bread_Bag", "#eef3fb", 0.25, "noise", 0.02, alpha=0.42)
    band = L.make_mat("IT_Bread_Band", "#2d6fd6", 0.6, "noise", 0.03)
    clip = L.make_mat("IT_Bread_Clip", "#f4f1ea", 0.6, "noise", 0.02)
    loaf_outline = [(-0.055, 0.0), (0.055, 0.0), (0.057, 0.06), (0.045, 0.1), (0.02, 0.112), (-0.02, 0.112), (-0.045, 0.1), (-0.057, 0.06)]
    bag_outline = [(y * 1.07, z * 1.06 + 0.001) for y, z in loaf_outline]
    return [
        prism_x("Loaf", loaf_outline, -0.115, 0.23, crust),
        prism_x("Bag", bag_outline, -0.122, 0.236, bag),
        prism_x("Band", [(y * 1.1, z * 1.09 + 0.002) for y, z in loaf_outline], -0.03, 0.045, band),
        prism_x("Twist", [(-0.009, 0.05), (0.009, 0.05), (0.009, 0.07), (-0.009, 0.07)], 0.114, 0.016, bag),
        cube("Clip", (0.134, 0.0, 0.06), (0.008, 0.016, 0.02), clip),
    ]


def milk_carton():
    carton = L.make_mat("IT_Milk_Carton", "#f6f7f9", 0.8, "noise", 0.02)
    blue = L.make_mat("IT_Milk_Blue", "#2f6ccf", 0.7, "noise", 0.03, accent="#285cb0")
    cap = L.make_mat("IT_Milk_Cap", "#7db3f0", 0.5, "noise", 0.02)
    gable = [(-0.035, 0.15), (0.035, 0.15), (0.0, 0.188)]
    cap_ob = tube("Cap", 0.011, 0.011, 0.0, 0.01, cap, seg=8)
    cap_ob.location = (0.0, -0.018, 0.169)
    cap_ob.rotation_euler = (-0.83, 0.0, 0.0)
    return [
        cube("Body", (0, 0, 0.075), (0.07, 0.07, 0.15), carton),
        cube("Band", (0, 0, 0.055), (0.0715, 0.0715, 0.05), blue),
        cube("Label", (0, -0.0355, 0.115), (0.046, 0.002, 0.04), blue),
        prism_x("Gable", gable, -0.035, 0.07, carton),
        cube("Fin", (0, 0, 0.194), (0.07, 0.008, 0.014), blue),
        cap_ob,
    ]


def cheese_wedge():
    paste = L.make_mat("IT_Cheese_Paste", "#f2c93c", 0.6, "noise", 0.05, accent="#e4b62c")
    rind = L.make_mat("IT_Cheese_Rind", "#e07a1f", 0.7, "noise", 0.05)
    hole = L.make_mat("IT_Cheese_Hole", "#b8880c", 0.7, "noise", 0.03)
    wedge = [(-0.06, -0.04), (0.06, -0.04), (-0.06, 0.04)]
    parts = [
        prism("Wedge", wedge, 0.0, 0.06, paste),
        prism("Rind", [(-0.06, -0.046), (0.06, -0.046), (0.06, -0.04), (-0.06, -0.04)], 0.0, 0.06, rind),
    ]
    for i, (x, y, size) in enumerate(((-0.04, -0.02, 0.014), (-0.015, -0.025, 0.011), (-0.045, 0.012, 0.01), (0.01, -0.03, 0.009))):
        parts.append(blob(f"HoleTop{i}", (x, y, 0.06), (size, size, 0.003), hole, seg=7, rings=3))
    for i, (x, z, size) in enumerate(((-0.03, 0.02, 0.012), (0.01, 0.04, 0.01), (0.035, 0.018, 0.009))):
        parts.append(blob(f"HoleFront{i}", (x, -0.046, z), (size, 0.003, size), hole, seg=7, rings=3))
    cut_normal = Vector((0.08, 0.12, 0.0)).normalized()
    for i, (t, z, size) in enumerate(((0.3, 0.025, 0.011), (0.65, 0.04, 0.009))):
        on_cut = Vector((-0.06 + t * 0.12, 0.04 - t * 0.08, z)) + cut_normal * 0.001
        dot = blob(f"HoleCut{i}", (0, 0, 0), (size, size, 0.003), hole, seg=7, rings=3)
        dot.location = on_cut
        dot.rotation_euler = cut_normal.to_track_quat("Z", "Y").to_euler()
        parts.append(dot)
    return parts


def egg_carton():
    kraft = L.make_mat("IT_Egg_Kraft", "#b8905c", 0.95, "noise", 0.06, accent="#a27c4b")
    shell = L.make_mat("IT_Egg_Shell", "#f7f3ea", 0.6, "noise", 0.02)
    parts = [
        cube("Tray", (0, 0, 0.018), (0.15, 0.10, 0.036), kraft),
        cube("TrayLip", (0, 0, 0.038), (0.152, 0.102, 0.004), kraft),
    ]
    for i in range(3):
        for j in range(2):
            x = -0.05 + i * 0.05
            y = -0.025 + j * 0.05
            parts.append(blob(f"Egg{i}{j}", (x, y, 0.038), (0.036, 0.036, 0.046), shell, seg=7, rings=4))
    lid = cube("Lid", (0, 0.05, 0.006), (0.15, 0.10, 0.012), kraft)
    lid.location = (0.0, 0.05, 0.04)
    lid.rotation_euler = (math.radians(118), 0.0, 0.0)
    parts.append(lid)
    return parts


def cereal_box():
    box_mat = L.make_mat("IT_Cereal_Box", "#f08a1f", 0.8, "noise", 0.04, accent="#dc7816")
    bowl = L.make_mat("IT_Cereal_Bowl", "#f7f4ee", 0.5, "noise", 0.02)
    milk = L.make_mat("IT_Cereal_Milk", "#fff8e6", 0.6, "noise", 0.02)
    flakes = L.make_mat("IT_Cereal_Flakes", "#b86a1c", 0.8, "noise", 0.06)
    brand = L.make_mat("IT_Cereal_Brand", "#1f3f8f", 0.7, "noise", 0.03)
    front_y = -0.03
    parts = [
        cube("Box", (0, 0, 0.14), (0.19, 0.06, 0.28), box_mat),
        cube("Brand", (0, front_y - 0.001, 0.235), (0.14, 0.003, 0.035), brand),
        flatten_y(tube("Bowl", 0.028, 0.05, 0.075, 0.055, bowl, seg=12, y=front_y), front_y, 0.2),
        flatten_y(tube("Milk", 0.047, 0.047, 0.13, 0.006, milk, seg=12, y=front_y), front_y, 0.2),
        cube("Spoon", (0.045, front_y - 0.004, 0.155), (0.008, 0.006, 0.07), bowl),
    ]
    for i, (x, y, size) in enumerate(((-0.02, -0.012, 0.016), (0.012, -0.01, 0.014), (-0.004, -0.028, 0.012), (0.026, -0.024, 0.011))):
        parts.append(blob(f"Flake{i}", (x, front_y + y * 0.2, 0.137), (size, size * 0.2, 0.006), flakes, seg=6, rings=3))
    return parts


def pasta_box():
    box_mat = L.make_mat("IT_Pasta_Box", "#1f5fc9", 0.75, "noise", 0.04, accent="#1a4fa8")
    window = L.make_mat("IT_Pasta_Window", "#f5cf4a", 0.5, "stripes", 0.04, accent="#e2b52e")
    label = L.make_mat("IT_Pasta_Label", "#f7f3e8", 0.8, "noise", 0.02)
    return [
        cube("Box", (0, 0, 0.12), (0.16, 0.04, 0.24), box_mat),
        cube("Window", (0, -0.0205, 0.1), (0.1, 0.002, 0.15), window),
        cube("Label", (0, -0.0205, 0.205), (0.11, 0.002, 0.03), label),
        cube("Frame", (0, -0.0212, 0.183), (0.106, 0.002, 0.004), label),
    ]


def soda_can():
    red = L.make_mat("IT_Soda_Red", "#d8252b", 0.35, "noise", 0.03, accent="#c21d23")
    silver = L.make_mat("IT_Soda_Silver", "#c9ccd2", 0.3, "noise", 0.03)
    stripe = L.make_mat("IT_Soda_Stripe", "#f7f3ee", 0.5, "noise", 0.02)
    return [
        tube("Base", 0.026, 0.032, 0.0, 0.008, silver, seg=14),
        tube("Body", 0.033, 0.033, 0.008, 0.096, red, seg=14),
        tube("Stripe", 0.0335, 0.0335, 0.05, 0.02, stripe, seg=14),
        tube("Shoulder", 0.033, 0.028, 0.104, 0.012, red, seg=14),
        tube("Rim", 0.028, 0.029, 0.116, 0.004, silver, seg=14),
        tube("Top", 0.027, 0.027, 0.117, 0.002, silver, seg=14),
        cube("Tab", (0.0, 0.004, 0.1205), (0.01, 0.018, 0.003), silver),
    ]


def chips_bag():
    foil = L.make_mat("IT_Chips_Bag", "#f6c92f", 0.35, "noise", 0.04, accent="#e7b61f")
    badge = L.make_mat("IT_Chips_Badge", "#d8332a", 0.4, "noise", 0.03)
    crisp = L.make_mat("IT_Chips_Crisp", "#f0b45a", 0.8, "noise", 0.06)
    body = blob("Body", (0, 0, 0.14), (0.2, 0.075, 0.25), foil, seg=12, rings=8)
    for v in body.data.vertices:
        v.co.x = math.copysign(0.1 * (abs(v.co.x) / 0.1) ** 0.65, v.co.x) if v.co.x else 0.0
        v.co.z = 0.14 + math.copysign(0.125 * (abs(v.co.z - 0.14) / 0.125) ** 0.75, v.co.z - 0.14)
    body.data.update()
    return [
        body,
        slab_y("CrimpTop", sawtooth(-0.07, 0.07, 0.24, 0.28, 6), -0.003, 0.006, foil),
        slab_y("CrimpBottom", sawtooth(-0.07, 0.07, 0.04, 0.0, 6), -0.003, 0.006, foil),
        blob("Badge", (0, -0.034, 0.165), (0.13, 0.008, 0.085), badge, seg=10, rings=4),
        blob("Crisp", (-0.03, -0.038, 0.095), (0.05, 0.006, 0.04), crisp, seg=7, rings=3),
        blob("Crisp2", (0.03, -0.037, 0.085), (0.042, 0.006, 0.036), crisp, seg=7, rings=3),
    ]


def chocolate_bar():
    wrap = L.make_mat("IT_Choco_Wrap", "#6a3aa8", 0.6, "noise", 0.04, accent="#5b2f93")
    wrap_hi = L.make_mat("IT_Choco_WrapSquare", "#7d4cc0", 0.6, "noise", 0.03)
    foil = L.make_mat("IT_Choco_Foil", "#d5d8de", 0.3, "noise", 0.03)
    choco = L.make_mat("IT_Choco_Dark", "#4a2a17", 0.5, "noise", 0.04)
    parts = [
        cube("Wrapper", (-0.022, 0, 0.003), (0.116, 0.08, 0.006), wrap),
        cube("Foil", (0.0, 0, 0.0025), (0.16, 0.076, 0.005), foil),
    ]
    for col in range(4):
        for row in range(2):
            x = -0.06 + col * 0.04
            y = -0.02 + row * 0.04
            peeled = col == 3
            parts.append(cube(f"Square{col}{row}", (x, y, 0.009), (0.034, 0.034, 0.006), choco if peeled else wrap_hi))
    parts.append(cube("WrapperEdge", (0.037, 0, 0.0075), (0.004, 0.08, 0.009), wrap))
    return parts


def yogurt_cup():
    cup = L.make_mat("IT_Yogurt_Cup", "#f8f6f2", 0.6, "noise", 0.02)
    pink = L.make_mat("IT_Yogurt_Pink", "#f27aa6", 0.6, "noise", 0.04, accent="#e4668f")
    lid = L.make_mat("IT_Yogurt_Lid", "#cfd3da", 0.3, "noise", 0.03)
    return [
        tube("Cup", 0.026, 0.034, 0.0, 0.092, cup, seg=12),
        tube("Band", 0.0302, 0.0342, 0.03, 0.045, pink, seg=12),
        tube("Lid", 0.036, 0.037, 0.092, 0.008, lid, seg=12),
        cube("LidTab", (0.04, -0.008, 0.099), (0.014, 0.012, 0.002), lid),
    ]


# ---------------------------------------------------------------- export + preview
def ship(key, parts, group="grocery"):
    obj = L.join(coll, key, parts)
    obj.location = (0, 0, 0)
    bpy.context.view_layer.update()
    low = min((obj.matrix_world @ Vector(c)).z for c in obj.bound_box)
    obj.location.z -= low
    bpy.context.view_layer.update()
    bad = L.check_grounded([obj])
    if bad:
        raise RuntimeError(f"{key} is not grounded: {bad}")
    if len(obj.data.materials) > 6:
        raise RuntimeError(f"{key} uses {len(obj.data.materials)} materials (max 6)")
    out = os.path.join(L.OUT_ROOT, "items", group, key)
    os.makedirs(out, exist_ok=True)
    L.export_glb(os.path.join(out, "model.glb"), [obj])
    L.render_preview(sc, obj, os.path.join(out, "preview.png"))
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    obj.location.x += 0.6 * len(results)
    return {"key": key, "tris": tris, "mats": len(obj.data.materials), "dims": tuple(round(x, 3) for x in obj.dimensions)}


def ai_model(slug, material):
    return lambda: L.import_ai_model(coll, slug, f"IT_Crop_{material}")


APPLE = ai_model("a_single_shiny_red_apple_with_a_short_br", "Apple")

FARM = {
    "apple": APPLE,
    "corn": ai_model("a_single_yellow_corn_cob_half_wrapped_in", "Corn"),
    "potato": ai_model("a_potato_with_evenly_coloured_smooth_mat", "Potato"),
    "cabbage": ai_model("a_single_round_green_cabbage_head_with_c", "Cabbage"),
    "pumpkin": ai_model("a_single_round_orange_pumpkin_with_deep_", "Pumpkin"),
    "corn_plant": ai_model("a_single_tall_corn_plant_with_green_leav", "CornPlant"),
    "potato_plant": ai_model("a_single_young_potato_plant_with_bushy_g", "PotatoPlant"),
    "egg": ai_model("a_single_smooth_white_chicken_egg_standi", "Egg"),
    "milk": ai_model("a_milk_bottle_made_of_clear_glass_filled", "Milk"),
}

GROCERY = {
    "apple": APPLE,
    "banana": banana,
    "bread": bread_loaf,
    "milk": milk_carton,
    "cheese": cheese_wedge,
    "eggs": egg_carton,
    "cereal": cereal_box,
    "pasta": pasta_box,
    "soda": soda_can,
    "chips": chips_bag,
    "chocolate": chocolate_bar,
    "yogurt": yogurt_cup,
}

results = []
for key, build in GROCERY.items():
    if ONLY and key not in ONLY:
        continue
    results.append(ship(key, build()))
for key, build in FARM.items():
    if ONLY and key not in ONLY:
        continue
    results.append(ship(key, build(), "farm"))
print("GROCERY", results)
