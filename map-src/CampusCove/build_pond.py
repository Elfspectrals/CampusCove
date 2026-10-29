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

KEY = "pond"
OUT = os.path.join(L.OUT_ROOT, "park", KEY)

PUSH = 10.0
HEDGE_R, FENCE_R, SKY_R = 46.6, 69.6 + PUSH, 74.8 + PUSH
PARK_X = 46.0
BED_H, WATER_TOP = 0.015, 0.045
CZ, RX, RZ = -58.5 - PUSH, 14.0, 5.5
LOOP_RX, LOOP_RZ, PATH_W = 17.0, 8.0, 1.6
JETTY_X, JETTY_HW, JETTY_Z0, JETTY_Z1, DECK_TOP = 5.0, 1.1, -52.6 - PUSH, -55.8 - PUSH, 0.13
PLATFORM_X0, PLATFORM_X1, PLATFORM_Z1 = 2.5, 7.5, -58.3 - PUSH
MARE_C, MARE_RX, MARE_RZ = (-39.0, -41.5 - PUSH), 3.6, 3.0
CREEK_HW = 1.0
BRIDGE_C, BRIDGE_HW, BRIDGE_HL, BRIDGE_TOP = (-17.8, -59.5 - PUSH), 1.0, 2.0, 0.35
GAZEBO_C, GAZEBO_R = (35.0, -55.0 - PUSH), 2.9
KIOSK = (22.5, -51.5 - PUSH)
GRID_X0, GRID_Z0, GRID_COLS, GRID_ROWS = -48.0, -76.0 - PUSH, 97, 73 + int(PUSH)
HILLS = [(hx, hz - PUSH, h, sd) for hx, hz, h, sd in [(35.0, -55.0, 2.6, 4.8), (-27.0, -64.0, 1.9, 4.0), (14.0, -66.5, 1.0, 3.0), (-12.0, -67.0, 0.9, 3.0),
                                                  (40.0, -37.0, 1.1, 3.5), (-41.0, -35.0, 1.2, 3.2), (25.0, -45.5, 0.8, 3.0), (-24.0, -46.0, 0.7, 3.0)]]
rnd = random.Random(7)


def ss(a, b, v):
    t = max(0.0, min(1.0, (v - a) / (b - a)))
    return t * t * (3 - 2 * t)


def chaikin(pts, it=3):
    for _ in range(it):
        out = [pts[0]]
        for (x0, z0), (x1, z1) in zip(pts, pts[1:]):
            out.append((0.75 * x0 + 0.25 * x1, 0.75 * z0 + 0.25 * z1))
            out.append((0.25 * x0 + 0.75 * x1, 0.25 * z0 + 0.75 * z1))
        out.append(pts[-1])
        pts = out
    return pts


def resample(pts, step):
    out = [pts[0]]
    acc = 0.0
    for (x0, z0), (x1, z1) in zip(pts, pts[1:]):
        seg = math.hypot(x1 - x0, z1 - z0)
        d = step - acc
        while d <= seg:
            k = d / seg
            out.append((x0 + (x1 - x0) * k, z0 + (z1 - z0) * k))
            d += step
        acc = (acc + seg) % step
    if math.hypot(out[-1][0] - pts[-1][0], out[-1][1] - pts[-1][1]) > step * 0.3:
        out.append(pts[-1])
    return out


def pushed(pts):
    return [(x, z - PUSH) for x, z in pts]


def ellipse(cx, cz, rx, rz, t):
    return cx + rx * math.cos(t), cz + rz * math.sin(t)


def pond_e(x, z):
    return math.hypot(x / RX, (z - CZ) / RZ)


def mare_e(x, z):
    return math.hypot((x - MARE_C[0]) / MARE_RX, (z - MARE_C[1]) / MARE_RZ)


def min_dist(pts, x, z):
    return min(math.hypot(px - x, pz - z) for px, pz in pts)


CREEK = resample(chaikin(pushed([(-13.0, -59.1), (-20.0, -59.8), (-26.0, -58.5), (-31.0, -55.0), (-35.0, -50.0), (-38.0, -45.5), (-38.8, -43.8)])), 0.7)
LOOP = [ellipse(0.0, CZ, LOOP_RX + PATH_W / 2, LOOP_RZ + PATH_W / 2, 2 * math.pi * i / 120) for i in range(120)]
TRAIL_E = resample(chaikin(pushed([(18.6, -58.5), (24.0, -57.0), (29.0, -54.0), (31.0, -50.0), (34.0, -45.0), (38.0, -39.0), (41.0, -32.0)]) + [(42.5, -23.5)]), 0.7)
TRAIL_W = resample(chaikin(pushed([(-17.5, -55.2), (-23.0, -51.5), (-28.0, -47.5), (-32.0, -42.0), (-35.0, -36.0), (-38.5, -30.0), (-41.0, -25.5)]) + [(-42.5, -22.8)]), 0.7)
SPUR = resample(chaikin(pushed([(31.0, -50.0), (32.6, -52.3), (33.2, -53.2)]), 2), 0.7)
PATHS = LOOP + TRAIL_E + TRAIL_W + SPUR


def terrain_h(x, z):
    r = math.hypot(x, z)
    th = math.atan2(x, -z)
    ax = abs(x)
    edge_fade = 1.0 - ss(46.6, 47.5, ax)
    gate = (1.0 - ss(7.5, 10.0, ax)) * ss(-52.5 - PUSH, -50.0 - PUSH, z)
    hedge = ss(47.2, 50.5, r) * (1.0 - gate)
    hills = sum(h * math.exp(-((x - hx) ** 2 + (z - hz) ** 2) / (2 * s * s)) for hx, hz, h, s in HILLS)
    und = max(0.0, 0.12 + 0.22 * math.sin(x * 0.21 + 0.7) * math.sin(z * 0.17 + 1.9) + 0.1 * math.sin(x * 0.47 + z * 0.31))
    ridge = ss(68.8 + PUSH, 74.0 + PUSH, r) * (5.0 + 1.4 * math.sin(th * 9.0) + 0.8 * math.sin(th * 23.0 + 1.3))
    berm = 1.6 * ss(45.4, 46.5, ax) * hedge
    h = (hedge * (hills + und) + ridge + berm) * edge_fade
    e = pond_e(x, z)
    if e < 1.9:
        hp = BED_H + 0.3 * ss(1.0, 1.3, e)
        h = hp + ss(1.0, 1.9, e) * (h - hp)
    dc = min_dist(CREEK, x, z) if -45.0 < x < -10.0 and -64.0 - PUSH < z < -40.0 - PUSH else 99.0
    if dc < 2.4:
        h = BED_H + (h - BED_H) * ss(0.75, 2.4, dc)
    em = mare_e(x, z)
    if em < 1.8:
        h = BED_H + (h - BED_H) * ss(1.0, 1.8, em)
    return max(h, 0.0)


def in_rect(x, z, cx, cz, hx, hz):
    return abs(x - cx) <= hx and abs(z - cz) <= hz


def walk_h(x, z):
    h = terrain_h(x, z)
    if in_rect(x, z, JETTY_X, (JETTY_Z0 + JETTY_Z1) / 2, JETTY_HW, abs(JETTY_Z1 - JETTY_Z0) / 2) or \
            in_rect(x, z, (PLATFORM_X0 + PLATFORM_X1) / 2, (JETTY_Z1 + PLATFORM_Z1) / 2, (PLATFORM_X1 - PLATFORM_X0) / 2, abs(PLATFORM_Z1 - JETTY_Z1) / 2):
        h = max(h, DECK_TOP)
    if in_rect(x, z, BRIDGE_C[0], BRIDGE_C[1], BRIDGE_HW, BRIDGE_HL):
        h = max(h, BRIDGE_TOP)
    if math.hypot(x - GAZEBO_C[0], z - GAZEBO_C[1]) <= GAZEBO_R:
        h = max(h, gazebo_floor)
    if math.hypot(x - gazebo_step[0], z - gazebo_step[1]) <= 0.75:
        h = max(h, gazebo_step[2])
    return h


def ground_samples(gx, gz, rad):
    pts = [(gx, gz)] + [(gx + rad * math.cos(a), gz + rad * math.sin(a)) for a in (0, 1.57, 3.14, 4.71)]
    return [terrain_h(px, pz) for px, pz in pts]


