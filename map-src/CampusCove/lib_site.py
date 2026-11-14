"""Shared outdoor site builders (roads, walls, gates, street furniture, planting) for open-world districts.

Every builder takes a `Site` (collection + object list + collision list) and game-space coordinates (x, z, y up,
north = -Z). Pieces stay separate named objects so a later district reuses them instead of copying geometry
(CLAUDE.md "Modular assets"). First user: build_cove_heights_site.py (docs/GATED_COMMUNITY.md § 12).
"""
import math
import random

import bmesh
import bpy

import lib_common as L

TWO_PI = 2 * math.pi


class Site:
    """Collects the objects of one exported model and its COL_ boxes (orchard-style layout `collision` list)."""

    def __init__(self, coll, col_prefix, seed=1):
        self.coll = coll
        self.objs = []
        self.cols = []
        self.col_prefix = col_prefix
        self.rnd = random.Random(seed)

    def add(self, o):
        self.objs.append(o)
        return o

    def col(self, name, gx, gz, sx, sz, h, yaw=0.0, y0=0.0):
        self.cols.append({"name": f"COL_{self.col_prefix}_{name}", "cx": round(gx, 3), "cz": round(gz, 3), "hx": round(sx / 2, 3),
                          "hz": round(sz / 2, 3), "hy": round(h / 2, 3), "cy": round(y0 + h / 2, 3), "yaw": round(yaw, 4)})

    def tris(self):
        return sum(len(p.vertices) - 2 for o in self.objs if o.type == "MESH" for p in o.data.polygons)


def seg_yaw(ax, az, bx, bz):
    """Blender yaw that lays a box's local x along the game segment a -> b (same value as the collision yaw)."""
    return math.atan2(-(bz - az), bx - ax)


# ---------------------------------------------------------------- flat surfaces
def rect(s, name, x0, z0, x1, z1, y0, y1, mat, tile=2.0):
    """Axis-aligned slab between two corners, from y0 to y1."""
    x0, x1 = min(x0, x1), max(x0, x1)
    z0, z1 = min(z0, z1), max(z0, z1)
    return s.add(L.box(s.coll, name, (x0 + x1) / 2, (z0 + z1) / 2, y0, x1 - x0, z1 - z0, y1 - y0, mat, tile=tile))


def strip(s, name, ax, az, bx, bz, off0, off1, y0, y1, mat, tile=2.0):
    """Slab along the segment a -> b between lateral offsets off0 < off1 (positive = left of the travel direction)."""
    ln = math.hypot(bx - ax, bz - az)
    ux, uz = (bx - ax) / ln, (bz - az) / ln
    nx, nz = uz, -ux  # left of travel in game space (x right, -z north)
    mid = (off0 + off1) / 2
    cx, cz = (ax + bx) / 2 + nx * mid, (az + bz) / 2 + nz * mid
    return s.add(L.box(s.coll, name, cx, cz, y0, ln, off1 - off0, y1 - y0, mat, rot=seg_yaw(ax, az, bx, bz), tile=tile))


def arc_band(s, name, cx, cz, r0, r1, a0, a1, y0, y1, mat, step=0.6, tile=2.0):
    """Solid annular sector: radii r0 < r1 around (cx, cz), game angles a0 -> a1 (point = c + r (cos a, sin a))."""
    n = max(2, int(abs(a1 - a0) * r1 / step) + 1)
    bm = bmesh.new()
    rings = []
    for i in range(n + 1):
        a = a0 + (a1 - a0) * i / n
        ca, sa = math.cos(a), math.sin(a)
        rings.append([bm.verts.new(L.b(cx + r * ca, cz + r * sa, y)) for r, y in ((r0, y1), (r1, y1), (r1, y0), (r0, y0))])
    for i in range(n):
        p, q = rings[i], rings[i + 1]
        for k in range(4):
            bm.faces.new((p[k], p[(k + 1) % 4], q[(k + 1) % 4], q[k]))
    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return s.add(_mesh(s, name, bm, mat, tile))


