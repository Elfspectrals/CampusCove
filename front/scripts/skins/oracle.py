SP_ = SKINS_DIR
exec(open(SP_ + "base.py", encoding="utf8").read())


def add_hood(M, outer, inner, trim, prof, n=22, delta0=0.62, delta1=0.30):
    """prof: list of (z, rx, ry, cy). Open front wedge, double shell (outer + lining) with a gold rim."""
    bm = M.bm
    P = resample([V(p) for p in prof], 4)
    rows_o, rows_i = [], []
    nv = len(P)
    for i, p in enumerate(P):
        v = i / (nv - 1)
        d = delta0 + (delta1 - delta0) * v
        th0, th1 = -math.pi / 2 + d, -math.pi / 2 + 2 * math.pi - d
        # (z, rx, ry, cy) -> p = (z, rx, ry) + w=cy
        z, rx, ry, cy = p.x, p.y, p.z, p.w
        ro, ri = [], []
        for j in range(n):
            th = th0 + (th1 - th0) * j / (n - 1)
            ro.append(bm.verts.new((rx * math.cos(th), cy + ry * math.sin(th), z)))
            ri.append(bm.verts.new((rx * 0.9 * math.cos(th), cy + ry * 0.9 * math.sin(th), z - 0.004)))
        rows_o.append(ro); rows_i.append(ri)
    mo, mi_, mt = M.mi(outer), M.mi(inner), M.mi(trim)
    for i in range(nv - 1):
        for j in range(n - 1):
            f = bm.faces.new((rows_o[i][j], rows_o[i][j + 1], rows_o[i + 1][j + 1], rows_o[i + 1][j])); f.material_index = mo
            f = bm.faces.new((rows_i[i][j + 1], rows_i[i][j], rows_i[i + 1][j], rows_i[i + 1][j + 1])); f.material_index = mi_
        # rim strips at both edges
        for j in (0, n - 2):
            pass
        a0, a1 = rows_o[i][0], rows_o[i + 1][0]
        b0, b1 = rows_i[i][0], rows_i[i + 1][0]
        f = bm.faces.new((a0, b0, b1, a1)); f.material_index = mt
        a0, a1 = rows_o[i][n - 1], rows_o[i + 1][n - 1]
        b0, b1 = rows_i[i][n - 1], rows_i[i + 1][n - 1]
        f = bm.faces.new((a0, a1, b1, b0)); f.material_index = mt
    # tip cap + bottom rim
    for j in range(n - 1):
        f = bm.faces.new((rows_o[0][j + 1], rows_o[0][j], rows_i[0][j], rows_i[0][j + 1])); f.material_index = mt
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))


def star(M, m, loc, phi, size=0.016):
    add_ellipsoid(M, m, loc, (size * 0.8, 0.0045, size * 1.3), rot=(0, 0, phi - math.pi / 2), seg=4, rings=2)


