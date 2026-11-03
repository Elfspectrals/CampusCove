"""Habillage des vitrines planifiées (spec C.1) et des cellules en travaux (spec D) du Cove Parkview Mall.

`dress_planned(ctx, cell, frame)` pose, par module de 8 m centré sur la vitre, le décor de la catégorie de la cellule
(mannequins, rayonnages, comptoirs…) derrière la vitrine ; `dress_construction(ctx, cell, frame)` installe la bande de
chantier de 2,6 m devant la palissade (rubalise, palettes, bétonnière, lampe, cônes…). Le repère `frame` est celui du
contrat de build_mall.py : `to_world(d, s)`, `yaw`, `y0`, `width`, `glass_half`. `light_mat(ctx, category)` donne le
matériau émissif du plafonnier de la catégorie (familles d'éclairage de C.1) pour la structure C.0.
"""
import math

import lib_common as L

FLOOR_LIFT = 0.02
MODULE_W = 8.0
LIGHT_FAMILY = {
    "clothing_women": "#fff1c4", "clothing_men": "#fff1c4", "clothing_kids": "#ffffff", "clothing_luxury": "#ffe2a0", "clothing_sport": "#eef4ff",
    "shoes": "#fff1c4", "eyewear": "#eef4ff", "jewelry": "#ffe2a0", "cosmetics": "#ffd6e6", "sports": "#eef4ff", "toys": "#ffffff", "books": "#ffe9c7",
    "music": "#c9b6ff", "electronics": "#e6f0ff", "camera": "#eef4ff", "phones": "#e6f0ff", "gifts": "#fff1c4", "home_decor": "#fff1c4", "hardware": "#eef4ff",
    "pharmacy": "#eef4ff", "pet": "#fff1c4", "gym": "#ffd6e6", "arcade": "#c9b6ff", "cinema": "#ffe2a0", "restaurant": "#ffe9c7", "fast_food": "#fff1c4",
    "cafe": "#ffe9c7", "ice_cream": "#ffd6e6", "bakery": "#ffe2a0", "play": "#ffffff", "services": "#eef4ff",
}
LIGHT_NAMES = {"#fff1c4": "Warm", "#ffffff": "White", "#ffe2a0": "Gold", "#eef4ff": "Cool", "#ffd6e6": "Rose", "#ffe9c7": "Soft", "#c9b6ff": "Violet", "#e6f0ff": "BlueWhite"}
COLORS = {
    "ivory": "#f4f2ee", "ink": "#1b1d22", "rose": "#e8738f", "navy": "#1f3f8f", "apricot": "#f2a65a", "sky": "#5ac8e8", "coral": "#e54b4b", "gold": "#b08a3e",
    "wine": "#8b1e3f", "teal": "#2fa17a", "brown": "#8a5a3c", "gilt": "#c9a227", "mauve": "#d989c7", "white": "#ffffff", "orange": "#f28c28", "forest": "#1f8f5f",
    "green": "#79b765", "tan": "#b98c5a", "walnut": "#6d4c2f", "violet": "#5b3fb5", "terracotta": "#c47c4c", "rust": "#e07a2e", "mint": "#3aa89a", "beige": "#e8d7b4",
    "gym": "#d94f4f", "magenta": "#b73cc9", "bun": "#e3a24e", "patty": "#4a2a17", "coffee": "#6b4a2b", "crate": "#c98a3e", "biscuit": "#e8c48a", "grape": "#6a3aa8",
    "mustard": "#f0b429", "brick": "#b8472f", "silver": "#cfd3da",
}


def light_mat(ctx, category):
    """Matériau émissif du plafonnier de vitrine pour `category` (8 familles, `emit_strength` 1,2)."""
    hexcol = LIGHT_FAMILY.get(category, "#fff1c4")
    return L.make_mat(f"TW_MallLight{LIGHT_NAMES[hexcol]}", hexcol, 0.5, "noise", 0.0, emit=hexcol, emit_strength=1.2)


def _mats(ctx):
    P = ctx.P
    M = {k: L.make_mat(f"TW_MallDress{k.capitalize()}", c, 0.75, "noise", 0.03) for k, c in COLORS.items()}
    M.update({k: P[k] for k in ("dark", "pink", "yellow", "blue", "red", "steel", "rail", "wood", "band", "glass", "panel", "neon", "clock", "lamp", "soft",
                                "plywood", "caution", "cone", "pallet", "slab", "metal", "leaf", "soon")})
    M["books"] = L.make_mat("TW_MallBooks", "#d9473a", 0.8, "stripes", 0.05, accent="#1f5fae")
    M["cement"] = L.make_mat("TW_MallCementBag", "#cfd3da", 0.9, "stripes", 0.03, accent="#9aa0a8")
    M["reel"] = L.make_mat("TW_MallReel", "#f28c28", 0.8, "noise", 0.03)
    M["cross"] = L.make_mat("TW_MallLightPharmacy", "#35e39b", 0.5, "noise", 0.0, emit="#35e39b", emit_strength=1.4)
    M["arcade"] = L.make_mat("TW_MallLightArcade", "#ff4fd8", 0.5, "noise", 0.0, emit="#ff4fd8", emit_strength=1.4)
    M["cool"] = light_mat(ctx, "eyewear")
    M["bluewhite"] = light_mat(ctx, "phones")
    M["warm"] = light_mat(ctx, "shoes")
    return M


