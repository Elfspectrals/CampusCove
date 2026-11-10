import importlib
import os
import sys

if "__file__" not in globals():
    raise RuntimeError('Run with exec(open(p).read(), {"__file__": p}) so the script can find lib_common.py')
HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import lib_common as L
importlib.reload(L)
import bpy
from mathutils import Vector

ONLY = globals().get("ONLY_DECOR")
PREVIEWS = os.path.join(L.FRONT_ASSETS, "decor")

sc = L.new_build_scene("DECOR_shop")
coll = bpy.data.collections.new("ShopDecor")
sc.collection.children.link(coll)


def checkout_counter():
    body = L.make_mat("DC_CounterBody", "#f2efe8", 0.8, "noise", 0.03)
    dark = L.make_mat("DC_CounterDark", "#2a2c33", 0.6, "noise", 0.03)
    top = L.make_mat("DC_CounterTop", "#b08a5c", 0.75, "planks", 0.04, accent="#96724a")
    stripe = L.make_mat("DC_CounterStripe", "#2f8f8a", 0.7, "noise", 0.02)
    screen = L.make_mat("DC_CounterScreen", "#9fd4e6", 0.3, "noise", 0.0, emit="#9fd4e6", emit_strength=0.8)
    parts = [
        L.box(coll, "Plinth", 0.0, 0.0, 0.0, 1.56, 0.58, 0.08, dark),
        L.box(coll, "Body", 0.0, 0.0, 0.08, 1.6, 0.62, 0.9, body, bevel=0.01),
        L.box(coll, "Top", 0.0, 0.0, 0.98, 1.72, 0.74, 0.05, top, bevel=0.01),
        L.box(coll, "Stripe", 0.0, 0.316, 0.6, 1.6, 0.012, 0.12, stripe),
        L.box(coll, "TillBase", 0.45, -0.16, 1.03, 0.36, 0.3, 0.1, dark, bevel=0.01),
        L.box(coll, "TillScreen", 0.45, -0.27, 1.13, 0.3, 0.03, 0.2, dark),
        L.box(coll, "TillGlow", 0.45, -0.287, 1.15, 0.26, 0.006, 0.16, screen),
        L.box(coll, "CardReader", -0.45, 0.2, 1.03, 0.09, 0.14, 0.04, dark, bevel=0.005),
        L.box(coll, "CardGlow", -0.45, 0.22, 1.07, 0.06, 0.06, 0.004, screen),
    ]
    return parts


def hardware_mats():
    return {
        "orange": L.make_mat("DC_HwOrange", "#e07a2e", 0.6, "noise", 0.02),
        "dark": L.make_mat("DC_HwDark", "#2f3338", 0.55, "noise", 0.03),
        "rack": L.make_mat("DC_HwRack", "#9aa0a8", 0.45, "noise", 0.03),
        "carton": L.make_mat("DC_Carton", "#b98c5a", 0.9, "stripes", 0.04, accent="#a47a4c"),
        "blue": L.make_mat("DC_HwBlue", "#1f5fae", 0.5, "noise", 0.03),
        "plinth": L.make_mat("DC_HwPlinth", "#f2efe8", 0.6, "noise", 0.01),
    }


def shop_rack(length=2.4, depth=0.9, levels=3):
    m = hardware_mats()
    parts = [L.box(coll, f"Post{i}", px, pz, 0.0, 0.06, 0.06, 2.4, m["orange"])
             for i, (px, pz) in enumerate((x, z) for x in (-length / 2 + 0.05, length / 2 - 0.05) for z in (-depth / 2 + 0.05, depth / 2 - 0.05))]
    for lv in range(levels):
        y = 0.15 + lv * 0.75
        parts.append(L.box(coll, f"Shelf{lv}", 0.0, 0.0, y, length, depth, 0.04, m["rack"]))
        n = int(length / 0.6)
        for i in range(n):
            off = -length / 2 + (i + 0.5) * length / n
            if (i + lv) % 3 == 0:
                parts.append(L.box(coll, f"Box{lv}_{i}", off, 0.0, y + 0.04, 0.45, 0.7, 0.35 + 0.1 * (i % 2), m["carton"]))
            else:
                parts.append(L.cyl(coll, f"Can{lv}_{i}", off, 0.0, y + 0.04, 0.12, 0.3, (m["blue"], m["dark"])[(i + lv) % 2], seg=8))
    return parts


