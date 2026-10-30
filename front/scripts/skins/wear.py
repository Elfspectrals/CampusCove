if "SKINS_DIR" not in globals():
    raise RuntimeError("Run these scripts through run_wear.py (blender --background --python front/scripts/skins/run_wear.py): they share state via exec().")

from mathutils.kdtree import KDTree

HEAD_C = (0, -0.012, 1.745)
HEAD_R = (0.088, 0.098, 0.115)


def piece_mats(slot, key, main, accent, extra=None):
    p = "W_%s_%s_" % (slot, key)
    out = {"main": mat(p + "Main", main, rough=0.8), "accent": mat(p + "Accent", accent, rough=0.6)}
    for name, spec in (extra or {}).items():
        out[name] = mat(p + name.capitalize(), **spec)
    return out


def add_cap(M, m, radii, front_z, back_z, center=HEAD_C, seg=20, rings=12, lift=0.0):
    bm = M.bm
    old = set(bm.faces)
    r = bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    verts = r['verts']
    _xf(bm, verts, loc=(center[0], center[1], center[2] + lift), scale=radii)
    cy0, cy1 = center[1] - radii[1], center[1] + radii[1]
    drop = []
    for v in verts:
        t = (v.co.y - cy0) / (cy1 - cy0)
        if v.co.z < front_z + (back_z - front_z) * t:
            drop.append(v)
    bmesh.ops.delete(bm, geom=drop, context='VERTS')
    for f in _new_faces(bm, old):
        f.material_index = M.mi(m)
    return M


def hair_cap(M, m, puff=0.008, front_z=1.795, back_z=1.66):
    add_cap(M, m, (HEAD_R[0] + puff, HEAD_R[1] + puff, HEAD_R[2] + puff * 0.6), front_z, back_z)
    for sg in (1, -1):
        add_box(M, m, S((0.086, -0.035, 1.735), sg), (0.016, 0.04, 0.07), bevel=0.008)


def build_hair(key, M, m):
    if key in ("basic", "short"):
        hair_cap(M, m["main"], puff=0.012 if key == "short" else 0.009)
        if key == "short":
            add_ellipsoid(M, m["main"], (0.02, -0.08, 1.82), (0.06, 0.035, 0.03), rot=(0.3, 0, -0.2), seg=10, rings=6)
    elif key == "buzz":
        hair_cap(M, m["main"], puff=0.004, front_z=1.80, back_z=1.68)
    elif key == "long":
        hair_cap(M, m["main"], puff=0.012)
        add_sweep(M, m["main"], [(0, 0.06, 1.80), (0, 0.075, 1.70), (0, 0.07, 1.60), (0, 0.06, 1.52)],
                  [(0.105, 0.04), (0.11, 0.045), (0.1, 0.04), (0.085, 0.03)], seg=14, per=3)
        for sg in (1, -1):
            add_sweep(M, m["main"], SP([(0.088, -0.03, 1.79), (0.098, -0.02, 1.70), (0.094, -0.005, 1.60)], sg),
                      [(0.018, 0.035), (0.02, 0.035), (0.014, 0.028)], seg=10, per=2)
    elif key == "curly":
        hair_cap(M, m["main"], puff=0.01)
        rnd = random.Random(7)
        for i in range(26):
            a = 2 * PI * i / 13 + (0.3 if i >= 13 else 0.0)
            el = 0.35 if i < 13 else 0.9
            x = HEAD_C[0] + math.cos(a) * math.cos(el) * 0.095
            y = HEAD_C[1] + math.sin(a) * math.cos(el) * 0.105
            z = HEAD_C[2] + 0.04 + math.sin(el) * 0.085
            if y < -0.07 and z < 1.82:
                continue
            rr = 0.032 + rnd.random() * 0.01
            add_ellipsoid(M, m["main"], (x, y, z), (rr, rr, rr), seg=8, rings=6)
    elif key == "ponytail":
        hair_cap(M, m["main"], puff=0.01)
        add_cyl(M, m["accent"], (0, 0.1, 1.76), (0, 0.118, 1.76), 0.022, 0.022, seg=10)
        add_sweep(M, m["main"], [(0, 0.115, 1.76), (0, 0.15, 1.70), (0, 0.15, 1.60), (0, 0.12, 1.52)],
                  [(0.03, 0.03), (0.038, 0.036), (0.03, 0.03), (0.012, 0.012)], seg=10, per=3)