def ground(gx, gz, rad=0.3):
    return min(ground_samples(gx, gz, rad))


def ground_top(gx, gz, rad):
    return max(ground_samples(gx, gz, rad))


gazebo_floor = round(max(terrain_h(GAZEBO_C[0] + rr * math.cos(a), GAZEBO_C[1] + rr * math.sin(a)) for rr in (0.0, GAZEBO_R / 2, GAZEBO_R)
                         for a in [i * math.pi / 4 for i in range(8)]) + 0.15, 3)
_ex, _ez = SPUR[-1][0] - GAZEBO_C[0], SPUR[-1][1] - GAZEBO_C[1]
_el = math.hypot(_ex, _ez)
_sx, _sz = GAZEBO_C[0] + _ex / _el * (GAZEBO_R + 0.4), GAZEBO_C[1] + _ez / _el * (GAZEBO_R + 0.4)
gazebo_step = (_sx, _sz, round((gazebo_floor + terrain_h(_sx, _sz)) / 2, 3))

sc = L.new_build_scene("PARK_" + KEY)
coll = bpy.data.collections.new("Pond")
sc.collection.children.link(coll)
P = {
    "meadow": L.make_mat("TW_PondMeadow", "#7dbb62", 1.0, "noise", 0.07),
    "meadow2": L.make_mat("TW_PondMeadowLight", "#93c96d", 1.0, "noise", 0.07),
    "hill": L.make_mat("TW_PondHill", "#5f9e55", 1.0, "noise", 0.08),
    "sand": L.make_mat("TW_PondSand", "#d9c89a", 0.95, "noise", 0.05),
    "bed": L.make_mat("TW_PondBed", "#5d7a5a", 0.95, "noise", 0.06),
    "water": L.make_mat("TW_PondWater", "#4fa9c8", 0.15, "noise", 0.03),
    "path": L.make_mat("TW_PondPath", "#cdb994", 0.95, "noise", 0.05),
    "avenue": L.make_mat("TW_AvenuePond", "#d6cfc2", 0.9, "tiles", 0.02, accent="#bdb6a8"),
    "curb": L.make_mat("TW_CurbPond", "#9a9a9a", 0.8, "noise", 0.03),
    "stone": L.make_mat("TW_StonePond", "#b5ada0", 0.85, "tiles", 0.04, accent="#9b9386"),
    "rock": L.make_mat("TW_PondRock", "#9c978e", 0.9, "noise", 0.08),
    "rock2": L.make_mat("TW_PondRockMoss", "#8a9478", 0.9, "noise", 0.08),
    "deck": L.make_mat("TW_JettyPlanks", "#b08655", 0.85, "planks", 0.05, accent="#8d6238"),
    "post": L.make_mat("TW_JettyPost", "#6e4f33", 0.85, "noise", 0.04),
    "metal": L.make_mat("TW_MetalPond", "#3a3f47", 0.4, "noise", 0.03),
    "lamp": L.make_mat("TW_LampGlowPond", "#fff1c4", 0.5, "noise", 0.0, emit="#fff1c4"),
    "sign": L.make_mat("TW_SignBoardPond", "#2b3a33", 0.7, "noise", 0.02),
    "signtxt": L.make_mat("TW_SignTextPond", "#9be7ff", 0.3, "noise", 0.0, emit="#9be7ff"),
    "fishsign": L.make_mat("TW_FishSpotSign", "#2f8f9d", 0.6, "noise", 0.03),
    "buoy": L.make_mat("TW_BuoyRed", "#e0533d", 0.5, "noise", 0.02),
    "white": L.make_mat("TW_BuoyWhite", "#f4f1ea", 0.5, "noise", 0.02),
    "trunk": L.make_mat("TW_TrunkPond", "#7a5638", 0.8, "planks", 0.04, accent="#5e4129"),
    "birch": L.make_mat("TW_BirchBark", "#ece8dc", 0.8, "stripes", 0.03, accent="#d8d2c2"),
    "leaf1": L.make_mat("TW_LeafPond", "#4f9d54", 0.9, "noise", 0.07),
    "leaf2": L.make_mat("TW_LeafPondLight", "#6fb85a", 0.9, "noise", 0.07),
    "leaf3": L.make_mat("TW_LeafPondDeep", "#3e8546", 0.9, "noise", 0.07),
    "leaf4": L.make_mat("TW_LeafPondLime", "#93c45a", 0.9, "noise", 0.07),
    "pine": L.make_mat("TW_PineNeedles", "#2f6f47", 0.9, "noise", 0.06),
    "blossom": L.make_mat("TW_Blossom", "#f2a7c3", 0.85, "noise", 0.06),
    "blossom2": L.make_mat("TW_BlossomLight", "#f8cadb", 0.85, "noise", 0.05),
    "willow": L.make_mat("TW_WillowLeaf", "#8fbf5f", 0.9, "noise", 0.07),
    "bush": L.make_mat("TW_Bush", "#4c9450", 0.95, "noise", 0.08),
    "reed": L.make_mat("TW_Reed", "#7fa04a", 0.9, "noise", 0.06),
    "cattail": L.make_mat("TW_Cattail", "#6b4a2e", 0.9, "noise", 0.04),
    "lily": L.make_mat("TW_LilyPad", "#3f8f4a", 0.7, "noise", 0.05),
    "fl_pink": L.make_mat("TW_FlowerPink", "#f07fa8", 0.7, "noise", 0.03),
    "fl_yellow": L.make_mat("TW_FlowerYellow", "#f6d04d", 0.7, "noise", 0.03),
    "fl_white": L.make_mat("TW_FlowerWhite", "#f7f4ec", 0.7, "noise", 0.03),
    "fl_violet": L.make_mat("TW_FlowerViolet", "#a985e0", 0.7, "noise", 0.03),
    "stem": L.make_mat("TW_FlowerStem", "#4e8a3c", 0.9, "noise", 0.03),
    "wood": L.make_mat("TW_BenchWoodPond", "#a9784a", 0.7, "planks", 0.04, accent="#8d6238"),
    "kiosk": L.make_mat("TW_KioskWall", "#e8d7b4", 0.9, "planks", 0.04, accent="#cdb98f"),
    "roof": L.make_mat("TW_KioskRoof", "#3f7f8c", 0.85, "stripes", 0.03, accent="#f1ede2"),
    "gazebo_roof": L.make_mat("TW_GazeboRoof", "#8f4f3a", 0.85, "planks", 0.04, accent="#74402f"),
    "window": L.make_mat("TW_KioskWindow", "#2a2f36", 0.5, "noise", 0.02),
    "blanket": L.make_mat("TW_PicnicBlanket", "#d9534f", 0.95, "checker", 0.02, accent="#f4efe6"),
    "duck": L.make_mat("TW_DuckBody", "#f3efe4", 0.7, "noise", 0.03),
    "duckhead": L.make_mat("TW_DuckHead", "#2f6b4a", 0.6, "noise", 0.03),
    "beak": L.make_mat("TW_DuckBeak", "#f0a52a", 0.6, "noise", 0.02),
    "boat": L.make_mat("TW_RowboatHull", "#3f6f8f", 0.7, "planks", 0.04, accent="#335d79"),
}
LEAVES = ["leaf1", "leaf2", "leaf3", "leaf4"]
objs = []
col = []
placed = []


def add_col(name, gx, gz, sx, sz, h, yaw=0.0):
    col.append({"name": name, "cx": round(gx, 3), "cz": round(gz, 3), "hx": round(sx / 2, 3), "hz": round(sz / 2, 3), "hy": round(h / 2, 3), "cy": round(h / 2, 3), "yaw": round(yaw, 4)})


def mesh_obj(name, bm, mat_list, loc=(0.0, 0.0, 0.0), tile=2.0):
    bm.normal_update()
    L._box_uv(bm, tile)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mat_list:
        me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    ob.location = loc
    coll.objects.link(ob)
    objs.append(ob)
    return ob


