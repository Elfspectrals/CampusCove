"""House kit: parameterised builders for detached houses (walls, windows, doors, garage doors, roofs, gables, porch,
trims, chimney, lanterns) and the compositions that assemble them (`colonial_villa`).

Every builder works in a house-local frame (x across the facade, z = 0 on the front wall, the front looks +Z, y up) and
adds separate named objects to a lib_site.Site; `place()` then moves the whole house onto its lot. CLAUDE.md "Modular
assets": the next house reuses these builders with other sizes and materials instead of copying geometry.
"""
import math

import bmesh
import bpy

import lib_common as L
import lib_site as S


# ---------------------------------------------------------------- wall-plane helper
class Face:
    """A wall plane: axis 'x' (wall along x at z = fixed) or 'z' (along z at x = fixed); out = +1/-1 outward normal
    sign along the other axis; t = wall thickness."""

    def __init__(self, axis, fixed, out, t):
        self.axis, self.fixed, self.out, self.t = axis, fixed, out, t

    def box(self, s, name, a_c, y0, length, h, depth, off, mat, bevel=0.0):
        """Box centred at a_c along the wall, depth across it, its centre `off` metres outward from the wall centre."""
        d = self.fixed + self.out * off
        if self.axis == "x":
            return s.add(L.box(s.coll, name, a_c, d, y0, length, depth, h, mat, bevel=bevel))
        return s.add(L.box(s.coll, name, d, a_c, y0, depth, length, h, mat, bevel=bevel))

    def proud(self, extra):
        """Offset of a piece standing `extra` metres proud of the outer face."""
        return self.t / 2 + extra


def siding_wall(s, name, face, a0, a1, y0, h, M, openings=()):
    """Clapboard wall from y0 to y0 + h with holes [(a, b, y_bottom, y_top)] in absolute y; the holes are filled by
    window()/door()/garage_door()."""
    ops = [(a, b, yb - y0, yt - y0) for a, b, yb, yt in openings]
    for o in L.wall(s.coll, name, face.axis, face.fixed, face.t, a0, a1, h, M["siding"], openings=ops):
        o.location.z += y0
        s.add(o)


def base_band(s, name, face, a0, a1, M, h=0.55):
    """Painted-brick water table along the foot of a wall, 3 cm proud."""
    face.box(s, name, (a0 + a1) / 2, 0.0, a1 - a0 + 0.06, h, 0.06, face.proud(0.03) - 0.03, M["brick"])


def window(s, name, face, a, b, y0, y1, M, cols=2, rows=2, shutters=True):
    w, h = b - a, y1 - y0
    ac = (a + b) / 2
    face.box(s, f"{name}_Glass", ac, y0, w, h, 0.04, face.out * 0 + 0.02, M["glass"])
    cw = 0.12
    for k, (c, yy, ln, hh) in enumerate(((ac, y1, w + 2 * cw, cw), (a - cw / 2, y0, cw, h), (b + cw / 2, y0, cw, h))):
        face.box(s, f"{name}_Casing{k}", c, yy, ln, hh, 0.06, face.proud(0.03), M["trim"])
    face.box(s, f"{name}_Sill", ac, y0 - 0.08, w + 0.3, 0.08, 0.14, face.proud(0.07), M["trim"])
    for i in range(1, cols):
        face.box(s, f"{name}_MuntinV{i}", a + w * i / cols, y0, 0.04, h, 0.03, 0.06, M["trim"])
    for j in range(1, rows):
        face.box(s, f"{name}_MuntinH{j}", ac, y0 + h * j / rows - 0.02, w, 0.04, 0.03, 0.06, M["trim"])
    if shutters:
        sw = min(0.55, w / 2 + 0.05)
        for k, c in enumerate((a - cw - 0.04 - sw / 2, b + cw + 0.04 + sw / 2)):
            face.box(s, f"{name}_Shutter{k}", c, y0 - 0.02, sw, h + 0.04, 0.04, face.proud(0.03), M["shutter"])


