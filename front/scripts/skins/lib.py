if "SKINS_DIR" not in globals():
    raise RuntimeError("Run these scripts through run.py (blender --background --python front/scripts/skins/run.py): they share state via exec().")

import bpy, bmesh, math, random
from mathutils import Vector, Matrix, Euler

V = Vector
PI = math.pi

# ---------------------------------------------------------------- scene / collections
def studio():
    sc = bpy.data.scenes.get("SKIN_STUDIO") or bpy.data.scenes.new("SKIN_STUDIO")
    bpy.context.window.scene = sc
    return sc

def wipe(coll_name):
    sc = studio()
    c = bpy.data.collections.get(coll_name)
    if c:
        for o in list(c.objects):
            bpy.data.objects.remove(o, do_unlink=True)
    else:
        c = bpy.data.collections.new(coll_name)
        sc.collection.children.link(c)
    return c

# ---------------------------------------------------------------- materials
_mats = {}
def mat(name, color, metal=0.0, rough=0.5, emit=None, estr=0.0, coat=0.0, alpha=1.0, spec=0.5):
    key = name
    if key in _mats and _mats[key].name in bpy.data.materials:
        return _mats[key]
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    def hexc(h):
        h = h.lstrip('#')
        r, g, bl = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
        f = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
        return (f(r), f(g), f(bl), 1.0)
    b.inputs["Base Color"].default_value = hexc(color)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    try:
        b.inputs["Coat Weight"].default_value = coat
    except Exception:
        pass
    if emit:
        b.inputs["Emission Color"].default_value = hexc(emit)
        b.inputs["Emission Strength"].default_value = estr
    if alpha < 1.0:
        b.inputs["Alpha"].default_value = alpha
        m.blend_method = 'BLEND' if hasattr(m, 'blend_method') else None
    _mats[key] = m
    return m

# ---------------------------------------------------------------- mesh primitives (all bmesh -> object)
class Mesh:
    """Accumulates geometry for one object with per-face material slots."""
    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.mats = []

    def mi(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def finish(self, coll, sharp_deg=52, smooth=True):
        bm = self.bm
        bm.normal_update()
        if smooth:
            for f in bm.faces:
                f.smooth = True
            thr = math.radians(sharp_deg)
            for e in bm.edges:
                if len(e.link_faces) == 2:
                    n0, n1 = e.link_faces[0].normal, e.link_faces[1].normal
                    if n0.length < 1e-6 or n1.length < 1e-6:
                        continue
                    a = n0.angle(n1)
                    if a > thr:
                        e.smooth = False
        me = bpy.data.meshes.new(self.name)
        bm.to_mesh(me)
        bm.free()
        for m in self.mats:
            me.materials.append(m)
        ob = bpy.data.objects.new(self.name, me)
        coll.objects.link(ob)
        return ob


def _xf(bm, verts, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    mt = Matrix.Translation(V(loc)) @ Euler(rot, 'XYZ').to_matrix().to_4x4()
    sm = Matrix.Diagonal(V((*scale, 1)))
    bmesh.ops.transform(bm, matrix=mt @ sm, verts=verts)


def _new_faces(bm, old):
    return [f for f in bm.faces if f not in old]


def _place(M, m, old, loc, rot):
    bm = M.bm
    nf = _new_faces(bm, old)
    vs = list({v for f in nf for v in f.verts})
    for f in nf:
        f.material_index = M.mi(m)
    _xf(bm, vs, loc=loc, rot=rot)


def add_box(M, m, loc, size, rot=(0, 0, 0), bevel=0.008, seg=2):
    bm = M.bm
    old = set(bm.faces)
    r = bmesh.ops.create_cube(bm, size=1.0)
    verts = r['verts']
    _xf(bm, verts, scale=size)
    if bevel > 0:
        edges = list({e for v in verts for e in v.link_edges})
        bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=seg, affect='EDGES', profile=0.6)
    _place(M, m, old, loc, rot)
    return M


def add_ellipsoid(M, m, loc, radii, rot=(0, 0, 0), seg=14, rings=9):
    bm = M.bm
    old = set(bm.faces)
    r = bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    _xf(bm, r['verts'], scale=radii)
    _place(M, m, old, loc, rot)
    return M


def add_cyl(M, m, p0, p1, r0, r1=None, seg=10, cap=True, sx=1.0):
    p0, p1 = V(p0), V(p1)
    r1 = r0 if r1 is None else r1
    d = p1 - p0
    L = d.length
    bm = M.bm
    old = set(bm.faces)
    res = bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=seg, radius1=r0, radius2=r1, depth=L)
    q = V((0, 0, 1)).rotation_difference(d.normalized())
    mt = Matrix.Translation((p0 + p1) / 2) @ q.to_matrix().to_4x4() @ Matrix.Diagonal(V((sx, 1, 1, 1)))
    bmesh.ops.transform(bm, matrix=mt, verts=res['verts'])
    for f in _new_faces(bm, old):
        f.material_index = M.mi(m)
    return M


def catmull(p0, p1, p2, p3, t):
    t2, t3 = t * t, t * t * t
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)


