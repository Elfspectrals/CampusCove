"""Lockpick tool (sold at Crispin's Hardware). Outputs: out/items/tools/lockpick/{model.glb,preview.png}. Then `npm run assets:optimize -- items`."""
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

KEY = "lockpick"
OUT = os.path.join(L.OUT_ROOT, "items", "tools", KEY)

sc = L.new_build_scene("ITEM_" + KEY)
coll = bpy.data.collections.new("Lockpick")
sc.collection.children.link(coll)

steel = L.make_mat("IT_Lockpick_Steel", "#b8c0c8", 0.28, "noise", 0.04, accent="#8e979f")
grip = L.make_mat("IT_Lockpick_Grip", "#1d1f24", 0.85, "noise", 0.03)
grip_edge = L.make_mat("IT_Lockpick_GripEdge", "#33363d", 0.8, "noise", 0.02)

HANDLE = 0.058
GRIP_THICK = 0.008
STEEL_THICK = 0.0016
SHAFT = 0.074
SHAFT_HALF = 0.0013


def finish(name, bm, mats):
    bm.normal_update()
    L._box_uv(bm, 0.05)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    return ob


def slab(name, outline, z0, thick, mat):
    bm = bmesh.new()
    lo = [bm.verts.new((x, y, z0)) for x, y in outline]
    hi = [bm.verts.new((x, y, z0 + thick)) for x, y in outline]
    bm.faces.new(lo[::-1])
    bm.faces.new(hi)
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return finish(name, bm, [mat])


steel_z = (GRIP_THICK - STEEL_THICK) / 2
tip = HANDLE + SHAFT
parts = [
    slab("Lockpick_Grip", [(0.0, -0.006), (HANDLE - 0.004, -0.0055), (HANDLE, -0.003), (HANDLE, 0.003), (HANDLE - 0.004, 0.0055), (0.0, 0.006), (-0.004, 0.003), (-0.004, -0.003)], 0.0, GRIP_THICK, grip),
    slab("Lockpick_GripBand", [(0.010, -0.0062), (0.016, -0.0062), (0.016, 0.0062), (0.010, 0.0062)], -0.0004, GRIP_THICK + 0.0008, grip_edge),
    slab("Lockpick_Shaft", [(HANDLE - 0.006, -SHAFT_HALF), (tip, -SHAFT_HALF), (tip, SHAFT_HALF), (HANDLE - 0.006, SHAFT_HALF)], steel_z, STEEL_THICK, steel),
    slab("Lockpick_Hook", [(tip - 0.004, SHAFT_HALF), (tip, SHAFT_HALF), (tip + 0.0015, 0.0045), (tip - 0.001, 0.0062), (tip - 0.0035, 0.0052), (tip - 0.002, 0.0035)], steel_z, STEEL_THICK, steel),
]

key = L.join(coll, "Lockpick", parts)
key.location = (0, 0, 0.0004)
bpy.context.view_layer.update()

tris = sum(len(p.vertices) - 2 for p in key.data.polygons)
low = min((key.matrix_world @ Vector(c)).z for c in key.bound_box)
if low < -0.001 or low > 0.03:
    raise RuntimeError(f"{KEY} not grounded (min z = {low})")

os.makedirs(OUT, exist_ok=True)
L.export_glb(os.path.join(OUT, "model.glb"), [key])

key.rotation_euler = (0, 0, math.radians(32))
bpy.context.view_layer.update()
corners = [key.matrix_world @ Vector(c) for c in key.bound_box]
ctr = sum(corners, Vector()) / 8
cam_data = bpy.data.cameras.new("PV_cam")
cam_data.type = "ORTHO"
cam = bpy.data.objects.new("PV_cam", cam_data)
sc.collection.objects.link(cam)
cam.location = ctr + Vector((0.12, -0.45, 1.0)).normalized() * 2
cam.rotation_euler = (ctr - cam.location).to_track_quat("-Z", "Y").to_euler()
bpy.context.view_layer.update()
inv = cam.matrix_world.inverted()
pts = [inv @ c for c in corners]
w = max(p.x for p in pts) - min(p.x for p in pts)
h = max(p.y for p in pts) - min(p.y for p in pts)
cam_data.ortho_scale = max(w, h) * 1.08
cam_data.shift_x = (max(p.x for p in pts) + min(p.x for p in pts)) / 2 / cam_data.ortho_scale
cam_data.shift_y = (max(p.y for p in pts) + min(p.y for p in pts)) / 2 / cam_data.ortho_scale
sc.camera = cam
sc.render.engine = "BLENDER_EEVEE"
sc.world = bpy.data.worlds.new("PV_world")
sc.world.use_nodes = True
bg = next(n for n in sc.world.node_tree.nodes if n.type == "BACKGROUND")
bg.inputs[0].default_value = (0.42, 0.45, 0.55, 1.0)
bg.inputs[1].default_value = 0.9
sun = bpy.data.objects.new("PV_sun", bpy.data.lights.new("PV_sun", "SUN"))
sun.data.energy = 2.6
sun.rotation_euler = (0.8, 0.3, 0.7)
sc.collection.objects.link(sun)
sc.view_settings.view_transform = "Standard"
sc.render.resolution_x = sc.render.resolution_y = 512
sc.render.film_transparent = True
sc.render.filepath = os.path.join(OUT, "preview.png")
sc.render.image_settings.file_format = "PNG"
sc.render.image_settings.color_mode = "RGBA"
old = bpy.context.window.scene
bpy.context.window.scene = sc
with contextlib.redirect_stdout(io.StringIO()):
    bpy.ops.render.render(write_still=True)
bpy.context.window.scene = old
bpy.data.objects.remove(cam, do_unlink=True)
bpy.data.objects.remove(sun, do_unlink=True)
key.rotation_euler = (0, 0, 0)

result = {"key": KEY, "tris": tris, "dims": tuple(round(x, 3) for x in key.dimensions), "out": OUT}
print(result)
