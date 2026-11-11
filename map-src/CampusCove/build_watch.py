"""First-person survival watch: the `make model` smartwatch, turned to the forearm frame, with a flat `Screen`.

Source: `make model "a single square smartwatch with a closed strap loop and a blank black screen" HEIGHT=0.1 TRIS=600`
(map-src/CampusCove/out/ai/<SLUG>/). The game draws hunger and thirst on the `Screen` node and fits the strap
around each forearm at load time from the `strapInnerHalf` extra (front/src/game/watchFit.ts).

Frame of the export (glTF): +Y out of the face, -Z towards the hand, origin at the centre of the strap opening.
Output: out/items/tools/watch/{model.glb,preview.png}. Then `cd front && npm run assets:optimize -- items tools`.
"""
import importlib
import os
import statistics
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

SLUG = "a_single_square_smartwatch_with_a_closed"
CASE_LENGTH = 0.04
SCREEN_INSET = 0.8
SCREEN_ASPECT = 120 / 144
SCREEN_LIFT = 0.0004
CASE_MARGIN = 0.003
AI_TO_FOREARM = Matrix(((0, 0, -1), (1, 0, 0), (0, -1, 0))).to_4x4()

sc = L.new_build_scene("ITEMS_watch")
coll = sc.collection


def strap_opening(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    cut = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, 0), plane_no=(0, 1, 0))
    points = [g.co.copy() for g in cut["geom_cut"] if isinstance(g, bmesh.types.BMVert)]
    bm.free()
    if not points:
        raise RuntimeError(f"{obj.name}: the plane across the strap cuts nothing")
    centroid = sum(points, Vector()) / len(points)
    median = statistics.median((p - centroid).length for p in points)
    inner = [p for p in points if (p - centroid).length < median]
    lo = Vector((min(p.x for p in inner), 0, min(p.z for p in inner)))
    hi = Vector((max(p.x for p in inner), 0, max(p.z for p in inner)))
    return (lo + hi) / 2, min(hi.x - lo.x, hi.z - lo.z) / 2


def face_top(obj):
    top = max(v.co.z for v in obj.data.vertices)
    faces = [p for p in obj.data.polygons if p.normal.z > 0.97 and p.center.z > top - 0.003]
    if not faces:
        raise RuntimeError(f"{obj.name}: no flat face on top of the case")
    pts = [obj.data.vertices[i].co for p in faces for i in p.vertices]
    return top, Vector((min(p.x for p in pts), min(p.y for p in pts))), Vector((max(p.x for p in pts), max(p.y for p in pts)))


def paint(obj, inner_half, lo, hi, case, strap):
    obj.data.materials.clear()
    obj.data.materials.append(case)
    obj.data.materials.append(strap)
    half_length = (hi.y - lo.y) / 2 + CASE_MARGIN
    for p in obj.data.polygons:
        c = p.center
        on_case = c.z > inner_half and lo.x - CASE_MARGIN < c.x < hi.x + CASE_MARGIN and abs(c.y) < half_length
        p.material_index = 0 if on_case else 1


def screen(top, lo, hi, material):
    centre = (lo + hi) / 2
    along = (hi.y - lo.y) * SCREEN_INSET
    across = (hi.x - lo.x) * SCREEN_INSET
    along, across = min(along, across * SCREEN_ASPECT), min(across, along / SCREEN_ASPECT)
    bm = bmesh.new()
    corners = [(-1, -1), (-1, 1), (1, 1), (1, -1)]
    for sx, sy in corners:
        bm.verts.new((centre.x + sx * across / 2, centre.y + sy * along / 2, top + SCREEN_LIFT))
    face = bm.faces.new(bm.verts)
    face.normal_update()
    if face.normal.z < 0:
        face.normal_flip()
    uv = bm.loops.layers.uv.verify()
    for loop in face.loops:
        co = loop.vert.co
        loop[uv].uv = ((co.y - (centre.y - along / 2)) / along, ((centre.x + across / 2) - co.x) / across)
    me = bpy.data.meshes.new("Screen")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material)
    obj = bpy.data.objects.new("Screen", me)
    if obj.name != "Screen":
        raise RuntimeError(f"another Blender object is already named Screen, the game would not find {obj.name}")
    coll.objects.link(obj)
    return obj


meshes = L.import_ai_model(coll, SLUG, "IT_Watch")
if len(meshes) != 1:
    raise RuntimeError(f"out/ai/{SLUG}/model.glb: expected one mesh, got {len(meshes)}")
watch = meshes[0]
watch.name = "Watch"
watch.data.transform(watch.matrix_world)
watch.matrix_world = Matrix.Identity(4)
watch.data.transform(AI_TO_FOREARM)
centre, _ = strap_opening(watch)
watch.data.transform(Matrix.Translation(-centre))
top, lo, hi = face_top(watch)
watch.data.transform(Matrix.Scale(CASE_LENGTH / (hi.y - lo.y), 4))
watch.data.update()
_, inner_half = strap_opening(watch)
top, lo, hi = face_top(watch)
watch["strapInnerHalf"] = round(inner_half, 5)
paint(watch, inner_half, lo, hi, L.make_mat("IT_Watch_Case", "#ece8fa", 0.35, "noise", 0.02), L.make_mat("IT_Watch_Strap", "#c4b2e8", 0.7, "noise", 0.03))
scr = screen(top, lo, hi, L.make_mat("IT_Watch_Screen", "#1d1b26", 0.3, "noise", 0.01))

out = os.path.join(L.OUT_ROOT, "items", "tools", "watch")
L.export_glb(os.path.join(out, "model.glb"), [watch, scr], export_extras=True)
L.render_preview(sc, watch, os.path.join(out, "preview.png"))
print({"tris": sum(len(p.vertices) - 2 for o in (watch, scr) for p in o.data.polygons), "dims": tuple(round(x, 3) for x in watch.dimensions), "strapInnerHalf": watch["strapInnerHalf"]})