def disc(s, name, cx, cz, r, y0, y1, mat, seg=24, tile=2.0):
    return s.add(L.cyl(s.coll, name, cx, cz, y0, r, y1 - y0, mat, seg=seg, tile=tile))


def _mesh(s, name, bm, mat, tile):
    bm.normal_update()
    L._box_uv(bm, tile)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    s.coll.objects.link(ob)
    return ob


# ---------------------------------------------------------------- roads
# A section is a list of bands (off0, off1, y_top, material key) across the centreline; offsets are symmetric
# halves listed for the left side only and mirrored, the carriageway (centred) comes first.
def road_section(carriage, curb, verge, walk, y):
    """Cross-section bands for a two-way street. y: dict of tops (asphalt, curb, verge, walk)."""
    h = carriage / 2
    bands = [("asphalt", -h, h, y["asphalt"])]
    o = h
    for key, w in (("curb", curb), ("verge", verge), ("walk", walk)):
        if w <= 0:
            continue
        bands.append((key, o, o + w, y[key]))
        bands.append((key, -o - w, -o, y[key]))
        o += w
    return bands, o


def road_straight(s, name, a, b, section, mats, skip=()):
    """Every band of `section` along a -> b. skip: band keys to leave out (e.g. a junction side)."""
    bands, _ = section
    for i, (key, o0, o1, top) in enumerate(bands):
        if (key, "L" if o0 >= 0 else "R") in skip or key in skip:
            continue
        strip(s, f"{name}_{key}{i}", a[0], a[1], b[0], b[1], o0, o1, 0.0, top, mats[key])


def road_arc(s, name, cx, cz, rc, a0, a1, section, mats):
    """Every band of `section` around a fillet of centreline radius rc. Positive offsets go outward."""
    bands, _ = section
    for i, (key, o0, o1, top) in enumerate(bands):
        arc_band(s, f"{name}_{key}{i}", cx, cz, rc + o0, rc + o1, a0, a1, 0.0, top, mats[key])


def dashed_line(s, name, a, b, w, y0, y1, mat, dash=3.0, gap=3.0):
    ln = math.hypot(b[0] - a[0], b[1] - a[1])
    ux, uz = (b[0] - a[0]) / ln, (b[1] - a[1]) / ln
    t, k = gap / 2, 0
    while t + dash <= ln:
        m = t + dash / 2
        s.add(L.box(s.coll, f"{name}_{k:02d}", a[0] + ux * m, a[1] + uz * m, y0, dash, w, y1 - y0, mat, rot=seg_yaw(*a, *b)))
        t += dash + gap
        k += 1


# ---------------------------------------------------------------- walls and gates
def wall_run(s, name, a, b, M, H=2.6, T=0.30, col=True):
    """Plastered wall on a stone plinth with a coping, between two points (stops at pier/pilaster faces)."""
    ln = math.hypot(b[0] - a[0], b[1] - a[1])
    if ln < 0.02:
        return
    yaw = seg_yaw(*a, *b)
    cx, cz = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
    s.add(L.box(s.coll, f"{name}_Plinth", cx, cz, 0.0, ln, T + 0.06, 0.30, M["stone"], rot=yaw, tile=2.0))
    s.add(L.box(s.coll, f"{name}_Wall", cx, cz, 0.30, ln, T, H - 0.30, M["plaster"], rot=yaw, tile=2.0))
    s.add(L.box(s.coll, f"{name}_Coping", cx, cz, H, ln, T + 0.06, 0.10, M["coping"], rot=yaw, tile=2.0))
    if col:
        s.col(name, cx, cz, ln, T + 0.06, H + 0.1, yaw)


def pilaster(s, name, gx, gz, M, w=0.40, h=2.80):
    s.add(L.box(s.coll, f"{name}", gx, gz, 0.0, w, w, h, M["stone"], tile=1.0))
    s.add(L.box(s.coll, f"{name}_Cap", gx, gz, h, w + 0.10, w + 0.10, 0.08, M["coping"], bevel=0.02))