class _Frame:

    def __init__(self, ctx, frame, prefix, s0=0.0, lift=FLOOR_LIFT):
        self.ctx = ctx
        self.f = frame
        self.prefix = prefix
        self.s0 = s0
        self.y = frame.y0 + lift
        self.yaw = frame.yaw

    def world(self, d, s):
        return self.f.to_world(d, self.s0 + s)

    def box(self, suffix, d, s, y, sx, sz, h, mat, bevel=0.0, tile=1.0):
        gx, gz = self.world(d, s)
        return self.ctx.box(f"{self.prefix}_{suffix}", gx, gz, self.y + y, sx, sz, h, mat, rot=self.yaw, bevel=bevel, tile=tile)

    def turned(self, suffix, d, s, y, sx, sz, h, mat, yaw=0.0, tilt=0.0, roll=0.0, bevel=0.0):
        gx, gz = self.world(d, s)
        if tilt == 0.0 and roll == 0.0 and abs(math.sin(2 * yaw)) < 1e-6:
            return self.ctx.box(f"{self.prefix}_{suffix}", gx, gz, self.y + y, sx, sz, h, mat, rot=self.yaw + yaw, bevel=bevel)
        o = self.ctx.add(L.box(self.ctx.coll, f"{self.prefix}_{suffix}", gx, gz, self.y + y, sx, sz, h, mat, bevel=bevel))
        o.rotation_euler = (tilt, roll, self.yaw + yaw)
        return o

    def cyl(self, suffix, d, s, y, r, h, mat, seg=6):
        gx, gz = self.world(d, s)
        return self.ctx.cyl(f"{self.prefix}_{suffix}", gx, gz, self.y + y, r, h, mat, seg=seg)

    def disc(self, suffix, d, s, y, r, thick, mat, seg=8):
        gx, gz = self.world(d, s)
        o = self.ctx.cyl(f"{self.prefix}_{suffix}", gx, gz, self.y + y, r, thick, mat, seg=seg)
        o.rotation_euler = (math.pi / 2, 0.0, self.yaw)
        return o

    def cone(self, suffix, d, s, y, r1, r2, h, mat, seg=6):
        gx, gz = self.world(d, s)
        return self.ctx.cone(f"{self.prefix}_{suffix}", gx, gz, self.y + y, r1, r2, h, mat, seg=seg)

    def lying(self, suffix, d, s, y, r, length, mat, seg=8):
        gx, gz = self.world(d, s - length / 2)
        o = self.ctx.cyl(f"{self.prefix}_{suffix}", gx, gz, self.y + y, r, length, mat, seg=seg)
        o.rotation_euler = (0.0, math.pi / 2, self.yaw)
        return o

    def col(self, suffix, d, s, sx, sz, h):
        gx, gz = self.world(d, s)
        self.ctx.cols.add(f"{self.prefix}_{suffix}", gx, gz, self.f.y0, sx, sz, h, rot=self.yaw)

    # ------------------------------------------------------------ composed shapes of C.1
    def mannequin(self, suffix, d, s, y, top, bottom, k=1.0, M=None):
        self.cyl(f"{suffix}_Base", d, s, y, 0.2 * k, 0.04 * k, M["ivory"], 6)
        self.box(f"{suffix}_Legs", d, s, y + 0.04 * k, 0.32 * k, 0.2 * k, 0.9 * k, bottom)
        self.box(f"{suffix}_Torso", d, s, y + 0.94 * k, 0.4 * k, 0.24 * k, 0.6 * k, top)
        self.cyl(f"{suffix}_Head", d, s, y + 1.6 * k, 0.1 * k, 0.22 * k, M["ivory"], 6)

    def podium(self, suffix, d, s, mat, w=2.0, dd=1.0, h=0.3):
        self.box(suffix, d, s, 0.0, w, dd, h, mat)

    def shelf(self, suffix, d, s, back_mat, w=1.6, h=2.0, levels=(0.6, 1.2, 1.8), depth=0.35, shelf_mat=None):
        self.box(f"{suffix}_Back", d, s, 0.0, w, 0.04, h, back_mat)
        for i, y in enumerate(levels):
            self.box(f"{suffix}_Shelf{i}", d - 0.02 - depth / 2, s, y, w, depth, 0.03, shelf_mat or back_mat)
        return [(d - 0.02 - depth / 2, y + 0.03) for y in levels]

    def screen(self, suffix, d, s, y, M, w=1.4, h=0.8):
        self.box(f"{suffix}_Body", d, s, y, w, 0.06, h, M["dark"])
        self.box(f"{suffix}_Face", d - 0.06, s, y + 0.04, w - 0.1, 0.01, h - 0.08, M["panel"])

    def counter(self, suffix, d, s, mat, top, w=2.0, dd=0.6, h=1.0):
        self.box(f"{suffix}_Body", d, s, 0.0, w, dd, h, mat)
        self.box(f"{suffix}_Top", d, s, h, w + 0.1, dd + 0.1, 0.05, top)
        return h + 0.05

    def low_case(self, suffix, d, s, M, w=1.2, dd=0.5):
        self.box(f"{suffix}_Body", d, s, 0.0, w, dd, 0.9, M["dark"])
        self.box(f"{suffix}_Glass", d, s, 0.9, w, dd, 0.3, M["glass"])

    def chair(self, suffix, d, s, mat, yaw=0.0):
        self.turned(f"{suffix}_Seat", d, s, 0.0, 0.45, 0.45, 0.45, mat, yaw=yaw)
        self.turned(f"{suffix}_Back", d + 0.2 * math.cos(yaw), s + 0.2 * math.sin(yaw), 0.45, 0.45, 0.05, 0.45, mat, yaw=yaw)


# ---------------------------------------------------------------- one module per category (≤ 150 tris)
def _clothing_women(m, M, cell):
    m.podium("Podium", 1.3, 0.0, M["ivory"])
    m.mannequin("Man0", 1.3, -0.7, 0.3, M["rose"], M["dark"], M=M)
    m.mannequin("Man1", 1.3, 0.7, 0.3, M["pink"], M["ivory"], M=M)