def blob(name, gx, gz, y0, r, mat, sy=1.0, jitter=0.14, sub=1):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    for v in bm.verts:
        v.co.x += rnd.uniform(-jitter, jitter) * r
        v.co.y += rnd.uniform(-jitter, jitter) * r
        v.co.z = (v.co.z + rnd.uniform(-jitter, jitter) * r) * sy
    zmin = min(v.co.z for v in bm.verts)
    for v in bm.verts:
        v.co.z -= zmin
    return mesh_obj(name, bm, [mat], L.b(gx, gz, y0), tile=1.0)


def ribbon(name, pts, width, mat, closed=False, lift=0.03, fixed=None):
    bm = bmesh.new()
    n = len(pts)
    left, right = [], []
    for i in range(n):
        a = pts[(i - 1) % n] if closed or i > 0 else pts[i]
        c = pts[(i + 1) % n] if closed or i < n - 1 else pts[i]
        tx, tz = c[0] - a[0], c[1] - a[1]
        k = math.hypot(tx, tz) or 1.0
        nx, nz = -tz / k * width / 2, tx / k * width / 2
        for side, sgn in ((left, 1), (right, -1)):
            px, pz = pts[i][0] + nx * sgn, pts[i][1] + nz * sgn
            h = fixed if fixed is not None else terrain_h(px, pz) + lift
            side.append(bm.verts.new(L.b(px, pz, h)))
    for i in range(n if closed else n - 1):
        j = (i + 1) % n
        f = bm.faces.new((left[i], right[i], right[j], left[j]))
        f.normal_update()
        if f.normal.z < 0:
            f.normal_flip()
    return mesh_obj(name, bm, [mat])


def clear_of(x, z, rad, paths=2.0, spacing=0.7):
    r = math.hypot(x, z)
    if not (HEDGE_R + 1.6 + rad <= r <= FENCE_R - 0.6 - rad) or abs(x) > PARK_X - 0.8 - rad:
        return False
    if (abs(x) < 8.5 and z > -51.0 - PUSH) or pond_e(x, z) < 1.25 + rad / RZ or mare_e(x, z) < 1.25 + rad / MARE_RZ:
        return False
    if min_dist(CREEK, x, z) < CREEK_HW + 1.0 + rad or min_dist(PATHS, x, z) < paths + rad:
        return False
    if math.hypot(x - GAZEBO_C[0], z - GAZEBO_C[1]) < GAZEBO_R + 1.2 + rad or math.hypot(x - KIOSK[0], z - KIOSK[1]) < 3.0 + rad:
        return False
    return all(math.hypot(x - px, z - pz) >= spacing + rad + pr for px, pz, pr in placed)


def scatter(zone, count, rad, make, paths=2.0, spacing=0.7, check=clear_of, tries=1500):
    cx, cz, zr = zone
    made = 0
    for _ in range(tries):
        if made == count:
            break
        a = rnd.uniform(0, 2 * math.pi)
        d = zr * math.sqrt(rnd.random())
        x, z = cx + d * math.cos(a), cz + d * math.sin(a)
        if not check(x, z, rad, paths, spacing):
            continue
        make(x, z)
        placed.append((x, z, rad))
        made += 1
    return made


tree_n = [0]


def tree_round(x, z, s=None, leaves=None, collide=True):
    s = s or rnd.uniform(0.85, 1.25)
    i = tree_n[0] = tree_n[0] + 1
    y = ground(x, z, 0.3)
    objs.append(L.cone(coll, f"PD_TreeR{i:03d}_Trunk", x, z, y, 0.2 * s, 0.12 * s, 1.9 * s, P["trunk"], seg=6))
    leaves = leaves or LEAVES
    for k in range(rnd.randint(3, 4)):
        a = rnd.uniform(0, 2 * math.pi)
        o = rnd.uniform(0.2, 0.7) * s
        blob(f"PD_TreeR{i:03d}_Leaf{k}", x + o * math.cos(a), z + o * math.sin(a), y + rnd.uniform(1.5, 2.3) * s, rnd.uniform(0.85, 1.25) * s,
             P[rnd.choice(leaves)], sy=0.85)
    if collide:
        add_col(f"COL_Pond_TreeR{i:03d}", x, z, 0.6, 0.6, 3.0)


def tree_pine(x, z, s=None, collide=True):
    s = s or rnd.uniform(0.9, 1.4)
    i = tree_n[0] = tree_n[0] + 1
    y = ground(x, z, 0.3)
    objs.append(L.cyl(coll, f"PD_TreeP{i:03d}_Trunk", x, z, y, 0.18 * s, 1.2 * s, P["trunk"], seg=6))
    for k, (r1, h0, hh) in enumerate(((1.5, 0.9, 1.9), (1.15, 2.1, 1.7), (0.8, 3.2, 1.6))):
        objs.append(L.cone(coll, f"PD_TreeP{i:03d}_Tier{k}", x + rnd.uniform(-0.08, 0.08), z + rnd.uniform(-0.08, 0.08), y + h0 * s,
                           r1 * s, 0.05 * s, hh * s, P["pine"], seg=7))
    if collide:
        add_col(f"COL_Pond_TreeP{i:03d}", x, z, 0.6, 0.6, 3.0)


def tree_birch(x, z, s=None):
    s = s or rnd.uniform(0.9, 1.2)
    i = tree_n[0] = tree_n[0] + 1
    y = ground(x, z, 0.2)
    objs.append(L.cone(coll, f"PD_TreeB{i:03d}_Trunk", x, z, y, 0.12 * s, 0.07 * s, 3.4 * s, P["birch"], seg=6))
    for k in range(3):
        blob(f"PD_TreeB{i:03d}_Leaf{k}", x + rnd.uniform(-0.4, 0.4) * s, z + rnd.uniform(-0.4, 0.4) * s, y + (2.2 + k * 0.7) * s,
             rnd.uniform(0.55, 0.8) * s, P[rnd.choice(("leaf4", "leaf2"))], sy=1.25)
    add_col(f"COL_Pond_TreeB{i:03d}", x, z, 0.4, 0.4, 3.0)


def tree_willow(x, z, s=1.0):
    i = tree_n[0] = tree_n[0] + 1
    y = ground(x, z, 0.4)
    objs.append(L.cone(coll, f"PD_TreeW{i:03d}_Trunk", x, z, y, 0.32 * s, 0.2 * s, 2.4 * s, P["trunk"], seg=7))
    blob(f"PD_TreeW{i:03d}_Crown", x, z, y + 2.0 * s, 2.1 * s, P["willow"], sy=0.55)
    for k in range(12):
        a = 2 * math.pi * k / 12 + rnd.uniform(-0.15, 0.15)
        rr = rnd.uniform(1.6, 2.1) * s
        hh = rnd.uniform(1.4, 2.0) * s
        objs.append(L.cone(coll, f"PD_TreeW{i:03d}_Drape{k}", x + rr * math.cos(a), z + rr * math.sin(a), y + 2.9 * s - hh, 0.05 * s, 0.32 * s, hh,
                           P["willow"], seg=5))
    add_col(f"COL_Pond_TreeW{i:03d}", x, z, 0.8, 0.8, 3.0)


def bush(x, z):
    i = tree_n[0] = tree_n[0] + 1
    y = ground(x, z, 0.5)
    for k in range(rnd.randint(2, 3)):
        blob(f"PD_Bush{i:03d}_{k}", x + rnd.uniform(-0.45, 0.45), z + rnd.uniform(-0.45, 0.45), y - 0.05, rnd.uniform(0.45, 0.7),
             P[rnd.choice(("bush", "leaf3", "leaf1"))], sy=0.8)
    add_col(f"COL_Pond_Bush{i:03d}", x, z, 1.2, 1.2, 1.2)


def flower_patch(x, z, n=14, spread=1.2):
    i = tree_n[0] = tree_n[0] + 1
    colors = rnd.sample(("fl_pink", "fl_yellow", "fl_white", "fl_violet"), 2)
    parts = []
    for k in range(n):
        fx, fz = x + rnd.uniform(-spread, spread), z + rnd.uniform(-spread, spread)
        fy = ground(fx, fz, 0.05)
        hh = rnd.uniform(0.25, 0.45)
        parts.append(L.box(coll, f"PD_Flower{i:03d}_s{k}", fx, fz, fy, 0.03, 0.03, hh, P["stem"]))
        parts.append(L.cone(coll, f"PD_Flower{i:03d}_h{k}", fx, fz, fy + hh, 0.1, 0.04, 0.08, P[colors[k % 2]], seg=5))
    bpy.context.view_layer.update()
    objs.append(L.join(coll, f"PD_Flowers{i:03d}", parts))


