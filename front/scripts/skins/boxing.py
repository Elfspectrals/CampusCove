if "SKINS_DIR" not in globals():
    raise RuntimeError("Run these scripts through run_boxing.py (blender --background --python front/scripts/skins/run_boxing.py): they share state via exec().")

import math
from mathutils import Euler, Vector

BOX_FEET = {".L": (0.12, -0.17), ".R": (-0.13, 0.15)}
BOX_HIPS_Z = -0.10
BOX_HIPS_YAW = -15
BOX_HIPS_PITCH = 3
BOX_IDLE_BOB = 0.012
BOX_IDLE_HEEL = 7
BOX_STEP_BOB = 0.02
BOX_STEP = dict(frames=15, speed=2.5, df=0.38, roll_at=0.08, toe_off=22, kick=0.25, reach=0.15, lift=0.06, dorsi=6)
BOX_STEP_CENTRE = {".L": -0.05, ".R": 0.05}
BOX_SIDES = ((".L", "L", 1.0), (".R", "R", -1.0))
TORSO_KEYS = (("Spine", "spine"), ("Chest", "chest"), ("Neck", "neck"), ("Head", "head"))


def _posed(P, name):
    b = P.arm.data.bones[name]
    r = Euler(P.rot.get(name, (0.0, 0.0, 0.0)), "XYZ").to_matrix()
    loc = P.loc.get(name, Vector((0, 0, 0)))
    if b.parent is None:
        return r, b.head_local + loc
    d, h = _posed(P, b.parent.name)
    return d @ r, h + d @ (b.head_local - b.parent.head_local + loc)


def arm_ik(P, side, wrist, pole):
    bones = P.arm.data.bones
    sh, ua, la = bones["Shoulder" + side], bones["UpperArm" + side], bones["LowerArm" + side]
    ds, hs = _posed(P, "Shoulder" + side)
    shoulder = hs + ds @ (ua.head_local - sh.head_local)
    upper, fore = ua.tail_local - ua.head_local, la.tail_local - la.head_local
    l1, l2 = upper.length, fore.length
    d = Vector(wrist) - shoulder
    dist = min(d.length, 0.9995 * (l1 + l2))
    dn = d.normalized()
    p = Vector(pole)
    p = (p - p.dot(dn) * dn).normalized()
    a = math.acos(max(-1.0, min(1.0, (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist))))
    elbow = shoulder + l1 * (math.cos(a) * dn + math.sin(a) * p)
    hinge = dn.cross(p)
    r1 = _aim(upper, elbow - shoulder, hinge)
    r2 = _aim(fore, shoulder + dist * dn - elbow, hinge)
    _set_rot(P, "UpperArm" + side, ds.transposed() @ r1)
    _set_rot(P, "LowerArm" + side, r1.transposed() @ r2)


def _foot(P):
    bones = P.arm.data.bones
    ankle, ball = bones["Foot.L"].head_local, bones["Toe.L"].head_local
    return dict(ankle_z=ankle.z, ball_z=ball.z, ball_to_ankle=(ankle.y - ball.y, ankle.z - ball.z))


def _on_ball(y0, pitch, foot):
    by, bz = foot["ball_to_ankle"]
    p = math.radians(pitch)
    return y0 - by + by * math.cos(p) - bz * math.sin(p), foot["ball_z"] + by * math.sin(p) + bz * math.cos(p)


def lower(P, q):
    P.move("Hips", q["hips.x"], q["hips.y"], q["hips.z"])
    P.rx("Hips", q["hips.rx"]); P.ry("Hips", q["hips.ry"]); P.rz("Hips", q["hips.rz"])
    for side, k, _ in BOX_SIDES:
        leg_ik(P, side, (q[k + ".ax"], q[k + ".ay"], q[k + ".az"]), q[k + ".ap"], q[k + ".at"])


