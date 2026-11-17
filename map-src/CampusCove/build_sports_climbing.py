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
import lib_sports as S
importlib.reload(S)
import bpy

KEY = "sports_climbing"
NAME = "Cove Climbing Hall"
OUT = os.path.join(L.OUT_ROOT, "work", KEY)
RULES = json.load(open(os.path.join(L.FRONT_ASSETS, "sports", "rules", "climbing.json"), encoding="utf-8"))

POS_X, POS_Z, YAW = -561.5, -203.5, math.pi / 2
W, HD = 19.0, 15.5
SHELL_H, TOP_Y = 13.8, 14.2
H, T = 13.5, 0.2
OZ = HD - L.SHELL_THICKNESS - L.SHELL_GAP - L.INTERIOR_FRONT_OUTER_Z
INTERIOR_BACK = -HD - OZ + L.SHELL_GAP + L.SHELL_THICKNESS
X1 = W / 2 - 0.7
X0 = -X1
Z1 = L.INTERIOR_FRONT_OUTER_Z - T
Z0 = INTERIOR_BACK + T
FRONT_WINDOWS = ((-7.6, -3.0), (3.0, 7.6))
WIN_Y = (0.6, 2.8)
WALL_TOP = 12.8
BOULDER_W, BOULDER_H, BOULDER_MAT = 4.0, 4.6, 3.0
FALL_ZONE = 4.0
MAT_H = 0.12
DESK_Z = 2.6


def to_local(wx, wz):
    return -(wz - POS_Z), wx - POS_X - OZ


def to_world(lx, lz):
    return round(POS_X + lz + OZ, 4), round(POS_Z - lx, 4)


sc = L.new_build_scene("WORK_" + KEY + "_interior")
coll = bpy.data.collections.new("Interior")
sc.collection.children.link(coll)
cols = L.Collisions(coll)
M = L.std_mats(wall="#e9e6df", floor=("#a9a59c", "tiles", "#9a968d"))
M["panel"] = L.make_mat("IN_ClimbPanel", "#7f93a8", 0.85, "noise", 0.05)
M["panel_dark"] = L.make_mat("IN_ClimbPanelDark", "#5d6f82", 0.85, "noise", 0.05)
M["mat_blue"] = L.make_mat("IN_ClimbCrashMat", "#2f5d8a", 0.95, "stripes", 0.04, accent="#2a537c")
M["frame"] = L.make_mat("IN_ClimbSteel", "#3a3f45", 0.5, "noise", 0.02)
M["teal"] = L.make_mat("IN_SportsTeal", "#2a9d8f", 0.7, "noise", 0.03)
M["counter"] = L.make_mat("IN_SportsCounter", "#f4f2ec", 0.5, "noise", 0.01)
M["board"] = L.make_mat("IN_SportsBoard", "#1f2a33", 0.6, "noise", 0.01)
M["sign"] = L.make_mat("IN_SportsSignText", "#ffffff", 0.4, "noise", 0.0, emit="#ffffff", emit_strength=0.8)
M["seat"] = L.make_mat("IN_SportsSeat", "#2a9d8f", 0.8, "noise", 0.03)
M["rope"] = L.make_mat("IN_ClimbRope", "#e2b13c", 0.8, "noise", 0.02)
for colour, rule in RULES["colours"].items():
    M[f"tag_{colour}"] = L.make_mat(f"IN_ClimbTag_{colour}", rule["hex"], 0.6, "noise", 0.0)

objs = []
objs.append(L.box(coll, "House_Floor_Main", 0, (Z0 + Z1) / 2, -0.1, X1 - X0, Z1 - Z0, 0.1, M["floor"], tile=2.0))
objs.append(L.box(coll, "Ceiling", 0, (Z0 + Z1 + 0.2) / 2, H, X1 - X0 + 0.4, Z1 - Z0 + 0.4, 0.1, M["ceil"], tile=4.0))
objs += L.wall(coll, "Walls_Front", "x", Z1 + 0.1, T, X0 - T, X1 + T, H, M["wall"], openings=[(a, b, *WIN_Y) for a, b in FRONT_WINDOWS] + [L.DOOR_OPENING],
               cols=cols, glass=M["glass"], col_tag="Wall_Front")
