"""Crispin's Hardware range: six placeable decoration assets (codes decor_<key>, sold in the mall's hardware store).

Decor contract (docs/ASSETS_STYLE_GUIDE.md §6): metres, origin centre-bottom on the floor, front facing game +Z,
DC_ materials, ~600 triangles. Outputs out/decor/<key>/model.glb, front/public/assets/decor/<key>/preview.png and
out/decor/hardware.manifest.json (game [w, h, d] per key, read by build_crispins.py). Then `cd front && npm run
assets:optimize -- decor` and `node scripts/apply-decor-collision.mjs` for the collision.json sidecars.
"""
import contextlib
import importlib
import io
import json
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
import bpy
from mathutils import Vector

sc = L.new_build_scene("DECOR_hardware")
PUBLIC = os.path.normpath(os.path.join(L.OUT_ROOT, "..", "..", "..", "front", "public", "assets"))
coll = bpy.data.collections.new("Hardware")
sc.collection.children.link(coll)
M = {
    "wood": L.make_mat("DC_HwWood", "#c9a36a", 0.75, "planks", 0.05, accent="#a98550"),
    "steel": L.make_mat("DC_HwSteel", "#8f959c", 0.4, "noise", 0.03),
    "dark": L.make_mat("DC_HwDark", "#2f3338", 0.55, "noise", 0.03),
    "orange": L.make_mat("DC_HwOrange", "#e07a2e", 0.6, "noise", 0.03),
    "red": L.make_mat("DC_HwRed", "#c8352b", 0.55, "noise", 0.03),
    "alu": L.make_mat("DC_HwAlu", "#d6d9dd", 0.3, "noise", 0.02),
    "rubber": L.make_mat("DC_HwRubber", "#1d1f24", 0.9, "noise", 0.02),
    "green": L.make_mat("DC_HwGreen", "#3c7a3c", 0.6, "noise", 0.03),
    "carton": L.make_mat("DC_HwCarton", "#b98c5a", 0.9, "stripes", 0.04, accent="#a47a4c"),
    "label": L.make_mat("DC_HwLabel", "#f7f4ec", 0.7, "noise", 0.02),
    "paint_blue": L.make_mat("DC_HwPaintBlue", "#1f5fae", 0.5, "noise", 0.02),
    "paint_yellow": L.make_mat("DC_HwPaintYellow", "#f6d04d", 0.5, "noise", 0.02),
    "paint_red": L.make_mat("DC_HwPaintRed", "#d9473a", 0.5, "noise", 0.02),
    "paint_green": L.make_mat("DC_HwPaintGreen", "#79b765", 0.5, "noise", 0.02),
}


def wheel(name, gx, gz, y, r, w, mat):
    o = L.cyl(coll, name, gx, gz, y - w / 2, r, w, mat, seg=12)
    o.rotation_euler = (math.pi / 2, 0.0, 0.0)
    o.location.z = y
    return o


def preview(obj, path):
    cam_data = bpy.data.cameras.new("HW_cam")
    cam_data.type = "ORTHO"
    cam = bpy.data.objects.new("HW_cam", cam_data)
    sc.collection.objects.link(cam)
    cam_data.ortho_scale = max(obj.dimensions) * 1.45
    c = obj.location + Vector((0, 0, obj.dimensions.z / 2))
    cam.location = c + Vector((1.0, -1.4, 0.8)).normalized() * 6.0
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


def workbench():
    parts = [
        L.box(coll, "Top", 0, 0, 0.86, 1.6, 0.7, 0.06, M["wood"], bevel=0.01),
        L.box(coll, "Shelf", 0, 0, 0.18, 1.5, 0.6, 0.03, M["wood"]),
        L.box(coll, "Vice", 0.55, 0.3, 0.92, 0.18, 0.16, 0.14, M["dark"], bevel=0.01),
        L.box(coll, "Hammer", -0.3, 0.1, 0.92, 0.28, 0.04, 0.03, M["wood"]),
        L.box(coll, "HammerHead", -0.42, 0.1, 0.92, 0.06, 0.1, 0.06, M["steel"]),
        L.box(coll, "Crate", 0.3, 0, 0.21, 0.5, 0.4, 0.3, M["carton"], bevel=0.01),
    ]
    for gx, gz in ((-0.74, -0.3), (0.74, -0.3), (-0.74, 0.3), (0.74, 0.3)):
        parts.append(L.box(coll, "Leg", gx, gz, 0.0, 0.08, 0.08, 0.86, M["steel"]))
    for i in range(5):
        parts.append(L.cyl(coll, f"Tool{i}", -0.6 + i * 0.1, -0.28, 0.92, 0.012, 0.16 + 0.04 * (i % 2), M["orange"] if i % 2 else M["steel"], seg=6))
    return parts


def stepladder():
    parts = []
    for gx in (-0.22, 0.22):
        parts.append(L.box(coll, "Rail", gx, 0, 0.0, 0.05, 0.08, 1.7, M["alu"]))
        parts.append(L.box(coll, "RailBack", gx, 0.46, 0.0, 0.05, 0.05, 1.7, M["alu"]))
        parts.append(L.box(coll, "Foot", gx, 0.23, 0.0, 0.06, 0.6, 0.03, M["rubber"]))
    for i in range(5):
        parts.append(L.box(coll, f"Step{i}", 0, 0, 0.3 + i * 0.33, 0.44, 0.1, 0.03, M["alu"]))
    parts.append(L.box(coll, "Platform", 0, 0.23, 1.7, 0.5, 0.5, 0.04, M["orange"], bevel=0.01))
    parts.append(L.box(coll, "Brace", 0, 0.23, 1.0, 0.44, 0.44, 0.02, M["alu"]))
    return parts


