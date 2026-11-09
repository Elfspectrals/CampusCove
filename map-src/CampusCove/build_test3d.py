import importlib
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
from mathutils import Matrix, Vector

OUT = os.path.normpath(os.path.join(HERE, "../../front/public/assets/test3d/test3d.glb"))
AI_OUT = os.path.join(L.OUT_ROOT, "ai")
AI = {
    "frame": "a_single_empty_wooden_rocking_chair_with",
    "cushion": "a_single_soft_square_seat_cushion_lying_",
    "lantern_head": "a_single_wooden_lantern_head_with_a_poin",
}

sc = L.new_build_scene("TEST3D")
coll = sc.collection
M = {
    "wood": L.make_mat("T3_Wood", "#ffffff", rough=0.6, pattern="planks", var=0.06, accent="#b8b8b8"),
    "fabric": L.make_mat("T3_Fabric", "#ffffff", rough=0.95, pattern="noise", var=0.05),
    "glass": L.make_mat("T3_Glass", "#ffffff", rough=0.2, alpha=0.6, emit="#ffd28a", emit_strength=1.5),
}
pieces = []


def keep(o, name):
    o.name = name
    pieces.append(o)
    return o


def bounds(o):
    pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))), Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))


def ai_piece(key, mat):
    path = os.path.join(AI_OUT, AI[key], "model.glb")
    if not os.path.exists(path):
        raise FileNotFoundError(f"{path}: run make model for '{key}' first")
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    if len(meshes) != 1:
        raise RuntimeError(f"{path}: expected one mesh, found {len(meshes)}")
    o = meshes[0]
    for other in new:
        if other is not o:
            bpy.data.objects.remove(other)
    for c in list(o.users_collection):
        c.objects.unlink(o)
    coll.objects.link(o)
    o.data.materials.clear()
    o.data.materials.append(mat)
    return o


def bake_transform(o):
    o.data.transform(o.matrix_world)
    o.matrix_world = Matrix.Identity(4)


def widest_along_x(o):
    lo, hi = bounds(o)
    if hi.y - lo.y > hi.x - lo.x:
        o.rotation_euler.z += math.pi / 2
        bpy.context.view_layer.update()
    bake_transform(o)


def fit(o, size, base=(0.0, 0.0, 0.0)):
    lo, hi = bounds(o)
    span = hi - lo
    centre = (lo + hi) / 2
    for v in o.data.vertices:
        v.co = Vector(((v.co.x - centre.x) / span.x * size[0], (v.co.y - centre.y) / span.y * size[1], (v.co.z - lo.z) / span.z * size[2]))
    o.location = base


frame = ai_piece("frame", M["wood"])
widest_along_x(frame)
fit(frame, (0.62, 0.86, 1.0))
keep(frame, "Chair_Frame")

cushion = ai_piece("cushion", M["fabric"])
fit(cushion, (0.40, 0.38, 0.08))
keep(cushion, "Chair_Cushion")

head = ai_piece("lantern_head", M["wood"])
fit(head, (0.32, 0.32, 0.45))
keep(head, "Lantern_Head")

post = L.join(coll, "Lantern_Post", [
    L.box(coll, "PostBase", 0, 0, 0, 0.2, 0.2, 0.08, M["wood"], bevel=0.02),
    L.box(coll, "PostShaft", 0, 0, 0.08, 0.08, 0.08, 1.0, M["wood"]),
    L.box(coll, "PostCap", 0, 0, 1.08, 0.16, 0.16, 0.04, M["wood"]),
])
keep(post, "Lantern_Post")

pane_w, pane_h, inset = 0.22, 0.24, 0.115
panes = L.join(coll, "Lantern_Panes", [
    L.box(coll, "PaneN", 0, -inset, 0.09, pane_w, 0.01, pane_h, M["glass"]),
    L.box(coll, "PaneS", 0, inset, 0.09, pane_w, 0.01, pane_h, M["glass"]),
    L.box(coll, "PaneE", inset, 0, 0.09, 0.01, pane_w, pane_h, M["glass"]),
    L.box(coll, "PaneW", -inset, 0, 0.09, 0.01, pane_w, pane_h, M["glass"]),
])
keep(panes, "Lantern_Panes")

L.export_glb(OUT, pieces)
print({o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in pieces}, "->", OUT)