def gate_pier(s, name, gx, gz, M, w=0.56, h=3.20, col=True):
    s.add(L.box(s.coll, name, gx, gz, 0.0, w, w, h, M["stone"], tile=1.0))
    s.add(L.box(s.coll, f"{name}_Cap", gx, gz, h, w + 0.10, w + 0.10, 0.10, M["coping"], bevel=0.02))
    s.add(L.cone(s.coll, f"{name}_Finial", gx, gz, h + 0.10, 0.16, 0.02, 0.35, M["iron"], seg=8))
    if col:
        s.col(name, gx, gz, w, w, h + 0.1)


def iron_leaf(s, name, hinge, direction, width, M, h=2.0, y0=0.06, bar_step=0.14):
    """Bar gate leaf from its hinge along a game direction (unit vector). Built open or closed by the caller's direction."""
    dx, dz = direction
    end = (hinge[0] + dx * width, hinge[1] + dz * width)
    yaw = seg_yaw(*hinge, *end)
    mid = ((hinge[0] + end[0]) / 2, (hinge[1] + end[1]) / 2)
    for k, y in enumerate((y0, y0 + h - 0.06)):
        s.add(L.box(s.coll, f"{name}_Rail{k}", mid[0], mid[1], y, width, 0.06, 0.06, M["iron"], rot=yaw))
    n = max(2, int(width / bar_step))
    for k in range(n + 1):
        t = k / n
        s.add(L.box(s.coll, f"{name}_Bar{k:02d}", hinge[0] + dx * width * t, hinge[1] + dz * width * t, y0, 0.03, 0.03, h, M["iron"], rot=yaw))
    return end


def swing_gate(s, name, x0, x1, gz, M, h=2.2, locked=True):
    """Pair of closed leaves across x0 -> x1 on the line z = gz, padlock on the meeting stiles."""
    mid = (x0 + x1) / 2
    iron_leaf(s, f"{name}_LeafW", (x0, gz), (1.0, 0.0), mid - 0.01 - x0, M, h=h)
    iron_leaf(s, f"{name}_LeafE", (x1, gz), (-1.0, 0.0), x1 - mid - 0.01, M, h=h)
    s.add(L.box(s.coll, f"{name}_Padlock", mid, gz + 0.06, 1.0, 0.10, 0.05, 0.12, M["brass"], bevel=0.01))
    if locked:
        s.col(name, mid, gz, x1 - x0, 0.3, h + 0.06)


def boom_barrier(s, name, gx, gz, arm_len, M, direction=1.0):
    """Post + striped arm, modelled raised (open). direction: +1 the arm would close toward +x, -1 toward -x."""
    s.add(L.box(s.coll, f"{name}_Post", gx, gz, 0.0, 0.25, 0.25, 1.10, M["iron"], bevel=0.02))
    s.add(L.box(s.coll, f"{name}_Head", gx, gz, 0.85, 0.32, 0.32, 0.30, M["boom_head"], bevel=0.03))
    s.add(L.box(s.coll, f"{name}_Arm", gx + direction * 0.12, gz, 1.0, 0.10, 0.10, arm_len, M["boom"]))


