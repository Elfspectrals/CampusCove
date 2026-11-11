# Sculpted detail for the haircuts: our low-poly haircut is wrapped onto a high-poly sculpt (`sculpts/hair_<key>.glb`,
# placed by `sculpt_prep.py`) and the sculpt's locks are baked into a tangent-space normal map carried by the hair
# material. The mesh, its triangle budget and its rig stay ours; only the outer shell moves and the shading gains the
# locks. A haircut without a sculpt file is left as built. Runs inside run_wear.py (exec'd globals).
import math
import os

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

SCULPT_DIR = SKINS_DIR + "sculpts/"
HAIR_NORMAL_PX = 512
HAIR_NORMAL_STRENGTH = 0.7
SCULPT_CENTER = Vector((0.0, 0.0, 1.72))  # middle of the skull: "outward" for a hair vertex is away from it
PROJECT_LIMIT = 0.07   # how far a hair vertex may travel to reach the sculpt
HAIR_LIFT = 0.002      # the wrapped shell floats this much above the sculpt surface
SCALP_GAP = 0.004      # and never closer than this to the head
PARKED_UV = 0.997      # unwrapped faces share this texel, painted flat after the bake
# Haircuts whose parts away from the scalp keep their built shape: only the cap within this distance is wrapped.
# The ponytail's sweep is thinner than the sculpt's tail and sits elsewhere, so wrapping it shreds it.
CAP_ONLY = {"ponytail": 0.012}


def _ss(t):
    t = min(max(t, 0.0), 1.0)
    return t * t * (3 - 2 * t)


def _wrap_weight(p, n):
    """1 on the outer shell of the haircut, 0 on the inner cap hidden in the skull and on the strands framing the face
    (in front of the ears, below the brow line), which keep their built shape."""
    outward = _ss((n.dot((p - SCULPT_CENTER).normalized()) + 0.1) / 0.4)
    face_front = _ss(-p.y / 0.04) * (1 - _ss((p.z - 1.78) / 0.03))
    return outward * (1 - face_front)


def _import_sculpt(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    sculpt = next(o for o in new if o.type == "MESH")
    for o in new:
        if o is not sculpt:
            bpy.data.objects.remove(o, do_unlink=True)
    for poly in sculpt.data.polygons:
        poly.use_smooth = True
    return sculpt


def _head_tree(head):
    bm = bmesh.new()
    bm.from_mesh(head.data)
    bm.transform(head.matrix_world)
    tree = BVHTree.FromBMesh(bm)
    bm.free()
    return tree


def _wrap(ob, sculpt, tree, cap_only):
    group = ob.vertex_groups.new(name="sculpt_wrap")
    rot = ob.matrix_world.to_3x3()
    for v in ob.data.vertices:
        p = ob.matrix_world @ v.co
        w = _wrap_weight(p, (rot @ v.normal).normalized())
        if cap_only:
            w *= 1 - _ss((tree.find_nearest(p)[3] - cap_only) / 0.006)
        group.add([v.index], w, "REPLACE")
    sw = ob.modifiers.new("sculpt_wrap", "SHRINKWRAP")
    sw.target = sculpt
    sw.wrap_method = "PROJECT"
    sw.use_negative_direction = sw.use_positive_direction = True
    sw.project_limit = PROJECT_LIMIT
    sw.offset = HAIR_LIFT
    sw.vertex_group = "sculpt_wrap"
    sm = ob.modifiers.new("sculpt_smooth", "SMOOTH")
    sm.factor = 0.5
    sm.iterations = 2
    sm.vertex_group = "sculpt_wrap"
    with bpy.context.temp_override(object=ob, active_object=ob):
        bpy.ops.object.modifier_apply(modifier=sw.name)
        bpy.ops.object.modifier_apply(modifier=sm.name)
    return "sculpt_wrap"  # the group handle goes stale once a modifier is applied


def _weight(v, ob, name):
    index = ob.vertex_groups[name].index
    return max((g.weight for g in v.groups if g.group == index), default=0.0)


def _clear_scalp(ob, tree, group):
    """Wrapped shell vertices that sank into the skull go back out along the head normal."""
    to_world, to_local = ob.matrix_world, ob.matrix_world.inverted()
    moved = 0
    for v in ob.data.vertices:
        if _weight(v, ob, group) < 0.3:
            continue
        p = to_world @ v.co
        hit, n, _i, _d = tree.find_nearest(p)
        if hit is not None and (p - hit).dot(n) < SCALP_GAP:
            v.co = to_local @ (hit + n * SCALP_GAP)
            moved += 1
    ob.data.update()
    return moved


def _unwrap(ob, group):
    ob.data.uv_layers.new(name="UVMap")
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.01)
    bpy.ops.object.mode_set(mode="OBJECT")
    weights = [_weight(v, ob, group) for v in ob.data.vertices]
    uv = ob.data.uv_layers.active.data
    for poly in ob.data.polygons:
        parked = sum(weights[i] for i in poly.vertices) / len(poly.vertices) < 0.5
        for li in poly.loop_indices:
            uv[li].uv = (PARKED_UV, PARKED_UV) if parked else uv[li].uv * 0.98


def _bake_normal(ob, sculpt, key):
    sc = bpy.context.scene
    engine = sc.render.engine
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 16
    sc.cycles.device = "CPU"
    img = bpy.data.images.new("W_hair_%s_Normal" % key, HAIR_NORMAL_PX, HAIR_NORMAL_PX, float_buffer=True)
    img.colorspace_settings.name = "Non-Color"
    m = ob.data.materials[0]
    nt = m.node_tree
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.nodes.active = tex
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    sculpt.select_set(True)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type="NORMAL", use_selected_to_active=True, cage_extrusion=0.015, max_ray_distance=0.05, margin=4)
    sc.render.engine = engine

    px = np.empty(HAIR_NORMAL_PX * HAIR_NORMAL_PX * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(HAIR_NORMAL_PX, HAIR_NORMAL_PX, 4)
    nrm = px[..., :3] * 2 - 1
    keep = np.clip((nrm[..., 2:3] - 0.25) / 0.35, 0, 1)  # a texel tilted past ~65 degrees is a ray that hit the wrong surface
    nrm = nrm * keep + np.array([0.0, 0.0, 1.0]) * (1 - keep)
    nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)
    px[..., :3] = nrm * 0.5 + 0.5
    px[-8:, -8:, :3] = (0.5, 0.5, 1.0)  # the parked texel: flat
    img.pixels.foreach_set(px.ravel())
    img.filepath_raw = RAW_DIR + "hair_%s_normal.png" % key
    img.file_format = "PNG"
    img.save()

    nm = nt.nodes.new("ShaderNodeNormalMap")
    nm.inputs["Strength"].default_value = HAIR_NORMAL_STRENGTH
    nt.links.new(tex.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], nt.nodes["Principled BSDF"].inputs["Normal"])


def apply_hair_sculpt(ob, key, head):
    """Wrap the built haircut `ob` onto its sculpt and bake the locks into its material. No sculpt file: unchanged."""
    path = SCULPT_DIR + "hair_%s.glb" % key
    if not os.path.exists(path):
        return False
    sculpt = _import_sculpt(path)
    tree = _head_tree(head)
    group = _wrap(ob, sculpt, tree, CAP_ONLY.get(key))
    moved = _clear_scalp(ob, tree, group)
    _unwrap(ob, group)
    _bake_normal(ob, sculpt, key)
    ob.vertex_groups.remove(ob.vertex_groups[group])
    bpy.data.objects.remove(sculpt, do_unlink=True)
    print("sculpted hair", key, "scalp pushes", moved)
    return True