def grass_tuft(x, z):
    i = tree_n[0] = tree_n[0] + 1
    y = ground(x, z, 0.1)
    parts = []
    for k in range(3):
        a = rnd.uniform(0, 2 * math.pi)
        parts.append(L.cone(coll, f"PD_Tuft{i:03d}_{k}", x + 0.08 * math.cos(a), z + 0.08 * math.sin(a), y, 0.05, 0.0, rnd.uniform(0.25, 0.42),
                            P[rnd.choice(("leaf2", "leaf4", "reed"))], seg=3))
    bpy.context.view_layer.update()
    objs.append(L.join(coll, f"PD_Tuft{i:03d}", parts))


def rock(name, x, z, r, collide=False, mat="rock", base=None):
    y = ground(x, z, r * 0.6) - 0.08 if base is None else base
    blob(name, x, z, y, r, P[mat], sy=0.55, jitter=0.22, sub=1)
    if collide:
        add_col(f"COL_Pond_{name}", x, z, r * 1.6, r * 1.6, 1.2)


def lamp(name, gx, gz):
    y = ground(gx, gz, 0.1)
    objs.append(L.cyl(coll, f"{name}_Pole", gx, gz, y, 0.07, 3.2, P["metal"], seg=6))
    objs.append(L.box(coll, f"{name}_Head", gx, gz, y + 3.2, 0.5, 0.5, 0.3, P["lamp"], bevel=0.03))
    add_col(f"COL_Pond_{name}", gx, gz, 0.3, 0.3, 3.4)
    placed.append((gx, gz, 0.3))


def bench(name, gx, gz, rot):
    low, y = ground(gx, gz, 0.8), ground_top(gx, gz, 0.8)
    leg_h = y + 0.42 - low
    objs.append(L.furn(coll, name, gx, gz, rot, [(0, 0, y + 0.42, 1.8, 0.5, 0.06, P["wood"], 0.01), (0, 0.22, y + 0.48, 1.8, 0.06, 0.45, P["wood"], 0.01),
                                                  (-0.8, 0, low, 0.08, 0.45, leg_h, P["metal"]), (0.8, 0, low, 0.08, 0.45, leg_h, P["metal"])]))
    add_col(f"COL_Pond_{name}", gx, gz, 1.8, 0.5, 0.9, rot)
    placed.append((gx, gz, 1.0))


def bin_(name, gx, gz):
    low = ground(gx, gz, 0.2)
    objs.append(L.cyl(coll, name, gx, gz, low, 0.22, ground_top(gx, gz, 0.2) + 0.75 - low, P["metal"], seg=8))
    add_col(f"COL_Pond_{name}", gx, gz, 0.45, 0.45, 0.8)


def picnic(name, gx, gz, rot):
    low, y = ground(gx, gz, 1.0), ground_top(gx, gz, 1.0)
    rise = y - low
    objs.append(L.furn(coll, name, gx, gz, rot, [
        (0, 0, y + 0.72, 1.9, 0.8, 0.06, P["wood"], 0.01),
        (-0.75, 0, low, 0.08, 0.7, 0.72 + rise, P["post"]), (0.75, 0, low, 0.08, 0.7, 0.72 + rise, P["post"]),
        (0, -0.7, y + 0.42, 1.9, 0.3, 0.05, P["wood"], 0.01), (0, 0.7, y + 0.42, 1.9, 0.3, 0.05, P["wood"], 0.01),
        (-0.75, -0.7, low, 0.06, 0.06, 0.42 + rise, P["post"]), (0.75, -0.7, low, 0.06, 0.06, 0.42 + rise, P["post"]),
        (-0.75, 0.7, low, 0.06, 0.06, 0.42 + rise, P["post"]), (0.75, 0.7, low, 0.06, 0.06, 0.42 + rise, P["post"]),
    ]))
    add_col(f"COL_Pond_{name}", gx, gz, 1.9, 1.8, 0.9, rot)
    placed.append((gx, gz, 1.6))


def forward(yaw):
    return -math.sin(yaw), -math.cos(yaw)


def path_frame(pts, idx):
    a, c = pts[max(idx - 1, 0)], pts[min(idx + 1, len(pts) - 1)]
    tx, tz = c[0] - a[0], c[1] - a[1]
    k = math.hypot(tx, tz)
    return pts[idx], (tx / k, tz / k), (-tz / k, tx / k)


bm = bmesh.new()
grid = {}
for j in range(GRID_ROWS):
    for i in range(GRID_COLS):
        x, z = GRID_X0 + i, GRID_Z0 + j
        grid[(i, j)] = (x, z, terrain_h(x, z))
verts = {}
faces_mat = []
for j in range(GRID_ROWS - 1):
    for i in range(GRID_COLS - 1):
        cx, cz = GRID_X0 + i + 0.5, GRID_Z0 + j + 0.5
        r = math.hypot(cx, cz)
        if r < 46.0 or r > SKY_R or abs(cx) > 47.5 or cz > -4.0:
            continue
        quad = []
        for key in ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)):
            if key not in verts:
                x, z, h = grid[key]
                verts[key] = bm.verts.new(L.b(x, z, max(h, BED_H)))
            quad.append(verts[key])
        f = bm.faces.new(quad)
        e, em = pond_e(cx, cz), mare_e(cx, cz)
        dc = min_dist(CREEK, cx, cz) if -45.0 < cx < -10.0 and -64.0 - PUSH < cz < -40.0 - PUSH else 99.0
        if e < 1.0 or em < 1.0 or dc < 0.9:
            f.material_index = 4
        elif e < 1.28 or em < 1.35 or dc < 1.7:
            f.material_index = 3
        elif r > FENCE_R + 0.3 or abs(cx) > PARK_X + 0.3:
            f.material_index = 2
        elif math.sin(cx * 0.13) * math.sin(cz * 0.11 + 2.0) + 0.3 * math.sin(cx * 0.41 + cz * 0.37) > 0.35:
            f.material_index = 1
for f in bm.faces:
    f.normal_update()
    if f.normal.z < 0:
        f.normal_flip()
mesh_obj("PD_Terrain", bm, [P["meadow"], P["meadow2"], P["hill"], P["sand"], P["bed"]])

pond_water = L.cyl(coll, "PD_Water", 0.0, CZ, WATER_TOP - 0.015, 1.0, 0.015, P["water"], seg=40, tile=0.08)
pond_water.scale = (RX * 1.1, RZ * 1.1, 1.0)
objs.append(pond_water)
mare_water = L.cyl(coll, "PD_MareWater", MARE_C[0], MARE_C[1], WATER_TOP - 0.015, 1.0, 0.015, P["water"], seg=24, tile=0.08)
mare_water.scale = (MARE_RX * 1.1, MARE_RZ * 1.1, 1.0)
objs.append(mare_water)
creek_pts = [p for p in CREEK if pond_e(*p) > 1.03 and mare_e(*p) > 1.03]
ribbon("PD_CreekWater", creek_pts, CREEK_HW * 2, P["water"], fixed=WATER_TOP - 0.001)

ribbon("PD_PathLoop", LOOP, PATH_W, P["path"], closed=True)
ribbon("PD_PathEast", TRAIL_E, PATH_W, P["path"], lift=0.035)
ribbon("PD_PathWest", TRAIL_W, PATH_W, P["path"], lift=0.035)
ribbon("PD_PathGazebo", SPUR, 1.3, P["path"], lift=0.036)
objs.append(L.box(coll, "PD_Avenue", 0, -34.5 - PUSH / 2, 0.0, 6.0, 27.0 + PUSH, 0.03, P["avenue"], tile=2.0))
objs.append(L.box(coll, "PD_GateApron", 0, -46.8, 0.0, 14.0, 5.6, 0.035, P["avenue"], tile=2.0))
for nm, gx in (("PD_CurbAvenueE", 3.15), ("PD_CurbAvenueW", -3.15)):
    objs.append(L.box(coll, nm, gx, -33.0, 0.0, 0.3, 22.0, 0.1, P["curb"]))
    objs.append(L.box(coll, nm + "Outer", gx, -50.0 - PUSH / 2, 0.0, 0.3, PUSH - 2.0, 0.1, P["curb"]))
