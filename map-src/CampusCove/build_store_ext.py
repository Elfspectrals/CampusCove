"""Cove Home exterior + its retail park, east of the business-district plaza. Run inside Blender after build_store.py
(or alone): exec(open(<this file>).read()).

Town placement (game xz, same origin as town.glb):
  plaza extension : x 29.3 -> 74.5, z 48 -> 56 (continues the district plaza, see build_work_district.py)
  store           : centre (52, 65), rotation pi (door on the plaza, facing the town), footprint 34 x 18
  fences          : hedges along x=30.6 (ring -> plaza), z=47.7 (north edge) and x=74.5 (east edge) close the new area
  pylon sign      : (33.5, 50.6); wayfinding sign on the district plaza at (12.5, 49.2)
Outputs: out/store/cove_home/{exterior.glb, preview.png}, out/store/park/{park.glb, park.layout.json}
front/scripts/apply-store.mjs merges park.layout.json into the town collision + town.layout.json (`store`).
"""
import importlib
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else r"C:\Users\Utilisateur\CampusCove\map-src\CampusCove"
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import lib_common as L
importlib.reload(L)
import bpy

KEY = "cove_home"
OUT = os.path.join(L.OUT_ROOT, "store", KEY)
OUT_PARK = os.path.join(L.OUT_ROOT, "store", "park")
W, D, HB = 34.0, 18.0, 8.5
hw, hd = W / 2, D / 2
STORE_POS = (52.0, 65.0)
VEST_D = 3.2  # glass entrance vestibule depth

# ================================================================ EXTERIOR (local frame, door on +Z)
sc = L.new_build_scene("STORE_" + KEY + "_exterior")
coll = bpy.data.collections.new("Exterior")
sc.collection.children.link(coll)
E = {
    "found": L.make_mat("EX_Foundation", "#8d8f94", 0.9, "noise", 0.03),
    "blue": L.make_mat("EX_StoreBlue", "#1f5fae", 0.8, "stripes", 0.03, accent="#1b56a0"),
    "yellow": L.make_mat("EX_StoreYellow", "#f7c21b", 0.6, "noise", 0.02),
    "sign": L.make_mat("EX_StoreSignGlow", "#ffd23a", 0.4, "noise", 0.0, emit="#ffd23a", emit_strength=1.4),
    "roof": L.make_mat("EX_RoofGravel", "#6f7076", 0.95, "noise", 0.05),
    "glass": L.make_mat("EX_Glass", "#9fd6ea", 0.1, "noise", 0.02, alpha=0.45),
    "frame": L.make_mat("EX_FrameDark", "#2a2e35", 0.4, "noise", 0.02),
    "metal": L.make_mat("EX_Metal", "#9aa0a8", 0.5, "noise", 0.03),
    "white": L.make_mat("EX_White", "#f4f3ee", 0.7, "noise", 0.02),
    "red": L.make_mat("EX_CartRed", "#d9473a", 0.6, "noise", 0.02),
}
xo = []
xo.append(L.box(coll, "EX_Plinth", 0, 0, 0.0, W + 0.4, D + 0.4, 0.2, E["found"], bevel=0.02, tile=2.0))
xo.append(L.box(coll, "EX_Walls", 0, 0, 0.2, W, D, HB - 0.2, E["blue"], tile=1.5))
xo.append(L.box(coll, "EX_Band", 0, 0, HB - 1.1, W + 0.12, D + 0.12, 0.8, E["yellow"], tile=2.0))
xo.append(L.box(coll, "EX_Roof", 0, 0, HB, W + 0.5, D + 0.5, 0.3, E["roof"], tile=3.0))
# front lettering + logo badge
xo.append(L.text_mesh(coll, "EX_SignText", "COVE HOME", 3.0, hd + 0.06, 4.0, 2.4, 0.12, E["sign"]))
xo.append(L.box(coll, "EX_LogoBadge", -12.3, hd + 0.05, 3.8, 3.0, 0.1, 3.0, E["yellow"], bevel=0.1))
xo.append(L.text_mesh(coll, "EX_LogoText", "CH", -12.3, hd + 0.12, 4.55, 1.5, 0.08, E["blue"]))
# entrance vestibule (glass box with a yellow frame) + canopy
zf = hd + VEST_D
xo.append(L.box(coll, "EX_VestFloor", 0, hd + VEST_D / 2, 0.0, 7.0, VEST_D, 0.22, E["found"]))
xo.append(L.box(coll, "EX_VestFront", 0, zf, 0.2, 6.0, 0.08, 3.4, E["glass"]))
for sx in (-1, 1):
    xo.append(L.box(coll, f"EX_VestSide{sx:+d}", sx * 3.0, hd + VEST_D / 2, 0.2, 0.08, VEST_D, 3.4, E["glass"]))
    xo.append(L.box(coll, f"EX_VestPost{sx:+d}", sx * 3.0, zf, 0.2, 0.25, 0.25, 3.6, E["yellow"]))
