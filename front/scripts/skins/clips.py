if "SKINS_DIR" not in globals():
    raise RuntimeError("Run these scripts through run.py (blender --background --python front/scripts/skins/run.py): they share state via exec().")

import math
S_ = math.sin

def neon_extras(ph, P, energy, speed):
    a = 2 * math.pi * ph * speed
    base = 4 + 22 * energy
    gain = 0.5 + 0.9 * energy
    P.rx('Cape1', base * 0.5 + 3 * gain * S_(a - 0.31))
    P.rx('Cape2', base * 0.8 + 5 * gain * S_(a - 0.63))
    P.rx('Cape3', base * 1.0 + 8 * gain * S_(a - 0.94))
    P.rx('Sash1', (2 + 10 * energy) + 4 * gain * S_(a - 0.31))
    P.rx('Sash2', (3 + 14 * energy) + 6 * gain * S_(a - 0.63))

def street_extras(ph, P, energy, speed):
    a = 2 * math.pi * ph * speed
    P.rx('Pend', (3 + 7 * energy) * S_(a - 0.63))

def oracle_extras(ph, P, energy, speed):
    a = 2 * math.pi * ph * speed
    base = 3 + 20 * energy
    gain = 0.5 + 0.9 * energy
    P.rx('Cape1', base * 0.5 + 3 * gain * S_(a - 0.31))
    P.rx('Cape2', base * 0.8 + 5 * gain * S_(a - 0.63))
    P.rx('Cape3', base * 1.0 + 8 * gain * S_(a - 0.94))
    P.ry('Halo1', 90 * ph)
    if energy == 0.0:
        P.rz('Halo2', 360 * ph)
    for i, nm in enumerate(('Orb1', 'Orb2', 'Orb3')):
        P.rz(nm, 360.0 * ph)
        P.move(nm, 0, 0, 0.03 * S_(2 * math.pi * ph + i * 2.1))

def pose_sit(extras=None):
    def f(ph, P):
        a = 2 * math.pi * ph
        P.move('Hips', 0, 0, -0.45)
        P.rx('Spine', 4 - 0.6 * S_(a)); P.rx('Chest', -1.2 * S_(a))
        P.rx('Head', -3 + 1.0 * S_(2 * a - 0.6)); P.rz('Head', 6 * S_(a + 1.0) + 2 * S_(3 * a))
        for side, sgn in (('.L', 1), ('.R', -1)):
            P.move('Shoulder' + side, 0, 0, 0.004 * S_(a))
            P.rx('UpperLeg' + side, -94); P.rx('LowerLeg' + side, 86); P.rx('Foot' + side, 8)
            P.rx('UpperArm' + side, -35); P.ry('UpperArm' + side, sgn * 25)
            P.rx('LowerArm' + side, -25); P.ry('LowerArm' + side, sgn * 30); P.rx('Hand' + side, 10)
        if extras:
            extras(ph, P, 0.0, 1.0)
    return f

def pose_pick():
    grab = {("UpperArm.R", "x"): -145, ("LowerArm.R", "x"): -8, ("Hand.R", "x"): 20, ("Chest", "x"): -8, ("Spine", "x"): -4,
            ("Head", "x"): -18, ("UpperArm.L", "x"): 18, ("LowerArm.L", "x"): -20}
    crouch = {("Hips", "z"): -0.02, ("Chest", "x"): 4, ("UpperArm.R", "x"): 10}
    for side in (".L", ".R"):
        crouch.update({("UpperLeg" + side, "x"): -14, ("LowerLeg" + side, "x"): 26, ("Foot" + side, "x"): -12})
    pose_at = key_poses([
        (0.0, {}),
        (0.05, crouch),
        (0.22, {**grab, ("Hand.R", "x"): -10}),
        (0.27, grab),
        (0.70, grab),
        (0.82, {("UpperArm.R", "x"): -40, ("LowerArm.R", "x"): -70, ("Hand.R", "x"): 20, ("Chest", "x"): 3, ("Head", "x"): -4,
                ("UpperArm.L", "x"): 8, ("LowerArm.L", "x"): -10}),
        (0.92, {("UpperArm.R", "x"): 3, ("LowerArm.R", "x"): -5, ("Head", "x"): 2}),
        (1.0, {}),
    ])

    def f(ph, P):
        for (bone, axis), value in pose_at(ph).items():
            if axis == "z":
                P.move(bone, 0, 0, value)
            else:
                P.rx(bone, value)
        if 0.27 < ph < 0.70:
            tug = S_(2 * math.pi * 2 * (ph - 0.27) / 0.43)
            P.rx("Hand.R", 4 * tug); P.rx("LowerArm.R", -5 * tug); P.rx("Chest", 1.5 * tug)
    return f

def _apply_rotations(P, pose):
    for (bone, axis), value in pose.items():
        getattr(P, 'r' + axis)(bone, value)

def pose_eat(extras=None):
    at_mouth = {("UpperArm.R", "x"): -10, ("UpperArm.R", "z"): 100, ("UpperArm.R", "y"): 30, ("LowerArm.R", "x"): -150,
                ("Head", "x"): 6, ("Chest", "x"): 3, ("Spine", "x"): 2, ("UpperArm.L", "x"): 8, ("LowerArm.L", "x"): -12}
    bite = {**at_mouth, ("Head", "x"): 10, ("LowerArm.R", "x"): -146, ("Hand.R", "x"): -6}
    pose_at = key_poses([
        (0.0, {}),
        (0.10, {("UpperArm.R", "x"): 8, ("Chest", "x"): -1, ("UpperArm.L", "x"): 4}),
        (0.32, at_mouth),
        (0.38, at_mouth),
        (0.45, bite),
        (0.52, at_mouth),
        (0.59, bite),
        (0.66, at_mouth),
        (0.84, {("UpperArm.R", "z"): 60, ("UpperArm.R", "y"): 15, ("LowerArm.R", "x"): -110, ("Head", "x"): 2,
                ("UpperArm.L", "x"): 3, ("LowerArm.L", "x"): -5}),
        (1.0, {}),
    ])

    def f(ph, P):
        _apply_rotations(P, pose_at(ph))
        if ph > 0.66:
            u = (ph - 0.66) / 0.34
            P.rx("Head", 2 * S_(2 * math.pi * 3 * u) * S_(math.pi * u))
        if extras:
            extras(ph, P, 0.0, 1.0)
    return f

