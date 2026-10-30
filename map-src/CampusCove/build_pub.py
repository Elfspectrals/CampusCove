"""The Salty Shamrock (job: barman), interior. Run inside Blender: exec(open(p).read(), {"__file__": p}).

Interior (house contract): x [-10, 10], z [-15, 5], door at z=+5.1, rooms towards -Z (docs/PUB.md, section 2).
East: L-shaped bar (Tap_01..03, Bell, 6 stools), back bar with bottles and casks. West: fireplace with two armchairs,
booths. Centre: round tables, two stone pillars. Back: LADS / LASSES toilets, darts nook (Dartboard), a plain CELLAR door
(Door_Secret) guarded by NPC_Bouncer: a landing and a straight stair down to the hidden velvet lounge in the cellar (floor y = BY, levels/stairs
in the layout like the two-storey houses). Shot plank (ShotPlank, Shot_01..10) on the front ledge.
Outputs: out/work/pub/{interior.glb, interior.colsrc.glb, interior.layout.json}, then build_pub_ext.py.
Lightmap: Blender --background --factory-startup --python build_house_lightmaps.py -- work pub
"""
import importlib
import math
import os
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
from mathutils import Vector

KEY = "pub"
NAME = "The Salty Shamrock"
JOB = "barman"
OUT = os.path.join(L.OUT_ROOT, "work", KEY)
H = 3.0
X0, X1, Z0, Z1 = -10.0, 10.0, -15.0, 5.0
TWO_PI = 2 * math.pi
BAR_X, BAR_Z0, BAR_Z1 = 7.0, -8.0, -1.0
BAR_TOP = 1.05
STOOL_X = 6.05
STOOL_Z = (-2.2, -3.2, -4.2, -5.2, -6.2, -7.2)
TAP_Z = (-3.6, -4.6, -5.6)
BELL = (8.5, 1.9, -1.0)
COUNTER = (8.5, 0.0, -0.1)
BARTENDER = (8.3, 0.0, -4.6)
BARTENDER_YAW = math.pi / 2
BOUNCER = (4.0, 0.0, -9.05)
SECRET_WALL_Z = -10.5
SECRET_DOOR_X = (3.55, 4.45)
KEGS_X = (5.85, 6.55)
CRATES = (2.27, -10.15)
SECRET_ROOM = {"minX": 2.1, "maxX": 10.0, "minZ": -15.0, "maxZ": -10.6}
# cellar under the back of the pub, reached by a straight stair behind Door_Secret (descends towards +x along the back wall)
BY, BH = -3.2, 2.8
BASEMENT = {"minX": -10.0, "maxX": 10.0, "minZ": -15.0, "maxZ": -4.0}
STAIR_X0, STAIR_X1 = 3.6, 8.6
PART_Z = -13.42
STAIR_STEPS = 16
TOILET_WALL_Z = -11.5
TOILET_MID_X = -6.2
TOILET_EAST_X = -2.4
BOARD = (-0.2, 1.73, -14.95)
OCHE_DIST = 2.37
PLANK = (6.5, BAR_TOP, 4.78)
SEAT_Y = {"stool": 0.72, "chair": 0.45, "bench": 0.45, "armchair": 0.42, "sofa": 0.42}
TABLES = ((-6.2, 1.0), (-2.6, 0.0), (2.6, 1.4), (-6.4, -3.2), (-0.8, -2.8), (3.4, -3.6), (-6.0, -7.4), (-1.2, -7.6))
PILLARS = ((-3.6, -3.4), (3.0, -6.6))
FIRE_Z = -4.0

sc = L.new_build_scene("WORK_" + KEY + "_interior")
coll = bpy.data.collections.new("Interior")
sc.collection.children.link(coll)
cols = L.Collisions(coll)
M = L.std_mats(wall="#8f8a82", floor=("#4b3322", "planks", "#36241a"))
M["stone"] = L.make_mat("IN_pub_Stone", "#8f8a82", 0.95, "tiles", 0.07, accent="#6b665f")
M["plaster"] = L.make_mat("IN_pub_Plaster", "#e9e2d2", 0.9, "noise", 0.03)
M["flag"] = L.make_mat("IN_pub_Flagstone", "#6f6a62", 0.9, "tiles", 0.06, accent="#55514b")
M["beam"] = L.make_mat("IN_pub_Beam", "#3b2616", 0.85, "planks", 0.04, accent="#2a1a0f")
M["mahogany"] = L.make_mat("IN_pub_Mahogany", "#5a2d1a", 0.45, "planks", 0.04, accent="#46200f")
M["green"] = L.make_mat("IN_pub_GreenPanel", "#2f6b4a", 0.6, "noise", 0.03)
M["leather"] = L.make_mat("IN_pub_GreenLeather", "#1f5a3a", 0.5, "noise", 0.03)
M["brownleather"] = L.make_mat("IN_pub_BrownLeather", "#4a2a1c", 0.5, "noise", 0.04)
M["brass"] = L.make_mat("IN_pub_Brass", "#c9a24a", 0.3, "noise", 0.03)
M["chrome"] = L.make_mat("IN_pub_Chrome", "#d8dde2", 0.2, "noise", 0.02)
M["mirror"] = L.make_mat("IN_pub_Mirror", "#c4d2d8", 0.05, "noise", 0.01)
M["tiffany"] = L.make_mat("IN_pub_Tiffany", "#d98c2b", 0.4, "checker", 0.05, accent="#3f8f5a", emit="#ffb347", emit_strength=0.5)
M["bulb"] = L.make_mat("IN_pub_Bulb", "#ffe2b0", 0.4, "noise", 0.0, emit="#ffd9a0", emit_strength=1.6)
M["globe"] = L.make_mat("IN_pub_Globe", "#fff7ea", 0.4, "noise", 0.0, emit="#fff3dc", emit_strength=1.2)
M["fire"] = L.make_mat("IN_pub_Fire", "#ff7a1a", 0.6, "noise", 0.05, emit="#ff8c2a", emit_strength=2.0)
M["flame"] = L.make_mat("IN_pub_Flame", "#ffc14a", 0.6, "noise", 0.05, emit="#ffc14a", emit_strength=2.0)
M["ember"] = L.make_mat("IN_pub_Ember", "#2a1a12", 0.9, "noise", 0.04)
M["brick"] = L.make_mat("IN_pub_CellarBrick", "#7a3f2c", 0.95, "tiles", 0.08, accent="#5a2c1e")
M["rug"] = L.make_mat("IN_pub_Rug", "#7a3b2a", 1.0, "stripes", 0.04, accent="#c9a24a")
M["white"] = L.make_mat("IN_pub_White", "#f4f1ea", 0.5, "noise", 0.01)
M["tile"] = L.make_mat("IN_pub_Tile", "#eef0ec", 0.3, "tiles", 0.02, accent="#cfd4cc")
M["board"] = L.make_mat("IN_pub_Chalkboard", "#232a26", 0.85, "noise", 0.02)
M["dart"] = L.make_mat("IN_pub_Dartboard", "#e8dcc0", 0.8, "stripes", 0.03, accent="#1e1e1e")
M["dartred"] = L.make_mat("IN_pub_DartRed", "#c8352b", 0.6, "noise", 0.02)
M["dartgreen"] = L.make_mat("IN_pub_DartGreen", "#2f7a45", 0.6, "noise", 0.02)
M["amber"] = L.make_mat("IN_pub_BottleAmber", "#b8651a", 0.2, "noise", 0.04)
M["bottlegreen"] = L.make_mat("IN_pub_BottleGreen", "#2f6f3a", 0.2, "noise", 0.04)
M["bottleclear"] = L.make_mat("IN_pub_BottleClear", "#dfeef5", 0.15, "noise", 0.02)
M["oak"] = L.make_mat("IN_pub_Oak", "#a97a4a", 0.7, "planks", 0.05, accent="#7c5631")
M["pewter"] = L.make_mat("IN_pub_Pewter", "#8c9196", 0.4, "noise", 0.03)
M["skin"] = L.make_mat("IN_pub_Skin", "#e9b48f", 0.8, "noise", 0.02)
M["ginger"] = L.make_mat("IN_pub_Ginger", "#b4572a", 0.9, "noise", 0.04)
M["suit"] = L.make_mat("IN_pub_Suit", "#15161a", 0.8, "noise", 0.02)
M["shirt"] = L.make_mat("IN_pub_Shirt", "#f6f3ec", 0.8, "noise", 0.02)
M["glassgreen"] = L.make_mat("IN_pub_ShotGlass", "#dfeef5", 0.1, "noise", 0.01, alpha=0.35)
M["bunting"] = [L.make_mat("IN_pub_BuntingGreen", "#2f9e5b", 0.9, "noise", 0.03), L.make_mat("IN_pub_BuntingWhite", "#f7f4ec", 0.9, "noise", 0.02),
                L.make_mat("IN_pub_BuntingOrange", "#f08a2a", 0.9, "noise", 0.03)]
M["picture"] = [L.make_mat("IN_pub_PictureA", "#6f8f5a", 0.9, "noise", 0.08), L.make_mat("IN_pub_PictureB", "#8aa7c9", 0.9, "noise", 0.08),
                L.make_mat("IN_pub_PictureC", "#c98a5a", 0.9, "noise", 0.08)]

objs = []
seats = []


def add(o):
    objs.append(o)
    return o


def norm_yaw(yaw):
    return round(yaw % TWO_PI, 4)


