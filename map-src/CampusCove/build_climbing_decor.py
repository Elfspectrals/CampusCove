import importlib
import json
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

ONLY = globals().get("ONLY_DECOR")
MAX_MATERIALS = 6
CHALK_BAG_SLUG = "a_red_climbing_chalk_bag_full_of_white_c"
HOLD_BUCKET_SLUG = "a_grey_plastic_bucket_full_of_colourful_"
ROPE_COIL_SLUG = "a_neatly_coiled_blue_climbing_rope_lying"
CLIMBING_RULES = os.path.join(L.FRONT_ASSETS, "sports", "rules", "climbing.json")

sc = L.new_build_scene("DECOR_climbing")
coll = bpy.data.collections.new("ClimbingDecor")
sc.collection.children.link(coll)


def chalk_bag():
    return L.import_ai_model(coll, CHALK_BAG_SLUG, "DC_ChalkBag")


def hold_bucket():
    return L.import_ai_model(coll, HOLD_BUCKET_SLUG, "DC_HoldBucket")


def rope_coil():
    return L.import_ai_model(coll, ROPE_COIL_SLUG, "DC_RopeCoil")


def route_board():
    with open(CLIMBING_RULES, encoding="utf-8") as f:
        rules = json.load(f)
    routes = [line for line in rules["lines"] if line["kind"] == "route"]
    board = L.make_mat("DC_RouteBoard", "#1f2a33", 0.6, "noise", 0.01)
    ink = L.make_mat("DC_RouteBoardInk", "#f4f2ec", 0.5, "noise", 0.0)
    swatches = {key: L.make_mat(f"DC_RouteSwatch_{key}", c["hex"], 0.6, "noise", 0.0) for key, c in rules["colours"].items()}
    width, height, depth = 1.3, 0.3 + 0.12 * len(routes), 0.04
    parts = [
        L.box(coll, "Frame", 0.0, depth / 2, 0.0, width, depth, height, board, bevel=0.01),
        L.text_mesh(coll, "Header", "ROUTES", 0.0, depth + 0.002, height - 0.17, 0.11, 0.0, ink, resolution=1),
        L.box(coll, "Rule", 0.0, depth + 0.002, height - 0.205, width - 0.16, 0.004, 0.01, ink),
    ]
    for i, line in enumerate(routes):
        y = height - 0.33 - i * 0.12
        parts.append(L.box(coll, f"Swatch{i}", -0.48, depth + 0.003, y - 0.005, 0.12, 0.006, 0.08, swatches[line["colour"]]))
        parts.append(L.text_mesh(coll, f"Name{i}", line["name"], 0.08, depth + 0.002, y, 0.07, 0.0, ink, resolution=1))
    return parts


DECOR = {
    "chalk_bag": chalk_bag,
    "hold_bucket": hold_bucket,
    "rope_coil": rope_coil,
    "route_board": route_board,
}

results = [L.ship_decor(sc, coll, key, build(), MAX_MATERIALS) for key, build in DECOR.items() if not ONLY or key in ONLY]
print("CLIMBING DECOR", results)
