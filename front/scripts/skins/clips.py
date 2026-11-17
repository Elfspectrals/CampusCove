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

CLIMB_HIPS = (0.0, -0.22, -0.05)
CLIMB_WRIST = (0.14, -0.47, 1.87)
CLIMB_ANKLE = (0.15, -0.38, 0.12)
CLIMB_REACH = (0.32, -0.45, 2.25)


def _side_sign(side):
    return 1.0 if side == '.L' else -1.0


def _at(base, side, dx=0.0, dy=0.0, dz=0.0):
    return (_side_sign(side) * base[0] + dx, base[1] + dy, base[2] + dz)


def _climb_pose(P, hips, wrists, ankles, chest=-3.0, head=-18.0, head_turn=0.0, hand=0.0, foot=12.0):
    P.move('Hips', *hips)
    P.rx('Spine', -2); P.rx('Chest', chest)
    P.rx('Head', head); P.rz('Head', head_turn)
    for side, sgn, _ in SIDES:
        arm_ik(P, side, wrists[side], (sgn, 0.5, -0.6))
        P.rx('Hand' + side, hand)
        leg_ik(P, side, ankles[side], foot, foot)


def _hang_limbs(dz=0.0):
    return ({side: _at(CLIMB_WRIST, side, dz=dz) for side in ('.L', '.R')},
            {side: _at(CLIMB_ANKLE, side, dz=dz) for side in ('.L', '.R')})


def pose_climb_hang(extras=None):
    def f(ph, P):
        a = 2 * math.pi * ph
        wrists, ankles = _hang_limbs()
        hips = (CLIMB_HIPS[0] + 0.012 * S_(a), CLIMB_HIPS[1] - 0.006 * S_(a + 0.8), CLIMB_HIPS[2] + 0.008 * S_(a - 0.5))
        _climb_pose(P, hips, wrists, ankles, chest=-3 - 1.5 * S_(a - 0.5), head=-18 + 2 * S_(2 * a), head_turn=5 * S_(a + 1.0))
        if extras:
            extras(ph, P, 0.0, 1.0)
    return f

SKATE_KEYS = ("hx", "hy", "hz", "lean", "yaw", "roll", "spine", "chest", "chest_yaw", "head", "head_yaw")
SKATE_SIDE_KEYS = ("x", "y", "z", "yaw", "pitch", "edge", "ax", "out", "elb")


def _skate_q(**kw):
    q = {k: 0.0 for k in SKATE_KEYS}
    q.update({k + s: 0.0 for k in SKATE_SIDE_KEYS for s in ("L", "R")})
    q.update(kw)
    return q


def _skate_leg(P, side, target, yaw, pitch, edge):
    leg_ik(P, side, target)
    r2 = (Euler(P.rot.get('Hips', (0.0, 0.0, 0.0)), 'XYZ').to_matrix()
          @ Euler(P.rot['UpperLeg' + side], 'XYZ').to_matrix()
          @ Euler(P.rot['LowerLeg' + side], 'XYZ').to_matrix())
    P.rot['Foot' + side] = [0.0, 0.0, 0.0]
    foot = (Matrix.Rotation(math.radians(yaw), 3, 'Z') @ Matrix.Rotation(math.radians(edge), 3, 'Y')
            @ Matrix.Rotation(math.radians(pitch), 3, 'X'))
    _set_rot(P, 'Foot' + side, r2.transposed() @ foot)


def _skate_apply(P, q):
    hips = (Matrix.Rotation(math.radians(q["lean"]), 3, 'X') @ Matrix.Rotation(math.radians(q["yaw"]), 3, 'Z')
            @ Matrix.Rotation(math.radians(q["roll"]), 3, 'Y'))
    _set_rot(P, 'Hips', hips)
    P.move('Hips', q["hx"], q["hy"], q["hz"])
    P.rx('Spine', q["spine"])
    P.rx('Chest', q["chest"]); P.rz('Chest', q["chest_yaw"])
    P.rx('Head', q["head"]); P.rz('Head', q["head_yaw"])
    bones = P.arm.data.bones
    for side, sgn, _ in SIDES:
        s = side[1]
        rest = bones['Foot' + side].head_local
        target = Vector((q["x" + s], rest.y + q["y" + s], rest.z + q["z" + s]))
        _skate_leg(P, side, target, q["yaw" + s], q["pitch" + s], q["edge" + s])
        P.rx('UpperArm' + side, q["ax" + s]); P.ry('UpperArm' + side, -sgn * q["out" + s])
        P.rx('LowerArm' + side, q["elb" + s])


def _skate_glide_q(ph):
    a = 2 * math.pi * ph
    q = _skate_q(hx=0.02 * S_(a), hy=-0.03, hz=-0.13 + 0.008 * S_(2 * a), lean=18 + 1.0 * S_(a + 1.0),
                 roll=-1.5 * S_(a), spine=4, chest=3 + 1.0 * S_(a), head=-18 + 1.5 * S_(2 * a - 0.6),
                 head_yaw=4 * S_(a + 1.0))
    for s, sgn, dy in (("L", 1, -0.03), ("R", -1, 0.03)):
        q.update({"x" + s: sgn * 0.12, "y" + s: dy, "yaw" + s: sgn * 8,
                  "ax" + s: -8 + 2 * S_(a - 0.4), "out" + s: 22 + 3 * sgn * S_(a), "elb" + s: -20})
    return q


SKATE_GLIDE_START = _skate_glide_q(0.0)


def _skate_stroke_foot(u, sgn):
    if u < 0.34:
        e = min_jerk(u / 0.34)
        return sgn * (0.11 + 0.30 * e), 0.20 * e, 0.0, sgn * (10 + 25 * e), -sgn * 15 * e
    if u < 0.52:
        t = (u - 0.34) / 0.18
        r = min_jerk(t)
        return sgn * (0.41 - 0.30 * r), 0.20 - 0.24 * r, 0.09 * S_(math.pi * t), sgn * (35 - 25 * r), -sgn * 15 * (1 - r)
    g = min_jerk((u - 0.52) / 0.48)
    return sgn * 0.11, -0.04 + 0.04 * g, 0.0, sgn * 10, 0.0


def skate_push(extras=None):
    def f(ph, P):
        a = 2 * math.pi * ph
        q = _skate_q(hx=-0.06 * S_(a), hy=-0.04, hz=-0.17 + 0.02 * math.cos(2 * a), lean=22 + 2 * math.cos(2 * a),
                     roll=3 * S_(a), yaw=4 * S_(a), spine=8, chest=5, chest_yaw=-6 * S_(a), head=-28,
                     head_yaw=2 * S_(a))
        for s, sgn, off in (("L", 1, 0.0), ("R", -1, 0.5)):
            x, y, z, yaw, edge = _skate_stroke_foot((ph - off) % 1.0, sgn)
            q.update({"x" + s: x, "y" + s: y, "z" + s: z, "yaw" + s: yaw, "edge" + s: edge,
                      "ax" + s: -10 + 35 * sgn * S_(a), "out" + s: 14, "elb" + s: -(25 - 12 * sgn * S_(a))})
        _skate_apply(P, q)
        if extras:
            extras(ph, P, 0.6, 2)
    return f


