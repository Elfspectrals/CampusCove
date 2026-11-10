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
sys.path.insert(0, HERE)
import lib_common as L
importlib.reload(L)
import bpy
from mathutils import Euler, Matrix, Quaternion, Vector

SKINS_DIR = os.path.normpath(os.path.join(HERE, "..", "..", "front", "public", "assets", "skins"))
SKIN_SCRIPTS_DIR = os.path.normpath(os.path.join(HERE, "..", "..", "front", "scripts", "skins")) + "/"
POSE = {"SKINS_DIR": SKIN_SCRIPTS_DIR, "bpy": bpy}
exec(open(SKIN_SCRIPTS_DIR + "anim.py", encoding="utf8").read(), POSE)
key_poses = POSE["key_poses"]
ONLY = globals().get("ONLY_SKINS")
PREVIEW_DIR = globals().get("PREVIEW_DIR")
KEEP_SCENES = globals().get("KEEP_SCENES", False)
WEAR_DIR = os.path.normpath(os.path.join(HERE, "..", "..", "front", "public", "assets", "wear"))
WEAR_TOPS = globals().get("WEAR_TOPS")

ELBOW_Z = 1.22
STATIC_WRIST_Z = 0.985
STATIC_ARM_MIN_X = 0.265
STATIC_ARM_MAX_DEPTH = 0.08
STATIC_ACCESSORY_MATERIAL = "Leather"
FPS = 30
MAX_WRIST_FLEX = 0.15

REST_ELBOW = {"R": Vector((0.24, 0.02, -0.3)), "L": Vector((-0.24, 0.02, -0.3))}
REST_ROTATION = {"R": Euler((math.radians(32), 0, math.radians(20))), "L": Euler((math.radians(32), 0, math.radians(-20)))}
HANG_TO_FORWARD = Euler((math.radians(90), 0, math.radians(180)), "ZYX").to_matrix().to_4x4()

# First-person proportions, as viewmodels do: the forearm sits closer to the eye than the hand, so it
# reads huge and the hand tiny. The player's arms get a bigger hand and a slimmer forearm and sleeve.
FP_HAND_SCALE = 1.45
FP_FOREARM_SLIM = 0.8
FP_HAND_RAMP = 0.04


def import_skin(key):
    before = set(bpy.data.objects)
    with contextlib.redirect_stdout(io.StringIO()):
        bpy.ops.import_scene.gltf(filepath=os.path.join(SKINS_DIR, key, "model.glb"), disable_bone_shape=True)
    imported = [o for o in bpy.data.objects if o not in before]
    body = max((o for o in imported if o.type == "MESH"), key=lambda o: len(o.data.vertices))
    return body, imported


def import_glb(path):
    before = set(bpy.data.objects)
    with contextlib.redirect_stdout(io.StringIO()):
        bpy.ops.import_scene.gltf(filepath=path, disable_bone_shape=True)
    return [o for o in bpy.data.objects if o not in before]


def import_wear(top):
    imported = import_glb(os.path.join(WEAR_DIR, "base", "model.glb"))
    hides = set()
    if top:
        imported += import_glb(os.path.join(WEAR_DIR, "top", top, "model.glb"))
        piece = next(o for o in imported if o.type == "MESH" and "slot" in o)
        hides = set(filter(None, piece["hides"].split(",")))
    meshes = [o for o in imported if o.type == "MESH" and o.get("region") not in hides]
    others = [o for o in imported if o not in meshes]
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    body = bpy.context.view_layer.objects.active
    return body, others + [body]


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


def smoothstep(t):
    t = min(max(t, 0.0), 1.0)
    return t * t * (3 - 2 * t)


def slim_forearm(bm, elbow, wrist):
    """Pull the forearm toward its axis, FP_FOREARM_SLIM at the elbow easing to full size at the wrist
    so the cuff still covers the wrist."""
    axis = wrist - elbow
    length = axis.length
    axis.normalize()
    for v in bm.verts:
        t = (v.co - elbow).dot(axis)
        along = elbow + axis * t
        v.co = along + (v.co - along) * (FP_FOREARM_SLIM + (1 - FP_FOREARM_SLIM) * smoothstep(t / length))


