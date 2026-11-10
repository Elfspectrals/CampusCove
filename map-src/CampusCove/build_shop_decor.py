import importlib
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


def candy_mats():
    return {
        "cream": L.make_mat("DC_CandyCream", "#fdf6ee", 0.5, "noise", 0.01),
        "jar": L.make_mat("DC_CandyJar", "#e6f6fb", 0.1, "noise", 0.01, alpha=0.35),
        "chrome": L.make_mat("DC_CandyChrome", "#d9dde2", 0.2, "noise", 0.02),
        "stripe": L.make_mat("DC_CandyStripe", "#e0534f", 0.6, "stripes", 0.02, accent="#fdf6ee"),
        "fills": [L.make_mat(f"DC_CandyFill{i}", c, 0.4, "noise", 0.05) for i, c in enumerate(("#e0534f", "#f6d04d", "#79b765", "#38a3c9"))],
    }


def candy_jar_shelf():
    m = candy_mats()
    parts = [L.box(coll, f"Upright{i}", x, 0.0, 0.0, 0.04, 0.4, 2.34, m["cream"]) for i, x in enumerate((-0.98, 0.98))]
    for lv, y in enumerate((0.9, 1.6, 2.3)):
        parts.append(L.box(coll, f"Shelf{lv}", 0.0, 0.0, y, 2.0, 0.4, 0.04, m["cream"]))
        for i, x in enumerate((-0.5, 0.5)):
            r, h = 0.14 + 0.03 * i, 0.4 + 0.08 * ((i + lv) % 3)
            parts += [
                L.cyl(coll, f"Fill{lv}_{i}", x, 0.0, y + 0.04, r - 0.02, h * 0.7, m["fills"][(i + lv) % 3], seg=10),
                L.cyl(coll, f"Glass{lv}_{i}", x, 0.0, y + 0.04, r, h, m["jar"], seg=10),
                L.cyl(coll, f"Lid{lv}_{i}", x, 0.0, y + 0.04 + h, r + 0.01, 0.04, m["chrome"], seg=10),
            ]
    return parts


def pick_mix_island():
    m = candy_mats()
    mint = L.make_mat("DC_CandyMint", "#9fe0cf", 0.6, "noise", 0.02)
    mint_stripe = L.make_mat("DC_CandyStripeMint", "#9fe0cf", 0.6, "stripes", 0.02, accent="#fdf6ee")
    parts = [L.cyl(coll, "Base", 0.0, 0.0, 0.0, 1.6, 0.9, mint, seg=6)]
    for k in range(6):
        a = 2 * math.pi * k / 6
        gx, gz = 1.1 * math.cos(a), 1.1 * math.sin(a)
        parts.append(L.box(coll, f"Bin{k}", gx, gz, 0.9, 0.55, 0.45, 0.25, m["jar"], rot=-a))
        parts.append(L.box(coll, f"BinFill{k}", gx, gz, 0.9, 0.5, 0.4, 0.18, m["fills"][k % 3], rot=-a))
    parts.append(L.cyl(coll, "Post", 0.0, 0.0, 0.9, 0.05, 1.6, mint_stripe, seg=8))
    return parts


def lollipop_tree():
    m = candy_mats()
    parts = [L.cyl(coll, "Base", 0.0, 0.0, 0.0, 0.5, 0.1, m["cream"], seg=12), L.cyl(coll, "Trunk", 0.0, 0.0, 0.1, 0.06, 1.6, m["stripe"], seg=8)]
    for k in range(10):
        a = 2 * math.pi * k / 10
        r = 0.45 + 0.2 * (k % 2)
        gx, gz = r * math.cos(a), r * math.sin(a)
        parts.append(L.box(coll, f"Branch{k}", gx / 2, gz / 2, 1.0 + 0.2 * (k % 3), r, 0.016, 0.016, m["cream"], rot=-a))
        parts.append(L.cyl(coll, f"Stick{k}", gx, gz, 1.0 + 0.2 * (k % 3), 0.008, 0.3, m["cream"], seg=4))
        parts.append(L.cyl(coll, f"Head{k}", gx, gz, 1.3 + 0.2 * (k % 3), 0.07, 0.02, m["fills"][k % 4], seg=10))
    return parts