def _clothing_men(m, M, cell):
    m.podium("Podium", 1.3, 0.0, M["dark"])
    m.mannequin("Man0", 1.3, -0.7, 0.3, M["navy"], M["dark"], M=M)
    m.mannequin("Man1", 1.3, 0.7, 0.3, M["ivory"], M["steel"], M=M)


def _clothing_kids(m, M, cell):
    m.mannequin("Kid0", 1.2, -0.6, 0.0, M["apricot"], M["sky"], k=0.6, M=M)
    m.mannequin("Kid1", 1.2, 0.6, 0.0, M["yellow"], M["coral"], k=0.6, M=M)
    m.box("Cube", 1.5, 1.6, 0.0, 0.5, 0.5, 0.5, M["coral"])


def _clothing_luxury(m, M, cell):
    m.cyl("Podium", 1.4, -0.8, 0.0, 0.8, 0.3, M["ink"], 8)
    m.mannequin("Man", 1.4, -0.8, 0.3, M["ink"], M["ink"], M=M)
    m.box("Plinth", 1.4, 1.2, 0.0, 0.6, 0.4, 0.9, M["ivory"])
    m.box("Bag0", 1.4, 1.03, 0.9, 0.3, 0.12, 0.25, M["gold"])
    m.box("Bag1", 1.4, 1.37, 0.9, 0.3, 0.12, 0.25, M["wine"])


def _clothing_sport(m, M, cell):
    m.mannequin("Man", 1.3, -1.2, 0.0, M["teal"], M["dark"], M=M)
    m.box("WallBack", 3.3, 1.0, 0.0, 1.6, 0.04, 1.6, M["ivory"])
    shoes = (M["teal"], M["yellow"], M["blue"], M["coral"])
    for i, y in enumerate((0.6, 1.1)):
        m.box(f"WallShelf{i}", 3.13, 1.0, y, 1.6, 0.3, 0.03, M["ivory"])
        for k in range(2):
            m.box(f"Shoe{i}{k}", 3.13, 1.0 + (-0.4 if k == 0 else 0.4), y + 0.03, 0.3, 0.12, 0.12, shoes[(i * 2 + k) % 4])


def _shoes(m, M, cell):
    spots = m.shelf("Shelf", 3.3, 0.0, M["brown"])
    boxes = (M["brown"], M["dark"], M["red"], M["ivory"], M["navy"], M["apricot"])
    for i, (d, y) in enumerate(spots):
        for k in range(2):
            m.box(f"ShoeBox{i}{k}", d, -0.45 + 0.9 * k, y, 0.3, 0.18, 0.12, boxes[(i * 2 + k) % 6])
    m.box("Bench", 1.6, 0.0, 0.0, 1.2, 0.4, 0.45, M["wood"])


def _eyewear(m, M, cell):
    m.box("Backlit", 3.4, 0.0, 0.9, 2.0, 0.05, 1.4, M["cool"])
    for i, y in enumerate((1.3, 1.7)):
        for k in range(3):
            m.box(f"Glasses{i}{k}", 3.3, -0.5 + 0.5 * k, y, 0.14, 0.03, 0.05, M["dark"])
    m.disc("Mirror", 3.3, 1.4, 1.5, 0.3, 0.02, M["rail"], 8)
    m.box("Column", 1.4, 0.0, 0.0, 0.3, 0.3, 1.4, M["steel"])


def _jewelry(m, M, cell):
    m.low_case("Case0", 1.4, -1.0, M)
    m.low_case("Case1", 1.4, 1.0, M)
    for k, s in enumerate((-1.3, -0.7, 1.0)):
        m.cyl(f"Bust{k}", 1.4, s, 1.2, 0.08, 0.3, M["ink"], 6)
    for k, s in enumerate((0.7, 1.4)):
        m.box(f"Gem{k}", 1.4, s, 1.2, 0.06, 0.06, 0.06, M["neon"])


def _cosmetics(m, M, cell):
    m.box("Dresser", 2.0, 0.0, 0.0, 1.8, 0.5, 0.9, M["ivory"])
    m.disc("Mirror", 2.3, 0.0, 1.6, 0.4, 0.02, M["rail"], 8)
    flasks = (M["mauve"], M["pink"], M["white"], M["gilt"], M["mauve"])
    for k in range(5):
        m.cyl(f"Flask{k}", 2.0, -0.6 + 0.3 * k, 0.9, 0.04, 0.12, flasks[k], 6)


def _sports(m, M, cell):
    m.box("Rack", 2.8, 0.0, 0.0, 1.2, 0.4, 1.2, M["steel"])
    balls = (M["orange"], M["ivory"], M["yellow"], M["forest"])
    for k in range(4):
        m.cyl(f"Ball{k}", 2.8, -0.45 + 0.3 * k, 1.2, 0.12, 0.24, balls[k], 6)
    m.turned("Board", 3.3, 1.6, 0.0, 0.5, 0.1, 2.4, M["sky"], tilt=math.radians(-10))
    m.podium("Podium", 1.3, 0.0, M["ivory"])


