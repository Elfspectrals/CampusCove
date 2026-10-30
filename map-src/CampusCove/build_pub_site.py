"""The Salty Shamrock site: the pub beyond the Cove Pond east gate, its decorated path, creek bridge and beer garden.

Reads out/work/pub/{exterior,interior}.layout.json and out/park/pond/pond.layout.json (pubGate), so run build_pub.py
and build_pond.py first. Outputs out/park/pub_site/{pub_site.glb, pub_site.colsrc.glb, pub_site.layout.json}; `points`
are the interior layout entries in world coordinates (docs/PUB.md, section 3). Then `npm run assets:optimize -- park`
and `node scripts/apply-pub.mjs`.
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

PUB_POS = (90.0, -130.0)
PUB_YAW = 0.0
GARDEN = (87.0, 103.0, -121.5, -110.5)
GARDEN_SEAT_Y = 0.45
PATH_W = 2.4
CREEK_HW = 0.8
BRIDGE_TOP = 0.1
TWO_PI = 2 * math.pi
OUT = os.path.join(L.OUT_ROOT, "park", "pub_site")
PUB_OUT = os.path.join(L.OUT_ROOT, "work", "pub")
POND_OUT = os.path.join(L.OUT_ROOT, "park", "pond")

ext = json.load(open(os.path.join(PUB_OUT, "exterior.layout.json"), encoding="utf-8"))
inner = json.load(open(os.path.join(PUB_OUT, "interior.layout.json"), encoding="utf-8"))
pond = json.load(open(os.path.join(POND_OUT, "pond.layout.json"), encoding="utf-8"))
gate = pond["pubGate"]
GATE = {"x": gate["x"], "z": gate["z"], "width": gate["width"]}
gate_u = (math.sin(gate["yaw"]), -math.cos(gate["yaw"]))
ox, oy, oz = ext["interiorOffset"]
cos_y, sin_y = math.cos(PUB_YAW), math.sin(PUB_YAW)
rnd = random.Random(17)


def to_world(lx, ly, lz):
    return [round(PUB_POS[0] + lx * cos_y + lz * sin_y, 3), round(ly, 3), round(PUB_POS[1] - lx * sin_y + lz * cos_y, 3)]


def interior_to_world(p):
    return to_world(p[0] + ox, p[1] + oy, p[2] + oz)


def world_yaw(yaw):
    return round((yaw + PUB_YAW) % TWO_PI, 4)


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
    out.append(pts[-1])
    return out


def path_frame(pts, idx):
    a, c = pts[max(idx - 1, 0)], pts[min(idx + 1, len(pts) - 1)]
    tx, tz = c[0] - a[0], c[1] - a[1]
    k = math.hypot(tx, tz)
    return pts[idx], (tx / k, tz / k), (-tz / k, tx / k)


def at_fraction(pts, f):
    return path_frame(pts, min(int(f * (len(pts) - 1)), len(pts) - 2))


door = to_world(*ext["doorLocal"])
start = (GATE["x"] + 1.5 * gate_u[0], GATE["z"] + 1.5 * gate_u[1])
PATH = resample(chaikin([start, (GATE["x"] + 7.0 * gate_u[0], GATE["z"] + 7.0 * gate_u[1]), (41.0, -86.0), (48.5, -90.0), (55.0, -97.0), (60.0, -104.5),
                         (67.0, -108.5), (75.0, -110.5), (80.0, -114.0), (84.0, -119.0), (88.0, -122.0), (door[0], door[2] + 1.6)]), 0.7)
CREEK = resample(chaikin([(44.0, -113.0), (50.0, -106.5), (56.0, -102.0), (62.0, -97.5), (68.0, -94.5), (75.0, -90.5)]), 0.7)
path_len = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(PATH, PATH[1:]))
cross = min(range(len(PATH)), key=lambda i: min(math.hypot(PATH[i][0] - cx, PATH[i][1] - cz) for cx, cz in CREEK))
bridge_c, bridge_t, bridge_n = path_frame(PATH, cross)
bridge_yaw = math.atan2(bridge_t[0], bridge_t[1])

sc = L.new_build_scene("PARK_pub_site")
coll = bpy.data.collections.new("PubSite")
sc.collection.children.link(coll)
P = {
    "grass": L.make_mat("TW_GrassPub", "#7dbb62", 1.0, "noise", 0.06),
    "path": L.make_mat("TW_PubPath", "#c2b28f", 0.95, "noise", 0.06),
    "flag": L.make_mat("TW_PubFlagstone", "#8f8a80", 0.9, "tiles", 0.06, accent="#6f6a62"),
    "wall": L.make_mat("TW_PubStoneWall", "#9a948a", 0.95, "tiles", 0.08, accent="#726d65"),
    "iron": L.make_mat("TW_PubIron", "#2a2d33", 0.6, "noise", 0.03),
    "lantern": L.make_mat("TW_PubLantern", "#fff1c4", 0.5, "noise", 0.0, emit="#ffd27a", emit_strength=1.4),
    "bulb": L.make_mat("TW_PubBulb", "#fff3d6", 0.4, "noise", 0.0, emit="#ffe2a0", emit_strength=1.6),
    "oak": L.make_mat("TW_PubOak", "#a97a4a", 0.7, "planks", 0.05, accent="#7c5631"),
    "pewter": L.make_mat("TW_PubPewter", "#8c9196", 0.4, "noise", 0.03),
    "deck": L.make_mat("TW_PubDeck", "#b08655", 0.85, "planks", 0.05, accent="#8d6238"),
    "post": L.make_mat("TW_PubPost", "#6e4f33", 0.85, "noise", 0.04),
    "sign": L.make_mat("TW_PubSignBoard", "#1f4a33", 0.7, "noise", 0.02),
    "gold": L.make_mat("TW_PubGold", "#e3b84a", 0.3, "noise", 0.02, emit="#e3b84a", emit_strength=0.6),
    "trunk": L.make_mat("TW_TrunkPub", "#7a5638", 0.8, "planks", 0.04, accent="#5e4129"),
    "leaf1": L.make_mat("TW_LeafPub", "#4f9d54", 0.9, "noise", 0.07),
    "leaf2": L.make_mat("TW_LeafPubLight", "#6fb85a", 0.9, "noise", 0.07),
    "leaf3": L.make_mat("TW_LeafPubDeep", "#3e8546", 0.9, "noise", 0.07),
    "berry": L.make_mat("TW_PubBerry", "#e0533d", 0.6, "noise", 0.04),
    "hedge": L.make_mat("TW_PubHedge", "#4c9450", 0.95, "noise", 0.08),
    "rock": L.make_mat("TW_PubRock", "#9c978e", 0.9, "noise", 0.08),
    "sand": L.make_mat("TW_PubCreekBank", "#d9c89a", 0.95, "noise", 0.05),
    "water": L.make_mat("TW_PondWater", "#4fa9c8", 0.15, "noise", 0.03),
    "statue": L.make_mat("TW_PubStatueGreen", "#2f8a4a", 0.7, "noise", 0.04),
    "statue2": L.make_mat("TW_PubStatueOrange", "#d9772a", 0.7, "noise", 0.04),
    "skin": L.make_mat("TW_PubStatueSkin", "#e9b48f", 0.8, "noise", 0.03),
    "black": L.make_mat("TW_PubBlack", "#1b1b1f", 0.6, "noise", 0.02),
    "plinth": L.make_mat("TW_PubPlinth", "#b5ada0", 0.85, "tiles", 0.04, accent="#9b9386"),
    "parasol": L.make_mat("TW_PubParasol", "#2f8a4a", 0.85, "stripes", 0.03, accent="#f1ede2"),
    "flower": L.make_mat("TW_PubFlowers", "#f2a7b8", 0.9, "noise", 0.08),
    "flower2": L.make_mat("TW_PubFlowersYellow", "#f6d04d", 0.9, "noise", 0.08),
}
so = []
col = []
garden_seats = []
placed = []


def add(o):
    so.append(o)
    return o


def add_col(name, gx, gz, sx, sz, h, yaw=0.0):
    col.append({"name": f"COL_Pub_{name}", "cx": round(gx, 3), "cz": round(gz, 3), "hx": round(sx / 2, 3), "hz": round(sz / 2, 3), "hy": round(h / 2, 3),
                "cy": round(h / 2, 3), "yaw": round(yaw, 4)})


def mesh_obj(name, bm, mat, loc=(0.0, 0.0, 0.0), tile=1.0):
    bm.normal_update()
    L._box_uv(bm, tile)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    ob.location = loc
    coll.objects.link(ob)
    return add(ob)


def blob(name, gx, gz, y0, r, mat, sy=1.0, jitter=0.14):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r)
    for v in bm.verts:
        v.co.x += rnd.uniform(-jitter, jitter) * r
        v.co.y += rnd.uniform(-jitter, jitter) * r
        v.co.z = (v.co.z + rnd.uniform(-jitter, jitter) * r) * sy
    zmin = min(v.co.z for v in bm.verts)
    for v in bm.verts:
        v.co.z -= zmin
    return mesh_obj(name, bm, mat, L.b(gx, gz, y0))


def ribbon(name, pts, width, mat, y):
    bm = bmesh.new()
    left, right = [], []
    for i in range(len(pts)):
        (px, pz), _, (nx, nz) = path_frame(pts, i)
        left.append(bm.verts.new(L.b(px + nx * width / 2, pz + nz * width / 2, y)))
        right.append(bm.verts.new(L.b(px - nx * width / 2, pz - nz * width / 2, y)))
    for i in range(len(pts) - 1):
        f = bm.faces.new((left[i], right[i], right[i + 1], left[i + 1]))
        f.normal_update()
        if f.normal.z < 0:
            f.normal_flip()
    return mesh_obj(name, bm, mat, tile=2.0)


def low_text(name, body, gx, gz, y0, size, mat, yaw):
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


def facing_yaw(dx, dz):
    """Blender yaw so a box's local +z side (or a low_text) faces the game direction (dx, dz)."""
    return math.atan2(dx, dz)


