"""Cove Parkview Mall: the big shopping centre west of the Cove Clinic (docs/MALL.md). A ring of plazas around an
outdoor Leisure Park, two levels in three plazas, a food court, back-of-house corridors, a warehouse with a roof
terrace, the forecourt and the path from the clinic. Every shop cell is a closed shopfront described in
mall.layout.json (category, name, status) so it can be opened later; the three anchors (Northline, Hearth & Hollow,
GreenCart) are separate `store` buildings whose facade sits flush with the cell fronts.

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

import bmesh

if "__file__" not in globals():
    raise RuntimeError('Run with exec(open(p).read(), {"__file__": p}) so the script can find lib_common.py')
HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import lib_common as L
importlib.reload(L)
import bpy

OUT = os.path.join(L.OUT_ROOT, "store", "mall")
X0, X1, Z0, Z1 = -380.0, -160.0, -90.0, 90.0
SVC, OUTER, WALK, INNER = 2.5, 9.5, 16.0, 12.0
RING = SVC + OUTER + WALK + INNER
PARK = (X0 + RING, X1 - RING, Z0 + RING, Z1 - RING)
CELL_H = 4.8
L1_Y = 6.0
SLAB_T = 0.4
ROOF1 = 7.6
ROOF2 = 11.6
BAL = 5.0
WALL_T = 0.3
RAMP_RUN = 10.4
RAMP_W = 1.4
LANDING = 2.0
EXIT_W = 10.0
ENTRANCE_HW = 8.0
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
# cells that are real walk-in stores (built by their own script, placed by apply-mall.mjs): name -> store key
CELL_STORES = {"Crispin's Hardware": "crispins_hardware", "Candy Cloud": "candy_cloud", "Summit Sports": "summit_sports"}
# rows: (plaza, list of (name, category, status)); the generator spreads the cells evenly over each segment
ROWS = {
    # north wing, outer row (front z = -78), west -> east, split by GreenCart, the dock passage, Hearth & Hollow and the warehouse
    "N_out_a": ("north_plaza", [("Crispin's Hardware", "hardware", O_)]),
    "N_out_b": ("north_plaza", [("Staff", "services", S_), ("Unit N12", "pet", C_), ("Quick Cuts", "services", P_), ("Fresh Press Juice", "cafe", P_), ("Paper Trail", "gifts", P_)]),
    "N_out_c": ("paradise", [("Starlight Cinema", "cinema", P_), ("Page Turner Books", "books", P_), ("Vinyl Vault", "music", P_)]),
    "N_out_d": ("paradise", [("Kokoro Toys", "toys", P_), ("Volt Electronics", "electronics", P_), ("Shutter Speed Cameras", "camera", P_)]),
    # north wing, inner row (front z = -62), west -> east, park exit in the middle of Paradise
    "N_in_a": ("north_plaza", [("Cove Pharmacy", "pharmacy", P_), ("Unit N21", "services", C_)]),
    "N_in_b": ("paradise", [("Tiny Tots", "clothing_kids", P_), ("Blush Bar", "cosmetics", P_), ("Gilt & Glow", "jewelry", P_), ("Pocket Gadgets", "phones", P_)]),
    "N_in_c": ("paradise", [("Velvet Lane", "clothing_women", P_), ("Brickroad Men's", "clothing_men", P_), ("Sole Society", "shoes", P_), ("Curio Cabinet", "gifts", P_)]),
    # south wing, outer row (front z = 78): food court counters, then Al Fresca split by Northline
    "S_out_a": ("food_court", [("Burger Barony", "fast_food", P_), ("Mamma Lucia's", "restaurant", P_), ("Taco Tempo", "fast_food", P_), ("Wok This Way", "fast_food", P_), ("Dough Re Mi Pizza", "fast_food", P_), ("Staff", "services", S_)]),
    "S_out_b": ("al_fresca", [("Summit Sports", "clothing_sport", O_, 2.0), ("Spectacle Eyewear", "eyewear", P_)]),
    "S_out_c": ("al_fresca", [("Mae & Fern", "clothing_women", P_), ("Gentleman's Quarter", "clothing_men", P_), ("Paws & Claws", "pet", P_), ("Staff", "services", S_)]),
    # south wing, inner row (front z = 62): food court sweets, then Al Fresca with the park gate
    "S_in_a": ("food_court", [("Bean There", "cafe", P_), ("Scoop Dreams", "ice_cream", P_), ("Golden Crust", "bakery", P_)]),
    "S_in_b": ("al_fresca", [("Casa Verde", "home_decor", P_), ("Rivermouth Jewels", "jewelry", P_), ("Stride Runners", "clothing_sport", P_), ("Lens & Light", "camera", P_)]),
    "S_in_c": ("al_fresca", [("Harbor Lane Kids", "clothing_kids", P_), ("Saffron Table", "restaurant", P_), ("Chapter Two Books", "books", P_), ("Pearl Street", "clothing_luxury", P_)]),
    # west wing (Wonderland), outer row (front x = -368), north -> south ; inner row (front x = -352) with the park exit
    "W_out_a": ("wonderland", [("Pixel Palace Arcade", "arcade", P_), ("Staff", "services", S_), ("Kiddo Corner", "clothing_kids", P_), ("Rocket Toys", "toys", P_), ("Homerunner Sports", "sports", P_)]),
    "W_out_b": ("wonderland", [("Candy Cloud", "sweets", O_), ("Little Lens", "eyewear", P_), ("Playbox Games", "electronics", P_), ("Staff", "services", S_)]),
    "W_in_a": ("wonderland", [("Wonder Jewels", "jewelry", P_), ("Casual Corner", "clothing_women", P_), ("Fanfare Fashion", "clothing_women", P_), ("Shoes of a Lifetime", "shoes", P_)]),
    "W_in_b": ("wonderland", [("Modern Gent", "clothing_men", P_), ("Run Like Wind", "clothing_sport", P_), ("Petal & Pot", "gifts", P_), ("Sir Read-a-lot", "books", P_)]),
    # east wing (Entrance), outer row (front x = -172) split by the main entrance ; inner row (front x = -188) with the park exit
    "E_out_a": ("entrance", [("Refined Class", "clothing_women", P_), ("The Distinguished Man", "clothing_men", P_), ("Fashion Fiesta", "clothing_women", P_), ("Space Kids", "clothing_kids", P_)]),
    "E_out_b": ("entrance", [("Rafael's Shoes", "shoes", P_), ("Everyone Luvs Books", "books", P_), ("Special Gifts", "jewelry", P_), ("Outta Sight Optics", "eyewear", P_)]),
    "E_in_a": ("entrance", [("Emerald Row", "jewelry", P_), ("Jamming Juvenile", "clothing_kids", P_), ("Robsaka Digital", "electronics", P_), ("Mall Services", "services", P_)]),
    "E_in_b": ("entrance", [("Wallington's", "clothing_men", P_), ("Ladies' Space", "clothing_women", P_), ("The Shoehorn", "shoes", P_), ("Kathy's Boutique", "clothing_luxury", P_)]),
    # upper floors (level 1): Entrance, Paradise (x -300..-200), Wonderland
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

# ---------------------------------------------------------------- scene + materials
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

objs = []
texts = 0


def add(o):
    objs.append(o)
    return o


def rect(name, x0, z0, x1, z1, y0, h, mat, col=False, tile=2.0):
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
    sx, sz = abs(x1 - x0), abs(z1 - z0)
    o = add(L.box(coll, name, cx, cz, y0, sx, sz, h, mat, tile=tile))
    if col:
        cols.add(name, cx, cz, y0, sx, sz, h)
    return o


def text(name, body, gx, gz, y0, size, mat, yaw):
    global texts
    texts += 1
    cu = bpy.data.curves.new(name + "_cu", "FONT")
    cu.body = body
    cu.size = size
    cu.extrude = 0.0
    cu.resolution_u = 1
    cu.align_x = "CENTER"
    cu.align_y = "BOTTOM"
    tmp = bpy.data.objects.new(name + "_tmp", cu)
    coll.objects.link(tmp)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    coll.objects.unlink(tmp)
    bpy.data.objects.remove(tmp)
    bpy.data.curves.remove(cu)
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    ob.rotation_euler = (math.pi / 2, 0, yaw)
    ob.location = L.b(gx, gz, y0)
    coll.objects.link(ob)
    return add(ob)


def wedge(name, x0, z0, x1, z1, y_lo, y_hi, rise, mat):
    """A ramp: footprint [x0,x1]x[z0,z1], height y_lo at the low edge and y_hi at the high edge; `rise` is the
    direction of climb ('+x', '-x', '+z', '-z'). Origin center-bottom like the other helpers."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
    hx, hz = (x1 - x0) / 2, (z1 - z0) / 2

    def h(x, z):
        t = {"+x": (x + hx) / (2 * hx), "-x": (hx - x) / (2 * hx), "+z": (z + hz) / (2 * hz), "-z": (hz - z) / (2 * hz)}[rise]
        return y_lo + (y_hi - y_lo) * t
    corners = [(-hx, -hz), (hx, -hz), (hx, hz), (-hx, hz)]
    bottom = [bm.verts.new((x, -z, 0.0)) for x, z in corners]
    top = [bm.verts.new((x, -z, h(x, z))) for x, z in corners]
    bm.faces.new(reversed(bottom))
    bm.faces.new(top)
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((bottom[i], bottom[j], top[j], top[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for l in f.loops:
            l[uv].uv = (l.vert.co.x / 2.0, (l.vert.co.y + l.vert.co.z) / 2.0)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    ob.location = L.b(cx, cz, 0.0)
    coll.objects.link(ob)
    return add(ob)


def blob(name, gx, gz, y0, r, mat, sy=1.0):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r)
    for v in bm.verts:
        v.co.x += rnd.uniform(-0.14, 0.14) * r
        v.co.y += rnd.uniform(-0.14, 0.14) * r
        v.co.z = (v.co.z + rnd.uniform(-0.14, 0.14) * r) * sy
    zmin = min(v.co.z for v in bm.verts)
    for v in bm.verts:
        v.co.z -= zmin
    bm.normal_update()
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for l in f.loops:
            l[uv].uv = (l.vert.co.x, l.vert.co.z)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    ob.location = L.b(gx, gz, y0)
    coll.objects.link(ob)
    return add(ob)


def walls_along(name, axis, fixed, a0, a1, y0, h, mat, thick=WALL_T, step=50.0, col=True):
    """A long wall split into <= `step` m pieces so the collision extractor keeps every piece."""
    n = max(1, int(math.ceil((a1 - a0) / step)))
    for i in range(n):
        p0 = a0 + (a1 - a0) * i / n
        p1 = a0 + (a1 - a0) * (i + 1) / n
        if axis == "x":
            rect(f"{name}_{i}", p0, fixed - thick / 2, p1, fixed + thick / 2, y0, h, mat, col=col)
        else:
            rect(f"{name}_{i}", fixed - thick / 2, p0, fixed + thick / 2, p1, y0, h, mat, col=col)


def tree(kind, gx, gz, s=1.0):
    i = tree_n[0] = tree_n[0] + 1
    if kind == "pine":
        add(L.cyl(coll, f"MT_Pine{i:03d}_Trunk", gx, gz, 0.0, 0.18 * s, 1.2 * s, P["trunk"], seg=6))
        for k, (r1, h0, hh) in enumerate(((1.5, 0.9, 1.9), (1.15, 2.1, 1.7), (0.8, 3.2, 1.6))):
            add(L.cone(coll, f"MT_Pine{i:03d}_Tier{k}", gx, gz, h0 * s, r1 * s, 0.05 * s, hh * s, P["pine"], seg=7))
    else:
        add(L.cone(coll, f"MT_Tree{i:03d}_Trunk", gx, gz, 0.0, 0.2 * s, 0.12 * s, 1.9 * s, P["trunk"], seg=6))
        leaves = P["blossom"] if kind == "blossom" else None
        for k in range(3):
            a = rnd.uniform(0, TWO_PI)
            o = rnd.uniform(0.2, 0.7) * s
            blob(f"MT_Tree{i:03d}_Leaf{k}", gx + o * math.cos(a), gz + o * math.sin(a), rnd.uniform(1.5, 2.3) * s, rnd.uniform(0.85, 1.25) * s,
                 leaves or rnd.choice((P["leaf"], P["leaf2"])), sy=0.85)
    cols.add(f"Mall_Tree{i:03d}", gx, gz, 0.0, 0.6, 0.6, 3.0)


tree_n = [0]


def bench(name, gx, gz, rot):
    add(L.furn(coll, name, gx, gz, rot, [
        (-0.7, 0, 0.0, 0.08, 0.4, 0.42, P["steel"]), (0.7, 0, 0.0, 0.08, 0.4, 0.42, P["steel"]),
        (0, 0, 0.42, 1.7, 0.45, 0.06, P["wood"], 0.01), (0, 0.2, 0.48, 1.7, 0.06, 0.4, P["wood"], 0.01)]))
    cols.add(name, gx, gz, 0.0, 1.7, 0.5, 0.9, rot=rot)


def planter(name, gx, gz, w=1.6, d=0.7, flowers=True):
    add(L.box(coll, f"{name}_Box", gx, gz, 0.0, w, d, 0.55, P["band"], bevel=0.02))
    add(L.box(coll, f"{name}_Leaf", gx, gz, 0.55, w - 0.2, d - 0.2, 0.3, P["leaf"], bevel=0.08))
    if flowers:
        add(L.box(coll, f"{name}_Flower", gx, gz, 0.78, w - 0.5, d - 0.4, 0.1, rnd.choice((P["flower"], P["flower2"], P["pink"])), bevel=0.04))
    cols.add(name, gx, gz, 0.0, w, d, 0.6)


def lamp(name, gx, gz, h=4.0):
    add(L.cyl(coll, f"{name}_Pole", gx, gz, 0.0, 0.07, h, P["steel"], seg=6))
    add(L.box(coll, f"{name}_Head", gx, gz, h, 0.5, 0.5, 0.3, P["lamp"], bevel=0.03))
    cols.add(name, gx, gz, 0.0, 0.3, 0.3, h)


def bin_(name, gx, gz):
    add(L.cyl(coll, f"{name}", gx, gz, 0.0, 0.28, 0.9, P["dark"], seg=8))
    cols.add(name, gx, gz, 0.0, 0.6, 0.6, 0.9)


def pillar(name, gx, gz, y0, h, r=0.35):
    add(L.cyl(coll, f"{name}", gx, gz, y0, r, h, P["wall"], seg=12))
    cols.add(name, gx, gz, y0, 2 * r + 0.1, 2 * r + 0.1, h)


def railing(name, axis, fixed, a0, a1, y0, gaps=()):
    """Glass balustrade with a steel handrail; `gaps` = [(g0, g1)] left open (escalator landings)."""
    pieces = []
    cur = a0
    for g0, g1 in sorted(gaps):
        if g0 - cur > 0.05:
            pieces.append((cur, g0))
        cur = g1
    if a1 - cur > 0.05:
        pieces.append((cur, a1))
    for i, (p0, p1) in enumerate(pieces):
        if axis == "x":
            rect(f"{name}_Glass{i}", p0, fixed - 0.03, p1, fixed + 0.03, y0 + 0.08, 0.95, P["glass"])
            rect(f"{name}_Rail{i}", p0, fixed - 0.05, p1, fixed + 0.05, y0 + 1.03, 0.07, P["rail"])
            rect(f"{name}_Base{i}", p0, fixed - 0.06, p1, fixed + 0.06, y0, 0.08, P["steel"])
            cols.add(f"{name}_{i}", (p0 + p1) / 2, fixed, y0, p1 - p0, 0.12, 1.1)
        else:
            rect(f"{name}_Glass{i}", fixed - 0.03, p0, fixed + 0.03, p1, y0 + 0.08, 0.95, P["glass"])
            rect(f"{name}_Rail{i}", fixed - 0.05, p0, fixed + 0.05, p1, y0 + 1.03, 0.07, P["rail"])
            rect(f"{name}_Base{i}", fixed - 0.06, p0, fixed + 0.06, p1, y0, 0.08, P["steel"])
            cols.add(f"{name}_{i}", fixed, (p0 + p1) / 2, y0, 0.12, p1 - p0, 1.1)


# ---------------------------------------------------------------- cells
cells = []
cell_stores = []
cell_n = {}


def cell_id(plaza):
    cell_n[plaza] = cell_n.get(plaza, 0) + 1
    return f"{plaza[0].upper()}{cell_n[plaza]:02d}"


def cell(row_key, plaza, name, category, status, axis, a0, a1, front, back, y0, level):
    """One shop cell: side walls, back wall, glass front between pilasters, fascia with the name. `axis` is the row
    direction ('x': cells side by side along x, facing +-z). front/back are the perpendicular coordinates."""
    cid = cell_id(plaza)
    depth = abs(back - front)
    sign = 1 if back > front else -1          # from the front line towards the back
    mid = (a0 + a1) / 2
    width = a1 - a0
    tag = f"Cell_{cid}"
    label, _ = CATS[category]
    if status == O_:
        key = CELL_STORES[name]
        door_offset = front + sign * 4.5
        if axis == "x":
            position, rot = [round(mid, 3), 0.0, round(door_offset, 3)], (0.0 if sign < 0 else math.pi)
        else:
            position, rot = [round(door_offset, 3), 0.0, round(mid, 3)], (math.pi / 2 if sign < 0 else -math.pi / 2)
        cell_stores.append({"key": key, "name": name, "category": category, "plaza": plaza, "position": position, "rotationY": round(rot, 6), "cell": cid})
        cells.append({"id": cid, "plaza": plaza, "level": level, "row": row_key, "category": category, "label": label, "name": name, "status": status, "store": key,
                      "bounds": bounds_of(axis, a0, a1, front, back), "front": front_of(axis, mid, front, sign, y0), "width": round(width, 3), "depth": round(depth, 3)})
        # the store shell is 0.2 m narrower than the cell and lower than CELL_H: fill the slits at its sides, close the
        # back towards the service corridor and the band between its roof and the slab, like a normal cell does
        if axis == "x":
            rect(f"{tag}_Back", a0, min(back, back - sign * WALL_T), a1, max(back, back - sign * WALL_T), y0, CELL_H, P["wall"], col=True)
            rect(f"{tag}_SideA", a0, min(front, back), a0 + 0.22, max(front, back), y0, CELL_H, P["wall"], col=True)
            rect(f"{tag}_SideB", a1 - 0.22, min(front, back), a1, max(front, back), y0, CELL_H, P["wall"], col=True)
            rect(f"{tag}_Ceiling", a0, min(front, back), a1, max(front, back), y0 + CELL_H - 0.1, 0.1, P["slab"])
            rect(f"{tag}_Band", a0, front - 0.12, a1, front + 0.12, y0 + 4.45, CELL_H - 4.45, P["wall"])
        else:
            rect(f"{tag}_Back", min(back, back - sign * WALL_T), a0, max(back, back - sign * WALL_T), a1, y0, CELL_H, P["wall"], col=True)
            rect(f"{tag}_SideA", min(front, back), a0, max(front, back), a0 + 0.22, y0, CELL_H, P["wall"], col=True)
            rect(f"{tag}_SideB", min(front, back), a1 - 0.22, max(front, back), a1, y0, CELL_H, P["wall"], col=True)
            rect(f"{tag}_Ceiling", min(front, back), a0, max(front, back), a1, y0 + CELL_H - 0.1, 0.1, P["slab"])
            rect(f"{tag}_Band", front - 0.12, a0, front + 0.12, a1, y0 + 4.45, CELL_H - 4.45, P["wall"])
        return
    if status == S_:
        # staff passage: floor, a door frame and the sign; the neighbours' side walls close it
        if axis == "x":
            if y0 == 0:
                rect(f"{tag}_Floor", a0, min(front, back), a1, max(front, back), 0.0, 0.01, P["service"])
            add(L.box(coll, f"{tag}_Frame", mid, front + sign * 0.15, y0, width, 0.3, 0.2, P["steel"]))
            add(L.box(coll, f"{tag}_Lintel", mid, front + sign * 0.15, y0 + 2.3, width, 0.3, CELL_H - 2.3, P["wall"]))
            add(L.box(coll, f"{tag}_Door", a0 + 0.05, front + sign * 0.5, y0, 0.06, 0.9, 2.1, P["dark"]))
            text(f"{tag}_Text", "STAFF ONLY", mid, front - sign * 0.02, y0 + 2.45, 0.22, P["sign"], 0.0 if sign < 0 else math.pi)
        else:
            if y0 == 0:
                rect(f"{tag}_Floor", min(front, back), a0, max(front, back), a1, 0.0, 0.01, P["service"])
            add(L.box(coll, f"{tag}_Frame", front + sign * 0.15, mid, y0, 0.3, width, 0.2, P["steel"]))
            add(L.box(coll, f"{tag}_Lintel", front + sign * 0.15, mid, y0 + 2.3, 0.3, width, CELL_H - 2.3, P["wall"]))
            add(L.box(coll, f"{tag}_Door", front + sign * 0.5, a0 + 0.05, y0, 0.9, 0.06, 2.1, P["dark"]))
            text(f"{tag}_Text", "STAFF ONLY", front - sign * 0.02, mid, y0 + 2.45, 0.22, P["sign"], math.pi / 2 if sign > 0 else -math.pi / 2)
        cells.append({"id": cid, "plaza": plaza, "level": level, "row": row_key, "category": category, "label": label, "name": name, "status": status,
                      "bounds": bounds_of(axis, a0, a1, front, back), "front": front_of(axis, mid, front, sign, y0), "width": round(width, 3), "depth": round(depth, 3)})
        return
    if axis == "x":
        rect(f"{tag}_Back", a0, min(back, back - sign * WALL_T), a1, max(back, back - sign * WALL_T), y0, CELL_H, P["wall"], col=True)
        rect(f"{tag}_SideA", a0, min(front, back), a0 + 0.15, max(front, back), y0, CELL_H, P["wall"], col=True)
        rect(f"{tag}_SideB", a1 - 0.15, min(front, back), a1, max(front, back), y0, CELL_H, P["wall"], col=True)
        rect(f"{tag}_Ceiling", a0, min(front, back), a1, max(front, back), y0 + CELL_H - 0.1, 0.1, P["slab"])
        for px in (a0 + 0.3, a1 - 0.3):
            rect(f"{tag}_Pilaster{int(px)}", px - 0.3, front - 0.2, px + 0.3, front + 0.2, y0, CELL_H, P["wall"], col=True)
        rect(f"{tag}_Fascia", a0, front - 0.12, a1, front + 0.12, y0 + 3.4, CELL_H - 3.4, CAT_MATS[category] if status == P_ else P["plywood"], col=True)
        text(f"{tag}_Name", name.upper(), mid, front - sign * 0.14, y0 + 3.75, 0.42, P["sign"], 0.0 if sign < 0 else math.pi)
        if status == P_:
            rect(f"{tag}_Low", a0 + 0.6, front - 0.1, a1 - 0.6, front + 0.1, y0, 0.5, P["wall"], col=True)
            rect(f"{tag}_Glass", a0 + 0.6, front - 0.02, a1 - 0.6, front + 0.02, y0 + 0.5, 2.9, P["glass"])
            rect(f"{tag}_Void", a0 + 0.6, front + sign * 0.3 - 0.04, a1 - 0.6, front + sign * 0.3 + 0.04, y0, 3.4, P["void"], col=True)
            add(L.box(coll, f"{tag}_Soon", mid, front - sign * 0.06, y0 + 1.4, min(2.6, width - 2.0), 0.03, 0.7, P["soon"]))
            if level == 0:
                text(f"{tag}_SoonText", "OPENING SOON", mid, front - sign * 0.09, y0 + 1.6, 0.26, P["dark"], 0.0 if sign < 0 else math.pi)
        else:
            rect(f"{tag}_Hoarding", a0 + 0.6, front - 0.08, a1 - 0.6, front + 0.08, y0, 3.4, P["plywood"], col=True)
            rect(f"{tag}_Tape", a0 + 0.6, front - 0.09, a1 - 0.6, front + 0.09, y0 + 1.1, 0.18, P["caution"])
            text(f"{tag}_Reno", "UNDER RENOVATION", mid, front - sign * 0.11, y0 + 1.7, 0.3, P["dark"], 0.0 if sign < 0 else math.pi)
            for k in range(int(width / 3.0)):
                sx = a0 + 1.5 + k * 3.0
                for dz in (0.5, 1.3):
                    add(L.cyl(coll, f"{tag}_Scaf{k}_{int(dz * 10)}", sx, front - sign * dz, y0, 0.04, 3.6, P["metal"], seg=5))
                add(L.box(coll, f"{tag}_ScafBar{k}", sx, front - sign * 0.9, y0 + 1.8, 0.05, 0.9, 0.05, P["metal"]))
                add(L.box(coll, f"{tag}_ScafPlank{k}", sx, front - sign * 0.9, y0 + 2.0, 1.2, 0.9, 0.05, P["pallet"]))
            cols.add(f"{tag}_Scaffold", mid, front - sign * 0.9, y0, width - 1.2, 1.0, 2.1)
            add(L.cone(coll, f"{tag}_Cone", a0 + 1.0, front - sign * 1.9, y0, 0.22, 0.04, 0.6, P["cone"], seg=6))
    else:
        rect(f"{tag}_Back", min(back, back - sign * WALL_T), a0, max(back, back - sign * WALL_T), a1, y0, CELL_H, P["wall"], col=True)
        rect(f"{tag}_SideA", min(front, back), a0, max(front, back), a0 + 0.15, y0, CELL_H, P["wall"], col=True)
        rect(f"{tag}_SideB", min(front, back), a1 - 0.15, max(front, back), a1, y0, CELL_H, P["wall"], col=True)
        rect(f"{tag}_Ceiling", min(front, back), a0, max(front, back), a1, y0 + CELL_H - 0.1, 0.1, P["slab"])
        for pz in (a0 + 0.3, a1 - 0.3):
            rect(f"{tag}_Pilaster{int(pz)}", front - 0.2, pz - 0.3, front + 0.2, pz + 0.3, y0, CELL_H, P["wall"], col=True)
        rect(f"{tag}_Fascia", front - 0.12, a0, front + 0.12, a1, y0 + 3.4, CELL_H - 3.4, CAT_MATS[category] if status == P_ else P["plywood"], col=True)
        yaw = math.pi / 2 if sign < 0 else -math.pi / 2
        text(f"{tag}_Name", name.upper(), front - sign * 0.14, mid, y0 + 3.75, 0.42, P["sign"], yaw)
        if status == P_:
            rect(f"{tag}_Low", front - 0.1, a0 + 0.6, front + 0.1, a1 - 0.6, y0, 0.5, P["wall"], col=True)
            rect(f"{tag}_Glass", front - 0.02, a0 + 0.6, front + 0.02, a1 - 0.6, y0 + 0.5, 2.9, P["glass"])
            rect(f"{tag}_Void", front + sign * 0.3 - 0.04, a0 + 0.6, front + sign * 0.3 + 0.04, a1 - 0.6, y0, 3.4, P["void"], col=True)
            add(L.box(coll, f"{tag}_Soon", front - sign * 0.06, mid, y0 + 1.4, 0.03, min(2.6, width - 2.0), 0.7, P["soon"]))
            if level == 0:
                text(f"{tag}_SoonText", "OPENING SOON", front - sign * 0.09, mid, y0 + 1.6, 0.26, P["dark"], yaw)
        else:
            rect(f"{tag}_Hoarding", front - 0.08, a0 + 0.6, front + 0.08, a1 - 0.6, y0, 3.4, P["plywood"], col=True)
            rect(f"{tag}_Tape", front - 0.09, a0 + 0.6, front + 0.09, a1 - 0.6, y0 + 1.1, 0.18, P["caution"])
            text(f"{tag}_Reno", "UNDER RENOVATION", front - sign * 0.11, mid, y0 + 1.7, 0.3, P["dark"], yaw)
    cells.append({"id": cid, "plaza": plaza, "level": level, "row": row_key, "category": category, "label": label, "name": name, "status": status,
                  "bounds": bounds_of(axis, a0, a1, front, back), "front": front_of(axis, mid, front, sign, y0), "width": round(width, 3), "depth": round(depth, 3)})


def bounds_of(axis, a0, a1, front, back):
    if axis == "x":
        return {"minX": round(a0, 3), "maxX": round(a1, 3), "minZ": round(min(front, back), 3), "maxZ": round(max(front, back), 3)}
    return {"minX": round(min(front, back), 3), "maxX": round(max(front, back), 3), "minZ": round(a0, 3), "maxZ": round(a1, 3)}


def front_of(axis, mid, front, sign, y0):
    # the player stands 1 m into the walkway, looking at the cell (yaw 0 = towards -Z)
    if axis == "x":
        return {"x": round(mid, 3), "y": y0, "z": round(front - sign * 1.0, 3), "yaw": 0.0 if sign < 0 else round(math.pi, 4)}
    return {"x": round(front - sign * 1.0, 3), "y": y0, "z": round(mid, 3), "yaw": round(-math.pi / 2 if sign > 0 else math.pi / 2, 4)}


def row(row_key, axis, a0, a1, front, back, y0=0.0, level=0):
    """Cells share the segment by weight (default 1.0, a 4th tuple element widens one); staff passages are 1.6 m."""
    plaza, items = ROWS[row_key]
    items = [it if len(it) == 4 else (*it, 1.0) for it in items]
    free = (a1 - a0) - sum(1.6 for it in items if it[2] == S_)
    weight = sum(it[3] for it in items if it[2] != S_)
    cur = a0
    for name, category, status, w in items:
        width = 1.6 if status == S_ else free * w / weight
        cell(row_key, plaza, name, category, status, axis, cur, cur + width, front, back, y0, level)
        cur += width


# ---------------------------------------------------------------- ground floor
N_OUT, N_IN = Z0 + SVC + OUTER, Z0 + RING - INNER
S_OUT, S_IN = Z1 - SVC - OUTER, Z1 - RING + INNER
W_OUT, W_IN = X0 + SVC + OUTER, X0 + RING - INNER
E_OUT, E_IN = X1 - SVC - OUTER, X1 - RING + INNER
GC, HH, NL = ANCHORS[2], ANCHORS[1], ANCHORS[0]
gap = 0.5
gc0, gc1 = GC["x"] - GC["w"] / 2 - gap, GC["x"] + GC["w"] / 2 + gap
hh0, hh1 = HH["x"] - HH["w"] / 2 - gap, HH["x"] + HH["w"] / 2 + gap
nl0, nl1 = NL["x"] - NL["w"] / 2 - gap, NL["x"] + NL["w"] / 2 + gap
WARE = (-200.0, -160.0, Z0, N_OUT)            # warehouse + security room band, NE corner
DOCK_X = (-300.0, -288.0)

# floors: ring walkway tiles, corner courts, forecourts in front of the anchors, al fresca paving, service corridors
rect("Floor_North", X0, N_OUT, X1, N_IN, -0.1, 0.1, P["floor"], tile=3.0)
rect("Floor_South", X0, S_IN, X1, S_OUT, -0.1, 0.1, P["floor"], tile=3.0)
rect("Floor_West", W_OUT, N_IN, W_IN, S_IN, -0.1, 0.1, P["floor"], tile=3.0)
rect("Floor_East", E_IN, N_IN, E_OUT, S_IN, -0.1, 0.1, P["floor"], tile=3.0)
rect("Floor_CourtNW", W_OUT, N_OUT, PARK[0], N_IN, -0.1, 0.1, P["floor"], tile=3.0)
# the north-west court bites 10 m into the west outer row so the whole Crispin's front (x < W_OUT included) opens on it
NOTCH = 10.0
rect("Floor_CourtNW_Notch", X0 + SVC, N_OUT, W_OUT, N_OUT + NOTCH, -0.1, 0.1, P["floor"], tile=3.0)
rect("Notch_WallW", X0 + SVC - WALL_T, N_OUT, X0 + SVC, N_OUT + NOTCH, 0.0, CELL_H, P["wall"], col=True)
rect("Floor_CourtSW", W_OUT, S_IN, PARK[0], S_OUT, -0.1, 0.1, P["floor"], tile=3.0)
rect("Floor_CourtNE", PARK[1], N_OUT, E_OUT, N_IN, -0.1, 0.1, P["floor"], tile=3.0)
rect("Floor_CourtSE", PARK[1], S_IN, E_OUT, S_OUT, -0.1, 0.1, P["floor"], tile=3.0)
rect("Floor_AlFresca", -300.0, S_IN, X1 - RING, S_OUT, -0.09, 0.1, P["street"], tile=2.0)
for a in ANCHORS:
    lo, hi = a["x"] - a["w"] / 2 - gap, a["x"] + a["w"] / 2 + gap
    if a["rotationY"] == 0.0:
        rect(f"Floor_Fore_{a['key']}", lo, Z0, hi, N_OUT, -0.1, 0.1, P["floor"], tile=3.0)
    else:
        rect(f"Floor_Fore_{a['key']}", lo, S_OUT, hi, Z1, -0.09, 0.1, P["street"], tile=2.0)
rect("Floor_SvcN", gc1, Z0, X1, Z0 + SVC, -0.1, 0.1, P["service"], tile=3.0)
rect("Floor_SvcS", X0, Z1 - SVC, X1, Z1, -0.1, 0.1, P["service"], tile=3.0)
rect("Floor_SvcW", X0, Z0, X0 + SVC, Z1, -0.1, 0.1, P["service"], tile=3.0)
rect("Floor_Ware", WARE[0], WARE[2], WARE[1], WARE[3], -0.1, 0.1, P["service"], tile=3.0)

# outer walls (full height), interrupted by the anchors and the entrance
def outer_wall_x(name, fixed, pieces, h):
    for i, (p0, p1) in enumerate(pieces):
        walls_along(f"{name}_{i}", "x", fixed, p0, p1, 0.0, h, P["wall_out"])


outer_wall_x("Outer_N", Z0 + WALL_T / 2, [(X0, gc0), (gc1, hh0), (hh1, X1)], ROOF2)
outer_wall_x("Outer_S", Z1 - WALL_T / 2, [(X0, -300.0), (-300.0, nl0), (nl1, X1)], ROOF2)
walls_along("Outer_W", "z", X0 + WALL_T / 2, Z0, Z1, 0.0, ROOF2, P["wall_out"])
walls_along("Outer_E_a", "z", X1 - WALL_T / 2, Z0, -ENTRANCE_HW, 0.0, ROOF2, P["wall_out"])
walls_along("Outer_E_b", "z", X1 - WALL_T / 2, ENTRANCE_HW, Z1, 0.0, ROOF2, P["wall_out"])
# the anchors' side returns: the outer wall folds back to the anchor facade line so the ring stays closed
for a in ANCHORS:
    lo, hi = a["x"] - a["w"] / 2 - gap, a["x"] + a["w"] / 2 + gap
    z_a, z_b = (Z0, N_OUT) if a["rotationY"] == 0.0 else (S_OUT, Z1)
    for x in (lo, hi):
        rect(f"Return_{a['key']}_{int(x)}", x - WALL_T / 2, z_a, x + WALL_T / 2, z_b, 0.0, ROOF2, P["wall_out"], col=True)
    # a lintel above the anchor facade, from the facade top to the roof
    rect(f"Lintel_{a['key']}", lo, a["front_z"] - 0.2, hi, a["front_z"] + 0.2, 5.6, ROOF2 - 5.6, P["wall_out"])

# service corridor inner walls (between corridor and cells backs are the cells' own back walls); dock and corridor lights
for i, gx in enumerate(range(int(X0) + 6, int(X1), 12)):
    if gx > gc1:
        add(L.box(coll, f"SvcLight_N{i}", gx, Z0 + SVC / 2, CELL_H - 0.08, 1.2, 0.3, 0.06, P["panel"]))
    add(L.box(coll, f"SvcLight_S{i}", gx, Z1 - SVC / 2, CELL_H - 0.08, 1.2, 0.3, 0.06, P["panel"]))
for i, gz in enumerate(range(int(Z0) + 6, int(Z1), 12)):
    add(L.box(coll, f"SvcLight_W{i}", X0 + SVC / 2, gz, CELL_H - 0.08, 0.3, 1.2, 0.06, P["panel"]))
rect("Svc_Ceiling_N", gc1, Z0, X1, Z0 + SVC, CELL_H, 0.2, P["slab"])
rect("Svc_Ceiling_S", X0, Z1 - SVC, X1, Z1, CELL_H, 0.2, P["slab"])
rect("Svc_Ceiling_W", X0, Z0, X0 + SVC, Z1, CELL_H, 0.2, P["slab"])
# loading dock: roll-up door in the north wall, platform and ramp outside, dumpster, bollards
rect("Dock_Door", DOCK_X[0], Z0 - 0.02, DOCK_X[1], Z0 + 0.1, 0.0, 3.6, P["shutter"])
rect("Dock_Platform", DOCK_X[0] - 2.0, Z0 - 4.5, DOCK_X[1] + 2.0, Z0, 0.0, 1.1, P["service"], col=True)
wedge("Dock_Ramp", DOCK_X[1] + 2.0, Z0 - 4.5, DOCK_X[1] + 8.0, Z0, 0.0, 1.1, "-x", P["service"])
for i, gx in enumerate((DOCK_X[0] - 1.0, DOCK_X[1] + 1.0)):
    add(L.cyl(coll, f"Dock_Bollard{i}", gx, Z0 - 5.2, 0.0, 0.12, 0.9, P["yellow"], seg=8))
    cols.add(f"Dock_Bollard{i}", gx, Z0 - 5.2, 0.0, 0.3, 0.3, 0.9)
add(L.box(coll, "Dock_Dumpster", DOCK_X[0] - 5.0, Z0 - 2.5, 0.0, 2.4, 1.6, 1.5, P["band"], bevel=0.03))
cols.add("Dock_Dumpster", DOCK_X[0] - 5.0, Z0 - 2.5, 0.0, 2.4, 1.6, 1.5)
text("Dock_Text", "DELIVERIES", (DOCK_X[0] + DOCK_X[1]) / 2, Z0 - 0.06, 3.7, 0.5, P["sign"], math.pi)

# cell rows, ground floor
row("N_out_a", "x", X0 + SVC, gc0, N_OUT, Z0 + SVC)
row("N_out_b", "x", gc1, hh0, N_OUT, Z0 + SVC)
row("N_out_c", "x", hh1, (hh1 + WARE[0]) / 2, N_OUT, Z0 + SVC)
row("N_out_d", "x", (hh1 + WARE[0]) / 2, WARE[0], N_OUT, Z0 + SVC)
row("N_in_a", "x", PARK[0], -300.0, N_IN, PARK[2])
row("N_in_b", "x", -300.0, -250.0 - EXIT_W / 2, N_IN, PARK[2])
row("N_in_c", "x", -250.0 + EXIT_W / 2, PARK[1], N_IN, PARK[2])
# the south outer rows stop at the west/east walkway lines: the corner pockets behind them stay service space
row("S_out_a", "x", W_OUT, -300.0, S_OUT, Z1 - SVC)
rect("Floor_SvcSW", X0 + SVC, S_OUT, W_OUT, Z1 - SVC, -0.1, 0.1, P["service"], tile=3.0)
row("S_out_b", "x", -300.0, nl0, S_OUT, Z1 - SVC)
row("S_out_c", "x", nl1, E_OUT, S_OUT, Z1 - SVC)
rect("Floor_SvcSE", E_OUT, S_OUT, X1 - WALL_T, Z1 - SVC, -0.1, 0.1, P["service"], tile=3.0)
row("S_in_a", "x", PARK[0], -300.0, S_IN, PARK[3])
row("S_in_b", "x", -300.0, -250.0 - EXIT_W / 2, S_IN, PARK[3])
row("S_in_c", "x", -250.0 + EXIT_W / 2, PARK[1], S_IN, PARK[3])
row("W_out_a", "z", N_OUT + NOTCH, 0.0, W_OUT, X0 + SVC)
row("W_out_b", "z", 0.0, S_OUT, W_OUT, X0 + SVC)
row("W_in_a", "z", PARK[2], -EXIT_W / 2, W_IN, PARK[0])
row("W_in_b", "z", EXIT_W / 2, PARK[3], W_IN, PARK[0])
row("E_out_a", "z", N_OUT, -ENTRANCE_HW, E_OUT, X1)
row("E_out_b", "z", ENTRANCE_HW, S_OUT, E_OUT, X1)
row("E_in_a", "z", PARK[2], -EXIT_W / 2, E_IN, PARK[1])
row("E_in_b", "z", EXIT_W / 2, PARK[3], E_IN, PARK[1])
# the park exits: arches through the inner rows (the gap is left by the rows; add a lintel and side pilasters)
for name, x0, z0, x1, z1 in (("ExitN", -250.0 - EXIT_W / 2, PARK[2], -250.0 + EXIT_W / 2, N_IN), ("ExitS", -250.0 - EXIT_W / 2, S_IN, -250.0 + EXIT_W / 2, PARK[3]),
                             ("ExitW", PARK[0], -EXIT_W / 2, W_IN, EXIT_W / 2), ("ExitE", E_IN, -EXIT_W / 2, PARK[1], EXIT_W / 2)):
    rect(f"{name}_Lintel", x0, z0, x1, z1, 4.4, CELL_H - 4.4, P["band"])
    rect(f"{name}_Floor", x0, z0, x1, z1, -0.08, 0.1, P["paving"], tile=2.0)
exit_signs = (("ExitN", -250.0, N_IN - 0.06, math.pi), ("ExitS", -250.0, S_IN + 0.06, 0.0), ("ExitW", W_IN - 0.06, 0.0, -math.pi / 2), ("ExitE", E_IN + 0.06, 0.0, math.pi / 2))
for name, gx, gz, yaw in exit_signs:
    text(f"{name}_Sign", "LEISURE PARK", gx, gz, 4.44, 0.32, P["sign"], yaw)

# main entrance: glass facade between the two outer cell rows, doors, canopy, mall name
rect("Entrance_Low", X1 - 0.4, -ENTRANCE_HW, X1, ENTRANCE_HW, 0.0, 0.4, P["wall_out"])
for z0, z1 in ((-ENTRANCE_HW, -5.5), (5.5, ENTRANCE_HW)):
    rect(f"Entrance_Glass{int(z0)}", X1 - 0.3, z0, X1 - 0.2, z1, 0.4, ROOF2 - 0.4, P["glass"])
    cols.add(f"Entrance_Glass{int(z0)}", X1 - 0.25, (z0 + z1) / 2, 0.0, 0.3, z1 - z0, 4.0)
for z0, z1 in ((-5.5, -2.5), (-2.5, 2.5), (2.5, 5.5)):
    rect(f"Entrance_Transom{int(z0)}", X1 - 0.3, z0, X1 - 0.2, z1, 2.6, ROOF2 - 2.6, P["glass"])
    for zz in (z0, z1):
        rect(f"Entrance_Jamb{int(zz * 10)}", X1 - 0.45, zz - 0.08, X1 - 0.05, zz + 0.08, 0.0, 2.6, P["dark"], col=True)
    rect(f"Entrance_Head{int(z0)}", X1 - 0.45, z0, X1 - 0.05, z1, 2.6, 0.2, P["dark"])
rect("Entrance_Mullion", X1 - 0.35, -ENTRANCE_HW, X1 - 0.15, ENTRANCE_HW, 6.0, 0.3, P["dark"])
rect("Entrance_Canopy", X1 - 0.5, -ENTRANCE_HW - 1.0, X1 + 5.0, ENTRANCE_HW + 1.0, 4.2, 0.35, P["dark"])
for i, gz in enumerate((-ENTRANCE_HW + 0.5, ENTRANCE_HW - 0.5)):
    add(L.cyl(coll, f"Entrance_Post{i}", X1 + 4.6, gz, 0.0, 0.15, 4.2, P["dark"], seg=8))
    cols.add(f"Entrance_Post{i}", X1 + 4.6, gz, 0.0, 0.4, 0.4, 4.2)
rect("Entrance_SignBoard", X1 - 0.2, -11.0, X1 + 0.3, 11.0, 7.0, 2.2, P["band"])
text("Entrance_Name", "COVE PARKVIEW MALL", X1 + 0.35, 0.0, 7.5, 1.2, P["neon"], math.pi / 2)
text("Entrance_Welcome", "WELCOME", X1 - 0.5, 0.0, 4.7, 0.5, P["sign"], -math.pi / 2)
# vestibule floor runs out to the forecourt
rect("Floor_Vestibule", X1 - 0.5, -ENTRANCE_HW, X1 + 6.0, ENTRANCE_HW, -0.1, 0.1, P["floor"], tile=3.0)

# ---------------------------------------------------------------- upper floors (Entrance, Paradise, Wonderland)
stairs = []
l1_rects = []
l2_rects = []
P_UP = (-300.0, PARK[1])        # Paradise's two-level stretch along x


def upper_wing(key, axis, a0, a1, out_front, in_front, out_back, in_back, rows_out, rows_in):
    """Slab over both cell rows plus a 5 m balcony each side, the upper cells, railings, two escalators."""
    sign_out = 1 if out_back > out_front else -1       # outer side: from the front towards the outer wall
    bal_out = out_front - sign_out * BAL               # balcony edge on the outer side
    bal_in = in_front + sign_out * BAL                 # the inner front is on the other side of the walkway
    y = L1_Y
    lo, hi = min(bal_out, out_back), max(bal_out, out_back)
    lo2, hi2 = min(bal_in, in_back), max(bal_in, in_back)
    if axis == "x":
        rect(f"Slab_{key}_Out", a0, lo, a1, hi, y - SLAB_T, SLAB_T, P["slab"], tile=3.0)
        rect(f"Slab_{key}_In", a0, lo2, a1, hi2, y - SLAB_T, SLAB_T, P["slab"], tile=3.0)
        rect(f"Floor1_{key}_Out", a0, min(bal_out, out_front), a1, max(bal_out, out_front), y - 0.02, 0.03, P["floor2"], tile=3.0)
        rect(f"Floor1_{key}_In", a0, min(bal_in, in_front), a1, max(bal_in, in_front), y - 0.02, 0.03, P["floor2"], tile=3.0)
        l1_rects.append({"minX": a0, "maxX": a1, "minZ": min(bal_out, out_front), "maxZ": max(bal_out, out_front)})
        l1_rects.append({"minX": a0, "maxX": a1, "minZ": min(bal_in, in_front), "maxZ": max(bal_in, in_front)})
    else:
        rect(f"Slab_{key}_Out", lo, a0, hi, a1, y - SLAB_T, SLAB_T, P["slab"], tile=3.0)
        rect(f"Slab_{key}_In", lo2, a0, hi2, a1, y - SLAB_T, SLAB_T, P["slab"], tile=3.0)
        rect(f"Floor1_{key}_Out", min(bal_out, out_front), a0, max(bal_out, out_front), a1, y - 0.02, 0.03, P["floor2"], tile=3.0)
        rect(f"Floor1_{key}_In", min(bal_in, in_front), a0, max(bal_in, in_front), a1, y - 0.02, 0.03, P["floor2"], tile=3.0)
        l1_rects.append({"minX": min(bal_out, out_front), "maxX": max(bal_out, out_front), "minZ": a0, "maxZ": a1})
        l1_rects.append({"minX": min(bal_in, in_front), "maxX": max(bal_in, in_front), "minZ": a0, "maxZ": a1})
    for rk in rows_out:
        row(rk, axis, a0, a1, out_front, out_back, y0=y, level=1)
    for rk in rows_in:
        row(rk, axis, a0, a1, in_front, in_back, y0=y, level=1)
    # escalators: one at each end of the wing, in the void next to a balcony edge, rising towards the middle
    esc = [("A", a0 + 1.0, a0 + 1.0 + RAMP_RUN, bal_out, sign_out, "+" if axis == "x" else "+"),
           ("B", a1 - 1.0 - RAMP_RUN, a1 - 1.0, bal_in, -sign_out, "-")]
    gaps_out, gaps_in = [], []
    for tag, r0, r1, edge, sgn, dirn in esc:
        up = dirn == "+"
        rise = ("+" if up else "-") + axis
        band0, band1 = edge - sgn * RAMP_W, edge                  # the ramp hugs the balcony edge, inside the void
        land0, land1 = (r1, r1 + LANDING) if up else (r0 - LANDING, r0)
        lo_b, hi_b = min(band0, band1), max(band0, band1)
        if axis == "x":
            wedge(f"Esc_{key}{tag}", r0, lo_b, r1, hi_b, 0.0, y, rise, P["floor2"])
            rect(f"Esc_{key}{tag}_Land", land0, lo_b, land1, hi_b, 0.0, y, P["floor2"])
            stairs.append({"name": f"Esc_{key}{tag}", "minX": r0, "maxX": r1, "minZ": lo_b, "maxZ": hi_b, "y0": 0.0, "y1": y, "rise": rise})
            l1_rects.append({"minX": land0, "maxX": land1, "minZ": lo_b, "maxZ": hi_b})
            # solid balustrades on the void side (full height from the ground) and the low end
            n = 8
            for k in range(n):
                p0 = r0 + (r1 - r0) * k / n
                p1 = r0 + (r1 - r0) * (k + 1) / n
                t = (k + 1) / n if up else 1 - k / n
                rect(f"Esc_{key}{tag}_Side{k}", p0, band0 - sgn * 0.05 - 0.04, p1, band0 - sgn * 0.05 + 0.04, 0.0, y * t + 1.0, P["glass"], col=True)
                rect(f"Esc_{key}{tag}_Cap{k}", p0, band0 - sgn * 0.05 - 0.06, p1, band0 - sgn * 0.05 + 0.06, y * t + 1.0, 0.07, P["rail"])
            rect(f"Esc_{key}{tag}_LandSide", land0, band0 - sgn * 0.05 - 0.04, land1, band0 - sgn * 0.05 + 0.04, 0.0, y + 1.0, P["glass"], col=True)
            end = land1 if up else land0
            rect(f"Esc_{key}{tag}_End", end - 0.04, lo_b, end + 0.04, hi_b, 0.0, y + 1.0, P["glass"], col=True)
            # balcony-side balustrade along the lower 70 % of the ramp, the rest opens onto the balcony
            keep0, keep1 = (r0, r0 + (r1 - r0) * 0.7) if up else (r0 + (r1 - r0) * 0.3, r1)
            rect(f"Esc_{key}{tag}_BalSide", keep0, edge - 0.04, keep1, edge + 0.04, 0.0, y + 1.0, P["glass"], col=True)
            gap_lo, gap_hi = (keep1, land1) if up else (land0, keep0)
        else:
            wedge(f"Esc_{key}{tag}", lo_b, r0, hi_b, r1, 0.0, y, rise, P["floor2"])
            rect(f"Esc_{key}{tag}_Land", lo_b, land0, hi_b, land1, 0.0, y, P["floor2"])
            stairs.append({"name": f"Esc_{key}{tag}", "minX": lo_b, "maxX": hi_b, "minZ": r0, "maxZ": r1, "y0": 0.0, "y1": y, "rise": rise})
            l1_rects.append({"minX": lo_b, "maxX": hi_b, "minZ": land0, "maxZ": land1})
            n = 8
            for k in range(n):
                p0 = r0 + (r1 - r0) * k / n
                p1 = r0 + (r1 - r0) * (k + 1) / n
                t = (k + 1) / n if up else 1 - k / n
                rect(f"Esc_{key}{tag}_Side{k}", band0 - sgn * 0.05 - 0.04, p0, band0 - sgn * 0.05 + 0.04, p1, 0.0, y * t + 1.0, P["glass"], col=True)
                rect(f"Esc_{key}{tag}_Cap{k}", band0 - sgn * 0.05 - 0.06, p0, band0 - sgn * 0.05 + 0.06, p1, y * t + 1.0, 0.07, P["rail"])
            rect(f"Esc_{key}{tag}_LandSide", band0 - sgn * 0.05 - 0.04, land0, band0 - sgn * 0.05 + 0.04, land1, 0.0, y + 1.0, P["glass"], col=True)
            end = land1 if up else land0
            rect(f"Esc_{key}{tag}_End", lo_b, end - 0.04, hi_b, end + 0.04, 0.0, y + 1.0, P["glass"], col=True)
            keep0, keep1 = (r0, r0 + (r1 - r0) * 0.7) if up else (r0 + (r1 - r0) * 0.3, r1)
            rect(f"Esc_{key}{tag}_BalSide", edge - 0.04, keep0, edge + 0.04, keep1, 0.0, y + 1.0, P["glass"], col=True)
            gap_lo, gap_hi = (keep1, land1) if up else (land0, keep0)
        (gaps_out if edge == bal_out else gaps_in).append((gap_lo, gap_hi))
    railing(f"Rail_{key}_Out", axis, bal_out, a0, a1, y, gaps=gaps_out)
    railing(f"Rail_{key}_In", axis, bal_in, a0, a1, y, gaps=gaps_in)
    # end railings across each balcony at both ends of the wing
    for end in (a0, a1):
        if axis == "x":
            railing(f"Rail_{key}_End{int(end)}O", "z", end, min(bal_out, out_front), max(bal_out, out_front), y)
            railing(f"Rail_{key}_End{int(end)}I", "z", end, min(bal_in, in_front), max(bal_in, in_front), y)
        else:
            railing(f"Rail_{key}_End{int(end)}O", "x", end, min(bal_out, out_front), max(bal_out, out_front), y)
            railing(f"Rail_{key}_End{int(end)}I", "x", end, min(bal_in, in_front), max(bal_in, in_front), y)
    # pillars along the balcony edges, ground to roof
    for p in range(int(a0) + 8, int(a1) - 2, 16):
        for edge in (bal_out, bal_in):
            if axis == "x":
                pillar(f"Pillar_{key}_{p}_{int(edge)}", p, edge, 0.0, ROOF2)
            else:
                pillar(f"Pillar_{key}_{p}_{int(edge)}", edge, p, 0.0, ROOF2)
    # light panels under the balcony slabs
    for p in range(int(a0) + 4, int(a1) - 2, 8):
        for front, edge in ((out_front, bal_out), (in_front, bal_in)):
            c = (front + edge) / 2
            if axis == "x":
                add(L.box(coll, f"BalLight_{key}_{p}_{int(c)}", p, c, y - SLAB_T - 0.06, 1.6, 0.5, 0.06, P["panel"]))
            else:
                add(L.box(coll, f"BalLight_{key}_{p}_{int(c)}", c, p, y - SLAB_T - 0.06, 0.5, 1.6, 0.06, P["panel"]))


upper_wing("E", "z", PARK[2], PARK[3], E_OUT, E_IN, X1, PARK[1], ["E1_out"], ["E1_in"])
upper_wing("P", "x", P_UP[0], P_UP[1], N_OUT, N_IN, Z0 + SVC, PARK[2], ["P1_out"], ["P1_in"])
upper_wing("W", "z", PARK[2], PARK[3], W_OUT, W_IN, X0 + SVC, PARK[0], ["W1_out"], ["W1_in"])

# ---------------------------------------------------------------- roofs: slabs over the cell rows, trusses over the voids
def roof_slab(name, x0, z0, x1, z1, y):
    rect(name, x0, z0, x1, z1, y, 0.3, P["roof"], tile=4.0)


# north wing: two-level part (Paradise) at ROOF2 over cells + balconies, the rest (North Plaza, NE corner) at the plaza height
roof_slab("Roof_N_cells_out", X0, Z0, X1, N_OUT - BAL, ROOF2)
roof_slab("Roof_N_cells_in", X0, N_IN + BAL, X1, PARK[2], ROOF2)
roof_slab("Roof_S_cells_out", X0, S_OUT + BAL, X1, Z1, ROOF2)
roof_slab("Roof_S_cells_in", X0, PARK[3], X1, S_IN - BAL, ROOF2)
roof_slab("Roof_W_cells_out", X0, PARK[2], W_OUT - BAL, PARK[3], ROOF2)
roof_slab("Roof_W_cells_in", W_IN + BAL, PARK[2], PARK[0], PARK[3], ROOF2)
roof_slab("Roof_E_cells_out", E_OUT + BAL, PARK[2], X1, PARK[3], ROOF2)
roof_slab("Roof_E_cells_in", PARK[1], PARK[2], E_IN - BAL, PARK[3], ROOF2)
# the single-level plazas close their walkway with a lower glass-less roof grid; Al Fresca stays open
roof_slab("Roof_NorthPlaza", X0, N_OUT - BAL, -300.0, N_IN + BAL, ROOF1)
roof_slab("Roof_FoodCourt", X0, S_IN - BAL, -300.0, S_OUT + BAL, ROOF1)
for i, gx in enumerate(range(int(X0) + 6, -300, 8)):
    for gz in (N_OUT - 1.0, -70.0, N_IN + 1.0):
        add(L.box(coll, f"RoofLight_N{i}_{int(gz)}", gx, gz, ROOF1 - 0.08, 2.4, 0.5, 0.08, P["panel"]))
    for gz in (S_IN + 1.0, 70.0, S_OUT - 1.0):
        add(L.box(coll, f"RoofLight_S{i}_{int(gz)}", gx, gz, ROOF1 - 0.08, 2.4, 0.5, 0.08, P["panel"]))
# trusses over the voids (Paradise, Entrance, Wonderland, the corner courts)
def trusses(name, axis, a0, a1, p0, p1, y):
    n = max(1, int((a1 - a0) / 6.0))
    for i in range(n + 1):
        a = a0 + (a1 - a0) * i / n
        if axis == "x":
            rect(f"{name}_T{i}", a - 0.2, p0, a + 0.2, p1, y, 0.5, P["steel"])
        else:
            rect(f"{name}_T{i}", p0, a - 0.2, p1, a + 0.2, y, 0.5, P["steel"])
    for p in (p0 + 0.2, (p0 + p1) / 2, p1 - 0.2):
        if axis == "x":
            rect(f"{name}_L{int(p)}", a0, p - 0.12, a1, p + 0.12, y + 0.2, 0.3, P["steel"])
        else:
            rect(f"{name}_L{int(p)}", p - 0.12, a0, p + 0.12, a1, y + 0.2, 0.3, P["steel"])


trusses("Truss_P", "x", -300.0, X1, N_OUT - BAL, N_IN + BAL, ROOF2)
trusses("Truss_E", "z", PARK[2], PARK[3], E_OUT + BAL, E_IN - BAL, ROOF2)
trusses("Truss_W", "z", PARK[2], PARK[3], W_OUT - BAL, W_IN + BAL, ROOF2)
trusses("Truss_CourtSW", "x", W_OUT - BAL, PARK[0], S_IN - BAL, S_OUT + BAL, ROOF2)
trusses("Truss_CourtSE", "x", PARK[1], X1, S_IN - BAL, S_OUT + BAL, ROOF2)
trusses("Truss_CourtNW", "z", N_OUT - BAL, N_IN + BAL, W_OUT - BAL, PARK[0], ROOF2)
# parapets on the roof edge of the outer walls are the walls themselves (they run to ROOF2)

# ---------------------------------------------------------------- warehouse, security room, roof terrace (NE corner)
wx0, wx1, wz0, wz1 = WARE
walls_along("Ware_Front", "x", wz1, wx0, wx0 + 18.0, 0.0, CELL_H, P["wall"])
walls_along("Ware_Front2", "x", wz1, wx0 + 19.6, wx1, 0.0, CELL_H, P["wall"])
rect("Ware_FrontLintel", wx0 + 18.0, wz1 - WALL_T / 2, wx0 + 19.6, wz1 + WALL_T / 2, 2.3, CELL_H - 2.3, P["wall"])
rect("Ware_FrontBand", wx0, wz1 - WALL_T / 2, wx1, wz1 + WALL_T / 2, CELL_H, ROOF2 - CELL_H, P["wall"])
add(L.box(coll, "Ware_Door", wx0 + 18.05, wz1 - 0.5, 0.0, 0.06, 0.95, 2.1, P["dark"]))
text("Ware_Sign", "STAFF ONLY", wx0 + 18.8, wz1 + 0.06, 2.45, 0.22, P["sign"], 0.0)
rect("Ware_Partition", wx0 + 12.0 - WALL_T / 2, wz0, wx0 + 12.0 + WALL_T / 2, wz1 - 3.0, 0.0, CELL_H, P["wall"], col=True)
text("Ware_SecText", "SECURITY", wx0 + 6.0, wz1 - 0.06, 2.6, 0.4, P["sign"], math.pi)
for i in range(6):
    gx, gz = wx0 + 14.0 + (i % 3) * 2.2, wz0 + 1.6 + (i // 3) * 2.4
    add(L.box(coll, f"Ware_Crate{i}", gx, gz, 0.0, 1.4, 1.4, 1.0 + 0.3 * (i % 2), P["carton"], bevel=0.02))
    cols.add(f"Ware_Crate{i}", gx, gz, 0.0, 1.4, 1.4, 1.3)
add(L.box(coll, "Ware_Rack", wx0 + 24.0, wz0 + 1.0, 0.0, 6.0, 1.2, 3.4, P["steel"]))
cols.add("Ware_Rack", wx0 + 24.0, wz0 + 1.0, 0.0, 6.0, 1.2, 3.4)
add(L.furn(coll, "Sec_Desk", wx0 + 5.0, wz0 + 3.0, 0.0, [(0, 0, 0.0, 3.0, 0.9, 0.78, P["dark"], 0.02), (-0.8, 0.0, 0.78, 0.6, 0.4, 0.5, P["panel"], 0.01), (0.8, 0.0, 0.78, 0.6, 0.4, 0.5, P["panel"], 0.01)]))
cols.add("Sec_Desk", wx0 + 5.0, wz0 + 3.0, 0.0, 3.0, 0.9, 1.3)
for i in range(6):
    add(L.box(coll, f"Sec_Monitor{i}", wx0 + 2.0 + (i % 3) * 1.2, wz0 + 0.25, 1.4 + (i // 3) * 0.9, 1.0, 0.1, 0.7, P["panel"]))
add(L.box(coll, "Sec_Couch", wx0 + 9.5, wz0 + 1.0, 0.0, 2.0, 0.9, 0.8, P["band"], bevel=0.04))
cols.add("Sec_Couch", wx0 + 9.5, wz0 + 1.0, 0.0, 2.0, 0.9, 0.8)
# switchback stair to the roof: flight A along -x (y 0 -> 6), landing, flight B along +x (6 -> 11.6)
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
rect("Stair_roof_railLand", land["minX"] - 0.05, land["minZ"], land["minX"] + 0.05, land["maxZ"], 0.0, L1_Y + 1.0, P["steel"], col=True)
# the roof terrace: slab at ROOF2 over the warehouse band, parapets, helipad, plant, stair head
roof_slab("Roof_Ware", wx0, wz0, wx1, wz1, ROOF2 - 0.3)
l2_rects.append({"minX": wx0, "maxX": wx1, "minZ": wz0, "maxZ": wz1})
for name, x0, z0, x1, z1 in (("Par_N", wx0, wz0 - 0.2, wx1, wz0 + 0.1), ("Par_E", wx1 - 0.3, wz0, wx1, wz1), ("Par_S", wx0, wz1 - 0.1, wx1, wz1 + 0.2), ("Par_W", wx0 - 0.2, wz0, wx0 + 0.1, wz1)):
    rect(f"Roof_{name}", x0, z0, x1, z1, ROOF2, 1.1, P["wall_out"], col=True)
add(L.cyl(coll, "Roof_Helipad", wx0 + 20.0, (wz0 + wz1) / 2, ROOF2, 5.0, 0.05, P["helipad"], seg=24))
add(L.cyl(coll, "Roof_HelipadRing", wx0 + 20.0, (wz0 + wz1) / 2, ROOF2 + 0.05, 5.0, 0.02, P["hmark"], seg=24))
add(L.cyl(coll, "Roof_HelipadInner", wx0 + 20.0, (wz0 + wz1) / 2, ROOF2 + 0.06, 4.6, 0.02, P["helipad"], seg=24))
text("Roof_H", "H", wx0 + 20.0, (wz0 + wz1) / 2 + 1.2, ROOF2 + 0.08, 2.4, P["hmark"], 0.0).rotation_euler = (0.0, 0.0, 0.0)
for i, gx in enumerate((wx0 + 4.0, wx0 + 8.0)):
    add(L.box(coll, f"Roof_AC{i}", gx, wz0 + 4.0, ROOF2, 2.2, 1.6, 1.3, P["metal"], bevel=0.03))
    cols.add(f"Roof_AC{i}", gx, wz0 + 4.0, ROOF2, 2.2, 1.6, 1.3)
rect("Roof_StairHead", sb["maxX"] - 3.0, sb["minZ"] - 0.6, sb["maxX"] + 0.2, sb["maxZ"] + 0.6, ROOF2 + 2.6, 0.2, P["metal"])
for z in (sb["minZ"] - 0.6, sb["maxZ"] + 0.6):
    rect(f"Roof_StairHeadWall{int(z)}", sb["maxX"] - 3.0, z - 0.05, sb["maxX"] + 0.2, z + 0.05, ROOF2, 2.6, P["wall_out"], col=True)

# ---------------------------------------------------------------- plaza furniture, signs and features
def plaza_sign(name, body, gx, gz, y, yaw):
    add(L.box(coll, f"{name}_Board", gx, gz, y, 4.6, 0.08, 0.9, P["band"], rot=yaw))
    fx, fz = math.sin(yaw), math.cos(yaw)
    text(f"{name}_Text", body, gx + fx * 0.06, gz + fz * 0.06, y + 0.22, 0.45, P["sign"], yaw)
    text(f"{name}_TextB", body, gx - fx * 0.06, gz - fz * 0.06, y + 0.22, 0.45, P["sign"], yaw + math.pi)
    for o_ in (-2.0, 2.0):
        add(L.cyl(coll, f"{name}_Wire{int(o_)}", gx + o_ * math.cos(yaw), gz - o_ * math.sin(yaw), y + 0.9, 0.012, 1.2, P["steel"], seg=4))


plaza_sign("Sign_Entrance", "ENTRANCE PLAZA", -180.0, 0.0, 4.9, math.pi / 2)
plaza_sign("Sign_Paradise", "PARADISE PLAZA", -220.0, -70.0, 4.9, 0.0)
plaza_sign("Sign_NorthPlaza", "NORTH PLAZA", -330.0, -70.0, 4.9, 0.0)
plaza_sign("Sign_Wonderland", "WONDERLAND PLAZA", -360.0, -30.0, 4.9, math.pi / 2)
plaza_sign("Sign_FoodCourt", "FOOD COURT", -330.0, 70.0, 4.9, 0.0)
plaza_sign("Sign_AlFresca", "AL FRESCA PLAZA", -220.0, 70.0, 4.9, 0.0)
# directories at the corner courts and the entrance
for i, (gx, gz, yaw) in enumerate(((-178.0, -12.0, -math.pi / 2), (-350.0, -70.0, 0.0), (-350.0, 70.0, math.pi), (-190.0, -70.0, 0.0), (-190.0, 70.0, math.pi))):
    add(L.box(coll, f"Directory_{i}_Post", gx, gz, 0.0, 0.3, 0.3, 2.4, P["dark"], rot=yaw))
    add(L.box(coll, f"Directory_{i}_Board", gx, gz, 0.9, 1.6, 0.12, 1.6, P["band"], rot=yaw))
    add(L.box(coll, f"Directory_{i}_Map", gx + math.sin(yaw) * 0.07, gz + math.cos(yaw) * 0.07, 1.1, 1.3, 0.02, 1.1, P["soon"], rot=yaw))
    text(f"Directory_{i}_Text", "DIRECTORY", gx + math.sin(yaw) * 0.08, gz + math.cos(yaw) * 0.08, 2.25, 0.2, P["sign"], yaw)
    cols.add(f"Directory_{i}", gx, gz, 0.0, 1.6, 0.4, 2.5, rot=yaw)
# entrance plaza: information kiosk in the middle of the walkway, benches and planters along the void
add(L.cyl(coll, "Info_Desk", -180.0, 14.0, 0.0, 1.8, 1.05, P["wall"], seg=16))
add(L.cyl(coll, "Info_Top", -180.0, 14.0, 1.05, 1.9, 0.06, P["band"], seg=16))
add(L.cyl(coll, "Info_Pole", -180.0, 14.0, 1.1, 0.06, 2.0, P["steel"], seg=6))
add(L.box(coll, "Info_Sign", -180.0, 14.0, 3.1, 1.4, 0.08, 0.5, P["band"]))
text("Info_Text", "INFORMATION", -180.0, 14.06, 3.2, 0.22, P["sign"], 0.0)
text("Info_TextB", "INFORMATION", -180.0, 13.94, 3.2, 0.22, P["sign"], math.pi)
cols.add("Info_Desk", -180.0, 14.0, 0.0, 3.8, 3.8, 1.1)
for i, gz in enumerate(range(-44, 45, 11)):
    bench(f"Bench_E{i}a", -186.0, gz, math.pi / 2)
    bench(f"Bench_E{i}b", -174.0, gz, -math.pi / 2)
    if abs(gz + 5.5) <= 33.0:
        planter(f"Planter_E{i}", -180.0, gz + 5.5, 1.2, 1.2)
        bin_(f"Bin_E{i}", -176.0, gz + 5.5)
# paradise plaza and north plaza furniture
for i, gx in enumerate(range(-296, -200, 16)):
    bench(f"Bench_N{i}a", gx, N_OUT + 2.0, math.pi)
    bench(f"Bench_N{i}b", gx, N_IN - 2.0, 0.0)
    if gx > -296:
        planter(f"Planter_N{i}", gx + 8.0, -70.0, 1.2, 1.2)
for i, gx in enumerate(range(-372, -300, 18)):
    add(L.box(coll, f"Reno_Pallet{i}", gx, -66.0, 0.0, 1.2, 1.0, 0.15, P["pallet"]))
    add(L.box(coll, f"Reno_Bags{i}", gx, -66.0, 0.15, 1.0, 0.8, 0.5, P["carton"], bevel=0.04))
    cols.add(f"Reno_Pallet{i}", gx, -66.0, 0.0, 1.2, 1.0, 0.7)
    add(L.cone(coll, f"Reno_Cone{i}", gx + 2.0, -74.0, 0.0, 0.22, 0.04, 0.6, P["cone"], seg=6))
add(L.box(coll, "Reno_Mixer", -312.0, -74.0, 0.0, 1.6, 1.0, 1.1, P["yellow"], bevel=0.04))
add(L.cyl(coll, "Reno_MixerDrum", -312.0, -74.0, 1.1, 0.5, 0.9, P["metal"], seg=10))
cols.add("Reno_Mixer", -312.0, -74.0, 0.0, 1.6, 1.0, 2.0)
# wonderland: a play area in the middle of the walkway with soft floor, slide, climbing cube, carousel, ball pit
rect("Play_Floor", -364.0, -22.0, -356.0, 22.0, 0.0, 0.03, P["soft"], tile=1.0)
add(L.box(coll, "Play_Cube", -360.0, -16.0, 0.03, 2.4, 2.4, 2.0, P["blue"], bevel=0.08))
cols.add("Play_Cube", -360.0, -16.0, 0.0, 2.4, 2.4, 2.0)
wedge("Play_Slide", -360.0 - 1.0, -14.8, -360.0 + 1.0, -9.0, 0.3, 2.0, "-z", P["yellow"])
cols.add("Play_Slide", -360.0, -11.9, 0.0, 2.0, 5.8, 1.2)
add(L.cyl(coll, "Carousel_Base", -360.0, 0.0, 0.03, 3.2, 0.3, P["red"], seg=16))
add(L.cyl(coll, "Carousel_Pole", -360.0, 0.0, 0.33, 0.12, 3.2, P["rail"], seg=8))
add(L.cone(coll, "Carousel_Roof", -360.0, 0.0, 3.2, 3.5, 0.3, 1.2, P["awning"], seg=16))
for k in range(6):
    a = TWO_PI * k / 6
    gx, gz = -360.0 + 2.2 * math.cos(a), 2.2 * math.sin(a)
    add(L.cyl(coll, f"Carousel_Rod{k}", gx, gz, 0.33, 0.03, 2.9, P["rail"], seg=4))
    add(L.box(coll, f"Carousel_Horse{k}", gx, gz, 0.9, 0.5, 1.1, 0.6, rnd.choice((P["pink"], P["blue"], P["yellow"], P["red"])), rot=-a, bevel=0.05))
cols.add("Carousel", -360.0, 0.0, 0.0, 6.6, 6.6, 1.5)
add(L.box(coll, "BallPit", -360.0, 15.0, 0.03, 4.0, 4.0, 0.7, P["blue"], bevel=0.03))
for k in range(30):
    add(L.cyl(coll, f"BallPit_Ball{k}", -361.6 + (k % 6) * 0.64, 13.4 + (k // 6) * 0.64, 0.73, 0.22, 0.3, rnd.choice((P["red"], P["yellow"], P["pink"], P["blue"])), seg=6))
cols.add("BallPit", -360.0, 15.0, 0.0, 4.0, 4.0, 0.8)
# food court: communal round tables with chairs, western props, string lights
tbl = 0
for gx in range(-370, -302, 8):
    for gz in (65.0, 71.0):
        add(L.cyl(coll, f"FC_Table{tbl}_Top", gx, gz, 0.72, 0.7, 0.05, P["wood"], seg=12))
        add(L.cyl(coll, f"FC_Table{tbl}_Leg", gx, gz, 0.0, 0.08, 0.72, P["dark"], seg=6))
        cols.add(f"FC_Table{tbl}", gx, gz, 0.0, 1.5, 1.5, 0.8)
        for k in range(4):
            a = TWO_PI * k / 4 + math.pi / 4
            add(L.furn(coll, f"FC_Chair{tbl}_{k}", gx + 1.05 * math.cos(a), gz + 1.05 * math.sin(a), -a + math.pi / 2, L.chair_parts(P, P["wood"])))
        cols.add(f"FC_Chairs{tbl}", gx, gz, 0.0, 2.6, 2.6, 0.9)
        tbl += 1
for i, gx in enumerate(range(-376, -300, 10)):
    add(L.cyl(coll, f"FC_Barrel{i}", gx, S_OUT - 1.5, 0.0, 0.4, 0.9, P["wood"], seg=10))
    cols.add(f"FC_Barrel{i}", gx, S_OUT - 1.5, 0.0, 0.9, 0.9, 0.9)
for i, gx in enumerate(range(-372, -300, 12)):
    add(L.cyl(coll, f"FC_Wheel{i}", gx, S_IN + 0.35, 2.3, 0.6, 0.1, P["wood"], seg=12)).rotation_euler = (math.pi / 2, 0.0, 0.0)
for gz in (63.0, 77.0):
    rect(f"FC_Lights{int(gz)}", -378.0, gz - 0.02, -302.0, gz + 0.02, 4.4, 0.04, P["steel"])
    for gx in range(-376, -302, 3):
        add(L.box(coll, f"FC_Bulb{int(gz)}_{gx}", gx, gz, 4.25, 0.1, 0.1, 0.15, P["lamp"], bevel=0.03))
add(L.box(coll, "FC_ArchL", -302.0, 62.0, 0.0, 0.4, 0.4, 4.6, P["wood"]))
add(L.box(coll, "FC_ArchR", -302.0, 78.0, 0.0, 0.4, 0.4, 4.6, P["wood"]))
add(L.box(coll, "FC_ArchTop", -302.0, 70.0, 4.6, 0.5, 16.4, 0.9, P["wood"]))
text("FC_ArchText", "FOOD COURT", -302.3, 70.0, 4.8, 0.5, P["sign"], -math.pi / 2)
text("FC_ArchTextB", "FOOD COURT", -301.7, 70.0, 4.8, 0.5, P["sign"], math.pi / 2)
cols.add("FC_ArchL", -302.0, 62.0, 0.0, 0.5, 0.5, 4.6)
cols.add("FC_ArchR", -302.0, 78.0, 0.0, 0.5, 0.5, 4.6)
# al fresca: fountain, awnings over the shopfronts, trees in planters, lamp posts
add(L.cyl(coll, "AF_FountainBasin", -230.0, 70.0, 0.0, 3.2, 0.6, P["stone"], seg=20))
add(L.cyl(coll, "AF_FountainWater", -230.0, 70.0, 0.45, 2.9, 0.1, P["water"], seg=20))
add(L.cyl(coll, "AF_FountainColumn", -230.0, 70.0, 0.55, 0.5, 1.6, P["stone"], seg=10))
add(L.cyl(coll, "AF_FountainBowl", -230.0, 70.0, 2.1, 1.1, 0.25, P["stone"], seg=14))
add(L.cyl(coll, "AF_FountainWater2", -230.0, 70.0, 2.3, 0.95, 0.06, P["water"], seg=14))
cols.add("AF_Fountain", -230.0, 70.0, 0.0, 6.4, 6.4, 1.0)
for c in cells:
    if c["plaza"] == "al_fresca" and c["level"] == 0 and c["status"] == P_:
        b = c["bounds"]
        front_z = b["minZ"] if c["row"].startswith("S_out") else b["maxZ"]
        d = -1 if c["row"].startswith("S_out") else 1
        add(L.box(coll, f"AF_Awning_{c['id']}", (b["minX"] + b["maxX"]) / 2, front_z + d * 0.8, 3.3, b["maxX"] - b["minX"] - 1.4, 1.6, 0.1, P["awning"]))
for i, gx in enumerate(range(-294, -166, 14)):
    if abs(gx - NL["x"]) < NL["w"] / 2 + 2.0:
        continue
    planter(f"AF_Planter{i}", gx, 64.0, 2.0, 2.0, flowers=False)
    tree("blossom" if i % 2 else "round", gx, 64.0, 0.8)
    lamp(f"AF_Lamp{i}", gx + 7.0, 76.0, 3.6)
    bench(f"AF_Bench{i}", gx + 7.0, 74.5, math.pi)
# ---------------------------------------------------------------- decor: kiosks, banners, way-finding, greenery, rest islands, sculptures
def kiosk(name, gx, gz, yaw, label, mat):
    """An octagonal sales kiosk in the middle of a walkway: desk, four posts, a tent roof and a two-sided sign."""
    add(L.cyl(coll, f"{name}_Desk", gx, gz, 0.0, 1.4, 1.05, P["wall"], seg=8))
    add(L.cyl(coll, f"{name}_Top", gx, gz, 1.05, 1.5, 0.06, mat, seg=8))
    for k in range(4):
        a = TWO_PI * k / 4 + math.pi / 4 + yaw
        add(L.cyl(coll, f"{name}_Post{k}", gx + 1.25 * math.cos(a), gz + 1.25 * math.sin(a), 1.11, 0.04, 1.5, P["steel"], seg=5))
    add(L.cone(coll, f"{name}_Roof", gx, gz, 2.6, 1.9, 0.2, 0.6, mat, seg=8))
    add(L.box(coll, f"{name}_Sign", gx, gz, 2.12, 2.2, 0.08, 0.42, P["dark"], rot=yaw))
    fx, fz = math.sin(yaw), math.cos(yaw)
    text(f"{name}_Text", label, gx + fx * 0.06, gz + fz * 0.06, 2.2, 0.26, P["sign"], yaw)
    text(f"{name}_TextB", label, gx - fx * 0.06, gz - fz * 0.06, 2.2, 0.26, P["sign"], yaw + math.pi)
    cols.add(name, gx, gz, 0.0, 3.0, 3.0, 1.1)


def banner(name, gx, gz, yaw, mat, label):
    """A cloth banner hung from a balcony edge, the store name on the walkway side."""
    add(L.box(coll, f"{name}_Bar", gx, gz, 5.5, 1.3, 0.06, 0.06, P["steel"], rot=yaw))
    add(L.box(coll, f"{name}_Cloth", gx, gz, 3.3, 1.1, 0.04, 2.2, mat, rot=yaw))
    fx, fz = math.sin(yaw), math.cos(yaw)
    text(f"{name}_Text", label, gx + fx * 0.03, gz + fz * 0.03, 4.15, 0.22, P["sign"], yaw)


def way_sign(name, body, gx, gz, yaw):
    """A hanging direction board at a walkway junction, readable when arriving."""
    add(L.box(coll, f"{name}_Board", gx, gz, 3.9, 3.4, 0.08, 0.6, P["band"], rot=yaw))
    fx, fz = math.sin(yaw), math.cos(yaw)
    text(f"{name}_Text", body, gx + fx * 0.06, gz + fz * 0.06, 4.05, 0.3, P["sign"], yaw)
    for o_ in (-1.5, 1.5):
        add(L.cyl(coll, f"{name}_Wire{int(o_ * 10)}", gx + o_ * math.cos(yaw), gz - o_ * math.sin(yaw), 4.5, 0.012, 1.1, P["steel"], seg=4))


def sculpture(name, gx, gz):
    """Stacked, slightly turned blocks on a stone drum: the corner courts' landmark."""
    add(L.cyl(coll, f"{name}_Base", gx, gz, 0.0, 1.6, 0.5, P["stone"], seg=12))
    y = 0.5
    for k, (ox, oz, s, h, mat) in enumerate(((0.0, 0.0, 1.1, 1.3, P["band"]), (0.3, -0.2, 0.8, 1.0, P["red"]), (-0.25, 0.25, 0.6, 0.9, P["yellow"]), (0.1, 0.1, 0.4, 0.8, P["blue"]))):
        add(L.box(coll, f"{name}_Cube{k}", gx + ox, gz + oz, y, s, s, h, mat, rot=0.4 * k, bevel=0.02))
        y += h
    cols.add(name, gx, gz, 0.0, 3.2, 3.2, 1.2)


for name, gx, gz, yaw, label, mat in (("Kiosk_IceCream", -180.0, -33.0, 0.0, "ICE CREAM", P["pink"]), ("Kiosk_News", -180.0, 33.0, math.pi, "COVE NEWS", P["blue"]),
                                       ("Kiosk_Pretzel", -280.0, -70.0, math.pi / 2, "PRETZELS", P["yellow"]), ("Kiosk_Phones", -232.0, -70.0, -math.pi / 2, "PHONE CASES", P["band"]),
                                       ("Kiosk_Juice", -270.0, 70.0, math.pi / 2, "FRESH JUICE", P["red"]), ("Kiosk_Gelato", -195.0, 70.0, -math.pi / 2, "GELATO", P["pink"]),
                                       ("Kiosk_Balloons", -360.0, 36.0, 0.0, "BALLOONS", P["yellow"]), ("Kiosk_Coffee", -345.0, -70.0, math.pi / 2, "COFFEE CART", P["wood"])):
    kiosk(name, gx, gz, yaw, label, mat)
# banners under the three upper-level balconies, every 24 m, clear of the escalators at the wing ends and of the pillars
BANNER_LABELS = ("NORTHLINE", "HEARTH & HOLLOW", "GREENCART", "CANDY CLOUD", "CRISPIN'S", "SUMMIT SPORTS", "SALE", "NEW SEASON")
BANNER_MATS = (P["band"], P["red"], P["blue"], P["yellow"], P["pink"])
bn = 0
for key, axis, a0, a1, edges in (("E", "z", PARK[2], PARK[3], ((E_OUT - BAL, -math.pi / 2, 0.7), (E_IN + BAL, math.pi / 2, -0.7))),
                                  ("P", "x", P_UP[0], P_UP[1], ((N_OUT + BAL, 0.0, -0.7), (N_IN - BAL, math.pi, 0.7))),
                                  ("W", "z", PARK[2], PARK[3], ((W_OUT + BAL, math.pi / 2, -0.7), (W_IN - BAL, -math.pi / 2, 0.7)))):
    for edge, yaw, inward in edges:
        for p in range(int(a0) + 14, int(a1) - 13, 24):
            if key == "W" and edge < -360.0 and 0.0 <= p <= 26.0:
                continue
            gx, gz = (p, edge) if axis == "x" else (edge, p)
            banner(f"Banner_{key}_{bn}", gx, gz, yaw, BANNER_MATS[bn % len(BANNER_MATS)], BANNER_LABELS[bn % len(BANNER_LABELS)])
            bn += 1
        # flower boxes on the balcony floor, 0.7 m inside the edge (`inward`), between the banners
        for p in range(int(a0) + 26, int(a1) - 13, 24):
            gx, gz = (p, edge + inward) if axis == "x" else (edge + inward, p)
            add(L.box(coll, f"Planter_Bal_{key}_{p}_Box", gx, gz, L1_Y, 1.2 if axis == "x" else 0.4, 0.4 if axis == "x" else 1.2, 0.4, P["band"], bevel=0.02))
            add(L.box(coll, f"Planter_Bal_{key}_{p}_Flower", gx, gz, L1_Y + 0.4, 1.0 if axis == "x" else 0.3, 0.3 if axis == "x" else 1.0, 0.18, rnd.choice((P["flower"], P["flower2"], P["pink"])), bevel=0.04))
way_sign("Way_North", "PARADISE PLAZA · NORTH PLAZA", -183.0, -56.0, 0.0)
way_sign("Way_South", "AL FRESCA · FOOD COURT", -183.0, 56.0, math.pi)
way_sign("Way_West", "NORTH PLAZA · WONDERLAND", -300.0, -70.0, math.pi / 2)
way_sign("Way_East", "AL FRESCA · ENTRANCE", -300.0, 70.0, -math.pi / 2)
# greenery: potted trees along the Wonderland walkway and in the north-west court, bins by the Paradise planters
for gz in (-42.0, -30.0, -18.0, 18.0, 30.0, 42.0):
    planter(f"Planter_W{int(gz)}", -353.2, gz, 1.6, 1.6, flowers=False)
    tree("round", -353.2, gz, 0.7)
planter("Planter_CourtNW", -360.0, -70.0, 2.0, 2.0, flowers=False)
tree("blossom", -360.0, -70.0, 0.8)
for i, gx in enumerate(range(-280, -200, 16)):
    bin_(f"Bin_N{i}", gx + 9.4, -70.0)
# rest islands in the Wonderland walkway, landmarks in the two east courts
for gz in (-24.0, 24.0, -46.0, 46.0):
    bench(f"Bench_W{int(gz)}", -366.0, gz, math.pi / 2)
    bin_(f"Bin_W{int(gz)}", -366.0, gz + 2.5)
sculpture("Sculpture_NE", -180.0, -70.0)
sculpture("Sculpture_SE", -180.0, 70.0)
# park-side elevation: a cornice band and climbing plants on the backs of the inner rows
for name, x0, z0, x1, z1 in (("ParkWallN", PARK[0], PARK[2] - 0.35, PARK[1], PARK[2] - 0.05), ("ParkWallS", PARK[0], PARK[3] + 0.05, PARK[1], PARK[3] + 0.35),
                             ("ParkWallW", PARK[0] - 0.35, PARK[2], PARK[0] - 0.05, PARK[3]), ("ParkWallE", PARK[1] + 0.05, PARK[2], PARK[1] + 0.35, PARK[3])):
    rect(f"{name}_Cornice", x0, z0, x1, z1, CELL_H, 0.4, P["band"])

# ---------------------------------------------------------------- leisure park
px0, px1, pz0, pz1 = PARK
rect("Park_Lawn", px0, pz0, px1, pz1, -0.12, 0.1, P["grass"], tile=2.0)
for i in range(14):
    gx, gz = rnd.uniform(px0 + 8, px1 - 8), rnd.uniform(pz0 + 8, pz1 - 8)
    if math.hypot(gx + 270.0, gz) < 16:
        continue
    add(L.cyl(coll, f"Park_Patch{i}", gx, gz, -0.01, rnd.uniform(3.0, 6.0), 0.01, P["grass2"], seg=9))
CX, CZ = (px0 + px1) / 2, 0.0
rect("Park_PathNS", CX - 2.0, pz0, CX + 2.0, pz1, -0.005, 0.02, P["path"], tile=2.0)
rect("Park_PathEW", px0, CZ - 2.0, px1, CZ + 2.0, -0.005, 0.02, P["path"], tile=2.0)
rect("Park_PathExitN", -252.0, pz0, -248.0, -11.0, -0.005, 0.02, P["path"], tile=2.0)
rect("Park_PathExitS", -252.0, 11.0, -248.0, pz1, -0.005, 0.02, P["path"], tile=2.0)
add(L.cyl(coll, "Park_Plaza", CX, CZ, 0.0, 12.0, 0.02, P["paving"], seg=28))
add(L.cyl(coll, "Park_Ring", CX, CZ, 0.0, 24.0, 0.012, P["path"], seg=36))
add(L.cyl(coll, "Park_RingInner", CX, CZ, 0.0, 21.0, 0.015, P["grass"], seg=36))
# clock tower (Dead Rising's landmark) on the central plaza
add(L.box(coll, "Clock_Base", CX, CZ, 0.0, 4.4, 4.4, 1.2, P["stone"], bevel=0.04))
add(L.box(coll, "Clock_Shaft", CX, CZ, 1.2, 3.0, 3.0, 11.0, P["brick"], tile=2.0))
add(L.box(coll, "Clock_Head", CX, CZ, 12.2, 3.6, 3.6, 2.6, P["stone"]))
for k, (dx, dz, yaw) in enumerate(((0, 1.82, 0.0), (0, -1.82, math.pi), (1.82, 0, -math.pi / 2), (-1.82, 0, math.pi / 2))):
    add(L.cyl(coll, f"Clock_Face{k}", CX + dx, CZ + dz, 13.5, 1.0, 0.05, P["clock"], seg=16))
    objs[-1].rotation_euler = (math.pi / 2, 0.0, yaw)
    add(L.box(coll, f"Clock_HandH{k}", CX + dx * 1.03, CZ + dz * 1.03, 13.45, 0.08 if dz else 0.06, 0.06 if dz else 0.08, 0.6, P["dark"]))
    add(L.box(coll, f"Clock_HandM{k}", CX + dx * 1.03, CZ + dz * 1.03, 13.5, 0.8 if dz else 0.06, 0.06 if dz else 0.8, 0.06, P["dark"]))
add(L.cone(coll, "Clock_Spire", CX, CZ, 14.8, 2.4, 0.05, 3.0, P["band"], seg=4))
cols.add("Clock_Tower", CX, CZ, 0.0, 4.4, 4.4, 4.0)
# manhole to the sewers (the escape route) and a small pond with a bridge
add(L.cyl(coll, "Park_Manhole", CX + 7.0, CZ + 6.0, 0.02, 0.5, 0.03, P["dark"], seg=12))
add(L.cyl(coll, "Park_PondBed", CX - 30.0, CZ - 22.0, -0.02, 8.0, 0.02, P["stone"], seg=20))
add(L.cyl(coll, "Park_PondWater", CX - 30.0, CZ - 22.0, 0.0, 7.4, 0.03, P["water"], seg=20))
add(L.cyl(coll, "Park_PondRim", CX - 30.0, CZ - 22.0, 0.0, 8.0, 0.25, P["stone"], seg=20))
cols.add("Park_PondRim", CX - 30.0, CZ - 22.0, 0.0, 16.0, 16.0, 0.9)
# trees, benches, lamps around the ring and along the paths
for k in range(18):
    a = TWO_PI * k / 18 + 0.1
    r = 23.0
    gx, gz = CX + r * math.cos(a), CZ + r * math.sin(a)
    if abs(gx - CX) < 3.0 or abs(gz - CZ) < 3.0:
        continue
    if k % 3 == 0:
        bench(f"Park_Bench{k}", gx, gz, -a + math.pi / 2)
    elif k % 3 == 1:
        lamp(f"Park_Lamp{k}", gx, gz, 3.6)
    else:
        bin_(f"Park_Bin{k}", gx, gz)
for k in range(44):
    gx, gz = rnd.uniform(px0 + 4, px1 - 4), rnd.uniform(pz0 + 4, pz1 - 4)
    if abs(gx - CX) < 4.0 or abs(gz - CZ) < 4.0 or abs(gx + 250.0) < 4.0 or 19.0 < math.hypot(gx - CX, gz - CZ) < 26.0 or math.hypot(gx - CX, gz - CZ) < 13.0:
        continue
    if math.hypot(gx - (CX - 30.0), gz - (CZ - 22.0)) < 10.0:
        continue
    tree(rnd.choice(("round", "round", "pine", "blossom")), gx, gz, rnd.uniform(0.9, 1.3))
for k in range(10):
    gx, gz = rnd.uniform(px0 + 6, px1 - 6), rnd.uniform(pz0 + 6, pz1 - 6)
    if abs(gx - CX) < 4.0 or abs(gz - CZ) < 4.0 or abs(gx + 250.0) < 4.0 or math.hypot(gx - CX, gz - CZ) < 14.0:
        continue
    for j in range(8):
        add(L.cyl(coll, f"Park_Flower{k}_{j}", gx + rnd.uniform(-1.0, 1.0), gz + rnd.uniform(-1.0, 1.0), 0.0, 0.12, rnd.uniform(0.25, 0.45),
                  rnd.choice((P["flower"], P["flower2"], P["pink"])), seg=5))
for k, (gx, gz) in enumerate(((CX - 1.5, pz0 + 6.0), (CX + 1.5, pz1 - 6.0), (px0 + 6.0, CZ - 3.0), (px1 - 6.0, CZ + 3.0))):
    lamp(f"Park_PathLamp{k}", gx + (2.8 if gz in (pz0 + 6.0, pz1 - 6.0) else 0.0), gz + (0.0 if gz in (pz0 + 6.0, pz1 - 6.0) else 2.8), 3.6)

# ---------------------------------------------------------------- forecourt and the path from the clinic
FORE = (X1, X1 + 14.0, -14.0, 14.0)
rect("Fore_Paving", FORE[0], FORE[2], FORE[1], FORE[3], -0.1, 0.1, P["paving"], tile=2.0)
for i, gz in enumerate((-11.0, 11.0)):
    planter(f"Fore_Planter{i}", X1 + 8.0, gz, 3.0, 1.2)
    bench(f"Fore_Bench{i}", X1 + 11.5, gz, math.pi / 2 if gz > 0 else -math.pi / 2)
    lamp(f"Fore_Lamp{i}", X1 + 3.0, gz, 4.0)
add(L.box(coll, "Fore_Totem", X1 + 12.5, -6.0, 0.0, 0.6, 2.4, 7.0, P["band"]))
add(L.box(coll, "Fore_TotemTop", X1 + 12.5, -6.0, 7.0, 0.8, 2.8, 1.6, P["dark"]))
text("Fore_TotemText", "COVE PARKVIEW", X1 + 12.86, -6.0, 5.2, 0.42, P["sign"], math.pi / 2)
text("Fore_TotemText2", "MALL", X1 + 12.86, -6.0, 4.4, 0.6, P["neon"], math.pi / 2)
text("Fore_TotemTextB", "COVE PARKVIEW", X1 + 12.14, -6.0, 5.2, 0.42, P["sign"], -math.pi / 2)
text("Fore_TotemText2B", "MALL", X1 + 12.14, -6.0, 4.4, 0.6, P["neon"], -math.pi / 2)
cols.add("Fore_Totem", X1 + 12.5, -6.0, 0.0, 0.8, 2.6, 7.0)
for i in range(4):
    add(L.box(coll, f"Fore_BikeRack{i}", X1 + 10.0 + i * 0.8, 9.0, 0.0, 0.08, 1.2, 0.8, P["metal"]))
cols.add("Fore_BikeRacks", X1 + 11.2, 9.0, 0.0, 3.2, 1.3, 0.8)
# the avenue: from a new gate in the town hedge (north-west, mirror of the clinic gate) straight to the forecourt,
# with sidewalks, lamps, trees, a parking lot and a bus shelter; apply-mall.mjs cuts the hedge at HEDGE_GATE
HEDGE_GATE = {"x": -44.6, "z": -12.0, "width": 11.0}
AVENUE = [(HEDGE_GATE["x"] - 0.5, HEDGE_GATE["z"]), (-118.0, -12.0), (FORE[1] + 0.4, -8.0)]
ROAD_W, WALK_W = 7.0, 1.8
for i, ((ax, az), (bx, bz)) in enumerate(zip(AVENUE, AVENUE[1:])):
    cx, cz = (ax + bx) / 2, (az + bz) / 2
    seg = math.hypot(bx - ax, bz - az)
    dx, dz = (bx - ax) / seg, (bz - az) / seg
    nx, nz = -dz, dx
    yaw = -math.atan2(bz - az, bx - ax)
    add(L.box(coll, f"Avenue_Road{i}", cx, cz, 0.0, seg + 0.8, ROAD_W, 0.03, P["service"], rot=yaw, tile=3.0))
    for side in (-1, 1):
        off = ROAD_W / 2 + WALK_W / 2
        add(L.box(coll, f"Avenue_Walk{i}_{side + 1}", cx + side * nx * off, cz + side * nz * off, 0.0, seg + 0.8, WALK_W, 0.1, P["paving"], rot=yaw, tile=2.0))
        add(L.box(coll, f"Avenue_Curb{i}_{side + 1}", cx + side * nx * (ROAD_W / 2 + 0.08), cz + side * nz * (ROAD_W / 2 + 0.08), 0.0, seg + 0.8, 0.16, 0.12, P["stone"], rot=yaw))
    for k in range(int(seg / 6)):
        t = 3.0 + k * 6.0
        add(L.box(coll, f"Avenue_Dash{i}_{k}", ax + dx * t, az + dz * t, 0.03, 2.0, 0.14, 0.01, P["soon"], rot=yaw))
    for k, t in enumerate(range(6, int(seg) - 3, 12)):
        side = 1 if k % 2 else -1
        off = ROAD_W / 2 + WALK_W + 0.7
        lamp(f"Avenue_Lamp{i}_{k}", ax + dx * t + side * nx * off, az + dz * t + side * nz * off, 4.0)
        if 10 < t < seg - 10:
            tree("round" if k % 3 else "pine", ax + dx * (t + 6) - side * nx * (off + 1.5), az + dz * (t + 6) - side * nz * (off + 1.5), 1.0)
    for k, t in enumerate(range(18, int(seg) - 6, 24)):
        bench(f"Avenue_Bench{i}_{k}", ax + dx * t + nx * (ROAD_W / 2 + WALK_W + 0.4), az + dz * t + nz * (ROAD_W / 2 + WALK_W + 0.4), yaw + math.pi)
        bin_(f"Avenue_Bin{i}_{k}", ax + dx * (t + 2.2) + nx * (ROAD_W / 2 + WALK_W + 0.4), az + dz * (t + 2.2) + nz * (ROAD_W / 2 + WALK_W + 0.4))
# gate totem, readable from the town and from the avenue
tx, tz = HEDGE_GATE["x"] - 3.0, HEDGE_GATE["z"] - ROAD_W / 2 - WALK_W - 1.6
add(L.box(coll, "Avenue_TotemPost", tx, tz, 0.0, 0.4, 0.4, 5.0, P["band"]))
add(L.box(coll, "Avenue_TotemBoard", tx, tz, 2.6, 0.5, 3.4, 1.6, P["dark"]))
text("Avenue_TotemText", "COVE PARKVIEW MALL", tx + 0.26, tz, 3.4, 0.36, P["neon"], math.pi / 2)
text("Avenue_TotemText2", "< 2 MIN WALK", tx + 0.26, tz, 2.85, 0.3, P["sign"], math.pi / 2)
text("Avenue_TotemTextB", "COVE PARKVIEW MALL", tx - 0.26, tz, 3.4, 0.36, P["neon"], -math.pi / 2)
text("Avenue_TotemText2B", "TOWN >", tx - 0.26, tz, 2.85, 0.3, P["sign"], -math.pi / 2)
cols.add("Avenue_Totem", tx, tz, 0.0, 0.6, 3.6, 5.0)
# parking lot north of the avenue, next to the forecourt
PX0, PX1, PZ0, PZ1 = -140.0, -100.0, -34.0, -19.0
rect("Parking_Asphalt", PX0, PZ0, PX1, PZ1, -0.09, 0.1, P["service"], tile=3.0)
rect("Parking_Entry", -124.0, PZ1, -116.0, -12.0 - ROAD_W / 2, -0.09, 0.1, P["service"], tile=3.0)
rect("Parking_Kerb", PX0, PZ0 - 0.3, PX1, PZ0, 0.0, 0.14, P["stone"], col=True)
for k in range(15):
    x = PX0 + 1.0 + k * 2.7
    rect(f"Parking_LineN{k}", x - 0.06, PZ0 + 0.3, x + 0.06, PZ0 + 5.3, 0.01, 0.01, P["soon"])
    rect(f"Parking_LineS{k}", x - 0.06, PZ1 - 5.3, x + 0.06, PZ1 - 0.3, 0.01, 0.01, P["soon"])
CAR_COLORS = (P["red"], P["blue"], P["yellow"], P["dark"], P["wall"], P["pink"], P["band"])
for k, (bay, north) in enumerate(((1, True), (3, True), (6, True), (9, False), (11, True), (2, False), (13, False))):
    gx = PX0 + 1.0 + bay * 2.7 + 1.35
    gz = PZ0 + 2.8 if north else PZ1 - 2.8
    body = CAR_COLORS[k % len(CAR_COLORS)]
    add(L.box(coll, f"Car{k}_Body", gx, gz, 0.3, 1.8, 4.2, 0.6, body, bevel=0.06))
    add(L.box(coll, f"Car{k}_Cabin", gx, gz + (0.2 if north else -0.2), 0.9, 1.6, 2.0, 0.6, P["glass"], bevel=0.08))
    for wx, wz in ((-0.85, -1.3), (0.85, -1.3), (-0.85, 1.3), (0.85, 1.3)):
        w = add(L.cyl(coll, f"Car{k}_Wheel{int(wx * 10)}{int(wz * 10)}", gx + wx, gz + wz, 0.3, 0.3, 0.22, P["dark"], seg=10))
        w.rotation_euler = (0.0, math.pi / 2, 0.0)
    cols.add(f"Car{k}", gx, gz, 0.0, 2.0, 4.4, 1.5)
add(L.box(coll, "Parking_SignPost", PX1 + 1.0, PZ1 - 1.0, 0.0, 0.12, 0.12, 2.6, P["steel"]))
add(L.box(coll, "Parking_SignBoard", PX1 + 1.0, PZ1 - 1.0, 2.0, 0.08, 0.9, 0.9, P["blue"]))
text("Parking_SignText", "P", PX1 + 1.05, PZ1 - 1.0, 2.15, 0.6, P["sign"], math.pi / 2)
cols.add("Parking_Sign", PX1 + 1.0, PZ1 - 1.0, 0.0, 0.3, 1.0, 2.6)
# bus shelter at the end of the avenue, facing the forecourt
BUS = (FORE[1] + 4.0, -12.0 - ROAD_W / 2 - WALK_W - 1.8)
add(L.box(coll, "Bus_Roof", BUS[0], BUS[1], 2.5, 4.4, 1.6, 0.12, P["dark"]))
add(L.box(coll, "Bus_Back", BUS[0], BUS[1] - 0.7, 0.0, 4.2, 0.06, 2.5, P["glass"]))
cols.add("Bus_Back", BUS[0], BUS[1] - 0.7, 0.0, 4.2, 0.1, 2.5)
for gx in (BUS[0] - 2.1, BUS[0] + 2.1):
    add(L.box(coll, f"Bus_Side{int(gx)}", gx, BUS[1], 0.0, 0.06, 1.5, 2.5, P["glass"]))
    cols.add(f"Bus_Side{int(gx)}", gx, BUS[1], 0.0, 0.1, 1.5, 2.5)
bench("Bus_Bench", BUS[0], BUS[1] - 0.3, 0.0)
add(L.box(coll, "Bus_SignBoard", BUS[0] + 2.4, BUS[1] + 0.6, 2.0, 0.6, 0.06, 0.6, P["yellow"]))
add(L.box(coll, "Bus_SignPost", BUS[0] + 2.4, BUS[1] + 0.6, 0.0, 0.08, 0.08, 2.0, P["steel"]))
text("Bus_SignText", "BUS", BUS[0] + 2.4, BUS[1] + 0.64, 2.15, 0.3, P["dark"], 0.0)
cols.add("Bus_Sign", BUS[0] + 2.4, BUS[1] + 0.6, 0.0, 0.6, 0.2, 2.6)
# the area behind the anchors: paving around their bodies and a few trees
for a in ANCHORS:
    lo, hi = a["x"] - a["w"] / 2 - 6.0, a["x"] + a["w"] / 2 + 6.0
    depth = a["ext"]["footprint"][1]
    if a["rotationY"] == 0.0:
        rect(f"Apron_{a['key']}", lo, Z0 - depth - 4.0, hi, Z0, -0.11, 0.1, P["service"], tile=3.0)
    else:
        rect(f"Apron_{a['key']}", lo, Z1, hi, Z1 + depth + 4.0, -0.11, 0.1, P["service"], tile=3.0)

# ---------------------------------------------------------------- checks, merge, export
bad = L.check_grounded(objs, allow=("Floor", "Roof", "Slab", "Svc_", "Outer_", "Return_", "Lintel_", "Cell_", "Exit", "Entrance_", "Rail_", "Esc_",
                                   "Pillar_", "BalLight_", "Truss_", "Ware_", "Sec_", "Stair_", "Sign_", "Directory_", "Info_", "Play_", "Carousel_",
                                   "BallPit", "FC_", "AF_", "ParkWall", "Park_", "Clock_", "Fore_", "Path_", "Apron_", "Dock_", "Reno_", "MT_", "Bench_",
                                   "Planter_", "Bin_", "Lamp", "Bulb", "Plinth", "RoofLight_", "SvcLight_", "Avenue_", "Parking_", "Car", "Bus_", "Kiosk_", "Banner_", "Way_", "Sculpture_"))
print("MALL grounded violations:", bad[:10], len(bad))

by_mat = {}
merged = []
for o in objs:
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
tris = sum(len(p.vertices) - 2 for o in merged if o.type == "MESH" for p in o.data.polygons)
print("mall:", len(objs), "objects ->", len(merged), "nodes,", tris, "tris,", len(cols.items), "collision boxes,", len(cells), "cells,", len(stairs), "stairs,", texts, "texts,", len(cell_stores), "cell stores", [c["position"] for c in cell_stores])
