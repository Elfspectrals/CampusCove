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
from mathutils import Euler, Matrix, Vector

SKINS_DIR = os.path.normpath(os.path.join(HERE, "..", "..", "front", "public", "assets", "skins"))
ONLY = globals().get("ONLY_SKINS")
PREVIEW_DIR = globals().get("PREVIEW_DIR")
KEEP_SCENES = globals().get("KEEP_SCENES", False)

ELBOW_Z = 1.22
STATIC_WRIST_Z = 0.985
STATIC_ARM_MIN_X = 0.265
STATIC_ARM_MAX_DEPTH = 0.08
STATIC_ACCESSORY_MATERIAL = "Leather"
FPS = 30

REST_ELBOW = {"R": Vector((0.24, 0.02, -0.3)), "L": Vector((-0.24, 0.02, -0.3))}
REST_ROTATION = {"R": Euler((math.radians(32), 0, math.radians(20))), "L": Euler((math.radians(32), 0, math.radians(-20)))}
HANG_TO_FORWARD = Euler((math.radians(90), 0, math.radians(180)), "ZYX").to_matrix().to_4x4()


def import_skin(key):
    before = set(bpy.data.objects)
    with contextlib.redirect_stdout(io.StringIO()):
        bpy.ops.import_scene.gltf(filepath=os.path.join(SKINS_DIR, key, "model.glb"))
    imported = [o for o in bpy.data.objects if o not in before]
    body = max((o for o in imported if o.type == "MESH"), key=lambda o: len(o.data.vertices))
    return body, imported


def main_group(vert, names):
    if not vert.groups:
        return None
    return names[max(vert.groups, key=lambda g: g.weight).group]


def side_faces(body, side):
    sign = -1 if side == "R" else 1
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.transform(body.matrix_world)
    center_x = sum(v.co.x for v in bm.verts) / len(bm.verts)
    deform = bm.verts.layers.deform.active
    hand_layer = bm.faces.layers.int.new("hand")
    if body.vertex_groups:
        names = {g.index: g.name for g in body.vertex_groups}
        arm = {f"UpperArm.{side}", f"LowerArm.{side}", f"Hand.{side}"}
        hand = {f"Hand.{side}"}

        def group_of(face):
            votes = {}
            for v in face.verts:
                weights = v[deform]
                if weights:
                    g = names[max(weights.items(), key=lambda kv: kv[1])[0]]
                    votes[g] = votes.get(g, 0) + 1
            return max(votes, key=votes.get) if votes else None

        groups = {f: group_of(f) for f in bm.faces}
        for f in bm.faces:
            f[hand_layer] = 1 if groups[f] in hand else 0
        is_arm = lambda f: groups[f] in arm
        rigged = True
    else:
        accessory = {i for i, slot in enumerate(body.material_slots) if slot.material and STATIC_ACCESSORY_MATERIAL in slot.material.name}

        def is_arm(f):
            c = f.calc_center_median()
            in_arm = (c.x - center_x) * sign > STATIC_ARM_MIN_X and 0.8 < c.z < 1.6 and abs(c.y) < STATIC_ARM_MAX_DEPTH
            return in_arm and f.material_index not in accessory
        rigged = False
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not is_arm(f)], context="FACES")
    cut = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, ELBOW_Z), plane_no=(0, 0, 1), clear_outer=True)
    bmesh.ops.holes_fill(bm, edges=[e for e in cut["geom_cut"] if isinstance(e, bmesh.types.BMEdge)], sides=0)
    if not rigged:
        wrist = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, STATIC_WRIST_Z), plane_no=(0, 0, 1))
        bmesh.ops.split_edges(bm, edges=[e for e in wrist["geom_cut"] if isinstance(e, bmesh.types.BMEdge)])
        for f in bm.faces:
            f[hand_layer] = 1 if f.calc_center_median().z < STATIC_WRIST_Z else 0
    hand_bm, arm_bm = bm.copy(), bm
    for part, drop_hand in ((hand_bm, 0), (arm_bm, 1)):
        layer = part.faces.layers.int["hand"]
        bmesh.ops.delete(part, geom=[f for f in part.faces if f[layer] == drop_hand], context="FACES")
    for part in (hand_bm, arm_bm):
        part.verts.ensure_lookup_table()
    if not hand_bm.verts or not arm_bm.verts:
        raise RuntimeError(f"{body.name}: empty {'hand' if not hand_bm.verts else 'forearm'} on side {side}")
    top = [v.co for v in arm_bm.verts if v.co.z > ELBOW_Z - 0.01]
    elbow = sum(top, Vector()) / len(top)
    wrist_z = max(v.co.z for v in hand_bm.verts)
    wrist_pts = [v.co for v in hand_bm.verts if v.co.z > wrist_z - 0.02]
    wrist = sum(wrist_pts, Vector()) / len(wrist_pts)
    return arm_bm, hand_bm, elbow, wrist