def upper(P, q):
    for bone, k in TORSO_KEYS:
        P.rx(bone, q[k + ".x"]); P.ry(bone, q[k + ".y"]); P.rz(bone, q[k + ".z"])
    rest = P.arm.data.bones["Chest"].head_local
    for side, k, sgn in BOX_SIDES:
        P.rz("Shoulder" + side, -sgn * q[k + ".pro"])
        P.ry("Shoulder" + side, -sgn * q[k + ".up"])
        dc, hc = _posed(P, "Chest")
        target = Vector((q[k + ".x"], q[k + ".y"], q[k + ".z"]))
        pole = Vector((q[k + ".px"], q[k + ".py"], q[k + ".pz"]))
        w = q[k + ".w"]
        arm_ik(P, side, (hc + dc @ (target - rest)).lerp(target, w), (dc @ pole).lerp(pole, w))
        P.rx("Hand" + side, q[k + ".flex"])


def idle_lower(ph, foot):
    a = 4 * math.pi * ph
    heel = BOX_IDLE_HEEL * (1 - math.cos(a)) / 2
    q = {"hips.x": 0.006 * math.sin(2 * math.pi * ph), "hips.y": 0.0, "hips.z": BOX_HIPS_Z - BOX_IDLE_BOB * math.cos(a),
         "hips.rx": BOX_HIPS_PITCH, "hips.ry": 1.2 * math.sin(2 * math.pi * ph), "hips.rz": BOX_HIPS_YAW}
    for side, k, _ in BOX_SIDES:
        x, y0 = BOX_FEET[side]
        y, z = _on_ball(y0, heel, foot)
        q.update({k + ".ax": x, k + ".ay": y, k + ".az": z, k + ".ap": heel, k + ".at": 0.0})
    return q


def step_lower(ph, foot):
    s = 2 * ph
    a = 2 * math.pi * s
    q = {"hips.x": 0.0, "hips.y": 0.0, "hips.z": BOX_HIPS_Z - BOX_STEP_BOB * math.cos(a),
         "hips.rx": BOX_HIPS_PITCH + 2, "hips.ry": 1.5 * math.sin(a), "hips.rz": BOX_HIPS_YAW}
    stride = BOX_STEP["speed"] * BOX_STEP["frames"] / 30
    for side, k, _ in BOX_SIDES:
        x, y0 = BOX_FEET[side]
        g = {**BOX_STEP, "y_td": y0 - stride * BOX_STEP["df"] / 2}
        y, z, pitch, toe = _foot_track((s - BOX_STEP_CENTRE[side] + BOX_STEP["df"] / 2) % 1.0, g, foot)
        q.update({k + ".ax": x, k + ".ay": y, k + ".az": z, k + ".ap": pitch, k + ".at": toe})
    return q


def _arm(k, x, y, z, px, py, pz, flex=0.0, pro=0.0, up=4.0, w=0.0):
    return {k + ".x": x, k + ".y": y, k + ".z": z, k + ".px": px, k + ".py": py, k + ".pz": pz, k + ".flex": flex, k + ".pro": pro, k + ".up": up,
            k + ".w": w}


def _torso(spine=(0, 0, 0), chest=(0, 0, 0), neck=(0, 0, 0), head=(0, 0, 0)):
    q = {}
    for k, v in (("spine", spine), ("chest", chest), ("neck", neck), ("head", head)):
        q.update({k + ".x": v[0], k + ".y": v[1], k + ".z": v[2]})
    return q


GUARD_POSE = {**_torso((4, 0, -6), (6, 0, -10), (0, 0, 8), (8, 0, 23)),
              **_arm("L", 0.11, -0.22, 1.56, 0.1, 0.2, -1),
              **_arm("R", -0.09, -0.19, 1.55, -0.1, 0.2, -1)}


def _with(base, **changes):
    q = dict(base)
    for key, value in changes.items():
        q[key.replace("_", ".", 1)] = value
    return q


def _upper_keys(nf, keys):
    return key_poses([(fr / nf, {**guard_at(0.0), **pose}) for fr, pose in keys])


