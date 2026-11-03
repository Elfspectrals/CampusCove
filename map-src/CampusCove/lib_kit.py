"""Modular building kit for the CampusCove Blender build scripts (docs/BUILD_KIT.md).

Every block registers axis-aligned boxes in a `Kit` (game space: x / z footprint, y height, metres, see lib_common)
so the assembly can be checked for coplanar overlaps (z-fighting), contained boxes and envelope holes before
`kit.build(coll)` turns it into Blender objects through lib_common.box / join. Two touching blocks share an edge or an
interior face, never a visible coplanar face; parallel visible faces stay at least MIN_GAP apart. Furniture blocks take
a yaw that must be a multiple of pi/2 (lib_common.furn convention: 0 faces game -Z, -pi/2 faces +x, pi faces +Z).
"""
import math

import bmesh
import bpy

import lib_common as L

MIN_GAP = 0.02
FACES = ("x-", "x+", "y-", "y+", "z-", "z+")
RISES = ("+x", "-x", "+z", "-z")
EPS = 1e-6


class KitError(RuntimeError):
    pass


class Box:
    __slots__ = ("name", "x0", "x1", "y0", "y1", "z0", "z1", "mat", "visible", "collide", "opening", "tile", "bevel", "shape", "extra")

    def __init__(self, name, x0, z0, x1, z1, y0, y1, mat, visible=True, collide=False, opening=False, tile=1.0, bevel=0.0, shape="box", extra=None):
        self.name = name
        self.x0, self.x1 = min(x0, x1), max(x0, x1)
        self.z0, self.z1 = min(z0, z1), max(z0, z1)
        self.y0, self.y1 = min(y0, y1), max(y0, y1)
        self.mat = mat
        self.visible = visible
        self.collide = collide
        self.opening = opening
        self.tile = tile
        self.bevel = bevel
        self.shape = shape
        self.extra = extra or {}

    @property
    def size(self):
        return (self.x1 - self.x0, self.y1 - self.y0, self.z1 - self.z0)

    @property
    def rect(self):
        return (self.x0, self.z0, self.x1, self.z1)

    def planar_faces(self):
        if self.shape == "box":
            return FACES
        if self.shape == "gable":
            return ("y-", "x-", "x+") if self.extra["ridge_axis"] == "x" else ("y-", "z-", "z+")
        rise = self.extra["rise"]
        sides = ("z-", "z+") if rise[1] == "x" else ("x-", "x+")
        high = rise[1] + ("+" if rise[0] == "+" else "-")
        low = rise[1] + ("-" if rise[0] == "+" else "+")
        faces = ("y-",) + sides + (high,)
        return faces + (low,) if self.extra["y_lo"] - self.y0 > EPS else faces

    def __repr__(self):
        return f"Box({self.name} x[{self.x0:.3f},{self.x1:.3f}] y[{self.y0:.3f},{self.y1:.3f}] z[{self.z0:.3f},{self.z1:.3f}])"


def _along(axis, fixed, lo, hi, thick):
    if axis == "x":
        return (lo, fixed - thick / 2, hi, fixed + thick / 2)
    if axis == "z":
        return (fixed - thick / 2, lo, fixed + thick / 2, hi)
    raise KitError(f"axis must be 'x' or 'z', got {axis!r}")


def _footprint(gx, gz, yaw, lx, lz, sx, sz):
    k = round(yaw / (math.pi / 2))
    if abs(yaw - k * math.pi / 2) > 1e-6:
        raise KitError(f"yaw {yaw} is not a multiple of pi/2: kit boxes stay axis-aligned")
    c, s = (1, 0, -1, 0)[k % 4], (0, 1, 0, -1)[k % 4]
    wx = gx + lx * c + lz * s
    wz = gz - (lx * s - lz * c)
    hx, hz = (sx / 2, sz / 2) if k % 2 == 0 else (sz / 2, sx / 2)
    return (wx - hx, wz - hz, wx + hx, wz + hz)


def _clip(a, b):
    return (max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3]))


def _area(r):
    return max(0.0, r[2] - r[0]) * max(0.0, r[3] - r[1])


def _subtract(r, n):
    c = _clip(r, n)
    if _area(c) <= EPS:
        return [r]
    pieces = []
    if c[0] - r[0] > EPS:
        pieces.append((r[0], r[1], c[0], r[3]))
    if r[2] - c[2] > EPS:
        pieces.append((c[2], r[1], r[2], r[3]))
    if c[1] - r[1] > EPS:
        pieces.append((c[0], r[1], c[2], c[1]))
    if r[3] - c[3] > EPS:
        pieces.append((c[0], c[3], c[2], r[3]))
    return pieces


def _layout(name, x0, z0, x1, z1, y0, y1, rise):
    return {"name": name, "minX": round(min(x0, x1), 3), "maxX": round(max(x0, x1), 3), "minZ": round(min(z0, z1), 3), "maxZ": round(max(z0, z1), 3),
            "y0": round(y0, 3), "y1": round(y1, 3), "rise": rise}


