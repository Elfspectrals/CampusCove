if "SKINS_DIR" not in globals():
    raise RuntimeError("Run these scripts through run_wear.py (blender --background --python front/scripts/skins/run_wear.py): they share state via exec().")

# Body fits: sex (m, f) x build (slim, normal, broad). Every fit keeps the same 21-bone rig and rest pose, so the
# Idle/Walk/Run clips play the same on all of them; only vertices move. The same deformation runs on the body and on
# the clothes (driven by their bone weights), so a piece always fits the body it is worn on. Head, neck, hands and
# feet never change: hair, head accessories and shoes ship in one fit only.
FIT_KEYS = ("m_slim", "m_normal", "m_broad", "f_slim", "f_normal", "f_broad")
REFERENCE_FIT = "m_normal"
FITTED_SLOTS = ("top", "bottom")

# Torso: (z, kx, ky) knots scaling the offset from the body's vertical axis, by height. Depending on height only
# (not on which bone a vertex follows) keeps layers in order: a top and the trousers under it get the same scale.
SEX_TORSO = {
    "m": [],
    # measured on the reference woman vs man: hips +10-12 %, waist -15 %, shoulders and upper chest -8-10 %, neck -25 %
    "f": [(0.80, 1.1, 1.05), (0.92, 1.18, 1.08), (1.02, 1.06, 1.0), (1.12, 0.82, 0.92), (1.24, 0.9, 1.0),
          (1.42, 0.9, 1.0), (1.5, 0.86, 1.0), (1.56, 0.8, 1.0)],
}
BUILD_TORSO = {
    "slim": [(0.80, 0.9, 0.9), (1.10, 0.85, 0.85), (1.40, 0.88, 0.88), (1.56, 0.9, 0.9)],
    "normal": [],
    "broad": [(0.80, 1.1, 1.1), (1.10, 1.2, 1.26), (1.35, 1.2, 1.16), (1.56, 1.14, 1.1)],
}
# Limbs: one radial scale per bone (without .L/.R), around the bone axis
SEX_LIMBS = {"m": {}, "f": {"UpperArm": 0.82, "LowerArm": 0.84, "Hand": 0.86, "UpperLeg": 1.06, "LowerLeg": 0.95}}
BUILD_LIMBS = {
    "slim": {"UpperArm": 0.82, "LowerArm": 0.85, "UpperLeg": 0.88, "LowerLeg": 0.9},
    "normal": {},
    "broad": {"UpperArm": 1.25, "LowerArm": 1.18, "UpperLeg": 1.15, "LowerLeg": 1.1},
}
BUST_DEPTH = {"slim": 0.036, "normal": 0.044, "broad": 0.052}
TORSO = ("Hips", "Spine", "Chest")
# limbs ease back to scale 1 toward the wrist / ankle so hands and feet (shared by every fit) still match
FADE_FROM = {"LowerArm": 0.6, "LowerLeg": 0.55}


def fit_url_suffix(fit):
    return "" if fit == REFERENCE_FIT else "_" + fit


def _profile(knots, z):
    if not knots:
        return 1.0, 1.0
    if z <= knots[0][0]:
        return knots[0][1], knots[0][2]
    for (z0, x0, y0), (z1, x1, y1) in zip(knots, knots[1:]):
        if z <= z1:
            t = (z - z0) / (z1 - z0)
            return x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
    return knots[-1][1], knots[-1][2]


def torso_scale(fit, z):
    sex, build = fit.split("_")
    sx, sy = _profile(SEX_TORSO[sex], z)
    bx, by = _profile(BUILD_TORSO[build], z)
    return sx * bx, sy * by


def limb_scales(fit):
    sex, build = fit.split("_")
    out = dict(SEX_LIMBS[sex])
    for bone, k in BUILD_LIMBS[build].items():
        out[bone] = out.get(bone, 1.0) * k
    return out


def _smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def _bust(co, depth):
    if co.y > -0.02:
        return 0.0
    g = math.exp(-((abs(co.x) - 0.085) / 0.065) ** 2 - ((co.z - 1.355) / 0.07) ** 2)
    return depth * g * min(1.0, (-co.y - 0.02) / 0.06)


