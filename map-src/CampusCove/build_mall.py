"""Cove Parkview Mall: the big shopping centre west of the Cove Clinic (docs/MALL.md). A ring of plazas around an
outdoor Leisure Park, two levels in three plazas, a food court, back-of-house corridors, a warehouse with a roof
terrace, the forecourt, the avenue from the town hedge, the parking lot and the bus shelter. Every shop cell is a
shopfront described in mall.layout.json (category, name, status); the anchors and the cell stores are separate
`store` buildings whose facade sits flush with the cell fronts.

Structure only: this script builds floors, partitions, shopfronts, slabs, escalators, roofs and the back of house
on a mall_lib.Ctx whose lib_kit registry refuses coplanar overlaps and contained boxes (docs/BUILD_KIT.md). The
decor of the walkways, plazas and park is mall_decor.build(); the window dressing of the planned cells and the
construction sites are mall_dressing. Every shared plane is built once (a partition per boundary, a back wall per
row, the park walls and the envelope once), interior pieces stop at the inner face of the envelope and every wall
that borders a public volume rises to its ceiling or roof.

Reads out/store/{northline,hearth_hollow,greencart}/exterior.layout.json (run their build scripts first) for the anchor
footprints. Outputs out/store/mall/{mall.glb, mall.colsrc.glb, mall.layout.json}; `levels` / `stairs` are in world
coordinates (read by the front and by extract-collision.mjs). Then `npm run assets:optimize -- store` and
`node scripts/apply-mall.mjs`.
"""
import importlib
import json
import math
import os
import random
import sys
import types

if "__file__" not in globals():
    raise RuntimeError('Run with exec(open(p).read(), {"__file__": p}) so the script can find lib_common.py')
HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import lib_common as L
import lib_kit as K
import mall_lib as ML
import mall_decor
import mall_dressing
for module in (L, K, ML, mall_decor, mall_dressing):
    importlib.reload(module)
import bpy

OUT = os.path.join(L.OUT_ROOT, "store", "mall")
X0, X1, Z0, Z1 = -380.0, -160.0, -90.0, 90.0
SVC, OUTER, WALK, INNER = 2.5, 9.5, 16.0, 12.0
RING = SVC + OUTER + WALK + INNER
PARK = (X0 + RING, X1 - RING, Z0 + RING, Z1 - RING)
CELL_H = 4.8
CEIL_LO, CEIL_HI = 4.6, 4.7
L1_Y = 6.0
SLAB_T = 0.4
ROOF1 = 7.6
ROOF2 = 11.6
BAL = 5.0
WALL_T = 0.3
PART_T = 0.3
GAP = 0.02
RAMP_RUN = 10.4
RAMP_W = 1.4
LANDING = 2.0
EXIT_W = 10.0
ENTRANCE_HW = 8.0
NOTCH = 10.0
TWO_PI = 2 * math.pi
rnd = random.Random(7)

ANCHORS = [
    {"key": "northline", "name": "Northline", "category": "clothing_department", "plaza": "al_fresca", "x": -236.0, "front_z": Z1 - SVC - OUTER, "rotationY": math.pi},
    {"key": "hearth_hollow", "name": "Hearth & Hollow", "category": "home_decor", "plaza": "paradise", "x": -250.0, "front_z": Z0 + SVC + OUTER, "rotationY": 0.0},
    {"key": "greencart", "name": "GreenCart", "category": "grocery", "plaza": "north_plaza", "x": -340.0, "front_z": Z0 + SVC + OUTER, "rotationY": 0.0},
]
for a in ANCHORS:
    path = os.path.join(L.OUT_ROOT, "store", a["key"], "exterior.layout.json")
    if not os.path.exists(path):
        raise RuntimeError(f"{path} is missing: run build_{a['key'].split('_')[0]}.py first")
    a["ext"] = json.load(open(path, encoding="utf-8"))
    a["w"] = a["ext"]["footprint"][0]
    hd = a["ext"]["doorLocal"][2]
    a["z"] = a["front_z"] - hd if a["rotationY"] == 0.0 else a["front_z"] + hd
    a["x0"], a["x1"] = a["x"] - a["w"] / 2, a["x"] + a["w"] / 2

CATS = {
    "clothing_women": ("WOMEN'S FASHION", "#e8738f"), "clothing_men": ("MEN'S FASHION", "#3f6fb5"), "clothing_kids": ("KIDS' CLOTHING", "#f2a65a"),
    "clothing_luxury": ("LUXURY BOUTIQUE", "#b08a3e"), "clothing_sport": ("SPORTSWEAR", "#2fa17a"), "shoes": ("SHOES", "#8a5a3c"),
    "eyewear": ("EYEWEAR", "#5b6b7d"), "jewelry": ("JEWELRY", "#c9a227"), "cosmetics": ("COSMETICS", "#d989c7"), "sports": ("SPORTING GOODS", "#1f8f5f"),
    "toys": ("TOY STORE", "#e54b4b"), "books": ("BOOKSTORE", "#6d4c2f"), "music": ("MUSIC & RECORDS", "#5b3fb5"), "electronics": ("ELECTRONICS", "#2b7bbf"),
    "camera": ("CAMERA SHOP", "#3a3f47"), "phones": ("PHONES & GADGETS", "#38a3c9"), "gifts": ("GIFTS & ANTIQUES", "#9b7653"), "home_decor": ("HOME & DECOR", "#c47c4c"),
    "hardware": ("HARDWARE", "#e07a2e"), "pharmacy": ("PHARMACY", "#3aa89a"), "pet": ("PET SHOP", "#7fb24a"), "gym": ("GYM", "#d94f4f"),
    "arcade": ("ARCADE", "#b73cc9"), "cinema": ("CINEMA", "#8b1e3f"), "restaurant": ("RESTAURANT", "#b8472f"), "fast_food": ("FAST FOOD", "#f0b429"),
    "cafe": ("COFFEE SHOP", "#6b4a2b"), "ice_cream": ("ICE CREAM", "#f7a1c4"), "bakery": ("BAKERY", "#d8a860"), "play": ("KIDS PLAY AREA", "#f2c230"),
    "services": ("MALL SERVICES", "#5d6670"), "sweets": ("SWEETS & CANDY", "#f7a1c4"), "grocery": ("SUPERMARKET", "#3c9a3c"), "clothing_department": ("DEPARTMENT STORE", "#1b1d22"),
}
P_ = "planned"
C_ = "construction"
S_ = "passage"
O_ = "open"
CELL_STORES = {"Crispin's Hardware": "crispins_hardware", "Candy Cloud": "candy_cloud", "Summit Sports": "summit_sports"}
ROWS = {
    "N_out_a": ("north_plaza", [("Crispin's Hardware", "hardware", O_)]),
    "N_out_b": ("north_plaza", [("Staff", "services", S_), ("Unit N12", "pet", C_), ("Quick Cuts", "services", P_), ("Fresh Press Juice", "cafe", P_), ("Paper Trail", "gifts", P_)]),
    "N_out_c": ("paradise", [("Starlight Cinema", "cinema", P_), ("Page Turner Books", "books", P_), ("Vinyl Vault", "music", P_)]),
    "N_out_d": ("paradise", [("Kokoro Toys", "toys", P_), ("Volt Electronics", "electronics", P_), ("Shutter Speed Cameras", "camera", P_)]),
    "N_in_a": ("north_plaza", [("Cove Pharmacy", "pharmacy", P_), ("Unit N21", "services", C_)]),
    "N_in_b": ("paradise", [("Tiny Tots", "clothing_kids", P_), ("Blush Bar", "cosmetics", P_), ("Gilt & Glow", "jewelry", P_), ("Pocket Gadgets", "phones", P_)]),
    "N_in_c": ("paradise", [("Velvet Lane", "clothing_women", P_), ("Brickroad Men's", "clothing_men", P_), ("Sole Society", "shoes", P_), ("Curio Cabinet", "gifts", P_)]),
    "S_out_a": ("food_court", [("Burger Barony", "fast_food", P_), ("Mamma Lucia's", "restaurant", P_), ("Taco Tempo", "fast_food", P_), ("Wok This Way", "fast_food", P_), ("Dough Re Mi Pizza", "fast_food", P_), ("Staff", "services", S_)]),
    "S_out_b": ("al_fresca", [("Summit Sports", "clothing_sport", O_, 2.0), ("Spectacle Eyewear", "eyewear", P_)]),
    "S_out_c": ("al_fresca", [("Mae & Fern", "clothing_women", P_), ("Gentleman's Quarter", "clothing_men", P_), ("Paws & Claws", "pet", P_), ("Staff", "services", S_)]),
    "S_in_a": ("food_court", [("Bean There", "cafe", P_), ("Scoop Dreams", "ice_cream", P_), ("Golden Crust", "bakery", P_)]),
    "S_in_b": ("al_fresca", [("Casa Verde", "home_decor", P_), ("Rivermouth Jewels", "jewelry", P_), ("Stride Runners", "clothing_sport", P_), ("Lens & Light", "camera", P_)]),
    "S_in_c": ("al_fresca", [("Harbor Lane Kids", "clothing_kids", P_), ("Saffron Table", "restaurant", P_), ("Chapter Two Books", "books", P_), ("Pearl Street", "clothing_luxury", P_)]),
    "W_out_a": ("wonderland", [("Pixel Palace Arcade", "arcade", P_), ("Staff", "services", S_), ("Kiddo Corner", "clothing_kids", P_), ("Rocket Toys", "toys", P_), ("Homerunner Sports", "sports", P_)]),
    "W_out_b": ("wonderland", [("Candy Cloud", "sweets", O_), ("Little Lens", "eyewear", P_), ("Playbox Games", "electronics", P_), ("Staff", "services", S_)]),
    "W_in_a": ("wonderland", [("Wonder Jewels", "jewelry", P_), ("Casual Corner", "clothing_women", P_), ("Fanfare Fashion", "clothing_women", P_), ("Shoes of a Lifetime", "shoes", P_)]),
    "W_in_b": ("wonderland", [("Modern Gent", "clothing_men", P_), ("Run Like Wind", "clothing_sport", P_), ("Petal & Pot", "gifts", P_), ("Sir Read-a-lot", "books", P_)]),
    "E_out_a": ("entrance", [("Refined Class", "clothing_women", P_), ("The Distinguished Man", "clothing_men", P_), ("Fashion Fiesta", "clothing_women", P_), ("Space Kids", "clothing_kids", P_)]),
    "E_out_b": ("entrance", [("Rafael's Shoes", "shoes", P_), ("Everyone Luvs Books", "books", P_), ("Special Gifts", "jewelry", P_), ("Outta Sight Optics", "eyewear", P_)]),
    "E_in_a": ("entrance", [("Emerald Row", "jewelry", P_), ("Jamming Juvenile", "clothing_kids", P_), ("Robsaka Digital", "electronics", P_), ("Mall Services", "services", P_)]),
    "E_in_b": ("entrance", [("Wallington's", "clothing_men", P_), ("Ladies' Space", "clothing_women", P_), ("The Shoehorn", "shoes", P_), ("Kathy's Boutique", "clothing_luxury", P_)]),
    "E1_out": ("entrance", [("Lady About Town", "clothing_women", P_), ("Marriage Makers", "jewelry", P_), ("Roastmaster Cafe", "cafe", P_), ("Tucci's of Rome", "clothing_men", P_), ("Modern Businessman", "clothing_men", P_), ("Kicks For Her", "shoes", P_), ("Estelle's Cosmetics", "cosmetics", P_), ("The Sinister Read", "books", P_)]),
    "E1_in": ("entrance", [("Women's Lib", "clothing_women", P_), ("Springtree Jewels", "jewelry", P_), ("Shooting Star Sports", "sports", P_), ("In the Closet", "clothing_men", P_), ("Ned's Knicknackery", "gifts", P_), ("Gromin's", "clothing_women", P_), ("Men's Storehouse", "clothing_men", P_), ("Security Office", "services", P_)]),
    "P1_out": ("paradise", [("Colby's Movieland Lounge", "cinema", P_), ("Bachman's Bookporium", "books", P_), ("TuneMakers", "music", P_), ("Cam's Cameras", "camera", P_), ("Josh's Jewels", "jewelry", P_), ("Universe of Optics", "eyewear", P_), ("Cantonbury's", "clothing_men", P_), ("Sportrance", "sports", P_)]),
    "P1_in": ("paradise", [("Contemporary Reading", "books", P_), ("Shoekin's", "shoes", P_), ("Kid's Choice", "clothing_kids", P_), ("Child's Play", "toys", P_), ("Players Music", "music", P_), ("Jill's Sandwiches", "fast_food", P_), ("Entertainment Isle", "music", P_), ("Tyke n' Tots", "clothing_kids", P_)]),
    "W1_out": ("wonderland", [("Small Fry Duds", "clothing_kids", P_), ("Scuffs and Scrapes", "clothing_kids", P_), ("Beautification", "cosmetics", P_), ("Fine Cut Jewels", "jewelry", P_), ("The Lens Zen", "eyewear", P_), ("Philo's Photos", "camera", P_), ("Lovely Fashion House", "clothing_women", P_), ("Kokonutz Sports", "sports", P_)]),
    "W1_in": ("wonderland", [("Contemporary Purses", "clothing_luxury", P_), ("Casual Gals", "clothing_women", P_), ("Homerunner's", "sports", P_), ("Sir Book-a-lot", "books", P_), ("Flexin' Fitness", "gym", P_), ("Weber's Garments", "clothing_men", P_), ("Brand New U", "clothing_women", P_), ("Eyes Like Us", "eyewear", P_)]),
}
PLAZAS = {
    "entrance": {"name": "Entrance Plaza", "bounds": (-200, -160, -50, 50), "floors": 2, "roof": "truss", "outdoor": False},
    "paradise": {"name": "Paradise Plaza", "bounds": (-300, -160, -90, -50), "floors": 2, "roof": "truss", "outdoor": False},
    "north_plaza": {"name": "North Plaza", "bounds": (-380, -300, -90, -50), "floors": 1, "roof": "slab", "outdoor": False},
    "wonderland": {"name": "Wonderland Plaza", "bounds": (-380, -340, -50, 50), "floors": 2, "roof": "truss", "outdoor": False},
    "food_court": {"name": "Food Court", "bounds": (-380, -300, 50, 90), "floors": 1, "roof": "slab", "outdoor": False},
    "al_fresca": {"name": "Al Fresca Plaza", "bounds": (-300, -160, 50, 90), "floors": 1, "roof": "none", "outdoor": True},
    "leisure_park": {"name": "Leisure Park", "bounds": PARK, "floors": 0, "roof": "none", "outdoor": True},
}
LINKS = [
    {"from": "entrance", "to": "paradise", "via": "court_ne"}, {"from": "entrance", "to": "al_fresca", "via": "court_se"},
    {"from": "paradise", "to": "north_plaza", "via": "walkway"}, {"from": "north_plaza", "to": "wonderland", "via": "court_nw"},
    {"from": "wonderland", "to": "food_court", "via": "court_sw"}, {"from": "food_court", "to": "al_fresca", "via": "walkway"},
    {"from": "leisure_park", "to": "paradise", "via": "park_exit_n"}, {"from": "leisure_park", "to": "al_fresca", "via": "park_exit_s"},
    {"from": "leisure_park", "to": "wonderland", "via": "park_exit_w"}, {"from": "leisure_park", "to": "entrance", "via": "park_exit_e"},
    {"from": "entrance", "to": "forecourt", "via": "main_entrance"},
]