def local_to_game(gx, gz, rot, lx, lz):
    c, s = math.cos(rot), math.sin(rot)
    return gx + lx * c + lz * s, gz - lx * s + lz * c


counter = {}


def tag(prefix):
    counter[prefix] = counter.get(prefix, 0) + 1
    return f"{prefix}{counter[prefix]:02d}"


def lantern(gx, gz):
    n = tag("Lantern")
    add(L.cyl(coll, f"PS_{n}_Pole", gx, gz, 0.0, 0.06, 2.6, P["iron"], seg=6))
    add(L.box(coll, f"PS_{n}_Base", gx, gz, 0.0, 0.3, 0.3, 0.12, P["iron"], bevel=0.02))
    add(L.box(coll, f"PS_{n}_Head", gx, gz, 2.6, 0.32, 0.32, 0.42, P["lantern"], bevel=0.03))
    add(L.box(coll, f"PS_{n}_Cap", gx, gz, 3.02, 0.4, 0.4, 0.08, P["iron"], bevel=0.02))
    add_col(n, gx, gz, 0.32, 0.32, 3.1)
    placed.append((gx, gz, 0.4))


def stone_wall(gx, gz, length, yaw):
    n = tag("Wall")
    add(L.box(coll, f"PS_{n}", gx, gz, 0.0, length, 0.45, 0.55, P["wall"], rot=yaw, bevel=0.03, tile=1.0))
    add(L.box(coll, f"PS_{n}_Cap", gx, gz, 0.55, length + 0.05, 0.5, 0.1, P["wall"], rot=yaw, bevel=0.02, tile=1.0))
    add_col(n, gx, gz, length, 0.5, 0.7, yaw)
    placed.append((gx, gz, length / 2))


