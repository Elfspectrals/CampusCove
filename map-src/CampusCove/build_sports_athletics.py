"""Athletics venue of the Cove Sports Park (docs/sports/MASTER_PLAN.md § 6, docs/sports/running.md): the 400 m track
with its west chute and east run-off, the 7 v 7 pitch in the infield and the small stand facing north.

The track geometry is owned by front/public/assets/sports/rules/running.json (the socket times races on it).
Outputs: out/park/sports_athletics/{sports_athletics.glb, sports_athletics.layout.json, preview.png}, then
`npm run assets:optimize -- park sports_athletics` and `node scripts/apply-sports-athletics.mjs` (from front/).
"""
import importlib
import json
import math
import os
import sys

if "__file__" not in globals():
    raise RuntimeError('Run with exec(open(p).read(), {"__file__": p}) so the script can find lib_common.py')
HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import lib_common as L
importlib.reload(L)
import lib_site as S
importlib.reload(S)
import lib_sports as SP
importlib.reload(SP)
import bmesh
import bpy

PI = math.pi
KEY = "sports_athletics"
OUT = os.path.join(L.OUT_ROOT, "park", KEY)
RULES = json.load(open(os.path.join(HERE, "..", "..", "front", "public", "assets", "sports", "rules", "running.json")))
TRACK = RULES["track"]
FP = SP.FOOTPRINTS[KEY]
Y = SP.Y

CX, CZ = TRACK["centre"]
HALF = TRACK["straightM"] / 2
R_IN = TRACK["kerbRadiusM"]
LANE = TRACK["laneWidthM"]
LANES = TRACK["lanes"]
R_OUT = R_IN + LANE * LANES
EAST_CX, WEST_CX = CX + HALF, CX - HALF
FINISH_X = EAST_CX
SPRINT_X = FINISH_X - TRACK["chuteM"]
CHUTE_X0 = SPRINT_X - 4.0
RUNOFF_X1 = FINISH_X + TRACK["runOffM"]
SOUTH_IN, SOUTH_OUT = CZ + R_IN, CZ + R_OUT

TRACK_TOP = 0.05
APRON_TOP = 0.06
LINE_UP = 0.005
KERB_TOP = 0.10
PITCH = (CX - 27.5, CX + 27.5, CZ - 17.5, CZ + 17.5)
PITCH_TOP = 0.03
GOAL_W, GOAL_H = 5.0, 2.0
STAND = (-486.0, -434.0, -322.0, -314.0)
STAND_ROWS = 6
STAND_RISE = 0.35
AISLE = (-476.0, -472.0)
WALK = (-478.0, -470.0)
COACH = (RULES["coach"]["x"], RULES["coach"]["z"])
MASTS = ((-560.0, -416.0), (-388.0, -416.0), (-560.0, -326.0), (-388.0, -326.0))

sc = L.new_build_scene("PARK_sports_athletics")
coll = bpy.data.collections.new(KEY)
sc.collection.children.link(coll)
s = S.Site(coll, "SportsAthletics", seed=81)

shared = SP.site_materials()
M = {
    "lawn": shared["lawn"],
    "paving": shared["paving"],
    "track": L.make_mat("TW_AthleticsTrack", "#b5533c", 0.95, "noise", 0.05),
    "line": L.make_mat("TW_AthleticsLine", "#f4f1e8", 0.8, "noise", 0.01),
    "finish": L.make_mat("TW_AthleticsFinishLine", "#20242a", 0.8, "noise", 0.01),
    "kerb": L.make_mat("TW_AthleticsKerb", "#d9dde0", 0.4, "noise", 0.02),
    "turf": L.make_mat("TW_AthleticsTurf", "#5f9e48", 1.0, "stripes", 0.06, accent="#559341"),
    "post": L.make_mat("TW_AthleticsGoalPost", "#f7f7f2", 0.5, "noise", 0.01),
    "concrete": L.make_mat("TW_AthleticsStandConcrete", "#c9c5bc", 0.9, "noise", 0.04),
    "seat": L.make_mat("TW_AthleticsStandSeat", "#2f7fb5", 0.6, "noise", 0.03),
    "iron": L.make_mat("TW_AthleticsMast", "#3a3f45", 0.6, "noise", 0.02),
    "lamp": L.make_mat("TW_AthleticsFloodlight", "#fff1c4", 0.5, "noise", 0.0, emit="#ffe6a8", emit_strength=1.4),
    "screen": L.make_mat("TW_AthleticsScoreboardScreen", "#14181d", 0.4, "noise", 0.01, emit="#1f3a2c", emit_strength=0.3),
}
BOARD = RULES["scoreboard"]


