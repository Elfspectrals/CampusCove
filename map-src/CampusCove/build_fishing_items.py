import importlib
import math
import os
import random
import sys

import bmesh

if "__file__" not in globals():
    raise RuntimeError('Run with exec(open(p).read(), {"__file__": p}) so the script can find lib_common.py')
HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import lib_common as L
importlib.reload(L)
import bpy
from mathutils import Matrix, Vector

# Items live at the origin, centre-bottom, nose / rod tip toward +X (blender) = +X (glTF).
OUT = os.path.join(L.OUT_ROOT, "items")
M = {}


def mat(name, base, rough=0.8, pattern="noise", var=0.05, accent=None, emit=None, emit_strength=1.2):
    return L.make_mat(name, base, rough, pattern, var, accent=accent, emit=emit, emit_strength=emit_strength)


# ---------------------------------------------------------------- low-level mesh helpers
def _finish(coll, name, bm, materials, loc=(0, 0, 0)):
    bm.normal_update()
    L._box_uv(bm, 0.5)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in materials:
        me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    ob.location = loc
    coll.objects.link(ob)
    return ob


def ellipsoid(coll, name, c, sx, sy, sz, m, seg=10, rings=7):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * sx, v.co.y * sy, v.co.z * sz)) + Vector(c)
    return _finish(coll, name, bm, [m])


def prism(coll, name, pts, y, thick, m):
    """Flat fin: polygon `pts` (x, z) in the XZ plane, thickness along Y, centred on `y`."""
    bm = bmesh.new()
    lo = [bm.verts.new((x, y - thick / 2, z)) for x, z in pts]
    hi = [bm.verts.new((x, y + thick / 2, z)) for x, z in pts]
    bm.faces.new(lo[::-1])
    bm.faces.new(hi)
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _finish(coll, name, bm, [m])


