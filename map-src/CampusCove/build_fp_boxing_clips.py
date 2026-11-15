import math
import os
import tempfile

if "__file__" not in globals():
    raise RuntimeError('Run with exec(open(p).read(), {"__file__": p}) so the script can find build_fp_arms.py')
HERE = os.path.dirname(os.path.abspath(__file__))
FP_ARMS_SCRIPT = os.path.join(HERE, "build_fp_arms.py")
OUT_FP_CLIPS = os.path.normpath(os.path.join(HERE, "..", "..", "front", "public", "assets", "animations", "boxing", "fp_clips.glb"))
FP_BOXING_ARGS = globals().get("FP_BOXING_ARGS", [])

import bpy
from mathutils import Vector

_source = open(FP_ARMS_SCRIPT, encoding="utf8").read()
FP = {"__file__": FP_ARMS_SCRIPT, "KEEP_SCENES": True}
exec(_source[:_source.index("\nif WEAR_TOPS is not None:")], FP)
eased, blend, bake, fist_at, pose_hand, FIST = FP["eased"], FP["blend"], FP["bake"], FP["fist_at"], FP["pose_hand"], FP["FIST"]

LOOP_FRAMES = 30
JAB_FRAMES = 13
CROSS_FRAMES = 24
HOOK_FRAMES = 33
HOOK_EXIT = 5
UPPERCUT_FRAMES = 28
UPPERCUT_EXIT = 4
UPPERCUT_CONTACT = 9
HIT_FRAMES = 9


def plus(a, b):
    return {k: a.get(k, 0.0) + b.get(k, 0.0) for k in a.keys() | b.keys()}


def mirror(side, v):
    return Vector((v[0] if side == "R" else -v[0], v[1], v[2]))


def aim(at, forearm, back):
    return {f"{name}{axis}": value for name, vec in (("a", at), ("f", forearm), ("b", back)) for axis, value in zip("xyz", vec)}


def vec(t, name):
    return t[name + "x"], t[name + "y"], t[name + "z"]


def solve(side, wrist, t):
    return fist_at(side, wrist[side], mirror(side, vec(t, "a")), mirror(side, vec(t, "f")), mirror(side, vec(t, "b")))


def keyed(side, wrist, frames, keys):
    aims = eased(frames, keys)
    return lambda fr: solve(side, wrist, aims(fr))


GUARD = aim((0.12, 0.28, -0.085), (-0.15, 0.35, 1.0), (0.4, 1.0, 0.0))
BLOCK = aim((0.06, 0.2, -0.03), (-0.05, 0.15, 1.0), (0.2, 1.0, 0.0))
TIGHT = aim((0.1, 0.26, -0.07), (-0.1, 0.3, 1.0), (0.4, 1.0, 0.0))


def breathing(side, wrist, t, frames):
    pose = solve(side, wrist, t)

    def pose_at(fr):
        a = 4 * math.pi * fr / frames
        return plus(pose, {"z": 0.006 * math.sin(a), "rx": 0.01 * math.sin(a)})
    return pose_at


def jab(wrist):
    load = aim((0.11, 0.25, -0.1), (-0.15, 0.35, 1.0), (0.4, 1.0, 0.0))
    contact = aim((0.03, 0.43, -0.05), (-0.4, 1.0, 0.65), (0.5, 0.0, 1.0))
    return keyed("L", wrist, JAB_FRAMES, [(0, GUARD), (2, load), (4, blend(load, contact, 0.8)), (5, contact), (JAB_FRAMES, GUARD)])


def cross(wrist):
    load = aim((0.13, 0.25, -0.11), (-0.15, 0.35, 1.0), (0.4, 1.0, 0.0))
    contact = aim((0.0, 0.44, -0.05), (-0.45, 1.0, 0.7), (0.5, 0.0, 1.0))
    through = aim((-0.02, 0.45, -0.055), (-0.5, 1.0, 0.7), (0.5, 0.0, 1.0))
    return keyed("R", wrist, CROSS_FRAMES, [(0, GUARD), (3, load), (7, blend(load, contact, 0.85)), (8, contact), (10, through), (CROSS_FRAMES, GUARD)])


def hook(wrist):
    load = aim((0.2, 0.26, -0.1), (-0.4, 0.5, 0.6), (1.0, 0.0, 0.5))
    contact = aim((0.0, 0.36, -0.06), (-1.0, 0.7, 0.95), (0.0, 0.2, 1.0))
    follow = aim((-0.02, 0.37, -0.06), (-1.0, 0.6, 0.95), (0.0, 0.2, 1.0))
    return keyed("L", wrist, HOOK_FRAMES, [(0, GUARD), (HOOK_EXIT, load), (10, blend(load, contact, 0.85)), (11, contact), (15, follow), (HOOK_FRAMES, GUARD)])


def uppercut(wrist):
    load = aim((0.11, 0.25, -0.17), (-0.05, 0.3, 1.0), (0.2, 1.0, -0.3))
    contact = aim((0.02, 0.4, -0.02), (-0.2, 0.3, 1.0), (0.1, 1.0, 0.1))
    follow = aim((0.01, 0.41, 0.01), (-0.2, 0.25, 1.0), (0.1, 1.0, 0.1))
    return keyed("R", wrist, UPPERCUT_FRAMES, [(0, GUARD), (UPPERCUT_EXIT, load), (8, blend(load, contact, 0.85)), (UPPERCUT_CONTACT, contact), (11, follow), (UPPERCUT_FRAMES, GUARD)])


