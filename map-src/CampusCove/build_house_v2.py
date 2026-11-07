"""Town houses v2: walk-in exterior with real see-through windows + an empty interior (only the kitchen run and the
bathroom fixtures are built in; the player furnishes the rest from Cove Home). Two-storey houses get a walkable stair;
`wing` adds a walk-in single-storey garage on the east side (Cove Heights villas).

Exterior and interior are generated from the same opening list, so every window is a real hole in both shells.
Interior contract (docs/ASSETS_STYLE_GUIDE.md §4): floor y=0, front wall outer face z=5.2, door at x=0, rooms toward -Z.
Exterior: origin = lot origin, front outer face at z=ZF, door on +Z, `Door` node hinged for openHouses.registerFrontDoor.
Outputs: out/houses/<key>/{exterior.glb,interior.glb,interior.colsrc.glb,interior.layout.json,preview.png}.
`interior=dict(plan="estate", ...)` (Cove Heights villas) swaps the duplex for a luxury plan: centre hall with the stair
facing the door and a double-height void under a gallery, formal front rooms, great room with kitchen island and
fireplace, powder room, primary suite with walk-in closet and bath; a style kit (STYLES) dresses it (floors, mouldings,
ceilings, arches, stair, fittings from lib_interior.py).
Run with HOUSE_KEYS = ["house_03"] in the exec globals to build a subset.
Then: `npm run assets:optimize -- houses`, bake (build_house_lightmaps.py -- <keys>), optimize again.
"""
if "__file__" not in globals():
    raise RuntimeError('Run with exec(open(p).read(), {"__file__": p}) so the script can find lib_common.py')
import importlib
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lib_common as L
importlib.reload(L)
import lib_interior as LI
importlib.reload(LI)
import bpy

T = L.SHELL_THICKNESS
GAP = L.SHELL_GAP
FY = L.INTERIOR_FLOOR_Y
Z_FRONT_OUT = L.INTERIOR_FRONT_OUTER_Z
PT = 0.12
SKIN = 0.012
DOOR_H = 2.1
WIN = (0.9, 2.2)
ENTRANCE = (-0.6, 0.6, 0.0, 2.2)
L0_H, L1_Y, L1_H = 2.8, 3.0, 2.6
STAIR_W, STAIR_LEN = 1.2, 4.6
EAVE = 0.6
BB_H, BB_T = 0.09, 0.02
CAS_W, CAS_T = 0.07, 0.025
SILL_D = 0.16
K_D, K_H = 0.62, 0.86

PALETTES = {
    "classic": dict(wall="#f1efe8", wall_pat="planks", wall_acc="#d6d3ca", trim="#fbfaf6", roof="#b54a3c", roof_acc="#933a2f",
                    shutter="#3f6b55", door="#8c3a32", in_wall="#f3ece0", in_bed="#cfdde6", floor="#c49a6c", floor_acc="#a57f55",
                    cabinet="#6f8f7a", worktop="#d8cbb4"),
    "scandi": dict(wall="#7fa3c6", wall_pat="planks", wall_acc="#6b8fb3", trim="#f6f6f2", roof="#4f5a66", roof_acc="#414a55",
                   shutter="#f6f6f2", door="#e6c35a", in_wall="#f5f4f0", in_bed="#e8dcc6", floor="#dcc39d", floor_acc="#c4aa82",
                   cabinet="#ecebe6", worktop="#b9a07d"),
    "sunny": dict(wall="#efd27a", wall_pat="planks", wall_acc="#dcbc62", trim="#fbf8ef", roof="#7a5236", roof_acc="#634129",
                  shutter="#2f6f8a", door="#2f6f8a", in_wall="#f4e8d0", in_bed="#f1d3cb", floor="#c49a6c", floor_acc="#a57f55",
                  cabinet="#d79a3e", worktop="#efe6d4"),
    "sage": dict(wall="#a9d6bf", wall_pat="planks", wall_acc="#93c2ab", trim="#f8f8f3", roof="#4d7a56", roof_acc="#3f6647",
                 shutter="#8a4e6a", door="#8a4e6a", in_wall="#f2efe4", in_bed="#d7e6d6", floor="#d9bf98", floor_acc="#c1a67c",
                 cabinet="#e8e2d2", worktop="#8f9d8a"),
    "navy": dict(wall="#a3523f", wall_pat="tiles", wall_acc="#e2d6c8", trim="#efe8dc", roof="#4f5a66", roof_acc="#414a55",
                 shutter="#1f3150", door="#1f3150", in_wall="#f4f2ec", in_bed="#c7d2e2", floor="#6b5038", floor_acc="#523c29",
                 cabinet="#24365a", worktop="#e8e5de"),
    "blush": dict(wall="#e7b9b5", wall_pat="planks", wall_acc="#d6a5a1", trim="#fbf9f6", roof="#b54a3c", roof_acc="#933a2f",
                  shutter="#fbf9f6", door="#fbf9f6", in_wall="#f7f1ee", in_bed="#f0d5d2", floor="#dcc39d", floor_acc="#c4aa82",
                  cabinet="#f3efe9", worktop="#c9b49a"),
    "terracotta": dict(wall="#cf8a5f", wall_pat="noise", wall_acc="#b9774f", trim="#f1e6d2", roof="#9c9a92", roof_acc="#8a8880",
                       shutter="#5a6b3c", door="#5b3a24", in_wall="#f3e6d2", in_bed="#efd3bf", floor="#c46f4a", floor_acc="#a95c3c",
                       cabinet="#5a6b3c", worktop="#efe5d3", floor_pat="tiles"),
    "mono": dict(wall="#f2f2ef", wall_pat="noise", wall_acc="#e2e2de", trim="#25272b", roof="#8e9196", roof_acc="#7c7f84",
                 shutter="#25272b", door="#25272b", in_wall="#f6f6f4", in_bed="#d9dade", floor="#5c4632", floor_acc="#46352a",
                 cabinet="#2b2d31", worktop="#e9e8e4"),
    "neon": dict(wall="#3b3c44", wall_pat="noise", wall_acc="#33343b", trim="#1c1d22", roof="#5a5b62", roof_acc="#4c4d54",
                 shutter="#9b4dff", door="#e04fc1", in_wall="#e9e7f0", in_bed="#d2c8ea", floor="#4a3a30", floor_acc="#3a2d25",
                 cabinet="#1f2026", worktop="#cfcbd8", neon="#b45cff", neon2="#33e0ff"),
    "forest": dict(wall="#8a5a3a", wall_pat="planks", wall_acc="#6f472d", trim="#efe6cf", roof="#4d7a56", roof_acc="#3f6647",
                   shutter="#2f5a3a", door="#2f5a3a", in_wall="#f1eadb", in_bed="#dfe6cf", floor="#b07f52", floor_acc="#946640",
                   cabinet="#4f6b4a", worktop="#d9c9a8"),
    # American colonial (Cove Heights): white clapboard, teal shutters and door, charcoal shingles
    "colonial": dict(wall="#f4f2ec", wall_pat="planks", wall_acc="#d9d5cb", trim="#fbfaf7", roof="#3e4248", roof_acc="#33363b",
                     shutter="#4d7a7c", door="#365f63", in_wall="#f5f2ea", in_bed="#dfe7e4", floor="#b98a5e", floor_acc="#9c7149",
                     cabinet="#f1efe9", worktop="#3d3f44"),
    # Tuscan Mediterranean (Cove Heights A-01): sand-ochre stucco, cast-stone trim, terracotta, bronze frames.
    # Optional keys (frame, ridge, garage, garage_panel, deck, deck_acc, chimney) fall back to the shared materials.
    "tuscan": dict(wall="#e6c495", wall_pat="noise", wall_acc="#d4ad7a", trim="#efe3cc", roof="#c2643f", roof_acc="#a5502f",
                   shutter="#5b7046", door="#5a3a22", in_wall="#f5ecdc", in_bed="#eadcc4", floor="#c47a52", floor_acc="#a9643f",
                   floor_pat="tiles", cabinet="#6c7a58", worktop="#ece4d6",
                   frame="#3b3129", ridge="#a5502f", garage="#6e4a2c", garage_panel="#5d3e25", deck="#c97b55",
                   deck_acc="#ad6443", chimney="stucco"),
}

# Interior style kits of the estate plan: what makes each villa feel its own once inside (docs/GATED_COMMUNITY.md 7.2d)
STYLES = {
    # American colonial: marble checkerboard hall, wainscoting, crown moulding, coffered great room, painted mantel,
    # white shaker kitchen with a marble island, mahogany handrail on white spindles, brass chandeliers, library study
    "colonial": dict(foyer=("checker", "#efece5", "#2d2f34", 2.0), stone="#8e8a84", rail="#4a2e20", baluster="trim",
                     metal="#c4a15a", fire="mantel", ceiling="coffer", crown=True, panel=("Foyer", "Dining"),
                     island="#eeece8", hood="steel", uppers="cabinet", arch=False, beams=(), art="#6f8fa6", art2="#d9c9a3",
                     shelf="#f3f1ec", closet="#f3f1ec", beam="#5a3d2a", plaster="#f3efe7", vanity_top="#ecebe7",
                     stair_pat="planks", chandelier="brass", gallery="spindle", suite_ceiling="tray", shelves=True,
                     paints=dict(foyer="#e7e1d3", study="#4c6957", dining="#3e596f", suite="#e1e7e4")),
    # Tuscan: stone-tiled hall, plaster arches, terracotta floors, timber beams, hooded fireplace, olive kitchen with
    # open shelves, plaster range hood and a butcher-block island, wrought-iron balusters and chandeliers
    "tuscan": dict(foyer=("tiles", "#d8c6a4", "#bba57f", 1.2), stone="#cbb894", rail="#2b2420", baluster="iron",
                   metal="#2b2622", fire="hood", ceiling="beams", crown=False, panel=(), island="#9b6b44", hood="plaster",
                   uppers="shelf", arch=True, beams=("Living", "GreatW", "Great"), art="#b0643f", art2="#e0c38f", shelf="#6b4a30",
                   closet="#7a5a3c", beam="#5b3f2a", plaster="#efe2cb", vanity_top="#e6dccb", stair_pat="tiles",
                   chandelier="iron", gallery="iron", suite_ceiling="beams", shelves=False,
                   paints=dict(foyer="#f1e1c4", living="#efd8b6", dining="#e8c79a", suite="#f1e1c8")),
}

HOUSES = {
    "house_01": dict(name="Maple Cottage", W=13.2, ZF=3.75, back=-5.0, floors=1, mirror=False, palette="classic", roof="gable_x", rise=3.0,
                     cross=(3.3, 3.9, 1.9), porch="porch", porch_w=6.8, chimney=(4.2, -2.2), windows="classic", flowers=True),
    "house_02": dict(name="Bluebell Bungalow", W=13.6, ZF=3.75, back=-4.6, floors=1, mirror=True, palette="scandi", roof="gable_x", rise=2.6,
                     cross=None, porch="canopy", chimney=None, windows="classic", flowers=False),
    "house_03": dict(name="Sunny Nook", W=12.8, ZF=4.0, back=-5.4, floors=1, mirror=False, palette="sunny", roof="gable_z", rise=2.6,
                     cross=None, porch="porch", porch_w=7.4, chimney=None, windows="classic", flowers=True),
    "house_04": dict(name="Mint Villa", W=14.0, ZF=4.5, back=-5.6, floors=1, mirror=True, palette="sage", roof="gable_x", rise=3.1,
                     cross=(3.5, 4.2, 2.0), porch="porch", porch_w=7.2, chimney=(-4.4, -2.0), windows="classic", flowers=True),
    "house_05": dict(name="Brick Townhouse", W=12.0, ZF=4.5, back=-4.6, floors=2, mirror=False, palette="navy", roof="gable_x", rise=2.8,
                     cross=None, porch="canopy", chimney=(3.8, -1.5), windows="classic", flowers=False),
    "house_06": dict(name="Rose Cottage", W=13.4, ZF=4.5, back=-5.2, floors=1, mirror=True, palette="blush", roof="gable_z", rise=2.7,
                     cross=None, porch="porch", porch_w=6.6, chimney=None, windows="classic", flowers=True),
    "house_07": dict(name="Terracotta Casa", W=14.0, ZF=4.5, back=-6.0, floors=1, mirror=False, palette="terracotta", roof="flat",
                     cross=None, porch="pergola", chimney=None, windows="classic", flowers=True),
    "house_08": dict(name="Modern Cube", W=13.0, ZF=4.75, back=-5.0, floors=2, mirror=True, palette="mono", roof="flat",
                     cross=None, porch="canopy", chimney=None, windows="modern", flowers=False),
    "house_09": dict(name="Neon Loft", W=13.0, ZF=5.0, back=-5.2, floors=2, mirror=False, palette="neon", roof="flat",
                     cross=None, porch="canopy", chimney=None, windows="modern", flowers=False),
    "house_10": dict(name="Forest Lodge", W=14.0, ZF=5.0, back=-6.4, floors=1, mirror=True, palette="forest", roof="gable_x", rise=3.3,
                     cross=(3.6, 4.4, 2.1), porch="porch", porch_w=8.0, chimney=(-4.6, -2.4), windows="classic", flowers=False),
    # Cove Heights lot A-02 (docs/GATED_COMMUNITY.md 7.2b): two-storey colonial + walk-in double garage wing on the east side
    "cove_villa_a02": dict(name="Colonial Villa", W=13.0, ZF=4.0, back=-5.0, floors=2, mirror=False, palette="colonial", roof="gable_x", rise=3.2,
                           cross=(0.0, 4.0, 2.0), porch="porch", porch_w=7.0, chimney=(-4.6, -1.6), windows="classic", flowers=False,
                           wing=dict(w=7.4, d=8.0, rise=2.2, door_w=4.9, door_h=2.3),
                           # centre hall, stair on the west side, library study (west) and formal dining (east) in front;
                           # five-bay facade: four windows + door downstairs, five windows upstairs
                           interior=dict(plan="estate", style="colonial", stair="west", side_room="Study", open_room="Dining",
                                         side_door=(-3.3, -2.4), open_door=(2.9, 4.5, 2.4, "cased"),
                                         front0=[(-4.7, 1.1), (-2.3, 1.1), (2.3, 1.1), (4.7, 1.1)],
                                         front1=[(-4.7, 1.1), (-2.3, 1.1), (0.0, 1.2), (2.3, 1.1), (4.7, 1.1)], open_side0=[])),
    # Cove Heights lot A-01 (docs/GATED_COMMUNITY.md 7.2c.4): Tuscan villa, hip roof, three-arch loggia carrying a balcony,
    # French door upstairs, flat-roofed two-bay garage wing with plank doors
    "cove_villa_a01": dict(name="Villa Serena", W=14.0, ZF=4.0, back=-5.6, floors=2, mirror=False, palette="tuscan",
                           roof="hip", rise=2.6, cross=None, chimney=(-4.8, -2.0), windows="classic", flowers=False,
                           porch="loggia",
                           loggia=dict(w=10.8, d=2.4, pier=0.45, piers=(-5.175, -1.75, 1.75, 5.175), spring=2.25,
                                       arch_rise=0.55, side_rise=0.45, top=3.0, cornice=0.2, balcony=True),
                           french_front=True,
                           wing=dict(w=7.4, d=8.4, roof="flat", doors=2, door_w=2.6, door_h=2.3, door_style="plank"),
                           # mirrored hall: stair on the east side, arched living room (west) and dining off the kitchen
                           # (east); windows centred on the loggia bays, the primary suite (west) opens on the balcony
                           interior=dict(plan="estate", style="tuscan", stair="east", side_room="Dining", open_room="Living",
                                         side_door=(-4.6, -2.4, 2.4, "arch"), open_door=(2.6, 4.6, 2.4, "arch"),
                                         front0=[(-3.46, 1.8), (3.46, 1.8)],
                                         front1=[(-3.46, 2.2, "french"), (0.0, 1.0), (3.46, 1.8)], open_side0=[(2.6, 1.6)])),
}