def barrel(gx, gz, flowers=None):
    n = tag("Barrel")
    add(L.cyl(coll, f"PS_{n}", gx, gz, 0.0, 0.32, 0.85, P["oak"], seg=10))
    for k, y in enumerate((0.12, 0.7)):
        add(L.cyl(coll, f"PS_{n}_Hoop{k}", gx, gz, y, 0.332, 0.06, P["pewter"], seg=10))
    if flowers:
        add(L.box(coll, f"PS_{n}_Leaf", gx, gz, 0.85, 0.6, 0.6, 0.22, P["hedge"], bevel=0.08))
        add(L.box(coll, f"PS_{n}_Flower", gx, gz, 1.05, 0.46, 0.46, 0.12, flowers, bevel=0.04))
    add_col(n, gx, gz, 0.7, 0.7, 1.1)
    placed.append((gx, gz, 0.5))


def signpost(gx, gz, dx, dz):
    n = tag("Signpost")
    yaw = facing_yaw(dx, dz)
    add(L.box(coll, f"PS_{n}_Pole", gx, gz, 0.0, 0.14, 0.14, 2.4, P["post"]))
    add(L.box(coll, f"PS_{n}_Board", gx, gz, 1.75, 2.3, 0.06, 0.36, P["sign"], rot=yaw))
    low_text(f"PS_{n}_Text", "THE SALTY SHAMROCK >", gx + 0.04 * dx, gz + 0.04 * dz, 1.84, 0.18, P["gold"], yaw)
    add_col(n, gx, gz, 2.3, 0.3, 2.4, yaw)
    placed.append((gx, gz, 1.2))