xo.append(L.box(coll, "EX_VestTop", 0, hd + VEST_D / 2, 3.6, 6.5, VEST_D + 0.3, 0.3, E["yellow"]))
xo.append(L.box(coll, "EX_Canopy", 0, zf + 1.0, 3.9, 9.0, 2.6, 0.2, E["blue"]))
xo.append(L.box(coll, "EX_DoorGlass", 0, zf + 0.05, 0.2, 2.4, 0.06, 2.6, E["frame"]))
xo.append(L.box(coll, "EX_DoorPane", 0, zf + 0.09, 0.3, 2.2, 0.04, 2.4, E["glass"]))
# glazing either side of the entrance
for sx in (-1, 1):
    cx = sx * 8.0
    xo.append(L.box(coll, f"EX_Window{sx:+d}", cx, hd + 0.04, 0.4, 7.0, 0.06, 2.6, E["glass"]))
    xo.append(L.box(coll, f"EX_WindowFrame{sx:+d}", cx, hd + 0.06, 3.0, 7.2, 0.08, 0.15, E["frame"]))
# cart shelter (east of the door)
xo.append(L.box(coll, "EX_CartRoof", 11.5, hd + 3.0, 2.4, 5.0, 2.4, 0.12, E["yellow"]))
for px in (9.2, 13.8):
    for pz in (hd + 2.0, hd + 4.0):
        xo.append(L.box(coll, f"EX_CartPost{px}{pz}", px, pz, 0.0, 0.1, 0.1, 2.4, E["metal"]))
for i in range(6):
    gx = 9.8 + i * 0.7
    xo.append(L.furn(coll, f"EX_Cart{i}", gx, hd + 3.0, -math.pi / 2, [
        (0, 0, 0.35, 0.55, 0.9, 0.5, E["metal"], 0.02), (0, -0.45, 0.6, 0.55, 0.05, 0.05, E["red"]),
        (0, 0, 0.0, 0.5, 0.8, 0.08, E["frame"])]))
# flags
for i, gx in enumerate((-16.0, -14.6, -13.2)):
    xo.append(L.cyl(coll, f"EX_FlagPole{i}", gx, hd + 6.0, 0.0, 0.06, 7.5, E["white"], seg=6))
    xo.append(L.box(coll, f"EX_Flag{i}", gx + 0.75, hd + 6.0, 5.9, 1.4, 0.03, 1.0, E["yellow"] if i % 2 == 0 else E["blue"]))
bad = L.check_grounded(xo, allow=("EX_Walls", "EX_Band", "EX_Roof", "EX_Sign", "EX_Logo", "EX_Vest", "EX_Canopy", "EX_Door", "EX_Window", "EX_CartRoof", "EX_Flag"))
print("EXTERIOR grounded violations:", bad)
assert not bad, bad
L.export_glb(os.path.join(OUT, "exterior.glb"), xo)
door_local = [0.0, 1.25, round(zf + 1.2, 3)]
L.snapshot(sc, os.path.join(OUT, "preview.png"), (-18, 7, hd + 26), (0, 3.5, 0), lens=28, res=(768, 512))