objs.append(L.box(coll, "PD_KioskPad", KIOSK[0] - 2.3, KIOSK[1], ground(KIOSK[0] - 2.3, KIOSK[1], 1.4), 2.8, 2.6, 0.06, P["path"], tile=2.0))


def pillar(tag, gx):
    objs.append(L.box(coll, f"PD_GatePillar{tag}", gx, -46.0, 0.0, 1.0, 1.0, 3.2, P["stone"], bevel=0.03, tile=1.0))
    objs.append(L.box(coll, f"PD_GateCap{tag}", gx, -46.0, 3.2, 1.3, 1.3, 0.2, P["stone"], bevel=0.03))
    objs.append(L.box(coll, f"PD_GateLamp{tag}", gx, -46.0, 3.4, 0.5, 0.5, 0.5, P["lamp"], bevel=0.04))
    add_col(f"COL_Pond_GatePillar{tag}", gx, -46.0, 1.2, 1.2, 3.6)


pillar("W", -6.6)
pillar("E", 6.6)
for tag, gx, body in (("W", -6.6, "COVE"), ("E", 6.6, "POND")):
    objs.append(L.box(coll, f"PD_GateSign{tag}", gx, -45.45, 2.0, 1.9, 0.12, 0.6, P["sign"]))
    objs.append(L.text_mesh(coll, f"PD_GateSignText{tag}", body, gx, -45.37, 2.08, 0.3, 0.03, P["signtxt"], facing="+z"))
n = 0
for gz in (-26.0, -34.0, -42.0, -42.0 - PUSH):
    for sx in (-3.7, 3.7):
        n += 1
        lamp(f"PD_AveLamp{n:02d}", sx, gz)

sp_x, sp_z = 9.2, -48.6 - PUSH
sp_y = ground(sp_x, sp_z, 0.2)
objs.append(L.box(coll, "PD_SignpostPole", sp_x, sp_z, sp_y, 0.14, 0.14, 2.4, P["post"]))
for k, (label, dx) in enumerate((("GAZEBO >", 0.55), ("< GROVE", -0.55))):
    hy = sp_y + 1.95 - k * 0.45
    objs.append(L.box(coll, f"PD_SignpostBoard{k}", sp_x + dx, sp_z, hy, 1.25, 0.06, 0.32, P["deck"]))
    objs.append(L.text_mesh(coll, f"PD_SignpostText{k}", label, sp_x + dx, sp_z + 0.04, hy + 0.08, 0.17, 0.015, P["sign"], facing="+z"))
add_col("COL_Pond_Signpost", sp_x, sp_z, 2.4, 0.3, 2.4)
placed.append((sp_x, sp_z, 0.8))

EDGE_RX, EDGE_RZ = RX - 0.2, RZ - 0.2
t_east = math.acos((JETTY_X + JETTY_HW + 0.15) / EDGE_RX)
t_west = math.acos((JETTY_X - JETTY_HW - 0.15) / EDGE_RX)
SEGS = 44
pts = [ellipse(0.0, CZ, EDGE_RX, EDGE_RZ, t_west + (2 * math.pi - (t_west - t_east)) * i / SEGS) for i in range(SEGS + 1)]
for i in range(SEGS):
    (x0, z0), (x1, z1) = pts[i], pts[i + 1]
    add_col(f"COL_Pond_Water{i:02d}", (x0 + x1) / 2, (z0 + z1) / 2, math.hypot(x1 - x0, z1 - z0) + 0.3, 0.4, 1.0, math.atan2(-(z1 - z0), x1 - x0))
MSEGS = 18
for i in range(MSEGS):
    x0, z0 = ellipse(MARE_C[0], MARE_C[1], MARE_RX - 0.15, MARE_RZ - 0.15, 2 * math.pi * i / MSEGS)
    x1, z1 = ellipse(MARE_C[0], MARE_C[1], MARE_RX - 0.15, MARE_RZ - 0.15, 2 * math.pi * (i + 1) / MSEGS)
    add_col(f"COL_Pond_Mare{i:02d}", (x0 + x1) / 2, (z0 + z1) / 2, math.hypot(x1 - x0, z1 - z0) + 0.3, 0.4, 1.0, math.atan2(-(z1 - z0), x1 - x0))
k = 0
for (x0, z0), (x1, z1) in zip(CREEK, CREEK[1:]):
    mx, mz = (x0 + x1) / 2, (z0 + z1) / 2
    if pond_e(mx, mz) < 0.95 or mare_e(mx, mz) < 0.95 or in_rect(mx, mz, BRIDGE_C[0], BRIDGE_C[1], BRIDGE_HW + 0.2, BRIDGE_HL + 0.5):
        continue
    add_col(f"COL_Pond_Creek{k:02d}", mx, mz, math.hypot(x1 - x0, z1 - z0) + 0.35, CREEK_HW * 2 + 0.2, 1.0, math.atan2(-(z1 - z0), x1 - x0))
    k += 1

jetty_bank_z = pts[0][1]
deck_y = DECK_TOP - 0.07
objs.append(L.box(coll, "PD_JettyWalk", JETTY_X, (JETTY_Z0 + JETTY_Z1) / 2, deck_y, JETTY_HW * 2, abs(JETTY_Z1 - JETTY_Z0), 0.07, P["deck"], tile=1.0))
objs.append(L.box(coll, "PD_JettyPlatform", (PLATFORM_X0 + PLATFORM_X1) / 2, (JETTY_Z1 + PLATFORM_Z1) / 2, deck_y, PLATFORM_X1 - PLATFORM_X0,
                  abs(PLATFORM_Z1 - JETTY_Z1), 0.07, P["deck"], tile=1.0))
for i, (px, pz) in enumerate([(JETTY_X - JETTY_HW, -54.0 - PUSH), (JETTY_X + JETTY_HW, -54.0 - PUSH), (PLATFORM_X0, JETTY_Z1), (PLATFORM_X1, JETTY_Z1),
                              (PLATFORM_X0, PLATFORM_Z1), (PLATFORM_X1, PLATFORM_Z1)]):
    objs.append(L.cyl(coll, f"PD_JettyPost{i}", px, pz, BED_H, 0.09, 0.6, P["post"], seg=6))
rail_len = abs(JETTY_Z1 - jetty_bank_z) + 0.3
for tag, gx in (("W", JETTY_X - JETTY_HW - 0.15), ("E", JETTY_X + JETTY_HW + 0.15)):
    add_col(f"COL_Pond_JettyRail{tag}", gx, (jetty_bank_z + JETTY_Z1) / 2, 0.3, rail_len, 1.0)
x_w, x_e = JETTY_X - JETTY_HW, JETTY_X + JETTY_HW
add_col("COL_Pond_JettySW", (PLATFORM_X0 + x_w) / 2 - 0.15, JETTY_Z1 + 0.15, x_w - PLATFORM_X0 + 0.3, 0.3, 1.0)
add_col("COL_Pond_JettySE", (PLATFORM_X1 + x_e) / 2 + 0.15, JETTY_Z1 + 0.15, PLATFORM_X1 - x_e + 0.3, 0.3, 1.0)
add_col("COL_Pond_JettyWest", PLATFORM_X0 - 0.15, (JETTY_Z1 + PLATFORM_Z1) / 2, 0.3, abs(PLATFORM_Z1 - JETTY_Z1) + 0.6, 1.0)
add_col("COL_Pond_JettyEast", PLATFORM_X1 + 0.15, (JETTY_Z1 + PLATFORM_Z1) / 2, 0.3, abs(PLATFORM_Z1 - JETTY_Z1) + 0.6, 1.0)
add_col("COL_Pond_JettyNorth", (PLATFORM_X0 + PLATFORM_X1) / 2, PLATFORM_Z1 - 0.15, PLATFORM_X1 - PLATFORM_X0 + 0.6, 0.3, 1.0)