objs += L.wall(coll, "Walls_Back", "x", Z0 - 0.1, T, X0 - T, X1 + T, H, M["wall"], cols=cols, col_tag="Wall_Back")
objs += L.wall(coll, "Walls_W", "z", X0 - 0.1, T, Z0, Z1 + 0.2, H, M["wall"], cols=cols, col_tag="Wall_W")
objs += L.wall(coll, "Walls_E", "z", X1 + 0.1, T, Z0, Z1 + 0.2, H, M["wall"], cols=cols, col_tag="Wall_E")
objs.append(L.box(coll, "Door_Entrance", 0, Z1 + 0.1, 0.01, 1.18, 0.06, 2.18, M["glass"], bevel=0.02))
objs.append(L.box(coll, "Door_Entrance_Handle", 0.42, Z1 - 0.03, 0.98, 0.04, 0.12, 0.04, M["metal"]))
objs.append(L.box(coll, "Entry_Doormat", 0, Z1 - 0.5, 0.0, 1.2, 0.7, 0.012, M["mat"]))

lines = RULES["lines"]
routes = [ln for ln in lines if ln["kind"] == "route"]
boulders = [ln for ln in lines if ln["kind"] == "boulder"]
lead_x = {ln["base"][0] for ln in routes}
assert len(lead_x) == 1, ("every route must sit on the one lead wall", lead_x)
_, lead_face_z = to_local(lead_x.pop(), 0.0)
lead_t = lead_face_z - Z0
assert 0.1 < lead_t < 0.6, ("lead wall face too far from the back wall", lead_t)
assert all(ln["face"] == "east" for ln in routes)
objs.append(L.box(coll, "Wall_LeadPanel", 0, (Z0 + lead_face_z) / 2, 0.0, X1 - X0, lead_t, WALL_TOP, M["panel"], tile=2.0))
cols.add("LeadWall", 0, (Z0 + lead_face_z) / 2, 0.0, X1 - X0, lead_t, WALL_TOP)
objs.append(L.box(coll, "Wall_LeadCoping", 0, Z0 + 0.3, WALL_TOP, X1 - X0, 0.6, 0.12, M["frame"]))
for ln in routes:
    lx, _ = to_local(*ln["base"])
    assert X0 + 1.0 < lx < X1 - 1.0, ("route outside the lead wall", ln["id"], lx)
    top = max(y for _, y in ln["holds"])
    assert top < WALL_TOP - 0.5, ("route above the wall", ln["id"])
    objs.append(L.box(coll, f"Wall_LaneTag_{ln['id']}", lx, lead_face_z + 0.01, 0.25, 0.6, 0.02, 0.18, M[f"tag_{ln['colour']}"]))
    objs.append(L.box(coll, f"Wall_LaneTop_{ln['id']}", lx, lead_face_z + 0.01, top + 0.5, 0.8, 0.02, 0.12, M[f"tag_{ln['colour']}"]))
    objs.append(L.box(coll, f"Wall_Anchor_{ln['id']}", lx, lead_face_z + 0.04, WALL_TOP - 0.35, 0.12, 0.08, 0.12, M["frame"]))
    objs.append(L.box(coll, f"Wall_Rope_{ln['id']}", lx + 0.35, lead_face_z + 0.12, 0.12, 0.03, 0.03, WALL_TOP - 0.47, M["rope"]))
    objs.append(L.box(coll, f"Wall_Belay_{ln['id']}", lx + 0.35, lead_face_z + 0.25, 0.0, 0.3, 0.3, 0.6, M["frame"], bevel=0.02))
for k in range(1, 6):
    seam_x = X0 + (X1 - X0) * k / 6
    objs.append(L.box(coll, f"Wall_LeadSeam_{k}", seam_x, lead_face_z + 0.005, 0.0, 0.04, 0.01, WALL_TOP, M["panel_dark"]))