def build_headset(key, M, m):
    hair_cap(M, m["hair"], puff=0.008)
    cup_x = 0.104
    band_r = 0.132 if key != "studio" else 0.124
    band = [(band_r * math.cos(math.radians(a)), 0.0, 1.745 + 0.142 * math.sin(math.radians(a))) for a in range(-10, 191, 10)]
    width = {"gamer": 0.03, "studio": 0.016, "cat_ear": 0.022, "neon": 0.024, "pilot": 0.03}[key]
    add_sweep(M, m["main"], band, [(0.012, width)] * len(band), seg=10, per=1, power=2.4)
    cup_r = {"gamer": 0.058, "studio": 0.046, "cat_ear": 0.05, "neon": 0.052, "pilot": 0.064}[key]
    for sg in (1, -1):
        add_cyl(M, m["main"], S((cup_x, 0.0, 1.745), sg), S((cup_x + 0.038, 0.0, 1.745), sg), cup_r, cup_r * 0.92, seg=20)
        add_cyl(M, m["accent"], S((cup_x + 0.038, 0.0, 1.745), sg), S((cup_x + 0.046, 0.0, 1.745), sg), cup_r * 0.7, cup_r * 0.6, seg=16)
        if key == "cat_ear":
            add_cyl(M, m["main"], S((0.07, 0.0, 1.87), sg), S((0.09, 0.0, 1.95), sg), 0.034, 0.003, seg=4)
            add_cyl(M, m["accent"], S((0.072, -0.008, 1.875), sg), S((0.088, -0.008, 1.935), sg), 0.02, 0.002, seg=4)
        if key == "neon":
            add_sweep(M, m["glow"], SP([(cup_x + 0.047, 0.0, 1.745 + cup_r * 0.75)] + [
                (cup_x + 0.047, cup_r * 0.75 * math.sin(math.radians(a)), 1.745 + cup_r * 0.75 * math.cos(math.radians(a))) for a in range(30, 361, 30)], sg),
                [(0.004, 0.004)] * 13, seg=6, per=1, ref=(1, 0, 0))
    if key in ("gamer", "pilot"):
        add_sweep(M, m["accent"], [(-cup_x - 0.03, -0.02, 1.72), (-0.11, -0.08, 1.69), (-0.06, -0.125, 1.67)],
                  [(0.006, 0.006)] * 3, seg=6, per=3)
        add_ellipsoid(M, m["main"], (-0.05, -0.128, 1.668), (0.016, 0.012, 0.012), seg=8, rings=6)


TORSO_PATH = [(0, 0, 0.97), (0, 0, 1.10), (0, 0, 1.28), (0, 0, 1.43), (0, 0, 1.52), (0, 0, 1.585)]
TORSO_R = [(0.168, 0.118), (0.158, 0.112), (0.19, 0.133), (0.212, 0.141), (0.16, 0.118), (0.085, 0.08)]
ARM_PATH = [(0.17, 0, 1.50), (0.25, 0, 1.40), (0.34, 0, 1.22), (0.395, 0, 1.10), (0.43, 0, 0.975)]
ARM_R = [(0.07, 0.074), (0.066, 0.07), (0.06, 0.064), (0.056, 0.058), (0.045, 0.048)]


def torso(M, m, hem_z=0.97, puff=1.0, power=2.0):
    pts = [p for p in TORSO_PATH if p[2] >= hem_z - 0.001]
    rs = [(r[0] * puff, r[1] * puff) for p, r in zip(TORSO_PATH, TORSO_R) if p[2] >= hem_z - 0.001]
    add_sweep(M, m, pts, rs, seg=18, per=3, power=power, caps=(False, False))


def sleeves(M, m, upto, puff=1.0, cuff=None):
    for sg in (1, -1):
        n = upto + 1
        add_sweep(M, m, SP(ARM_PATH[:n], sg), [(r[0] * puff, r[1] * puff) for r in ARM_R[:n]], seg=14, per=3, caps=(False, False))
        if cuff:
            end = ARM_PATH[upto]
            prev = ARM_PATH[upto - 1]
            d = (V(end) - V(prev)).normalized() * 0.03
            r = ARM_R[upto]
            add_sweep(M, cuff, SP([tuple(V(end) - d), end], sg), [(r[0] * puff + 0.004, r[1] * puff + 0.004)] * 2, seg=14, per=1)