def solid_runs(a0, a1, gaps):
    runs, cur = [], a0
    for a, b in sorted(gaps):
        if a - cur > 0.02:
            runs.append((cur, a))
        cur = max(cur, b)
    if a1 - cur > 0.02:
        runs.append((cur, a1))
    return runs


def scale_uvs(objs, k, kv=None):
    kv = k if kv is None else kv
    for o in objs:
        for d in o.data.uv_layers[0].data:
            d.uv = (d.uv[0] * k, d.uv[1] * kv)


def tri_count(objs):
    return sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs if o.type == "MESH")


def centered(c, w):
    return (c - w / 2, c + w / 2)


class Mirror:
    def __init__(self, coll, cols, m):
        self.coll, self.cols, self.m = coll, cols, m

    def x(self, v):
        return self.m * v

    def span(self, a, b):
        return tuple(sorted((self.m * a, self.m * b)))

    def box(self, name, x, z, y0, sx, sz, h, mat, **kw):
        return L.box(self.coll, name, self.m * x, z, y0, sx, sz, h, mat, **kw)

    def cyl(self, name, x, z, y0, r, h, mat, **kw):
        return L.cyl(self.coll, name, self.m * x, z, y0, r, h, mat, **kw)

    def cone(self, name, x, z, y0, r1, r2, h, mat, **kw):
        return L.cone(self.coll, name, self.m * x, z, y0, r1, r2, h, mat, **kw)

    def furn(self, name, x, z, rot, parts):
        mirrored = [(self.m * p[0], *p[1:]) for p in parts]
        return L.furn(self.coll, name, self.m * x, z, self.m * rot, mirrored)

    def col(self, name, x, z, y0, sx, sz, h):
        return self.cols.add(name, self.m * x, z, y0, sx, sz, h)

    def wall(self, name, axis, fixed, thick, a0, a1, h, mat, openings=(), y0=0.0, solid=True, glass=None):
        if axis == "x":
            a0, a1 = self.span(a0, a1)
            ops = [(*self.span(a, b), lo, hi) for a, b, lo, hi in openings]
        else:
            fixed = self.m * fixed
            ops = list(openings)
        before = len(self.cols.items) if self.cols is not None else 0
        objs = L.wall(self.coll, name, axis, fixed, thick, a0, a1, h, mat, openings=ops,
                      cols=self.cols if solid else None, glass=glass, col_tag=name.replace("Walls_", "Wall_"))
        if y0:
            for o in objs:
                o.location.z += y0
            if solid:
                for o in self.cols.items[before:]:
                    o.location.z += y0
        return objs


class Plan:
    def __init__(self, h):
        self.h = h
        self.W = h["W"]
        self.x_out = self.W / 2 - T - GAP
        self.xi = self.x_out - T
        self.zi_f = Z_FRONT_OUT - T
        self.z_back_out = h["back"]
        self.zi_b = self.z_back_out + T
        self.levels = [dict(id="L0", y=0.0, height=L0_H)]
        if h["floors"] == 2:
            self.levels.append(dict(id="L1", y=L1_Y, height=L1_H))
        self.rooms = []
        self.partitions = []
        self.windows = []
        self.doorways = []
        self.lights = []
        self.stair = None
        self.kitchen = None
        self.bath = None
        self.wing = None
        self.l1_rects = None  # estate: walkable rects of the upper floor (the void and the stair well left out)
        self.fit = None  # estate: where build_estate puts the fittings
        if h.get("wing"):
            # walk-in garage beside the east wall, one storey: the room runs from the main shell's outer face to the
            # wing's own shell, front flush with the main front (same Z_FRONT_OUT contract), `d` deep outside
            assert h["floors"] == 2 and not h["mirror"], "the garage wing is laid out for the east side of a duplex"
            wg = h["wing"]
            hw = self.W / 2
            x_ext = hw + wg["w"]
            xo = x_ext - T - GAP
            zb_g = Z_FRONT_OUT - wg["d"] + 3 * T + 2 * GAP
            zc = (zb_g + self.zi_f) / 2
            self.wing = dict(wg, x_in=hw, xi=xo - T, xo=xo, x_ext=x_ext, zb=zb_g, zf=self.zi_f,
                             windows=[(zc - 0.7, zc + 0.7, 1.0, 2.0)])
            self.lights.append(("Garage", 0, (hw + xo - T) / 2, zc))
        if h.get("interior", {}).get("plan") == "estate":
            self.estate()
        elif h["floors"] == 2:
            self.duplex()
        else:
            self.cottage()

    def room(self, name, level, x0, x1, z0, z1, floor="wood", paint=None, wainscot=False, light=True, baseboard=True,
             open=(), panel=False, crown=None):
        """floor None: no floor slab (the double-height void, finished on its walls only). open: sides ('W' x0, 'E' x1,
        'S' z0, 'N' z1) with no wall, where the slab is not run under the partition line, so two rooms meeting there
        abut instead of overlapping. panel: wainscoting to 0.95 m; crown: (y, height) of a moulding along the walls."""
        self.rooms.append(dict(name=name, level=level, rect=(x0, x1, z0, z1), floor=floor, paint=paint, wainscot=wainscot,
                               baseboard=baseboard, open=tuple(open), panel=panel, crown=crown))
        if light:
            self.lights.append((name, level, (x0 + x1) / 2, (z0 + z1) / 2))

    def window(self, side, a, b, level=0, y=WIN, kind="window"):
        """An opening in an outer wall, cut in both shells. kind 'door' = an inner doorway (to the garage wing): no sill,
        no exterior dressing."""
        self.windows.append(dict(side=side, a=a, b=b, level=level, y0=y[0], y1=y[1], kind=kind))

    def partition(self, name, axis, fixed, a0, a1, level=0, doors=(), h=None):
        """doors: (a, b) or (a, b, height, style) with style 'cased' (casings) or 'arch' (plaster arch, no casing).
        h: wall height when it must run past the room height (beside the double-height void)."""
        ds = [(d[0], d[1], d[2] if len(d) > 2 else DOOR_H, d[3] if len(d) > 3 else "cased") for d in doors]
        self.partitions.append(dict(name=name, axis=axis, fixed=fixed, a0=a0, a1=a1, level=level, doors=ds, h=h))
        for a, b, hh, st in ds:
            self.doorways.append(dict(axis=axis, fixed=fixed, a=a, b=b, level=level, h=hh, style=st))

    def living_front_window(self, x_left):
        a, b = 0.9, self.xi - 0.4
        w = min(2.6, b - a - 0.4)
        self.window("front", *centered((a + b) / 2, w))
        if -0.9 - x_left > 1.6:
            self.window("front", *centered((x_left - 0.9) / 2, min(1.6, -0.9 - x_left - 0.6)))

    def cottage(self):
        xi, zf, zb = self.xi, self.zi_f, self.zi_b
        part_x = -xi + 4.4
        depth = zf - zb
        bed1_z = zf - ((depth - 2.8) / 2 + 0.3)
        bed2_z = bed1_z - 2.8
        xl1, xr0 = part_x - PT / 2, part_x + PT / 2
        bath_mid = (bed1_z + bed2_z) / 2
        self.partition("Walls_PartX", "z", part_x, zb, zf, doors=[(bed1_z + 0.5, bed1_z + 1.4), centered(bath_mid + 0.2, 0.8), (bed2_z - 1.3, bed2_z - 0.4)])
        self.partition("Walls_PartBed1", "x", bed1_z, -xi, xl1)
        self.partition("Walls_PartBed2", "x", bed2_z, -xi, xl1)
        kitchen_z = zb + 2.4
        self.room("Bed1", 0, -xi, xl1, bed1_z + PT / 2, zf, paint="bed")
        self.room("Bath", 0, -xi, xl1, bed2_z + PT / 2, bed1_z - PT / 2, floor="bath", wainscot=True, baseboard=False)
        self.room("Bed2", 0, -xi, xl1, zb, bed2_z - PT / 2, paint="bed")
        self.room("Living", 0, xr0, xi, kitchen_z, zf, light=False)
        self.room("Kitchen", 0, xr0, xi, zb, kitchen_z, floor="tile", light=False)
        cx = (xr0 + xi) / 2
        self.lights += [("Living", 0, cx + 0.4, (kitchen_z + zf) / 2 + 1.2), ("Dining", 0, cx + 0.4, kitchen_z + 0.8),
                        ("Entry", 0, 0.0, zf - 1.6), ("KitchenSink", 0, (xr0 + 2.8 + xi) / 2, zb + 1.2)]
        bed_mid = (-xi + xl1) / 2
        self.window("front", *centered(bed_mid, 1.6))
        self.living_front_window(xr0)
        self.window("west", *centered((bed1_z + zf) / 2 + 0.1, 1.5))
        self.window("west", *centered(bath_mid, 0.8), y=(1.5, 2.1))
        self.window("west", *centered((zb + bed2_z) / 2, 1.5))
        self.window("east", *centered((kitchen_z + zf) / 2 + 0.6, 2.0))
        self.window("east", *centered(kitchen_z + 0.7, 1.8))
        self.window("back", *centered(bed_mid, 1.6))
        k_x0 = xr0 + 2.8
        sink_x = (k_x0 + xi) / 2
        self.window("back", *centered(sink_x, 1.6), y=(1.05, 2.15))
        self.kitchen = dict(x0=k_x0, x1=xi, ret_z=zb + 1.6, sink_x=sink_x)
        self.bath = dict(x0=-xi, x1=xl1, z0=bed2_z + PT / 2, z1=bed1_z - PT / 2, door_side="east")

    def duplex(self):
        xi, zf, zb = self.xi, self.zi_f, self.zi_b
        sx1 = -xi + STAIR_W
        foot = zf - 1.0
        top = foot - STAIR_LEN
        self.stair = dict(x0=-xi, x1=sx1, z0=top, z1=foot)
        bath_x1 = -xi + 3.0
        kitchen_z = zb + 2.4
        self.partition("Walls_BathFront", "x", top - PT / 2, -xi, bath_x1 + PT / 2)
        self.partition("Walls_BathSide", "z", bath_x1, zb, top - PT, doors=[centered((zb + top) / 2, 0.8)])
        self.room("Bath", 0, -xi, bath_x1 - PT / 2, zb, top - PT, floor="bath", wainscot=True, baseboard=False)
        self.room("Living", 0, bath_x1 + PT / 2, xi, kitchen_z, zf, light=False)
        self.room("Hall", 0, sx1 + 0.06, bath_x1 + PT / 2, top, zf, light=False)
        self.room("Kitchen", 0, bath_x1 + PT / 2, xi, zb, kitchen_z, floor="tile", light=False)
        self.room("Entry", 0, -xi, sx1 + 0.06, foot, zf, light=False)
        cx = (bath_x1 + xi) / 2
        self.lights += [("Living", 0, cx + 0.4, (kitchen_z + zf) / 2 + 1.2), ("Dining", 0, cx + 0.4, kitchen_z + 0.8),
                        ("Entry", 0, -1.2, zf - 1.6), ("KitchenSink", 0, (bath_x1 + 3.2 + xi) / 2, zb + 1.2)]
        self.living_front_window(sx1 + 0.3)
        if self.wing:
            self.window("east", *centered(zf - 2.2, 1.0), y=(0.0, DOOR_H), kind="door")  # living -> garage
        else:
            self.window("east", *centered((kitchen_z + zf) / 2 + 0.6, 2.0))
            self.window("east", *centered(kitchen_z + 0.7, 1.8))
        self.window("west", *centered((zb + top) / 2, 0.8), y=(1.5, 2.1))
        k_x0 = bath_x1 + PT / 2 + 0.5
        sink_x = (k_x0 + xi) / 2
        self.window("back", *centered(sink_x, 1.6), y=(1.05, 2.15))
        self.kitchen = dict(x0=k_x0, x1=xi, ret_z=zb + 1.6, sink_x=sink_x)
        self.bath = dict(x0=-xi, x1=bath_x1 - PT / 2, z0=zb, z1=top - PT, door_side="east")
        corridor_x = -xi + 2.6
        cx1 = corridor_x + PT / 2
        third = (zf - zb) / 3
        b1, b2 = zf - third, zb + third
        self.partition("Walls_Corridor", "z", corridor_x, top, zf, level=1,
                       doors=[centered(b1 + third / 2, 0.9), centered((b1 + b2) / 2, 0.9)])
        self.partition("Walls_Corridor_Back", "z", corridor_x, zb, top, level=1, doors=[centered((zb + b2) / 2 + 0.6, 0.9)])
        self.partition("Walls_Bed1", "x", b1, cx1, xi, level=1)
        self.partition("Walls_Bed2", "x", b2, cx1, xi, level=1)
        self.room("Landing", 1, -xi, corridor_x - PT / 2, zb, top)
        self.room("Corridor", 1, sx1 + 0.06, corridor_x - PT / 2, top, zf, light=False)
        self.room("LandingFront", 1, -xi, sx1 + 0.06, foot, zf, light=False)
        self.room("Bed1", 1, cx1, xi, b1 + PT / 2, zf, paint="bed")
        self.room("Bed2", 1, cx1, xi, b2 + PT / 2, b1 - PT / 2, paint="bed")
        self.room("Bed3", 1, cx1, xi, zb, b2 - PT / 2, paint="bed")
        self.lights.append(("Corridor", 1, (sx1 + corridor_x) / 2 + 0.3, (top + zf) / 2))
        rmid = (cx1 + xi) / 2
        if self.h.get("french_front"):  # opens onto the loggia balcony (visual only: the hole is blocked)
            self.window("front", *centered(rmid, 2.2), level=1, y=(0.05, 2.30), kind="french")
        else:
            self.window("front", *centered(rmid, 2.2), level=1)
        self.window("front", *centered((-xi + corridor_x) / 2, 1.0), level=1)
        self.window("back", *centered(rmid, 1.8), level=1)
        self.window("back", *centered((-xi + corridor_x) / 2, 1.2), level=1)
        for zz0, zz1 in ((b1, zf), (b2, b1), (zb, b2)):
            self.window("east", *centered((zz0 + zz1) / 2, 1.6), level=1)
        self.window("west", *centered((top + foot) / 2, 1.4), level=1)
        self.window("west", *centered((zb + top) / 2, 1.2), level=1)

    def estate(self):
        """Luxury two-storey plan (docs/GATED_COMMUNITY.md 7.2d). Written with the stair on the west side of the hall and
        mirrored across x = 0 when `stair` is 'east'; the great room (kitchen east, by the garage door), the powder room
        and the fireplace keep their side.
        L0: centre hall (double height, stair facing the door), a side room behind the stair wall (reached from the
        great room), an open room through a wide opening, great room across the back (family + fireplace west, kitchen
        with island east), powder room in the west back corner.
        L1: corridor and gallery over the hall, bedrooms 2 and 3 on the stair side, bath 2 at the back, the primary
        suite (bedroom, walk-in closet, bath with tub) on the other side."""
        I = self.h["interior"]
        S = STYLES[I["style"]]
        assert self.wing and self.h["floors"] == 2 and not self.h["mirror"], "the estate plan is a duplex with the east garage"
        xi, zf, zb = self.xi, self.zi_f, self.zi_b
        m = 1 if I["stair"] == "west" else -1
        e = PT / 2

        def fs(a, b):
            return tuple(sorted((m * a, m * b)))

        def side(nm):
            swap = {"W": "E", "E": "W", "west": "east", "east": "west"}
            return swap.get(nm, nm) if m < 0 else nm

        def R(name, level, x0, x1, z0, z1, open=(), **kw):
            self.room(name, level, *fs(x0, x1), z0, z1, open=[side(o) for o in open], **kw)

        def Pz(name, x, a0, a1, level, doors=(), h=None):
            self.partition(name, "z", m * x, a0, a1, level, doors, h)

        def Px(name, z, a0, a1, level, doors=(), h=None):
            self.partition(name, "x", z, *fs(a0, a1), level, [(*fs(d[0], d[1]), *d[2:]) for d in doors], h)

        HX = 1.6                    # hall half width (partitions at +-HX)
        FOOT = zf - 0.8             # stair foot
        TOP = FOOT - STAIR_LEN      # stair top = upper corridor front edge
        ZP = TOP + 0.4              # back partition of the hall and the front rooms
        CB = TOP - 1.2              # upper back row: bedroom 3, bath 2, closet, primary bath
        GZ = TOP + 1.0              # gallery edge over the hall
        CX = HX + 1.3               # closet | primary bath
        sx0 = -HX + e
        sx1 = sx0 + STAIR_W
        PX, PZ = -3.6, zb + 1.56    # powder room in the west back corner
        k0 = 1.0                    # kitchen run start
        crown = (L0_H - 0.12, 0.12) if S["crown"] else None
        cased = "arch" if S["arch"] else "cased"
        side_room, open_room = I["side_room"], I["open_room"]

        R("Foyer", 0, -HX + e, HX - e, ZP + e, zf, floor="foyer", paint="foyer", panel="Foyer" in S["panel"],
          crown=(L0_H - 0.04, 0.26), light=False)
        R(side_room, 0, -xi, -HX - e, ZP + e, zf, paint=side_room.lower(), panel=side_room in S["panel"], crown=crown,
          light=side_room != "Dining")
        R(open_room, 0, HX + e, xi, ZP + e, zf, paint=open_room.lower(), panel=open_room in S["panel"], crown=crown,
          light=open_room != "Dining")
        self.room("Powder", 0, -xi, PX - e, zb, PZ - e, floor="bath", wainscot=True, baseboard=False)
        self.room("GreatW", 0, -xi, PX + e, PZ + e, ZP - e, open=("E",), crown=crown, light=False)
        self.room("Great", 0, PX + e, xi, zb, ZP - e, open=("W",), crown=crown, light=False)
        Pz("Walls_HallStair", -HX, ZP, zf, 0, h=L1_Y)
        Pz("Walls_HallOpen", HX, ZP, zf, 0, doors=[(ZP + 1.2, zf - 1.0, 2.4, cased)], h=L1_Y)
        Px("Walls_BackSide", ZP, -xi, -HX, 0, doors=[I["side_door"]])
        Px("Walls_BackOpen", ZP, sx1, xi, 0, doors=[(sx1 + 0.12, HX - 0.12, 2.4, cased), I["open_door"]])
        # the top of the flight runs past the hall into the great room: boxed in with plaster walls
        Pz("Walls_StairBoxW", -HX, TOP - PT, ZP, 0)
        Pz("Walls_StairBoxE", sx1 + e, TOP - PT, ZP, 0)
        Px("Walls_StairBoxBack", TOP - e, -HX, sx1 + PT, 0)
        self.partition("Walls_PowderN", "x", PZ, -xi, PX + e, 0, doors=[(-5.3, -4.5)])
        self.partition("Walls_PowderE", "z", PX, zb, PZ + e, 0)
        for c, w, *_ in I["front0"]:
            self.window("front", *centered(c, w))
        self.window("back", *centered(-4.9, 0.7), y=(1.5, 2.1))
        for c in (-2.5, -0.5):
            self.window("back", *centered(c, 1.4))
        sink_x = (k0 + xi) / 2
        self.window("back", *centered(sink_x, 1.6), y=(1.05, 2.15))
        self.window("east", *centered(-1.0, 1.0), y=(0.0, DOOR_H), kind="door")  # kitchen -> garage
        for zc, w in I["open_side0"]:
            self.window(side("east"), *centered(zc, w))
        self.lights += [("Family", 0, -2.4, (zb + ZP) / 2), ("Kitchen", 0, sink_x, zb + 1.2)]

        R("Corridor", 1, -xi, HX - e, CB + e, TOP, open=("N",), light=False)
        R("Gallery", 1, sx1, HX - e, TOP, GZ, open=("S", "W", "N"), light=False)
        R("Bed2", 1, -xi, -HX - e, TOP + PT, zf, paint="bed")
        R("Bed3", 1, -xi, -HX - e, zb, CB - e, paint="bed")
        R("Bath2", 1, -HX + e, HX - e, zb, CB - e, floor="bath", wainscot=True, baseboard=False)
        R("Suite", 1, HX + e, xi, CB + e, zf, paint="suite")
        R("Closet", 1, HX + e, CX - e, zb, CB - e)
        R("PrimaryBath", 1, CX + e, xi, zb, CB - e, floor="bath", wainscot=True, baseboard=False)
        R("FoyerUpper", 1, sx1, HX - e, GZ, zf, floor=None, paint="foyer", baseboard=False, light=False)
        R("StairWell", 1, -HX + e, sx1, TOP, zf, floor=None, paint="foyer", baseboard=False, light=False)
        Pz("Walls_StairWell", -HX, TOP, zf, 1)
        Px("Walls_Bed2S", TOP + e, -xi, -HX, 1, doors=[(-3.6, -2.7)])
        Px("Walls_BackRow", CB, -xi, xi, 1, doors=[(-3.6, -2.7), (-0.45, 0.45), (HX + 0.25, HX + 0.95), (CX + 0.6, CX + 1.4)])
        Pz("Walls_SuiteW", HX, zb, zf, 1, doors=[(CB + 0.25, TOP - 0.15)])
        Pz("Walls_Bed3E", -HX, zb, CB, 1)
        Pz("Walls_Closet", CX, zb, CB, 1)
        for c, w, *kind in I["front1"]:
            french = kind == ["french"]
            self.window("front", *centered(c, w), level=1, y=(0.05, 2.30) if french else WIN, kind="french" if french else "window")
        self.window("back", *centered(m * -3.85, 1.6), level=1)
        self.window("back", *centered(m * -0.2, 0.6), level=1, y=(1.5, 2.1))
        self.window("back", *centered(m * (CX + e + xi) / 2, 1.2), level=1, y=(1.0, 2.0))
        self.window(side("west"), *centered(2.4, 1.4), level=1)
        self.window(side("west"), *centered((zb + CB) / 2, 1.2), level=1)
        for zc in (0.6, 3.4):
            self.window(side("east"), *centered(zc, 1.2), level=1)
        self.lights += [("Corridor", 1, m * -3.6, (CB + TOP) / 2), ("Gallery", 1, m * 0.6, (TOP + GZ) / 2)]

        a, b = fs(sx0, sx1)
        self.stair = dict(x0=a, x1=b, z0=TOP, z1=FOOT, open=m, foot_rail=False, back_col=ZP - TOP, rail="rail",
                          baluster="iron" if S["baluster"] == "iron" else "trim", newel=True)
        self.kitchen = dict(x0=k0, x1=xi, ret_z=zb + 1.6, sink_x=sink_x, hood=(k0 + 0.65, 0.9), uppers=S["uppers"])
        self.l1_rects = [fs(-xi, -HX) + (zb, zf), fs(HX, xi) + (zb, zf), (-HX, HX, zb, TOP), fs(sx1, HX) + (TOP, GZ)]
        self.fit = dict(m=m, S=S, I=I, HX=HX, FOOT=FOOT, TOP=TOP, ZP=ZP, CB=CB, GZ=GZ, CX=CX, sx1=sx1, PX=PX, PZ=PZ, k0=k0)

    def outer_openings(self, side, level):
        ops = [(w["a"], w["b"], w["y0"], w["y1"]) for w in self.windows if w["side"] == side and w["level"] == level]
        if side == "front" and level == 0:
            ops.append(ENTRANCE)
        return ops

    def layout(self, mirror):
        m = mirror.m
        sx = lambda a, b: sorted((m * a, m * b))
        xi, zf, zb = self.xi, self.zi_f, self.zi_b
        r = lambda x0, x1, z0, z1: dict(zip(("minX", "maxX"), [round(v, 4) for v in sx(x0, x1)]), minZ=round(z0, 4), maxZ=round(z1, 4))
        levels = [dict(id="L0", y=0.0, height=L0_H, rects=[r(-xi, xi, zb, Z_FRONT_OUT)])]
        if self.wing:
            g = self.wing
            levels[0]["rects"].append(r(xi, g["xi"], g["zb"], g["zf"]))
        stairs = []
        if self.l1_rects:
            s = self.stair
            levels.append(dict(id="L1", y=L1_Y, height=L1_H, rects=[r(*q) for q in self.l1_rects]))
            stairs.append(dict(name="Stair_Main", **r(s["x0"], s["x1"], s["z0"], s["z1"]), y0=0.0, y1=L1_Y, rise="-z"))
        elif self.stair:
            s = self.stair
            levels.append(dict(id="L1", y=L1_Y, height=L1_H, rects=[r(s["x1"], xi, zb, zf), r(-xi, s["x1"], zb, s["z0"]), r(-xi, s["x1"], s["z1"], zf)]))
            stairs.append(dict(name="Stair_Main", **r(s["x0"], s["x1"], s["z0"], s["z1"]), y0=0.0, y1=L1_Y, rise="-z"))
        return dict(version=1, key=self.h["key"], levels=levels, stairs=stairs)


