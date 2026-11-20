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
import bmesh
import bpy
from mathutils import Matrix

ONLY = globals().get("ONLY_DECOR")
MAX_MATERIALS = 6
CART_W, CART_L = 0.56, 0.86
CART_FLOOR_Y, CART_TOP_Y, CART_HANDLE_Y = 0.36, 0.88, 1.0
WIRE = 0.014
BALLOON_RADIUS = 0.2
BALLOON_SPACING = 0.34
ARCH_RADIUS = 2.2
ARCH_BASE_Y = 1.0
PLANTER_SCALE = 1.6
PLANTER_CUT = 0.74
PLANTER_HANG_HEIGHT = 2.8
PLANTER_CHAIN_RADIUS = 0.42

sc = L.new_build_scene("DECOR_mall_builders")
coll = bpy.data.collections.new("MallBuilders")
sc.collection.children.link(coll)

CHROME = L.make_mat("DCM_Chrome", "#c4c9d0", 0.4, "noise", 0.02)
CART_PLASTIC = L.make_mat("DCM_CartPlastic", "#d9473a", 0.6, "noise", 0.02)
DARK = L.make_mat("DCM_Dark", "#2b2e34", 0.7, "noise", 0.02)
CORRAL_ROOF = L.make_mat("DCM_CorralRoof", "#3f6fb5", 0.6, "noise", 0.02)
BALLOONS = [L.make_mat(f"DCM_Balloon{i}", hexcol, 0.35, "noise", 0.01) for i, hexcol in enumerate(("#f2a7c3", "#8fd0e8", "#f6d04d", "#9bd9a5", "#c7a8e8"))]
_counter = {"n": 0}


def bar(x, z, y0, sx, sz, h, mat):
    _counter["n"] += 1
    return L.box(coll, f"B{_counter['n']}", x, z, y0, sx, sz, h, mat)


def cart(ox, oz, lite=False):
    parts = []
    step = 0.14 if lite else 0.07
    half_w, half_l = CART_W / 2, CART_L / 2
    for k in range(int(CART_W / step) + 1):
        parts.append(bar(ox - half_w + k * step, oz, CART_FLOOR_Y, WIRE, CART_L, WIRE, CHROME))
    for k in range(int(CART_L / 0.14) + 1):
        parts.append(bar(ox, oz - half_l + k * 0.14, CART_FLOOR_Y, CART_W, WIRE, WIRE, CHROME))
    for y in ((0.62, CART_TOP_Y) if lite else (0.56, 0.72, CART_TOP_Y)):
        for sz in (-half_l, half_l):
            parts.append(bar(ox, oz + sz, y, CART_W, WIRE, WIRE, CHROME))
        for sx in (-half_w, half_w):
            parts.append(bar(ox + sx, oz, y, WIRE, CART_L, WIRE, CHROME))
    for sx in (-half_w, half_w):
        for sz in (-half_l, half_l):
            parts.append(bar(ox + sx, oz + sz, CART_FLOOR_Y, WIRE, WIRE, CART_TOP_Y - CART_FLOOR_Y, CHROME))
            parts.append(bar(ox + sx * 0.85, oz + sz * 0.9, 0.08, WIRE * 1.4, WIRE * 1.4, CART_FLOOR_Y - 0.08, CHROME))
            parts.append(bar(ox + sx * 0.85, oz + sz * 0.9, 0.0, 0.035, 0.07, 0.08, DARK))
    for sx in (-half_w * 0.85, half_w * 0.85):
        parts.append(bar(ox + sx, oz - half_l * 0.9, CART_FLOOR_Y, WIRE * 1.4, WIRE * 1.4, CART_HANDLE_Y - CART_FLOOR_Y, CHROME))
    parts.append(bar(ox, oz - half_l * 0.9, CART_HANDLE_Y, CART_W * 0.85, 0.035, 0.035, CART_PLASTIC))
    return parts


def shopping_cart():
    return cart(0.0, 0.0)


def cart_corral():
    length, width, roof_y = 2.6, 1.0, 1.5
    parts = []
    for k in range(3):
        parts += cart(0.0, -0.9 + k * 0.45, lite=True)
    for sx in (-width / 2, width / 2):
        for sz in (-length / 2, length / 2):
            parts.append(bar(sx, sz, 0.0, 0.06, 0.06, roof_y, DARK))
        for y in (0.5, 0.95):
            parts.append(bar(sx, 0.0, y, 0.03, length, 0.03, CHROME))
    parts.append(bar(0.0, -length / 2, 0.5, width, 0.03, 0.03, CHROME))
    parts.append(bar(0.0, 0.0, roof_y, width + 0.1, length + 0.1, 0.05, CORRAL_ROOF))
    return parts


def balloon_arch():
    parts = []
    for sx in (-ARCH_RADIUS, ARCH_RADIUS):
        parts.append(L.cyl(coll, f"Base{sx}", sx, 0.0, 0.0, 0.3, 0.06, CHROME, seg=10))
        parts.append(L.cyl(coll, f"Pole{sx}", sx, 0.0, 0.06, 0.02, ARCH_BASE_Y - 0.06, CHROME, seg=6))
    count = int(math.pi * ARCH_RADIUS / BALLOON_SPACING)
    for row, offset in enumerate((-0.12, 0.12)):
        for k in range(count + 1):
            angle = math.pi * (k + 0.5 * row) / count
            x, y = ARCH_RADIUS * math.cos(angle), ARCH_BASE_Y + ARCH_RADIUS * math.sin(angle)
            parts.append(L.sphere(coll, f"Balloon{row}_{k}", x, offset, y - BALLOON_RADIUS, BALLOON_RADIUS, BALLOONS[(k + row * 2) % len(BALLOONS)], seg=6, rings=4))
    return parts


def hanging_planter():
    meshes = L.import_ai_model(coll, "hanging_planter_b", "DCM_HangingPlanter", palette=6, saturation=1.3)
    for o in meshes:
        o.data.transform(o.matrix_world)
        o.data.transform(Matrix.Scale(PLANTER_SCALE, 4))
        o.matrix_world = o.matrix_world.Identity(4)
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, PLANTER_CUT), plane_no=(0, 0, 1), clear_outer=True)
        bm.to_mesh(o.data)
        bm.free()
    parts = list(meshes)
    for k in range(3):
        angle = 2 * math.pi * k / 3
        parts.append(L.cyl(coll, f"Chain{k}", PLANTER_CHAIN_RADIUS * math.cos(angle), -PLANTER_CHAIN_RADIUS * math.sin(angle), PLANTER_CUT - 0.1, 0.012, PLANTER_HANG_HEIGHT - PLANTER_CUT + 0.1, DARK, seg=5))
    parts.append(L.cyl(coll, "CeilingPlate", 0.0, 0.0, PLANTER_HANG_HEIGHT, PLANTER_CHAIN_RADIUS + 0.06, 0.03, DARK, seg=10))
    return parts


DECOR = {"shopping_cart": shopping_cart, "cart_corral": cart_corral, "balloon_arch": balloon_arch, "hanging_planter": hanging_planter}
results = [L.ship_decor(sc, coll, key, build(), MAX_MATERIALS) for key, build in DECOR.items() if not ONLY or key in ONLY]
print("MALL BUILDERS", results)