def skate_glide(extras=None):
    def f(ph, P):
        _skate_apply(P, _skate_glide_q(ph))
        if extras:
            extras(ph, P, 0.2, 1)
    return f


def _skate_sides(**per_side):
    return {k + s: v[i] for k, v in per_side.items() for i, s in enumerate(("L", "R"))}


def _skate_key(**kw):
    return {**SKATE_GLIDE_START, **kw}


def skate_brake(extras=None):
    c, s = math.cos(math.radians(80)), math.sin(math.radians(80))
    stop = dict(yaw=80, hz=-0.30, hy=0.10, lean=-6, roll=0, hx=0, spine=6, chest=4, chest_yaw=-25, head=-6, head_yaw=-35,
                **_skate_sides(x=(0.17 * c, -0.17 * c), y=(0.17 * s - 0.15, -0.17 * s - 0.15), z=(0, 0), yaw=(80, 80),
                               edge=(15, 15), ax=(10, -40), out=(50, 35), elb=(-20, -25)))
    pose_at = key_poses([
        (0.0, SKATE_GLIDE_START),
        (0.2, _skate_key(hz=-0.09, yaw=-8, **_skate_sides(out=(30, 30), ax=(-15, -15)))),
        (0.6, _skate_key(**stop)),
        (0.8, _skate_key(**{**stop, "hz": -0.32, "lean": -8})),
        (1.0, _skate_key(**stop)),
    ])

    def f(ph, P):
        q = pose_at(ph)
        if ph > 0.6:
            u = (ph - 0.6) / 0.4
            q["hz"] += 0.006 * S_(2 * math.pi * 6 * u) * (1 - u)
        _skate_apply(P, q)
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

def _dance_frame(ph, P, feet_extra=None):
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
        dx, dy, dz, pitch = (feet_extra or {}).get(side, (0.0, 0.0, 0.0, 0.0))
        leg_ik(P, side, (rest.x + x + dx, rest.y + dy, rest.z + z + dz), pitch)

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

def pose_climb_reach(side, extras=None):
    pose_at = key_poses([
        (0.0, {}),
        (0.14, {"lift": -0.04, "head": 2}),
        (0.55, {"lift": 0.15, "reach": 1.0, "head": -10}),
        (0.70, {"lift": 0.15, "reach": 1.0, "head": -10}),
        (1.0, {}),
    ])

    def f(ph, P):
        k = pose_at(ph)
        lift, reach = k.get("lift", 0.0), k.get("reach", 0.0)
        wrists, ankles = _hang_limbs()
        start, goal = Vector(wrists[side]), Vector(_at(CLIMB_REACH, side))
        hand = start.lerp(goal, reach) + Vector((0, 0.14 * S_(math.pi * reach), 0))
        wrists[side] = tuple(hand)
        hips = (CLIMB_HIPS[0] - _side_sign(side) * 0.04 * reach, CLIMB_HIPS[1], CLIMB_HIPS[2] + lift)
        _climb_pose(P, hips, wrists, ankles, head=-18 + k.get("head", 0.0), head_turn=-_side_sign(side) * 10 * reach)
        if extras:
            extras(ph, P, 0.0, 1.0)
    return f


def pose_climb_top(extras=None):
    pose_at = key_poses([
        (0.0, {}),
        (0.08, {"lift": -0.04}),
        (0.30, {"lift": 0.15, "reach": 1.0, "head": -10}),
        (0.40, {"lift": 0.15, "reach": 1.0, "head": -10}),
        (0.50, {"lift": 0.12, "reach": 1.0, "pump_up": 1.0, "head": -4}),
        (0.64, {"lift": 0.10, "reach": 1.0, "pump_down": 1.0, "head": 6}),
        (0.76, {"lift": 0.10, "reach": 1.0, "pump_down": 1.0, "head": 4}),
        (1.0, {}),
    ])
    pump_up = Vector((0.36, -0.30, 2.02))
    pump_down = Vector((0.30, -0.16, 1.52))

    def f(ph, P):
        k = pose_at(ph)
        lift, reach = k.get("lift", 0.0), k.get("reach", 0.0)
        up, down = k.get("pump_up", 0.0), k.get("pump_down", 0.0)
        wrists, ankles = _hang_limbs()
        hold_r = Vector(wrists['.R'])
        wrists['.R'] = tuple(hold_r.lerp(Vector(_at(CLIMB_REACH, '.R')), reach) + Vector((0, 0.14 * S_(math.pi * reach), 0)))
        hold_l = Vector(wrists['.L'])
        wrists['.L'] = tuple(hold_l + (pump_up - hold_l) * up + (pump_down - hold_l) * down)
        hips = (CLIMB_HIPS[0] + 0.04 * reach, CLIMB_HIPS[1] + 0.03 * down, CLIMB_HIPS[2] + lift)
        _climb_pose(P, hips, wrists, ankles, chest=-3 + 4 * down, head=-18 + k.get("head", 0.0), head_turn=8 * reach)
        P.rx('Hand.L', -25 * (up + down))
        if extras:
            extras(ph, P, 0.0, 1.0)
    return f


def _fade_to_rest(P, w):
    for r in P.rot.values():
        r[:] = [v * (1 - w) for v in r]
    for v in P.loc.values():
        v *= 1 - w


def pose_climb_fall(extras=None):
    drop, land = 0.45, 0.40
    settle = key_poses([
        (0.0, {"z": 0.0, "lean": 0.0}),
        (0.18, {"z": -0.30, "lean": 22}),
        (0.30, {"z": -0.27, "lean": 18}),
        (1.0, {}),
    ])

    def airborne(P, u):
        bones = P.arm.data.bones
        wrists, ankles = _hang_limbs(drop)
        fallen = drop * u * u
        release = min_jerk(min(1.0, u / 0.35))
        hips = (CLIMB_HIPS[0], CLIMB_HIPS[1] * (1 - u), CLIMB_HIPS[2] * (1 - u) + drop - fallen)
        for side, sgn, _ in SIDES:
            ground = Vector(bones['Foot' + side].head_local)
            held = Vector(wrists[side]) - Vector((0, 0, fallen))
            wrists[side] = tuple(held + release * Vector((sgn * 0.30, 0.10 + 0.12 * u, -0.05 - 0.15 * u)))
            ankles[side] = tuple(Vector(ankles[side]).lerp(ground + Vector((0, 0, drop * (1 - u) ** 2)), min_jerk(u)))
        _climb_pose(P, hips, wrists, ankles, chest=-3 + 10 * u, head=-18 + 22 * u, foot=12 * (1 - u))

    def landed(P, u):
        bones = P.arm.data.bones
        k = settle(u)
        arms = 1 - min_jerk(u)
        P.move('Hips', 0, 0, k.get("z", 0.0))
        P.rx('Spine', 0.4 * k.get("lean", 0.0)); P.rx('Chest', 0.6 * k.get("lean", 0.0))
        P.rx('Head', 4 * arms - 0.5 * k.get("lean", 0.0))
        for side, sgn, _ in SIDES:
            P.rx('UpperArm' + side, -45 * arms); P.ry('UpperArm' + side, sgn * -20 * arms)
            P.rx('LowerArm' + side, -35 * arms)
            leg_ik(P, side, bones['Foot' + side].head_local)
        _fade_to_rest(P, min_jerk(max(0.0, (u - 0.75) / 0.25)))

    def f(ph, P):
        if ph < land:
            airborne(P, ph / land)
        else:
            u = (ph - land) / (1 - land)
            touchdown = Pose(P.arm)
            airborne(touchdown, 1.0)
            landed(P, u)
            w = 1 - min_jerk(min(1.0, u / 0.2))
            if w > 0:
                _blend_from(P, touchdown, w)
                for side, _, _ in SIDES:
                    for bone in ('UpperLeg', 'LowerLeg', 'Foot', 'Toe'):
                        P.rot.pop(bone + side, None)
                    leg_ik(P, side, P.arm.data.bones['Foot' + side].head_local)
        if extras:
            extras(ph, P, 0.0, 1.0)
    return f