def ribbon(name, cx, cz, r0, r1, a0, a1, y, mat, step=1.5):
    """Flat top-only annular sector, for painted lines on a curve (point = c + r (cos a, sin a))."""
    n = max(2, int(abs(a1 - a0) * r1 / step) + 1)
    bm = bmesh.new()
    rows = []
    for i in range(n + 1):
        a = a0 + (a1 - a0) * i / n
        rows.append([bm.verts.new(L.b(cx + r * math.cos(a), cz + r * math.sin(a), y)) for r in (r0, r1)])
    for i in range(n):
        bm.faces.new((rows[i][0], rows[i + 1][0], rows[i + 1][1], rows[i][1]))
    for f in bm.faces:
        f.normal_update()
        if f.normal.z < 0:
            f.normal_flip()
    return s.add(S._mesh(s, name, bm, mat, 2.0))


def flat_rect(name, x0, z0, x1, z1, y, mat):
    bm = bmesh.new()
    vs = [bm.verts.new(L.b(x, z, y)) for x, z in ((x0, z0), (x1, z0), (x1, z1), (x0, z1))]
    f = bm.faces.new(vs)
    f.normal_update()
    if f.normal.z < 0:
        f.normal_flip()
    return s.add(S._mesh(s, name, bm, mat, 2.0))


EAST_ARC = (-PI / 2, PI / 2)
WEST_ARC = (PI / 2, 3 * PI / 2)

# ================================================================ ground
S.rect(s, "SA_Lawn", FP[0], FP[2], FP[1], FP[3], 0.0, Y["lawn"], M["lawn"], tile=4.0)
S.rect(s, "SA_Pitch", PITCH[0], PITCH[2], PITCH[1], PITCH[3], 0.0, PITCH_TOP, M["turf"], tile=5.0)

# ================================================================ track
S.rect(s, "SA_Track_North", WEST_CX, CZ - R_OUT, EAST_CX, CZ - R_IN, 0.0, TRACK_TOP, M["track"], tile=3.0)
S.rect(s, "SA_Track_South", WEST_CX, SOUTH_IN, EAST_CX, SOUTH_OUT, 0.0, TRACK_TOP, M["track"], tile=3.0)
S.arc_band(s, "SA_Track_EastBend", EAST_CX, CZ, R_IN, R_OUT, *EAST_ARC, 0.0, TRACK_TOP, M["track"], step=1.0, tile=3.0)
S.arc_band(s, "SA_Track_WestBend", WEST_CX, CZ, R_IN, R_OUT, *WEST_ARC, 0.0, TRACK_TOP, M["track"], step=1.0, tile=3.0)
S.rect(s, "SA_Track_Chute", CHUTE_X0, SOUTH_IN, WEST_CX, SOUTH_OUT, 0.0, APRON_TOP, M["track"], tile=3.0)
S.rect(s, "SA_Track_RunOff", EAST_CX, SOUTH_IN, RUNOFF_X1, SOUTH_OUT, 0.0, APRON_TOP, M["track"], tile=3.0)
S.arc_band(s, "SA_Kerb_EastBend", EAST_CX, CZ, R_IN - 0.08, R_IN, *EAST_ARC, 0.0, KERB_TOP, M["kerb"], step=1.0)
S.arc_band(s, "SA_Kerb_WestBend", WEST_CX, CZ, R_IN - 0.08, R_IN, *WEST_ARC, 0.0, KERB_TOP, M["kerb"], step=1.0)
S.rect(s, "SA_Kerb_North", WEST_CX, CZ - R_IN, EAST_CX, CZ - R_IN + 0.08, 0.0, KERB_TOP, M["kerb"])
S.rect(s, "SA_Kerb_South", WEST_CX, SOUTH_IN - 0.08, EAST_CX, SOUTH_IN, 0.0, KERB_TOP, M["kerb"])

