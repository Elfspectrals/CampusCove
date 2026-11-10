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


DECOR = {"checkout_counter": checkout_counter}


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
