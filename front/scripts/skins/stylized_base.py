if "SKINS_DIR" not in globals():
    raise RuntimeError("Run these scripts through run_wear.py: they share state via exec().")

# Game pieces from the stylized character (stylized.py): the reference body skinned to the shared rig and split into
# the body regions clothes hide (extras.region), a head per sex, and six drawn faces per sex (extras.region = "face",
# extras.face = 1..6). The woman's body is still derived from the reference by fit.py, like the clothes, so every
# piece keeps fitting every body.

BODY_BONES = None  # filled from the armature


def region_of(c):
    """Body region of a face centre (game regions, see check-wear.mjs REGIONS)."""
    x = abs(c.x)
    if c.z < 0.1:
        return "feet"
    if c.z > 1.555:
        return "head"
    if x > 0.172 and c.z > 0.95:
        return "upper_arms" if c.z >= 1.22 else "forearms"
    if c.z >= 1.02:
        return "chest"
    if c.z >= 0.82:
        return "hips"
    if c.z >= 0.5:
        return "thighs"
    return "shins"


def split_regions(ob, coll, arm, name_prefix, classify=region_of, keep_normals=True):
    """One skinned object per region, keeping the whole-body vertex normals so no seam shows between them."""
    me = ob.data
    normals = [v.normal.copy() for v in me.vertices]
    buckets = {}
    for poly in me.polygons:
        buckets.setdefault(classify(poly.center), []).append(poly.index)
    out = []
    for region, polys in buckets.items():
        bm = bmesh.new()
        bm.from_mesh(me)
        keep = set(polys)
        bm.faces.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context='FACES')
        src_index = bm.verts.layers.int.get("src") or None
        piece_me = bpy.data.meshes.new("%s_%s" % (name_prefix, region))
        # remember each kept vertex's original index for its normal
        bm.verts.ensure_lookup_table()
        bm.to_mesh(piece_me)
        bm.free()
        piece = bpy.data.objects.new("%s_%s" % (name_prefix, region), piece_me)
        coll.objects.link(piece)
        for vg in ob.vertex_groups:
            piece.vertex_groups.new(name=vg.name)
        out.append((region, piece))
    # vertex groups and normals: match vertices back by position (pieces are exact copies)
    from mathutils.kdtree import KDTree
    tree = KDTree(len(me.vertices))
    for v in me.vertices:
        tree.insert(v.co, v.index)
    tree.balance()
    names = {vg.index: vg.name for vg in ob.vertex_groups}
    for region, piece in out:
        custom = []
        for v in piece.data.vertices:
            _co, idx, _d = tree.find(v.co)
            src = me.vertices[idx]
            for g in src.groups:
                piece.vertex_groups[names[g.group]].add([v.index], g.weight, 'REPLACE')
            custom.append(normals[idx])
        if keep_normals:
            piece.data.normals_split_custom_set_from_vertices(custom)
        for m in me.materials:
            piece.data.materials.append(m)
        bind(piece, arm)
        piece["region"] = region
    bpy.data.objects.remove(ob, do_unlink=True)
    return [p for _r, p in out]


def build_stylized_base(coll, arm):
    """Reference body (man, normal build) + hands + briefs, skinned and split into regions."""
    bones = [b.name for b in arm.data.bones]
    body = build_body(coll, "m")
    weight_auto(body, arm, bones, sigma=BODY_SIGMA)
    briefs = build_underwear(body, "m")
    for vg in body.vertex_groups:
        briefs.vertex_groups.new(name=vg.name)
    copy_weights(body, briefs)
    hands = build_hands(coll, "m")
    hand_bones = [b for b in bones if b.split(".")[0] in ("LowerArm", "Hand")]
    weight_auto(hands, arm, hand_bones, sigma=0.04)
    pieces = split_regions(body, coll, arm, "Body")
    briefs_pieces = split_regions(briefs, coll, arm, "Briefs", classify=lambda c: "hips")
    bind(hands, arm)
    hands["region"] = "hands"
    hands.name = "Body_hands"
    return pieces + briefs_pieces + [hands]


def build_woman_top(coll, arm, body_pieces):
    """The woman's top: a band of the chest pushed out; the woman fits add the bust to it like to the body."""
    chest = next(o for o in body_pieces if o.get("region") == "chest")
    m = mat("BB_Briefs", "3d4150", rough=0.8)
    top = trimmed_layer(chest, "Top_f", 0.004, m, [
        ((0, 0, 1.42), (0, 0, -1)), ((0, 0, 1.26), (0, 0, 1)), ((0.172, 0, 0), (-1, 0, 0)), ((-0.172, 0, 0), (1, 0, 0)),
    ])
    for vg in chest.vertex_groups:
        top.vertex_groups.new(name=vg.name)
    copy_weights(chest, top)
    bind(top, arm)
    top["region"] = "chest"
    return top