class Kit:
    """Registry of the boxes of one building; the blocks below add to it, `build()` makes the Blender objects."""

    def __init__(self):
        self.boxes = []
        self.names = set()
        self.floors = []
        self.objects = []
        self.cols = None

    def _register(self, box):
        if box.name in self.names:
            raise KitError(f"{box.name}: name already registered")
        if not box.opening and min(box.size) <= EPS:
            raise KitError(f"{box.name}: degenerate box, size {tuple(round(s, 4) for s in box.size)}")
        if box.visible and box.mat is None:
            raise KitError(f"{box.name}: a visible box needs a material")
        self.names.add(box.name)
        self.boxes.append(box)
        return box

    def add(self, name, x0, z0, x1, z1, y0, y1, mat, visible=True, collide=False, tile=1.0, bevel=0.0):
        """Register one axis-aligned box from its game footprint corners and y0..y1 heights. Returns the Box."""
        return self._register(Box(name, x0, z0, x1, z1, y0, y1, mat, visible=visible, collide=collide, tile=tile, bevel=bevel))

    def opening(self, name, x0, z0, x1, z1, y0, y1):
        """Declare an intended hole of the envelope (door, passage) so check_enclosure does not report it."""
        return self._register(Box(name, x0, z0, x1, z1, y0, y1, None, visible=False, collide=False, opening=True))

    def part(self, name, gx, gz, yaw, lx, lz, y0, sx, sz, h, mat, visible=True, collide=False, bevel=0.0, tile=1.0):
        """Box given in a local frame (lib_common.furn convention: local -z is the front at yaw 0) placed at (gx, gz)
        and turned by `yaw`, a multiple of pi/2."""
        x0, z0, x1, z1 = _footprint(gx, gz, yaw, lx, lz, sx, sz)
        return self.add(name, x0, z0, x1, z1, y0, y0 + h, mat, visible=visible, collide=collide, tile=tile, bevel=bevel)

    def _floor_conflicts(self, rect, y_top):
        return [f for f in self.floors if abs(f.y1 - y_top) < MIN_GAP - EPS and _area(_clip(rect, f.rect)) > EPS]

    def _floor_box(self, name, x0, z0, x1, z1, y0, y1, mat, tile):
        box = self.add(name, x0, z0, x1, z1, y0, y1, mat, tile=tile)
        self.floors.append(box)
        return box

    def _cut_floor(self, old, rect):
        self.boxes.remove(old)
        self.floors.remove(old)
        self.names.discard(old.name)
        for i, piece in enumerate(_subtract(old.rect, rect)):
            self._floor_box(f"{old.name}_r{i}", *piece, old.y0, old.y1, old.mat, old.tile)

    def floor(self, name, x0, z0, x1, z1, y, mat, thick=0.1, tile=2.0, replace=False):
        """Walkable surface whose top is at `y` (box y - thick .. y). Refuses to overlap a floor or slab already
        registered with its top at the same height, unless `replace=True` cuts the older one around this rectangle."""
        rect = (min(x0, x1), min(z0, z1), max(x0, x1), max(z0, z1))
        for old in self._floor_conflicts(rect, y):
            if not replace:
                raise KitError(f"{name}: overlaps floor {old.name} at y={y}; cut it with replace=True or move one of them")
            self._cut_floor(old, rect)
        return self._floor_box(name, *rect, y - thick, y, mat, tile)

    def slab(self, name, x0, z0, x1, z1, y0, thick, mat, tile=2.0):
        """Structural slab from y0 up to y0 + thick (storey floor, ceiling); its top counts as a floor."""
        rect = (min(x0, x1), min(z0, z1), max(x0, x1), max(z0, z1))
        conflicts = self._floor_conflicts(rect, y0 + thick)
        if conflicts:
            raise KitError(f"{name}: its top overlaps floor {conflicts[0].name} at y={y0 + thick}")
        return self._floor_box(name, *rect, y0, y0 + thick, mat, tile)

    def roof_slab(self, name, x0, z0, x1, z1, y0, mat, thick=0.3, tile=4.0):
        """Flat roof slab resting on the walls (top = y0 + thick)."""
        return self.slab(name, x0, z0, x1, z1, y0, thick, mat, tile=tile)

    def _wall_piece(self, name, axis, fixed, lo, hi, y0, y1, thick, mat, collide, tile):
        if hi - lo <= EPS or y1 - y0 <= EPS:
            return []
        return [self.add(name, *_along(axis, fixed, lo, hi, thick), y0, y1, mat, collide=collide, tile=tile)]

    def wall(self, name, axis, fixed, a0, a1, y0, h, thick, mat, openings=(), collide=True, tile=2.0):
        """Wall centred on `fixed`, along game x (axis 'x', at z=fixed) or z (axis 'z', at x=fixed), from a0 to a1,
        base y0, height h. openings: [(a, b, y_lo, y_hi)] with heights relative to y0, cut into sill / lintel pieces and
        declared as openings for check_enclosure. Returns the solid Boxes."""
        if a1 - a0 <= EPS or thick <= 0 or h <= 0:
            raise KitError(f"{name}: wall needs a0 < a1, thick > 0, h > 0")
        made = []
        cur, idx = a0, 0
        for a, b, y_lo, y_hi in sorted(openings):
            if a < a0 - EPS or b > a1 + EPS or b - a <= EPS or y_lo < 0 or y_hi > h + EPS or y_hi - y_lo <= EPS or a < cur - EPS:
                raise KitError(f"{name}: opening {(a, b, y_lo, y_hi)} is outside the wall or overlaps another opening")
            made += self._wall_piece(f"{name}_{idx:02d}", axis, fixed, cur, a, y0, y0 + h, thick, mat, collide, tile)
            made += self._wall_piece(f"{name}_{idx:02d}s", axis, fixed, a, b, y0, y0 + y_lo, thick, mat, collide, tile)
            made += self._wall_piece(f"{name}_{idx:02d}l", axis, fixed, a, b, y0 + y_hi, y0 + h, thick, mat, collide, tile)
            self.opening(f"{name}_{idx:02d}o", *_along(axis, fixed, a, b, thick), y0 + y_lo, y0 + y_hi)
            cur, idx = b, idx + 1
        made += self._wall_piece(f"{name}_{idx:02d}", axis, fixed, cur, a1, y0, y0 + h, thick, mat, collide, tile)
        return made

    def corner(self, name, gx, gz, y0, h, thick, mat, thick_z=None, collide=True, tile=2.0):
        """Post at the meeting point (gx, gz) of two wall axes; both walls stop at its faces instead of crossing."""
        tz = thick if thick_z is None else thick_z
        return self.add(name, gx - thick / 2, gz - tz / 2, gx + thick / 2, gz + tz / 2, y0, y0 + h, mat, collide=collide, tile=tile)

    def shopfront(self, name, axis, fixed, a0, a1, y0, h, mat_wall, mat_glass, low=0.5, fascia=(3.4, None), thick=0.2, pilaster=0.3,
                  door=None, mat_fascia=None, glass_thick=0.03, collide=True):
        """Glazed shop face centred on `fixed`: end pilasters (thick + 0.2 deep), low wall, glass up to the fascia,
        fascia band (y_lo, y_hi relative to y0, None = h), plain wall above it. door=(a, b, height) cuts the low wall
        and the glass and declares the opening. Returns the Boxes."""
        f_lo, f_hi = fascia[0], h if fascia[1] is None else fascia[1]
        if not 0 < low < f_lo <= f_hi <= h + EPS:
            raise KitError(f"{name}: need 0 < low < fascia y_lo <= y_hi <= h")
        depth = thick + 0.2
        i0, i1 = a0 + pilaster, a1 - pilaster
        if i1 - i0 <= EPS:
            raise KitError(f"{name}: shopfront too narrow for its pilasters")
        made = [self.add(f"{name}_PilA", *_along(axis, fixed, a0, i0, depth), y0, y0 + h, mat_wall, collide=collide, tile=2.0),
                self.add(f"{name}_PilB", *_along(axis, fixed, i1, a1, depth), y0, y0 + h, mat_wall, collide=collide, tile=2.0)]
        spans = [(i0, i1)]
        if door is not None:
            d0, d1, dh = door
            if d0 < i0 - EPS or d1 > i1 + EPS or d1 - d0 <= EPS or dh <= low or dh > f_lo + EPS:
                raise KitError(f"{name}: door {door} must sit between the pilasters, higher than `low` and under the fascia")
            spans = [(i0, d0), (d1, i1)]
            made += self._wall_piece(f"{name}_GlassDoor", axis, fixed, d0, d1, y0 + dh, y0 + f_lo, glass_thick, mat_glass, collide, 1.0)
            self.opening(f"{name}_Door", *_along(axis, fixed, d0, d1, thick), y0, y0 + dh)
        for k, (s0, s1) in enumerate(spans):
            made += self._wall_piece(f"{name}_Low{k}", axis, fixed, s0, s1, y0, y0 + low, thick, mat_wall, collide, 2.0)
            made += self._wall_piece(f"{name}_Glass{k}", axis, fixed, s0, s1, y0 + low, y0 + f_lo, glass_thick, mat_glass, collide, 1.0)
        made += self._wall_piece(f"{name}_Fascia", axis, fixed, i0, i1, y0 + f_lo, y0 + f_hi, thick, mat_fascia or mat_wall, False, 2.0)
        made += self._wall_piece(f"{name}_Head", axis, fixed, i0, i1, y0 + f_hi, y0 + h, thick, mat_wall, False, 2.0)
        return made

    def door_frame(self, name, axis, fixed, a0, a1, y0, h, thick, mat, leaf=None, jamb=0.08, head=0.12, proud=0.03, collide=True):
        """Jambs and head inside a door opening [a0, a1] x [y0, y0 + h] of a wall `thick` thick, standing `proud` of
        both wall faces; `leaf` (material) fills the opening with a 5 cm door panel."""
        depth = thick + 2 * proud
        made = [self.add(f"{name}_JambA", *_along(axis, fixed, a0, a0 + jamb, depth), y0, y0 + h, mat, collide=collide),
                self.add(f"{name}_JambB", *_along(axis, fixed, a1 - jamb, a1, depth), y0, y0 + h, mat, collide=collide),
                self.add(f"{name}_Head", *_along(axis, fixed, a0 + jamb, a1 - jamb, depth), y0 + h - head, y0 + h, mat)]
        if leaf is not None:
            made.append(self.add(f"{name}_Leaf", *_along(axis, fixed, a0 + jamb, a1 - jamb, 0.05), y0, y0 + h - head, leaf, collide=collide))
        return made

    def pillar(self, name, gx, gz, y0, h, mat, w=0.6, collide=True, tile=2.0):
        """Square pillar of side `w` centred on (gx, gz)."""
        return self.add(name, gx - w / 2, gz - w / 2, gx + w / 2, gz + w / 2, y0, y0 + h, mat, collide=collide, tile=tile)

    def railing(self, name, axis, fixed, a0, a1, y0, mat_glass, mat_rail, h=1.1, gaps=(), base_w=0.12, glass_w=0.06):
        """Glass balustrade on a steel base with a handrail, one COL box per piece; gaps=[(g0, g1)] stay open."""
        pieces, cur = [], a0
        for g0, g1 in sorted(gaps):
            if g0 - cur > EPS:
                pieces.append((cur, g0))
            cur = g1
        if a1 - cur > EPS:
            pieces.append((cur, a1))
        made = []
        for i, (p0, p1) in enumerate(pieces):
            made += self._wall_piece(f"{name}_Base{i}", axis, fixed, p0, p1, y0, y0 + 0.08, base_w, mat_rail, False, 1.0)
            made += self._wall_piece(f"{name}_Glass{i}", axis, fixed, p0, p1, y0 + 0.08, y0 + h - 0.07, glass_w, mat_glass, False, 1.0)
            made += self._wall_piece(f"{name}_Rail{i}", axis, fixed, p0, p1, y0 + h - 0.07, y0 + h, base_w, mat_rail, False, 1.0)
            self.add(f"{name}_Col{i}", *_along(axis, fixed, p0, p1, base_w), y0, y0 + h, None, visible=False, collide=True)
        return made

    def stair(self, name, x0, z0, x1, z1, y0, y1, rise, steps, mat, tile=1.0):
        """Solid steps climbing in `rise` ('+x', '-x', '+z', '-z') from y0 to y1 over the footprint, no COL: the
        player walks on the returned layout entry {name, minX, maxX, minZ, maxZ, y0, y1, rise}."""
        if rise not in RISES or steps < 1 or y1 <= y0:
            raise KitError(f"{name}: rise in {RISES}, steps >= 1, y1 > y0")
        along_x = rise[1] == "x"
        lo, hi = (min(x0, x1), max(x0, x1)) if along_x else (min(z0, z1), max(z0, z1))
        run, dh = (hi - lo) / steps, (y1 - y0) / steps
        for i in range(steps):
            t0 = lo + i * run if rise[0] == "+" else hi - (i + 1) * run
            rect = (t0, z0, t0 + run, z1) if along_x else (x0, t0, x1, t0 + run)
            self.add(f"{name}_S{i:02d}", *rect, y0, y0 + (i + 1) * dh, mat, tile=tile)
        return _layout(name, x0, z0, x1, z1, y0, y1, rise)

    def ramp(self, name, x0, z0, x1, z1, y0, y1, rise, mat, base=None, tile=2.0):
        """Escalator / ramp: a wedge rising in `rise` from y0 to y1, solid down to `base` (default y0, a sharp low
        end). Returns the layout entry like stair()."""
        if rise not in RISES or y1 <= y0:
            raise KitError(f"{name}: rise in {RISES}, y1 > y0")
        base = y0 if base is None else base
        if base > y0 + EPS:
            raise KitError(f"{name}: base must not be above the low end y0")
        self._register(Box(name, x0, z0, x1, z1, base, y1, mat, tile=tile, shape="wedge", extra={"rise": rise, "y_lo": y0, "y_hi": y1}))
        return _layout(name, x0, z0, x1, z1, y0, y1, rise)

    def gable_roof(self, name, x0, z0, x1, z1, y0, h, mat, ridge_axis="x", tile=2.0):
        """Two-slope roof prism over the footprint, ridge `h` above y0 (built with lib_common.gable_roof)."""
        if ridge_axis not in ("x", "z"):
            raise KitError(f"{name}: ridge_axis must be 'x' or 'z'")
        return self._register(Box(name, x0, z0, x1, z1, y0, y0 + h, mat, tile=tile, shape="gable", extra={"ridge_axis": ridge_axis}))

    def truss(self, name, axis, a0, a1, p0, p1, y0, mat, step=6.0, depth=0.5, w=0.4, purlins=3, purlin_w=0.24, purlin_h=0.3):
        """Roof grid over a void: cross beams spaced `step` along `axis` and spanning p0..p1 across it, purlins cut
        between the beams at mid depth so nothing shares a face. Returns the Boxes."""
        if a1 - a0 <= w or p1 - p0 <= purlin_w or purlin_h >= depth:
            raise KitError(f"{name}: truss extents too small for its members")
        across = "z" if axis == "x" else "x"
        n = max(1, int(round((a1 - a0) / step)))
        centres = [a0 + w / 2 + (a1 - a0 - w) * i / n for i in range(n + 1)]
        made = [self.add(f"{name}_T{i}", *_along(across, a, p0, p1, w), y0, y0 + depth, mat) for i, a in enumerate(centres)]
        if purlins == 1:
            lines = [(p0 + p1) / 2]
        else:
            lines = [p0 + purlin_w / 2 + (p1 - p0 - purlin_w) * k / (purlins - 1) for k in range(purlins)]
        py = y0 + (depth - purlin_h) / 2
        for k, p in enumerate(lines):
            for i in range(n):
                made += self._wall_piece(f"{name}_L{k}_{i}", axis, p, centres[i] + w / 2, centres[i + 1] - w / 2, py, py + purlin_h, purlin_w, mat, False, 1.0)
        return made

    def shelf_unit(self, name, gx, gz, yaw, w, d, h, shelves, mat, mat_shelf=None, panel=0.03, plinth=0.1):
        """Shelving facing -Z at yaw 0: back panel, two sides, plinth, `shelves` boards (the plinth top is the first),
        a top board and one COL box. Returns the shelf surfaces as (x0, z0, x1, z1, y) rects."""
        pitch = (h - plinth) / shelves if shelves >= 1 else 0.0
        if shelves < 1 or pitch < 0.2:
            raise KitError(f"{name}: shelves must be >= 1 and at least 0.2 m apart")
        ms = mat_shelf or mat
        inner_w, inner_d = w - 2 * panel, d - panel

        def part(suffix, lx, lz, y, sx, sz, hh, m):
            return self.part(f"{name}_{suffix}", gx, gz, yaw, lx, lz, y, sx, sz, hh, m)

        part("Back", 0.0, d / 2 - panel / 2, 0.0, w, panel, h, mat)
        part("SideA", -(w / 2 - panel / 2), -panel / 2, 0.0, panel, inner_d, h, mat)
        part("SideB", w / 2 - panel / 2, -panel / 2, 0.0, panel, inner_d, h, mat)
        base = part("Plinth", 0.0, -panel / 2, 0.0, inner_w, inner_d, plinth, ms)
        surfaces = [(*base.rect, plinth)]
        for i in range(1, shelves):
            y = plinth + i * pitch
            board = part(f"Shelf{i}", 0.0, -panel / 2, y - panel, inner_w, inner_d, panel, ms)
            surfaces.append((*board.rect, y))
        part("Top", 0.0, -panel / 2, h - panel, inner_w, inner_d, panel, mat)
        self.part(f"{name}_Col", gx, gz, yaw, 0.0, 0.0, 0.0, w, d, h, None, visible=False, collide=True)
        return surfaces

    def counter(self, name, gx, gz, yaw, w, d, h, mat, mat_top, lip=0.05, top=0.05):
        """Sales counter: body plus a top board overhanging by `lip`, one COL box."""
        self.part(f"{name}_Body", gx, gz, yaw, 0.0, 0.0, 0.0, w, d, h - top, mat, bevel=0.02)
        self.part(f"{name}_Top", gx, gz, yaw, 0.0, 0.0, h - top, w + 2 * lip, d + 2 * lip, top, mat_top, bevel=0.01)
        return self.part(f"{name}_Col", gx, gz, yaw, 0.0, 0.0, 0.0, w + 2 * lip, d + 2 * lip, h, None, visible=False, collide=True)

    def display_table(self, name, gx, gz, yaw, w, d, h, mat, mat_top=None, top=0.05, leg=0.06, inset=0.08):
        """Table with a top board and four inset legs, one COL box."""
        self.part(f"{name}_Top", gx, gz, yaw, 0.0, 0.0, h - top, w, d, top, mat_top or mat, bevel=0.01)
        for i, (sx, sz) in enumerate(((-1, -1), (1, -1), (1, 1), (-1, 1))):
            self.part(f"{name}_Leg{i}", gx, gz, yaw, sx * (w / 2 - inset - leg / 2), sz * (d / 2 - inset - leg / 2), 0.0, leg, leg, h - top, mat)
        return self.part(f"{name}_Col", gx, gz, yaw, 0.0, 0.0, 0.0, w, d, h, None, visible=False, collide=True)

    def podium(self, name, gx, gz, yaw, w, d, h, mat, bevel=0.02):
        """Display plinth, one box that also collides."""
        return self.part(name, gx, gz, yaw, 0.0, 0.0, 0.0, w, d, h, mat, collide=True, bevel=bevel)

    def mannequin(self, name, gx, gz, yaw, mat, y0=0.0):
        """Faceless figure (legs, torso, neck, head), 1.76 m tall, standing on y0 (a podium top), one COL box."""
        for suffix, y, sx, sz, hh in (("Legs", 0.0, 0.34, 0.22, 0.86), ("Torso", 0.86, 0.42, 0.24, 0.6), ("Neck", 1.46, 0.1, 0.1, 0.06), ("Head", 1.52, 0.18, 0.2, 0.24)):
            self.part(f"{name}_{suffix}", gx, gz, yaw, 0.0, 0.0, y0 + y, sx, sz, hh, mat, bevel=0.02)
        return self.part(f"{name}_Col", gx, gz, yaw, 0.0, 0.0, y0, 0.5, 0.4, 1.76, None, visible=False, collide=True)

    def hanging_sign(self, name, gx, gz, yaw, w, h, y, ceiling_y, mat, mat_wire, thick=0.08):
        """Board hung from the ceiling by two wires; lettering goes 0.02 m off its faces. Returns the board Box."""
        if ceiling_y <= y + h:
            raise KitError(f"{name}: the ceiling must be above the board")
        board = self.part(f"{name}_Board", gx, gz, yaw, 0.0, 0.0, y, w, thick, h, mat)
        off = w / 2 - min(0.3, w / 4)
        for i, lx in enumerate((-off, off)):
            self.part(f"{name}_Wire{i}", gx, gz, yaw, lx, 0.0, y + h, 0.02, 0.02, ceiling_y - y - h, mat_wire)
        return board

    def price_tag(self, name, gx, gz, yaw, mat_post, mat_tag, h=1.05):
        """Floor-standing tag post with a small plate at the top, facing -Z at yaw 0. Returns the plate centre
        (x, y, z) where the game draws the label."""
        self.part(f"{name}_Foot", gx, gz, yaw, 0.0, 0.0, 0.0, 0.16, 0.16, 0.03, mat_post)
        self.part(f"{name}_Post", gx, gz, yaw, 0.0, 0.0, 0.03, 0.04, 0.04, h - 0.03, mat_post)
        plate = self.part(f"{name}_Plate", gx, gz, yaw, 0.0, -0.03, h - 0.09, 0.14, 0.02, 0.09, mat_tag)
        return ((plate.x0 + plate.x1) / 2, h - 0.045, (plate.z0 + plate.z1) / 2)

    def planter(self, name, gx, gz, w, d, mat_box, mat_leaf, h=0.55, foliage=0.3):
        """Planter box with a foliage block inset 0.1 m on top; the box collides."""
        if min(w, d) <= 0.2:
            raise KitError(f"{name}: planter needs w and d above 0.2")
        self.add(f"{name}_Box", gx - w / 2, gz - d / 2, gx + w / 2, gz + d / 2, 0.0, h, mat_box, collide=True, bevel=0.02)
        return self.add(f"{name}_Leaf", gx - w / 2 + 0.1, gz - d / 2 + 0.1, gx + w / 2 - 0.1, gz + d / 2 - 0.1, h, h + foliage, mat_leaf, bevel=0.08)

    def bench(self, name, gx, gz, yaw, mat_seat, mat_leg, w=1.7, d=0.45):
        """Bench facing -Z at yaw 0: two legs, seat, backrest, one COL box."""
        for i, lx in enumerate((-(w / 2 - 0.15), w / 2 - 0.15)):
            self.part(f"{name}_Leg{i}", gx, gz, yaw, lx, 0.0, 0.0, 0.08, d - 0.05, 0.42, mat_leg)
        self.part(f"{name}_Seat", gx, gz, yaw, 0.0, 0.0, 0.42, w, d, 0.06, mat_seat, bevel=0.01)
        self.part(f"{name}_Back", gx, gz, yaw, 0.0, d / 2 - 0.03, 0.48, w, 0.06, 0.4, mat_seat, bevel=0.01)
        return self.part(f"{name}_Col", gx, gz, yaw, 0.0, 0.0, 0.0, w, d, 0.9, None, visible=False, collide=True)

    def build(self, coll, cols=None, prefix="Kit", merge=True):
        """Create the Blender objects in `coll` (one joined object per material when `merge`), the COL_ boxes in
        `cols` (a lib_common.Collisions, created on `coll` when None, then available as kit.cols) and return the
        visible objects."""
        if cols is None:
            cols = L.Collisions(coll)
        by_mat = {}
        for b in self.boxes:
            if b.collide:
                cols.add(b.name, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, b.y0, b.x1 - b.x0, b.z1 - b.z0, b.y1 - b.y0)
            if b.visible:
                by_mat.setdefault(b.mat.name, []).append(_make(coll, b))
        if merge:
            objs = [L.join(coll, f"{prefix}_{m}", group) if len(group) > 1 else group[0] for m, group in by_mat.items()]
        else:
            objs = [o for group in by_mat.values() for o in group]
        self.cols, self.objects = cols, objs
        return objs