def rail(s, name, a, b, M, h=1.0, col=True):
    """Low iron rail with posts every ~1.5 m."""
    ln = math.hypot(b[0] - a[0], b[1] - a[1])
    yaw = seg_yaw(*a, *b)
    n = max(1, round(ln / 1.5))
    for k in range(n + 1):
        t = k / n
        s.add(L.box(s.coll, f"{name}_Post{k:02d}", a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0.12, 0.06, 0.06, h - 0.12, M["iron"]))
    s.add(L.box(s.coll, f"{name}_Top", (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, h - 0.05, ln, 0.06, 0.05, M["iron"], rot=yaw))
    if col:
        s.col(name, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, ln, 0.25, h + 0.1, yaw)


# ---------------------------------------------------------------- buildings
def pavilion_shell(s, name, cx, cz, w, d, M, y_floor=0.0, wall_h=2.8, t=0.20, ridge="x", roof_h=1.0, windows=None, door=None,
                   col=True):
    """Closed walled pavilion (gatehouse, clubhouse): floor slab, four walls with openings (L.wall), glass, roof slab,
    gable roof. windows: {"S"|"N"|"E"|"W": [(a, b, sill, head)]} in absolute x (S/N) or z (E/W); door: (face, a, b, h)."""
    windows = windows or {}
    x0, x1, z0, z1 = cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2
    s.add(L.box(s.coll, f"{name}_Floor", cx, cz, 0.0, w, d, y_floor + 0.10, M["floor"]))
    yb = y_floor + 0.10
    faces = {"S": ("x", z1 - t / 2, x0, x1), "N": ("x", z0 + t / 2, x0, x1), "E": ("z", x1 - t / 2, z0 + t, z1 - t), "W": ("z", x0 + t / 2, z0 + t, z1 - t)}
    for f, (axis, fixed, a0, a1) in faces.items():
        ops = [(a, b, sill, head) for a, b, sill, head in windows.get(f, ())]
        if door and door[0] == f:
            ops.append((door[1], door[2], 0.0, door[3]))
        for o in L.wall(s.coll, f"{name}_Wall{f}", axis, fixed, t, a0, a1, wall_h, M["plaster"], openings=ops, glass=M["glass"]):
            o.location.z += yb
            s.add(o)
        if door and door[0] == f:
            dm = (door[1] + door[2]) / 2
            leaf_w, off = door[2] - door[1], (0.06 if f == "S" else -0.06)
            if axis == "x":
                s.add(L.box(s.coll, f"{name}_Door", dm, fixed + off * 0.0, yb, leaf_w, 0.06, door[3], M["door"]))
    top = yb + wall_h
    s.add(L.box(s.coll, f"{name}_RoofSlab", cx, cz, top, w + 0.4, d + 0.4, 0.20, M["trim"]))
    s.add(L.gable_roof(s.coll, f"{name}_Roof", cx, cz, top + 0.20, w + 0.6, d + 0.6, roof_h, M["roof"], ridge_axis=ridge))
    if col:
        s.col(name, cx, cz, w, d, top + 0.2)


# ---------------------------------------------------------------- street furniture
def street_lamp(s, name, gx, gz, M, h=4.0, col=True):
    s.add(L.box(s.coll, f"{name}_Base", gx, gz, 0.0, 0.34, 0.34, 0.30, M["iron"], bevel=0.03))
    s.add(L.cyl(s.coll, f"{name}_Pole", gx, gz, 0.30, 0.06, h - 0.75, M["iron"], seg=8))
    s.add(L.cone(s.coll, f"{name}_Neck", gx, gz, h - 0.45, 0.06, 0.16, 0.10, M["iron"], seg=8))
    s.add(L.box(s.coll, f"{name}_Lantern", gx, gz, h - 0.35, 0.30, 0.30, 0.40, M["lamp"], bevel=0.03))
    s.add(L.cone(s.coll, f"{name}_Hat", gx, gz, h + 0.05, 0.26, 0.04, 0.22, M["iron"], seg=8))
    if col:
        s.col(name, gx, gz, 0.35, 0.35, 2.0)


def bus_shelter(s, name, gx, gz, rot, label, M, w=4.0, d=1.5, h=2.4, col=True):
    """Glass bus shelter, open on its front (furn convention: rot 0 opens toward game -Z, pi toward +Z): four posts,
    roof with a name fascia, glass back and sides, a bench along the back and a timetable board. M: frame, glass,
    wood, sign, sign_text. rot is a multiple of pi/2 (the collision boxes stay axis-aligned with it)."""
    hw, hd = w / 2, d / 2
    s.add(L.furn(s.coll, f"{name}_Frame", gx, gz, rot, [
        *[(px, pz, 0.0, 0.08, 0.08, h, M["frame"]) for px in (-hw + 0.04, hw - 0.04) for pz in (-hd + 0.04, hd - 0.04)],
        (0, 0, h, w + 0.3, d + 0.3, 0.1, M["frame"], 0.02), (0, -hd - 0.12, h - 0.22, w + 0.3, 0.06, 0.22, M["sign"]),
        (-0.6, hd - 0.35, 0.0, 0.05, 0.4, 0.45, M["frame"]), (0.6, hd - 0.35, 0.0, 0.05, 0.4, 0.45, M["frame"]),
        (hw - 0.3, hd - 0.12, 0.9, 0.5, 0.04, 0.8, M["sign"])]))
    s.add(L.furn(s.coll, f"{name}_Glass", gx, gz, rot, [
        (0, hd - 0.04, 0.3, w - 0.16, 0.02, h - 0.5, M["glass"]),
        (-hw + 0.04, 0.05, 0.3, 0.02, d - 0.26, h - 0.5, M["glass"]), (hw - 0.04, 0.05, 0.3, 0.02, d - 0.26, h - 0.5, M["glass"])]))
    c, sn = math.cos(rot), math.sin(rot)

    def at(lx, lz):
        return gx + lx * c + lz * sn, gz - lx * sn + lz * c

    s.add(L.furn(s.coll, f"{name}_Seat", *at(0.0, hd - 0.35), rot, [(0, 0, 0.45, w * 0.6, 0.4, 0.05, M["wood"], 0.01)]))
    fx, fz = at(0.0, -hd - 0.155)
    t = L.text_mesh(s.coll, f"{name}_Label", label, fx, fz, h - 0.2, 0.14, 0.005, M["sign_text"], resolution=2)
    t.rotation_euler = (math.pi / 2, 0, rot + math.pi)
    s.add(t)
    if col:
        sx_, sz_ = (w, 0.2) if abs(sn) < 0.5 else (0.2, w)
        s.col(f"{name}_Back", *at(0.0, hd - 0.04), sx_, sz_, h)
        for side, lx in (("W", -hw + 0.04), ("E", hw - 0.04)):
            ax, az = (0.2, d) if abs(sn) < 0.5 else (d, 0.2)
            s.col(f"{name}_Side{side}", *at(lx, 0.0), ax, az, h)
        bx, bz = (w * 0.6, 0.45) if abs(sn) < 0.5 else (0.45, w * 0.6)
        s.col(f"{name}_Seat", *at(0.0, hd - 0.35), bx, bz, 0.5)


def bench(s, name, gx, gz, rot, M, col=True):
    s.add(L.furn(s.coll, name, gx, gz, rot, [(-0.7, 0, 0.0, 0.08, 0.42, 0.42, M["iron"]), (0.7, 0, 0.0, 0.08, 0.42, 0.42, M["iron"]),
                                              (0, 0, 0.42, 1.6, 0.44, 0.06, M["wood"], 0.01), (0, 0.2, 0.48, 1.6, 0.06, 0.42, M["wood"], 0.01)]))
    if col:
        s.col(name, gx, gz, 1.7 if abs(math.sin(rot)) < 0.5 else 0.5, 0.5 if abs(math.sin(rot)) < 0.5 else 1.7, 0.9)


def postbox(s, name, gx, gz, rot, label, M, col=True):
    s.add(L.furn(s.coll, name, gx, gz, rot, [(0, 0, 0.0, 0.08, 0.08, 1.0, M["iron"]), (0, 0, 1.0, 0.40, 0.25, 0.30, M["postbox"], 0.03)]))
    t = L.text_mesh(s.coll, f"{name}_Label", label, gx, gz, 1.07, 0.11, 0.01, M["gold"], resolution=2)
    # the label sits on the face that looks along `rot` (furn convention: rot 0 faces -Z)
    fx, fz = -math.sin(rot), -math.cos(rot)
    t.location = L.b(gx + fx * 0.135, gz + fz * 0.135, 1.07)
    t.rotation_euler = (math.pi / 2, 0, rot + math.pi)
    s.add(t)
    if col:
        s.col(name, gx, gz, 0.45, 0.45, 1.2)


def monument_sign(s, name, gx, gz, rot, text, M, w=3.2, d=0.7, h=1.8, col=True):
    s.add(L.box(s.coll, f"{name}_Plinth", gx, gz, 0.0, w, d, 0.25, M["stone"], rot=rot, bevel=0.03))
    s.add(L.box(s.coll, f"{name}_Body", gx, gz, 0.25, w - 0.2, d - 0.15, h - 0.35, M["plaster"], rot=rot))
    s.add(L.box(s.coll, f"{name}_Cap", gx, gz, h - 0.10, w, d, 0.10, M["coping"], rot=rot))
    fx, fz = -math.sin(rot), -math.cos(rot)
    t = L.text_mesh(s.coll, f"{name}_Text", text, gx, gz, 0.75, 0.34, 0.02, M["gold"], resolution=2)
    t.location = L.b(gx + fx * ((d - 0.15) / 2 + 0.005), gz + fz * ((d - 0.15) / 2 + 0.005), 0.75)
    t.rotation_euler = (math.pi / 2, 0, rot + math.pi)
    s.add(t)
    if col:
        s.col(name, gx, gz, w if abs(math.sin(rot)) < 0.5 else d, d if abs(math.sin(rot)) < 0.5 else w, h)


def signpost(s, name, gx, gz, arrows, M, col=True):
    """arrows: [(label, game yaw it points to)] stacked from the top."""
    s.add(L.box(s.coll, f"{name}_Post", gx, gz, 0.0, 0.12, 0.12, 2.6, M["iron"]))
    for k, (label, yaw) in enumerate(arrows):
        y = 2.3 - k * 0.42
        dx, dz = -math.sin(yaw), -math.cos(yaw)
        cx, cz = gx + dx * 0.75, gz + dz * 0.75
        rot = seg_yaw(gx, gz, gx + dx, gz + dz)
        s.add(L.box(s.coll, f"{name}_Board{k}", cx, cz, y, 1.4, 0.05, 0.32, M["sign"], rot=rot))
        for side, flip in ((1, 0.0), (-1, math.pi)):
            t = L.text_mesh(s.coll, f"{name}_Text{k}{'ab'[side < 0]}", label, cx, cz, y + 0.08, 0.16, 0.005, M["sign_text"], resolution=2)
            nx, nz = -dz * side, dx * side  # the board face this text reads from
            t.location = L.b(cx + nx * 0.03, cz + nz * 0.03, y + 0.08)
            t.rotation_euler = (math.pi / 2, 0, rot + flip)
            s.add(t)
    if col:
        s.col(name, gx, gz, 0.3, 0.3, 2.0)


def fountain(s, name, gx, gz, r, M, col=True):
    s.add(L.cyl(s.coll, f"{name}_Rim", gx, gz, 0.0, r, 0.58, M["stone"], seg=24))
    s.add(L.cyl(s.coll, f"{name}_Water", gx, gz, 0.0, r - 0.25, 0.53 + 0.0, M["water"], seg=24)).location.z = 0.02
    s.add(L.cyl(s.coll, f"{name}_Column", gx, gz, 0.58, 0.28, 0.9, M["stone"], seg=10))
    s.add(L.cone(s.coll, f"{name}_Bowl", gx, gz, 1.48, 0.25, 1.0, 0.35, M["stone"], seg=14))
    s.add(L.cyl(s.coll, f"{name}_BowlWater", gx, gz, 1.80, 0.92, 0.04, M["water"], seg=14))
    s.add(L.cone(s.coll, f"{name}_Spout", gx, gz, 1.84, 0.10, 0.02, 0.45, M["stone"], seg=8))
    if col:
        s.col(name, gx, gz, 2 * r + 0.2, 2 * r + 0.2, 1.0)


# ---------------------------------------------------------------- planting
def _blob(s, name, gx, gz, y0, r, mat, sy=1.0, jitter=0.12):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r)
    for v in bm.verts:
        v.co.x += s.rnd.uniform(-jitter, jitter) * r
        v.co.y += s.rnd.uniform(-jitter, jitter) * r
        v.co.z = (v.co.z + s.rnd.uniform(-jitter, jitter) * r) * sy
    zmin = min(v.co.z for v in bm.verts)
    for v in bm.verts:
        v.co.z -= zmin
    ob = _mesh(s, name, bm, mat, 1.0)
    ob.location = L.b(gx, gz, y0)
    return s.add(ob)


