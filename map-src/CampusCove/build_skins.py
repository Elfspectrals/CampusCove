"""Builds the 5 player skins (static low-poly characters) into collections SKIN_<key>.

Each skin: ~1.75 m tall, feet at z = 0, facing -Y (game +Z). Exported to
front/public/assets/skins/<key>/model.glb + preview.png.
"""
import bpy, math, os
exec(open(r"C:\Users\Utilisateur\CampusCove\map-src\CampusCove\lib\cc_lib.py").read())

SKINS = [
    # key, display name, skin tone, hair colour, hair style, top tex, top style, pants tex, shoe colour, accessories
    dict(key="campus_classic", name="Campus Classic", skin=(0.93, 0.76, 0.62), hair=(0.25, 0.16, 0.1), hair_style="short",
         top="T_FabricNavy", top_style="hoodie", pants="T_Denim", shoes=(0.95, 0.95, 0.93), extras=[]),
    dict(key="street_runner", name="Street Runner", skin=(0.62, 0.42, 0.3), hair=(0.08, 0.06, 0.05), hair_style="cap",
         top="T_FabricMustard", top_style="jacket", pants="T_FabricGrey", shoes=(0.9, 0.3, 0.2), extras=["stripes"]),
    dict(key="scholar", name="Scholar", skin=(0.98, 0.84, 0.72), hair=(0.55, 0.3, 0.15), hair_style="long",
         top="T_KnitCream", top_style="sweater", pants="T_FabricOlive", shoes=(0.35, 0.22, 0.14), extras=["glasses", "satchel"]),
    dict(key="explorer", name="Explorer", skin=(0.8, 0.6, 0.45), hair=(0.15, 0.1, 0.08), hair_style="beanie",
         top="T_FabricOlive", top_style="jacket", pants="T_FabricTeal", shoes=(0.3, 0.2, 0.12), extras=["backpack", "boots"]),
    # premium-only skin: owl hood tufts, feather cape, neon trims, gold moon emblem, glowing soles
    dict(key="night_owl", name="Night Owl", skin=(0.45, 0.3, 0.22), hair=(0.05, 0.05, 0.06), hair_style="hood",
         top="T_FabricPurple", top_style="hoodie", pants="T_FabricNavy", shoes=(0.1, 0.1, 0.12),
         extras=["headphones", "visor", "owl_tufts", "feather_cape", "neon_trim", "moon_emblem", "glow_soles"]),
]


