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
from mathutils.bvhtree import BVHTree

SKINS_DIR = os.path.normpath(os.path.join(HERE, "..", "..", "front", "public", "assets", "skins"))
SKIN_SCRIPTS_DIR = os.path.normpath(os.path.join(HERE, "..", "..", "front", "scripts", "skins")) + "/"
POSE = {"SKINS_DIR": SKIN_SCRIPTS_DIR, "bpy": bpy}
exec(open(SKIN_SCRIPTS_DIR + "anim.py", encoding="utf8").read(), POSE)
key_poses = POSE["key_poses"]
sample_actions = POSE["sample_actions"]
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
# reads huge and the hand tiny. The player's arms get a slimmer forearm and sleeve.
FP_FOREARM_SLIM = 0.8

HAND_TIP_REACH = 0.04
WRIST_CUFF_REACH = 0.045
WRIST_SEARCH = 0.06
WRIST_STEP = 0.002
WRIST_OVERLAP = 0.008
WRIST_SIDES = 16
PALM = ((0.024, 0.029, 0.021), (0.054, 0.04, 0.021), (0.082, 0.0455, 0.02), (0.098, 0.0445, 0.017))
PALM_END = 0.11
PALM_ROUNDNESS = 2.6
DIGIT_SIDES = 8
DIGIT_FLAT = 0.88
KNUCKLE_X = 0.002
FINGERS = (
    ("Index", 0.0325, 0.094, 4, 0.0122, (0.034, 0.023, 0.02)),
    ("Middle", 0.011, 0.098, 0, 0.0127, (0.037, 0.025, 0.022)),
    ("Ring", -0.011, 0.095, -3, 0.012, (0.035, 0.024, 0.02)),
    ("Pinky", -0.031, 0.086, -7, 0.0106, (0.028, 0.019, 0.018)),
)
FINGER_SPREAD = {"Index": 4, "Middle": 0, "Ring": -4, "Pinky": -8}
THUMB_BASE = Vector((-0.007, 0.026, 0.02))
THUMB_AXIS = Vector((-0.3, 0.88, 0.34)).normalized()
THUMB_CURL = Vector((-0.25, 0.0, -1.0))
THUMB_RADIUS = 0.0142
THUMB_LENGTHS = (0.036, 0.029, 0.024)
HAND_BONES = ("Wrist",) + tuple(f"{name}{i}" for name in ("Index", "Middle", "Ring", "Pinky", "Thumb") for i in (1, 2, 3))
MIRROR = {"R": Matrix.Identity(4), "L": Matrix.Scale(-1, 4, (1, 0, 0))}


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
    material = hand_material(bm, hand_layer)
    top = max(v.co.z for f in bm.faces if f[hand_layer] for v in f.verts)
    cuff = [f for f in bm.faces if f[hand_layer] and f.material_index != material and f.calc_center_median().z > top - WRIST_CUFF_REACH]
    while cuff:
        f = cuff.pop()
        if f[hand_layer]:
            f[hand_layer] = 0
            cuff += [g for e in f.edges for g in e.link_faces if g[hand_layer] and g.material_index != material]
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
    return arm_bm, hand_bm, elbow, wrist, material


def hand_material(bm, layer):
    hand = [f for f in bm.faces if f[layer]]
    tip_z = min(v.co.z for f in hand for v in f.verts)
    area = {}
    for f in hand:
        if f.calc_center_median().z < tip_z + HAND_TIP_REACH:
            area[f.material_index] = area.get(f.material_index, 0.0) + f.calc_area()
    return max(area, key=area.get)


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


