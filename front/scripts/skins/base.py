if "SKINS_DIR" not in globals():
    raise RuntimeError("Run these scripts through run.py (blender --background --python front/scripts/skins/run.py): they share state via exec().")

exec(open(SKINS_DIR + "lib.py", encoding="utf8").read())
def S(p, sg):
    return (p[0] * sg, p[1], p[2])

def R(r, sg):
    return (r[0], r[1] * sg, r[2] * sg)

def SP(pts, sg):
    return [S(p, sg) for p in pts]

def body(M, skin, under=None, under_arms=True, under_legs=True):
    """Base anatomy: torso, neck, head, arms, legs. `under` material for the bodysuit (None = bare skin)."""
    bm_ = under or skin
    # torso (hips -> chest -> neck)
    add_sweep(M, bm_, [(0, 0, 0.86), (0, 0, 0.96), (0, 0, 1.10), (0, 0, 1.28), (0, 0, 1.43), (0, 0, 1.52), (0, 0, 1.60)],
              [(0.135, 0.10), (0.17, 0.115), (0.145, 0.10), (0.175, 0.118), (0.195, 0.125), (0.14, 0.10), (0.055, 0.055)],
              seg=16, per=3, caps=(True, True))
    # neck + head
    add_sweep(M, skin, [(0, 0, 1.52), (0, 0.0, 1.62), (0, 0.0, 1.66)], [(0.052, 0.052), (0.05, 0.05), (0.05, 0.05)], seg=10, per=2)
    add_ellipsoid(M, skin, (0, -0.012, 1.745), (0.088, 0.098, 0.115), seg=16, rings=11)
    add_ellipsoid(M, skin, (0, -0.045, 1.69), (0.07, 0.07, 0.075), seg=12, rings=8)  # jaw / chin mass
    for sg in (1, -1):
        add_ellipsoid(M, skin, (0.092 * sg, 0.0, 1.745), (0.014, 0.022, 0.034), seg=8, rings=6)  # ears
        # arms (A-pose)
        arm_m = bm_ if under_arms else skin
        add_sweep(M, arm_m, SP([(0.17, 0, 1.50), (0.25, 0, 1.40), (0.34, 0, 1.22), (0.395, 0, 1.10), (0.43, 0, 0.97)], sg),
                  [(0.058, 0.062), (0.052, 0.056), (0.046, 0.05), (0.042, 0.044), (0.031, 0.034)], seg=12, per=3)
        add_sweep(M, skin, SP([(0.43, 0, 0.97), (0.447, 0, 0.92), (0.462, 0, 0.865), (0.47, 0, 0.83)], sg),
                  [(0.032, 0.036), (0.036, 0.044), (0.034, 0.04), (0.02, 0.02)], seg=10, per=2)  # hand
        add_sweep(M, skin, SP([(0.445, -0.03, 0.935), (0.43, -0.052, 0.90), (0.425, -0.05, 0.875)], sg),
                  [(0.012, 0.013), (0.011, 0.012), (0.008, 0.008)], seg=6, per=2)  # thumb
        # legs
        leg_m = bm_ if under_legs else skin
        add_sweep(M, leg_m, SP([(0.10, 0, 0.93), (0.10, 0, 0.72), (0.10, -0.005, 0.50), (0.10, 0.003, 0.30), (0.10, 0.01, 0.09)], sg),
                  [(0.088, 0.092), (0.075, 0.08), (0.058, 0.06), (0.056, 0.064), (0.036, 0.04)], seg=14, per=3)
        add_sweep(M, skin, SP([(0.10, 0.01, 0.09), (0.10, -0.06, 0.07), (0.10, -0.14, 0.058), (0.10, -0.18, 0.05)], sg),
                  [(0.04, 0.04), (0.042, 0.042), (0.04, 0.03), (0.034, 0.02)], seg=10, per=2)  # foot
    return M


# ---------------------------------------------------------------- preview / viewport studio
def setup_render(res=(1024, 1024), samples=64):
    sc = studio()
    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    try:
        sc.eevee.taa_render_samples = samples
    except Exception:
        pass
    try:
        sc.view_settings.view_transform = 'Khronos PBR Neutral'
        sc.view_settings.look = 'None'
    except Exception:
        pass
    # world: soft neutral
    w = bpy.data.worlds.get("SK_World") or bpy.data.worlds.new("SK_World")
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.16, 0.2, 0.32, 1)
    bg.inputs[1].default_value = 1.1
    sc.world = w
    return sc


def lights(sc, key=(1.0, 0.95, 0.9), rim=(0.35, 0.6, 1.0), fill=(0.8, 0.85, 1.0), power=1.0):
    lc = bpy.data.collections.get("SK_Lights")
    if lc:
        for o in list(lc.objects):
            bpy.data.objects.remove(o, do_unlink=True)
    else:
        lc = bpy.data.collections.new("SK_Lights")
        sc.collection.children.link(lc)
    def area(name, loc, energy, color, size, target=(0, 0, 0.95)):
        d = bpy.data.lights.new(name, 'AREA')
        d.energy = energy * power; d.color = color; d.size = size
        o = bpy.data.objects.new(name, d)
        lc.objects.link(o)
        o.location = loc
        direction = V(target) - V(loc)
        o.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    area("Key", (-1.8, -2.4, 2.6), 260, key, 2.2)
    area("Rim", (2.2, 2.2, 2.4), 320, rim, 1.8)
    area("Fill", (2.4, -1.6, 1.2), 90, fill, 3.0)
    area("Top", (0, -0.3, 3.2), 90, (1, 1, 1), 2.0)
    return lc


def camera(sc, loc=(2.2, -4.2, 1.35), target=(0, 0, 0.95), lens=70):
    cam = bpy.data.objects.get("SK_Cam")
    if not cam:
        cd = bpy.data.cameras.new("SK_Cam")
        cam = bpy.data.objects.new("SK_Cam", cd)
        sc.collection.objects.link(cam)
    cam.data.lens = lens
    cam.location = loc
    cam.rotation_euler = (V(target) - V(loc)).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam
    return cam


def floor(sc, y=0.0):
    f = bpy.data.objects.get("SK_Floor")
    if f:
        return f
    me = bpy.data.meshes.new("SK_Floor")
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, radius=1.1, segments=64)
    bm.to_mesh(me); bm.free()
    f = bpy.data.objects.new("SK_Floor", me)
    sc.collection.objects.link(f)
    return f
