import importlib
import json
import math
import os
import sys

if "__file__" not in globals():
    raise RuntimeError('Run with exec(open(p).read(), {"__file__": p}) so the script can find lib_common.py')
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lib_common as L
importlib.reload(L)
import lib_site as LS
importlib.reload(LS)
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

KEY = "sports_gym"
NAME = "Cove Gymnasium"
OUT = os.path.join(L.OUT_ROOT, "work", KEY)
RULES = os.path.join(L.FRONT_ASSETS, "sports", "rules")
FOOTBALL = json.load(open(os.path.join(RULES, "football.json"), encoding="utf-8"))
BASKETBALL = json.load(open(os.path.join(RULES, "basketball.json"), encoding="utf-8"))
GYM_VENUE = next(v for v in FOOTBALL["venues"] if v["id"] == "gym_court")
HOOP = BASKETBALL["court"]

X0, X1, Z0, Z1, T, H = -16.6, 16.6, -51.0, 5.0, 0.2, 9.0
LOBBY_H = 3.4
PARTITION_Z = -2.7
HALL_Z1 = PARTITION_Z - T / 2
ARENA = (-11.2, X1, -2.9, Z0 + 0.1)
BARRIER_X, BARRIER_H = -11.3, 1.1
AISLE = (-12.8, -11.4)
ROWS, ROW_D, ROW_H = 4, 0.95, 0.45
STAIR_Z = (-14.0, -40.0)
STAIR_W = 1.2
COURT_W, COURT_L = GYM_VENUE["sizeM"][1], GYM_VENUE["sizeM"][0]
COURT_CX = (ARENA[0] + ARENA[1]) / 2
COURT_CZ = (ARENA[2] + ARENA[3]) / 2
COURT = (COURT_CX - COURT_W / 2, COURT_CX + COURT_W / 2, COURT_CZ - COURT_L / 2, COURT_CZ + COURT_L / 2)
GOAL_W, GOAL_H = GYM_VENUE["goalSizeM"]
GOAL_DEPTH = 1.0
LINE_W, LINE_Y = 0.06, 0.012
FRONT_WINDOWS = ((-14.0, -10.5), (-8.0, -4.5))
WIN_Y = (0.9, 2.4)
HIGH_WIN_Y = (5.6, 7.6)
HIGH_WINDOWS = tuple((z - 1.5, z + 1.5) for z in range(-48, -4, 6))
COACH = (round(sum(AISLE) / 2, 3), round(COURT_CZ, 3))

sc = L.new_build_scene("WORK_" + KEY + "_interior")
coll = bpy.data.collections.new("Interior")
sc.collection.children.link(coll)
cols = L.Collisions(coll)
M = L.std_mats(wall="#e9e6de", floor=("#c9c6bf", "tiles", "#b9b6ae"))
M["court"] = L.make_mat("IN_GymMaple", "#d9a86a", 0.55, "planks", 0.05, accent="#c99659")
M["paint"] = L.make_mat("IN_GymCourtPaint", "#3f7fb5", 0.6, "noise", 0.02)
M["key"] = L.make_mat("IN_GymKeyPaint", "#c8553d", 0.6, "noise", 0.02)
M["white"] = L.make_mat("IN_GymLineWhite", "#f6f4ee", 0.6, "noise", 0.0)
M["yellow"] = L.make_mat("IN_GymLineYellow", "#f2c230", 0.6, "noise", 0.0)
M["barrier"] = L.make_mat("IN_GymBarrier", "#24405e", 0.7, "noise", 0.02)
M["seat"] = L.make_mat("IN_GymSeat", "#2a9d8f", 0.7, "stripes", 0.03, accent="#248a7e")
M["step"] = L.make_mat("IN_GymStand", "#8d9196", 0.85, "noise", 0.03)
M["hoop"] = L.make_mat("IN_GymHoopPost", "#2f3a45", 0.5, "noise", 0.02)
M["dark"] = L.make_mat("IN_GymScoreboard", "#1c2229", 0.6, "noise", 0.01)
M["sign"] = L.make_mat("IN_GymSignText", "#ffffff", 0.4, "noise", 0.0, emit="#ffffff", emit_strength=0.8)
M["teal"] = L.make_mat("IN_SportsTeal", "#2a9d8f", 0.7, "noise", 0.03)