def _toys(m, M, cell):
    cubes = (M["coral"], M["yellow"], M["blue"], M["green"], M["orange"])
    for k, s in enumerate((-1.52, -1.0, -0.48)):
        m.box(f"Cube{k}", 1.4, s, 0.0, 0.5, 0.5, 0.5, cubes[k])
    for k, s in enumerate((-1.26, -0.74)):
        m.box(f"Cube{3 + k}", 1.4, s, 0.5, 0.5, 0.5, 0.5, cubes[3 + k])
    m.cyl("BearBody", 1.6, 1.0, 0.0, 0.3, 0.5, M["tan"], 8)
    m.cyl("BearHead", 1.6, 1.0, 0.5, 0.2, 0.3, M["tan"], 6)
    for k, s in enumerate((0.85, 1.15)):
        m.cyl(f"BearEar{k}", 1.6, s, 0.8, 0.06, 0.06, M["tan"], 4)


def _books(m, M, cell):
    spots = m.shelf("Case", 3.3, 0.0, M["walnut"])
    for i, (d, y) in enumerate(spots):
        m.box(f"Row{i}", d + 0.05, 0.0, y, 1.5, 0.2, 0.25, M["books"], tile=0.15)
    m.box("Seat", 1.5, 0.0, 0.0, 0.8, 0.8, 0.45, M["wine"])
    m.box("SeatBack", 1.8, 0.0, 0.45, 0.8, 0.2, 0.5, M["wine"])
    m.cyl("LampPost", 1.5, 0.9, 0.0, 0.03, 1.5, M["dark"], 4)
    m.cone("LampShade", 1.5, 0.9, 1.3, 0.2, 0.08, 0.25, M["yellow"], 6)


def _music(m, M, cell):
    for k, s in enumerate((-0.7, 0.7)):
        m.box(f"Bin{k}", 1.6, s, 0.0, 1.0, 0.6, 0.4, M["wood"])
        m.box(f"Sleeve{k}", 1.6, s, 0.4, 0.32, 0.02, 0.32, (M["violet"], M["coral"])[k])
    m.cyl("GuitarStand", 3.0, -1.2, 0.0, 0.02, 0.3, M["steel"], 4)
    m.box("GuitarBody", 3.0, -1.2, 0.3, 0.4, 0.1, 0.5, M["red"])
    m.box("GuitarNeck", 3.0, -1.2, 0.8, 0.06, 0.04, 0.7, M["walnut"])
    m.box("Speaker", 3.2, 1.4, 0.0, 0.5, 0.4, 0.9, M["dark"])
    m.disc("SpeakerCone", 2.98, 1.4, 0.55, 0.15, 0.02, M["steel"], 6)


def _electronics(m, M, cell):
    for k, (s, y) in enumerate(((-1.5, 1.2), (0.0, 2.0), (1.5, 1.2))):
        m.screen(f"Screen{k}", 3.45, s, y, M)
    m.box("Base", 1.6, 0.0, 0.0, 2.4, 0.6, 0.5, M["ivory"])
    for k, s in enumerate((-0.6, 0.6)):
        m.box(f"Laptop{k}", 1.6, s, 0.5, 0.3, 0.2, 0.02, M["dark"])
        m.turned(f"LaptopScreen{k}", 1.7, s, 0.52, 0.3, 0.01, 0.2, M["panel"], tilt=math.radians(-20))


def _camera(m, M, cell):
    for k in range(3):
        a = 2 * math.pi * k / 3
        m.turned(f"Leg{k}", 1.5 + 0.5 * math.cos(a), 0.5 * math.sin(a), 0.0, 0.04, 0.04, 1.4, M["dark"],
                 tilt=math.radians(25) * math.cos(a), roll=-math.radians(25) * math.sin(a))
    m.box("CamBody", 1.5, 0.0, 1.27, 0.2, 0.14, 0.12, M["dark"])
    m.disc("Lens", 1.4, 0.0, 1.33, 0.05, 0.1, M["dark"], 8)
    for k, (s, y) in enumerate(((-0.8, 1.4), (0.0, 2.0), (0.8, 1.4))):
        m.box(f"Frame{k}", 3.5, s, y, 0.6, 0.02, 0.45, M["ivory"])
    m.cyl("SpotRod", 1.0, 0.0, 3.2, 0.015, 1.5, M["dark"], 4)
    m.cyl("Spot", 1.0, 0.0, 3.0, 0.08, 0.2, M["dark"], 6)


def _phones(m, M, cell):
    top = m.counter("Counter", 1.6, 0.0, M["ivory"], M["ivory"], dd=0.5, h=0.9)
    for k in range(4):
        s = -0.6 + 0.4 * k
        m.box(f"Stand{k}", 1.6, s, top, 0.1, 0.06, 0.03, M["dark"])
        m.box(f"Phone{k}", 1.6, s, top + 0.03, 0.08, 0.01, 0.16, M["panel"])
    m.box("Logo", 3.5, 0.0, 1.6, 1.0, 0.03, 1.0, M["bluewhite"])


def _gifts(m, M, cell):
    spots = m.shelf("Cabinet", 3.3, 0.0, M["tan"])
    goods = (M["pink"], M["green"], M["gilt"], M["blue"], M["coral"])
    for k, (level, s) in enumerate(((0, -0.55), (1, 0.0), (2, -0.55), (0, 0.55), (2, 0.55))):
        d, y = spots[level]
        m.box(f"Good{k}", d, s, y, 0.3, 0.25, 0.3, goods[k])
    m.box("Gift", 1.4, 0.0, 0.0, 0.5, 0.5, 0.5, M["red"])
    m.box("RibbonA", 1.4, 0.0, 0.02, 0.54, 0.08, 0.54, M["yellow"])
    m.box("RibbonB", 1.4, 0.0, 0.04, 0.08, 0.58, 0.54, M["yellow"])