def pose_drink(extras=None):
    at_mouth = {("UpperArm.R", "x"): -10, ("UpperArm.R", "z"): 100, ("UpperArm.R", "y"): 30, ("LowerArm.R", "x"): -150,
                ("Hand.R", "x"): 10, ("Head", "x"): -4, ("UpperArm.L", "x"): 6, ("LowerArm.L", "x"): -10}
    tipped = {("UpperArm.R", "x"): -10, ("UpperArm.R", "z"): 100, ("UpperArm.R", "y"): 40, ("LowerArm.R", "x"): -140,
              ("Hand.R", "x"): -30, ("Head", "x"): -22, ("Chest", "x"): -4, ("Spine", "x"): -1,
              ("UpperArm.L", "x"): 8, ("LowerArm.L", "x"): -14}
    pose_at = key_poses([
        (0.0, {}),
        (0.10, {("UpperArm.R", "x"): 6, ("UpperArm.L", "x"): 3}),
        (0.32, at_mouth),
        (0.38, at_mouth),
        (0.55, tipped),
        (0.72, tipped),
        (0.84, {("UpperArm.R", "z"): 60, ("UpperArm.R", "y"): 15, ("LowerArm.R", "x"): -110, ("Head", "x"): 2,
                ("UpperArm.L", "x"): 3, ("LowerArm.L", "x"): -5}),
        (1.0, {}),
    ])

    def f(ph, P):
        _apply_rotations(P, pose_at(ph))
        if 0.55 < ph < 0.72:
            P.rx("Head", 1.5 * S_(2 * math.pi * 2 * (ph - 0.55) / 0.17))
        if extras:
            extras(ph, P, 0.0, 1.0)
    return f

def _apply_sport_pose(P, pose, ik_sides):
    bones = {}
    for (bone, axis), value in pose.items():
        bones.setdefault(bone, {})[axis] = value
    for bone, ch in bones.items():
        if bone == 'Hips' and 'h' in ch:
            P.move('Hips', 0, 0, ch['h'])
        if bone.startswith('Foot') and bone[4:] in ik_sides:
            continue
        r = Euler([math.radians(ch.get(a, 0.0)) for a in 'xyz'], 'XYZ').to_matrix()
        if ch.get('t'):
            r = r @ Matrix.Rotation(math.radians(ch['t']), 3, 'Z')
        _set_rot(P, bone, r)
    for side in ik_sides:
        ch = bones.get('Foot' + side, {})
        rest = P.arm.data.bones['Foot' + side].head_local
        ankle = (rest.x + ch.get('ik_x', 0.0), rest.y + ch.get('ik_y', 0.0), rest.z + ch.get('ik_z', 0.0))
        leg_ik(P, side, ankle, ch.get('pitch', 0.0))

def swing_bend(bone, t0, t1, deg):
    def bend(ph, P):
        if t0 < ph < t1:
            P.rx(bone, deg * S_(math.pi * (ph - t0) / (t1 - t0)))
    return bend

def sport_clip(keys, ik_sides, extras=None, bend=None):
    pose_at = key_poses(keys)

    def f(ph, P):
        _apply_sport_pose(P, pose_at(ph), ik_sides)
        if bend:
            bend(ph, P)
        if extras:
            extras(ph, P, 0.0, 1.0)
    return f

def pose_kick(extras=None):
    return sport_clip([
        (0.0, {}),
        (3 / 14, {("UpperLeg.R", "x"): 28, ("UpperLeg.R", "t"): -25, ("LowerLeg.R", "x"): 55, ("Foot.R", "x"): -30,
                  ("Hips", "h"): -0.02, ("Hips", "z"): -6, ("Spine", "x"): 6, ("Chest", "z"): -6,
                  ("UpperArm.L", "x"): -30, ("UpperArm.L", "y"): -25, ("LowerArm.L", "x"): -25,
                  ("UpperArm.R", "x"): 20, ("UpperArm.R", "y"): 15, ("LowerArm.R", "x"): -20}),
        (6 / 14, {("UpperLeg.R", "x"): -30, ("UpperLeg.R", "t"): -40, ("LowerLeg.R", "x"): 10, ("Foot.R", "x"): -8,
                  ("Hips", "h"): -0.035, ("Hips", "z"): 8, ("Spine", "x"): 5, ("Chest", "z"): 6,
                  ("UpperArm.L", "x"): -15, ("UpperArm.L", "y"): -30, ("LowerArm.L", "x"): -20,
                  ("UpperArm.R", "x"): -15, ("UpperArm.R", "y"): 20, ("LowerArm.R", "x"): -20}),
        (9 / 14, {("UpperLeg.R", "x"): -40, ("UpperLeg.R", "t"): -28, ("LowerLeg.R", "x"): 20, ("Foot.R", "x"): -4,
                  ("Hips", "h"): -0.03, ("Hips", "z"): 6, ("Spine", "x"): 3, ("Chest", "z"): 4,
                  ("UpperArm.L", "x"): -10, ("UpperArm.L", "y"): -20, ("LowerArm.L", "x"): -15,
                  ("UpperArm.R", "x"): -8, ("UpperArm.R", "y"): 12, ("LowerArm.R", "x"): -15}),
        (12 / 14, {("UpperLeg.R", "x"): -6, ("UpperLeg.R", "t"): -6, ("LowerLeg.R", "x"): 14, ("Foot.R", "x"): -8,
                   ("Hips", "h"): -0.01}),
        (1.0, {}),
    ], ('.L',), extras, swing_bend("LowerLeg.R", 3 / 14, 6 / 14, 35))