objs = []
lobby_z = (HALL_Z1 + T, Z1)
objs.append(L.box(coll, "House_Floor_Main", 0, (lobby_z[0] + Z1) / 2, -0.1, X1 - X0, Z1 - lobby_z[0] + T, 0.1, M["floor"], tile=2.0))
objs.append(L.box(coll, "House_Floor_Court", 0, (Z0 + HALL_Z1) / 2, -0.1, X1 - X0, HALL_Z1 - Z0, 0.1, M["court"], tile=1.0))
objs.append(L.box(coll, "Ceiling", 0, (Z0 + HALL_Z1) / 2, H, X1 - X0 + 0.4, HALL_Z1 - Z0 + 0.2, 0.1, M["ceil"], tile=2.0))
objs.append(L.box(coll, "Ceiling_Lobby", 0, (PARTITION_Z + Z1 + 0.2) / 2, LOBBY_H, X1 - X0 + 0.4, Z1 + 0.2 - PARTITION_Z, 0.1, M["ceil"], tile=2.0))

objs += L.wall(coll, "Walls_Front", "x", Z1 + 0.1, T, X0 - T, X1 + T, LOBBY_H + 0.1, M["wall"],
               openings=[(a, b, *WIN_Y) for a, b in FRONT_WINDOWS] + [L.DOOR_OPENING], cols=cols, glass=M["glass"], col_tag="Wall_Front")
objs += L.wall(coll, "Walls_Back", "x", Z0 - 0.1, T, X0 - T, X1 + T, H, M["wall"], cols=cols, col_tag="Wall_Back")
objs += L.wall(coll, "Walls_W", "z", X0 - 0.1, T, Z0, Z1 + 0.2, H, M["wall"], openings=[(a, b, *HIGH_WIN_Y) for a, b in HIGH_WINDOWS],
               cols=cols, glass=M["glass"], col_tag="Wall_W")
objs += L.wall(coll, "Walls_E", "z", X1 + 0.1, T, Z0, Z1 + 0.2, H, M["wall"], openings=[(a, b, *HIGH_WIN_Y) for a, b in HIGH_WINDOWS],
               cols=cols, glass=M["glass"], col_tag="Wall_E")
objs += L.wall(coll, "Walls_Lobby", "x", PARTITION_Z, T, X0, X1, H, M["wall"],
               openings=[(AISLE[0], AISLE[1], 0.0, 2.4), (COURT_CX - 1.5, COURT_CX + 1.5, 0.0, 2.6)], cols=cols, col_tag="Wall_Lobby")
CHANGING_X, STORE_X = 6.0, 12.4
objs += L.wall(coll, "Walls_Changing", "z", CHANGING_X, T, PARTITION_Z + T / 2, Z1, LOBBY_H, M["wall"], openings=[(1.0, 2.2, 0.0, 2.2)],
               cols=cols, col_tag="Wall_Changing")
objs += L.wall(coll, "Walls_Store", "z", STORE_X, T, PARTITION_Z + T / 2, Z1, LOBBY_H, M["wall"], openings=[(-1.6, -0.4, 0.0, 2.2)],
               cols=cols, col_tag="Wall_Store")
objs.append(L.box(coll, "Door_Entrance", 0, Z1 + 0.1, 0.01, 1.18, 0.06, 2.18, M["glass"], bevel=0.02))
objs.append(L.box(coll, "Door_Entrance_Handle", 0.42, Z1 - 0.03, 0.98, 0.04, 0.12, 0.04, M["metal"]))
objs.append(L.box(coll, "Entry_Doormat", 0, Z1 - 0.5, 0.0, 1.4, 0.8, 0.012, M["mat"]))
objs.append(L.box(coll, "Wall_LobbyStripe", (X0 + CHANGING_X) / 2, PARTITION_Z + 0.13, 1.1, CHANGING_X - X0 - 0.2, 0.04, 0.3, M["teal"]))
for name, text, cx in (("Stands", "STANDS", sum(AISLE) / 2), ("Court", "COURT", COURT_CX)):
    objs.append(L.box(coll, f"Wall_Sign{name}Board", cx, PARTITION_Z + 0.13, 2.7, 2.2, 0.04, 0.5, M["dark"]))
    objs.append(L.text_mesh(coll, f"Wall_Sign{name}Text", text, cx, PARTITION_Z + 0.16, 2.8, 0.26, 0.01, M["sign"]))
