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

BOUNDS = {"minX": -42.6, "maxX": -2.0, "minZ": -130.0, "maxZ": -72.0}
PATH_W = 2.4
FENCE = (-39.0, -11.5, -121.5, -100.0)
FENCE_GAP = (-34.2, -30.8)
TREE_XS = (-35.0, -28.5, -22.0, -15.5)
TREE_ZS = (-104.5, -111.0, -117.5)
STALL = (-29.8, -94.5)
TWO_PI = 2 * math.pi
OUT = os.path.join(L.OUT_ROOT, "park", "orchard_site")
POND_OUT = os.path.join(L.OUT_ROOT, "park", "pond")

pond = json.load(open(os.path.join(POND_OUT, "pond.layout.json"), encoding="utf-8"))
gate = pond["orchardGate"]
GATE = {"x": gate["x"], "z": gate["z"], "width": gate["width"]}
gate_u = (math.sin(gate["yaw"]), -math.cos(gate["yaw"]))
rnd = random.Random(23)


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


start = (GATE["x"] + 1.5 * gate_u[0], GATE["z"] + 1.5 * gate_u[1])
PATH = resample(chaikin([start, (GATE["x"] + 7.0 * gate_u[0], GATE["z"] + 7.0 * gate_u[1]), (-35.4, -86.0), (-33.8, -92.0), (-32.5, -97.0),
                         ((FENCE_GAP[0] + FENCE_GAP[1]) / 2, FENCE[3] - 1.5)]), 0.7)

sc = L.new_build_scene("PARK_orchard_site")
coll = bpy.data.collections.new("OrchardSite")
sc.collection.children.link(coll)
P = {
    "grass": L.make_mat("TW_GrassOrchard", "#86bf63", 1.0, "noise", 0.06),
    "orchard_grass": L.make_mat("TW_OrchardRows", "#79b257", 1.0, "stripes", 0.04, accent="#6ea64f"),
    "path": L.make_mat("TW_OrchardPath", "#c7ad84", 0.95, "noise", 0.07),
    "trunk": L.make_mat("TW_AppleTrunk", "#7a5a3c", 0.85, "planks", 0.05, accent="#5c4229"),
    "leaf1": L.make_mat("TW_AppleLeaf", "#4f9a48", 0.9, "noise", 0.07),
    "leaf2": L.make_mat("TW_AppleLeafLight", "#69b153", 0.9, "noise", 0.07),
    "apple": L.make_mat("TW_AppleRed", "#d8382f", 0.55, "noise", 0.05),
    "apple2": L.make_mat("TW_AppleRedDark", "#b52a25", 0.55, "noise", 0.05),
    "fence": L.make_mat("TW_OrchardFence", "#a9825a", 0.85, "planks", 0.05, accent="#86633f"),
    "post": L.make_mat("TW_OrchardPost", "#6e4f33", 0.85, "noise", 0.04),
    "crate": L.make_mat("TW_OrchardCrate", "#c79a62", 0.85, "planks", 0.06, accent="#a57a48"),
    "awning": L.make_mat("TW_OrchardAwning", "#c8423a", 0.85, "stripes", 0.03, accent="#f3ece0"),
    "board": L.make_mat("TW_OrchardBoard", "#2f4f36", 0.75, "noise", 0.02),
    "chalk": L.make_mat("TW_OrchardChalk", "#f3ece0", 0.8, "noise", 0.02),
    "hay": L.make_mat("TW_OrchardHay", "#e1c46a", 0.95, "stripes", 0.06, accent="#c9aa52"),
    "shed": L.make_mat("TW_OrchardShed", "#9c5b3c", 0.85, "planks", 0.05, accent="#7e4630"),
    "roof": L.make_mat("TW_OrchardRoof", "#5d5f66", 0.8, "tiles", 0.05, accent="#4a4c52"),
    "iron": L.make_mat("TW_OrchardIron", "#2a2d33", 0.6, "noise", 0.03),
    "lantern": L.make_mat("TW_OrchardLantern", "#fff1c4", 0.5, "noise", 0.0, emit="#ffd27a", emit_strength=1.4),
    "pine": L.make_mat("TW_OrchardPine", "#3f7a4a", 0.9, "noise", 0.07),
    "basket": L.make_mat("TW_OrchardBasket", "#b8874f", 0.9, "stripes", 0.06, accent="#946a3a"),
}
so = []
col = []
placed = []