def _blend_from(P, other, w):
    for b in P.rot.keys() | other.rot.keys():
        mine, theirs = P.rot.get(b, [0.0, 0.0, 0.0]), other.rot.get(b, [0.0, 0.0, 0.0])
        P.rot[b] = [m + (t - m) * w for m, t in zip(mine, theirs)]
    for b in P.loc.keys() | other.loc.keys():
        mine, theirs = P.loc.get(b, Vector((0, 0, 0))), other.loc.get(b, Vector((0, 0, 0)))
        P.loc[b] = mine.lerp(theirs, w)


def pose_climb_lower(extras=None):
    def f(ph, P):
        a = 2 * math.pi * ph
        bounce = Vector((0, 0.012 * S_(a), 0.02 * S_(a)))
        hips = Vector((0.0, 0.12, -0.40)) + bounce
        P.move('Hips', *hips)
        P.rx('Hips', -12 - 2 * S_(a))
        P.rx('Spine', 4); P.rx('Chest', 2 + 1.5 * S_(a - 0.6))
        P.rx('Head', -6 + 2 * S_(a - 1.2))
        for side, sgn, _ in SIDES:
            wrist = Vector((-sgn * 0.02, -0.17, 1.08 if side == '.R' else 0.95)) + bounce
            arm_ik(P, side, wrist, (sgn, 0.4, -1.0))
            leg_ik(P, side, (sgn * 0.17, -0.46, 0.58), -75, -75)
        if extras:
            extras(ph, P, 0.0, 1.0)
    return f


def skate_fall(extras=None):
    seated = dict(hz=-0.83, hy=0.0, lean=-25, roll=0, hx=0, spine=-5, chest=-5, head=8, head_yaw=0,
                  **_skate_sides(x=(0.16, -0.16), y=(-0.62, -0.58), z=(0.03, 0.03), pitch=(-15, -15), yaw=(10, -10),
                                 ax=(45, 45), out=(25, 25), elb=(-5, -5)))
    pose_at = key_poses([
        (0.0, SKATE_GLIDE_START),
        (0.06, _skate_key(hz=-0.10, lean=8, chest=0, **_skate_sides(y=(-0.10, 0.03), ax=(-25, -20), out=(35, 35)))),
        (0.16, _skate_key(hz=-0.35, hy=0.05, lean=-20, chest=-10, head=-5,
                          **_skate_sides(y=(-0.30, -0.26), z=(0.05, 0.05), pitch=(-10, -10), ax=(-90, -80), out=(60, 60),
                                         elb=(-30, -30)))),
        (0.27, _skate_key(**seated)),
        (0.31, _skate_key(**{**seated, "hz": -0.80, "lean": -22})),
        (0.38, _skate_key(**seated)),
        (0.50, _skate_key(hz=-0.795, lean=10, spine=4, chest=4, head=0,
                          **_skate_sides(x=(0.16, -0.16), y=(-0.30, -0.30), ax=(-30, -30), out=(20, 20), elb=(-40, -40)))),
        (0.62, _skate_key(hz=-0.55, hy=-0.12, lean=35, spine=6, chest=4, head=-20,
                          **_skate_sides(x=(0.15, -0.15), y=(-0.12, -0.12), ax=(-50, -50), out=(25, 25), elb=(-30, -30)))),
        (0.80, _skate_key(hz=-0.25, hy=-0.05, lean=26, head=-22,
                          **_skate_sides(y=(-0.02, -0.02), ax=(-25, -25), out=(40, 40), elb=(-25, -25)))),
        (0.90, _skate_key(hz=-0.12, lean=20, **_skate_sides(out=(30, 30)))),
        (1.0, SKATE_GLIDE_START),
    ])

    def f(ph, P):
        _skate_apply(P, pose_at(ph))
        if extras:
            extras(ph, P, 0.0, 1.0)
    return f


def skate_stumble(extras=None):
    pose_at = key_poses([
        (0.0, SKATE_GLIDE_START),
        (0.2, _skate_key(hz=-0.16, lean=6, chest=-6, head=-4, roll=4,
                         **_skate_sides(x=(0.17, -0.12), y=(-0.14, 0.03), yaw=(20, -8), ax=(-30, -30), out=(55, 55),
                                        elb=(-30, -30)))),
        (0.45, _skate_key(hz=-0.15, lean=27, chest=8, head=-26, **_skate_sides(ax=(-10, -10), out=(40, 40)))),
        (1.0, SKATE_GLIDE_START),
    ])

    def f(ph, P):
        _skate_apply(P, pose_at(ph))
        if extras:
            extras(ph, P, 0.0, 1.0)
    return f


def skate_clips(extras):
    return {
        "SkatePush": (39, skate_push(extras)),
        "SkateGlide": (60, skate_glide(extras)),
        "SkateBrake": (15, skate_brake(extras)),
        "SkateFall": (45, skate_fall(extras)),
        "SkateStumble": (12, skate_stumble(extras)),
    }


PALM_DOWN = 90
ARM_TUCK = -25
CROUCH_HIPS = (-0.46, 0.12, 18)
CROUCH_ARM = (-38, 55, -60)

def _apply_body(P, pose):
    P.move("Hips", 0, pose.get(("Hips", "my"), 0.0), pose.get(("Hips", "mz"), 0.0))
    for (bone, axis), value in pose.items():
        if axis in ("x", "y", "z"):
            getattr(P, "r" + axis)(bone, value)
    bones = P.arm.data.bones
    for side in (".L", ".R"):
        ankle, ball = bones["Foot" + side].head_local, bones["Toe" + side].head_local
        pitch = pose.get(("Foot" + side, "pitch"), 0.0)
        p = math.radians(pitch)
        by, bz = ankle.y - ball.y, ankle.z - ball.z
        heel = Vector((ankle.x, ball.y + by * math.cos(p) - bz * math.sin(p), ball.z + by * math.sin(p) + bz * math.cos(p)))
        step = Vector((0, pose.get(("Foot" + side, "sy"), 0.0), pose.get(("Foot" + side, "sz"), 0.0)))
        leg_ik(P, side, heel + step, pitch)