def build_interior(key, h, P):
    sc = L.new_build_scene("HOUSE_" + key + "_interior")
    coll = bpy.data.collections.new("Interior")
    sc.collection.children.link(coll)
    cols = L.Collisions(coll)
    B = Mirror(coll, cols, -1 if h["mirror"] else 1)
    C = PALETTES[h["palette"]]
    M = {
        "wall": L.make_mat(f"IN_{key}_WallMain", C["in_wall"], 0.9, "noise", 0.02),
        "bed": L.make_mat(f"IN_{key}_WallBedroom", C["in_bed"], 0.9, "noise", 0.02),
        "ceil": L.make_mat("IN_Ceiling", "#f6f4ef", 0.95, "noise", 0.01),
        "wood": L.make_mat(f"IN_{key}_FloorMain", C["floor"], 0.6, C.get("floor_pat", "planks"), 0.04, accent=C["floor_acc"]),
        "tile": L.make_mat(f"IN_{key}_FloorTile", "#d9d4ca", 0.3, "tiles", 0.02, accent="#b9b3a7"),
        "bath": L.make_mat(f"IN_{key}_BathTile", "#e8f0f0", 0.25, "tiles", 0.02, accent="#c4d2d3"),
        "splash": L.make_mat(f"IN_{key}_Backsplash", "#e3eef0", 0.25, "tiles", 0.02, accent="#9fb9be"),
        "trim": L.make_mat("IN_TrimWhite", "#f7f6f2", 0.5, "noise", 0.01),
        "cabinet": L.make_mat(f"IN_{key}_Cabinet", C["cabinet"], 0.55, "noise", 0.02),
        "worktop": L.make_mat(f"IN_{key}_Worktop", C["worktop"], 0.35, "noise", 0.03),
        "steel": L.make_mat("IN_Steel", "#b9bec6", 0.35, "noise", 0.03),
        "dark": L.make_mat("IN_MetalDark", "#3a3f47", 0.4, "noise", 0.03),
        "ceramic": L.make_mat("IN_Ceramic", "#f8f8f6", 0.2, "noise", 0.01),
        "glass": L.make_mat("IN_Glass", "#bfe4f2", 0.1, "noise", 0.01, alpha=0.28),
        "mirror": L.make_mat("IN_Mirror", "#cfe3ea", 0.05, "noise", 0.01),
        "lamp": L.make_mat("IN_LightPanel", "#fffbe8", 0.5, "noise", 0.0, emit="#fff4d0"),
        "door": L.make_mat(f"IN_{key}_DoorWood", C["door"], 0.45, "planks", 0.03, accent=C["door"]),
        "sign": L.make_mat(f"IN_{key}_Sign", "#e0b34a", 0.5, "noise", 0.02),
        "mat": L.make_mat("IN_Doormat", "#3b3b43", 1.0, "stripes", 0.03, accent="#2b2b32"),
        "sky": L.make_mat("IN_SkyBackdrop", "#a9cdee", 1.0, "noise", 0.01),
        "stair": L.make_mat(f"IN_{key}_StairWood", C["floor"], 0.55, "planks", 0.03, accent=C["floor_acc"]),
        "concrete": L.make_mat("IN_GarageConcrete", "#a9a8a3", 0.85, "noise", 0.05),
        "garage_wall": L.make_mat("IN_GarageWall", "#e7e5df", 0.9, "noise", 0.03),
        "garage_door": L.make_mat("IN_GarageDoorInside", "#f2f0ea", 0.7, "stripes", 0.03, accent="#dcd9d1"),
    }
    if P.fit:
        S = P.fit["S"]
        fl = S["foyer"]
        M.update({
            "foyer_floor": L.make_mat(f"IN_{key}_FoyerFloor", fl[1], 0.3, fl[0], 0.02, accent=fl[2]),
            "panel": L.make_mat(f"IN_{key}_Wainscot", "#f7f5f0", 0.5, "tiles", 0.01, accent="#d9d5ca"),
            "rail": L.make_mat(f"IN_{key}_Handrail", S["rail"], 0.45, "noise", 0.02),
            "iron": L.make_mat("IN_WroughtIron", "#2a2622", 0.45, "noise", 0.03),
            "stone": L.make_mat(f"IN_{key}_Stone", S["stone"], 0.8, "tiles", 0.04, accent=S["stone"]),
            "soot": L.make_mat("IN_Firebox", "#2a2624", 0.95, "noise", 0.04),
            "art": L.make_mat(f"IN_{key}_Painting", S["art"], 0.7, "stripes", 0.06, accent=S["art2"]),
            "books": L.make_mat("IN_Books", "#7d3a30", 0.8, "stripes", 0.08, accent="#2f4a62"),
            "shelf": L.make_mat(f"IN_{key}_Joinery", S["shelf"], 0.6, "planks", 0.03, accent=S["shelf"]),
            "fabric": L.make_mat("IN_Clothes", "#5b6f8a", 0.95, "stripes", 0.06, accent="#c9b8a0"),
            "closet": L.make_mat(f"IN_{key}_Wardrobe", S["closet"], 0.55, "noise", 0.02),
            "beam": L.make_mat(f"IN_{key}_Beam", S["beam"], 0.8, "planks", 0.05, accent=S["beam"]),
            "plaster": L.make_mat(f"IN_{key}_Plaster", S["plaster"], 0.95, "noise", 0.03),
            "fixture": L.make_mat(f"IN_{key}_Fixture", S["metal"], 0.35, "noise", 0.02),
            "candle": L.make_mat("IN_Candle", "#fff6e0", 0.5, "noise", 0.0, emit="#ffe6b0"),
            "island_top": L.make_mat(f"IN_{key}_IslandTop", S["island"], 0.3, "noise", 0.03),
            "vanity_top": L.make_mat(f"IN_{key}_VanityTop", S["vanity_top"], 0.25, "noise", 0.02),
            "water": L.make_mat("IN_BathWater", "#9cc9d6", 0.05, "noise", 0.01),
            "stair": L.make_mat(f"IN_{key}_StairWood", C["floor"], 0.55, S["stair_pat"], 0.03, accent=C["floor_acc"]),
        })
        for nm, col in S["paints"].items():
            M[nm] = L.make_mat(f"IN_{key}_Wall{nm.title()}", col, 0.9, "noise", 0.02)
    io = []
    xi, x_out, zf, zb = P.xi, P.x_out, P.zi_f, P.zi_b
    two = len(P.levels) == 2
    lvl_y = [lv["y"] for lv in P.levels]
    lvl_h = [lv["height"] for lv in P.levels]

    for rm in P.rooms:
        if rm["floor"] is None:
            continue
        op = rm["open"]
        x0, x1, z0, z1 = rm["rect"]
        x0, x1 = x0 - (0 if "W" in op else PT / 2), x1 + (0 if "E" in op else PT / 2)
        z0, z1 = z0 - (0 if "S" in op else PT / 2), z1 + (0 if "N" in op else PT / 2)
        y = lvl_y[rm["level"]]
        mat = {"bath": M["bath"], "tile": M["tile"], "foyer": M.get("foyer_floor")}.get(rm["floor"], M["wood"])
        tile = P.fit["S"]["foyer"][3] if rm["floor"] == "foyer" else 2.0
        o = B.box(f"House_Floor_{rm['name']}", (x0 + x1) / 2, (z0 + z1) / 2, y - 0.1, x1 - x0, z1 - z0, 0.1, mat, tile=tile)
        if rm["floor"] == "bath":
            scale_uvs([o], 2.0)
        elif rm["floor"] == "wood" and C.get("floor_pat", "planks") == "planks":
            scale_uvs([o], 2.5)
        io.append(o)
        if rm["level"] == 1:
            io.append(B.box(f"Ceiling_Under{rm['name']}", (x0 + x1) / 2, (z0 + z1) / 2, L0_H, x1 - x0, z1 - z0, 0.1, M["ceil"], tile=2.0))
    top_level = len(P.levels) - 1
    io.append(B.box("Ceiling", 0, (Z_FRONT_OUT + P.z_back_out) / 2, lvl_y[top_level] + lvl_h[top_level], 2 * x_out, Z_FRONT_OUT - P.z_back_out, 0.1, M["ceil"], tile=2.0))

    for li, lv in enumerate(P.levels):
        h_wall = L1_Y if (two and li == 0) else lv["height"]
        y0 = lv["y"]
        sfx = f"_L{li}" if two else ""
        io += B.wall(f"Walls_Front{sfx}", "x", zf + T / 2, T, -x_out, x_out, h_wall, M["wall"], openings=P.outer_openings("front", li), y0=y0)
        io += B.wall(f"Walls_Back{sfx}", "x", zb - T / 2, T, -x_out, x_out, h_wall, M["wall"], openings=P.outer_openings("back", li), y0=y0)
        io += B.wall(f"Walls_W{sfx}", "z", -xi - T / 2, T, zb, zf, h_wall, M["wall"], openings=P.outer_openings("west", li), y0=y0)
        io += B.wall(f"Walls_E{sfx}", "z", xi + T / 2, T, zb, zf, h_wall, M["wall"], openings=P.outer_openings("east", li), y0=y0)
    for p in P.partitions:
        ops = [(a, b, 0.0, hh) for a, b, hh, _ in p["doors"]]
        io += B.wall(p["name"], p["axis"], p["fixed"], PT, p["a0"], p["a1"], p["h"] or lvl_h[p["level"]], M["wall"], openings=ops,
                     y0=lvl_y[p["level"]])
    for i, d in enumerate(P.doorways):  # plaster arch filling the top of an arched opening (Tuscan)
        if d["style"] != "arch":
            continue
        y = lvl_y[d["level"]] + d["h"]
        if d["axis"] == "x":
            io.append(L.arch_panel(coll, f"Walls_Arch{i}", "x", d["fixed"], *B.span(d["a"], d["b"]), y - 0.42, 0.38, y, PT + 4 * SKIN, M["wall"]))
        else:
            io.append(L.arch_panel(coll, f"Walls_Arch{i}", "z", B.x(d["fixed"]), d["a"], d["b"], y - 0.42, 0.38, y, PT + 4 * SKIN, M["wall"]))

    holes = [dict(axis="x" if w["side"] in ("front", "back") else "z",
                  fixed={"front": zf, "back": zb, "west": -xi, "east": xi}[w["side"]],
                  a=w["a"], b=w["b"], y0=w["y0"], y1=w["y1"], level=w["level"]) for w in P.windows]
    holes.append(dict(axis="x", fixed=zf, a=ENTRANCE[0], b=ENTRANCE[1], y0=0.0, y1=ENTRANCE[3], level=0))
    holes += [dict(axis=d["axis"], fixed=d["fixed"], a=d["a"], b=d["b"], y0=0.0, y1=d["h"], level=d["level"]) for d in P.doorways]
    walls = [("x", zf, -xi, xi, None), ("x", zb, -xi, xi, None), ("z", -xi, zb, zf, None), ("z", xi, zb, zf, None)]
    for p in P.partitions:
        for sgn in (1, -1):
            walls.append((p["axis"], p["fixed"] + sgn * PT / 2, p["a0"], p["a1"], p["level"]))

    def walled(axis, fixed, a0, a1, level):
        spans = [(max(a, a0), min(b, a1)) for ax, f, a, b, lv in walls
                 if ax == axis and abs(f - fixed) < 0.02 and lv in (None, level) and min(b, a1) - max(a, a0) > 0.02]
        merged = []
        for a, b in sorted(spans):
            if merged and a <= merged[-1][1] + 0.01:
                merged[-1] = (merged[-1][0], max(merged[-1][1], b))
            else:
                merged.append((a, b))
        return merged

    def face_holes(axis, fixed, a0, a1, level):
        out = []
        for hl in holes:
            if hl["axis"] == axis and hl["level"] == level and abs(hl["fixed"] - fixed) < 0.16 and hl["b"] > a0 + 0.01 and hl["a"] < a1 - 0.01:
                out.append((max(hl["a"], a0), min(hl["b"], a1), hl["y0"], min(hl["y1"], lvl_h[level])))
        return out

    trims = []

    def finish_face(rm, tag, axis, fixed, a0, a1, inward):
        lv = rm["level"]
        y = lvl_y[lv]
        hl = face_holes(axis, fixed, a0, a1, lv)
        layers = []
        if rm["paint"]:
            layers.append((M[rm["paint"]], lvl_h[lv], "Paint"))
        if rm["panel"]:
            layers.append((M["panel"], 0.95, "Panel"))
        if rm["wainscot"]:
            layers.append((M["bath"], 1.3, "Tile"))
        for k, (mat, hh, nm) in enumerate(layers):  # stacked skins, each one SKIN further out so no faces coincide
            ops = [(a, b, lo, min(hi, hh)) for a, b, lo, hi in hl if lo < hh]
            sk = B.wall(f"Walls_{nm}{rm['name']}_{tag}", axis, fixed + inward * SKIN * (k + 0.5), SKIN, a0, a1, hh, mat, openings=ops, y0=y, solid=False)
            if nm == "Tile":
                scale_uvs(sk, 2.5)
            elif nm == "Panel":
                scale_uvs(sk, 1 / 1.2, 1 / 1.9)
            io.extend(sk)
        skin = SKIN * len(layers)

        def run_boxes(nm, gaps, yy, hh, depth):
            off = fixed + inward * (skin + depth / 2)
            for i, (lo, hi) in enumerate(solid_runs(a0, a1, gaps)):
                if axis == "x":
                    trims.append(B.box(f"Trim_{nm}{rm['name']}{tag}{i}", (lo + hi) / 2, off, yy, hi - lo, depth, hh, M["trim"]))
                else:
                    trims.append(B.box(f"Trim_{nm}{rm['name']}{tag}{i}", off, (lo + hi) / 2, yy, depth, hi - lo, hh, M["trim"]))

        if rm["panel"]:  # chair rail capping the wainscoting
            run_boxes("Chair", [(a, b) for a, b, lo, hi in hl if lo < 0.98], y + 0.92, 0.06, 0.035)
        if rm["crown"]:
            cy, ch = rm["crown"]
            run_boxes("Crown", [(a, b) for a, b, lo, hi in hl if hi > cy], y + cy, ch, 0.06)
        if not rm["baseboard"]:
            return
        run_boxes("", [(a, b) for a, b, lo, hi in hl if lo < 0.05], y, BB_H, BB_T)

    for rm in P.rooms:
        x0, x1, z0, z1 = rm["rect"]
        for tag, axis, fixed, f0, f1, inward in (("S", "x", z0, x0, x1, 1), ("N", "x", z1, x0, x1, -1), ("W", "z", x0, z0, z1, 1), ("E", "z", x1, z0, z1, -1)):
            for si, (a0, a1) in enumerate(walled(axis, fixed, f0, f1, rm["level"])):
                finish_face(rm, f"{tag}{si}", axis, fixed, a0, a1, inward)

    for i, d in enumerate(P.doorways):
        if d["style"] == "arch":
            continue
        y = lvl_y[d["level"]]
        dh = d["h"]
        for sgn in (1, -1):
            f = d["fixed"] + sgn * (PT / 2 + CAS_T / 2)
            for nm, along, yy, sa, hh in (("A", d["a"] - CAS_W / 2, y, CAS_W, dh + CAS_W), ("B", d["b"] + CAS_W / 2, y, CAS_W, dh + CAS_W),
                                          ("H", (d["a"] + d["b"]) / 2, y + dh, d["b"] - d["a"], CAS_W)):
                if d["axis"] == "z":
                    trims.append(B.box(f"Trim_Door{i}{'R' if sgn > 0 else 'L'}_{nm}", f, along, yy, CAS_T, sa, hh, M["trim"]))
                else:
                    trims.append(B.box(f"Trim_Door{i}{'R' if sgn > 0 else 'L'}_{nm}", along, f, yy, sa, CAS_T, hh, M["trim"]))

    for i, w in enumerate(P.windows):
        y = lvl_y[w["level"]]
        a, b, y0, y1 = w["a"], w["b"], w["y0"] + y, w["y1"] + y
        side = w["side"]
        inward = {"front": -1, "back": 1, "west": 1, "east": -1}[side]
        fixed = {"front": zf, "back": zb, "west": -xi, "east": xi}[side]
        face = fixed + inward * (CAS_T / 2 + SKIN)
        sill = fixed + inward * (SILL_D / 2 - 0.02)
        parts = [("CasA", a - CAS_W / 2, y0, CAS_W, y1 - y0), ("CasB", b + CAS_W / 2, y0, CAS_W, y1 - y0), ("CasH", (a + b) / 2, y1, b - a + 2 * CAS_W, CAS_W)]
        for nm, along, yy, sa, hh in parts:
            if side in ("front", "back"):
                trims.append(B.box(f"Window_{i}_{nm}", along, face, yy, sa, CAS_T, hh, M["trim"]))
            else:
                trims.append(B.box(f"Window_{i}_{nm}", face, along, yy, CAS_T, sa, hh, M["trim"]))
        if w["kind"] == "french":
            # an interior hole has no collision: block it so nobody walks out onto the (visual) balcony
            if side in ("front", "back"):
                B.col(f"Window_{i}_French", (a + b) / 2, fixed + (T / 2 if side == "front" else -T / 2), y0, b - a, T, y1 - y0)
            else:
                B.col(f"Window_{i}_French", fixed + (T / 2 if side == "east" else -T / 2), (a + b) / 2, y0, T, b - a, y1 - y0)
        if w["kind"] in ("door", "french"):
            continue
        if side in ("front", "back"):
            trims.append(B.box(f"Window_{i}_Sill", (a + b) / 2, sill, y0 - 0.03, b - a + 0.16, SILL_D, 0.03, M["trim"]))
        else:
            trims.append(B.box(f"Window_{i}_Sill", sill, (a + b) / 2, y0 - 0.03, SILL_D, b - a + 0.16, 0.03, M["trim"]))
    io += trims

    io += build_kitchen(B, M, P)
    if P.bath:
        io += build_bath(B, M, P)
    if P.stair:
        io += build_stair(B, M, P)
    if P.wing:
        io += build_garage(B, M, P)
    if P.fit:
        io += build_estate(B, M, P)

    for name, lv, lx, lz in P.lights:
        sfx = f"_L{lv}" if two else ""
        io.append(B.cyl(f"Light{sfx}_{name}", lx, lz, lvl_y[lv] + lvl_h[lv] - 0.05, 0.22, 0.05, M["lamp"], seg=12))

    io.append(L.box(coll, "Door_Entrance", 0, zf + T / 2, 0.01, 1.18, 0.06, 2.18, M["door"], bevel=0.02))
    io.append(L.box(coll, "Door_Entrance_Handle", 0.42, zf - 0.03, 0.98, 0.04, 0.12, 0.04, M["steel"]))
    io.append(L.box(coll, "Door_Entrance_Sign", 0, zf - 0.01, 2.3, 0.5, 0.02, 0.16, M["sign"]))
    io.append(L.box(coll, "Entry_Doormat", 0, zf - 0.45, 0.0, 1.0, 0.6, 0.012, M["mat"]))
    sky_e = max(13.0, P.wing["x_ext"] + 1.5) if P.wing else 13.0
    for nm, gx, gz, sx, sz in [("Sky_Back", 0, -12, 34, 0.05), ("Sky_Front", 0, 13, 34, 0.05), ("Sky_West", -13, 0, 0.05, 34), ("Sky_East", sky_e, 0, 0.05, 34)]:
        io.append(L.box(coll, nm, gx, gz, -3.0, sx, sz, 9.0 + (L1_Y if two else 0.0), M["sky"]))

    bad = L.check_grounded(io, allow=L.ALLOW_INTERIOR + ("Window_", "Trim_", "Kitchen_", "Bath_", "Glass_", "Ceiling", "Stair_", "Garage_", "Fit_"))
    assert not bad, bad
    return sc, io, cols, B