def section(faces, co, normal, to_hand):
    segments = []
    for f in faces:
        cut = []
        for edge in f.edges:
            a, b = edge.verts
            da, db = (a.co - co).dot(normal), (b.co - co).dot(normal)
            if da * db < 0:
                cut.append(to_hand @ a.co.lerp(b.co, da / (da - db)))
        if len(cut) == 2:
            segments.append(cut)
    if not segments:
        return None
    centre = sum((p for seg in segments for p in seg), Vector()) / (2 * len(segments))
    axis = (to_hand.to_3x3() @ normal).normalized()
    e1 = (Vector((0, 0, 1)) - Vector((0, 0, 1)).project(axis)).normalized()
    e2 = axis.cross(e1)
    ring = []
    for k in range(WRIST_SIDES):
        a = 2 * math.pi * k / WRIST_SIDES
        ray = e1 * math.cos(a) + e2 * math.sin(a)
        normal_2d = e1 * -math.sin(a) + e2 * math.cos(a)
        best = None
        for p, q in segments:
            sp, sq = (p - centre).dot(normal_2d), (q - centre).dot(normal_2d)
            if sp * sq > 0 or sp == sq:
                continue
            hit = p.lerp(q, sp / (sp - sq))
            reach = (hit - centre).dot(ray)
            if reach > 0 and (best is None or reach > best[0]):
                best = (reach, hit)
        if best is None:
            return None
        ring.append(best[1])
    return ring, axis


def wrist_ring(arm_bm, hand_bm, elbow, wrist, material, to_hand):
    axis = (wrist - elbow).normalized()
    along = lambda co: (co - wrist).dot(axis)
    arm_skin, hand_skin = ([f for f in bm.faces if f.material_index == material] for bm in (arm_bm, hand_bm))
    open_verts = [v for f in arm_skin for e in f.edges if e.is_boundary for v in e.verts if abs(along(v.co)) < WRIST_SEARCH]
    start = open_verts or [v for f in hand_skin for v in f.verts]
    d = min(along(v.co) for v in start) - WRIST_STEP
    while d < WRIST_SEARCH:
        found = section(arm_skin + hand_skin, wrist + axis * d, axis, to_hand)
        if found:
            break
        d += WRIST_STEP
    else:
        raise RuntimeError("no closed skin ring around the wrist")
    geom = list({x for f in arm_skin for x in (f, *f.edges, *f.verts)})
    bmesh.ops.bisect_plane(arm_bm, geom=geom, plane_co=wrist + axis * d, plane_no=axis, clear_outer=True)
    return found


def skin_vert(bm, deform, co, weights):
    v = bm.verts.new(co)
    for group, w in weights.items():
        v[deform][group] = w
    return v


def tube(bm, deform, start, axis, bend, radius, sections, tip):
    side = axis.cross(bend)
    rings = []
    for dist, scale, weights in sections:
        centre = start + axis * dist
        angles = [2 * math.pi * k / DIGIT_SIDES for k in range(DIGIT_SIDES)]
        rings.append([skin_vert(bm, deform, centre + (bend * math.cos(a) * DIGIT_FLAT + side * math.sin(a)) * radius * scale, weights) for a in angles])
    loft(bm, rings)
    cap(bm, deform, rings[0][::-1], start + axis * (sections[0][0] - radius * 0.4), sections[0][2])
    cap(bm, deform, rings[-1], start + axis * tip, sections[-1][2])


def loft(bm, rings):
    for a, b in zip(rings, rings[1:]):
        n = len(a)
        for k in range(n):
            bm.faces.new((a[k], a[(k + 1) % n], b[(k + 1) % n], b[k]))


def cap(bm, deform, ring, co, weights):
    pole = skin_vert(bm, deform, co, weights)
    for k in range(len(ring)):
        bm.faces.new((ring[k], ring[(k + 1) % len(ring)], pole))


def superellipse(t):
    return math.copysign(abs(t) ** (2 / PALM_ROUNDNESS), t)


def digits():
    out = []
    for name, z, y, splay, radius, lengths in FINGERS:
        s = math.radians(splay)
        out.append((name, Vector((KNUCKLE_X, y, z)), Vector((0, math.cos(s), math.sin(s))), Vector((-1, 0, 0)), radius, lengths))
    bend = (THUMB_CURL - THUMB_CURL.project(THUMB_AXIS)).normalized()
    out.append(("Thumb", THUMB_BASE, THUMB_AXIS, bend, THUMB_RADIUS, THUMB_LENGTHS))
    return out