# ---------------------------------------------------------------- scene, materials, context
sc = L.new_build_scene("STORE_mall")
coll = bpy.data.collections.new("Mall")
sc.collection.children.link(coll)
cols = L.Collisions(coll)
P = {
    "floor": L.make_mat("TW_MallFloor", "#e9e4d8", 0.6, "tiles", 0.03, accent="#d6d0c3"),
    "floor2": L.make_mat("TW_MallFloorUpper", "#dfdbd2", 0.6, "tiles", 0.03, accent="#cbc6bb"),
    "paving": L.make_mat("TW_MallPaving", "#c9c2b4", 0.9, "tiles", 0.03, accent="#b0a99b"),
    "street": L.make_mat("TW_MallStreet", "#d8c7a8", 0.85, "tiles", 0.04, accent="#c2ad8a"),
    "service": L.make_mat("TW_MallService", "#9a9a98", 0.95, "noise", 0.03),
    "wall": L.make_mat("TW_MallWall", "#f4f2ee", 0.9, "noise", 0.02),
    "wall_out": L.make_mat("TW_MallOuter", "#cfc6b6", 0.95, "noise", 0.03),
    "band": L.make_mat("TW_MallBand", "#2f6f63", 0.7, "noise", 0.02),
    "slab": L.make_mat("TW_MallSlab", "#e6e3dc", 0.9, "noise", 0.02),
    "steel": L.make_mat("TW_MallSteel", "#5d6670", 0.55, "noise", 0.03),
    "dark": L.make_mat("TW_MallDark", "#2a2e35", 0.5, "noise", 0.02),
    "glass": L.make_mat("TW_MallGlass", "#9fd6ea", 0.1, "noise", 0.02, alpha=0.4),
    "void": L.make_mat("TW_MallVoid", "#17191d", 0.9, "noise", 0.01),
    "rail": L.make_mat("TW_MallRail", "#b9bec6", 0.3, "noise", 0.02),
    "roof": L.make_mat("TW_MallRoof", "#6f7076", 0.95, "noise", 0.05),
    "grass": L.make_mat("TW_MallGrass", "#7dbb62", 1.0, "noise", 0.06),
    "grass2": L.make_mat("TW_MallGrassLight", "#93c96d", 1.0, "noise", 0.06),
    "path": L.make_mat("TW_MallPath", "#cdb994", 0.95, "noise", 0.06),
    "water": L.make_mat("TW_PondWater", "#4fa9c8", 0.12, "noise", 0.02, alpha=0.8),
    "stone": L.make_mat("TW_MallStone", "#9a948a", 0.9, "tiles", 0.06, accent="#726d65"),
    "brick": L.make_mat("TW_MallBrick", "#a9644d", 0.95, "tiles", 0.06, accent="#c9b7a4"),
    "trunk": L.make_mat("TW_MallTrunk", "#7a5638", 0.8, "planks", 0.04, accent="#5e4129"),
    "leaf": L.make_mat("TW_MallLeaf", "#4f9d54", 0.9, "noise", 0.06),
    "leaf2": L.make_mat("TW_MallLeafLight", "#78b55a", 0.9, "noise", 0.06),
    "pine": L.make_mat("TW_MallPine", "#2f6f47", 0.9, "noise", 0.05),
    "blossom": L.make_mat("TW_MallBlossom", "#f2a7c3", 0.85, "noise", 0.05),
    "wood": L.make_mat("TW_MallWood", "#a97a4a", 0.7, "planks", 0.05, accent="#7c5631"),
    "lamp": L.make_mat("TW_MallLamp", "#fff1c4", 0.5, "noise", 0.0, emit="#ffd27a", emit_strength=1.4),
    "panel": L.make_mat("TW_MallLightPanel", "#fffbe8", 0.5, "noise", 0.0, emit="#fff4d0", emit_strength=1.0),
    "sign": L.make_mat("TW_MallSign", "#ffffff", 0.4, "noise", 0.0, emit="#ffffff", emit_strength=1.0),
    "neon": L.make_mat("TW_MallNeon", "#ffffff", 0.3, "noise", 0.0, emit="#ffe2a0", emit_strength=2.0),
    "soon": L.make_mat("TW_MallSoonBoard", "#f6f3ec", 0.6, "noise", 0.02),
    "plywood": L.make_mat("TW_MallPlywood", "#d6b27a", 0.9, "planks", 0.05, accent="#bf9a62"),
    "caution": L.make_mat("TW_MallCaution", "#f6d04d", 0.7, "stripes", 0.02, accent="#1d1f24"),
    "cone": L.make_mat("TW_MallCone", "#f28c28", 0.6, "stripes", 0.02, accent="#f7f4ec"),
    "pallet": L.make_mat("TW_MallPallet", "#c9a36a", 0.9, "planks", 0.05, accent="#a98550"),
    "carton": L.make_mat("TW_MallCarton", "#b98c5a", 0.9, "stripes", 0.04, accent="#a47a4c"),
    "metal": L.make_mat("TW_MallMetal", "#9aa0a8", 0.5, "noise", 0.03),
    "shutter": L.make_mat("TW_MallShutter", "#aeb4bb", 0.5, "stripes", 0.03, accent="#8f959c"),
    "soft": L.make_mat("TW_MallSoftFloor", "#f2c230", 0.9, "checker", 0.03, accent="#e54b4b"),
    "red": L.make_mat("TW_MallRed", "#d9473a", 0.6, "noise", 0.02),
    "blue": L.make_mat("TW_MallBlue", "#1f5fae", 0.6, "noise", 0.02),
    "yellow": L.make_mat("TW_MallYellow", "#f6d04d", 0.6, "noise", 0.02),
    "pink": L.make_mat("TW_MallPink", "#f4b3c8", 0.7, "noise", 0.03),
    "awning": L.make_mat("TW_MallAwning", "#c0392b", 0.8, "stripes", 0.03, accent="#f4efe6"),
    "helipad": L.make_mat("TW_MallHelipad", "#4b4f57", 0.9, "noise", 0.03),
    "hmark": L.make_mat("TW_MallHelipadMark", "#f6d04d", 0.7, "noise", 0.02),
    "clock": L.make_mat("TW_MallClockFace", "#fbf7ec", 0.5, "noise", 0.01, emit="#fff6dc", emit_strength=0.5),
    "flower": L.make_mat("TW_MallFlowers", "#f07fa8", 0.7, "noise", 0.06),
    "flower2": L.make_mat("TW_MallFlowersYellow", "#f6d04d", 0.7, "noise", 0.06),
}
CAT_MATS = {k: L.make_mat(f"TW_MallCat_{k}", c, 0.8, "noise", 0.02) for k, (_, c) in CATS.items()}

ctx = ML.Ctx(coll, cols, P, CAT_MATS, rnd)
objs = ctx.objs
add, rect, box, text, wedge = ctx.add, ctx.rect, ctx.box, ctx.text, ctx.wedge
pillar, railing = ctx.pillar, ctx.railing


def slab(name, axis, fixed, a0, a1, thick, y0, y1, mat, col=True, tile=2.0):
    """A wall piece centred on `fixed` along game x (axis 'x', at z=fixed) or z (axis 'z', at x=fixed)."""
    if axis == "x":
        return rect(name, a0, fixed - thick / 2, a1, fixed + thick / 2, y0, y1 - y0, mat, col=col, tile=tile)
    return rect(name, fixed - thick / 2, a0, fixed + thick / 2, a1, y0, y1 - y0, mat, col=col, tile=tile)


def walls_along(name, axis, fixed, a0, a1, y0, h, mat, thick=WALL_T, step=50.0, col=True):
    """A long wall split into <= `step` m pieces so the collision extractor keeps every piece."""
    n = max(1, int(math.ceil((a1 - a0) / step)))
    for i in range(n):
        p0 = a0 + (a1 - a0) * i / n
        p1 = a0 + (a1 - a0) * (i + 1) / n
        slab(f"{name}_{i}", axis, fixed, p0, p1, thick, y0, y0 + h, mat, col=col)


# ---------------------------------------------------------------- plan lines
N_OUT, N_IN = Z0 + SVC + OUTER, Z0 + RING - INNER
S_OUT, S_IN = Z1 - SVC - OUTER, Z1 - RING + INNER
W_OUT, W_IN = X0 + SVC + OUTER, X0 + RING - INNER
E_OUT, E_IN = X1 - SVC - OUTER, X1 - RING + INNER
IN_X0, IN_X1, IN_Z0, IN_Z1 = X0 + WALL_T, X1 - WALL_T, Z0 + WALL_T, Z1 - WALL_T
GC, HH, NL = ANCHORS[2], ANCHORS[1], ANCHORS[0]
gc0, gc1 = GC["x0"], GC["x1"]
hh0, hh1 = HH["x0"], HH["x1"]
nl0, nl1 = NL["x0"], NL["x1"]
WARE = (-200.0, X1, Z0, N_OUT)
DOCK_X = (-300.0, -288.0)
P_UP = (-300.0, PARK[1])
EXIT_X = (-250.0 - EXIT_W / 2, -250.0 + EXIT_W / 2)
EXIT_Z = (-EXIT_W / 2, EXIT_W / 2)
BAL_E_OUT, BAL_E_IN = E_OUT - BAL, E_IN + BAL
BAL_P_OUT, BAL_P_IN = N_OUT + BAL, N_IN - BAL
BAL_W_OUT, BAL_W_IN = W_OUT + BAL, W_IN - BAL


def top_over(axis, a, zline):
    """Height of the ceiling or roof above a ground-floor shopfront at `a` along `axis` on the row line `zline`."""
    if axis == "x":
        if P_UP[0] <= a <= P_UP[1]:
            return L1_Y - SLAB_T
        return ROOF1 if a < P_UP[0] else ROOF2
    if PARK[2] <= a <= PARK[3]:
        return L1_Y - SLAB_T
    return ROOF1 if zline < X0 + RING else ROOF2


