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
from mathutils import Matrix, Vector

ONLY = globals().get("ONLY_DECOR")
MAX_MATERIALS = 6

BARRE_LENGTH = 2.8
BARRE_RAIL_Y = 1.0
BARRE_RAIL_R = 0.025
BARRE_REACH = 0.2
BARRE_BRACKET_XS = (-1.2, 0.0, 1.2)
BARRE_PLATE_H = 0.16
BARRE_ARM_Y = BARRE_RAIL_Y - BARRE_RAIL_R - 0.03
BARRE_PLATE_Y0 = BARRE_ARM_Y + 0.015 - BARRE_PLATE_H / 2

SPEAKER_SIZE = (0.6, 0.5, 1.2)

BALL_R = 0.25
CHAIN_LENGTH = 0.3
CHAIN_LINK = 0.05
CANOPY_H = 0.03
BALL_CAP_H = 0.04
CHAIN_LINKS = round(CHAIN_LENGTH / CHAIN_LINK)
CHAIN_END_Y = -CANOPY_H - CHAIN_LINKS * CHAIN_LINK
BALL_Y0 = CHAIN_END_Y - BALL_CAP_H - 2 * BALL_R + 0.01

sc = L.new_build_scene("DECOR_dance")
coll = bpy.data.collections.new("DanceDecor")
sc.collection.children.link(coll)


def glossy(name, base, rough, metallic, pattern, accent=None):
    mat = L.make_mat(name, base, rough, pattern, 0.03, accent=accent)
    next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED").inputs["Metallic"].default_value = metallic
    return mat


def fitted(meshes, size):
    for o in meshes:
        o.data.transform(o.matrix_world)
        o.matrix_world.identity()
    pts = [v.co for o in meshes for v in o.data.vertices]
    extent = Vector(tuple(max(p[i] for p in pts) - min(p[i] for p in pts) for i in range(3)))
    scale = Matrix.Diagonal((*(size[i] / extent[i] for i in range(3)), 1.0))
    for o in meshes:
        o.data.transform(scale)
    return meshes


def speaker():
    return fitted(L.import_ai_model(coll, "a_black_floor_pa_loudspeaker_cabinet_wit", "DC_DanceSpeaker"), SPEAKER_SIZE)


def barre():
    wood = L.make_mat("DC_DanceBarreWood", "#c9a36a", 0.4, "planks", 0.03, accent="#a98550")
    steel = glossy("DC_DanceBarreSteel", "#9aa0a6", 0.35, 0.6, "noise")
    rail = L.cyl(coll, "BarreRail", 0.0, 0.0, 0.0, BARRE_RAIL_R, BARRE_LENGTH, wood, seg=10)
    rail.rotation_euler.y = math.pi / 2
    rail.location = L.b(-BARRE_LENGTH / 2, BARRE_REACH, BARRE_RAIL_Y)
    parts = []
    for k, gx in enumerate(BARRE_BRACKET_XS):
        parts.append(L.box(coll, f"BarrePlate{k}", gx, 0.0, BARRE_PLATE_Y0, 0.08, 0.02, BARRE_PLATE_H, steel))
        parts.append(L.box(coll, f"BarreArm{k}", gx, BARRE_REACH / 2, BARRE_ARM_Y, 0.03, BARRE_REACH, 0.03, steel))
    return parts + [rail]


def disco_ball():
    mirror = glossy("DC_DiscoBallMirror", "#d9dde3", 0.1, 0.6, "tiles", accent="#8a9099")
    chrome = glossy("DC_DiscoBallChain", "#b8bcc2", 0.25, 0.8, "noise")
    parts = [L.cyl(coll, "DiscoCanopy", 0.0, 0.0, -CANOPY_H, 0.06, CANOPY_H, chrome, seg=10)]
    for k in range(CHAIN_LINKS):
        top = -CANOPY_H - k * CHAIN_LINK
        sx, sz = (0.022, 0.008) if k % 2 == 0 else (0.008, 0.022)
        parts.append(L.box(coll, f"DiscoChain{k}", 0.0, 0.0, top - CHAIN_LINK - 0.005, sx, sz, CHAIN_LINK + 0.01, chrome))
    parts.append(L.cyl(coll, "DiscoCap", 0.0, 0.0, CHAIN_END_Y - BALL_CAP_H, 0.04, BALL_CAP_H, chrome, seg=10))
    parts.append(L.sphere(coll, "DiscoBall", 0.0, 0.0, BALL_Y0, BALL_R, mirror, seg=16, rings=10, tile=0.08))
    return parts


DECOR = {
    "dance_speaker": lambda: L.ship_decor(sc, coll, "dance_speaker", speaker(), MAX_MATERIALS),
    "disco_ball": lambda: L.ship_decor(sc, coll, "disco_ball", disco_ball(), MAX_MATERIALS, bottom=BALL_Y0),
    "dance_barre": lambda: L.ship_decor(sc, coll, "dance_barre", barre(), MAX_MATERIALS, bottom=BARRE_PLATE_Y0),
}

results = [ship() for key, ship in DECOR.items() if not ONLY or key in ONLY]
print("DANCE DECOR", results)
