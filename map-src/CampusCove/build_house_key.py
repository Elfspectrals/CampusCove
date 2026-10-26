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

KEY = "house_key"
OUT = os.path.join(L.OUT_ROOT, "items", "tools", KEY)
THICK = 0.009

sc = L.new_build_scene("ITEM_" + KEY)
coll = bpy.data.collections.new("HouseKey")
sc.collection.children.link(coll)

brass = L.make_mat("IT_Key_Brass", "#e2a93b", 0.32, "noise", 0.04, accent="#c8891f")
brass_dark = L.make_mat("IT_Key_BrassDark", "#b9801c", 0.38, "noise", 0.03)
tag = L.make_mat("IT_Key_Tag", "#4ce3a0", 0.6, "noise", 0.03)
tag_edge = L.make_mat("IT_Key_TagEdge", "#189862", 0.6, "noise", 0.02)


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


def ring(name, center, radius, tube, mat, seg=14, tube_seg=5):
    bm = bmesh.new()
    rows = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        row = []
        for j in range(tube_seg):
            b = 2 * math.pi * j / tube_seg
            r = radius + tube * math.cos(b)
            row.append(bm.verts.new((center[0] + r * math.cos(a), center[1] + r * math.sin(a), center[2] + tube * math.sin(b))))
        rows.append(row)
    for i in range(seg):
        for j in range(tube_seg):
            a, b = rows[i], rows[(i + 1) % seg]
            bm.faces.new((a[j], b[j], b[(j + 1) % tube_seg], a[(j + 1) % tube_seg]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return finish(name, bm, [mat])


parts = []
parts.append(slab("Key_Bow", [(-0.030, -0.022), (0.012, -0.022), (0.012, 0.010), (-0.009, 0.030), (-0.030, 0.010)], 0.0, THICK, brass))
parts.append(slab("Key_BowDoor", [(-0.015, -0.022), (-0.003, -0.022), (-0.003, -0.004), (-0.015, -0.004)], THICK, 0.0015, brass_dark))
parts.append(slab("Key_Shaft", [(0.012, -0.0055), (0.118, -0.0055), (0.118, 0.0055), (0.012, 0.0055)], 0.0015, THICK - 0.003, brass))
parts.append(slab("Key_Collar", [(0.012, -0.009), (0.020, -0.009), (0.020, 0.009), (0.012, 0.009)], 0.0, THICK, brass_dark))
for i, (x0, depth) in enumerate(((0.078, 0.016), (0.092, 0.011), (0.104, 0.019))):
    parts.append(slab(f"Key_Tooth{i}", [(x0, -0.0055 - depth), (x0 + 0.010, -0.0055 - depth), (x0 + 0.010, -0.0055), (x0, -0.0055)], 0.0015, THICK - 0.003, brass))
parts.append(ring("Key_Ring", (-0.036, 0.034, 0.003), 0.016, 0.003, brass_dark))
parts.append(slab("Key_Tag", [(-0.074, 0.040), (-0.050, 0.052), (-0.042, 0.036), (-0.066, 0.024)], 0.0, 0.004, tag))
parts.append(slab("Key_TagHole", [(-0.052, 0.044), (-0.048, 0.046), (-0.046, 0.042), (-0.050, 0.040)], 0.004, 0.001, tag_edge))

key = L.join(coll, "HouseKey", parts)
key.location = (0, 0, 0)
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
sc.render.filepath = os.path.join(OUT, "render.png")
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