changing_sign = L.text_mesh(coll, "Wall_SignChanging", "CHANGING", CHANGING_X - 0.12, 1.6, 2.5, 0.2, 0.01, M["teal"])
changing_sign.rotation_euler[2] = -math.pi / 2
objs.append(changing_sign)


def line(name, ax, az, bx, bz, mat, w=LINE_W):
    ln = math.hypot(bx - ax, bz - az)
    return L.box(coll, name, (ax + bx) / 2, (az + bz) / 2, LINE_Y, ln + w, w, 0.006, mat, rot=LS.seg_yaw(ax, az, bx, bz))


def arc(name, cx, cz, r, a0, a1, mat, seg):
    pts = [(cx + r * math.cos(a0 + (a1 - a0) * k / seg), cz + r * math.sin(a0 + (a1 - a0) * k / seg)) for k in range(seg + 1)]
    return [line(f"{name}_{k:02d}", *pts[k], *pts[k + 1], mat) for k in range(seg)]


def rect_lines(name, x0, x1, z0, z1, mat):
    return [line(f"{name}_N", x0, z0, x1, z0, mat), line(f"{name}_S", x0, z1, x1, z1, mat),
            line(f"{name}_W", x0, z0, x0, z1, mat), line(f"{name}_E", x1, z0, x1, z1, mat)]


cx0, cx1, cz0, cz1 = COURT
objs.append(L.box(coll, "Court_Paint", COURT_CX, COURT_CZ, 0.0, COURT_W, COURT_L, 0.006, M["paint"], tile=2.0))
white = rect_lines("LineW_Bound", cx0, cx1, cz0, cz1, M["white"])
white.append(line("LineW_Half", cx0, COURT_CZ, cx1, COURT_CZ, M["white"]))
white += arc("LineW_Centre", COURT_CX, COURT_CZ, 3.0, 0.0, 2 * math.pi, M["white"], 24)
ENDS = (("west", cz1, -1), ("east", cz0, 1))


def into_court(inward):
    return (math.pi, 2 * math.pi) if inward < 0 else (0.0, math.pi)


for end, zl, inward in ENDS:
    white += arc(f"LineW_Box{end}", COURT_CX, zl, 6.0, *into_court(inward), M["white"], 12)
objs.append(L.join(coll, "Court_LinesWhite", white))

RIM_FROM_LINE = HOOP["rimFromEndLineM"]
THREE = HOOP["threePointRadiusM"]
yellow = arc("LineY_Centre", COURT_CX, COURT_CZ, 1.8, 0.0, 2 * math.pi, M["yellow"], 16)
baskets = {}
for end, zl, inward in ENDS:
    rim_z = zl + inward * RIM_FROM_LINE
    yellow += arc(f"LineY_Three{end}", COURT_CX, rim_z, THREE, *into_court(inward), M["yellow"], 20)
    key_z = zl + inward * 5.8
    objs.append(L.box(coll, f"Court_Key_{end}", COURT_CX, (zl + key_z) / 2, 0.0, 4.9, 5.8, 0.008, M["key"]))
    yellow += rect_lines(f"LineY_Key{end}", COURT_CX - 2.45, COURT_CX + 2.45, min(zl, key_z), max(zl, key_z), M["yellow"])
    baskets[end] = rim_z
objs.append(L.join(coll, "Court_LinesYellow", yellow))