def _world_uv(ob, tile):
    me = ob.data
    uv = me.uv_layers.active.data
    lx, ly, lz = ob.location
    for poly in me.polygons:
        n = poly.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        du, dv = ((ly, lz), (lx, lz), (lx, ly))[ax]
        for li in poly.loop_indices:
            u, v = uv[li].uv
            uv[li].uv = (u + du / tile, v + dv / tile)


def _wedge(coll, b, cx, cz):
    rise, y_lo, y_hi = b.extra["rise"], b.extra["y_lo"], b.extra["y_hi"]
    hx, hz = (b.x1 - b.x0) / 2, (b.z1 - b.z0) / 2

    def top(x, z):
        t = {"+x": (x + hx) / (2 * hx), "-x": (hx - x) / (2 * hx), "+z": (z + hz) / (2 * hz), "-z": (hz - z) / (2 * hz)}[rise]
        return y_lo - b.y0 + (y_hi - y_lo) * t

    me = bpy.data.meshes.new(b.name)
    bm = bmesh.new()
    corners = [(-hx, -hz), (hx, -hz), (hx, hz), (-hx, hz)]
    bottom = [bm.verts.new((x, -z, 0.0)) for x, z in corners]
    upper = [bm.verts.new((x, -z, top(x, z))) for x, z in corners]
    bm.faces.new(reversed(bottom))
    bm.faces.new(upper)
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((bottom[i], bottom[j], upper[j], upper[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    L._box_uv(bm, b.tile)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(b.mat)
    ob = bpy.data.objects.new(b.name, me)
    ob.location = L.b(cx, cz, b.y0)
    coll.objects.link(ob)
    return ob


def _make(coll, b):
    cx, cz = (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2
    sx, sz, h = b.x1 - b.x0, b.z1 - b.z0, b.y1 - b.y0
    if b.shape == "box":
        ob = L.box(coll, b.name, cx, cz, b.y0, sx, sz, h, b.mat, bevel=b.bevel, tile=b.tile)
    elif b.shape == "gable":
        ob = L.gable_roof(coll, b.name, cx, cz, b.y0, sx, sz, h, b.mat, ridge_axis=b.extra["ridge_axis"], tile=b.tile)
    else:
        ob = _wedge(coll, b, cx, cz)
    _world_uv(ob, b.tile)
    return ob


def _face(box, key):
    axis, side = key
    if axis == "x":
        return (box.x1 if side == "+" else box.x0, box.y0, box.y1, box.z0, box.z1)
    if axis == "y":
        return (box.y1 if side == "+" else box.y0, box.x0, box.x1, box.z0, box.z1)
    return (box.z1 if side == "+" else box.z0, box.x0, box.x1, box.y0, box.y1)


def _overlaps_in_plane(cluster, key, tol, gap):
    cluster.sort(key=lambda f: f[0][1])
    active, found = [], []
    for face, box in cluster:
        plane, u0, u1, v0, v1 = face
        active = [a for a in active if a[0][2] > u0]
        for (p2, a0, a1, b0, b1), other in active:
            if abs(plane - p2) >= gap - EPS:
                continue
            du = min(u1, a1) - max(u0, a0)
            dv = min(v1, b1) - max(v0, b0)
            if du > 0 and dv > 0 and du * dv > tol:
                found.append((other.name, box.name, key, round(plane, 4), round(du * dv, 4)))
        active.append((face, box))
    return found


def check_coplanar_overlaps(kit, tol=1e-3, gap=MIN_GAP):
    """Pairs of rendered boxes with a same-facing face on the same plane (closer than `gap`) whose projections share
    an area above `tol`: those faces flicker in the game. Returns [(name_a, name_b, face, plane, area)]."""
    found = []
    rendered = [b for b in kit.boxes if b.visible]
    for key in FACES:
        faces = [(_face(b, key), b) for b in rendered if key in b.planar_faces()]
        faces.sort(key=lambda f: f[0][0])
        start = 0
        for i in range(1, len(faces) + 1):
            if i == len(faces) or faces[i][0][0] - faces[i - 1][0][0] >= gap - EPS:
                if i - start > 1:
                    found.extend(_overlaps_in_plane(faces[start:i], key, tol, gap))
                start = i
    return found


def check_contained(kit, tol=EPS, cell=4.0):
    """Rendered boxes lying entirely inside another rendered box (wasted, often flickering geometry).
    Returns [(inner_name, outer_name)]."""
    rendered = [b for b in kit.boxes if b.visible and b.shape == "box"]
    grid = {}
    for i, b in enumerate(rendered):
        for cx in range(int(math.floor(b.x0 / cell)), int(math.floor(b.x1 / cell)) + 1):
            for cz in range(int(math.floor(b.z0 / cell)), int(math.floor(b.z1 / cell)) + 1):
                grid.setdefault((cx, cz), []).append(i)
    found, seen = [], set()
    for j, b in enumerate(rendered):
        key = (int(math.floor((b.x0 + b.x1) / 2 / cell)), int(math.floor((b.z0 + b.z1) / 2 / cell)))
        for i in grid.get(key, ()):
            a = rendered[i]
            if i == j or (a.name, b.name) in seen or (b.name, a.name) in seen:
                continue
            if a.x0 - tol <= b.x0 and b.x1 <= a.x1 + tol and a.z0 - tol <= b.z0 and b.z1 <= a.z1 + tol and a.y0 - tol <= b.y0 and b.y1 <= a.y1 + tol:
                seen.add((b.name, a.name))
                found.append((b.name, a.name))
    return found


def _samples(a, b, step):
    n = max(1, int(math.ceil((b - a) / step - EPS)))
    return [a + (i + 0.5) * (b - a) / n for i in range(n)]


def _spans(box, axis, lo, hi):
    b0, b1 = {"x": (box.x0, box.x1), "y": (box.y0, box.y1), "z": (box.z0, box.z1)}[axis]
    return b0 <= hi and b1 >= lo


def _covers(box, axis, u, v):
    if axis == "x":
        return box.y0 <= u <= box.y1 and box.z0 <= v <= box.z1
    if axis == "y":
        return box.x0 <= u <= box.x1 and box.z0 <= v <= box.z1
    return box.x0 <= u <= box.x1 and box.y0 <= v <= box.y1


def check_enclosure(kit, rooms, step=0.5, probe=0.12):
    """Sample the six faces of every room volume (x0, z0, x1, z1, y0, y1), given on the wall axes, floor top and
    ceiling underside, on a `step` grid and list the samples no rendered box or declared opening covers within
    `probe` of the face plane. Returns [(room_index, face, u, v)] with (u, v) = (y, z), (x, z) or (x, y)."""
    cover = [b for b in kit.boxes if b.visible or b.opening]
    holes = []
    for r, (x0, z0, x1, z1, y0, y1) in enumerate(rooms):
        for key in FACES:
            axis = key[0]
            plane = {"x-": x0, "x+": x1, "y-": y0, "y+": y1, "z-": z0, "z+": z1}[key]
            us, vs = {"x": ((y0, y1), (z0, z1)), "y": ((x0, x1), (z0, z1)), "z": ((x0, x1), (y0, y1))}[axis]
            cands = [b for b in cover if _spans(b, axis, plane - probe, plane + probe)]
            for u in _samples(*us, step):
                for v in _samples(*vs, step):
                    if not any(_covers(b, axis, u, v) for b in cands):
                        holes.append((r, key, round(u, 3), round(v, 3)))
    return holes


def report(kit, rooms=(), tol=1e-3, gap=MIN_GAP, show=20):
    """Print a summary and the findings of the three checks; raise KitError when any of them found something."""
    overlaps = check_coplanar_overlaps(kit, tol, gap)
    contained = check_contained(kit)
    holes = check_enclosure(kit, rooms) if rooms else []
    rendered = [b for b in kit.boxes if b.visible]
    mats = {b.mat.name for b in rendered}
    print(f"KIT: {len(kit.boxes)} boxes, {len(rendered)} rendered, {sum(1 for b in kit.boxes if b.collide)} COL, "
          f"{sum(1 for b in kit.boxes if b.opening)} openings, {len(mats)} materials, {len(kit.floors)} floors/slabs")
    print(f"  coplanar overlaps: {len(overlaps)}")
    for item in overlaps[:show]:
        print("   ", item)
    print(f"  contained boxes: {len(contained)}")
    for item in contained[:show]:
        print("   ", item)
    if rooms:
        print(f"  envelope holes ({len(rooms)} rooms): {len(holes)}")
        for item in holes[:show]:
            print("   ", item)
    if overlaps or contained or holes:
        raise KitError(f"kit check failed: {len(overlaps)} coplanar overlaps, {len(contained)} contained boxes, {len(holes)} envelope holes")
    return overlaps, contained, holes