def pose_shot(extras=None):
    return sport_clip([
        (0.0, {}),
        (3 / 21, {("Hips", "h"): -0.015, ("UpperLeg.R", "x"): 6, ("LowerLeg.R", "x"): 12, ("Foot.R", "x"): -18, ("Spine", "x"): 4,
                  ("UpperArm.L", "x"): -10, ("UpperArm.R", "x"): 8}),
        (8 / 21, {("UpperLeg.R", "x"): 42, ("LowerLeg.R", "x"): 100, ("Foot.R", "x"): 35,
                  ("Hips", "h"): -0.06, ("Hips", "z"): -12, ("Spine", "x"): -4, ("Chest", "z"): -14,
                  ("UpperArm.L", "x"): -45, ("UpperArm.L", "y"): -40, ("LowerArm.L", "x"): -20,
                  ("UpperArm.R", "x"): 30, ("UpperArm.R", "y"): 25, ("LowerArm.R", "x"): -15}),
        (11 / 21, {("UpperLeg.R", "x"): -35, ("LowerLeg.R", "x"): 8, ("Foot.R", "x"): 40,
                   ("Hips", "h"): -0.07, ("Hips", "z"): 8, ("Spine", "x"): 10, ("Chest", "z"): 14,
                   ("UpperArm.L", "x"): 20, ("UpperArm.L", "y"): -35, ("LowerArm.L", "x"): -20,
                   ("UpperArm.R", "x"): -30, ("UpperArm.R", "y"): 30, ("LowerArm.R", "x"): -20}),
        (14 / 21, {("UpperLeg.R", "x"): -72, ("LowerLeg.R", "x"): 22, ("Foot.R", "x"): 30,
                   ("Hips", "h"): -0.04, ("Hips", "x"): -8, ("Hips", "z"): 8, ("Spine", "x"): 4, ("Chest", "z"): 10,
                   ("UpperArm.L", "x"): 10, ("UpperArm.L", "y"): -30, ("LowerArm.L", "x"): -20,
                   ("UpperArm.R", "x"): -20, ("UpperArm.R", "y"): 25, ("LowerArm.R", "x"): -20}),
        (18 / 21, {("UpperLeg.R", "x"): -12, ("LowerLeg.R", "x"): 30, ("Foot.R", "x"): -16, ("Hips", "h"): -0.01,
                   ("Hips", "z"): 2, ("UpperArm.L", "y"): -8}),
        (1.0, {}),
    ], ('.L',), extras, swing_bend("LowerLeg.R", 8 / 21, 11 / 21, 50))

def pose_tackle(extras=None):
    slide = {("Hips", "h"): -0.67, ("Hips", "x"): -35, ("Hips", "y"): 22, ("Spine", "x"): 8, ("Chest", "x"): 6,
             ("Head", "x"): 14, ("Foot.R", "ik_y"): -0.95, ("Foot.R", "ik_z"): 0.08, ("Foot.R", "pitch"): -12,
             ("Foot.L", "ik_x"): 0.05, ("Foot.L", "ik_y"): -0.30, ("Foot.L", "ik_z"): 0.03,
             ("UpperArm.L", "x"): 30, ("UpperArm.L", "y"): -35, ("LowerArm.L", "x"): -10,
             ("UpperArm.R", "x"): -55, ("UpperArm.R", "y"): 30, ("LowerArm.R", "x"): -35}
    return sport_clip([
        (0.0, {}),
        (3 / 36, {("Hips", "h"): -0.10, ("Spine", "x"): 10, ("Foot.R", "ik_y"): -0.12,
                  ("UpperArm.L", "x"): 12, ("UpperArm.R", "x"): -15}),
        (10 / 36, slide),
        (20 / 36, {**slide, ("Hips", "h"): -0.68, ("Foot.R", "ik_y"): -1.0, ("Head", "x"): 8}),
        (26 / 36, {("Hips", "h"): -0.52, ("Hips", "x"): -4, ("Hips", "y"): 10, ("Spine", "x"): 32, ("Head", "x"): -10,
                   ("Foot.R", "ik_y"): -0.12, ("Foot.L", "ik_y"): 0.06, ("Foot.L", "ik_z"): 0.045, ("Foot.L", "pitch"): 20,
                   ("UpperArm.L", "x"): 10, ("UpperArm.L", "y"): -30, ("LowerArm.L", "x"): -10,
                   ("UpperArm.R", "x"): -40, ("UpperArm.R", "y"): 10, ("LowerArm.R", "x"): -50}),
        (31 / 36, {("Hips", "h"): -0.18, ("Spine", "x"): 14, ("Head", "x"): -4, ("Foot.R", "ik_y"): -0.04,
                   ("UpperArm.L", "x"): 6, ("UpperArm.R", "x"): -12, ("LowerArm.R", "x"): -20}),
        (1.0, {}),
    ], ('.L', '.R'), extras)

def pose_celebrate(extras=None):
    arms_up = {("UpperArm.R", "x"): -160, ("UpperArm.R", "y"): -25, ("UpperArm.L", "x"): -160, ("UpperArm.L", "y"): 25,
               ("LowerArm.R", "x"): -10, ("LowerArm.L", "x"): -10, ("Head", "x"): -12, ("Chest", "x"): -6,
               ("Shoulder.R", "y"): 15, ("Shoulder.L", "y"): -15}
    pump = {**arms_up, ("LowerArm.R", "x"): -65, ("LowerArm.L", "x"): -65, ("Hips", "h"): -0.03}
    return sport_clip([
        (0.0, {}),
        (4 / 36, {("Hips", "h"): -0.12, ("Spine", "x"): 12, ("Head", "x"): 4,
                  ("UpperArm.R", "x"): 25, ("UpperArm.L", "x"): 25, ("LowerArm.R", "x"): -20, ("LowerArm.L", "x"): -20}),
        (9 / 36, {**arms_up, ("Hips", "h"): 0.16, ("Foot.L", "ik_z"): 0.14, ("Foot.R", "ik_z"): 0.14,
                  ("Foot.L", "pitch"): 30, ("Foot.R", "pitch"): 30}),
        (14 / 36, {**arms_up, ("Hips", "h"): -0.10}),
        (18 / 36, pump),
        (22 / 36, arms_up),
        (26 / 36, pump),
        (31 / 36, {("UpperArm.R", "x"): -30, ("UpperArm.L", "x"): -30, ("LowerArm.R", "x"): -40, ("LowerArm.L", "x"): -40,
                   ("Hips", "h"): -0.02}),
        (1.0, {}),
    ], ('.L', '.R'), extras)