def grow_hand(bm, elbow, wrist):
    """Scale the hand around the wrist, from full size at the wrist ring (no seam) to FP_HAND_SCALE
    a few centimetres past it."""
    axis = (wrist - elbow).normalized()
    for v in bm.verts:
        offset = v.co - wrist
        v.co = wrist + offset * (1 + (FP_HAND_SCALE - 1) * smoothstep(offset.dot(axis) / FP_HAND_RAMP))


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


def action_fcurves(action):
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    return [fc for layer in action.layers for strip in layer.strips for bag in strip.channelbags for fc in bag.fcurves]


def mirrored(pose_at):
    return lambda fr: {k: -v if k in ("x", "ry", "rz") else v for k, v in pose_at(fr).items()}


def eased(frames, keys):
    pose_at = key_poses([(frame / frames, pose) for frame, pose in keys])
    return lambda fr: pose_at(fr / frames)


def blend(a, b, w):
    return {k: a.get(k, 0.0) + (b.get(k, 0.0) - a.get(k, 0.0)) * w for k in a.keys() | b.keys()}


def move_arm(obj, rest, pose):
    obj.location = rest[0] + Vector((pose.get("x", 0.0), pose.get("y", 0.0), pose.get("z", 0.0)))
    obj.rotation_euler = Euler((rest[1].x + pose.get("rx", 0.0), rest[1].y + pose.get("ry", 0.0), rest[1].z + pose.get("rz", 0.0)))


def move_hand(obj, rest, pose):
    flex = pose.get("flex", 0.0)
    if not -MAX_WRIST_FLEX - 1e-9 <= flex <= 1e-9:
        raise ValueError(f"{obj.name}: wrist flex {flex:.3f} outside [-{MAX_WRIST_FLEX}, 0]")
    twist = Quaternion(rest[0].normalized(), math.radians(pose.get("twist", 0.0)))
    obj.rotation_euler = (twist @ Euler((flex, 0, 0)).to_quaternion()).to_euler("XYZ")


def bake(obj, clip, frames, pose_at, move=move_arm, scale=False):
    """scale: also key a uniform scale from the pose's "s" (1 when missing)."""
    rest = (obj.location.copy(), obj.rotation_euler.copy())
    obj.animation_data_create()
    obj.animation_data.action = None
    for fr in range(frames + 1):
        pose = pose_at(fr)
        move(obj, rest, pose)
        obj.keyframe_insert("location", frame=fr)
        obj.keyframe_insert("rotation_euler", frame=fr)
        if scale:
            obj.scale = (pose.get("s", 1.0),) * 3
            obj.keyframe_insert("scale", frame=fr)
    action = obj.animation_data.action
    for fcurve in action_fcurves(action):
        for point in fcurve.keyframe_points:
            point.interpolation = "LINEAR"
    action.name = f"{clip}_{obj.name}"
    track = obj.animation_data.nla_tracks.new()
    track.name = clip
    track.strips.new(clip, 0, action)
    obj.animation_data.action = None
    obj.location, obj.rotation_euler = rest
    obj.scale = (1, 1, 1)


def idle(frames, phase, side_sign):
    def pose_at(fr):
        t = 2 * math.pi * fr / frames + phase
        return {"z": 0.008 * math.sin(t), "rx": math.radians(1.2) * math.sin(t - 0.6), "rz": side_sign * math.radians(0.4) * math.sin(2 * t)}
    return pose_at


def walk(frames, phase):
    lowest = math.pi / 2 + 0.3

    def pose_at(fr):
        t = 2 * math.pi * fr / frames
        swing = math.sin(t + phase)
        return {"x": 0.008 * math.sin(t), "y": 0.025 * swing, "z": -0.012 * (1 + math.cos(2 * (t - lowest))) / 2, "rx": math.radians(4) * swing}
    return pose_at