objs.append(L.box(coll, "Wall_FallZoneMat", 0, lead_face_z + FALL_ZONE / 2, 0.0, X1 - X0, FALL_ZONE, MAT_H, M["mat_blue"], tile=2.0))
objs.append(L.box(coll, "Wall_LeadSignBoard", 0, Z0 + lead_t + 0.03, WALL_TOP + 0.25, 6.0, 0.04, 0.6, M["board"]))
objs.append(L.text_mesh(coll, "Wall_LeadSignText", "LEAD WALL", 0, Z0 + lead_t + 0.06, WALL_TOP + 0.37, 0.36, 0.01, M["sign"]))

for side in ("north", "south"):
    group = [ln for ln in boulders if ln["face"] == ("south" if side == "north" else "north")]
    if not group:
        continue
    face_lx = {to_local(*ln["base"])[0] for ln in group}
    assert len(face_lx) == 1, ("boulders of one side share one wall face", side, face_lx)
    face = face_lx.pop()
    inner = X1 if face > 0 else X0
    t = abs(inner - face)
    assert 0.1 < t < 0.6, ("boulder face too far from the side wall", side, t)
    sign = 1 if face > 0 else -1
    z_mid = []
    for ln in group:
        _, lz = to_local(*ln["base"])
        assert Z0 + FALL_ZONE + 0.5 < lz - BOULDER_W / 2 and lz + BOULDER_W / 2 < 0.0, ("boulder outside its wall span", ln["id"])
        assert max(y for _, y in ln["holds"]) < BOULDER_H - 0.3, ("boulder hold above its wall", ln["id"])
        assert all(abs(u) < BOULDER_W / 2 - 0.2 for u, _ in ln["holds"]), ("boulder hold off its wall", ln["id"])
        z_mid.append(lz)
        cx = (inner + face) / 2
        objs.append(L.box(coll, f"Wall_Boulder_{ln['id']}", cx, lz, 0.0, t, BOULDER_W, BOULDER_H, M["panel"], tile=2.0))
        cols.add(f"Boulder_{ln['id']}", cx, lz, 0.0, t, BOULDER_W, BOULDER_H)
        objs.append(L.box(coll, f"Wall_BoulderTop_{ln['id']}", face - sign * 0.06, lz, BOULDER_H, 0.4, BOULDER_W + 0.1, 0.1, M["panel_dark"]))
        objs.append(L.box(coll, f"Wall_BoulderTag_{ln['id']}", face - sign * 0.01, lz, 0.25, 0.02, 0.6, 0.18, M[f"tag_{ln['colour']}"]))
    z_lo, z_hi = min(z_mid) - BOULDER_W / 2, max(z_mid) + BOULDER_W / 2
    objs.append(L.box(coll, f"Wall_BoulderMat_{side}", face - sign * BOULDER_MAT / 2, (z_lo + z_hi) / 2, 0.0, BOULDER_MAT, z_hi - z_lo, MAT_H, M["mat_blue"], tile=2.0))

objs.append(L.furn(coll, "shoe_desk", 5.6, DESK_Z, math.pi / 2, [
    (0, 0, 0.0, 3.6, 0.8, 1.0, M["counter"], 0.02), (0, 0, 1.0, 3.7, 0.9, 0.05, M["marble"], 0.01),
    (0, -0.41, 0.12, 3.4, 0.02, 0.24, M["teal"])]))
cols.add("ShoeDesk", 5.6, DESK_Z, 0.0, 0.9, 3.7, 1.05)
for k, lz in enumerate((0.9, 2.6, 4.3)):
    objs.append(L.furn(coll, f"ShoeRack_{k:02d}", X1 - 0.25, lz, math.pi / 2, [
        (0, 0, 0.0, 1.5, 0.4, 0.05, M["frame"]), (0, 0, 0.6, 1.5, 0.4, 0.04, M["frame"]), (0, 0, 1.2, 1.5, 0.4, 0.04, M["frame"]),
        (-0.72, 0, 0.0, 0.05, 0.4, 1.8, M["frame"]), (0.72, 0, 0.0, 0.05, 0.4, 1.8, M["frame"])]))
    cols.add(f"ShoeRack_{k:02d}", X1 - 0.25, lz, 0.0, 0.45, 1.55, 1.8)