bx, bz = BRIDGE_C
objs.append(L.box(coll, "PD_BridgeDeck", bx, bz, ground(bx, bz, 0.5), BRIDGE_HW * 2, BRIDGE_HL * 2, BRIDGE_TOP - ground(bx, bz, 0.5), P["deck"], tile=1.0))
for tag, sgn in (("W", -1), ("E", 1)):
    gx = bx + sgn * (BRIDGE_HW - 0.05)
    objs.append(L.box(coll, f"PD_BridgeRail{tag}", gx, bz, BRIDGE_TOP + 0.5, 0.08, BRIDGE_HL * 2, 0.08, P["deck"]))
    for kk, dz in enumerate((-BRIDGE_HL + 0.1, 0.0, BRIDGE_HL - 0.1)):
        objs.append(L.box(coll, f"PD_BridgePost{tag}{kk}", gx, bz + dz, ground(gx, bz + dz, 0.05), 0.1, 0.1, BRIDGE_TOP + 0.58 - ground(gx, bz + dz, 0.05), P["post"]))
    add_col(f"COL_Pond_BridgeRail{tag}", bx + sgn * (BRIDGE_HW + 0.05), bz, 0.3, BRIDGE_HL * 2, 1.0)
placed.append((bx, bz, 2.0))

spots = []


def fishing_spot(sid, kind, gx, gz, yaw, buoy_dist=2.4):
    fx, fz = forward(yaw)
    side_x, side_z = math.cos(yaw), -math.sin(yaw)
    sx, sz = gx + fx * 0.45 + side_x * 0.55, gz + fz * 0.45 + side_z * 0.55
    sy = walk_h(sx, sz) - 0.05
    objs.append(L.cyl(coll, f"PD_FishStake_{sid}", sx, sz, sy, 0.05, 1.0, P["post"], seg=6))
    objs.append(L.box(coll, f"PD_FishSign_{sid}", sx, sz, sy + 0.75, 0.36, 0.05, 0.26, P["fishsign"], rot=yaw, bevel=0.01))
    bx_, bz_ = gx + fx * buoy_dist, gz + fz * buoy_dist
    objs.append(L.cyl(coll, f"PD_Buoy_{sid}", bx_, bz_, WATER_TOP - 0.03, 0.17, 0.16, P["buoy"], seg=8))
    objs.append(L.cyl(coll, f"PD_BuoyTop_{sid}", bx_, bz_, WATER_TOP + 0.13, 0.1, 0.1, P["white"], seg=8))
    spots.append({"id": sid, "kind": kind, "position": [round(gx, 3), round(walk_h(gx, gz), 3), round(gz, 3)], "yaw": round(yaw, 4),
                  "radius": 1.0, "lookAt": [round(bx_, 3), WATER_TOP, round(bz_, 3)]})
    placed.append((gx, gz, 1.2))


for i, gx in enumerate((3.5, 5.0, 6.5)):
    fishing_spot(f"fish_jetty_{i + 1:02d}", "jetty", gx, PLATFORM_Z1 + 0.6, 0.0)
for i, deg in enumerate((125.0, 35.0, 235.0, 270.0, 305.0)):
    gx, gz = ellipse(0.0, CZ, RX + 0.75, RZ + 0.75, math.radians(deg))
    yaw = L.yaw_towards(gx, gz, 0.0, CZ)
    fx, fz = forward(yaw)
    objs.append(L.box(coll, f"PD_BankDeck{i}", gx - fx * 0.2, gz - fz * 0.2, ground(gx - fx * 0.2, gz - fz * 0.2, 0.9) - 0.02, 1.8, 1.5, 0.1, P["deck"], rot=yaw, tile=1.0))
    fishing_spot(f"fish_bank_{i + 1:02d}", "bank", gx, gz, yaw)
mx, mz = ellipse(MARE_C[0], MARE_C[1], MARE_RX + 0.75, MARE_RZ + 0.75, math.radians(40.0))
myaw = L.yaw_towards(mx, mz, *MARE_C)
fishing_spot("fish_mare_01", "mare", mx, mz, myaw, buoy_dist=2.0)

gx0, gz0 = GAZEBO_C
objs.append(L.cyl(coll, "PD_GazeboFloor", gx0, gz0, ground(gx0, gz0, GAZEBO_R) - 0.05, GAZEBO_R, gazebo_floor - ground(gx0, gz0, GAZEBO_R) + 0.05, P["deck"], seg=8, tile=1.0))
entry = math.atan2(-(SPUR[-1][1] - gz0), SPUR[-1][0] - gx0)
step_base = ground(gazebo_step[0], gazebo_step[1], 0.6) - 0.05
objs.append(L.box(coll, "PD_GazeboStep", gazebo_step[0], gazebo_step[1], step_base, 1.6, 0.8, gazebo_step[2] - step_base, P["deck"], rot=entry - math.pi / 2, tile=1.0))
for k in range(8):
    a = math.pi / 8 + k * math.pi / 4
    px, pz = gx0 + (GAZEBO_R - 0.2) * math.cos(a), gz0 - (GAZEBO_R - 0.2) * math.sin(a)
    objs.append(L.cyl(coll, f"PD_GazeboPost{k}", px, pz, gazebo_floor, 0.09, 2.4, P["white"], seg=6))
    add_col(f"COL_Pond_GazeboPost{k}", px, pz, 0.3, 0.3, 2.4)
    a2 = a + math.pi / 4
    if abs(math.atan2(math.sin(a + math.pi / 8 - entry), math.cos(a + math.pi / 8 - entry))) <= math.pi / 8 + 0.01:
        continue
    qx, qz = gx0 + (GAZEBO_R - 0.2) * math.cos(a2), gz0 - (GAZEBO_R - 0.2) * math.sin(a2)
    seg_len = math.hypot(qx - px, qz - pz)
    yaw = math.atan2(-(qz - pz), qx - px)
    objs.append(L.box(coll, f"PD_GazeboRail{k}", (px + qx) / 2, (pz + qz) / 2, gazebo_floor + 0.85, seg_len, 0.08, 0.08, P["white"], rot=yaw))
    add_col(f"COL_Pond_GazeboRail{k}", (px + qx) / 2, (pz + qz) / 2, seg_len, 0.3, 1.0, yaw)
objs.append(L.cyl(coll, "PD_GazeboBeam", gx0, gz0, gazebo_floor + 2.4, GAZEBO_R, 0.18, P["white"], seg=8))
objs.append(L.cone(coll, "PD_GazeboRoof", gx0, gz0, gazebo_floor + 2.58, GAZEBO_R + 0.45, 0.15, 1.5, P["gazebo_roof"], seg=8))
placed.append((gx0, gz0, GAZEBO_R + 1.0))

kx, kz = KIOSK
ky = ground(kx, kz, 1.5)
objs.append(L.furn(coll, "PD_Kiosk", kx, kz, math.pi / 2, [
    (0, 0, ky, 2.6, 2.2, 2.3, P["kiosk"], 0.03),
    (0, -1.2, ky, 2.4, 0.3, 0.95, P["wood"], 0.02),
    (0, -1.15, ky + 1.15, 2.0, 0.06, 0.9, P["window"]),
    (0, 0, ky + 2.3, 3.0, 2.8, 0.12, P["roof"], 0.02),
]))
objs.append(L.box(coll, "PD_KioskSign", kx - 1.45, kz, ky + 2.45, 0.08, 1.6, 0.4, P["sign"]))
sign_txt = L.text_mesh(coll, "PD_KioskSignText", "BAIT", kx - 1.5, kz, ky + 2.5, 0.28, 0.02, P["signtxt"], facing="+z")
sign_txt.rotation_euler = (math.pi / 2, 0, -math.pi / 2)
objs.append(sign_txt)
add_col("COL_Pond_Kiosk", kx, kz, 2.6, 2.8, 2.4)
kiosk_stand = (kx - 2.3, kz)
kiosk_yaw = L.yaw_towards(*kiosk_stand, kx, kz)

n = 0
for t in (20.0, 60.0, 120.0, 160.0, 215.0, 325.0):
    gx, gz = ellipse(0.0, CZ, LOOP_RX + PATH_W + 0.6, LOOP_RZ + PATH_W + 0.6, math.radians(t))
    n += 1
    lamp(f"PD_PathLamp{n:02d}", gx, gz)