def build_top(key, M, m):
    if key in ("basic", "tee"):
        torso(M, m["main"])
        sleeves(M, m["main"], 1, puff=1.12)
        add_sweep(M, m["accent"], [(0, 0, 1.565), (0, 0, 1.585)], [(0.1, 0.092), (0.088, 0.082)], seg=18, per=1)
        if key == "tee":
            add_box(M, m["accent"], (0, -0.142, 1.38), (0.1, 0.008, 0.07), bevel=0.004)
    elif key == "tank":
        torso(M, m["main"])
        for sg in (1, -1):
            add_sweep(M, m["main"], SP([(0.08, 0.0, 1.47), (0.11, 0.0, 1.55)], sg), [(0.03, 0.12), (0.025, 0.1)], seg=8, per=1)
        add_box(M, m["accent"], (0, -0.14, 1.30), (0.12, 0.008, 0.012), bevel=0.0)
    elif key == "hoodie":
        torso(M, m["main"], puff=1.08)
        sleeves(M, m["main"], 4, puff=1.12, cuff=m["accent"])
        add_sweep(M, m["accent"], [(0, 0, 0.955), (0, 0, 0.99)], [(0.18, 0.128), (0.18, 0.128)], seg=18, per=1)
        add_sweep(M, m["main"], [(0, 0.03, 1.55), (0, 0.09, 1.62), (0, 0.11, 1.70)], [(0.12, 0.06), (0.115, 0.06), (0.08, 0.04)], seg=14, per=2)
        add_box(M, m["main"], (0, -0.15, 1.16), (0.2, 0.02, 0.12), bevel=0.012)
        for sg in (1, -1):
            add_cyl(M, m["accent"], S((0.04, -0.13, 1.56), sg), S((0.045, -0.15, 1.44), sg), 0.005, 0.005, seg=6)
    elif key == "varsity":
        torso(M, m["main"], puff=1.07)
        sleeves(M, m["accent"], 4, puff=1.1, cuff=m["trim"])
        add_sweep(M, m["trim"], [(0, 0, 0.955), (0, 0, 0.99)], [(0.18, 0.127), (0.18, 0.127)], seg=18, per=1)
        add_sweep(M, m["trim"], [(0, 0, 1.55), (0, 0, 1.59)], [(0.13, 0.11), (0.1, 0.09)], seg=18, per=1)
        add_box(M, m["trim"], (0.09, -0.148, 1.40), (0.06, 0.008, 0.07), bevel=0.01)
        for i in range(5):
            add_cyl(M, m["trim"], (0, -0.15, 1.05 + i * 0.1), (0, -0.158, 1.05 + i * 0.1), 0.008, 0.008, seg=6)
    elif key == "sweater":
        torso(M, m["main"], puff=1.09, power=2.2)
        sleeves(M, m["main"], 4, puff=1.14, cuff=m["accent"])
        add_sweep(M, m["accent"], [(0, 0, 0.955), (0, 0, 1.0)], [(0.185, 0.13), (0.185, 0.13)], seg=18, per=1)
        add_sweep(M, m["accent"], [(0, 0, 1.53), (0, 0, 1.6)], [(0.13, 0.11), (0.095, 0.088)], seg=18, per=1)
        for z in (1.22, 1.30):
            add_sweep(M, m["accent"], [(0, 0, z), (0, 0, z + 0.025)], [(0.206, 0.144), (0.208, 0.145)], seg=18, per=1)

    elif key == "track_jacket":
        torso(M, m["main"], puff=1.08)
        sleeves(M, m["main"], 4, puff=1.12, cuff=m["accent"])
        add_sweep(M, m["accent"], [(0, 0, 0.955), (0, 0, 0.995)], [(0.182, 0.129), (0.182, 0.129)], seg=18, per=1)
        add_sweep(M, m["main"], [(0, 0, 1.55), (0, 0, 1.63)], [(0.105, 0.095), (0.1, 0.09)], seg=18, per=1)
        add_box(M, m["accent"], (0, -0.155, 1.27), (0.012, 0.006, 0.55), bevel=0.0)
        for sg in (1, -1):
            add_sweep(M, m["trim"], SP([(0.185, -0.004, 1.5), (0.27, -0.004, 1.39), (0.365, -0.004, 1.21), (0.42, -0.004, 1.09)], sg),
                      [(0.012, 0.085)] * 4, seg=6, per=2)
    elif key == "jersey":
        torso(M, m["main"], puff=1.04)
        sleeves(M, m["main"], 1, puff=1.14)
        for sg in (1, -1):
            add_sweep(M, m["accent"], SP([(0.17, -0.004, 1.50), (0.25, -0.004, 1.40)], sg), [(0.074, 0.078), (0.07, 0.074)], seg=14, per=1)
        add_sweep(M, m["accent"], [(0, 0, 1.56), (0, 0, 1.59)], [(0.1, 0.092), (0.088, 0.082)], seg=18, per=1)
        add_box(M, m["accent"], (0, -0.142, 1.1), (0.21, 0.006, 0.03), bevel=0.0)
        add_box(M, m["accent"], (0, -0.147, 1.33), (0.08, 0.006, 0.1), bevel=0.004)
    elif key == "sports_bra":
        torso(M, m["main"], hem_z=1.28, puff=1.0)
        for sg in (1, -1):
            add_sweep(M, m["main"], SP([(0.08, 0.0, 1.47), (0.11, 0.0, 1.55)], sg), [(0.028, 0.11), (0.024, 0.09)], seg=8, per=1)
        add_sweep(M, m["accent"], [(0, 0, 1.275), (0, 0, 1.30)], [(0.192, 0.135), (0.19, 0.134)], seg=18, per=1)