PUNCH_WINDUP = {"x": 0.01, "y": -0.05, "z": -0.02, "rx": 0.1}
PUNCH_CONTACT = {"x": -0.05, "y": 0.2, "z": 0.03, "rx": -0.02, "ry": -0.293, "rz": 0.453}
PUNCH_RECOIL = {**PUNCH_CONTACT, "y": 0.17}
PUNCH = eased(13, [
    (0, {}),
    (3, PUNCH_WINDUP),
    (4, blend(PUNCH_WINDUP, PUNCH_CONTACT, 0.85)),
    (5, PUNCH_CONTACT),
    (6, PUNCH_RECOIL),
    (7, PUNCH_RECOIL),
    (11, {"z": -0.01, "rx": -0.03}),
    (13, {}),
])
# The fist travels about 25 cm away from the eye, so perspective shrinks it right when it should read
# biggest; it swells instead through the strike, like viewmodel punches do.
PUNCH_FIST = eased(13, [(0, {"s": 1.0}), (3, {"s": 1.0}), (5, {"s": 1.3}), (7, {"s": 1.25}), (13, {"s": 1.0})])

EQUIP = eased(14, [
    (0, {"x": 0.01, "y": -0.03, "z": -0.15, "rx": -0.35, "rz": 0.05}),
    (9, {"z": 0.015, "rx": 0.06}),
    (14, {}),
])

DOOR_CONTACT = {"x": -0.02, "y": 0.14, "z": 0.05, "rx": 0.05, "ry": -0.158, "rz": 0.181, "flex": -0.05}
USE_DOOR = eased(16, [
    (0, {}),
    (3, {"x": 0.005, "y": -0.02, "z": -0.01, "flex": -0.12}),
    (7, DOOR_CONTACT),
    (10, {**DOOR_CONTACT, "y": 0.16}),
    (16, {}),
])

KEY_INSERT = {"x": -0.03, "y": 0.13, "z": 0.04, "rx": -0.023, "ry": -0.147, "rz": 0.265}
KEY_PUSH = {**KEY_INSERT, "y": 0.14}
USE_KEY = eased(24, [
    (0, {}),
    (3, {"y": -0.015}),
    (8, KEY_INSERT),
    (10, KEY_PUSH),
    (15, {**KEY_PUSH, "twist": 70}),
    (17, {**KEY_PUSH, "twist": 70}),
    (20, KEY_INSERT),
    (24, {}),
])

PICK_GRAB = {"x": 0.03, "y": 0.15, "z": 0.11, "rx": 0.577, "ry": -0.418, "rz": 0.692, "flex": -0.05}
PICK_KEYS = eased(90, [
    (0, {}),
    (4, {"x": 0.01, "y": -0.01, "z": -0.025, "rx": -0.1, "rz": 0.03}),
    (20, {**PICK_GRAB, "z": 0.125, "flex": -0.15}),
    (26, PICK_GRAB),
    (63, PICK_GRAB),
    (74, {"x": -0.04, "y": 0.08, "z": 0.1, "rx": -0.21, "ry": -0.521, "rz": 0.031, "flex": -0.1}),
    (83, {"z": -0.012, "rx": -0.05}),
    (90, {}),
])
PICK_BALANCE = eased(90, [(0, {}), (20, {"z": -0.01, "rx": -0.06}), (63, {"z": -0.01, "rx": -0.06}), (74, {}), (90, {})])


MOUTH_ANTICIPATION = {"x": 0.005, "y": -0.01, "z": -0.015, "rx": -0.06}
MOUTH_SETTLE = {"z": -0.01, "rx": -0.04}
EAT_MOUTH = {"x": -0.08, "y": 0.115, "z": -0.02, "rx": 0.354, "ry": -0.832, "rz": 0.48, "flex": -0.1}
EAT_BITE = {**EAT_MOUTH, "y": 0.1, "z": -0.03, "flex": -0.13}
EAT = eased(30, [
    (0, {}),
    (2, MOUTH_ANTICIPATION),
    (10, EAT_MOUTH),
    (12, EAT_BITE),
    (14, EAT_MOUTH),
    (15, EAT_MOUTH),
    (17, EAT_BITE),
    (19, EAT_MOUTH),
    (26, MOUTH_SETTLE),
    (30, {}),
])
DRINK_MOUTH = {"x": -0.04, "y": 0.12, "z": 0.1, "rx": 0.168, "ry": -0.055, "rz": 1.345}
DRINK_TIP = {"x": -0.04, "y": 0.12, "z": 0.13, "rx": -0.229, "ry": -0.57, "rz": 1.06, "flex": -0.1}
DRINK = eased(30, [
    (0, {}),
    (2, MOUTH_ANTICIPATION),
    (10, DRINK_MOUTH),
    (14, DRINK_TIP),
    (20, DRINK_TIP),
    (26, MOUTH_SETTLE),
    (30, {}),
])
OFF_HAND_DIP = eased(30, [(0, {}), (10, {"z": -0.008, "rx": -0.04}), (19, {"z": -0.008, "rx": -0.04}), (30, {})])