# ================================================================ RETAIL PARK (world frame)
sc2 = L.new_build_scene("STORE_park")
pc = bpy.data.collections.new("Park")
sc2.collection.children.link(pc)
P = {
    "paving": L.make_mat("TW_PavingWork", "#c9c2b4", 0.9, "tiles", 0.03, accent="#b0a99b"),
    "curb": L.make_mat("TW_CurbWork", "#9a9a9a", 0.8, "noise", 0.03),
    "grass": L.make_mat("TW_GrassWork", "#79b765", 1.0, "noise", 0.06),
    "hedge": L.make_mat("TW_HedgePark", "#3f8a46", 1.0, "noise", 0.08),
    "metal": L.make_mat("TW_MetalWork", "#3a3f47", 0.4, "noise", 0.03),
    "lamp": L.make_mat("TW_LampGlow", "#fff1c4", 0.5, "noise", 0.0, emit="#fff1c4"),
    "blue": L.make_mat("TW_StoreBlue", "#1f5fae", 0.8, "noise", 0.02),
    "sign": L.make_mat("TW_StoreSignGlow", "#ffd23a", 0.4, "noise", 0.0, emit="#ffd23a", emit_strength=1.4),
    "line": L.make_mat("TW_LineWhite", "#f2f2ee", 0.8, "noise", 0.01),
    "leaf": L.make_mat("TW_LeafWork", "#4f9d54", 0.9, "noise", 0.06),
    "trunk": L.make_mat("TW_TrunkWork", "#7a5638", 0.8, "planks", 0.04, accent="#5e4129"),
}
po = []
col = []


def add_col(name, gx, gz, sx, sz, h):
    col.append({"name": name, "cx": round(gx, 3), "cz": round(gz, 3), "hx": round(sx / 2, 3), "hz": round(sz / 2, 3), "hy": round(h / 2, 3), "cy": round(h / 2, 3), "yaw": 0.0})


po.append(L.box(pc, "SP_Grass", 52.0, 61.0, 0.0, 46.0, 28.0, 0.02, P["grass"], tile=2.0))
po.append(L.box(pc, "SP_Plaza", 51.9, 52.0, 0.0, 45.2, 8.0, 0.04, P["paving"], tile=2.0))
po.append(L.box(pc, "SP_CurbN", 51.9, 48.0, 0.0, 45.2, 0.3, 0.1, P["curb"]))
po.append(L.box(pc, "SP_CurbE", 74.4, 52.0, 0.0, 0.3, 8.0, 0.1, P["curb"]))
# parking-style bay lines on the plaza (pure decoration)
for i, gx in enumerate(range(40, 72, 3)):
    if 46 <= gx <= 58:
        continue  # keep the entrance clear
    po.append(L.box(pc, f"SP_Bay{i:02d}", gx, 51.0, 0.04, 0.12, 4.0, 0.005, P["line"]))


def hedge(name, x0, z0, x1, z1):
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
    sx, sz = max(abs(x1 - x0), 0.9), max(abs(z1 - z0), 0.9)
    po.append(L.box(pc, name, cx, cz, 0.0, sx, sz, 1.6, P["hedge"], bevel=0.15, tile=1.5))
    add_col("COL_Store_" + name, cx, cz, sx, sz, 1.6)


hedge("SP_HedgeWest", 30.6, 33.8, 30.6, 47.7)
hedge("SP_HedgeNorth", 30.6, 47.7, 74.9, 47.7)
hedge("SP_HedgeEast", 74.9, 47.7, 74.9, 74.0)

# lamps + trees along the plaza
for i, gx in enumerate((37.0, 46.0, 58.0, 67.0)):
    po.append(L.cyl(pc, f"SP_Lamp{i}_Pole", gx, 49.0, 0.0, 0.07, 3.2, P["metal"], seg=6))
    po.append(L.box(pc, f"SP_Lamp{i}_Head", gx, 49.0, 3.2, 0.5, 0.5, 0.3, P["lamp"], bevel=0.03))
    add_col(f"COL_Store_Lamp{i}", gx, 49.0, 0.3, 0.3, 3.4)
