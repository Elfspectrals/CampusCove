"""Survival items: food and drinks, the wrist watch and the town drinking fountain.

Outputs:
  out/items/food/<key>/{model.glb,preview.png}   (codes food_<key>, backend/app/Support/FoodCatalog.php)
  out/items/tools/watch/{model.glb,preview.png}  (first-person wrist watch; its `Screen` node is redrawn in game)
  out/park/drinking_fountain/{model.glb,preview.png}
Then `cd front && npm run assets:optimize -- items` and `npm run assets:optimize -- park`.
"""
import contextlib
import importlib
import io
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
from mathutils import Matrix, Vector

ONLY = globals().get("ONLY_ITEMS")

sc = L.new_build_scene("ITEMS_survival")
coll = bpy.data.collections.new("SurvivalItems")
sc.collection.children.link(coll)


# ---------------------------------------------------------------- mesh helpers (Blender coords, Z up, metres)
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


def prism(name, outline, z0, h, mat):
    """Extruded 2D outline (x, y) from z0 to z0 + h."""
    bm = bmesh.new()
    lo = [bm.verts.new((x, y, z0)) for x, y in outline]
    hi = [bm.verts.new((x, y, z0 + h)) for x, y in outline]
    bm.faces.new(lo[::-1])
    bm.faces.new(hi)
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return finish(name, bm, mat)


def cube(name, center, size, mat):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2])) + Vector(center)
    return finish(name, bm, mat)


