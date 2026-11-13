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

GATE = {"x": 42.6, "z": -17.6, "width": 12.2}
SQUARE = (58.0, 92.0, -34.0, 0.0)
ZONE_EDGE = (52.0, 98.0, -41.0, 7.0)
CENTER = ((SQUARE[0] + SQUARE[1]) / 2, (SQUARE[2] + SQUARE[3]) / 2)
PATH_W = 4.0
BANDSTAND_R = 3.2
BANDSTAND_DECK_H = 0.35
LAMP_H = 3.4
OUT = os.path.join(L.OUT_ROOT, "park", "market_site")
ZONE_FILE = os.path.join(L.FRONT_ASSETS, "zones", "town_market.json")

STALLS = [
    (1, 71.0, -26.5, 0.0),
    (2, 79.0, -26.5, 0.0),
    (3, 84.5, -21.0, -math.pi / 2),
    (4, 84.5, -13.0, -math.pi / 2),
    (5, 79.0, -7.5, math.pi),
    (6, 71.0, -7.5, math.pi),
]
BENCHES = [(CENTER[0] + 5.0 * math.cos(a), CENTER[1] + 5.0 * math.sin(a), -a - math.pi / 2) for a in (math.pi * 0.75, math.pi * 1.25)]
LAMPS = [(59.5, -32.5), (90.5, -32.5), (90.5, -1.5), (59.5, -1.5)]

sc = L.new_build_scene("PARK_market_site")
coll = bpy.data.collections.new("MarketSite")
sc.collection.children.link(coll)
P = {
    "cobble": L.make_mat("TW_MarketCobble", "#b9ad98", 0.9, "tiles", 0.05, accent="#9c907c"),
    "curb": L.make_mat("TW_MarketCurb", "#9a9a9a", 0.8, "noise", 0.03),
    "grass": L.make_mat("TW_MarketGrass", "#79b765", 1.0, "noise", 0.06),
    "wood": L.make_mat("TW_MarketBandWood", "#f2ead8", 0.8, "planks", 0.04, accent="#d9cfb8"),
    "roof": L.make_mat("TW_MarketBandRoof", "#3f6f63", 0.7, "noise", 0.04),
    "metal": L.make_mat("TW_MarketMetal", "#3a3f47", 0.4, "noise", 0.03),
    "lamp": L.make_mat("TW_MarketLampGlow", "#fff1c4", 0.5, "noise", 0.0, emit="#fff1c4"),
    "flag": L.make_mat("TW_MarketBunting", "#e3b83a", 0.9, "noise", 0.04, accent="#c8463c"),
    "sign": L.make_mat("TW_MarketSignBoard", "#7a5636", 0.85, "planks", 0.05, accent="#5e4129"),
    "text": L.make_mat("TW_MarketSignText", "#fff6dc", 0.5, "noise", 0.0, emit="#fff6dc", emit_strength=1.0),
    "leaf": L.make_mat("TW_LeafMarket", "#4f9d54", 0.9, "noise", 0.06),
    "trunk": L.make_mat("TW_TrunkMarket", "#7a5638", 0.8, "planks", 0.04, accent="#5e4129"),
}
so = []
col = []


def add_col(name, gx, gz, sx, sz, h, yaw=0.0):
    col.append({"name": name, "cx": round(gx, 3), "cz": round(gz, 3), "hx": round(sx / 2, 3), "hz": round(sz / 2, 3), "hy": round(h / 2, 3), "cy": round(h / 2, 3), "yaw": round(yaw, 4)})