def pose_jump_shot(extras=None):
    set_ball = {("UpperArm.R", "x"): -40, ("UpperArm.R", "y"): -15, ("LowerArm.R", "x"): -110,
                ("UpperArm.L", "x"): -40, ("UpperArm.L", "y"): 15, ("LowerArm.L", "x"): -110}
    release = {("Hips", "h"): 0.18, ("Foot.L", "ik_z"): 0.16, ("Foot.R", "ik_z"): 0.16, ("Foot.L", "pitch"): 35,
               ("Foot.R", "pitch"): 35, ("Head", "x"): -14,
               ("UpperArm.R", "x"): -165, ("LowerArm.R", "x"): -10, ("Hand.R", "x"): -50,
               ("UpperArm.R", "y"): 8, ("UpperArm.L", "x"): -130, ("UpperArm.L", "y"): -8, ("LowerArm.L", "x"): -40,
               ("Shoulder.R", "y"): 12, ("Shoulder.L", "y"): -12}
    return sport_clip([
        (0.0, {}),
        (5 / 24, {**set_ball, ("Hips", "h"): -0.14, ("Spine", "x"): 12, ("Head", "x"): -8}),
        (9 / 24, {("Hips", "h"): 0.12, ("Foot.L", "ik_z"): 0.10, ("Foot.R", "ik_z"): 0.10, ("Foot.L", "pitch"): 30,
                  ("Foot.R", "pitch"): 30, ("Head", "x"): -14,
                  ("UpperArm.R", "x"): -150, ("LowerArm.R", "x"): -70, ("Hand.R", "x"): 25,
                  ("UpperArm.L", "x"): -150, ("LowerArm.L", "x"): -70, ("Shoulder.R", "y"): 10, ("Shoulder.L", "y"): -10}),
        (11 / 24, release),
        (14 / 24, {**release, ("Hips", "h"): 0.10, ("Foot.L", "ik_z"): 0.08, ("Foot.R", "ik_z"): 0.08}),
        (18 / 24, {("Hips", "h"): -0.10, ("Spine", "x"): 6, ("UpperArm.R", "x"): -90, ("LowerArm.R", "x"): -30,
                   ("Hand.R", "x"): -20, ("UpperArm.L", "x"): -50, ("LowerArm.L", "x"): -30}),
        (1.0, {}),
    ], ('.L', '.R'), extras)

def pose_dunk(extras=None):
    peak = {("Hips", "h"): 0.45, ("Spine", "x"): -4, ("Head", "x"): -15,
            ("Foot.L", "ik_y"): 0.12, ("Foot.L", "ik_z"): 0.32, ("Foot.L", "pitch"): 40,
            ("Foot.R", "ik_y"): -0.40, ("Foot.R", "ik_z"): 0.80, ("Foot.R", "pitch"): 20,
            ("UpperArm.R", "x"): -175, ("LowerArm.R", "x"): -5, ("Hand.R", "x"): 15, ("Shoulder.R", "y"): 15,
            ("UpperArm.L", "x"): -40, ("UpperArm.L", "y"): -20, ("LowerArm.L", "x"): -30}
    return sport_clip([
        (0.0, {}),
        (5 / 27, {("Hips", "h"): -0.16, ("Spine", "x"): 18, ("Head", "x"): -6, ("Foot.R", "ik_y"): 0.10,
                  ("UpperArm.R", "x"): 35, ("UpperArm.L", "x"): 35, ("LowerArm.R", "x"): -20, ("LowerArm.L", "x"): -20}),
        (12 / 27, peak),
        (15 / 27, {**peak, ("Hips", "h"): 0.40, ("Spine", "x"): 10, ("UpperArm.R", "x"): -135, ("LowerArm.R", "x"): -15,
                   ("Hand.R", "x"): -45, ("Foot.L", "ik_z"): 0.28, ("Foot.R", "ik_z"): 0.70}),
        (22 / 27, {("Hips", "h"): -0.15, ("Spine", "x"): 15, ("UpperArm.R", "x"): -40, ("LowerArm.R", "x"): -40,
                   ("UpperArm.L", "x"): -20, ("LowerArm.L", "x"): -20}),
        (1.0, {}),
    ], ('.L', '.R'), extras)

def pose_block(extras=None):
    top = {("Hips", "h"): 0.22, ("Foot.L", "ik_z"): 0.19, ("Foot.R", "ik_z"): 0.19, ("Foot.L", "pitch"): 35,
           ("Foot.R", "pitch"): 35, ("Head", "x"): -10,
           ("UpperArm.R", "x"): -172, ("UpperArm.R", "y"): -8, ("UpperArm.L", "x"): -172, ("UpperArm.L", "y"): 8,
           ("LowerArm.R", "x"): -3, ("LowerArm.L", "x"): -3, ("Hand.R", "x"): 10, ("Hand.L", "x"): 10,
           ("Shoulder.R", "y"): 15, ("Shoulder.L", "y"): -15}
    return sport_clip([
        (0.0, {}),
        (4 / 18, {("Hips", "h"): -0.13, ("Spine", "x"): 10, ("UpperArm.R", "x"): -30, ("UpperArm.L", "x"): -30,
                  ("LowerArm.R", "x"): -60, ("LowerArm.L", "x"): -60}),
        (9 / 18, top),
        (11 / 18, {**top, ("Hips", "h"): 0.17, ("Foot.L", "ik_z"): 0.14, ("Foot.R", "ik_z"): 0.14}),
        (14 / 18, {("Hips", "h"): -0.10, ("Spine", "x"): 5, ("UpperArm.R", "x"): -100, ("UpperArm.L", "x"): -100,
                   ("LowerArm.R", "x"): -20, ("LowerArm.L", "x"): -20}),
        (1.0, {}),
    ], ('.L', '.R'), extras)