def cotton_candy_machine():
    m = candy_mats()
    machine = L.make_mat("DC_CandyMachine", "#d94f8a", 0.4, "noise", 0.02)
    return [
        L.box(coll, "Body", 0.0, 0.0, 0.0, 1.0, 1.0, 0.85, machine, bevel=0.03),
        L.box(coll, "Rim", 0.0, 0.0, 0.85, 1.1, 1.1, 0.08, m["chrome"], bevel=0.02),
        L.box(coll, "Bowl", 0.0, 0.0, 0.93, 0.9, 0.9, 0.25, m["jar"], bevel=0.02),
    ]


def candy_apple_tray():
    m = candy_mats()
    parts = [
        L.box(coll, "Table", 0.0, 0.0, 0.0, 1.0, 0.7, 0.85, m["cream"], bevel=0.02),
        L.box(coll, "Top", 0.0, 0.0, 0.85, 1.1, 0.8, 0.05, m["chrome"], bevel=0.01),
    ]
    parts += [L.cyl(coll, f"Apple{k}", -0.3 + (k % 3) * 0.3, -0.175 + (k // 3) * 0.35, 0.9, 0.06, 0.12, m["fills"][0], seg=8) for k in range(6)]
    return parts


def gum_stand():
    pink = L.make_mat("DC_CandyPink", "#f7a1c4", 0.6, "noise", 0.02)
    return [
        L.box(coll, "Pedestal", 0.0, 0.0, 0.0, 0.46, 0.36, 1.01, pink, bevel=0.02),
        L.box(coll, "Rack", 0.0, 0.0, 1.01, 0.5, 0.4, 0.5, candy_mats()["cream"]),
    ]


def sport_mats():
    return {
        "black": L.make_mat("DC_SportBlack", "#1b1d22", 0.6, "noise", 0.01),
        "white": L.make_mat("DC_SportWhite", "#fbfaf8", 0.5, "noise", 0.01),
        "chrome": L.make_mat("DC_SportChrome", "#d9dde2", 0.15, "noise", 0.02),
        "yellow": L.make_mat("DC_SportYellow", "#f0b429", 0.6, "noise", 0.02),
        "rubber": L.make_mat("DC_SportRubber", "#3a3f47", 0.9, "noise", 0.03),
        "lightbox": L.make_mat("DC_SportLightbox", "#fdfcf8", 0.4, "noise", 0.0, emit="#fffaf0", emit_strength=0.8),
    }


def clothes_wall_rail(hangers, panel):
    m = sport_mats()
    span = 1.25 * (hangers - 1)
    parts = [L.box(coll, "Panel", 0.0, -0.22, 0.0, span + 1.8, 0.05, 2.7, panel)]
    parts += [L.box(coll, f"Bracket{i}", x, 0.0, 1.97, 0.04, 0.5, 0.04, m["chrome"]) for i, x in enumerate((-span / 2 - 0.75, span / 2 + 0.75))]
    parts.append(L.box(coll, "Bar", 0.0, 0.17, 1.95, span + 1.6, 0.03, 0.03, m["chrome"]))
    parts += [L.box(coll, f"Hanger{i}", -span / 2 + 1.25 * i, 0.17, 1.89, 0.03, 0.03, 0.09, m["chrome"]) for i in range(hangers)]
    return parts


def folded_clothes_table(w, d, body, stack_colors):
    m = sport_mats()
    stacks = [L.make_mat(f"DC_ClothesStack_{c[1:]}", c, 0.9, "stripes", 0.03, accent=c) for c in stack_colors]
    parts = [L.box(coll, "Top", 0.0, 0.0, 0.86, w, d, 0.04, m["white"], bevel=0.01), L.box(coll, "Body", 0.0, 0.0, 0.0, w - 0.3, d - 0.3, 0.86, body)]
    n = max(1, int(w / 0.42))
    for i in range(n):
        for r in range(2):
            parts.append(L.box(coll, f"Stack{i}_{r}", -w / 2 + (i + 0.5) * w / n, -d / 4 + r * d / 2, 0.9, 0.36, d / 2 - 0.1, 0.14 + 0.05 * ((i + r) % 3), stacks[(i + r * 3) % len(stacks)]))
    return parts


def dumbbell_rack():
    m = sport_mats()
    parts = [L.box(coll, "Frame", 0.0, 0.0, 0.0, 2.2, 1.0, 0.9, m["rubber"])]
    for i in range(6):
        x = -0.9 + i * 0.36
        parts.append(L.cyl(coll, f"Bar{i}", x, 0.0, 0.92, 0.015, 0.4, m["chrome"], seg=6))
        parts += [L.cyl(coll, f"Weight{i}_{k}", x, z, 0.9, 0.07 + 0.01 * (i % 3), 0.08, m["rubber"], seg=8) for k, z in enumerate((-0.25, 0.25))]
    return parts


def yoga_mat_rolls():
    blue = L.make_mat("DC_SportMatBlue", "#1f5fae", 0.9, "noise", 0.03)
    red = L.make_mat("DC_SportMatRed", "#e0534f", 0.9, "noise", 0.03)
    return [L.cyl(coll, f"Mat{i}", -0.5 + i * 0.25, 0.0, 0.0, 0.1, 0.6 + 0.05 * (i % 2), blue if i % 2 else red, seg=8) for i in range(5)]


def treadmill():
    m = sport_mats()
    return [
        L.box(coll, "Deck", 0.0, 0.0, 0.0, 0.8, 1.8, 0.18, m["rubber"], bevel=0.02),
        L.box(coll, "Belt", 0.0, 0.0, 0.18, 0.6, 1.6, 0.03, m["black"]),
        L.box(coll, "Upright", 0.0, 0.8, 0.18, 0.7, 0.1, 1.2, m["chrome"]),
        L.box(coll, "Console", 0.0, 0.85, 1.3, 0.7, 0.2, 0.25, m["lightbox"], bevel=0.02),
    ]


def basketball_hoop():
    m = sport_mats()
    ball = L.make_mat("DC_SportBall", "#f28c28", 0.7, "noise", 0.04, accent="#1b1d22")
    return [
        L.box(coll, "Pole", 0.0, -0.07, 0.0, 0.08, 0.08, 3.4, m["black"]),
        L.box(coll, "Board", 0.0, 0.0, 2.6, 1.2, 0.06, 0.9, m["white"]),
        L.box(coll, "Square", 0.0, 0.04, 2.75, 0.5, 0.02, 0.4, m["yellow"]),
        L.box(coll, "RingBracket", 0.0, 0.055, 2.75, 0.06, 0.05, 0.03, ball),
        L.cyl(coll, "Ring", 0.0, 0.3, 2.75, 0.23, 0.03, ball, seg=12),
        L.cyl(coll, "Ball", 1.0, 0.5, 0.0, 0.12, 0.24, ball, seg=10),
    ]


def mannequin_podium(radius, seg, edge, tag_posts):
    m = sport_mats()
    parts = [L.cyl(coll, "Platform", 0.0, 0.0, 0.0, radius, 0.14, m["white"], seg=seg), L.cyl(coll, "Edge", 0.0, 0.0, 0.14, radius, 0.02, m[edge], seg=seg)]
    parts += [L.cyl(coll, f"TagPost{i}", x, z, 0.14, 0.02, 0.18, m["chrome"], seg=6) for i, (x, z) in enumerate(tag_posts)]
    return parts


def wide_podium_tag_posts():
    angles = [math.radians(-40 + i * 26.7) for i in range(4)]
    return [(1.7 * math.sin(a), 0.35 + 0.5 * math.cos(a)) for a in angles]


def shoe_wall_shelf(length=6.4):
    white = sport_mats()["white"]
    mirror = L.make_mat("DC_NorthMirror", "#cfd8dd", 0.08, "noise", 0.02, emit="#dde6ea", emit_strength=0.25)
    parts = [L.box(coll, f"Shelf{lv}", 0.0, 0.0, y, length, 0.5, 0.03, white) for lv, y in enumerate((0.35, 1.02, 1.75))]
    parts += [L.box(coll, f"Side{k}", x, 0.0, 0.0, 0.04, 0.5, 2.2, white) for k, x in enumerate((-length / 2, length / 2))]
    parts.append(L.box(coll, "Back", 0.0, -0.22, 0.0, length, 0.05, 2.2, mirror))
    return parts


def head_form_table(forms=5):
    white = sport_mats()["white"]
    oak = L.make_mat("DC_NorthOak", "#dcc29a", 0.6, "planks", 0.03, accent="#c9ad84")
    form = L.make_mat("DC_NorthForm", "#f2efe9", 0.4, "noise", 0.01)
    length = 1.2 * forms
    parts = [L.box(coll, "Top", 0.0, 0.0, 0.86, length, 0.8, 0.04, oak), L.box(coll, "Body", 0.0, 0.0, 0.0, length - 0.1, 0.7, 0.86, white)]
    for i in range(forms):
        x = -length / 2 + 0.6 + 1.2 * i
        parts += [
            L.cyl(coll, f"Neck{i}", x, 0.0, 0.9, 0.045, 0.57, form, seg=10),
            L.box(coll, f"Base{i}", x, 0.0, 0.9, 0.2, 0.2, 0.03, form, bevel=0.01),
            L.box(coll, f"Head{i}", x, 0.0, 1.45, 0.18, 0.16, 0.21, form, bevel=0.07),
        ]
    return parts


def round_clothes_rail(r=0.9):
    chrome = sport_mats()["chrome"]
    garments = [L.make_mat(f"DC_ClothesStack_{c[1:]}", c, 0.9, "stripes", 0.03, accent=c) for c in NORTHLINE_STACKS]
    parts = [L.cyl(coll, "Base", 0.0, 0.0, 0.0, 0.3, 0.04, chrome, seg=12), L.cyl(coll, "Pole", 0.0, 0.0, 0.04, 0.03, 1.4, chrome, seg=8),
             L.cyl(coll, "Ring", 0.0, 0.0, 1.4, r, 0.03, chrome, seg=24)]
    count = int(2 * math.pi * r / 0.22)
    for k in range(count):
        a = 2 * math.pi * k / count
        parts.append(L.box(coll, f"Garment{k}", r * math.cos(a), r * math.sin(a), 0.5, 0.05, 0.4, 0.9, garments[k % len(garments)], rot=-a))
    return parts


def display_cube_stacks():
    white = sport_mats()["white"]
    stacks = [L.make_mat(f"DC_ClothesStack_{c[1:]}", c, 0.9, "stripes", 0.03, accent=c) for c in NORTHLINE_STACKS]
    parts = [L.box(coll, "Body", 0.0, 0.0, 0.0, 1.4, 1.4, 0.9, white, bevel=0.02)]
    parts += [L.box(coll, f"Stack{k}", -0.45 + k * 0.3, 0.0, 0.9, 0.26, 0.34, 0.14 + 0.05 * (k % 2), stacks[k]) for k in range(4)]
    return parts


SPORT_STACKS = ("#1f2a5a", "#f0b429", "#2fa17a", "#e0534f")
NORTHLINE_STACKS = ("#c8102e", "#1f2a5a", "#8fb7d9", "#f0b8a8")


def knick_shelf(length=3.0, depth=0.38):
    timber = L.make_mat("DC_HearthTimber", "#c9a36a", 0.7, "planks", 0.05, accent="#a98550")
    steel = L.make_mat("DC_HearthSteel", "#2f3338", 0.55, "noise", 0.03)
    objects = [L.make_mat(f"DC_HearthObj{i}", c, 0.6, "noise", 0.03) for i, c in enumerate(("#e0533d", "#f6d04d", "#3f7f8c", "#f07fa8"))]
    parts = [L.box(coll, f"Post{k}", k * length / 2, 0.0, 0.0, 0.05, depth, 2.1, steel) for k in (-1, 1)]
    n = int(length / 0.45)
    for lv in range(4):
        y = 0.4 + lv * 0.55
        parts.append(L.box(coll, f"Board{lv}", 0.0, 0.0, y, length, depth, 0.035, timber))
        for i in range(n):
            x = -length / 2 + (i + 0.5) * length / n
            m = objects[(i + lv * 3) % len(objects)]
            kind = (i * 2 + lv) % 3
            if kind == 0:
                parts.append(L.box(coll, f"Obj{lv}_{i}", x, 0.0, y + 0.035, 0.22, 0.22, 0.18 + 0.06 * (i % 3), m))
            elif kind == 1:
                parts.append(L.cyl(coll, f"Obj{lv}_{i}", x, 0.0, y + 0.035, 0.09, 0.26 + 0.05 * (i % 2), m, seg=6))
            else:
                parts.append(L.cyl(coll, f"Obj{lv}_{i}", x, 0.0, y + 0.035, 0.12, 0.12, m, seg=6))
    return parts


def wood_display_table(width):
    top = L.make_mat("DC_HearthTable", "#b8884f", 0.6, "planks", 0.04, accent="#96693a")
    steel = L.make_mat("DC_HearthSteel", "#2f3338", 0.55, "noise", 0.03)
    parts = [L.box(coll, "Top", 0.0, 0.0, 0.73, width, 0.9, 0.05, top, bevel=0.01)]
    parts += [L.box(coll, f"Leg{k}", x, z, 0.0, 0.07, 0.07, 0.73, steel) for k, (x, z) in enumerate((x, z) for x in (-width / 2 + 0.15, width / 2 - 0.15) for z in (-0.3, 0.3))]
    return parts


def concrete_plinth():
    return [L.box(coll, "Plinth", 0.0, 0.0, 0.0, 0.6, 0.6, 0.4, L.make_mat("DC_HearthConcrete", "#b9b3a8", 0.9, "noise", 0.03), bevel=0.02)]


def potted_shrub():
    pot = L.make_mat("DC_Terracotta", "#b9633f", 0.8, "noise", 0.04)
    leaf = L.make_mat("DC_Leaf", "#4f9d54", 0.9, "noise", 0.06)
    return [
        L.box(coll, "Pot", 0.0, 0.0, 0.0, 0.4, 0.4, 0.4, pot, bevel=0.03),
        L.box(coll, "Leaves", 0.0, 0.0, 0.4, 0.5, 0.5, 0.5, leaf, bevel=0.08),
        L.box(coll, "Crown", 0.0, 0.0, 0.9, 0.35, 0.35, 0.4, leaf, bevel=0.06),
    ]


DECOR = {
    "checkout_counter": checkout_counter,
    "shop_rack": shop_rack,
    "key_kiosk": key_kiosk,
    "lumber_rack": lumber_rack,
    "tool_pegboard": tool_pegboard,
    "paint_chip_board": paint_chip_board,
    "display_plinth": display_plinth,
    "candy_jar_shelf": candy_jar_shelf,
    "pick_mix_island": pick_mix_island,
    "lollipop_tree": lollipop_tree,
    "cotton_candy_machine": cotton_candy_machine,
    "candy_apple_tray": candy_apple_tray,
    "gum_stand": gum_stand,
    "clothes_wall_rail": lambda: clothes_wall_rail(3, sport_mats()["lightbox"]),
    "folded_clothes_table": lambda: folded_clothes_table(3.0, 1.2, sport_mats()["black"], SPORT_STACKS),
    "dumbbell_rack": dumbbell_rack,
    "yoga_mat_rolls": yoga_mat_rolls,
    "treadmill": treadmill,
    "basketball_hoop": basketball_hoop,
    "mannequin_podium": lambda: mannequin_podium(1.8, 24, "yellow", ((-0.8, 0.55), (0.8, 0.55))),
    "knick_shelf": knick_shelf,
    "wood_display_table": lambda: wood_display_table(2.6),
    "wood_display_table_small": lambda: wood_display_table(1.2),
    "concrete_plinth": concrete_plinth,
    "potted_shrub": potted_shrub,
    "mirror_wall_rail": lambda: clothes_wall_rail(5, L.make_mat("DC_NorthMirror", "#cfd8dd", 0.08, "noise", 0.02, emit="#dde6ea", emit_strength=0.25)),
    "shoe_wall_shelf": shoe_wall_shelf,
    "head_form_table": head_form_table,
    "white_clothes_table": lambda: folded_clothes_table(3.2, 1.4, sport_mats()["white"], NORTHLINE_STACKS),
    "white_clothes_table_long": lambda: folded_clothes_table(4.0, 1.6, sport_mats()["white"], NORTHLINE_STACKS),
    "round_clothes_rail": round_clothes_rail,
    "display_cube_stacks": display_cube_stacks,
    "mannequin_podium_wide": lambda: mannequin_podium(2.5, 32, "chrome", wide_podium_tag_posts()),
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