so.append(L.box(coll, "MS_Lawn", (ZONE_EDGE[0] + ZONE_EDGE[1]) / 2, (ZONE_EDGE[2] + ZONE_EDGE[3]) / 2, 0.0, ZONE_EDGE[1] - ZONE_EDGE[0], ZONE_EDGE[3] - ZONE_EDGE[2], 0.02, P["grass"], tile=2.0))
so.append(L.box(coll, "MS_Square", CENTER[0], CENTER[1], 0.0, SQUARE[1] - SQUARE[0], SQUARE[3] - SQUARE[2], 0.04, P["cobble"], tile=2.0))
path_x0, path_x1 = GATE["x"] + 1.0, SQUARE[0]
so.append(L.box(coll, "MS_Path", (path_x0 + path_x1) / 2, GATE["z"], 0.0, path_x1 - path_x0, PATH_W, 0.04, P["cobble"], tile=2.0))
for side, dz in (("N", -PATH_W / 2 - 0.1), ("S", PATH_W / 2 + 0.1)):
    so.append(L.box(coll, f"MS_Curb{side}", (path_x0 + path_x1) / 2, GATE["z"] + dz, 0.0, path_x1 - path_x0, 0.2, 0.08, P["curb"]))

so.append(L.cyl(coll, "MS_BandDeck", CENTER[0], CENTER[1], 0.0, BANDSTAND_R, BANDSTAND_DECK_H, P["wood"], seg=8))
for k in range(8):
    a = (k + 0.5) * math.pi / 4
    so.append(L.box(coll, f"MS_BandPost{k}", CENTER[0] + (BANDSTAND_R - 0.25) * math.cos(a), CENTER[1] + (BANDSTAND_R - 0.25) * math.sin(a), BANDSTAND_DECK_H, 0.14, 0.14, 2.5, P["wood"]))
so.append(L.cone(coll, "MS_BandRoof", CENTER[0], CENTER[1], BANDSTAND_DECK_H + 2.5, BANDSTAND_R + 0.6, 0.15, 1.6, P["roof"], seg=8))
add_col("COL_Market_Bandstand", CENTER[0], CENTER[1], 2 * BANDSTAND_R - 0.4, 2 * BANDSTAND_R - 0.4, 2.0)

for i, (gx, gz) in enumerate(LAMPS):
    so.append(L.cyl(coll, f"MS_Lamp{i}_Pole", gx, gz, 0.0, 0.07, LAMP_H, P["metal"], seg=6))
    so.append(L.box(coll, f"MS_Lamp{i}_Head", gx, gz, LAMP_H, 0.5, 0.5, 0.3, P["lamp"], bevel=0.03))
    add_col(f"COL_Market_Lamp{i}", gx, gz, 0.3, 0.3, LAMP_H)


def bunting(name, ax, az, bx, bz, y):
    length = math.hypot(bx - ax, bz - az)
    yaw = math.atan2(bz - az, bx - ax)
    rope = L.box(coll, f"{name}_Rope", (ax + bx) / 2, (az + bz) / 2, y, length, 0.02, 0.02, P["metal"])
    rope.rotation_euler.z = -yaw
    so.append(rope)
    for k in range(int(length / 0.8)):
        t = (k + 0.5) / int(length / 0.8)
        flag = L.cone(coll, f"{name}_Flag{k}", ax + (bx - ax) * t, az + (bz - az) * t, y - 0.32, 0.0, 0.18, 0.3, P["flag"], seg=3)
        so.append(flag)


for i, ((ax, az), (bx, bz)) in enumerate(zip(LAMPS[:-1], LAMPS[1:])):
    bunting(f"MS_Bunting{i}", ax, az, bx, bz, LAMP_H - 0.1)

trees = [(56.0, -25.0), (56.0, -9.0), (95.0, -17.0), (66.0, 3.0), (84.0, 3.0), (66.0, -37.0), (84.0, -37.0)]
for i, (gx, gz) in enumerate(trees):
    so.append(L.cyl(coll, f"MS_TreeTrunk{i}", gx, gz, 0.0, 0.22, 1.6, P["trunk"], seg=6))
    so.append(L.cone(coll, f"MS_TreeA{i}", gx, gz, 1.4, 1.6, 0.3, 2.4, P["leaf"], seg=7))
    add_col(f"COL_Market_Tree{i}", gx, gz, 0.6, 0.6, 3.0)

