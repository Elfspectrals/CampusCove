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
import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ONLY = globals().get("ONLY_DECOR")
MAX_MATERIALS = 4
RULES = os.path.join(L.FRONT_ASSETS, "sports", "rules")
BALL_DIAMETER = {
    sport: 2 * json.load(open(os.path.join(RULES, f"{sport}.json"), encoding="utf-8"))["ball"]["radiusM"]
    for sport in ("football", "basketball")
}
AI = {
    "basketball": "a_single_orange_basketball_with_black_se",
    "bench": "a_long_sports_team_bench_with_a_backrest",
    "rack": "an_empty_black_steel_ball_rack_with_two_",
    "cart": "a_rolling_ball_bin_cart_with_solid_blue_",
    "lockers": "a_row_of_three_tall_teal_metal_sports_lo",
    "scoreboard": "a_wall_mounted_digital_sports_scoreboard",
}
BALLS_PER_SHELF = 3
CART_BALLS = 6
SHELF_MERGE_M = 0.03
PALETTE = {"bench": 4, "rack": 3, "cart": 4, "lockers": 5, "scoreboard": 3}

sc = L.new_build_scene("DECOR_sports_gym_props")
coll = bpy.data.collections.new("SportsGymProps")
sc.collection.children.link(coll)


def ai_piece(name, slug, material, size, axis="max", palette=0):
    meshes = L.import_ai_model(coll, slug, material, palette=palette)
    obj = L.join(coll, name, meshes)
    bpy.context.view_layer.update()
    dims = obj.dimensions
    current = max(dims) if axis == "max" else dims.z
    obj.scale = (size / current,) * 3
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    obj.location.x -= (min(c.x for c in corners) + max(c.x for c in corners)) / 2
    obj.location.y -= (min(c.y for c in corners) + max(c.y for c in corners)) / 2
    obj.location.z -= min(c.z for c in corners)
    bpy.context.view_layer.update()
    return obj


def copy_of(template, name):
    o = template.copy()
    o.data = template.data.copy()
    o.name = name
    coll.objects.link(o)
    return o


def surface_hits(obj, x, y):
    tree = BVHTree.FromObject(obj, bpy.context.evaluated_depsgraph_get())
    top = max((obj.matrix_world @ Vector(c)).z for c in obj.bound_box) + 1.0
    origin, hits = Vector((x, y, top)), []
    while True:
        location, normal, _, _ = tree.ray_cast(origin, Vector((0, 0, -1)))
        if location is None:
            return hits
        if normal.z > 0.5:
            hits.append(location.z)
        origin = location + Vector((0, 0, -0.002))


def long_axis(obj):
    return 0 if obj.dimensions.x >= obj.dimensions.y else 1


def shelf_tops(obj):
    axis = long_axis(obj)
    tops = []
    for z in sorted(surface_hits(obj, 0.0, 0.0), reverse=True):
        if z > 0.05 and all(abs(z - t) > SHELF_MERGE_M for t in tops):
            tops.append(z)
    return axis, sorted(tops)


def ball_rack():
    rack = ai_piece("Rack", AI["rack"], "DC_GymRack", 1.0, axis="z", palette=PALETTE["rack"])
    axis, tops = shelf_tops(rack)
    if len(tops) < 2:
        raise RuntimeError(f"ball rack: expected at least 2 shelves, found {tops}")
    span = rack.dimensions[axis] * 0.8
    templates = {"basketball": ball("basketball")[0], "football": panel_football("RackFootball")[0]}
    parts = [rack]
    for s, top in enumerate(tops[-2:]):
        sport = "basketball" if s == 0 else "football"
        for k in range(BALLS_PER_SHELF):
            along = -span / 2 + span * (k + 0.5) / BALLS_PER_SHELF
            b = copy_of(templates[sport], f"RackBall{s}{k}")
            b.location = Vector((along, 0, top) if axis == 0 else (0, along, top))
            parts.append(b)
    for t in templates.values():
        bpy.data.objects.remove(t, do_unlink=True)
    return parts


def ball_cart():
    cart = ai_piece("Cart", AI["cart"], "DC_GymCart", 0.9, axis="z", palette=PALETTE["cart"])
    template = ball("basketball")[0]
    d = BALL_DIAMETER["basketball"]
    brim = max((cart.matrix_world @ Vector(c)).z for c in cart.bound_box)
    parts = [cart]
    for k, (gx, gy) in enumerate([(x, y) for x in (-1, 0, 1) for y in (-0.5, 0.5)][:CART_BALLS]):
        b = copy_of(template, f"CartBall{k}")
        b.location = Vector((gx * d * 1.05, gy * d * 1.05, brim - d * 0.8))
        parts.append(b)
    bpy.data.objects.remove(template, do_unlink=True)
    return parts


def ball(sport):
    return [ai_piece(f"Ball_{sport}", AI[sport], f"DC_Gym{sport.capitalize()}", BALL_DIAMETER[sport])]


def panel_football(name):
    white = L.make_mat("DC_GymFootballWhite", "#f4f4f2", 0.55, "noise", 0.02)
    black = L.make_mat("DC_GymFootballBlack", "#1d1f24", 0.55, "noise", 0.02)
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=0, radius=1.0)
    bmesh.ops.bevel(bm, geom=list(bm.verts), offset=100 / 3, offset_type="PERCENT", segments=1, affect="VERTICES")
    pentagons = {f for f in bm.faces if len(f.verts) == 5}
    me.materials.append(white)
    me.materials.append(black)
    for f in bm.faces:
        f.material_index = 1 if f in pentagons else 0
    bmesh.ops.subdivide_edges(bm, edges=list(bm.edges), cuts=2, use_grid_fill=True)
    for v in bm.verts:
        v.co = v.co.normalized() * (BALL_DIAMETER["football"] / 2)
    for v in bm.verts:
        v.co.z += BALL_DIAMETER["football"] / 2
    for f in bm.faces:
        f.smooth = True
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    return [ob]


DECOR = {
    "gym_football": lambda: panel_football("Ball_football"),
    "gym_basketball": lambda: ball("basketball"),
    "gym_team_bench": lambda: [ai_piece("Bench", AI["bench"], "DC_GymBench", 0.9, axis="z", palette=PALETTE["bench"])],
    "gym_ball_rack": ball_rack,
    "gym_ball_cart": ball_cart,
    "gym_lockers": lambda: [ai_piece("Lockers", AI["lockers"], "DC_GymLockers", 1.9, axis="z", palette=PALETTE["lockers"])],
    "gym_scoreboard": lambda: [ai_piece("Scoreboard", AI["scoreboard"], "DC_GymScoreboard", 2.0, axis="z", palette=PALETTE["scoreboard"])],
}

results = [L.ship_decor(sc, coll, key, build(), MAX_MATERIALS) for key, build in DECOR.items() if not ONLY or key in ONLY]
print("GYM PROPS", results)
