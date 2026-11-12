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

def _apply_pose(P, pose):
    for (bone, axis), value in pose.items():
        if axis.startswith('m'):
            P.move(bone, **{axis[1]: value})
        else:
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
        _apply_pose(P, pose_at(ph))
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
        _apply_pose(P, pose_at(ph))
        if 0.55 < ph < 0.72:
            P.rx("Head", 1.5 * S_(2 * math.pi * 2 * (ph - 0.55) / 0.17))
        if extras:
            extras(ph, P, 0.0, 1.0)
    return f

def _plant_feet(P):
    for side, _, _ in SIDES:
        leg_ik(P, side, P.arm.data.bones['Foot' + side].head_local)

def _hump(ph, centre, sharp=1):
    s = ((1 + math.cos(2 * math.pi * (ph - centre))) / 2) ** sharp
    return min_jerk(min_jerk(s))

def pose_browse():
    chin_pose = {("UpperArm.L", "x"): -8, ("UpperArm.L", "z"): -100, ("UpperArm.L", "y"): -30, ("Hand.L", "x"): -10}
    point_pose = {("UpperArm.R", "x"): -34, ("UpperArm.R", "z"): 10, ("LowerArm.R", "x"): -42, ("Hand.R", "x"): -4}

    def f(ph, P):
        a = 2 * math.pi * ph
        chin = _hump(ph, 0.28, 2)
        elbow = _hump(ph, 0.28, 1.2)
        lean = _hump(ph, 0.76, 2)
        w = S_(a - 0.8)
        scan = S_(a)
        P.move('Hips', 0.015 * w, 0.012 * lean, -0.012 - 0.004 * lean)
        P.ry('Hips', -2 * w); P.ry('Spine', 1.2 * w); P.ry('Chest', 0.6 * w)
        P.rx('Spine', -0.6 * S_(a) + 5 * lean); P.rx('Chest', -1.2 * S_(a) + 7 * lean)
        P.rz('Chest', 5 * scan); P.rz('Neck', 5 * scan); P.rz('Head', 12 * scan + 3 * S_(3 * a + 0.7))
        P.rx('Head', 8 + 1.2 * S_(2 * a - 0.6) - 6 * chin + 12 * lean)
        P.ry('Head', 7 * chin)
        for side, sgn, _ in SIDES:
            rest = 1 - (elbow if side == '.L' else lean)
            P.move('Shoulder' + side, 0, 0, 0.005 * S_(a))
            P.rx('UpperArm' + side, -1.5 * S_(a - 0.4) * rest); P.ry('UpperArm' + side, sgn * 12 * rest)
            P.rx('LowerArm' + side, -(8 + 2 * S_(a - 0.3)) * rest)
            P.rx('Hand' + side, 2 * S_(2 * a) * rest)
        _apply_pose(P, {k: v * chin for k, v in chin_pose.items()})
        P.rx('LowerArm.L', -134 * elbow)
        _apply_pose(P, {k: v * lean for k, v in point_pose.items()})
        _plant_feet(P)
    return f

def pose_take_item():
    reach = {("UpperArm.R", "x"): -62, ("UpperArm.R", "z"): 12, ("LowerArm.R", "x"): -22, ("Hand.R", "x"): 0,
             ("Spine", "x"): 3, ("Chest", "x"): 5, ("Chest", "z"): 6, ("Head", "x"): 8, ("Head", "z"): -4,
             ("UpperArm.L", "x"): 6, ("LowerArm.L", "x"): -10, ("Hips", "mz"): -0.01}
    grab = {**reach, ("LowerArm.R", "x"): -28, ("Hand.R", "x"): -22}
    pull = {**grab, ("UpperArm.R", "x"): -48, ("LowerArm.R", "x"): -40}
    basket = {("UpperArm.R", "x"): 4, ("UpperArm.R", "z"): 4, ("LowerArm.R", "x"): -42, ("Hand.R", "x"): -20,
              ("Chest", "x"): 4, ("Chest", "z"): -3, ("Head", "x"): 14, ("Head", "z"): -6, ("UpperArm.L", "x"): 3,
              ("LowerArm.L", "x"): -6, ("Hips", "mz"): -0.012}
    pose_at = key_poses([
        (0.0, {}),
        (0.07, {("UpperArm.R", "x"): 8, ("Chest", "z"): -2, ("Head", "x"): 4, ("Hips", "mz"): -0.006}),
        (0.33, reach),
        (0.40, grab),
        (0.47, pull),
        (0.70, basket),
        (0.78, {**basket, ("Hand.R", "x"): 4, ("LowerArm.R", "x"): -36}),
        (1.0, {}),
    ])

    def f(ph, P):
        _apply_pose(P, pose_at(ph))
        _plant_feet(P)
    return f

def pose_pay():
    offer = {("UpperArm.R", "x"): -34, ("UpperArm.R", "z"): 10, ("LowerArm.R", "x"): -38, ("Hand.R", "x"): 2,
             ("Spine", "x"): 2, ("Chest", "x"): 4, ("Chest", "z"): 4, ("Head", "x"): 2,
             ("UpperArm.L", "x"): 4, ("LowerArm.L", "x"): -8, ("Hips", "mz"): -0.006}
    pose_at = key_poses([
        (0.0, {}),
        (0.07, {("UpperArm.R", "x"): 6, ("Chest", "z"): -1.5, ("Hips", "mz"): -0.004}),
        (0.33, offer),
        (0.40, {**offer, ("UpperArm.R", "x"): -32, ("Hand.R", "x"): -2}),
        (0.62, {**offer, ("UpperArm.R", "x"): -32, ("Hand.R", "x"): -2, ("Head", "x"): 6}),
        (0.80, {("UpperArm.R", "x"): -10, ("UpperArm.R", "z"): 4, ("LowerArm.R", "x"): -30, ("Hand.R", "x"): 6,
                ("Head", "x"): 1, ("Chest", "z"): 1}),
        (1.0, {}),
    ])

    def f(ph, P):
        _apply_pose(P, pose_at(ph))
        if 0.45 < ph < 0.62:
            P.rx("Head", 5 * S_(math.pi * (ph - 0.45) / 0.17))
        _plant_feet(P)
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