def pose_steal(extras=None):
    return sport_clip([
        (0.0, {}),
        (3 / 14, {("Hips", "h"): -0.10, ("Spine", "x"): 18, ("Chest", "z"): -12, ("Head", "x"): -10,
                  ("UpperArm.R", "x"): 25, ("UpperArm.R", "y"): 10, ("LowerArm.R", "x"): -30,
                  ("UpperArm.L", "x"): -30, ("UpperArm.L", "y"): -15, ("LowerArm.L", "x"): -50}),
        (6 / 14, {("Hips", "h"): -0.14, ("Spine", "x"): 28, ("Chest", "z"): 16, ("Head", "x"): -18,
                  ("UpperArm.R", "x"): -55, ("UpperArm.R", "y"): -10, ("LowerArm.R", "x"): -15, ("Hand.R", "x"): -15,
                  ("UpperArm.L", "x"): -20, ("UpperArm.L", "y"): -8, ("LowerArm.L", "x"): -45}),
        (9 / 14, {("Hips", "h"): -0.12, ("Spine", "x"): 22, ("Chest", "z"): 22, ("Head", "x"): -14,
                  ("UpperArm.R", "x"): -40, ("UpperArm.R", "y"): -25, ("LowerArm.R", "x"): -25, ("Hand.R", "x"): -10,
                  ("UpperArm.L", "x"): -15, ("UpperArm.L", "y"): -6, ("LowerArm.L", "x"): -35}),
        (1.0, {}),
    ], ('.L', '.R'), extras)

DRIBBLE = dict(JOG, frames=15, y_td=-0.21, lift=0.15)

def _dribble_push(ph):
    u = (2 * (ph - 0.42)) % 1.0
    if u < 0.32:
        return min_jerk(u / 0.32)
    return 1.0 - min_jerk((u - 0.32) / 0.68)

def gait_dribble(extras=None):
    legs = gait_cycle(DRIBBLE, extras, 0.55, 2)

    def f(ph, P):
        legs((2 * ph) % 1.0, P)
        for bone in ('UpperArm.R', 'LowerArm.R', 'Hand.R'):
            P.rot.pop(bone, None)
        h = _dribble_push(ph)
        P.rx('Spine', 6); P.rx('Head', -4); P.rz('Chest', -4)
        P.rx('UpperArm.R', -40 + 12 * h); P.ry('UpperArm.R', -4)
        P.rx('LowerArm.R', -65 + 40 * h)
        P.rx('Hand.R', 25 - 50 * h)
        P.rx('UpperArm.L', -20); P.ry('UpperArm.L', -6); P.rx('LowerArm.L', -10)
    return f

def _ankle_on_ball(P, side, ball_y, pitch):
    bones = P.arm.data.bones
    ankle, ball = bones['Foot' + side].head_local, bones['Toe' + side].head_local
    by, bz = ankle.y - ball.y, ankle.z - ball.z
    p = math.radians(pitch)
    return (ankle.x, ball_y + by * math.cos(p) - bz * math.sin(p), ball.z + by * math.sin(p) + bz * math.cos(p))

def pose_run_set():
    def f(ph, P):
        a = 2 * math.pi * ph
        breath = S_(2 * a)
        P.move('Hips', 0, 0.02 + 0.008 * S_(a), -0.17 + 0.004 * breath)
        P.rx('Hips', 20); P.rx('Spine', 12 - 0.6 * breath); P.rx('Chest', 10 - 1.2 * breath)
        P.rx('Head', -28 + 0.8 * S_(2 * a - 0.6))
        front = P.arm.data.bones['Foot.L'].head_local
        leg_ik(P, '.L', (front.x + 0.01, -0.30, front.z))
        leg_ik(P, '.R', _ankle_on_ball(P, '.R', 0.42, 30), 30, 0)
        for side, sgn, arm_x, elbow in (('.L', 1, 30, -35), ('.R', -1, -35, -60)):
            P.move('Shoulder' + side, 0, 0, 0.004 * breath)
            P.rx('UpperArm' + side, arm_x + 1.0 * S_(a)); P.ry('UpperArm' + side, sgn * 10)
            P.rx('LowerArm' + side, elbow)
    return f

def pose_run_lean():
    run = gait_run()
    dip_at = key_poses([
        (0.0, {}),
        (0.12, {"w": -0.12}),
        (0.38, {"w": 1.0, "a": 1.0}),
        (0.50, {"w": 1.0, "a": 1.0}),
        (1.0, {}),
    ])
    frames = 24

    def f(ph, P):
        k = dip_at(ph)
        w, arms = k.get("w", 0.0), max(0.0, k.get("a", 0.0))
        P.rx('Hips', 6 * w); P.move('Hips', 0, -0.03 * w, -0.03 * w)
        run((ph * frames / SPRINT["frames"]) % 1.0, P)
        P.rx('Spine', 16 * w); P.rx('Chest', 18 * w); P.rx('Head', -14 * w)
        for side in ('.L', '.R'):
            for bone, target in (('UpperArm' + side, 35), ('LowerArm' + side, -20)):
                r = P.rot.setdefault(bone, [0.0, 0.0, 0.0])
                r[0] = r[0] * (1 - arms) + math.radians(target) * arms
    return f

