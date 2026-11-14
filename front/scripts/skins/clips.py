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

def make_clips(extras):
    return {
        "Idle": (120, gait_idle(None, extras)),
        "Walk": (JOG["frames"], gait_walk(extras)),
        "Run": (SPRINT["frames"], gait_run(extras)),
        "Sit": (120, pose_sit(extras)),
        "Eat": (30, pose_eat(extras)),
        "Drink": (30, pose_drink(extras)),
    }