LEG_PATH = [(0.10, 0, 0.93), (0.10, 0, 0.72), (0.10, -0.005, 0.50), (0.10, 0.003, 0.30), (0.10, 0.01, 0.11)]
LEG_R = [(0.096, 0.1), (0.088, 0.093), (0.072, 0.075), (0.068, 0.075), (0.058, 0.062)]


def waist(M, m, puff=1.0):
    add_sweep(M, m, [(0, 0, 0.84), (0, 0, 0.90), (0, 0, 0.98), (0, 0, 1.045)],
              [(0.14 * puff, 0.106 * puff), (0.18 * puff, 0.124 * puff), (0.178 * puff, 0.122 * puff), (0.17 * puff, 0.12 * puff)],
              seg=18, per=3, caps=(True, False))


def legs(M, m, upto, puff=1.0, flare=1.0):
    for sg in (1, -1):
        rs = [(r[0] * puff, r[1] * puff) for r in LEG_R[:upto + 1]]
        if flare != 1.0:
            rs[-1] = (rs[-1][0] * flare, rs[-1][1] * flare)
        add_sweep(M, m, SP(LEG_PATH[:upto + 1], sg), rs, seg=14, per=3, caps=(False, False))


def build_bottom(key, M, m):
    if key in ("basic", "jeans"):
        waist(M, m["main"])
        legs(M, m["main"], 4)
        add_sweep(M, m["accent"], [(0, 0, 1.02), (0, 0, 1.05)], [(0.172, 0.121), (0.172, 0.121)], seg=18, per=1)
        if key == "jeans":
            for sg in (1, -1):
                add_box(M, m["accent"], S((0.09, 0.12, 0.93), sg), (0.07, 0.008, 0.07), bevel=0.006)
    elif key == "joggers":
        waist(M, m["main"])
        legs(M, m["main"], 4, puff=1.05)
        for sg in (1, -1):
            add_sweep(M, m["accent"], SP([(0.10, 0.01, 0.15), (0.10, 0.01, 0.11)], sg), [(0.05, 0.054), (0.05, 0.054)], seg=14, per=1)
            add_sweep(M, m["accent"], SP([(0.10 + 0.094, 0, 0.92), (0.10 + 0.086, 0, 0.72), (0.10 + 0.07, -0.005, 0.50), (0.10 + 0.066, 0.003, 0.30)], sg),
                      [(0.004, 0.01)] * 4, seg=6, per=2)
        add_sweep(M, m["accent"], [(0, 0, 1.0), (0, 0, 1.05)], [(0.174, 0.123), (0.174, 0.123)], seg=18, per=1)
    elif key == "cargo":
        waist(M, m["main"], puff=1.03)
        legs(M, m["main"], 4, puff=1.1)
        for sg in (1, -1):
            add_box(M, m["accent"], S((0.205, -0.02, 0.66), sg), (0.04, 0.12, 0.15), bevel=0.012)
            add_box(M, m["accent"], S((0.224, -0.02, 0.715), sg), (0.026, 0.125, 0.045), bevel=0.006)
    elif key == "shorts":
        waist(M, m["main"])
        legs(M, m["main"], 2, puff=1.12)
        add_sweep(M, m["accent"], [(0, 0, 1.02), (0, 0, 1.05)], [(0.172, 0.121), (0.172, 0.121)], seg=18, per=1)
    elif key == "skirt":
        waist(M, m["main"])
        add_sweep(M, m["main"], [(0, 0, 1.0), (0, 0, 0.86), (0, 0, 0.74), (0, 0, 0.64)],
                  [(0.18, 0.125), (0.23, 0.17), (0.27, 0.21), (0.29, 0.23)], seg=22, per=3, caps=(False, False))
        add_sweep(M, m["accent"], [(0, 0, 1.0), (0, 0, 1.045)], [(0.176, 0.124), (0.172, 0.121)], seg=18, per=1)

    elif key == "track_pants":
        waist(M, m["main"])
        legs(M, m["main"], 4, puff=1.06)
        for sg in (1, -1):
            add_sweep(M, m["accent"], SP([(0.10, 0.01, 0.15), (0.10, 0.01, 0.11)], sg), [(0.052, 0.056), (0.052, 0.056)], seg=14, per=1)
            add_sweep(M, m["accent"], SP([(0.10 + 0.095, 0, 0.92), (0.10 + 0.088, 0, 0.72), (0.10 + 0.072, -0.005, 0.50), (0.10 + 0.068, 0.003, 0.30), (0.10 + 0.06, 0.01, 0.12)], sg),
                      [(0.006, 0.014)] * 5, seg=6, per=2)
        add_sweep(M, m["accent"], [(0, 0, 1.0), (0, 0, 1.05)], [(0.174, 0.123), (0.174, 0.123)], seg=18, per=1)
    elif key == "basketball_shorts":
        waist(M, m["main"], puff=1.02)
        legs(M, m["main"], 2, puff=1.2)
        for sg in (1, -1):
            add_box(M, m["accent"], S((0.205, 0.0, 0.62), sg), (0.016, 0.06, 0.26), bevel=0.004)
        add_sweep(M, m["accent"], [(0, 0, 1.02), (0, 0, 1.05)], [(0.176, 0.124), (0.176, 0.124)], seg=18, per=1)
    elif key == "leggings":
        waist(M, m["main"], puff=0.98)
        legs(M, m["main"], 4, puff=0.98)
        add_sweep(M, m["accent"], [(0, 0, 0.98), (0, 0, 1.06)], [(0.172, 0.121), (0.168, 0.118)], seg=18, per=1)
        for sg in (1, -1):
            add_sweep(M, m["accent"], SP([(0.10 + 0.08, -0.01, 0.6), (0.10 + 0.07, -0.01, 0.45)], sg), [(0.01, 0.02), (0.01, 0.02)], seg=6, per=1)