def digit_sections(name, lengths):
    g = {b: i for i, b in enumerate(HAND_BONES)}
    root, b1, b2, b3 = g["Wrist"], g[name + "1"], g[name + "2"], g[name + "3"]
    l1, l2, l3 = lengths
    if name == "Thumb":
        first = [(0.0, 1.2, {root: 1.0}), (l1 * 0.5, 1.2, {root: 0.4, b1: 0.6})]
    else:
        first = [(-0.012, 1.0, {root: 1.0}), (0.0, 1.06, {root: 0.5, b1: 0.5}), (l1 * 0.5, 1.0, {b1: 1.0})]
    return first + [
        (l1, 0.98, {b1: 0.5, b2: 0.5}),
        (l1 + l2 * 0.5, 0.95, {b2: 1.0}),
        (l1 + l2, 0.93, {b2: 0.5, b3: 0.5}),
        (l1 + l2 + l3 * 0.45, 0.92, {b3: 1.0}),
        (l1 + l2 + l3 * 0.78, 0.72, {b3: 1.0}),
    ]


def hand_mesh(ring, forearm):
    bm = bmesh.new()
    deform = bm.verts.layers.deform.verify()
    palm = {0: 1.0}
    centre = sum(ring, Vector()) / len(ring)
    rings = [[skin_vert(bm, deform, centre + (p - centre) * 0.92 - forearm * WRIST_OVERLAP, palm) for p in ring],
             [skin_vert(bm, deform, p, palm) for p in ring]]
    angles = [2 * math.pi * k / WRIST_SIDES for k in range(WRIST_SIDES)]
    for y, half_width, half_thick in PALM:
        rings.append([skin_vert(bm, deform, (half_thick * superellipse(math.sin(a)), y, half_width * superellipse(math.cos(a))), palm) for a in angles])
    loft(bm, rings)
    cap(bm, deform, rings[-1], (KNUCKLE_X, PALM_END, 0.0), palm)
    for name, start, axis, bend, radius, lengths in digits():
        tube(bm, deform, start, axis, bend, radius, digit_sections(name, lengths), sum(lengths))
    for f in bm.faces:
        f.smooth = True
    return bm


def paint_from(bm, source):
    scale = max(v.co.y for v in source.verts) / max(v.co.y for v in bm.verts)
    source.faces.ensure_lookup_table()
    tree = BVHTree.FromBMesh(source)
    layers = [(kind, src, getattr(bm.loops.layers, kind).new(name))
              for kind in ("uv", "color", "float_color") for name, src in getattr(source.loops.layers, kind).items()]
    for f in bm.faces:
        index = tree.find_nearest(f.calc_center_median() * scale)[2]
        src = source.faces[index]
        f.material_index = src.material_index
        for kind, src_layer, layer in layers:
            values = [l[src_layer].uv if kind == "uv" else l[src_layer] for l in src.loops]
            mean = sum(values[1:], values[0].copy()) / len(values)
            for l in f.loops:
                if kind == "uv":
                    l[layer].uv = mean
                else:
                    l[layer] = mean


def build_hand(coll, side, parent, ring, forearm, source, materials):
    mirror = MIRROR[side]
    bm = hand_mesh(ring, forearm)
    paint_from(bm, source)
    if side == "L":
        bm.transform(mirror)
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    bm.normal_update()
    me = bpy.data.meshes.new(f"HandMesh_{side}")
    bm.to_mesh(me)
    bm.free()
    for m in materials:
        me.materials.append(m)
    rig = bpy.data.objects.new(f"HandRig_{side}", bpy.data.armatures.new(f"HandRig_{side}"))
    coll.objects.link(rig)
    rig.parent = parent
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    bones = rig.data.edit_bones
    wrist = bones.new(f"Wrist_{side}")
    wrist.head, wrist.tail = (0, 0, 0), (0, PALM[-1][0], 0)
    to_side = mirror.to_3x3()
    for name, start, axis, bend, _radius, lengths in digits():
        up, head = wrist, start
        for i, length in enumerate(lengths, 1):
            b = bones.new(f"{name}{i}_{side}")
            b.head, b.tail = to_side @ head, to_side @ (head + axis * length)
            b.align_roll(to_side @ bend)
            b.parent, b.use_connect = up, i > 1
            up, head = b, head + axis * length
    bpy.ops.object.mode_set(mode="OBJECT")
    ob = bpy.data.objects.new(f"HandMesh_{side}", me)
    coll.objects.link(ob)
    ob.parent = rig
    for name in HAND_BONES:
        ob.vertex_groups.new(name=f"{name}_{side}")
    rest_relaxed(rig, ob, side)
    return rig