def mesh_object(coll, name, bm, offset, materials):
    bm.transform(HANG_TO_FORWARD @ Matrix.Translation(-offset))
    bm.normal_update()
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in materials:
        me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    return ob


def empty(coll, name, parent, location, rotation=None):
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_size = 0.05
    coll.objects.link(ob)
    ob.parent = parent
    ob.location = location
    if rotation is not None:
        ob.rotation_euler = rotation
    return ob


def keyframes(obj, clip, keys):
    rest_loc = obj.location.copy()
    rest_rot = obj.rotation_euler.copy()
    obj.animation_data_create()
    obj.animation_data.action = None
    for frame, dloc, drot in keys:
        obj.location = rest_loc + Vector(dloc)
        obj.rotation_euler = Euler((rest_rot.x + drot[0], rest_rot.y + drot[1], rest_rot.z + drot[2]))
        obj.keyframe_insert("location", frame=frame)
        obj.keyframe_insert("rotation_euler", frame=frame)
    action = obj.animation_data.action
    action.name = f"{clip}_{obj.name}"
    track = obj.animation_data.nla_tracks.new()
    track.name = clip
    track.strips.new(clip, int(keys[0][0]), action)
    obj.animation_data.action = None
    obj.location = rest_loc
    obj.rotation_euler = rest_rot


def loop(n, period_s, fn):
    frames = round(period_s * FPS)
    return [(1 + frames * i / n, *fn(2 * math.pi * i / n)) for i in range(n + 1)]


def animate(arm, hand):
    for side, phase in (("R", 0.0), ("L", math.pi)):
        keyframes(arm[side], "Idle", loop(8, 2.4, lambda t, p=phase: ((0, 0, 0.006 * math.sin(t + p * 0.2)), (0.012 * math.sin(t), 0, 0))))
        keyframes(arm[side], "Walk", loop(8, 0.8, lambda t, p=phase: ((0.008 * math.sin(t + p), 0.012 * math.sin(t + p), 0.02 * abs(math.sin(t + p))), (0.05 * math.sin(t + p), 0, 0))))
    keyframes(arm["R"], "Equip", [
        (1, (0, -0.05, -0.32), (-0.9, 0, 0)),
        (6, (0, -0.03, -0.12), (-0.35, 0, 0)),
        (11, (0, 0, 0), (0, 0, 0)),
    ])
    keyframes(arm["R"], "UseDoor", [
        (1, (0, 0, 0), (0, 0, 0)),
        (5, (-0.02, 0.16, 0.03), (0.12, 0, 0)),
        (14, (0, 0, 0), (0, 0, 0)),
    ])
    keyframes(arm["R"], "UseKey", [
        (1, (0, 0, 0), (0, 0, 0)),
        (6, (-0.03, 0.13, 0.04), (0.1, 0, 0)),
        (14, (-0.03, 0.13, 0.04), (0.1, 0, 0)),
        (19, (0, 0, 0), (0, 0, 0)),
    ])
    keyframes(arm["R"], "Punch", [
        (1, (0, 0, 0), (0, 0, 0)),
        (3, (0.03, -0.08, -0.03), (0.15, 0, 0.1)),
        (6, (-0.1, 0.27, 0.18), (-0.44, 0.02, -0.08)),
        (8, (-0.1, 0.25, 0.17), (-0.42, 0.02, -0.08)),
        (16, (0, 0, 0), (0, 0, 0)),
    ])
    keyframes(hand["R"], "UseKey", [
        (1, (0, 0, 0), (0, 0, 0)),
        (6, (0, 0, 0), (0, 0, 0)),
        (10, (0, 0, 0), (0, math.radians(80), 0)),
        (14, (0, 0, 0), (0, 0, 0)),
        (19, (0, 0, 0), (0, 0, 0)),
    ])


