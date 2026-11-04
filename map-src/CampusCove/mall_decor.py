"""Décor des allées, plazas et du Leisure Park du Cove Parkview Mall (spec B.1-B.7, audit §6).

`build(ctx, M)` pose tout le décor hors cellules sur le `mall_lib.Ctx` de build_mall.py : plazas (fontaines, îlots,
kiosques et leur marchandise, distributeurs, bornes, aire de jeux, food court, terrasses d'Al Fresca) puis le parc.
Chaque objet au sol passe par `ctx.clear()` ; un refus est imprimé (« skipped … ») et listé dans `SKIPPED`.
"""
import math

import bmesh
import bpy

import lib_common as L

TWO_PI = 2 * math.pi
SKIPPED = []
TRIS = {}


def _palette(ctx):
    P = ctx.P

    def mk(key, hexcol, rough=0.7, pattern="noise", var=0.03, accent=None, emit=None, emit_strength=1.2):
        return L.make_mat(f"TW_MallDeco{key}", hexcol, rough, pattern, var, accent=accent, emit=emit, emit_strength=emit_strength)
    return {
        "red": P["red"], "blue": P["blue"], "yellow": P["yellow"], "pink": P["pink"], "dark": P["dark"],
        "coral": mk("Coral", "#e54b4b"), "orange": mk("Orange", "#f28c28"), "green": mk("Green", "#79b765"),
        "cream": mk("Cream", "#f7f4ec", 0.8), "silver": mk("Silver", "#cfd3da", 0.5), "grape": mk("Grape", "#6a3aa8"),
        "biscuit": mk("Biscuit", "#e8c48a", 0.9), "crate": mk("Crate", "#c98a3e", 0.9, "planks", 0.04, accent="#a9712f"),
        "teal": mk("Teal", "#2fa17a"), "cactus": mk("Cactus", "#4f9d54", 0.9), "gazebo": mk("GazeboRoof", "#8f4f3a", 0.9),
        "bronze": mk("Bronze", "#6b5a3a", 0.45), "sky": mk("SkyBlue", "#5ac8e8"), "paper": mk("Paper", "#f4efe6", 0.85),
        "slate": mk("Slate", "#2a2e35", 0.8), "navy": mk("Navy", "#1f3f8f"),
    }


def _tris(objs):
    return sum(len(p.vertices) - 2 for o in objs if o.type == "MESH" for p in o.data.polygons)


def _place(ctx, name, spots, hx, hz, reserve=False):
    for x, z in spots:
        if ctx.clear(x, z, hx, hz):
            if reserve:
                ctx.exclude(x - hx, z - hz, x + hx, z + hz, name)
            return x, z
    x, z = spots[0]
    why = ctx.blocked_by(x, z, hx, hz)
    print(f"skipped {name}: {why}")
    SKIPPED.append((name, why))
    return None


def _tilted(ctx, name, gx, gz, y0, sx, sz, h, mat, tilt=0.0, yaw=0.0, bevel=0.0, roll=0.0):
    o = ctx.add(L.box(ctx.coll, name, gx, gz, y0, sx, sz, h, mat, bevel=bevel))
    o.rotation_euler = (tilt, roll, yaw)
    return o


def _lying_cyl(ctx, name, gx, gz, y, r, length, mat, yaw, seg=8):
    o = ctx.add(L.cyl(ctx.coll, name, gx, gz, y, r, length, mat, seg=seg))
    o.rotation_euler = (0.0, math.pi / 2, yaw)
    o.location = L.b(gx - length / 2 * math.cos(yaw), gz + length / 2 * math.sin(yaw), y)
    return o


def _fwd(yaw):
    return -math.sin(yaw), -math.cos(yaw)


def _right(yaw):
    return math.cos(yaw), -math.sin(yaw)