def shoe(M, m, sg, collar_z=0.11, sole_h=0.03, toe_cap=False, slide=False):
    if slide:
        add_box(M, m["accent"], S((0.10, -0.06, 0.012), sg), (0.1, 0.28, 0.024), bevel=0.008)
        add_box(M, m["main"], S((0.10, -0.08, 0.05), sg), (0.104, 0.09, 0.05), bevel=0.016)
        return
    add_box(M, m["accent"], S((0.10, -0.06, sole_h / 2), sg), (0.1, 0.3, sole_h), bevel=0.008)
    add_sweep(M, m["main"], SP([(0.10, 0.05, sole_h + 0.02), (0.10, -0.04, sole_h + 0.03), (0.10, -0.13, sole_h + 0.02), (0.10, -0.2, sole_h + 0.006)], sg),
              [(0.05, 0.05), (0.052, 0.05), (0.048, 0.036), (0.03, 0.018)], seg=14, per=2)
    add_sweep(M, m["main"], SP([(0.10, 0.012, sole_h + 0.01), (0.10, 0.012, collar_z)], sg), [(0.05, 0.056), (0.047, 0.052)], seg=14, per=1)
    if toe_cap:
        add_ellipsoid(M, m["accent"], S((0.10, -0.18, sole_h + 0.015), sg), (0.046, 0.036, 0.026), seg=10, rings=6)


