"""Cove Storage warehouse interior: 12 roll-up storage units and the auctioneer's stage. Outputs: out/work/storage/{interior.glb,interior.colsrc.glb,interior.layout.json}, then the exterior (build_storage_warehouse_ext.py). Plan: design-plans/storage-unit.md."""
import importlib
import math
import os
import sys

if "__file__" not in globals():
    raise RuntimeError('Run with exec(open(p).read(), {"__file__": p}) so the script can find lib_common.py')
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lib_common as L
importlib.reload(L)
import bpy

KEY = "storage"
NAME = "Cove Storage"
OUT = os.path.join(L.OUT_ROOT, "work", KEY)

X0, X1, Z0, Z1, T, H = -7.0, 7.0, -29.0, 5.0, 0.2, 5.0
UNIT_W, UNIT_D, UNIT_H = 4.0, 4.0, 2.6
UNIT_PITCH = UNIT_W + 0.2
UNIT_TOP_Z = 1.7
UNITS_PER_ROW = 6
STAGE_Z0, STAGE_H = -25.0, 0.6
DOOR_TINTS = ("#b5603a", "#4f6f8f", "#6f8a62")

sc = L.new_build_scene("WORK_" + KEY + "_interior")
coll = bpy.data.collections.new("Interior")
sc.collection.children.link(coll)
cols = L.Collisions(coll)
M = L.std_mats(wall="#9aa1a6", floor=("#a8a59d", "tiles", "#9a978f"))
M["sheet"] = L.make_mat("IN_StorageSheetMetal", "#b4bbbf", 0.6, "stripes", 0.03, accent="#a3aaae")
M["frame"] = L.make_mat("IN_StorageFrame", "#e2b53a", 0.6, "noise", 0.03)
M["number"] = L.make_mat("IN_StorageNumber", "#f4f1e8", 0.5, "noise", 0.0)
M["stage"] = L.make_mat("IN_StorageStage", "#5b4636", 0.7, "planks", 0.04, accent="#4a3829")
M["board"] = L.make_mat("IN_StorageLotBoard", "#20262b", 0.6, "noise", 0.02)
M["boardtext"] = L.make_mat("IN_StorageLotText", "#ffd36a", 0.4, "noise", 0.0, emit="#ffc84a", emit_strength=1.0)
M["hazard"] = L.make_mat("IN_StorageHazard", "#e2b53a", 0.7, "stripes", 0.0, accent="#202020")
doors = [L.make_mat(f"IN_StorageDoor{i}", tint, 0.55, "stripes", 0.04, accent=tint) for i, tint in enumerate(DOOR_TINTS)]

objs = []
objs.append(L.box(coll, "House_Floor_Main", 0, (Z0 + Z1) / 2, -0.1, X1 - X0, Z1 - Z0, 0.1, M["floor"], tile=2.0))
objs.append(L.box(coll, "Ceiling", 0, (Z0 + Z1) / 2, H, X1 - X0 + 0.4, Z1 - Z0 + 0.4, 0.1, M["ceil"], tile=2.0))
objs += L.wall(coll, "Walls_Front", "x", Z1 + 0.1, T, X0 - T, X1 + T, H, M["sheet"], openings=[L.DOOR_OPENING], cols=cols, col_tag="Wall_Front")
objs += L.wall(coll, "Walls_Back", "x", Z0 - 0.1, T, X0 - T, X1 + T, H, M["sheet"], cols=cols, col_tag="Wall_Back")
objs += L.wall(coll, "Walls_W", "z", X0 - 0.1, T, Z0, Z1 + 0.2, H, M["sheet"], cols=cols, col_tag="Wall_W")
objs += L.wall(coll, "Walls_E", "z", X1 + 0.1, T, Z0, Z1 + 0.2, H, M["sheet"], cols=cols, col_tag="Wall_E")
objs.append(L.box(coll, "Door_Entrance", 0, Z1 + 0.1, 0.01, 1.18, 0.06, 2.18, M["door"], bevel=0.02))
objs.append(L.box(coll, "Door_Entrance_Handle", 0.42, Z1 - 0.03, 0.98, 0.04, 0.12, 0.04, M["metal"]))
objs.append(L.box(coll, "Entry_Doormat", 0, Z1 - 0.5, 0.0, 1.0, 0.6, 0.012, M["mat"]))
objs.append(L.box(coll, "Wall_HazardStripeW", X0 + 0.03, (Z0 + Z1) / 2, 0.0, 0.04, Z1 - Z0, 0.25, M["hazard"]))
objs.append(L.box(coll, "Wall_HazardStripeE", X1 - 0.03, (Z0 + Z1) / 2, 0.0, 0.04, Z1 - Z0, 0.25, M["hazard"]))

units = []