def build_kitchen(B, M, P):
    k = P.kitchen
    zb, xi = P.zi_b, P.xi
    x0, ret_z, sink_x = k["x0"], k["ret_z"], k["sink_x"]
    run_len = xi - x0
    out = [B.furn("Kitchen_Run", (x0 + xi) / 2, zb + K_D / 2, math.pi, [
        (0, 0.08, 0.0, run_len, K_D - 0.06, 0.1, M["dark"]),
        (0, 0.03, 0.1, run_len, K_D - 0.04, K_H - 0.1, M["cabinet"]),
        (0, 0, K_H, run_len, K_D, 0.04, M["worktop"])])]
    ret_len = ret_z - (zb + K_D)
    out.append(B.furn("Kitchen_Return", xi - K_D / 2, (zb + K_D + ret_z) / 2, math.pi / 2, [
        (0, 0.08, 0.0, ret_len, K_D - 0.06, 0.1, M["dark"]),
        (0, 0.03, 0.1, ret_len, K_D - 0.04, K_H - 0.1, M["cabinet"]),
        (0, 0, K_H, ret_len, K_D, 0.04, M["worktop"])]))
    B.col("Kitchen_Run", (x0 + xi) / 2, zb + K_D / 2, 0.0, run_len, K_D, K_H + 0.04)
    B.col("Kitchen_Return", xi - K_D / 2, (zb + K_D + ret_z) / 2, 0.0, K_D, ret_len, K_H + 0.04)
    door_w = 0.6
    x = x0 + 0.03
    n = 0
    while x + door_w <= xi - 0.02:
        out.append(B.box(f"Kitchen_Door{n:02d}", x + door_w / 2 - 0.01, zb + K_D - 0.04, 0.14, door_w - 0.03, 0.02, K_H - 0.2, M["cabinet"], bevel=0.008))
        out.append(B.box(f"Kitchen_Pull{n:02d}", x + door_w / 2 - 0.01, zb + K_D - 0.02, K_H - 0.16, 0.22, 0.02, 0.02, M["steel"]))
        x += door_w
        n += 1
    z = zb + K_D + 0.03
    while z + door_w <= ret_z - 0.02:
        out.append(B.box(f"Kitchen_Door{n:02d}", xi - K_D + 0.04, z + door_w / 2 - 0.01, 0.14, 0.02, door_w - 0.03, K_H - 0.2, M["cabinet"], bevel=0.008))
        out.append(B.box(f"Kitchen_Pull{n:02d}", xi - K_D + 0.02, z + door_w / 2 - 0.01, K_H - 0.16, 0.02, 0.22, 0.02, M["steel"]))
        z += door_w
        n += 1
    out += [B.box("Kitchen_SinkBasin", sink_x, zb + 0.33, K_H + 0.035, 0.62, 0.42, 0.012, M["steel"]),
            B.box("Kitchen_SinkInner", sink_x, zb + 0.33, K_H + 0.04, 0.54, 0.34, 0.006, M["dark"]),
            B.box("Kitchen_FaucetBase", sink_x, zb + 0.08, K_H + 0.04, 0.05, 0.05, 0.3, M["steel"]),
            B.box("Kitchen_FaucetSpout", sink_x, zb + 0.17, K_H + 0.3, 0.04, 0.2, 0.04, M["steel"])]
    wa, wb = sink_x - 0.8, sink_x + 0.8
    runs = [(x0, wa - 0.2), (wb + 0.6, xi)]
    if k.get("hood"):  # no wall cabinet where the range hood hangs
        hx, hw = k["hood"]
        runs = [r for a, b in runs for r in solid_runs(a, b, [(hx - hw / 2 - 0.05, hx + hw / 2 + 0.05)])]
    for i, (a, b) in enumerate(runs):
        if b - a <= 0.5:
            continue
        if k.get("uppers") == "shelf":  # open timber shelves instead of wall cabinets
            for j, yy in enumerate((1.45, 1.85)):
                out.append(B.box(f"Kitchen_Shelf{i}{j}", (a + b) / 2, zb + 0.14, yy, b - a, 0.28, 0.04, M["shelf"]))
        else:
            out.append(B.box(f"Kitchen_Upper{i}", (a + b) / 2, zb + 0.18, 1.5, b - a, 0.36, 0.72, M["cabinet"], bevel=0.01))
            out.append(B.box(f"Kitchen_UpperTrim{i}", (a + b) / 2, zb + 0.36, 1.49, b - a, 0.02, 0.02, M["trim"]))
    for i, (lo, hi) in enumerate(solid_runs(x0, xi, [(wa, wb)])):
        out.append(B.box(f"Walls_Splash{i}", (lo + hi) / 2, zb + 0.006, K_H + 0.04, hi - lo, 0.012, 1.5 - K_H - 0.04, M["splash"], tile=0.6))
    out.append(B.box("Walls_SplashUnderWin", sink_x, zb + 0.006, K_H + 0.04, 1.6, 0.012, 1.05 - K_H - 0.04, M["splash"], tile=0.6))
    out.append(B.box("Walls_SplashEast", xi - 0.006, (zb + ret_z) / 2, K_H + 0.04, 0.012, ret_z - zb, 1.5 - K_H - 0.04, M["splash"], tile=0.6))
    return out