line_y = TRACK_TOP + LINE_UP
apron_line_y = APRON_TOP + LINE_UP
for k in range(1, LANES + 1):
    r = R_IN + LANE * k
    w = 0.05
    ribbon(f"SA_Line_EastBend{k}", EAST_CX, CZ, r - w, r, *EAST_ARC, line_y, M["line"])
    ribbon(f"SA_Line_WestBend{k}", WEST_CX, CZ, r - w, r, *WEST_ARC, line_y, M["line"])
    flat_rect(f"SA_Line_North{k}", WEST_CX, CZ - r, EAST_CX, CZ - r + w, line_y, M["line"])
    flat_rect(f"SA_Line_South{k}", WEST_CX, CZ + r - w, EAST_CX, CZ + r, line_y, M["line"])
    flat_rect(f"SA_Line_Chute{k}", CHUTE_X0, CZ + r - w, WEST_CX, CZ + r, apron_line_y, M["line"])
    flat_rect(f"SA_Line_RunOff{k}", EAST_CX, CZ + r - w, RUNOFF_X1, CZ + r, apron_line_y, M["line"])
flat_rect("SA_Line_Finish", FINISH_X - 0.05, SOUTH_IN, FINISH_X + 0.05, SOUTH_OUT, apron_line_y + LINE_UP, M["finish"])
flat_rect("SA_Line_Start100", SPRINT_X - 0.05, SOUTH_IN, SPRINT_X + 0.05, SOUTH_OUT, apron_line_y, M["line"])

# ================================================================ pitch (7 v 7)
pl_y = PITCH_TOP + LINE_UP
x0, x1, z0, z1 = PITCH
lw = 0.1
for name, a, b, c, d in (("North", x0, z0, x1, z0 + lw), ("South", x0, z1 - lw, x1, z1), ("West", x0, z0, x0 + lw, z1),
                         ("East", x1 - lw, z0, x1, z1), ("Half", CX - lw / 2, z0, CX + lw / 2, z1)):
    flat_rect(f"SA_PitchLine_{name}", a, b, c, d, pl_y, M["line"])
ribbon("SA_PitchLine_Circle", CX, CZ, 6.0 - lw, 6.0, 0.0, 2 * PI, pl_y, M["line"], step=0.8)
for side, gx, out in (("West", x0, -1.0), ("East", x1, 1.0)):
    bx = gx - out * 9.0
    flat_rect(f"SA_PitchLine_{side}BoxFront", min(bx, bx + lw), CZ - 8.0, max(bx, bx + lw), CZ + 8.0, pl_y, M["line"])
    for zz, nm in ((CZ - 8.0, "N"), (CZ + 8.0 - lw, "S")):
        flat_rect(f"SA_PitchLine_{side}Box{nm}", min(gx, bx), zz, max(gx, bx), zz + lw, pl_y, M["line"])
    post = 0.12
    gxo = gx + out * 1.2
    for nm, zz in (("N", CZ - GOAL_W / 2), ("S", CZ + GOAL_W / 2)):
        s.add(L.box(coll, f"SA_Goal{side}_Post{nm}", gx, zz, 0.0, post, post, GOAL_H, M["post"]))
        s.add(L.box(coll, f"SA_Goal{side}_Back{nm}", gxo, zz, 0.0, post * 0.6, post * 0.6, GOAL_H * 0.7, M["post"]))
        s.add(L.box(coll, f"SA_Goal{side}_Stay{nm}", (gx + gxo) / 2, zz, GOAL_H * 0.7, 1.2, post * 0.6, post * 0.6, M["post"]))
        s.col(f"Goal{side}Post{nm}", gx, zz, 0.2, 0.2, GOAL_H)
    s.add(L.box(coll, f"SA_Goal{side}_Bar", gx, CZ, GOAL_H - post, post, GOAL_W + post, post, M["post"]))
    s.add(L.box(coll, f"SA_Goal{side}_BackBar", gxo, CZ, 0.0, post * 0.6, GOAL_W, post * 0.6, M["post"]))
    s.col(f"Goal{side}Back", gxo, CZ, 0.2, GOAL_W, GOAL_H * 0.7)