def build_astral_oracle(coll):
    rnd = random.Random(7)
    robe = mat("AO_robe", "5848dc", metal=0.1, rough=0.5, coat=0.15)
    deep = mat("AO_deep", "211a62", metal=0.1, rough=0.55, coat=0.2)
    lining = mat("AO_lining", "b590ff", rough=0.5)
    gold = mat("AO_gold", "ecc060", metal=1.0, rough=0.22)
    silver = mat("AO_silver", "d2dcff", metal=0.95, rough=0.22)
    starm = mat("AO_star", "ffe9a8", rough=0.4, emit="ffe0a0", estr=1.0)
    cryst = mat("AO_crystal", "9aa8ff", metal=0.1, rough=0.1, coat=1.0, emit="7f93ff", estr=1.0)
    eyes = mat("AO_eyes", "fff4c8", emit="fff0b8", estr=1.6)
    void = mat("AO_void", "07060f", rough=0.9)
    glove = mat("AO_glove", "1a1238", metal=0.2, rough=0.4, coat=0.5)
    aura = mat("AO_aura", "8f7bff", rough=0.4, emit="8f7bff", estr=1.0)

    G = {}
    B = Mesh("body")
    body(B, glove, under=deep)
    add_ellipsoid(B, deep, (0, 0, 0.93), (0.165, 0.115, 0.1), seg=16, rings=9)
    for sg in (1, -1):
        add_ellipsoid(B, deep, (0.19 * sg, 0, 1.49), (0.06, 0.062, 0.062), seg=10, rings=7)
        add_ellipsoid(B, deep, (0.09 * sg, 0, 0.95), (0.098, 0.1, 0.1), seg=10, rings=7)
        add_ellipsoid(B, eyes, S((0.036, -0.1, 1.758), sg), (0.019, 0.005, 0.0065), rot=(0, 0, 0.35 * sg), seg=10, rings=6)
        add_ellipsoid(B, gold, S((0.45, -0.005, 0.895), sg), (0.012, 0.012, 0.012), seg=6, rings=4)
    G['body'] = (B, ('auto', None, 0.055))

    # ---------------------------------------------------------- torso robe, lapels, obi, mantle
    T = Mesh("torso")
    add_sweep(T, robe, [(0, 0, 1.0), (0, 0, 1.12), (0, 0, 1.3), (0, 0, 1.46), (0, 0, 1.56)],
              [(0.176, 0.13), (0.168, 0.125), (0.19, 0.138), (0.205, 0.145), (0.13, 0.115)], seg=24, per=3, power=2.2)
    for sg in (1, -1):
        add_sweep(T, lining, [(0.065 * sg, -0.128, 1.56), (0.02 * sg, -0.150, 1.30), (-0.035 * sg, -0.152, 1.07)], [(0.032, 0.007), (0.034, 0.007), (0.034, 0.007)], seg=8, per=3, power=2.4, ref=(0, -1, 0))
        add_sweep(T, gold, [(0.034 * sg, -0.132, 1.55), (-0.002 * sg, -0.155, 1.31), (-0.058 * sg, -0.157, 1.07)], [(0.004, 0.009), (0.004, 0.009), (0.004, 0.009)], seg=6, per=3, ref=(0, -1, 0))
    add_sweep(T, deep, [(0, 0, 1.0), (0, 0, 1.13)], [(0.226, 0.18), (0.222, 0.176)], seg=26, per=1, power=2.2)  # obi base
    add_sweep(T, gold, [(0, 0, 1.125), (0, 0, 1.14)], [(0.226, 0.18), (0.226, 0.18)], seg=26, per=1, power=2.2)
    add_sweep(T, gold, [(0, 0, 0.995), (0, 0, 1.01)], [(0.228, 0.182), (0.228, 0.182)], seg=26, per=1, power=2.2)
    # moon medallion on obi
    arc = [(0.034 * math.cos(math.radians(a)), -0.205, 1.075 + 0.034 * math.sin(math.radians(a))) for a in range(-30, 211, 20)]
    thick = [0.004, 0.008, 0.012, 0.014, 0.013, 0.011, 0.008, 0.006, 0.004, 0.003, 0.002, 0.002, 0.002][:len(arc)]
    add_sweep(T, silver, arc, [(t, 0.009) for t in thick], seg=6, per=1, ref=(0, -1, 0))
    add_ellipsoid(T, starm, (0.0, -0.207, 1.075), (0.011, 0.007, 0.011), seg=4, rings=2)
    # mantle
    add_sweep(T, deep, [(0, 0, 1.60), (0, 0, 1.53), (0, 0, 1.45), (0, 0, 1.385)], [(0.12, 0.11), (0.2, 0.155), (0.238, 0.175), (0.248, 0.18)], seg=26, per=3, power=2.1)
    add_sweep(T, gold, [(0, 0, 1.385), (0, 0, 1.395)], [(0.25, 0.182), (0.25, 0.182)], seg=26, per=1, power=2.1)
    add_sweep(T, lining, [(0, 0, 1.375), (0, 0, 1.385)], [(0.243, 0.176), (0.243, 0.176)], seg=26, per=1, power=2.1)
    add_sweep(T, gold, [(0, 0, 1.585), (0, 0, 1.6)], [(0.12, 0.11), (0.115, 0.106)], seg=18, per=1)
    # chest crescent clasp
    arc = [(0.052 * math.cos(math.radians(a)), -0.196, 1.40 + 0.052 * math.sin(math.radians(a))) for a in range(20, 321, 20)]
    th = [0.003 + 0.011 * math.sin(math.pi * i / (len(arc) - 1)) for i in range(len(arc))]
    add_sweep(T, silver, arc, [(t, 0.011) for t in th], seg=6, per=1, ref=(0, -1, 0))
    add_ellipsoid(T, cryst, (0.0, -0.198, 1.40), (0.016, 0.01, 0.022), seg=4, rings=2)
    add_cyl(T, gold, (0, -0.19, 1.455), (0, -0.2, 1.455), 0.012, 0.012, seg=8)
    # stars on mantle / chest
    for i in range(14):
        a = rnd.uniform(0, 2 * math.pi); z = rnd.uniform(1.36, 1.5)
        r = 0.25 * (1 - (1.56 - z) * 0.0)
        r = 0.17 + (1.5 - z) * 0.5
        star(T, starm, (r * math.cos(a), 0.17 / 0.28 * r * math.sin(a), z), a, 0.013)
    G['torso'] = (T, ('auto', ['Hips', 'Spine', 'Chest', 'Neck', 'Shoulder.L', 'Shoulder.R'], 0.09))

    # ---------------------------------------------------------- sleeves
    A = Mesh("sleeves")
    for sg in (1, -1):
        add_sweep(A, robe, SP([(0.16, 0, 1.51), (0.25, 0, 1.40), (0.34, 0, 1.22), (0.40, 0, 1.06), (0.435, 0, 0.93)], sg),
                  [(0.07, 0.074), (0.08, 0.084), (0.1, 0.1), (0.125, 0.11), (0.15, 0.115)], seg=18, per=4, power=2.1)
        add_sweep(A, lining, SP([(0.436, 0, 0.935), (0.44, 0, 0.9)], sg), [(0.152, 0.117), (0.162, 0.12)], seg=18, per=1, power=2.1)
        add_sweep(A, gold, SP([(0.434, 0, 0.945), (0.437, 0, 0.935)], sg), [(0.152, 0.117), (0.153, 0.118)], seg=18, per=1, power=2.1)
        add_sweep(A, gold, SP([(0.338, 0, 1.225), (0.343, 0, 1.215)], sg), [(0.103, 0.103), (0.103, 0.103)], seg=18, per=1)
        for i in range(5):
            t = rnd.random()
            x = 0.3 + 0.12 * t; z = 1.3 - 0.35 * t
            star(A, starm, S((x + 0.04, -0.09 + 0.02 * t, z - 0.02), sg), -0.4, 0.012)
    G['sleeves'] = (A, ('auto', ['Shoulder.L', 'Shoulder.R', 'UpperArm.L', 'UpperArm.R', 'LowerArm.L', 'LowerArm.R', 'Hand.L', 'Hand.R'], 0.07))

    # ---------------------------------------------------------- skirt panels (2 layers)
    Sk = Mesh("skirt")
    zs = [1.06, 0.86, 0.66, 0.46, 0.27, 0.13]
    def rs(z): return 0.222 + 0.15 * ((1.06 - z) / 0.93) ** 1.25
    N = 9
    for layer in (0, 1):
        for i in range(N):
            phi = 2 * math.pi * (i + 0.5 * layer) / N + math.pi / 2 + 0.2 * 0
            sc = 1.0 if layer == 0 else 0.93
            zl = zs if layer == 0 else [z for z in zs if z > 0.2] + [0.22]
            pts = [(math.cos(phi) * rs(z) * sc, math.sin(phi) * rs(z) * 0.82 * sc, z) for z in zl]
            rad = [(2 * math.pi * rs(z) * sc / N * (0.62 if layer == 0 else 0.7), 0.008) for z in zl]
            ref = (math.cos(phi), math.sin(phi), 0.0)
            add_sweep(Sk, deep if layer == 0 else robe, pts, rad, seg=8, per=3, ref=ref, power=2.0)
            if layer == 0:
                e = pts[-1]; w = rad[-1][0]
                add_sweep(Sk, gold, [(e[0], e[1], e[2] + 0.008), (e[0], e[1], e[2] - 0.004)], [(w * 1.01, 0.01)] * 2, seg=8, per=1, ref=ref)
                add_sweep(Sk, gold, [(p[0] * 1.0, p[1] * 1.0, p[2]) for p in pts[:-1]], [(0.0035, 0.0095)] * (len(pts) - 1), seg=6, per=3, ref=ref)
                for k in range(3):
                    z = rnd.uniform(0.2, 0.9)
                    star(Sk, starm, (math.cos(phi) * (rs(z) + 0.012), math.sin(phi) * (rs(z) * 0.82 + 0.012), z), phi, 0.017)
    # tassels
    for sg in (1, -1):
        add_sweep(Sk, lining, [(0.04 * sg, -0.165, 1.03), (0.05 * sg, -0.19, 0.75), (0.05 * sg, -0.215, 0.55)], [(0.014, 0.006), (0.016, 0.006), (0.012, 0.006)], seg=6, per=3)
        add_ellipsoid(Sk, gold, (0.05 * sg, -0.216, 0.54), (0.016, 0.014, 0.026), seg=8, rings=6)
    G['skirt'] = (Sk, ('auto', ['Hips', 'UpperLeg.L', 'UpperLeg.R', 'LowerLeg.L', 'LowerLeg.R'], 0.1))

    # ---------------------------------------------------------- boots
    Bt = Mesh("boots")
    for sg in (1, -1):
        add_sweep(Bt, deep, SP([(0.10, 0.012, 0.24), (0.10, 0.01, 0.14), (0.10, 0.01, 0.09)], sg), [(0.062, 0.066), (0.056, 0.06), (0.05, 0.056)], seg=14, per=2)
        add_sweep(Bt, deep, SP([(0.10, 0.015, 0.085), (0.10, -0.06, 0.055), (0.10, -0.15, 0.04), (0.10, -0.235, 0.032)], sg),
                  [(0.05, 0.056), (0.045, 0.056), (0.036, 0.05), (0.012, 0.022)], seg=12, per=3, power=2.3)
        add_sweep(Bt, gold, SP([(0.10, -0.2, 0.04), (0.10, -0.245, 0.034)], sg), [(0.026, 0.034), (0.008, 0.012)], seg=10, per=2)
        add_sweep(Bt, gold, SP([(0.10, 0.012, 0.243), (0.10, 0.012, 0.236)], sg), [(0.064, 0.068), (0.064, 0.068)], seg=14, per=1)
        add_box(Bt, silver, S((0.10, -0.05, 0.012), sg), (0.1, 0.3, 0.024), bevel=0.008)
    G['boots'] = (Bt, ('auto', None, 0.06))

    # ---------------------------------------------------------- hood, circlet
    H = Mesh("hood")
    prof = [(1.56, 0.17, 0.19, 0.03), (1.64, 0.135, 0.16, 0.045), (1.74, 0.14, 0.17, 0.05), (1.835, 0.12, 0.145, 0.06), (1.89, 0.07, 0.095, 0.09), (1.93, 0.016, 0.03, 0.14)]
    add_hood(H, deep, lining, gold, prof, n=24, delta0=0.58, delta1=0.40)
    arc = [(0.098 * math.sin(math.radians(a)), -0.1 * math.cos(math.radians(a)) * 1.02, 1.815) for a in range(-62, 63, 12)]
    add_sweep(H, gold, arc, [(0.006, 0.007)] * len(arc), seg=6, per=2, ref=(0, 0, 1))
    add_ellipsoid(H, cryst, (0, -0.108, 1.82), (0.011, 0.007, 0.022), seg=4, rings=2)
    for sg in (1, -1):
        add_ellipsoid(H, silver, S((0.04, -0.103, 1.82), sg), (0.016, 0.004, 0.016), rot=(0, 0, 0.8 * sg), seg=4, rings=2)
    G['hood'] = (H, ('rigid', 'Head'))

    # ---------------------------------------------------------- back train (3-bone chain)
    C = Mesh("train")
    def cy(z): return 0.14 + (1.5 - z) * 0.11
    for x0, zb in ((-0.18, 0.62), (-0.12, 0.46), (-0.06, 0.34), (0.0, 0.2), (0.06, 0.34), (0.12, 0.46), (0.18, 0.62)):
        zl = [1.45, 1.22, 0.98, 0.78, 0.58, zb]
        zl = [z for z in zl if z > zb + 0.01] + [zb]
        pts = [(x0 * (1 + 0.5 * (1.45 - z)), cy(z) + 0.7 * x0 * x0, z) for z in zl]
        add_sweep(C, deep, pts, [(0.036, 0.007)] * len(pts), seg=8, per=3, power=2.2)
        e = pts[-1]
        add_sweep(C, gold, [(e[0], e[1], e[2] + 0.004), (e[0], e[1], e[2] - 0.004)], [(0.037, 0.009)] * 2, seg=8, per=1, power=2.2)
        for k in range(2):
            z = rnd.uniform(zb + 0.08, 1.2)
            t = (1.45 - z) / (1.45 - zb)
            q = (x0 * (1 + 0.5 * (1.45 - z)), cy(z) + 0.7 * x0 * x0 + 0.01, z)
            star(C, starm, q, math.pi / 2, 0.013)
    G['train'] = (C, ('auto', ['Chest', 'Cape1', 'Cape2', 'Cape3'], 0.1))

    # ---------------------------------------------------------- halo rings
    Ha = Mesh("halo1")
    ring = lambda r, cy_, cz, n=28: [(r * math.cos(2 * math.pi * i / n), cy_, cz + r * math.sin(2 * math.pi * i / n)) for i in range(n)]
    add_sweep(Ha, gold, ring(0.27, 0.3, 1.62), [(0.008, 0.008)] * 28, seg=8, per=1, closed=True)
    add_sweep(Ha, silver, ring(0.245, 0.3, 1.62), [(0.004, 0.006)] * 28, seg=6, per=1, closed=True)
    for i in range(12):
        a = 2 * math.pi * i / 12
        add_ellipsoid(Ha, starm if i % 3 == 0 else aura, (0.27 * math.cos(a), 0.3, 1.62 + 0.27 * math.sin(a)), (0.011, 0.006, 0.011), rot=(0, -a, 0), seg=4, rings=2)
    G['halo1'] = (Ha, ('rigid', 'Halo1'))
    Hb = Mesh("halo2")
    add_sweep(Hb, silver, ring(0.2, 0.3, 1.62, 24), [(0.004, 0.006)] * 24, seg=6, per=1, closed=True)
    for i in range(6):
        a = 2 * math.pi * i / 6
        add_ellipsoid(Hb, aura, (0.2 * math.cos(a), 0.3, 1.62 + 0.2 * math.sin(a)), (0.008, 0.008, 0.016), rot=(0, -a, 0), seg=4, rings=2)
    bmesh.ops.rotate(Hb.bm, cent=(0, 0.3, 1.62), matrix=Matrix.Rotation(math.radians(68), 3, 'X'), verts=list(Hb.bm.verts))
    G['halo2'] = (Hb, ('rigid', 'Halo2'))

    # ---------------------------------------------------------- orbiting crystals
    for k, (r, z, ph) in enumerate(((0.5, 1.80, 0.0), (0.58, 1.52, 2.1), (0.66, 1.26, 4.2))):
        Oc = Mesh("orb%d" % k)
        c = (r * math.cos(ph), r * math.sin(ph), z)
        add_ellipsoid(Oc, cryst, c, (0.034, 0.034, 0.075), seg=6, rings=4)
        add_sweep(Oc, gold, [(c[0], c[1], z - 0.004), (c[0], c[1], z + 0.004)], [(0.036, 0.036), (0.036, 0.036)], seg=6, per=1)
        add_ellipsoid(Oc, aura, c, (0.012, 0.012, 0.03), seg=6, rings=4)
        G['orb%d' % k] = (Oc, ('rigid', 'Orb%d' % (k + 1)))
    return G


def _orb(r, z, ph):
    c = (r * math.cos(ph), r * math.sin(ph), z)
    return ((0, 0, z), (c[0], c[1], z), 'Hips')

AO_EXTRA = {
    'Cape1': ((0, 0.14, 1.45), (0, 0.19, 1.22), 'Chest'),
    'Cape2': ((0, 0.19, 1.22), (0, 0.24, 0.98), 'Cape1'),
    'Cape3': ((0, 0.24, 0.98), (0, 0.32, 0.3), 'Cape2'),
    'Halo1': ((0, 0.3, 1.62), (0, 0.4, 1.62), 'Chest'),
    'Halo2': ((0, 0.3, 1.62), (0, 0.4, 1.62), 'Chest'),
    'Orb1': _orb(0.5, 1.80, 0.0),
    'Orb2': _orb(0.58, 1.52, 2.1),
    'Orb3': _orb(0.66, 1.26, 4.2),
}