def resample(items, per):
    """items: list of vectors (any dimension, as mathutils.Vector). Catmull-Rom through them."""
    out = []
    n = len(items)
    for i in range(n - 1):
        p0 = items[max(i - 1, 0)]; p1 = items[i]; p2 = items[i + 1]; p3 = items[min(i + 2, n - 1)]
        for k in range(per):
            out.append(catmull(p0, p1, p2, p3, k / per))
    out.append(items[-1].copy())
    return out


def add_sweep(M, m, pts, radii, seg=14, per=3, ref=(0, -1, 0), power=2.0, caps=(True, True), closed=False,
              twist=0.0, mod=None, front_bias=0.0):
    """Sweep an elliptical (super-ellipse) profile along a polyline.
    radii entries: (rx, ry) or (rx, ry, ox) with ox shifting profile along side axis, ry front.
    rx = extent perpendicular to path inside the 'side' direction, ry = extent along ref axis.
    mod(i_param) -> multiplier on radii for baffles etc. (receives 0..1 along path)."""
    bm = M.bm
    P = [V(p) for p in pts]
    R = [V((r[0], r[1], r[2] if len(r) > 2 else 0.0)) for r in radii]
    Pr = resample(P, per) if not closed else resample(P + [P[0]], per)[:-1]
    Rr = resample(R, per) if not closed else resample(R + [R[0]], per)[:-1]
    n = len(Pr)
    ref = V(ref).normalized()
    rings = []
    for i in range(n):
        if closed:
            t = (Pr[(i + 1) % n] - Pr[(i - 1) % n])
        else:
            t = Pr[min(i + 1, n - 1)] - Pr[max(i - 1, 0)]
        t = t.normalized()
        rf = ref
        if abs(t.dot(rf)) > 0.92:
            rf = V((1, 0, 0))
        side = t.cross(rf).normalized()
        front = side.cross(t).normalized()
        # make front point toward ref
        if front.dot(ref) < 0:
            front = -front
        k = mod(i / max(n - 1, 1)) if mod else 1.0
        rx, ry, ox = Rr[i].x * k, Rr[i].y * k, Rr[i].z
        ring = []
        for j in range(seg):
            a = 2 * PI * j / seg + twist
            c, s = math.cos(a), math.sin(a)
            ex = math.copysign(abs(c) ** (2.0 / power), c)
            ey = math.copysign(abs(s) ** (2.0 / power), s)
            pos = Pr[i] + side * (ex * rx + ox) + front * (ey * ry)
            ring.append(bm.verts.new(pos))
        rings.append(ring)
    mi = M.mi(m)
    faces = []
    for i in range(n - 1 if not closed else n):
        a = rings[i]; b = rings[(i + 1) % n]
        for j in range(seg):
            f = bm.faces.new((a[j], a[(j + 1) % seg], b[(j + 1) % seg], b[j]))
            f.material_index = mi
            faces.append(f)
    if not closed:
        for ci, (ring, flip) in enumerate(((rings[0], True), (rings[-1], False))):
            if not caps[ci]:
                continue
            cen = sum((v.co for v in ring), V()) / len(ring)
            cv = bm.verts.new(cen)
            for j in range(seg):
                vs = (ring[(j + 1) % seg], ring[j], cv) if flip else (ring[j], ring[(j + 1) % seg], cv)
                f = bm.faces.new(vs)
                f.material_index = mi
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    return M


def add_poly_prism(M, m, outline, z0, z1, bevel=0.0):
    """extruded 2D outline (list of (x,y)) between z0 and z1."""
    bm = M.bm
    bv0 = [bm.verts.new((x, y, z0)) for x, y in outline]
    f = bm.faces.new(bv0)
    res = bmesh.ops.extrude_face_region(bm, geom=[f])
    nv = [e for e in res['geom'] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(0, 0, z1 - z0), verts=nv)
    fs = [e for e in res['geom'] if isinstance(e, bmesh.types.BMFace)]
    for ff in fs + [f]:
        ff.material_index = M.mi(m)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    return M


# ---------------------------------------------------------------- rig
BONES = {
    # name: (head, tail, parent)
    'Hips':       ((0, 0, 0.93), (0, 0, 1.06), None),
    'Spine':      ((0, 0, 1.06), (0, 0, 1.28), 'Hips'),
    'Chest':      ((0, 0, 1.28), (0, 0, 1.52), 'Spine'),
    'Neck':       ((0, 0, 1.52), (0, 0, 1.64), 'Chest'),
    'Head':       ((0, 0, 1.64), (0, 0, 1.88), 'Neck'),
}
SIDE = {
    'Shoulder': ((0.05, 0, 1.49), (0.19, 0, 1.50), 'Chest'),
    'UpperArm': ((0.19, 0, 1.50), (0.34, 0, 1.22), 'Shoulder'),
    'LowerArm': ((0.34, 0, 1.22), (0.43, 0, 0.97), 'UpperArm'),
    'Hand':     ((0.43, 0, 0.97), (0.47, 0, 0.84), 'LowerArm'),
    'UpperLeg': ((0.10, 0, 0.93), (0.10, -0.005, 0.50), 'Hips'),
    'LowerLeg': ((0.10, -0.005, 0.50), (0.10, 0.01, 0.09), 'UpperLeg'),
    'Foot':     ((0.10, 0.01, 0.09), (0.10, -0.11, 0.035), 'LowerLeg'),
    'Toe':      ((0.10, -0.11, 0.035), (0.10, -0.18, 0.02), 'Foot'),
}