def pose_petanque_point(extras=None):
    crouch = {("Hips", "mz"): -0.14, ("Hips", "my"): 0.04, ("Spine", "x"): 12, ("Chest", "x"): 8, ("Head", "x"): -14,
              ("UpperArm.L", "x"): -22, ("UpperArm.L", "y"): 10, ("LowerArm.L", "x"): -35}
    back = {**crouch, ("UpperArm.R", "x"): 40, ("UpperArm.R", "y"): ARM_TUCK, ("LowerArm.R", "x"): -12, ("LowerArm.R", "z"): PALM_DOWN}
    release = {**crouch, ("UpperArm.R", "x"): -55, ("UpperArm.R", "y"): ARM_TUCK, ("LowerArm.R", "x"): -8, ("LowerArm.R", "z"): PALM_DOWN, ("Hand.R", "x"): -12}
    follow = {**release, ("UpperArm.R", "x"): -78, ("LowerArm.R", "x"): -4, ("Hand.R", "x"): 6, ("Head", "x"): -16}
    pose_at = key_poses([
        (0.0, {}),
        (0.07, {("Hips", "mz"): -0.03, ("UpperArm.R", "x"): -15, ("LowerArm.R", "x"): -20, ("LowerArm.R", "z"): PALM_DOWN}),
        (0.30, back),
        (0.48, release),
        (0.60, follow),
        (0.76, follow),
        (1.0, {}),
    ])

    def f(ph, P):
        _apply_body(P, pose_at(ph))
        if extras:
            extras(ph, P, 0.0, 1.0)
    return f

def pose_petanque_shoot(extras=None):
    aim = {("Hips", "mz"): -0.03, ("UpperArm.R", "x"): -25, ("LowerArm.R", "x"): -25, ("LowerArm.R", "z"): PALM_DOWN, ("Head", "x"): -3}
    back = {("Hips", "mz"): -0.06, ("Hips", "my"): 0.03, ("Spine", "x"): 8, ("Chest", "x"): 6, ("Head", "x"): -10,
            ("UpperArm.R", "x"): 75, ("UpperArm.R", "y"): ARM_TUCK, ("LowerArm.R", "x"): -6, ("LowerArm.R", "z"): PALM_DOWN, ("UpperArm.L", "x"): -28, ("LowerArm.L", "x"): -25,
            ("Foot.L", "sy"): -0.12, ("Foot.L", "sz"): 0.07}
    planted = {("Hips", "mz"): -0.06, ("Hips", "my"): -0.12, ("Spine", "x"): 6, ("Chest", "x"): 4, ("Head", "x"): -8,
               ("Foot.L", "sy"): -0.30, ("Foot.R", "pitch"): 18}
    release = {**planted, ("UpperArm.R", "x"): -95, ("UpperArm.R", "y"): ARM_TUCK, ("LowerArm.R", "z"): PALM_DOWN, ("LowerArm.R", "x"): -6, ("Hand.R", "x"): -10,
               ("UpperArm.L", "x"): 10, ("LowerArm.L", "x"): -20}
    follow = {**planted, ("UpperArm.R", "x"): -135, ("UpperArm.R", "y"): ARM_TUCK, ("LowerArm.R", "z"): PALM_DOWN, ("LowerArm.R", "x"): -10, ("Hand.R", "x"): 8, ("Head", "x"): -12,
              ("UpperArm.L", "x"): 18, ("LowerArm.L", "x"): -18}
    pose_at = key_poses([
        (0.0, {}),
        (0.07, aim),
        (0.30, back),
        (0.42, {**back, **planted, ("UpperArm.R", "x"): 40}),
        (0.50, release),
        (0.62, follow),
        (0.72, follow),
        (0.84, {("Hips", "mz"): -0.03, ("Hips", "my"): -0.04, ("Foot.L", "sy"): -0.14, ("Foot.L", "sz"): 0.06,
                ("UpperArm.R", "x"): -20, ("LowerArm.R", "x"): -15}),
        (1.0, {}),
    ])

    def f(ph, P):
        _apply_body(P, pose_at(ph))
        if extras:
            extras(ph, P, 0.0, 1.0)
    return f

def pose_petanque_crouch(extras=None):
    squat = {("Hips", "mz"): CROUCH_HIPS[0], ("Hips", "my"): CROUCH_HIPS[1], ("Hips", "x"): CROUCH_HIPS[2],
             ("Spine", "x"): 28, ("Chest", "x"): 18, ("Head", "x"): -48}
    for side, sgn in ((".L", 1), (".R", -1)):
        squat.update({("UpperArm" + side, "x"): CROUCH_ARM[0], ("UpperArm" + side, "y"): sgn * CROUCH_ARM[1],
                      ("LowerArm" + side, "x"): CROUCH_ARM[2], ("Hand" + side, "x"): 20})

    def f(ph, P):
        a = 2 * math.pi * ph
        _apply_body(P, {**squat, ("Hips", "mz"): CROUCH_HIPS[0] + 0.006 * S_(a)})
        P.rx("Chest", -1.5 * S_(a)); P.rx("Spine", -0.8 * S_(a))
        P.rz("Head", 7 * S_(a + 0.6) + 2 * S_(3 * a)); P.rx("Head", 2 * S_(2 * a - 0.4))
        if extras:
            extras(ph, P, 0.0, 1.0)
    return f

def pose_petanque_celebrate(extras=None):
    up = {("UpperArm.R", "x"): -70, ("UpperArm.R", "y"): 15, ("LowerArm.R", "x"): -95, ("Head", "x"): -8, ("Chest", "x"): -3}
    pump = {("UpperArm.R", "x"): -10, ("UpperArm.R", "y"): 8, ("LowerArm.R", "x"): -125, ("Chest", "x"): 7, ("Spine", "x"): 4,
            ("Head", "x"): 6, ("Hips", "mz"): -0.04, ("UpperArm.L", "x"): -8, ("LowerArm.L", "x"): -20}
    pose_at = key_poses([
        (0.0, {}),
        (0.08, {("Chest", "x"): 3, ("UpperArm.R", "x"): 8, ("Hips", "mz"): -0.01}),
        (0.26, up),
        (0.38, pump),
        (0.50, {**up, ("UpperArm.R", "x"): -55, ("LowerArm.R", "x"): -100}),
        (0.62, pump),
        (0.76, pump),
        (1.0, {}),
    ])

    def f(ph, P):
        _apply_body(P, pose_at(ph))
        if extras:
            extras(ph, P, 0.0, 1.0)
    return f


def _rot(axis, deg):
    return Matrix.Rotation(math.radians(deg), 3, axis)