def pose_breathless():
    def f(ph, P):
        a = 2 * math.pi * ph
        breath = S_(2 * a)
        P.move('Hips', 0, 0.10, -0.14)
        P.rx('Hips', 30); P.rx('Spine', 18 - 0.5 * breath); P.rx('Chest', 12 - 3.5 * breath)
        P.rx('Head', -40 + 2.5 * S_(2 * a - 0.8)); P.rz('Head', 3 * S_(a))
        for side, sgn, _ in SIDES:
            ankle = P.arm.data.bones['Foot' + side].head_local
            leg_ik(P, side, (ankle.x + sgn * 0.04, ankle.y - 0.01, ankle.z))
            P.move('Shoulder' + side, 0, 0, 0.004 * breath)
            P.rx('UpperArm' + side, BREATHLESS_ARM[0] + BREATHLESS_ARM[5] * breath); P.ry('UpperArm' + side, sgn * BREATHLESS_ARM[1])
            P.rx('LowerArm' + side, BREATHLESS_ARM[2] + BREATHLESS_ARM[6] * breath); P.ry('LowerArm' + side, sgn * BREATHLESS_ARM[3])
            P.rx('Hand' + side, BREATHLESS_ARM[4] + BREATHLESS_ARM[7] * breath)
    return f

BREATHLESS_ARM = (-34, 26, -22, 33, -45, 3.5, -2, 3)
TENNIS_READY = {("Hips", "dz"): -0.09, ("Spine", "x"): 14, ("Chest", "x"): 4, ("Head", "x"): -12,
                ("UpperArm.R", "x"): -30, ("UpperArm.R", "z"): 25, ("UpperArm.R", "y"): -15, ("LowerArm.R", "x"): -70,
                ("UpperArm.L", "x"): -30, ("UpperArm.L", "z"): -25, ("UpperArm.L", "y"): 15, ("LowerArm.L", "x"): -70,
                ("Foot.L", "ax"): 0.07, ("Foot.L", "ay"): -0.02, ("Foot.R", "ax"): -0.07, ("Foot.R", "ay"): -0.02}

TENNIS_GRIP = {("Hand.R", "x"): 10}


def _tennis_apply(P, pose):
    bones = P.arm.data.bones
    P.move("Hips", pose.get(("Hips", "dx"), 0.0), 0, pose.get(("Hips", "dz"), 0.0))
    for (bone, axis), value in pose.items():
        if axis in ("x", "y", "z"):
            getattr(P, "r" + axis)(bone, value)
    for side in (".L", ".R"):
        foot = "Foot" + side
        rest = bones[foot].head_local
        ankle = Vector((rest.x + pose.get((foot, "ax"), 0.0), rest.y + pose.get((foot, "ay"), 0.0),
                        rest.z + pose.get((foot, "az"), 0.0)))
        leg_ik(P, side, ankle)


def _tennis_keys(keys):
    return key_poses([(t, {**TENNIS_GRIP, **pose}) for t, pose in keys])


def _over(base, **changes):
    pose = dict(base)
    for name, value in changes.items():
        bone, axis = name.rsplit("_", 1)
        pose[(bone.replace("__", "."), axis)] = value
    return pose


def pose_tennis_ready():
    def f(ph, P):
        a = 2 * math.pi * ph
        pose = {**TENNIS_GRIP, **TENNIS_READY}
        pose[("Hips", "dz")] -= 0.012 * (1 - math.cos(2 * a)) / 2
        pose[("Hips", "dx")] = 0.012 * S_(a)
        pose[("Hips", "y")] = -2 * S_(a)
        pose[("Head", "z")] = 3 * S_(a)
        pose[("Hand.R", "x")] += 4 * S_(2 * a)
        pose[("LowerArm.R", "x")] += 3 * S_(2 * a - 0.5)
        pose[("LowerArm.L", "x")] += 3 * S_(2 * a - 0.5)
        _tennis_apply(P, pose)
    return f


def pose_tennis_forehand():
    back = _over(TENNIS_READY, Hips_z=-25, Chest_z=-20, Hips_dx=-0.04, UpperArm__R_x=20, UpperArm__R_y=30, UpperArm__R_z=-10,
                 LowerArm__R_x=-30, UpperArm__L_x=-60, UpperArm__L_z=-30, UpperArm__L_y=0, LowerArm__L_x=-20)
    contact = _over(TENNIS_READY, Hips_z=5, Chest_z=5, Hips_dx=0.0, UpperArm__R_x=-35, UpperArm__R_y=25, UpperArm__R_z=20,
                    LowerArm__R_x=-20, UpperArm__L_x=-20, UpperArm__L_z=-10, UpperArm__L_y=10, LowerArm__L_x=-40)
    finish = _over(TENNIS_READY, Hips_z=25, Chest_z=25, Hips_dx=0.03, UpperArm__R_x=-120, UpperArm__R_y=0, UpperArm__R_z=60,
                   LowerArm__R_x=-90, UpperArm__L_x=10, UpperArm__L_z=0, UpperArm__L_y=10, LowerArm__L_x=-60)
    pose_at = _tennis_keys([(0.0, TENNIS_READY), (0.33, back), (0.5, contact), (0.68, finish), (1.0, TENNIS_READY)])
    return lambda ph, P: _tennis_apply(P, pose_at(ph))


def pose_tennis_backhand():
    back = _over(TENNIS_READY, Hips_z=30, Chest_z=25, Hips_dx=0.03, UpperArm__R_x=-40, UpperArm__R_z=70, UpperArm__R_y=-20,
                 LowerArm__R_x=-40, UpperArm__L_x=-30, UpperArm__L_z=-20, UpperArm__L_y=15, LowerArm__L_x=-80)
    contact = _over(TENNIS_READY, Hips_z=5, Chest_z=0, Hips_dx=-0.03, UpperArm__R_x=-40, UpperArm__R_z=20, UpperArm__R_y=20,
                    LowerArm__R_x=-5, UpperArm__L_x=25, UpperArm__L_z=0, UpperArm__L_y=-30, LowerArm__L_x=-20)
    finish = _over(TENNIS_READY, Hips_z=-15, Chest_z=-15, Hips_dx=-0.02, UpperArm__R_x=-110, UpperArm__R_z=-10, UpperArm__R_y=50,
                   LowerArm__R_x=-10, UpperArm__L_x=30, UpperArm__L_z=0, UpperArm__L_y=-40, LowerArm__L_x=-15)
    pose_at = _tennis_keys([(0.0, TENNIS_READY), (0.33, back), (0.5, contact), (0.7, finish), (1.0, TENNIS_READY)])
    return lambda ph, P: _tennis_apply(P, pose_at(ph))