def rest_relaxed(rig, ob, side):
    ob.modifiers.new("Armature", "ARMATURE").object = rig
    for bone in HAND_BONES[1:]:
        rig.pose.bones[f"{bone}_{side}"].rotation_quaternion = digit_rotation(bone, side, RELAXED).to_quaternion()
    bpy.context.view_layer.update()
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier="Armature")
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.armature_apply()
    bpy.ops.object.mode_set(mode="OBJECT")
    ob.modifiers.new("Armature", "ARMATURE").object = rig


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


def bake(obj, clip, frames, pose_at, move=move_arm):
    rest = (obj.location.copy(), obj.rotation_euler.copy())
    obj.animation_data_create()
    obj.animation_data.action = None
    for fr in range(frames + 1):
        pose = pose_at(fr)
        move(obj, rest, pose)
        obj.keyframe_insert("location", frame=fr)
        obj.keyframe_insert("rotation_euler", frame=fr)
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


JAB_FRAMES = 12
CROSS_FRAMES = 16
FIST_CENTRE = Vector((-0.012, 0.085, 0.0))
JAB_COCK = {"x": -0.01, "y": -0.035, "z": -0.012, "rx": 0.08}
CROSS_WINDUP = {"x": 0.02, "y": -0.045, "z": -0.012, "rx": 0.12, "rz": -0.06}
GUARD = {"x": -0.05, "y": -0.04, "z": 0.05, "rx": 0.15}


def frame(along, side):
    y = along.normalized()
    x = (side - side.project(y)).normalized()
    return Matrix((x, y, x.cross(y))).transposed()


def fist_at(side, wrist, at, forearm, back):
    rot = frame(forearm, back) @ frame(wrist, Vector((1 if side == "R" else -1, 0, 0))).inverted()
    return arm_pose(side, rot, at - rot @ (wrist + MIRROR[side].to_3x3() @ FIST_CENTRE))


def arm_pose(side, rot, elbow):
    turn = rot.to_euler("XYZ", REST_ROTATION[side])
    rest = REST_ROTATION[side]
    return {"x": elbow.x - REST_ELBOW[side].x, "y": elbow.y - REST_ELBOW[side].y, "z": elbow.z - REST_ELBOW[side].z,
            "rx": turn.x - rest.x, "ry": turn.y - rest.y, "rz": turn.z - rest.z}


def jab(wrist):
    forearm, back = Vector((0.35, 1, 0.5)), Vector((-0.5, 0, 1))
    contact = fist_at("L", wrist, Vector((-0.015, 0.34, -0.05)), forearm, back)
    snap = fist_at("L", wrist, Vector((-0.08, 0.27, -0.09)), forearm, Vector((-1, 0, 0.3)))
    return eased(JAB_FRAMES, [
        (0, {}),
        (2, JAB_COCK),
        (4, blend(JAB_COCK, contact, 0.8)),
        (5, contact),
        (7, snap),
        (JAB_FRAMES, {}),
    ])


def cross(wrist):
    back = Vector((0.5, 0, 1))
    contact = fist_at("R", wrist, Vector((0.01, 0.37, -0.045)), Vector((-0.4, 1, 0.65)), back)
    through = fist_at("R", wrist, Vector((-0.025, 0.4, -0.055)), Vector((-0.5, 1, 0.65)), back)
    return eased(CROSS_FRAMES, [
        (0, {}),
        (3, CROSS_WINDUP),
        (4, blend(CROSS_WINDUP, contact, 0.8)),
        (5, contact),
        (7, through),
        (9, through),
        (CROSS_FRAMES, {}),
    ])


