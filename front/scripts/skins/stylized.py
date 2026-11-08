if "SKINS_DIR" not in globals():
    raise RuntimeError("Run these scripts through run_stylized.py: they share state via exec().")

# Stylized characters (prototype). Shapes are swept sections and simple volumes fused into one smooth surface by a
# voxel remesh, then relaxed and decimated for the web: a sculpted look from a deterministic script. Joints sit where
# the shared 21-bone rig (lib.py BONES / SIDE) has them, so the body can be skinned to it.

from mathutils import Vector as V3


# ---------------------------------------------------------------- volume helpers

def blob(bm, center, radii, seg=20, rings=14, rot=(0, 0, 0)):
    r = bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    m = Matrix.LocRotScale(V3(center), Euler(rot).to_quaternion(), V3(radii))
    bmesh.ops.transform(bm, matrix=m, verts=r['verts'])


def tube(bm, a, b, r0, r1):
    """Spheres along a -> b, radius r0 -> r1: a smooth tapered cylinder once remeshed."""
    a, b = V3(a), V3(b)
    n = max(3, int((b - a).length / (min(r0, r1) * 0.45)))
    for i in range(n + 1):
        t = i / n
        r = r0 + (r1 - r0) * t
        blob(bm, a.lerp(b, t), (r, r, r), seg=12, rings=8)


def chain(bm, pts, radii):
    """tube() through several points."""
    for (a, ra), (b, rb) in zip(zip(pts, radii), zip(pts[1:], radii[1:])):
        tube(bm, a, b, ra, rb)


def obj_from(bm, name, coll):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    return ob


def apply_mod(ob, mod):
    with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob], selected_editable_objects=[ob]):
        bpy.ops.object.modifier_apply(modifier=mod.name)


def remesh(ob, voxel):
    m = ob.modifiers.new("Remesh", 'REMESH')
    m.mode = 'VOXEL'
    m.voxel_size = voxel
    m.adaptivity = 0.0
    apply_mod(ob, m)


def relax(ob, factor=0.6, iterations=6):
    m = ob.modifiers.new("Smooth", 'SMOOTH')
    m.factor = factor
    m.iterations = iterations
    apply_mod(ob, m)


def decimate(ob, target_tris):
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    if tris <= target_tris:
        return
    m = ob.modifiers.new("Decimate", 'DECIMATE')
    m.ratio = target_tris / tris
    apply_mod(ob, m)


def carve(ob, cutters):
    """Boolean difference with temporary ellipsoids, one at a time: overlapping cutters joined into one mesh make the
    boolean fail."""
    for center, radii in cutters:
        bm = bmesh.new()
        blob(bm, center, radii, seg=24, rings=16)
        cut = obj_from(bm, ob.name + "_cut", ob.users_collection[0])
        m = ob.modifiers.new("Carve", 'BOOLEAN')
        m.operation = 'DIFFERENCE'
        m.solver = 'EXACT'
        m.object = cut
        apply_mod(ob, m)
        bpy.data.objects.remove(cut, do_unlink=True)