def pose_tennis_lob():
    drop = _over(TENNIS_READY, Hips_dz=-0.15, Spine_x=20, Hips_z=-20, Chest_z=-15, Hips_dx=-0.03, UpperArm__R_x=15,
                 UpperArm__R_y=25, UpperArm__R_z=0, LowerArm__R_x=-15, Hand__R_x=30, UpperArm__L_x=-45, UpperArm__L_z=-30,
                 UpperArm__L_y=0, LowerArm__L_x=-30)
    contact = _over(TENNIS_READY, Hips_dz=-0.11, Spine_x=12, Hips_z=0, UpperArm__R_x=-50, UpperArm__R_y=15, UpperArm__R_z=10,
                    LowerArm__R_x=-10, Hand__R_x=30, UpperArm__L_x=-30, UpperArm__L_z=-20, UpperArm__L_y=0, LowerArm__L_x=-40)
    finish = _over(TENNIS_READY, Hips_dz=-0.05, Spine_x=2, Chest_x=-8, Head_x=-20, Hips_z=5, Hips_dx=0.02, UpperArm__R_x=-150,
                   UpperArm__R_y=10, UpperArm__R_z=15, LowerArm__R_x=-15, Hand__R_x=20, UpperArm__L_x=-40, UpperArm__L_z=0,
                   UpperArm__L_y=-20, LowerArm__L_x=-20)
    pose_at = _tennis_keys([(0.0, TENNIS_READY), (0.3, drop), (0.5, contact), (0.72, finish), (1.0, TENNIS_READY)])
    return lambda ph, P: _tennis_apply(P, pose_at(ph))


def pose_tennis_serve():
    setup = {("Hips", "z"): -35, ("Chest", "z"): -10, ("UpperArm.L", "x"): -25, ("UpperArm.L", "z"): -15,
             ("LowerArm.L", "x"): -30, ("UpperArm.R", "x"): -20, ("UpperArm.R", "z"): 15, ("LowerArm.R", "x"): -30}
    toss = {("Hips", "z"): -40, ("Hips", "dz"): -0.10, ("Chest", "x"): -12, ("Head", "x"): -25,
            ("UpperArm.L", "x"): -160, ("LowerArm.L", "x"): -5,
            ("UpperArm.R", "x"): 30, ("UpperArm.R", "y"): 80, ("LowerArm.R", "x"): -100}
    drop = {**toss, ("Hips", "z"): -30, ("UpperArm.L", "x"): -130, ("UpperArm.R", "x"): 10, ("UpperArm.R", "y"): 85,
            ("LowerArm.R", "x"): -130}
    contact = {("Hips", "z"): 0, ("Chest", "x"): -5, ("Chest", "z"): 10, ("Head", "x"): -25,
               ("UpperArm.R", "x"): -170, ("UpperArm.R", "y"): 10, ("LowerArm.R", "x"): -5,
               ("UpperArm.L", "x"): -40, ("UpperArm.L", "z"): -20, ("LowerArm.L", "x"): -60}
    follow = {("Hips", "z"): 20, ("Hips", "dz"): -0.08, ("Spine", "x"): 25, ("Chest", "z"): 25,
              ("UpperArm.R", "x"): -30, ("UpperArm.R", "z"): 60, ("UpperArm.R", "y"): -10, ("LowerArm.R", "x"): -40,
              ("UpperArm.L", "x"): 10, ("LowerArm.L", "x"): -50,
              ("Foot.L", "ax"): 0.03, ("Foot.L", "ay"): -0.01, ("Foot.R", "ax"): -0.03, ("Foot.R", "ay"): -0.01}
    step = {**follow, ("Foot.L", "az"): 0.03, ("Foot.R", "az"): 0.03, ("Foot.L", "ax"): 0.05, ("Foot.R", "ax"): -0.05}
    pose_at = _tennis_keys([(0.0, {}), (0.12, setup), (0.32, toss), (0.41, drop), (0.55, contact), (0.72, follow),
                            (0.84, step), (1.0, TENNIS_READY)])
    return lambda ph, P: _tennis_apply(P, pose_at(ph))


def pose_tennis_celebrate():
    crouch = _over(TENNIS_READY, Hips_dz=-0.12, Spine_x=20, UpperArm__R_x=20, UpperArm__R_z=0, UpperArm__R_y=0, LowerArm__R_x=-40,
                   UpperArm__L_x=20, UpperArm__L_z=0, UpperArm__L_y=0, LowerArm__L_x=-40)
    pump = {("Hips", "dz"): -0.04, ("Chest", "x"): -10, ("Head", "x"): -15,
            ("UpperArm.R", "x"): -40, ("UpperArm.R", "y"): 20, ("LowerArm.R", "x"): -130,
            ("UpperArm.L", "x"): -20, ("LowerArm.L", "x"): -60,
            ("Foot.L", "ax"): 0.04, ("Foot.R", "ax"): -0.04}
    dip = {**pump, ("Hips", "dz"): -0.07, ("UpperArm.R", "x"): -20, ("LowerArm.R", "x"): -110}
    arms_up = {("Chest", "x"): -12, ("Head", "x"): -20, ("UpperArm.R", "x"): -150, ("UpperArm.R", "y"): 20,
               ("UpperArm.L", "x"): -150, ("UpperArm.L", "y"): -20, ("LowerArm.R", "x"): -10, ("LowerArm.L", "x"): -10,
               ("Foot.L", "ax"): 0.04, ("Foot.R", "ax"): -0.04}
    arms_held = {**arms_up, ("UpperArm.R", "y"): 30, ("UpperArm.L", "y"): -30, ("Head", "x"): -14}
    pose_at = _tennis_keys([(0.0, TENNIS_READY), (0.12, crouch), (0.26, pump), (0.36, dip), (0.46, pump), (0.62, arms_up),
                            (0.82, arms_held), (1.0, {})])
    return lambda ph, P: _tennis_apply(P, pose_at(ph))