def add(o):
    so.append(o)
    return o


def add_col(name, gx, gz, sx, sz, h, yaw=0.0):
    col.append({"name": f"COL_Orchard_{name}", "cx": round(gx, 3), "cz": round(gz, 3), "hx": round(sx / 2, 3), "hz": round(sz / 2, 3), "hy": round(h / 2, 3),
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


counter = {}


def tag(prefix):
    counter[prefix] = counter.get(prefix, 0) + 1
    return f"{prefix}{counter[prefix]:02d}"


def apple_tree(gx, gz, s):
    n = tag("AppleTree")
    add(L.cone(coll, f"OS_{n}_Trunk", gx, gz, 0.0, 0.24 * s, 0.15 * s, 2.3 * s, P["trunk"], seg=6))
    sy = 0.8
    for k in range(3):
        a = TWO_PI * k / 3 + rnd.uniform(-0.3, 0.3)
        cx, cz, cy, cr = gx + 0.55 * s * math.cos(a), gz + 0.55 * s * math.sin(a), (1.95 + 0.25 * (k % 2)) * s, rnd.uniform(1.15, 1.35) * s
        blob(f"OS_{n}_Leaf{k}", cx, cz, cy, cr, P[("leaf1", "leaf2", "leaf1")[k]], sy=sy)
        for j, da in enumerate((-0.9, -0.3, 0.3, 0.9)):
            h = cr * sy * rnd.uniform(-0.3, 0.2)
            reach = cr * math.sqrt(1.0 - (h / (cr * sy)) ** 2) * 0.97
            add(L.box(coll, f"OS_{n}_Apple{k}{j}", cx + reach * math.cos(a + da), cz + reach * math.sin(a + da), cy + cr * sy + h - 0.11, 0.22, 0.22, 0.22,
                      P[("apple", "apple2")[(k + j) % 2]], bevel=0.07))
    add_col(n, gx, gz, 0.6, 0.6, 3.0)
    placed.append((gx, gz, 1.8))


def fallen_apples(gx, gz):
    for k in range(3):
        a = rnd.uniform(0, TWO_PI)
        d = rnd.uniform(0.6, 1.6)
        add(L.box(coll, f"OS_{tag('Fallen')}", gx + d * math.cos(a), gz + d * math.sin(a), 0.0, 0.16, 0.16, 0.15, P["apple2"], rot=a, bevel=0.05))


def basket(gx, gz, rot):
    n = tag("Basket")
    add(L.furn(coll, f"OS_{n}", gx, gz, rot, [(0, 0, 0.0, 0.55, 0.4, 0.32, P["basket"], 0.04), (0, 0, 0.32, 0.46, 0.32, 0.06, P["apple"], 0.03)]))
    placed.append((gx, gz, 0.4))


def crate(gx, gz, y0, rot, full=True):
    n = tag("Crate")
    parts = [(0, 0, 0.0, 0.6, 0.45, 0.36, P["crate"], 0.02)]
    if full:
        parts.append((0, 0, 0.36, 0.52, 0.37, 0.06, P["apple"], 0.03))
    add(L.furn(coll, f"OS_{n}", gx, gz, rot, parts)).location.z = y0
    if y0 == 0.0:
        # a full box at shin height: without a collider players walk through it (npm run topo:check)
        add_col(n, gx, gz, 0.6, 0.45, 1.0, rot)


def lantern(gx, gz):
    n = tag("Lantern")
    add(L.cyl(coll, f"OS_{n}_Pole", gx, gz, 0.0, 0.06, 2.6, P["iron"], seg=6))
    add(L.box(coll, f"OS_{n}_Base", gx, gz, 0.0, 0.3, 0.3, 0.12, P["iron"], bevel=0.02))
    add(L.box(coll, f"OS_{n}_Head", gx, gz, 2.6, 0.32, 0.32, 0.42, P["lantern"], bevel=0.03))
    add(L.box(coll, f"OS_{n}_Cap", gx, gz, 3.02, 0.4, 0.4, 0.08, P["iron"], bevel=0.02))
    add_col(n, gx, gz, 0.32, 0.32, 3.1)
    placed.append((gx, gz, 0.4))


def hay_bale(gx, gz, rot, y0=0.0):
    n = tag("Hay")
    add(L.box(coll, f"OS_{n}", gx, gz, y0, 1.1, 0.6, 0.5, P["hay"], rot=rot, bevel=0.06))
    if y0 == 0.0:
        add_col(n, gx, gz, 1.1, 0.6, 1.0, rot)
        placed.append((gx, gz, 0.7))


def pine(gx, gz, s):
    n = tag("Pine")
    add(L.cyl(coll, f"OS_{n}_Trunk", gx, gz, 0.0, 0.16 * s, 1.0 * s, P["trunk"], seg=5))
    for k, (y, r) in enumerate(((0.8, 1.5), (2.0, 1.15), (3.1, 0.75))):
        add(L.cone(coll, f"OS_{n}_Cone{k}", gx, gz, y * s, r * s, 0.05, 1.6 * s, P["pine"], seg=7))
    add_col(n, gx, gz, 0.5, 0.5, 3.0)
    placed.append((gx, gz, 1.6 * s))


def clear(x, z, rad):
    if min(math.hypot(px - x, pz - z) for px, pz in PATH) < PATH_W / 2 + 1.5 + rad:
        return False
    if FENCE[0] - 2.0 - rad < x < FENCE[1] + 2.0 + rad and FENCE[2] - 2.0 - rad < z < FENCE[3] + 2.0 + rad:
        return False
    if math.hypot(x, z) < 86.0 + rad:
        return False
    return all(math.hypot(x - px, z - pz) >= rad + pr + 0.6 for px, pz, pr in placed)


add(L.box(coll, "OS_Lawn", (BOUNDS["minX"] + BOUNDS["maxX"]) / 2, (-85.6 + BOUNDS["minZ"]) / 2, 0.0, BOUNDS["maxX"] - BOUNDS["minX"], -85.6 - BOUNDS["minZ"], 0.02,
           P["grass"], tile=2.0))
add(L.box(coll, "OS_OrchardFloor", (FENCE[0] + FENCE[1]) / 2, (FENCE[2] + FENCE[3]) / 2, 0.0, FENCE[1] - FENCE[0], FENCE[3] - FENCE[2], 0.025, P["orchard_grass"], tile=3.0))
ribbon("OS_Path", PATH, PATH_W, P["path"], 0.035)
for k, f in enumerate((0.12, 0.38, 0.64, 0.9)):
    (px, pz), _, (nx, nz) = at_fraction(PATH, f)
    side = -1 if k % 2 else 1
    lantern(px + nx * side * (PATH_W / 2 + 0.7), pz + nz * side * (PATH_W / 2 + 0.7))

x0, x1, z0, z1 = FENCE
runs = [((x0, z1), (FENCE_GAP[0], z1)), ((FENCE_GAP[1], z1), (x1, z1)), ((x1, z1), (x1, z0)), ((x1, z0), (x0, z0)), ((x0, z0), (x0, z1))]
for ri, ((ax, az), (bx, bz)) in enumerate(runs):
    ln = math.hypot(bx - ax, bz - az)
    yaw = math.atan2(-(bz - az), bx - ax)
    steps = max(1, round(ln / 2.5))
    for k in range(steps + 1):
        t = k / steps
        add(L.box(coll, f"OS_FencePost{ri}_{k:02d}", ax + (bx - ax) * t, az + (bz - az) * t, 0.0, 0.14, 0.14, 1.1, P["post"]))
    for kk, hh in enumerate((0.45, 0.85)):
        add(L.box(coll, f"OS_FenceRail{ri}_{kk}", (ax + bx) / 2, (az + bz) / 2, hh, ln + 0.05, 0.07, 0.09, P["fence"], rot=yaw))
    add_col(f"Fence{ri}", (ax + bx) / 2, (az + bz) / 2, ln + 0.2, 0.3, 1.2, yaw)
for k, gx in enumerate(FENCE_GAP):
    add(L.box(coll, f"OS_GatePost{k}", gx, z1, 0.0, 0.22, 0.22, 1.6, P["post"], bevel=0.02))
add(L.box(coll, "OS_GateArchBeam", (FENCE_GAP[0] + FENCE_GAP[1]) / 2, z1, 2.4, FENCE_GAP[1] - FENCE_GAP[0] + 0.5, 0.16, 0.16, P["post"]))
for k, gx in enumerate(FENCE_GAP):
    add(L.box(coll, f"OS_GateArchPost{k}", gx, z1, 1.6, 0.16, 0.16, 0.8, P["post"]))
add(L.box(coll, "OS_GateArchBoard", (FENCE_GAP[0] + FENCE_GAP[1]) / 2, z1 + 0.05, 2.62, 2.6, 0.05, 0.4, P["board"]))
gate_text = L.text_mesh(coll, "OS_GateArchText", "COVE ORCHARD", (FENCE_GAP[0] + FENCE_GAP[1]) / 2, z1 + 0.09, 2.7, 0.22, 0.01, P["chalk"], facing="+z")
add(gate_text)

trees = []
for zi, tz in enumerate(TREE_ZS):
    for xi, tx in enumerate(TREE_XS):
        gx, gz = tx + rnd.uniform(-0.3, 0.3), tz + rnd.uniform(-0.3, 0.3)
        apple_tree(gx, gz, rnd.uniform(0.95, 1.1))
        fallen_apples(gx, gz)
        trees.append([round(gx, 3), 0.0, round(gz, 3)])
for gx, gz, rot in ((-31.8, -107.8, 0.4), (-18.7, -114.3, -0.3), (-25.2, -120.0, 0.9)):
    basket(gx, gz, rot)

sx, sz = STALL
add(L.box(coll, "OS_StallCounter", sx, sz, 0.0, 0.8, 3.2, 0.95, P["crate"], bevel=0.03))
add(L.box(coll, "OS_StallTop", sx - 0.05, sz, 0.95, 0.95, 3.4, 0.06, P["fence"]))
for k, dz in enumerate((-1.2, 0.0, 1.2)):
    crate(sx - 0.05, sz + dz, 1.01, 0.0)
for k, dz in enumerate((-1.65, 1.65)):
    for kk, dx in enumerate((-0.45, 1.9)):
        add(L.box(coll, f"OS_StallPost{k}{kk}", sx + dx, sz + dz, 0.0, 0.12, 0.12, 2.6, P["post"]))
add(L.box(coll, "OS_StallAwning", sx + 0.72, sz, 2.6, 2.8, 3.6, 0.08, P["awning"], rot=0.0))
add(L.box(coll, "OS_StallBoard", sx - 0.48, sz, 2.05, 0.05, 2.4, 0.42, P["board"]))
board_text = L.text_mesh(coll, "OS_StallBoardText", "WE BUY APPLES", sx - 0.52, sz, 2.13, 0.2, 0.01, P["chalk"], facing="+z")
board_text.rotation_euler = (math.pi / 2, 0, -math.pi / 2)
add(board_text)
for k, (dx, dz, full) in enumerate(((1.6, -1.0, True), (1.6, -0.35, False), (1.6, 0.4, True), (2.2, -1.0, True), (2.2, 0.9, False))):
    crate(sx + dx, sz + dz, 0.0, 0.0, full)
for dx, dz in ((1.6, -1.0), (1.6, 0.4)):
    crate(sx + dx, sz + dz, 0.42, 0.0)
add_col("Stall", sx + 0.6, sz, 2.6, 3.6, 2.6)
placed.append((sx + 0.8, sz, 2.4))
farmer = [round(sx + 0.75, 3), 0.0, round(sz, 3)]
farmer_yaw = round(L.yaw_towards(farmer[0], farmer[2], sx - 1.5, sz), 4)

shed = (-14.0, -94.0)
add(L.box(coll, "OS_Shed", shed[0], shed[1], 0.0, 4.0, 3.2, 2.4, P["shed"], bevel=0.03, tile=1.0))
add(L.gable_roof(coll, "OS_ShedRoof", shed[0], shed[1], 2.4, 4.5, 3.7, 1.2, P["roof"], ridge_axis="x"))
add(L.box(coll, "OS_ShedDoor", shed[0], shed[1] + 1.62, 0.0, 1.2, 0.05, 1.9, P["fence"]))
add_col("Shed", shed[0], shed[1], 4.2, 3.4, 3.6)
placed.append((shed[0], shed[1], 3.0))
for gx, gz, rot in ((-18.5, -95.8, 0.2), (-19.8, -94.2, 1.4), (-10.4, -96.4, -0.3)):
    hay_bale(gx, gz, rot)
hay_bale(-18.5, -95.8, 0.6, y0=0.5)
for gx, gz in ((-23.0, -96.5), (-22.2, -97.4)):
    crate(gx, gz, 0.0, 0.3, False)

for gx, gz, s in ((-41.0, -96.0, 1.2), (-41.2, -110.0, 1.35), (-40.8, -124.0, 1.1), (-30.0, -126.5, 1.25), (-17.0, -127.0, 1.3), (-6.0, -124.5, 1.15),
                  (-4.5, -110.0, 1.3), (-5.5, -98.0, 1.2), (-8.0, -88.5, 1.1)):
    pine(gx, gz, s)
scattered = 0
for _ in range(400):
    if scattered == 8:
        break
    x, z = rnd.uniform(BOUNDS["minX"] + 1.5, BOUNDS["maxX"] - 1.5), rnd.uniform(BOUNDS["minZ"] + 1.5, -88.0)
    if clear(x, z, 1.4):
        pine(x, z, rnd.uniform(0.9, 1.25))
        scattered += 1

decor_objs, decor_cols, crop_plants = L.zone_decor(coll, "orchard", "COL_Orchard_")
so += decor_objs
col += decor_cols

bad = L.check_grounded(so, allow=("OS_Path", "OS_Lawn", "OS_OrchardFloor", "OS_AppleTree", "OS_Fallen", "OS_Lantern", "OS_FenceRail", "OS_GateArch", "OS_Stall",
                                  "OS_Crate", "OS_Shed", "OS_Hay", "OS_Pine", "ZD_"))
print("ORCHARD grounded violations:", bad)
assert not bad, bad

L.export_glb(os.path.join(OUT, "orchard_site.glb"), so, use_active_scene=True)
L.write_json(os.path.join(OUT, "orchard_site.layout.json"), {
    "version": 1,
    "bounds": BOUNDS,
    "gate": GATE,
    "points": {"trees": trees, "farmer": farmer, "farmerYaw": farmer_yaw},
    "collision": col,
    "crops": crop_plants,
})
tris = sum(len(p.vertices) - 2 for o in so if o.type == "MESH" for p in o.data.polygons)
print("orchard site:", len(so), "objects,", tris, "triangles,", len(col), "collision boxes,", len(trees), "trees, farmer", farmer, farmer_yaw, "gate", GATE)