# ---------------------------------------------------------------- floors: one tile per zone, no two tops at the same height overlap
rect("Floor_North", W_OUT, N_OUT, E_OUT, N_IN, -0.1, 0.1, P["floor"], tile=3.0)
rect("Floor_Notch", X0 + SVC, N_OUT, W_OUT, N_OUT + NOTCH, -0.1, 0.1, P["floor"], tile=3.0)
rect("Floor_South_W", W_OUT, S_IN, P_UP[0], S_OUT, -0.1, 0.1, P["floor"], tile=3.0)
rect("Floor_AlFresca", P_UP[0], S_IN, P_UP[1], S_OUT, -0.1, 0.1, P["street"], tile=2.0)
rect("Floor_South_E", P_UP[1], S_IN, E_OUT, S_OUT, -0.1, 0.1, P["floor"], tile=3.0)
rect("Floor_West", W_OUT, N_IN, W_IN, S_IN, -0.1, 0.1, P["floor"], tile=3.0)
rect("Floor_East", E_IN, N_IN, E_OUT, S_IN, -0.1, 0.1, P["floor"], tile=3.0)
rect("Floor_Vestibule", E_OUT, -ENTRANCE_HW, X1, ENTRANCE_HW, -0.1, 0.1, P["floor"], tile=3.0)
for a in ANCHORS:
    if a["rotationY"] == 0.0:
        rect(f"Floor_Fore_{a['key']}", a["x0"], IN_Z0, a["x1"], N_OUT, -0.1, 0.1, P["floor"], tile=3.0)
    else:
        rect(f"Floor_Fore_{a['key']}", a["x0"], S_OUT, a["x1"], IN_Z1, -0.1, 0.1, P["street"], tile=2.0)
rect("Floor_SvcN_a", gc1, IN_Z0, hh0, Z0 + SVC, -0.1, 0.1, P["service"], tile=3.0)
rect("Floor_SvcN_b", hh1, IN_Z0, WARE[0] - WALL_T, Z0 + SVC, -0.1, 0.1, P["service"], tile=3.0)
rect("Floor_SvcS_a", X0 + SVC, Z1 - SVC, nl0, IN_Z1, -0.1, 0.1, P["service"], tile=3.0)
rect("Floor_SvcS_b", nl1, Z1 - SVC, IN_X1, IN_Z1, -0.1, 0.1, P["service"], tile=3.0)
rect("Floor_SvcW", IN_X0, IN_Z0, X0 + SVC, IN_Z1, -0.1, 0.1, P["service"], tile=3.0)
rect("Floor_SvcSW", X0 + SVC, S_OUT, W_OUT, Z1 - SVC, -0.1, 0.1, P["service"], tile=3.0)
rect("Floor_SvcSE", E_OUT, S_OUT, IN_X1, Z1 - SVC, -0.1, 0.1, P["service"], tile=3.0)
rect("Floor_Ware", WARE[0], IN_Z0, IN_X1, N_OUT - WALL_T, -0.1, 0.1, P["service"], tile=3.0)
for name, x0, z0, x1, z1 in (("ExitN", EXIT_X[0], PARK[2], EXIT_X[1], N_IN), ("ExitS", EXIT_X[0], S_IN, EXIT_X[1], PARK[3]),
                             ("ExitW", PARK[0], EXIT_Z[0], W_IN, EXIT_Z[1]), ("ExitE", E_IN, EXIT_Z[0], PARK[1], EXIT_Z[1])):
    rect(f"{name}_Floor", x0, z0, x1, z1, -0.1, 0.1, P["paving"], tile=2.0)

# ---------------------------------------------------------------- envelope: outer walls once per plane, anchors flush, park walls, corner blocks
walls_along("Outer_W", "z", X0 + WALL_T / 2, Z0, Z1, 0.0, ROOF2, P["wall_out"])
walls_along("Outer_E_a", "z", X1 - WALL_T / 2, Z0, -ENTRANCE_HW, 0.0, ROOF2, P["wall_out"])
walls_along("Outer_E_b", "z", X1 - WALL_T / 2, ENTRANCE_HW, Z1, 0.0, ROOF2, P["wall_out"])
for i, (p0, p1) in enumerate(((IN_X0, gc0), (gc1, hh0), (hh1, IN_X1))):
    walls_along(f"Outer_N_{i}", "x", Z0 + WALL_T / 2, p0, p1, 0.0, ROOF2, P["wall_out"])
for i, (p0, p1) in enumerate(((IN_X0, nl0), (nl1, IN_X1))):
    walls_along(f"Outer_S_{i}", "x", Z1 - WALL_T / 2, p0, p1, 0.0, ROOF2, P["wall_out"])
ANCHOR_RETURN_TOP = {"greencart": ROOF2 - 0.05, "hearth_hollow": ROOF2 - 0.05, "northline": 6.4}
for a in ANCHORS:
    top = ANCHOR_RETURN_TOP[a["key"]]
    z_a, z_b = (IN_Z0 + GAP, N_OUT) if a["rotationY"] == 0.0 else (S_OUT, IN_Z1 - GAP)
    for side, x in (("W", a["x0"]), ("E", a["x1"])):
        lo, hi = (x - WALL_T, x) if side == "W" else (x, x + WALL_T)
        rect(f"Return_{a['key']}_{side}", lo, z_a, hi, z_b, 0.0, top, P["wall_out"], col=True)
GC_ROOF_TOP, HH_ROOF_TOP, NL_ROOF_TOP = 6.25, 5.75, 5.75
slab("Spandrel_greencart", "x", Z0 + WALL_T / 2, gc0, gc1, WALL_T, GC_ROOF_TOP, ROOF2, P["wall_out"], col=False)
slab("Spandrel_hearth_hollow", "x", Z0 + WALL_T / 2, hh0, hh1, WALL_T, HH_ROOF_TOP, ROOF2, P["wall_out"], col=False)
slab("Spandrel_northline", "x", Z1 - WALL_T / 2, nl0, nl1, WALL_T, NL_ROOF_TOP, ROOF2, P["wall_out"], col=False)
rect("Lintel_greencart", gc0, N_OUT - 0.15, gc1, N_OUT + 0.15, GC_ROOF_TOP, ROOF1 - GC_ROOF_TOP, P["wall_out"])
rect("Lintel_northline", nl0, S_OUT - 0.15, nl1, S_OUT + 0.15, NL_ROOF_TOP, 6.4 - NL_ROOF_TOP, P["wall_out"])

# park walls: one wall per side, the exit arches cut as lintels; the inner rows have no back wall of their own
PW = WALL_T
for name, axis, fixed, a0, a1, gap in (("ParkWall_N", "x", PARK[2] - PW / 2, PARK[0], PARK[1], EXIT_X), ("ParkWall_S", "x", PARK[3] + PW / 2, PARK[0], PARK[1], EXIT_X),
                                        ("ParkWall_W", "z", PARK[0] - PW / 2, PARK[2], PARK[3], EXIT_Z), ("ParkWall_E", "z", PARK[1] + PW / 2, PARK[2], PARK[3], EXIT_Z)):
    slab(f"{name}_a", axis, fixed, a0, gap[0], PW, 0.0, ROOF2, P["wall"])
    slab(f"{name}_b", axis, fixed, gap[1], a1, PW, 0.0, ROOF2, P["wall"])
    slab(f"{name}_Lintel", axis, fixed, gap[0], gap[1], PW, 4.4, ROOF2, P["wall"], col=False)
for name, x0, z0, x1, z1 in (("ExitN", EXIT_X[0], PARK[2] - WALL_T, EXIT_X[1], N_IN), ("ExitS", EXIT_X[0], S_IN, EXIT_X[1], PARK[3] + WALL_T),
                             ("ExitW", PARK[0] - WALL_T, EXIT_Z[0], W_IN, EXIT_Z[1]), ("ExitE", E_IN, EXIT_Z[0], PARK[1] + WALL_T, EXIT_Z[1])):
    rect(f"{name}_Lintel", x0, z0, x1, z1, 4.4, CELL_H - 4.4, P["band"])
    bx0, bx1 = sorted((x0, x1))
    bz0, bz1 = sorted((z0, z1))
    if name == "ExitN": bz1 -= 0.06
    if name == "ExitS": bz0 += 0.06
    if name == "ExitW": bx1 -= 0.06
    if name == "ExitE": bx0 += 0.06
    rect(f"{name}_Bulkhead", bx0, bz0, bx1, bz1, CELL_H, L1_Y - SLAB_T - CELL_H, P["wall"])
for name, gx, gz, yaw in (("ExitN", -250.0, N_IN - 0.06, math.pi), ("ExitS", -250.0, S_IN + 0.06, 0.0), ("ExitW", W_IN - 0.06, 0.0, -math.pi / 2), ("ExitE", E_IN + 0.06, 0.0, math.pi / 2)):
    text(f"{name}_Sign", "LEISURE PARK", gx, gz, 4.44, 0.32, P["sign"], yaw)

# the four inner corner blocks between the inner rows: solid up to the roof of their court
for name, x0, x1, z0, z1, top in (("Corner_NW", W_IN, PARK[0], N_IN, PARK[2], ROOF1), ("Corner_SW", W_IN, PARK[0], PARK[3], S_IN, ROOF1),
                                   ("Corner_NE", PARK[1], E_IN, N_IN, PARK[2], ROOF2 + 0.3), ("Corner_SE", PARK[1], E_IN, PARK[3], S_IN, ROOF2 + 0.3)):
    rect(name, x0, z0, x1, z1, 0.0, top, P["wall"], col=True, tile=3.0)
    zf = N_IN if z0 == N_IN else S_IN
    xf = W_IN if x0 == W_IN else E_IN
    rect(f"{name}_BandZ", x0, zf - 0.12 if zf == N_IN else zf, x1, zf if zf == N_IN else zf + 0.12, 3.4, 1.4, CAT_MATS["services"])
    rect(f"{name}_BandX", xf - 0.12 if xf == W_IN else xf, z0, xf if xf == W_IN else xf + 0.12, z1, 3.4, 1.4, CAT_MATS["services"])

# warehouse + security room band (NE corner): west wall to the roof, front wall with the staff door, partition
wx0, wx1, wz0, wz1 = WARE
rect("Ware_WestWall", wx0 - WALL_T, IN_Z0, wx0, N_OUT - WALL_T, 0.0, ROOF2, P["wall"], col=True)
for i, (p0, p1) in enumerate(((wx0, wx0 + 18.0), (wx0 + 19.6, IN_X1))):
    rect(f"Ware_Front_{i}", p0, N_OUT - WALL_T, p1, N_OUT, 0.0, ROOF2 + 1.1, P["wall"], col=True)