def build_skin(sk):
    key = sk["key"]
    C = reset_coll(f"SKIN_{key}")
    p = f"SK_{key}_"
    m_skin = mat(p + "Skin", color=sk["skin"], rough=0.6)
    m_hair = mat(p + "Hair", color=sk["hair"], rough=0.7)
    m_top = mat(p + "Top", sk["top"], tile=0.4, rough=0.9)
    m_pants = mat(p + "Pants", sk["pants"], tile=0.4, rough=0.9)
    m_shoe = mat(p + "Shoes", color=sk["shoes"], rough=0.5)
    m_sole = mat(p + "Sole", color=(0.95, 0.95, 0.95) if sum(sk["shoes"]) < 1.5 else (0.15, 0.15, 0.17), rough=0.6)
    m_eye = mat(p + "Eye", color=(0.05, 0.05, 0.07), rough=0.2)
    m_white = mat(p + "EyeWhite", color=(0.97, 0.97, 0.97), rough=0.3)
    m_mouth = mat(p + "Mouth", color=(0.55, 0.25, 0.22), rough=0.5)
    m_acc = mat(p + "Accent", color=(0.95, 0.95, 0.93), rough=0.5)
    m_dark = mat(p + "Dark", color=(0.08, 0.08, 0.1), rough=0.4)
    parts = []

    # legs + shoes
    boots = "boots" in sk["extras"]
    for sx in (-1, 1):
        x = sx * 0.11
        parts.append(box(p + "Leg", (x, 0, 0.47), (0.16, 0.18, 0.78), m_pants, C, bevel=0.03))
        shoe_h = 0.2 if boots else 0.1
        parts.append(box(p + "Shoe", (x, -0.04, 0.03 + shoe_h / 2), (0.17, 0.3, shoe_h), m_shoe, C, bevel=0.03))
        parts.append(box(p + "Sole", (x, -0.04, 0.02), (0.18, 0.31, 0.04), m_sole, C, bevel=0.01))
    # hips + torso
    parts.append(box(p + "Hips", (0, 0, 0.9), (0.4, 0.22, 0.16), m_pants, C, bevel=0.03))
    torso_h = 0.56
    parts.append(box(p + "Torso", (0, 0, 0.98 + torso_h / 2), (0.44, 0.25, torso_h), m_top, C, bevel=0.06))
    if sk["top_style"] == "hoodie":
        parts.append(box(p + "Pocket", (0, -0.128, 1.1), (0.26, 0.02, 0.12), m_top, C, bevel=0.01))
        for sx in (-1, 1):
            parts.append(cyl(p + "String", (sx * 0.05, -0.13, 1.37), 0.008, 0.14, m_acc, C, seg=6))
    if sk["top_style"] == "jacket":
        parts.append(box(p + "Zip", (0, -0.127, 1.24), (0.02, 0.01, 0.5), m_dark, C))
        parts.append(box(p + "Collar", (0, 0, 1.52), (0.3, 0.22, 0.06), m_top, C, bevel=0.02))
    if sk["top_style"] == "sweater":
        parts.append(box(p + "Shirt", (0, -0.126, 1.45), (0.12, 0.01, 0.1), m_acc, C))
    if "stripes" in sk["extras"]:
        for sx in (-1, 1):
            parts.append(box(p + "Stripe", (sx * 0.226, 0, 1.25), (0.012, 0.2, 0.5), m_acc, C))
    # arms + hands
    for sx in (-1, 1):
        sh = (sx * 0.27, 0, 1.44)
        arm = cyl(p + "Arm", (sh[0] + sx * 0.03, 0, 1.2), 0.065, 0.5, m_top, C, seg=8, rot=(0, sx * math.radians(7), 0))
        parts.append(arm)
        parts.append(sphere(p + "Shoulder", sh, 0.075, m_top, C, seg=8))
        parts.append(sphere(p + "Hand", (sx * 0.33, 0, 0.92), 0.06, m_skin, C, seg=8))
    # neck + head
    parts.append(cyl(p + "Neck", (0, 0, 1.56), 0.06, 0.08, m_skin, C, seg=8))
    head_c = (0, 0, 1.72)
    parts.append(box(p + "Head", head_c, (0.28, 0.27, 0.3), m_skin, C, bevel=0.07))
    for sx in (-1, 1):
        parts.append(box(p + "EyeWhite", (sx * 0.06, -0.134, 1.735), (0.055, 0.01, 0.05), m_white, C))
        parts.append(box(p + "Eye", (sx * 0.06, -0.139, 1.73), (0.028, 0.01, 0.034), m_eye, C))
        parts.append(box(p + "Brow", (sx * 0.06, -0.137, 1.778), (0.06, 0.01, 0.012), m_hair, C))
        parts.append(sphere(p + "Ear", (sx * 0.145, 0, 1.72), 0.03, m_skin, C, seg=6))
    parts.append(box(p + "Mouth", (0, -0.137, 1.645), (0.07, 0.01, 0.014), m_mouth, C))
    parts.append(box(p + "Nose", (0, -0.14, 1.69), (0.03, 0.02, 0.04), m_skin, C, bevel=0.008))

    # hair styles
    hs = sk["hair_style"]
    if hs in ("short", "long"):
        parts.append(box(p + "HairTop", (0, 0.01, 1.86), (0.3, 0.29, 0.08), m_hair, C, bevel=0.035))
        parts.append(box(p + "HairBack", (0, 0.12, 1.75), (0.3, 0.06, 0.24), m_hair, C, bevel=0.02))
        parts.append(box(p + "Fringe", (0.03, -0.12, 1.83), (0.24, 0.05, 0.06), m_hair, C, bevel=0.02))
        for sx in (-1, 1):
            parts.append(box(p + "Side", (sx * 0.142, 0.03, 1.79), (0.03, 0.2, 0.12), m_hair, C, bevel=0.01))
        if hs == "long":
            parts.append(box(p + "Ponytail", (0, 0.17, 1.58), (0.12, 0.08, 0.3), m_hair, C, bevel=0.04))
            for sx in (-1, 1):
                parts.append(box(p + "Lock", (sx * 0.15, 0.04, 1.62), (0.03, 0.15, 0.28), m_hair, C, bevel=0.01))
    elif hs == "cap":
        m_cap = mat(p + "Cap", color=(0.85, 0.25, 0.18), rough=0.6)
        parts.append(sphere(p + "CapDome", (0, 0.01, 1.84), 0.155, m_cap, C, seg=12, scale=(1, 1, 0.55)))
        parts.append(box(p + "CapBrim", (0, -0.17, 1.82), (0.24, 0.16, 0.02), m_cap, C, bevel=0.01))
        parts.append(box(p + "HairBack", (0, 0.12, 1.74), (0.28, 0.06, 0.12), m_hair, C, bevel=0.02))
    elif hs == "beanie":
        m_bea = mat(p + "Beanie", color=(0.85, 0.45, 0.15), rough=0.95)
        parts.append(sphere(p + "BeanieDome", (0, 0.01, 1.83), 0.165, m_bea, C, seg=12, scale=(1, 1, 0.75)))
        parts.append(cyl(p + "BeanieBand", (0, 0.01, 1.82), 0.16, 0.06, m_bea, C, seg=12))
        parts.append(sphere(p + "Pompom", (0, 0.01, 1.98), 0.045, m_acc, C, seg=8))
    elif hs == "hood":
        # hood sits behind the face; three rim pieces frame it
        parts.append(sphere(p + "Hood", (0, 0.07, 1.77), 0.19, m_top, C, seg=12, scale=(1, 0.9, 1.08)))
        for sx in (-1, 1):
            parts.append(box(p + "HoodRim", (sx * 0.16, -0.08, 1.74), (0.05, 0.1, 0.34), m_top, C, bevel=0.02))
        parts.append(box(p + "HoodRimTop", (0, -0.08, 1.92), (0.36, 0.1, 0.06), m_top, C, bevel=0.02))
    # accessories
    ex = sk["extras"]
    if "glasses" in ex:
        for sx in (-1, 1):
            parts.append(box(p + "Lens", (sx * 0.062, -0.145, 1.735), (0.085, 0.008, 0.065), m_dark, C))
            parts.append(box(p + "LensGlass", (sx * 0.062, -0.15, 1.735), (0.065, 0.006, 0.045), m_white, C))
        parts.append(box(p + "Bridge", (0, -0.145, 1.745), (0.04, 0.008, 0.012), m_dark, C))
    if "satchel" in ex:
        m_leather = mat(p + "Leather", "T_WoodGrain", tile=0.3, rough=0.6)
        parts.append(box(p + "Satchel", (0.26, 0.02, 1.0), (0.08, 0.3, 0.24), m_leather, C, bevel=0.02))
        parts.append(box(p + "Strap", (0.0, -0.13, 1.25), (0.05, 0.01, 0.62), m_leather, C, rot_z=0.0))
    if "backpack" in ex:
        m_pack = mat(p + "Pack", color=(0.75, 0.3, 0.2), rough=0.8)
        parts.append(box(p + "Backpack", (0, 0.2, 1.22), (0.34, 0.16, 0.42), m_pack, C, bevel=0.05))
        parts.append(box(p + "PackPocket", (0, 0.29, 1.14), (0.24, 0.04, 0.16), m_pack, C, bevel=0.02))
        for sx in (-1, 1):
            parts.append(box(p + "PackStrap", (sx * 0.12, -0.128, 1.32), (0.04, 0.012, 0.28), m_dark, C))
    if "headphones" in ex:
        m_hp = mat(p + "Headphones", color=(0.2, 0.9, 0.85), rough=0.3, emit=(0.1, 0.6, 0.55), emit_str=1.5)
        parts.append(box(p + "HPBand", (0, 0.0, 1.97), (0.36, 0.06, 0.04), m_dark, C, bevel=0.015))
        for sx in (-1, 1):
            parts.append(cyl(p + "HPCup", (sx * 0.19, 0, 1.76), 0.07, 0.05, m_hp, C, seg=12, rot=(0, math.pi / 2, 0)))
    if "visor" in ex:
        m_vis = mat(p + "Visor", color=(0.6, 0.3, 1.0), rough=0.1, emit=(0.5, 0.2, 1.0), emit_str=2.0)
        parts.append(box(p + "Visor", (0, -0.15, 1.74), (0.26, 0.01, 0.05), m_vis, C))

    if "owl_tufts" in ex:
        m_tuft = mat(p + "Tuft", color=(0.16, 0.08, 0.28), rough=0.7)
        for sx in (-1, 1):
            parts.append(cyl(p + "Tuft", (sx * 0.12, 0.05, 2.0), 0.055, 0.17, m_tuft, C, seg=6, r2=0.0, rot=(0.15, sx * 0.4, 0)))
    if "neon_trim" in ex or "feather_cape" in ex or "glow_soles" in ex:
        m_neon = mat(p + "Neon", color=(0.2, 0.95, 0.9), rough=0.2, emit=(0.15, 0.85, 0.8), emit_str=3.0)
    if "neon_trim" in ex:
        parts.append(box(p + "HemTrim", (0, 0, 1.0), (0.452, 0.262, 0.025), m_neon, C, bevel=0.008))
        for sx in (-1, 1):
            parts.append(box(p + "HoodTrim", (sx * 0.16, -0.132, 1.74), (0.02, 0.01, 0.34), m_neon, C))
            parts.append(cyl(p + "Cuff", (sx * 0.322, 0, 0.99), 0.07, 0.03, m_neon, C, seg=10, rot=(0, sx * math.radians(7), 0)))
        parts.append(box(p + "HoodTrimTop", (0, -0.132, 1.95), (0.34, 0.01, 0.02), m_neon, C))
    if "moon_emblem" in ex:
        m_gold = mat(p + "Gold", color=(0.95, 0.72, 0.28), rough=0.25, metal=1.0)
        # crescent = gold disc partly covered by a hoodie-coloured disc
        parts.append(cyl(p + "Moon", (0.12, -0.128, 1.33), 0.055, 0.012, m_gold, C, seg=16, rot=(math.pi / 2, 0, 0)))
        parts.append(cyl(p + "MoonCut", (0.142, -0.133, 1.345), 0.046, 0.012, m_top, C, seg=16, rot=(math.pi / 2, 0, 0)))
        parts.append(box(p + "Star", (0.075, -0.134, 1.385), (0.018, 0.008, 0.018), m_gold, C, rot_z=0.0))
        for sx in (-1, 1):
            parts.append(sphere(p + "Clasp", (sx * 0.17, -0.11, 1.47), 0.028, m_gold, C, seg=8))
    if "feather_cape" in ex:
        m_feather = mat(p + "Feather", color=(0.17, 0.09, 0.3), rough=0.6)
        m_feather2 = mat(p + "Feather2", color=(0.26, 0.14, 0.42), rough=0.6)
        # three overlapping rows, longer and wider towards the bottom (cape flares out)
        rows = [(1.32, 0.15, 0.24, 5, 0.1), (1.1, 0.175, 0.3, 6, 0.18), (0.88, 0.2, 0.34, 7, 0.26)]
        for ri, (zc, yc, length, n, flare) in enumerate(rows):
            half = 0.2 + ri * 0.035
            for i in range(n):
                t = i / (n - 1) * 2 - 1
                x = t * half
                fm = m_feather if (i + ri) % 2 == 0 else m_feather2
                f = box(p + "Feather", (x, yc + abs(t) * 0.02, zc), (0.085, 0.02, length), fm, C, bevel=0.02)
                f.rotation_euler = (flare, t * 0.12, 0)
                parts.append(f)
                # glowing tip at the (rotated) lower end of the feather
                d = length / 2 - 0.03
                tip_loc = (x, yc + abs(t) * 0.02 + 0.012 + d * math.sin(flare), zc - d * math.cos(flare))
                tip = box(p + "FeatherTip", tip_loc, (0.06, 0.012, 0.04), m_neon, C)
                tip.rotation_euler = (flare, t * 0.12, 0)
                parts.append(tip)
    if "glow_soles" in ex:
        for sx in (-1, 1):
            parts.append(box(p + "SoleGlow", (sx * 0.11, -0.04, 0.045), (0.185, 0.315, 0.012), m_neon, C))

    body = join(parts, f"Skin_{key}")
    for poly in body.data.polygons:
        poly.use_smooth = False
    return C


# set ONLY_SKINS = ["night_owl"] before exec() to rebuild a subset
ONLY = globals().get("ONLY_SKINS")
built = []
for sk in SKINS:
    if ONLY and sk["key"] not in ONLY:
        continue
    build_skin(sk)
    out_dir = os.path.join(PUBLIC, "skins", sk["key"])
    size = export_collection(f"SKIN_{sk['key']}", os.path.join(ROOT, "out", "skins", sk["key"], "model.glb"))
    render_preview(f"SKIN_{sk['key']}", os.path.join(out_dir, "preview.png"), size=512, yaw_deg=25, pitch_deg=8, fill=0.95)
    built.append((sk["key"], size))
result = {"skins": built}