def _turn_hips(P, rot, pivot):
    _set_rot(P, "Hips", rot)
    p = Vector(pivot)
    P.move("Hips", *(p - rot @ p))

SWIM_PITCH = 78
SWIM_LIFT = 0.05
TREAD_DROP = -0.33

SWIM_ROLL = 40
SWIM_PATH = (
    (0.00, (0.20, -0.10, 2.04), (0.3, 1.0, 0.0)),
    (0.12, (0.19, -0.16, 2.06), (0.4, 1.0, 0.0)),
    (0.24, (0.20, -0.32, 1.90), (0.8, 1.0, 0.0)),
    (0.40, (0.05, -0.40, 1.48), (1.0, 0.6, 0.0)),
    (0.55, (0.13, -0.24, 1.08), (0.6, 1.0, 0.0)),
    (0.64, (0.20, -0.08, 0.98), (0.4, 1.0, 0.0)),
    (0.74, (0.30, 0.10, 1.18), (0.4, 1.0, 0.0)),
    (0.84, (0.36, 0.12, 1.56), (0.4, 1.0, 0.3)),
    (0.93, (0.24, 0.04, 1.90), (0.3, 1.0, 0.2)),
)

def _loop_spline(keys, s):
    n = len(keys)
    i = max(k for k in range(n) if keys[k][0] <= s)
    t0, t1 = keys[i][0], keys[(i + 1) % n][0] + (1.0 if i + 1 == n else 0.0)
    u = (s - t0) / (t1 - t0)
    pts = [keys[(i + d) % n] for d in (-1, 0, 1, 2)]
    out = []
    for c in (1, 2):
        p0, p1, p2, p3 = (Vector(k[c]) for k in pts)
        out.append(0.5 * (2 * p1 + (p2 - p0) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (3 * p1 - p0 - 3 * p2 + p3) * u ** 3))
    return out

def _arm_ik(P, side, shoulder, wrist, pole, parent):
    bones = P.arm.data.bones
    ua, la = bones["UpperArm" + side], bones["LowerArm" + side]
    a, b = ua.length, la.length
    d = wrist - shoulder
    reach = min(d.length, (a + b) * 0.999)
    d.normalize()
    side_dir = (pole - pole.dot(d) * d).normalized()
    x = (a * a - b * b + reach * reach) / (2 * reach)
    elbow = shoulder + d * x + side_dir * math.sqrt(max(a * a - x * x, 0.0))
    hinge = d.cross(side_dir).normalized()
    upper = _aim(ua.tail_local - ua.head_local, elbow - shoulder, hinge)
    lower = _aim(la.tail_local - la.head_local, shoulder + d * reach - elbow, hinge)
    _set_rot(P, "UpperArm" + side, parent.inverted() @ upper)
    _set_rot(P, "LowerArm" + side, upper.inverted() @ lower)

def pose_swim():
    def f(ph, P):
        a = 2 * math.pi * ph
        roll = -SWIM_ROLL * math.cos(a - 2 * math.pi * 0.36)
        _turn_hips(P, _rot("X", SWIM_PITCH) @ _rot("Z", 0.4 * roll), (0, 0, 0))
        P.move("Hips", 0, 0, SWIM_LIFT + 0.01 * S_(2 * a))
        P.rz("Spine", 0.3 * roll); P.rz("Chest", 0.3 * roll)
        P.rx("Neck", -10); P.rx("Head", -14); P.rz("Head", -0.8 * roll)
        chest = _rot("Z", roll)
        bones = P.arm.data.bones
        for side, sgn, off in SIDES:
            s = (ph - off) % 1.0
            wrist, pole = _loop_spline(SWIM_PATH, s)
            mirror = Vector((sgn, 1, 1))
            shoulder = chest @ bones["UpperArm" + side].head_local
            _arm_ik(P, side, shoulder, wrist * mirror, pole * mirror, chest)
            P.rx("Hand" + side, -25 * S_(math.pi * min(1.0, s / 0.64)) ** 2)
            k = 3 * a + math.pi * (off * 2)
            P.rx("UpperLeg" + side, -3 + 8 * S_(k)); P.ry("UpperLeg" + side, sgn * 3)
            P.rx("LowerLeg" + side, 14 + 12 * S_(k - 0.4))
            P.rx("Foot" + side, 55 + 8 * S_(k - 1.6))
    return f

def pose_tread():
    def f(ph, P):
        a = 2 * math.pi * ph
        P.move("Hips", 0, 0, TREAD_DROP + 0.02 * S_(2 * a))
        P.rx("Spine", 4); P.rx("Chest", 2 + 1.5 * S_(2 * a - 0.5)); P.rx("Head", -6 + 1.5 * S_(2 * a - 1.0))
        for side, sgn, off in SIDES:
            scull = S_(2 * a)
            P.rx("UpperArm" + side, -48); P.ry("UpperArm" + side, -sgn * 6); P.rz("UpperArm" + side, sgn * (22 + 18 * scull))
            P.rx("LowerArm" + side, -62); P.rz("LowerArm" + side, sgn * (6 - 10 * scull))
            P.rx("Hand" + side, 12 * math.cos(2 * a))
            k = 2 * a + 2 * math.pi * off
            P.rx("UpperLeg" + side, -78 + 8 * S_(k)); P.rz("UpperLeg" + side, sgn * 34)
            P.rx("LowerLeg" + side, 92 + 16 * S_(k + 1.0)); P.rz("LowerLeg" + side, sgn * (-12 + 30 * math.cos(k)))
            P.rx("Foot" + side, -10 + 10 * S_(k + 1.6))
    return f

def _tuck():
    pose = {("Spine", "x"): 20, ("Chest", "x"): 14, ("Neck", "x"): 8, ("Head", "x"): 10}
    for side, sgn, _ in SIDES:
        pose.update({("UpperLeg" + side, "x"): -128, ("LowerLeg" + side, "x"): 148, ("Foot" + side, "x"): 35,
                     ("UpperArm" + side, "x"): -8, ("UpperArm" + side, "y"): sgn * 22, ("LowerArm" + side, "x"): -34,
                     ("LowerArm" + side, "z"): -sgn * 42})
    return pose

TUCK_PIVOT = (0, -0.14, 0.10)