rect("Ware_FrontLintel", wx0 + 18.0, N_OUT - WALL_T, wx0 + 19.6, N_OUT, 2.3, ROOF2 + 1.1 - 2.3, P["wall"])
box("Ware_Door", wx0 + 18.05, N_OUT - 0.5, 0.0, 0.06, 0.95, 2.1, P["dark"])
text("Ware_Sign", "STAFF ONLY", wx0 + 18.8, N_OUT + 0.06, 2.45, 0.22, P["sign"], 0.0)
rect("Ware_Partition", wx0 + 12.0 - WALL_T / 2, IN_Z0, wx0 + 12.0 + WALL_T / 2, N_OUT - 3.0, 0.0, CELL_H, P["wall"], col=True)
text("Ware_SecText", "SECURITY", wx0 + 6.0, N_OUT - WALL_T - 0.06, 2.6, 0.4, P["sign"], math.pi)
for i in range(6):
    gx, gz = wx0 + 14.0 + (i % 3) * 2.2, wz0 + 1.9 + (i // 3) * 2.4
    box(f"Ware_Crate{i}", gx, gz, 0.0, 1.4, 1.4, 1.0 + 0.3 * (i % 2), P["carton"], bevel=0.02, col=True)
box("Ware_Rack", wx0 + 24.0, wz0 + 5.0, 0.0, 6.0, 1.2, 3.4, P["steel"], col=True)
add(L.furn(coll, "Sec_Desk", wx0 + 5.0, wz0 + 3.0, 0.0, [(0, 0, 0.0, 3.0, 0.9, 0.78, P["dark"], 0.02), (-0.8, 0.0, 0.78, 0.6, 0.4, 0.5, P["panel"], 0.01), (0.8, 0.0, 0.78, 0.6, 0.4, 0.5, P["panel"], 0.01)]))
cols.add("Sec_Desk", wx0 + 5.0, wz0 + 3.0, 0.0, 3.0, 0.9, 1.3)
for i in range(6):
    box(f"Sec_Monitor{i}", wx0 + 2.0 + (i % 3) * 1.2, IN_Z0 + 0.08, 1.4 + (i // 3) * 0.9, 1.0, 0.1, 0.7, P["panel"])
box("Sec_Couch", wx0 + 9.5, wz0 + 1.3, 0.0, 2.0, 0.9, 0.8, P["band"], bevel=0.04, col=True)

# service corridors: ceilings and lights segmented like the rows (never through the anchors or the warehouse)
SVC_N = ((gc1 + WALL_T, hh0 - WALL_T), (hh1 + WALL_T, wx0 - WALL_T))
SVC_S = ((X0 + SVC, nl0 - WALL_T), (nl1 + WALL_T, IN_X1))
for i, (p0, p1) in enumerate(SVC_N):
    rect(f"Svc_Ceiling_N{i}", p0, IN_Z0, p1, Z0 + SVC, CELL_H, 0.2, P["slab"])
for i, (p0, p1) in enumerate(SVC_S):
    rect(f"Svc_Ceiling_S{i}", p0, Z1 - SVC, p1, IN_Z1, CELL_H, 0.2, P["slab"])
rect("Svc_Ceiling_W", IN_X0, IN_Z0, X0 + SVC, IN_Z1, CELL_H, 0.2, P["slab"])
rect("Svc_Ceiling_SW", X0 + SVC, S_OUT, W_OUT, Z1 - SVC, CELL_H, 0.2, P["slab"])
rect("Svc_Ceiling_SE", E_OUT, S_OUT, IN_X1, Z1 - SVC, CELL_H, 0.2, P["slab"])
li = 0
for gx in range(int(X0) + 6, int(X1), 12):
    if any(p0 + 0.8 < gx < p1 - 0.8 for p0, p1 in SVC_N):
        box(f"SvcLight_N{li}", gx, Z0 + SVC / 2, CELL_H - 0.08, 1.2, 0.3, 0.06, P["panel"])
    if any(p0 + 0.8 < gx < p1 - 0.8 for p0, p1 in SVC_S):
        box(f"SvcLight_S{li}", gx, Z1 - SVC / 2, CELL_H - 0.08, 1.2, 0.3, 0.06, P["panel"])
    li += 1
for i, gz in enumerate(range(int(Z0) + 6, int(Z1), 12)):
    box(f"SvcLight_W{i}", X0 + SVC / 2, gz, CELL_H - 0.08, 0.3, 1.2, 0.06, P["panel"])
rect("Notch_WallW", X0 + SVC, N_OUT, X0 + SVC + WALL_T, N_OUT + NOTCH, 0.0, ROOF1, P["wall"], col=True)
# loading dock: roll-up door on the north face, platform and ramp outside, bollards, dumpster
rect("Dock_Door", DOCK_X[0], Z0 - 0.04, DOCK_X[1], Z0 - 0.02, 0.0, 3.6, P["shutter"])
rect("Dock_Platform", DOCK_X[0] - 2.0, Z0 - 4.5, DOCK_X[1] + 2.0, Z0 - 0.04, 0.0, 1.1, P["service"], col=True)
wedge("Dock_Ramp", DOCK_X[1] + 2.0, Z0 - 4.5, DOCK_X[1] + 8.0, Z0 - 0.04, 0.0, 1.1, "-x", P["service"])
cols.add("Dock_Ramp", DOCK_X[1] + 5.0, Z0 - 2.27, 0.0, 6.0, 4.46, 1.1)
for i, gx in enumerate((DOCK_X[0] - 1.0, DOCK_X[1] + 1.0)):
    ctx.cyl(f"Dock_Bollard{i}", gx, Z0 - 5.2, 0.0, 0.12, 0.9, P["yellow"], seg=8, col=True)
box("Dock_Dumpster", DOCK_X[0] - 5.0, Z0 - 2.5, 0.0, 2.4, 1.6, 1.5, P["band"], bevel=0.03, col=True)
text("Dock_Text", "DELIVERIES", (DOCK_X[0] + DOCK_X[1]) / 2, Z0 - 0.06, 3.7, 0.5, P["sign"], math.pi)

# ---------------------------------------------------------------- cells and rows: one partition per boundary, one back wall per row
cells = []
cell_stores = []
cell_n = {}
PIL_W, PIL_D = 0.6, 0.2


def cell_id(plaza):
    cell_n[plaza] = cell_n.get(plaza, 0) + 1
    return f"{plaza[0].upper()}{cell_n[plaza]:02d}"


def bounds_of(axis, a0, a1, front, back):
    if axis == "x":
        return {"minX": round(a0, 3), "maxX": round(a1, 3), "minZ": round(min(front, back), 3), "maxZ": round(max(front, back), 3)}
    return {"minX": round(min(front, back), 3), "maxX": round(max(front, back), 3), "minZ": round(a0, 3), "maxZ": round(a1, 3)}


def front_of(axis, mid, front, sign, y0):
    if axis == "x":
        return {"x": round(mid, 3), "y": y0, "z": round(front - sign * 1.0, 3), "yaw": 0.0 if sign < 0 else round(math.pi, 4)}
    return {"x": round(front - sign * 1.0, 3), "y": y0, "z": round(mid, 3), "yaw": round(-math.pi / 2 if sign > 0 else math.pi / 2, 4)}


def frame_for(axis, lo_f, hi_f, front, sign, y0, depth):
    """The local frame of a shopfront for mall_dressing: d = depth from the glass line, s = to the right seen from the walkway."""
    mid = (lo_f + hi_f) / 2
    if axis == "x":
        yaw = 0.0 if sign < 0 else math.pi
        to_world = lambda d, s: (mid - sign * s, front + sign * d)
        x, z = mid, front
    else:
        yaw = math.pi / 2 if sign < 0 else -math.pi / 2
        to_world = lambda d, s: (front + sign * d, mid + sign * s)
        x, z = front, mid
    return types.SimpleNamespace(x=x, z=z, y0=y0, axis=axis, sign=sign, yaw=yaw, width=hi_f - lo_f, depth=depth, glass_half=(hi_f - lo_f) / 2, to_world=to_world)


class Row:
    """Geometry helpers of one row: `a` runs along the row, `d` is the depth from the front line into the cells."""

    def __init__(self, key, axis, a0, a1, front, back, y0, level):
        self.key, self.axis, self.a0, self.a1, self.front, self.back, self.y0, self.level = key, axis, a0, a1, front, back, y0, level
        self.sign = 1 if back > front else -1
        self.depth = abs(back - front)
        self.yaw = (0.0 if self.sign < 0 else math.pi) if axis == "x" else (math.pi / 2 if self.sign < 0 else -math.pi / 2)

    def rect(self, name, p0, p1, d0, d1, y, h, mat, col=False, tile=2.0):
        lo, hi = sorted((self.front + self.sign * d0, self.front + self.sign * d1))
        if self.axis == "x":
            return rect(name, p0, lo, p1, hi, y, h, mat, col=col, tile=tile)
        return rect(name, lo, p0, hi, p1, y, h, mat, col=col, tile=tile)

    def box(self, name, a, d, y, sa, sd, h, mat, bevel=0.0, col=False):
        gx, gz = (a, self.front + self.sign * d) if self.axis == "x" else (self.front + self.sign * d, a)
        sx, sz = (sa, sd) if self.axis == "x" else (sd, sa)
        return box(name, gx, gz, y, sx, sz, h, mat, bevel=bevel, col=col)

    def text(self, name, body, a, d, y, size, mat, flip=False):
        gx, gz = (a, self.front + self.sign * d) if self.axis == "x" else (self.front + self.sign * d, a)
        return text(name, body, gx, gz, y, size, mat, self.yaw + (math.pi if flip else 0.0))

    def cyl(self, name, a, d, y, r, h, mat, seg=6):
        gx, gz = (a, self.front + self.sign * d) if self.axis == "x" else (self.front + self.sign * d, a)
        return ctx.cyl(name, gx, gz, y, r, h, mat, seg=seg)


def end_faces(r, a0, a1, ends):
    """Per end: (inner face of the closing wall or partition, inset of the back wall, filler needed). Builds returns."""
    out = []
    for i, (end, a) in enumerate(zip(ends, (a0, a1))):
        kind = end[0]
        side = 1 if i == 0 else -1
        if kind in ("part", "shared"):
            out.append((a + side * PART_T / 2, a, True))
        elif kind == "wall":
            lo, hi = end[1], end[2]
            inner = hi if i == 0 else lo
            inner = max(inner, a0) if i == 0 else min(inner, a1)
            out.append((inner, inner, inner == a))
        else:
            top = end[1] if len(end) > 1 else r.y0 + CELL_H
            name = f"Return_{r.key}_{'start' if i == 0 else 'end'}"
            lo, hi = (a, a + PART_T) if i == 0 else (a - PART_T, a)
            r.rect(name, lo, hi, 0.0, r.depth - PART_T, r.y0, top - r.y0, P["wall"], col=True)
            out.append((a + side * PART_T, a + side * PART_T, False))
    return out


def pilaster(r, lo, hi):
    name = f"Pilaster_{r.key}_{int(round((lo + hi) * 10))}"
    r.rect(name, lo, hi, -PIL_D, PIL_D, r.y0, CELL_H, P["wall"], col=True)
    gx, gz = ((lo + hi) / 2, r.front) if r.axis == "x" else (r.front, (lo + hi) / 2)


def planned_front(r, cid, lo_f, hi_f, lo_i, hi_i, category, name):
    label, _ = CATS[category]
    mid = (lo_f + hi_f) / 2
    y0 = r.y0
    tag = f"Cell_{cid}"
    r.rect(f"{tag}_Low", lo_f, hi_f, -0.1, 0.1, y0, 0.5, P["wall"], col=True)
    r.rect(f"{tag}_Glass", lo_f, hi_f, -0.02, 0.02, y0 + 0.5, 2.9, P["glass"], col=True)
    r.rect(f"{tag}_Fascia", lo_f, hi_f, -0.12, 0.12, y0 + 3.4, CELL_H - 3.4, CAT_MATS[category])
    r.text(f"{tag}_Name", name.upper(), mid, -0.14, y0 + 3.75, 0.42, P["sign"])
    r.rect(f"{tag}_WindowFloor", lo_i + 0.03, hi_i - 0.03, PIL_D, 3.5, y0 - 0.01, 0.03, P["floor2"], tile=2.0)
    r.rect(f"{tag}_Void", lo_i, hi_i, 3.56, 3.64, y0, 3.4, P["dark"], col=True)
    r.rect(f"{tag}_Accent", mid - 1.2, mid + 1.2, 3.525, 3.575, y0 + 0.6, 2.0, CAT_MATS[category])
    r.rect(f"{tag}_Light", lo_f + 0.1, hi_f - 0.1, 1.3, 2.3, y0 + 3.25, 0.08, mall_dressing.light_mat(ctx, category))
    r.box(f"{tag}_Soon", mid, -0.06, y0 + 2.55, min(2.6, hi_f - lo_f - 2.0), 0.03, 0.7, P["soon"])
    if r.level == 0:
        r.text(f"{tag}_SoonText", "OPENING SOON", mid, -0.09, y0 + 2.75, 0.26, P["dark"])


def construction_front(r, cid, lo_f, hi_f, name):
    mid = (lo_f + hi_f) / 2
    y0 = r.y0
    tag = f"Cell_{cid}"
    r.rect(f"{tag}_Hoarding", lo_f, hi_f, -0.08, 0.08, y0, 3.4, P["plywood"], col=True)
    r.rect(f"{tag}_Tape", lo_f + 0.02, hi_f - 0.02, -0.105, 0.105, y0 + 1.1, 0.18, P["caution"])
    r.text(f"{tag}_Reno", "UNDER RENOVATION", mid, -0.125, y0 + 1.7, 0.3, P["dark"])
    r.rect(f"{tag}_Fascia", lo_f, hi_f, -0.12, 0.12, y0 + 3.4, CELL_H - 3.4, P["plywood"])
    r.text(f"{tag}_Name", name.upper(), mid, -0.14, y0 + 3.75, 0.42, P["sign"])
    for k in range(int((hi_f - lo_f) / 3.0)):
        sa = lo_f + 1.5 + k * 3.0
        for dz in (0.5, 1.3):
            r.cyl(f"{tag}_Scaf{k}_{int(dz * 10)}", sa, -dz, y0, 0.04, 3.6, P["metal"], seg=5)
        r.box(f"{tag}_ScafBar{k}", sa, -0.9, y0 + 1.8, 0.05, 0.9, 0.05, P["metal"])
        r.box(f"{tag}_ScafPlank{k}", sa, -0.9, y0 + 2.0, 1.2, 0.9, 0.05, P["pallet"])


def passage_front(r, cid, lo_i, hi_i):
    tag = f"Cell_{cid}"
    mid = (lo_i + hi_i) / 2
    y0 = r.y0
    r.rect(f"{tag}_Lintel", lo_i, hi_i, PIL_D, PIL_D + 0.3, y0 + 2.3, CELL_H - 2.3, P["wall"])
    r.rect(f"{tag}_Door", lo_i, lo_i + 0.06, 0.25, 1.15, y0, 2.1, P["dark"])
    r.text(f"{tag}_Text", "STAFF ONLY", mid, -0.02, y0 + 2.45, 0.22, P["sign"])
    if r.level == 0:
        r.rect(f"{tag}_Floor", lo_i, hi_i, 0.0, r.depth - PART_T, -0.1, 0.1, P["service"], tile=3.0)


def open_cell(r, cid, name, category, a0, a1, faces):
    key = CELL_STORES[name]
    mid = (a0 + a1) / 2
    door_offset = r.front + r.sign * 4.5
    if r.axis == "x":
        position, rot = [round(mid, 3), 0.0, round(door_offset, 3)], (0.0 if r.sign < 0 else math.pi)
    else:
        position, rot = [round(door_offset, 3), 0.0, round(mid, 3)], (math.pi / 2 if r.sign < 0 else -math.pi / 2)
    cell_stores.append({"key": key, "name": name, "category": category, "plaza": ROWS[r.key][0], "position": position, "rotationY": round(rot, 6), "cell": cid})
    shell_depth = min(r.depth - PART_T, 9.2)
    for i, (inner, _, _) in enumerate(faces):
        edge = a0 + 0.25 if i == 0 else a1 - 0.25
        lo, hi = (inner, edge) if i == 0 else (edge, inner)
        if hi - lo > 0.01:
            r.rect(f"Cell_{cid}_Filler{i}", lo, hi, PIL_D, shell_depth, r.y0, CELL_H - 0.3, P["wall"])
    if r.axis == "x":
        ctx.exclude(a0 - 4.0, min(r.front, r.front - r.sign * 4.0), a1 + 4.0, max(r.front, r.front - r.sign * 4.0), f"store {key}")
    else:
        ctx.exclude(min(r.front, r.front - r.sign * 4.0), a0 - 4.0, max(r.front, r.front - r.sign * 4.0), a1 + 4.0, f"store {key}")


def row(row_key, axis, a0, a1, front, back, y0=0.0, level=0, ends=(("part",), ("part",)), back_wall=True):
    """Cells share the segment by weight (default 1.0, a 4th tuple element widens one); staff passages are 1.6 m."""
    r = Row(row_key, axis, a0, a1, front, back, y0, level)
    plaza, items = ROWS[row_key]
    items = [it if len(it) == 4 else (*it, 1.0) for it in items]
    free = (a1 - a0) - sum(1.6 for it in items if it[2] == S_)
    weight = sum(it[3] for it in items if it[2] != S_)
    bounds = [a0]
    for name, category, status, w in items:
        bounds.append(bounds[-1] + (1.6 if status == S_ else free * w / weight))
    bounds[-1] = a1
    faces = end_faces(r, a0, a1, ends)
    for i, b in enumerate(bounds[1:-1]):
        r.rect(f"Partition_{row_key}_{i}", b - PART_T / 2, b + PART_T / 2, PIL_D, r.depth - PART_T, y0, CELL_H, P["wall"], col=True)
        pilaster(r, b - PIL_W / 2, b + PIL_W / 2)
    if ends[0][0] == "part":
        r.rect(f"Partition_{row_key}_start", a0 - PART_T / 2, a0 + PART_T / 2, PIL_D, r.depth - PART_T, y0, CELL_H, P["wall"], col=True)
        pilaster(r, a0 - PIL_W / 2, a0 + PIL_W / 2)
    elif ends[0][0] in ("wall", "return"):
        pilaster(r, faces[0][0], faces[0][0] + PIL_W)
    if ends[1][0] == "part":
        r.rect(f"Partition_{row_key}_end", a1 - PART_T / 2, a1 + PART_T / 2, PIL_D, r.depth - PART_T, y0, CELL_H, P["wall"], col=True)
        pilaster(r, a1 - PIL_W / 2, a1 + PIL_W / 2)
    elif ends[1][0] in ("wall", "return"):
        pilaster(r, faces[1][0] - PIL_W, faces[1][0])
    bw0 = faces[0][1] if ends[0][0] in ("wall", "return") else a0
    bw1 = faces[1][1] if ends[1][0] in ("wall", "return") else a1
    if back_wall:
        r.rect(f"Back_{row_key}", bw0, bw1, r.depth - PART_T, r.depth, y0, CELL_H, P["wall"], col=True)
    for i, (name, category, status, w) in enumerate(items):
        b0, b1 = bounds[i], bounds[i + 1]
        cid = cell_id(plaza)
        lo_i = faces[0][0] if i == 0 else b0 + PART_T / 2
        hi_i = faces[1][0] if i == len(items) - 1 else b1 - PART_T / 2
        lo_f = (faces[0][0] + PIL_W) if (i == 0 and ends[0][0] != "shared") else (b0 + PIL_W / 2 if i > 0 or ends[0][0] == "part" else b0 + PIL_W / 2)
        hi_f = (faces[1][0] - PIL_W) if (i == len(items) - 1 and ends[1][0] != "shared") else b1 - PIL_W / 2
        if ends[0][0] == "part" and i == 0:
            lo_f = b0 + PIL_W / 2
        if ends[1][0] == "part" and i == len(items) - 1:
            hi_f = b1 - PIL_W / 2
        label, _ = CATS[category]
        cell = {"id": cid, "plaza": plaza, "level": level, "row": row_key, "category": category, "label": label, "name": name, "status": status,
                "bounds": bounds_of(axis, b0, b1, front, back), "front": front_of(axis, (b0 + b1) / 2, front, r.sign, y0), "width": round(b1 - b0, 3), "depth": round(r.depth, 3)}
        if status == O_:
            cell["store"] = CELL_STORES[name]
            open_cell(r, cid, name, category, b0, b1, (faces[0] if i == 0 else (b0 + PART_T / 2, b0, True), faces[1] if i == len(items) - 1 else (b1 - PART_T / 2, b1, True)))
        elif status == S_:
            passage_front(r, cid, lo_i, hi_i)
        else:
            ceil_lo = lo_i - (0.15 if i == 0 and ends[0][0] != "part" and ends[0][0] != "shared" else 0.0)
            ceil_hi = hi_i + (0.15 if i == len(items) - 1 and ends[1][0] != "part" and ends[1][0] != "shared" else 0.0)
            if i == 0 and ends[0][0] in ("part", "shared"):
                ceil_lo = b0
            if i == len(items) - 1 and ends[1][0] in ("part", "shared"):
                ceil_hi = b1
            r.rect(f"Cell_{cid}_Ceiling", ceil_lo, ceil_hi, 0.1, r.depth - PART_T - 0.05, y0 + CEIL_LO, CEIL_HI - CEIL_LO, P["slab"])
            frame = frame_for(axis, lo_f, hi_f, front, r.sign, y0, r.depth)
            if status == P_:
                planned_front(r, cid, lo_f, hi_f, lo_i, hi_i, category, name)
                mall_dressing.dress_planned(ctx, cell, frame)
            else:
                construction_front(r, cid, lo_f, hi_f, name)
                mall_dressing.dress_construction(ctx, cell, frame)
        cells.append(cell)
    # the bulkhead closes the front from the fascia up to the slab or roof above, split where that height changes
    cuts = [c for c in ((P_UP if axis == "x" else (PARK[2], PARK[3]))) if a0 < c < a1]
    b_lo = faces[0][1] if ends[0][0] in ("return", "wall") else a0
    b_hi = faces[1][1] if ends[1][0] in ("return", "wall") else a1
    pts = [b_lo] + cuts + [b_hi]
    for i, (p0, p1) in enumerate(zip(pts, pts[1:])):
        top = ROOF2 if level == 1 else top_over(axis, (p0 + p1) / 2, front)
        r.rect(f"Bulkhead_{row_key}_{i}", p0, p1, -0.2, 0.1, y0 + CELL_H, top - y0 - CELL_H, P["wall"])
    return r

# ---------------------------------------------------------------- ground floor rows (ends: part = partition built here, shared = built by the neighbour, wall = closed by an external wall [lo, hi], return = own return wall)
W_ = lambda lo, hi: ("wall", lo, hi)
row("N_out_a", "x", X0 + SVC, gc0, N_OUT, IN_Z0, ends=(("return",), W_(gc0 - WALL_T, gc0)), back_wall=False)
row("N_out_b", "x", gc1, hh0, N_OUT, Z0 + SVC, ends=(W_(gc1, gc1 + WALL_T), W_(hh0 - WALL_T, hh0)))
row("N_out_c", "x", hh1, (hh1 + WARE[0]) / 2, N_OUT, Z0 + SVC, ends=(W_(hh1, hh1 + WALL_T), ("part",)))
row("N_out_d", "x", (hh1 + WARE[0]) / 2, WARE[0], N_OUT, Z0 + SVC, ends=(("shared",), W_(WARE[0] - WALL_T, WARE[0])))
row("N_in_a", "x", PARK[0], P_UP[0], N_IN, PARK[2], ends=(W_(W_IN, PARK[0]), ("part",)), back_wall=False)
row("N_in_b", "x", P_UP[0], EXIT_X[0], N_IN, PARK[2], ends=(("shared",), ("return", L1_Y - SLAB_T)), back_wall=False)
row("N_in_c", "x", EXIT_X[1], PARK[1], N_IN, PARK[2], ends=(("return", L1_Y - SLAB_T), W_(PARK[1], E_IN)), back_wall=False)
row("S_out_a", "x", W_OUT, P_UP[0], S_OUT, Z1 - SVC, ends=(("return",), ("part",)))
row("S_out_b", "x", P_UP[0], nl0, S_OUT, Z1 - SVC, ends=(("shared",), W_(nl0 - WALL_T, nl0)))
row("S_out_c", "x", nl1, E_OUT, S_OUT, Z1 - SVC, ends=(W_(nl1, nl1 + WALL_T), ("return",)))
row("S_in_a", "x", PARK[0], P_UP[0], S_IN, PARK[3], ends=(W_(W_IN, PARK[0]), ("part",)), back_wall=False)
row("S_in_b", "x", P_UP[0], EXIT_X[0], S_IN, PARK[3], ends=(("shared",), ("return", L1_Y - SLAB_T)), back_wall=False)
row("S_in_c", "x", EXIT_X[1], PARK[1], S_IN, PARK[3], ends=(("return", L1_Y - SLAB_T), W_(PARK[1], E_IN)), back_wall=False)
row("W_out_a", "z", N_OUT + NOTCH, 0.0, W_OUT, X0 + SVC, ends=(("return",), ("part",)))
row("W_out_b", "z", 0.0, S_OUT, W_OUT, X0 + SVC, ends=(("shared",), ("return",)))
row("W_in_a", "z", PARK[2], EXIT_Z[0], W_IN, PARK[0], ends=(W_(N_IN, PARK[2]), ("return", L1_Y - SLAB_T)), back_wall=False)
row("W_in_b", "z", EXIT_Z[1], PARK[3], W_IN, PARK[0], ends=(("return", L1_Y - SLAB_T), W_(PARK[3], S_IN)), back_wall=False)
row("E_out_a", "z", N_OUT, -ENTRANCE_HW, E_OUT, X1, ends=(W_(N_OUT - WALL_T, N_OUT), ("return", L1_Y - SLAB_T)), back_wall=False)
row("E_out_b", "z", ENTRANCE_HW, S_OUT, E_OUT, X1, ends=(("return", L1_Y - SLAB_T), ("return",)), back_wall=False)
row("E_in_a", "z", PARK[2], EXIT_Z[0], E_IN, PARK[1], ends=(W_(N_IN, PARK[2]), ("return", L1_Y - SLAB_T)), back_wall=False)
row("E_in_b", "z", EXIT_Z[1], PARK[3], E_IN, PARK[1], ends=(("return", L1_Y - SLAB_T), W_(PARK[3], S_IN)), back_wall=False)

# ---------------------------------------------------------------- upper floors: slabs to the inner faces, cells, balconies, escalators, railings
stairs = []
l1_rects = []
l2_rects = []
ESC = []


def upper_wing(key, axis, a0, a1, out_front, in_front, out_back, in_back, row_out, row_in, back_wall_out, out_lim, s0, s1, rail_ends):
    sign_out = 1 if out_back > out_front else -1
    bal_out = out_front - sign_out * BAL
    bal_in = in_front + sign_out * BAL
    y = L1_Y
    in_lim = in_back + sign_out * WALL_T
    lo, hi = sorted((bal_out, out_lim))
    lo2, hi2 = sorted((bal_in, in_lim))
    fin_out = sorted((bal_out + sign_out * 0.06, out_front - sign_out * 0.22))
    fin_in = sorted((bal_in - sign_out * 0.06, in_front + sign_out * 0.22))
    for name, (p0, p1) in (("Slab_%s_Out" % key, (lo, hi)), ("Slab_%s_In" % key, (lo2, hi2))):
        rect(name, *((s0, p0, s1, p1) if axis == "x" else (p0, s0, p1, s1)), y - SLAB_T, SLAB_T, P["slab"], tile=3.0)
    for name, (p0, p1) in (("Floor1_%s_Out" % key, fin_out), ("Floor1_%s_In" % key, fin_in)):
        rect(name, *((s0 + 1.0, p0, s1 - 1.0, p1) if axis == "x" else (p0, s0 + 1.0, p1, s1 - 1.0)), y, 0.03, P["floor2"], tile=3.0)
        l1_rects.append({"minX": s0, "maxX": s1, "minZ": p0, "maxZ": p1} if axis == "x" else {"minX": p0, "maxX": p1, "minZ": s0, "maxZ": s1})
    ends = (("return",), ("return",))
    row(row_out, axis, a0, a1, out_front, out_back, y0=y, level=1, ends=ends if key != "P" else (("return",), W_(WARE[0] - WALL_T, WARE[0])), back_wall=back_wall_out)
    row(row_in, axis, a0, a1, in_front, in_back, y0=y, level=1, ends=ends if key != "P" else (("return",), W_(PARK[1], E_IN)), back_wall=False)
    esc = [("A", a0 + 1.0, a0 + 1.0 + RAMP_RUN, bal_out, sign_out, True), ("B", a1 - 1.0 - RAMP_RUN, a1 - 1.0, bal_in, -sign_out, False)]
    gaps_out, gaps_in = [], []
    for tag, r0, r1, edge, sgn, up in esc:
        rise = ("+" if up else "-") + axis
        band0 = edge - sgn * RAMP_W
        land0, land1 = (r1, r1 + LANDING) if up else (r0 - LANDING, r0)
        lo_b, hi_b = sorted((band0, edge))
        R = lambda name, p0, p1, q0, q1, y0, h, mat, col=False: rect(name, *((p0, q0, p1, q1) if axis == "x" else (q0, p0, q1, p1)), y0, h, mat, col=col)
        if axis == "x":
            wedge(f"Esc_{key}{tag}", r0, lo_b, r1, hi_b, 0.0, y, rise, P["floor2"])
            stairs.append({"name": f"Esc_{key}{tag}", "minX": r0, "maxX": r1, "minZ": lo_b, "maxZ": hi_b, "y0": 0.0, "y1": y, "rise": rise})
            l1_rects.append({"minX": land0, "maxX": land1, "minZ": lo_b, "maxZ": hi_b})
            ESC.append((r0 - 3.0, lo_b - 3.0, land1 + 3.0, hi_b + 3.0) if up else (land0 - 3.0, lo_b - 3.0, r1 + 3.0, hi_b + 3.0))
        else:
            wedge(f"Esc_{key}{tag}", lo_b, r0, hi_b, r1, 0.0, y, rise, P["floor2"])
            stairs.append({"name": f"Esc_{key}{tag}", "minX": lo_b, "maxX": hi_b, "minZ": r0, "maxZ": r1, "y0": 0.0, "y1": y, "rise": rise})
            l1_rects.append({"minX": lo_b, "maxX": hi_b, "minZ": land0, "maxZ": land1})
            ESC.append((lo_b - 3.0, r0 - 3.0, hi_b + 3.0, land1 + 3.0) if up else (lo_b - 3.0, land0 - 3.0, hi_b + 3.0, r1 + 3.0))
        R(f"Esc_{key}{tag}_Land", land0, land1, lo_b, hi_b, 0.0, y, P["floor2"])
        side = band0 - sgn * 0.05
        for k in range(8):
            p0, p1 = r0 + (r1 - r0) * k / 8, r0 + (r1 - r0) * (k + 1) / 8
            t = (k + 1) / 8 if up else 1 - k / 8
            R(f"Esc_{key}{tag}_Side{k}", p0, p1, side - 0.04, side + 0.04, 0.0, y * t + 1.0, P["glass"], col=True)
            R(f"Esc_{key}{tag}_Cap{k}", p0, p1, side - 0.06, side + 0.06, y * t + 1.0, 0.07, P["rail"])
        R(f"Esc_{key}{tag}_LandSide", land0, land1, side - 0.04, side + 0.04, 0.0, y + 1.0, P["glass"], col=True)
        end = land1 if up else land0
        R(f"Esc_{key}{tag}_End", *((end, end + 0.08) if up else (end - 0.08, end)), lo_b + 0.05, hi_b - 0.05, 0.0, y + 1.0, P["glass"], col=True)
        keep0, keep1 = (r0, r0 + (r1 - r0) * 0.93) if up else (r0 + (r1 - r0) * 0.07, r1)
        for k in range(8):
            p0, p1 = keep0 + (keep1 - keep0) * k / 8, keep0 + (keep1 - keep0) * (k + 1) / 8
            t = min(1.0, ((p1 - r0) / (r1 - r0)) if up else ((r1 - p0) / (r1 - r0)))
            R(f"Esc_{key}{tag}_BalSide{k}", p0, p1, edge - 0.03, edge + 0.03, 0.0, y * t + 1.0, P["glass"], col=True)
        (gaps_out if edge == bal_out else gaps_in).append((min(r0, land0), max(r1, land1)))
    railing(f"Rail_{key}_Out", axis, bal_out, a0, a1, y, gaps=gaps_out)
    railing(f"Rail_{key}_In", axis, bal_in, a0, a1, y, gaps=gaps_in)
    for end in rail_ends:
        railing(f"Rail_{key}_End{int(end)}O", "z" if axis == "x" else "x", end, fin_out[0] + 0.06, fin_out[1] - 0.06, y)
        railing(f"Rail_{key}_End{int(end)}I", "z" if axis == "x" else "x", end, fin_in[0] + 0.06, fin_in[1] - 0.06, y)
    for p in range(int(a0) + 8, int(a1) - 2, 16):
        for edge, c in ((bal_out, bal_out + sign_out * 0.55), (bal_in, bal_in - sign_out * 0.55)):
            if any(r0 - 1.0 <= p <= max(r1, land1) + 1.0 for _, r0, r1, e, _, _ in esc for land1 in (r1 + LANDING,) if e == edge):
                continue
            if axis == "x":
                pillar(f"Pillar_{key}_{p}_{int(edge)}", p, c, 0.0, ROOF2)
            else:
                pillar(f"Pillar_{key}_{p}_{int(edge)}", c, p, 0.0, ROOF2)
    for p in range(int(a0) + 4, int(a1) - 2, 8):
        for front, edge in ((out_front, bal_out), (in_front, bal_in)):
            c = (front + edge) / 2
            box(f"BalLight_{key}_{p}_{int(c)}", *((p, c) if axis == "x" else (c, p)), y - SLAB_T - 0.06, *((1.6, 0.5) if axis == "x" else (0.5, 1.6)), 0.06, P["panel"])
    return bal_out, bal_in


upper_wing("E", "z", PARK[2], PARK[3], E_OUT, E_IN, X1, PARK[1], "E1_out", "E1_in", False, IN_X1, PARK[2], PARK[3], (PARK[2], PARK[3]))
upper_wing("P", "x", P_UP[0], P_UP[1], N_OUT, N_IN, Z0 + SVC, PARK[2], "P1_out", "P1_in", True, Z0 + SVC, P_UP[0], P_UP[1] - WALL_T, (P_UP[0],))
upper_wing("W", "z", PARK[2], PARK[3], W_OUT, W_IN, X0 + SVC, PARK[0], "W1_out", "W1_in", True, X0 + SVC, PARK[2], PARK[3], (PARK[2], PARK[3]))
for name, a0, a1, p0, p1 in (("Gable_N", N_OUT, N_IN, P_UP[0], P_UP[0] + WALL_T), ("Gable_WN", W_OUT, W_IN, PARK[2], PARK[2] + WALL_T), ("Gable_WS", W_OUT, W_IN, PARK[3] - WALL_T, PARK[3])):
    if name == "Gable_N":
        rect(name, p0, a0, p1, a1, ROOF1, ROOF2 - ROOF1, P["wall"])
    else:
        rect(name, a0, p0, a1, p1, ROOF1, ROOF2 - ROOF1, P["wall"])

# ---------------------------------------------------------------- roofs: plates to the balcony edges, trusses only over the voids, low roofs over the one-level plazas
def roof_plate(name, x0, z0, x1, z1, y=ROOF2):
    rect(name, x0, z0, x1, z1, y, 0.3, P["roof"], tile=4.0)


def trusses(name, axis, a0, a1, p0, p1, y=ROOF2):
    n = max(1, int((a1 - a0) / 6.0))
    for i in range(n + 1):
        a = a0 + 0.3 + (a1 - a0 - 0.6) * i / n
        rect(f"{name}_T{i}", *((a - 0.2, p0 + 0.3, a + 0.2, p1 - 0.3) if axis == "x" else (p0 + 0.3, a - 0.2, p1 - 0.3, a + 0.2)), y, 0.5, P["steel"])
    for j, p in enumerate((p0 + 0.6, (p0 + p1) / 2, p1 - 0.6)):
        rect(f"{name}_L{j}", *((a0 + 0.3, p - 0.12, a1 - 0.3, p + 0.12) if axis == "x" else (p - 0.12, a0 + 0.3, p + 0.12, a1 - 0.3)), y + 0.55, 0.3, P["steel"])


roof_plate("Roof_NorthPlaza", IN_X0, IN_Z0, P_UP[0], PARK[2] - WALL_T, ROOF1)
roof_plate("Roof_FoodCourt", IN_X0, PARK[3] + WALL_T, P_UP[0], IN_Z1, ROOF1)
for i, gx in enumerate(range(int(X0) + 6, int(P_UP[0]) - 2, 8)):
    for gz in (N_OUT - 1.0, -70.0, N_IN + 1.0):
        if gz == N_IN + 1.0 and W_IN - 1.5 <= gx <= PARK[0] + 1.5:
            continue
        box(f"RoofLight_N{i}_{int(gz)}", gx, gz, ROOF1 - 0.08, 2.4, 0.5, 0.08, P["panel"])
    for gz in (S_IN + 1.0, 70.0, S_OUT - 1.0):
        if gz == S_IN + 1.0 and W_IN - 1.5 <= gx <= PARK[0] + 1.5:
            continue
        box(f"RoofLight_S{i}_{int(gz)}", gx, gz, ROOF1 - 0.08, 2.4, 0.5, 0.08, P["panel"])
roof_plate("Roof_P_Out", P_UP[0], IN_Z0, P_UP[1] - WALL_T, BAL_P_OUT)
roof_plate("Roof_P_In", P_UP[0], BAL_P_IN, P_UP[1], PARK[2])
trusses("Truss_P", "x", P_UP[0], P_UP[1], BAL_P_OUT, BAL_P_IN)
roof_plate("Roof_E_Out", BAL_E_OUT, N_OUT, IN_X1, S_OUT)
roof_plate("Roof_E_In", PARK[1], PARK[2], BAL_E_IN, PARK[3])
roof_plate("Roof_E_StripN", E_IN, N_IN, BAL_E_OUT, PARK[2])
roof_plate("Roof_E_StripS", E_IN, PARK[3], BAL_E_OUT, S_IN)
trusses("Truss_E", "z", PARK[2], PARK[3], BAL_E_IN, BAL_E_OUT)
trusses("Truss_CourtNE", "x", PARK[1], BAL_E_OUT, N_OUT, N_IN)
trusses("Truss_CourtSE", "x", PARK[1], BAL_E_OUT, S_IN, S_OUT)
roof_plate("Roof_W_Out", IN_X0, PARK[2], BAL_W_OUT, PARK[3])
roof_plate("Roof_W_In", BAL_W_IN, PARK[2], PARK[0], PARK[3])
trusses("Truss_W", "z", PARK[2], PARK[3], BAL_W_OUT, BAL_W_IN)

# ---------------------------------------------------------------- roof terrace over the warehouse: slab inside the walls, parapets on the walls, switchback stair
sa = {"name": "Stair_roof_a", "minX": wx1 - 13.0, "maxX": wx1 - 2.0, "minZ": wz0 + 0.4, "maxZ": wz0 + 1.8, "y0": 0.0, "y1": L1_Y, "rise": "-x"}
land = {"minX": wx1 - 16.0, "maxX": wx1 - 13.0, "minZ": wz0 + 0.4, "maxZ": wz0 + 3.4}
sb = {"name": "Stair_roof_b", "minX": wx1 - 13.0, "maxX": wx1 - 2.0, "minZ": wz0 + 2.0, "maxZ": wz0 + 3.4, "y0": L1_Y, "y1": ROOF2, "rise": "+x"}
stairs += [sa, sb]
l1_rects.append(land)
wedge("Stair_roof_a", sa["minX"], sa["minZ"], sa["maxX"], sa["maxZ"], 0.0, L1_Y, "-x", P["service"])
rect("Stair_roof_land", land["minX"], land["minZ"], land["maxX"], land["maxZ"], 0.0, L1_Y, P["service"])
wedge("Stair_roof_b", sb["minX"], sb["minZ"], sb["maxX"], sb["maxZ"], L1_Y, ROOF2, "+x", P["service"])
rect("Stair_roof_wallA", sa["minX"], sa["maxZ"] - 0.05, sa["maxX"], sa["maxZ"] + 0.05, 0.0, L1_Y + 1.0, P["steel"], col=True)
rect("Stair_roof_wallB", sb["minX"], sb["minZ"] - 0.05, sb["maxX"], sb["minZ"] + 0.05, 0.0, ROOF2 + 1.0, P["steel"], col=True)
rect("Stair_roof_railB", sb["minX"], sb["maxZ"] - 0.05, sb["maxX"], sb["maxZ"] + 0.05, 0.0, ROOF2 + 1.0, P["steel"], col=True)
rect("Stair_roof_railLand", land["minX"] - 0.1, land["minZ"], land["minX"], land["maxZ"], 0.0, L1_Y + 1.0, P["steel"], col=True)
roof_plate("Roof_Ware", wx0, IN_Z0, IN_X1, N_OUT - WALL_T, ROOF2 - 0.3)
l2_rects.append({"minX": wx0, "maxX": IN_X1, "minZ": IN_Z0, "maxZ": N_OUT - WALL_T})
rect("Roof_Par_N", wx0, Z0, IN_X1, IN_Z0, ROOF2, 1.1, P["wall_out"], col=True)
rect("Roof_Par_E", IN_X1, Z0, X1, N_OUT, ROOF2, 1.1, P["wall_out"], col=True)
rect("Roof_Par_W", wx0 - WALL_T, IN_Z0, wx0, N_OUT - WALL_T, ROOF2, 1.1, P["wall"], col=True)
hx, hz = wx0 + 20.0, (IN_Z0 + N_OUT) / 2
ctx.cyl("Roof_Helipad", hx, hz, ROOF2, 5.0, 0.05, P["helipad"], seg=24)
ctx.cyl("Roof_HelipadRing", hx, hz, ROOF2 + 0.05, 5.0, 0.02, P["hmark"], seg=24)
ctx.cyl("Roof_HelipadInner", hx, hz, ROOF2 + 0.06, 4.6, 0.02, P["helipad"], seg=24)
text("Roof_H", "H", hx, hz + 1.2, ROOF2 + 0.08, 2.4, P["hmark"], 0.0).rotation_euler = (0.0, 0.0, 0.0)
for i, gx in enumerate((wx0 + 4.0, wx0 + 8.0)):
    box(f"Roof_AC{i}", gx, wz0 + 4.0, ROOF2, 2.2, 1.6, 1.3, P["metal"], bevel=0.03, col=True)
rect("Roof_StairHead", sb["maxX"] - 3.0, sb["minZ"] - 0.6, sb["maxX"] + 0.2, sb["maxZ"] + 0.6, ROOF2 + 2.6, 0.2, P["metal"])
for z in (sb["minZ"] - 0.6, sb["maxZ"] + 0.6):
    rect(f"Roof_StairHeadWall{int(z)}", sb["maxX"] - 3.0, z - 0.05, sb["maxX"] + 0.2, z + 0.05, ROOF2, 2.6, P["wall_out"], col=True)

# ---------------------------------------------------------------- main entrance: glass facade between the outer rows, doors, canopy, name, opaque wall behind the upper glass
for z0, z1 in ((-ENTRANCE_HW, -5.5), (5.5, ENTRANCE_HW)):
    rect(f"Entrance_Low{int(z0)}", X1 - 0.4, z0, X1, z1, 0.0, 0.4, P["wall_out"], col=True)
    rect(f"Entrance_Glass{int(z0)}", X1 - 0.3, z0, X1 - 0.2, z1, 0.4, ROOF2 - 0.4, P["glass"], col=True)
for z0, z1 in ((-5.5, -2.5), (-2.5, 2.5), (2.5, 5.5)):
    rect(f"Entrance_Transom{int(z0)}", X1 - 0.3, z0, X1 - 0.2, z1, 2.8, ROOF2 - 2.8, P["glass"])
    rect(f"Entrance_Head{int(z0)}", X1 - 0.45, z0, X1 - 0.05, z1, 2.6, 0.2, P["dark"])
for zz in (-5.42, -2.5, 2.5, 5.42):
    rect(f"Entrance_Jamb{int(zz * 10)}", X1 - 0.45, zz - 0.08, X1 - 0.05, zz + 0.08, 0.0, 2.6, P["dark"], col=True)
rect("Entrance_Mullion", X1 - 0.28, -ENTRANCE_HW + 0.03, X1 - 0.1, ENTRANCE_HW - 0.03, L1_Y, 0.3, P["dark"])
rect("Entrance_UpperWall", X1 - 0.7, -ENTRANCE_HW, X1 - 0.4, ENTRANCE_HW, L1_Y + 0.3, ROOF2 - L1_Y - 0.3, P["wall"])
rect("Entrance_Canopy", X1 - 0.5, -ENTRANCE_HW - 1.0, X1 + 5.0, ENTRANCE_HW + 1.0, 4.2, 0.35, P["dark"])
for i, gz in enumerate((-ENTRANCE_HW + 0.5, ENTRANCE_HW - 0.5)):
    ctx.cyl(f"Entrance_Post{i}", X1 + 4.6, gz, 0.0, 0.15, 4.2, P["dark"], seg=8, col=True)
rect("Entrance_SignBoard", X1 - 0.2, -11.0, X1 + 0.3, 11.0, 7.0, 2.2, P["band"])
text("Entrance_Name", "COVE PARKVIEW MALL", X1 + 0.35, 0.0, 7.5, 1.2, P["neon"], math.pi / 2)
text("Entrance_Welcome", "WELCOME", X1 - 0.5, 0.0, 4.7, 0.5, P["sign"], -math.pi / 2)

# ---------------------------------------------------------------- forecourt, avenue from the hedge gate, parking lot, bus shelter, aprons behind the anchors
FORE = (X1, X1 + 14.0, -14.0, 14.0)
rect("Fore_Paving", FORE[0], FORE[2], FORE[1], FORE[3], -0.1, 0.1, P["paving"], tile=2.0)
for i, gz in enumerate((-11.0, 11.0)):
    ctx.planter(f"Fore_Planter{i}", X1 + 8.0, gz, 3.0, 1.2)
    ctx.bench(f"Fore_Bench{i}", X1 + 11.5, gz, math.pi / 2 if gz > 0 else -math.pi / 2)
    ctx.lamp(f"Fore_Lamp{i}", X1 + 3.0, gz, 4.0)
box("Fore_Totem", X1 + 12.5, -6.0, 0.0, 0.6, 2.4, 7.0, P["band"], col=True)
box("Fore_TotemTop", X1 + 12.5, -6.0, 7.0, 0.8, 2.8, 1.6, P["dark"])
for dx, yaw in ((0.36, math.pi / 2), (-0.36, -math.pi / 2)):
    text(f"Fore_TotemText{int(dx * 100)}", "COVE PARKVIEW", X1 + 12.5 + dx, -6.0, 5.2, 0.42, P["sign"], yaw)
    text(f"Fore_TotemText2{int(dx * 100)}", "MALL", X1 + 12.5 + dx, -6.0, 4.4, 0.6, P["neon"], yaw)
for i in range(4):
    box(f"Fore_BikeRack{i}", X1 + 10.0 + i * 0.8, 9.0, 0.0, 0.08, 1.2, 0.8, P["metal"])
cols.add("Fore_BikeRacks", X1 + 11.2, 9.0, 0.0, 3.2, 1.3, 0.8)
HEDGE_GATE = {"x": -44.6, "z": -12.0, "width": 11.0}
AVENUE = [(HEDGE_GATE["x"] - 0.5, HEDGE_GATE["z"]), (-118.0, -12.0), (FORE[1] + 0.4, -8.0)]
ROAD_W, WALK_W = 7.0, 1.8
for i, ((ax, az), (bx, bz)) in enumerate(zip(AVENUE, AVENUE[1:])):
    cx, cz = (ax + bx) / 2, (az + bz) / 2
    seg = math.hypot(bx - ax, bz - az)
    dx, dz = (bx - ax) / seg, (bz - az) / seg
    nx, nz = -dz, dx
    yaw = -math.atan2(bz - az, bx - ax)
    box(f"Avenue_Road{i}", cx, cz, 0.0, seg + 0.8, ROAD_W, 0.03, P["service"], rot=yaw, tile=3.0)
    for side in (-1, 1):
        off = ROAD_W / 2 + WALK_W / 2
        box(f"Avenue_Walk{i}_{side + 1}", cx + side * nx * off, cz + side * nz * off, 0.0, seg + 0.8, WALK_W, 0.1, P["paving"], rot=yaw, tile=2.0)
        box(f"Avenue_Curb{i}_{side + 1}", cx + side * nx * (ROAD_W / 2 - 0.08), cz + side * nz * (ROAD_W / 2 - 0.08), 0.03, seg + 0.76, 0.16, 0.12, P["stone"], rot=yaw)
    for k in range(int(seg / 6)):
        t = 3.0 + k * 6.0
        box(f"Avenue_Dash{i}_{k}", ax + dx * t, az + dz * t, 0.03, 2.0, 0.14, 0.02, P["soon"], rot=yaw)
    for k, t in enumerate(range(6, int(seg) - 3, 12)):
        side = 1 if k % 2 else -1
        off = ROAD_W / 2 + WALK_W + 0.7
        ctx.lamp(f"Avenue_Lamp{i}_{k}", ax + dx * t + side * nx * off, az + dz * t + side * nz * off, 4.0)
        if 10 < t < seg - 10:
            ctx.tree("round" if k % 3 else "pine", ax + dx * (t + 6) - side * nx * (off + 1.5), az + dz * (t + 6) - side * nz * (off + 1.5), 1.0)
    for k, t in enumerate(range(18, int(seg) - 6, 24)):
        ctx.bench(f"Avenue_Bench{i}_{k}", ax + dx * t + nx * (ROAD_W / 2 + WALK_W + 0.4), az + dz * t + nz * (ROAD_W / 2 + WALK_W + 0.4), yaw + math.pi)
        ctx.bin_(f"Avenue_Bin{i}_{k}", ax + dx * (t + 2.2) + nx * (ROAD_W / 2 + WALK_W + 0.4), az + dz * (t + 2.2) + nz * (ROAD_W / 2 + WALK_W + 0.4))
tx, tz = HEDGE_GATE["x"] - 3.0, HEDGE_GATE["z"] - ROAD_W / 2 - WALK_W - 1.6
box("Avenue_TotemPost", tx, tz, 0.0, 0.4, 0.4, 5.0, P["band"], col=True)
box("Avenue_TotemBoard", tx, tz, 2.6, 0.5, 3.4, 1.6, P["dark"])
for dx, yaw, a, b in ((0.26, math.pi / 2, "COVE PARKVIEW MALL", "< 2 MIN WALK"), (-0.26, -math.pi / 2, "COVE PARKVIEW MALL", "TOWN >")):
    text(f"Avenue_TotemText{int(dx * 100)}", a, tx + dx, tz, 3.4, 0.36, P["neon"], yaw)
    text(f"Avenue_TotemText2{int(dx * 100)}", b, tx + dx, tz, 2.85, 0.3, P["sign"], yaw)
PX0, PX1, PZ0, PZ1 = -140.0, -100.0, -34.0, -19.0
rect("Parking_Asphalt", PX0, PZ0, PX1, PZ1, -0.09, 0.1, P["service"], tile=3.0)
rect("Parking_Entry", -124.0, PZ1, -116.0, -12.0 - ROAD_W / 2 - WALK_W, -0.09, 0.1, P["service"], tile=3.0)
rect("Parking_Kerb", PX0, PZ0 - 0.3, PX1, PZ0, 0.0, 0.14, P["stone"], col=True)
for k in range(15):
    x = PX0 + 1.0 + k * 2.7
    rect(f"Parking_LineN{k}", x - 0.06, PZ0 + 0.3, x + 0.06, PZ0 + 5.3, 0.01, 0.02, P["soon"])
    rect(f"Parking_LineS{k}", x - 0.06, PZ1 - 5.3, x + 0.06, PZ1 - 0.3, 0.01, 0.02, P["soon"])
CAR_COLORS = (P["red"], P["blue"], P["yellow"], P["dark"], P["wall"], P["pink"], P["band"])
for k, (bay, north) in enumerate(((1, True), (3, True), (6, True), (9, False), (11, True), (2, False), (13, False))):
    gx = PX0 + 1.0 + bay * 2.7 + 1.35
    gz = PZ0 + 2.8 if north else PZ1 - 2.8
    box(f"Car{k}_Body", gx, gz, 0.3, 1.8, 4.2, 0.6, CAR_COLORS[k % len(CAR_COLORS)], bevel=0.06)
    box(f"Car{k}_Cabin", gx, gz + (0.2 if north else -0.2), 0.9, 1.6, 2.0, 0.6, P["glass"], bevel=0.08)
    for wx, wz in ((-0.85, -1.3), (0.85, -1.3), (-0.85, 1.3), (0.85, 1.3)):
        add(L.cyl(coll, f"Car{k}_Wheel{int(wx * 10)}{int(wz * 10)}", gx + wx, gz + wz, 0.3, 0.3, 0.22, P["dark"], seg=10)).rotation_euler = (0.0, math.pi / 2, 0.0)
    cols.add(f"Car{k}", gx, gz, 0.0, 2.0, 4.4, 1.5)
box("Parking_SignPost", PX1 + 1.0, PZ1 - 1.0, 0.0, 0.12, 0.12, 2.6, P["steel"], col=True)
box("Parking_SignBoard", PX1 + 1.0, PZ1 - 1.0, 2.0, 0.08, 0.9, 0.9, P["blue"])
text("Parking_SignText", "P", PX1 + 1.05, PZ1 - 1.0, 2.15, 0.6, P["sign"], math.pi / 2)
BUS = (FORE[1] + 4.0, -12.0 - ROAD_W / 2 - WALK_W - 1.8)
box("Bus_Roof", BUS[0], BUS[1], 2.5, 4.4, 1.6, 0.12, P["dark"])
box("Bus_Back", BUS[0], BUS[1] - 0.7, 0.0, 4.08, 0.06, 2.5, P["glass"], col=True)
for gx in (BUS[0] - 2.1, BUS[0] + 2.1):
    box(f"Bus_Side{int(gx)}", gx, BUS[1], 0.0, 0.06, 1.5, 2.5, P["glass"], col=True)
ctx.bench("Bus_Bench", BUS[0], BUS[1] - 0.3, 0.0)
box("Bus_SignBoard", BUS[0] + 2.4, BUS[1] + 0.6, 2.0, 0.6, 0.06, 0.6, P["yellow"])
box("Bus_SignPost", BUS[0] + 2.4, BUS[1] + 0.6, 0.0, 0.08, 0.08, 2.0, P["steel"], col=True)
text("Bus_SignText", "BUS", BUS[0] + 2.4, BUS[1] + 0.64, 2.15, 0.3, P["dark"], 0.0)
for a in ANCHORS:
    depth = a["ext"]["footprint"][1]
    lo, hi = a["x0"] - 6.0, a["x1"] + 6.0
    if a["rotationY"] == 0.0:
        rect(f"Apron_{a['key']}", lo, Z0 - depth - 4.0, hi, Z0, -0.11, 0.1, P["service"], tile=3.0)
    else:
        rect(f"Apron_{a['key']}", lo, Z1, hi, Z1 + depth + 4.0, -0.11, 0.1, P["service"], tile=3.0)

# ---------------------------------------------------------------- exclusion zones for the decor, then the decor itself
for i, (x0, z0, x1, z1) in enumerate(ESC):
    ctx.exclude(x0, z0, x1, z1, f"escalator {i}")
for a in ANCHORS:
    f = a["front_z"]
    ctx.exclude(a["x0"] - 4.0, min(f, f + (4.0 if a["rotationY"] == 0.0 else -4.0)), a["x1"] + 4.0, max(f, f + (4.0 if a["rotationY"] == 0.0 else -4.0)), f"store {a['key']}")
ctx.exclude(W_OUT, S_IN, P_UP[0], S_IN + 4.0, "food court counters")
ctx.exclude(W_OUT, S_OUT - 4.0, P_UP[0], S_OUT, "food court counters")
for x0, z0, x1, z1 in ((P_UP[0], BAL_P_OUT, -186.0, BAL_P_IN), (-174.0, BAL_P_OUT, P_UP[1], BAL_P_IN), (BAL_E_IN, PARK[2], BAL_E_OUT, -6.0), (BAL_E_IN, 6.0, BAL_E_OUT, 11.5), (BAL_E_IN, 16.5, BAL_E_OUT, PARK[3]),
                       (BAL_W_OUT, PARK[2], BAL_W_IN, -23.0), (BAL_W_OUT, 23.0, BAL_W_IN, PARK[3])):
    pass
ctx.exclude(-174.0, -ENTRANCE_HW, X1, ENTRANCE_HW, "entrance axis")
for x0, z0, x1, z1 in ((EXIT_X[0] - 5.0, N_IN - 5.0, EXIT_X[1] + 5.0, N_IN), (EXIT_X[0] - 5.0, S_IN, EXIT_X[1] + 5.0, S_IN + 5.0), (W_IN, EXIT_Z[0] - 5.0, W_IN + 5.0, EXIT_Z[1] + 5.0), (E_IN - 5.0, EXIT_Z[0] - 5.0, E_IN, EXIT_Z[1] + 5.0)):
    ctx.exclude(x0, z0, x1, z1, "park gate")
M = types.SimpleNamespace(X0=X0, X1=X1, Z0=Z0, Z1=Z1, SVC=SVC, OUTER=OUTER, WALK=WALK, INNER=INNER, RING=RING, PARK=PARK, CELL_H=CELL_H, L1_Y=L1_Y, SLAB_T=SLAB_T,
                          ROOF1=ROOF1, ROOF2=ROOF2, BAL=BAL, WALL_T=WALL_T, N_OUT=N_OUT, N_IN=N_IN, S_OUT=S_OUT, S_IN=S_IN, W_OUT=W_OUT, W_IN=W_IN, E_OUT=E_OUT, E_IN=E_IN,
                          ENTRANCE_HW=ENTRANCE_HW, EXIT_W=EXIT_W, NOTCH=NOTCH, WARE=WARE, DOCK_X=DOCK_X, P_UP=P_UP, CATS=CATS, CAT_MATS=CAT_MATS, ANCHORS=ANCHORS,
                          cells=cells, cell_stores=cell_stores, stairs=stairs, l1_rects=l1_rects, rnd=rnd)
mall_decor.build(ctx, M)

# ---------------------------------------------------------------- checks, merge, export
bad = L.check_grounded(objs, allow=("Floor", "Roof", "Slab", "Svc", "Outer_", "Return_", "Lintel_", "Spandrel_", "Cell_", "Partition_", "Pilaster_", "Back_", "Bulkhead_", "Corner_",
                                   "Gable_", "Exit", "Entrance_", "Rail_", "Esc_", "Pillar_", "BalLight_", "Truss_", "Ware_", "Sec_", "Stair_", "ParkWall_", "Notch_", "Dock_", "Apron_",
                                   "Fore_", "Avenue_", "Parking_", "Car", "Bus_", "MT_", "Deco_", "Dress_", "Site_", "Park_", "FC_", "AF_", "Play_", "Kiosk_", "Banner_", "Way_",
                                   "Sign_", "Directory_", "Info_", "Sculpture_", "Fountain_", "Bench_", "Planter_", "Bin_", "Lamp", "Bulb", "Mall_"))
print("MALL grounded violations:", bad[:10], len(bad))
ctx.report(show=400)

STRUCTURE_NODES = ("Floor", "Slab", "Roof", "Outer_", "Return_", "Lintel_", "Spandrel_", "Partition_", "Pilaster_", "Back_", "Bulkhead_", "Corner_", "Gable_", "Cell_",
                   "Exit", "Entrance_", "Rail_", "Esc_", "Pillar_", "Truss_", "Ware_", "Svc_", "ParkWall_", "Notch_", "Dock_", "Apron_", "Stair_", "Fore_Paving", "Avenue_Road",
                   "Avenue_Walk", "Avenue_Curb", "Parking_Asphalt", "Parking_Entry", "Parking_Kerb", "Bus_")
by_mat = {}
merged = []
for o in objs:
    if o.name.startswith(STRUCTURE_NODES):
        merged.append(o)
        continue
    m = o.data.materials[0].name if o.type == "MESH" and o.data.materials else "none"
    by_mat.setdefault(m, []).append(o)
for m, group in by_mat.items():
    merged.append(L.join(coll, f"Mall_{m}", group) if len(group) > 1 else group[0])

levels = [
    {"id": "L0", "y": 0.0, "height": L1_Y, "rects": [{"minX": X0 - 40.0, "maxX": X1 + 16.0, "minZ": Z0 - 45.0, "maxZ": Z1 + 45.0},
                                                       {"minX": X1 + 14.0, "maxX": HEDGE_GATE["x"] + 1.0, "minZ": PZ0 - 2.0, "maxZ": -4.0}]},
    {"id": "L1", "y": L1_Y, "height": CELL_H, "rects": [{k: round(v, 3) for k, v in r.items()} for r in l1_rects]},
    {"id": "L2", "y": ROOF2, "height": 4.0, "rects": [{k: round(v, 3) for k, v in r.items()} for r in l2_rects]},
]
layout = {
    "version": 1, "key": "mall", "name": "Cove Parkview Mall",
    "bounds": {"minX": X0 - 40.0, "maxX": HEDGE_GATE["x"] + 2.0, "minZ": Z0 - 45.0, "maxZ": Z1 + 45.0},
    "music": {"minX": X0 - 2.0, "maxX": FORE[1] + 2.0, "minZ": Z0 - 2.0, "maxZ": Z1 + 2.0},
    "entrance": {"position": [X1, 0.0, 0.0], "yaw": -math.pi / 2, "width": 2 * ENTRANCE_HW},
    "hedgeGate": HEDGE_GATE,
    "avenue": {"points": [[round(x, 3), round(z, 3)] for x, z in AVENUE], "roadWidth": ROAD_W, "parking": {"minX": PX0, "maxX": PX1, "minZ": PZ0, "maxZ": PZ1}},
    "levels": levels,
    "stairs": [{k: (round(v, 3) if isinstance(v, float) else v) for k, v in s.items()} for s in stairs],
    "plazas": [{"id": k, "name": v["name"], "bounds": {"minX": v["bounds"][0], "maxX": v["bounds"][1], "minZ": v["bounds"][2], "maxZ": v["bounds"][3]},
                "floors": v["floors"], "roof": v["roof"], "outdoor": v["outdoor"]} for k, v in PLAZAS.items()],
    "cells": cells,
    "stores": [{"key": a["key"], "name": a["name"], "category": a["category"], "plaza": a["plaza"],
                "position": [a["x"], 0.0, round(a["z"], 3)], "rotationY": a["rotationY"]} for a in ANCHORS] + cell_stores,
    "links": LINKS,
    "backstage": {
        "serviceCorridors": [{"minX": X0, "maxX": X1, "minZ": Z0, "maxZ": Z0 + SVC}, {"minX": X0, "maxX": X1, "minZ": Z1 - SVC, "maxZ": Z1}, {"minX": X0, "maxX": X0 + SVC, "minZ": Z0, "maxZ": Z1}],
        "warehouse": {"minX": wx0 + 12.0, "maxX": wx1, "minZ": wz0, "maxZ": wz1},
        "securityRoom": {"minX": wx0, "maxX": wx0 + 12.0, "minZ": wz0, "maxZ": wz1},
        "loadingDock": {"minX": DOCK_X[0] - 2.0, "maxX": DOCK_X[1] + 8.0, "minZ": Z0 - 4.5, "maxZ": Z0},
        "roofTerrace": {"minX": wx0, "maxX": wx1, "minZ": wz0, "maxZ": wz1, "y": ROOF2},
        "roofAccess": "Stair_roof_a",
    },
}
L.write_json(os.path.join(OUT, "mall.layout.json"), layout)
L.export_glb(os.path.join(OUT, "mall.glb"), merged)
L.export_glb(os.path.join(OUT, "mall.colsrc.glb"), merged + cols.items)
L.snapshot(sc, os.path.join(OUT, "preview_entrance.png"), (-150.0, 6.0, 30.0), (-185.0, 4.0, 0.0), lens=22, res=(960, 640))
L.snapshot(sc, os.path.join(OUT, "preview_plaza.png"), (-180.0, 1.7, 40.0), (-180.0, 3.0, -20.0), lens=18, res=(960, 640))
L.snapshot(sc, os.path.join(OUT, "preview_park.png"), (-205.0, 1.7, 2.0), (-270.0, 6.0, 0.0), lens=20, res=(960, 640))
L.snapshot(sc, os.path.join(OUT, "preview_aerial.png"), (-120.0, 140.0, 160.0), (-270.0, 0.0, 0.0), lens=24, res=(960, 640))
L.snapshot(sc, os.path.join(OUT, "preview_paradise_l1.png"), (-212.0, 7.7, -64.0), (-290.0, 7.0, -72.0), lens=20, res=(960, 640))
L.snapshot(sc, os.path.join(OUT, "preview_north.png"), (-310.0, 1.7, -66.0), (-360.0, 3.0, -74.0), lens=18, res=(960, 640))
tris = sum(len(p.vertices) - 2 for o in merged if o.type == "MESH" for p in o.data.polygons)
print("mall:", len(objs), "objects ->", len(merged), "nodes,", tris, "tris,", len(cols.items), "collision boxes,", len(cells), "cells,", len(stairs), "stairs,", ctx.texts, "texts,",
      len(cell_stores), "cell stores", [c["position"] for c in cell_stores], "decor skipped:", len(mall_decor.SKIPPED))