def copy_weights(src, dst):
    """Each dst vertex takes the weights of the nearest src vertex (dst is a pushed-out copy of src)."""
    from mathutils.kdtree import KDTree
    tree = KDTree(len(src.data.vertices))
    for v in src.data.vertices:
        tree.insert(v.co, v.index)
    tree.balance()
    names = {vg.index: vg.name for vg in src.vertex_groups}
    for v in dst.data.vertices:
        _co, idx, _d = tree.find(v.co)
        for g in src.data.vertices[idx].groups:
            dst.vertex_groups[names[g.group]].add([v.index], g.weight, 'REPLACE')


def build_stylized_head(coll, arm, sex):
    head = build_head(coll, sex)
    weight_rigid_blend(head, arm)
    bind(head, arm)
    head["region"] = "head"
    head.name = "Body_head_" + sex
    return head


# Six faces per sex: overrides of stylized.FACES (eye, brow, mouth) and the resting expression.
FACE_PRESETS = {
    "m": [
        dict(),
        dict(eye=(0.033, 0.039, 0.0068, 0.0095, 0.0), brow=(0.027, 0.0062, 0.002, 0.05, 0.024), mouth=("smile", 0.016)),
        dict(eye=(0.03, 0.041, 0.0082, 0.0112, 0.05), brow=(0.024, 0.0045, 0.006, 0.25, 0.028), mouth=("smile", 0.02)),
        dict(eye=(0.032, 0.04, 0.0072, 0.0085, -0.08), brow=(0.028, 0.0068, 0.001, -0.08, 0.022), expression="neutral", mouth=("smile", 0.017)),
        dict(eye=(0.029, 0.04, 0.0078, 0.011, 0.0), brow=(0.025, 0.0055, 0.005, 0.12, 0.027), mouth=("smile", 0.014)),
        dict(eye=(0.034, 0.038, 0.007, 0.01, 0.1), brow=(0.026, 0.006, 0.003, 0.3, 0.025), expression="neutral", mouth=("smile", 0.019)),
    ],
    "f": [
        dict(),
        dict(eye=(0.031, 0.04, 0.0085, 0.0118, 0.06), brow=(0.023, 0.0034, 0.007, 0.14, 0.028), mouth=("smile", 0.016)),
        dict(eye=(0.029, 0.041, 0.0072, 0.0105, -0.05), brow=(0.025, 0.0042, 0.005, 0.05, 0.026), mouth=("smile", 0.018)),
        dict(eye=(0.032, 0.039, 0.008, 0.0095, 0.0), brow=(0.024, 0.0036, 0.008, 0.2, 0.029), expression="neutral", mouth=("smile", 0.016)),
        dict(eye=(0.03, 0.04, 0.0088, 0.0122, 0.1), brow=(0.022, 0.0032, 0.006, 0.0, 0.027), mouth=("smile", 0.015)),
        dict(eye=(0.031, 0.04, 0.0076, 0.0108, 0.0), brow=(0.026, 0.004, 0.004, 0.22, 0.026), expression="neutral", mouth=("smile", 0.019)),
    ],
}


def build_face_presets(coll, arm, head, sex):
    out = []
    for i, preset in enumerate(FACE_PRESETS[sex], start=1):
        spec = {k: v for k, v in preset.items() if k != "expression"}
        ob = build_face(coll, head, sex, face=spec, expression=preset.get("expression", "smile"))
        ob.name = "Body_face_%s%d" % (sex, i)
        weight_rigid(ob, "Head")
        bind(ob, arm)
        ob["region"] = "face"
        ob["face"] = i
        out.append(ob)
    return out


def build_stylized_hair(coll, arm, key, head):
    """Haircut piece for wear/hair/<key>/: built on the reference head, rigid on the Head bone."""
    style = {"basic": "basic", "short": "short", "long": "long", "curly": "curly", "buzz": "buzz", "ponytail": "ponytail"}[key]
    spec = WEAR["hair"]["items"][key]
    ob = build_hair(coll, style, spec["main"], head)
    apply_hair_sculpt(ob, key, head)  # sculpt_bake.py: locks baked into a normal map when a sculpt exists
    ob.name = "Wear_hair_" + key
    for slot_mat in ob.data.materials:
        slot_mat.name = "W_hair_%s_Main" % key
    weight_rigid(ob, "Head")
    bind(ob, arm)
    ob["slot"] = "hair"
    ob["hides"] = ""
    return ob


# ---------------------------------------------------------------- headwear on the new head

HEADSET_STYLE = {  # band width, cup radius
    "gamer": (0.03, 0.058), "studio": (0.016, 0.046), "cat_ear": (0.022, 0.05), "neon": (0.024, 0.052), "pilot": (0.03, 0.064),
}