def bench(gx, gz, rot):
    n = tag("Bench")
    add(L.furn(coll, f"PS_{n}", gx, gz, rot, [(0, 0, 0.42, 1.8, 0.5, 0.06, P["deck"]), (0, 0.22, 0.48, 1.8, 0.06, 0.45, P["deck"]),
                                            (-0.8, 0, 0.0, 0.08, 0.45, 0.42, P["iron"]), (0.8, 0, 0.0, 0.08, 0.45, 0.42, P["iron"])]))
    add_col(n, gx, gz, 1.8, 0.5, 0.9, rot)
    placed.append((gx, gz, 1.0))


def tree(gx, gz, kind, s=1.0):
    n = tag("Tree")
    if kind == "oak":
        add(L.cone(coll, f"PS_{n}_Trunk", gx, gz, 0.0, 0.3 * s, 0.18 * s, 2.2 * s, P["trunk"], seg=6))
        for k in range(3):
            a = TWO_PI * k / 3 + rnd.uniform(-0.3, 0.3)
            blob(f"PS_{n}_Leaf{k}", gx + 0.6 * s * math.cos(a), gz + 0.6 * s * math.sin(a), (1.7 + 0.3 * (k % 2)) * s, rnd.uniform(1.2, 1.5) * s, P[("leaf1", "leaf3", "leaf2")[k]], sy=0.85)
        add_col(n, gx, gz, 0.8, 0.8, 3.0)
        placed.append((gx, gz, 2.0))
    else:
        add(L.cone(coll, f"PS_{n}_Trunk", gx, gz, 0.0, 0.14 * s, 0.09 * s, 2.0 * s, P["trunk"], seg=5))
        blob(f"PS_{n}_Leaf0", gx, gz, 1.8 * s, 0.95 * s, P["leaf2"], sy=1.1)
        blob(f"PS_{n}_Leaf1", gx + 0.3 * s, gz - 0.2 * s, 2.5 * s, 0.6 * s, P["leaf1"], sy=0.9)
        for k in range(3):
            a = TWO_PI * k / 3 + 0.4
            add(L.box(coll, f"PS_{n}_Berry{k}", gx + 0.75 * s * math.cos(a), gz + 0.75 * s * math.sin(a), 2.0 * s + 0.2 * k, 0.22, 0.22, 0.18, P["berry"], bevel=0.05))
        add_col(n, gx, gz, 0.5, 0.5, 3.0)
        placed.append((gx, gz, 1.3))


def hedge(gx, gz, length, yaw):
    n = tag("Hedge")
    add(L.box(coll, f"PS_{n}", gx, gz, 0.0, length, 0.7, 1.0, P["hedge"], rot=yaw, bevel=0.12, tile=1.0))
    add_col(n, gx, gz, length, 0.7, 1.1, yaw)


def rock(gx, gz, r):
    n = tag("Rock")
    blob(f"PS_{n}", gx, gz, -0.08, r, P["rock"], sy=0.55, jitter=0.22)
    if r > 0.5:
        add_col(n, gx, gz, r * 1.6, r * 1.6, 1.0)


def flowers(gx, gz, mat):
    n = tag("Flowers")
    add(L.box(coll, f"PS_{n}_Leaf", gx, gz, 0.0, 0.9, 0.7, 0.22, P["hedge"], bevel=0.08))
    add(L.box(coll, f"PS_{n}", gx, gz, 0.2, 0.7, 0.5, 0.14, mat, bevel=0.05))


def clear(x, z, rad, path_gap=2.2):
    if min(math.hypot(px - x, pz - z) for px, pz in PATH) < path_gap + rad or min(math.hypot(px - x, pz - z) for px, pz in CREEK) < 2.0 + rad:
        return False
    if GARDEN[0] - 1.5 - rad < x < GARDEN[1] + 1.5 + rad and GARDEN[2] - 1.5 - rad < z < GARDEN[3] + 1.5 + rad:
        return False
    if abs(x - PUB_POS[0]) < 12.5 + rad and -16.0 - rad < z - PUB_POS[1] < 8.0 + rad:
        return False
    if math.hypot(x, z) < 86.0 + rad:
        return False
    return all(math.hypot(x - px, z - pz) >= rad + pr + 0.5 for px, pz, pr in placed)


