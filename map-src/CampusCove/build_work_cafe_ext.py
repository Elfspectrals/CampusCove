"""Campus Cafe exterior: 16 x 13 m, pitched terracotta roof, green awning, terrace with parasols. Door on +Z, origin = ground center.
Executed from build_work_cafe.py (shares L, bpy, OUT, KEY)."""
import math
import os

W, D = 16.0, 13.0
hw, hd = W / 2, D / 2
sc_ext = L.new_build_scene("WORK_" + KEY + "_exterior")
coll_e = bpy.data.collections.new("Exterior")
sc_ext.collection.children.link(coll_e)
cols_e = L.Collisions(coll_e)
E = {
    "found": L.make_mat("EX_Foundation", "#8d8f94", 0.9, "noise", 0.03),
    "wall": L.make_mat("EX_CafeWall", "#f4e4c8", 0.85, "noise", 0.03),
    "stone": L.make_mat("EX_StoneBase", "#a8a194", 0.9, "tiles", 0.05, accent="#8f897c"),
    "roof": L.make_mat("EX_RoofTerracotta", "#b8573a", 0.85, "tiles", 0.05, accent="#9d4630"),
    "green": L.make_mat("EX_AccentGreen", "#4f9d6b", 0.7, "noise", 0.03),
    "awning": L.make_mat("EX_AwningGreen", "#4f9d6b", 0.85, "stripes", 0.02, accent="#f6efe6"),
    "glass": L.make_mat("EX_Glass", "#9fd6ea", 0.1, "noise", 0.02, alpha=0.45),
    "frame": L.make_mat("EX_FrameWood", "#5e4129", 0.5, "planks", 0.03, accent="#4a3320"),
    "door": L.make_mat("EX_DoorWood", "#7a5638", 0.45, "planks", 0.03, accent="#5e4129"),
    "sign": L.make_mat("EX_SignCream", "#fff1c9", 0.4, "noise", 0.0, emit="#fff1c9"),
    "signbg": L.make_mat("EX_SignBoard", "#2b3a33", 0.7, "noise", 0.02),
    "step": L.make_mat("EX_Paving", "#b8b2a6", 0.9, "tiles", 0.03, accent="#a49e92"),
    "metal": L.make_mat("EX_Metal", "#6f757d", 0.5, "noise", 0.03),
    "brick": L.make_mat("EX_Chimney", "#a85a45", 0.8, "tiles", 0.05, accent="#8f4a38"),
    "pot": L.make_mat("EX_Terracotta", "#b9633f", 0.8, "noise", 0.04),
    "leaf": L.make_mat("EX_Leaf", "#4f9d54", 0.9, "noise", 0.06),
    "cloth": L.make_mat("EX_Tablecloth", "#f7f3ea", 0.95, "checker", 0.02, accent="#d94f4f"),
    "red": L.make_mat("EX_ParasolRed", "#d94f4f", 0.9, "stripes", 0.02, accent="#f7f3ea"),
}
xo = []
xo.append(L.box(coll_e, "EX_Plinth", 0, 0, 0.0, W + 0.4, D + 0.4, 0.2, E["found"], bevel=0.02, tile=2.0))
xo.append(L.box(coll_e, "EX_Walls", 0, 0, 0.2, W, D, 4.2, E["wall"], tile=2.0))
xo.append(L.box(coll_e, "EX_StoneBase", 0, 0, 0.2, W + 0.12, D + 0.12, 0.9, E["stone"], tile=1.0))
xo.append(L.gable_roof(coll_e, "EX_Roof", 0, 0, 4.4, W + 1.2, D + 1.2, 3.0, E["roof"], ridge_axis="x"))
xo.append(L.box(coll_e, "EX_RoofEave", 0, 0, 4.3, W + 1.2, D + 1.2, 0.12, E["frame"], tile=2.0))
xo.append(L.box(coll_e, "EX_Chimney", 5.0, -2.5, 4.8, 1.1, 1.1, 3.4, E["brick"], bevel=0.03, tile=0.5))
xo.append(L.box(coll_e, "EX_ChimneyCap", 5.0, -2.5, 8.2, 1.3, 1.3, 0.15, E["found"]))
zf = hd + 0.03
for side, (x0, x1) in (("L", (-7.4, -1.8)), ("R", (1.8, 7.4))):
    cx = (x0 + x1) / 2
    xo.append(L.box(coll_e, f"EX_Window{side}", cx, zf, 1.1, x1 - x0, 0.06, 1.9, E["glass"]))
    for i in range(3):
        xo.append(L.box(coll_e, f"EX_Mullion{side}{i}", x0 + i * (x1 - x0) / 2, zf + 0.02, 1.05, 0.1, 0.08, 2.0, E["frame"]))
    xo.append(L.box(coll_e, f"EX_WinTop{side}", cx, zf + 0.02, 3.0, x1 - x0, 0.08, 0.1, E["frame"]))
    xo.append(L.box(coll_e, f"EX_WinSill{side}", cx, zf + 0.12, 1.05, x1 - x0 + 0.2, 0.28, 0.08, E["found"]))
    xo.append(L.box(coll_e, f"EX_WinBox{side}", cx, zf + 0.25, 0.75, x1 - x0 - 0.4, 0.3, 0.3, E["frame"]))