def tennis_clips():
    return {
        "TennisReady": (36, pose_tennis_ready()),
        "TennisForehand": (18, pose_tennis_forehand()),
        "TennisBackhand": (18, pose_tennis_backhand()),
        "TennisLob": (21, pose_tennis_lob()),
        "TennisServe": (30, pose_tennis_serve()),
        "TennisCelebrate": (45, pose_tennis_celebrate()),
    }

DANCE_FRAMES = 60
DANCE_STEP = 0.18
DANCE_SWING = 0.15
DANCE_LIFT = 0.06
DANCE_STEPS = {'.R': ((0.25, 0.0, -DANCE_STEP), (1.0, -DANCE_STEP, 0.0)),
               '.L': ((0.5, 0.0, -DANCE_STEP), (0.75, -DANCE_STEP, 0.0))}

def _dance_foot(side, ph):
    for land, x0, x1 in DANCE_STEPS[side]:
        if land - DANCE_SWING <= ph <= land:
            u = (ph - land + DANCE_SWING) / DANCE_SWING
            return x0 + (x1 - x0) * min_jerk(u), DANCE_LIFT * S_(math.pi * u), S_(math.pi * u)
    x = DANCE_STEPS[side][0][2] if DANCE_STEPS[side][0][0] < ph < DANCE_STEPS[side][1][0] - DANCE_SWING else 0.0
    return x, 0.0, 0.0

def _dance_frame(ph, P):
    C = math.cos
    beat = C(2 * math.pi * 4 * ph)
    bar = C(2 * math.pi * 2 * ph)
    feet = {side: _dance_foot(side, ph) for side in ('.L', '.R')}
    hike = feet['.R'][2] - feet['.L'][2]
    P.move('Hips', (feet['.L'][0] + feet['.R'][0]) / 2, 0, -0.045 - 0.025 * beat)
    P.rx('Hips', 3); P.ry('Hips', 6 * hike)
    P.rx('Spine', 2 + 2 * beat); P.ry('Spine', -4 * hike)
    P.rx('Chest', 2); P.rz('Chest', 8 * bar)
    P.rx('Head', -2 + 3 * beat); P.rz('Head', -4 * bar)
    lift = 6 * (1 - C(2 * math.pi * ph))
    for side, sgn, _ in SIDES:
        P.rx('UpperArm' + side, -22 + sgn * 32 * bar)
        P.ry('UpperArm' + side, -sgn * (8 + lift))
        P.rx('LowerArm' + side, -(78 + 12 * beat))
        P.rx('Hand' + side, -6 + 4 * beat)
        rest = P.arm.data.bones['Foot' + side].head_local
        x, z, _ = feet[side]
        leg_ik(P, side, (rest.x + x, rest.y, rest.z + z))

def pose_dance(extras=None):
    def f(ph, P):
        _dance_frame(ph, P)
        if extras:
            extras(ph, P, 0.35, 4)
    return f

def pose_stumble(extras=None):
    trip = {("Hips", "mz"): -0.07, ("Hips", "mx"): 0.05, ("Hips", "y"): 6, ("Spine", "x"): 6, ("Chest", "x"): 10,
            ("Head", "x"): -10, ("UpperArm.L", "y"): -45, ("UpperArm.L", "x"): 10, ("LowerArm.L", "x"): 25,
            ("UpperArm.R", "y"): 38, ("UpperArm.R", "x"): 35, ("LowerArm.R", "x"): 45}
    catch = {("Hips", "mz"): -0.05, ("Hips", "mx"): -0.035, ("Hips", "y"): -5, ("Spine", "x"): -2, ("Chest", "x"): -7,
             ("Chest", "z"): 8, ("Head", "x"): 6, ("Head", "z"): -5, ("UpperArm.L", "y"): -25, ("UpperArm.L", "x"): 15,
             ("UpperArm.R", "y"): 65, ("UpperArm.R", "x"): 30, ("LowerArm.R", "x"): 50}
    settle = {("Hips", "mz"): -0.025, ("Hips", "mx"): 0.012, ("Hips", "y"): 2, ("Chest", "x"): 3, ("Chest", "z"): -3,
              ("UpperArm.L", "y"): -10, ("UpperArm.R", "y"): 15}
    pose_at = key_poses([(0.0, {}), (0.15, trip), (0.38, catch), (0.62, settle), (1.0, {})])

    def f(ph, P):
        for (bone, axis), value in pose_at(ph).items():
            if axis == "mx":
                P.move(bone, value, 0, 0)
            elif axis == "mz":
                P.move(bone, 0, 0, value)
            else:
                getattr(P, 'r' + axis)(bone, value)
        _dance_frame(0.0, P)
        if extras:
            extras(ph, P, 0.35, 4)
    return f

def make_clips(extras):
    return {
        "Idle": (120, gait_idle(None, extras)),
        "Walk": (JOG["frames"], gait_walk(extras)),
        "Run": (SPRINT["frames"], gait_run(extras)),
        "Sit": (120, pose_sit(extras)),
        "Eat": (30, pose_eat(extras)),
        "Drink": (30, pose_drink(extras)),
        "Kick": (14, pose_kick(extras)),
        "Shot": (21, pose_shot(extras)),
        "Tackle": (36, pose_tackle(extras)),
        "Celebrate": (36, pose_celebrate(extras)),
        "JumpShot": (24, pose_jump_shot(extras)),
        "Dunk": (27, pose_dunk(extras)),
        "Block": (18, pose_block(extras)),
        "Steal": (14, pose_steal(extras)),
        "Dribble": (30, gait_dribble(extras)),
        "Dance": (DANCE_FRAMES, pose_dance(extras)),
        "Stumble": (18, pose_stumble(extras)),
    }