def pose_dive():
    crouch = {("Hips", "pitch"): 42, ("Hips", "y"): 0.06, ("Hips", "z"): -0.30, ("Spine", "x"): 14, ("Chest", "x"): 10,
              ("Head", "x"): 12}
    for side, sgn, _ in SIDES:
        crouch.update({("UpperArm" + side, "x"): -72, ("LowerArm" + side, "x"): -12})
    stretch = {("Hips", "pitch"): 72, ("Hips", "y"): -0.24, ("Hips", "z"): -0.02, ("Spine", "x"): 2, ("Head", "x"): 6}
    for side, sgn, _ in SIDES:
        stretch.update({("UpperArm" + side, "x"): -172, ("UpperArm" + side, "y"): -sgn * 26})
    glide = {("Hips", "pitch"): 115, ("Hips", "y"): -0.20, ("Head", "x"): 8}
    for side, sgn, _ in SIDES:
        glide.update({("UpperArm" + side, "x"): -176, ("UpperArm" + side, "y"): -sgn * 30, ("Foot" + side, "x"): 40})
    pose_at = key_poses([
        (0.0, {}),
        (0.30, crouch),
        (0.40, crouch),
        (0.58, stretch),
        (1.0, glide),
    ])
    push_at = key_poses([(0.0, {"p": 0.0}), (0.40, {"p": 0.0}), (0.58, {"p": 40.0}), (1.0, {"p": 40.0})])
    free_at = key_poses([(0.0, {"u": 0.0}), (0.56, {"u": 0.0}), (0.74, {"u": 1.0}), (1.0, {"u": 1.0})])

    def f(ph, P):
        pose = pose_at(ph)
        rot = _rot("X", pose.pop(("Hips", "pitch"), 0.0))
        _turn_hips(P, rot, (0, 0, 0))
        P.move("Hips", 0, pose.pop(("Hips", "y"), 0.0), pose.pop(("Hips", "z"), 0.0))
        _apply_rotations(P, {k: v for k, v in pose.items() if not k[0].startswith(("Foot", "UpperLeg", "LowerLeg"))})
        bones = P.arm.data.bones
        hips = bones["Hips"].head_local
        hip_pos = hips + P.loc["Hips"]
        pitch, u = push_at(ph)["p"], free_at(ph)["u"]
        p = math.radians(pitch)
        for side, sgn, _ in SIDES:
            ankle, ball = bones["Foot" + side].head_local, bones["Toe" + side].head_local
            by, bz = ankle.y - ball.y, ankle.z - ball.z
            planted = Vector((ankle.x, ball.y + by * math.cos(p) - bz * math.sin(p), ball.z + by * math.sin(p) + bz * math.cos(p)))
            straight = hip_pos + rot @ (ankle - hips) * 0.995
            leg_ik(P, side, planted.lerp(straight, u), pitch * (1 - u), 0.0)
            P.rx("Foot" + side, pose.get(("Foot" + side, "x"), 0.0) * u)
    return f

def _tuck_spin(pose, P, rot):
    _turn_hips(P, rot, TUCK_PIVOT)
    _apply_rotations(P, pose)

def pose_somersault():
    pose_at = key_poses([(0.0, {}), (0.06, {("UpperArm.L", "x"): -20, ("UpperArm.R", "x"): -20, ("Spine", "x"): -4}),
                         (0.20, _tuck()), (0.74, _tuck()), (0.94, {}), (1.0, {})])

    def f(ph, P):
        spin = 360 * min_jerk(min(1.0, max(0.0, (ph - 0.08) / 0.72)))
        _tuck_spin(pose_at(ph), P, _rot("X", spin))
    return f

def pose_twist():
    hug = {}
    for side, sgn, _ in SIDES:
        hug.update({("UpperArm" + side, "x"): -20, ("UpperArm" + side, "y"): sgn * 30, ("LowerArm" + side, "x"): -100,
                    ("LowerArm" + side, "z"): -sgn * 75, ("Foot" + side, "x"): 30, ("UpperLeg" + side, "y"): sgn * 3})
    pose_at = key_poses([(0.0, {}), (0.14, hug), (0.84, hug), (1.0, {})])

    def f(ph, P):
        spin = 360 * min_jerk(min(1.0, max(0.0, (ph - 0.06) / 0.80)))
        _turn_hips(P, _rot("Z", spin), (0, 0, 0.0))
        _apply_rotations(P, pose_at(ph))
    return f

def pose_cannonball():
    ball = {**_tuck(), ("Spine", "x"): 10, ("Chest", "x"): 8}
    pose_at = key_poses([(0.0, {}), (0.06, {("UpperArm.L", "x"): -24, ("UpperArm.R", "x"): -24}), (0.26, ball), (1.0, ball)])

    def f(ph, P):
        squeeze = 3 * S_(math.pi * min(1.0, max(0.0, (ph - 0.26) / 0.74)))
        pose = pose_at(ph)
        for side, _, _ in SIDES:
            pose[("LowerLeg" + side, "x")] = pose.get(("LowerLeg" + side, "x"), 0.0) + squeeze
        _tuck_spin(pose, P, _rot("X", -8 * min_jerk(min(1.0, ph / 0.26))))
    return f


def _clamp01(u):
    return max(0.0, min(1.0, u))

def _plant(P, side, dx=0.0, dy=0.0, dz=0.0, pitch=0.0, yaw=None):
    rest = P.arm.data.bones['Foot' + side].head_local
    leg_ik(P, side, (rest.x + dx, rest.y + dy, rest.z + dz), pitch, yaw=yaw)

def _on_ball(P, side, pitch):
    bones = P.arm.data.bones
    ankle, ball = bones['Foot' + side].head_local, bones['Toe' + side].head_local
    by, bz = ankle.y - ball.y, ankle.z - ball.z
    p = math.radians(pitch)
    return -by + by * math.cos(p) - bz * math.sin(p), by * math.sin(p) + bz * math.cos(p) - bz

def _beat_hits(hits, ph, lead):
    b = 4 * ph + lead
    k = int(math.floor(b))
    w = min_jerk(_clamp01((b - k) / lead))
    prev, cur = hits[(k - 1) % len(hits)], hits[k % len(hits)]
    return {key: prev.get(key, 0.0) + (cur.get(key, 0.0) - prev.get(key, 0.0)) * w for key in prev.keys() | cur.keys()}, b - k

def _apply_pose(P, pose):
    for (bone, axis), value in pose.items():
        if axis == 'mx':
            P.move(bone, value, 0, 0)
        elif axis == 'mz':
            P.move(bone, 0, 0, value)
        else:
            getattr(P, 'r' + axis)(bone, value)

def pose_dance_sway(extras=None):
    def f(ph, P):
        C = math.cos
        a = 2 * math.pi * 2 * ph
        sway = S_(a)
        P.move('Hips', 0.07 * sway, 0, -0.06 - 0.015 * C(2 * a))
        P.rx('Hips', 2); P.ry('Hips', -6 * sway)
        P.rx('Spine', 2); P.ry('Spine', 4 * S_(a - 0.5))
        P.rx('Chest', 2); P.ry('Chest', 3 * S_(a - 0.9))
        P.rx('Head', -2); P.ry('Head', -3 * S_(a - 1.2)); P.rz('Head', 6 * S_(a - 0.6))
        for side, sgn, _ in SIDES:
            P.rx('UpperArm' + side, -12 + 6 * S_(2 * a - sgn))
            P.ry('UpperArm' + side, -sgn * 8 - 22 * S_(a - 0.8))
            P.rx('LowerArm' + side, -(55 + 15 * S_(a - 1.3)))
            P.ry('LowerArm' + side, -12 * S_(a - 1.3))
            P.ry('Hand' + side, -20 * S_(a - 1.8))
            _plant(P, side)
        if extras:
            extras(ph, P, 0.3, 2)
    return f