SHERIFF_HAT_SEAT_Z = 1.79
SHERIFF_HAT_CENTER = (0, -0.004)
SHERIFF_HAT_CROWN = (0.125, 0.135)
SHERIFF_HAT_BAND_Z = (0.035, 0.075)
SHERIFF_HAT_CLEARANCE = 0.0085
SHERIFF_STAR_HEIGHT = 0.06


def inflated_tree(head, offset):
    bm = bmesh.new()
    bm.from_mesh(head.data)
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * offset
    tree = BVHTree.FromBMesh(bm)
    bm.free()
    return tree


def in_crown(co):
    return (co.x / SHERIFF_HAT_CROWN[0]) ** 2 + (co.y / SHERIFF_HAT_CROWN[1]) ** 2 < 1.0


def sheriff_hat(M, m, head):
    faces = add_ai_part(M, m["main"], "sheriff_hat", (0, 0, 0), rot=(0, 0, -PI / 2))
    verts = list({v for f in faces for v in f.verts})
    index = {v: i for i, v in enumerate(verts)}
    rest = [v.co.copy() for v in verts]
    opening = [f for f in faces if f.normal.z < -0.7 and in_crown(f.calc_center_median()) and f.calc_center_median().z < SHERIFF_HAT_BAND_Z[0]]
    shell = [[index[v] for v in f.verts] for f in faces if f not in opening]
    opening_z = sum(f.calc_center_median().z for f in opening) / len(opening)
    head_tree = inflated_tree(head, SHERIFF_HAT_CLEARANCE)

    def placed(scale, z):
        return [V3((co.x * scale + SHERIFF_HAT_CENTER[0], co.y * scale + SHERIFF_HAT_CENTER[1], co.z * scale + z)) for co in rest]

    def resting_z(scale):
        z = 2.0
        while not BVHTree.FromPolygons(placed(scale, z - 0.002), shell).overlap(head_tree):
            z -= 0.002
            if z < 1.6:
                raise RuntimeError("the sheriff hat never touches the head at scale %.2f" % scale)
        return z

    fit = next(((sc, z) for sc, z in ((sc, resting_z(sc)) for sc in [0.9 + i * 0.01 for i in range(50)])
                if z + sc * opening_z <= SHERIFF_HAT_SEAT_Z), None)
    if fit is None:
        raise RuntimeError("no scale seats the sheriff hat at z %.2f" % SHERIFF_HAT_SEAT_Z)
    scale, z = fit
    for v, co in zip(verts, placed(scale, z)):
        v.co = co
    M.bm.normal_update()
    for f in faces:
        local = (f.calc_center_median() - V3((SHERIFF_HAT_CENTER[0], SHERIFF_HAT_CENTER[1], z))) / scale
        if abs(f.normal.z) < 0.6 and in_crown(local) and SHERIFF_HAT_BAND_Z[0] <= local.z <= SHERIFF_HAT_BAND_Z[1]:
            f.material_index = M.mi(m["accent"])
    band_z = z + scale * sum(SHERIFF_HAT_BAND_Z) / 2
    hit, normal, _i, _d = BVHTree.FromBMesh(M.bm).ray_cast(V3((0, -0.5, band_z)), V3((0, 1, 0)))
    tilt = -math.asin(max(-1.0, min(1.0, normal.z)))
    star_scale = scale * (SHERIFF_HAT_BAND_Z[1] - SHERIFF_HAT_BAND_Z[0]) / SHERIFF_STAR_HEIGHT
    lift = Euler((tilt, 0, 0)).to_matrix() @ V3((0, 0, SHERIFF_STAR_HEIGHT * star_scale / 2))
    add_ai_part(M, m["badge"], "sheriff_star", tuple(hit + normal * 0.003 - lift), rot=(tilt, 0, 0), scale=star_scale)
    print("sheriff_hat scale %.2f, opening at z %.3f" % (scale, z + scale * opening_z))


