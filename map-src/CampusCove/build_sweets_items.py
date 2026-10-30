"""Candy Cloud sweets: six hand-held consumables (codes candy_<key>, backend/app/Support/FoodCatalog.php group `sweets`).

Same contract as build_food_items.py: metres, origin centre-bottom, a few hundred triangles, IT_ materials,
out/items/sweets/<key>/{model.glb,preview.png}. Then `cd front && npm run assets:optimize -- items`.
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
from mathutils import Vector

sc = L.new_build_scene("ITEMS_sweets")
coll = bpy.data.collections.new("Sweets")
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
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r0, radius2=r1, depth=h)
    for v in bm.verts:
        v.co += Vector((x, y, z0 + h / 2))
    return finish(name, bm, mat)


def blob(name, center, size, mat, seg=8, rings=5):
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


def disc(name, r, z0, h, mat, seg=16, y=0.0):
    """A flat disc standing upright (lollipop head), thickness along Y."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=h)
    for v in bm.verts:
        v.co = Vector((v.co.x, v.co.z + y, v.co.y + z0))
    return finish(name, bm, mat)


def preview(obj, path):
    cam_data = bpy.data.cameras.new("SW_cam")
    cam_data.type = "ORTHO"
    cam = bpy.data.objects.new("SW_cam", cam_data)
    sc.collection.objects.link(cam)
    size = max(obj.dimensions)
    cam_data.ortho_scale = size * 1.5
    c = obj.location + Vector((0, 0, obj.dimensions.z / 2))
    cam.location = c + Vector((1.0, -1.4, 0.9)).normalized() * 3.0
    cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
    sc.camera = cam
    sc.render.engine = "BLENDER_WORKBENCH"
    sh = sc.display.shading
    sh.light = "STUDIO"
    sh.color_type = "TEXTURE"
    sh.show_shadows = False
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


def ship(key, parts):
    obj = L.join(coll, key, parts)
    obj.location = (0, 0, 0)
    bpy.context.view_layer.update()
    low = min((obj.matrix_world @ Vector(c)).z for c in obj.bound_box)
    obj.location.z -= low
    bpy.context.view_layer.update()
    out = os.path.join(L.OUT_ROOT, "items", "sweets", key)
    os.makedirs(out, exist_ok=True)
    L.export_glb(os.path.join(out, "model.glb"), [obj])
    preview(obj, os.path.join(out, "preview.png"))
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    obj.location.x += 0.6 * len(results)
    return {"key": key, "tris": tris, "dims": tuple(round(x, 3) for x in obj.dimensions)}


# ---------------------------------------------------------------- the sweets
def cotton_candy():
    cone = L.make_mat("IT_Cotton_Cone", "#f4efe6", 0.8, "stripes", 0.04, accent="#e8b4c8")
    fluff = L.make_mat("IT_Cotton_Fluff", "#f8b6d2", 0.95, "noise", 0.08, accent="#fbd2e3")
    fluff2 = L.make_mat("IT_Cotton_FluffLight", "#fcd9e8", 0.95, "noise", 0.08)
    return [
        tube("Cone", 0.008, 0.012, 0.0, 0.16, cone, seg=8),
        blob("Fluff", (0, 0, 0.25), (0.17, 0.16, 0.2), fluff),
        blob("Fluff2", (0.05, -0.03, 0.31), (0.11, 0.1, 0.11), fluff2),
        blob("Fluff3", (-0.05, 0.03, 0.2), (0.1, 0.1, 0.1), fluff2),
    ]


def lollipop():
    stick = L.make_mat("IT_Lolly_Stick", "#f4f4f0", 0.7, "noise", 0.02)
    swirl = L.make_mat("IT_Lolly_Swirl", "#e0534f", 0.35, "stripes", 0.03, accent="#fdfbf5")
    core = L.make_mat("IT_Lolly_Core", "#f6d04d", 0.35, "noise", 0.03)
    return [
        tube("Stick", 0.004, 0.004, 0.0, 0.13, stick, seg=6),
        disc("Head", 0.045, 0.165, 0.016, swirl, seg=20),
        disc("Core", 0.02, 0.165, 0.02, core, seg=12),
    ]