def build_bath(B, M, P):
    bt = P.bath
    x0, x1, z0, z1 = bt["x0"], bt["x1"], bt["z0"], bt["z1"]
    SH = 0.95
    out = [B.furn("Bath_ShowerTray", x0 + SH / 2, z0 + SH / 2, 0.0, [(0, 0, 0.0, SH, SH, 0.08, M["ceramic"], 0.01), (0, 0, 0.08, 0.1, 0.1, 0.005, M["steel"])]),
           B.box("Glass_ShowerFront", x0 + SH / 2, z0 + SH, 0.08, SH, 0.02, 1.9, M["glass"]),
           B.box("Glass_ShowerSide", x0 + SH, z0 + SH * 0.5 + 0.2, 0.08, 0.02, SH * 0.6, 1.9, M["glass"]),
           B.box("Bath_ShowerPipe", x0 + 0.04, z0 + SH / 2, 0.9, 0.03, 0.03, 1.2, M["steel"]),
           B.box("Bath_ShowerHead", x0 + 0.12, z0 + SH / 2, 2.05, 0.2, 0.2, 0.03, M["steel"])]
    B.col("Bath_Shower", x0 + SH / 2 - 0.1, z0 + SH / 2 - 0.1, 0.0, SH + 0.2, SH + 0.2, 2.0)
    wc_x = (x0 + x1) / 2 + 0.6
    out.append(B.furn("Bath_WC", wc_x, z1 - 0.38, 0.0, [
        (0, 0, 0.0, 0.36, 0.5, 0.38, M["ceramic"], 0.03),
        (0, 0.05, 0.38, 0.4, 0.46, 0.04, M["ceramic"], 0.02),
        (0, 0.3, 0.3, 0.42, 0.18, 0.5, M["ceramic"], 0.02)]))
    B.col("Bath_WC", wc_x, z1 - 0.38, 0.0, 0.44, 0.7, 0.8)
    van_x = x0 + SH + 0.75
    out.append(B.furn("Bath_Vanity", van_x, z0 + 0.24, math.pi, [
        (0, 0, 0.0, 0.8, 0.44, 0.1, M["dark"]),
        (0, 0.02, 0.1, 0.8, 0.44, 0.68, M["cabinet"], 0.01),
        (0, 0, 0.78, 0.84, 0.48, 0.05, M["ceramic"], 0.01),
        (0, 0.12, 0.83, 0.05, 0.05, 0.22, M["steel"])]))
    B.col("Bath_Vanity", van_x, z0 + 0.24, 0.0, 0.84, 0.48, 0.85)
    out.append(B.box("Bath_Mirror", van_x, z0 + 0.02, 1.25, 0.7, 0.02, 0.85, M["mirror"]))
    out.append(B.box("Bath_MirrorFrame", van_x, z0 + 0.012, 1.22, 0.78, 0.012, 0.91, M["trim"]))
    return out


def build_stair(B, M, P):
    s = P.stair
    x0, x1, z0, z1 = s["x0"], s["x1"], s["z0"], s["z1"]
    steps = 16
    run = (z1 - z0) / steps
    rise = L1_Y / steps
    out = []
    for i in range(steps):
        zt = z1 - (i + 1) * run
        out.append(B.box(f"Stair_Step{i:02d}", (x0 + x1) / 2, zt + run / 2, 0.0, x1 - x0, run + 0.005, (i + 1) * rise, M["stair"]))
        out.append(B.box(f"Stair_Nose{i:02d}", (x0 + x1) / 2, zt + run - 0.01, (i + 1) * rise - 0.02, x1 - x0, 0.04, 0.03, M["trim"]))
    # open side (+1: x1, -1: x0), handrail / baluster materials, newel cap, foot rail and under-stair block: estate options
    rail_x = x1 + 0.04 if s.get("open", 1) > 0 else x0 - 0.04
    rail, bal = M[s.get("rail", "trim")], M[s.get("baluster", "trim")]
    bw = 0.02 if s.get("baluster") == "iron" else 0.035
    angle = math.atan2(L1_Y, z1 - z0)
    length = math.hypot(L1_Y, z1 - z0)
    for nm, y_off in (("Handrail", 0.95), ("Stringer", 0.0)):
        o = B.box(f"Stair_{nm}", rail_x, 0, -0.03, 0.06 if nm == "Handrail" else 0.04, length, 0.06 if nm == "Handrail" else 0.25, rail if nm == "Handrail" else M["stair"])
        o.rotation_euler = (angle, 0, 0)
        o.location = L.b(B.x(rail_x), (z0 + z1) / 2, L1_Y / 2 + y_off)
        out.append(o)
    for i in range(1, steps, 2):
        zz = z1 - (i + 0.5) * run
        hh = (i + 1) * rise
        out.append(B.box(f"Stair_Baluster{i:02d}", rail_x, zz, hh, bw, bw, 0.95, bal))
    out.append(B.box("Stair_PostFoot", rail_x, z1 - 0.05, 0.0, 0.1, 0.1, 1.15, M["stair"]))
    if s.get("newel"):
        out.append(B.box("Stair_PostFootCap", rail_x, z1 - 0.05, 1.15, 0.16, 0.16, 0.06, rail))
    B.col("Stair_Side", rail_x, (z0 + z1) / 2, 0.0, 0.08, z1 - z0, L1_Y + L1_H)
    if s.get("back_col"):  # the part of the flight that rises out of the hall into the great room: block under it
        B.col("Stair_Back", (x0 + x1) / 2, z0 + s["back_col"] / 2, 0.0, x1 - x0, s["back_col"], 2.3)
    for i in range(6):
        zz = z0 + (z1 - z0) * (i + 0.5) / 6
        out.append(B.box(f"Stair_UpperBaluster{i}", rail_x, zz, L1_Y, bw, bw, 1.0, bal))
    out.append(B.box("Stair_UpperRail", rail_x, (z0 + z1) / 2, L1_Y + 1.0, 0.07, z1 - z0, 0.06, rail))
    if s.get("foot_rail", True):
        out.append(B.box("Stair_FootRail", (x0 + x1) / 2 + 0.03, z1 + 0.04, L1_Y, x1 - x0 + 0.06, 0.08, 1.06, M["trim"]))
        B.col("Stair_FootRail", (x0 + x1) / 2, z1 + 0.04, L1_Y, x1 - x0, 0.08, 1.1)
    if s.get("foot_rail", True):  # estate: the corridor slab already ends flush with the top step
        out.append(B.box("Stair_UpperEdge", (x0 + x1) / 2, z0 - 0.06, L0_H, x1 - x0, 0.12, L1_Y - L0_H, M["stair"]))
    return out


def build_estate(B, M, P):
    """Style kit of the estate plan (STYLES), from the lib_interior.py builders: fireplace, kitchen island and hood,
    ceilings (coffers / tray or timber beams), library, wardrobes, walk-in closet, bath fixtures, gallery guard and
    chandeliers. The bedrooms and reception rooms stay empty for the player's furniture."""
    F = P.fit
    m, S = F["m"], F["S"]
    xi, zb = P.xi, P.zi_b
    zf = P.zi_f
    e = PT / 2
    HX, TOP, ZP, CB, GZ, CX, sx1, PZ, k0 = (F[k] for k in ("HX", "TOP", "ZP", "CB", "GZ", "CX", "sx1", "PZ", "k0"))
    Y1, Y1T = L1_Y, L1_Y + L1_H

    def fx(f):
        return LI.flip(f, m)

    def rect(nm):
        return next(r for r in P.rooms if r["name"] == nm)["rect"]

    out = LI.fireplace(B, "Fit_Fireplace", ((-xi, (PZ + ZP) / 2), "+x"), 0.0, L0_H, M, S["fire"])
    out += LI.island(B, "Fit_Island", (k0 + xi) / 2, zb + K_D + 1.5, 0.0, min(2.4, xi - k0 - 1.2), 0.9, M, pendants=2, ceil_y=L0_H)
    hx = P.kitchen["hood"][0]
    out.append(B.box("Fit_Cooktop", hx, zb + 0.33, K_H + 0.04, 0.76, 0.5, 0.012, M["dark"]))
    out += LI.range_hood(B, "Fit_Hood", ((hx, zb), "+z"), 0.0, L0_H, M, S["hood"])
    if S["ceiling"] == "coffer":
        out += LI.coffers(B, "Fit_Coffer", F["PX"] + 0.25, k0 - 0.35, zb + 0.25, ZP - 0.3, L0_H, M, 3, 2)
    for nm in S["beams"]:  # an even count keeps the ceiling lamp at the room centre between two beams
        x0, x1, z0, z1 = rect(nm)
        n = max(2, 2 * round((x1 - x0) / 2.6))
        out += LI.beams(B, f"Fit_Beam{nm}", x0, x1, z0, z1, L0_H, M, axis="z", spacing=(x1 - x0) / n)
    if S["shelves"]:
        out += LI.bookshelves(B, "Fit_Library", ((m * -xi, (ZP + e + zf) / 2), fx("+x")), 0.0, zf - ZP - 0.9, M)
    for nm in (F["I"]["side_room"], F["I"]["open_room"]):
        if nm == "Dining":
            x0, x1, z0, z1 = rect(nm)
            out += LI.chandelier(B, "Fit_DiningChandelier", "Light_L0_Dining", (x0 + x1) / 2, (z0 + z1) / 2, L0_H, 0.75, M,
                                 S["chandelier"], arms=5, r=0.34)
    # hall: chandelier in the double-height void, gallery guard and the slab edge band
    vx0, vx1 = sorted((m * sx1, m * (HX - e)))
    out += LI.chandelier(B, "Fit_Chandelier", "Light_L0_Chandelier", (vx0 + vx1) / 2, (GZ + zf) / 2, Y1T, 1.7, M, S["chandelier"])
    ga, gb = sorted((m * (sx1 + 0.04), m * (HX - e)))
    out += LI.balustrade(B, "Fit_Gallery", "x", GZ, ga, gb, Y1, M, S["gallery"])
    out.append(B.box("Fit_GalleryEdge", (vx0 + vx1) / 2, GZ + 0.015, L0_H, vx1 - vx0, 0.03, Y1 - L0_H + 0.02, M["trim"]))
    # powder room
    out += LI.vanity(B, "Fit_PowderVanity", ((-5.6, zb), "+z"), 0.0, 0.6, M)
    out += LI.wc(B, "Fit_PowderWC", ((-4.05, zb), "+z"), 0.0, M)
    # upstairs: wardrobes, walk-in closet, bath 2, primary bath, suite ceiling
    out += LI.wardrobe(B, "Fit_WardrobeBed2", ((m * (-HX - e), TOP + PT + 1.15), fx("-x")), Y1, 2.0, M)
    out += LI.wardrobe(B, "Fit_WardrobeBed3", ((m * (-HX - e), (zb + CB - e) / 2), fx("-x")), Y1, min(2.0, CB - e - zb - 0.4), M)
    cl = CB - e - zb - 0.75
    out += LI.closet_rail(B, "Fit_ClosetRail", ((m * (CX - e), zb + 0.05 + cl / 2), fx("-x")), Y1, cl, M)
    out += LI.shower(B, "Fit_Bath2Shower", (m * (-HX + e), zb), m, 1, Y1, M)
    out += LI.vanity(B, "Fit_Bath2Vanity", ((m * 0.6, zb), "+z"), Y1, 0.9, M)
    out += LI.wc(B, "Fit_Bath2WC", ((m * (HX - e), (zb + CB - e) / 2 + 0.2), fx("-x")), Y1, M)
    bx0, bx1 = CX + e, xi
    out += LI.tub(B, "Fit_Tub", m * (bx0 + bx1) / 2, zb + 0.5, Y1, 1.7, 0.8, "x", M)
    out += LI.vanity(B, "Fit_SuiteVanity", ((m * bx0, (zb + CB - e) / 2 + 0.25), fx("+x")), Y1, 1.5, M, basins=2, depth=0.55)
    out += LI.shower(B, "Fit_SuiteShower", (m * bx1, CB - e), -m, -1, Y1, M)
    out += LI.wc(B, "Fit_SuiteWC", ((m * bx1, CB - e - 1.5), fx("-x")), Y1, M)
    x0, x1, z0, z1 = rect("Suite")
    if S["suite_ceiling"] == "tray":
        out += LI.tray(B, "Fit_SuiteTray", x0, x1, z0, z1, Y1T, M)
    else:
        out += LI.beams(B, "Fit_BeamSuite", x0, x1, z0, z1, Y1T, M, axis="x", spacing=(z1 - z0) / 4)
    return out


