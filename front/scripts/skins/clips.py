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

def _rot(axis, deg):
    return Matrix.Rotation(math.radians(deg), 3, axis)

def _turn_hips(P, rot, pivot):
    _set_rot(P, "Hips", rot)
    p = Vector(pivot)
    P.move("Hips", *(p - rot @ p))

SWIM_PITCH = 78
SWIM_LIFT = 0.05
TREAD_DROP = -0.33

def _stroke(s):
    w = s - 0.5 / (2 * math.pi) * (S_(2 * math.pi * (s - 0.25)) + 1)
    pull = s < 0.6
    bend = S_(math.pi * s / 0.6) ** 2 if pull else S_(math.pi * (s - 0.6) / 0.4) ** 2
    return -180 + 360 * w, pull, bend

def pose_swim():
    def f(ph, P):
        a = 2 * math.pi * ph
        roll = 32 * S_(a)
        _turn_hips(P, _rot("X", SWIM_PITCH) @ _rot("Z", 0.4 * roll), (0, 0, 0))
        P.move("Hips", 0, 0, SWIM_LIFT + 0.01 * S_(2 * a))
        P.rz("Spine", 0.3 * roll); P.rz("Chest", 0.3 * roll)
        P.rx("Neck", -18); P.rx("Head", -28); P.rz("Head", -0.8 * roll)
        for side, sgn, off in SIDES:
            theta, pull, bend = _stroke((ph - off) % 1.0)
            spread = sgn * (18 if pull else 18 - 28 * bend)
            twist = sgn * (110 * bend if pull else -60 * bend)
            _set_rot(P, "UpperArm" + side, _rot("X", theta) @ _rot("Y", spread) @ _rot("Z", twist))
            P.rx("LowerArm" + side, -(12 + (55 if pull else 85) * bend))
            P.rx("Hand" + side, 10 * bend)
            k = 3 * a + math.pi * (off * 2)
            P.rx("UpperLeg" + side, -2 + 12 * S_(k)); P.ry("UpperLeg" + side, sgn * 4)
            P.rx("LowerLeg" + side, 14 + 12 * S_(k - 1.2))
            P.rx("Foot" + side, 45 + 8 * S_(k - 1.8))
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

def make_clips(extras):
    return {
        "Idle": (120, gait_idle(None, extras)),
        "Walk": (JOG["frames"], gait_walk(extras)),
        "Run": (SPRINT["frames"], gait_run(extras)),
        "Sit": (120, pose_sit(extras)),
        "Eat": (30, pose_eat(extras)),
        "Drink": (30, pose_drink(extras)),
    }