xo.append(L.box(coll_e, "EX_Door", 0, zf, 0.2, 1.6, 0.08, 2.5, E["door"], bevel=0.02))
xo.append(L.box(coll_e, "EX_DoorGlass", 0, zf + 0.05, 1.3, 1.0, 0.04, 1.2, E["glass"]))
for i, x in enumerate((-0.9, 0.9)):
    xo.append(L.box(coll_e, f"EX_DoorFrame{i}", x, zf + 0.02, 0.2, 0.12, 0.12, 2.6, E["frame"]))
# awning + hanging sign
xo.append(L.box(coll_e, "EX_Awning", 0, hd + 0.9, 3.0, 13.2, 1.8, 0.1, E["awning"], tile=1.0))
xo.append(L.box(coll_e, "EX_AwningFront", 0, hd + 1.8, 2.78, 13.2, 0.1, 0.28, E["awning"], tile=1.0))
xo.append(L.box(coll_e, "EX_SignBoard", 0, hd + 0.45, 3.4, 5.2, 0.12, 0.8, E["signbg"]))
xo.append(L.text_mesh(coll_e, "EX_SignText", "CAMPUS CAFE", 0, hd + 0.54, 3.5, 0.5, 0.04, E["sign"]))
xo.append(L.box(coll_e, "EX_Step", 0, hd + 1.2, 0.0, 14.0, 2.2, 0.1, E["step"], tile=2.0))
# terrace: 3 tables + chairs + parasols
for i, tx in enumerate((-6.0, -3.2, 3.2, 6.0)):
    z = hd + 3.1
    xo.append(L.cyl(coll_e, f"EX_TerraceTable{i}", tx, z, 0.0, 0.5, 0.75, E["cloth"], seg=8))
    xo.append(L.cyl(coll_e, f"EX_ParasolPole{i}", tx, z, 0.0, 0.04, 2.3, E["metal"], seg=6))
    xo.append(L.cone(coll_e, f"EX_Parasol{i}", tx, z, 2.1, 1.5, 0.05, 0.45, E["red"], seg=8))
    for k, dx in enumerate((-0.85, 0.85)):
        xo.append(L.box(coll_e, f"EX_TerraceChair{i}{k}", tx + dx, z, 0.0, 0.45, 0.45, 0.85, E["frame"], bevel=0.02))
for sx in (-6.6, 6.6):
    xo.append(L.cyl(coll_e, f"EX_PlantPot{'L' if sx < 0 else 'R'}", sx, hd + 1.0, 0.1, 0.35, 0.5, E["pot"], seg=8))
    xo.append(L.cone(coll_e, f"EX_PlantLeaf{'L' if sx < 0 else 'R'}", sx, hd + 1.0, 0.6, 0.5, 0.05, 1.0, E["leaf"], seg=7))
for side, sx in (("W", -hw - 0.03), ("E", hw + 0.03)):
    xo.append(L.box(coll_e, f"EX_SideWin{side}", sx, 0.5, 1.3, 0.06, 5.0, 1.6, E["glass"]))
cols_e.add("Cafe_Body", 0, 0, 0.0, W + 0.4, D + 0.4, 4.2)
bad = L.check_grounded(xo, allow=("EX_Walls", "EX_StoneBase", "EX_Roof", "EX_Chimney", "EX_Window", "EX_Mullion", "EX_WinTop", "EX_WinSill", "EX_WinBox", "EX_Door", "EX_Awning", "EX_Sign", "EX_SideWin", "EX_Parasol", "EX_Plant"))
print("EXTERIOR grounded violations:", bad)
assert not bad, bad
L.export_glb(os.path.join(OUT, "exterior.glb"), xo)
L.export_glb(os.path.join(OUT, "exterior.colsrc.glb"), xo + cols_e.items)
L.write_json(os.path.join(OUT, "exterior.layout.json"), {
    "version": 1, "key": KEY, "name": "Campus Cafe", "footprint": [W, D], "doorLocal": [0.0, 1.25, hd + 4.4],
    "collision": [{"cx": 0.0, "cz": 0.0, "hx": W / 2 + 0.2, "hz": D / 2 + 0.2, "hy": 2.2}],
})
print("exterior:", len(xo), "objects")