def garage_door_xs(g, cx):
    """Centres (x) of the wing's garage doors around cx: one centred door, or two separated by 0.5 m of wall."""
    if g.get("doors", 1) == 2:
        off = g["door_w"] / 2 + 0.25
        return [cx - off, cx + off]
    return [cx]


def build_garage(B, M, P):
    """Walk-in garage room of the wing: concrete floor (also under the doorway through the main walls), solid walls with a
    side window, ceiling, a skin over the main shell's siding and the inside face of the (closed) garage door."""
    g = P.wing
    x_in, xi, xo, zb, zf = g["x_in"], g["xi"], g["xo"], g["zb"], g["zf"]
    door = next(w for w in P.windows if w["kind"] == "door")
    out = [B.box("House_Floor_Garage", (P.xi + PT / 2 + xi) / 2, (zb + zf) / 2, -0.1, xi - P.xi - PT / 2, zf - zb, 0.1, M["concrete"], tile=2.0)]
    out += B.wall("Walls_GarageFront", "x", zf + T / 2, T, x_in, xo, L0_H, M["garage_wall"])
    out += B.wall("Walls_GarageBack", "x", zb - T / 2, T, x_in, xo, L0_H, M["garage_wall"])
    out += B.wall("Walls_GarageE", "z", xi + T / 2, T, zb, zf, L0_H, M["garage_wall"], openings=g["windows"])
    out += B.wall("Walls_GarageSkin", "z", x_in + SKIN / 2, SKIN, zb, zf, L0_H, M["garage_wall"],
                  openings=[(door["a"], door["b"], 0.0, DOOR_H)], solid=False)
    out.append(B.box("Ceiling_Garage", (x_in + xo) / 2, (zb + zf) / 2, L0_H, xo - x_in, zf - zb + 2 * T, 0.1, M["ceil"], tile=2.0))
    # lining of the doorway reveal (main interior wall + gap + exterior shell, ~0.4 m): white jambs and head instead of the
    # outer siding, plus a casing on the garage face like the living-room side
    da, db = door["a"], door["b"]
    lx0, lx1 = P.xi - 0.005, x_in + SKIN + 0.005
    lw, lc = lx1 - lx0, (lx0 + lx1) / 2
    out += [B.box("Garage_DoorJambA", lc, da + 0.015, 0.0, lw, 0.03, DOOR_H, M["trim"]),
            B.box("Garage_DoorJambB", lc, db - 0.015, 0.0, lw, 0.03, DOOR_H, M["trim"]),
            B.box("Garage_DoorHead", lc, (da + db) / 2, DOOR_H - 0.03, lw, db - da, 0.03, M["trim"])]
    face = x_in + SKIN + CAS_T / 2
    out += [B.box("Garage_DoorCasA", face, da - CAS_W / 2, 0.0, CAS_T, CAS_W, DOOR_H + CAS_W, M["trim"]),
            B.box("Garage_DoorCasB", face, db + CAS_W / 2, 0.0, CAS_T, CAS_W, DOOR_H + CAS_W, M["trim"]),
            B.box("Garage_DoorCasH", face, (da + db) / 2, DOOR_H, CAS_T, db - da, CAS_W, M["trim"])]
    cx = (x_in + xi) / 2
    for k, dx in enumerate(garage_door_xs(g, cx)):
        out.append(B.box(f"Garage_DoorInside{k if k else ''}", dx, zf - 0.03, 0.0, g["door_w"], 0.04, g["door_h"], M["garage_door"], tile=0.5))
    for k, (a, b, y0, y1) in enumerate(g["windows"]):
        face = xi - CAS_T / 2
        out += [B.box(f"Garage_Win{k}_CasA", face, a - CAS_W / 2, y0, CAS_T, CAS_W, y1 - y0, M["trim"]),
                B.box(f"Garage_Win{k}_CasB", face, b + CAS_W / 2, y0, CAS_T, CAS_W, y1 - y0, M["trim"]),
                B.box(f"Garage_Win{k}_CasH", face, (a + b) / 2, y1, CAS_T, b - a + 2 * CAS_W, CAS_W, M["trim"]),
                B.box(f"Garage_Win{k}_Sill", xi - SILL_D / 2 + 0.02, (a + b) / 2, y0 - 0.03, SILL_D, b - a + 0.16, 0.03, M["trim"])]
    return out


def wing_exterior(coll, B, E, h, P, ZF, OZ):
    """Exterior shell of the garage wing (visual only, the interior walls collide): siding walls with the side window cut
    through, plinth, corner boards, a street-facing gable roof (ridge along z, no overhang against the main house),
    the closed carriage-style garage door, lanterns."""
    g = P.wing
    x0, x1 = g["x_in"], g["x_ext"]
    zf_e, zb_e = ZF, ZF - g["d"]
    H = FY + L0_H + 0.3
    out = []
    side_ops = [(a + OZ, b + OZ, y0 + FY, y1 + FY) for a, b, y0, y1 in g["windows"]]
    shell = []
    shell += B.wall("EX_WingShellFront", "x", zf_e - T / 2, T, x0, x1, H, E["siding"], solid=False)
    shell += B.wall("EX_WingShellBack", "x", zb_e + T / 2, T, x0, x1, H, E["siding"], solid=False)
    shell += B.wall("EX_WingShellE", "z", x1 - T / 2, T, zb_e + T, zf_e - T, H, E["siding"], openings=side_ops, solid=False, glass=E["glass"])
    scale_uvs(shell, 1.0, 3.0)
    out += shell
    zc = (zf_e + zb_e) / 2
    out += [L.box(coll, "EX_WingPlinthFront", (x0 + x1) / 2 + 0.04, zf_e + 0.04, 0.0, x1 - x0 + 0.08, 0.28, FY + 0.05, E["found"]),
            L.box(coll, "EX_WingPlinthBack", (x0 + x1) / 2 + 0.04, zb_e - 0.04, 0.0, x1 - x0 + 0.08, 0.28, FY + 0.05, E["found"]),
            L.box(coll, "EX_WingPlinthE", x1 + 0.04, zc, 0.0, 0.28, zf_e - zb_e, FY + 0.05, E["found"]),
            L.box(coll, "EX_WingShellTop", (x0 + x1) / 2, zc, H, x1 - x0, zf_e - zb_e, 0.05, E["trim"], tile=2.0)]
    for nm, zz in (("F", zf_e - 0.04), ("B", zb_e + 0.04)):
        out.append(L.box(coll, f"EX_WingCorner{nm}", x1 - 0.04, zz, 0.0, 0.18, 0.18, H + 0.05, E["trim"]))
    cx = (x0 + x1) / 2
    if g.get("roof", "gable_z") == "flat":
        # roof terrace behind a parapet; faces kept 0.03 clear of the corner boards (MIN_GAP)
        out += [L.box(coll, "EX_WingRoofDeck", (x0 + x1 - 0.18) / 2, zc, H + 0.05, x1 - 0.18 - x0, g["d"] - 0.36, 0.08, E["deck"], tile=1.0),
                L.box(coll, "EX_WingParapetF", (x0 + x1 - 0.18) / 2, zf_e - 0.05, H, x1 - 0.18 - x0, 0.26, 0.55, E["siding"]),
                L.box(coll, "EX_WingParapetB", (x0 + x1 - 0.18) / 2, zb_e + 0.05, H, x1 - 0.18 - x0, 0.26, 0.55, E["siding"]),
                L.box(coll, "EX_WingParapetE", x1 - 0.05, zc, H, 0.26, g["d"] + 0.16, 0.55, E["siding"]),
                L.box(coll, "EX_WingParapetCapF", (x0 + x1 - 0.22) / 2, zf_e - 0.05, H + 0.55, x1 - 0.22 - x0, 0.34, 0.06, E["trim"]),
                L.box(coll, "EX_WingParapetCapB", (x0 + x1 - 0.22) / 2, zb_e + 0.05, H + 0.55, x1 - 0.22 - x0, 0.34, 0.06, E["trim"]),
                L.box(coll, "EX_WingParapetCapE", x1 - 0.05, zc, H + 0.55, 0.34, g["d"] + 0.24, 0.06, E["trim"])]
    else:
        # roof: ridge along z over the wing centre; the west slope stops at the main wall, the east one overhangs
        rise, y_eave = g["rise"], H + 0.05
        half = (x1 - x0) / 2
        angle = math.atan2(rise, half)
        for nm, sgn, run in (("W", -1, half), ("E", 1, half + EAVE)):
            h_mid = y_eave + rise * (1 - (run / 2) / half) + 0.1
            out.append(slab(coll, f"EX_WingRoof{nm}", run / math.cos(angle) + 0.1, g["d"] + 0.9, 0.16, E["roof"], (0, sgn * angle, 0),
                            L.b(cx + sgn * run / 2, zc, h_mid), tile=0.7))
        gab = L.gable_roof(coll, "EX_WingGables", cx, zc, y_eave, x1 - x0 - 0.02, g["d"] - 0.02, rise, E["siding"], ridge_axis="z")
        scale_uvs([gab], 1.0, 3.0)
        out.append(gab)
        out.append(L.box(coll, "EX_WingRidgeCap", cx, zc, y_eave + rise + 0.08, 0.22, g["d"] + 0.95, 0.12, E["ridge"]))
        out.append(L.box(coll, "EX_WingGableVent", cx, zf_e + 0.03, y_eave + rise * 0.35, 0.9, 0.04, 0.7, E["shutter"]))
        out.append(L.box(coll, "EX_WingFascia", cx, zf_e + 0.45, y_eave - 0.12, x1 - x0 + 0.5, 0.08, 0.14, E["trim"]))
    # closed garage door(s), proud of the front shell: carriage style (panels + lites) or vertical planks with iron straps
    dw, dh = g["door_w"], g["door_h"]
    zd = zf_e + 0.03
    xs = garage_door_xs(g, cx)
    for di, dx in enumerate(xs):
        sfx = str(di) if len(xs) > 1 else ""
        slab_o = L.box(coll, f"EX_GarageDoor{sfx}", dx, zd, 0.05, dw, 0.06, dh, E["garage"], tile=0.5)
        out.append(slab_o)
        if g.get("door_style", "carriage") == "plank":
            L.rot_uvs90([slab_o])
            for k, yy in enumerate((0.55, 1.85)):
                out.append(L.box(coll, f"EX_GarageDoorStrap{sfx}{k}", dx, zd + 0.04, yy, dw - 0.4, 0.02, 0.06, E["metal"]))
        else:
            for r in range(4):
                for c in range(4):
                    px = dx - dw / 2 + dw * (c + 0.5) / 4
                    mat, y0 = (E["glass_dark"], 0.05 + 3 * dh / 4 + 0.1) if r == 3 else (E["garage_panel"], 0.05 + r * dh / 4 + 0.08)
                    out.append(L.box(coll, f"EX_GarageDoorPanel{sfx}{r}{c}", px, zd + 0.035, y0, dw / 4 - 0.18, 0.02, dh / 4 - 0.18, mat))
        for k, (along, yy, sa, hh) in enumerate(((dx, 0.05 + dh, dw + 0.36, 0.18), (dx - dw / 2 - 0.09, 0.05, 0.18, dh), (dx + dw / 2 + 0.09, 0.05, 0.18, dh))):
            out.append(L.box(coll, f"EX_GarageDoorCasing{sfx}{k}", along, zd + 0.02, yy, sa, 0.08, hh, E["trim"]))
    for k, x in enumerate((xs[0] - dw / 2 - 0.55, xs[-1] + dw / 2 + 0.55)):
        out.append(L.box(coll, f"EX_GarageLamp{k}", x, zf_e + 0.08, 1.95, 0.16, 0.12, 0.28, E["lamp"]))
        out.append(L.box(coll, f"EX_GarageLampCap{k}", x, zf_e + 0.08, 2.23, 0.2, 0.16, 0.04, E["metal"]))
    for i, (a, b, y0, y1) in enumerate(g["windows"]):
        out += dress(B, E, h, f"EX_WingWin{i}", "z", x1, a + OZ, b + OZ, y0, y1, 1, shutters=True)
    return out


