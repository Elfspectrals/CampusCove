if "SKINS_DIR" not in globals():
    raise RuntimeError("Run these scripts through run_wear.py (blender --background --python front/scripts/skins/run_wear.py): they share state via exec().")

exec(open(SKINS_DIR + "base.py", encoding="utf8").read())

BODY_REGIONS = ("head", "chest", "hips", "upper_arms", "forearms", "hands", "thighs", "shins", "feet")
BODY_SIGMA = 0.055


def body_materials():
    return {
        "skin": mat("Skin", "e8b896", rough=0.6),
        "undershirt": mat("BB_Undershirt", "e9e6df", rough=0.85),
        "briefs": mat("BB_Briefs", "3d4150", rough=0.8),
        "eye": mat("BB_Eye", "1d1f26", rough=0.25),
        "white": mat("BB_EyeWhite", "f6f4ef", rough=0.35),
        "brow": mat("BB_Brow", "4a3426", rough=0.8),
        "lips": mat("BB_Lips", "b5675a", rough=0.5),
    }


def region_head(M, m):
    add_sweep(M, m["skin"], [(0, 0, 1.50), (0, 0.0, 1.62), (0, 0.0, 1.66)], [(0.056, 0.054), (0.05, 0.05), (0.05, 0.05)], seg=10, per=2)
    add_ellipsoid(M, m["skin"], (0, -0.012, 1.745), (0.088, 0.098, 0.115), seg=16, rings=11)
    add_ellipsoid(M, m["skin"], (0, -0.045, 1.69), (0.07, 0.07, 0.075), seg=12, rings=8)
    add_ellipsoid(M, m["skin"], (0, -0.106, 1.722), (0.013, 0.02, 0.024), seg=8, rings=6)
    add_box(M, m["lips"], (0, -0.108, 1.672), (0.034, 0.008, 0.008), bevel=0.003)
    for sg in (1, -1):
        add_ellipsoid(M, m["skin"], (0.092 * sg, 0.0, 1.745), (0.014, 0.022, 0.034), seg=8, rings=6)
        add_ellipsoid(M, m["white"], (0.034 * sg, -0.093, 1.755), (0.017, 0.008, 0.013), seg=10, rings=6)
        add_ellipsoid(M, m["eye"], (0.034 * sg, -0.1, 1.753), (0.009, 0.004, 0.01), seg=8, rings=5)
        add_box(M, m["brow"], (0.035 * sg, -0.098, 1.786), (0.032, 0.008, 0.007), rot=(0, 0.12 * sg, 0), bevel=0.002)


def region_chest(M, m):
    add_sweep(M, m["undershirt"], [(0, 0, 1.06), (0, 0, 1.10), (0, 0, 1.28), (0, 0, 1.43), (0, 0, 1.52), (0, 0, 1.58)],
              [(0.16, 0.112), (0.145, 0.10), (0.175, 0.118), (0.195, 0.125), (0.14, 0.10), (0.07, 0.065)],
              seg=16, per=3, caps=(False, True))


def region_hips(M, m):
    add_sweep(M, m["briefs"], [(0, 0, 0.84), (0, 0, 0.90), (0, 0, 0.98), (0, 0, 1.08)],
              [(0.13, 0.098), (0.17, 0.115), (0.168, 0.113), (0.158, 0.11)],
              seg=16, per=3, caps=(True, False))
    for sg in (1, -1):
        add_sweep(M, m["briefs"], SP([(0.10, 0, 0.93), (0.10, 0, 0.80)], sg), [(0.092, 0.096), (0.085, 0.09)], seg=14, per=1)


def region_upper_arms(M, m, sg):
    add_sweep(M, m["skin"], SP([(0.17, 0, 1.50), (0.25, 0, 1.40), (0.34, 0, 1.22)], sg),
              [(0.058, 0.062), (0.052, 0.056), (0.046, 0.05)], seg=12, per=3)