def tree(s, name, gx, gz, M, kind="round", scale=1.0, col=True):
    """'round' broadleaf (olive-like) or 'cypress' (tall Mediterranean column)."""
    k = scale
    if kind == "cypress":
        s.add(L.cone(s.coll, f"{name}_Trunk", gx, gz, 0.0, 0.14 * k, 0.10 * k, 0.9 * k, M["trunk"], seg=6))
        s.add(L.cone(s.coll, f"{name}_Crown", gx, gz, 0.5 * k, 0.75 * k, 0.12 * k, 6.0 * k, M["leaf_dark"], seg=8))
    else:
        s.add(L.cone(s.coll, f"{name}_Trunk", gx, gz, 0.0, 0.22 * k, 0.14 * k, 2.2 * k, M["trunk"], seg=6))
        for j in range(3):
            a = TWO_PI * j / 3 + s.rnd.uniform(-0.4, 0.4)
            _blob(s, f"{name}_Leaf{j}", gx + 0.6 * k * math.cos(a), gz + 0.6 * k * math.sin(a), (1.8 + 0.3 * (j % 2)) * k,
                  s.rnd.uniform(1.1, 1.4) * k, M[("leaf", "leaf_light", "leaf")[j]], sy=0.8)
    if col:
        s.col(name, gx, gz, 0.5 * k, 0.5 * k, 3.0)


