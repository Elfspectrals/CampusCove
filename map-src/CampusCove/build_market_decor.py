import importlib
import json
import math
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

TABLE_W = 3.0
TABLE_D = 0.9
TABLE_H = 0.85
POST_X = 1.55
POST_Z = 0.75
FRONT_POST_H = 2.2
BACK_POST_H = 2.6
CANOPY_W = 3.4
CANOPY_STRIPES = 8
STRIPE_MATERIAL = "DC_MarketCanopyStripe"
CANOPY_VARIANTS_KEY = "market_stall_taken"

sc = L.new_build_scene("DECOR_market")
coll = bpy.data.collections.new("MarketDecor")
sc.collection.children.link(coll)


def default_stripe_colour():
    with open(os.path.join(L.FRONT_ASSETS, "variants.json"), encoding="utf-8") as f:
        variants = json.load(f)["items"][CANOPY_VARIANTS_KEY]
    return next(iter(variants.values()))[STRIPE_MATERIAL]["color"]


def mats():
    return {
        "post": L.make_mat("DC_MarketPost", "#7a5636", 0.85, "noise", 0.05),
        "table": L.make_mat("DC_MarketTable", "#b48a5a", 0.85, "planks", 0.05, accent="#93704a"),
        "stripe": L.make_mat(STRIPE_MATERIAL, default_stripe_colour(), 0.9, "noise", 0.03),
        "ecru": L.make_mat("DC_MarketCanopyEcru", "#efe6d2", 0.9, "noise", 0.03),
        "tarp": L.make_mat("DC_MarketTarp", "#6f7a5e", 0.95, "noise", 0.06),
    }


def frame(prefix, m):
    parts = [L.box(coll, f"{prefix}Top", 0.0, 0.0, TABLE_H - 0.05, TABLE_W, TABLE_D, 0.05, m["table"], bevel=0.01)]
    parts.append(L.box(coll, f"{prefix}Skirt", 0.0, TABLE_D / 2 - 0.01, TABLE_H - 0.4, TABLE_W, 0.02, 0.35, m["table"]))
    for k, (gx, gz) in enumerate(((-1.42, -0.38), (1.42, -0.38), (-1.42, 0.38), (1.42, 0.38))):
        parts.append(L.box(coll, f"{prefix}Leg{k}", gx, gz, 0.0, 0.07, 0.07, TABLE_H - 0.05, m["post"]))
    for k, (gx, gz, h) in enumerate(((-POST_X, POST_Z, FRONT_POST_H), (POST_X, POST_Z, FRONT_POST_H), (-POST_X, -POST_Z, BACK_POST_H), (POST_X, -POST_Z, BACK_POST_H))):
        parts.append(L.box(coll, f"{prefix}Post{k}", gx, gz, 0.0, 0.08, 0.08, h, m["post"]))
    parts.append(L.box(coll, f"{prefix}RailFront", 0.0, POST_Z, FRONT_POST_H - 0.06, 2 * POST_X + 0.08, 0.06, 0.06, m["post"]))
    parts.append(L.box(coll, f"{prefix}RailBack", 0.0, -POST_Z, BACK_POST_H - 0.06, 2 * POST_X + 0.08, 0.06, 0.06, m["post"]))
    return parts


def canopy(prefix, m):
    rise = BACK_POST_H - FRONT_POST_H
    run = 2 * POST_Z
    tilt = math.atan2(rise, run)
    length = math.hypot(rise, run) + 0.3
    stripe_w = CANOPY_W / CANOPY_STRIPES
    parts = []
    for k in range(CANOPY_STRIPES):
        gx = -CANOPY_W / 2 + stripe_w * (k + 0.5)
        mat = m["stripe"] if k % 2 == 0 else m["ecru"]
        panel = L.box(coll, f"{prefix}Stripe{k}", gx, 0.0, (FRONT_POST_H + BACK_POST_H) / 2, stripe_w, length, 0.02, mat)
        panel.rotation_euler.x = tilt
        parts.append(panel)
        parts.append(L.box(coll, f"{prefix}Valance{k}", gx, POST_Z + 0.15, FRONT_POST_H - 0.25, stripe_w, 0.02, 0.22, mat))
    return parts


def folded(prefix, m):
    roll = L.cyl(coll, f"{prefix}Roll", 0.0, 0.0, 0.0, 0.09, CANOPY_W, m["stripe"], seg=10)
    roll.rotation_euler.y = math.pi / 2
    roll.location = L.b(-CANOPY_W / 2, -POST_Z + 0.08, BACK_POST_H + 0.06)
    parts = [roll]
    parts.append(L.box(coll, f"{prefix}TarpTop", 0.0, 0.0, TABLE_H, TABLE_W + 0.1, TABLE_D + 0.1, 0.03, m["tarp"]))
    for side, gz in (("F", TABLE_D / 2 + 0.05), ("B", -TABLE_D / 2 - 0.05)):
        parts.append(L.box(coll, f"{prefix}Tarp{side}", 0.0, gz, TABLE_H - 0.32, TABLE_W + 0.1, 0.02, 0.35, m["tarp"]))
    return parts


def stall(state):
    m = mats()
    prefix = f"Stall_{state}_"
    parts = frame(prefix, m)
    if state == "taken":
        parts += canopy(prefix, m)
    if state == "folded":
        parts += folded(prefix, m)
    return parts


DECOR = {
    "market_stall_free": lambda: stall("free"),
    "market_stall_taken": lambda: stall("taken"),
    "market_stall_folded": lambda: stall("folded"),
}

results = [L.ship_decor(sc, coll, key, build(), MAX_MATERIALS) for key, build in DECOR.items() if not ONLY or key in ONLY]
print("MARKET DECOR", results)