def flatten_below(ob, z):
    """Cut everything under z (flat soles)."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces), plane_co=(0, 0, z), plane_no=(0, 0, -1), clear_outer=True)
    bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0)
    bm.to_mesh(ob.data)
    bm.free()


def smooth_shade(ob):
    for p in ob.data.polygons:
        p.use_smooth = True


def paint(ob, fn):
    """Vertex colour per corner from fn(co) -> (r, g, b): white keeps the material colour (the skin tint), darker or
    redder areas (lips, cheeks) multiply it, so any skin tone keeps them."""
    me = ob.data
    attr = me.color_attributes.new("Col", 'FLOAT_COLOR', 'CORNER')
    for poly in me.polygons:
        for li in poly.loop_indices:
            r, g, b = fn(me.vertices[me.loops[li].vertex_index].co)
            attr.data[li].color = (r, g, b, 1.0)


def vc_mat(name, color, rough=0.6):
    """Material whose base colour is `color` x the vertex colours (exported as COLOR_0)."""
    m = mat(name, color, rough=rough)
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    if not any(n.type == 'VERTEX_COLOR' for n in nt.nodes):
        vc = nt.nodes.new('ShaderNodeVertexColor')
        vc.layer_name = "Col"
        mix = nt.nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        mix.inputs['Factor'].default_value = 1.0
        mix.inputs[6].default_value = bsdf.inputs["Base Color"].default_value
        nt.links.new(vc.outputs['Color'], mix.inputs[7])
        nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    return m


def falloff(co, center, radii):
    d = ((co.x - center[0]) / radii[0]) ** 2 + ((co.y - center[1]) / radii[1]) ** 2 + ((co.z - center[2]) / radii[2]) ** 2
    return max(0.0, 1.0 - d)


def mix3(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def white(_co):
    return (1.0, 1.0, 1.0)


# ---------------------------------------------------------------- proportions

SEX = {
    "m": dict(glute=0.08, neck=0.056, chin=0.019, brow=0.011, brow_w=0.0075, lips=(0.022, 0.0058), nose=(0.0125, 0.017),
              bust=0.0, arm=1.0, leg=1.0, hand=1.0, jaw=1.0),
    "f": dict(glute=0.088, neck=0.047, chin=0.015, brow=0.006, brow_w=0.005, lips=(0.0205, 0.0075), nose=(0.0102, 0.014),
              bust=0.062, arm=0.86, leg=1.03, hand=0.9, jaw=0.88),
}



# ---------------------------------------------------------------- body

# Torso cross-sections from crotch to neck: (z, half width, half depth, forward offset), swept as one surface.
TORSO = {
    "m": [(0.84, 0.13, 0.095, 0.012), (0.9, 0.162, 0.112, 0.014), (0.97, 0.164, 0.11, 0.01), (1.05, 0.15, 0.1, 0.002),
          (1.12, 0.143, 0.097, -0.004), (1.2, 0.152, 0.103, -0.008), (1.3, 0.17, 0.113, -0.01), (1.38, 0.18, 0.116, -0.008),
          (1.45, 0.19, 0.104, 0.0), (1.5, 0.168, 0.09, 0.012), (1.55, 0.112, 0.074, 0.016), (1.6, 0.06, 0.056, 0.014),
          (1.67, 0.05, 0.05, 0.008)],
    "f": [(0.84, 0.13, 0.095, 0.014), (0.9, 0.17, 0.115, 0.018), (0.97, 0.172, 0.112, 0.012), (1.05, 0.148, 0.098, 0.002),
          (1.12, 0.123, 0.088, -0.004), (1.2, 0.13, 0.092, -0.008), (1.3, 0.148, 0.1, -0.01), (1.38, 0.155, 0.1, -0.008),
          (1.45, 0.165, 0.094, 0.0), (1.5, 0.148, 0.082, 0.012), (1.55, 0.096, 0.064, 0.015), (1.6, 0.05, 0.048, 0.013),
          (1.67, 0.043, 0.043, 0.008)],
}
# arm: shoulder root, deltoid, bicep, elbow, forearm, wrist; leg: hip, thigh, above knee, knee, calf, ankle
ARM = [((0.11, 0.0, 1.5), 0.066), ((0.2, 0.0, 1.47), 0.074), ((0.25, 0.0, 1.39), 0.062), ((0.3, 0.0, 1.3), 0.056),
       ((0.34, 0.0, 1.22), 0.046), ((0.37, 0.0, 1.15), 0.052), ((0.4, 0.0, 1.06), 0.044), ((0.43, 0.0, 0.975), 0.033)]
LEG = [((0.092, 0.0, 0.95), 0.094), ((0.098, -0.003, 0.8), 0.084), ((0.1, -0.005, 0.6), 0.066), ((0.1, -0.006, 0.5), 0.053),
       ((0.1, 0.0, 0.4), 0.06), ((0.1, 0.004, 0.25), 0.047), ((0.1, 0.01, 0.1), 0.034)]


def build_body(coll, sex):
    p = SEX[sex]
    M = Mesh("Body_" + sex)
    skin = vc_mat("Skin", "e8b896")
    rows = TORSO[sex]
    add_sweep(M, skin, [(0, r[3], r[0]) for r in rows], [(r[1], r[2]) for r in rows], seg=28, per=4, ref=(0, -1, 0), power=2.15)
    for sg in (1, -1):
        add_sweep(M, skin, [(x * sg, y, z) for (x, y, z), _ in ARM], [(r * p["arm"], r * p["arm"]) for _, r in ARM], seg=16, per=4)
        add_sweep(M, skin, [(x * sg, y, z) for (x, y, z), _ in LEG], [(r * p["leg"], r * p["leg"]) for _, r in LEG], seg=18, per=4)
        add_ellipsoid(M, skin, (0.072 * sg, 0.062, 0.9), (p["glute"], p["glute"] * 0.8, p["glute"] * 0.95), seg=18, rings=12)
        add_ellipsoid(M, skin, (0.1 * sg, 0.028, 0.39), (0.042 * p["leg"], 0.04, 0.075), seg=16, rings=10)  # calf
        add_ellipsoid(M, skin, (0.1 * sg, -0.042, 0.505), (0.024, 0.014, 0.028), seg=14, rings=10)  # knee cap
        # collarbone and the neck muscle running to the sternum
        add_sweep(M, skin, [(0.015 * sg, -0.072, 1.505), (0.08 * sg, -0.06, 1.515), (0.16 * sg, -0.03, 1.52)], [(0.009, 0.009)] * 3, seg=10, per=3)
        add_sweep(M, skin, [(0.05 * sg, 0.005, 1.66), (0.035 * sg, -0.03, 1.59), (0.018 * sg, -0.06, 1.52)], [(0.012, 0.012)] * 3, seg=10, per=3)
        # feet: heel, arch, ball, toes, ankle bones
        add_sweep(M, skin, [(0.1 * sg, 0.035, 0.04), (0.1 * sg, 0.01, 0.075), (0.1 * sg, -0.05, 0.04), (0.1 * sg, -0.12, 0.026), (0.1 * sg, -0.168, 0.02)],
                  [(0.032, 0.036), (0.037, 0.04), (0.042, 0.032), (0.045, 0.022), (0.034, 0.016)], seg=14, per=3)
        for side in (1, -1):
            add_ellipsoid(M, skin, ((0.1 + 0.03 * side) * sg, 0.012, 0.085), (0.012, 0.014, 0.014), seg=10, rings=8)
        if p["bust"]:
            add_ellipsoid(M, skin, (0.07 * sg, -0.07, 1.335), (p["bust"], p["bust"] * 0.8, p["bust"] * 0.85), seg=18, rings=12)
        else:
            add_ellipsoid(M, skin, (0.072 * sg, -0.078, 1.385), (0.08, 0.034, 0.056), seg=18, rings=12)
    ob = M.finish(coll)
    remesh(ob, 0.005)
    flatten_below(ob, 0.002)
    relax(ob, 0.55, 10)
    decimate(ob, 3900)
    smooth_shade(ob)
    paint(ob, white)
    ob.data.materials.clear()
    ob.data.materials.append(skin)
    return ob


def build_hands(coll, sex):
    """Palm, four fingers curling slightly towards the palm, and a thumb: a finer mesh of its own."""
    k = SEX[sex]["hand"]
    bm = bmesh.new()
    for sg in (1, -1):
        wrist = V3((0.43 * sg, 0.0, 0.975))
        down = V3((0.04 * sg, 0.0, -0.135)).normalized()
        inward = V3((-sg, 0, 0))
        knuckles = wrist + down * 0.085 * k
        tube(bm, wrist - down * 0.01, knuckles, 0.017 * k, 0.017 * k)  # palm core
        for y in (-0.016, -0.005, 0.006, 0.016):  # palm width
            tube(bm, wrist + down * 0.02 * k + V3((0, y * k, 0)), knuckles + V3((0, y * 1.2 * k, 0)), 0.012 * k, 0.012 * k)
        for (y, length, r) in ((-0.022, 0.068, 0.0084), (-0.0075, 0.076, 0.0086), (0.0075, 0.072, 0.0082), (0.021, 0.058, 0.0072)):
            base = knuckles + V3((0, y * k, 0))
            # relaxed, half-closed hand: each joint bends further towards the palm
            p1 = base + down * length * 0.4 * k + inward * 0.005
            p2 = p1 + (down * 0.25 + inward * 1.0).normalized() * length * 0.3 * k
            p3 = p2 + (down * -0.45 + inward * 0.9).normalized() * length * 0.22 * k
            chain(bm, [base, p1, p2, p3], [r * k, r * 0.95 * k, r * 0.85 * k, r * 0.75 * k])
        # thumb resting across the front of the curled fingers
        t0 = wrist + down * 0.025 * k + V3((0, -0.02 * k, 0)) + inward * 0.006
        t1 = t0 + V3((0, -0.018, -0.016)) * k + inward * 0.012
        t2 = t1 + V3((0, -0.002, -0.016)) * k + inward * 0.014
        chain(bm, [t0, t1, t2], [0.013 * k, 0.0105 * k, 0.0085 * k])
    ob = obj_from(bm, "Hands_" + sex, coll)
    remesh(ob, 0.0016)
    relax(ob, 0.5, 4)
    decimate(ob, 1200)
    smooth_shade(ob)
    paint(ob, white)
    ob.data.materials.append(vc_mat("Skin", "e8b896"))
    return ob


def trimmed_layer(body, name, offset, material, planes):
    """Body copy pushed out along the normals, then cut by planes (point, normal: keeps the side the normal points to):
    tight clothing that never lets the skin poke through."""
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * offset
    for co, no in planes:
        geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no, clear_inner=True)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    body.users_collection[0].objects.link(ob)
    for attr in list(me.color_attributes):
        me.color_attributes.remove(attr)
    me.materials.clear()
    me.materials.append(material)
    smooth_shade(ob)
    return ob


def build_underwear(body, sex):
    m = mat("BB_Briefs", "3d4150", rough=0.8)
    out = []
    for sg in (1, -1):
        out.append(trimmed_layer(body, "Briefs_%d" % sg, 0.003, m, [
            ((0, 0, 1.0), (0, 0, -1)), ((0, 0, 0), (sg, 0, 0)), ((0.2 * sg, 0, 0.0), (-sg, 0, 0)),
            ((0.1 * sg, 0, 0.84), (-0.55 * sg, 0, 1)),
        ]))
    if sex == "f":
        out.append(trimmed_layer(body, "Top_f", 0.003, m, [
            ((0, 0, 1.41), (0, 0, -1)), ((0, 0, 1.27), (0, 0, 1)), ((0.19, 0, 0), (-1, 0, 0)), ((-0.19, 0, 0), (1, 0, 0)),
        ]))
    with bpy.context.temp_override(active_object=out[0], selected_editable_objects=out):
        bpy.ops.object.join()
    out[0].name = "Underwear_" + sex
    return out[0]


# ---------------------------------------------------------------- head: a clean, simple volume

from mathutils.bvhtree import BVHTree

# Head as stacked horizontal sections, chin to crown: (z, half width, front y, back y). Front half flatter (power 2.6)
# than the back (2.0): a calm face plane and a round skull. Kept simple on purpose: the character is in the face
# graphics (eyes, brows, mouth), not in sculpted anatomy.
HEAD_ROWS = [
    (1.606, 0.02, -0.07, -0.05), (1.62, 0.045, -0.083, -0.022), (1.64, 0.062, -0.089, 0.008),
    (1.665, 0.072, -0.092, 0.034), (1.69, 0.079, -0.094, 0.058), (1.715, 0.084, -0.095, 0.076),
    (1.74, 0.088, -0.095, 0.089), (1.765, 0.09, -0.093, 0.097), (1.79, 0.089, -0.088, 0.1),
    (1.815, 0.084, -0.076, 0.097), (1.84, 0.071, -0.056, 0.084), (1.858, 0.048, -0.028, 0.057),
    (1.868, 0.016, -0.005, 0.022),
]


def head_rows(sex, f):
    jaw = f.get("jaw", 1.0) * SEX[sex]["jaw"]
    out = []
    for z, w, yf, yb in HEAD_ROWS:
        lower = max(0.0, min(1.0, (1.7 - z) / 0.09))
        k = 1.0 + (jaw - 1.0) * lower
        out.append((z, w * k * (0.96 if sex == "f" else 1.0), yf, yb))
    return out


def loft_head(bm, rows, seg=40):
    rings = []
    for z, w, yf, yb in rows:
        ring = []
        for j in range(seg):
            a = 2 * PI * j / seg
            s, c = math.sin(a), math.cos(a)
            front = c > 0
            pw = 2.6 if front else 2.0
            ex = math.copysign(abs(s) ** (2.0 / pw), s)
            ey = math.copysign(abs(c) ** (2.0 / pw), c)
            ring.append(bm.verts.new((w * ex, yf * ey if front else -yb * ey, z)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        for j in range(seg):
            bm.faces.new((a[j], a[(j + 1) % seg], b[(j + 1) % seg], b[j]))
    for ring, z, flip in ((rings[0], rows[0][0] - 0.004, True), (rings[-1], rows[-1][0] + 0.006, False)):
        cen = sum((v.co for v in ring), V3()) / len(ring)
        cv = bm.verts.new((cen.x, cen.y, z))
        for j in range(seg):
            bm.faces.new((ring[(j + 1) % seg], ring[j], cv) if flip else (ring[j], ring[(j + 1) % seg], cv))


def build_head(coll, sex, face=None):
    p = SEX[sex]
    f = face or {}
    bm = bmesh.new()
    loft_head(bm, head_rows(sex, f))
    tube(bm, (0, 0.0, 1.55), (0, 0.004, 1.68), p["neck"], p["neck"] * 0.95)
    for sg in (1, -1):  # simple ears
        blob(bm, (0.088 * sg, 0.012, 1.728), (0.012, 0.019, 0.027), rot=(0, 0, -0.35 * sg))
    # a small, soft nose: the face reads from the graphics
    nw = 0.012 * f.get("nose_w", 1.0) * (0.85 if sex == "f" else 1.0)
    nl = 0.011 * f.get("nose_l", 1.0)
    tube(bm, (0, -0.088, 1.735), (0, -0.095 - nl, 1.703), 0.006, nw * 0.7)
    blob(bm, (0, -0.096 - nl, 1.702), (nw * 0.8, nw * 0.6, nw * 0.62))
    ob = obj_from(bm, "Head_" + sex, coll)
    remesh(ob, 0.003)
    relax(ob, 0.5, 6)
    decimate(ob, 1600)
    smooth_shade(ob)

    def colors(co):
        c = (1.0, 1.0, 1.0)
        for sg in (1, -1):  # a touch of warmth on the cheeks
            t = falloff(co, (0.05 * sg, -0.085, 1.69), (0.026, 0.03, 0.02))
            if t > 0:
                c = mix3(c, (1.0, 0.86, 0.84), t * (0.55 if sex == "f" else 0.3))
        return c
    paint(ob, colors)
    ob.data.materials.append(vc_mat("Skin", "e8b896"))
    return ob


# ---------------------------------------------------------------- face graphics, laid on the head surface

# Presets: eye (half spacing, height above the nose base, half width, half height, tilt), brow (length, thickness,
# arch, tilt, lift above the eye), mouth (kind, half width). A face slider later moves these same numbers.
FACES = {
    "m": dict(eye=(0.031, 0.04, 0.0075, 0.0105, 0.0), brow=(0.026, 0.0052, 0.004, 0.18, 0.026), mouth=("smile", 0.018)),
    "f": dict(eye=(0.03, 0.04, 0.0078, 0.0112, 0.0), brow=(0.024, 0.0038, 0.006, 0.1, 0.027), mouth=("smile", 0.017)),
}
NOSE_BASE_Z = 1.702


def shape_ring(cx, cz, rx, rz, tilt=0.0, n=18):
    pts = []
    for i in range(n):
        a = 2 * PI * i / n
        x, z = rx * math.cos(a), rz * math.sin(a)
        pts.append((cx + x * math.cos(tilt) - z * math.sin(tilt), cz + x * math.sin(tilt) + z * math.cos(tilt)))
    return pts


def stroke(points, widths):
    """Closed outline of a stroke of varying width through 2D points (x, z)."""
    left, right = [], []
    for i, (x, z) in enumerate(points):
        x0, z0 = points[max(i - 1, 0)]
        x1, z1 = points[min(i + 1, len(points) - 1)]
        dx, dz = x1 - x0, z1 - z0
        ln = math.hypot(dx, dz) or 1.0
        nx, nz = -dz / ln, dx / ln
        w = widths[i]
        left.append((x + nx * w, z + nz * w))
        right.append((x - nx * w, z - nz * w))
    return left + right[::-1]


class FaceLayer:
    """2D outlines (x, z) projected onto the head along +y, a hair above the skin."""

    def __init__(self, head, name):
        self.tree = rest_tree(head)
        self.M = Mesh(name)

    def project(self, x, z, lift=0.0007):
        hit, normal, _i, _d = self.tree.ray_cast(V3((x, -0.3, z)), V3((0, 1, 0)))
        if hit is None:
            return None
        return hit + normal * lift

    def fill(self, outline, m, lift=0.0007):
        bm = self.M.bm
        cx = sum(p[0] for p in outline) / len(outline)
        cz = sum(p[1] for p in outline) / len(outline)
        ring = [self.project(x, z, lift) for x, z in outline]
        centre = self.project(cx, cz, lift)
        if centre is None or any(p is None for p in ring):
            return
        vs = [bm.verts.new(p) for p in ring]
        vc = bm.verts.new(centre)
        mi = self.M.mi(m)
        for i in range(len(vs)):
            f = bm.faces.new((vc, vs[i], vs[(i + 1) % len(vs)]))
            f.material_index = mi

    def strip(self, points, widths, m, lift=0.0007):
        """A stroke of varying width through 2D points, triangulated as a band (works on curves)."""
        outline = stroke(points, widths)
        n = len(points)
        left, right = outline[:n], outline[n:][::-1]
        bm = self.M.bm
        lv = [self.project(x, z, lift) for x, z in left]
        rv = [self.project(x, z, lift) for x, z in right]
        if any(p is None for p in lv + rv):
            return
        lv = [bm.verts.new(p) for p in lv]
        rv = [bm.verts.new(p) for p in rv]
        mi = self.M.mi(m)
        for i in range(n - 1):
            f = bm.faces.new((lv[i], lv[i + 1], rv[i + 1], rv[i]))
            f.material_index = mi

    def finish(self, coll):
        bm = self.M.bm
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        for f in bm.faces:  # all faces look forward
            if f.normal.y > 0:
                f.normal_flip()
        return self.M.finish(coll, smooth=False)


def build_face(coll, head, sex, face=None, iris="3f2a1d", expression="smile"):
    spec = dict(FACES[sex], **(face or {}))
    L = FaceLayer(head, "Face_" + sex)
    eye_m = mat("BB_Iris", iris, rough=0.85)
    shine = mat("BB_EyeShine", "ffffff", rough=0.2)
    brow_m = mat("BB_Brow", "3b2618", rough=0.8)
    mouth_m = mat("BB_Mouth", "4a1f1c", rough=0.6) if sex == "m" else mat("BB_MouthF", "93343f", rough=0.5)
    ex, ez, ew, eh, etilt = spec["eye"]
    if sex == "f":  # bigger eyes read at a distance
        ew, eh = ew * 1.14, eh * 1.12
    bl, bt, barch, btilt, blift = spec["brow"]
    for sg in (1, -1):
        cx, cz = ex * sg, NOSE_BASE_Z + ez
        L.fill(shape_ring(cx, cz, ew, eh, etilt * sg), eye_m)
        L.fill(shape_ring(cx + 0.0028 * sg, cz + 0.0042, 0.0022, 0.0024), shine, lift=0.0011)
        if sex == "f":  # lash line over the eye and a flick at the outer corner
            arc = [(cx + ew * 1.08 * math.cos(math.radians(a)) * sg, cz + eh * 1.02 * math.sin(math.radians(a))) for a in range(170, 5, -15)]
            L.strip(arc, [0.0007] + [0.0011] * (len(arc) - 2) + [0.0014], eye_m, lift=0.0009)
            L.strip([(cx + ew * 0.95 * sg, cz + eh * 0.35), (cx + (ew + 0.0045) * sg, cz + eh * 0.85)], [0.0013, 0.0005], eye_m, lift=0.0009)
        pts, ws = [], []
        for i in range(7):
            t = i / 6
            px = cx + (t - 0.4) * bl * 2 * sg
            pz = cz + blift + barch * math.sin(PI * t) - btilt * bl * (t - 0.4) * 1.2
            pts.append((px, pz))
            ws.append(bt * (1.0 - 0.75 * t ** 1.5) + 0.0006)
        L.strip(pts, ws, brow_m)
    kind, mw = spec["mouth"]
    mz = NOSE_BASE_Z - 0.035
    if expression == "smile":
        top = [(-mw + 2 * mw * i / 10, mz + 0.002 * (1 - ((i - 5) / 5) ** 2) * 0.3) for i in range(11)]
        bottom = [(mw - 2 * mw * i / 10, mz - 0.0085 * math.sin(PI * i / 10)) for i in range(11)]
        L.fill(top + bottom[1:-1], mouth_m)
    else:  # neutral line
        L.strip([(-mw * 0.8, mz), (0, mz - 0.001), (mw * 0.8, mz)], [0.0011, 0.0014, 0.0011], mouth_m)
    ob = L.finish(coll)
    return ob


def build_beard(coll, head):
    """Full beard: a shell over the jaw with the mouth left free."""
    m = mat("BB_Brow", "3b2618", rough=0.8)
    bm = bmesh.new()
    bm.from_mesh(head.data)
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * 0.003
    mz = NOSE_BASE_Z - 0.035
    planes = [((0, 0, NOSE_BASE_Z - 0.006), (0, 0, -1)), ((0, 0.02, 0), (0, -1, 0)),
              ((0, -0.092, 1.596), (0, -0.075, 0.1))]  # under the jaw: from below the chin back up to the ears
    for co, no in planes:
        bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces), plane_co=co, plane_no=no, clear_inner=True)
    ob = obj_from(bm, "Beard", coll)
    sol = ob.modifiers.new("Thick", 'SOLIDIFY')
    sol.thickness = 0.004
    apply_mod(ob, sol)
    carve(ob, [((0, -0.1, mz - 0.002), (0.024, 0.03, 0.011))])
    remesh(ob, 0.0028)
    relax(ob, 0.5, 4)
    decimate(ob, 700)
    smooth_shade(ob)
    ob.data.materials.clear()
    ob.data.materials.append(m)
    return ob


# ---------------------------------------------------------------- hair: big clean shapes

def hair_shell(rows, seg=36):
    """Closed loft (z, half width, front y, back y) like the head, bigger: one clean volume of hair."""
    bm = bmesh.new()
    loft_head(bm, rows, seg=seg)
    return bm


def head_cap(head, offset, planes, thickness):
    """Copy of the head pushed out along the normals, cut by planes, given a thickness: hair that hugs the skull."""
    bm = bmesh.new()
    bm.from_mesh(head.data)
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * offset
    for co, no in planes:
        bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces), plane_co=co, plane_no=no, clear_inner=True)
    me = bpy.data.meshes.new("cap")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("cap", me)
    head.users_collection[0].objects.link(ob)
    sol = ob.modifiers.new("Thick", 'SOLIDIFY')
    sol.thickness = thickness
    sol.offset = 1.0
    apply_mod(ob, sol)
    return ob


def merge_into(target, other):
    with bpy.context.temp_override(active_object=target, selected_editable_objects=[target, other]):
        bpy.ops.object.join()


def rest_tree(head):
    """BVH of the head at rest: once the rig is animated, the evaluated head is posed and rays would miss it."""
    bm = bmesh.new()
    bm.from_mesh(head.data)
    tree = BVHTree.FromBMesh(bm)
    bm.free()
    return tree


def on_head(tree, d, offset):
    """Point of the head surface in direction d from the skull centre, pushed out by offset."""
    d = V3(d).normalized()
    origin = V3((0, 0.004, 1.75))
    hit, normal, _i, _dist = tree.ray_cast(origin + d * 0.3, -d)
    return (hit if hit is not None else origin + d * 0.1) + d * offset


SHORT_PLANES = [
    ((0, 0, 1.712), (0, 0, 1)),                       # above the ears
    ((0, -0.088, 1.792), (0, 0.55, 0.84)),            # hairline on the forehead
    ((0.08, -0.06, 1.76), (-0.45, 0.45, 0.77)), ((-0.08, -0.06, 1.76), (0.45, 0.45, 0.77)),  # temples
]


def build_hair(coll, style, color="3b2618", head=None):
    m = mat("W_hair_%s_Main" % style, color, rough=0.6)
    if style == "buzz":
        ob = head_cap(head, 0.001, SHORT_PLANES, 0.0028)
        ob.name = "Hair_buzz"
    elif style == "basic":
        ob = head_cap(head, 0.0015, SHORT_PLANES, 0.0045)
        ob.name = "Hair_basic"
        bm = bmesh.new()  # a little volume on top, combed to one side
        blob(bm, (0.012, -0.02, 1.85), (0.078, 0.082, 0.024), seg=28, rings=16, rot=(-0.12, 0.08, 0))
        merge_into(ob, obj_from(bm, "top", coll))
    elif style == "curly":
        ob = head_cap(head, 0.002, SHORT_PLANES, 0.006)
        ob.name = "Hair_curly"
        tree = rest_tree(head)
        bm = bmesh.new()
        rnd = random.Random(5)
        for i in range(70):  # curls spread over the top and back of the head
            theta = math.acos(1 - 2 * rnd.random() * 0.42)
            phi = rnd.uniform(-math.pi, math.pi)
            d = V3((math.sin(theta) * math.sin(phi), -math.sin(theta) * math.cos(phi), math.cos(theta)))
            if d.y < -0.55 and d.z < 0.62:  # keep the forehead clear
                continue
            r = rnd.uniform(0.017, 0.024)
            blob(bm, tuple(on_head(tree, d, 0.006)), (r, r, r * 0.9), seg=12, rings=8)
        merge_into(ob, obj_from(bm, "curls", coll))
    elif style == "ponytail":
        ob = head_cap(head, 0.0015, [((0, -0.088, 1.792), (0, 0.55, 0.84)), ((0, 0, 1.69), (0, 0, 1)),
                                     ((0.08, -0.06, 1.76), (-0.45, 0.45, 0.77)), ((-0.08, -0.06, 1.76), (0.45, 0.45, 0.77))], 0.005)
        ob.name = "Hair_ponytail"
        M = Mesh("tail")
        add_sweep(M, m, [(0, 0.09, 1.79), (0, 0.125, 1.775), (0, 0.14, 1.71), (0, 0.13, 1.63), (0, 0.112, 1.57)],
                  [(0.026, 0.026), (0.03, 0.03), (0.034, 0.03), (0.026, 0.024), (0.01, 0.009)], seg=16, per=4)
        merge_into(ob, M.finish(coll))
    elif style == "short":
        # short back and sides that hug the skull, and a quiff: a wave of volume from the crown up over the forehead
        ob = head_cap(head, 0.0015, SHORT_PLANES, 0.0045)
        ob.name = "Hair_short"
        bm = bmesh.new()  # one rounded volume on top, pushed forward: it melts into the cap
        blob(bm, (0, -0.03, 1.848), (0.08, 0.085, 0.032), seg=28, rings=16, rot=(-0.18, 0, 0))
        blob(bm, (0, -0.07, 1.835), (0.062, 0.042, 0.026), seg=24, rings=14, rot=(-0.35, 0, 0))
        merge_into(ob, obj_from(bm, "quiff", coll))
    else:
        # shoulder-length cut: rounded crown, straight sides, a soft fringe line on the forehead
        rows = [(1.6, 0.1, -0.035, 0.108), (1.625, 0.11, -0.055, 0.117), (1.66, 0.113, -0.07, 0.121), (1.71, 0.112, -0.085, 0.121), (1.76, 0.108, -0.094, 0.118),
                (1.8, 0.102, -0.097, 0.114), (1.84, 0.09, -0.09, 0.104), (1.87, 0.07, -0.072, 0.084),
                (1.89, 0.042, -0.048, 0.054), (1.898, 0.012, -0.014, 0.014)]
        bm = hair_shell(rows)
        ob = obj_from(bm, "Hair_long", coll)
        carve(ob, [((0, -0.12, 1.69), (0.074, 0.08, 0.108)),      # face window, top edge = the fringe
                   ((0, 0.0, 1.66), (0.075, 0.105, 0.09)),        # hollow inside so it sits on the head
                   ((0.018, -0.05, 1.9), (0.0035, 0.055, 0.008))])  # parting
    remesh(ob, 0.0025 if style == "curly" else 0.003)
    relax(ob, 0.3 if style == "curly" else 0.5, 8)
    decimate(ob, 2200 if style == "curly" else 1500)
    smooth_shade(ob)
    ob.data.materials.clear()  # booleans and joins leave other slots in front
    ob.data.materials.append(m)
    ob.data.validate()
    return ob