def _goalpost(side, sgn):
    return {('UpperArm' + side, 'y'): -sgn * 45, ('LowerArm' + side, 'y'): -sgn * 100, ('Hand' + side, 'y'): sgn * 40}

def _robot_forward(side, sgn):
    return {('UpperArm' + side, 'x'): -15, ('UpperArm' + side, 'y'): sgn * 5, ('LowerArm' + side, 'x'): -90,
            ('Hand' + side, 'x'): 35}

ROBOT_HITS = [
    {**_robot_forward('.L', 1), **_robot_forward('.R', -1), ('UpperArm.L', 'y'): -35, ('UpperArm.R', 'y'): 35,
     ('Hand.L', 'x'): 0, ('Hand.R', 'x'): 0, ('Hand.L', 'y'): 35, ('Hand.R', 'y'): -35, ('Head', 'x'): 12},
    {**_goalpost('.L', 1), **_goalpost('.R', -1), ('Head', 'x'): -10, ('Chest', 'x'): -4},
    {**_goalpost('.L', 1), **_robot_forward('.R', -1), ('Head', 'z'): 20, ('Chest', 'z'): -6, ('Hips', 'z'): 5},
    {**_goalpost('.R', -1), **_robot_forward('.L', 1), ('Head', 'z'): -20, ('Chest', 'z'): 6, ('Hips', 'z'): -5},
]

def pose_dance_robot(extras=None):
    def f(ph, P):
        pose, u = _beat_hits(ROBOT_HITS, ph, 0.27)
        P.move('Hips', 0, 0, -0.04 - 0.03 * S_(math.pi * _clamp01(u / 0.6)))
        P.rx('Spine', 3)
        _apply_pose(P, pose)
        for side, sgn, _ in SIDES:
            _plant(P, side)
        if extras:
            extras(ph, P, 0.35, 4)
    return f

def _shuffle_foot(P, side, u):
    y = -0.15 * S_(2 * math.pi * u)
    pitch = -30 * S_(2 * math.pi * u)
    dy, dz = _on_ball(P, side, max(0.0, pitch))
    lift = 0.035 * S_(2 * math.pi * 2 * u) ** 2
    _plant(P, side, 0.0, y + dy, dz + lift, pitch)

def pose_dance_shuffle(extras=None):
    def f(ph, P):
        C = math.cos
        shift = S_(2 * math.pi * 2 * ph)
        P.move('Hips', 0.03 * shift, 0, -0.05 - 0.015 * C(2 * math.pi * 8 * ph))
        P.rx('Hips', 3); P.ry('Hips', -3 * shift)
        P.rx('Spine', 4); P.rz('Chest', 6 * S_(2 * math.pi * 4 * ph))
        P.rx('Head', 4 * C(2 * math.pi * 8 * ph))
        b = 4 * ph
        k = int(math.floor(b)) % 4
        active = '.R' if k % 2 == 0 else '.L'
        for side, sgn, _ in SIDES:
            pump = S_(2 * math.pi * 4 * ph) * sgn
            P.rx('UpperArm' + side, -12 + 30 * pump)
            P.ry('UpperArm' + side, sgn * 10)
            P.rx('LowerArm' + side, -(85 - 12 * pump))
            P.rx('Hand' + side, -5)
            if side == active:
                _shuffle_foot(P, side, b - math.floor(b))
            else:
                _plant(P, side)
        if extras:
            extras(ph, P, 0.35, 4)
    return f

def _spin_heading(ph, offset):
    h = 8 * ph - offset
    k = math.floor(h / 2)
    return 90 * k + 90 * min_jerk(_clamp01(h - 2 * k)), _clamp01(h - 2 * k)

def pose_dance_spin(extras=None):
    def f(ph, P):
        P.move('Hips', 0, 0, -0.06 - 0.015 * math.cos(2 * math.pi * 8 * ph))
        P.rz('Hips', 360 * ph)
        P.rx('Spine', 2); P.rz('Chest', 6)
        P.rx('Head', -4); P.rz('Head', 10)
        spread = min_jerk(_clamp01(0.8 * (1 - math.cos(2 * math.pi * ph))))
        for side, sgn, off in SIDES:
            tuck = 1 - spread
            P.rx('UpperArm' + side, -10 * spread + (-22 + sgn * 32) * tuck)
            P.ry('UpperArm' + side, -sgn * (58 + 5 * S_(2 * math.pi * 4 * ph)) * spread - sgn * 8 * tuck)
            P.rx('LowerArm' + side, -20 * spread - 90 * tuck)
            P.ry('LowerArm' + side, -sgn * 10 * spread)
            heading, u = _spin_heading(ph, 2 * off)
            rest = P.arm.data.bones['Foot' + side].head_local
            r = math.radians(heading)
            x = rest.x * math.cos(r) - rest.y * math.sin(r)
            y = rest.x * math.sin(r) + rest.y * math.cos(r)
            lift = 0.05 * S_(math.pi * u)
            leg_ik(P, side, (x, y, rest.z + lift), yaw=heading)
        if extras:
            extras(ph, P, 0.35, 4)
    return f

def _disco_point(side, sgn):
    return {('UpperArm' + side, 'y'): -sgn * 125, ('UpperArm' + side, 'x'): -15, ('LowerArm' + side, 'x'): -5}

def _disco_hip(side, sgn):
    return {('UpperArm' + side, 'y'): sgn * 45, ('UpperArm' + side, 'x'): -30, ('LowerArm' + side, 'x'): -60,
            ('LowerArm' + side, 'y'): sgn * 30}

def _disco_waist(side, sgn):
    return {('UpperArm' + side, 'y'): -sgn * 8, ('UpperArm' + side, 'x'): -35, ('LowerArm' + side, 'x'): -90}

DISCO_HITS = [
    {**_disco_hip('.L', 1), **_disco_waist('.R', -1), ('Head', 'x'): 8, ('Head', 'z'): -10, ('Hips', 'mx'): 0.02},
    {**_disco_point('.R', -1), **_disco_waist('.L', 1), ('Head', 'x'): -15, ('Head', 'z'): -20, ('Hips', 'mx'): 0.05},
    {**_disco_hip('.R', -1), **_disco_waist('.L', 1), ('Head', 'x'): 8, ('Head', 'z'): 10, ('Hips', 'mx'): -0.02},
    {**_disco_point('.L', 1), **_disco_waist('.R', -1), ('Head', 'x'): -15, ('Head', 'z'): 20, ('Hips', 'mx'): -0.05},
]

def pose_dance_disco(extras=None):
    def f(ph, P):
        pose, _ = _beat_hits(DISCO_HITS, ph, 0.45)
        hips_x = pose.pop(('Hips', 'mx'))
        P.move('Hips', hips_x, 0, -0.05 - 0.015 * math.cos(2 * math.pi * 4 * ph))
        P.rx('Hips', 3); P.ry('Hips', -120 * hips_x)
        P.ry('Spine', 60 * hips_x); P.rx('Chest', 2)
        _apply_pose(P, pose)
        for side, sgn, _ in SIDES:
            _plant(P, side)
        if extras:
            extras(ph, P, 0.35, 4)
    return f