def guard(frames):
    return eased(frames, [(0, {}), (3, GUARD), (frames - 4, GUARD), (frames, {})])


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


MOUTH = Vector((0.0, -0.04, -0.085))
HELD_GRIP = Vector((-0.032, 0.1, 0.0))
EAT_AT = Vector((0.015, 0.1, -0.085))
EAT_UP = Vector((0.0, -0.3, 1.0))
EAT_FOREARM = Vector((-0.5, 0.4, 0.8))
DRINK_FOREARM = Vector((-0.3, 0.3, 0.9))
SIP_REACH = 0.22
OFF_HAND_LOW = {"z": -0.008, "rx": -0.04}
TOOL_AT = Vector((0.17, 0.36, -0.16))
TOOL_UP = Vector((0.4, 0.45, 1.0))
TOOL_FOREARM = Vector((-0.35, 1.0, 0.25))
HOLD_FRAMES = 96


def hold_at(wrist, grip, up, forearm):
    rot = frame(up, forearm) @ frame(Vector((0, 0, 1)), wrist).inverted()
    return arm_pose("R", rot, grip - rot @ (wrist + HELD_GRIP))


def eat(wrist):
    hold = hold_at(wrist, EAT_AT, EAT_UP, EAT_FOREARM)
    bite = hold_at(wrist, EAT_AT + Vector((0.0, -0.025, -0.006)), EAT_UP, EAT_FOREARM)
    keys = eased(30, [(0, hold), (10, bite), (20, hold), (30, hold)])

    def pose_at(fr):
        pose = keys(fr)
        chew = math.sin(6 * math.pi * fr / 30)
        pose["z"] += 0.003 * chew
        pose["rx"] += 0.015 * chew
        return pose
    return pose_at


def drink(wrist):
    def tilted(degrees):
        a = math.radians(degrees)
        neck = Vector((-0.45, -math.cos(a), -math.sin(a))).normalized()
        return hold_at(wrist, MOUTH - neck * SIP_REACH, neck, DRINK_FOREARM)
    hold, sip = tilted(5), tilted(30)
    return eased(30, [(0, hold), (10, sip), (16, sip), (26, hold), (30, hold)])


def hold_tool(wrist):
    hold = hold_at(wrist, TOOL_AT, TOOL_UP, TOOL_FOREARM)
    sway = idle(HOLD_FRAMES, 0.0, 1)

    def pose_at(fr):
        breath = sway(fr)
        return {k: hold.get(k, 0.0) + breath.get(k, 0.0) for k in hold.keys() | breath.keys()}
    return pose_at


def pick(fr):
    pose = PICK_KEYS(fr)
    if 26 < fr < 63:
        tug = (1 - math.cos(4 * math.pi * (fr - 26) / 37)) / 2
        pose["z"] -= 0.015 * tug
        pose["flex"] -= 0.05 * tug
    return pose


def hand_pose(index, middle, ring, pinky, thumb, spread=0.0):
    pose = {name + "S": spread * FINGER_SPREAD[name] for name in FINGER_SPREAD}
    for name, curl in (("Index", index), ("Middle", middle), ("Ring", ring), ("Pinky", pinky)):
        for i, angle in enumerate(curl, 1):
            pose[f"{name}{i}"] = angle
    pose["Thumb1"], pose["ThumbS"], pose["Thumb2"], pose["Thumb3"] = thumb
    return pose


RELAXED = hand_pose((25, 32, 15), (30, 38, 18), (35, 42, 20), (40, 45, 22), (12, 10, 8, 12))
FIST = hand_pose((88, 100, 60), (90, 100, 60), (92, 100, 58), (94, 98, 55), (0, 10, 30, 60), -0.5)
GRIP = hand_pose((42, 55, 48), (45, 55, 50), (48, 57, 50), (52, 58, 50), (20, 20, 15, 20), -0.3)
OPEN = hand_pose((0, 4, 2), (0, 4, 2), (2, 5, 3), (4, 6, 3), (0, 25, 0, 0), 1.3)
GRAB = hand_pose((40, 45, 25), (42, 48, 25), (46, 50, 25), (50, 52, 25), (25, 30, 15, 10), 0.4)
PINCH = hand_pose((45, 55, 25), (70, 90, 55), (78, 92, 55), (85, 92, 50), (25, 5, 10, 15), -0.3)
HOOK = hand_pose((55, 60, 35), (58, 62, 35), (60, 64, 35), (62, 66, 35), (15, 15, 10, 5), -0.2)

