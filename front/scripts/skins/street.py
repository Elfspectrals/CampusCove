if "SKINS_DIR" not in globals():
    raise RuntimeError("Run these scripts through run.py (blender --background --python front/scripts/skins/run.py): they share state via exec().")

SP_ = SKINS_DIR
exec(open(SP_ + "base.py", encoding="utf8").read())

def baffle(nb, lo=0.93):
    return lambda t: lo + (1 - lo) * abs(math.sin(math.pi * nb * t)) ** 0.7


def build_street_luxe(coll):
    skin = mat("SL_skin", "b97a56", rough=0.55)
    puff = mat("SL_puffer", "d2b87f", metal=0.55, rough=0.3, coat=0.5)
    tech = mat("SL_tech", "24252e", rough=0.6)
    gold = mat("SL_gold", "ffc53a", metal=1.0, rough=0.2)
    champ = mat("SL_champagne", "eadcb4", metal=0.7, rough=0.3)
    white = mat("SL_white", "efede8", rough=0.4, coat=0.35)
    cream = mat("SL_cream", "e7e0cf", rough=0.8)
    lens = mat("SL_lens", "f4c95e", metal=1.0, rough=0.05)
    knit = mat("SL_knit", "17171c", rough=0.95)
    burg = mat("SL_burgundy", "5d1226", rough=0.55)
    chrome = mat("SL_chrome", "dfe3ea", metal=1.0, rough=0.12)

    G = {}
    # ---------------------------------------------------------- body base
    B = Mesh("body")
    body(B, skin, under=tech)
    add_ellipsoid(B, tech, (0, 0, 0.93), (0.165, 0.115, 0.1), seg=16, rings=9)
    for sg in (1, -1):
        add_ellipsoid(B, tech, (0.19 * sg, 0, 1.49), (0.06, 0.062, 0.062), seg=10, rings=7)
        add_ellipsoid(B, tech, (0.09 * sg, 0, 0.95), (0.098, 0.1, 0.1), seg=10, rings=7)
        # nose
    add_ellipsoid(B, skin, (0, -0.1, 1.72), (0.014, 0.02, 0.026), seg=8, rings=6)
    G['body'] = (B, ('auto', None, 0.055))

    # ---------------------------------------------------------- puffer jacket
    J = Mesh("jacket")
    add_sweep(J, puff, [(0, 0, 1.04), (0, 0, 1.18), (0, 0, 1.32), (0, 0, 1.46), (0, 0, 1.56)],
              [(0.2, 0.152), (0.222, 0.162), (0.23, 0.165), (0.228, 0.155), (0.15, 0.125)], seg=24, per=6, power=2.3, mod=baffle(6, 0.93))
    add_sweep(J, tech, [(0, 0, 1.025), (0, 0, 1.07)], [(0.2, 0.152), (0.202, 0.154)], seg=24, per=1, power=2.3)  # hem rib
    add_sweep(J, puff, [(0, 0, 1.52), (0, 0, 1.585), (0, 0, 1.65)], [(0.118, 0.11), (0.114, 0.106), (0.1, 0.095)], seg=20, per=4, power=2.2, mod=baffle(2, 0.92))
    # zipper + pulls + logo
    add_sweep(J, gold, [(0, -0.147, 1.055), (0, -0.168, 1.30), (0, -0.152, 1.57)], [(0.006, 0.006), (0.006, 0.007), (0.006, 0.006)], seg=6, per=4)
    add_box(J, gold, (0, -0.176, 1.50), (0.014, 0.006, 0.03), bevel=0.003)
    add_cyl(J, gold, (0.098, -0.168, 1.43), (0.098, -0.178, 1.43), 0.026, 0.026, seg=6)
    add_cyl(J, burg, (0.098, -0.178, 1.43), (0.098, -0.181, 1.43), 0.018, 0.018, seg=6)
    for sg in (1, -1):
        add_box(J, gold, S((0.14, -0.15, 1.15), sg), (0.05, 0.006, 0.006), rot=(0, 0, 0.55 * sg), bevel=0.0)  # pocket zip
        add_cyl(J, gold, S((0.215, 0.0, 1.07), sg), S((0.215, 0.0, 1.02), sg), 0.007, 0.007, seg=6)  # drawstring end
        # sleeves with baffles
        add_sweep(J, puff, SP([(0.16, 0, 1.51), (0.25, 0, 1.40), (0.34, 0, 1.22), (0.395, 0, 1.10), (0.43, 0, 0.99)], sg),
                  [(0.088, 0.09), (0.084, 0.086), (0.076, 0.078), (0.07, 0.072), (0.052, 0.054)], seg=16, per=5, power=2.2, mod=baffle(5, 0.93))
        add_sweep(J, tech, SP([(0.425, 0, 1.0), (0.43, 0, 0.965)], sg), [(0.05, 0.052), (0.044, 0.046)], seg=14, per=1)  # cuff
        add_sweep(J, gold, SP([(0.428, 0, 0.963), (0.43, 0, 0.955)], sg), [(0.046, 0.048), (0.046, 0.048)], seg=14, per=1)
        # watch / bracelet
        add_sweep(J, gold, SP([(0.436, 0, 0.945), (0.439, 0, 0.925)], sg), [(0.036, 0.04), (0.036, 0.04)], seg=14, per=1)
        add_box(J, chrome, S((0.4, -0.04, 0.935), sg), (0.032, 0.028, 0.034), rot=(0, -0.22 * sg, 0), bevel=0.006)
    G['jacket'] = (J, ('auto', ['Hips', 'Spine', 'Chest', 'Neck', 'Shoulder.L', 'Shoulder.R', 'UpperArm.L', 'UpperArm.R', 'LowerArm.L', 'LowerArm.R', 'Hand.L', 'Hand.R'], 0.075))

    # ---------------------------------------------------------- cargo pants + sneakers
    L = Mesh("legs")
    for sg in (1, -1):
        add_sweep(L, tech, SP([(0.10, 0, 0.99), (0.10, 0, 0.72), (0.10, -0.005, 0.50), (0.10, 0.0, 0.34), (0.10, 0.01, 0.235)], sg),
                  [(0.118, 0.122), (0.112, 0.118), (0.098, 0.104), (0.088, 0.096), (0.074, 0.082)], seg=18, per=4, power=2.2)
        add_sweep(L, knit, SP([(0.10, 0.01, 0.24), (0.10, 0.012, 0.19)], sg), [(0.074, 0.082), (0.068, 0.078)], seg=18, per=1)
        # side stripe (gold) on back-outer seam
        add_sweep(L, gold, SP([(0.10 + 0.118 * 0.9 + 0.004, 0.05, 0.97), (0.10 + 0.112 * 0.9 + 0.004, 0.05, 0.72), (0.10 + 0.098 * 0.9 + 0.004, 0.045, 0.50), (0.10 + 0.088 * 0.9 + 0.004, 0.05, 0.30), (0.10 + 0.074 * 0.9 + 0.004, 0.055, 0.24)], sg),
                  [(0.004, 0.013)] * 5, seg=6, per=3)
        # cargo pocket
        add_box(L, tech, S((0.205, -0.045, 0.74), sg), (0.045, 0.125, 0.17), rot=(0, 0, 0.0), bevel=0.014, seg=3)
        add_box(L, tech, S((0.226, -0.045, 0.795), sg), (0.03, 0.13, 0.05), bevel=0.008)
        add_cyl(L, gold, S((0.236, -0.045, 0.775), sg), S((0.246, -0.045, 0.775), sg), 0.011, 0.011, seg=8)
        # knee strap + buckle
        add_sweep(L, tech, SP([(0.10, -0.005, 0.552), (0.10, -0.005, 0.51)], sg), [(0.1, 0.107), (0.1, 0.107)], seg=18, per=1)
        add_box(L, gold, S((0.10, -0.108, 0.531), sg), (0.034, 0.012, 0.03), bevel=0.004)
        # sneakers  (vertical, width) radii
        rubber = mat("SL_rubber", "16161a", rough=0.8)
        add_box(L, white, S((0.10, -0.06, 0.036), sg), (0.116, 0.30, 0.058), bevel=0.022, seg=3)
        add_box(L, rubber, S((0.10, -0.06, 0.007), sg), (0.112, 0.29, 0.014), bevel=0.005)
        add_box(L, burg, S((0.10, -0.06, 0.041), sg), (0.1185, 0.304, 0.008), bevel=0.0)
        add_sweep(L, white, SP([(0.10, 0.075, 0.12), (0.10, 0.0, 0.11), (0.10, -0.1, 0.088), (0.10, -0.195, 0.072)], sg),
                  [(0.066, 0.052), (0.056, 0.056), (0.045, 0.057), (0.03, 0.048)], seg=16, per=3, power=2.3)
        add_sweep(L, gold, SP([(0.10 + 0.058, 0.04, 0.115), (0.10 + 0.061, -0.04, 0.125), (0.10 + 0.059, -0.12, 0.098)], sg),
                  [(0.014, 0.0035), (0.018, 0.0035), (0.011, 0.0035)], seg=6, per=3, ref=(1, 0, 0))
        add_ellipsoid(L, champ, S((0.10, -0.18, 0.074), sg), (0.047, 0.04, 0.03), seg=12, rings=8)
        add_box(L, gold, S((0.10, 0.092, 0.165), sg), (0.042, 0.012, 0.05), bevel=0.004)
        add_box(L, champ, S((0.10, -0.045, 0.17), sg), (0.048, 0.06, 0.012), rot=(0.35, 0, 0), bevel=0.004)  # tongue
        for i in range(3):
            add_box(L, champ, S((0.10, -0.075 - 0.024 * i, 0.152 - 0.016 * i), sg), (0.076, 0.008, 0.008), bevel=0.0)  # laces
    G['legs'] = (L, ('auto', None, 0.075))

    # ---------------------------------------------------------- head gear
    H = Mesh("head")
    # beanie + cuff
    add_ellipsoid(H, knit, (0, 0.012, 1.795), (0.108, 0.12, 0.092), seg=24, rings=12)
    add_sweep(H, knit, [(0, 0.004, 1.752), (0, 0.004, 1.795)], [(0.112, 0.124), (0.112, 0.124)], seg=24, per=1, caps=(False, False))
    add_sweep(H, mat("SL_knit2", "26262e", rough=0.95), [(0, 0.004, 1.753), (0, 0.004, 1.788)], [(0.114, 0.126), (0.114, 0.126)], seg=24, per=1)
    add_box(H, gold, (0, -0.128, 1.768), (0.036, 0.008, 0.016), bevel=0.003)
    # shades (mirrored gold)
    arc = [(0.1 * math.sin(math.radians(a)), -0.105 * math.cos(math.radians(a)), 1.742) for a in range(-80, 81, 16)]
    add_sweep(H, lens, arc, [(0.007, 0.024)] * len(arc), seg=8, per=2, ref=(0, 0, 1), power=2.6)
    arcg = [(0.1 * math.sin(math.radians(a)), -0.105 * math.cos(math.radians(a)), 1.772) for a in range(-80, 81, 16)]
    add_sweep(H, gold, arcg, [(0.009, 0.004)] * len(arcg), seg=6, per=2, ref=(0, 0, 1))
    add_box(H, gold, (0, -0.108, 1.742), (0.014, 0.01, 0.01), bevel=0.003)
    # gaiter mask
    add_sweep(H, knit, [(0, -0.01, 1.62), (0, -0.015, 1.665), (0, -0.02, 1.715)], [(0.088, 0.096), (0.09, 0.103), (0.086, 0.1)], seg=22, per=3, power=2.1)
    add_box(H, gold, (0.05, -0.115, 1.68), (0.02, 0.006, 0.02), bevel=0.002)
    # headphones
    band = [(0.128 * math.cos(math.radians(a)), 0.0, 1.745 + 0.142 * math.sin(math.radians(a))) for a in range(-12, 193, 12)]
    add_sweep(H, gold, band, [(0.01, 0.022)] * len(band), seg=10, per=1, ref=(0, -1, 0), power=2.4)
    add_sweep(H, tech, [(p[0] * 1.0, p[1], p[2] + 0.0) for p in [(q[0] * 0.985, q[1], q[2]) for q in band]], [(0.004, 0.018)] * len(band), seg=8, per=1, ref=(0, -1, 0))
    for sg in (1, -1):
        add_cyl(H, tech, S((0.108, 0.006, 1.745), sg), S((0.148, 0.006, 1.745), sg), 0.054, 0.054, seg=22, sx=1.0)
        add_cyl(H, gold, S((0.148, 0.006, 1.745), sg), S((0.158, 0.006, 1.745), sg), 0.046, 0.046, seg=22)
        add_cyl(H, burg, S((0.158, 0.006, 1.745), sg), S((0.162, 0.006, 1.745), sg), 0.034, 0.034, seg=22)
        add_sweep(H, gold, SP([(0.124, 0.0, 1.745), (0.126, 0.0, 1.8)], sg), [(0.01, 0.02), (0.012, 0.02)], seg=8, per=1, ref=(0, -1, 0))
    G['head'] = (H, ('rigid', 'Head'))

    # ---------------------------------------------------------- chain, pendant, bag
    C = Mesh("chain")
    n = 34
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        fr = max(0.0, -math.sin(a))
        pts.append(V((0.17 * math.cos(a), 0.15 * math.sin(a) - 0.05 * fr, 1.60 - 0.2 * fr ** 1.5)))
    for i, p in enumerate(pts):
        nxt = pts[(i + 1) % n] - pts[i - 1]
        d = nxt.normalized()
        rot = d.to_track_quat('X', 'Z').to_euler()
        add_ellipsoid(C, gold, tuple(p), (0.017, 0.0105, 0.012) if i % 2 == 0 else (0.017, 0.012, 0.0105), rot=tuple(rot), seg=8, rings=5)
    G['chain'] = (C, ('rigid', 'Chest'))
    Pn = Mesh("pendant")
    add_cyl(Pn, gold, (0, -0.19, 1.40), (0, -0.204, 1.40), 0.046, 0.046, seg=6)
    add_cyl(Pn, burg, (0, -0.204, 1.40), (0, -0.208, 1.40), 0.033, 0.033, seg=6)
    add_ellipsoid(Pn, chrome, (0, -0.21, 1.40), (0.015, 0.004, 0.015), seg=8, rings=5)
    add_ellipsoid(Pn, gold, (0, -0.185, 1.46), (0.012, 0.008, 0.016), seg=8, rings=5)
    G['pendant'] = (Pn, ('rigid', 'Pend'))

    Bg = Mesh("bag")
    strap = [(-0.14, 0.02, 1.58), (-0.12, -0.15, 1.46), (-0.02, -0.19, 1.30), (0.1, -0.18, 1.14), (0.2, -0.1, 1.0)]
    add_sweep(Bg, tech, strap, [(0.017, 0.008)] * 5, seg=8, per=5, ref=(0, -1, 0), power=2.4)
    add_box(Bg, tech, (0.215, -0.07, 0.96), (0.06, 0.1, 0.13), rot=(0, 0, 0.1), bevel=0.016, seg=3)
    add_box(Bg, gold, (0.246, -0.07, 0.99), (0.006, 0.07, 0.01), bevel=0.0)
    add_cyl(Bg, gold, (0.248, -0.04, 0.95), (0.256, -0.04, 0.95), 0.012, 0.012, seg=8)
    G['bag'] = (Bg, ('auto', ['Hips', 'Spine', 'Chest'], 0.1))
    return G


SL_EXTRA = {
    'Pend': ((0, -0.172, 1.45), (0, -0.18, 1.34), 'Chest'),
}