def _upper_clip(nf, keys, extra=None):
    pose_at = _upper_keys(nf, keys)

    def f(ph, P):
        foot = _foot(P)
        lower(P, idle_lower(0.0, foot))
        q = pose_at(ph)
        if extra:
            extra(ph, q)
        upper(P, q)
    return f


def box_idle():
    def f(ph, P):
        lower(P, idle_lower(ph, _foot(P)))
        upper(P, guard_at(ph))
    return f


def box_step():
    def f(ph, P):
        lower(P, step_lower(ph, _foot(P)))
        upper(P, guard_at(ph))
    return f


def guard_at(ph):
    a = 4 * math.pi * ph
    q = dict(GUARD_POSE)
    dip = 0.008 * math.cos(a - 0.5)
    q["L.z"] -= dip; q["R.z"] -= dip
    q["chest.y"] += 1.5 * math.sin(2 * math.pi * ph)
    q["head.z"] += 2 * math.sin(2 * math.pi * ph + 0.6)
    q["head.y"] -= 1.5 * math.sin(2 * math.pi * ph)
    q["spine.x"] += 1.0 * math.cos(a - 0.3)
    return q


BLOCK_POSE = {**_torso((7, 0, -6), (10, 0, -10), (2, 0, 8), (14, 0, 23)),
              **_arm("L", 0.075, -0.20, 1.62, 0.1, 0.1, -1, up=9),
              **_arm("R", -0.065, -0.19, 1.62, -0.1, 0.1, -1, up=9)}


def block():
    def f(ph, P):
        lower(P, idle_lower(ph, _foot(P)))
        a = 4 * math.pi * ph
        q = dict(BLOCK_POSE)
        dip = 0.006 * math.cos(a - 0.5)
        q["L.z"] -= dip; q["R.z"] -= dip
        q["spine.x"] += 1.0 * math.cos(a - 0.3)
        upper(P, q)
    return f


JAB_FRAMES = 13
JAB_IMPACT = 5
JAB_LOAD = _with(GUARD_POSE, **{"L_y": -0.18, "L_z": 1.53, "chest_z": -8})
JAB_HIT = {**_torso((5, 0, -8), (7, 0, -16), (0, 0, 10), (8, 0, 29)),
           **_arm("L", 0.06, -0.66, 1.55, 1.0, 0.0, -0.4, pro=14, up=6, w=1),
           **_arm("R", -0.08, -0.20, 1.56, -0.1, 0.2, -1)}


def jab():
    return _upper_clip(JAB_FRAMES, [
        (0, {}),
        (2, JAB_LOAD),
        (JAB_IMPACT, JAB_HIT),
        (7, _with(JAB_HIT, **{"L_y": -0.52, "L_z": 1.53})),
        (JAB_FRAMES, {}),
    ])


CROSS_FRAMES = 24
CROSS_IMPACT = 8
CROSS_LOAD = {**_torso((3, 0, -9), (5, 0, -14), (0, 0, 10), (8, 0, 28)),
              **_arm("L", 0.11, -0.22, 1.56, 0.1, 0.2, -1),
              **_arm("R", -0.10, -0.15, 1.52, -0.1, 0.2, -1)}
CROSS_HIT = {**_torso((8, 0, 10), (9, 0, 18), (0, 0, -4), (8, 0, -9)),
             **_arm("L", 0.11, -0.18, 1.55, 0.1, 0.2, -1),
             **_arm("R", -0.02, -0.66, 1.55, -1.0, 0.0, -0.4, pro=16, up=6, w=1)}


def cross():
    return _upper_clip(CROSS_FRAMES, [
        (0, {}),
        (3, CROSS_LOAD),
        (CROSS_IMPACT, CROSS_HIT),
        (10, _with(CROSS_HIT, **{"R_y": -0.58, "spine_z": 11, "chest_z": 20})),
        (17, _with(GUARD_POSE, **{"spine_z": 0, "chest_z": -4, "neck_z": 4, "head_z": 15, "R_y": -0.26})),
        (CROSS_FRAMES, {}),
    ])