LOOSE_FIST = hand_pose((60, 70, 40), (62, 72, 40), (65, 74, 40), (68, 75, 40), (0, 10, 25, 45), -0.3)

JAB_HAND = eased(JAB_FRAMES, [(0, RELAXED), (4, FIST), (7, FIST), (JAB_FRAMES, RELAXED)])
CROSS_HAND = eased(CROSS_FRAMES, [(0, RELAXED), (4, FIST), (10, FIST), (CROSS_FRAMES, RELAXED)])
PICK_HAND = eased(90, [(0, RELAXED), (4, RELAXED), (16, OPEN), (20, OPEN), (26, GRAB), (74, GRAB), (86, RELAXED), (90, RELAXED)])
KEY_HAND = eased(24, [(0, RELAXED), (3, RELAXED), (8, PINCH), (20, PINCH), (24, RELAXED)])
DOOR_HAND = eased(16, [(0, RELAXED), (3, OPEN), (7, HOOK), (10, HOOK), (16, RELAXED)])


def hold_hand(fr):
    return blend(GRIP, FIST, 0.05 * (1 - math.cos(2 * math.pi * fr / HOLD_FRAMES)) / 2)


def guard_hand(frames):
    return eased(frames, [(0, RELAXED), (3, LOOSE_FIST), (frames - 4, LOOSE_FIST), (frames, RELAXED)])


def finger_clips(side):
    relaxed = lambda fr: RELAXED
    main = lambda pose_at: pose_at if side == "R" else relaxed
    return {
        "Idle": (96, relaxed),
        "Walk": (24, relaxed),
        "Equip": (14, relaxed),
        "UseDoor": (16, main(DOOR_HAND)),
        "UseKey": (24, main(KEY_HAND)),
        "Punch": (CROSS_FRAMES, CROSS_HAND if side == "R" else guard_hand(CROSS_FRAMES)),
        "PunchL": (JAB_FRAMES, JAB_HAND if side == "L" else guard_hand(JAB_FRAMES)),
        "Pick": (90, main(PICK_HAND)),
        "Eat": (30, main(lambda fr: GRIP)),
        "Drink": (30, main(lambda fr: GRIP)),
        "Hold": (HOLD_FRAMES, main(hold_hand)),
    }


def digit_rotation(bone, side, pose):
    spread_sign = -1 if side == "R" else 1
    spread = pose.get(bone[:-1] + "S", 0.0) if bone.endswith("1") else 0.0
    return Matrix.Rotation(math.radians(pose[bone]), 3, "X") @ Matrix.Rotation(math.radians(spread_sign * spread), 3, "Z")


def pose_hand(P, side, pose):
    for bone in HAND_BONES[1:]:
        name = f"{bone}_{side}"
        local = digit_rotation(bone, side, RELAXED).inverted() @ digit_rotation(bone, side, pose)
        rest = P.rest[name]
        e = (rest @ local @ rest.inverted()).to_euler("XYZ")
        P.rx(name, math.degrees(e.x))
        P.ry(name, math.degrees(e.y))
        P.rz(name, math.degrees(e.z))


def bake_fingers(rig, side):
    clips = {clip: (frames, lambda ph, P, frames=frames, pose_at=pose_at: pose_hand(P, side, pose_at(ph * frames)))
             for clip, (frames, pose_at) in finger_clips(side).items()}
    sample_actions(rig, clips, FPS)
    for track in rig.animation_data.nla_tracks:
        for strip in track.strips:
            strip.action.name = f"{track.name}_{rig.name}"