def picnic_table(gx, gz, rot):
    n = tag("Picnic")
    add(L.furn(coll, f"PS_{n}", gx, gz, rot, [
        (0, 0, 0.72, 1.9, 0.8, 0.06, P["deck"]), (-0.75, 0, 0.0, 0.08, 0.7, 0.72, P["post"]), (0.75, 0, 0.0, 0.08, 0.7, 0.72, P["post"]),
        (0, 0, 0.3, 1.5, 0.08, 0.06, P["post"])]))
    for side, lz in (("A", -0.7), ("B", 0.7)):
        sx, sz = local_to_game(gx, gz, rot, 0.0, lz)
        yaw = rot + (math.pi if lz < 0 else 0.0)
        sid = f"garden_{len(garden_seats) + 1:02d}"
        add(L.furn(coll, f"seat_{sid}", sx, sz, rot, [(0, 0, 0.4, 1.9, 0.3, 0.05, P["deck"]), (-0.75, 0, 0.0, 0.06, 0.26, 0.4, P["post"]), (0.75, 0, 0.0, 0.06, 0.26, 0.4, P["post"])]))
        garden_seats.append({"id": sid, "kind": "garden", "position": [round(sx, 3), GARDEN_SEAT_Y, round(sz, 3)], "yaw": round(yaw % TWO_PI, 4)})
    add_col(n, gx, gz, 1.9, 1.8, 0.9, rot)


def parasol(gx, gz):
    n = tag("Parasol")
    add(L.cyl(coll, f"PS_{n}_Pole", gx, gz, 0.0, 0.03, 2.3, P["iron"], seg=5))
    add(L.cone(coll, f"PS_{n}_Top", gx, gz, 1.9, 1.3, 0.05, 0.45, P["parasol"], seg=8))
    add_col(n, gx, gz, 0.2, 0.2, 2.3)


# ---------------------------------------------------------------- path, creek, bridge
ribbon("PS_Path", PATH, PATH_W, P["path"], 0.03)
ribbon("PS_CreekBank", CREEK, CREEK_HW * 2 + 1.2, P["sand"], 0.012)
ribbon("PS_CreekWater", CREEK, CREEK_HW * 2, P["water"], 0.03)
for i, ((x0, z0), (x1, z1)) in enumerate(zip(CREEK, CREEK[1:])):
    mx, mz = (x0 + x1) / 2, (z0 + z1) / 2
    if math.hypot(mx - bridge_c[0], mz - bridge_c[1]) < 1.6:
        continue
    add_col(f"Creek{i:02d}", mx, mz, math.hypot(x1 - x0, z1 - z0) + 0.35, CREEK_HW * 2 + 0.2, 1.0, math.atan2(-(z1 - z0), x1 - x0))
for k, ci in enumerate(range(3, len(CREEK) - 3, 6)):
    (px, pz), _, (nx, nz) = path_frame(CREEK, ci)
    side = 1 if k % 2 else -1
    if math.hypot(px - bridge_c[0], pz - bridge_c[1]) > 2.6:
        rock(px + nx * side * 1.5, pz + nz * side * 1.5, rnd.uniform(0.3, 0.5))
add(L.box(coll, "PS_BridgeDeck", bridge_c[0], bridge_c[1], 0.0, 2.8, 4.4, BRIDGE_TOP, P["deck"], rot=bridge_yaw, tile=1.0))
for sgn, tag_ in ((-1, "W"), (1, "E")):
    rx, rz = bridge_c[0] + bridge_n[0] * sgn * 1.35, bridge_c[1] + bridge_n[1] * sgn * 1.35
    add(L.box(coll, f"PS_BridgeRail{tag_}", rx, rz, BRIDGE_TOP + 0.55, 0.08, 4.4, 0.08, P["deck"], rot=bridge_yaw))
    for kk, d in enumerate((-2.1, 0.0, 2.1)):
        add(L.box(coll, f"PS_BridgePost{tag_}{kk}", rx + bridge_t[0] * d, rz + bridge_t[1] * d, 0.0, 0.1, 0.1, BRIDGE_TOP + 0.63, P["post"], rot=bridge_yaw))
    add_col(f"BridgeRail{tag_}", rx, rz, 0.3, 4.4, 1.0, bridge_yaw)
placed.append((bridge_c[0], bridge_c[1], 2.5))

# ---------------------------------------------------------------- path furniture
for k, f in enumerate((0.06, 0.17, 0.29, 0.41, 0.53, 0.65, 0.77, 0.89)):
    (px, pz), _, (nx, nz) = at_fraction(PATH, f)
    side = 1 if k % 2 else -1
    lantern(px + nx * side * (PATH_W / 2 + 0.7), pz + nz * side * (PATH_W / 2 + 0.7))