for i, gx in enumerate((72.0,)):
    po.append(L.cyl(pc, f"SP_TreeTrunk{i}", gx, 50.5, 0.0, 0.22, 1.6, P["trunk"], seg=6))
    po.append(L.cone(pc, f"SP_TreeA{i}", gx, 50.5, 1.4, 1.5, 0.3, 2.2, P["leaf"], seg=7))
    add_col(f"COL_Store_Tree{i}", gx, 50.5, 0.6, 0.6, 3.0)

# pylon sign, visible from the district
po.append(L.box(pc, "SP_PylonPost", 33.5, 50.6, 0.0, 0.8, 0.8, 7.0, P["blue"]))
po.append(L.box(pc, "SP_PylonBoard", 33.5, 50.6, 7.0, 5.2, 0.6, 2.0, P["blue"], bevel=0.05))
for facing, dz in (("+z", 0.31), ("-z", -0.31)):
    po.append(L.text_mesh(pc, f"SP_PylonText{facing}", "COVE HOME", 33.5, 50.6 + dz, 7.45, 0.95, 0.05, P["sign"], facing=facing))
add_col("COL_Store_Pylon", 33.5, 50.6, 1.0, 1.0, 9.0)
# wayfinding sign on the district plaza, read by players coming through the hedge gate (they walk towards +Z)
po.append(L.box(pc, "SP_WayPostL", 11.4, 49.2, 0.0, 0.12, 0.12, 2.4, P["metal"]))
po.append(L.box(pc, "SP_WayPostR", 13.6, 49.2, 0.0, 0.12, 0.12, 2.4, P["metal"]))
po.append(L.box(pc, "SP_WayBoard", 12.5, 49.2, 1.6, 2.6, 0.1, 0.7, P["blue"]))
po.append(L.text_mesh(pc, "SP_WayText", "<  COVE HOME", 12.5, 49.14, 1.75, 0.34, 0.03, P["sign"], facing="-z"))
add_col("COL_Store_WaySign", 12.5, 49.2, 2.6, 0.3, 2.4)

bad = L.check_grounded(po, allow=("SP_Grass", "SP_Plaza", "SP_Curb", "SP_Bay", "SP_Lamp", "SP_Tree", "SP_Pylon", "SP_Way", "SP_Hedge"))
print("PARK grounded violations:", bad)
assert not bad, bad

# store body collision (rotation pi keeps it axis aligned) + vestibule
sx, sz = STORE_POS
add_col("COL_Store_Body", sx, sz, W + 0.4, D + 0.4, HB)
add_col("COL_Store_Vestibule", sx, sz - hd - VEST_D / 2, 6.4, VEST_D, 3.8)
add_col("COL_Store_CartShelter", sx - 11.5, sz - hd - 3.0, 5.0, 2.4, 2.4)
add_col("COL_Store_Flags", sx + 14.6, sz - hd - 6.0, 3.2, 0.4, 7.5)

L.export_glb(os.path.join(OUT_PARK, "park.glb"), po)
L.write_json(os.path.join(OUT_PARK, "park.layout.json"), {
    "version": 1,
    "bounds": {"maxX": 75.5},
    "store": {
        "key": KEY, "name": "Cove Home",
        "position": [sx, 0.0, sz], "rotationY": math.pi,
        # local +Z -> world -Z
        "door": [round(sx - door_local[0], 3), door_local[1], round(sz - door_local[2], 3)],
        "footprint": [W, D],
    },
    "collision": col,
})
print("park objects:", len(po), "collision boxes:", len(col), "door:", sz - door_local[2])
result = {"ext": len(xo), "park": len(po), "cols": len(col), "door": [sx, sz - door_local[2]]}