def build_armature(extra=None, name="Armature"):
    """extra: dict name -> (head, tail, parent) in +x-side-free world coords (use full names)."""
    sc = studio()
    arm = bpy.data.armatures.new(name)
    ob = bpy.data.objects.new(name, arm)
    sc.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.edit_bones
    def mk(n, h, t, p):
        b = eb.new(n)
        b.head = V(h); b.tail = V(t)
        if p:
            b.parent = eb[p]
        b.use_connect = False
        return b
    for n, (h, t, p) in BONES.items():
        mk(n, h, t, p)
    for suf, sg in (('.L', 1), ('.R', -1)):
        for n, (h, t, p) in SIDE.items():
            hh = V((h[0] * sg, h[1], h[2])); tt = V((t[0] * sg, t[1], t[2]))
            mk(n + suf, hh, tt, (p + suf) if p in ('Shoulder', 'UpperArm', 'LowerArm', 'UpperLeg', 'LowerLeg', 'Foot') else p)
    for n, (h, t, p) in (extra or {}).items():
        mk(n, h, t, p)
    # fix rolls: zero
    for b in eb:
        b.roll = 0
    bpy.ops.object.mode_set(mode='OBJECT')
    return ob


def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
    return (p - (a + ab * t)).length


def weight_auto(ob, arm, bones, sigma=0.07, power=2.0, max_inf=3):
    """Distance-to-bone-segment skinning for obj verts (world==local)."""
    segs = {}
    for n in bones:
        b = arm.data.bones[n]
        segs[n] = (b.head_local.copy(), b.tail_local.copy())
    vg = {n: ob.vertex_groups.new(name=n) for n in bones}
    for v in ob.data.vertices:
        p = v.co
        ds = sorted(((seg_dist(p, *segs[n]), n) for n in bones))[:max_inf]
        ws = [math.exp(-((d / sigma) ** power)) + 1e-6 for d, n in ds]
        s = sum(ws)
        for (d, n), w in zip(ds, ws):
            vg[n].add([v.index], w / s, 'REPLACE')


def weight_rigid(ob, bone):
    vg = ob.vertex_groups.new(name=bone)
    vg.add([v.index for v in ob.data.vertices], 1.0, 'REPLACE')


def join_and_bind(objs, arm, coll, name):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.data.name = name
    ob.parent = arm
    mod = ob.modifiers.new("Armature", 'ARMATURE')
    mod.object = arm
    return ob


# ---------------------------------------------------------------- animation
def _axis_sign(arm, bone, axis, target_axis, target_sign):
    """find sign so rotating `bone` about local axis moves tail toward world target (axis idx, +-1)."""
    pb = arm.pose.bones[bone]
    pb.rotation_mode = 'XYZ'
    pb.rotation_euler = (0, 0, 0)
    bpy.context.view_layer.update()
    base = (arm.matrix_world @ pb.tail).copy()
    e = [0, 0, 0]; e[axis] = 0.3
    pb.rotation_euler = e
    bpy.context.view_layer.update()
    moved = (arm.matrix_world @ pb.tail) - base
    pb.rotation_euler = (0, 0, 0)
    bpy.context.view_layer.update()
    return 1.0 if moved[target_axis] * target_sign > 0 else -1.0


def make_animations(arm, spec, secondary=None, fps=30):
    """spec = dict anim name -> (frames, fn(f01, set)) built by caller."""
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='POSE')
    for pb in arm.pose.bones:
        pb.rotation_mode = 'XYZ'
    ad = arm.animation_data_create()
    for name, (frames, fn) in spec.items():
        act = bpy.data.actions.new(name)
        ad.action = act
        for pb in arm.pose.bones:
            pb.rotation_euler = (0, 0, 0)
            pb.location = (0, 0, 0)
        for fr in range(0, frames + 1):
            ph = (fr % frames) / frames
            def setr(b, x=0.0, y=0.0, z=0.0):
                pb = arm.pose.bones[b]
                pb.rotation_euler = (x, y, z)
                pb.keyframe_insert('rotation_euler', frame=fr + 1)
            def setl(b, x=0.0, y=0.0, z=0.0):
                pb = arm.pose.bones[b]
                pb.location = (x, y, z)
                pb.keyframe_insert('location', frame=fr + 1)
            fn(ph, setr, setl)
        # push to NLA
        tr = ad.nla_tracks.new()
        tr.name = name
        st = tr.strips.new(name, 1, act)
        st.name = name
        ad.action = None
    bpy.ops.object.mode_set(mode='OBJECT')