def tube(coll, name, p0, p1, r0, r1, m, seg=6, cap=True):
    """Tapered cylinder between two points."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, segments=seg, radius1=r0, radius2=r1, depth=d.length)
    for v in bm.verts:
        v.co.z += d.length / 2
    rot = d.to_track_quat("Z", "Y").to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=Matrix.Translation(p0) @ rot, verts=bm.verts)
    return _finish(coll, name, bm, [m])


def gem(coll, name, c, r, m):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=4, v_segments=2, radius=r)
    for v in bm.verts:
        v.co = v.co + Vector(c)
    return _finish(coll, name, bm, [m])


# ---------------------------------------------------------------- fish
def fish(coll, key, L_, H, W, body, belly, fin, *, tail="fork", dorsal=1.0, long_dorsal=False, whiskers=False, eye=(0.05, 0.02), spikes=0):
    """Low-poly fish lying on its belly, nose toward +X. L_/H/W = length/height/width (m)."""
    parts = []
    # body: ellipsoid tapered toward the tail, belly faces use the second material
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=7, radius=1.0)
    for v in bm.verts:
        x = v.co.x
        t = max(0.0, -x)  # 0 at nose/middle, 1 at the tail
        k = 1.0 - 0.62 * t * t
        v.co = Vector((x * L_ / 2, v.co.y * W / 2 * k, v.co.z * H / 2 * k)) + Vector((0, 0, H / 2))
    bm.normal_update()
    for f in bm.faces:
        if f.calc_center_median().z < H * 0.34:
            f.material_index = 1
    body_ob = _finish(coll, key + "_body", bm, [body, belly])
    parts.append(body_ob)

    cz = H / 2
    tx = -L_ * 0.4
    th = H * 0.7
    if tail == "fork":
        pts = [(tx + 0.02 * L_, cz), (tx - 0.2 * L_, cz + th), (tx - 0.12 * L_, cz), (tx - 0.2 * L_, cz - th * 0.9)]
    elif tail == "round":
        pts = [(tx + 0.02 * L_, cz + 0.12 * H), (tx - 0.16 * L_, cz + th * 0.8), (tx - 0.22 * L_, cz), (tx - 0.16 * L_, cz - th * 0.7), (tx + 0.02 * L_, cz - 0.12 * H)]
    else:  # long (koi / arowana): broad, slightly forked
        pts = [(tx + 0.02 * L_, cz + 0.1 * H), (tx - 0.22 * L_, cz + th * 0.95), (tx - 0.16 * L_, cz), (tx - 0.22 * L_, cz - th * 0.85), (tx + 0.02 * L_, cz - 0.1 * H)]
    parts.append(prism(coll, key + "_tail", pts, 0.0, 0.012, fin))

    top = H * (1 + 0.55 * dorsal) - H * 0.02
    if long_dorsal:
        dpts = [(L_ * 0.12, H * 0.95), (L_ * 0.05, top), (-L_ * 0.38, top * 0.92), (-L_ * 0.36, H * 0.8)]
    else:
        dpts = [(L_ * 0.12, H * 0.95), (L_ * 0.0, top), (-L_ * 0.22, top * 0.97), (-L_ * 0.22, H * 0.85)]
    parts.append(prism(coll, key + "_dorsal", dpts, 0.0, 0.010, fin))
    for i in range(spikes):
        sx = L_ * (0.18 - 0.1 * i)
        parts.append(tube(coll, f"{key}_spike{i}", (sx, 0, H * 0.95), (sx - 0.02 * L_, 0, top + H * 0.35), H * 0.05, 0.003, fin, seg=4))

    for sgn, nm in ((1, "L"), (-1, "R")):
        py = sgn * W * 0.47
        parts.append(prism(coll, f"{key}_pec{nm}", [(L_ * 0.12, H * 0.42), (L_ * 0.02, H * 0.34), (-L_ * 0.08, H * 0.12), (L_ * 0.08, H * 0.2)], py, 0.008, fin))
        # eye
        ex, ez = L_ * 0.34, H * 0.62
        parts.append(ellipsoid(coll, f"{key}_eye{nm}", (ex, sgn * W * 0.38, ez), eye[0] * L_ + 0.01, 0.012, eye[0] * L_ + 0.01, M["eye_w"], seg=6, rings=4))
        parts.append(ellipsoid(coll, f"{key}_pupil{nm}", (ex + 0.004, sgn * (W * 0.38 + 0.01), ez), eye[1] * L_ + 0.004, 0.006, eye[1] * L_ + 0.004, M["eye_b"], seg=6, rings=4))
        if whiskers:
            parts.append(tube(coll, f"{key}_whisker{nm}", (L_ * 0.5, sgn * W * 0.12, H * 0.38), (L_ * 0.5 + 0.09 * L_, sgn * W * 0.45, H * 0.3), 0.006, 0.003, fin, seg=4))
    return L.join(coll, key, parts)


# ---------------------------------------------------------------- fishing rods
def rod(coll, key, length, blank_mats, grip, reel_body, reel_acc, ring, ferrule, accent_gem=None, bend=0.35, grip_len=0.5):
    """Rod standing on its butt (origin centre-bottom), tip bent toward +X. Segments alternate blank materials."""
    parts = []
    parts.append(tube(coll, key + "_grip", (0, 0, 0), (0, 0, grip_len), 0.024, 0.021, grip, seg=8))
    parts.append(tube(coll, key + "_butt", (0, 0, 0), (0, 0, 0.03), 0.028, 0.028, ferrule, seg=8))
    parts.append(tube(coll, key + "_collar", (0, 0, grip_len), (0, 0, grip_len + 0.04), 0.026, 0.026, ferrule, seg=8))
    # reel on the +Y side of the seat
    rz = grip_len * 0.62
    parts.append(tube(coll, key + "_reel_seat", (0, 0.012, rz), (0, 0.075, rz), 0.012, 0.012, ferrule, seg=6))
    parts.append(tube(coll, key + "_reel", (0, 0.07, rz), (0, 0.118, rz), 0.062, 0.062, reel_body, seg=10))
    parts.append(tube(coll, key + "_reel_cap", (0, 0.118, rz), (0, 0.13, rz), 0.03, 0.03, reel_acc, seg=8))
    parts.append(tube(coll, key + "_crank_arm", (0, 0.13, rz), (0, 0.13, rz - 0.085), 0.008, 0.008, reel_acc, seg=4))
    parts.append(tube(coll, key + "_crank_knob", (0, 0.13, rz - 0.085), (0, 0.17, rz - 0.085), 0.016, 0.016, ring, seg=6))
    if accent_gem is not None:
        parts.append(gem(coll, key + "_gem", (0, 0.138, rz), 0.022, accent_gem))
    # blank: bent arc made of tapered segments
    n = 8
    seg_len = (length - grip_len - 0.04) / n
    pos = Vector((0, 0, grip_len + 0.04))
    ang = 0.0
    for i in range(n):
        t = i / n
        r0 = 0.0175 * (1 - t) + 0.005 * t
        r1 = 0.0175 * (1 - (i + 1) / n) + 0.005 * (i + 1) / n
        ang += bend * (0.04 + 0.5 * t * t) / n * 3.0
        d = Vector((math.sin(ang), 0, math.cos(ang)))
        nxt = pos + d * seg_len
        parts.append(tube(coll, f"{key}_blank{i}", pos, nxt, r0, r1, blank_mats[i % len(blank_mats)], seg=6))
        if i in (1, 3, 5, 7):
            parts.append(tube(coll, f"{key}_guide{i}", pos + d * seg_len * 0.5, pos + d * seg_len * 0.5 + Vector((0, 0.05, 0)), 0.006, 0.004, ring, seg=4))
            parts.append(tube(coll, f"{key}_eyelet{i}", pos + d * seg_len * 0.5 + Vector((0, 0.045, 0)), pos + d * seg_len * 0.5 + Vector((0, 0.065, 0)), 0.014, 0.014, ring, seg=6))
        pos = nxt
    parts.append(gem(coll, key + "_tip", tuple(pos), 0.009, ring))
    return L.join(coll, key, parts)


# ---------------------------------------------------------------- legendary showpieces
def ring_xy(coll, name, c, radius, thick, m, seg=24):
    """Flat ring (circle in the XY plane at height c[2]) made of short tubes."""
    out = []
    for i in range(seg):
        a0, a1 = 2 * math.pi * i / seg, 2 * math.pi * (i + 1) / seg
        out.append(tube(coll, f"{name}_{i}",
                        (c[0] + radius * math.cos(a0), c[1] + radius * math.sin(a0), c[2]),
                        (c[0] + radius * math.cos(a1), c[1] + radius * math.sin(a1), c[2]), thick, thick, m, seg=4, cap=False))
    return out


def fan_fin(coll, name, base, tips, membrane, rays, thick=0.008, ray_r=0.0045):
    """Membrane polygon (XZ plane) + one bright ray per tip. base/tips are (x, z) points."""
    out = [prism(coll, name + "_mem", [base[0]] + list(tips) + [base[1]], 0.0, thick, membrane)]
    for i, t in enumerate(tips):
        b = ((base[0][0] + base[1][0]) / 2, (base[0][1] + base[1][1]) / 2)
        out.append(tube(coll, f"{name}_ray{i}", (b[0], 0.0, b[1]), (t[0], 0.0, t[1]), ray_r, ray_r * 0.4, rays, seg=3))
    return out


def arowana(coll, key):
    """Legendary golden arowana: every scale modelled, glowing fins, flowing whiskers, crown, halo and sparks."""
    Lg, H, W = 1.0, 0.34, 0.2
    cz = H / 2
    gold = mat("IT_Fish_golden_arowana_Body", "#f6c339", 0.22, "checker", 0.03, accent="#d9951a", emit="#ffae2b", emit_strength=0.6)
    belly = mat("IT_Fish_golden_arowana_Belly", "#fff2b8", 0.25, var=0.02, emit="#ffe08a", emit_strength=0.6)
    bright = mat("IT_Aro_ScaleBright", "#fff0a0", 0.2, var=0.02, emit="#ffd54a", emit_strength=0.9)
    amber = mat("IT_Aro_ScaleAmber", "#ff9a1f", 0.25, var=0.02, emit="#ff8a00", emit_strength=0.8)
    fin = mat("IT_Fish_golden_arowana_Fin", "#ff7a1a", 0.3, var=0.03, emit="#ff5a00", emit_strength=0.9)
    spark = mat("IT_Aro_Spark", "#ffffff", 0.2, var=0.0, emit="#fff3b8", emit_strength=1.8)
    ruby = mat("IT_Aro_Ruby", "#e0243a", 0.15, var=0.01, emit="#ff2a48", emit_strength=1.6)
    iris = mat("IT_Aro_Iris", "#ffb000", 0.2, var=0.01, emit="#ffa000", emit_strength=1.6)
    parts = []

    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=1.0)
    for v in bm.verts:
        x = v.co.x
        t = max(0.0, -x)
        k = 1.0 - 0.6 * t * t
        v.co = Vector((x * Lg / 2, v.co.y * W / 2 * k, v.co.z * H / 2 * k + cz))
    bm.normal_update()
    for f in bm.faces:
        if f.calc_center_median().z < H * 0.3:
            f.material_index = 1
    parts.append(_finish(coll, key + "_body", bm, [gold, belly]))

    # scales: two flanks, overlapping rows, alternating bright / amber
    for sgn in (1, -1):
        for ix in range(11):
            x = Lg * (0.27 - ix * 0.058)
            ex = x / (Lg / 2)
            k = 1.0 - 0.6 * max(0.0, -ex) ** 2
            for iz in range(6):
                f = -0.62 + iz * 0.25
                r2 = 1 - ex * ex - f * f
                if r2 < 0.06:
                    continue
                yy = sgn * (W / 2 * k) * math.sqrt(r2) * 1.04
                zz = cz + f * H / 2 * k
                m = bright if (ix + iz) % 2 == 0 else amber
                parts.append(ellipsoid(coll, f"{key}_sc{sgn}_{ix}_{iz}", (x, yy, zz), 0.036 * Lg, 0.007, 0.03 * 0.2 * 3.2 * k, m, seg=5, rings=3))

    tx = -Lg * 0.4
    # tail: wide fan with 9 rays
    tips = []
    for i in range(-4, 5):
        a = i * 0.27
        tips.append((tx - 0.34 * Lg * math.cos(a), cz + math.sin(a) * H * 1.5))
    parts += fan_fin(coll, key + "_tail", [(tx + 0.03, cz + 0.12 * H), (tx + 0.03, cz - 0.12 * H)], tips, fin, bright)
    # dorsal: long flowing crest
    dtips = [(Lg * (0.12 - 0.055 * i), H * (1.0 + 0.2 * i + (0.25 if i % 2 else 0))) for i in range(9)]
    dtips = [(x, min(z, H * 2.0)) for x, z in dtips]
    parts += fan_fin(coll, key + "_dorsal", [(Lg * 0.15, H * 0.92), (-Lg * 0.34, H * 0.8)], dtips, fin, bright)
    for sgn, nm in ((1, "L"), (-1, "R")):
        # pectoral: swept feathers on the flank
        ptips = [(Lg * (0.18 - 0.07 * i), H * (0.5 - 0.09 * i)) for i in range(5)]
        ptips = [(x, max(z, 0.02)) for x, z in ptips]
        for p in fan_fin(coll, key + "_pec" + nm, [(Lg * 0.2, H * 0.45), (Lg * 0.15, H * 0.3)], ptips, fin, bright, thick=0.006, ray_r=0.003):
            p.location.y = sgn * W * 0.55
            parts.append(p)
        # eye + gill plate + whiskers
        parts.append(ellipsoid(coll, key + "_iris" + nm, (Lg * 0.37, sgn * W * 0.38, H * 0.64), 0.03, 0.014, 0.03, iris, seg=8, rings=5))
        parts.append(ellipsoid(coll, key + "_pupil" + nm, (Lg * 0.385, sgn * (W * 0.38 + 0.011), H * 0.64), 0.015, 0.006, 0.015, M["eye_b"], seg=6, rings=4))
        parts.append(ellipsoid(coll, key + "_gill" + nm, (Lg * 0.27, sgn * W * 0.41, H * 0.52), 0.07, 0.008, 0.075, bright, seg=8, rings=5))
        p0 = Vector((Lg * 0.5, sgn * W * 0.1, H * 0.3))
        d = Vector((0.5, sgn * 0.55, -0.1))
        for j in range(6):
            d = d + Vector((0.12, sgn * 0.2, -0.2))
            p1 = p0 + d.normalized() * 0.065
            parts.append(tube(coll, f"{key}_wh{nm}{j}", p0, p1, 0.006 - 0.0007 * j, 0.005 - 0.0007 * j, bright, seg=4))
            p0 = p1
        parts.append(gem(coll, f"{key}_pearl{nm}", tuple(p0), 0.016, spark))
    # crown + forehead ruby
    for i, (cx, h) in enumerate(((0.40, 0.09), (0.34, 0.12), (0.28, 0.09))):
        parts.append(tube(coll, f"{key}_crown{i}", (Lg * cx, 0, H * 0.98), (Lg * (cx - 0.05), 0, H * 0.98 + h), 0.014, 0.002, bright, seg=4))
    parts.append(gem(coll, key + "_ruby", (Lg * 0.43, 0, H * 0.9), 0.022, ruby))

    # halo rings on the ground + orbiting sparks
    parts += ring_xy(coll, key + "_halo1", (0, 0, 0.012), 0.66, 0.009, spark, seg=32)
    parts += ring_xy(coll, key + "_halo2", (0, 0, 0.012), 0.76, 0.006, amber, seg=32)
    for i in range(14):
        a = 2 * math.pi * i / 14
        parts.append(tube(coll, f"{key}_beam{i}", (math.cos(a) * 0.62, math.sin(a) * 0.4, 0.02), (math.cos(a) * 0.5, math.sin(a) * 0.32, 1.0 + 0.15 * (i % 3)), 0.014, 0.0015, spark if i % 2 else bright, seg=4))
    rr = random.Random(3)
    for i in range(18):
        a = rr.uniform(0, 2 * math.pi)
        rad = rr.uniform(0.3, 0.72)
        parts.append(gem(coll, f"{key}_spk{i}", (math.cos(a) * rad, math.sin(a) * rad * 0.6, rr.uniform(0.12, 0.55)), rr.uniform(0.01, 0.022), spark if i % 3 else bright))
    return L.join(coll, key, parts)


def rod_legendary(coll, key):
    """Premium rod: glowing helix, winged grip, crystal reel, orbiting rings, comet tip, halo."""
    length, grip_len = 2.5, 0.55
    carbon = mat("IT_Rod_Carbon", "#1d2027", 0.3, "checker", 0.02, accent="#2a2e38")
    gold = mat("IT_Rod_PremiumGold", "#f0c64a", 0.22, var=0.02, emit="#ffb800", emit_strength=0.5)
    cyan = mat("IT_Rod_NeonCyan", "#46e6ff", 0.2, var=0.01, emit="#46e6ff", emit_strength=1.5)
    magenta = mat("IT_Rod_NeonMagenta", "#ff4fd8", 0.2, var=0.01, emit="#ff4fd8", emit_strength=1.5)
    violet = mat("IT_Rod_NeonViolet", "#8a5bff", 0.2, var=0.01, emit="#8a5bff", emit_strength=1.4)
    white = mat("IT_Rod_Spark", "#ffffff", 0.2, var=0.0, emit="#e8fbff", emit_strength=2.0)
    parts = []
    # grip: carbon with gold + neon bands
    parts.append(tube(coll, key + "_grip", (0, 0, 0.06), (0, 0, grip_len), 0.027, 0.023, carbon, seg=8))
    for i, z in enumerate((0.12, 0.22, 0.32, 0.42)):
        parts.append(tube(coll, f"{key}_band{i}", (0, 0, z), (0, 0, z + 0.02), 0.031, 0.031, gold if i % 2 == 0 else cyan, seg=8))
    parts.append(gem(coll, key + "_pommel", (0, 0, 0.06), 0.05, cyan))
    parts.append(tube(coll, key + "_collar", (0, 0, grip_len), (0, 0, grip_len + 0.05), 0.03, 0.03, gold, seg=8))
    # wings of light: feathers fanning out from the grip
    for sgn in (1, -1):
        for i in range(7):
            ang = 0.25 + i * 0.2
            dirv = Vector((-0.35 * math.cos(ang), sgn * math.sin(ang), 0.42 * math.cos(ang) + 0.18))
            base = Vector((0, sgn * 0.03, 0.34))
            parts.append(tube(coll, f"{key}_wing{sgn}_{i}", base, base + dirv.normalized() * (0.55 - 0.05 * i), 0.024, 0.003, [cyan, violet, magenta][i % 3], seg=4))
    # reel: big crystal in a gold frame
    rz = 0.28
    parts.append(gem(coll, key + "_crystal", (0, 0.11, rz), 0.11, cyan))
    parts.append(tube(coll, key + "_frameA", (0, 0.04, rz), (0, 0.065, rz), 0.1, 0.1, gold, seg=6))
    parts.append(tube(coll, key + "_frameB", (0, 0.155, rz), (0, 0.18, rz), 0.09, 0.09, gold, seg=6))
    parts.append(tube(coll, key + "_crank", (0, 0.18, rz), (0, 0.18, rz - 0.13), 0.01, 0.01, gold, seg=4))
    parts.append(gem(coll, key + "_knob", (0, 0.18, rz - 0.13), 0.025, magenta))
    # blank: curved path, alternating carbon / neon, helix of beads, floating rings
    n = 14
    seg_len = (length - grip_len - 0.05) / n
    pos = Vector((0, 0, grip_len + 0.05))
    ang = 0.0
    pts = [pos.copy()]
    for i in range(n):
        t = i / n
        r0 = 0.027 * (1 - t) + 0.008 * t
        r1 = 0.027 * (1 - (i + 1) / n) + 0.008 * (i + 1) / n
        ang += 0.40 * (0.04 + 0.5 * t * t) / n * 3.0
        d = Vector((math.sin(ang), 0, math.cos(ang)))
        nxt = pos + d * seg_len
        parts.append(tube(coll, f"{key}_blank{i}", pos, nxt, r0, r1, cyan if i % 4 == 3 else carbon, seg=6))
        pos = nxt
        pts.append(pos.copy())
    for i in range(46):
        t = i / 45 * (len(pts) - 1)
        i0 = min(int(t), len(pts) - 2)
        p = pts[i0].lerp(pts[i0 + 1], t - i0)
        phi = i * 0.9
        rad = 0.042 * (1 - 0.6 * i / 45)
        parts.append(gem(coll, f"{key}_bead{i}", (p.x + math.cos(phi) * rad, p.y + math.sin(phi) * rad, p.z), 0.013 * (1 - 0.5 * i / 45), [cyan, magenta][i % 2]))
    for i, idx in enumerate((3, 6, 9, 12)):
        c = pts[idx]
        parts += ring_xy(coll, f"{key}_orbit{i}", (c.x, c.y, c.z), 0.095 - 0.01 * i, 0.007, violet if i % 2 else cyan, seg=14)
        parts.append(tube(coll, f"{key}_eyelet{i}", (c.x, c.y + 0.015, c.z), (c.x, c.y + 0.065, c.z), 0.005, 0.004, gold, seg=4))
    # tip orb with spikes + comet trail
    tip = pts[-1]
    parts.append(gem(coll, key + "_orb", (tip.x, tip.y, tip.z), 0.06, white))
    for i in range(4):
        a = i * math.pi / 2
        parts.append(tube(coll, f"{key}_orbspike{i}", tip, tip + Vector((math.cos(a) * 0.07, math.sin(a) * 0.07, 0.04)), 0.01, 0.002, cyan, seg=4))
    for i in range(8):
        parts.append(gem(coll, f"{key}_comet{i}", (tip.x + 0.05 * (i + 1), tip.y + 0.02 * i, tip.z - 0.06 * (i + 1) ** 0.9), 0.045 * (1 - i / 9), [white, cyan, magenta][i % 3]))
    # halo + sparks on the ground
    parts += ring_xy(coll, key + "_halo1", (0, 0, 0.012), 0.34, 0.012, cyan, seg=28)
    parts += ring_xy(coll, key + "_halo2", (0, 0, 0.012), 0.46, 0.009, magenta, seg=28)
    for i in range(10):
        a = 2 * math.pi * i / 10
        parts.append(tube(coll, f"{key}_beam{i}", (math.cos(a) * 0.4, math.sin(a) * 0.4, 0.02), (math.cos(a) * 0.3, math.sin(a) * 0.3, 1.5 + 0.2 * (i % 3)), 0.016, 0.002, [cyan, magenta, violet][i % 3], seg=4))
    rr = random.Random(11)
    for i in range(22):
        a = rr.uniform(0, 2 * math.pi)
        rad = rr.uniform(0.12, 0.3)
        parts.append(gem(coll, f"{key}_spk{i}", (math.cos(a) * rad, math.sin(a) * rad, rr.uniform(0.1, 2.1)), rr.uniform(0.012, 0.026), [white, cyan, magenta, violet][i % 4]))
    return L.join(coll, key, parts)


# ---------------------------------------------------------------- build
sc = L.new_build_scene("ITEMS_fishing")
coll = bpy.data.collections.new("FishingItems")
sc.collection.children.link(coll)

M["eye_w"] = mat("IT_EyeWhite", "#f4f1ea", 0.4, var=0.01)
M["eye_b"] = mat("IT_EyeBlack", "#16181c", 0.3, var=0.01)

FISH = {
    "roach": dict(rarity="common", L=0.30, H=0.10, W=0.055, body=("#9fb4a8", 0.55, "noise", None), belly=("#e7e9e2", 0.55), fin=("#e0674a", 0.6), tail="fork"),
    "perch": dict(rarity="common", L=0.32, H=0.12, W=0.06, body=("#6f9a52", 0.6, "stripes", "#4e7a3a"), belly=("#f0e2a8", 0.6), fin=("#e2753a", 0.6), tail="fork", dorsal=1.3, spikes=3),
    "trout": dict(rarity="rare", L=0.50, H=0.13, W=0.07, body=("#7fb4cf", 0.5, "checker", "#5d97b8"), belly=("#f4ecd9", 0.5), fin=("#f0a1b8", 0.55), tail="round"),
    "koi": dict(rarity="rare", L=0.55, H=0.15, W=0.09, body=("#f4f0e6", 0.45, "checker", "#e5552f"), belly=("#fbf8f0", 0.45), fin=("#f3b093", 0.5), tail="long", whiskers=True, long_dorsal=True),
    "golden_arowana": dict(rarity="legendary", L=0.80, H=0.17, W=0.09, body=("#f0b82e", 0.28, "checker", "#c98a14"), belly=("#ffe38a", 0.28), fin=("#ff8a2a", 0.3), tail="long", whiskers=True, long_dorsal=True, spikes=0, emit="#ffb43a"),
}

objs = []
fish_info = []
for i, (key, d) in enumerate(FISH.items()):
    if key == "golden_arowana":
        o = arowana(coll, "Fish_" + key)
        o.location = (0, 0, 0)
        objs.append((("fish", key), o))
        continue
    b_, br, bp, ba = d["body"]
    emit = d.get("emit")
    body = mat(f"IT_Fish_{key}_Body", b_, br, bp, 0.03, accent=ba, emit=emit)
    belly = mat(f"IT_Fish_{key}_Belly", d["belly"][0], d["belly"][1], "noise", 0.02)
    fin = mat(f"IT_Fish_{key}_Fin", d["fin"][0], d["fin"][1], "noise", 0.03, emit=emit)
    o = fish(coll, "Fish_" + key, d["L"], d["H"], d["W"], body, belly, fin, tail=d["tail"], dorsal=d.get("dorsal", 1.0),
             long_dorsal=d.get("long_dorsal", False), whiskers=d.get("whiskers", False), spikes=d.get("spikes", 0))
    o.location = (0, 0, 0)
    objs.append((("fish", key), o))

ROD = {
    "wood": dict(length=2.2, bend=0.30,
                 blank=[mat("IT_Rod_Wood", "#a9794a", 0.8, "planks", 0.05, accent="#8a5f38"), mat("IT_Rod_WoodLight", "#c39560", 0.8, "planks", 0.05, accent="#a9794a")],
                 grip=mat("IT_Rod_WoodGrip", "#6e4f33", 0.9, "planks", 0.04, accent="#573d28"),
                 reel_body=mat("IT_Rod_WoodReel", "#8a929c", 0.45, var=0.03), reel_acc=mat("IT_Rod_WoodReelCap", "#5a626c", 0.45, var=0.03),
                 ring=mat("IT_Rod_WoodRing", "#c9ced6", 0.35, var=0.03), ferrule=mat("IT_Rod_WoodFerrule", "#7b5a3a", 0.7, var=0.03), gem=None),
    "gold": dict(length=2.3, bend=0.34,
                 blank=[mat("IT_Rod_Gold", "#e8bd3c", 0.3, var=0.03), mat("IT_Rod_GoldDeep", "#c8951f", 0.3, var=0.03)],
                 grip=mat("IT_Rod_GoldGrip", "#5a3a24", 0.85, "planks", 0.04, accent="#432a1a"),
                 reel_body=mat("IT_Rod_GoldReel", "#f2cc55", 0.25, var=0.03), reel_acc=mat("IT_Rod_GoldReelCap", "#b8861a", 0.3, var=0.03),
                 ring=mat("IT_Rod_GoldRing", "#fff0b8", 0.25, var=0.02), ferrule=mat("IT_Rod_GoldFerrule", "#a8741a", 0.3, var=0.03),
                 gem=mat("IT_Rod_GoldGem", "#d23c4a", 0.2, var=0.03, emit="#ff5a6a")),
    "premium": dict(length=2.4, bend=0.38,
                    blank=[mat("IT_Rod_Carbon", "#23262e", 0.35, "checker", 0.02, accent="#2e323c"), mat("IT_Rod_NeonBand", "#46e6ff", 0.3, var=0.02, emit="#46e6ff")],
                    grip=mat("IT_Rod_PremiumGrip", "#2b1f3d", 0.7, "stripes", 0.03, accent="#3b2a55"),
                    reel_body=mat("IT_Rod_PremiumReel", "#2a2f3a", 0.3, var=0.02), reel_acc=mat("IT_Rod_PremiumReelCap", "#a56bff", 0.3, var=0.02, emit="#a56bff"),
                    ring=mat("IT_Rod_PremiumRing", "#46e6ff", 0.25, var=0.02, emit="#46e6ff"), ferrule=mat("IT_Rod_PremiumFerrule", "#6b3fd0", 0.3, var=0.02, emit="#6b3fd0"),
                    gem=mat("IT_Rod_PremiumGem", "#7ff2ff", 0.15, var=0.01, emit="#46e6ff")),
}
for key, d in ROD.items():
    if key == "premium":
        o = rod_legendary(coll, "Rod_" + key)
        o.location = (0, 0, 0)
        objs.append((("rods", key), o))
        continue
    o = rod(coll, "Rod_" + key, d["length"], d["blank"], d["grip"], d["reel_body"], d["reel_acc"], d["ring"], d["ferrule"], d["gem"], bend=d["bend"])
    o.location = (0, 0, 0)
    objs.append((("rods", key), o))

bpy.context.view_layer.update()

# lay everything out in a row only for inspection; exports use per-object copies at the origin
report = []
for (kind, key), o in objs:
    tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
    low = min((o.matrix_world @ Vector(c)).z for c in o.bound_box)
    dims = tuple(round(x, 3) for x in o.dimensions)
    report.append({"kind": kind, "key": key, "tris": tris, "min_y": round(low, 3), "dims": dims})
    if low < -0.001 or low > 0.03:
        raise RuntimeError(f"{kind}/{key} not grounded (min y = {low})")


def preview(o, path, rotate_y=0.0, res=512, glow=False):
    """Transparent ortho render of one object, 3/4 view."""
    import contextlib
    import io
    others = [x for _, x in objs if x is not o]
    for x in others:
        x.hide_render = True
    o.hide_render = False
    o.rotation_euler = (0, rotate_y, 0)
    bpy.context.view_layer.update()
    corners = [o.matrix_world @ Vector(c) for c in o.bound_box]
    ctr = sum(corners, Vector()) / 8
    cam_data = bpy.data.cameras.new("PV_cam")
    cam_data.type = "ORTHO"
    cam = bpy.data.objects.new("PV_cam", cam_data)
    sc.collection.objects.link(cam)
    cam.location = ctr + Vector((0.45, -1.0, 0.55)).normalized() * 6
    cam.rotation_euler = (ctr - cam.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.view_layer.update()
    inv = cam.matrix_world.inverted()
    pts = [inv @ c for c in corners]
    w = max(p.x for p in pts) - min(p.x for p in pts)
    h = max(p.y for p in pts) - min(p.y for p in pts)
    cam_data.ortho_scale = max(w, h) * 1.18
    cx = (max(p.x for p in pts) + min(p.x for p in pts)) / 2
    cy = (max(p.y for p in pts) + min(p.y for p in pts)) / 2
    cam_data.shift_x = cx / cam_data.ortho_scale
    cam_data.shift_y = cy / cam_data.ortho_scale
    sc.camera = cam
    sun = None
    if glow:
        # legendary pieces: real lighting so the emissive materials actually glow in the preview
        sc.render.engine = "BLENDER_EEVEE"
        if sc.world is None:
            sc.world = bpy.data.worlds.new("ITEMS_world")
        sc.world.use_nodes = True
        bg = sc.world.node_tree.nodes.get("Background")
        if bg is not None:
            bg.inputs["Color"].default_value = (0.35, 0.38, 0.45, 1.0)
            bg.inputs["Strength"].default_value = 0.8
        sun = bpy.data.objects.new("PV_sun", bpy.data.lights.new("PV_sun", "SUN"))
        sun.data.energy = 2.2
        sc.view_settings.view_transform = "Standard"
        sun.rotation_euler = (0.9, 0.2, 0.6)
        sc.collection.objects.link(sun)
    else:
        sc.render.engine = "BLENDER_WORKBENCH"
    sh = sc.display.shading
    sh.light = "STUDIO"
    sh.color_type = "TEXTURE"
    sh.show_shadows = False
    sh.show_cavity = False
    sc.render.resolution_x = sc.render.resolution_y = res
    sc.render.film_transparent = True
    sc.render.filepath = path
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    old = bpy.context.window.scene
    bpy.context.window.scene = sc
    with contextlib.redirect_stdout(io.StringIO()):
        bpy.ops.render.render(write_still=True)
    bpy.context.window.scene = old
    bpy.data.objects.remove(cam, do_unlink=True)
    if sun is not None:
        bpy.data.objects.remove(sun, do_unlink=True)
    o.rotation_euler = (0, 0, 0)
    for x in others:
        x.hide_render = False
    bpy.context.view_layer.update()


for (kind, key), o in objs:
    folder = os.path.join(OUT, kind, key)
    L.export_glb(os.path.join(folder, "model.glb"), [o])
    preview(o, os.path.join(folder, "preview.png"), rotate_y=(-0.62 if kind == "rods" else 0.0), glow=key in ("golden_arowana", "premium"))

L.write_json(os.path.join(OUT, "items.report.json"), report)
result = report