# ================================================================ stand (6 rows, facing north) and its paths
sx0, sx1, sz0, sz1 = STAND
row_d = (sz1 - sz0) / STAND_ROWS
for half, (ax, bx) in (("W", (sx0, AISLE[0])), ("E", (AISLE[1], sx1))):
    for i in range(STAND_ROWS):
        rz0 = sz0 + i * row_d
        top = STAND_RISE * (i + 1)
        S.rect(s, f"SA_Stand{half}_Row{i}", ax, rz0, bx, rz0 + row_d, 0.0, top, M["concrete"], tile=2.0)
        S.rect(s, f"SA_Stand{half}_Seat{i}", ax + 0.2, rz0 + row_d * 0.55, bx - 0.2, rz0 + row_d * 0.9, top, top + 0.42, M["seat"], tile=1.0)
    s.add(L.box(coll, f"SA_Stand{half}_Rail", (ax + bx) / 2, sz1 - 0.05, STAND_RISE * STAND_ROWS, bx - ax, 0.06, 1.0, M["iron"]))
    s.col(f"Stand{half}", (ax + bx) / 2, (sz0 + sz1) / 2, bx - ax, sz1 - sz0, STAND_RISE * STAND_ROWS + 1.0)
S.rect(s, "SA_Path_Stand", WALK[0], sz0, WALK[1], FP[3], 0.0, Y["paving"], M["paving"])
S.rect(s, "SA_Path_TrackSide", sx0, SOUTH_OUT, sx1, sz0, 0.0, Y["paving"], M["paving"])
S.rect(s, "SA_Path_Coach", sx1, SOUTH_OUT, COACH[0] + 3.0, COACH[1] + 2.0, 0.0, Y["paving"], M["paving"])

# ================================================================ scoreboard (the live board is drawn over its screen by the HUD)
bx, bz, bw, bh = BOARD["x"], BOARD["z"], BOARD["widthM"], BOARD["heightM"]
panel_h = 2.4
for nm, px in (("W", bx - bw / 2 + 0.3), ("E", bx + bw / 2 - 0.3)):
    s.add(L.box(coll, f"SA_Scoreboard_Post{nm}", px, bz, 0.0, 0.25, 0.25, bh - panel_h, M["iron"]))
s.add(L.box(coll, "SA_Scoreboard_Frame", bx, bz, bh - panel_h, bw, 0.3, panel_h, M["iron"], bevel=0.03))
s.add(L.box(coll, "SA_Scoreboard_Screen", bx, bz + 0.16, bh - panel_h + 0.15, bw - 0.3, 0.02, panel_h - 0.3, M["screen"]))
s.col("Scoreboard", bx, bz, bw, 0.5, bh)

# ================================================================ floodlight masts
for k, (mx, mz) in enumerate(MASTS):
    S.street_lamp(s, f"SA_Mast{k}", mx, mz, M, h=9.0)

# ================================================================ audit, export
sc.view_layers[0].update()
for o in s.objs:
    if o.type != "MESH":
        continue
    for v in o.bound_box:
        wx, wz = (o.matrix_world @ L.Vector(v)).x, -(o.matrix_world @ L.Vector(v)).y
        assert FP[0] - 0.01 <= wx <= FP[1] + 0.01 and FP[2] - 0.01 <= wz <= FP[3] + 0.01, ("outside the footprint", o.name, wx, wz)
for c in s.cols:
    assert FP[0] <= c["cx"] - c["hx"] and c["cx"] + c["hx"] <= FP[1] and FP[2] <= c["cz"] - c["hz"] and c["cz"] + c["hz"] <= FP[3], c
pa = RULES["playArea"]
assert pa["minX"] < CHUTE_X0 and pa["maxX"] > EAST_CX + R_OUT and pa["minZ"] < CZ - R_OUT and SOUTH_OUT < pa["maxZ"] < sz0, pa
assert not (pa["minX"] <= COACH[0] <= pa["maxX"] and pa["minZ"] <= COACH[1] <= pa["maxZ"]), "coach inside the reserved play area"

L.export_glb(os.path.join(OUT, f"{KEY}.glb"), s.objs, use_active_scene=True)
print(f"{KEY}: {len(s.objs)} objects, {s.tris()} tris, {len(s.cols)} COL")
L.write_json(os.path.join(OUT, f"{KEY}.layout.json"), {
    "version": 1,
    "zone": {"minX": FP[0], "maxX": FP[1], "minZ": FP[2], "maxZ": FP[3]},
    "coach": [COACH[0], 0.0, COACH[1]],
    "adminTeleport": {"position": [COACH[0] - 3.0, 0.0, COACH[1]], "yaw": PI / 2},
    "collision": s.cols,
})
L.snapshot(sc, os.path.join(OUT, "preview.png"), (-474.0, 70.0, -280.0), (-474.0, 0.0, -370.0), lens=24, res=(1280, 800))