def _home_decor(m, M, cell):
    m.box("Seat", 2.4, 0.0, 0.0, 1.8, 0.8, 0.45, M["band"])
    m.box("Back", 2.675, 0.0, 0.45, 1.8, 0.25, 0.45, M["band"])
    for k, s in enumerate((-1.0, 1.0)):
        m.box(f"Arm{k}", 2.4, s, 0.0, 0.2, 0.8, 0.6, M["band"])
    m.cyl("LampPost", 2.4, 1.4, 0.0, 0.03, 1.6, M["dark"], 4)
    m.cone("LampShade", 2.4, 1.4, 1.4, 0.25, 0.1, 0.3, M["ivory"], 6)
    m.box("Rug", 1.2, 0.0, 0.0, 2.4, 1.6, 0.02, M["terracotta"])
    m.cyl("PlantPot", 2.4, -1.4, 0.0, 0.2, 0.4, M["crate"], 6)
    m.cyl("PlantLeaf", 2.4, -1.4, 0.4, 0.3, 0.7, M["leaf"], 6)


def _hardware(m, M, cell):
    m.box("Pegboard", 3.5, 0.0, 1.0, 2.0, 0.04, 1.6, M["plywood"])
    for i, y in enumerate((1.3, 1.9)):
        for k in range(3):
            m.box(f"Tool{i}{k}", 3.44, -0.6 + 0.6 * k, y, 0.08, 0.03, 0.3, (M["rust"], M["dark"])[(i + k) % 2])
    for k, (s, mat) in enumerate(((-0.3, M["ivory"]), (0.0, M["red"]), (0.3, M["blue"]))):
        m.cyl(f"Paint{k}", 1.4, s, 0.0, 0.12, 0.18, mat, 6)


def _pharmacy(m, M, cell):
    m.box("CrossV", 0.6, 0.0, 2.4, 0.3, 0.06, 0.9, M["cross"])
    m.box("CrossH", 0.64, 0.0, 2.7, 0.9, 0.06, 0.3, M["cross"])
    m.cyl("CrossRod", 0.6, 0.0, 3.3, 0.015, 1.4, M["dark"], 4)
    m.box("Counter", 1.8, 0.0, 0.0, 2.0, 0.6, 1.0, M["ivory"])
    spots = m.shelf("Rack", 3.3, 0.0, M["ivory"], h=1.8, levels=(0.5, 1.0, 1.5))
    for k in range(4):
        d, y = spots[k % 3]
        m.box(f"Med{k}", d, -0.5 + 0.35 * k, y, 0.2, 0.15, 0.1, (M["ivory"], M["mint"])[k % 2])


def _pet(m, M, cell):
    m.cyl("Basket", 1.4, 0.0, 0.0, 0.45, 0.15, M["brown"], 8)
    m.box("DogBody", 1.4, 0.0, 0.15, 0.5, 0.25, 0.3, M["tan"])
    m.box("DogHead", 1.4, 0.36, 0.3, 0.22, 0.2, 0.2, M["tan"])
    for k, s in enumerate((0.28, 0.44)):
        m.box(f"DogEar{k}", 1.4, s, 0.5, 0.06, 0.02, 0.12, M["tan"])
    m.box("DogTail", 1.4, -0.3, 0.45, 0.04, 0.04, 0.25, M["tan"])
    for k, (s, h) in enumerate(((1.2, 1.2), (1.7, 0.8))):
        m.cyl(f"CatPost{k}", 3.0, s, 0.0, 0.05, h, M["beige"], 4)
        m.box(f"CatDeck{k}", 3.0, s, h, 0.4, 0.4, 0.05, M["beige"])


def _gym(m, M, cell):
    m.box("TreadBase", 1.6, 0.0, 0.0, 0.7, 1.6, 0.2, M["dark"])
    m.box("TreadBelt", 1.6, 0.0, 0.2, 0.5, 1.4, 0.02, M["steel"])
    m.box("TreadMast", 0.85, 0.0, 0.2, 0.1, 0.1, 1.2, M["dark"])
    m.box("TreadConsole", 0.85, 0.0, 1.4, 0.6, 0.1, 0.3, M["gym"])
    m.box("Rack", 3.3, 0.0, 0.0, 1.2, 0.4, 0.8, M["steel"])
    for k in range(4):
        m.box(f"Dumbbell{k}", 3.3, -0.45 + 0.3 * k, 0.8, 0.08, 0.4, 0.08, M["dark"])
    m.cyl("Kettlebell", 1.2, 1.4, 0.0, 0.15, 0.3, M["dark"], 6)


def _arcade(m, M, cell):
    for k, s in enumerate((-0.9, 0.9)):
        m.box(f"Cab{k}", 2.8, s, 0.0, 0.7, 0.8, 1.8, M["dark"])
        m.box(f"CabScreen{k}", 2.37, s, 1.1, 0.5, 0.01, 0.4, M["arcade"])
        m.box(f"CabTop{k}", 2.55, s, 1.8, 0.7, 0.3, 0.2, M["magenta"])
    m.box("ClawBase", 1.4, 1.8, 0.0, 0.8, 0.8, 0.7, M["yellow"])
    m.box("ClawGlass", 1.4, 1.8, 0.7, 0.76, 0.76, 1.0, M["glass"])
    m.box("ClawTop", 1.4, 1.8, 1.7, 0.8, 0.8, 0.2, M["yellow"])
    for k, (s, mat) in enumerate(((1.62, M["pink"]), (1.98, M["sky"]))):
        m.cyl(f"Plush{k}", 1.4, s, 0.7, 0.15, 0.25, mat, 6)