HOOK_FRAMES = 33
HOOK_IMPACT = 11
HOOK_LOAD = {**_torso((3, 0, 0), (5, 0, -2), (0, 0, 6), (8, 0, 11)),
             **_arm("L", 0.25, -0.24, 1.48, 1.0, 0.2, -0.3, pro=-4),
             **_arm("R", -0.09, -0.19, 1.55, -0.1, 0.2, -1)}
HOOK_HIT = {**_torso((5, 0, -10), (7, 0, -14), (0, 0, 10), (8, 0, 29)),
            **_arm("L", 0.0, -0.46, 1.50, 0.8, -0.5, -0.25, pro=10, up=6, w=1),
            **_arm("R", -0.08, -0.18, 1.56, -0.1, 0.2, -1)}


def hook():
    return _upper_clip(HOOK_FRAMES, [
        (0, {}),
        (5, HOOK_LOAD),
        (HOOK_IMPACT, HOOK_HIT),
        (15, _with(HOOK_HIT, **{"L_x": -0.08, "L_y": -0.40, "spine_z": -13, "chest_z": -18, "head_z": 35})),
        (25, _with(GUARD_POSE, **{"chest_z": -13, "head_z": 26, "L_x": 0.14, "L_y": -0.26})),
        (HOOK_FRAMES, {}),
    ])


DODGE_FRAMES = 12


def dodge(sgn):
    slip = _with(GUARD_POSE, **{"spine_y": 12 * sgn, "chest_y": 9 * sgn, "neck_y": -6 * sgn, "head_y": -8 * sgn,
                                "spine_x": 9, "chest_x": 9})
    return _upper_clip(DODGE_FRAMES, [(0, {}), (4, slip), (7, slip), (DODGE_FRAMES, {})])


HIT_FRAMES = 12
HIT_SNAP = _with(GUARD_POSE, **{"head_x": -16, "neck_x": -8, "chest_x": -4, "spine_x": 0, "head_y": 6,
                                "L_x": 0.15, "L_z": 1.50, "R_x": -0.13, "R_z": 1.48})


def hit_react():
    return _upper_clip(HIT_FRAMES, [(0, {}), (3, HIT_SNAP), (6, _with(HIT_SNAP, **{"head_x": -8})), (HIT_FRAMES, {})])


def _body(lower_q, upper_q):
    return {**lower_q, **upper_q}


def _lower_pose(hips, ankles):
    q = dict(zip(("hips.x", "hips.y", "hips.z", "hips.rx", "hips.ry", "hips.rz"), hips))
    for k, (x, y, z, p, t) in ankles.items():
        q.update({k + ".ax": x, k + ".ay": y, k + ".az": z, k + ".ap": p, k + ".at": t})
    return q


def _full_clip(nf, keys, extra=None):
    def f(ph, P):
        foot = _foot(P)
        frames = [(fr / nf, pose(foot) if callable(pose) else pose) for fr, pose in keys]
        q = key_poses(frames)(ph)
        if extra:
            extra(ph, q)
        lower(P, q)
        upper(P, q)
    return f


def _box_stance(foot):
    return _body(idle_lower(0.0, foot), guard_at(0.0))


LIMP_ARMS = {**_arm("L", 0.36, -0.05, 1.08, 0.3, 0.6, -1, up=0), **_arm("R", -0.36, -0.05, 1.08, -0.3, 0.6, -1, up=0)}
LYING = _body(_lower_pose((0.0, 0.42, -0.80, -88, 0, 0), {"L": (0.17, -0.38, 0.08, -65, -10), "R": (-0.17, -0.36, 0.08, -60, -10)}),
              {**_torso((0, 0, 0), (0, 0, 0), (0, 0, 8), (0, 0, 14)),
               **_arm("L", 0.56, 0.07, 1.22, 0.2, 0.0, -1, up=0), **_arm("R", -0.56, 0.07, 1.20, -0.2, 0.0, -1, up=0)})