sign_x, sign_z = SQUARE[0] - 1.5, GATE["z"] - PATH_W / 2 - 1.2
so.append(L.box(coll, "MS_SignPost", sign_x, sign_z, 0.0, 0.14, 0.14, 2.3, P["metal"]))
so.append(L.box(coll, "MS_SignBoard", sign_x, sign_z, 1.5, 0.12, 2.6, 0.8, P["sign"]))
sign_text = L.text_mesh(coll, "MS_SignText", "MARKET  SAT 15-17", sign_x - 0.07, sign_z, 1.72, 0.26, 0.03, P["text"])
sign_text.rotation_euler.z = -math.pi / 2
so.append(sign_text)
add_col("COL_Market_Sign", sign_x, sign_z, 0.3, 2.6, 2.3)

props = [{"id": f"market_stall_{n}", "kind": "market_stall", "stallNo": n, "position": [gx, 0.0, gz], "yaw": round(yaw, 4), "scale": [1, 1, 1]} for n, gx, gz, yaw in STALLS]
props += [{"id": f"market_bench_{i}", "kind": "decor", "key": "garden_bench", "position": [round(gx, 3), 0.0, round(gz, 3)], "yaw": round(yaw, 4), "scale": [1, 1, 1]} for i, (gx, gz, yaw) in enumerate(BENCHES)]
SHOPPERS = [
    ("#e0b48f", [("hair", "long", "#3b2a20"), ("top", "sweater", "#c8463c"), ("bottom", "jeans", "#34506e"), ("shoes", "sneakers", "#f0f0f0")]),
    ("#a7714f", [("hair", "short", "#6b4a2f"), ("top", "plaid_shirt", "#4f7a46"), ("bottom", "cargo", "#6b6a45"), ("shoes", "boots", "#4a3322")]),
    ("#f1cfae", [("hair", "ponytail", "#d9b36c"), ("top", "tee", "#e3b83a"), ("bottom", "skirt", "#8657a8"), ("shoes", "runners", "#ffffff")]),
    ("#6b4630", [("hair", "curly", "#1f1a17"), ("top", "hoodie", "#3f6fb5"), ("bottom", "joggers", "#444444"), ("shoes", "high_tops", "#c8463c")]),
    ("#c99a74", [("hair", "basic", "#8a8a8a"), ("top", "flannel_jacket", "#a0522d"), ("bottom", "dungarees", "#3f5f8a"), ("shoes", "rubber_boots", "#3f7a4a"), ("head_accessory", "straw_hat", "#d8b56a")]),
    ("#8a5a3c", [("hair", "buzz", "#2b2b2b"), ("top", "varsity", "#2f6f63"), ("bottom", "track_pants", "#222222"), ("shoes", "slides", "#e07a35")]),
]
props += [
    {"id": f"market_shopper_{i}", "kind": "npc", "position": [round(CENTER[0] - 6.0, 3), 0.0, round(CENTER[1] - 3.0 + i * 1.2, 3)], "yaw": 0.0, "scale": [1, 1, 1],
     "pose": "idle", "vendor": False, "body": body, "outfit": [{"slot": slot, "key": key, "color": color} for slot, key, color in outfit]}
    for i, (body, outfit) in enumerate(SHOPPERS)
]
if not os.path.exists(ZONE_FILE):
    L.write_json(ZONE_FILE, {"version": 1, "zone": "town_market", "name": "Town market", "props": props, "areas": []})
decor_objs, decor_cols, _ = L.zone_decor(coll, "town_market", "COL_Market_")

bad = L.check_grounded(so, allow=("MS_Lawn", "MS_Square", "MS_Path", "MS_Curb", "MS_Band", "MS_Lamp", "MS_Bunting", "MS_Tree", "MS_Sign"))
assert not bad, bad
so += decor_objs
col += decor_cols

L.export_glb(os.path.join(OUT, "market_site.glb"), so)
bounds = {"minX": GATE["x"], "maxX": ZONE_EDGE[1], "minZ": ZONE_EDGE[2], "maxZ": ZONE_EDGE[3]}
L.write_json(os.path.join(OUT, "market_site.layout.json"), {"version": 1, "bounds": bounds, "gate": GATE, "collision": col})

tris = sum(len(p.vertices) - 2 for o in so for p in o.data.polygons)
print("MARKET SITE", len(so), "objects,", tris, "triangles,", len(col), "collision boxes")