for k, (f, side) in enumerate(((0.11, -1), (0.23, 1), (0.47, -1), (0.59, 1), (0.71, -1), (0.83, 1))):
    (px, pz), (tx, tz), (nx, nz) = at_fraction(PATH, f)
    stone_wall(px + nx * side * (PATH_W / 2 + 1.0), pz + nz * side * (PATH_W / 2 + 1.0), 4.2, math.atan2(-tz, tx))
for f, side in ((0.09, 1), (0.35, -1), (0.62, 1), (0.95, -1)):
    (px, pz), _, (nx, nz) = at_fraction(PATH, f)
    barrel(px + nx * side * (PATH_W / 2 + 0.6), pz + nz * side * (PATH_W / 2 + 0.6), (P["flower"], P["flower2"], None, P["flower"])[int(f * 4) % 4])
for f, side in ((0.03, -1), (0.52, 1)):
    (px, pz), (tx, tz), (nx, nz) = at_fraction(PATH, f)
    signpost(px + nx * side * (PATH_W / 2 + 1.4), pz + nz * side * (PATH_W / 2 + 1.4), -tx, -tz)
for f, side in ((0.2, 1), (0.44, -1), (0.74, 1)):
    (px, pz), (tx, tz), (nx, nz) = at_fraction(PATH, f)
    bx, bz = px + nx * side * (PATH_W / 2 + 1.2), pz + nz * side * (PATH_W / 2 + 1.2)
    bench(bx, bz, L.yaw_towards(bx, bz, px, pz))
(sx_, sz_), (tx, tz), (nx, nz) = at_fraction(PATH, 0.38)
statue = (sx_ - nx * (PATH_W / 2 + 1.6), sz_ - nz * (PATH_W / 2 + 1.6))
statue_yaw = L.yaw_towards(statue[0], statue[1], sx_, sz_)
add(L.box(coll, "PS_StatuePlinth", statue[0], statue[1], 0.0, 1.0, 1.0, 0.5, P["plinth"], bevel=0.03, tile=1.0))
add(L.furn(coll, "PS_Statue", statue[0], statue[1], statue_yaw, [
    (-0.08, 0, 0.5, 0.12, 0.14, 0.4, P["statue"]), (0.08, 0, 0.5, 0.12, 0.14, 0.4, P["statue"]), (-0.08, -0.08, 0.5, 0.14, 0.1, 0.06, P["black"]), (0.08, -0.08, 0.5, 0.14, 0.1, 0.06, P["black"]),
    (0, 0, 0.9, 0.42, 0.26, 0.42, P["statue"]), (0, -0.14, 0.95, 0.3, 0.02, 0.2, P["statue2"]), (0, 0, 1.0, 0.44, 0.28, 0.06, P["black"]),
    (-0.27, -0.02, 0.95, 0.1, 0.1, 0.36, P["statue"]), (0.27, -0.02, 0.95, 0.1, 0.1, 0.36, P["statue"]),
    (0, 0, 1.32, 0.26, 0.26, 0.26, P["skin"]), (0, -0.12, 1.3, 0.2, 0.04, 0.12, P["statue2"]),
    (0, 0, 1.58, 0.42, 0.42, 0.05, P["statue"]), (0, 0, 1.63, 0.28, 0.28, 0.3, P["statue"]), (0, 0, 1.68, 0.3, 0.3, 0.06, P["black"]), (0, -0.14, 1.68, 0.08, 0.02, 0.06, P["gold"]),
]))
add(L.cyl(coll, "PS_StatuePot", *local_to_game(statue[0], statue[1], statue_yaw, 0.42, -0.1), 0.5, 0.17, 0.22, P["black"], seg=8))
blob("PS_StatueGold", *local_to_game(statue[0], statue[1], statue_yaw, 0.42, -0.1), 0.7, 0.16, P["gold"], sy=0.5, jitter=0.2)
add_col("Statue", statue[0], statue[1], 1.1, 1.1, 2.0)
placed.append((statue[0], statue[1], 1.0))
for f, side, mat in ((0.14, 1, P["flower"]), (0.31, -1, P["flower2"]), (0.56, -1, P["flower"]), (0.8, -1, P["flower2"]), (0.92, 1, P["flower"])):
    (px, pz), _, (nx, nz) = at_fraction(PATH, f)
    flowers(px + nx * side * (PATH_W / 2 + 0.6), pz + nz * side * (PATH_W / 2 + 0.6), mat)