def pick(fr):
    pose = PICK_KEYS(fr)
    if 26 < fr < 63:
        tug = (1 - math.cos(4 * math.pi * (fr - 26) / 37)) / 2
        pose["z"] -= 0.015 * tug
        pose["flex"] -= 0.05 * tug
    return pose


def animate(arm, hand):
    for side, side_sign, idle_phase, walk_phase in (("R", 1, 0.0, 0.0), ("L", -1, 0.9, math.pi)):
        bake(arm[side], "Idle", 96, idle(96, idle_phase, side_sign))
        bake(arm[side], "Walk", 24, walk(24, walk_phase))
    bake(arm["R"], "Equip", 14, EQUIP)
    bake(arm["R"], "UseDoor", 16, USE_DOOR)
    bake(hand["R"], "UseDoor", 16, USE_DOOR, move_hand)
    bake(arm["R"], "UseKey", 24, USE_KEY)
    bake(hand["R"], "UseKey", 24, USE_KEY, move_hand)
    bake(arm["R"], "Punch", 13, PUNCH)
    bake(hand["R"], "Punch", 13, PUNCH_FIST, move_hand, scale=True)
    bake(arm["L"], "PunchL", 13, mirrored(PUNCH))
    bake(hand["L"], "PunchL", 13, mirrored(PUNCH_FIST), move_hand, scale=True)
    bake(arm["R"], "Pick", 90, pick)
    bake(hand["R"], "Pick", 90, pick, move_hand)
    bake(arm["L"], "Pick", 90, PICK_BALANCE)
    for clip, pose_at in (("Eat", EAT), ("Drink", DRINK)):
        bake(arm["R"], clip, 30, pose_at)
        bake(hand["R"], clip, 30, pose_at, move_hand)
        bake(arm["L"], clip, 30, OFF_HAND_DIP)


def build(key, load=import_skin, out_rel=("skins",), fp_proportions=False):
    sc = L.new_build_scene("FP_" + key)
    sc.render.fps = FPS
    body, imported = load(key)
    materials = [s.material for s in body.material_slots]
    coll = bpy.data.collections.new("FPArms_" + key)
    sc.collection.children.link(coll)
    root = empty(coll, "FPArms", None, (0, 0, 0))
    arm, hand = {}, {}
    for side in ("R", "L"):
        arm_bm, hand_bm, elbow, wrist = side_faces(body, side)
        if fp_proportions:
            slim_forearm(arm_bm, elbow, wrist)
            grow_hand(hand_bm, elbow, wrist)
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
    out_dir = os.path.join(L.OUT_ROOT, *out_rel, key)
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


if WEAR_TOPS is not None:
    tops = WEAR_TOPS or sorted(k for k in os.listdir(os.path.join(WEAR_DIR, "top")) if os.path.isfile(os.path.join(WEAR_DIR, "top", k, "model.glb")))
    print([build(t, load=import_wear, out_rel=("wear", "top"), fp_proportions=True) for t in tops])
    print(build("bare", load=lambda _key: import_wear(None), out_rel=("wear",), fp_proportions=True))
else:
    keys = ONLY or sorted(k for k in os.listdir(SKINS_DIR) if os.path.isfile(os.path.join(SKINS_DIR, k, "model.glb")))
    print([build(k) for k in keys])
