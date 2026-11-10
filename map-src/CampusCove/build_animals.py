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
from mathutils import Matrix, Vector

SRC_DIR = os.path.normpath(os.path.join(HERE, "..", "..", "docs", "quaternius"))
ONLY = globals().get("ONLY_ANIMALS")
OUT_DIR = os.path.join(L.OUT_ROOT, "animals")
SKINS_DIR = os.path.normpath(os.path.join(HERE, "..", "..", "front", "scripts", "skins")) + "/"
POSE = {"SKINS_DIR": SKINS_DIR, "bpy": bpy}
exec(open(SKINS_DIR + "anim.py", encoding="utf8").read(), POSE)
min_jerk = POSE["min_jerk"]


def import_rig(path):
    if not os.path.isfile(path):
        raise FileNotFoundError(f"{path} missing: the CC0 source rigs live in docs/quaternius (see its README)")
    objects_before = set(bpy.data.objects)
    actions_before = set(bpy.data.actions)
    with contextlib.redirect_stdout(io.StringIO()):
        bpy.ops.import_scene.gltf(filepath=path)
    imported = [o for o in bpy.data.objects if o not in objects_before]
    arm = next(o for o in imported if o.type == "ARMATURE")
    world = arm.matrix_world.copy()
    arm.parent = None
    arm.matrix_world = world
    for o in imported:
        if o is not arm:
            bpy.data.objects.remove(o, do_unlink=True)
    clips = set()
    for action in [a for a in bpy.data.actions if a not in actions_before]:
        clip = action.name.split("|")[-1].lower()
        stale = bpy.data.actions.get(clip)
        if stale is not None:
            bpy.data.actions.remove(stale)
        action.name = clip
        clips.add(clip)
    return arm, clips


def ellipsoid(bm, center, size, seg=8, rings=6, tilt=0.0):
    geom = bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=0.5)
    place = Matrix.Translation(center) @ Matrix.Rotation(tilt, 4, "X") @ Matrix.Diagonal((*size, 1.0))
    bmesh.ops.transform(bm, matrix=place, verts=geom["verts"])


def spike(bm, base, direction, radius, length, seg=4):
    geom = bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=radius, radius2=0.0, depth=length)
    axis = Vector(direction).normalized()
    place = Matrix.Translation(Vector(base) + axis * length / 2) @ axis.to_track_quat("Z", "Y").to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=place, verts=geom["verts"])


def rod(bm, top, bottom, radius, seg=6):
    top, bottom = Vector(top), Vector(bottom)
    geom = bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=radius, radius2=radius, depth=(top - bottom).length)
    axis = (top - bottom).normalized()
    place = Matrix.Translation((top + bottom) / 2) @ axis.to_track_quat("Z", "Y").to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=place, verts=geom["verts"])


def skinned_piece(coll, arm, name, mat, bone, *shapes):
    bm = bmesh.new()
    for shape, *args in shapes:
        shape(bm, *args)
    bm.normal_update()
    L._box_uv(bm, 0.25)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    ob.vertex_groups.new(name=bone).add(range(len(me.vertices)), 1.0, "REPLACE")
    ob.parent = arm
    ob.matrix_parent_inverse = arm.matrix_world.inverted()
    ob.modifiers.new("Armature", "ARMATURE").object = arm
    return ob


def bird_walk(arm, leg_height, sweep=18.0, duty=0.7, nod=6.0, roll=3.0):
    to_arm = 1.0 / arm.scale[0]

    def leg_angle(s):
        if s < duty:
            return -sweep + 2 * sweep * s / duty
        return sweep - 2 * sweep * min_jerk((s - duty) / (1 - duty))

    def head_hold_then_thrust(t):
        return min_jerk(t / 0.75) if t < 0.75 else 1 - min_jerk((t - 0.75) / 0.25)

    def f(ph, P):
        drops = []
        for bone, touchdown in (("Leg.L", 0.0), ("Leg.R", 0.5)):
            s = (ph - touchdown) % 1.0
            angle = leg_angle(s)
            P.rx(bone, angle)
            if s < duty:
                drops.append(leg_height * (1 - math.cos(math.radians(angle))))
        for bone in ("Root", "Body"):
            P.move(bone, 0, min(drops) * to_arm, 0)
        P.rz("Body", roll * math.sin(2 * math.pi * ph))
        P.rx("Body", nod * (0.5 - head_hold_then_thrust((2 * ph) % 1.0)))
    return f


def scale_to_height(arm, pieces, height):
    top = max((o.matrix_world @ v.co).z for o in pieces for v in o.data.vertices)
    arm.scale = arm.scale * (height / top)
    arm.location = (0.0, 0.0, 0.0)


def triangles(pieces):
    return sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in pieces)


