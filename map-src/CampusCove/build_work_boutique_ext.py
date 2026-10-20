"""Boutique exterior: single-storey shop 16 x 12 m, striped awning, big shop windows. Origin = ground center, door on +Z.
Executed from build_work_boutique.py (shares `L`, `bpy`, `OUT`, `KEY`)."""
import math
import os

W, D = 16.0, 12.0
hw, hd = W / 2, D / 2
sc_ext = L.new_build_scene("WORK_" + KEY + "_exterior")
coll_e = bpy.data.collections.new("Exterior")
sc_ext.collection.children.link(coll_e)
cols_e = L.Collisions(coll_e)
E = {
    "found": L.make_mat("EX_Foundation", "#8d8f94", 0.9, "noise", 0.03),
    "wall": L.make_mat("EX_BoutiqueWall", "#f3e3cf", 0.85, "noise", 0.03),
    "brick": L.make_mat("EX_BrickBase", "#b5654c", 0.85, "tiles", 0.05, accent="#9a5240"),
    "coral": L.make_mat("EX_AccentCoral", "#e0675a", 0.7, "noise", 0.03),
    "stripe": L.make_mat("EX_AwningStripe", "#e0675a", 0.85, "stripes", 0.02, accent="#f6efe6"),
    "glass": L.make_mat("EX_Glass", "#9fd6ea", 0.1, "noise", 0.02, alpha=0.45),
    "frame": L.make_mat("EX_FrameDark", "#2a2e35", 0.4, "noise", 0.02),
    "roof": L.make_mat("EX_RoofSlate", "#5b4f58", 0.9, "tiles", 0.04, accent="#4a3f48"),
    "sign": L.make_mat("EX_SignGold", "#f2c14e", 0.4, "noise", 0.0, emit="#f2c14e"),
    "door": L.make_mat("EX_DoorGlass", "#5b7f94", 0.2, "noise", 0.02, alpha=0.55),
    "step": L.make_mat("EX_Paving", "#b8b2a6", 0.9, "tiles", 0.03, accent="#a49e92"),
    "metal": L.make_mat("EX_Metal", "#9aa0a8", 0.5, "noise", 0.03),
    "pot": L.make_mat("EX_Terracotta", "#b9633f", 0.8, "noise", 0.04),
    "leaf": L.make_mat("EX_Leaf", "#4f9d54", 0.9, "noise", 0.06),
    "box": L.make_mat("EX_GiftBox", "#4aa3df", 0.7, "noise", 0.05),
}
xo = []
xo.append(L.box(coll_e, "EX_Plinth", 0, 0, 0.0, W + 0.4, D + 0.4, 0.2, E["found"], bevel=0.02, tile=2.0))
xo.append(L.box(coll_e, "EX_Walls", 0, 0, 0.2, W, D, 3.8, E["wall"], tile=2.0))
xo.append(L.box(coll_e, "EX_BrickBase", 0, 0, 0.2, W + 0.1, D + 0.1, 0.8, E["brick"], tile=1.0))
# flat roof with a small gable-like front sign wall
xo.append(L.box(coll_e, "EX_RoofSlab", 0, 0, 4.0, W + 0.6, D + 0.6, 0.25, E["roof"], tile=2.0))
xo.append(L.box(coll_e, "EX_SignWall", 0, hd - 0.1, 4.25, W - 3.0, 0.5, 1.5, E["wall"]))
xo.append(L.box(coll_e, "EX_SignTrim", 0, hd + 0.2, 4.2, W - 2.8, 0.3, 0.12, E["coral"]))
xo.append(L.text_mesh(coll_e, "EX_SignText", "BOUTIQUE", 0, hd + 0.2, 4.55, 0.75, 0.05, E["sign"]))
# shop front: two big windows, door
zf = hd + 0.03
for side, (x0, x1) in (("L", (-7.4, -1.6)), ("R", (1.6, 7.4))):
    cx = (x0 + x1) / 2
    xo.append(L.box(coll_e, f"EX_Shopwindow{side}", cx, zf, 1.0, x1 - x0, 0.06, 2.1, E["glass"]))
    for i in range(3):
        xo.append(L.box(coll_e, f"EX_Mullion{side}{i}", x0 + i * (x1 - x0) / 2, zf + 0.02, 0.95, 0.1, 0.08, 2.2, E["frame"]))
    xo.append(L.box(coll_e, f"EX_WinTop{side}", cx, zf + 0.02, 3.05, x1 - x0, 0.08, 0.1, E["frame"]))
    xo.append(L.box(coll_e, f"EX_WinSill{side}", cx, zf + 0.12, 0.95, x1 - x0 + 0.2, 0.28, 0.08, E["found"]))
    # display in window
    for k in range(3):
        xo.append(L.box(coll_e, f"EX_Display{side}{k}", x0 + 1.2 + k * 1.6, zf - 0.5, 1.03, 0.6, 0.6, 0.35 + 0.15 * k, E["box"], bevel=0.02))