def animate(arm, hand):
    for side, side_sign, idle_phase, walk_phase in (("R", 1, 0.0, 0.0), ("L", -1, 0.9, math.pi)):
        bake(arm[side], "Idle", 96, idle(96, idle_phase, side_sign))
        bake(arm[side], "Walk", 24, walk(24, walk_phase))
    bake(arm["R"], "Equip", 14, EQUIP)
    bake(arm["R"], "UseDoor", 16, USE_DOOR)
    bake(hand["R"], "UseDoor", 16, USE_DOOR, move_hand)
    bake(arm["R"], "UseKey", 24, USE_KEY)
    bake(hand["R"], "UseKey", 24, USE_KEY, move_hand)
    bake(arm["R"], "Punch", CROSS_FRAMES, cross(hand["R"].location))
    bake(arm["L"], "Punch", CROSS_FRAMES, mirrored(guard(CROSS_FRAMES)))
    bake(arm["L"], "PunchL", JAB_FRAMES, jab(hand["L"].location))
    bake(arm["R"], "PunchL", JAB_FRAMES, guard(JAB_FRAMES))
    bake(arm["R"], "Pick", 90, pick)
    bake(hand["R"], "Pick", 90, pick, move_hand)
    bake(arm["L"], "Pick", 90, PICK_BALANCE)
    for clip, pose_at in (("Eat", eat(hand["R"].location)), ("Drink", drink(hand["R"].location))):
        bake(arm["R"], clip, 30, pose_at)
        bake(arm["L"], clip, 30, lambda fr: OFF_HAND_LOW)
    bake(arm["R"], "Hold", HOLD_FRAMES, hold_tool(hand["R"].location))
    bake(arm["L"], "Hold", HOLD_FRAMES, idle(HOLD_FRAMES, 0.9, -1))


def build(key, load=import_skin, out_rel=("skins",), fp_proportions=False):
    sc = L.new_build_scene("FP_" + key)
    sc.render.fps = FPS
    body, imported = load(key)
    materials = [s.material for s in body.material_slots]
    coll = bpy.data.collections.new("FPArms_" + key)
    sc.collection.children.link(coll)
    root = empty(coll, "FPArms", None, (0, 0, 0))
    arm, hand, rig = {}, {}, {}
    for side in ("R", "L"):
        arm_bm, hand_bm, elbow, wrist, material = side_faces(body, side)
        if fp_proportions:
            slim_forearm(arm_bm, elbow, wrist)
        to_hand = MIRROR[side] @ HANG_TO_FORWARD @ Matrix.Translation(-wrist)
        ring, forearm = wrist_ring(arm_bm, hand_bm, elbow, wrist, material, to_hand)
        hand_bm.transform(to_hand)
        bmesh.ops.delete(hand_bm, geom=[f for f in hand_bm.faces if f.material_index != material], context="FACES")
        arm[side] = empty(coll, f"Arm_{side}", root, REST_ELBOW[side], REST_ROTATION[side])
        mesh_object(coll, f"ForeArm_{side}", arm_bm, elbow, materials).parent = arm[side]
        hand[side] = empty(coll, f"Hand_{side}", arm[side], (HANG_TO_FORWARD @ (wrist - elbow).to_4d()).to_3d())
        rig[side] = build_hand(coll, side, hand[side], ring, forearm, hand_bm, materials)
        hand_bm.free()
    for o in imported:
        bpy.data.objects.remove(o, do_unlink=True)
    for vl in sc.view_layers:
        vl.update()
    animate(arm, hand)
    for side in ("R", "L"):
        bake_fingers(rig[side], side)
    objs = [root, *arm.values(), *hand.values(), *rig.values(), *[o for o in coll.objects if o.type == "MESH"]]
    out_dir = os.path.join(L.OUT_ROOT, *out_rel, key)
    L.export_glb(os.path.join(out_dir, "fp_arms.glb"), objs, export_animations=True, export_animation_mode="NLA_TRACKS",
                 export_force_sampling=True, export_frame_range=False, export_optimize_animation_keep_anim_armature=False)
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