for trail, every in ((TRAIL_E, 16), (TRAIL_W, 16)):
    for idx in range(8, len(trail) - 4, every):
        (px, pz), _, (nx, nz) = path_frame(trail, idx)
        n += 1
        lamp(f"PD_PathLamp{n:02d}", px + nx * 1.3, pz + nz * 1.3)

b = 0
for t in (250.0, 290.0, 160.0, 20.0):
    gx, gz = ellipse(0.0, CZ, LOOP_RX - 0.7, LOOP_RZ - 0.7, math.radians(t))
    bench(f"PD_Bench{b:02d}", gx, gz, L.yaw_towards(gx, gz, 0.0, CZ))
    if b % 2 == 0:
        bin_(f"PD_Bin{b:02d}", gx + 1.4 * math.cos(math.radians(t + 90)), gz + 1.4 * math.sin(math.radians(t + 90)))
    b += 1
for trail, picks, side in ((TRAIL_E, (0.2, 0.45, 0.75, 0.97), -1), (TRAIL_W, (0.25, 0.55, 0.8, 0.97), 1)):
    for f in picks:
        idx = min(int(f * (len(trail) - 1)), len(trail) - 2)
        (px, pz), (tx, tz), (nx, nz) = path_frame(trail, idx)
        gx, gz = px + nx * 1.6 * side, pz + nz * 1.6 * side
        bench(f"PD_Bench{b:02d}", gx, gz, L.yaw_towards(gx, gz, px, pz))
        if b % 2 == 1:
            bin_(f"PD_Bin{b:02d}", gx + tx * 1.3, gz + tz * 1.3)
        b += 1
bench("PD_BenchGazebo", gx0 + 1.6 * math.cos(entry + math.pi), gz0 - 1.6 * math.sin(entry + math.pi), L.yaw_towards(gx0 + 1.6 * math.cos(entry + math.pi), gz0 - 1.6 * math.sin(entry + math.pi), gx0, gz0))

for i, (tx, tz, rot) in enumerate([(32.5, -39.5 - PUSH, 0.4), (35.8, -34.0 - PUSH, -0.3), (-28.8, -40.5 - PUSH, -0.5), (-25.0, -43.5 - PUSH, 0.2)]):
    picnic(f"PD_Picnic{i}", tx, tz, rot)
for i, (tx, tz, rot) in enumerate([(30.4, -41.6 - PUSH, 0.4), (-26.6, -41.2 - PUSH, 0.2)]):
    objs.append(L.box(coll, f"PD_Blanket{i}", tx, tz, ground(tx, tz, 0.8) + 0.005, 1.6, 1.2, 0.02, P["blanket"], rot=rot, tile=0.5))

for t in (200.0, 340.0):
    wx, wz = ellipse(0.0, CZ, RX + 2.6, RZ + 2.4, math.radians(t))
    tree_willow(wx, wz, 1.05)
    placed.append((wx, wz, 2.0))
tree_willow(MARE_C[0] - 4.6, MARE_C[1] + 1.5, 0.9)
placed.append((MARE_C[0] - 4.6, MARE_C[1] + 1.5, 2.0))


def mix(kinds):
    def make(x, z):
        k = rnd.choices([k for k, _ in kinds], [w for _, w in kinds])[0]
        {"round": tree_round, "pine": tree_pine, "birch": tree_birch,
         "blossom": lambda x_, z_: tree_round(x_, z_, leaves=("blossom", "blossom2"))}[k](x, z)
    return make


counts = {}
counts["grove"] = scatter((-34.0, -46.0 - PUSH, 13.0), 22, 0.8, mix([("pine", 0.4), ("birch", 0.35), ("round", 0.25)]))
counts["west_end"] = scatter((-40.0, -27.0 - PUSH, 7.0), 6, 0.8, mix([("round", 0.5), ("birch", 0.5)]))
counts["gazebo_hill"] = scatter((31.0, -58.0 - PUSH, 8.0), 7, 0.8, mix([("round", 0.6), ("blossom", 0.4)]))
counts["east_meadow"] = scatter((38.0, -40.0 - PUSH, 9.0), 8, 0.8, mix([("round", 0.5), ("blossom", 0.5)]))
counts["east_end"] = scatter((41.5, -26.0 - PUSH, 6.0), 4, 0.8, mix([("round", 1.0)]))
counts["south_strip"] = scatter((0.0, -50.0 - PUSH, 26.0), 10, 0.8, mix([("round", 0.6), ("blossom", 0.25), ("birch", 0.15)]))
counts["north_strip"] = scatter((0.0, -67.5 - PUSH, 22.0), 6, 0.6, mix([("round", 0.5), ("pine", 0.5)]))


def ridge_ok(x, z, rad, _paths, spacing):
    r = math.hypot(x, z)
    return FENCE_R + 1.2 <= r <= SKY_R - 1.0 and abs(x) < 45.5 and all(math.hypot(x - px, z - pz) >= spacing for px, pz, _ in placed)


counts["ridge"] = scatter((0.0, -60.0 - PUSH, 50.0), 34, 1.0, lambda x, z: (tree_pine(x, z, rnd.uniform(1.1, 1.7), collide=False) if rnd.random() < 0.7
                                                                   else tree_round(x, z, rnd.uniform(1.1, 1.5), collide=False)),
                          spacing=3.0, check=ridge_ok, tries=3000)
counts["bushes"] = scatter((0.0, -52.0 - PUSH, 50.0), 26, 0.7, bush, paths=1.6, spacing=0.3, tries=3000)
counts["flowers"] = scatter((0.0, -52.0 - PUSH, 50.0), 16, 0.9, flower_patch, paths=1.0, spacing=0.1, tries=4000)
for fx, fz in ((-9.5, -47.8), (11.8, -47.9)):
    flower_patch(fx, fz, n=16, spread=1.0)


def tuft_ok(x, z, rad, _p, _s):
    r = math.hypot(x, z)
    return HEDGE_R + 1.0 <= r <= FENCE_R - 0.4 and abs(x) < PARK_X - 0.5 and min_dist(PATHS, x, z) > 1.1 and pond_e(x, z) > 1.05 \
        and mare_e(x, z) > 1.05 and min_dist(CREEK, x, z) > 1.1 and math.hypot(x - GAZEBO_C[0], z - GAZEBO_C[1]) > GAZEBO_R + 0.3


tufts = 0
for _ in range(4000):
    if tufts == 160:
        break
    x, z = rnd.uniform(-46, 46), rnd.uniform(-70, -8)
    if tuft_ok(x, z, 0, 0, 0):
        grass_tuft(x, z)
        tufts += 1
counts["tufts"] = tufts

for i in range(14):
    t = rnd.uniform(0, 2 * math.pi)
    if abs(math.cos(t) * RX - JETTY_X) < 3.5 and math.sin(t) > 0:
        continue
    gx, gz = ellipse(0.0, CZ, RX * rnd.uniform(1.02, 1.12), RZ * rnd.uniform(1.02, 1.12), t)
    rock(f"PD_RockBank{i:02d}", gx, gz, rnd.uniform(0.25, 0.5), mat=rnd.choice(("rock", "rock2")))
for i in range(7):
    t = 2 * math.pi * i / 7 + 0.3
    gx, gz = ellipse(MARE_C[0], MARE_C[1], MARE_RX * 1.08, MARE_RZ * 1.08, t)
    rock(f"PD_RockMare{i:02d}", gx, gz, rnd.uniform(0.25, 0.45), mat=rnd.choice(("rock", "rock2")))
for i, (ci, side) in enumerate(((6, 1), (14, -1), (22, 1), (30, -1), (38, 1), (46, -1), (54, 1))):
    if ci >= len(CREEK) - 1:
        continue
    (px, pz), _, (nx, nz) = path_frame(CREEK, ci)
    rock(f"PD_RockCreek{i:02d}", px + nx * side * 1.25, pz + nz * side * 1.25, rnd.uniform(0.25, 0.45), mat="rock2")