def hedge_run(s, name, a, b, M, w=0.5, h=0.40, y0=0.02, mat="hedge_low"):
    """Clipped hedge between two points. Low hedges (h <= 0.45, Hedge material) are walk-over decor: no COL."""
    ln = math.hypot(b[0] - a[0], b[1] - a[1])
    s.add(L.box(s.coll, name, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, y0, ln, w, h, M[mat], rot=seg_yaw(*a, *b), bevel=0.06, tile=1.0))
    if h > 0.45:
        s.col(name, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, ln, w, h + y0, seg_yaw(*a, *b))


def hydrangeas(s, name, x0, x1, z, M, n=6):
    """Hydrangea shrubs along a bed: a green leafy mound crowned with white flower heads (soft decor, walk-through)."""
    for k in range(n):
        x = x0 + (x1 - x0) * (k + 0.5) / n + s.rnd.uniform(-0.15, 0.15)
        zz = z + s.rnd.uniform(-0.15, 0.15)
        _blob(s, f"{name}_{k}_Leaf", x, zz, 0.02, 0.5, M["boxwood"], sy=0.7, jitter=0.1)
        for j in range(4):
            a = TWO_PI * j / 4 + s.rnd.uniform(-0.4, 0.4)
            r = 0.28 if j else 0.0
            _blob(s, f"{name}_{k}_Flower{j}", x + r * math.cos(a), zz + r * math.sin(a), 0.42 + (0.1 if j == 0 else 0.0),
                  s.rnd.uniform(0.17, 0.22), M["hydrangea"], jitter=0.15)


def check_disjoint(rects, allowed=()):
    """rects: {name: (x0, z0, x1, z1)}. Returns overlapping pairs (area > 1e-6) that are not in `allowed`."""
    names = sorted(rects)
    bad = []
    for i, p in enumerate(names):
        for q in names[i + 1:]:
            if (p, q) in allowed or (q, p) in allowed:
                continue
            a, c = rects[p], rects[q]
            ox = min(a[2], c[2]) - max(a[0], c[0])
            oz = min(a[3], c[3]) - max(a[1], c[1])
            if ox > 1e-6 and oz > 1e-6:
                bad.append((p, q, round(ox, 3), round(oz, 3)))
    return bad