def build_shoes(key, M, m):
    for sg in (1, -1):
        if key in ("basic", "sneakers"):
            shoe(M, m, sg, toe_cap=key == "sneakers")
            if key == "sneakers":
                add_box(M, m["accent"], S((0.152, -0.06, 0.07), sg), (0.006, 0.12, 0.018), bevel=0.002)
        elif key == "high_tops":
            shoe(M, m, sg, collar_z=0.2, toe_cap=True)
            add_sweep(M, m["accent"], SP([(0.10, 0.012, 0.17), (0.10, 0.012, 0.2)], sg), [(0.05, 0.056), (0.05, 0.056)], seg=14, per=1)
        elif key == "boots":
            shoe(M, m, sg, collar_z=0.26, sole_h=0.04)
            add_sweep(M, m["accent"], SP([(0.10, 0.012, 0.23), (0.10, 0.012, 0.26)], sg), [(0.052, 0.058), (0.052, 0.058)], seg=14, per=1)
        elif key == "slides":
            shoe(M, m, sg, slide=True)
        elif key == "runners":
            shoe(M, m, sg, sole_h=0.045, toe_cap=True)
            add_sweep(M, m["accent"], SP([(0.10 + 0.052, 0.04, 0.08), (0.10 + 0.054, -0.04, 0.09), (0.10 + 0.05, -0.12, 0.07)], sg),
                      [(0.004, 0.012)] * 3, seg=6, per=2, ref=(1, 0, 0))


TOP_BONES = ['Hips', 'Spine', 'Chest', 'Neck', 'Shoulder.L', 'Shoulder.R', 'UpperArm.L', 'UpperArm.R', 'LowerArm.L', 'LowerArm.R', 'Hand.L', 'Hand.R']

WEAR = {
    "hair": dict(builder=build_hair, rigid="Head", items={
        "basic": dict(main="4a3426", accent="2e2018", hides=[]),
        "short": dict(main="2e2018", accent="1d140f", hides=[]),
        "long": dict(main="7a4a2a", accent="553220", hides=[]),
        "curly": dict(main="1f1a18", accent="120f0e", hides=[]),
        "buzz": dict(main="c9a067", accent="9c7a4c", hides=[]),
        "ponytail": dict(main="d8b26b", accent="d0534f", hides=[]),
    }),
    "head_accessory": dict(builder=build_headset, rigid="Head", items={
        "gamer": dict(main="26272e", accent="5bd17a", hides=[]),
        "studio": dict(main="efede8", accent="9a9ca4", hides=[]),
        "cat_ear": dict(main="f4b3c8", accent="fbe3ea", hides=[]),
        "neon": dict(main="1c1b2a", accent="2e2b4a", extra={"glow": dict(color="6ff3ff", rough=0.3, emit="6ff3ff", estr=1.0)}, hides=[]),
        "pilot": dict(main="5c6340", accent="2a2c22", hides=[]),
    }),
    "top": dict(builder=build_top, bones=TOP_BONES, items={
        "basic": dict(main="6f8fb8", accent="5a789c", hides=["chest"]),
        "tee": dict(main="f2f0ea", accent="e0534f", hides=["chest"]),
        "tank": dict(main="2f6f63", accent="f2f0ea", hides=["chest"]),
        "hoodie": dict(main="8a7ab8", accent="6d5f99", hides=["chest", "upper_arms", "forearms"]),
        "varsity": dict(main="2b3a67", accent="f0e6cf", extra={"trim": dict(color="c9a23f", rough=0.6)}, hides=["chest", "upper_arms", "forearms"]),
        "sweater": dict(main="e7c98f", accent="c79f5d", hides=["chest", "upper_arms", "forearms"]),
        "track_jacket": dict(main="1f2a5a", accent="f2f0ea", extra={"trim": dict(color="f0b429", rough=0.6)}, hides=["chest", "upper_arms", "forearms"]),
        "jersey": dict(main="2fa17a", accent="f2f0ea", hides=["chest"]),
        "sports_bra": dict(main="e0534f", accent="1f2230", hides=["chest"]),
    }),
    "bottom": dict(builder=build_bottom, bones=['Hips', 'Spine', 'UpperLeg.L', 'UpperLeg.R', 'LowerLeg.L', 'LowerLeg.R'], items={
        "basic": dict(main="4b5669", accent="3a4352", hides=["hips", "thighs", "shins"]),
        "jeans": dict(main="4d6fa3", accent="3b5784", hides=["hips", "thighs", "shins"]),
        "joggers": dict(main="5a5f68", accent="f2f0ea", hides=["hips", "thighs", "shins"]),
        "cargo": dict(main="6b6a45", accent="5a5938", hides=["hips", "thighs", "shins"]),
        "shorts": dict(main="c46b4f", accent="a5573f", hides=["hips", "thighs"]),
        "skirt": dict(main="b0436a", accent="8e3456", hides=["hips"]),
        "track_pants": dict(main="1f2a5a", accent="f0b429", hides=["hips", "thighs", "shins"]),
        "basketball_shorts": dict(main="f0b429", accent="1f2230", hides=["hips", "thighs"]),
        "leggings": dict(main="2a2c33", accent="b73cc9", hides=["hips", "thighs", "shins"]),
    }),
    "shoes": dict(builder=build_shoes, bones=['LowerLeg.L', 'LowerLeg.R', 'Foot.L', 'Foot.R', 'Toe.L', 'Toe.R'], items={
        "basic": dict(main="e9e6df", accent="9a9ca4", hides=["feet"]),
        "sneakers": dict(main="f4f2ec", accent="e0534f", hides=["feet"]),
        "high_tops": dict(main="1f2230", accent="f4f2ec", hides=["feet"]),
        "boots": dict(main="6b4a30", accent="3a2a1d", hides=["feet"]),
        "slides": dict(main="2f6f63", accent="ece8de", hides=[]),
        "runners": dict(main="ff9a3c", accent="2a2c33", hides=["feet"]),
    }),
}


