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

PALM_UP = -90
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
    back = {**crouch, ("UpperArm.R", "x"): 40, ("UpperArm.R", "y"): ARM_TUCK, ("LowerArm.R", "x"): -12, ("LowerArm.R", "z"): PALM_UP}
    release = {**crouch, ("UpperArm.R", "x"): -55, ("UpperArm.R", "y"): ARM_TUCK, ("LowerArm.R", "x"): -8, ("LowerArm.R", "z"): PALM_UP, ("Hand.R", "x"): -12}
    follow = {**release, ("UpperArm.R", "x"): -78, ("LowerArm.R", "x"): -4, ("Hand.R", "x"): 6, ("Head", "x"): -16}
    pose_at = key_poses([
        (0.0, {}),
        (0.07, {("Hips", "mz"): -0.03, ("UpperArm.R", "x"): -15, ("LowerArm.R", "x"): -20, ("LowerArm.R", "z"): PALM_UP}),
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
    aim = {("Hips", "mz"): -0.03, ("UpperArm.R", "x"): -25, ("LowerArm.R", "x"): -25, ("Head", "x"): -3}
    back = {("Hips", "mz"): -0.06, ("Hips", "my"): 0.03, ("Spine", "x"): 8, ("Chest", "x"): 6, ("Head", "x"): -10,
            ("UpperArm.R", "x"): 75, ("UpperArm.R", "y"): ARM_TUCK, ("LowerArm.R", "x"): -6, ("UpperArm.L", "x"): -28, ("LowerArm.L", "x"): -25,
            ("Foot.L", "sy"): -0.12, ("Foot.L", "sz"): 0.07}
    planted = {("Hips", "mz"): -0.06, ("Hips", "my"): -0.12, ("Spine", "x"): 6, ("Chest", "x"): 4, ("Head", "x"): -8,
               ("Foot.L", "sy"): -0.30, ("Foot.R", "pitch"): 18}
    release = {**planted, ("UpperArm.R", "x"): -95, ("UpperArm.R", "y"): ARM_TUCK, ("LowerArm.R", "x"): -6, ("Hand.R", "x"): -10,
               ("UpperArm.L", "x"): 10, ("LowerArm.L", "x"): -20}
    follow = {**planted, ("UpperArm.R", "x"): -135, ("UpperArm.R", "y"): ARM_TUCK, ("LowerArm.R", "x"): -10, ("Hand.R", "x"): 8, ("Head", "x"): -12,
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

def make_clips(extras):
    return {
        "Idle": (120, gait_idle(None, extras)),
        "Walk": (JOG["frames"], gait_walk(extras)),
        "Run": (SPRINT["frames"], gait_run(extras)),
        "Sit": (120, pose_sit(extras)),
        "Eat": (30, pose_eat(extras)),
        "Drink": (30, pose_drink(extras)),
        "PetanquePoint": (48, pose_petanque_point(extras)),
        "PetanqueShoot": (48, pose_petanque_shoot(extras)),
        "PetanqueCrouch": (120, pose_petanque_crouch(extras)),
        "PetanqueCelebrate": (45, pose_petanque_celebrate(extras)),
    }