def key_kiosk():
    m = hardware_mats()
    return [
        L.box(coll, "Base", 0.0, 0.0, 0.0, 1.2, 0.8, 1.0, m["dark"], bevel=0.02),
        L.box(coll, "Machine", 0.0, -0.1, 1.0, 0.8, 0.5, 0.6, m["rack"], bevel=0.02),
        L.box(coll, "Board", 0.0, 0.35, 1.0, 1.0, 0.1, 0.8, m["plinth"], bevel=0.01),
        L.text_mesh(coll, "Text", "KEYS CUT", 0.0, 0.41, 1.3, 0.22, 0.01, m["dark"], facing="+z"),
    ]


def lumber_rack():
    m = hardware_mats()
    lumber = L.make_mat("DC_Lumber", "#d8b78a", 0.8, "planks", 0.05, accent="#c49c6c")
    parts = [L.box(coll, "Upright", x, -0.25, 0.0, 0.08, 0.08, 2.3, m["dark"]) for x in (-1.15, 1.15)]
    for lv, y in enumerate((0.5, 1.3, 2.1)):
        parts.append(L.box(coll, f"Bracket{lv}", 0.0, 0.0, y, 2.4, 0.6, 0.05, m["dark"]))
        parts += [L.box(coll, f"Plank{lv}_{k}", -1.0 + k * 0.5, 0.0, y + 0.05, 2.6 - 0.2 * (k % 3), 0.1 + 0.05 * (k % 2), 0.1, lumber) for k in range(5)]
    return parts


def tool_pegboard():
    m = hardware_mats()
    peg = L.make_mat("DC_Pegboard", "#d9c7a4", 0.9, "tiles", 0.03, accent="#c9b58f")
    parts = [L.box(coll, "Panel", 0.0, 0.0, 0.0, 2.8, 0.03, 2.4, peg)]
    for i in range(4):
        parts.append(L.box(coll, f"Tool{i}", -1.05 + 0.7 * i, 0.045, 1.5 + 0.2 * (i % 3), 0.08 + 0.04 * (i % 2), 0.06, 0.3 + 0.1 * (i % 3),
                           (m["orange"], m["dark"], m["rack"], m["blue"])[i]))
    return parts


def paint_chip_board():
    m = hardware_mats()
    chips = [L.make_mat(f"DC_Chip{i}", c, 0.6, "noise", 0.02) for i, c in enumerate(("#e0533d", "#f6d04d", "#3f7f8c", "#79b765"))]
    parts = [L.box(coll, f"Leg{i}", x, 0.0, 0.0, 0.05, 0.05, 1.1, m["dark"]) for i, x in enumerate((-1.1, 1.1))]
    parts.append(L.box(coll, "Board", 0.0, 0.0, 1.1, 2.4, 0.02, 1.1, m["plinth"]))
    parts += [L.box(coll, f"Chip{k}", -1.0 + (k % 10) * 0.22, 0.02, 1.2 + (k // 10) * 0.24, 0.18, 0.02, 0.2, chips[k % len(chips)]) for k in range(40)]
    return parts


def display_plinth():
    return [L.box(coll, "Plinth", 0.0, 0.0, 0.0, 0.9, 0.7, 0.9, hardware_mats()["plinth"], bevel=0.02)]


DECOR = {
    "checkout_counter": checkout_counter,
    "shop_rack": shop_rack,
    "key_kiosk": key_kiosk,
    "lumber_rack": lumber_rack,
    "tool_pegboard": tool_pegboard,
    "paint_chip_board": paint_chip_board,
    "display_plinth": display_plinth,
}


def ship(key, parts):
    obj = L.join(coll, f"Decor_{key}", parts)
    obj.location = (0, 0, 0)
    bpy.context.view_layer.update()
    obj.location.z -= min((obj.matrix_world @ Vector(c)).z for c in obj.bound_box)
    bpy.context.view_layer.update()
    bad = L.check_grounded([obj])
    if bad:
        raise RuntimeError(f"{key} is not grounded: {bad}")
    out = os.path.join(L.OUT_ROOT, "decor", key)
    os.makedirs(out, exist_ok=True)
    L.export_glb(os.path.join(out, "model.glb"), [obj])
    os.makedirs(os.path.join(PREVIEWS, key), exist_ok=True)
    L.render_preview(sc, obj, os.path.join(PREVIEWS, key, "preview.png"))
    return {"key": key, "tris": sum(len(p.vertices) - 2 for p in obj.data.polygons), "dims": tuple(round(x, 3) for x in obj.dimensions)}


print("SHOP DECOR", [ship(key, build()) for key, build in DECOR.items() if not ONLY or key in ONLY])