def toolbox():
    return [
        L.box(coll, "Body", 0, 0, 0.0, 0.5, 0.24, 0.2, M["red"], bevel=0.01),
        L.box(coll, "Lid", 0, 0, 0.2, 0.52, 0.26, 0.08, M["red"], bevel=0.012),
        L.box(coll, "Handle", 0, 0, 0.3, 0.2, 0.03, 0.03, M["dark"]),
        L.box(coll, "HandleL", -0.09, 0, 0.28, 0.02, 0.03, 0.04, M["dark"]),
        L.box(coll, "HandleR", 0.09, 0, 0.28, 0.02, 0.03, 0.04, M["dark"]),
        L.box(coll, "Latch", 0, -0.125, 0.17, 0.06, 0.01, 0.05, M["alu"]),
        L.box(coll, "Label", 0.12, -0.122, 0.07, 0.14, 0.004, 0.06, M["label"]),
    ]


def paint_cans():
    parts = [L.box(coll, "Pallet", 0, 0, 0.0, 0.8, 0.8, 0.1, M["wood"])]
    for i, (gx, gz, m) in enumerate(((-0.2, -0.2, "paint_blue"), (0.2, -0.2, "paint_yellow"), (-0.2, 0.2, "paint_red"), (0.2, 0.2, "paint_green"))):
        parts.append(L.cyl(coll, f"Can{i}", gx, gz, 0.1, 0.15, 0.3, M["alu"], seg=12))
        parts.append(L.cyl(coll, f"Lid{i}", gx, gz, 0.4, 0.15, 0.02, M[m], seg=12))
        parts.append(L.cyl(coll, f"Label{i}", gx, gz, 0.17, 0.152, 0.14, M[m], seg=12))
    parts.append(L.cyl(coll, "TopCan", 0, 0, 0.42, 0.13, 0.26, M["alu"], seg=12))
    parts.append(L.cyl(coll, "TopLid", 0, 0, 0.68, 0.13, 0.02, M["paint_blue"], seg=12))
    return parts


def wheelbarrow():
    parts = [
        L.box(coll, "Tray", 0, 0, 0.35, 0.6, 0.9, 0.3, M["green"], bevel=0.02),
        L.box(coll, "TrayInner", 0, 0, 0.55, 0.5, 0.8, 0.12, M["dark"]),
        L.box(coll, "FrameL", -0.22, 0.25, 0.3, 0.04, 1.3, 0.04, M["steel"], rot=0.0),
        L.box(coll, "FrameR", 0.22, 0.25, 0.3, 0.04, 1.3, 0.04, M["steel"]),
        L.box(coll, "GripL", -0.22, 0.85, 0.3, 0.05, 0.14, 0.05, M["rubber"]),
        L.box(coll, "GripR", 0.22, 0.85, 0.3, 0.05, 0.14, 0.05, M["rubber"]),
        L.box(coll, "LegL", -0.2, 0.4, 0.0, 0.04, 0.04, 0.3, M["steel"]),
        L.box(coll, "LegR", 0.2, 0.4, 0.0, 0.04, 0.04, 0.3, M["steel"]),
        L.box(coll, "Fork", 0, -0.5, 0.12, 0.3, 0.04, 0.2, M["steel"]),
        wheel("Wheel", 0, -0.5, 0.16, 0.16, 0.08, M["rubber"]),
    ]
    return parts


def metal_shelving():
    parts = []
    for gx, gz in ((-0.88, -0.23), (0.88, -0.23), (-0.88, 0.23), (0.88, 0.23)):
        parts.append(L.box(coll, "Post", gx, gz, 0.0, 0.05, 0.05, 1.8, M["orange"]))
    for lv, y in enumerate((0.06, 0.62, 1.18, 1.74)):
        parts.append(L.box(coll, f"Shelf{lv}", 0, 0, y, 1.8, 0.5, 0.04, M["steel"]))
    for lv, y in enumerate((0.1, 0.66, 1.22)):
        for k in range(3):
            parts.append(L.box(coll, f"Box{lv}_{k}", -0.55 + k * 0.55, 0, y, 0.45, 0.4, 0.3 + 0.08 * ((k + lv) % 2), M["carton"], bevel=0.01))
    return parts


ITEMS = {
    "workbench": workbench,
    "stepladder": stepladder,
    "toolbox": toolbox,
    "paint_cans": paint_cans,
    "wheelbarrow": wheelbarrow,
    "metal_shelving": metal_shelving,
}
manifest = {}
results = []
for i, (key, build) in enumerate(ITEMS.items()):
    obj = L.join(coll, key, build())
    obj.location = (0, 0, 0)
    bpy.context.view_layer.update()
    low = min((obj.matrix_world @ Vector(c)).z for c in obj.bound_box)
    obj.location.z -= low
    bpy.context.view_layer.update()
    out = os.path.join(L.OUT_ROOT, "decor", key)
    os.makedirs(out, exist_ok=True)
    L.export_glb(os.path.join(out, "model.glb"), [obj])
    os.makedirs(os.path.join(PUBLIC, "decor", key), exist_ok=True)
    preview(obj, os.path.join(PUBLIC, "decor", key, "preview.png"))
    d = obj.dimensions
    manifest[key] = [round(d.x, 3), round(d.z, 3), round(d.y, 3)]
    results.append((key, sum(len(p.vertices) - 2 for p in obj.data.polygons), manifest[key]))
    obj.location.x += 3.0 * (i + 1)
L.write_json(os.path.join(L.OUT_ROOT, "decor", "hardware.manifest.json"), manifest)
print("HARDWARE", results)
