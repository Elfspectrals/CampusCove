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


def make_clips(extras):
    return {
        "Idle": (120, gait_idle(None, extras)),
        "Walk": (JOG["frames"], gait_walk(extras)),
        "Run": (SPRINT["frames"], gait_run(extras)),
        "Sit": (120, pose_sit(extras)),
        "Eat": (30, pose_eat(extras)),
        "Drink": (30, pose_drink(extras)),
        "ClimbReachL": (18, pose_climb_reach('.L', extras)),
        "ClimbReachR": (18, pose_climb_reach('.R', extras)),
        "ClimbHang": (60, pose_climb_hang(extras)),
        "ClimbFall": (24, pose_climb_fall(extras)),
        "ClimbLower": (30, pose_climb_lower(extras)),
        "ClimbTop": (36, pose_climb_top(extras)),
    }