objs.append(L.box(coll, "Hall_Barrier", BARRIER_X, (HALL_Z1 + Z0) / 2, 0.0, 0.2, HALL_Z1 - Z0, BARRIER_H, M["barrier"], tile=2.0))
cols.add("Barrier", BARRIER_X, (HALL_Z1 + Z0) / 2, 0.0, 0.2, HALL_Z1 - Z0, BARRIER_H)
barrier_text = L.text_mesh(coll, "Hall_BarrierText", "COVE GYMNASIUM", BARRIER_X + 0.11, COURT_CZ, 0.4, 0.45, 0.01, M["sign"])
barrier_text.rotation_euler[2] = math.pi / 2
objs.append(barrier_text)

stand_x1 = AISLE[0]
for k in range(ROWS):
    rx1 = stand_x1 - k * ROW_D
    rx0 = rx1 - ROW_D if k < ROWS - 1 else X0
    top = ROW_H * (k + 1)
    for i, (za, zb) in enumerate(((HALL_Z1, STAIR_Z[0] + STAIR_W / 2), (STAIR_Z[0] - STAIR_W / 2, STAIR_Z[1] + STAIR_W / 2), (STAIR_Z[1] - STAIR_W / 2, Z0))):
        objs.append(L.box(coll, f"Stand_Row{k}_{i}", (rx0 + rx1) / 2, (za + zb) / 2, 0.0, rx1 - rx0, za - zb, top, M["step"], tile=2.0))
        cols.add(f"StandRow{k}_{i}", (rx0 + rx1) / 2, (za + zb) / 2, 0.0, rx1 - rx0, za - zb, top)
        objs.append(L.box(coll, f"Stand_Seat{k}_{i}", rx1 - 0.25, (za + zb) / 2, top, 0.4, za - zb - 0.1, 0.06, M["seat"], tile=2.0))
    for j, sz in enumerate(STAIR_Z):
        for s in range(3):
            sx1 = rx1 - s * ROW_D / 3
            sx0 = sx1 - ROW_D / 3 if (k < ROWS - 1 or s < 2) else X0
            h = ROW_H * k + 0.15 * (s + 1)
            objs.append(L.box(coll, f"Stand_Stair{j}_{k}{s}", (sx0 + sx1) / 2, sz, 0.0, sx1 - sx0, STAIR_W, h, M["step"]))
            cols.add(f"StandStair{j}_{k}{s}", (sx0 + sx1) / 2, sz, 0.0, sx1 - sx0, STAIR_W, h)


AI_GOAL = "a_futsal_goal_white_metal_frame_with_a_w"
AI_HOOP = "a_wall_mounted_basketball_hoop_with_a_gl"
AI_PALETTE = {"goal": 3, "hoop": 5}
RIM_Y = HOOP["rimHeightM"]
RIM_R = HOOP["rimRadiusM"]
BOARD_W, BOARD_H = HOOP["boardSizeM"]
BOARD_BOTTOM = HOOP["boardBottomM"]
SIDE_HOOP_Z = tuple(round(COURT_CZ + d, 3) for d in (-16.0, -8.0, 8.0, 16.0))
SIDE_ARM = 0.9
MAIN_ARM_Y = (BOARD_BOTTOM + 0.25, BOARD_BOTTOM + 0.85)
BOARD_T = 0.03


def ai_object(name, slug, palette):
    meshes = L.import_ai_model(coll, slug, f"IN_Gym_{name}", palette=palette)
    obj = L.join(coll, name, meshes)
    apply_transforms(obj)
    return obj