xo.append(L.box(coll_e, "EX_DoorGlass", 0, zf, 0.2, 2.0, 0.06, 2.6, E["door"]))
for i, x in enumerate((-1.0, 0.0, 1.0)):
    xo.append(L.box(coll_e, f"EX_DoorFrame{i}", x, zf + 0.02, 0.2, 0.1, 0.1, 2.7, E["frame"]))
# striped awning (sloped as 2 stacked slabs) + posts
xo.append(L.box(coll_e, "EX_Awning", 0, hd + 1.2, 3.1, 15.0, 2.4, 0.12, E["stripe"], tile=1.0))
xo.append(L.box(coll_e, "EX_AwningFront", 0, hd + 2.4, 2.85, 15.0, 0.1, 0.3, E["stripe"], tile=1.0))
for sx in (-7.2, 0.0, 7.2):
    xo.append(L.box(coll_e, f"EX_AwningPost{int(sx)}", sx, hd + 2.3, 0.0, 0.1, 0.1, 2.9, E["metal"]))
xo.append(L.box(coll_e, "EX_Step", 0, hd + 1.1, 0.0, 16.4, 2.0, 0.1, E["step"], tile=2.0))
for sx in (-3.6, 3.6):
    xo.append(L.cyl(coll_e, f"EX_PlantPot{'L' if sx < 0 else 'R'}", sx, hd + 1.7, 0.1, 0.35, 0.5, E["pot"], seg=8))
    xo.append(L.cone(coll_e, f"EX_PlantLeaf{'L' if sx < 0 else 'R'}", sx, hd + 1.7, 0.6, 0.5, 0.05, 1.0, E["leaf"], seg=7))
for side, sx in (("W", -hw - 0.03), ("E", hw + 0.03)):
    xo.append(L.box(coll_e, f"EX_SideWin{side}", sx, 0, 1.3, 0.06, 6.0, 1.5, E["glass"]))
cols_e.add("Boutique_Body", 0, 0, 0.0, W + 0.4, D + 0.4, 4.3)
bad = L.check_grounded(xo, allow=("EX_Walls", "EX_BrickBase", "EX_Roof", "EX_Sign", "EX_Shopwindow", "EX_Mullion", "EX_WinTop", "EX_WinSill", "EX_Display", "EX_Door", "EX_Awning", "EX_SideWin", "EX_Plant"))
print("EXTERIOR grounded violations:", bad)
assert not bad, bad
L.export_glb(os.path.join(OUT, "exterior.glb"), xo)
L.export_glb(os.path.join(OUT, "exterior.colsrc.glb"), xo + cols_e.items)
L.write_json(os.path.join(OUT, "exterior.layout.json"), {
    "version": 1, "key": KEY, "name": "Boutique", "footprint": [W, D], "doorLocal": [0.0, 1.25, hd + 2.8],
    "collision": [{"cx": 0.0, "cz": 0.0, "hx": W / 2 + 0.2, "hz": D / 2 + 0.2, "hy": 2.2}],
})
print("exterior:", len(xo), "objects")