# ---------------------------------------------------------------- pub grounds and beer garden
gx0, gx1, gz0, gz1 = GARDEN
back_z = PUB_POS[1] + ext["footprintCenterZ"] - ext["footprint"][1] / 2
add(L.box(coll, "PS_Lawn", PUB_POS[0], (back_z - 4.0 + gz1 + 3.0) / 2, 0.0, ext["footprint"][0] + 14.0, gz1 + 3.0 - (back_z - 4.0), 0.02, P["grass"], tile=2.0))
add(L.box(coll, "PS_GardenFloor", (gx0 + gx1) / 2, (gz0 + gz1) / 2, 0.0, gx1 - gx0, gz1 - gz0, 0.035, P["flag"], tile=1.5))
add(L.box(coll, "PS_Forecourt", door[0], door[2] + 3.4, 0.0, 8.0, 2.6, 0.03, P["flag"], tile=1.5))
for k, (tx_, tz_, rot) in enumerate(((90.5, -118.5, 0.35), (97.5, -118.5, -0.25), (90.5, -113.0, -0.3), (97.5, -113.0, 0.2))):
    picnic_table(tx_, tz_, rot)
for px, pz in ((94.0, -118.5), (94.0, -113.0), (100.5, -115.75)):
    parasol(px, pz)
hedge((gx0 + gx1) / 2, gz1 + 0.6, gx1 - gx0, 0.0)
hedge(gx1 + 0.6, (gz0 + gz1) / 2, gz1 - gz0 + 1.2, math.pi / 2)
hedge(gx0 - 0.6, gz1 - 2.5, 5.0, math.pi / 2)
for k, (hx_, hz_) in enumerate(((78.0, -124.5), (102.0, -124.5))):
    hedge(hx_, hz_, 3.0, 0.0)
light_posts = ((gx0 + 0.6, gz0 + 0.6), ((gx0 + gx1) / 2, gz0 + 0.6), (gx1 - 0.6, gz0 + 0.6), (gx0 + 0.6, gz1 - 0.6), ((gx0 + gx1) / 2, gz1 - 0.6), (gx1 - 0.6, gz1 - 0.6))
for k, (lx, lz) in enumerate(light_posts):
    add(L.box(coll, f"PS_LightPost{k}", lx, lz, 0.0, 0.12, 0.12, 3.0, P["post"]))
    add_col(f"LightPost{k}", lx, lz, 0.2, 0.2, 3.0)
strings = ((light_posts[0], light_posts[3]), (light_posts[1], light_posts[4]), (light_posts[2], light_posts[5]), (light_posts[0], light_posts[2]), (light_posts[3], light_posts[5]))
for k, ((ax, az), (bx_, bz_)) in enumerate(strings):
    ln = math.hypot(bx_ - ax, bz_ - az)
    yaw = math.atan2(-(bz_ - az), bx_ - ax)
    add(L.box(coll, f"PS_StringWire{k}", (ax + bx_) / 2, (az + bz_) / 2, 2.92, ln, 0.02, 0.02, P["black"], rot=yaw))
    for j in range(1, int(ln / 1.2)):
        t = j * 1.2 / ln
        add(L.box(coll, f"PS_StringBulb{k}_{j}", ax + (bx_ - ax) * t, az + (bz_ - az) * t, 2.78, 0.1, 0.1, 0.14, P["bulb"], bevel=0.03))
for px, pz in ((gx0 - 1.5, gz1 + 1.5), (gx1 + 1.5, gz1 + 1.5), (door[0] - 5.5, door[2] + 4.2)):
    lantern(px, pz)
barrel(door[0] - 7.5, door[2] + 1.0, P["flower2"])
barrel(gx1 - 0.9, gz0 + 0.9, P["flower"])

# ---------------------------------------------------------------- trees, hedges and rocks around
for f, side, kind in ((0.08, 1, "rowan"), (0.15, -1, "oak"), (0.26, 1, "rowan"), (0.33, 1, "oak"), (0.4, -1, "rowan"), (0.5, 1, "oak"), (0.57, -1, "rowan"),
                      (0.68, 1, "rowan"), (0.78, -1, "oak"), (0.86, -1, "rowan"), (0.96, 1, "oak")):
    (px, pz), _, (nx, nz) = at_fraction(PATH, f)
    d = PATH_W / 2 + rnd.uniform(3.2, 5.0)
    tx_, tz_ = px + nx * side * d, pz + nz * side * d
    if clear(tx_, tz_, 1.0, path_gap=1.6):
        tree(tx_, tz_, kind, rnd.uniform(0.9, 1.2))
for px, pz, kind in ((76.0, -138.0, "oak"), (104.0, -138.0, "oak"), (74.0, -128.0, "rowan"), (106.0, -128.0, "rowan"), (79.0, -147.5, "rowan"), (101.0, -147.5, "rowan"),
                     (107.0, -109.0, "oak"), (76.0, -106.0, "oak"), (90.0, -148.0, "oak")):
    tree(px, pz, kind, rnd.uniform(0.95, 1.25))