objs.append(L.box(coll, "Wall_ShoeSignBoard", X1 + 0.07, DESK_Z, 2.2, 0.04, 3.2, 0.5, M["board"]))
shoe_sign = L.text_mesh(coll, "Wall_ShoeSignText", "CLIMBING SHOES", X1 + 0.04, DESK_Z, 2.31, 0.24, 0.01, M["sign"])
shoe_sign.rotation_euler[2] = -math.pi / 2
objs.append(shoe_sign)
for k, lx in enumerate((-4.5, -1.5)):
    objs.append(L.furn(coll, f"Bench_{k:02d}", lx, -2.0, 0.0, [
        (-0.8, 0, 0.0, 0.08, 0.42, 0.42, M["metal"]), (0.8, 0, 0.0, 0.08, 0.42, 0.42, M["metal"]),
        (0, 0, 0.42, 1.8, 0.45, 0.06, M["seat"], 0.01)]))
    cols.add(f"Bench_{k:02d}", lx, -2.0, 0.0, 1.9, 0.5, 0.5)
objs.append(L.plant(coll, M, "Plant_01", X0 + 0.45, Z1 - 0.5))
cols.add("Plant_01", X0 + 0.45, Z1 - 0.5, 0.0, 0.5, 0.5, 1.3)

for i, lz in enumerate((-22.0, -16.0, -10.0, -4.0, 2.0)):
    for j, lx in enumerate((-5.0, 0.0, 5.0)):
        objs.append(L.box(coll, f"Light_{i}{j}", lx, lz, H - 0.05, 2.4, 0.5, 0.05, M["lamp"]))
for nm, gx, gz, sx, sz in [("Sky_Back", 0, Z0 - 6, 60, 0.05), ("Sky_Front", 0, Z1 + 6, 60, 0.05),
                          ("Sky_West", X0 - 6, (Z0 + Z1) / 2, 0.05, 60), ("Sky_East", X1 + 6, (Z0 + Z1) / 2, 0.05, 60)]:
    objs.append(L.box(coll, nm, gx, gz, -3.0, sx, sz, 20.0, M["sky"]))

bad = L.check_grounded(objs, allow=L.ALLOW_INTERIOR + ("Ceiling",))
print("INTERIOR grounded violations:", bad)
assert not bad, bad
L.export_glb(os.path.join(OUT, "interior.glb"), objs)
L.export_glb(os.path.join(OUT, "interior.colsrc.glb"), objs + cols.items)
L.write_json(os.path.join(OUT, "interior.layout.json"), {
    "version": 1, "key": KEY, "name": NAME, "spawn": [0.0, 1.6, Z1 - 1.3],
    "exit": {"position": [0.0, Z1 - 0.25], "radius": 1.4},
    "stations": [],
    "npcs": {"shoeAttendant": [5.6 + 0.95, 0.0, DESK_Z]},
    "counters": {"shoes": [5.6, 0.0, DESK_Z]},
    "seats": [],
})


def triangles(items):
    return sum(len(p.vertices) - 2 for o in items if o.type == "MESH" for p in o.data.polygons)


print("interior:", len(objs), "objects,", len(cols.items), "collision boxes,", triangles(objs), "triangles")
L.snapshot(sc, os.path.join(OUT, "interior_preview.png"), (0, 3.0, Z1 - 1.0), (0, 6.0, Z0), lens=18, res=(960, 640), hide_prefixes=("Ceiling", "Sky_"))

exec(open(os.path.join(HERE, "build_sports_climbing_ext.py"), encoding="utf-8").read())