def _cinema(m, M, cell):
    for k, (s, mat) in enumerate(((-1.3, M["yellow"]), (1.3, M["blue"]))):
        m.box(f"PosterStand{k}", 1.0, s, 0.0, 0.4, 0.1, 1.0, M["dark"])
        m.box(f"Poster{k}", 1.0, s, 1.0, 0.9, 0.03, 1.3, mat)
    m.box("Popcorn", 1.6, 0.0, 0.0, 0.7, 0.6, 0.9, M["red"])
    m.box("PopcornGlass", 1.6, 0.0, 0.9, 0.6, 0.5, 0.6, M["glass"])
    m.cyl("PopcornDome", 1.6, 0.0, 1.5, 0.2, 0.15, M["warm"], 6)
    m.cyl("SpotRod", 1.0, 0.0, 3.25, 0.015, 1.45, M["dark"], 4)
    m.cone("Spot", 1.0, 0.0, 3.0, 0.12, 0.04, 0.25, M["yellow"], 6)


def _restaurant(m, M, cell):
    m.box("TableTop", 1.6, 0.0, 0.72, 1.2, 0.6, 0.05, M["walnut"])
    for k, s in enumerate((-0.5, 0.5)):
        m.box(f"TableLeg{k}", 1.6, s, 0.0, 0.05, 0.05, 0.72, M["dark"])
    m.chair("Chair0", 1.6, -0.95, M["walnut"], yaw=-math.pi / 2)
    m.chair("Chair1", 1.6, 0.95, M["walnut"], yaw=math.pi / 2)
    m.cyl("Candle", 1.6, 0.0, 0.77, 0.02, 0.15, M["ivory"], 4)
    m.cyl("MenuPost", 0.8, -1.6, 0.0, 0.02, 0.9, M["dark"], 4)
    m.box("Menu", 0.8, -1.6, 0.9, 0.4, 0.03, 0.6, M["dark"])
    m.cyl("PendantCord", 1.6, 0.0, 2.6, 0.01, 1.4, M["dark"], 3)
    m.cone("Pendant", 1.6, 0.0, 2.4, 0.3, 0.05, 0.25, M["brick"], 6)


def _fast_food(m, M, cell):
    m.box("Menu", 3.5, 0.0, 2.2, 2.4, 0.05, 0.8, M["panel"])
    for k, s in enumerate((-0.4, 0.4)):
        m.cyl(f"BunLow{k}", 1.6, s, 1.05, 0.12, 0.06, M["bun"], 6)
        m.box(f"Patty{k}", 1.6, s, 1.11, 0.24, 0.24, 0.02, M["patty"])
        m.cyl(f"BunTop{k}", 1.6, s, 1.13, 0.13, 0.05, M["bun"], 6)
    m.cyl("Cup", 1.6, 1.0, 1.05, 0.05, 0.15, M["red"], 6)


def _cafe(m, M, cell):
    top = m.counter("Counter", 2.4, 0.0, M["coffee"], M["ivory"], w=2.4)
    m.box("Machine", 2.4, -0.6, top, 0.6, 0.5, 0.45, M["rail"])
    for k, s in enumerate((0.2, 0.5)):
        m.cyl(f"Cup{k}", 2.4, s, top, 0.04, 0.08, M["ivory"], 6)
    m.box("Slate", 3.5, 0.0, 1.4, 0.8, 0.04, 1.0, M["dark"])
    m.cyl("TableFoot", 1.2, 1.6, 0.0, 0.03, 0.72, M["dark"], 4)
    m.cyl("TableTop", 1.2, 1.6, 0.72, 0.3, 0.04, M["wood"], 6)


def _ice_cream(m, M, cell):
    m.box("Case", 1.6, 0.0, 0.0, 2.4, 0.7, 0.9, M["ivory"])
    m.box("CaseGlass", 1.6, 0.0, 0.9, 2.4, 0.7, 0.3, M["glass"])
    tubs = (M["pink"], M["warm"], M["grape"], M["green"])
    for k in range(4):
        m.cyl(f"Tub{k}", 1.6, -0.75 + 0.5 * k, 0.9, 0.14, 0.12, tubs[k], 6)
    m.cone("BigCone", 3.0, 1.8, 0.0, 0.0, 0.25, 0.7, M["biscuit"], 6)
    m.cyl("BigScoop", 3.0, 1.8, 0.7, 0.28, 0.3, M["pink"], 6)


def _bakery(m, M, cell):
    m.box("Case", 1.6, 0.0, 0.0, 2.4, 0.7, 0.9, M["ivory"])
    m.box("CaseGlass", 1.6, 0.0, 0.9, 2.4, 0.7, 0.3, M["glass"])
    spots = m.shelf("Shelf", 3.3, 0.0, M["wood"])
    d, y = spots[1]
    m.box("Loaves", d, 0.0, y, 1.4, 0.25, 0.12, M["crate"])
    m.cyl("StandFoot", 1.6, 1.6, 0.0, 0.05, 0.25, M["ivory"], 6)
    m.cyl("StandPlate", 1.6, 1.6, 0.25, 0.25, 0.04, M["ivory"], 6)
    m.cyl("Cake", 1.6, 1.6, 0.29, 0.2, 0.12, M["pink"], 6)


def _play(m, M, cell):
    m.box("Mat", 1.8, 0.0, 0.0, 3.0, 2.0, 0.05, M["soft"], tile=1.0)
    m.box("Tower", 2.4, -0.6, 0.05, 0.8, 0.8, 0.8, M["blue"])
    m.turned("Ramp", 1.31, -0.6, 0.45, 0.6, 1.6, 0.1, M["yellow"], tilt=math.radians(30))
    for k, (s, mat) in enumerate(((0.6, M["coral"]), (1.1, M["green"]))):
        m.cyl(f"Ball{k}", 1.4, s, 0.05, 0.15, 0.3, mat, 6)