def seat(kind, gx, gz, yaw, parts, y0=0.0):
    n = sum(1 for s in seats if s["kind"] == kind) + 1
    sid = f"{kind}_{n:02d}"
    o = add(L.furn(coll, f"seat_{sid}", gx, gz, yaw, parts))
    o.location.z += y0
    seats.append({"id": sid, "kind": kind, "position": [round(gx, 3), round(y0 + SEAT_Y[kind], 3), round(gz, 3)], "yaw": norm_yaw(yaw)})
    return o


def mesh_obj(name, bm, mat, loc, tile=1.0):
    bm.normal_update()
    L._box_uv(bm, tile)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    ob.location = loc
    coll.objects.link(ob)
    return ob


def sphere(name, gx, gz, y_center, r, mat):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r)
    for v in bm.verts:
        v.co.z += r
    return mesh_obj(name, bm, mat, L.b(gx, gz, y_center - r))


def ring(name, gx, gz, y_center, r_out, r_in, thick, mat, seg=6):
    """Flat annulus standing in the x/y plane, readable from game +Z; thickness along game z."""
    bm = bmesh.new()
    outer, inner = [], []
    for k in range(seg):
        a = TWO_PI * k / seg
        outer.append((r_out * math.cos(a), r_out * math.sin(a)))
        inner.append((r_in * math.cos(a), r_in * math.sin(a)))
    front_o = [bm.verts.new((x, 0.0, r_out + y)) for x, y in outer]
    front_i = [bm.verts.new((x, 0.0, r_out + y)) for x, y in inner]
    back_o = [bm.verts.new((x, thick, r_out + y)) for x, y in outer]
    back_i = [bm.verts.new((x, thick, r_out + y)) for x, y in inner]
    for k in range(seg):
        j = (k + 1) % seg
        bm.faces.new((front_o[k], front_o[j], front_i[j], front_i[k]))
        bm.faces.new((back_o[j], back_o[k], back_i[k], back_i[j]))
        bm.faces.new((front_o[j], front_o[k], back_o[k], back_o[j]))
        bm.faces.new((front_i[k], front_i[j], back_i[j], back_i[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_obj(name, bm, mat, L.b(gx, gz, y_center - r_out))


def lying_cyl(name, gx, gz_center, y_center, r, length, mat, seg=10):
    """Cylinder lying along game z (a cask, a log)."""
    o = L.cyl(coll, name, gx, gz_center - length / 2, y_center, r, length, mat, seg=seg)
    o.rotation_euler = (math.pi / 2, 0, 0)
    return o


def facing_disc(name, gx, gz, y_center, r, thick, mat, seg=20):
    """Disc standing against a wall, its face towards game +Z."""
    o = L.cyl(coll, name, gx, gz, y_center, r, thick, mat, seg=seg)
    o.rotation_euler = (math.pi / 2, 0, 0)
    return o


def joined(name, parts):
    bpy.context.view_layer.update()
    return add(L.join(coll, name, parts))


def low_text(coll_, name, body, gx, gz, y0, size, extrude, mat, yaw=0.0):
    """Lettering as a mesh with a coarse curve resolution (text_mesh costs ~150 triangles a letter). yaw: 0 reads from game +Z."""
    cu = bpy.data.curves.new(name + "_cu", "FONT")
    cu.body = body
    cu.size = size
    cu.extrude = extrude
    cu.resolution_u = 1
    cu.align_x = "CENTER"
    cu.align_y = "BOTTOM"
    tmp = bpy.data.objects.new(name + "_tmp", cu)
    coll_.objects.link(tmp)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    coll_.objects.unlink(tmp)
    bpy.data.objects.remove(tmp)
    bpy.data.curves.remove(cu)
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    ob.rotation_euler = (math.pi / 2, 0, yaw)
    ob.location = L.b(gx, gz, y0)
    coll_.objects.link(ob)
    return ob


def chair_parts(seat_mat):
    return [(0, 0, 0.4, 0.42, 0.42, 0.05, seat_mat), (0, 0.19, 0.45, 0.42, 0.04, 0.5, M["mahogany"]),
            (0, 0.02, 0.0, 0.34, 0.32, 0.4, M["mahogany"])]


ARMCHAIR = [(0, 0, 0.0, 0.6, 0.55, 0.14, M["mahogany"]), (0, 0.05, 0.14, 0.7, 0.65, 0.28, M["brownleather"]),
            (0, 0.33, 0.42, 0.7, 0.16, 0.5, M["brownleather"]), (-0.33, 0, 0.14, 0.12, 0.65, 0.5, M["brownleather"]),
            (0.33, 0, 0.14, 0.12, 0.65, 0.5, M["brownleather"])]
BENCH = [(0, 0, 0.0, 1.15, 0.45, 0.39, M["mahogany"]), (0, 0, 0.39, 1.2, 0.5, 0.06, M["leather"]), (0, 0.23, 0.45, 1.2, 0.06, 0.62, M["leather"])]


def stool(gx, gz, yaw):
    n = sum(1 for s in seats if s["kind"] == "stool") + 1
    sid = f"stool_{n:02d}"
    parts = [L.cyl(coll, "s_base", gx, gz, 0.0, 0.2, 0.03, M["chrome"], seg=6), L.cyl(coll, "s_pole", gx, gz, 0.03, 0.03, 0.63, M["chrome"], seg=5),
             L.cyl(coll, "s_seat", gx, gz, 0.66, 0.19, 0.06, M["leather"], seg=6)]
    joined(f"seat_{sid}", parts)
    seats.append({"id": sid, "kind": "stool", "position": [gx, SEAT_Y["stool"], gz], "yaw": norm_yaw(yaw)})


def round_table(name, gx, gz):
    parts = [L.cyl(coll, "t_base", gx, gz, 0.0, 0.3, 0.04, M["mahogany"], seg=6), L.cyl(coll, "t_col", gx, gz, 0.04, 0.06, 0.68, M["mahogany"], seg=4),
             L.cyl(coll, "t_top", gx, gz, 0.72, 0.45, 0.04, M["mahogany"], seg=8)]
    joined(name, parts)
    cols.add(name, gx, gz, 0.0, 0.9, 0.9, 0.76)


def tankard(name, gx, gz, y0):
    joined(name, [L.cyl(coll, "k_body", gx, gz, y0, 0.045, 0.14, M["pewter"], seg=6), L.box(coll, "k_handle", gx + 0.06, gz, y0 + 0.03, 0.03, 0.02, 0.08, M["pewter"])])


def pint(name, gx, gz, y0):
    joined(name, [L.cyl(coll, "p_liquid", gx, gz, y0, 0.034, 0.12, M["ember"], seg=6), L.cyl(coll, "p_foam", gx, gz, y0 + 0.12, 0.035, 0.03, M["white"], seg=6)])


def pennant(name, gx, gz, y_top, w, h, mat):
    """Single triangle flag in the x/y plane (double-sided material), point down."""
    bm = bmesh.new()
    vs = [bm.verts.new((-w / 2, 0.0, 0.0)), bm.verts.new((w / 2, 0.0, 0.0)), bm.verts.new((0.0, 0.0, -h))]
    bm.faces.new(vs)
    return mesh_obj(name, bm, mat, L.b(gx, gz, y_top))


def tiffany(name, gx, gz):
    parts = [L.cyl(coll, "l_rod", gx, gz, 2.45, 0.012, 0.55, M["beam"], seg=3), L.cone(coll, "l_shade", gx, gz, 2.2, 0.34, 0.08, 0.26, M["tiffany"], seg=8),
             L.box(coll, "l_bulb", gx, gz, 2.16, 0.1, 0.1, 0.06, M["bulb"])]
    joined(name, parts)


def globe(name, gx, gz):
    joined(name, [L.cyl(coll, "g_rod", gx, gz, 2.55, 0.012, 0.45, M["beam"], seg=5), sphere("g_globe", gx, gz, 2.4, 0.16, M["globe"])])


def picture(name, gx, gz, y0, w, h, rot, mat):
    c, s = math.cos(rot), math.sin(rot)
    add(L.box(coll, name, gx, gz, y0, w, 0.04, h, M["beam"], rot=rot))
    add(L.box(coll, name + "_Art", gx - 0.025 * s, gz - 0.025 * c, y0 + 0.04, w - 0.08, 0.02, h - 0.08, mat, rot=rot))


def knot_panel(name, gx, gz, y0, rot, size=0.8):
    c, s = math.cos(rot), math.sin(rot)
    add(L.box(coll, name, gx, gz, y0, size, 0.04, size, M["green"], rot=rot))
    cy = y0 + size / 2
    rr = size * 0.19
    for k, (dx, dy) in enumerate(((0.0, rr * 0.55), (-rr * 0.5, -rr * 0.3), (rr * 0.5, -rr * 0.3))):
        o = ring(f"{name}_Ring{k}", gx + dx * c - 0.03 * s, gz - 0.03 * c - dx * s, cy + dy, rr, rr * 0.72, 0.02, M["brass"])
        o.rotation_euler = (0, 0, rot + math.pi)
        add(o)


def barrel(name, gx, gz, y0, r, length, lying=True, seg=10):
    if lying:
        parts = [lying_cyl("b_body", gx, gz, y0 + r, r, length, M["oak"], seg=8)]
        for k, dz in enumerate((-length * 0.32, length * 0.32)):
            parts.append(lying_cyl(f"b_hoop{k}", gx, gz + dz, y0 + r, r + 0.012, 0.06, M["pewter"], seg=8))
    else:
        parts = [L.cyl(coll, "b_body", gx, gz, y0, r, length, M["oak"], seg=seg)]
        for k, dy in enumerate((length * 0.18, length * 0.82)):
            parts.append(L.cyl(coll, f"b_hoop{k}", gx, gz, y0 + dy - 0.03, r + 0.012, 0.06, M["pewter"], seg=seg))
    return joined(name, parts)


def person(name, gx, gz, rot, trousers, torso, arms, head_extra):
    parts = [(-0.11, 0, 0.0, 0.15, 0.2, 0.82, trousers), (0.11, 0, 0.0, 0.15, 0.2, 0.82, trousers),
             *torso, *arms, (0, 0, 1.42, 0.1, 0.1, 0.06, M["skin"]), (0, 0, 1.48, 0.26, 0.26, 0.28, M["skin"], 0.05), *head_extra,
             (-0.06, -0.13, 1.6, 0.03, 0.01, 0.03, M["black"]), (0.06, -0.13, 1.6, 0.03, 0.01, 0.03, M["black"])]
    add(L.furn(coll, name, gx, gz, rot, parts))
    cols.add(name, gx, gz, 0.0, 0.7, 0.45, 1.8)


# ---------------------------------------------------------------- shell
# ground floor slab with the stairwell cut out (the stair corridor x STAIR_X0..X1, z Z0..PART_Z is open to the cellar)
add(L.box(coll, "House_Floor_Main", 0, (PART_Z + Z1) / 2, -0.1, X1 - X0, Z1 - PART_Z, 0.1, M["floor"], tile=2.0))
add(L.box(coll, "House_Floor_MainBackW", (X0 + STAIR_X0) / 2, (Z0 + PART_Z) / 2, -0.1, STAIR_X0 - X0, PART_Z - Z0, 0.1, M["floor"], tile=2.0))
add(L.box(coll, "House_Floor_MainBackE", (STAIR_X1 + X1) / 2, (Z0 + PART_Z) / 2, -0.1, X1 - STAIR_X1, PART_Z - Z0, 0.1, M["floor"], tile=2.0))
add(L.box(coll, "House_Floor_Flagstone", 8.0, -4.2, 0.0, 4.0, 8.8, 0.012, M["flag"], tile=1.5))
add(L.box(coll, "House_Floor_Entry", 0, 3.6, 0.0, 5.0, 2.8, 0.012, M["flag"], tile=1.5))
add(L.box(coll, "Ceiling", 0, (Z0 + Z1 + 0.2) / 2, H, X1 - X0 + 0.4, Z1 - Z0 + 0.4, 0.1, M["beam"], tile=2.0))
win_y = (1.0, 2.2)
front_win = ((-7.0, -3.0), (3.0, 7.0))
west_win = ((-2.0, 0.0), (2.0, 4.0))
east_win = ((2.0, 4.0),)
objs += L.wall(coll, "Walls_Front", "x", Z1 + 0.1, 0.2, X0 - 0.2, X1 + 0.2, H, M["stone"],
               openings=[(a, b_, *win_y) for a, b_ in front_win] + [L.DOOR_OPENING], cols=cols, glass=M["glass"], col_tag="Wall_Front")
objs += L.wall(coll, "Walls_Back", "x", Z0 - 0.1, 0.2, X0 - 0.2, X1 + 0.2, H, M["stone"], cols=cols, col_tag="Wall_Back")
objs += L.wall(coll, "Walls_W", "z", X0 - 0.1, 0.2, Z0, Z1 + 0.2, H, M["stone"], openings=[(a, b_, *win_y) for a, b_ in west_win], cols=cols, glass=M["glass"], col_tag="Wall_W")
objs += L.wall(coll, "Walls_E", "z", X1 + 0.1, 0.2, Z0, Z1 + 0.2, H, M["stone"], openings=[(a, b_, *win_y) for a, b_ in east_win], cols=cols, glass=M["glass"], col_tag="Wall_E")
for side, x in (("W", X0 + 0.02), ("E", X1 - 0.02)):
    add(L.box(coll, f"Wall_Wainscot{side}", x, (Z0 + Z1) / 2, 0.0, 0.04, Z1 - Z0, 0.95, M["green"], tile=2.0))
add(L.box(coll, "Wall_WainscotBack", 0, Z0 + 0.02, 0.0, X1 - X0, 0.04, 0.95, M["green"], tile=2.0))
add(L.box(coll, "Door_Entrance", 0, 5.1, 0.01, 1.18, 0.06, 2.18, M["green"], bevel=0.02))
add(L.box(coll, "Door_Entrance_Glass", 0, 5.07, 1.4, 0.5, 0.02, 0.5, M["glass"]))
add(L.box(coll, "Door_Entrance_Handle", 0.42, 4.97, 0.98, 0.04, 0.12, 0.04, M["brass"]))
add(L.box(coll, "Door_Entrance_Sign", 0, 4.99, 2.37, 0.5, 0.02, 0.16, M["brass"]))
add(L.box(coll, "Entry_Doormat", 0, 4.4, 0.0, 1.2, 0.7, 0.012, M["mat"]))
for nm, gx, gz, sx, sz in [("Sky_Back", 0, -20, 44, 0.05), ("Sky_Front", 0, 14, 44, 0.05), ("Sky_West", -16, -5, 0.05, 44), ("Sky_East", 16, -5, 0.05, 44)]:
    add(L.box(coll, nm, gx, gz, -3.0, sx, sz, 9.0, M["sky"]))
for i, bz in enumerate((3.0, 0.5, -2.0, -4.5, -7.0, -9.5, -12.0)):
    add(L.box(coll, f"Ceiling_Beam{i:02d}", 0, bz, H - 0.28, X1 - X0, 0.22, 0.28, M["beam"], tile=2.0))
add(L.box(coll, "Ceiling_Ridge", 0, (Z0 + Z1) / 2, H - 0.3, 0.3, Z1 - Z0, 0.3, M["beam"], tile=2.0))
for k in range(11):
    for j, bz in enumerate((3.0, -7.0)):
        add(pennant(f"Bunting_{j}{k:02d}", X0 + 1.0 + k * 1.8, bz + 0.16, H - 0.23, 0.24, 0.32, M["bunting"][(k + j) % 3]))

# ---------------------------------------------------------------- bar (east)
bar_len = BAR_Z1 - BAR_Z0
bar_cz = (BAR_Z0 + BAR_Z1) / 2
long_leg = [(0, 0, 0.0, 0.6, bar_len, 1.0, M["mahogany"]), (0, 0, 1.0, 0.76, bar_len + 0.1, 0.05, M["mahogany"], 0.01),
            (-0.37, 0, 0.84, 0.04, bar_len, 0.04, M["brass"]), (-0.37, 0, 0.16, 0.04, bar_len, 0.04, M["brass"])]
for k in range(6):
    long_leg.append((-0.315, -bar_len / 2 + 0.6 + k * 1.15, 0.26, 0.03, 0.8, 0.5, M["green"]))
add(L.furn(coll, "Bar_Long", BAR_X, bar_cz, 0.0, long_leg))
cols.add("Bar_Long", BAR_X, bar_cz, 0.0, 0.8, bar_len + 0.1, BAR_TOP)
short_leg = [(0, 0, 0.0, 3.0, 0.6, 1.0, M["mahogany"]), (0, 0, 1.0, 3.1, 0.76, 0.05, M["mahogany"], 0.01),
             (0, 0.37, 0.84, 3.0, 0.04, 0.04, M["brass"]), (0, 0.37, 0.16, 3.0, 0.04, 0.04, M["brass"]),
             (-0.9, 0.315, 0.26, 0.8, 0.03, 0.5, M["green"]), (0.3, 0.315, 0.26, 0.8, 0.03, 0.5, M["green"])]
add(L.furn(coll, "Bar_Short", 8.5, BAR_Z1, 0.0, short_leg))
cols.add("Bar_Short", 8.5, BAR_Z1, 0.0, 3.1, 0.8, BAR_TOP)
for i, tz in enumerate(TAP_Z, start=1):
    add(L.furn(coll, f"Tap_{i:02d}", BAR_X, tz, math.pi / 2, [
        (0, 0, BAR_TOP, 0.12, 0.12, 0.03, M["chrome"]), (0, 0, BAR_TOP + 0.03, 0.06, 0.06, 0.26, M["chrome"]),
        (0, -0.08, BAR_TOP + 0.22, 0.04, 0.14, 0.04, M["chrome"]), (0, 0.01, BAR_TOP + 0.29, 0.045, 0.045, 0.2, M["brass"]),
        (0, -0.03, BAR_TOP + 0.39, 0.07, 0.015, 0.1, (M["green"], M["black"], M["amber"])[i % 3])]))
pint("Bar_Pint01", BAR_X - 0.15, -2.3, BAR_TOP)
pint("Bar_Pint02", BAR_X - 0.1, -6.9, BAR_TOP)
tankard("Bar_Tankard", 9.2, BAR_Z1 + 0.1, BAR_TOP)
add(L.furn(coll, "Bar_Till", 8.1, BAR_Z1, 0.0, [(0, 0, BAR_TOP, 0.4, 0.34, 0.16, M["black"]), (0, -0.1, BAR_TOP + 0.16, 0.3, 0.02, 0.14, M["board"])]))
joined("Bell", [L.box(coll, "bell_rod", *BELL[::2], 2.1, 0.03, 0.03, H - 2.1 - 0.28, M["metal"]), L.cone(coll, "bell_body", *BELL[::2], 1.84, 0.15, 0.06, 0.26, M["brass"], seg=10),
                L.cyl(coll, "bell_clapper", *BELL[::2], 1.78, 0.025, 0.1, M["brass"], seg=6)])
for i, sz_ in enumerate(STOOL_Z):
    stool(STOOL_X, sz_, -math.pi / 2)

back_cz, back_len = -4.7, 5.8
add(L.furn(coll, "BackBar", 9.75, back_cz, 0.0, [(0, 0, 0.0, 0.5, back_len, 0.95, M["mahogany"]), (0, 0, 0.95, 0.56, back_len + 0.1, 0.05, M["mahogany"], 0.01),
                                                 (0.22, 0, 1.0, 0.03, back_len, 1.5, M["mirror"]), (0.2, 0, 2.5, 0.08, back_len + 0.1, 0.1, M["brass"]),
                                                 (0.2, -back_len / 2 - 0.02, 1.0, 0.08, 0.06, 1.6, M["brass"]), (0.2, back_len / 2 + 0.02, 1.0, 0.08, 0.06, 1.6, M["brass"]),
                                                 (0.08, 0, 1.3, 0.26, back_len - 0.4, 0.03, M["glass"]), (0.08, 0, 1.75, 0.26, back_len - 0.4, 0.03, M["glass"])]))
cols.add("BackBar", 9.75, back_cz, 0.0, 0.56, back_len + 0.1, 1.0)
add(low_text(coll, "BackBar_Lettering", "SALTY SHAMROCK", 9.96, back_cz, 2.2, 0.24, 0.0, M["brass"], yaw=-math.pi / 2))
bottle_mats = (M["amber"], M["bottlegreen"], M["bottleclear"], M["amber"])
for row, y in enumerate((1.33, 1.78)):
    for k in range(7):
        bz = back_cz - back_len / 2 + 0.6 + k * 0.76 + 0.15 * (row % 2)
        joined(f"Bottle_{row}{k:02d}", [L.cyl(coll, "bt_body", 9.8, bz, y, 0.035, 0.24, bottle_mats[(k + row) % 4], seg=4), L.cyl(coll, "bt_neck", 9.8, bz, y + 0.24, 0.014, 0.08, bottle_mats[(k + row) % 4], seg=4)])
barrel("BackBar_Cask01", 9.75, -2.4, 1.0, 0.14, 0.36)
barrel("BackBar_Cask02", 9.75, -7.0, 1.0, 0.14, 0.36)
for i, gz in enumerate((-2.5, -4.5, -6.5)):
    globe(f"Light_Globe{i:02d}", BAR_X - 0.3, gz)
person("NPC_Bartender", BARTENDER[0], BARTENDER[2], BARTENDER_YAW, M["suit"],
       [(0, 0, 0.82, 0.44, 0.24, 0.6, M["shirt"], 0.04), (0, -0.01, 0.82, 0.3, 0.25, 0.5, M["suit"], 0.03), (0, -0.13, 0.5, 0.36, 0.02, 0.55, M["green"])],
       [(-0.28, -0.04, 0.86, 0.11, 0.13, 0.54, M["shirt"]), (0.28, -0.04, 0.86, 0.11, 0.13, 0.54, M["shirt"])],
       [(0, 0.03, 1.7, 0.27, 0.24, 0.1, M["ginger"], 0.03), (0, -0.12, 1.47, 0.2, 0.04, 0.1, M["ginger"], 0.02)])
stations = [{"id": f"station_{JOB}_{i:02d}", "job": JOB, "role": "bar", "desk": "Bar_Long", "position": [8.3, 0.0, sz_], "yaw": math.pi / 2, "lookAt": [BAR_X, BAR_TOP, sz_]}
            for i, sz_ in enumerate((-2.6, -6.6), start=1)]

# ---------------------------------------------------------------- front ledge + shot plank
add(L.furn(coll, "Ledge", 6.5, 4.8, 0.0, [(0, 0, 1.0, 6.0, 0.32, 0.05, M["mahogany"], 0.01), (-2.5, 0.1, 0.0, 0.06, 0.1, 1.0, M["metal"]), (2.5, 0.1, 0.0, 0.06, 0.1, 1.0, M["metal"]),
                                         (0, 0.1, 0.0, 0.06, 0.1, 1.0, M["metal"])]))
cols.add("Ledge", 6.5, 4.8, 0.0, 6.0, 0.4, BAR_TOP)
plank = add(L.box(coll, "ShotPlank", PLANK[0], PLANK[2], PLANK[1], 1.0, 0.14, 0.03, M["oak"], bevel=0.005))
for i in range(10):
    shot = add(L.cyl(coll, f"Shot_{i + 1:02d}", PLANK[0] - 0.45 + i * 0.1, PLANK[2], PLANK[1] + 0.03, 0.02, 0.055, M["glassgreen"], seg=6))
    shot.parent = plank
    shot.matrix_parent_inverse = plank.matrix_world.inverted()
shots_player = [PLANK[0], 0.0, 4.1]
pint("Ledge_Pint", 4.2, 4.8, BAR_TOP)
tankard("Ledge_Tankard", 8.8, 4.8, BAR_TOP)

# ---------------------------------------------------------------- fireplace (west)
for k, sgn in enumerate((-1, 1)):
    add(L.box(coll, f"Wall_ChimneyPier{k}", X0 + 0.45, FIRE_Z + sgn * 1.025, 0.0, 0.9, 0.75, H, M["stone"], tile=1.5))
add(L.box(coll, "Wall_ChimneyLintel", X0 + 0.45, FIRE_Z, 1.05, 0.9, 1.3, H - 1.05, M["stone"], tile=1.5))
cols.add("Chimney", X0 + 0.45, FIRE_Z, 0.0, 0.9, 2.8, H)
add(L.box(coll, "Wall_HearthBack", X0 + 0.15, FIRE_Z, 0.0, 0.3, 1.3, 1.05, M["ember"]))
add(L.box(coll, "Wall_HearthStone", X0 + 1.05, FIRE_Z, 0.0, 0.4, 1.9, 0.1, M["flag"]))
add(L.box(coll, "Wall_Mantel", X0 + 0.95, FIRE_Z, 1.32, 0.3, 1.9, 0.08, M["beam"]))
add(L.box(coll, "Light_Fire", X0 + 0.55, FIRE_Z, 0.12, 0.4, 0.9, 0.18, M["fire"]))
for k, (dz, hh) in enumerate(((-0.22, 0.45), (0.0, 0.6), (0.22, 0.4))):
    add(L.cone(coll, f"Hearth_Flame{k}", X0 + 0.55, FIRE_Z + dz, 0.26, 0.12, 0.0, hh, M["flame"], seg=5))
add(lying_cyl("Hearth_Log01", X0 + 0.45, FIRE_Z, 0.17, 0.07, 0.7, M["beam"], seg=6))
add(lying_cyl("Hearth_Log02", X0 + 0.62, FIRE_Z, 0.17, 0.07, 0.7, M["beam"], seg=6))
add(L.box(coll, "Hearth_Logs", X0 + 1.5, FIRE_Z + 1.1, 0.0, 0.5, 0.5, 0.5, M["beam"]))
add(L.box(coll, "Wall_Harp", X0 + 0.9, FIRE_Z, 1.6, 0.06, 0.7, 0.8, M["green"], bevel=0.03))
for k, (dz, dy, w, hh) in enumerate(((0.0, 1.68, 0.5, 0.06), (-0.22, 1.68, 0.06, 0.6), (0.0, 2.22, 0.5, 0.06), (0.22, 1.68, 0.06, 0.6))):
    add(L.box(coll, f"Wall_HarpFrame{k}", X0 + 0.94, FIRE_Z + dz, dy, 0.03, w, hh, M["brass"]))
for k in range(4):
    add(L.box(coll, f"Wall_HarpString{k}", X0 + 0.94, FIRE_Z - 0.12 + k * 0.08, 1.74, 0.02, 0.012, 0.46, M["brass"]))
add(L.box(coll, "Rug_Hearth", X0 + 2.0, FIRE_Z, 0.0, 1.6, 2.4, 0.012, M["rug"], tile=0.8))
seat("armchair", X0 + 1.6, FIRE_Z + 1.7, 0.0, ARMCHAIR)
seat("armchair", X0 + 1.6, FIRE_Z - 1.7, math.pi, ARMCHAIR)
cols.add("Armchair_01", X0 + 1.6, FIRE_Z + 1.7, 0.0, 0.7, 0.7, 0.9)
cols.add("Armchair_02", X0 + 1.6, FIRE_Z - 1.7, 0.0, 0.7, 0.7, 0.9)
add(L.furn(coll, "LowTable", X0 + 1.9, FIRE_Z, 0.0, [(0, 0, 0.0, 0.8, 0.5, 0.42, M["mahogany"]), (0, 0, 0.42, 0.9, 0.6, 0.04, M["mahogany"])]))
cols.add("LowTable", X0 + 1.9, FIRE_Z, 0.0, 0.9, 0.6, 0.46)
tankard("LowTable_Tankard", X0 + 1.9, FIRE_Z + 0.1, 0.46)
knot_panel("Wall_KnotFire", X0 + 0.03, 1.0, 1.5, -math.pi / 2, 0.7)

# ---------------------------------------------------------------- booths (west wall + front wall)
for k, bz in enumerate((-8.0, -10.3), start=1):
    add(L.furn(coll, f"BoothTable_W{k}", X0 + 1.0, bz, 0.0, [(0, 0, 0.0, 0.14, 0.14, 0.7, M["mahogany"]), (0, 0, 0.0, 0.7, 0.5, 0.04, M["mahogany"]), (0, 0, 0.7, 1.3, 0.7, 0.05, M["mahogany"])]))
    seat("bench", X0 + 1.0, bz + 0.75, 0.0, BENCH)
    seat("bench", X0 + 1.0, bz - 0.75, math.pi, BENCH)
    cols.add(f"Booth_W{k}", X0 + 0.7, bz, 0.0, 1.4, 2.1, 1.1)
    add(L.box(coll, f"Wall_BoothLamp_W{k}", X0 + 0.08, bz, 1.5, 0.12, 0.3, 0.2, M["tiffany"]))
for k, bx in enumerate((-7.0, -3.6), start=1):
    add(L.furn(coll, f"BoothTable_F{k}", bx, Z1 - 0.9, 0.0, [(0, 0, 0.0, 0.14, 0.14, 0.7, M["mahogany"]), (0, 0, 0.0, 0.5, 0.7, 0.04, M["mahogany"]), (0, 0, 0.7, 0.7, 1.3, 0.05, M["mahogany"])]))
    seat("bench", bx - 0.75, Z1 - 0.9, -math.pi / 2, BENCH)
    seat("bench", bx + 0.75, Z1 - 0.9, math.pi / 2, BENCH)
    cols.add(f"Booth_F{k}", bx, Z1 - 0.7, 0.0, 2.1, 1.4, 1.1)
    pint(f"BoothTable_F{k}_Pint", bx, Z1 - 0.7, 0.75)

# ---------------------------------------------------------------- tables, chairs, pillars, lamps
for n, (tx, tz) in enumerate(TABLES, start=1):
    round_table(f"Table_{n:02d}", tx, tz)
    seat("chair", tx, tz + 0.72, 0.0, chair_parts(M["leather"]))
    seat("chair", tx, tz - 0.72, math.pi, chair_parts(M["leather"]))
    seat("chair", tx + 0.72, tz, math.pi / 2, chair_parts(M["leather"]))
    seat("chair", tx - 0.72, tz, -math.pi / 2, chair_parts(M["leather"]))
    tiffany(f"Light_Tiffany{n:02d}", tx, tz)
    if n % 3 == 1:
        pint(f"Table_{n:02d}_Pint", tx + 0.15, tz - 0.1, 0.76)
    elif n % 3 == 2:
        tankard(f"Table_{n:02d}_Tankard", tx - 0.12, tz + 0.1, 0.76)
for k, (px, pz) in enumerate(PILLARS, start=1):
    add(L.box(coll, f"Wall_Pillar{k}", px, pz, 0.0, 0.5, 0.5, H, M["stone"], tile=1.0))
    cols.add(f"Pillar{k}", px, pz, 0.0, 0.5, 0.5, H)
    add(L.box(coll, f"Wall_PillarBanner{k}", px, pz + 0.27, 0.9, 0.36, 0.02, 1.5, M["green"]))
    add(L.box(coll, f"Wall_PillarKnot{k}", px, pz + 0.3, 1.35, 0.3, 0.04, 0.3, M["green"], rot=math.pi))
    add(L.box(coll, f"Wall_PillarBanner{k}B", px, pz - 0.27, 0.9, 0.36, 0.02, 1.5, M["green"]))
    add(L.box(coll, f"Wall_PillarBanner{k}Stripe", px, pz - 0.28, 1.2, 0.26, 0.01, 0.9, M["brass"]))
barrel("Barrel_Entry01", -1.9, 3.9, 0.0, 0.32, 0.9, lying=False, seg=8)
cols.add("Barrel_Entry01", -1.9, 3.9, 0.0, 0.7, 0.7, 0.95)
tankard("Barrel_Entry01_Tankard", -1.9, 3.9, 0.9)
barrel("Barrel_Entry02", 1.9, 3.9, 0.0, 0.32, 0.9, lying=False, seg=8)
cols.add("Barrel_Entry02", 1.9, 3.9, 0.0, 0.7, 0.7, 0.95)
pint("Barrel_Entry02_Pint", 1.9, 3.9, 0.9)
add(L.box(coll, "Light_Entry", 0, 4.3, H - 0.35, 0.5, 0.5, 0.06, M["bulb"]))

# ---------------------------------------------------------------- wall decor
for k, (gx, gz, y, w, hh, rot) in enumerate(((-8.6, Z1 - 0.03, 1.6, 0.6, 0.5, 0.0), (-1.5, Z1 - 0.03, 1.5, 0.5, 0.6, 0.0), (1.5, Z1 - 0.03, 1.5, 0.5, 0.6, 0.0),
                                             (X0 + 0.03, -6.3, 1.6, 0.7, 0.5, -math.pi / 2), (X0 + 0.03, 4.5, 1.6, 0.5, 0.6, -math.pi / 2),
                                             (X1 - 0.03, 0.5, 1.5, 0.7, 0.5, math.pi / 2), (X1 - 0.03, 4.6, 1.6, 0.5, 0.6, math.pi / 2))):
    picture(f"Wall_Picture{k:02d}", gx, gz, y, w, hh, rot, M["picture"][k % 3])
picture("Wall_PictureEast", X1 - 0.03, -0.3, 1.5, 0.7, 0.5, math.pi / 2, M["picture"][2])
picture("Wall_PictureFront", 8.6, Z1 - 0.03, 1.6, 0.6, 0.5, 0.0, M["picture"][1])
add(L.box(coll, "Wall_Chalkboard", -6.3, TOILET_WALL_Z + 0.14, 1.3, 2.0, 0.04, 1.2, M["board"]))
add(L.box(coll, "Wall_ChalkboardFrame", -6.3, TOILET_WALL_Z + 0.125, 1.26, 2.1, 0.03, 1.28, M["beam"]))
for k in range(5):
    add(L.box(coll, f"Wall_ChalkLine{k}", -6.7 + 0.2 * (k % 2), TOILET_WALL_Z + 0.165, 1.55 + k * 0.17, 0.9 + 0.3 * (k % 3), 0.01, 0.05, M["white"]))
add(L.box(coll, "Wall_Antlers", 0, Z1 - 0.05, 2.45, 0.4, 0.06, 0.5, M["beam"], bevel=0.02))
for k, (dx, tilt) in enumerate(((-0.3, 0.5), (0.3, -0.5))):
    o = add(L.cone(coll, f"Wall_Antler{k}", dx, Z1 - 0.12, 2.6, 0.04, 0.0, 0.5, M["white"], seg=5))
    o.rotation_euler = (0, tilt, 0)
    o2 = add(L.cone(coll, f"Wall_AntlerTine{k}", dx * 1.6, Z1 - 0.12, 2.75, 0.03, 0.0, 0.3, M["white"], seg=5))
    o2.rotation_euler = (0, tilt * 1.6, 0)

# ---------------------------------------------------------------- toilets (back west)
toilet_doors = ((-8.75, -7.85), (-4.75, -3.85))
objs += L.wall(coll, "Walls_Toilets", "x", TOILET_WALL_Z, 0.2, X0 - 0.1, TOILET_EAST_X + 0.1, H, M["plaster"],
               openings=[(a, b_, 0.0, 2.1) for a, b_ in toilet_doors], cols=cols, col_tag="Wall_Toilets")
objs += L.wall(coll, "Walls_ToiletMid", "z", TOILET_MID_X, 0.15, Z0 - 0.1, TOILET_WALL_Z - 0.1, H, M["plaster"], cols=cols, col_tag="Wall_ToiletMid")
objs += L.wall(coll, "Walls_ToiletEast", "z", TOILET_EAST_X, 0.2, Z0 - 0.1, TOILET_WALL_Z - 0.1, H, M["plaster"], cols=cols, col_tag="Wall_ToiletEast")
for (a, b_), label, tag in zip(toilet_doors, ("LADS", "LASSES"), ("L", "R")):
    add(L.box(coll, f"Door_Toilet_{tag}", a + 0.025, TOILET_WALL_Z - 0.55, 0.01, 0.05, 0.9, 2.1, M["green"], bevel=0.01))
    cols.add(f"Door_Toilet_{tag}", a + 0.025, TOILET_WALL_Z - 0.55, 0.0, 0.08, 0.9, 2.1)
    add(low_text(coll, f"Wall_ToiletSign_{tag}", label, (a + b_) / 2, TOILET_WALL_Z + 0.11, 2.22, 0.16, 0.0, M["brass"]))
    add(L.box(coll, f"Wall_ToiletSignPlate_{tag}", (a + b_) / 2, TOILET_WALL_Z + 0.105, 2.16, 0.9, 0.01, 0.3, M["green"]))
for room, (rx0, rx1) in enumerate(((X0, TOILET_MID_X - 0.075), (TOILET_MID_X + 0.075, TOILET_EAST_X - 0.1))):
    tag = "LR"[room]
    rw = rx1 - rx0
    add(L.box(coll, f"House_Floor_Toilet{tag}", (rx0 + rx1) / 2, (Z0 + TOILET_WALL_Z) / 2, 0.0, rw, TOILET_WALL_Z - Z0, 0.012, M["tile"], tile=1.0))
    add(L.box(coll, f"Light_Toilet{tag}", (rx0 + rx1) / 2, -13.2, H - 0.05, 1.2, 0.3, 0.05, M["lamp"]))
    for k in range(2):
        cx = rx0 + 0.55 + k * 1.0
        add(L.box(coll, f"Toilet{tag}_Part{k}", cx + 0.5, Z0 + 0.65, 0.0, 0.04, 1.3, 1.9, M["plaster"]))
        add(L.box(coll, f"Toilet{tag}_Door{k}", cx, Z0 + 1.3, 0.05, 0.84, 0.03, 1.8, M["green"], rot=0.35 if k else -0.35))
        joined(f"Toilet{tag}_Bowl{k}", [L.cyl(coll, "tb_bowl", cx, Z0 + 0.45, 0.0, 0.18, 0.4, M["white"], seg=8), L.box(coll, "tb_tank", cx, Z0 + 0.18, 0.4, 0.4, 0.18, 0.4, M["white"])])
        cols.add(f"Toilet{tag}_Cubicle{k}", cx, Z0 + 0.65, 0.0, 1.0, 1.3, 1.9)
    add(L.box(coll, f"Toilet{tag}_Part2", rx0 + 0.05, Z0 + 0.65, 0.0, 0.04, 1.3, 1.9, M["plaster"]))
    vx = rx1 - 0.3
    add(L.furn(coll, f"Toilet{tag}_Vanity", vx, -12.4, 0.0, [(0, 0, 0.0, 0.5, 1.4, 0.85, M["mahogany"]), (0, 0, 0.85, 0.55, 1.45, 0.04, M["marble"])]))
    cols.add(f"Toilet{tag}_Vanity", vx, -12.4, 0.0, 0.55, 1.45, 0.9)
    for k, dz in enumerate((-0.35, 0.35)):
        add(L.cyl(coll, f"Toilet{tag}_Basin{k}", vx, -12.4 + dz, 0.89, 0.17, 0.1, M["white"], seg=10))
        add(L.box(coll, f"Toilet{tag}_Tap{k}", vx + 0.17, -12.4 + dz, 0.89, 0.04, 0.04, 0.16, M["chrome"]))
    add(L.box(coll, f"Wall_ToiletMirror{tag}", rx1 - 0.03, -12.4, 1.2, 0.03, 1.2, 0.7, M["mirror"]))
    add(L.box(coll, f"Toilet{tag}_Dryer", rx0 + 0.15, -12.0, 1.2, 0.2, 0.3, 0.3, M["white"], bevel=0.02))

# ---------------------------------------------------------------- darts nook (back centre)
add(facing_disc("Dartboard_Back", BOARD[0], BOARD[2] - 0.02, BOARD[1], 0.33, 0.03, M["black"], seg=10))
dart_parts = [facing_disc("d_board", BOARD[0], BOARD[2] + 0.01, BOARD[1], 0.225, 0.02, M["dart"], seg=12),
              facing_disc("d_double", BOARD[0], BOARD[2] + 0.03, BOARD[1], 0.17, 0.012, M["dartred"], seg=12),
              facing_disc("d_inner", BOARD[0], BOARD[2] + 0.042, BOARD[1], 0.16, 0.006, M["dart"], seg=12),
              facing_disc("d_triple", BOARD[0], BOARD[2] + 0.048, BOARD[1], 0.107, 0.01, M["dartgreen"], seg=12),
              facing_disc("d_core", BOARD[0], BOARD[2] + 0.058, BOARD[1], 0.099, 0.006, M["dart"], seg=12),
              facing_disc("d_bull", BOARD[0], BOARD[2] + 0.064, BOARD[1], 0.016, 0.01, M["dartred"], seg=6)]
joined("Dartboard", dart_parts)
oche_z = BOARD[2] + OCHE_DIST
add(L.box(coll, "Rug_Oche", BOARD[0], oche_z, 0.0, 1.2, 0.06, 0.012, M["white"]))
add(L.box(coll, "Light_Darts", BOARD[0], BOARD[2] + 0.25, 2.5, 0.6, 0.2, 0.06, M["bulb"]))
add(L.box(coll, "Wall_DartScore", 1.4, Z0 + 0.04, 1.3, 1.0, 0.04, 0.9, M["board"]))
for k in range(4):
    add(L.box(coll, f"Wall_DartChalk{k}", 1.15 + 0.17 * k, Z0 + 0.07, 1.6, 0.06, 0.01, 0.35, M["white"]))
knot_panel("Wall_KnotDarts", -1.7, Z0 + 0.03, 1.4, math.pi, 0.6)

# ---------------------------------------------------------------- cellar door (back east): storeroom look, the stair enclosure behind it
objs += L.wall(coll, "Walls_Secret", "x", SECRET_WALL_Z, 0.2, SECRET_ROOM["minX"] - 0.1, X1 + 0.1, H, M["plaster"],
               openings=[(SECRET_DOOR_X[0], SECRET_DOOR_X[1], 0.0, 2.1)], cols=cols, col_tag="Wall_Secret")
objs += L.wall(coll, "Walls_SecretWest", "z", SECRET_ROOM["minX"] - 0.1, 0.2, Z0 - 0.1, SECRET_WALL_Z - 0.1, H, M["plaster"], cols=cols, col_tag="Wall_SecretWest")
door_cx = (SECRET_DOOR_X[0] + SECRET_DOOR_X[1]) / 2
secret_door = L.hinged_door(coll, [(door_cx, 0.01, 0.88, 0.06, 2.08, M["beam"], 0.02), (door_cx + 0.33, 0.98, 0.04, 0.12, 0.04, M["pewter"], 0.0),
                                   (door_cx, 1.5, 0.6, 0.02, 0.06, M["pewter"], 0.0), (door_cx, 0.5, 0.6, 0.02, 0.06, M["pewter"], 0.0)], SECRET_DOOR_X[0], SECRET_WALL_Z, 0.0)
secret_door.name = "Door_Secret"
secret_door.data.name = "Door_Secret"
add(secret_door)
cols.add("Door_Secret", door_cx, SECRET_WALL_Z, 0.0, SECRET_DOOR_X[1] - SECRET_DOOR_X[0], 0.2, 2.1)
add(L.box(coll, "Wall_SecretSignPlate", door_cx, SECRET_WALL_Z + 0.105, 2.15, 0.8, 0.012, 0.24, M["oak"]))
add(low_text(coll, "Wall_SecretSign", "CELLAR", door_cx, SECRET_WALL_Z + 0.113, 2.2, 0.13, 0.0, M["ember"]))
person("NPC_Bouncer", BOUNCER[0], BOUNCER[2], math.pi, M["suit"],
       [(0, 0, 0.82, 0.56, 0.3, 0.62, M["suit"], 0.04), (0, -0.15, 0.95, 0.16, 0.02, 0.45, M["shirt"])],
       [(-0.36, -0.05, 0.84, 0.14, 0.16, 0.58, M["suit"]), (0.36, -0.05, 0.84, 0.14, 0.16, 0.58, M["suit"])],
       [(0, -0.12, 1.59, 0.26, 0.02, 0.06, M["black"]), (0.15, -0.02, 1.58, 0.03, 0.03, 0.04, M["black"])])
# kept >= 1.1 m from the bouncer's collider on both sides so the doorway stays walkable
for k, kx in enumerate(KEGS_X, start=1):
    barrel(f"Cellar_Keg{k:02d}", kx, SECRET_WALL_Z + 0.42, 0.0, 0.27, 0.62, lying=False, seg=8)
cols.add("Cellar_Kegs", sum(KEGS_X) / 2, SECRET_WALL_Z + 0.42, 0.0, KEGS_X[1] - KEGS_X[0] + 0.6, 0.6, 0.65)
add(L.box(coll, "Cellar_Crate01", CRATES[0], CRATES[1], 0.0, 0.5, 0.46, 0.44, M["oak"]))
add(L.box(coll, "Cellar_Crate02", CRATES[0] - 0.02, CRATES[1], 0.44, 0.4, 0.4, 0.36, M["beam"]))
cols.add("Cellar_Crates", CRATES[0], CRATES[1], 0.0, 0.52, 0.48, 0.8)

# stair enclosure (the old SECRET_ROOM): top landing x 2.1..STAIR_X0 behind the door, stair corridor along the back wall
stair_run = (STAIR_X1 - STAIR_X0) / STAIR_STEPS
stair_rise = -BY / STAIR_STEPS
stair_zc = (Z0 + PART_Z - 0.16) / 2
stair_w = (PART_Z - 0.16) - Z0
for i in range(STAIR_STEPS):
    xs = STAIR_X0 + i * stair_run
    top = -i * stair_rise
    add(L.box(coll, f"Stair_Step{i:02d}", xs + stair_run / 2, stair_zc, BY, stair_run + 0.005, stair_w, top - BY, M["beam"]))
stair_len = math.hypot(STAIR_X1 - STAIR_X0, -BY)
stair_angle = math.atan2(-BY, STAIR_X1 - STAIR_X0)
for nm, rz in (("Stair_Handrail", PART_Z - 0.22), ("Stair_HandrailBack", Z0 + 0.06)):
    o = add(L.box(coll, nm, 0, 0, 0, stair_len, 0.05, 0.05, M["brass"] if nm == "Stair_Handrail" else M["beam"]))
    o.rotation_euler = (0, stair_angle, 0)
    o.location = L.b((STAIR_X0 + STAIR_X1) / 2, rz, BY / 2 + 0.9)
# partition between the stair and the landing / cellar: full height over the flight, ground floor only over the cellar landing
add(L.box(coll, "Walls_StairPart", (STAIR_X0 + STAIR_X1) / 2, PART_Z - 0.08, 0.0, STAIR_X1 - STAIR_X0, 0.16, H, M["plaster"], tile=2.0))
add(L.box(coll, "Walls_StairPartCellar", (STAIR_X0 + STAIR_X1) / 2, PART_Z - 0.08, BY, STAIR_X1 - STAIR_X0, 0.16, -BY, M["brick"], tile=2.0))
cols.add("Stair_Side", (STAIR_X0 + STAIR_X1) / 2, PART_Z - 0.08, BY, STAIR_X1 - STAIR_X0, 0.16, H - BY)
add(L.box(coll, "Walls_StairPartE", (STAIR_X1 + X1) / 2, PART_Z - 0.08, 0.0, X1 - STAIR_X1, 0.16, H, M["plaster"], tile=2.0))
cols.add("Stair_SideE", (STAIR_X1 + X1) / 2, PART_Z - 0.08, 0.0, X1 - STAIR_X1, 0.16, H)
add(L.box(coll, "Walls_StairPartLintel", (STAIR_X1 + X1) / 2, PART_Z - 0.08, BY + BH, X1 - STAIR_X1, 0.16, -BY - BH, M["brick"]))
cols.add("Stair_Under", STAIR_X0 - 0.05, stair_zc, BY, 0.1, stair_w, BH - 0.2)
add(L.box(coll, "Light_StairTop", (2.1 + STAIR_X0) / 2, -14.2, H - 0.06, 0.4, 0.4, 0.05, M["bulb"]))
add(L.box(coll, "Light_StairFoot", X1 - 0.7, -14.3, BY + BH - 0.06, 0.4, 0.4, 0.05, M["bulb"]))
# storeroom bits on the landing
add(L.furn(coll, "Cellar_Shelf", 7.2, SECRET_WALL_Z - 0.35, 0.0, [(0, 0, 0.0, 2.4, 0.45, 0.04, M["beam"]), (-1.15, 0, 0.0, 0.06, 0.45, 1.9, M["beam"]), (1.15, 0, 0.0, 0.06, 0.45, 1.9, M["beam"]),
                                                                   (0, 0, 0.9, 2.4, 0.45, 0.04, M["beam"]), (0, 0, 1.8, 2.4, 0.45, 0.04, M["beam"]),
                                                                   (-0.6, 0, 0.04, 0.6, 0.4, 0.4, M["oak"]), (0.5, 0, 0.94, 0.8, 0.4, 0.3, M["oak"])]))
cols.add("Cellar_Shelf", 7.2, SECRET_WALL_Z - 0.35, 0.0, 2.4, 0.5, 1.95)
add(L.box(coll, "Cellar_Crate03", 9.4, -11.6, 0.0, 0.6, 0.6, 0.5, M["oak"]))
cols.add("Cellar_Crate03", 9.4, -11.6, 0.0, 0.6, 0.6, 0.5)

# ---------------------------------------------------------------- the cellar: the hidden velvet lounge (floor y = BY, ceiling BY + BH)
bobjs = []


def badd(o):
    bobjs.append(o)
    return add(o)


def bfurn(name, gx, gz, rot, parts):
    o = L.furn(coll, name, gx, gz, rot, parts)
    o.location.z += BY
    return badd(o)


def bjoined(name, parts):
    o = joined(name, parts)
    bobjs.append(o)
    return o


bx0, bx1, bz0, bz1 = BASEMENT["minX"], BASEMENT["maxX"], BASEMENT["minZ"], BASEMENT["maxZ"]
M["velvet"] = L.make_mat("IN_pub_Velvet", "#8b1a2b", 0.95, "noise", 0.04)
M["redlight"] = L.make_mat("IN_pub_RedLight", "#ff3b3b", 0.5, "noise", 0.0, emit="#ff2a2a", emit_strength=1.4)
M["neon"] = L.make_mat("IN_pub_NeonPink", "#ff4fa3", 0.4, "noise", 0.0, emit="#ff4fa3", emit_strength=1.6)
M["carpet"] = L.make_mat("IN_pub_Carpet", "#5c1522", 1.0, "noise", 0.04)
SOFA = [(0, 0, 0.0, 0.76, 0.66, 0.2, M["mahogany"]), (0, 0, 0.2, 0.8, 0.7, 0.22, M["velvet"]), (0, 0.3, 0.42, 0.8, 0.12, 0.5, M["velvet"])]

# shell: carpet, brick walls, dark beamed ceiling, brick pillars
badd(L.box(coll, "House_Floor_Cellar", (bx0 + STAIR_X0) / 2, (bz0 + bz1) / 2, BY - 0.1, STAIR_X0 - bx0, bz1 - bz0, 0.1, M["carpet"], tile=2.0))
badd(L.box(coll, "House_Floor_CellarE", (STAIR_X0 + bx1) / 2, (PART_Z + bz1) / 2, BY - 0.1, bx1 - STAIR_X0, bz1 - PART_Z, 0.1, M["carpet"], tile=2.0))
badd(L.box(coll, "House_Floor_CellarFoot", (STAIR_X1 + bx1) / 2, (bz0 + PART_Z) / 2, BY - 0.1, bx1 - STAIR_X1, PART_Z - bz0, 0.1, M["flag"], tile=1.5))
for nm, cx, cz, sx, sz in (("Ceiling_Cellar", (bx0 + STAIR_X0) / 2, (bz0 + bz1) / 2, STAIR_X0 - bx0, bz1 - bz0),
                           ("Ceiling_CellarE", (STAIR_X0 + bx1) / 2, (PART_Z + bz1) / 2, bx1 - STAIR_X0, bz1 - PART_Z),
                           ("Ceiling_CellarFoot", (STAIR_X1 + bx1) / 2, (bz0 + PART_Z) / 2, bx1 - STAIR_X1, PART_Z - bz0)):
    badd(L.box(coll, nm, cx, cz, BY + BH, sx, sz, 0.1, M["beam"], tile=2.0))
for nm, axis, fixed, a0, a1 in (("Walls_CellarW", "z", bx0 - 0.1, bz0 - 0.2, bz1 + 0.2), ("Walls_CellarE", "z", bx1 + 0.1, bz0 - 0.2, bz1 + 0.2),
                                ("Walls_CellarS", "x", bz0 - 0.1, bx0, bx1), ("Walls_CellarN", "x", bz1 + 0.1, bx0, bx1)):
    mid = (a0 + a1) / 2
    if axis == "x":
        badd(L.box(coll, nm, mid, fixed, BY, a1 - a0, 0.2, -BY, M["brick"], tile=2.0))
        cols.add(nm.replace("Walls_", "Wall_"), mid, fixed, BY, a1 - a0, 0.2, -BY)
    else:
        badd(L.box(coll, nm, fixed, mid, BY, 0.2, a1 - a0, -BY, M["brick"], tile=2.0))
        cols.add(nm.replace("Walls_", "Wall_"), fixed, mid, BY, 0.2, a1 - a0, -BY)
for k, (px, pz) in enumerate(((0.6, -9.5), (5.6, -8.0)), start=1):
    badd(L.box(coll, f"Walls_CellarPillar{k}", px, pz, BY, 0.45, 0.45, BH, M["brick"], tile=1.0))
    cols.add(f"CellarPillar{k}", px, pz, BY, 0.45, 0.45, BH)

# velvet curtains along the walls (the stage wall is fully draped)
CURTAIN_H = BH - 0.1
for k in range(5):
    badd(L.box(coll, f"Curtain_LoungeS{k}", -9.2 + k * 1.6, bz0 + 0.12, BY + 0.02, 1.5, 0.12, CURTAIN_H, M["velvet"]))
for k, cz in enumerate((-12.2, -9.2, -6.2)):
    badd(L.box(coll, f"Curtain_LoungeW{k}", bx0 + 0.12, cz, BY + 0.02, 0.12, 1.8, CURTAIN_H, M["velvet"]))
for k, cx in enumerate((-8.0, -4.0, 0.0, 3.4, 7.0)):
    badd(L.box(coll, f"Curtain_LoungeN{k}", cx, bz1 - 0.12, BY + 0.02, 1.8, 0.12, CURTAIN_H, M["velvet"]))
badd(L.box(coll, "Curtain_LoungeE", bx1 - 0.12, -5.2, BY + 0.02, 0.12, 1.6, CURTAIN_H, M["velvet"]))
badd(L.box(coll, "Curtain_LoungeSE", 1.6, bz0 + 0.12, BY + 0.02, 1.6, 0.12, CURTAIN_H, M["velvet"]))

# the stage against the draped south wall: neon-pink trim, chrome pole, neon heart above it
STAGE_X, STAGE_Z = -6.0, -13.4
badd(L.box(coll, "Lounge_Stage", STAGE_X, STAGE_Z, BY, 2.4, 2.4, 0.3, M["black"], bevel=0.02))
cols.add("Lounge_Stage", STAGE_X, STAGE_Z, BY, 2.4, 2.4, 0.3)
badd(L.box(coll, "Lounge_StageTrim", STAGE_X, STAGE_Z, BY + 0.29, 2.44, 2.44, 0.02, M["neon"]))
badd(L.cyl(coll, "Lounge_Pole", STAGE_X, STAGE_Z, BY + 0.3, 0.035, BH - 0.3, M["chrome"], seg=8))
cols.add("Lounge_Pole", STAGE_X, STAGE_Z, BY, 0.2, 0.2, BH)
heart_x, heart_y = STAGE_X, BY + 1.9
neon = [facing_disc("n_lobeL", heart_x - 0.17, bz0 + 0.26, heart_y + 0.12, 0.17, 0.04, M["neon"], seg=12), facing_disc("n_lobeR", heart_x + 0.17, bz0 + 0.26, heart_y + 0.12, 0.17, 0.04, M["neon"], seg=12),
        L.box(coll, "n_tip", heart_x - 0.127, bz0 + 0.28, heart_y - 0.177, 0.36, 0.04, 0.36, M["neon"])]
neon[2].rotation_euler = (0, math.pi / 4, 0)
bjoined("Light_NeonHeart", neon)

# the four velvet sofas (sofa_01..04) as two loveseats in a loose horseshoe facing the stage, mirror table + champagne between
for k, (px, pz) in enumerate(((-8.0, -10.6), (-4.0, -10.6)), start=1):
    yaw = L.yaw_towards(px, pz, STAGE_X, STAGE_Z)
    c, s = math.cos(yaw), math.sin(yaw)
    for lx in (-0.4, 0.4):
        bobjs.append(seat("sofa", px + lx * c, pz - lx * s, yaw, SOFA, y0=BY))
    cols.add(f"Lounge_Loveseat{k}", px, pz, BY, 1.65, 0.75, 0.9, rot=yaw)
tb_x, tb_z = STAGE_X, -10.5
bfurn("Lounge_Table", tb_x, tb_z, 0.0, [(0, 0, 0.0, 0.5, 0.5, 0.42, M["black"], 0.01), (0, 0, 0.42, 0.7, 0.7, 0.04, M["mirror"], 0.01)])
cols.add("Lounge_Table", tb_x, tb_z, BY, 0.7, 0.7, 0.46)
bjoined("Lounge_Bucket", [L.cyl(coll, "lb_bucket", tb_x, tb_z, BY + 0.46, 0.14, 0.22, M["chrome"], seg=10),
                          L.cyl(coll, "lb_bottle", tb_x + 0.06, tb_z - 0.04, BY + 0.6, 0.04, 0.26, M["bottlegreen"], seg=6),
                          L.box(coll, "lb_foil", tb_x + 0.06, tb_z - 0.04, BY + 0.86, 0.06, 0.06, 0.05, M["brass"])])
for k, (tx, tz) in enumerate(((-9.3, -9.4), (-2.7, -9.4)), start=1):
    bfurn(f"Lounge_LowTable{k}", tx, tz, 0.0, [(0, 0, 0.0, 0.3, 0.3, 0.4, M["black"]), (0, 0, 0.4, 0.6, 0.6, 0.04, M["mirror"])])
    cols.add(f"Lounge_LowTable{k}", tx, tz, BY, 0.6, 0.6, 0.44)

# small velvet bar corner on the east wall
cb_x, cb_z0, cb_z1 = 9.35, -10.6, -7.0
bfurn("Lounge_Bar", cb_x - 0.6, (cb_z0 + cb_z1) / 2, 0.0, [(0, 0, 0.0, 0.6, cb_z1 - cb_z0, 1.0, M["mahogany"]), (0, 0, 1.0, 0.76, cb_z1 - cb_z0 + 0.1, 0.05, M["mahogany"]),
                                                           (-0.31, 0, 0.0, 0.02, cb_z1 - cb_z0, 1.0, M["velvet"]), (-0.37, 0, 0.84, 0.04, cb_z1 - cb_z0, 0.04, M["brass"])])
cols.add("Lounge_Bar", cb_x - 0.6, (cb_z0 + cb_z1) / 2, BY, 0.8, cb_z1 - cb_z0 + 0.1, 1.05)
badd(L.box(coll, "Wall_LoungeBackBar", bx1 - 0.06, (cb_z0 + cb_z1) / 2, BY + 0.9, 0.08, cb_z1 - cb_z0, 1.5, M["mahogany"]))
badd(L.box(coll, "Wall_LoungeBackBarShelf", bx1 - 0.2, (cb_z0 + cb_z1) / 2, BY + 1.5, 0.22, cb_z1 - cb_z0 - 0.2, 0.04, M["brass"]))
for k in range(3):
    bz = cb_z0 + 0.8 + k * 1.0
    m = bottle_mats[k % 4]
    bjoined(f"Lounge_Bottle{k}", [L.cyl(coll, "cb_body", bx1 - 0.2, bz, BY + 1.54, 0.035, 0.22, m, seg=5), L.cyl(coll, "cb_neck", bx1 - 0.2, bz, BY + 1.76, 0.014, 0.07, m, seg=5)])

# red ceiling light panels everywhere so the whole room glows red (Light_* nodes for the bake)
for k, (lx, lz) in enumerate(((-7.6, -13.4), (-4.4, -13.4), (-8.0, -10.0), (-4.0, -10.0), (-8.0, -6.0), (-4.0, -6.0),
                               (-0.6, -12.2), (-0.6, -6.6), (2.8, -11.0), (3.4, -6.0), (7.2, -10.6), (7.6, -5.6))):
    badd(L.box(coll, f"Light_Lounge{k:02d}", lx, lz, BY + BH - 0.06, 0.8, 0.8, 0.05, M["redlight"]))

# ---------------------------------------------------------------- export
bnames = {o.name for o in bobjs}
bad = L.check_grounded([o for o in objs if o.name not in bnames],
                       allow=L.ALLOW_INTERIOR + ("Ceiling_", "Bunting_", "Tap_", "Bell", "Bottle_", "BackBar_", "Bar_Pint", "Bar_Tankard", "Bar_Till",
                                                 "ShotPlank", "Shot_", "Ledge_", "Hearth_", "Dartboard", "Curtain_", "Stair_", "Cellar_Crate02",
                                                 "Toilet", "Table_", "BoothTable_", "Barrel_Entry01_", "Barrel_Entry02_", "LowTable_Tankard", "Rug_"))
B_ALLOW = L.ALLOW_INTERIOR + ("Ceiling_", "Curtain_", "Lounge_StageTrim", "Lounge_Pole", "Lounge_Bucket", "Lounge_Bottle")
for o in bobjs:
    if o.type != "MESH" or o.name.startswith(B_ALLOW):
        continue
    low = min((o.matrix_world @ Vector(c)).z for c in o.bound_box) - BY
    if low < -0.001 or low > 0.03:
        bad.append((o.name, round(low, 3)))
print("INTERIOR grounded violations:", bad)
assert not bad, bad
assert len(seats) >= 30, len(seats)
L.export_glb(os.path.join(OUT, "interior.glb"), objs)
L.export_glb(os.path.join(OUT, "interior.colsrc.glb"), objs + cols.items)
L.write_json(os.path.join(OUT, "interior.layout.json"), {
    "version": 1, "key": KEY, "job": JOB, "name": NAME, "spawn": [0.0, 1.6, 3.7],
    "exit": {"position": [0.0, 4.75], "radius": 1.4},
    "stations": stations,
    "npcs": {"bartender": list(BARTENDER), "bouncer": list(BOUNCER)},
    "bartenderYaw": round(BARTENDER_YAW, 4),
    "counter": list(COUNTER),
    "taps": [BAR_X + 0.3, BAR_TOP, TAP_Z[1]],
    "serve": [BAR_X - 0.3, BAR_TOP, TAP_Z[1]],
    "bell": list(BELL),
    "secretDoor": {"position": [door_cx, 0.0, SECRET_WALL_Z], "yaw": round(math.pi, 4)},
    "secretRoom": SECRET_ROOM,
    "basement": {**BASEMENT, "floorY": BY},
    "levels": [
        {"id": "L0", "y": 0.0, "height": H, "rects": [{"minX": X0, "maxX": X1, "minZ": PART_Z, "maxZ": Z1}, {"minX": X0, "maxX": STAIR_X0, "minZ": Z0, "maxZ": PART_Z}]},
        {"id": "B1", "y": BY, "height": BH, "rects": [{"minX": BASEMENT["minX"], "maxX": BASEMENT["maxX"], "minZ": PART_Z, "maxZ": BASEMENT["maxZ"]},
                                                      {"minX": BASEMENT["minX"], "maxX": STAIR_X0, "minZ": BASEMENT["minZ"], "maxZ": PART_Z},
                                                      {"minX": STAIR_X1, "maxX": BASEMENT["maxX"], "minZ": BASEMENT["minZ"], "maxZ": PART_Z}]},
    ],
    "stairs": [{"name": "Stair_Cellar", "minX": STAIR_X0, "maxX": STAIR_X1, "minZ": Z0, "maxZ": round(PART_Z - 0.16, 3), "y0": BY, "y1": 0.0, "rise": "-x"}],
    "seats": seats,
    "darts": {"board": list(BOARD), "boardYaw": round(math.pi, 4), "oche": [BOARD[0], 0.0, round(oche_z, 3)]},
    "shots": {"plank": list(PLANK), "yaw": round(math.pi, 4), "player": shots_player},
})


def triangles(items):
    return sum(len(p.vertices) - 2 for o in items if o.type == "MESH" for p in o.data.polygons)


heavy = sorted(((triangles([o]), o.name) for o in objs if o.type == "MESH"), reverse=True)[:8]
groups = {}
for o in objs:
    groups[o.name.split("_")[0]] = groups.get(o.name.split("_")[0], 0) + triangles([o])
print("interior:", len(objs), "objects,", len(cols.items), "collision boxes,", len(seats), "seats,", triangles(objs), "triangles; heaviest:", heavy)
print("by prefix:", sorted(groups.items(), key=lambda kv: -kv[1])[:16])

exec(open(os.path.join(HERE, "build_pub_ext.py"), encoding="utf-8").read())