def pulled_in(wrist, side, frames, at):
    return keyed(side, wrist, frames, [(0, GUARD), (at - 2, TIGHT), (at + 4, TIGHT), (frames, GUARD)])


def charged(pose_at, exit_frame, loaded):
    pose = pose_at(exit_frame)

    def pose_at_loop(fr):
        a = 4 * math.pi * fr / LOOP_FRAMES
        shake = 2 * math.pi * fr / LOOP_FRAMES
        tremble = {"x": 0.0015 * math.sin(6 * shake), "z": 0.0015 * math.sin(7 * shake)} if loaded else {}
        return plus(plus(pose, {"z": 0.006 * math.sin(a), "rx": 0.01 * math.sin(a)}), tremble)
    return pose_at_loop


def hit(wrist, side):
    guard = solve(side, wrist, GUARD)
    shake = eased(HIT_FRAMES, [(0, {}), (2, {"y": -0.05, "z": -0.04, "rx": 0.15}), (4, {"y": 0.01, "z": 0.02, "rx": -0.05}), (6, {"z": -0.01, "rx": 0.03}), (HIT_FRAMES, {})])
    return lambda fr: plus(guard, shake(fr))


def fp_clips(wrist):
    return {
        "FpGuard": (LOOP_FRAMES, {"R": breathing("R", wrist, GUARD, LOOP_FRAMES), "L": breathing("L", wrist, GUARD, LOOP_FRAMES)}),
        "FpBlock": (LOOP_FRAMES, {"R": breathing("R", wrist, BLOCK, LOOP_FRAMES), "L": breathing("L", wrist, BLOCK, LOOP_FRAMES)}),
        "FpJab": (JAB_FRAMES, {"L": jab(wrist), "R": pulled_in(wrist, "R", JAB_FRAMES, 5)}),
        "FpCross": (CROSS_FRAMES, {"R": cross(wrist), "L": pulled_in(wrist, "L", CROSS_FRAMES, 8)}),
        "FpHook": (HOOK_FRAMES, {"L": hook(wrist), "R": pulled_in(wrist, "R", HOOK_FRAMES, 11)}),
        "FpUppercut": (UPPERCUT_FRAMES, {"R": uppercut(wrist), "L": pulled_in(wrist, "L", UPPERCUT_FRAMES, UPPERCUT_CONTACT)}),
        "FpHookCharge": (LOOP_FRAMES, {"L": charged(hook(wrist), HOOK_EXIT, True),
                                       "R": charged(pulled_in(wrist, "R", HOOK_FRAMES, 11), HOOK_EXIT, False)}),
        "FpUppercutCharge": (LOOP_FRAMES, {"R": charged(uppercut(wrist), UPPERCUT_EXIT, True),
                                           "L": charged(pulled_in(wrist, "L", UPPERCUT_FRAMES, UPPERCUT_CONTACT), UPPERCUT_EXIT, False)}),
        "FpHit": (HIT_FRAMES, {"R": hit(wrist, "R"), "L": hit(wrist, "L")}),
    }


def fist_fingers(rig, side, clips):
    FP["sample_actions"](rig, {clip: (frames, lambda ph, P: pose_hand(P, side, FIST)) for clip, (frames, _) in clips.items()}, FP["FPS"])
    for track in rig.animation_data.nla_tracks:
        for strip in track.strips:
            strip.action.name = f"{track.name}_{rig.name}"


FP["L"].OUT_ROOT = tempfile.mkdtemp(prefix="fp_boxing_")
FP["build"]("bare", load=lambda _key: FP["import_wear"](None), out_rel=("wear",), fp_proportions=True)
scene = bpy.data.scenes["FP_bare"]
for ob in scene.objects:
    if ob.animation_data:
        for track in list(ob.animation_data.nla_tracks):
            ob.animation_data.nla_tracks.remove(track)
        ob.animation_data.action = None
for action in list(bpy.data.actions):
    bpy.data.actions.remove(action)

arm = {side: scene.objects[f"Arm_{side}"] for side in ("R", "L")}
hand = {side: scene.objects[f"Hand_{side}"] for side in ("R", "L")}
rig = {side: scene.objects[f"HandRig_{side}"] for side in ("R", "L")}
for side in ("R", "L"):
    arm[side].location, arm[side].rotation_euler = FP["REST_ELBOW"][side], FP["REST_ROTATION"][side]
    hand[side].rotation_euler = (0.0, 0.0, 0.0)
clips = fp_clips({side: hand[side].location.copy() for side in ("R", "L")})
for clip, (frames, sides) in clips.items():
    for side, pose_at in sides.items():
        bake(arm[side], clip, frames, pose_at)
for side in ("R", "L"):
    fist_fingers(rig[side], side, clips)

if "build" not in FP_BOXING_ARGS:
    for ob in [o for o in scene.objects if o.type == "MESH"]:
        bpy.data.objects.remove(ob, do_unlink=True)
    root = scene.objects["FPArms"]
    FP["L"].export_glb(OUT_FP_CLIPS, [root, *arm.values(), *hand.values(), *rig.values()], export_animations=True,
                       export_animation_mode="NLA_TRACKS", export_force_sampling=True, export_frame_range=False,
                       export_optimize_animation_size=False, export_optimize_animation_keep_anim_armature=True)
    print("exported", OUT_FP_CLIPS)