def build_exterior(key, h, P):
    sc = L.new_build_scene("HOUSE_" + key + "_exterior")
    coll = bpy.data.collections.new("Exterior")
    sc.collection.children.link(coll)
    B = Mirror(coll, None, -1 if h["mirror"] else 1)
    C = PALETTES[h["palette"]]
    E = {
        "found": L.make_mat("EX_Foundation", "#a8a194", 0.9, "tiles", 0.05, accent="#8f897c"),
        "siding": L.make_mat(f"EX_{key}_Siding", C["wall"], 0.85, C["wall_pat"], 0.02, accent=C["wall_acc"]),
        "trim": L.make_mat(f"EX_{key}_Trim", C["trim"], 0.45, "noise", 0.01),
        "roof": L.make_mat(f"EX_{key}_Roof", C["roof"], 0.85, "tiles", 0.06, accent=C["roof_acc"]),
        "shutter": L.make_mat(f"EX_{key}_Shutter", C["shutter"], 0.6, "stripes", 0.03, accent=C["shutter"]),
        "door": L.make_mat(f"EX_{key}_Door", C["door"], 0.45, "noise", 0.03),
        "glass": L.make_mat(f"EX_{key}_Glass", "#bfe6f2", 0.1, "noise", 0.01, alpha=0.22),
        "metal": L.make_mat("EX_MetalDark", "#2b2d33", 0.4, "noise", 0.03),
        "deck": L.make_mat("EX_PorchDeck", "#a77b52", 0.8, "planks", 0.04, accent="#8a6442"),
        "brick": L.make_mat("EX_Chimney", "#a85a45", 0.8, "tiles", 0.05, accent="#8f4a38"),
        "lamp": L.make_mat("EX_PorchLamp", "#fff1c9", 0.4, "noise", 0.0, emit="#ffe2a8", emit_strength=2.0),
        "box": L.make_mat("EX_FlowerBox", "#7a5638", 0.7, "planks", 0.03, accent="#5e4129"),
        "flower": L.make_mat("EX_Flowers", "#f07fa8", 0.8, "checker", 0.05, accent="#f6d04d"),
        "leaf": L.make_mat("EX_Bush", "#4f9d54", 0.9, "noise", 0.06),
        "step": L.make_mat("EX_Paving", "#b8b2a6", 0.9, "tiles", 0.03, accent="#a49e92"),
        "wood": L.make_mat("EX_PergolaWood", "#8a6442", 0.7, "planks", 0.03, accent="#6f4f33"),
        "garage": L.make_mat("EX_GarageDoor", "#f6f4ee", 0.7, "noise", 0.02),
        "garage_panel": L.make_mat("EX_GarageDoorPanel", "#e6e3db", 0.7, "noise", 0.02),
        "glass_dark": L.make_mat("EX_GarageDoorLite", "#33434d", 0.15, "noise", 0.03),
    }
    E["frame"] = L.make_mat(f"EX_{key}_Frame", C["frame"], 0.45, "noise", 0.01) if "frame" in C else E["trim"]
    E["ridge"] = L.make_mat(f"EX_{key}_Ridge", C["ridge"], 0.8, "tiles", 0.05) if "ridge" in C else E["metal"]
    if "garage" in C:
        E["garage"] = L.make_mat(f"EX_{key}_GarageDoor", C["garage"], 0.75, "planks", 0.04, accent=C.get("garage_panel", C["garage"]))
        E["garage_panel"] = L.make_mat(f"EX_{key}_GarageDoorPanel", C.get("garage_panel", C["garage"]), 0.75, "noise", 0.03)
    if "deck" in C:
        E["deck"] = L.make_mat(f"EX_{key}_Deck", C["deck"], 0.85, "tiles", 0.04, accent=C.get("deck_acc", C["deck"]))
    if "neon" in C:
        E["neon"] = L.make_mat(f"EX_{key}_Neon", C["neon"], 0.4, "noise", 0.0, emit=C["neon"], emit_strength=3.0)
        E["neon2"] = L.make_mat(f"EX_{key}_Neon2", C["neon2"], 0.4, "noise", 0.0, emit=C["neon2"], emit_strength=3.0)
    W, ZF = P.W, h["ZF"]
    OZ = ZF - T - GAP - Z_FRONT_OUT
    ZB = OZ + P.z_back_out - GAP - T
    DEPTH = ZF - ZB
    ZC = (ZF + ZB) / 2
    two = len(P.levels) == 2
    H_SHELL = FY + (L1_Y + L1_H if two else L0_H) + 0.3
    hw = W / 2
    xo = []

    def lift(ops, level):
        y = P.levels[level]["y"]
        return [(a, b, (y0 + y + FY) if (y0 > 0.01 or level) else 0.0, y1 + y + FY) for a, b, y0, y1 in ops]

    def side(ops, level):
        # a doorway (y0 = 0) keeps its sill at the ground, like the entrance in lift(): no glass is put in it
        y = P.levels[level]["y"]
        return [(a + OZ, b + OZ, (y0 + y + FY) if (y0 > 0.01 or level) else 0.0, y1 + y + FY) for a, b, y0, y1 in ops]

    shell = []
    split = FY + L1_Y if two else H_SHELL  # one shell piece per storey: L.wall cuts holes along the run only
    for nm, axis, fixed, a0, a1, side_name in (("Front", "x", ZF - T / 2, -hw, hw, "front"), ("Back", "x", ZB + T / 2, -hw, hw, "back"),
                                               ("W", "z", -hw + T / 2, ZB + T, ZF - T, "west"), ("E", "z", hw - T / 2, ZB + T, ZF - T, "east")):
        ops = []
        for li in range(len(P.levels)):
            raw = P.outer_openings(side_name, li)
            ops += lift(raw, li) if axis == "x" else side(raw, li)
        low = [o for o in ops if o[3] <= split + 1e-6]
        shell += B.wall(f"EX_Shell{nm}", axis, fixed, T, a0, a1, split, E["siding"], openings=low, solid=False, glass=E["glass"])
        if two:
            high = [(a, b, y0 - split, y1 - split) for a, b, y0, y1 in ops if y0 >= split - 1e-6]
            shell += B.wall(f"EX_Shell{nm}_Up", axis, fixed, T, a0, a1, H_SHELL - split, E["siding"], openings=high, solid=False,
                            glass=E["glass"], y0=split)
    if C["wall_pat"] == "planks":
        scale_uvs(shell, 1.0, 3.0)
    elif C["wall_pat"] == "tiles":
        scale_uvs(shell, 3.0, 6.0)
    xo += shell
    xo += L.perimeter(coll, "EX_Plinth", W + 0.16, ZF + 0.08, ZB - 0.08, 0.0, FY + 0.05, 0.28, E["found"], front_gaps=[(-0.7, 0.7)], tile=1.0)
    xo.append(L.box(coll, "EX_ShellTop", 0, ZC, H_SHELL, W, DEPTH, 0.05, E["trim"], tile=2.0))
    for sx in (-1, 1):
        for sz, zz in (("F", ZF), ("B", ZB)):
            xo.append(L.box(coll, f"EX_Corner{sx:+d}{sz}", sx * (hw - 0.04), zz - (0.04 if sz == "F" else -0.04), 0.0, 0.18, 0.18, H_SHELL + 0.05, E["trim"]))
    if two:
        band_y = FY + L1_Y - 0.12
        xo += L.perimeter(coll, "EX_FloorBand", W + 0.1, ZF + 0.05, ZB - 0.05, band_y, 0.16, 0.1, E["trim"])
        if "neon" in E:
            xo += L.perimeter(coll, "EX_NeonBand", W + 0.12, ZF + 0.06, ZB - 0.06, band_y + 0.05, 0.05, 0.05, E["neon"])

    y_eave = H_SHELL + 0.05
    if h["roof"] == "gable_x":
        xo += gable_roof_x(coll, B, E, W, DEPTH, ZC, y_eave, h["rise"])
        if h["cross"]:
            xo += cross_gable(coll, B, E, h["cross"], ZF, y_eave)
    elif h["roof"] == "hip":
        xo += hip_roof_main(coll, E, h, W, DEPTH, ZC, y_eave, h["rise"])
    elif h["roof"] == "gable_z":
        xo += gable_roof_z(coll, B, E, W, DEPTH, ZC, y_eave, h["rise"], ZF, ZB)
    else:
        xo += flat_roof(coll, B, E, W, DEPTH, ZC, H_SHELL, ZF, ZB)
    if h["chimney"]:
        cx, dz = h["chimney"]
        top = y_eave + (h.get("rise", 0) * 0.75 if h["roof"] != "flat" else 0.6) + 1.2
        stucco = C.get("chimney") == "stucco"
        xo.append(B.box("EX_Chimney", cx, ZC + dz, y_eave - 0.3, 0.9, 0.9, top - y_eave + 0.3, E["siding"] if stucco else E["brick"], bevel=0.02, tile=0.5))
        xo.append(B.box("EX_ChimneyCap", cx, ZC + dz, top, 1.08, 1.08, 0.12, E["trim"] if stucco else E["found"]))
        if stucco:  # small hipped hood on the cap
            xo.append(L.hip_roof(coll, "EX_ChimneyHood", B.x(cx), ZC + dz, top + 0.18, 1.2, 1.2, 0.24, 0.06, E["roof"]))

    for i, w in enumerate(P.windows):
        if w["kind"] == "door":
            continue
        nm = f"EX_Win{i:02d}"
        y = P.levels[w["level"]]["y"]
        small = (w["b"] - w["a"]) < 1.0
        args = (w["a"], w["b"], w["y0"] + y, w["y1"] + y)
        if w["side"] == "front":
            xo += dress(B, E, h, nm, "x", ZF, *args, 1, shutters=True, flower=h["flowers"] and w["level"] == 0 and not small,
                        french=w["kind"] == "french")
        elif w["side"] == "back":
            xo += dress(B, E, h, nm, "x", ZB, *args, -1, shutters=not small)
        else:
            sgn = -1 if w["side"] == "west" else 1
            xo += dress(B, E, h, nm, "z", sgn * hw, args[0] + OZ, args[1] + OZ, args[2], args[3], sgn, shutters=not small)

    zf_c = ZF - T / 2
    xo.append(L.hinged_door(coll, [
        (0, 0.0, 1.18, 0.06, 2.18, E["door"], 0.02),
        (0, 1.35, 0.6, 0.075, 0.55, E["glass"], 0.0),
        (0.45, 0.95, 0.05, 0.14, 0.05, E["metal"], 0.0),
    ], -0.59, zf_c, FY))
    for i, x in enumerate((-0.68, 0.68)):
        xo.append(L.box(coll, f"EX_DoorCasing{i}", x, ZF + 0.03, FY, 0.14, 0.08, 2.26, E["trim"]))
    xo.append(L.box(coll, "EX_DoorHead", 0, ZF + 0.04, FY + 2.26, 1.6, 0.1, 0.16, E["trim"]))
    xo.append(L.box(coll, "EX_Threshold", 0, ZF - 0.2, 0.0, 1.2, 0.44, FY, E["trim"]))
    xo.append(L.box(coll, "EX_PorchLamp", 1.0, ZF + 0.08, FY + 1.75, 0.16, 0.12, 0.28, E["lamp"]))
    xo.append(L.box(coll, "EX_PorchLampCap", 1.0, ZF + 0.08, FY + 2.03, 0.2, 0.16, 0.04, E["metal"]))
    if h["porch"] == "porch":
        xo += porch(coll, E, ZF, h["porch_w"])
    elif h["porch"] == "loggia":
        xo += loggia(coll, E, ZF, h["loggia"])
    elif h["porch"] == "canopy":
        xo += canopy(coll, E, ZF)
    else:
        xo += pergola(coll, E, ZF)
    if P.wing:
        xo += wing_exterior(coll, B, E, h, P, ZF, OZ)
    pw = h.get("porch_w", 3.0) if h["porch"] == "porch" else 3.0 if h["porch"] == "canopy" else 7.4
    bushes = ((-pw / 2 - 0.7, ZF + 0.6), (pw / 2 + 0.7, ZF + 0.6), (-hw + 0.4, ZF + 0.5), (hw - 0.4, ZF + 0.5))
    if h["porch"] == "loggia":  # the loggia covers the inner pair
        bushes = bushes[2:]
    for i, (bx_, bz_) in enumerate(bushes):
        xo.append(L.cyl(coll, f"EX_BushBase{i}", bx_, bz_, 0.0, 0.42, 0.35, E["leaf"], seg=7))
        xo.append(L.cone(coll, f"EX_BushTop{i}", bx_, bz_, 0.35, 0.42, 0.12, 0.45, E["leaf"], seg=7))

    bad = L.check_grounded(xo, allow=("EX_Shell", "EX_Roof", "EX_Gables", "EX_CrossGable", "EX_Ridge", "EX_Fascia", "EX_Chimney", "EX_GableVent", "EX_Win", "Door",
                                      "EX_Door", "EX_PorchLamp", "EX_PorchPost", "EX_Rail", "EX_Baluster", "EX_PorchRoof", "EX_PorchBeam", "EX_Bush", "EX_Corner",
                                      "EX_FloorBand", "EX_NeonBand", "EX_Parapet", "EX_Canopy", "EX_Pergola", "EX_RoofVent", "EX_Wing", "EX_Loggia", "EX_Balcony",
                                      "EX_Garage"))
    assert not bad, bad
    return sc, xo, [0.0, round(FY, 4), round(OZ, 4)], dict(W=W, DEPTH=DEPTH, ZC=ZC, H=H_SHELL)


def slab(coll, name, sx, length, thick, mat, rot, loc, tile=2.0):
    o = L.box(coll, name, 0, 0, -thick / 2, sx, length, thick, mat, tile=tile)
    o.rotation_euler = rot
    o.location = loc
    return o


def gable_roof_x(coll, B, E, W, DEPTH, ZC, y_eave, rise):
    out = []
    half = DEPTH / 2 + EAVE
    angle = math.atan2(rise, DEPTH / 2)
    slope_len = half / math.cos(angle) + 0.1
    for nm, sgn in (("Front", 1), ("Back", -1)):
        gz = ZC + sgn * half / 2
        h_mid = y_eave + rise * (1 - (half / 2) / (DEPTH / 2)) + 0.1
        out.append(slab(coll, f"EX_Roof{nm}", W + 0.7, slope_len, 0.16, E["roof"], (sgn * angle, 0, 0), L.b(0, gz, h_mid), tile=0.7))
    g = L.gable_roof(coll, "EX_Gables", 0, ZC, y_eave, W - 0.02, DEPTH - 0.02, rise, E["siding"], ridge_axis="x")
    scale_uvs([g], 1.0, 3.0)
    out.append(g)
    out.append(L.box(coll, "EX_RidgeCap", 0, ZC, y_eave + rise + 0.08, W + 0.75, 0.22, 0.12, E["metal"]))
    for nm, sgn in (("Front", 1), ("Back", -1)):
        out.append(L.box(coll, f"EX_Fascia{nm}", 0, ZC + sgn * (DEPTH / 2 + EAVE - 0.02), y_eave - 0.38, W + 0.72, 0.06, 0.2, E["trim"]))
    for sx in (-1, 1):
        out.append(L.box(coll, f"EX_GableVent{'W' if sx < 0 else 'E'}", sx * (W / 2 + 0.01), ZC, y_eave + rise * 0.43, 0.04, 0.7, 0.7, E["shutter"]))
    return out


def gable_roof_z(coll, B, E, W, DEPTH, ZC, y_eave, rise, ZF, ZB):
    out = []
    half = W / 2 + EAVE
    angle = math.atan2(rise, W / 2)
    slope_len = half / math.cos(angle) + 0.1
    for nm, sgn in (("W", -1), ("E", 1)):
        gx = sgn * half / 2
        h_mid = y_eave + rise * (1 - (half / 2) / (W / 2)) + 0.1
        out.append(slab(coll, f"EX_Roof{nm}", slope_len, DEPTH + 0.9, 0.16, E["roof"], (0, sgn * angle, 0), L.b(gx, ZC, h_mid), tile=0.7))
    g = L.gable_roof(coll, "EX_Gables", 0, ZC, y_eave, W - 0.02, DEPTH - 0.02, rise, E["siding"], ridge_axis="z")
    scale_uvs([g], 1.0, 3.0)
    out.append(g)
    out.append(L.box(coll, "EX_RidgeCap", 0, ZC, y_eave + rise + 0.08, 0.22, DEPTH + 0.95, 0.12, E["metal"]))
    for nm, zz in (("Front", ZF + 0.45), ("Back", ZB - 0.45)):
        out.append(L.box(coll, f"EX_GableVent{nm}", 0, zz - (0.44 if nm == "Front" else -0.44), y_eave + rise * 0.4, 0.9, 0.04, 0.8, E["shutter"]))
        out.append(L.box(coll, f"EX_Fascia{nm}", 0, zz - (0.43 if nm == "Front" else -0.43), y_eave - 0.12, W + 0.4, 0.08, 0.14, E["trim"]))
    return out


def cross_gable(coll, B, E, spec, ZF, y_eave):
    cx, cw, rise = spec
    out = []
    front, back = ZF + 0.35, ZF - 3.2
    ln = front - back
    zc = (front + back) / 2
    g = L.gable_roof(coll, "EX_CrossGable", B.x(cx), zc, y_eave, cw, ln, rise, E["siding"], ridge_axis="z")
    scale_uvs([g], 1.0, 3.0)
    out.append(g)
    ch = cw / 2 + 0.12
    angle = math.atan2(rise, cw / 2)
    for nm, sgn in (("W", -1), ("E", 1)):
        r = ch / 2
        hh = y_eave + rise * (1 - r / (cw / 2)) + 0.09
        out.append(slab(coll, f"EX_RoofCross{nm}", ch / math.cos(angle) + 0.1, ln + 0.3, 0.14, E["roof"], (0, sgn * angle, 0), L.b(B.x(cx) + sgn * r, zc + 0.15, hh), tile=0.7))
    out.append(B.box("EX_CrossGableVent", cx, front + 0.02, y_eave + rise * 0.24, 0.8, 0.05, 0.7, E["shutter"]))
    out.append(B.box("EX_CrossGableTrim", cx, front + 0.03, y_eave - 0.05, cw + 0.2, 0.08, 0.12, E["trim"]))
    return out


def flat_roof(coll, B, E, W, DEPTH, ZC, H, ZF, ZB):
    out = [L.box(coll, "EX_RoofDeck", 0, ZC, H + 0.05, W - 0.2, DEPTH - 0.2, 0.08, E["roof"], tile=1.5)]
    out += L.perimeter(coll, "EX_Parapet", W + 0.12, ZF + 0.06, ZB - 0.06, H, 0.55, 0.26, E["siding"])
    out += L.perimeter(coll, "EX_ParapetCap", W + 0.2, ZF + 0.1, ZB - 0.1, H + 0.55, 0.06, 0.34, E["trim"])
    out.append(L.box(coll, "EX_RoofVent", -W / 4, ZC - 1.0, H + 0.13, 1.2, 0.9, 0.6, E["metal"]))
    if "neon" in E:
        out += L.perimeter(coll, "EX_ParapetNeon", W + 0.22, ZF + 0.11, ZB - 0.11, H + 0.48, 0.05, 0.05, E["neon2"])
    return out


