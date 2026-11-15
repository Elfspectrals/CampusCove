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
        "Dance": (DANCE_FRAMES, pose_dance(extras)),
        "Stumble": (18, pose_stumble(extras)),
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