def apply_transforms(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.context.view_layer.update()


def world_extent(obj):
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    return (min(c.x for c in corners), max(c.x for c in corners), min(c.y for c in corners), max(c.y for c in corners),
            min(c.z for c in corners), max(c.z for c in corners))


def face_and_fit(obj, facing, scale):
    obj.rotation_euler = (0, 0, math.atan2(facing[0], facing[1]))
    obj.scale = scale
    apply_transforms(obj)


def goal(end, zl, out):
    obj = ai_object(f"Goal_{end}", AI_GOAL, AI_PALETTE["goal"])
    x0, x1, y0, y1, z0, z1 = world_extent(obj)
    face_and_fit(obj, (0.0, -out), (GOAL_W / (x1 - x0), GOAL_DEPTH / (y1 - y0), GOAL_H / (z1 - z0)))
    x0, x1, y0, y1, z0, z1 = world_extent(obj)
    target = Vector(L.b(COURT_CX, zl + out * GOAL_DEPTH / 2, 0.0))
    obj.location = (target.x - (x0 + x1) / 2, target.y - (y0 + y1) / 2, -z0)
    apply_transforms(obj)
    for side, gx in (("N", COURT_CX - GOAL_W / 2), ("S", COURT_CX + GOAL_W / 2)):
        cols.add(f"Goal_{end}_Post{side}", gx, zl, 0.0, 0.1, 0.1, GOAL_H)
        cols.add(f"Goal_{end}_Back{side}", gx, zl + out * GOAL_DEPTH, 0.0, 0.08, 0.08, GOAL_H * 0.7)
    return [obj]


def rim_centre(obj, facing, board_gx, board_gz):
    tree = BVHTree.FromObject(obj, bpy.context.evaluated_depsgraph_get())
    side = (-facing[1], facing[0])
    hits = []
    for i in range(-40, 41, 2):
        for k in range(10, 100, 2):
            lat, d = i * 0.01, k * 0.01
            gx = board_gx + facing[0] * d + side[0] * lat
            gz = board_gz + facing[1] * d + side[1] * lat
            hit, _, _, _ = tree.ray_cast(Vector(L.b(gx, gz, BOARD_BOTTOM + BOARD_H + 1.0)), Vector((0, 0, -1)))
            if hit is not None and hit.z < BOARD_BOTTOM + 0.3:
                hits.append((gx, gz, hit.z))
    if not hits:
        return None
    top = max(z for _, _, z in hits)
    ring = [(x, z) for x, z, h in hits if h >= top - 0.04]
    return sum(x for x, _ in ring) / len(ring), sum(z for _, z in ring) / len(ring), top


def hoop_model(name, facing, board_gx, board_gz, rim_gx, rim_gz):
    obj = ai_object(name, AI_HOOP, AI_PALETTE["hoop"])
    x0, x1, _, _, _, _ = world_extent(obj)
    s = BOARD_W / (x1 - x0)
    face_and_fit(obj, facing, (s, s, s))
    x0, x1, y0, y1, z0, z1 = world_extent(obj)
    board = Vector(L.b(board_gx, board_gz, 0.0))
    back_x = x0 if facing[0] > 0 else x1 if facing[0] < 0 else (x0 + x1) / 2
    back_y = y1 if facing[1] > 0 else y0 if facing[1] < 0 else (y0 + y1) / 2
    obj.location = (board.x - back_x if facing[0] else board.x - (x0 + x1) / 2,
                    board.y - back_y if facing[1] else board.y - (y0 + y1) / 2,
                    BOARD_BOTTOM + BOARD_H - z1)
    apply_transforms(obj)
    rim = rim_centre(obj, facing, board_gx, board_gz)
    if rim is None:
        raise RuntimeError(f"{name}: no rim found in front of the board")
    cx, cz, top_z = rim
    shift = Vector(L.b(rim_gx - cx, rim_gz - cz, 0.0))
    obj.location = (shift.x, shift.y, RIM_Y + 0.02 - top_z)
    apply_transforms(obj)
    cx, cz, top_z = rim_centre(obj, facing, rim_gx - facing[0] * 0.55, rim_gz - facing[1] * 0.55)
    shift = Vector(L.b(rim_gx - cx, rim_gz - cz, 0.0))
    obj.location = (shift.x, shift.y, RIM_Y + 0.02 - top_z)
    apply_transforms(obj)
    cx, cz, _ = rim_centre(obj, facing, rim_gx - facing[0] * 0.55, rim_gz - facing[1] * 0.55)
    x0, x1, y0, y1, _, board_top = world_extent(obj)
    back = (x1 if facing[0] < 0 else x0) if facing[0] else (-y1 if facing[1] > 0 else -y0)
    print(f"{name}: rim moved by ({rim_gx - cx:+.3f}, {rim_gz - cz:+.3f}) m, height {RIM_Y + 0.02 - top_z:+.3f} m, board top {board_top:.3f} m, back {back:.3f}")
    return obj, board_top, back


def hoop(end, zl, inward):
    rim_z = baskets[end]
    board_z = zl + inward * HOOP["boardFromEndLineM"]
    wall_z = HALL_Z1 if inward < 0 else Z0
    model, board_tops[end], board_planes[end] = hoop_model(f"Hoop_{end}", (0.0, float(inward)), COURT_CX, board_z, COURT_CX, rim_z)
    span = abs(board_planes[end] - wall_z)
    mid = (board_planes[end] + wall_z) / 2
    arm = [L.box(coll, f"Hoop_{end}_WallPlate", COURT_CX, wall_z - inward * 0.04, MAIN_ARM_Y[0] - 0.3, 1.0, 0.08, MAIN_ARM_Y[1] - MAIN_ARM_Y[0] + 0.6, M["hoop"])]
    for k, y in enumerate(MAIN_ARM_Y):
        for side, dx in (("N", -0.35), ("S", 0.35)):
            arm.append(L.box(coll, f"Hoop_{end}_Arm{k}{side}", COURT_CX + dx, mid, y, 0.08, span, 0.08, M["hoop"]))
    return [model, L.join(coll, f"Hoop_{end}_Frame", arm)]


def side_hoop(i, hz):
    board_x = X1 - SIDE_ARM
    rim_x = board_x - (RIM_FROM_LINE - HOOP["boardFromEndLineM"])
    name = f"Hoop_side{i}"
    model, board_top, back_x = hoop_model(name, (-1.0, 0.0), board_x, hz, rim_x, hz)
    arm = X1 - back_x
    frame = L.join(coll, f"{name}_Frame", [
        L.box(coll, f"{name}_Plate", X1 - 0.04, hz, BOARD_BOTTOM - 0.3, 0.08, 0.6, BOARD_H + 0.4, M["hoop"]),
        L.box(coll, f"{name}_Arm", (X1 + back_x) / 2, hz, BOARD_BOTTOM + 0.3, arm, 0.12, 0.12, M["hoop"]),
        L.box(coll, f"{name}_Brace", (X1 + back_x) / 2, hz, BOARD_BOTTOM - 0.25, arm, 0.08, 0.08, M["hoop"])])
    return [frame, model], rim_x, board_top, back_x


objs += goal("west", cz1, 1) + goal("east", cz0, -1)
board_tops = {}
board_planes = {}
objs += hoop("west", cz1, -1) + hoop("east", cz0, 1)
side_rims = []
side_tops = []
side_backs = []
for i, hz in enumerate(SIDE_HOOP_Z):
    pieces, rim_x, top, back = side_hoop(i, hz)
    objs += pieces
    side_rims.append(rim_x)
    side_tops.append(top)
    side_backs.append(back)

for i, lz in enumerate(range(-5, int(Z0), -4)):
    for j, lx in enumerate((-14.0, -7.0, 0.0, 7.0, 14.0)):
        objs.append(L.box(coll, f"Light_{i:02d}{j}", lx, lz, H - 0.08, 2.0, 0.6, 0.06, M["lamp"]))
for i, (lx, lz) in enumerate(((-12.0, 1.2), (-4.0, 1.2), (3.0, 1.2), (9.2, 1.2), (14.5, 1.2))):
    objs.append(L.box(coll, f"Light_L{i}", lx, lz, LOBBY_H - 0.05, 1.4, 0.4, 0.05, M["lamp"]))
for nm, gx, gz, sx, sz in [("Sky_Back", 0, Z0 - 8, 90, 0.05), ("Sky_Front", 0, Z1 + 8, 90, 0.05),
                          ("Sky_West", X0 - 8, (Z0 + Z1) / 2, 0.05, 90), ("Sky_East", X1 + 8, (Z0 + Z1) / 2, 0.05, 90)]:
    objs.append(L.box(coll, nm, gx, gz, -3.0, sx, sz, 16.0, M["sky"]))

bad = L.check_grounded(objs, allow=L.ALLOW_INTERIOR + ("Ceiling", "Court_", "Hall_", "Stand_", "Goal_", "Hoop_", "LineY_"))
print("INTERIOR grounded violations:", bad)
assert not bad, bad
L.export_glb(os.path.join(OUT, "interior.glb"), objs)
L.export_glb(os.path.join(OUT, "interior.colsrc.glb"), objs + cols.items)


def bounds(x0, x1, z0, z1):
    return {"minX": round(min(x0, x1), 4), "maxX": round(max(x0, x1), 4), "minZ": round(min(z0, z1), 4), "maxZ": round(max(z0, z1), 4)}


def board_box(x0, x1, z0, z1, top):
    return {"minX": round(x0, 4), "maxX": round(x1, 4), "minY": round(top - BOARD_H, 4), "maxY": round(top, 4), "minZ": round(z0, 4), "maxZ": round(z1, 4)}


def hoop_layout(end, zl, inward):
    board_z = board_planes[end] + inward * BOARD_T / 2
    return {"x": COURT_CX, "z": round(baskets[end], 4), "y": RIM_Y, "rimRadius": RIM_R, "threePointRadius": THREE,
            "board": board_box(COURT_CX - BOARD_W / 2, COURT_CX + BOARD_W / 2, board_z - BOARD_T / 2, board_z + BOARD_T / 2, board_tops[end])}


def side_hoop_layout(rim_x, hz, top, back):
    board_x = back - BOARD_T / 2
    return {"x": round(rim_x, 4), "z": hz, "y": RIM_Y, "rimRadius": RIM_R,
            "board": board_box(board_x - BOARD_T / 2, board_x + BOARD_T / 2, hz - BOARD_W / 2, hz + BOARD_W / 2, top)}


L.write_json(os.path.join(OUT, "interior.layout.json"), {
    "version": 1, "key": KEY, "name": NAME, "spawn": [0.0, 1.6, 3.7],
    "exit": {"position": [0.0, 4.75], "radius": 1.4},
    "stations": [],
    "npcs": {"coach": [COACH[0], 0.0, COACH[1]]},
    "seats": [],
    "court": {
        "ceilingY": H,
        "arena": bounds(*ARENA),
        "playArea": bounds(ARENA[0], ARENA[1] - 1.6, ARENA[2] - 0.8, ARENA[3] + 0.8),
        "court": bounds(*COURT),
        "centre": [COURT_CX, COURT_CZ],
        "goals": {end: {"lineZ": zl, "out": out, "minX": COURT_CX - GOAL_W / 2, "maxX": COURT_CX + GOAL_W / 2, "height": GOAL_H, "depth": GOAL_DEPTH}
                  for end, zl, out in (("west", cz1, 1), ("east", cz0, -1))},
        "baskets": {"west": hoop_layout("west", cz1, -1), "east": hoop_layout("east", cz0, 1)},
        "sideBaskets": [side_hoop_layout(rx, hz, top, back) for rx, hz, top, back in zip(side_rims, SIDE_HOOP_Z, side_tops, side_backs)],
    },
})


def triangles(items):
    return sum(len(p.vertices) - 2 for o in items if o.type == "MESH" for p in o.data.polygons)


print("interior:", len(objs), "objects,", len(cols.items), "collision boxes,", triangles(objs), "triangles")
L.snapshot(sc, os.path.join(OUT, "interior_preview.png"), (-14.0, 6.5, -4.0), (6.0, 0.5, -40.0), lens=18, res=(960, 640), hide_prefixes=("Ceiling", "Sky_"))
L.snapshot(sc, os.path.join(OUT, "interior_plan.png"), (0.0, 60.0, -23.0), (0.0, 0.0, -23.01), lens=28, res=(640, 960), hide_prefixes=("Ceiling", "Sky_"))

exec(open(os.path.join(HERE, "build_sports_gym_ext.py"), encoding="utf-8").read())