def _services(m, M, cell):
    m.counter("Desk", 2.4, 0.0, M["steel"], M["ivory"], w=2.4, dd=0.7)
    m.box("Totem", 1.0, -1.8, 0.0, 0.4, 0.06, 1.2, M["band"])
    m.disc("TotemDisc", 0.95, -1.8, 1.0, 0.18, 0.03, M["ivory"], 8)
    m.chair("Chair0", 1.4, 1.0, M["dark"], yaw=math.pi)
    m.chair("Chair1", 1.4, 1.6, M["dark"], yaw=math.pi)
    m.disc("Clock", 3.5, 0.0, 2.4, 0.25, 0.03, M["clock"], 8)


MODULES = {
    "clothing_women": _clothing_women, "clothing_men": _clothing_men, "clothing_kids": _clothing_kids, "clothing_luxury": _clothing_luxury,
    "clothing_sport": _clothing_sport, "shoes": _shoes, "eyewear": _eyewear, "jewelry": _jewelry, "cosmetics": _cosmetics, "sports": _sports, "toys": _toys,
    "books": _books, "music": _music, "electronics": _electronics, "camera": _camera, "phones": _phones, "gifts": _gifts, "home_decor": _home_decor,
    "hardware": _hardware, "pharmacy": _pharmacy, "pet": _pet, "gym": _gym, "arcade": _arcade, "cinema": _cinema, "restaurant": _restaurant,
    "fast_food": _fast_food, "cafe": _cafe, "ice_cream": _ice_cream, "bakery": _bakery, "play": _play, "services": _services,
}


def _cell_wide(m, M, cell, frame):
    w = 2 * frame.glass_half
    if cell["category"] == "cinema":
        m.box("Curtain", 3.4, 0.0, 0.0, w, 0.1, 2.8, M["wine"], tile=0.6)
    elif cell["category"] == "fast_food":
        m.counter("Counter", 1.6, 0.0, M["mustard"], M["ivory"], w=w - 1.0, dd=0.7)