def pose_dance_twist(extras=None):
    def f(ph, P):
        a = 2 * math.pi * 4 * ph
        t = S_(a)
        P.move('Hips', 0, 0, -0.14 + 0.02 * math.cos(2 * a))
        P.rx('Hips', 6); P.rz('Hips', 28 * t)
        P.rx('Spine', 8); P.rz('Spine', -24 * t)
        P.rz('Chest', -26 * t)
        P.rx('Head', -6); P.rz('Head', 16 * t)
        for side, sgn, _ in SIDES:
            P.rx('UpperArm' + side, -20 + 20 * sgn * t)
            P.ry('UpperArm' + side, -sgn * 35)
            P.rx('LowerArm' + side, -95)
            P.rx('Hand' + side, -10)
            _plant(P, side)
        if extras:
            extras(ph, P, 0.35, 4)
    return f

def _dance_arm_to(side, sgn, upper_x, upper_y, lower_x, lower_y=0.0, hand_x=-2.0):
    return {('UpperArm' + side, 'x'): upper_x - (-22 + sgn * 32), ('UpperArm' + side, 'y'): upper_y + sgn * 8,
            ('LowerArm' + side, 'x'): lower_x + 90, ('LowerArm' + side, 'y'): lower_y, ('Hand' + side, 'x'): hand_x + 2}

def _dance_move(keys, feet, extras):
    pose_at = key_poses(keys)

    def f(ph, P):
        _apply_pose(P, pose_at(ph))
        _dance_frame(0.0, P, feet(ph, P))
        if extras:
            extras(ph, P, 0.35, 4)
    return f

def pose_dance_move_side(side, extras=None):
    sgn = 1 if side == '.L' else -1
    other = '.R' if side == '.L' else '.L'
    lean = {('Spine', 'y'): sgn * 6, ('Chest', 'y'): sgn * 6, ('Head', 'z'): sgn * 15, ('Head', 'y'): -sgn * 4}
    point = {**_dance_arm_to(side, sgn, -5, -sgn * 72, -5), **_dance_arm_to(other, -sgn, -40, 0, -100)}
    keys = [
        (0.0, {}),
        (0.13, {('Hips', 'mz'): -0.02, ('Hips', 'mx'): -sgn * 0.015}),
        (0.43, {**point, **lean, ('Hips', 'mx'): sgn * 0.06, ('Hips', 'mz'): -0.03}),
        (0.67, {**point, **lean, ('UpperArm' + side, 'y'): point[('UpperArm' + side, 'y')] - sgn * 5,
                ('Hips', 'mx'): sgn * 0.065, ('Hips', 'mz'): -0.03}),
        (1.0, {}),
    ]

    def feet(ph, P):
        out = min_jerk(_clamp01((ph - 0.13) / 0.3))
        back = min_jerk(_clamp01((ph - 0.67) / 0.33))
        swing = S_(math.pi * _clamp01((ph - 0.13) / 0.3)) + S_(math.pi * _clamp01((ph - 0.67) / 0.33))
        touch = 20 * S_(math.pi * _clamp01((ph - 0.35) / 0.4))
        dy, dz = _on_ball(P, other, touch)
        return {side: (sgn * 0.14 * (out - back), 0.0, 0.035 * swing, 0.0), other: (0.0, dy, dz, touch)}
    return _dance_move(keys, feet, extras)

def pose_dance_move_up(extras=None):
    dip = {('Hips', 'mz'): -0.04, ('Head', 'x'): 4}
    up = {('Hips', 'mz'): 0.05, ('Chest', 'x'): -8, ('Head', 'x'): -15}
    for side, sgn, _ in SIDES:
        dip.update(_dance_arm_to(side, sgn, 15, -sgn * 15, -60))
        up.update(_dance_arm_to(side, sgn, -165, -sgn * 20, -5, 0.0, 0.0))
    keys = [(0.0, {}), (0.2, dip), (0.5, up), (0.7, {**up, ('Hips', 'mz'): 0.045}), (1.0, {})]
    rise = key_poses([(0.0, {}), (0.2, {}), (0.5, {'p': 22}), (0.7, {'p': 20}), (1.0, {})])

    def feet(ph, P):
        pitch = rise(ph).get('p', 0.0)
        out = {}
        for side, _, _ in SIDES:
            dy, dz = _on_ball(P, side, pitch)
            out[side] = (0.0, dy, dz, pitch)
        return out
    return _dance_move(keys, feet, extras)

def pose_dance_move_down(extras=None):
    rise = {('Hips', 'mz'): 0.01}
    squat = {('Hips', 'mz'): -0.2, ('Hips', 'x'): 12, ('Spine', 'x'): 12, ('Chest', 'x'): 8, ('Head', 'x'): -20}
    for side, sgn, _ in SIDES:
        rise.update(_dance_arm_to(side, sgn, -15, -sgn * 12, -80))
        squat.update(_dance_arm_to(side, sgn, -45, -sgn * 10, -15, 0.0, 10.0))
    keys = [(0.0, {}), (0.13, rise), (0.43, squat), (0.67, {**squat, ('Hips', 'mz'): -0.19}), (1.0, {})]
    return _dance_move(keys, lambda ph, P: None, extras)


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
        "ClimbReachL": (18, pose_climb_reach('.L', extras)),
        "ClimbReachR": (18, pose_climb_reach('.R', extras)),
        "ClimbHang": (60, pose_climb_hang(extras)),
        "ClimbFall": (24, pose_climb_fall(extras)),
        "ClimbLower": (30, pose_climb_lower(extras)),
        "ClimbTop": (36, pose_climb_top(extras)),
        **skate_clips(extras),
        "PetanquePoint": (48, pose_petanque_point(extras)),
        "PetanqueShoot": (48, pose_petanque_shoot(extras)),
        "PetanqueCrouch": (120, pose_petanque_crouch(extras)),
        "PetanqueCelebrate": (45, pose_petanque_celebrate(extras)),
        "DanceSway": (DANCE_FRAMES, pose_dance_sway(extras)),
        "DanceRobot": (DANCE_FRAMES, pose_dance_robot(extras)),
        "DanceShuffle": (DANCE_FRAMES, pose_dance_shuffle(extras)),
        "DanceSpin": (DANCE_FRAMES, pose_dance_spin(extras)),
        "DanceDisco": (DANCE_FRAMES, pose_dance_disco(extras)),
        "DanceTwist": (DANCE_FRAMES, pose_dance_twist(extras)),
        "DanceMoveLeft": (15, pose_dance_move_side('.L', extras)),
        "DanceMoveRight": (15, pose_dance_move_side('.R', extras)),
        "DanceMoveUp": (15, pose_dance_move_up(extras)),
        "DanceMoveDown": (15, pose_dance_move_down(extras)),
    }