def export_animal(key, sc, arm, pieces, preview_cam, clips):
    foreign = sorted(a.name for a in bpy.data.actions if a.name not in clips)
    if foreign:
        raise RuntimeError(f"{key}: actions {foreign} would leak into the GLB (ACTIONS mode exports every action); remove them first")
    idle = bpy.data.actions["idle"]
    arm.animation_data.action = idle
    arm.animation_data.action_slot = idle.slots[0]
    sc.frame_set(0)
    low = min((o.matrix_world @ Vector(c)).z for o in pieces for c in o.bound_box)
    if not 0.0 <= low <= 0.03:
        raise RuntimeError(f"{key}: lowest point at {low:.3f} m, expected between 0 and 0.03")
    out = os.path.join(OUT_DIR, key)
    L.export_glb(os.path.join(out, "model.glb"), [arm, *pieces], export_animations=True, export_animation_mode="ACTIONS", export_skins=True, export_anim_slide_to_zero=True)
    L.snapshot(sc, os.path.join(out, "preview.png"), preview_cam, (0.0, 0.2, 0.0), lens=50.0, res=(512, 512))
    print(f"{key}: {triangles(pieces)} tris, {len(pieces)} pieces, clips {sorted(clips)}")


def chicken():
    sc = L.new_build_scene("ANIMALS_chicken")
    coll = bpy.data.collections.new("Chicken")
    sc.collection.children.link(coll)
    arm, clips = import_rig(os.path.join(SRC_DIR, "chicken.glb"))
    feather = L.make_mat("AN_Chicken_Feather", "#f6efe2", 0.9, "noise", 0.04, accent="#e8dcc6")
    wing = L.make_mat("AN_Chicken_Wing", "#ebdfca", 0.9, "noise", 0.05)
    comb = L.make_mat("AN_Chicken_Comb", "#ff8f8f", 0.8, "noise", 0.05)
    beak = L.make_mat("AN_Chicken_Beak", "#ffbf69", 0.7, "noise", 0.04)
    eye = L.make_mat("AN_Chicken_Eye", "#5b4a6e", 0.4, "noise", 0.02)

    def leg(side, x):
        toes = [(spike, (x, 0.03, 0.03), (dx, -1.0, 0.0), 0.025, 0.13) for dx in (-0.5, 0.0, 0.5)]
        return skinned_piece(coll, arm, f"Chicken_Leg_{side}", beak, f"Leg.{side}",
                             (rod, (x, 0.031, 0.36), (x, 0.031, 0.04), 0.03),
                             (spike, (x, 0.03, 0.03), (0.0, 1.0, 0.0), 0.025, 0.07), *toes)

    def wing_piece(side, x):
        return skinned_piece(coll, arm, f"Chicken_Wing_{side}", wing, "Body",
                             (ellipsoid, (x, 0.08, 0.64), (0.08, 0.46, 0.32), 8, 6, -0.25))

    pieces = [
        skinned_piece(coll, arm, "Chicken_Body", feather, "Body", (ellipsoid, (0.0, 0.05, 0.62), (0.56, 0.78, 0.6), 8, 6, -0.15)),
        skinned_piece(coll, arm, "Chicken_Head", feather, "Body", (ellipsoid, (0.0, -0.28, 0.98), (0.36, 0.36, 0.4))),
        skinned_piece(coll, arm, "Chicken_Beak", beak, "Body", (spike, (0.0, -0.42, 0.97), (0.0, -1.0, -0.15), 0.06, 0.14)),
        skinned_piece(coll, arm, "Chicken_Wattle", comb, "Body", (ellipsoid, (0.0, -0.43, 0.86), (0.07, 0.06, 0.11), 6, 4)),
        skinned_piece(coll, arm, "Chicken_Comb", comb, "Body",
                      *[(ellipsoid, (0.0, y, z), (0.06, 0.1, 0.12), 6, 4) for y, z in ((-0.36, 1.17), (-0.27, 1.21), (-0.18, 1.17))]),
        skinned_piece(coll, arm, "Chicken_Eyes", eye, "Body",
                      *[(ellipsoid, (x, -0.36, 1.03), (0.03, 0.06, 0.07), 6, 4) for x in (-0.16, 0.16)]),
        skinned_piece(coll, arm, "Chicken_Tail", feather, "Body",
                      *[(spike, (0.0, 0.36, 0.72), (dx, 0.6, 1.0), 0.09, 0.32) for dx in (-0.35, 0.0, 0.35)]),
        wing_piece("L", 0.29),
        wing_piece("R", -0.29),
        leg("L", 0.106),
        leg("R", -0.106),
    ]
    scale_to_height(arm, pieces, 0.45)
    POSE["sample_actions"](arm, {"walk": (20, bird_walk(arm, leg_height=0.128))}, fps=sc.render.fps)
    export_animal("chicken", sc, arm, pieces, (0.9, 0.45, 1.1), clips | {"walk"})


ANIMALS = {"chicken": chicken}

for key, build in ANIMALS.items():
    if ONLY is None or key in ONLY:
        build()