def dress_planned(ctx, cell, frame):
    """Habille la vitrine d'une cellule planifiée selon sa catégorie : n = max(1, ⌊W/8⌋) modules centrés sur s = 0."""
    M = _mats(ctx)
    fn = MODULES.get(cell["category"], _gifts)
    _cell_wide(_Frame(ctx, frame, f"Dress_{cell['id']}"), M, cell, frame)
    n = max(1, int(frame.width // MODULE_W))
    for k in range(n):
        s0 = (k - (n - 1) / 2) * MODULE_W
        fn(_Frame(ctx, frame, f"Dress_{cell['id']}_{k}", s0=s0), M, cell)
    return n


# ---------------------------------------------------------------- construction cells (spec D)
def _tape_run(m, M, a, b, idx):
    (d0, s0), (d1, s1) = a, b
    if abs(d0 - d1) < 1e-9:
        m.box(f"Tape{idx}", -d0, (s0 + s1) / 2, 0.85, abs(s1 - s0), 0.02, 0.06, M["caution"], tile=0.3)
    else:
        m.box(f"Tape{idx}", -(d0 + d1) / 2, s0, 0.85, 0.02, abs(d1 - d0), 0.06, M["caution"], tile=0.3)


def _a_frame(m, M, suffix, d_out, s):
    m.turned(f"{suffix}_A", -d_out - 0.2, s, 0.0, 0.6, 0.04, 0.8, M["yellow"], tilt=math.radians(-15))
    m.turned(f"{suffix}_B", -d_out + 0.2, s, 0.0, 0.6, 0.04, 0.8, M["yellow"], tilt=math.radians(15))
    m.turned(f"{suffix}_Band", -d_out - 0.18, s, 0.1, 0.6, 0.05, 0.15, M["caution"], tilt=math.radians(-15))


def dress_construction(ctx, cell, frame):
    """Habille une cellule en travaux : bande de chantier de 2,6 m devant la palissade (rubalise, palettes, matériel)."""
    M = _mats(ctx)
    m = _Frame(ctx, frame, f"Site_{cell['id']}", lift=0.0)
    W = frame.width
    hw = W / 2 - 0.8
    tarp_on_pallet = "_out" in cell["row"]
    m.col("Band", -1.3, 0.0, W - 1.6, 2.6, 1.2)
    n = int(math.ceil(2 * hw / 3.0))
    posts = [(2.6, -hw + 2 * hw * k / n) for k in range(n + 1)]
    posts.insert(-1, (2.6, hw - 1.2))
    posts += [(1.3, -hw), (0.1, -hw), (1.3, hw), (0.1, hw)]
    for k, (d, s) in enumerate(posts):
        m.cyl(f"Post{k}", -d, s, 0.0, 0.03, 1.0, M["yellow"], 4)
    front = posts[:n + 2]
    for k in range(len(front) - 1):
        if front[k + 1][1] - front[k][1] < 1.25 and front[k + 1][1] >= hw - 1e-6:
            continue
        _tape_run(m, M, front[k], front[k + 1], k)
    for k, s in enumerate((-hw, hw)):
        _tape_run(m, M, (2.6, s), (1.3, s), 20 + 2 * k)
        _tape_run(m, M, (1.3, s), (0.1, s), 21 + 2 * k)
    s_pal = W / 2 - 2.0
    m.box("Sheet", -1.3, -s_pal, 0.0, 3.0, 2.4, 0.02, M["slab"])
    m.box("Pallet0", -1.9, -s_pal, 0.02, 1.2, 1.0, 0.14, M["pallet"])
    for k, dd in enumerate((-0.19, 0.19)):
        m.box(f"Bag0{k}", -1.9 + dd, -s_pal, 0.16, 0.5, 0.35, 0.14, M["cement"], tile=0.3)
    for k, ds in enumerate((-0.19, 0.19)):
        m.box(f"Bag1{k}", -1.9, -s_pal + ds, 0.30, 0.35, 0.5, 0.14, M["cement"], tile=0.3)
    if W >= 13.0:
        m.box("Pallet1", -1.9, s_pal, 0.0, 1.2, 1.0, 0.14, M["pallet"])
        if tarp_on_pallet:
            m.box("Tarp", -1.9, s_pal, 0.14, 1.6, 1.2, 0.7, M["blue"], bevel=0.12)
        else:
            m.box("Boards", -1.9, s_pal, 0.14, 1.2, 0.9, 0.5, M["slab"])
    if not tarp_on_pallet:
        m.box("WallTarp", -0.2, 0.0, 0.3, W - 3.0, 0.03, 1.25, M["blue"])
        for k in range(4):
            m.disc(f"Eyelet{k}", 0.225, -(W - 3.0) / 2 + 0.3 + k * (W - 3.6) / 3, 1.45, 0.03, 0.02, M["steel"], 6)
    if tarp_on_pallet:
        s_mix = W / 2 - 4.4
        m.box("MixerBody", -1.85, s_mix, 0.0, 1.6, 1.0, 1.1, M["yellow"], bevel=0.04)
        drum = m.cyl("MixerDrum", -1.85, s_mix, 1.1, 0.5, 0.9, M["metal"], 10)
        drum.rotation_euler = (math.radians(30), 0.0, frame.yaw)
        for k, ds in enumerate((-0.85, 0.85)):
            m.lying(f"MixerWheel{k}", -2.2, s_mix + ds, 0.25, 0.25, 0.08, M["dark"], 8)
    s_barrow = -(W / 2 - 3.6)
    yaw_b = math.radians(20)
    m.turned("BarrowTray", -1.7, s_barrow, 0.35, 0.7, 0.5, 0.3, M["band"], yaw=yaw_b, bevel=0.03)
    for k, ds in enumerate((-0.3, 0.3)):
        m.turned(f"BarrowHandle{k}", -1.7 - ds * math.sin(yaw_b), s_barrow + ds * math.cos(yaw_b), 0.3, 0.04, 1.1, 0.04, M["steel"], yaw=yaw_b)
        m.turned(f"BarrowLeg{k}", -1.7 - 0.4 * math.cos(yaw_b) - ds * math.sin(yaw_b), s_barrow + ds * math.cos(yaw_b) - 0.4 * math.sin(yaw_b), 0.0, 0.04, 0.04, 0.3, M["steel"], yaw=yaw_b)
    wheel = m.cyl("BarrowWheel", -1.7 + 0.45 * math.cos(yaw_b), s_barrow + 0.45 * math.sin(yaw_b), 0.18, 0.18, 0.06, M["dark"], 8)
    wheel.rotation_euler = (0.0, math.pi / 2, frame.yaw + yaw_b)
    buckets = ((0.0, 0.0, M["dark"]), (0.35, 0.1, M["yellow"]), (0.15, 0.4, M["ivory"]))
    for k, (ds, dd, mat) in enumerate(buckets):
        b = m.cone(f"Bucket{k}", -1.9 - dd, -1.5 + ds, 0.0 if k < 2 else 0.15, 0.12, 0.15, 0.3, mat, 8)
        if k == 2:
            b.rotation_euler = (math.pi / 2, 0.0, frame.yaw)
    _a_frame(m, M, "Sign0", 2.3, hw - 0.6)
    _a_frame(m, M, "Sign1", 2.2, 0.0)
    m.box("HardHat", -0.2, W / 4, 1.9, 0.8, 0.04, 0.6, M["soon"])
    m.disc("HardHatDome", -0.25, W / 4, 2.26, 0.12, 0.01, M["yellow"], 8)
    m.box("HardHatBrim", -0.245, W / 4, 2.12, 0.34, 0.03, 0.05, M["yellow"])
    for k in range(3):
        a = 2 * math.pi * k / 3
        m.turned(f"TripodLeg{k}", -2.0 + 0.55 * math.cos(a), 0.55 * math.sin(a), 0.0, 0.04, 0.04, 1.4, M["steel"],
                 tilt=math.radians(25) * math.cos(a), roll=-math.radians(25) * math.sin(a))
    m.turned("WorkLamp", -1.95, 0.0, 1.27, 0.4, 0.15, 0.3, M["lamp"], tilt=math.radians(-25))
    for k, s in enumerate((-2.5, 2.5)):
        m.cyl(f"GarlandPole{k}", -2.2, s, 0.0, 0.03, 2.1, M["yellow"], 4)
    m.box("GarlandCable", -2.2, 0.0, 1.95, 5.0, 0.02, 0.02, M["dark"])
    for k in range(4):
        m.box(f"GarlandBulb{k}", -2.2, -1.5 + k, 1.8, 0.1, 0.1, 0.15, M["lamp"])
    m.lying("Reel", -1.8, W / 2 - 5.5, 0.3, 0.3, 0.4, M["reel"], 8)
    for k, (d, s) in enumerate(((2.4, -(W / 2 - 1.0)), (2.4, W / 2 - 1.0), (2.9, hw - 0.6))):
        m.cone(f"Cone{k}", -d, s, 0.0, 0.22, 0.04, 0.6, M["cone"], 6)
    for k, s in enumerate((-(W / 2 - 1.2), W / 2 - 1.2)):
        m.turned(f"Stripe{k}", -0.2, s, 0.5, 1.2, 0.02, 0.12, M["caution"], roll=math.radians(45 if k == 0 else -45))
