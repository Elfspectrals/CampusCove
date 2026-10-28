"""Town houses v2: walk-in exterior with real see-through windows + an empty interior (only the kitchen run and the
bathroom fixtures are built in; the player furnishes the rest from Cove Home). Two-storey houses get a walkable stair.

Exterior and interior are generated from the same opening list, so every window is a real hole in both shells.
Interior contract (docs/ASSETS_STYLE_GUIDE.md §4): floor y=0, front wall outer face z=5.2, door at x=0, rooms toward -Z.
Exterior: origin = lot origin, front outer face at z=ZF, door on +Z, `Door` node hinged for openHouses.registerFrontDoor.
Outputs: out/houses/<key>/{exterior.glb,interior.glb,interior.colsrc.glb,interior.layout.json,preview.png}.
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
        if h["floors"] == 2:
            self.duplex()
        else:
            self.cottage()

    def room(self, name, level, x0, x1, z0, z1, floor="wood", paint=None, wainscot=False, light=True, baseboard=True):
        self.rooms.append(dict(name=name, level=level, rect=(x0, x1, z0, z1), floor=floor, paint=paint, wainscot=wainscot,
                               baseboard=baseboard))
        if light:
            self.lights.append((name, level, (x0 + x1) / 2, (z0 + z1) / 2))

    def window(self, side, a, b, level=0, y=WIN):
        self.windows.append(dict(side=side, a=a, b=b, level=level, y0=y[0], y1=y[1]))

    def partition(self, name, axis, fixed, a0, a1, level=0, doors=()):
        self.partitions.append(dict(name=name, axis=axis, fixed=fixed, a0=a0, a1=a1, level=level, doors=list(doors)))
        for a, b in doors:
            self.doorways.append(dict(axis=axis, fixed=fixed, a=a, b=b, level=level))

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
        self.window("front", *centered(rmid, 2.2), level=1)
        self.window("front", *centered((-xi + corridor_x) / 2, 1.0), level=1)
        self.window("back", *centered(rmid, 1.8), level=1)
        self.window("back", *centered((-xi + corridor_x) / 2, 1.2), level=1)
        for zz0, zz1 in ((b1, zf), (b2, b1), (zb, b2)):
            self.window("east", *centered((zz0 + zz1) / 2, 1.6), level=1)
        self.window("west", *centered((top + foot) / 2, 1.4), level=1)
        self.window("west", *centered((zb + top) / 2, 1.2), level=1)

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
        stairs = []
        if self.stair:
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
    }
    io = []
    xi, x_out, zf, zb = P.xi, P.x_out, P.zi_f, P.zi_b
    two = len(P.levels) == 2
    lvl_y = [lv["y"] for lv in P.levels]
    lvl_h = [lv["height"] for lv in P.levels]

    for rm in P.rooms:
        x0, x1, z0, z1 = rm["rect"]
        y = lvl_y[rm["level"]]
        e = PT / 2
        mat = M["bath"] if rm["floor"] == "bath" else M["tile"] if rm["floor"] == "tile" else M["wood"]
        o = B.box(f"House_Floor_{rm['name']}", (x0 + x1) / 2, (z0 + z1) / 2, y - 0.1, x1 - x0 + 2 * e, z1 - z0 + 2 * e, 0.1, mat, tile=2.0)
        if rm["floor"] == "bath":
            scale_uvs([o], 2.0)
        elif rm["floor"] == "wood" and C.get("floor_pat", "planks") == "planks":
            scale_uvs([o], 2.5)
        io.append(o)
        if rm["level"] == 1:
            io.append(B.box(f"Ceiling_Under{rm['name']}", (x0 + x1) / 2, (z0 + z1) / 2, L0_H, x1 - x0 + 2 * e, z1 - z0 + 2 * e, 0.1, M["ceil"], tile=2.0))
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
        ops = [(a, b, 0.0, DOOR_H) for a, b in p["doors"]]
        io += B.wall(p["name"], p["axis"], p["fixed"], PT, p["a0"], p["a1"], lvl_h[p["level"]], M["wall"], openings=ops, y0=lvl_y[p["level"]])

    holes = [dict(axis="x" if w["side"] in ("front", "back") else "z",
                  fixed={"front": zf, "back": zb, "west": -xi, "east": xi}[w["side"]],
                  a=w["a"], b=w["b"], y0=w["y0"], y1=w["y1"], level=w["level"]) for w in P.windows]
    holes.append(dict(axis="x", fixed=zf, a=ENTRANCE[0], b=ENTRANCE[1], y0=0.0, y1=ENTRANCE[3], level=0))
    holes += [dict(axis=d["axis"], fixed=d["fixed"], a=d["a"], b=d["b"], y0=0.0, y1=DOOR_H, level=d["level"]) for d in P.doorways]
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
            layers.append((M["bed"], lvl_h[lv], "Paint"))
        if rm["wainscot"]:
            layers.append((M["bath"], 1.3, "Tile"))
        for mat, hh, nm in layers:
            ops = [(a, b, lo, min(hi, hh)) for a, b, lo, hi in hl if lo < hh]
            sk = B.wall(f"Walls_{nm}{rm['name']}_{tag}", axis, fixed + inward * SKIN / 2, SKIN, a0, a1, hh, mat, openings=ops, y0=y, solid=False)
            if nm == "Tile":
                scale_uvs(sk, 2.5)
            io.extend(sk)
        if not rm["baseboard"]:
            return
        off = fixed + inward * ((SKIN if rm["paint"] else 0.0) + BB_T / 2)
        gaps = [(a, b) for a, b, lo, hi in hl if lo < 0.05]
        for i, (lo, hi) in enumerate(solid_runs(a0, a1, gaps)):
            if axis == "x":
                trims.append(B.box(f"Trim_{rm['name']}{tag}{i}", (lo + hi) / 2, off, y, hi - lo, BB_T, BB_H, M["trim"]))
            else:
                trims.append(B.box(f"Trim_{rm['name']}{tag}{i}", off, (lo + hi) / 2, y, BB_T, hi - lo, BB_H, M["trim"]))

    for rm in P.rooms:
        x0, x1, z0, z1 = rm["rect"]
        for tag, axis, fixed, f0, f1, inward in (("S", "x", z0, x0, x1, 1), ("N", "x", z1, x0, x1, -1), ("W", "z", x0, z0, z1, 1), ("E", "z", x1, z0, z1, -1)):
            for si, (a0, a1) in enumerate(walled(axis, fixed, f0, f1, rm["level"])):
                finish_face(rm, f"{tag}{si}", axis, fixed, a0, a1, inward)

    for i, d in enumerate(P.doorways):
        y = lvl_y[d["level"]]
        for sgn in (1, -1):
            f = d["fixed"] + sgn * (PT / 2 + CAS_T / 2)
            for nm, along, yy, sa, hh in (("A", d["a"] - CAS_W / 2, y, CAS_W, DOOR_H + CAS_W), ("B", d["b"] + CAS_W / 2, y, CAS_W, DOOR_H + CAS_W),
                                          ("H", (d["a"] + d["b"]) / 2, y + DOOR_H, d["b"] - d["a"], CAS_W)):
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
        if side in ("front", "back"):
            trims.append(B.box(f"Window_{i}_Sill", (a + b) / 2, sill, y0 - 0.03, b - a + 0.16, SILL_D, 0.03, M["trim"]))
        else:
            trims.append(B.box(f"Window_{i}_Sill", sill, (a + b) / 2, y0 - 0.03, SILL_D, b - a + 0.16, 0.03, M["trim"]))
    io += trims

    io += build_kitchen(B, M, P)
    io += build_bath(B, M, P)
    if P.stair:
        io += build_stair(B, M, P)

    for name, lv, lx, lz in P.lights:
        sfx = f"_L{lv}" if two else ""
        io.append(B.cyl(f"Light{sfx}_{name}", lx, lz, lvl_y[lv] + lvl_h[lv] - 0.05, 0.22, 0.05, M["lamp"], seg=12))

    io.append(L.box(coll, "Door_Entrance", 0, zf + T / 2, 0.01, 1.18, 0.06, 2.18, M["door"], bevel=0.02))
    io.append(L.box(coll, "Door_Entrance_Handle", 0.42, zf - 0.03, 0.98, 0.04, 0.12, 0.04, M["steel"]))
    io.append(L.box(coll, "Door_Entrance_Sign", 0, zf - 0.01, 2.3, 0.5, 0.02, 0.16, M["sign"]))
    io.append(L.box(coll, "Entry_Doormat", 0, zf - 0.45, 0.0, 1.0, 0.6, 0.012, M["mat"]))
    for nm, gx, gz, sx, sz in [("Sky_Back", 0, -12, 34, 0.05), ("Sky_Front", 0, 13, 34, 0.05), ("Sky_West", -13, 0, 0.05, 34), ("Sky_East", 13, 0, 0.05, 34)]:
        io.append(L.box(coll, nm, gx, gz, -3.0, sx, sz, 9.0 + (L1_Y if two else 0.0), M["sky"]))

    bad = L.check_grounded(io, allow=L.ALLOW_INTERIOR + ("Window_", "Trim_", "Kitchen_", "Bath_", "Glass_", "Ceiling", "Stair_"))
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
    for i, (a, b) in enumerate(((x0, wa - 0.2), (wb + 0.6, xi))):
        if b - a > 0.5:
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
    rail_x = x1 + 0.04
    angle = math.atan2(L1_Y, z1 - z0)
    length = math.hypot(L1_Y, z1 - z0)
    for nm, y_off in (("Handrail", 0.95), ("Stringer", 0.0)):
        o = B.box(f"Stair_{nm}", rail_x, 0, -0.03, 0.06 if nm == "Handrail" else 0.04, length, 0.06 if nm == "Handrail" else 0.25, M["trim"] if nm == "Handrail" else M["stair"])
        o.rotation_euler = (angle, 0, 0)
        o.location = L.b(B.x(rail_x), (z0 + z1) / 2, L1_Y / 2 + y_off)
        out.append(o)
    for i in range(1, steps, 2):
        zz = z1 - (i + 0.5) * run
        hh = (i + 1) * rise
        out.append(B.box(f"Stair_Baluster{i:02d}", rail_x, zz, hh, 0.035, 0.035, 0.95, M["trim"]))
    out.append(B.box("Stair_PostFoot", rail_x, z1 - 0.05, 0.0, 0.1, 0.1, 1.15, M["stair"]))
    B.col("Stair_Side", x1 + 0.04, (z0 + z1) / 2, 0.0, 0.08, z1 - z0, L1_Y + L1_H)
    for i in range(6):
        zz = z0 + (z1 - z0) * (i + 0.5) / 6
        out.append(B.box(f"Stair_UpperBaluster{i}", rail_x, zz, L1_Y, 0.035, 0.035, 1.0, M["trim"]))
    out.append(B.box("Stair_UpperRail", rail_x, (z0 + z1) / 2, L1_Y + 1.0, 0.07, z1 - z0, 0.06, M["trim"]))
    out.append(B.box("Stair_FootRail", (x0 + x1) / 2 + 0.03, z1 + 0.04, L1_Y, x1 - x0 + 0.06, 0.08, 1.06, M["trim"]))
    B.col("Stair_FootRail", (x0 + x1) / 2, z1 + 0.04, L1_Y, x1 - x0, 0.08, 1.1)
    out.append(B.box("Stair_UpperEdge", (x0 + x1) / 2, z0 - 0.06, L0_H, x1 - x0, 0.12, L1_Y - L0_H, M["stair"]))
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
    }
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
        y = P.levels[level]["y"]
        return [(a + OZ, b + OZ, y0 + y + FY, y1 + y + FY) for a, b, y0, y1 in ops]

    shell = []
    for nm, axis, fixed, a0, a1, side_name in (("Front", "x", ZF - T / 2, -hw, hw, "front"), ("Back", "x", ZB + T / 2, -hw, hw, "back"),
                                               ("W", "z", -hw + T / 2, ZB + T, ZF - T, "west"), ("E", "z", hw - T / 2, ZB + T, ZF - T, "east")):
        ops = []
        for li in range(len(P.levels)):
            raw = P.outer_openings(side_name, li)
            ops += lift(raw, li) if axis == "x" else side(raw, li)
        shell += B.wall(f"EX_Shell{nm}", axis, fixed, T, a0, a1, H_SHELL, E["siding"], openings=ops, solid=False, glass=E["glass"])
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
    elif h["roof"] == "gable_z":
        xo += gable_roof_z(coll, B, E, W, DEPTH, ZC, y_eave, h["rise"], ZF, ZB)
    else:
        xo += flat_roof(coll, B, E, W, DEPTH, ZC, H_SHELL, ZF, ZB)
    if h["chimney"]:
        cx, dz = h["chimney"]
        top = y_eave + (h.get("rise", 0) * 0.75 if h["roof"] != "flat" else 0.6) + 1.2
        xo.append(B.box("EX_Chimney", cx, ZC + dz, y_eave - 0.3, 0.9, 0.9, top - y_eave + 0.3, E["brick"], bevel=0.02, tile=0.5))
        xo.append(B.box("EX_ChimneyCap", cx, ZC + dz, top, 1.08, 1.08, 0.12, E["found"]))

    for i, w in enumerate(P.windows):
        nm = f"EX_Win{i:02d}"
        y = P.levels[w["level"]]["y"]
        small = (w["b"] - w["a"]) < 1.0
        args = (w["a"], w["b"], w["y0"] + y, w["y1"] + y)
        if w["side"] == "front":
            xo += dress(B, E, h, nm, "x", ZF, *args, 1, shutters=True, flower=h["flowers"] and w["level"] == 0 and not small)
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
    elif h["porch"] == "canopy":
        xo += canopy(coll, E, ZF)
    else:
        xo += pergola(coll, E, ZF)
    pw = h.get("porch_w", 3.0) if h["porch"] == "porch" else 3.0 if h["porch"] == "canopy" else 7.4
    for i, (bx_, bz_) in enumerate(((-pw / 2 - 0.7, ZF + 0.6), (pw / 2 + 0.7, ZF + 0.6), (-hw + 0.4, ZF + 0.5), (hw - 0.4, ZF + 0.5))):
        xo.append(L.cyl(coll, f"EX_BushBase{i}", bx_, bz_, 0.0, 0.42, 0.35, E["leaf"], seg=7))
        xo.append(L.cone(coll, f"EX_BushTop{i}", bx_, bz_, 0.35, 0.42, 0.12, 0.45, E["leaf"], seg=7))

    bad = L.check_grounded(xo, allow=("EX_Shell", "EX_Roof", "EX_Gables", "EX_CrossGable", "EX_Ridge", "EX_Fascia", "EX_Chimney", "EX_GableVent", "EX_Win", "Door",
                                      "EX_Door", "EX_PorchLamp", "EX_PorchPost", "EX_Rail", "EX_Baluster", "EX_PorchRoof", "EX_PorchBeam", "EX_Bush", "EX_Corner",
                                      "EX_FloorBand", "EX_NeonBand", "EX_Parapet", "EX_Canopy", "EX_Pergola", "EX_RoofVent"))
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


def dress(B, E, h, name, axis, face, a, b, y0, y1, outward, shutters=True, flower=False):
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

    out = [bx("Head", mid, yy1, w + 2 * FR + (0.0 if modern else 0.06), 0.08 if modern else 0.12),
           bx("Sill", mid, yy0 - 0.07, w + 2 * FR + (0.04 if modern else 0.14), 0.07, depth=0.16, off=0.05),
           bx("JambA", a - FR / 2, yy0, FR, yy1 - yy0),
           bx("JambB", b + FR / 2, yy0, FR, yy1 - yy0)]
    if not modern:
        out += [bx("Mullion", mid, yy0, 0.05, yy1 - yy0, depth=0.04, off=-0.07),
                bx("Transom", mid, yy0 + (yy1 - yy0) * 0.62, w, 0.05, depth=0.04, off=-0.07)]
        if shutters and h["palette"] != "scandi":
            sw = min(0.55, w * 0.38)
            out.append(bx("ShutterA", a - FR - sw / 2 - 0.02, yy0, sw, yy1 - yy0, depth=0.04, mat=E["shutter"]))
            out.append(bx("ShutterB", b + FR + sw / 2 + 0.02, yy0, sw, yy1 - yy0, depth=0.04, mat=E["shutter"]))
    elif "neon" in E:
        out.append(bx("Neon", mid, yy0 - 0.12, w + 0.1, 0.04, depth=0.04, mat=E["neon2"], off=0.06))
    if flower:
        out.append(bx("FlowerBox", mid, yy0 - 0.38, w, 0.28, depth=0.24, mat=E["box"], off=0.12))
        out.append(bx("Flowers", mid, yy0 - 0.1, w - 0.1, 0.12, depth=0.18, mat=E["flower"], off=0.12))
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
    print(key, "interior tris", tri_count(io), "exterior tris", tri_count(xo), "interiorOffset", offset,
          "footprint", [dims["W"], round(dims["DEPTH"], 3)], "footprintCenterZ", round(dims["ZC"], 3))


for _key in globals().get("HOUSE_KEYS") or list(HOUSES):
    build(_key)