def door(s, name, face, a, b, h, M, double=True, transom=True):
    """Front door: dark leaves with glazed upper panels, brass handles, casing and a crown moulding."""
    w = b - a
    leaves = ((a, (a + b) / 2), ((a + b) / 2, b)) if double else ((a, b),)
    for k, (la, lb) in enumerate(leaves):
        lc, lw = (la + lb) / 2, lb - la - 0.02
        face.box(s, f"{name}_Leaf{k}", lc, 0.0, lw, h, 0.06, 0.0, M["door"])
        face.box(s, f"{name}_Lite{k}", lc, h * 0.55, lw * 0.6, h * 0.35, 0.02, 0.04, M["glass"])
        face.box(s, f"{name}_Panel{k}", lc, h * 0.12, lw * 0.6, h * 0.3, 0.02, 0.04, M["door_panel"])
        hx = lb - 0.1 if k == 0 and double else la + 0.1
        face.box(s, f"{name}_Handle{k}", hx, h * 0.45, 0.04, 0.18, 0.04, 0.06, M["brass"])
    cw = 0.16
    for k, (c, yy, ln, hh) in enumerate(((a - cw / 2, 0.0, cw, h), (b + cw / 2, 0.0, cw, h))):
        face.box(s, f"{name}_Casing{k}", c, yy, ln, hh, 0.07, face.proud(0.035), M["trim"])
    top = h
    if transom:
        face.box(s, f"{name}_Transom", (a + b) / 2, h, w, 0.4, 0.04, 0.02, M["glass"])
        face.box(s, f"{name}_TransomBar", (a + b) / 2, h - 0.02, w, 0.06, 0.06, 0.04, M["trim"])
        top = h + 0.4
    face.box(s, f"{name}_Head", (a + b) / 2, top, w + 2 * cw, 0.14, 0.08, face.proud(0.04), M["trim"])
    face.box(s, f"{name}_Crown", (a + b) / 2, top + 0.14, w + 2 * cw + 0.2, 0.08, 0.16, face.proud(0.08), M["trim"])


def garage_door(s, name, face, a, b, h, M, rows=4, lites=4):
    """Carriage-style sectional door: recessed sections, a row of dark lites on top, casing."""
    w = b - a
    ac = (a + b) / 2
    face.box(s, f"{name}_Slab", ac, 0.0, w, h, 0.06, 0.0, M["garage"])
    sec = h / rows
    for r in range(rows):
        for c in range(lites):
            cx = a + w * (c + 0.5) / lites
            pw = w / lites - 0.18
            if r == rows - 1:
                face.box(s, f"{name}_Lite{r}{c}", cx, r * sec + 0.12, pw, sec - 0.24, 0.02, 0.035, M["glass"])
            else:
                face.box(s, f"{name}_Panel{r}{c}", cx, r * sec + 0.1, pw, sec - 0.2, 0.02, 0.035, M["garage_panel"])
    cw = 0.18
    for k, (c, yy, ln, hh) in enumerate(((ac, h, w + 2 * cw, cw), (a - cw / 2, 0.0, cw, h), (b + cw / 2, 0.0, cw, h))):
        face.box(s, f"{name}_Casing{k}", c, yy, ln, hh, 0.07, face.proud(0.035), M["trim"])


def wall_lantern(s, name, face, a, y, M):
    face.box(s, f"{name}_Plate", a, y, 0.16, 0.3, 0.03, face.proud(0.015), M["iron"])
    face.box(s, f"{name}_Lamp", a, y - 0.05, 0.22, 0.38, 0.22, face.proud(0.14), M["lamp"])
    face.box(s, f"{name}_Cap", a, y + 0.33, 0.28, 0.06, 0.28, face.proud(0.14), M["iron"])


def corner_board(s, name, x, z, y0, h, M, w=0.16):
    s.add(L.box(s.coll, name, x, z, y0, w, w, h, M["trim"]))


def frieze(s, name, x0, z0, x1, z1, y, M, h=0.28, t=0.06):
    """Board under the eaves around a rectangle (outer wall faces), 3 cm proud."""
    for k, (cx, cz, sx, sz) in enumerate((((x0 + x1) / 2, z0, x1 - x0 + 2 * t, t), ((x0 + x1) / 2, z1, x1 - x0 + 2 * t, t),
                                          (x0, (z0 + z1) / 2, t, abs(z1 - z0)), (x1, (z0 + z1) / 2, t, abs(z1 - z0)))):
        s.add(L.box(s.coll, f"{name}{k}", cx, cz, y - h, sx, sz, h, M["trim"]))