def weight_from_body(ob, body_objs, bones):
    body_objs = [o for o in body_objs if any(vg.name in bones for vg in o.vertex_groups)]
    pts = []
    for o in body_objs:
        names = {vg.index: vg.name for vg in o.vertex_groups}
        for v in o.data.vertices:
            ws = [(names[g.group], g.weight) for g in v.groups if names[g.group] in bones and g.weight > 1e-4]
            if ws:
                pts.append((v.co.copy(), ws))
    tree = KDTree(len(pts))
    for i, (co, _) in enumerate(pts):
        tree.insert(co, i)
    tree.balance()
    vg = {n: ob.vertex_groups.new(name=n) for n in bones}
    for v in ob.data.vertices:
        acc = {}
        near = tree.find_n(v.co, 4)
        total = 0.0
        for co, i, d in near:
            k = 1.0 / max(d, 1e-4)
            total += k
            for n, w in pts[i][1]:
                acc[n] = acc.get(n, 0.0) + w * k
        s = sum(acc.values()) or 1.0
        for n, w in acc.items():
            vg[n].add([v.index], w / s, 'REPLACE')


def build_piece(slot, key, coll, arm, body_objs):
    spec = WEAR[slot]
    item = spec["items"][key]
    m = piece_mats(slot, key, item["main"], item["accent"], item.get("extra"))
    if slot == "head_accessory":
        m["hair"] = mat("W_head_accessory_%s_Hair" % key, "2e2018", rough=0.8)
    M = Mesh("Wear_%s_%s" % (slot, key))
    spec["builder"](key, M, m)
    ob = M.finish(coll)
    if "rigid" in spec:
        weight_rigid(ob, spec["rigid"])
    else:
        weight_from_body(ob, body_objs, spec["bones"])
    bind(ob, arm)
    ob["slot"] = slot
    ob["hides"] = ",".join(item["hides"])
    return ob


def export_piece_glb(path, objs, animations):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_apply=False, export_yup=True,
        export_animations=animations, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
        export_skins=True, export_materials='EXPORT', export_extras=True,
        export_cameras=False, export_lights=False, use_active_scene=True,
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14, export_draco_normal_quantization=10)
