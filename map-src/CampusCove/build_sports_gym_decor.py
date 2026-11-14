import importlib
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

MAX_MATERIALS = 5
BENCH_W, BENCH_D, SEAT_H = 2.4, 0.42, 0.45
RACK_W, RACK_D, RACK_H = 1.2, 0.5, 1.0
BALLS_PER_SHELF = 3

sc = L.new_build_scene("DECOR_sports_gym")
coll = bpy.data.collections.new("SportsGymDecor")
sc.collection.children.link(coll)


def ball(name, gx, gz, y0, radius, mat):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=radius)
    for v in bm.verts:
        v.co.z += radius
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    ob.location = L.b(gx, gz, y0)
    coll.objects.link(ob)
    return ob


def team_bench():
    seat = L.make_mat("DC_GymBenchSeat", "#2a9d8f", 0.7, "stripes", 0.03, accent="#248a7e")
    frame = L.make_mat("DC_GymBenchFrame", "#3a3f45", 0.5, "noise", 0.02)
    parts = []
    for k, gx in enumerate((-BENCH_W / 2 + 0.1, 0.0, BENCH_W / 2 - 0.1)):
        parts.append(L.box(coll, f"BenchLeg{k}", gx, 0.0, 0.0, 0.06, BENCH_D - 0.04, SEAT_H - 0.05, frame))
        parts.append(L.box(coll, f"BenchBackPost{k}", gx, BENCH_D / 2 - 0.03, SEAT_H, 0.05, 0.05, 0.42, frame))
    parts.append(L.box(coll, "BenchSeat", 0.0, 0.0, SEAT_H - 0.05, BENCH_W, BENCH_D, 0.05, seat, bevel=0.01))
    parts.append(L.box(coll, "BenchBack", 0.0, BENCH_D / 2 - 0.01, SEAT_H + 0.15, BENCH_W, 0.04, 0.28, seat, bevel=0.01))
    return parts


def ball_rack():
    frame = L.make_mat("DC_GymRackFrame", "#3a3f45", 0.5, "noise", 0.02)
    basket = L.make_mat("DC_GymBasketball", "#e07b2c", 0.75, "noise", 0.0)
    football = L.make_mat("DC_GymFootball", "#f4f4f4", 0.6, "noise", 0.0)
    parts = []
    for k, (gx, gz) in enumerate(((-RACK_W / 2, -RACK_D / 2), (RACK_W / 2, -RACK_D / 2), (-RACK_W / 2, RACK_D / 2), (RACK_W / 2, RACK_D / 2))):
        parts.append(L.box(coll, f"RackPost{k}", gx, gz, 0.0, 0.04, 0.04, RACK_H, frame))
    shelves = ((0.12, football, 0.11), (0.6, basket, 0.12))
    for s, (y, mat, radius) in enumerate(shelves):
        for side, gz in (("F", -RACK_D / 2 + 0.06), ("B", RACK_D / 2 - 0.06)):
            parts.append(L.box(coll, f"RackRail{s}{side}", 0.0, gz, y, RACK_W, 0.03, 0.03, frame))
        step = RACK_W / BALLS_PER_SHELF
        for k in range(BALLS_PER_SHELF):
            parts.append(ball(f"RackBall{s}{k}", -RACK_W / 2 + step * (k + 0.5), 0.0, y + 0.01, radius, mat))
    for side, gz in (("F", -RACK_D / 2), ("B", RACK_D / 2)):
        parts.append(L.box(coll, f"RackTop{side}", 0.0, gz, RACK_H, RACK_W + 0.04, 0.04, 0.04, frame))
    return parts


DECOR = {"gym_team_bench": team_bench, "gym_ball_rack": ball_rack}
results = [L.ship_decor(sc, coll, key, build(), MAX_MATERIALS) for key, build in DECOR.items()]
print("GYM DECOR", results)
