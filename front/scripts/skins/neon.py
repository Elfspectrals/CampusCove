SP_ = SKINS_DIR
exec(open(SP_ + "base.py", encoding="utf8").read())

def build_neon_ronin(coll):
    suit = mat("NR_suit", "0f121b", metal=0.3, rough=0.45)
    armor = mat("NR_armor", "2b323f", metal=0.95, rough=0.28, coat=0.5)
    lacq = mat("NR_lacquer", "eef1f8", metal=0.25, rough=0.22, coat=1.0)
    cyan = mat("NR_cyan", "00e5ff", rough=0.4, emit="00e5ff", estr=1.0)
    mag = mat("NR_magenta", "ff2bd6", rough=0.4, emit="ff2bd6", estr=1.0)
    gold = mat("NR_gold", "d8a43c", metal=1.0, rough=0.28)
    cloth = mat("NR_cloth", "2d2150", rough=0.8)
    sash = mat("NR_sash", "6e0e5e", rough=0.6)
    mask = mat("NR_mask", "3b4352", metal=0.85, rough=0.3, coat=0.6)
    leather = mat("NR_leather", "1d1411", rough=0.6)
    glass = mat("NR_visor", "05070b", metal=0.0, rough=0.08, coat=1.0)

    G = {}  # name -> (Mesh, ('rigid',bone) | ('auto',[bones],sigma))
    def grp(name):
        M = Mesh(name)
        return M

    # ---------------------------------------------------------- body (suit)
    B = Mesh("body")
    body(B, suit, under=suit)
    # pelvis + shoulder volumes to hide seams
    add_ellipsoid(B, suit, (0, 0, 0.93), (0.165, 0.115, 0.1), seg=16, rings=9)
    for sg in (1, -1):
        add_ellipsoid(B, suit, (0.19 * sg, 0, 1.49), (0.06, 0.062, 0.062), seg=10, rings=7)
        add_ellipsoid(B, suit, (0.09 * sg, 0, 0.95), (0.098, 0.1, 0.1), seg=10, rings=7)
    G['body'] = (B, ('auto', None, 0.055))

    # ---------------------------------------------------------- trousers + boots + greaves
    L = Mesh("legs")
    for sg in (1, -1):
        add_sweep(L, cloth, SP([(0.10, 0, 0.96), (0.10, 0, 0.72), (0.10, -0.005, 0.50), (0.10, 0.0, 0.38)], sg),
                  [(0.108, 0.114), (0.095, 0.102), (0.078, 0.084), (0.076, 0.084)], seg=16, per=3, power=2.3)
        # cyan outer seam
        add_sweep(L, cyan, SP([(0.20, 0.0, 0.93), (0.186, 0.0, 0.72), (0.171, -0.005, 0.50), (0.169, 0.0, 0.40)], sg),
                  [(0.004, 0.006), (0.004, 0.006), (0.004, 0.006), (0.004, 0.006)], seg=6, per=3)
        # thigh armor plate (front) + knee guard
        add_sweep(L, lacq, SP([(0.10, -0.108, 0.88), (0.10, -0.108, 0.66), (0.10, -0.095, 0.54)], sg),
                  [(0.062, 0.012), (0.058, 0.012), (0.05, 0.012)], seg=10, per=3, power=2.6, ref=(0, -1, 0))
        add_ellipsoid(L, armor, S((0.10, -0.088, 0.505), sg), (0.05, 0.02, 0.06), rot=(-0.15, 0, 0), seg=14, rings=9)
        add_box(L, lacq, S((0.10, -0.09, 0.45), sg), (0.07, 0.022, 0.03), bevel=0.008)
        add_ellipsoid(L, gold, S((0.10, -0.1, 0.50), sg), (0.016, 0.008, 0.022), seg=8, rings=6)
        # boot shaft
        add_sweep(L, armor, SP([(0.10, 0.0, 0.43), (0.10, 0.004, 0.30), (0.10, 0.01, 0.12)], sg),
                  [(0.074, 0.08), (0.066, 0.072), (0.056, 0.062)], seg=16, per=3, power=2.2)
        add_sweep(L, lacq, SP([(0.10, -0.062, 0.40), (0.10, -0.06, 0.28), (0.10, -0.05, 0.14)], sg),
                  [(0.044, 0.012), (0.04, 0.012), (0.034, 0.012)], seg=10, per=3, power=2.8)  # shin guard
        add_sweep(L, mag, SP([(0.10, 0.0, 0.432), (0.10, 0.0, 0.434)], sg),
                  [(0.077, 0.083), (0.077, 0.083)], seg=16, per=1, power=2.2)  # glowing boot cuff
        # foot  (vertical, width) radii
        add_sweep(L, armor, SP([(0.10, 0.015, 0.075), (0.10, -0.05, 0.05), (0.10, -0.13, 0.04), (0.10, -0.19, 0.03)], sg),
                  [(0.05, 0.058), (0.047, 0.058), (0.04, 0.054), (0.028, 0.044)], seg=14, per=3, power=2.4)
        add_box(L, lacq, S((0.10, -0.05, 0.012), sg), (0.118, 0.34, 0.026), bevel=0.01)
        add_box(L, cyan, S((0.10, -0.05, 0.026), sg), (0.121, 0.30, 0.004), bevel=0.0)
        add_box(L, mag, S((0.10, 0.092, 0.07), sg), (0.05, 0.01, 0.06), bevel=0.003)  # heel light
    G['legs'] = (L, ('auto', None, 0.07))

    # ---------------------------------------------------------- torso armor
    T = Mesh("torso")
    # cuirass front/back shell
    add_sweep(T, lacq, [(0, 0, 1.15), (0, 0, 1.28), (0, 0, 1.42), (0, 0, 1.53)],
              [(0.172, 0.122), (0.198, 0.134), (0.218, 0.14), (0.19, 0.118)], seg=20, per=3, power=2.5)
    # chest core ring + core
    add_cyl(T, armor, (0, -0.136, 1.40), (0, -0.158, 1.40), 0.048, 0.048, seg=6)
    add_cyl(T, cyan, (0, -0.152, 1.40), (0, -0.164, 1.40), 0.034, 0.034, seg=6)
    for sg in (1, -1):
        # glowing chest accent lines
        add_box(T, cyan, S((0.095, -0.146, 1.40), sg), (0.085, 0.006, 0.008), rot=R((0, -0.0, 0.0), sg), bevel=0.0)
        add_box(T, cyan, S((0.13, -0.141, 1.34), sg), (0.07, 0.006, 0.008), rot=(0, 0.45 * sg, 0), bevel=0.0)
        add_box(T, cyan, S((0.12, -0.138, 1.47), sg), (0.07, 0.006, 0.008), rot=(0, -0.45 * sg, 0), bevel=0.0)
        # sloped chest plates
        add_box(T, armor, S((0.085, -0.126, 1.43), sg), (0.15, 0.03, 0.095), rot=(0.18, -0.12 * sg, -0.0), bevel=0.012, seg=3)
        add_box(T, lacq, S((0.1, -0.14, 1.335), sg), (0.13, 0.02, 0.06), rot=(0.0, 0.0, 0.0), bevel=0.008, seg=2)
    # waist lamellae
    for i, z in enumerate((1.115, 1.15)):
        add_sweep(T, lacq, [(0, 0, z), (0, 0, z + 0.03)], [(0.165, 0.118), (0.168, 0.12)], seg=20, per=1, power=2.4)
        add_sweep(T, cyan, [(0, 0, z + 0.031), (0, 0, z + 0.034)], [(0.166, 0.119), (0.166, 0.119)], seg=20, per=1, power=2.4)
    # obi sash
    add_sweep(T, sash, [(0, 0, 1.04), (0, 0, 1.108)], [(0.17, 0.122), (0.168, 0.12)], seg=20, per=1, power=2.4)
    add_box(T, gold, (0, -0.126, 1.074), (0.07, 0.016, 0.06), bevel=0.006)
    add_box(T, mag, (0, -0.136, 1.074), (0.05, 0.006, 0.04), bevel=0.002)
    # gorget collar
    add_sweep(T, lacq, [(0, 0, 1.51), (0, 0, 1.60), (0, 0, 1.655)], [(0.085, 0.082), (0.072, 0.07), (0.088, 0.085)], seg=16, per=3, power=2.3)
    add_sweep(T, cyan, [(0, 0, 1.652), (0, 0, 1.656)], [(0.089, 0.086), (0.089, 0.086)], seg=16, per=1)
    G['torso'] = (T, ('auto', ['Hips', 'Spine', 'Chest', 'Neck'], 0.09))

    # ---------------------------------------------------------- tassets
    K = Mesh("tassets")
    for sg in (1, -1):
        for i, (x, y, w) in enumerate(((0.045, -0.128, 0.034), (0.115, -0.118, 0.04), (0.172, -0.07, 0.05))):
            ang = 0.0
            if i < 2:
                add_sweep(K, lacq, [(x * sg, y, 1.045), (x * sg * 1.04, y - 0.012, 0.82)], [(w, 0.01), (w * 0.92, 0.011)],
                          seg=8, per=2, power=2.6)
                add_sweep(K, cyan, [(x * sg * 1.04, y - 0.013, 0.825), (x * sg * 1.04, y - 0.013, 0.82)],
                          [(w * 0.9, 0.004), (w * 0.9, 0.004)], seg=8, per=1)
            else:
                add_sweep(K, lacq, [(x * sg, y, 1.04), (x * sg * 1.07, y, 0.84)], [(0.012, w), (0.013, w * 0.9)],
                          seg=8, per=2, power=2.6)
                add_sweep(K, cyan, [(x * sg * 1.07 + 0.0, y, 0.845), (x * sg * 1.07, y, 0.84)], [(0.014 * 1.0, w * 0.9), (0.014, w * 0.9)],
                          seg=8, per=1)
    G['tassets'] = (K, ('auto', ['Hips', 'UpperLeg.L', 'UpperLeg.R'], 0.12))

    # ---------------------------------------------------------- pauldrons
    P = Mesh("pauldrons")
    for sg in (1, -1):
        for k in range(3):
            cx, cz = 0.20 + 0.012 * k, 1.50 - 0.04 * k
            r = 0.082 + 0.007 * k
            a0, a1 = math.radians(-35 - 6 * k), math.radians(125 - 8 * k)
            pts = [S((cx + r * math.cos(a0 + (a1 - a0) * i / 8), 0.0, cz + r * math.sin(a0 + (a1 - a0) * i / 8)), sg) for i in range(9)]
            add_sweep(P, lacq if k != 0 else armor, pts, [(0.011, 0.07 - 0.004 * k)] * 9, seg=10, per=1, power=2.6)
            if k > 0:
                for yy in (0.0715 - 0.004 * k, -(0.0715 - 0.004 * k)):
                    edge = [S((cx + (r + 0.0) * math.cos(a0 + (a1 - a0) * i / 8), yy, cz + (r + 0.0) * math.sin(a0 + (a1 - a0) * i / 8)), sg) for i in range(9)]
                    add_sweep(P, mag if k == 2 else cyan, edge, [(0.0125, 0.0032)] * 9, seg=6, per=1)
        # shoulder crest stud
        add_ellipsoid(P, gold, S((0.20, 0.0, 1.60), sg), (0.022, 0.03, 0.014), seg=8, rings=6)
    G['pauldrons'] = (P, ('auto', ['Chest', 'Shoulder.L', 'Shoulder.R', 'UpperArm.L', 'UpperArm.R'], 0.07))

    # ---------------------------------------------------------- bracers / gauntlets
    A = Mesh("arms")
    for sg in (1, -1):
        add_sweep(A, armor, SP([(0.352, 0, 1.19), (0.39, 0, 1.08), (0.425, 0, 0.985)], sg),
                  [(0.056, 0.06), (0.05, 0.054), (0.042, 0.046)], seg=14, per=3, power=2.3)
        add_sweep(A, lacq, SP([(0.368, -0.052, 1.17), (0.40, -0.05, 1.07), (0.428, -0.046, 0.99)], sg),
                  [(0.03, 0.01), (0.027, 0.01), (0.024, 0.01)], seg=8, per=3, power=2.6)
        add_sweep(A, cyan, SP([(0.357, 0, 1.18), (0.36, 0, 1.175)], sg), [(0.058, 0.062), (0.058, 0.062)], seg=14, per=1)
        add_sweep(A, mag, SP([(0.423, 0, 0.99), (0.426, 0, 0.985)], sg), [(0.044, 0.048), (0.044, 0.048)], seg=14, per=1)
        add_ellipsoid(A, armor, S((0.34, 0.012, 1.225), sg), (0.05, 0.05, 0.05), seg=12, rings=8)
        # hand guard + knuckle plates
        add_box(A, lacq, S((0.455, -0.012, 0.91), sg), (0.05, 0.075, 0.05), rot=(0, -0.2 * sg, 0), bevel=0.01)
        add_box(A, cyan, S((0.458, -0.012, 0.935), sg), (0.05, 0.01, 0.006), rot=(0, -0.2 * sg, 0), bevel=0.0)
    G['arms'] = (A, ('auto', ['UpperArm.L', 'UpperArm.R', 'LowerArm.L', 'LowerArm.R', 'Hand.L', 'Hand.R'], 0.06))

    # ---------------------------------------------------------- helmet + mask
    H = Mesh("helm")
    add_ellipsoid(H, lacq, (0, 0.01, 1.78), (0.118, 0.13, 0.108), seg=24, rings=14)
    add_sweep(H, lacq, [(0, 0.0, 1.69), (0, 0.0, 1.78)], [(0.112, 0.122), (0.118, 0.13)], seg=24, per=2, caps=(False, False))
    add_ellipsoid(H, gold, (0, -0.118, 1.858), (0.03, 0.016, 0.026), seg=10, rings=7)  # forehead emblem
    add_ellipsoid(H, mag, (0, -0.131, 1.858), (0.014, 0.006, 0.012), seg=8, rings=6)
    # mask (mempo)
    add_ellipsoid(H, mask, (0, -0.085, 1.722), (0.092, 0.054, 0.09), seg=24, rings=14)
    add_box(H, glass, (0, -0.126, 1.762), (0.158, 0.034, 0.036), bevel=0.01, seg=3)
    add_box(H, mask, (0, -0.140, 1.712), (0.014, 0.014, 0.066), bevel=0.004)
    for i in range(3):
        add_box(H, glass, (0, -0.134, 1.686 - 0.014 * i), (0.07 - 0.008 * i, 0.008, 0.008), bevel=0.0)
        add_box(H, cyan, (0, -0.1385, 1.686 - 0.014 * i), (0.056 - 0.008 * i, 0.002, 0.0025), bevel=0.0)
    for sg in (1, -1):
        add_box(H, cyan, S((0.04, -0.1435, 1.763), sg), (0.056, 0.005, 0.012), rot=(0, 0.32 * sg, 0), bevel=0.0)
        add_ellipsoid(H, lacq, S((0.108, -0.035, 1.70), sg), (0.014, 0.062, 0.066), seg=12, rings=8)  # cheek guards
        add_ellipsoid(H, cyan, S((0.1225, -0.035, 1.70), sg), (0.002, 0.03, 0.006), seg=8, rings=4)
        # ear fins
        add_sweep(H, armor, SP([(0.118, 0.01, 1.78), (0.16, 0.03, 1.83), (0.19, 0.06, 1.89)], sg), [(0.009, 0.022), (0.008, 0.018), (0.003, 0.006)], seg=6, per=3, ref=(0, -1, 0))
        add_sweep(H, cyan, SP([(0.118, 0.01, 1.775), (0.15, 0.027, 1.81)], sg), [(0.004, 0.013), (0.004, 0.011)], seg=6, per=2, ref=(0, -1, 0))
        # maedate crest blades
        add_sweep(H, gold, SP([(0.028, -0.12, 1.865), (0.075, -0.13, 1.91), (0.13, -0.125, 1.945), (0.18, -0.105, 1.953)], sg),
                  [(0.006, 0.014), (0.012, 0.016), (0.01, 0.014), (0.002, 0.004)], seg=6, per=4, ref=(0, -1, 0))
        add_sweep(H, mag, SP([(0.032, -0.124, 1.87), (0.077, -0.134, 1.912), (0.126, -0.129, 1.942)], sg),
                  [(0.003, 0.016), (0.004, 0.018), (0.002, 0.012)], seg=6, per=3, ref=(0, -1, 0))
    # neck guard (shikoro) layers
    for k, z in enumerate((1.72, 1.685, 1.65)):
        r = 0.118 + 0.014 * k
        arc = [(r * math.cos(math.radians(a)), r * math.sin(math.radians(a)) * 1.05 + 0.0, z) for a in range(10, 171, 16)]
        add_sweep(H, lacq if k < 2 else armor, arc, [(0.01, 0.036)] * len(arc), seg=8, per=1, ref=(0, 0, 1), power=2.6)
        add_sweep(H, cyan if k == 2 else mag, [(p[0], p[1], p[2] - 0.036) for p in arc], [(0.011, 0.003)] * len(arc), seg=6, per=1, ref=(0, 0, 1))
    G['helm'] = (H, ('rigid', 'Head'))

    # ---------------------------------------------------------- back plate
    D = Mesh("back")
    ring = [(0.27 * math.cos(2 * math.pi * i / 24), 0.255, 1.60 + 0.27 * math.sin(2 * math.pi * i / 24)) for i in range(24)]
    add_sweep(D, cyan, ring, [(0.006, 0.006)] * 24, seg=6, per=1, closed=True)
    ring2 = [(0.245 * math.cos(2 * math.pi * i / 24), 0.255, 1.60 + 0.245 * math.sin(2 * math.pi * i / 24)) for i in range(24)]
    add_sweep(D, armor, ring2, [(0.004, 0.012)] * 24, seg=6, per=1, closed=True)
    for i in range(12):
        a = 2 * math.pi * i / 12
        add_box(D, mag, (0.258 * math.cos(a), 0.255, 1.60 + 0.258 * math.sin(a)), (0.02, 0.008, 0.008), rot=(0, -a, 0), bevel=0.0)
    G['back'] = (D, ('auto', ['Chest', 'Spine'], 0.1))

    # ---------------------------------------------------------- katana
    d = V((-0.04, 0.55, -0.26)).normalized()
    o = V((0.228, -0.11, 1.06))
    def at(t): return o + d * t
    Kt = Mesh("katana")
    add_sweep(Kt, lacq, [at(0.07), at(0.4), at(0.8)], [(0.018, 0.026), (0.018, 0.026), (0.015, 0.022)], seg=12, per=3, power=2.6, ref=(1, 0, 0))
    add_sweep(Kt, cyan, [at(0.12) + V((0.019, 0, 0)), at(0.7) + V((0.019, 0, 0))], [(0.003, 0.006), (0.003, 0.006)], seg=4, per=2, ref=(1, 0, 0))
    add_sweep(Kt, gold, [at(0.065), at(0.095)], [(0.021, 0.029), (0.021, 0.029)], seg=12, per=1, power=2.6, ref=(1, 0, 0))  # koiguchi
    add_sweep(Kt, gold, [at(0.77), at(0.82)], [(0.017, 0.024), (0.014, 0.02)], seg=12, per=1, power=2.6, ref=(1, 0, 0))  # kojiri
    add_cyl(Kt, gold, at(0.0), at(0.016), 0.044, 0.044, seg=16)  # tsuba
    add_cyl(Kt, mag, at(0.016), at(0.019), 0.04, 0.04, seg=16)
    add_sweep(Kt, leather, [at(-0.2), at(-0.01)], [(0.017, 0.022), (0.017, 0.022)], seg=10, per=4, power=2.4, ref=(1, 0, 0))  # tsuka
    add_sweep(Kt, mag, [at(-0.205), at(-0.19)], [(0.019, 0.024), (0.019, 0.024)], seg=10, per=1, power=2.4, ref=(1, 0, 0))  # pommel
    G['katana'] = (Kt, ('rigid', 'Hips'))

    # ---------------------------------------------------------- cape (3-bone chain)
    C = Mesh("cape")
    def cape_y(z): return 0.125 + (1.5 - z) * 0.125
    for x0, zb in ((-0.15, 0.86), (-0.075, 0.70), (0.0, 0.50), (0.075, 0.70), (0.15, 0.86)):
        zs = [1.50, 1.30, 1.06, 0.86, zb] if zb < 0.86 else [1.50, 1.30, 1.06, zb]
        zs = [z for z in zs if z >= zb - 1e-6]
        if zs[-1] != zb:
            zs.append(zb)
        pts = [(x0 * (1 + 0.28 * (1.5 - z)), cape_y(z) + 0.55 * x0 * x0, z) for z in zs]
        rad = [(0.042, 0.007)] * len(pts)
        add_sweep(C, cloth, pts, rad, seg=8, per=3, power=2.2)
        e = pts[-1]
        add_sweep(C, cyan if x0 == 0.0 else mag, [(e[0], e[1] + 0.0, e[2] + 0.004), (e[0], e[1], e[2] - 0.004)], [(0.043, 0.009)] * 2, seg=8, per=1, power=2.2)
    add_sweep(C, lacq, [(0, 0.115, 1.505), (0, 0.118, 1.49)], [(0.2, 0.04), (0.2, 0.04)], seg=14, per=1, power=2.4)
    G['cape'] = (C, ('auto', ['Chest', 'Cape1', 'Cape2', 'Cape3'], 0.09))

    # ---------------------------------------------------------- sash tails
    Sh = Mesh("sashtails")
    sp = [(-0.15, -0.115, 1.06), (-0.16, -0.12, 0.88), (-0.165, -0.125, 0.70)]
    add_sweep(Sh, sash, sp, [(0.03, 0.006), (0.032, 0.006), (0.03, 0.006)], seg=10, per=3, power=2.2)
    add_sweep(Sh, mag, [(-0.165, -0.126, 0.705), (-0.165, -0.126, 0.70)], [(0.031, 0.008), (0.031, 0.008)], seg=10, per=1, power=2.2)
    G['sash'] = (Sh, ('auto', ['Hips', 'Sash1', 'Sash2'], 0.08))
    return G


NR_EXTRA = {
    'Cape1': ((0, 0.12, 1.50), (0, 0.17, 1.26), 'Chest'),
    'Cape2': ((0, 0.17, 1.26), (0, 0.205, 1.00), 'Cape1'),
    'Cape3': ((0, 0.205, 1.00), (0, 0.235, 0.60), 'Cape2'),
    'Sash1': ((-0.15, -0.115, 1.06), (-0.16, -0.12, 0.84), 'Hips'),
    'Sash2': ((-0.16, -0.12, 0.84), (-0.165, -0.125, 0.68), 'Sash1'),
}