def candy_bag():
    bag = L.make_mat("IT_Bag_Paper", "#f7a1c4", 0.85, "noise", 0.04, accent="#f28bb6")
    label = L.make_mat("IT_Bag_Label", "#fdfbf5", 0.8, "noise", 0.02)
    gummies = [L.make_mat(f"IT_Bag_Gummy{i}", c, 0.4, "noise", 0.04) for i, c in enumerate(("#e0534f", "#f6d04d", "#79b765", "#38a3c9"))]
    parts = [
        cube("Bag", (0, 0, 0.075), (0.11, 0.045, 0.15), bag),
        cube("Crimp", (0, 0, 0.158), (0.12, 0.02, 0.02), bag),
        cube("Label", (0, -0.024, 0.07), (0.07, 0.004, 0.05), label),
    ]
    for i in range(4):
        parts.append(blob(f"Gummy{i}", (-0.03 + i * 0.02, -0.027, 0.11 + 0.012 * (i % 2)), (0.018, 0.012, 0.022), gummies[i]))
    return parts


def licorice():
    black = L.make_mat("IT_Licorice_Black", "#1d1a1f", 0.55, "stripes", 0.03, accent="#2b262e")
    band = L.make_mat("IT_Licorice_Band", "#e0534f", 0.7, "noise", 0.02)
    parts = []
    for i, (x, y) in enumerate(((-0.012, -0.012), (0.012, -0.012), (-0.012, 0.012), (0.012, 0.012))):
        parts.append(tube(f"Twist{i}", 0.011, 0.011, 0.0, 0.17, black, seg=8, x=x, y=y))
    parts.append(tube("Band", 0.03, 0.03, 0.07, 0.03, band, seg=10))
    return parts


def bubble_gum():
    pack = L.make_mat("IT_Gum_Pack", "#38a3c9", 0.6, "noise", 0.03)
    foil = L.make_mat("IT_Gum_Foil", "#d9dde2", 0.3, "noise", 0.03)
    label = L.make_mat("IT_Gum_Label", "#fdfbf5", 0.7, "noise", 0.02)
    return [
        cube("Pack", (0, 0, 0.035), (0.075, 0.02, 0.07), pack),
        cube("Label", (0, -0.0115, 0.035), (0.05, 0.003, 0.03), label),
        cube("Stick", (0.02, -0.004, 0.08), (0.012, 0.004, 0.03), foil),
        cube("Stick2", (0.032, -0.004, 0.075), (0.012, 0.004, 0.025), foil),
    ]


def candy_apple():
    stick = L.make_mat("IT_Apple_Stick", "#c9a36a", 0.8, "noise", 0.04)
    glaze = L.make_mat("IT_Apple_Glaze", "#b5121b", 0.15, "noise", 0.04, accent="#d9473a")
    drip = L.make_mat("IT_Apple_Drip", "#8f0c14", 0.2, "noise", 0.03)
    return [
        tube("Stick", 0.005, 0.005, 0.0, 0.14, stick, seg=6),
        blob("Apple", (0, 0, 0.175), (0.085, 0.085, 0.085), glaze, seg=12, rings=8),
        blob("Drip", (0.03, -0.02, 0.14), (0.02, 0.02, 0.03), drip),
        blob("Drip2", (-0.025, 0.025, 0.145), (0.018, 0.018, 0.025), drip),
    ]


SWEETS = {
    "cotton_candy": cotton_candy,
    "lollipop": lollipop,
    "candy_bag": candy_bag,
    "licorice": licorice,
    "bubble_gum": bubble_gum,
    "candy_apple": candy_apple,
}
results = []
for key, build in SWEETS.items():
    results.append(ship(key, build()))
print("SWEETS", results)