def _prism(s, name, pts, y_extent, mat, tile=1.0):
    """Extrude a polygon given in the (u, y) plane along a direction; pts are 3D game points of the front polygon and
    y_extent the (dx, dz) extrusion vector."""
    bm = bmesh.new()
    dx, dz = y_extent
    front = [bm.verts.new(L.b(x, z, y)) for x, z, y in pts]
    back = [bm.verts.new(L.b(x + dx, z + dz, y)) for x, z, y in pts]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    n = len(pts)
    for i in range(n):
        bm.faces.new((front[i], front[(i + 1) % n], back[(i + 1) % n], back[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return s.add(S._mesh(s, name, bm, mat, tile))


def gable_infill(s, name, axis, fixed, a0, a1, y0, h, M, t=0.2, vent=True, out=None):
    """Triangular siding wall closing a gable end (axis: the wall's run, like Face; out: outward sign, default from
    the side of the house-local origin)."""
    am = (a0 + a1) / 2
    if axis == "x":
        pts = [(a0, fixed + t / 2, y0), (a1, fixed + t / 2, y0), (am, fixed + t / 2, y0 + h)]
        _prism(s, name, pts, (0.0, -t), M["siding"], tile=2.0)
    else:
        pts = [(fixed - t / 2, a0, y0), (fixed - t / 2, a1, y0), (fixed - t / 2, am, y0 + h)]
        _prism(s, name, pts, (t, 0.0), M["siding"], tile=2.0)
    if vent and h > 1.2:
        vh, vw = min(0.7, h * 0.35), min(1.4, (a1 - a0) * 0.18)
        out = out if out is not None else (1 if fixed >= 0 else -1)
        if axis == "x":
            s.add(L.box(s.coll, f"{name}_Vent", am, fixed + out * (t / 2 + 0.03), y0 + h * 0.38, vw, 0.06, vh, M["vent"]))
        else:
            s.add(L.box(s.coll, f"{name}_Vent", fixed + out * (t / 2 + 0.03), am, y0 + h * 0.38, 0.06, vw, vh, M["vent"]))


def shed_roof(s, name, x0, x1, z_back, z_front, y_back, y_front, M, t=0.14):
    """Mono-pitch roof slab from (z_back, y_back) down to (z_front, y_front) across x0..x1."""
    pts = [(x0, z_back, y_back), (x0, z_front, y_front), (x0, z_front, y_front + t), (x0, z_back, y_back + t)]
    return _prism(s, name, pts, (x1 - x0, 0.0), M["roof"], tile=2.0)


def porch(s, name, x0, x1, z0, depth, M, cols, beam_y=3.0, roof_back_y=3.7, col_w=0.3):
    """Front porch: paved floor (walkable, top 0.14), square columns with base and capital, beam, shed roof."""
    z1 = z0 + depth
    s.add(L.box(s.coll, f"{name}_Floor", (x0 + x1) / 2, (z0 + z1) / 2, 0.0, x1 - x0, depth, 0.14, M["porch_floor"]))
    zc = z1 - col_w / 2 - 0.05
    for k, x in enumerate(cols):
        s.add(L.box(s.coll, f"{name}_Col{k}_Foot", x, zc, 0.14, col_w + 0.12, col_w + 0.12, 0.2, M["trim"]))
        s.add(L.box(s.coll, f"{name}_Col{k}", x, zc, 0.34, col_w, col_w, beam_y - 0.5, M["trim"]))
        s.add(L.box(s.coll, f"{name}_Col{k}_Cap", x, zc, beam_y - 0.16, col_w + 0.12, col_w + 0.12, 0.16, M["trim"]))
        s.col(f"{name}_Col{k}", x, zc, col_w + 0.15, col_w + 0.15, beam_y)
    s.add(L.box(s.coll, f"{name}_Beam", (x0 + x1) / 2, zc, beam_y, x1 - x0, col_w + 0.05, 0.32, M["trim"]))
    shed_roof(s, f"{name}_Roof", x0 - 0.1, x1 + 0.1, z0, z1 + 0.35, roof_back_y, beam_y + 0.32, M)


def chimney(s, name, x, z, w, d, h, M):
    s.add(L.box(s.coll, name, x, z, 0.0, w, d, h, M["chimney"], tile=1.0))
    s.add(L.box(s.coll, f"{name}_Cap", x, z, h, w + 0.16, d + 0.16, 0.14, M["trim"]))
    for k, dx in enumerate((-w / 4, w / 4)):
        s.add(L.box(s.coll, f"{name}_Pot{k}", x + dx, z, h + 0.14, 0.2, 0.2, 0.35, M["chimney"]))
    s.col(name, x, z, w, d, h)


def topiary(s, name, x, z, M):
    """Planter with a two-ball boxwood topiary (front-door pair)."""
    s.add(L.box(s.coll, f"{name}_Pot", x, z, 0.14, 0.5, 0.5, 0.5, M["planter"], bevel=0.03))
    s.add(L.cyl(s.coll, f"{name}_Stem", x, z, 0.64, 0.04, 0.5, M["trunk"], seg=6))
    S._blob(s, f"{name}_Ball0", x, z, 0.62, 0.32, M["boxwood"], jitter=0.04)
    S._blob(s, f"{name}_Ball1", x, z, 1.2, 0.24, M["boxwood"], jitter=0.04)
    s.col(name, x, z, 0.55, 0.55, 1.6)


def hydrangeas(s, name, x0, x1, z, M, n=6):
    """Hydrangea shrubs along a bed: a green leafy mound crowned with white flower heads (soft decor, walk-through)."""
    for k in range(n):
        x = x0 + (x1 - x0) * (k + 0.5) / n + s.rnd.uniform(-0.15, 0.15)
        zz = z + s.rnd.uniform(-0.15, 0.15)
        S._blob(s, f"{name}_{k}_Leaf", x, zz, 0.02, 0.5, M["boxwood"], sy=0.7, jitter=0.1)
        for j in range(4):
            a = 6.2832 * j / 4 + s.rnd.uniform(-0.4, 0.4)
            r = 0.28 if j else 0.0
            S._blob(s, f"{name}_{k}_Flower{j}", x + r * math.cos(a), zz + r * math.sin(a), 0.42 + (0.1 if j == 0 else 0.0),
                    s.rnd.uniform(0.17, 0.22), M["hydrangea"], jitter=0.15)


# ---------------------------------------------------------------- placement
def place(s, objs, cols, origin, rot=0.0):
    """Move house-local objects and collision boxes onto the lot: local (0, 0) -> plan `origin`, rotated by the Blender
    yaw `rot` (0 = the front keeps looking +Z)."""
    ox, oz = origin
    c, sn = math.cos(rot), math.sin(rot)
    for o in objs:
        bx, by = o.location.x, o.location.y
        o.location.x = ox + bx * c - by * sn
        o.location.y = -oz + bx * sn + by * c
        o.rotation_euler.z += rot
    for col in cols:
        bx, by = col["cx"], -col["cz"]
        col["cx"] = round(ox + bx * c - by * sn, 3)
        col["cz"] = round(oz - (bx * sn + by * c), 3)
        col["yaw"] = round(col["yaw"] + rot, 4)


# ---------------------------------------------------------------- compositions
def colonial_villa(s, name, origin, M, rot=0.0):
    """Two-storey American colonial with a side garage wing (docs/GATED_COMMUNITY.md § 7.1, villa envelope 22 x 19.7 m).
    Local frame: main block x -10.35..2.65, z 0..-10; garage wing x 2.65..10.35, z 0..-8; porch x -3.5..2.65, z 0..2.2.
    Returns the local door point (house-local x, z) and the triangle count of the house."""
    n0, c0 = len(s.objs), len(s.cols)
    T = 0.2
    MX0, MX1, MZ = -10.35, 2.65, -10.0
    GX1, GZ = 10.35, -8.0
    H1, H2 = 3.2, 6.0      # floor line, eave line (main)
    GH = 3.0               # garage eave

    # main block: four walls, front and back facades with their openings
    front = Face("x", -T / 2, 1, T)
    back = Face("x", MZ + T / 2, -1, T)
    west = Face("z", MX0 + T / 2, -1, T)
    east_up = Face("z", MX1 - T / 2, 1, T)
    door_ab = (-1.3, 0.5)
    gf_front = [(-8.9, -5.1, 0.7, 2.6), (door_ab[0], door_ab[1], 0.0, 2.85), (1.15, 2.25, 0.9, 2.6)]
    up_xs = (-8.6, -5.4, -2.1, 1.0)
    up_front = [(x - 0.55, x + 0.55, H1 + 0.8, H1 + 2.3) for x in up_xs]
    back_ops = [(-8.0, -6.8, 0.9, 2.5), (-3.5, -1.5, 0.9, 2.5), (-8.0, -6.8, H1 + 0.8, H1 + 2.3), (-4.0, -2.8, H1 + 0.8, H1 + 2.3),
                (0.0, 1.2, H1 + 0.8, H1 + 2.3)]
    # gable side: windows clear of the chimney (z -5.8..-4.2) including their shutters
    west_ops = [(-8.6, -7.4, 0.9, 2.5), (-3.4, -2.2, 0.9, 2.5), (-8.0, -6.8, H1 + 0.8, H1 + 2.3), (-3.4, -2.2, H1 + 0.8, H1 + 2.3)]
    # one wall piece per storey: L.wall cuts holes along the run, so stacked openings need separate storeys
    for wname, f, a0, a1, ops in (("Front", front, MX0, MX1, gf_front + up_front), ("Back", back, MX0, MX1, back_ops),
                                  ("West", west, MZ + T, -T, west_ops)):
        siding_wall(s, f"{name}_Wall{wname}GF", f, a0, a1, 0.0, H1, M, [o for o in ops if o[3] <= H1])
        siding_wall(s, f"{name}_Wall{wname}Up", f, a0, a1, H1, H2 - H1, M, [o for o in ops if o[2] >= H1])
    siding_wall(s, f"{name}_WallEast", east_up, GZ, -T, GH, H2 - GH, M)          # above the garage roof line
    siding_wall(s, f"{name}_WallEastRear", east_up, MZ + T, GZ, 0.0, H2, M)       # behind the garage
    for f, a0, a1 in ((front, MX0, MX1), (back, MX0, MX1), (west, MZ, 0.0)):
        base_band(s, f"{name}_Base{f.axis}{f.fixed:+.1f}", f, a0, a1, M)
    # main block openings
    window(s, f"{name}_WinGF0", front, -8.9, -5.1, 0.7, 2.6, M, cols=4, rows=2, shutters=False)
    window(s, f"{name}_WinGF1", front, 1.15, 2.25, 0.9, 2.6, M, cols=2, rows=3, shutters=False)
    door(s, f"{name}_FrontDoor", front, door_ab[0], door_ab[1], 2.45, M)
    for k, x in enumerate(up_xs):
        window(s, f"{name}_WinUp{k}", front, x - 0.55, x + 0.55, H1 + 0.8, H1 + 2.3, M, cols=2, rows=3)
    for k, (a, b_, y0, y1) in enumerate(back_ops):
        window(s, f"{name}_WinBack{k}", back, a, b_, y0, y1, M, cols=2, rows=2, shutters=False)
    for k, (a, b_, y0, y1) in enumerate(west_ops):
        window(s, f"{name}_WinWest{k}", west, a, b_, y0, y1, M, cols=2, rows=3)
    # trims: corner boards, frieze, floor-line band on the gable side
    for k, (x, z) in enumerate(((MX0, 0.0), (MX1, 0.0), (MX0, MZ), (MX1, MZ))):
        corner_board(s, f"{name}_Corner{k}", x, z, 0.0, H2, M)
    frieze(s, f"{name}_Frieze", MX0, 0.0, MX1, MZ, H2, M)
    # main roof: gable, ridge along x; gable-end infills; centre cross gable over the door
    RH = 3.4
    s.add(L.gable_roof(s.coll, f"{name}_Roof", (MX0 + MX1) / 2, MZ / 2, H2, MX1 - MX0 + 0.8, -MZ + 0.8, RH, M["roof"], ridge_axis="x"))
    ih = RH * (-MZ / 2) / (-MZ / 2 + 0.4)
    gable_infill(s, f"{name}_GableW", "z", MX0 + T / 2, MZ, 0.0, H2, ih, M)
    gable_infill(s, f"{name}_GableE", "z", MX1 - T / 2, MZ, 0.0, H2, ih, M)
    xg = (door_ab[0] + door_ab[1]) / 2
    s.add(L.gable_roof(s.coll, f"{name}_CrossRoof", xg, -1.5, H2, 4.0, 3.8, 2.0, M["roof"], ridge_axis="z"))
    gable_infill(s, f"{name}_CrossGable", "x", -T / 2, xg - 1.8, xg + 1.8, H2, 2.0 * 1.8 / 2.0, M, out=1)
    s.add(L.box(s.coll, f"{name}_CrossFrieze", xg, 0.03, H2 - 0.28, 3.8, 0.06, 0.28, M["trim"]))

    # garage wing
    gfront = Face("x", -T / 2, 1, T)
    gback = Face("x", GZ + T / 2, -1, T)
    geast = Face("z", GX1 - T / 2, 1, T)
    gd = (4.05, 8.95)
    siding_wall(s, f"{name}_GarageFront", gfront, MX1, GX1, 0.0, GH, M, [(gd[0], gd[1], 0.0, 2.35)])
    siding_wall(s, f"{name}_GarageBack", gback, MX1, GX1, 0.0, GH, M)
    siding_wall(s, f"{name}_GarageEast", geast, GZ + T, -T, 0.0, GH, M, [(-5.0, -3.8, 1.0, 2.2)])
    for f, a0, a1 in ((gfront, MX1, GX1), (gback, MX1, GX1), (geast, GZ, 0.0)):
        base_band(s, f"{name}_GBase{f.axis}{f.fixed:+.1f}", f, a0, a1, M)
    garage_door(s, f"{name}_GarageDoor", gfront, gd[0], gd[1], 2.35, M)
    window(s, f"{name}_WinGarage", geast, -5.0, -3.8, 1.0, 2.2, M, cols=2, rows=2)
    for k, (x, z) in enumerate(((GX1, 0.0), (GX1, GZ))):
        corner_board(s, f"{name}_GCorner{k}", x, z, 0.0, GH, M)
    frieze(s, f"{name}_GFrieze", MX1, 0.0, GX1, GZ, GH, M)
    GRH = 2.3
    s.add(L.gable_roof(s.coll, f"{name}_GarageRoof", (MX1 + GX1 + 0.4) / 2, GZ / 2, GH, GX1 + 0.4 - MX1, -GZ + 0.8, GRH, M["roof"], ridge_axis="x"))
    gable_infill(s, f"{name}_GableGarage", "z", GX1 - T / 2, GZ, 0.0, GH, GRH * (-GZ / 2) / (-GZ / 2 + 0.4), M)
    for k, a in enumerate((gd[0] - 0.55, gd[1] + 0.55)):
        wall_lantern(s, f"{name}_GLantern{k}", gfront, a, 2.1, M)

    # porch, lanterns, chimney, planting
    porch(s, f"{name}_Porch", -3.5, MX1, 0.0, 2.2, M, cols=(-3.3, -1.6, 0.8, 2.45))
    for k, a in enumerate((door_ab[0] - 0.45, door_ab[1] + 0.45)):
        wall_lantern(s, f"{name}_Lantern{k}", front, a, 2.0, M)
    chimney(s, f"{name}_Chimney", MX0 - 0.55, -5.0, 0.9, 1.6, H2 + RH + 0.6, M)
    for k, x in enumerate((door_ab[0] - 0.75, door_ab[1] + 0.75)):
        topiary(s, f"{name}_Topiary{k}", x, 0.5, M)
    S.hedge_run(s, f"{name}_HedgeL", (MX0 + 0.3, 0.75), (-3.8, 0.75), M, w=0.7)
    hydrangeas(s, f"{name}_HydrangeaL", MX0 + 0.6, -4.2, 1.6, M, n=5)
    S.hedge_run(s, f"{name}_HedgeFront", (-3.5, 2.75), (-1.6, 2.75), M, w=0.6)
    S.hedge_run(s, f"{name}_HedgeFront2", (0.8, 2.75), (MX1, 2.75), M, w=0.6)

    # collisions: main block, garage, chimney (porch columns added by porch())
    s.col(f"{name}_Main", (MX0 + MX1) / 2, MZ / 2, MX1 - MX0, -MZ, H2 + RH)
    s.col(f"{name}_Garage", (MX1 + GX1) / 2, GZ / 2, GX1 - MX1, -GZ, GH + GRH)

    place(s, s.objs[n0:], s.cols[c0:], origin, rot)
    tris = sum(len(p.vertices) - 2 for o in s.objs[n0:] if o.type == "MESH" for p in o.data.polygons)
    return (xg, 0.4), tris
