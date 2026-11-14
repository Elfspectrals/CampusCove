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


def make_clips(extras):
    return {
        "Idle": (120, gait_idle(None, extras)),
        "Walk": (JOG["frames"], gait_walk(extras)),
        "Run": (SPRINT["frames"], gait_run(extras)),
        "Sit": (120, pose_sit(extras)),
        "Eat": (30, pose_eat(extras)),
        "Drink": (30, pose_drink(extras)),
        **skate_clips(extras),
    }