def deform_to_fit(ob, arm, fit):
    """Moves ob's vertices (world == local, bound to arm) from the reference fit to `fit`."""
    if fit == REFERENCE_FIT:
        return
    sex, build = fit.split("_")
    limbs = limb_scales(fit)
    segs = {b.name: (b.head_local.copy(), b.tail_local.copy()) for b in arm.data.bones}
    names = {vg.index: vg.name for vg in ob.vertex_groups}
    for v in ob.data.vertices:
        co = v.co.copy()
        disp = V((0.0, 0.0, 0.0))
        torso_w = 0.0
        for g in v.groups:
            if g.weight < 1e-4:
                continue
            name = names[g.group]
            base = name.split(".")[0]
            if base in TORSO:
                torso_w += g.weight
                continue
            k = limbs.get(base, 1.0)
            if k == 1.0 and base != "UpperLeg":
                continue
            a, b = segs[name]
            ab = b - a
            t = (co - a).dot(ab) / max(ab.length_squared, 1e-9)
            w = g.weight
            if base == "UpperLeg":
                # the top of the thigh is where waistbands sit: it follows the torso profile like the top over it
                to_torso = w * (1.0 - _smoothstep(0.05, 0.3, t))
                torso_w += to_torso
                w -= to_torso
            r = co - (a + ab * t)  # offset from the infinite bone line: purely radial, never along the bone
            ease = 1.0 - _smoothstep(FADE_FROM[base], 0.9, t) if base in FADE_FROM else 1.0
            disp += r * ((k - 1) * ease * w)
        if 0.84 < co.z < 1.15 and abs(co.x) < 0.25:
            # waist band: every layer here (skin, top hem, waistband) takes the torso profile alone, whatever its
            # weights, so they scale exactly alike and a waistband never pokes through the top over it
            disp = V((0.0, 0.0, 0.0))
            torso_w = 1.0
        if torso_w > 0:
            kx, ky = torso_scale(fit, co.z)
            disp += V((co.x * (kx - 1), co.y * (ky - 1), 0.0)) * min(1.0, torso_w)
        if sex == "f":
            disp.y -= _bust(co, BUST_DEPTH[build]) * min(1.0, torso_w)
        v.co = co + disp
    ob.data.update()


def fitted_copy(ob, arm, fit, coll):
    c = ob.copy()
    c.data = ob.data.copy()
    coll.objects.link(c)
    deform_to_fit(c, arm, fit)
    return c


def remove_copies(objs):
    for o in objs:
        me = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.meshes.remove(me)


# ---------------------------------------------------------------- keep clothes outside the body

# Minimum gap to the skin per slot. Tops keep more than bottoms, so where both are pushed the top stays over the
# waistband instead of sitting at the same depth (which would flicker).
CLEARANCE = {"top": 0.006, "bottom": 0.003, "shoes": 0.003}


def body_tree(objs):
    """BVH of the body pieces (rest pose, world == local) to measure clothes against."""
    from mathutils.bvhtree import BVHTree
    bm = bmesh.new()
    for o in objs:
        bm.from_mesh(o.data)
    bm.normal_update()
    tree = BVHTree.FromBMesh(bm)
    bm.free()
    return tree


ACCENT_EXTRA = 0.0025


def push_out(ob, tree, clearance):
    """Moves every vertex that is inside the body, or closer than `clearance`, out along the body normal. Trims and
    patches (any material but the piece's _Main) keep a little more, so they stay on top of the cloth they sit on."""
    me = ob.data
    accent = set()
    for poly in me.polygons:
        m = me.materials[poly.material_index] if poly.material_index < len(me.materials) else None
        if m is not None and not m.name.endswith("_Main"):
            accent.update(poly.vertices)
    moved = 0
    for v in me.vertices:
        loc, normal, _i, _d = tree.find_nearest(v.co)
        if loc is None:
            continue
        gap = clearance + (ACCENT_EXTRA if v.index in accent else 0.0)
        if (v.co - loc).dot(normal) < gap:
            v.co = loc + normal * gap
            moved += 1
    if accent:
        # trims also stay outside the cloth of their own piece (a steep waist can pull them under it)
        from mathutils.bvhtree import BVHTree
        bm = bmesh.new()
        bm.from_mesh(me)
        bm.faces.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if any(v.index in accent for v in f.verts)], context='FACES')
        bm.normal_update()
        if len(bm.faces):
            cloth = BVHTree.FromBMesh(bm)
            for i in accent:
                v = me.vertices[i]
                loc, normal, _f, dist = cloth.find_nearest(v.co, 0.03)
                if loc is not None and (v.co - loc).dot(normal) < ACCENT_EXTRA:
                    v.co = loc + normal * ACCENT_EXTRA
        bm.free()
    ob.data.update()
    return moved
