"""The Salty Shamrock drinks: one glass per alcoholic drink (docs/PUB.md, section 2).

Outputs: out/items/drinks/<key>/{model.glb,preview.png}   (codes drink_<key>)
Same contract as build_food_items.py (origin at the centre-bottom, real size in hand, 512 px preview).
Then `cd front && npm run assets:optimize -- items`.
"""
import contextlib
import importlib
import io
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

sc = L.new_build_scene("ITEMS_drinks")
coll = bpy.data.collections.new("DrinkItems")
sc.collection.children.link(coll)

GLASS = L.make_mat("IT_Drink_Glass", "#cfe4ee", 0.08, "noise", 0.01, alpha=0.16)
ICE = L.make_mat("IT_Drink_Ice", "#eaf6fb", 0.15, "noise", 0.02, alpha=0.7)


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


def tube(name, r0, r1, z0, h, mat, seg=12):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r0, radius2=r1, depth=h)
    for v in bm.verts:
        v.co.z += z0 + h / 2
    return finish(name, bm, mat)


def cube(name, center, size, mat):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2])) + Vector(center)
    return finish(name, bm, mat)


def pint(liquid, foam):
    return [
        tube("Glass", 0.034, 0.041, 0.0, 0.152, GLASS),
        tube("Liquid", 0.031, 0.037, 0.006, 0.118, liquid),
        tube("Foam", 0.037, 0.0385, 0.124, 0.024, foam),
    ]


def stout():
    return pint(L.make_mat("IT_Drink_Stout", "#1a0f0c", 0.25, "noise", 0.02),
                L.make_mat("IT_Drink_StoutFoam", "#f1e3c6", 0.8, "noise", 0.03))


def lager():
    return pint(L.make_mat("IT_Drink_Lager", "#f2b53b", 0.2, "noise", 0.04, accent="#e49a1c", alpha=0.78),
                L.make_mat("IT_Drink_LagerFoam", "#fbf8f0", 0.8, "noise", 0.02))


def red_wine():
    wine = L.make_mat("IT_Drink_RedWine", "#6e1226", 0.2, "noise", 0.03)
    return [
        tube("Base", 0.036, 0.03, 0.0, 0.006, GLASS, seg=14),
        tube("Stem", 0.006, 0.005, 0.006, 0.078, GLASS, seg=8),
        tube("BowlLow", 0.012, 0.039, 0.084, 0.03, GLASS, seg=14),
        tube("BowlHigh", 0.039, 0.03, 0.114, 0.066, GLASS, seg=14),
        tube("WineLow", 0.011, 0.0365, 0.087, 0.026, wine, seg=14),
        tube("WineHigh", 0.0365, 0.0355, 0.113, 0.016, wine, seg=14),
    ]


def whisky():
    amber = L.make_mat("IT_Drink_Whisky", "#c9731c", 0.15, "noise", 0.04, accent="#a85a10", alpha=0.85)
    return [
        tube("Glass", 0.037, 0.041, 0.0, 0.092, GLASS, seg=14),
        tube("Liquid", 0.034, 0.037, 0.01, 0.038, amber, seg=14),
        cube("Ice", (0.008, -0.006, 0.036), (0.026, 0.026, 0.026), ICE),
    ]


def vodka():
    clear = L.make_mat("IT_Drink_Vodka", "#eef8fc", 0.1, "noise", 0.01, alpha=0.4)
    return [
        tube("Glass", 0.017, 0.024, 0.0, 0.066, GLASS),
        tube("Liquid", 0.016, 0.0215, 0.008, 0.05, clear),
    ]


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


def ship(key, parts):
    obj = L.join(coll, key, parts)
    obj.location = (0, 0, 0)
    bpy.context.view_layer.update()
    low = min((obj.matrix_world @ Vector(c)).z for c in obj.bound_box)
    obj.location.z -= low
    bpy.context.view_layer.update()
    out = os.path.join(L.OUT_ROOT, "items", "drinks", key)
    os.makedirs(out, exist_ok=True)
    L.export_glb(os.path.join(out, "model.glb"), [obj])
    preview(obj, os.path.join(out, "preview.png"))
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    obj.location.x += 0.3 * len(results)
    return {"key": key, "tris": tris, "dims": tuple(round(x, 3) for x in obj.dimensions)}


DRINKS = {"stout": stout, "lager": lager, "red_wine": red_wine, "whisky": whisky, "vodka": vodka}
results = []
for key, build in DRINKS.items():
    results.append(ship(key, build()))
print(results)