def strap_ring(name, radius, width, thick, mat, seg=16):
    """Watch strap: a flat ring around the X axis (the wrist)."""
    bm = bmesh.new()
    rows = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        c, s = math.cos(a), math.sin(a)
        rows.append([bm.verts.new((dx, (radius + dr) * c, (radius + dr) * s)) for dx, dr in
                     ((-width / 2, 0), (width / 2, 0), (width / 2, thick), (-width / 2, thick))])
    for i in range(seg):
        a, b = rows[i], rows[(i + 1) % seg]
        for j in range(4):
            bm.faces.new((a[j], b[j], b[(j + 1) % 4], a[(j + 1) % 4]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return finish(name, bm, mat, tile=0.02)


# ---------------------------------------------------------------- items
def coffee():
    cup = L.make_mat("IT_Coffee_Cup", "#f4efe6", 0.85, "noise", 0.03)
    sleeve = L.make_mat("IT_Coffee_Sleeve", "#b9824f", 0.9, "stripes", 0.05, accent="#a56f3f")
    lid = L.make_mat("IT_Coffee_Lid", "#5b4a6e", 0.5, "noise", 0.03)
    return [
        tube("Cup", 0.030, 0.040, 0.0, 0.105, cup),
        tube("Sleeve", 0.0345, 0.0385, 0.035, 0.04, sleeve),
        tube("Lid", 0.043, 0.038, 0.105, 0.012, lid),
        tube("LidTop", 0.026, 0.022, 0.117, 0.006, lid),
    ]


def orange_juice():
    glass = L.make_mat("IT_Juice_Glass", "#ffd29a", 0.25, "noise", 0.03)
    juice = L.make_mat("IT_Juice_Orange", "#ff9a2e", 0.4, "noise", 0.05, accent="#f07f12")
    cap = L.make_mat("IT_Juice_Cap", "#4ce3a0", 0.6, "noise", 0.02)
    label = L.make_mat("IT_Juice_Label", "#fff4dc", 0.8, "stripes", 0.04, accent="#ffb347")
    return [
        tube("Body", 0.032, 0.032, 0.0, 0.11, juice),
        tube("Label", 0.0335, 0.0335, 0.03, 0.045, label),
        tube("Shoulder", 0.032, 0.016, 0.11, 0.03, glass),
        tube("Cap", 0.017, 0.017, 0.14, 0.016, cap),
    ]


def water_bottle():
    plastic = L.make_mat("IT_Water_Plastic", "#9fd8f2", 0.2, "noise", 0.04, accent="#7cc6e8")
    label = L.make_mat("IT_Water_Label", "#3d8fd6", 0.7, "stripes", 0.05, accent="#2f78bd")
    cap = L.make_mat("IT_Water_Cap", "#f4f4f4", 0.6, "noise", 0.02)
    return [
        tube("Body", 0.03, 0.03, 0.0, 0.15, plastic),
        tube("Label", 0.0315, 0.0315, 0.05, 0.05, label),
        tube("Neck", 0.03, 0.013, 0.15, 0.04, plastic),
        tube("Cap", 0.014, 0.014, 0.19, 0.016, cap),
    ]


def croissant():
    pastry = L.make_mat("IT_Croissant", "#e3a24e", 0.8, "noise", 0.08, accent="#c9822f")
    parts = []
    # lobes along an arc, fat in the middle and pointy at the tips
    for i, (a, s) in enumerate(((-70, 0.45), (-38, 0.75), (0, 1.0), (38, 0.75), (70, 0.45))):
        r = math.radians(a)
        lobe = blob(f"Lobe{i}", (0, 0, 0), (0.075 * s + 0.01, 0.045 * s + 0.01, 0.042 * s), pastry)
        lobe.location = (0.06 * math.sin(r), 0.06 * (1 - math.cos(r)), 0.02 * s)
        lobe.rotation_euler = (0, 0, r)
        parts.append(lobe)
    return parts


def sandwich():
    bread = L.make_mat("IT_Sandwich_Bread", "#f2d49b", 0.9, "noise", 0.05, accent="#e0bb76")
    crust = L.make_mat("IT_Sandwich_Crust", "#b9772f", 0.9, "noise", 0.05)
    lettuce = L.make_mat("IT_Sandwich_Lettuce", "#7ccf4a", 0.7, "noise", 0.08)
    tomato = L.make_mat("IT_Sandwich_Tomato", "#e24b4a", 0.5, "noise", 0.05)
    tri = [(-0.06, -0.05), (0.06, -0.05), (0.0, 0.06)]
    small = [(x * 1.03, y * 1.03) for x, y in tri]
    big = [(x * 1.06, y * 1.06) for x, y in tri]
    return [
        prism("BreadLow", tri, 0.0, 0.016, bread),
        prism("Lettuce", big, 0.016, 0.006, lettuce),
        prism("Tomato", small, 0.022, 0.007, tomato),
        prism("BreadHigh", tri, 0.029, 0.016, bread),
        prism("CrustLow", [(-0.062, -0.052), (0.062, -0.052), (0.062, -0.047), (-0.062, -0.047)], 0.0, 0.016, crust),
        prism("CrustHigh", [(-0.062, -0.052), (0.062, -0.052), (0.062, -0.047), (-0.062, -0.047)], 0.029, 0.016, crust),
    ]


def cookie():
    dough = L.make_mat("IT_Cookie", "#d99a55", 0.85, "noise", 0.08)
    chips = L.make_mat("IT_Cookie_Chips", "#4a2a17", 0.6, "noise", 0.03)
    parts = [tube("Cookie", 0.045, 0.043, 0.0, 0.012, dough, seg=14)]
    for i, (x, y) in enumerate(((0.015, 0.01), (-0.018, 0.016), (0.0, -0.02), (-0.022, -0.012), (0.025, -0.015))):
        parts.append(cube(f"Chip{i}", (x, y, 0.0135), (0.008, 0.008, 0.004), chips))
    return parts


def fish(grilled):
    key = "Grilled" if grilled else "Raw"
    body = L.make_mat(f"IT_Fish{key}", "#c88a3e" if grilled else "#9fb7c9", 0.7, "noise", 0.08,
                      accent="#8f5a22" if grilled else "#7f9bb0")
    fin = L.make_mat(f"IT_Fish{key}Fin", "#8f5a22" if grilled else "#e88f7a", 0.7, "noise", 0.04)
    parts = [
        blob("Body", (0.0, 0.0, 0.022), (0.16, 0.05, 0.044), body, seg=10, rings=6),
        prism("Tail", [(0.075, 0.0), (0.115, -0.03), (0.115, 0.03)], 0.016, 0.012, fin),
        blob("Eye", (-0.06, -0.018, 0.03), (0.01, 0.006, 0.01), fin, seg=6, rings=4),
    ]
    if grilled:
        marks = L.make_mat("IT_FishGrillMarks", "#3b2410", 0.8, "noise", 0.02)
        for i in range(3):
            parts.append(cube(f"Mark{i}", (-0.03 + i * 0.03, 0.0, 0.044), (0.006, 0.05, 0.002), marks))
    else:
        parts.append(cube("Leaf", (0.0, 0.0, 0.0015), (0.2, 0.08, 0.003), L.make_mat("IT_FishLeaf", "#5bbf6a", 0.8, "noise", 0.05)))
    return parts


def watch():
    strap = L.make_mat("IT_Watch_Strap", "#5b4a6e", 0.7, "noise", 0.04)
    case = L.make_mat("IT_Watch_Case", "#e8e2f4", 0.35, "noise", 0.02)
    screen = L.make_mat("IT_Watch_Screen", "#1d1b26", 0.3, "noise", 0.01)
    radius = 0.03
    parts = [
        strap_ring("Strap", radius, 0.022, 0.004, strap),
        cube("Case", (0.0, 0.0, radius + 0.008), (0.036, 0.042, 0.012), case),
    ]
    # the screen is its own node: the game swaps its material for a live canvas
    bm = bmesh.new()
    for v in ((-0.015, -0.018), (0.015, -0.018), (0.015, 0.018), (-0.015, 0.018)):
        bm.verts.new((v[0], v[1], radius + 0.0155))
    face = bm.faces.new(bm.verts)
    uv = bm.loops.layers.uv.verify()
    for loop in face.loops:
        loop[uv].uv = ((loop.vert.co.x + 0.015) / 0.03, (loop.vert.co.y + 0.018) / 0.036)
    me = bpy.data.meshes.new("Screen")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(screen)
    scr = bpy.data.objects.new("Screen", me)
    coll.objects.link(scr)
    return parts, scr


def drinking_fountain():
    stone = L.make_mat("PK_Fountain_Stone", "#cfc6b8", 0.9, "tiles", 0.06, accent="#b8ad9c")
    metal = L.make_mat("PK_Fountain_Metal", "#9aa7b4", 0.35, "noise", 0.03)
    water = L.make_mat("PK_Fountain_Water", "#7cc6e8", 0.15, "noise", 0.05, emit="#7cc6e8", emit_strength=0.3)
    return [
        cube("Base", (0, 0, 0.04), (0.5, 0.5, 0.08), stone),
        tube("Column", 0.13, 0.11, 0.08, 0.78, stone, seg=10),
        tube("Basin", 0.17, 0.24, 0.86, 0.1, metal, seg=12),
        tube("Water", 0.2, 0.2, 0.93, 0.015, water, seg=12),
        tube("Spout", 0.018, 0.012, 0.94, 0.09, metal, seg=6, x=-0.12),
    ]


# ---------------------------------------------------------------- export + preview
def preview(obj, path):
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    ctr = sum(corners, Vector()) / 8
    cam_data = bpy.data.cameras.new("PV_cam")
    cam_data.type = "ORTHO"
    cam = bpy.data.objects.new("PV_cam", cam_data)
    sc.collection.objects.link(cam)
    cam.location = ctr + Vector((0.5, -0.9, 0.7)).normalized() * 3
    cam.rotation_euler = (ctr - cam.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.view_layer.update()
    inv = cam.matrix_world.inverted()
    pts = [inv @ c for c in corners]
    w = max(p.x for p in pts) - min(p.x for p in pts)
    h = max(p.y for p in pts) - min(p.y for p in pts)
    cam_data.ortho_scale = max(w, h) * 1.12
    cam_data.shift_x = (max(p.x for p in pts) + min(p.x for p in pts)) / 2 / cam_data.ortho_scale
    cam_data.shift_y = (max(p.y for p in pts) + min(p.y for p in pts)) / 2 / cam_data.ortho_scale
    sc.camera = cam
    sun = bpy.data.objects.new("PV_sun", bpy.data.lights.new("PV_sun", "SUN"))
    sun.data.energy = 2.6
    sun.rotation_euler = (0.8, 0.3, 0.7)
    sc.collection.objects.link(sun)
    sc.render.engine = "BLENDER_EEVEE"
    if sc.world is None:
        sc.world = bpy.data.worlds.new("PV_world")
        sc.world.use_nodes = True
        bg = next(n for n in sc.world.node_tree.nodes if n.type == "BACKGROUND")
        bg.inputs[0].default_value = (0.42, 0.45, 0.55, 1.0)
        bg.inputs[1].default_value = 0.9
    sc.view_settings.view_transform = "Standard"
    sc.render.resolution_x = sc.render.resolution_y = 512
    sc.render.film_transparent = True
    sc.render.filepath = path
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    hidden = [o for o in sc.objects if o.type == "MESH" and o is not obj and not o.hide_render]
    for o in hidden:
        o.hide_render = True
    with contextlib.redirect_stdout(io.StringIO()):
        bpy.ops.render.render(write_still=True)
    for o in hidden:
        o.hide_render = False
    bpy.data.objects.remove(cam, do_unlink=True)
    bpy.data.objects.remove(sun, do_unlink=True)


def ship(category, key, parts, extra=()):
    obj = L.join(coll, key, parts)
    # join() puts the origin at the parts' centre-bottom: moving it to 0 lifts the item onto the ground. Extra
    # nodes (the watch screen) stay separate and get the same move.
    shift = -obj.location.copy()
    obj.location = (0, 0, 0)
    for e in extra:
        e.location += shift
    bpy.context.view_layer.update()
    low = min((obj.matrix_world @ Vector(c)).z for c in obj.bound_box)
    for e in extra:
        e.location.z -= low
    obj.location.z -= low
    bpy.context.view_layer.update()
    out = os.path.join(L.OUT_ROOT, *category, key)
    os.makedirs(out, exist_ok=True)
    L.export_glb(os.path.join(out, "model.glb"), [obj, *extra])
    preview(obj, os.path.join(out, "preview.png"))
    tris = sum(len(p.vertices) - 2 for o in (obj, *extra) for p in o.data.polygons)
    obj.location.x += 0.6 * len(results)
    return {"key": key, "tris": tris, "dims": tuple(round(x, 3) for x in obj.dimensions)}


FOOD = {
    "coffee": coffee,
    "orange_juice": orange_juice,
    "water_bottle": water_bottle,
    "croissant": croissant,
    "sandwich": sandwich,
    "cookie": cookie,
    "fish_raw": lambda: fish(False),
    "fish_grilled": lambda: fish(True),
}

results = []
for key, build in FOOD.items():
    if ONLY and key not in ONLY:
        continue
    results.append(ship(("items", "food"), key, build()))
if not ONLY or "watch" in ONLY:
    parts, screen = watch()
    results.append(ship(("items", "tools"), "watch", parts, extra=(screen,)))
if not ONLY or "drinking_fountain" in ONLY:
    results.append(ship(("park",), "drinking_fountain", drinking_fountain()))
print(results)