def build_stylized_headwear(coll, arm, key, head):
    """Headsets and the straw hat over a short hair cap (W_head_accessory_<key>_Hair, tinted with the hair colour in
    the game), placed on the real head surface."""
    spec = WEAR["head_accessory"]["items"][key]
    m = piece_mats("head_accessory", key, spec["main"], spec["accent"], spec.get("extra"))
    hair_m = mat("W_head_accessory_%s_Hair" % key, "3b2618", rough=0.6)
    tree = rest_tree(head)
    M = Mesh("Wear_head_accessory_" + key)
    if key == "straw_hat":
        c = (0, -0.004, 1.8)
        add_cyl(M, m["main"], c, (0, -0.004, 1.94), 0.114, 0.098, seg=22, sx=0.92)
        add_cyl(M, m["main"], (0, -0.004, 1.795), (0, -0.004, 1.808), 0.21, 0.21, seg=28)
        add_cyl(M, m["accent"], (0, -0.004, 1.808), (0, -0.004, 1.84), 0.1155, 0.113, seg=22, cap=False, sx=0.92)
    elif key == "sheriff_hat":
        sheriff_hat(M, m, head)
    elif key == "bandana":
        # a cloth tied over the skull (the cap is merged below), a hem band on the forehead, a knot and two tails at the back
        band = [tuple(on_head(tree, (math.sin(math.radians(a)), -math.cos(math.radians(a)), 0.32 + 0.2 * math.cos(math.radians(a))), 0.008))
                for a in range(0, 361, 20)]
        add_sweep(M, m["accent"], band, [(0.004, 0.012)] * len(band), seg=8, per=1, power=2.4)
        knot = on_head(tree, (0.0, 1.0, -0.05), 0.016)
        add_ellipsoid(M, m["main"], tuple(knot), (0.026, 0.02, 0.022), seg=10, rings=6)
        for sg in (1, -1):
            tail = [tuple(knot + V3((0.01 * sg, 0.006, -0.01))), tuple(knot + V3((0.024 * sg, 0.016, -0.05))), tuple(knot + V3((0.03 * sg, 0.012, -0.085)))]
            add_sweep(M, m["main"], tail, [(0.004, 0.016), (0.004, 0.018), (0.003, 0.012)], seg=6, per=2)
    else:
        width, cup_r = HEADSET_STYLE[key]
        band = [tuple(on_head(tree, (math.sin(math.radians(a)), 0.0, math.cos(math.radians(a))), 0.019)) for a in range(-96, 97, 12)]
        add_sweep(M, m["main"], band, [(0.0075, width)] * len(band), seg=10, per=2, power=2.4)
        for sg in (1, -1):
            side = on_head(tree, (sg, 0.0, -0.12), 0.006)
            x0 = side.x
            add_cyl(M, m["main"], (x0, side.y, side.z), (x0 + 0.036 * sg, side.y, side.z), cup_r, cup_r * 0.92, seg=20)
            add_cyl(M, m["accent"], (x0 + 0.036 * sg, side.y, side.z), (x0 + 0.044 * sg, side.y, side.z), cup_r * 0.7, cup_r * 0.6, seg=16)
            if key == "cat_ear":
                base = on_head(tree, (0.42 * sg, 0.0, 0.9), 0.024)
                tip = base + V3((0.02 * sg, 0.0, 0.075))
                add_cyl(M, m["main"], tuple(base), tuple(tip), 0.034, 0.003, seg=4)
                add_cyl(M, m["accent"], tuple(base + V3((0, -0.008, 0.006))), tuple(tip + V3((0, -0.008, -0.012))), 0.02, 0.002, seg=4)
            if key == "neon":
                cx = x0 + 0.045 * sg
                ring = [(cx, cup_r * 0.72 * math.sin(math.radians(a)) + side.y, side.z + cup_r * 0.72 * math.cos(math.radians(a))) for a in range(0, 361, 30)]
                add_sweep(M, m["glow"], ring, [(0.004, 0.004)] * len(ring), seg=6, per=1, ref=(1, 0, 0))
        if key in ("gamer", "pilot"):  # mic boom from the left cup to the corner of the mouth
            cup = on_head(tree, (-1, 0.0, -0.12), 0.006)
            boom = [(cup.x - 0.02, cup.y - 0.02, cup.z - 0.01), (-0.1, -0.075, 1.69), (-0.045, -0.112, 1.672)]
            add_sweep(M, m["accent"], boom, [(0.0055, 0.0055)] * 3, seg=8, per=3)
            add_ellipsoid(M, m["main"], (-0.04, -0.114, 1.671), (0.014, 0.011, 0.011), seg=10, rings=6)
    ob = M.finish(coll)
    cap = head_cap(head, 0.0015, SHORT_PLANES, 0.004)
    smooth_shade(cap)
    cap.data.materials.append(hair_m)
    merge_into(ob, cap)
    if key == "bandana":
        cloth = head_cap(head, 0.0065, [((0, 0, 1.715), (0, 0, 1)), ((0, -0.088, 1.79), (0, 0.5, 0.87))], 0.003)
        decimate(cloth, 600)  # two caps (hair + cloth) would pass the headwear budget
        smooth_shade(cloth)
        cloth.data.materials.append(m["main"])
        merge_into(ob, cloth)
    ob.name = "Wear_head_accessory_" + key
    weight_rigid(ob, "Head")
    bind(ob, arm)
    ob["slot"] = "head_accessory"
    ob["hides"] = ""
    return ob