def _annulus(ctx, name, gx, gz, y0, r_in, r_out, h, mat, seg=36):
    bm = bmesh.new()
    rings = {}
    for key, r, y in (("ib", r_in, 0.0), ("ob", r_out, 0.0), ("it", r_in, h), ("ot", r_out, h)):
        rings[key] = [bm.verts.new((r * math.cos(TWO_PI * k / seg), r * math.sin(TWO_PI * k / seg), y)) for k in range(seg)]
    for k in range(seg):
        j = (k + 1) % seg
        bm.faces.new((rings["it"][k], rings["ot"][k], rings["ot"][j], rings["it"][j]))
        bm.faces.new((rings["ob"][k], rings["ot"][k], rings["ot"][j], rings["ob"][j]))
        bm.faces.new((rings["it"][k], rings["ib"][k], rings["ib"][j], rings["it"][j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for l in f.loops:
            l[uv].uv = (l.vert.co.x / 2.0, l.vert.co.y / 2.0)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    ob.location = L.b(gx, gz, y0)
    ctx.coll.objects.link(ob)
    return ctx.add(ob)



# ---------------------------------------------------------------- composed objects shared by the plazas
def _fountain(ctx, C, name, gx, gz, rb, medallion=None, col=None):
    P = ctx.P
    y = 0.0
    if medallion:
        ctx.cyl(f"{name}_Medallion", gx, gz, 0.0, medallion, 0.02, P["paving"], seg=24)
        y = 0.02
    ctx.cyl(f"{name}_Basin", gx, gz, y, rb, 0.45, P["stone"], seg=16)
    ctx.cyl(f"{name}_Water", gx, gz, y + 0.45, rb - 0.15, 0.08, P["water"], seg=16)
    _annulus(ctx, f"{name}_Rim", gx, gz, y + 0.45, rb - 0.3, rb, 0.2, P["stone"], seg=16)
    top = y + 0.53
    ctx.cyl(f"{name}_Column", gx, gz, top, rb * 0.135, rb * 0.54, P["stone"], seg=8)
    bowl_y = top + rb * 0.54
    ctx.cyl(f"{name}_Bowl", gx, gz, bowl_y, rb * 0.35, 0.2, P["stone"], seg=12)
    ctx.cyl(f"{name}_Water2", gx, gz, bowl_y + 0.2, rb * 0.3, 0.04, P["water"], seg=12)
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        ctx.cyl(f"{name}_Jet{k}", gx + rb * 0.58 * math.cos(a), gz + rb * 0.58 * math.sin(a), top, 0.03, 0.6, P["water"], seg=4)
    c = col or (2 * rb + 0.4)
    ctx.cols.add(name, gx, gz, 0.0, c, c, 1.0)


def _u_island(ctx, name, gx, gz, open_dir):
    ctx.planter(f"{name}_Planter", gx, gz, 1.4, 1.4)
    sides = {"-x": ((gx - 1.45, gz), math.pi / 2), "+x": ((gx + 1.45, gz), -math.pi / 2), "-z": ((gx, gz - 1.45), 0.0), "+z": ((gx, gz + 1.45), math.pi)}
    for key, ((bx, bz), rot) in sides.items():
        if key != open_dir:
            ctx.bench(f"{name}_Bench{key}", bx, bz, rot)


def _plant_island(ctx, name, gx, gz):
    for k in range(3):
        a = -math.pi / 2 + TWO_PI * k / 3
        ctx.planter(f"{name}_Planter{k}", gx + 1.0 * math.cos(a), gz + 1.0 * math.sin(a), 1.2, 1.2)
    ctx.tree("round", gx, gz, 0.7)


def _terminal(ctx, C, name, gx, gz, yaw):
    P = ctx.P
    fx, fz = _fwd(yaw)
    ctx.box(f"{name}_Base", gx, gz, 0.0, 0.6, 0.6, 0.05, P["steel"], rot=yaw)
    ctx.box(f"{name}_Post", gx, gz, 0.05, 0.3, 0.3, 1.15, P["dark"], rot=yaw)
    _tilted(ctx, f"{name}_Screen", gx + fx * 0.2, gz + fz * 0.2, 1.15, 0.5, 0.08, 0.35, P["panel"], tilt=math.radians(20), yaw=yaw)
    ctx.cols.add(name, gx, gz, 0.0, 0.6, 0.6, 1.4)


def _vending(ctx, C, name, gx, gz, yaw, body):
    P = ctx.P
    fx, fz = _fwd(yaw)
    rx, rz = _right(yaw)
    ctx.box(f"{name}_Body", gx, gz, 0.0, 0.9, 0.8, 1.9, body, rot=yaw)
    front = 0.4
    ctx.box(f"{name}_Glass", gx + fx * (front + 0.1), gz + fz * (front + 0.1), 0.6, 0.6, 0.02, 1.1, P["glass"], rot=yaw)
    ctx.box(f"{name}_Band", gx + fx * (front + 0.06), gz + fz * (front + 0.06), 1.72, 0.8, 0.1, 0.16, P["panel"], rot=yaw)
    mats = (C["coral"], C["blue"], C["yellow"])
    for row in range(3):
        for k in range(4):
            s = -0.21 + 0.14 * k
            d = front + 0.045
            ctx.box(f"{name}_Can{row}{k}", gx + fx * d + rx * s, gz + fz * d + rz * s, 0.72 + 0.34 * row, 0.1, 0.05, 0.12, mats[(row + k) % 3], rot=yaw)
    ctx.cols.add(name, gx, gz, 0.0, 1.0, 0.9, 2.0, rot=yaw)


def _vending_pair(ctx, C, name, gx, gz, yaw):
    rx, rz = _right(yaw)
    _vending(ctx, C, f"{name}_Drinks", gx - rx * 0.5, gz - rz * 0.5, yaw, C["red"])
    _vending(ctx, C, f"{name}_Snacks", gx + rx * 0.5, gz + rz * 0.5, yaw, C["blue"])


def _atm(ctx, name, gx, gz, yaw):
    P = ctx.P
    fx, fz = _fwd(yaw)
    ctx.box(f"{name}_Body", gx, gz, 0.0, 0.7, 0.6, 1.8, P["band"], rot=yaw)
    ctx.box(f"{name}_Screen", gx + fx * 0.32, gz + fz * 0.32, 1.25, 0.35, 0.04, 0.25, P["panel"], rot=yaw)
    ctx.cols.add(name, gx, gz, 0.0, 0.8, 0.7, 1.9, rot=yaw)


def _kiosk_goods(ctx, C, name, gx, gz, yaw, kind):
    P = ctx.P
    y = 1.11
    spots = [(gx + 1.1 * math.cos(TWO_PI * k / 6 + yaw), gz + 1.1 * math.sin(TWO_PI * k / 6 + yaw)) for k in range(6)]
    mx, mz = spots[0]
    ctx.cyl(f"{name}_MenuPost", mx, mz, y, 0.02, 0.4, P["steel"], seg=4)
    ctx.box(f"{name}_Menu", mx, mz, y + 0.4, 0.6, 0.04, 0.5, P["dark"], rot=yaw)
    fx, fz = _fwd(yaw)
    ctx.box(f"{name}_MenuFace", mx + fx * 0.045, mz + fz * 0.045, y + 0.45, 0.5, 0.01, 0.4, P["panel"], rot=yaw)
    rest = spots[1:]
    if kind in ("ice_cream", "gelato"):
        scoops = (C["pink"], C["cream"], C["grape"])
        for k, (sx, sz) in enumerate(rest[:4]):
            ctx.cone(f"{name}_Cone{k}", sx, sz, y, 0.0, 0.06, 0.14, C["biscuit"], seg=6)
            ctx.cyl(f"{name}_Scoop{k}", sx, sz, y + 0.14, 0.07, 0.1, scoops[k % 3], seg=6)
        sx, sz = rest[4]
        ctx.box(f"{name}_Napkins", sx, sz, y, 0.2, 0.2, 0.12, C["cream"], rot=yaw)
    elif kind == "news":
        for k, (sx, sz) in enumerate(rest[:4]):
            ctx.box(f"{name}_Pile{k}", sx, sz, y, 0.3, 0.4, 0.08, (C["cream"], C["silver"])[k % 2], rot=yaw)
        sx, sz = rest[4]
        _tilted(ctx, f"{name}_Rack", sx, sz, y, 0.9, 0.1, 1.0, C["red"], tilt=math.radians(10), yaw=yaw)
    elif kind == "pretzel":
        for k, (sx, sz) in enumerate(rest[:4]):
            ctx.box(f"{name}_Pretzel{k}", sx, sz, y, 0.2, 0.2, 0.05, C["crate"], rot=yaw, bevel=0.015)
        ctx.cyl(f"{name}_HeatLamp", gx, gz, 2.3, 0.12, 0.25, P["lamp"], seg=6)
    elif kind == "phones":
        cases = (C["coral"], C["blue"], C["yellow"], C["teal"], C["pink"], C["dark"])
        for k, (sx, sz) in enumerate(rest):
            ctx.box(f"{name}_Stand{k}", sx, sz, y, 0.08, 0.06, 0.03, P["rail"], rot=yaw)
            ctx.box(f"{name}_Case{k}", sx, sz, y + 0.03, 0.07, 0.01, 0.14, cases[k], rot=yaw)
        sx, sz = spots[0]
    elif kind == "coffee":
        sx, sz = rest[0]
        ctx.box(f"{name}_Machine", sx, sz, y, 0.5, 0.4, 0.5, P["dark"], rot=yaw)
        rx, rz = _right(yaw)
        ctx.box(f"{name}_Light", sx + rx * 0.18 + fx * 0.22, sz + rz * 0.18 + fz * 0.22, y + 0.4, 0.04, 0.04, 0.04, P["lamp"], rot=yaw)
        for k in range(6):
            cx, cz = rest[1 + k // 3]
            ctx.cyl(f"{name}_Cup{k}", cx + rx * (0.1 * (k % 3) - 0.1), cz + rz * (0.1 * (k % 3) - 0.1), y, 0.04, 0.1, C["paper"], seg=6)
        sx, sz = rest[3]
        ctx.box(f"{name}_Slate", sx, sz, y, 0.6, 0.04, 0.8, P["dark"], rot=yaw)
    elif kind == "souvenirs":
        gifts = (C["red"], C["yellow"], C["blue"])
        for k, (sx, sz) in enumerate(rest[:5]):
            ctx.box(f"{name}_Gift{k}", sx, sz, y, 0.2, 0.2, 0.2, gifts[k % 3], rot=yaw)
            ctx.box(f"{name}_Ribbon{k}", sx, sz, y + 0.2, 0.22, 0.04, 0.02, gifts[(k + 1) % 3], rot=yaw)
    elif kind == "juice":
        juices = (C["orange"], C["green"], C["yellow"])
        for k, (sx, sz) in enumerate(rest):
            ctx.cyl(f"{name}_Bottle{k}", sx, sz, y, 0.05, 0.25, juices[k % 3], seg=6)
    elif kind == "balloons":
        colors = (C["coral"], C["yellow"], C["blue"], C["pink"], C["green"], C["orange"])
        for k in range(8):
            a = TWO_PI * k / 8
            bx, bz = gx + 1.6 * math.cos(a), gz + 1.6 * math.sin(a)
            by = 2.6 + 0.1 * (k % 4) + 0.3 * (k % 2)
            ctx.cyl(f"{name}_Balloon{k}", bx, bz, by, 0.18, 0.25, colors[k % 6], seg=6)
            ctx.cyl(f"{name}_String{k}", bx, bz, 1.11, 0.005, by - 1.11, P["steel"], seg=3)


def _kiosk(ctx, C, name, spots, yaw, label, mat, kind):
    spot = _place(ctx, name, spots, 1.5, 1.5, reserve=True)
    if spot:
        ctx.kiosk(name, spot[0], spot[1], yaw, label, mat)
        _kiosk_goods(ctx, C, name, spot[0], spot[1], yaw, kind)
    return spot


def _mobile(ctx, name, gx, gz, y, mat, wire_to):
    ctx.cyl(f"{name}_Disc", gx, gz, y, 0.5, 0.04, mat, seg=8)
    ctx.cyl(f"{name}_Wire", gx, gz, y + 0.04, 0.01, wire_to - y - 0.04, ctx.P["steel"], seg=3)


def _market_stall(ctx, C, name, gx, gz, yaw):
    P = ctx.P
    fx, fz = _fwd(yaw)
    fruits = (C["orange"], C["red"], C["green"])
    for k, (d, fd, fdepth) in enumerate(((-0.1, -0.2, 0.18), (0.1, 0.0, 0.18), (0.3, 0.3, 0.36))):
        ctx.box(f"{name}_Crate{k}", gx + fx * d, gz + fz * d, 0.3 * k, 0.6, 0.4, 0.3, P["pallet"], rot=yaw)
        ctx.box(f"{name}_Fruit{k}", gx + fx * fd, gz + fz * fd, 0.3 * (k + 1), 0.56, fdepth, 0.08, fruits[k], rot=yaw, bevel=0.02)
    _tilted(ctx, f"{name}_Slate", gx - fx * 0.45, gz - fz * 0.45, 0.0, 0.5, 0.03, 0.4, P["dark"], tilt=math.radians(15), yaw=yaw)
    ctx.cols.add(name, gx, gz, 0.0, 1.0, 0.8, 1.1, rot=yaw)


def _bistro_set(ctx, C, name, gx, gz, yaw, chairs=2):
    P = ctx.P
    ctx.cyl(f"{name}_Foot", gx, gz, 0.0, 0.04, 0.72, P["dark"], seg=4)
    ctx.cyl(f"{name}_Top", gx, gz, 0.72, 0.3, 0.05, P["wood"], seg=6)
    rx, rz = _right(yaw)
    for k in range(chairs):
        s = 0.8 if k == 0 else -0.8
        rot = yaw + (math.pi / 2 if k == 0 else -math.pi / 2)
        ctx.add(L.furn(ctx.coll, f"{name}_Chair{k}", gx + rx * s, gz + rz * s, rot, _chair_parts(P)))
    ctx.cols.add(name, gx, gz, 0.0, 2.3 if chairs == 2 else 1.0, 1.0, 0.9, rot=yaw)


def _parasol(ctx, name, gx, gz, mat, h=2.3, r=1.2):
    P = ctx.P
    ctx.cyl(f"{name}_Mast", gx, gz, 0.0, 0.03, h, P["steel"], seg=4)
    ctx.cone(f"{name}_Canopy", gx, gz, h - 0.2, r, 0.05, 0.35, mat, seg=8)


def _flower_box(ctx, name, gx, gz, mat):
    P = ctx.P
    ctx.box(f"{name}_Box", gx, gz, 0.0, 2.0, 0.6, 0.35, P["band"])
    ctx.box(f"{name}_Bloom", gx, gz, 0.35, 1.8, 0.4, 0.12, mat)
    ctx.cols.add(name, gx, gz, 0.0, 2.0, 0.6, 0.5)


def _market_cart(ctx, C, name, gx, gz):
    P = ctx.P
    ctx.box(f"{name}_Bed", gx, gz, 0.5, 1.8, 0.9, 0.4, P["wood"])
    for k, dx in enumerate((-0.6, 0.6)):
        _lying_cyl(ctx, f"{name}_Wheel{k}", gx + dx, gz, 0.4, 0.4, 0.08, P["dark"], math.pi / 2)
    for k, dz in enumerate((-0.3, 0.3)):
        ctx.box(f"{name}_Shaft{k}", gx + 1.45, gz + dz, 0.6, 1.2, 0.05, 0.05, P["wood"])
    for k, dx in enumerate((-0.85, 0.85)):
        ctx.box(f"{name}_Post{k}", gx + dx, gz, 0.9, 0.06, 0.06, 1.3, P["wood"])
    ctx.box(f"{name}_Awning", gx, gz, 2.2, 2.0, 1.2, 0.06, P["awning"])
    fruits = (C["orange"], C["red"], C["yellow"])
    for k, dx in enumerate((-0.55, 0.0, 0.55)):
        ctx.box(f"{name}_Crate{k}", gx + dx, gz, 0.9, 0.5, 0.35, 0.2, P["pallet"])
        ctx.box(f"{name}_Fruit{k}", gx + dx, gz, 1.1, 0.46, 0.31, 0.08, fruits[k], bevel=0.02)
    ctx.cols.add(name, gx, gz, 0.0, 2.0, 1.3, 1.0)


def _bulb_line(ctx, name, x0, z0, x1, z1, y, pitch, bulb=(0.08, 0.08, 0.12)):
    P = ctx.P
    dx, dz = x1 - x0, z1 - z0
    span = math.hypot(dx, dz)
    yaw = math.atan2(-dx, -dz) if abs(dx) > 1e-9 else 0.0
    if abs(dz) < 1e-9:
        ctx.box(f"{name}_Cable", (x0 + x1) / 2, z0, y, span, 0.02, 0.02, P["steel"])
    elif abs(dx) < 1e-9:
        ctx.box(f"{name}_Cable", x0, (z0 + z1) / 2, y, 0.02, span, 0.02, P["steel"])
    else:
        ctx.box(f"{name}_Cable", (x0 + x1) / 2, (z0 + z1) / 2, y, 0.02, span, 0.02, P["steel"], rot=yaw)
    n = int(span // pitch)
    for k in range(1, n + 1):
        t = k * pitch / span
        if t >= 0.999:
            break
        ctx.box(f"{name}_Bulb{k}", x0 + dx * t, z0 + dz * t, y - bulb[2], bulb[0], bulb[1], bulb[2], P["lamp"])


# ---------------------------------------------------------------- plazas
def _entrance(ctx, C, M):
    P = ctx.P
    ctx.plaza_sign("Deco_Sign_Entrance", "ENTRANCE PLAZA", -180.0, 0.0, 4.9, math.pi / 2)
    if _place(ctx, "Deco_Fountain_E", [(-180.0, 0.0)], 2.8, 2.8):
        _fountain(ctx, C, "Deco_Fountain_E", -180.0, 0.0, 2.6, medallion=4.5, col=5.6)
    spot = _place(ctx, "Deco_Directory_0", [(-178.0, -12.0), (-174.5, -12.0)], 0.8, 0.3)
    if spot:
        _directory(ctx, "Deco_Directory_0", spot[0], spot[1], -math.pi / 2)
    if _place(ctx, "Deco_Info", [(-180.0, 14.0)], 1.9, 1.9):
        ctx.cyl("Deco_Info_Desk", -180.0, 14.0, 0.0, 1.8, 1.05, P["wall"], seg=16)
        ctx.cyl("Deco_Info_Top", -180.0, 14.0, 1.05, 1.9, 0.06, P["band"], seg=16)
        ctx.cyl("Deco_Info_Pole", -180.0, 14.0, 1.11, 0.06, 2.0, P["steel"], seg=6)
        ctx.box("Deco_Info_Sign", -180.0, 14.0, 3.1, 1.4, 0.08, 0.5, P["band"])
        ctx.text("Deco_Info_Text", "INFORMATION", -180.0, 14.06, 3.2, 0.22, P["sign"], 0.0)
        ctx.text("Deco_Info_TextB", "INFORMATION", -180.0, 13.94, 3.2, 0.22, P["sign"], math.pi)
        ctx.cols.add("Deco_Info_Desk", -180.0, 14.0, 0.0, 3.8, 3.8, 1.1)
    for zc in (-27.5, -16.5, 16.5, 27.5):
        if _place(ctx, f"Deco_Island_E{int(zc * 10)}", [(-180.0, zc)], 1.7, 1.7, reserve=True):
            _u_island(ctx, f"Deco_Island_E{int(zc * 10)}", -180.0, zc, "-z" if zc > 0 else "+z")
    for i, gz in enumerate(range(-44, 45, 11)):
        for tag, gx, rot in (("a", -186.0, math.pi / 2), ("b", -174.0, -math.pi / 2)):
            if _place(ctx, f"Deco_Bench_E{i}{tag}", [(gx, gz)], 0.25, 0.85):
                ctx.bench(f"Deco_Bench_E{i}{tag}", gx, gz, rot)
        if gz not in (-44, 44) and _place(ctx, f"Deco_Bin_E{i}", [(-176.0, gz + 5.5)], 0.3, 0.3):
            ctx.bin_(f"Deco_Bin_E{i}", -176.0, gz + 5.5)
    for k, (gx, gz, yaw) in enumerate(((-183.6, 10.5, -math.pi / 2), (-176.4, -16.5, math.pi / 2))):
        if _place(ctx, f"Deco_Terminal_E{k}", [(gx, gz)], 0.3, 0.3):
            _terminal(ctx, C, f"Deco_Terminal_E{k}", gx, gz, yaw)
    for k, (gx, gz) in enumerate(((-172.7, -43.0), (-172.7, 43.0), (-187.3, -27.5), (-187.3, 27.5))):
        yaw = math.pi / 2 if gx > -180 else -math.pi / 2
        if _place(ctx, f"Deco_Vending_E{k}", [(gx, gz)], 0.45, 1.0):
            _vending_pair(ctx, C, f"Deco_Vending_E{k}", gx, gz, yaw)
    for k, gz in enumerate((-7.4, 7.4)):
        if _place(ctx, f"Deco_ATM{k}", [(-166.0, gz)], 0.35, 0.3):
            _atm(ctx, f"Deco_ATM{k}", -166.0, gz, 0.0 if gz < 0 else math.pi)
    _kiosk(ctx, C, "Deco_Kiosk_IceCream", [(-180.0, -33.0), (-175.0, -30.0)], 0.0, "ICE CREAM", P["pink"], "ice_cream")
    _kiosk(ctx, C, "Deco_Kiosk_News", [(-180.0, 33.0), (-185.0, 30.0)], math.pi, "COVE NEWS", P["blue"], "news")
    ctx.way_sign("Deco_Way_North", "PARADISE PLAZA · NORTH PLAZA", -183.0, -56.0, 0.0)
    ctx.way_sign("Deco_Way_South", "AL FRESCA · FOOD COURT", -183.0, 56.0, math.pi)


def _directory(ctx, name, gx, gz, yaw):
    P = ctx.P
    fx, fz = _fwd(yaw)
    ctx.box(f"{name}_Post", gx, gz, 0.0, 0.3, 0.3, 2.4, P["dark"], rot=yaw)
    ctx.box(f"{name}_Board", gx, gz, 0.9, 1.6, 0.12, 1.6, P["band"], rot=yaw)
    ctx.box(f"{name}_Map", gx + fx * 0.08, gz + fz * 0.08, 1.1, 1.3, 0.02, 1.1, P["soon"], rot=yaw)
    ctx.text(f"{name}_Text", "DIRECTORY", gx + fx * 0.09, gz + fz * 0.09, 2.25, 0.2, P["sign"], yaw)
    ctx.cols.add(name, gx, gz, 0.0, 1.6, 0.4, 2.5, rot=yaw)


def _court(ctx, C, name, gx, gz, benches, sculpture=True):
    if sculpture and _place(ctx, f"{name}_Sculpture", [(gx, gz)], 1.6, 1.6, reserve=True):
        ctx.sculpture(f"{name}_Sculpture", gx, gz)
    for k, (dx, dz, rot) in enumerate(benches):
        hx, hz = (0.25, 0.85) if abs(math.sin(rot)) > 0.5 else (0.85, 0.25)
        if _place(ctx, f"{name}_Bench{k}", [(gx + dx, gz + dz)], hx, hz):
            ctx.bench(f"{name}_Bench{k}", gx + dx, gz + dz, rot)


def _paradise(ctx, C, M):
    P = ctx.P
    ctx.plaza_sign("Deco_Sign_Paradise", "PARADISE PLAZA", -220.0, -70.0, 4.9, 0.0)
    ctx.way_sign("Deco_Way_West", "NORTH PLAZA · WONDERLAND", -300.0, -70.0, math.pi / 2)
    for gx in (-296.0, -280.0, -270.0, -230.0, -216.0):
        if _place(ctx, f"Deco_Bench_N{int(-gx)}a", [(gx, -76.0)], 0.85, 0.25):
            ctx.bench(f"Deco_Bench_N{int(-gx)}a", gx, -76.0, math.pi)
    for gx in (-296.0, -280.0, -264.0, -242.0, -232.0, -217.0):
        if _place(ctx, f"Deco_Bench_N{int(-gx)}b", [(gx, -64.0)], 0.85, 0.25):
            ctx.bench(f"Deco_Bench_N{int(-gx)}b", gx, -64.0, 0.0)
    for gx in (-272.0, -208.0):
        if _place(ctx, f"Deco_Island_P{int(-gx)}", [(gx, -70.0)], 1.7, 1.7, reserve=True):
            _u_island(ctx, f"Deco_Island_P{int(-gx)}", gx, -70.0, "+z")
    for gx in (-240.0, -224.0):
        if _place(ctx, f"Deco_Plants_P{int(-gx)}", [(gx, -70.0)], 1.6, 1.6, reserve=True):
            _plant_island(ctx, f"Deco_Plants_P{int(-gx)}", gx, -70.0)
    _kiosk(ctx, C, "Deco_Kiosk_Pretzel", [(-280.0, -70.0), (-268.0, -75.0)], math.pi / 2, "PRETZELS", P["yellow"], "pretzel")
    _kiosk(ctx, C, "Deco_Kiosk_Phones", [(-232.0, -70.0), (-220.0, -65.0)], -math.pi / 2, "PHONE CASES", P["band"], "phones")
    _kiosk(ctx, C, "Deco_Kiosk_Souvenirs", [(-290.0, -70.0), (-284.0, -75.0), (-236.0, -75.0)], math.pi / 2, "COVE SOUVENIRS", P["band"], "souvenirs")
    mats = (ctx.CAT_MATS["clothing_women"], ctx.CAT_MATS["clothing_men"], ctx.CAT_MATS["clothing_kids"], ctx.CAT_MATS["jewelry"])
    for k, gx in enumerate((-268.0, -252.0, -236.0, -220.0)):
        _mobile(ctx, f"Deco_Mobile_P{k}", gx, -70.0, 5.5, mats[k], M.ROOF2)
    for k, (gx, gz, yaw) in enumerate(((-288.75, -62.7, 0.0), (-223.0, -77.3, math.pi))):
        if _place(ctx, f"Deco_Vending_P{k}", [(gx, gz)], 1.0, 0.45):
            _vending_pair(ctx, C, f"Deco_Vending_P{k}", gx, gz, yaw)
    for k, (gx, gz) in enumerate(((-269.7, -70.0), (-257.2, -70.0), (-237.7, -70.0), (-221.7, -70.0), (-205.7, -70.0), (-291.0, -73.8), (-213.0, -66.2))):
        if _place(ctx, f"Deco_Bin_P{k}", [(gx, gz)], 0.3, 0.3):
            ctx.bin_(f"Deco_Bin_P{k}", gx, gz)
    _court(ctx, C, "Deco_CourtNE", -180.0, -70.0, ((-2.6, 0.0, math.pi / 2), (0.0, -2.6, math.pi), (0.0, 2.6, 0.0)))
    spot = _place(ctx, "Deco_Directory_3", [(-190.0, -70.0), (-190.0, -76.0)], 0.8, 0.3)
    if spot:
        _directory(ctx, "Deco_Directory_3", spot[0], spot[1], 0.0)


def _north(ctx, C, M):
    P = ctx.P
    ctx.plaza_sign("Deco_Sign_NorthPlaza", "NORTH PLAZA", -330.0, -70.0, 4.9, 0.0)
    for k, gx in enumerate((-358.0, -322.0)):
        if _place(ctx, f"Deco_Stall_N{k}", [(gx, -72.5)], 0.5, 0.4):
            _market_stall(ctx, C, f"Deco_Stall_N{k}", gx, -72.5, 0.0)
    if _place(ctx, "Deco_Cherry", [(-360.0, -70.0), (-356.0, -65.0)], 1.0, 1.0, reserve=True):
        ctx.planter("Deco_Cherry_Planter", -360.0, -70.0, 2.0, 2.0, flowers=False)
        ctx.tree("blossom", -360.0, -70.0, 0.8)
        for k, (gx, gz, rot) in enumerate(((-361.9, -70.0, math.pi / 2), (-358.1, -70.0, -math.pi / 2), (-360.0, -68.1, 0.0))):
            ctx.bench(f"Deco_Cherry_Bench{k}", gx, gz, rot)
    spot = _place(ctx, "Deco_Directory_1", [(-350.0, -70.0), (-366.0, -64.5)], 0.8, 0.3)
    if spot:
        _directory(ctx, "Deco_Directory_1", spot[0], spot[1], 0.0)
    _kiosk(ctx, C, "Deco_Kiosk_Coffee", [(-345.0, -70.0), (-350.0, -65.5)], math.pi / 2, "COFFEE CART", P["wood"], "coffee")
    if _place(ctx, "Deco_Vending_Pharmacy", [(-320.0, -62.7)], 0.5, 0.45):
        _vending(ctx, C, "Deco_Vending_Pharmacy", -320.0, -62.7, 0.0, ctx.CAT_MATS["pharmacy"])
    ctx.way_sign("Deco_Way_Stores", "GREENCART · CRISPIN'S", -340.0, -66.0, math.pi, wire_to=M.ROOF1)
    ctx.box("Deco_Dock_Sign", -318.7, -77.8, 2.6, 0.8, 0.04, 0.3, P["band"])
    ctx.box("Deco_Dock_Arrow", -318.9, -77.75, 2.73, 0.36, 0.02, 0.06, P["sign"])
    _tilted(ctx, "Deco_Dock_ArrowHead", -318.6, -77.75, 2.69, 0.18, 0.02, 0.06, P["sign"], roll=math.radians(45))
    _tilted(ctx, "Deco_Dock_ArrowHead2", -318.6, -77.75, 2.83, 0.18, 0.02, 0.06, P["sign"], roll=-math.radians(45))
    for k, (gx, gz) in enumerate(((-362.0, -72.5), (-318.7, -66.0))):
        if _place(ctx, f"Deco_Bin_N{k}", [(gx, gz)], 0.3, 0.3):
            ctx.bin_(f"Deco_Bin_N{k}", gx, gz)


def _spring_rider(ctx, C, name, gx, gz, mat):
    P = ctx.P
    ctx.cyl(f"{name}_Spring", gx, gz, 0.03, 0.06, 0.35, P["steel"], seg=6)
    ctx.box(f"{name}_Body", gx, gz, 0.38, 0.6, 0.25, 0.3, mat, bevel=0.06)
    ctx.box(f"{name}_Head", gx + 0.4, gz, 0.5, 0.25, 0.2, 0.2, mat, bevel=0.05)
    for k, dz in enumerate((-0.14, 0.14)):
        ctx.cyl(f"{name}_Grip{k}", gx + 0.2, gz + dz, 0.68, 0.015, 0.14, P["steel"], seg=4)
    ctx.cols.add(name, gx, gz, 0.0, 0.7, 0.4, 0.9)


def _gashapon(ctx, C, name, gx, gz, mat):
    P = ctx.P
    ctx.box(f"{name}_Body", gx, gz, 0.0, 0.5, 0.5, 1.2, mat)
    ctx.cyl(f"{name}_Dome", gx, gz, 1.2, 0.25, 0.3, P["glass"], seg=8)
    balls = (C["coral"], C["yellow"], C["blue"], C["pink"], C["green"], C["orange"])
    for k in range(6):
        a = TWO_PI * k / 6
        ctx.cyl(f"{name}_Ball{k}", gx + 0.13 * math.cos(a), gz + 0.13 * math.sin(a), 1.2 + 0.05 * (k % 2), 0.05, 0.08, balls[k], seg=6)
    ctx.cols.add(name, gx, gz, 0.0, 0.6, 0.6, 1.5)


def _wonderland(ctx, C, M):
    P = ctx.P
    rnd = ctx.rnd
    ctx.plaza_sign("Deco_Sign_Wonderland", "WONDERLAND PLAZA", -360.0, -30.0, 4.9, math.pi / 2)
    play = _place(ctx, "Deco_PlayN", [(-360.0, -14.0)], 2.5, 8.0, reserve=True) and _place(ctx, "Deco_PlayS", [(-360.0, 14.0)], 2.5, 8.0, reserve=True)
    if play:
        ctx.rect("Deco_Play_MatN", -362.5, -22.0, -357.5, -6.0, 0.0, 0.03, P["soft"], tile=1.0)
        ctx.rect("Deco_Play_MatS", -362.5, 6.0, -357.5, 22.0, 0.0, 0.03, P["soft"], tile=1.0)
        ctx.box("Deco_Play_Cube", -360.0, -19.0, 0.03, 2.4, 2.4, 2.0, P["blue"], bevel=0.08)
        ctx.cols.add("Deco_Play_Cube", -360.0, -19.0, 0.0, 2.4, 2.4, 2.0)
        ctx.wedge("Deco_Play_Slide", -361.0, -17.8, -359.0, -12.0, 0.3, 2.0, "-z", P["yellow"])
        ctx.cols.add("Deco_Play_Slide", -360.0, -14.9, 0.0, 2.0, 5.8, 1.2)
        for k, (gx, gz, mat) in enumerate(((-361.3, -9.0, C["coral"]), (-360.0, -8.0, C["yellow"]), (-358.7, -9.0, C["green"]))):
            _spring_rider(ctx, C, f"Deco_Rider{k}", gx, gz, mat)
        ctx.cyl("Deco_Carousel_Base", -360.0, 10.5, 0.03, 3.2, 0.3, P["red"], seg=16)
        ctx.cyl("Deco_Carousel_Pole", -360.0, 10.5, 0.33, 0.12, 3.2, P["rail"], seg=8)
        ctx.cone("Deco_Carousel_Roof", -360.0, 10.5, 3.2, 3.5, 0.3, 1.2, P["awning"], seg=16)
        for k in range(6):
            a = TWO_PI * k / 6
            gx, gz = -360.0 + 2.2 * math.cos(a), 10.5 + 2.2 * math.sin(a)
            ctx.cyl(f"Deco_Carousel_Rod{k}", gx, gz, 0.33, 0.03, 2.9, P["rail"], seg=4)
            ctx.add(L.box(ctx.coll, f"Deco_Carousel_Horse{k}", gx, gz, 0.9, 0.5, 1.1, 0.6, rnd.choice((P["pink"], P["blue"], P["yellow"], P["red"])), rot=-a + 0.3, bevel=0.05))
        ctx.cols.add("Deco_Carousel", -360.0, 10.5, 0.0, 6.6, 6.6, 1.5)
        ctx.box("Deco_BallPit", -360.0, 18.0, 0.03, 4.0, 4.0, 0.7, P["blue"], bevel=0.03)
        for k in range(30):
            ctx.cyl(f"Deco_BallPit_Ball{k}", -361.6 + (k % 6) * 0.64, 16.4 + (k // 6) * 0.64, 0.73, 0.22, 0.3, rnd.choice((P["red"], P["yellow"], P["pink"], P["blue"])), seg=6)
        ctx.cols.add("Deco_BallPit", -360.0, 18.0, 0.0, 4.0, 4.0, 0.8)
        tops = (C["coral"], C["yellow"], C["blue"], C["pink"], C["green"])
        k = 0
        for gz in (-22.0, -18.0, -14.0, -10.0, -6.0, 6.0, 10.0, 14.0, 18.0, 22.0):
            for gx in (-362.3, -357.7):
                ctx.cyl(f"Deco_Lolly{k}_Mast", gx, gz, 0.0, 0.06, 1.6, C["cream"], seg=6)
                ctx.cyl(f"Deco_Lolly{k}_Disc", gx, gz, 1.6, 0.25, 0.08, tops[k % 5], seg=8)
                ctx.cols.add(f"Deco_Lolly{k}", gx, gz, 0.0, 0.3, 0.3, 1.7)
                k += 1
        rainbow = (C["coral"], C["orange"], C["yellow"], C["green"], C["blue"])
        for side, gz in enumerate((-22.4, 22.4)):
            for k in range(5):
                gx = -362.0 + 1.0 * k
                ctx.box(f"Deco_Crayon{side}{k}", gx, gz, 0.0, 0.25, 0.25, 1.4, rainbow[k])
                ctx.cone(f"Deco_Crayon{side}{k}_Tip", gx, gz, 1.4, 0.13, 0.0, 0.3, C["biscuit"], seg=6)
    for k, gz in enumerate((-14.0, 14.0)):
        if _place(ctx, f"Deco_Bench_Parents{k}", [(-354.5, gz)], 0.25, 0.85):
            ctx.bench(f"Deco_Bench_Parents{k}", -354.5, gz, math.pi / 2)
    for k, (gz, mat) in enumerate(((-33.2, C["red"]), (-16.6, C["blue"]))):
        if _place(ctx, f"Deco_Gashapon{k}", [(-367.5, gz)], 0.3, 0.3):
            _gashapon(ctx, C, f"Deco_Gashapon{k}", -367.5, gz, mat)
    _kiosk(ctx, C, "Deco_Kiosk_Balloons", [(-360.0, 36.0), (-360.0, 30.0), (-365.0, 33.0)], 0.0, "BALLOONS", P["yellow"], "balloons")
    if _place(ctx, "Deco_Hopscotch", [(-355.0, -30.0)], 0.8, 1.5):
        rows = (3, 2, 1, 2, 1, 1)
        n = 0
        for r, cnt in enumerate(rows):
            for c in range(cnt):
                gx = -355.0 + (c - (cnt - 1) / 2) * 0.52
                ctx.box(f"Deco_Hop{n}", gx, -31.3 + r * 0.52, 0.0, 0.5, 0.5, 0.02, (C["yellow"], C["coral"])[n % 2])
                n += 1
    for gz in (-42.0, -34.0, -18.0, 18.0, 34.0, 42.0):
        if _place(ctx, f"Deco_Planter_W{int(gz)}", [(-354.5, gz)], 0.8, 0.8):
            ctx.planter(f"Deco_Planter_W{int(gz)}", -354.5, gz, 1.6, 1.6, flowers=False)
            ctx.tree("round", -354.5, gz, 0.7)
    for gz, spots in ((-24.0, [(-366.0, -24.0)]), (24.0, [(-366.0, 24.0), (-366.0, 30.0)]), (-46.0, [(-366.0, -46.0)]), (46.0, [(-366.0, 46.0)])):
        spot = _place(ctx, f"Deco_Bench_W{int(gz)}", spots, 0.25, 0.85)
        if spot:
            ctx.bench(f"Deco_Bench_W{int(gz)}", spot[0], spot[1], -math.pi / 2)
            if _place(ctx, f"Deco_Bin_W{int(gz)}", [(spot[0], spot[1] + 2.5)], 0.3, 0.3):
                ctx.bin_(f"Deco_Bin_W{int(gz)}", spot[0], spot[1] + 2.5)


def _chair_parts(P):
    return [(0, 0, 0.45, 0.46, 0.46, 0.06, P["wood"]), (0, 0.22, 0.51, 0.44, 0.06, 0.48, P["wood"]),
            (0, 0, 0.04, 0.06, 0.06, 0.41, P["dark"]), (0, 0, 0.0, 0.52, 0.05, 0.04, P["dark"]), (0, 0, 0.0, 0.05, 0.52, 0.04, P["dark"])]


def _fc_table(ctx, name, gx, gz):
    P = ctx.P
    ctx.cyl(f"{name}_Top", gx, gz, 0.72, 0.7, 0.05, P["wood"], seg=12)
    ctx.cyl(f"{name}_Leg", gx, gz, 0.0, 0.08, 0.72, P["dark"], seg=6)
    for k in range(4):
        a = TWO_PI * k / 4 + math.pi / 4
        ctx.add(L.furn(ctx.coll, f"{name}_Chair{k}", gx + 1.05 * math.cos(a), gz + 1.05 * math.sin(a), -a + math.pi / 2, _chair_parts(P)))
    ctx.cols.add(name, gx, gz, 0.0, 2.6, 2.6, 0.9)


def _standing_table(ctx, name, gx, gz):
    P = ctx.P
    ctx.cyl(f"{name}_Base", gx, gz, 0.0, 0.3, 0.04, P["dark"], seg=8)
    ctx.cyl(f"{name}_Stem", gx, gz, 0.04, 0.06, 1.06, P["dark"], seg=6)
    ctx.cyl(f"{name}_Top", gx, gz, 1.1, 0.35, 0.05, P["wood"], seg=8)
    ctx.cols.add(name, gx, gz, 0.0, 0.8, 0.8, 1.15)


def _tray_station(ctx, C, name, gx, gz):
    P = ctx.P
    ctx.box(f"{name}_Cabinet", gx, gz, 0.0, 1.2, 0.6, 0.9, P["steel"])
    for k, (dx, mat) in enumerate(((-0.4, C["red"]), (-0.2, C["yellow"]), (0.0, C["cream"]))):
        ctx.box(f"{name}_Pot{k}", gx + dx, gz - 0.15, 0.9, 0.15, 0.15, 0.2, mat)
    ctx.box(f"{name}_Trays", gx + 0.3, gz + 0.05, 0.9, 0.45, 0.35, 0.15, C["red"])
    ctx.cols.add(name, gx, gz, 0.0, 1.3, 0.7, 1.0)
    ctx.bin_(f"{name}_Bin", gx + 0.95, gz)


def _cactus(ctx, C, name, gx, gz):
    ctx.cyl(f"{name}_Pot", gx, gz, 0.0, 0.2, 0.3, C["crate"], seg=6)
    ctx.box(f"{name}_Stem", gx, gz, 0.3, 0.2, 0.2, 0.9, C["cactus"], bevel=0.04)
    ctx.box(f"{name}_ArmL", gx - 0.2, gz, 0.6, 0.12, 0.12, 0.4, C["cactus"], bevel=0.03)
    ctx.box(f"{name}_ArmR", gx + 0.2, gz, 0.75, 0.12, 0.12, 0.4, C["cactus"], bevel=0.03)
    ctx.cols.add(name, gx, gz, 0.0, 0.5, 0.5, 1.2)


def _food_court(ctx, C, M):
    P = ctx.P
    ctx.plaza_sign("Deco_Sign_FoodCourt", "FOOD COURT", -330.0, 70.0, 4.9, 0.0)
    spot = _place(ctx, "Deco_Directory_2", [(-350.0, 70.0), (-350.0, 64.5)], 0.8, 0.3)
    if spot:
        _directory(ctx, "Deco_Directory_2", spot[0], spot[1], math.pi)
    n = 0
    for gz, xs in ((67.8, range(-364, -300, 8)), (72.2, range(-360, -304, 8))):
        for gx in xs:
            if _place(ctx, f"Deco_FC_Table{n}", [(gx, gz)], 1.3, 1.3):
                _fc_table(ctx, f"Deco_FC_Table{n}", gx, gz)
            n += 1
    for k, gz in enumerate((66.5, 70.0, 73.3)):
        if _place(ctx, f"Deco_FC_Stand{k}", [(-304.5, gz)], 0.4, 0.4):
            _standing_table(ctx, f"Deco_FC_Stand{k}", -304.5, gz)
    for k, gx in enumerate((-358.0, -334.0, -310.0)):
        if _place(ctx, f"Deco_FC_Station{k}", [(gx, 70.0)], 1.0, 0.4):
            _tray_station(ctx, C, f"Deco_FC_Station{k}", gx, 70.0)
    for k, (gx, gz) in enumerate(((-366.5, 63.0), (-365.6, 63.9), (-300.8, 63.3), (-299.9, 64.1))):
        if _place(ctx, f"Deco_FC_Barrel{k}", [(gx, gz)], 0.45, 0.45):
            ctx.cyl(f"Deco_FC_Barrel{k}", gx, gz, 0.0, 0.4, 0.9, P["wood"], seg=10)
            ctx.cols.add(f"Deco_FC_Barrel{k}", gx, gz, 0.0, 0.9, 0.9, 0.9)
    if _place(ctx, "Deco_FC_Trough", [(-366.5, 71.0)], 0.3, 0.9):
        ctx.box("Deco_FC_Trough", -366.5, 71.0, 0.0, 0.5, 1.6, 0.5, P["wood"])
        ctx.box("Deco_FC_TroughWater", -366.5, 71.0, 0.5, 0.4, 1.5, 0.02, P["water"])
        ctx.cols.add("Deco_FC_Trough", -366.5, 71.0, 0.0, 0.5, 1.6, 0.5)
    for k, gz in enumerate((68.5, 73.5)):
        if _place(ctx, f"Deco_FC_Cactus{k}", [(-366.5, gz)], 0.3, 0.3):
            _cactus(ctx, C, f"Deco_FC_Cactus{k}", -366.5, gz)
    for k, (gz, xs) in enumerate(((62.35, (-337.0, -325.0, -313.0)), (77.65, (-361.0, -348.0, -335.0, -321.0, -308.0)))):
        for gx in xs:
            o = ctx.cyl(f"Deco_FC_Wheel{k}_{int(-gx)}", gx, gz, 2.3, 0.6, 0.1, P["wood"], seg=12)
            o.rotation_euler = (math.pi / 2, 0.0, 0.0)
            o.location = L.b(gx, gz - 0.05, 2.9)
    for gz in (64.0, 76.0):
        _bulb_line(ctx, f"Deco_FC_Lights{int(gz)}", -367.0, gz, -303.0, gz, 4.4, 3.0, bulb=(0.1, 0.1, 0.15))
    for c in M.cells:
        if c["row"] == "S_out_a" and c["status"] == "planned":
            cx = (c["bounds"]["minX"] + c["bounds"]["maxX"]) / 2
            ctx.box(f"Deco_FC_Menu_{c['id']}", cx, 77.55, 2.5, 2.4, 0.05, 0.8, P["dark"])
            for k, dx in enumerate((-0.75, 0.0, 0.75)):
                ctx.box(f"Deco_FC_Menu_{c['id']}_{k}", cx + dx, 77.5, 2.65, 0.5, 0.01, 0.5, P["panel"])
    ctx.box("Deco_FC_ArchL", -302.5, 62.5, 0.0, 0.4, 0.4, 4.65, P["wood"])
    ctx.box("Deco_FC_ArchR", -302.5, 77.5, 0.0, 0.4, 0.4, 4.65, P["wood"])
    ctx.box("Deco_FC_ArchTop", -302.5, 70.0, 4.65, 0.5, 15.4, 0.9, P["wood"])
    ctx.text("Deco_FC_ArchText", "FOOD COURT", -302.8, 70.0, 4.85, 0.5, P["sign"], -math.pi / 2)
    ctx.text("Deco_FC_ArchTextB", "FOOD COURT", -302.2, 70.0, 4.85, 0.5, P["sign"], math.pi / 2)
    ctx.cols.add("Deco_FC_ArchL", -302.5, 62.5, 0.0, 0.5, 0.5, 4.6)
    ctx.cols.add("Deco_FC_ArchR", -302.5, 77.5, 0.0, 0.5, 0.5, 4.6)
    for k, (gx, gz) in enumerate(((-366.5, 66.5), (-306.0, 66.5))):
        if _place(ctx, f"Deco_Bin_F{k}", [(gx, gz)], 0.3, 0.3):
            ctx.bin_(f"Deco_Bin_F{k}", gx, gz)


def _al_fresca(ctx, C, M):
    P = ctx.P
    ctx.plaza_sign("Deco_Sign_AlFresca", "AL FRESCA PLAZA", -220.0, 70.0, 4.9, 0.0)
    ctx.way_sign("Deco_Way_East", "AL FRESCA · ENTRANCE", -300.0, 70.0, -math.pi / 2)
    if _place(ctx, "Deco_Fountain_AF", [(-230.0, 70.0)], 3.2, 3.2):
        _fountain(ctx, C, "Deco_Fountain_AF", -230.0, 70.0, 3.2, col=6.4)
        for k, (gx, gz, rot) in enumerate(((-234.2, 70.0, math.pi / 2), (-225.8, 70.0, -math.pi / 2), (-230.0, 65.8, 0.0))):
            hx, hz = (0.25, 0.85) if abs(math.sin(rot)) > 0.5 else (0.85, 0.25)
            if _place(ctx, f"Deco_Fountain_AF_Bench{k}", [(gx, gz)], hx, hz):
                ctx.bench(f"Deco_Fountain_AF_Bench{k}", gx, gz, rot)
    for c in M.cells:
        if c["plaza"] == "al_fresca" and c["level"] == 0 and c["status"] == "planned":
            b = c["bounds"]
            outer = c["row"].startswith("S_out")
            front_z = b["minZ"] if outer else b["maxZ"]
            d = -1 if outer else 1
            ctx.box(f"Deco_Awning_{c['id']}", (b["minX"] + b["maxX"]) / 2, front_z + d * 0.8, 3.25, b["maxX"] - b["minX"] - 1.4, 1.6, 0.1, P["awning"])
    lamp_xs = (-293.0, -279.0, -265.0, -237.0, -223.0, -209.0, -195.0, -181.0)
    for gx in lamp_xs:
        pair = []
        for gz in (63.5, 73.5):
            if _place(ctx, f"Deco_AF_Lamp{int(-gx)}_{int(gz)}", [(gx, gz)], 0.3, 0.3):
                ctx.lamp(f"Deco_AF_Lamp{int(-gx)}_{int(gz)}", gx, gz, 3.6)
                pair.append(gz)
        if len(pair) == 2:
            _bulb_line(ctx, f"Deco_AF_Garland{int(-gx)}", gx, 63.5, gx, 73.5, 4.2, 1.1)
    _bulb_line(ctx, "Deco_AF_GarlandW", -293.0, 68.5, -258.0, 68.5, 4.2, 2.0)
    _bulb_line(ctx, "Deco_AF_GarlandE", -244.0, 68.5, -181.0, 68.5, 4.2, 2.0)
    for k, gx in enumerate((-231.0, -228.5, -226.0, -223.5)):
        if _place(ctx, f"Deco_Terrace_Saffron{k}", [(gx, 65.0)], 0.5, 1.15):
            _bistro_set(ctx, C, f"Deco_Terrace_Saffron{k}", gx, 65.0, math.pi / 2)
    for k, gx in enumerate((-229.75, -224.75)):
        if _place(ctx, f"Deco_Parasol_Saffron{k}", [(gx, 65.0)], 0.1, 0.1):
            _parasol(ctx, f"Deco_Parasol_Saffron{k}", gx, 65.0, P["awning"])
    spot = _kiosk(ctx, C, "Deco_Kiosk_Gelato", [(-195.0, 70.0), (-202.0, 74.6)], -math.pi / 2, "GELATO", P["pink"], "gelato")
    if spot:
        kx, kz = spot
        for k, (dx, dz, yaw) in enumerate(((-3.5, 0.0, 0.0), (0.0, -3.5, math.pi / 2), (0.0, 3.5, math.pi / 2))):
            hx, hz = (1.15, 0.5) if yaw == 0.0 else (0.5, 1.15)
            if _place(ctx, f"Deco_Terrace_Gelato{k}", [(kx + dx, kz + dz)], hx, hz):
                _bistro_set(ctx, C, f"Deco_Terrace_Gelato{k}", kx + dx, kz + dz, yaw)
    _kiosk(ctx, C, "Deco_Kiosk_Juice", [(-270.0, 70.0), (-266.0, 74.5), (-258.0, 65.5)], math.pi / 2, "FRESH JUICE", P["red"], "juice")
    for k, gx in enumerate((-262.0, -212.0)):
        if _place(ctx, f"Deco_Cart{k}", [(gx, 70.0)], 1.0, 0.65, reserve=True):
            _market_cart(ctx, C, f"Deco_Cart{k}", gx, 70.0)
    blooms = (P["flower"], P["flower2"], P["pink"])
    k = 0
    for gx in list(range(-298, -257, 4)) + list(range(-242, -201, 4)):
        if _place(ctx, f"Deco_AF_Flowers{k}", [(gx, 63.3)], 1.0, 0.3):
            _flower_box(ctx, f"Deco_AF_Flowers{k}", gx, 63.3, blooms[k % 3])
        k += 1
    northline = next(a for a in M.ANCHORS if a["key"] == "northline")
    for i, gx in enumerate(range(-294, -166, 14)):
        if abs(gx - northline["x"]) < northline["w"] / 2 + 2.0:
            continue
        spots = [(gx, 64.0)] if gx != -168 else [(-176.0, 64.0)]
        spot = _place(ctx, f"Deco_AF_Planter{i}", spots, 1.0, 1.0, reserve=True)
        if spot:
            ctx.planter(f"Deco_AF_Planter{i}", spot[0], spot[1], 2.0, 2.0, flowers=False)
            ctx.tree("blossom" if i % 2 else "round", spot[0], spot[1], 0.8)
        bx = gx + 7.0
        bench_spots = [(bx, 74.5)] if bx not in (-287, -273) else [(bx, 65.5)]
        if bx < -161 and _place(ctx, f"Deco_AF_Bench{i}", bench_spots, 0.85, 0.25):
            ctx.bench(f"Deco_AF_Bench{i}", bench_spots[0][0], bench_spots[0][1], 0.0 if bench_spots[0][1] > 70 else math.pi)
    for k, (gx, gz) in enumerate(((-234.0, 64.0), (-199.0, 70.0), (-262.5, 71.5), (-211.5, 71.5))):
        if _place(ctx, f"Deco_Bin_A{k}", [(gx, gz)], 0.3, 0.3):
            ctx.bin_(f"Deco_Bin_A{k}", gx, gz)
    _court(ctx, C, "Deco_CourtSE", -180.0, 70.0, ())
    spot = _place(ctx, "Deco_Directory_4", [(-190.0, 70.0), (-190.0, 76.0)], 0.8, 0.3)
    if spot:
        _directory(ctx, "Deco_Directory_4", spot[0], spot[1], math.pi)


def _banners(ctx, M):
    P = ctx.P
    rnd = ctx.rnd
    labels = ("NORTHLINE", "HEARTH & HOLLOW", "GREENCART", "CANDY CLOUD", "CRISPIN'S", "SUMMIT SPORTS", "SALE", "NEW SEASON")
    mats = (P["band"], P["red"], P["blue"], P["yellow"], P["pink"])
    bn = 0
    px0, px1, pz0, pz1 = M.PARK
    for key, axis, a0, a1, edges in (("E", "z", pz0, pz1, ((M.E_OUT - M.BAL, -math.pi / 2, 0.7), (M.E_IN + M.BAL, math.pi / 2, -0.7))),
                                      ("P", "x", M.P_UP[0], M.P_UP[1], ((M.N_OUT + M.BAL, 0.0, -0.7), (M.N_IN - M.BAL, math.pi, 0.7))),
                                      ("W", "z", pz0, pz1, ((M.W_OUT + M.BAL, math.pi / 2, -0.7), (M.W_IN - M.BAL, -math.pi / 2, 0.7)))):
        for e, (edge, yaw, inward) in enumerate(edges):
            for p in range(int(a0) + 14, int(a1) - 13, 24):
                if key == "W" and edge < -360.0 and 0.0 <= p <= 26.0:
                    continue
                gx, gz = (p, edge) if axis == "x" else (edge, p)
                ctx.banner(f"Deco_Banner_{key}_{bn}", gx, gz, yaw, mats[bn % len(mats)], labels[bn % len(labels)])
                bn += 1
            for p in range(int(a0) + 26, int(a1) - 13, 24):
                gx, gz = (p, edge + inward) if axis == "x" else (edge + inward, p)
                sx, sz = (1.2, 0.4) if axis == "x" else (0.4, 1.2)
                fx, fz = (1.0, 0.3) if axis == "x" else (0.3, 1.0)
                ctx.box(f"Deco_PlanterBal_{key}{e}_{p}_Box", gx, gz, M.L1_Y + 0.02, sx, sz, 0.4, P["band"], bevel=0.02)
                ctx.box(f"Deco_PlanterBal_{key}{e}_{p}_Flower", gx, gz, M.L1_Y + 0.42, fx, fz, 0.18, rnd.choice((P["flower"], P["flower2"], P["pink"])), bevel=0.04)


def _cornices(ctx, M):
    px0, px1, pz0, pz1 = M.PARK
    for name, x0, z0, x1, z1 in (("ParkWallN", px0 + 0.05, pz0 - 0.35, px1 - 0.05, pz0 - 0.05), ("ParkWallS", px0 + 0.05, pz1 + 0.05, px1 - 0.05, pz1 + 0.35),
                                 ("ParkWallW", px0 - 0.35, pz0 + 0.05, px0 - 0.05, pz1 - 0.05), ("ParkWallE", px1 + 0.05, pz0 + 0.05, px1 + 0.35, pz1 - 0.05)):
        ctx.rect(f"Deco_{name}_Cornice", x0, z0, x1, z1, M.CELL_H, 0.4, ctx.P["band"])


# ---------------------------------------------------------------- leisure park
def _gazebo(ctx, C, name, gx, gz):
    P = ctx.P
    ctx.cyl(f"{name}_Base", gx, gz, -0.02, 3.0, 0.42, P["stone"], seg=8)
    for k in range(8):
        a = TWO_PI * k / 8
        ctx.cyl(f"{name}_Post{k}", gx + 2.6 * math.cos(a), gz + 2.6 * math.sin(a), 0.4, 0.08, 2.6, P["wood"], seg=4)
        if k != 4:
            am = a + math.pi / 8
            o = ctx.add(L.box(ctx.coll, f"{name}_Rail{k}", gx + 2.7 * math.cos(am), gz + 2.7 * math.sin(am), 0.4, 1.9, 0.04, 0.9, P["wood"]))
            o.rotation_euler = (0.0, 0.0, -am + math.pi / 2)
    ctx.cone(f"{name}_Roof", gx, gz, 3.0, 3.6, 0.1, 1.4, C["gazebo"], seg=8)
    for k in range(4):
        a = TWO_PI * k / 4 + math.pi / 4
        ctx.cols.add(f"{name}_Col{k}", gx + 2.6 * math.cos(a), gz + 2.6 * math.sin(a), 0.0, 0.3, 2.0, 1.0, rot=-a + math.pi / 2)


def _picnic_table(ctx, name, gx, gz):
    P = ctx.P
    ctx.box(f"{name}_Top", gx, gz, 0.75, 1.8, 0.7, 0.05, P["wood"])
    for k, dz in enumerate((-0.55, 0.55)):
        ctx.box(f"{name}_Seat{k}", gx, gz + dz, 0.45, 1.8, 0.3, 0.04, P["wood"])
    for k, dx in enumerate((-0.7, 0.7)):
        _tilted(ctx, f"{name}_LegA{k}", gx + dx, gz - 0.3, 0.0, 0.08, 0.08, 0.78, P["wood"], tilt=math.radians(15))
        _tilted(ctx, f"{name}_LegB{k}", gx + dx, gz + 0.3, 0.0, 0.08, 0.08, 0.78, P["wood"], tilt=-math.radians(15))
    ctx.cols.add(name, gx, gz, 0.0, 1.9, 1.5, 0.8)


def _jetty(ctx, name, gx, gz):
    P = ctx.P
    ctx.box(f"{name}_Deck", gx, gz, 0.3, 2.5, 4.0, 0.12, P["wood"], tile=1.0)
    for k, (dx, dz) in enumerate(((-1.1, -1.8), (1.1, -1.8), (-1.1, 1.8), (1.1, 1.8))):
        ctx.cyl(f"{name}_Pile{k}", gx + dx, gz + dz, -0.02, 0.08, 0.6 if dx < 0 else 0.32, P["trunk"], seg=4)
    ctx.box(f"{name}_RailTop", gx - 1.2, gz, 1.3, 0.06, 4.0, 0.06, P["wood"])
    for k, dz in enumerate((-1.9, 0.0, 1.9)):
        ctx.box(f"{name}_RailPost{k}", gx - 1.2, gz + dz, 0.42, 0.06, 0.06, 0.88, P["wood"])
    ctx.cols.add(name, gx, gz, 0.0, 2.5, 4.0, 0.42)


def _duck(ctx, C, name, gx, gz, a):
    body = ctx.add(L.box(ctx.coll, f"{name}_Body", gx, gz, 0.03, 0.25, 0.15, 0.15, C["cream"], rot=a, bevel=0.04))
    head = ctx.add(L.box(ctx.coll, f"{name}_Head", gx + 0.12 * math.cos(a), gz - 0.12 * math.sin(a), 0.16, 0.1, 0.08, 0.1, C["cream"], rot=a, bevel=0.02))
    ctx.add(L.box(ctx.coll, f"{name}_Bill", gx + 0.2 * math.cos(a), gz - 0.2 * math.sin(a), 0.19, 0.06, 0.03, 0.02, C["orange"], rot=a))
    return body, head


def _pergola(ctx, name, x0, x1, gz):
    P = ctx.P
    for k, (gx, dz) in enumerate(((x0 + 0.1, -2.4), (x1 - 0.1, -2.4), (x0 + 0.1, 2.4), (x1 - 0.1, 2.4))):
        ctx.box(f"{name}_Post{k}", gx, gz + dz, 0.0, 0.2, 0.2, 2.6, P["wood"])
        ctx.cols.add(f"{name}_Post{k}", gx, gz + dz, 0.0, 0.3, 0.3, 2.6)
    for k, dz in enumerate((-2.4, 2.4)):
        ctx.box(f"{name}_Beam{k}", (x0 + x1) / 2, gz + dz, 2.6, x1 - x0 + 0.2, 0.15, 0.2, P["wood"])
    for k in range(7):
        ctx.box(f"{name}_Slat{k}", x0 + k * (x1 - x0) / 6, gz, 2.8, 0.1, 5.2, 0.1, P["wood"])
    ctx.blob(f"{name}_Leaf0", x0 + 1.5, gz - 2.4, 2.8, 0.8, P["leaf2"], sy=0.7)
    ctx.blob(f"{name}_Leaf1", x1 - 1.5, gz + 2.4, 2.8, 0.8, P["leaf2"], sy=0.7)


def _drink_fountain(ctx, name, gx, gz):
    P = ctx.P
    ctx.cyl(f"{name}_Post", gx, gz, 0.0, 0.18, 0.9, P["stone"], seg=6)
    ctx.cyl(f"{name}_Bowl", gx, gz, 0.9, 0.25, 0.08, P["stone"], seg=8)
    ctx.cyl(f"{name}_Tap", gx + 0.15, gz, 0.98, 0.02, 0.12, P["rail"], seg=4)
    ctx.cols.add(name, gx, gz, 0.0, 0.6, 0.6, 1.0)


def _statue(ctx, C, name, gx, gz):
    P = ctx.P
    ctx.box(f"{name}_Plinth", gx, gz, 0.0, 1.0, 1.0, 1.0, P["stone"], bevel=0.02)
    ctx.box(f"{name}_Legs", gx, gz, 1.0, 0.45, 0.3, 0.9, C["bronze"])
    ctx.box(f"{name}_Torso", gx, gz, 1.9, 0.5, 0.3, 0.7, C["bronze"])
    ctx.cyl(f"{name}_Head", gx, gz, 2.6, 0.12, 0.25, C["bronze"], seg=6)
    ctx.box(f"{name}_ArmUp", gx + 0.31, gz, 2.3, 0.12, 0.12, 0.6, C["bronze"])
    ctx.box(f"{name}_ArmDown", gx - 0.31, gz, 1.5, 0.12, 0.12, 0.6, C["bronze"])
    ctx.box(f"{name}_Plaque", gx, gz - 0.52, 0.35, 0.5, 0.02, 0.3, P["rail"])
    ctx.cols.add(name, gx, gz, 0.0, 1.0, 1.0, 1.0)


def _ice_cart(ctx, C, name, gx, gz):
    P = ctx.P
    ctx.box(f"{name}_Body", gx, gz, 0.3, 1.4, 0.8, 0.9, C["cream"])
    for k, dz in enumerate((-0.45, 0.45)):
        _lying_cyl(ctx, f"{name}_Wheel{k}", gx - 0.3, gz + dz, 0.3, 0.3, 0.08, P["dark"], 0.0)
    ctx.cyl(f"{name}_Mast", gx, gz, 1.2, 0.03, 1.2, P["steel"], seg=4)
    ctx.cone(f"{name}_Parasol", gx, gz, 2.2, 1.1, 0.05, 0.35, P["pink"], seg=8)
    scoops = (C["pink"], C["cream"], C["grape"], C["yellow"])
    for k in range(4):
        cx = gx - 0.45 + 0.3 * k
        ctx.cone(f"{name}_Cone{k}", cx, gz, 1.2, 0.0, 0.06, 0.14, C["biscuit"], seg=6)
        ctx.cyl(f"{name}_Scoop{k}", cx, gz, 1.34, 0.07, 0.1, scoops[k], seg=6)
    ctx.cols.add(name, gx, gz, 0.0, 1.6, 1.0, 1.0)


def _signpost(ctx, name, gx, gz):
    P = ctx.P
    ctx.cyl(f"{name}_Mast", gx, gz, 0.0, 0.06, 2.4, P["wood"], seg=6)
    for k, (y, yaw) in enumerate(((1.6, 0.0), (1.85, math.pi), (2.1, math.pi / 2), (2.35, -math.pi / 2))):
        fx, fz = _fwd(yaw)
        ctx.box(f"{name}_Arrow{k}", gx + fx * 0.5, gz + fz * 0.5, y, 0.1, 0.9, 0.2, P["band"], rot=yaw)
        _tilted(ctx, f"{name}_Tip{k}", gx + fx * 0.98, gz + fz * 0.98, y + 0.03, 0.1, 0.14, 0.14, P["band"], tilt=math.radians(45), yaw=yaw)
    ctx.cols.add(name, gx, gz, 0.0, 0.3, 0.3, 2.4)


def _park(ctx, C, M):
    P, rnd = ctx.P, ctx.rnd
    px0, px1, pz0, pz1 = M.PARK
    CX, CZ = (px0 + px1) / 2, 0.0
    PX, PZ = CX - 30.0, CZ - 22.0
    keep = []

    def free(gx, gz, r):
        return all(math.hypot(gx - x, gz - z) > r + rr for x, z, rr in keep)

    def reserve(gx, gz, r):
        keep.append((gx, gz, r))

    ctx.rect("Park_Lawn", px0, pz0, px1, pz1, -0.12, 0.1, P["grass"], tile=2.0)
    _annulus(ctx, "Park_Ring", CX, CZ, -0.02, 21.0, 24.0, 0.02, P["path"], seg=36)
    ctx.cyl("Park_Plaza", CX, CZ, -0.02, 12.0, 0.02, P["paving"], seg=28)
    end = 12.0 * math.cos(math.asin(2.0 / 12.0))
    ctx.rect("Park_PathN", CX - 2.0, pz0, CX + 2.0, CZ - end, -0.02, 0.04, P["path"], tile=2.0)
    ctx.rect("Park_PathS", CX - 2.0, CZ + end, CX + 2.0, pz1, -0.02, 0.04, P["path"], tile=2.0)
    ctx.rect("Park_PathW", px0, CZ - 2.0, CX - end, CZ + 2.0, -0.02, 0.04, P["path"], tile=2.0)
    ctx.rect("Park_PathE", CX + end, CZ - 2.0, px1, CZ + 2.0, -0.02, 0.04, P["path"], tile=2.0)
    ctx.rect("Park_PathExitN", -252.0, pz0, -248.0, -11.0, -0.02, 0.04, P["path"], tile=2.0)
    ctx.rect("Park_PathExitS", -252.0, 11.0, -248.0, pz1, -0.02, 0.04, P["path"], tile=2.0)
    for i in range(14):
        gx, gz = rnd.uniform(px0 + 8, px1 - 8), rnd.uniform(pz0 + 8, pz1 - 8)
        r = rnd.uniform(3.0, 6.0)
        d = math.hypot(gx - CX, gz - CZ)
        if d - r < 26.0 or math.hypot(gx - PX, gz - PZ) < 9.0 + r or abs(gx + 250.0) < 2.5 + r:
            continue
        ctx.cyl(f"Park_Patch{i}", gx, gz, -0.02, r, 0.02, P["grass2"], seg=9)
    ctx.box("Park_Clock_Base", CX, CZ, 0.0, 4.4, 4.4, 1.2, P["stone"], bevel=0.04)
    ctx.box("Park_Clock_Shaft", CX, CZ, 1.2, 3.0, 3.0, 11.0, P["brick"], tile=2.0)
    ctx.box("Park_Clock_Head", CX, CZ, 12.2, 3.6, 3.6, 2.6, P["stone"])
    for k, (dx, dz, yaw) in enumerate(((0, 1.82, 0.0), (0, -1.82, math.pi), (1.82, 0, -math.pi / 2), (-1.82, 0, math.pi / 2))):
        face = ctx.cyl(f"Park_Clock_Face{k}", CX + dx, CZ + dz, 13.5, 1.0, 0.05, P["clock"], seg=16)
        face.rotation_euler = (math.pi / 2, 0.0, yaw)
        ctx.box(f"Park_Clock_HandH{k}", CX + dx * 1.08, CZ + dz * 1.08, 13.45, 0.08 if dz else 0.06, 0.06 if dz else 0.08, 0.6, P["dark"])
        ctx.box(f"Park_Clock_HandM{k}", CX + dx * 1.03, CZ + dz * 1.03, 13.5, 0.8 if dz else 0.06, 0.06 if dz else 0.8, 0.06, P["dark"])
    ctx.cone("Park_Clock_Spire", CX, CZ, 14.8, 2.4, 0.05, 3.0, P["band"], seg=4)
    ctx.cols.add("Park_Clock_Tower", CX, CZ, 0.0, 4.4, 4.4, 4.0)
    ctx.cyl("Park_Manhole", CX + 7.0, CZ + 6.0, 0.0, 0.5, 0.02, P["dark"], seg=12)
    ctx.cyl("Park_PondBed", PX, PZ, -0.02, 8.0, 0.02, P["stone"], seg=20)
    ctx.cyl("Park_PondWater", PX, PZ, 0.0, 7.6, 0.03, P["water"], seg=20)
    _annulus(ctx, "Park_PondRim", PX, PZ, 0.0, 7.5, 8.0, 0.3, P["stone"], seg=20)
    for k in range(20):
        a = TWO_PI * (k + 0.5) / 20
        if not (a < 0.3 or a > TWO_PI - 0.3):
            ctx.cols.add(f"Park_PondRim{k}", PX + 7.75 * math.cos(a), PZ + 7.75 * math.sin(a), 0.0, 2.5, 0.6, 0.9, rot=-a + math.pi / 2)
    reserve(PX, PZ, 9.0)
    _jetty(ctx, "Park_Jetty", PX + 8.4, PZ)
    for k, (gx, gz, a) in enumerate(((PX - 2.0, PZ - 3.0, 0.4), (PX + 2.0, PZ + 3.0, 2.5), (PX - 5.0, PZ + 2.0, 4.0))):
        _duck(ctx, C, f"Park_Duck{k}", gx, gz, a)
    for k in range(12):
        a = math.radians(150 + 60 * k / 11)
        ctx.cyl(f"Park_Reed{k}", PX + 7.6 * math.cos(a), PZ + 7.6 * math.sin(a), 0.0, 0.02, 0.9 + 0.2 * (k % 3), C["cactus"], seg=4)
    _gazebo(ctx, C, "Park_Gazebo", -240.0, 22.0)
    reserve(-240.0, 22.0, 5.0)
    for k, (gx, gz) in enumerate(((-304.0, 22.0), (-304.0, 28.0), (-298.0, 22.0), (-298.0, 28.0))):
        _picnic_table(ctx, f"Park_Picnic{k}", gx, gz)
    ctx.box("Park_Barbecue", -300.0, 32.0, -0.02, 0.6, 0.4, 0.92, P["dark"])
    ctx.cols.add("Park_Barbecue", -300.0, 32.0, 0.0, 0.7, 0.5, 0.9)
    reserve(-301.0, 26.0, 7.0)
    _pergola(ctx, "Park_Pergola", -210.0, -204.0, 0.0)
    reserve(-207.0, 0.0, 5.0)
    for k in range(4):
        a = math.radians(45 + 90 * k)
        gx, gz = CX + 14.0 * math.cos(a), CZ + 14.0 * math.sin(a)
        ctx.box(f"Park_Bed{k}", gx, gz, -0.02, 2.4, 1.0, 0.37, P["band"])
        ctx.box(f"Park_Bed{k}_Bloom", gx, gz, 0.35, 2.2, 0.8, 0.12, (P["flower"], P["flower2"])[k % 2], bevel=0.03)
        ctx.cols.add(f"Park_Bed{k}", gx, gz, 0.0, 2.4, 1.0, 0.5)
        reserve(gx, gz, 2.0)
    _drink_fountain(ctx, "Park_DrinkFountain", -266.0, 3.5)
    reserve(-266.0, 3.5, 1.5)
    _statue(ctx, C, "Park_Statue", -266.0, -40.0)
    reserve(-266.0, -40.0, 3.0)
    _ice_cart(ctx, C, "Park_IceCart", -262.0, 8.0)
    reserve(-262.0, 8.0, 3.0)
    _signpost(ctx, "Park_Signpost", -258.0, 2.8)
    reserve(-258.0, 2.8, 1.0)
    for k, gz in enumerate((-30.0, 30.0)):
        ctx.lamp(f"Park_PathLampNS{k}", -253.2, gz, 3.6)
        reserve(-253.2, gz, 1.0)
    for k, (gx, gz) in enumerate(((-296.0, 30.0), (-243.0, 26.0), (-262.0, 10.5))):
        ctx.bin_(f"Park_Bin{k}", gx, gz)
        reserve(gx, gz, 0.8)
    for k in range(18):
        a = TWO_PI * k / 18 + 0.1
        gx, gz = CX + 23.0 * math.cos(a), CZ + 23.0 * math.sin(a)
        if abs(gx - CX) < 3.0 or abs(gz - CZ) < 3.0 or not free(gx, gz, 1.0):
            continue
        if k % 3 == 0:
            ctx.bench(f"Park_Bench{k}", gx, gz, -a + math.pi / 2)
        elif k % 3 == 1:
            ctx.lamp(f"Park_Lamp{k}", gx, gz, 3.6)
        else:
            ctx.bin_(f"Park_RingBin{k}", gx, gz)
        reserve(gx, gz, 1.0)
    for k in range(44):
        gx, gz = rnd.uniform(px0 + 4, px1 - 4), rnd.uniform(pz0 + 4, pz1 - 4)
        d = math.hypot(gx - CX, gz - CZ)
        if abs(gx - CX) < 4.0 or abs(gz - CZ) < 4.0 or abs(gx + 250.0) < 4.0 or 19.0 < d < 26.0 or d < 13.0 or not free(gx, gz, 1.5):
            continue
        ctx.tree(rnd.choice(("round", "round", "pine", "blossom")), gx, gz, rnd.uniform(0.9, 1.3))
        reserve(gx, gz, 1.5)
    for k in range(10):
        gx, gz = rnd.uniform(px0 + 6, px1 - 6), rnd.uniform(pz0 + 6, pz1 - 6)
        if abs(gx - CX) < 4.0 or abs(gz - CZ) < 4.0 or abs(gx + 250.0) < 4.0 or math.hypot(gx - CX, gz - CZ) < 14.0 or not free(gx, gz, 1.5):
            continue
        for j in range(8):
            ctx.cyl(f"Park_Flower{k}_{j}", gx + rnd.uniform(-1.0, 1.0), gz + rnd.uniform(-1.0, 1.0), -0.02, 0.12, rnd.uniform(0.27, 0.47),
                    rnd.choice((P["flower"], P["flower2"], P["pink"])), seg=5)
        reserve(gx, gz, 1.5)
    for k, (gx, gz) in enumerate(((CX + 1.3, pz0 + 6.0), (CX + 4.3, pz1 - 6.0), (px0 + 6.0, CZ - 3.0), (px1 - 6.0, CZ + 3.0))):
        if free(gx, gz, 0.5):
            ctx.lamp(f"Park_PathLamp{k}", gx, gz, 3.6)


# ---------------------------------------------------------------- entry point
def build(ctx, M):
    """Pose tout le décor hors cellules : plazas, allées, parc. Imprime les triangles par section et les refus."""
    SKIPPED.clear()
    TRIS.clear()
    C = _palette(ctx)
    for label, fn in (("entrance", _entrance), ("paradise", _paradise), ("north_plaza", _north), ("wonderland", _wonderland),
                      ("food_court", _food_court), ("al_fresca", _al_fresca)):
        n0 = len(ctx.objs)
        fn(ctx, C, M)
        TRIS[label] = _tris(ctx.objs[n0:])
    n0 = len(ctx.objs)
    _banners(ctx, M)
    _cornices(ctx, M)
    TRIS["banners_cornices"] = _tris(ctx.objs[n0:])
    n0 = len(ctx.objs)
    _park(ctx, C, M)
    TRIS["leisure_park"] = _tris(ctx.objs[n0:])
    for label, t in TRIS.items():
        print(f"decor tris {label}: {t}")
    print(f"decor tris total: {sum(TRIS.values())}  skipped: {len(SKIPPED)}")
    return TRIS