def region_forearms(M, m, sg):
    add_sweep(M, m["skin"], SP([(0.34, 0, 1.22), (0.395, 0, 1.10), (0.43, 0, 0.97)], sg),
              [(0.046, 0.05), (0.042, 0.044), (0.031, 0.034)], seg=12, per=3)


def region_hands(M, m, sg):
    add_sweep(M, m["skin"], SP([(0.43, 0, 0.97), (0.447, 0, 0.92), (0.462, 0, 0.865), (0.47, 0, 0.83)], sg),
              [(0.032, 0.036), (0.036, 0.044), (0.034, 0.04), (0.02, 0.02)], seg=10, per=2)
    add_sweep(M, m["skin"], SP([(0.445, -0.03, 0.935), (0.43, -0.052, 0.90), (0.425, -0.05, 0.875)], sg),
              [(0.012, 0.013), (0.011, 0.012), (0.008, 0.008)], seg=6, per=2)


def region_thighs(M, m, sg):
    add_sweep(M, m["skin"], SP([(0.10, 0, 0.82), (0.10, 0, 0.72), (0.10, -0.005, 0.50)], sg),
              [(0.083, 0.087), (0.075, 0.08), (0.058, 0.06)], seg=14, per=3)


def region_shins(M, m, sg):
    add_sweep(M, m["skin"], SP([(0.10, -0.005, 0.50), (0.10, 0.003, 0.30), (0.10, 0.01, 0.09)], sg),
              [(0.058, 0.06), (0.056, 0.064), (0.036, 0.04)], seg=14, per=3)


def region_feet(M, m, sg):
    add_sweep(M, m["skin"], SP([(0.10, 0.01, 0.10), (0.10, 0.01, 0.06), (0.10, -0.06, 0.04), (0.10, -0.14, 0.03), (0.10, -0.18, 0.022)], sg),
              [(0.038, 0.04), (0.042, 0.044), (0.042, 0.042), (0.04, 0.026), (0.032, 0.016)], seg=10, per=2)
    add_box(M, m["skin"], S((0.10, -0.06, 0.012), sg), (0.08, 0.24, 0.024), bevel=0.01)


REGION_BUILDERS = {
    "head": (region_head, False),
    "chest": (region_chest, False),
    "hips": (region_hips, False),
    "upper_arms": (region_upper_arms, True),
    "forearms": (region_forearms, True),
    "hands": (region_hands, True),
    "thighs": (region_thighs, True),
    "shins": (region_shins, True),
    "feet": (region_feet, True),
}


def build_base_body(coll, arm):
    m = body_materials()
    bones = [b.name for b in arm.data.bones]
    objs = []
    for region in BODY_REGIONS:
        fn, mirrored = REGION_BUILDERS[region]
        M = Mesh("Body_" + region)
        if mirrored:
            for sg in (1, -1):
                fn(M, m, sg)
        else:
            fn(M, m)
        ob = M.finish(coll)
        if region == "head":
            weight_rigid_blend(ob, arm)
        else:
            weight_auto(ob, arm, bones, sigma=BODY_SIGMA)
        bind(ob, arm)
        ob["region"] = region
        objs.append(ob)
    return objs


def weight_rigid_blend(ob, arm):
    vg = {n: ob.vertex_groups.new(name=n) for n in ("Head", "Neck", "Chest")}
    for v in ob.data.vertices:
        z = v.co.z
        if z >= 1.64:
            vg["Head"].add([v.index], 1.0, 'REPLACE')
        elif z >= 1.56:
            t = (z - 1.56) / 0.08
            vg["Head"].add([v.index], t, 'REPLACE')
            vg["Neck"].add([v.index], 1 - t, 'REPLACE')
        else:
            t = max(0.0, (z - 1.50) / 0.06)
            vg["Neck"].add([v.index], t, 'REPLACE')
            vg["Chest"].add([v.index], 1 - t, 'REPLACE')


def bind(ob, arm):
    ob.parent = arm
    mod = ob.modifiers.new("Armature", 'ARMATURE')
    mod.object = arm