SITTING = _body(_lower_pose((0.0, 0.30, -0.78, -22, 0, -5), {"L": (0.15, -0.30, 0.09, -25, 0), "R": (-0.16, -0.22, 0.09, -25, 0)}),
                {**_torso((6, 0, 0), (8, 0, 0), (0, 0, 0), (6, 0, 0)),
                 **_arm("L", 0.30, 0.18, 1.02, 0.2, 0.6, -1, up=0), **_arm("R", -0.30, 0.18, 1.02, -0.2, 0.6, -1, up=0)})


def _crouch(foot):
    stance = idle_lower(0.0, foot)
    return _body({**stance, "hips.y": 0.22, "hips.z": -0.48, "hips.rx": 22, "hips.rz": -8},
                 {**_torso((14, 0, -3), (12, 0, -5), (-6, 0, 4), (-10, 0, 10)),
                  **_arm("L", 0.20, -0.40, 0.98, 0.3, 0.6, -1, up=0), **_arm("R", -0.20, -0.32, 0.98, -0.3, 0.6, -1, up=0)})


def _rising(foot):
    stance = idle_lower(0.0, foot)
    return _body({**stance, "hips.y": 0.05, "hips.z": -0.18, "hips.rx": 8},
                 _with(GUARD_POSE, **{"spine_x": 10, "chest_x": 8, "L_z": 1.48, "R_z": 1.47}))


KNOCKDOWN_FRAMES = 30


def _knock_hit(foot):
    stance = idle_lower(0.0, foot)
    return _body({**stance, "hips.y": 0.05, "hips.rx": -4},
                 _with(GUARD_POSE, **{"head_x": -20, "neck_x": -6, "chest_x": -10, "spine_x": -4,
                                      "L_x": 0.22, "L_y": -0.15, "L_z": 1.36, "R_x": -0.22, "R_y": -0.13, "R_z": 1.34}))


def _buckle(foot):
    stance = idle_lower(0.0, foot)
    return _body({**stance, "hips.y": 0.10, "hips.z": -0.40, "hips.rx": 0},
                 {**_torso((10, 0, -4), (10, 0, -6), (4, 0, 6), (14, 0, 12)), **LIMP_ARMS})


def knockdown():
    return _full_clip(KNOCKDOWN_FRAMES, [(0, _box_stance), (4, _knock_hit), (12, _buckle), (21, SITTING), (KNOCKDOWN_FRAMES, LYING)])


DOWN_FRAMES = 60


def down():
    def breathe(ph, q):
        b = math.sin(2 * math.pi * ph)
        q["chest.x"] += 1.5 * b
        q["head.x"] -= 1.0 * b
        q["head.z"] += 1.5 * math.sin(2 * math.pi * ph)
        q["L.z"] += 0.006 * b
        q["R.z"] += 0.006 * b
    return _full_clip(DOWN_FRAMES, [(0, LYING), (DOWN_FRAMES, LYING)], breathe)


GETUP_FRAMES = 36


def get_up():
    return _full_clip(GETUP_FRAMES, [(0, LYING), (10, SITTING), (20, _crouch), (28, _rising), (GETUP_FRAMES, _box_stance)])


KO_FRAMES = 42
KO_LYING = _body(_lower_pose((0.0, 0.50, -0.80, -89, 0, 6), {"L": (0.20, -0.30, 0.08, -70, -10), "R": (-0.14, -0.31, 0.08, -60, -10)}),
                 {**_torso((0, 0, 0), (0, 0, 0), (0, 0, 12), (0, 0, 26)),
                  **_arm("L", 0.60, 0.07, 1.42, 0.2, 0.0, -1, up=0), **_arm("R", -0.62, 0.07, 1.36, -0.2, 0.0, -1, up=0)})