counts["big_rocks"] = scatter((0.0, -55.0 - PUSH, 48.0), 7, 0.7, lambda x, z: rock(f"PD_RockBig{len(placed):03d}", x, z, rnd.uniform(0.6, 0.9), collide=True, mat=rnd.choice(("rock", "rock2"))),
                              tries=2000)

reed_spots = [("pond", t) for t in (10.0, 55.0, 150.0, 170.0, 195.0, 215.0, 250.0, 285.0, 320.0, 345.0)] + [("mare", t) for t in (110.0, 200.0, 290.0)]
for c, (where, deg) in enumerate(reed_spots):
    for kk in range(6):
        t = math.radians(deg + (kk - 2.5) * 2.4)
        rr = 0.08 * ((kk * 7) % 3)
        if where == "pond":
            gx, gz = ellipse(0.0, CZ, RX - 0.15 + rr, RZ - 0.15 + rr, t)
        else:
            gx, gz = ellipse(MARE_C[0], MARE_C[1], MARE_RX - 0.1 + rr, MARE_RZ - 0.1 + rr, t + rnd.uniform(-0.1, 0.1))
        h = 0.9 + 0.12 * ((kk * 5 + c) % 4)
        objs.append(L.cyl(coll, f"PD_Reed{c:02d}_{kk}", gx, gz, BED_H, 0.025, h, P["reed"], seg=4))
        if kk % 2 == 0:
            objs.append(L.cyl(coll, f"PD_Cattail{c:02d}_{kk}", gx, gz, BED_H + h - 0.05, 0.05, 0.22, P["cattail"], seg=5))
for c, ci in enumerate(range(4, len(CREEK) - 4, 9)):
    (px, pz), _, (nx, nz) = path_frame(CREEK, ci)
    for kk in range(4):
        side = 1 if c % 2 else -1
        objs.append(L.cyl(coll, f"PD_CreekReed{c:02d}_{kk}", px + nx * side * (0.85 + 0.1 * kk) + 0.15 * kk, pz + nz * side * (0.85 + 0.1 * kk), BED_H, 0.025,
                          0.8 + 0.1 * kk, P["reed"], seg=4))

lily = [(lx, lz - PUSH, r) for lx, lz, r in [(-7.0, -56.0, 0.45), (-5.6, -57.2, 0.32), (-9.5, -61.0, 0.5), (-3.0, -62.0, 0.4), (9.5, -60.5, 0.45), (10.6, -59.2, 0.3),
                                           (-1.0, -59.8, 0.38), (1.5, -62.5, 0.42), (-11.0, -58.2, 0.35), (12.0, -57.6, 0.4)]] \
    + [(MARE_C[0] - 1.2, MARE_C[1] - 0.5, 0.35), (MARE_C[0] + 0.8, MARE_C[1] + 0.9, 0.3)]
for i, (lx, lz, r) in enumerate(lily):
    objs.append(L.cyl(coll, f"PD_Lily{i:02d}", lx, lz, WATER_TOP + 0.001, r, 0.012, P["lily"], seg=7))
    if i % 3 == 0:
        objs.append(L.cone(coll, f"PD_LilyFlower{i:02d}", lx + 0.1, lz, WATER_TOP + 0.013, 0.12, 0.04, 0.1, P["fl_pink"], seg=5))

for i, (dx, dz, dyaw) in enumerate([(-4.0, -60.5 - PUSH, 0.6), (-3.1, -61.2 - PUSH, 0.9), (8.0, -61.8 - PUSH, -1.2)]):
    body = blob(f"PD_Duck{i}_Body", dx, dz, WATER_TOP - 0.04, 0.2, P["duck"], sy=0.6, jitter=0.05)
    body.scale = (1.0, 1.4, 1.0)
    body.rotation_euler = (0, 0, dyaw)
    fx, fz = forward(dyaw)
    blob(f"PD_Duck{i}_Head", dx + fx * 0.2, dz + fz * 0.2, WATER_TOP + 0.12, 0.1, P["duckhead"], jitter=0.03)
    beak = L.box(coll, f"PD_Duck{i}_Beak", dx + fx * 0.31, dz + fz * 0.31, WATER_TOP + 0.17, 0.06, 0.09, 0.03, P["beak"], rot=dyaw)
    objs.append(beak)

objs.append(L.furn(coll, "PD_Rowboat", PLATFORM_X1 + 1.0, -56.9 - PUSH, 0.15, [
    (0, 0, WATER_TOP - 0.06, 1.0, 2.6, 0.32, P["boat"], 0.08),
    (0, 0, WATER_TOP + 0.2, 0.86, 2.3, 0.02, P["deck"]),
    (0, -0.5, WATER_TOP + 0.14, 0.9, 0.22, 0.1, P["wood"]),
    (0, 0.5, WATER_TOP + 0.14, 0.9, 0.22, 0.1, P["wood"]),
]))

fence_n = int(round(2 * math.asin(PARK_X / FENCE_R) * FENCE_R / 2.4))
th0 = -math.asin(PARK_X / FENCE_R)
fence_pts = [(FENCE_R * math.sin(th0 + 2 * abs(th0) * i / fence_n), -FENCE_R * math.cos(th0 + 2 * abs(th0) * i / fence_n)) for i in range(fence_n + 1)]
side_z_end = -math.sqrt(HEDGE_R ** 2 - PARK_X ** 2)
arc_end_z = fence_pts[0][1]
for sgn in (-1, 1):
    zs = [arc_end_z + (side_z_end - arc_end_z) * i / 18 for i in range(1, 19)]
    side = [(sgn * (PARK_X + 0.3), zz) for zz in zs]
    if sgn < 0:
        fence_pts = list(reversed(side)) + fence_pts
    else:
        fence_pts = fence_pts + side
for i, (fx, fz) in enumerate(fence_pts):
    objs.append(L.box(coll, f"PD_FencePost{i:03d}", fx, fz, ground(fx, fz, 0.1) - 0.05, 0.12, 0.12, 1.15, P["post"]))
for i, ((x0, z0), (x1, z1)) in enumerate(zip(fence_pts, fence_pts[1:])):
    yaw = math.atan2(-(z1 - z0), x1 - x0)
    ln = math.hypot(x1 - x0, z1 - z0)
    base = (ground(x0, z0, 0.05) + ground(x1, z1, 0.05)) / 2
    for kk, hh in enumerate((0.45, 0.85)):
        objs.append(L.box(coll, f"PD_FenceRail{i:03d}_{kk}", (x0 + x1) / 2, (z0 + z1) / 2, base + hh, ln + 0.05, 0.06, 0.09, P["wood"], rot=yaw))
    if math.hypot(x0, z0) > FENCE_R - 0.5 and math.hypot(x1, z1) > FENCE_R - 0.5:
        add_col(f"COL_Pond_Fence{i:03d}", (x0 + x1) / 2, (z0 + z1) / 2, ln + 0.3, 0.4, 1.2, yaw)

L.export_glb(os.path.join(OUT, "pond.glb"), objs)
heights = [round(walk_h(GRID_X0 + i, GRID_Z0 + j), 3) for j in range(GRID_ROWS) for i in range(GRID_COLS)]
os.makedirs(OUT, exist_ok=True)
with open(os.path.join(OUT, "pond.layout.json"), "w", encoding="utf-8") as fh:
    json.dump({
        "version": 2,
        "gate": {"x": 0.0, "z": -46.0, "width": 12.2},
        "bounds": {"minZ": -71.0 - PUSH},
        "center": [0.0, 0.0, CZ],
        "fishingSpots": spots,
        "kiosk": {"position": [round(kiosk_stand[0], 3), round(walk_h(*kiosk_stand), 3), kiosk_stand[1]], "yaw": round(kiosk_yaw, 4)},
        "heightmap": {"x0": GRID_X0, "z0": GRID_Z0, "cell": 1.0, "cols": GRID_COLS, "rows": GRID_ROWS, "heights": heights},
        "collision": col,
    }, fh, separators=(",", ":"))
faces = sum(len(o.data.polygons) for o in objs if o.type == "MESH")
print("pond objects:", len(objs), "faces:", faces, "collision boxes:", len(col), "spots:", len(spots), "gazebo floor:", gazebo_floor,
      "max walk h:", max(heights), "scatter:", counts)