def storage_unit(index, side):
    row_index = index % UNITS_PER_ROW
    cz = UNIT_TOP_Z - UNIT_W / 2 - row_index * UNIT_PITCH
    back_x = X0 if side == "W" else X1
    face = 1.0 if side == "W" else -1.0
    front_x = back_x + face * UNIT_D
    mid_x = (back_x + front_x) / 2
    tag = f"{index + 1:02d}"
    parts = []
    for edge, dz in (("N", UNIT_W / 2 + 0.05), ("S", -UNIT_W / 2 - 0.05)):
        parts.append(L.box(coll, f"Wall_Unit{tag}_Side{edge}", mid_x, cz + dz, 0.0, UNIT_D, 0.1, UNIT_H + 0.4, M["sheet"]))
        cols.add(f"Unit{tag}_Side{edge}", mid_x, cz + dz, 0.0, UNIT_D, 0.1, UNIT_H + 0.4)
    parts.append(L.box(coll, f"Wall_Unit{tag}_Roof", mid_x, cz, UNIT_H + 0.4, UNIT_D, UNIT_W + 0.2, 0.08, M["sheet"]))
    parts.append(L.box(coll, f"Wall_Unit{tag}_Header", front_x - face * 0.05, cz, UNIT_H, 0.12, UNIT_W + 0.2, 0.4, M["frame"]))
    for edge, dz in (("N", UNIT_W / 2 + 0.05), ("S", -UNIT_W / 2 - 0.05)):
        parts.append(L.box(coll, f"Wall_Unit{tag}_Post{edge}", front_x - face * 0.05, cz + dz, 0.0, 0.14, 0.14, UNIT_H, M["frame"]))
    number = L.text_mesh(coll, f"Wall_Unit{tag}_Number", str(index + 1), front_x + face * 0.02, cz, UNIT_H + 0.04, 0.34, 0.0, M["number"])
    number.rotation_euler[2] = math.pi / 2 if side == "W" else -math.pi / 2
    parts.append(number)
    door = L.box(coll, f"Door_Rollup_{tag}", front_x - face * 0.08, cz, 0.0, 0.05, UNIT_W, UNIT_H, doors[index % len(doors)])
    cols.add(f"UnitFront{tag}", front_x - face * 0.08, cz, 0.0, 0.12, UNIT_W, UNIT_H)
    units.append({
        "id": f"unit_{tag}",
        "door": door.name,
        "threshold": [round(front_x + face * 0.6, 3), 0.0, round(cz, 3)],
        "inside": {"cx": round(mid_x, 3), "cz": round(cz, 3), "sx": UNIT_D, "sz": UNIT_W, "h": UNIT_H},
        "facing": round(math.pi / 2 if side == "W" else -math.pi / 2, 4),
    })
    return parts + [door]


for i in range(UNITS_PER_ROW):
    objs += storage_unit(i, "W")
for i in range(UNITS_PER_ROW):
    objs += storage_unit(UNITS_PER_ROW + i, "E")

stage_cz = (STAGE_Z0 + Z0) / 2
stage_d = STAGE_Z0 - Z0
objs.append(L.box(coll, "AuctionStage", 0, stage_cz, 0.0, 8.0, stage_d, STAGE_H, M["stage"], tile=2.0))
cols.add("AuctionStage", 0, stage_cz, 0.0, 8.0, stage_d, STAGE_H)
objs.append(L.box(coll, "AuctionStage_Step", 0, STAGE_Z0 + 0.4, 0.0, 2.0, 0.8, STAGE_H / 2, M["stage"]))
cols.add("AuctionStage_Step", 0, STAGE_Z0 + 0.4, 0.0, 2.0, 0.8, STAGE_H / 2)
objs.append(L.furn(coll, "AuctionLectern", 1.6, STAGE_Z0 - 1.0, 0.0, [
    (0, 0, STAGE_H, 0.7, 0.5, 1.05, M["walnut"], 0.02), (0, 0.05, STAGE_H + 1.05, 0.8, 0.6, 0.05, M["walnut"], 0.01)]))
cols.add("AuctionLectern", 1.6, STAGE_Z0 - 1.0, STAGE_H, 0.8, 0.6, 1.1)
objs.append(L.box(coll, "Wall_LotBoard", 0, Z0 + 0.06, 2.6, 6.0, 0.08, 1.8, M["board"]))
objs.append(L.text_mesh(coll, "Wall_LotBoardTitle", "LOT", 0, Z0 + 0.12, 3.55, 0.6, 0.03, M["boardtext"]))

for i, lz in enumerate(range(3, int(Z0), -5)):
    for j, lx in enumerate((-1.6, 1.6)):
        objs.append(L.box(coll, f"Light_{i:02d}{j}", lx, lz, H - 0.08, 0.25, 2.4, 0.06, M["lamp"]))
for nm, gx, gz, sx, sz in [("Sky_Back", 0, Z0 - 6, 60, 0.05), ("Sky_Front", 0, Z1 + 6, 60, 0.05), ("Sky_West", X0 - 6, (Z0 + Z1) / 2, 0.05, 60), ("Sky_East", X1 + 6, (Z0 + Z1) / 2, 0.05, 60)]:
    objs.append(L.box(coll, nm, gx, gz, -3.0, sx, sz, 12.0, M["sky"]))

bad = L.check_grounded(objs, allow=L.ALLOW_INTERIOR + ("Ceiling", "AuctionLectern"))
print("INTERIOR grounded violations:", bad)
assert not bad, bad
L.export_glb(os.path.join(OUT, "interior.glb"), objs)
L.export_glb(os.path.join(OUT, "interior.colsrc.glb"), objs + cols.items)
L.write_json(os.path.join(OUT, "interior.layout.json"), {
    "version": 1, "key": KEY, "name": NAME, "spawn": [0.0, 1.6, 3.7],
    "exit": {"position": [0.0, 4.75], "radius": 1.4},
    "stations": [],
    "npcs": {"auctioneer": [0.0, STAGE_H, STAGE_Z0 - 1.2]},
    "lotBoard": [0.0, 3.5, Z0 + 0.12],
    "units": units,
    "seats": [],
})


def triangles(items):
    return sum(len(p.vertices) - 2 for o in items if o.type == "MESH" for p in o.data.polygons)


print("interior:", len(objs), "objects,", len(cols.items), "collision boxes,", triangles(objs), "triangles")
L.snapshot(sc, os.path.join(OUT, "interior_preview.png"), (0, 3.2, 4.2), (0, 1.4, -20), lens=20, res=(960, 640), hide_prefixes=("Ceiling", "Sky_"))

exec(open(os.path.join(HERE, "build_storage_warehouse_ext.py"), encoding="utf-8").read())