def dress(B, E, h, name, axis, face, a, b, y0, y1, outward, shutters=True, flower=False, french=False):
    modern = h["windows"] == "modern"
    FR = 0.06 if modern else 0.1
    yy0, yy1 = y0 + FY, y1 + FY
    w = b - a
    mid = (a + b) / 2
    d = face + outward * 0.03

    def bx(nm, along, y, sa, hh, depth=0.06, mat=E["trim"], off=0.0):
        if axis == "x":
            return B.box(f"{name}_{nm}", along, d + outward * off, y, sa, depth, hh, mat)
        return B.box(f"{name}_{nm}", d + outward * off, along, y, depth, sa, hh, mat)

    frame = E.get("frame", E["trim"])  # jambs and glazing bars (bronze on the Tuscan villa); head and sill stay trim
    out = [bx("Head", mid, yy1, w + 2 * FR + (0.0 if modern else 0.06), 0.08 if modern else 0.12)]
    if not french:  # a French door has no sill
        out.append(bx("Sill", mid, yy0 - 0.07, w + 2 * FR + (0.04 if modern else 0.14), 0.07, depth=0.16, off=0.05))
    out += [bx("JambA", a - FR / 2, yy0, FR, yy1 - yy0, mat=frame),
            bx("JambB", b + FR / 2, yy0, FR, yy1 - yy0, mat=frame)]
    if not modern:
        out += [bx("Mullion", mid, yy0, 0.05, yy1 - yy0, depth=0.04, off=-0.07, mat=frame),
                bx("Transom", mid, yy0 + (yy1 - yy0) * 0.62, w, 0.05, depth=0.04, off=-0.07, mat=frame)]
        if shutters and h["palette"] != "scandi":
            sw = min(0.55, w * 0.38)
            out.append(bx("ShutterA", a - FR - sw / 2 - 0.02, yy0, sw, yy1 - yy0, depth=0.04, mat=E["shutter"]))
            out.append(bx("ShutterB", b + FR + sw / 2 + 0.02, yy0, sw, yy1 - yy0, depth=0.04, mat=E["shutter"]))
    elif "neon" in E:
        out.append(bx("Neon", mid, yy0 - 0.12, w + 0.1, 0.04, depth=0.04, mat=E["neon2"], off=0.06))
    if flower and not french:
        out.append(bx("FlowerBox", mid, yy0 - 0.38, w, 0.28, depth=0.24, mat=E["box"], off=0.12))
        out.append(bx("Flowers", mid, yy0 - 0.1, w - 0.1, 0.12, depth=0.18, mat=E["flower"], off=0.12))
    return out


def hip_roof_main(coll, E, h, W, DEPTH, ZC, y_eave, rise):
    """Hipped main roof (docs/GATED_COMMUNITY.md 7.2c.4 N1): equal-pitch slopes, ridge on the long side, fascia boxes,
    ridge and hip caps."""
    e = h.get("eave", EAVE)
    t = rise / (min(W, DEPTH) / 2)
    sx, sz = W + 2 * e, DEPTH + 2 * e
    y_drip = y_eave + 0.18 - e * t
    y_ridge = y_eave + rise + 0.18
    out = [L.hip_roof(coll, "EX_Roof", 0, ZC, y_drip, sx, sz, y_ridge - y_drip, 0.16, E["roof"])]
    fy0, fh = y_drip - 0.2, 0.22
    out += [L.box(coll, "EX_FasciaFront", 0, ZC + sz / 2 + 0.01, fy0, sx + 0.16, 0.06, fh, E["trim"]),
            L.box(coll, "EX_FasciaBack", 0, ZC - sz / 2 - 0.01, fy0, sx + 0.16, 0.06, fh, E["trim"]),
            L.box(coll, "EX_FasciaW", -sx / 2 - 0.01, ZC, fy0, 0.06, sz - 0.04, fh, E["trim"]),
            L.box(coll, "EX_FasciaE", sx / 2 + 0.01, ZC, fy0, 0.06, sz - 0.04, fh, E["trim"])]
    half = abs(sx - sz) / 2
    along_x = sx >= sz
    r0 = (-half, ZC) if along_x else (0.0, ZC - half)
    r1 = (half, ZC) if along_x else (0.0, ZC + half)
    if half > 0.01:
        ln = 2 * half
        out.append(L.box(coll, "EX_RidgeCap", 0, ZC, y_ridge - 0.02, ln + 0.1 if along_x else 0.24, 0.24 if along_x else ln + 0.1, 0.12, E["ridge"]))
    corners = [(-sx / 2, ZC - sz / 2), (sx / 2, ZC - sz / 2), (sx / 2, ZC + sz / 2), (-sx / 2, ZC + sz / 2)]
    for k, (cx_, cz_) in enumerate(corners):
        rx, rz = (r0 if cx_ < 0 else r1) if along_x else (r0 if cz_ < ZC else r1)
        out.append(L.beam(coll, f"EX_RidgeHip{k}", (rx, rz, y_ridge + 0.02), (cx_, cz_, y_drip + 0.02), 0.2, 0.1, E["ridge"]))
    return out


def loggia(coll, E, ZF, lg):
    """Three-arch loggia across the front (N3) carrying a balcony with a wrought-iron railing (N4): tiled floor and step,
    stucco piers with cast-stone bases and imposts, pilasters, segmental arches with keystones, cornice, balcony deck."""
    w, d, p = lg["w"], lg["d"], lg["pier"]
    zp = ZF + d - p / 2
    top, spring = lg["top"], lg["spring"]
    out = [L.box(coll, "EX_LoggiaFloor", 0, ZF + d / 2, 0.0, w, d, 0.16, E["deck"], tile=1.0),
           L.box(coll, "EX_LoggiaStep", 0, ZF + d + 0.2, 0.0, 2.4, 0.4, 0.08, E["step"])]
    piers = lg["piers"]
    for k, x in enumerate(piers):
        out += [L.box(coll, f"EX_LoggiaPier{k}", x, zp, 0.16, p, p, top - 0.16, E["siding"]),
                L.box(coll, f"EX_LoggiaPierBase{k}", x, zp, 0.16, p + 0.1, p + 0.1, 0.3, E["trim"]),
                L.box(coll, f"EX_LoggiaPierImpost{k}", x, zp, spring - 0.08, p + 0.08, p + 0.08, 0.08, E["trim"])]
    for k, x in enumerate((piers[0], piers[-1])):
        out.append(L.box(coll, f"EX_LoggiaPilaster{k}", x, ZF + 0.06, 0.16, p, 0.12, top - 0.16, E["siding"]))
    crown = spring + lg["arch_rise"]
    for k, (pa, pb) in enumerate(zip(piers, piers[1:])):
        a0, a1 = pa + p / 2, pb - p / 2
        out.append(L.arch_panel(coll, f"EX_LoggiaArch{k}", "x", zp, a0, a1, spring, lg["arch_rise"], top, p, E["siding"]))
        out.append(L.box(coll, f"EX_LoggiaKeystone{k}", (a0 + a1) / 2, zp, crown - 0.1, 0.22, p + 0.02, top - crown + 0.1, E["trim"]))
    for k, x in enumerate((piers[0], piers[-1])):
        out.append(L.arch_panel(coll, f"EX_LoggiaSideArch{k}", "z", x, ZF + 0.12, zp - p / 2, spring, lg["side_rise"], top, p, E["siding"]))
    c = lg["cornice"]
    out.append(L.box(coll, "EX_LoggiaCornice", 0, ZF + (d + 0.1) / 2, top, w + 0.2, d + 0.1, c, E["trim"]))
    if lg.get("balcony"):
        out.append(L.box(coll, "EX_BalconyDeck", 0, ZF + 0.07 + (d - 0.09) / 2, top + c, w - 0.04, d - 0.09, 0.02, E["deck"], tile=1.0))
        hw_ = w / 2 - 0.05
        out += L.railing(coll, "EX_BalconyRail", [(-hw_, ZF + 0.10), (-hw_, ZF + d), (hw_, ZF + d), (hw_, ZF + 0.10)],
                         top + c + 0.02, 0.95, 0.30, E["metal"])
    return out


def porch(coll, E, ZF, P_W):
    out = []
    P_D, P_TOP = 2.2, 0.16
    high, low = 2.78, 2.45
    out.append(L.box(coll, "EX_PorchDeck", 0, ZF + P_D / 2, 0.0, P_W, P_D, P_TOP, E["deck"], tile=1.0))
    out.append(L.box(coll, "EX_PorchStep", 0, ZF + P_D + 0.2, 0.0, 1.8, 0.4, 0.08, E["step"]))
    for i, (px, pz) in enumerate([(-P_W / 2 + 0.12, ZF + P_D - 0.12), (P_W / 2 - 0.12, ZF + P_D - 0.12), (-P_W / 2 + 0.12, ZF + 0.12), (P_W / 2 - 0.12, ZF + 0.12)]):
        out.append(L.box(coll, f"EX_PorchPost{i}", px, pz, P_TOP, 0.14, 0.14, low - P_TOP, E["trim"]))
    RAIL_H = 0.9
    for nm, a, b, fixed, axis in [("FrontL", -P_W / 2 + 0.12, -1.0, ZF + P_D - 0.12, "x"), ("FrontR", 1.0, P_W / 2 - 0.12, ZF + P_D - 0.12, "x"),
                                  ("SideW", ZF + 0.12, ZF + P_D - 0.12, -P_W / 2 + 0.12, "z"), ("SideE", ZF + 0.12, ZF + P_D - 0.12, P_W / 2 - 0.12, "z")]:
        mid, ln = (a + b) / 2, b - a
        if axis == "x":
            out.append(L.box(coll, f"EX_Rail{nm}", mid, fixed, P_TOP + RAIL_H, ln, 0.08, 0.06, E["trim"]))
            out.append(L.box(coll, f"EX_RailLow{nm}", mid, fixed, P_TOP + 0.1, ln, 0.06, 0.05, E["trim"]))
        else:
            out.append(L.box(coll, f"EX_Rail{nm}", fixed, mid, P_TOP + RAIL_H, 0.08, ln, 0.06, E["trim"]))
            out.append(L.box(coll, f"EX_RailLow{nm}", fixed, mid, P_TOP + 0.1, 0.06, ln, 0.05, E["trim"]))
        n = max(2, int(ln / 0.32))
        for k in range(1, n):
            t = a + ln * k / n
            if axis == "x":
                out.append(L.box(coll, f"EX_Baluster{nm}{k:02d}", t, fixed, P_TOP + 0.15, 0.04, 0.04, RAIL_H - 0.15, E["trim"]))
            else:
                out.append(L.box(coll, f"EX_Baluster{nm}{k:02d}", fixed, t, P_TOP + 0.15, 0.04, 0.04, RAIL_H - 0.15, E["trim"]))
    over = 0.3
    angle = math.atan2(high - low, P_D)
    ln = (P_D + over) / math.cos(angle)
    mid_h = high - (high - low) * (P_D + over) / 2 / P_D
    out.append(slab(coll, "EX_PorchRoof", P_W + 0.4, ln, 0.1, E["roof"], (angle, 0, 0), L.b(0, ZF + (P_D + over) / 2, mid_h + 0.05), tile=0.7))
    out.append(L.box(coll, "EX_PorchBeam", 0, ZF + P_D - 0.12, low - 0.16, P_W, 0.16, 0.16, E["trim"]))
    return out


def canopy(coll, E, ZF):
    out = [L.box(coll, "EX_CanopySlab", 0, ZF + 0.6, 2.62, 2.6, 1.2, 0.14, E["trim"]),
           L.box(coll, "EX_CanopyRoof", 0, ZF + 0.6, 2.76, 2.7, 1.3, 0.05, E["roof"], tile=0.7),
           L.box(coll, "EX_PorchStep", 0, ZF + 0.55, 0.0, 2.2, 1.1, 0.14, E["step"]),
           L.box(coll, "EX_PorchStepLow", 0, ZF + 1.25, 0.0, 2.2, 0.35, 0.07, E["step"])]
    for i, x in enumerate((-1.15, 1.15)):
        out.append(L.box(coll, f"EX_CanopyBracket{i}", x, ZF + 0.08, 2.2, 0.1, 0.12, 0.42, E["trim"]))
        out.append(L.box(coll, f"EX_CanopyArm{i}", x, ZF + 0.6, 2.56, 0.08, 1.1, 0.06, E["metal"]))
    return out


def pergola(coll, E, ZF):
    PW, PD = 7.4, 2.8
    out = [L.box(coll, "EX_PorchDeck", 0, ZF + PD / 2, 0.0, PW, PD, 0.12, E["step"], tile=1.0)]
    for i, (px, pz) in enumerate([(-PW / 2 + 0.15, ZF + PD - 0.15), (PW / 2 - 0.15, ZF + PD - 0.15), (-PW / 2 + 0.15, ZF + 0.15), (PW / 2 - 0.15, ZF + 0.15)]):
        out.append(L.box(coll, f"EX_PorchPost{i}", px, pz, 0.12, 0.18, 0.18, 2.5, E["wood"]))
    for i, pz in enumerate((ZF + 0.15, ZF + PD - 0.15)):
        out.append(L.box(coll, f"EX_PergolaBeam{i}", 0, pz, 2.62, PW + 0.4, 0.14, 0.2, E["wood"]))
    n = 12
    for k in range(n):
        x = -PW / 2 + PW * (k + 0.5) / n
        out.append(L.box(coll, f"EX_PergolaSlat{k:02d}", x, ZF + PD / 2, 2.82, 0.08, PD + 0.5, 0.14, E["wood"]))
    return out


def render_preview(scene, path, dims):
    from mathutils import Vector
    cam = bpy.data.objects.new("PREVIEW_cam", bpy.data.cameras.new("PREVIEW_cam"))
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 19.5 + (dims["H"] - 3.3) * 0.9
    scene.collection.objects.link(cam)
    target = Vector(L.b(0, dims["ZC"] + 0.6, dims["H"] * 0.8))
    cam.location = target + Vector((14.0, -20.0, 12.0))
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "TEXTURE"
    scene.display.shading.studiolight_rotate_z = math.radians(-120)
    scene.render.resolution_x = scene.render.resolution_y = 512
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.filepath = path
    bpy.context.window.scene = scene
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)


def build(key):
    h = dict(HOUSES[key], key=key)
    out_dir = os.path.join(L.OUT_ROOT, "houses", key)
    P = Plan(h)
    sc_in, io, cols, B = build_interior(key, h, P)
    sc_ext, xo, offset, dims = build_exterior(key, h, P)
    os.makedirs(out_dir, exist_ok=True)
    L.export_glb(os.path.join(out_dir, "exterior.glb"), xo)
    render_preview(sc_ext, os.path.join(out_dir, "preview.png"), dims)
    bpy.context.window.scene = sc_in
    L.export_glb(os.path.join(out_dir, "interior.glb"), io)
    L.export_glb(os.path.join(out_dir, "interior.colsrc.glb"), io + cols.items)
    L.write_json(os.path.join(out_dir, "interior.layout.json"), P.layout(B))
    max_x = P.wing["xo"] if P.wing else P.x_out
    print(key, "interior tris", tri_count(io), "exterior tris", tri_count(xo), "interiorOffset", offset,
          "footprint", [dims["W"], round(dims["DEPTH"], 3)], "footprintCenterZ", round(dims["ZC"], 3),
          "seeder interior_bounds", dict(minX=round(-P.x_out, 3), maxX=round(max_x, 3), minZ=h["back"], maxZ=Z_FRONT_OUT))


for _key in globals().get("HOUSE_KEYS") or list(HOUSES):
    build(_key)