def build(key):
    sc = L.new_build_scene("FP_" + key)
    sc.render.fps = FPS
    body, imported = import_skin(key)
    materials = [s.material for s in body.material_slots]
    coll = bpy.data.collections.new("FPArms_" + key)
    sc.collection.children.link(coll)
    root = empty(coll, "FPArms", None, (0, 0, 0))
    arm, hand = {}, {}
    for side in ("R", "L"):
        arm_bm, hand_bm, elbow, wrist = side_faces(body, side)
        arm[side] = empty(coll, f"Arm_{side}", root, REST_ELBOW[side], REST_ROTATION[side])
        mesh_object(coll, f"ForeArm_{side}", arm_bm, elbow, materials).parent = arm[side]
        hand[side] = empty(coll, f"Hand_{side}", arm[side], (HANG_TO_FORWARD @ (wrist - elbow).to_4d()).to_3d())
        mesh_object(coll, f"HandMesh_{side}", hand_bm, wrist, materials).parent = hand[side]
    for o in imported:
        bpy.data.objects.remove(o, do_unlink=True)
    for vl in sc.view_layers:
        vl.update()
    animate(arm, hand)
    objs = [root, *arm.values(), *hand.values(), *[o for o in coll.objects if o.type == "MESH"]]
    out_dir = os.path.join(L.OUT_ROOT, "skins", key)
    L.export_glb(os.path.join(out_dir, "fp_arms.glb"), objs, export_animations=True, export_animation_mode="NLA_TRACKS",
                 export_force_sampling=True, export_frame_range=False)
    if PREVIEW_DIR:
        render_preview(sc, os.path.join(PREVIEW_DIR, f"fp_{key}.png"))
    tris = sum(len(p.vertices) - 2 for o in coll.objects if o.type == "MESH" for p in o.data.polygons)
    if not KEEP_SCENES:
        for o in list(sc.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.scenes.remove(sc)
    return {"key": key, "tris": tris}


def render_preview(sc, path):
    cam_data = bpy.data.cameras.new("FP_cam")
    cam_data.sensor_fit = "VERTICAL"
    cam_data.angle = math.radians(75)
    cam_data.clip_start = 0.05
    cam = bpy.data.objects.new("FP_cam", cam_data)
    sc.collection.objects.link(cam)
    cam.rotation_euler = (math.radians(90), 0, 0)
    sc.camera = cam
    sun = bpy.data.objects.new("FP_sun", bpy.data.lights.new("FP_sun", "SUN"))
    sun.data.energy = 3
    sun.rotation_euler = (0.6, 0.3, 0.5)
    sc.collection.objects.link(sun)
    sc.world = bpy.data.worlds.get("FP_world") or bpy.data.worlds.new("FP_world")
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x, sc.render.resolution_y = 800, 500
    sc.render.filepath = path
    with contextlib.redirect_stdout(io.StringIO()):
        bpy.ops.render.render(write_still=True)


keys = ONLY or sorted(k for k in os.listdir(SKINS_DIR) if os.path.isfile(os.path.join(SKINS_DIR, k, "model.glb")))
print([build(k) for k in keys])