scattered = 0
for _ in range(600):
    if scattered == 14:
        break
    x, z = rnd.uniform(34.0, 112.0), rnd.uniform(-150.0, -74.0)
    if clear(x, z, 1.0, path_gap=4.0) and (min(math.hypot(px - x, pz - z) for px, pz in PATH) < 14.0 or abs(x - PUB_POS[0]) < 20.0):
        tree(x, z, rnd.choice(("oak", "rowan", "rowan")), rnd.uniform(0.85, 1.2))
        scattered += 1
for _ in range(300):
    if counter.get("Rock", 0) >= 12:
        break
    x, z = rnd.uniform(34.0, 112.0), rnd.uniform(-150.0, -74.0)
    if clear(x, z, 0.6, path_gap=2.0) and min(math.hypot(px - x, pz - z) for px, pz in PATH) < 9.0:
        rock(x, z, rnd.uniform(0.35, 0.8))

bad = L.check_grounded(so, allow=("PS_Path", "PS_Creek", "PS_Lawn", "PS_Garden", "PS_Forecourt", "PS_Bridge", "PS_Lantern", "PS_Wall", "PS_Barrel", "PS_Signpost",
                                  "PS_Tree", "PS_Hedge", "PS_Rock", "PS_Flowers", "PS_Statue", "PS_String", "PS_Parasol", "PS_Picnic"))
print("SITE grounded violations:", bad)
assert not bad, bad

body_center = to_world(0.0, 0.0, ext["footprintCenterZ"])
body = ext["collision"][0]
col.append({"name": "COL_Work_pub", "cx": body_center[0], "cz": body_center[2], "hx": body["hx"], "hz": body["hz"], "hy": body["hy"], "cy": body["hy"], "yaw": PUB_YAW})

room = inner["secretRoom"]
corners = [to_world(x + ox, 0.0, z + oz) for x in (room["minX"], room["maxX"]) for z in (room["minZ"], room["maxZ"])]
points = {
    "bartender": interior_to_world(inner["npcs"]["bartender"]),
    "bartenderYaw": world_yaw(inner["bartenderYaw"]),
    "bouncer": interior_to_world(inner["npcs"]["bouncer"]),
    "counter": interior_to_world(inner["counter"]),
    "taps": interior_to_world(inner["taps"]),
    "serve": interior_to_world(inner["serve"]),
    "bell": interior_to_world(inner["bell"]),
    "secretDoor": {"position": interior_to_world(inner["secretDoor"]["position"]), "yaw": world_yaw(inner["secretDoor"]["yaw"])},
    "secretRoom": {"minX": min(c[0] for c in corners), "maxX": max(c[0] for c in corners), "minZ": min(c[2] for c in corners), "maxZ": max(c[2] for c in corners)},
    "seats": [{"id": s["id"], "kind": s["kind"], "position": interior_to_world(s["position"]), "yaw": world_yaw(s["yaw"])} for s in inner["seats"]] + garden_seats,
    "darts": {"board": interior_to_world(inner["darts"]["board"]), "boardYaw": world_yaw(inner["darts"]["boardYaw"]), "oche": interior_to_world(inner["darts"]["oche"])},
    "shots": {"plank": interior_to_world(inner["shots"]["plank"]), "yaw": world_yaw(inner["shots"]["yaw"]), "player": interior_to_world(inner["shots"]["player"])},
}

L.export_glb(os.path.join(OUT, "pub_site.glb"), so)
L.write_json(os.path.join(OUT, "pub_site.layout.json"), {
    "version": 1,
    "bounds": {"minX": 28.0, "maxX": 114.0, "minZ": -152.0, "maxZ": -70.0},
    "gate": GATE,
    "pub": {
        "key": ext["key"], "name": ext["name"], "job": inner["job"],
        "position": [PUB_POS[0], 0.0, PUB_POS[1]], "rotationY": PUB_YAW,
        "door": door, "footprint": ext["footprint"], "interiorOffset": ext["interiorOffset"],
    },
    "points": points,
    "collision": col,
})
tris = sum(len(p.vertices) - 2 for o in so if o.type == "MESH" for p in o.data.polygons)
print("pub site:", len(so), "objects,", tris, "triangles,", len(col), "collision boxes,", len(points["seats"]), "seats, path", round(path_len, 1), "m, door", door, "gate", GATE, "bridge", [round(c, 2) for c in bridge_c])