def _ko_hit(foot):
    stance = idle_lower(0.0, foot)
    return _body({**stance, "hips.y": 0.06, "hips.rx": -6},
                 _with(GUARD_POSE, **{"head_x": -30, "neck_x": -10, "chest_x": -14, "spine_x": -6, "head_z": 10,
                                      "L_x": 0.30, "L_y": -0.05, "L_z": 1.30, "R_x": -0.30, "R_y": -0.05, "R_z": 1.28}))


def _ko_sag(foot):
    stance = idle_lower(0.0, foot)
    return _body({**stance, "hips.y": 0.14, "hips.z": -0.26, "hips.rx": -14},
                 {**_torso((-4, 0, -4), (-6, 0, -6), (-4, 0, 6), (-16, 0, 14)), **LIMP_ARMS})


def _ko_fall(foot):
    return _body(_lower_pose((0.0, 0.36, -0.68, -58, 0, 2), {"L": (0.15, -0.22, 0.09, -15, 0), "R": (-0.15, -0.10, 0.09, -10, 0)}),
                 {**_torso((-2, 0, 0), (-4, 0, 0), (-4, 0, 8), (-14, 0, 18)),
                  **_arm("L", 0.48, 0.0, 1.25, 0.2, 0.2, -1, up=0), **_arm("R", -0.48, 0.0, 1.22, -0.2, 0.2, -1, up=0)})


def _ko_bounce(foot):
    q = dict(KO_LYING)
    q.update({"hips.z": -0.77, "hips.rx": -86, "head.x": -8, "neck.x": -4})
    return q


def ko():
    return _full_clip(KO_FRAMES, [(0, _box_stance), (4, _ko_hit), (14, _ko_sag), (26, _ko_fall), (33, KO_LYING), (37, _ko_bounce), (KO_FRAMES, KO_LYING)])


WIN_FRAMES = 60
WIN_FEET = {".L": (0.13, -0.03), ".R": (-0.13, 0.03)}
WIN_POSE = {**_torso((-3, 0, 0), (-6, 0, 0), (-4, 0, 0), (-12, 0, 0)),
            **_arm("L", 0.30, -0.06, 2.02, 1.0, 0.3, 0.0, up=12), **_arm("R", -0.30, -0.06, 2.02, -1.0, 0.3, 0.0, up=12)}


def win():
    def f(ph, P):
        foot = _foot(P)
        a = 4 * math.pi * ph
        heel = 10 * (1 - math.cos(a)) / 2
        P.move("Hips", 0, 0, -0.03 - 0.02 * math.cos(a))
        P.rz("Hips", 6 * math.sin(2 * math.pi * ph))
        for side, k, sgn in BOX_SIDES:
            x, y0 = WIN_FEET[side]
            y, z = _on_ball(y0, heel, foot)
            leg_ik(P, side, (x, y, z), heel)
        q = dict(WIN_POSE)
        pump = math.cos(a - 0.6)
        q["L.z"] += 0.05 * pump
        q["R.z"] += 0.05 * pump
        q["chest.z"] -= 6 * math.sin(2 * math.pi * ph)
        q["head.z"] -= 4 * math.sin(2 * math.pi * ph)
        q["head.x"] -= 3 * pump
        upper(P, q)
    return f


def boxing_clips():
    return {
        "BoxIdle": (30, box_idle()),
        "BoxStep": (30, box_step()),
        "Guard": (30, box_idle()),
        "Block": (30, block()),
        "Jab": (JAB_FRAMES, jab()),
        "Cross": (CROSS_FRAMES, cross()),
        "Hook": (HOOK_FRAMES, hook()),
        "DodgeL": (DODGE_FRAMES, dodge(1)),
        "DodgeR": (DODGE_FRAMES, dodge(-1)),
        "HitReact": (HIT_FRAMES, hit_react()),
        "Knockdown": (KNOCKDOWN_FRAMES, knockdown()),
        "Down": (DOWN_FRAMES, down()),
        "GetUp": (GETUP_FRAMES, get_up()),
        "KO": (KO_FRAMES, ko()),
        "Win": (WIN_FRAMES, win()),
    }
