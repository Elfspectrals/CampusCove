import os

W = 21.0
hd = 6.5
SHELL_H = 3.6
ROOF_H = 3.0
INTERIOR_BACK_OUTER_Z = -15.2
WIN_Y = (1.0, 2.2)
FRONT_WIN = ((-7.0, -3.0), (3.0, 7.0))
WEST_WIN = ((-2.0, 0.0), (2.0, 4.0))
EAST_WIN = ((2.0, 4.0),)
sc_ext = L.new_build_scene("WORK_" + KEY + "_exterior")
coll_e = bpy.data.collections.new("Exterior")
sc_ext.collection.children.link(coll_e)
cols_e = L.Collisions(coll_e)
E = {
    "found": L.make_mat("EX_Foundation", "#8d8f94", 0.9, "noise", 0.03),
    "stone": L.make_mat("EX_pub_Stone", "#a39d91", 0.95, "tiles", 0.07, accent="#7d776d"),
    "slate": L.make_mat("EX_pub_Slate", "#4a4f57", 0.9, "tiles", 0.05, accent="#3a3e45"),
    "green": L.make_mat("EX_pub_Green", "#2f6b4a", 0.55, "noise", 0.03),
    "greendark": L.make_mat("EX_pub_GreenDark", "#1f4a33", 0.6, "noise", 0.03),
    "gold": L.make_mat("EX_pub_Gold", "#e3b84a", 0.3, "noise", 0.02, emit="#e3b84a", emit_strength=0.5),
    "glass": L.make_mat("EX_Glass", "#9fd6ea", 0.1, "noise", 0.02, alpha=0.45),
    "warmglass": L.make_mat("EX_pub_WarmGlass", "#ffd79a", 0.2, "noise", 0.02, alpha=0.6, emit="#ffb862", emit_strength=0.8),
    "lantern": L.make_mat("EX_pub_Lantern", "#fff1c4", 0.5, "noise", 0.0, emit="#ffd27a", emit_strength=1.4),
    "iron": L.make_mat("EX_pub_Iron", "#2a2d33", 0.6, "noise", 0.03),
    "oak": L.make_mat("EX_pub_Oak", "#a97a4a", 0.7, "planks", 0.05, accent="#7c5631"),
    "pewter": L.make_mat("EX_pub_Pewter", "#8c9196", 0.4, "noise", 0.03),
    "step": L.make_mat("EX_pub_Flagstone", "#6f6a62", 0.9, "tiles", 0.06, accent="#55514b"),
    "leaf": L.make_mat("EX_pub_Leaf", "#4f9d54", 0.9, "noise", 0.06),
    "flower": L.make_mat("EX_pub_Flowers", "#f2a7b8", 0.9, "noise", 0.08),
    "flower2": L.make_mat("EX_pub_FlowersYellow", "#f6d04d", 0.9, "noise", 0.08),
    "shamrock": L.make_mat("EX_pub_Shamrock", "#3fae5a", 0.6, "noise", 0.04, emit="#3fae5a", emit_strength=0.4),
}
xo = []
shell, interior_offset, zb = L.walk_in_shell(coll_e, cols_e, W, hd, SHELL_H, E["stone"], E["glass"],
                                             [(a, b_, *WIN_Y) for a, b_ in FRONT_WIN], [(a, b_, *WIN_Y) for a, b_ in WEST_WIN], [(a, b_, *WIN_Y) for a, b_ in EAST_WIN],
                                             interior_back=INTERIOR_BACK_OUTER_Z)
xo += shell
DN = hd - zb
zc = (hd + zb) / 2
oz = interior_offset[2]
hw = W / 2
fy = L.INTERIOR_FLOOR_Y
win_lo, win_hi = WIN_Y[0] + fy, WIN_Y[1] + fy
xo.append(L.box(coll_e, "EX_Plinth", 0, zc, 0.0, W + 0.4, DN + 0.4, 0.19, E["found"], bevel=0.02, tile=2.0))
xo.append(L.gable_roof(coll_e, "EX_Roof", 0, zc, SHELL_H, W - 0.36, DN + 0.8, ROOF_H, E["slate"], ridge_axis="x"))
for side, gx in (("W", -hw + 0.175), ("E", hw - 0.175)):
    xo.append(L.gable_roof(coll_e, f"EX_Gable{side}", gx, zc, SHELL_H, 0.35, DN + 0.6, ROOF_H, E["stone"], ridge_axis="x"))
xo.append(L.box(coll_e, "EX_Ridge", 0, zc, SHELL_H + ROOF_H - 0.05, W - 0.3, 0.3, 0.16, E["slate"]))
chimney_z = FIRE_Z + oz
xo.append(L.box(coll_e, "EX_Chimney", -hw + 0.45, chimney_z, SHELL_H, 0.9, 1.4, ROOF_H + 1.2, E["stone"], tile=1.0))
for k, dz in enumerate((-0.35, 0.35)):
    xo.append(L.cyl(coll_e, f"EX_ChimneyPot{k}", -hw + 0.45, chimney_z + dz, SHELL_H + ROOF_H + 1.2, 0.14, 0.4, E["step"], seg=7))
xo.append(L.box(coll_e, "EX_Fascia", 0, hd + 0.08, 2.9, W - 1.0, 0.14, 0.62, E["greendark"], bevel=0.02))
xo.append(L.box(coll_e, "EX_FasciaTrim", 0, hd + 0.1, 3.48, W - 0.9, 0.16, 0.08, E["gold"]))
xo.append(low_text(coll_e, "EX_SignText", NAME.upper(), 0, hd + 0.17, 3.02, 0.38, 0.0, E["gold"]))
xo.append(L.box(coll_e, "EX_FasciaBack", 0, zb - 0.08, 2.9, W - 1.0, 0.14, 0.62, E["greendark"], bevel=0.02))
for side, x0, x1 in (("L", *FRONT_WIN[0]), ("R", *FRONT_WIN[1])):
    cx = (x0 + x1) / 2
    xo.append(L.box(coll_e, f"EX_WinSill{side}", cx, hd + 0.1, win_lo - 0.1, x1 - x0 + 0.3, 0.3, 0.1, E["green"]))
    xo.append(L.box(coll_e, f"EX_WinTop{side}", cx, hd + 0.04, win_hi, x1 - x0 + 0.3, 0.14, 0.12, E["green"]))
    xo.append(L.box(coll_e, f"EX_WinMullion{side}", cx, hd + 0.02, win_lo, 0.1, 0.1, win_hi - win_lo, E["green"]))
    xo.append(L.box(coll_e, f"EX_WinBar{side}", cx, hd + 0.02, (win_lo + win_hi) / 2, x1 - x0, 0.08, 0.08, E["green"]))
    for k, bx in enumerate((x0 + 0.5, x1 - 0.5)):
        xo.append(L.box(coll_e, f"EX_WinBox{side}{k}", bx, hd + 0.25, win_lo - 0.1, 0.8, 0.3, 0.22, E["greendark"]))
        xo.append(L.box(coll_e, f"EX_WinFlowers{side}{k}", bx, hd + 0.25, win_lo + 0.1, 0.7, 0.26, 0.14, (E["flower"], E["flower2"])[k], bevel=0.04))
for side, xw, wins in (("W", -hw + 0.1, WEST_WIN), ("E", hw - 0.1, EAST_WIN)):
    for k, (z0, z1) in enumerate(wins):
        cz = (z0 + z1) / 2 + oz
        xo.append(L.box(coll_e, f"EX_SideSill{side}{k}", xw, cz, win_lo - 0.1, 0.3, z1 - z0 + 0.3, 0.1, E["green"]))
        xo.append(L.box(coll_e, f"EX_SideTop{side}{k}", xw, cz, win_hi, 0.14, z1 - z0 + 0.3, 0.12, E["green"]))
        xo.append(L.box(coll_e, f"EX_SideMullion{side}{k}", xw, cz, win_lo, 0.1, 0.1, win_hi - win_lo, E["green"]))
xo.append(L.hinged_door(coll_e, [
    (0, 0.0, 1.18, 0.06, 2.18, E["green"], 0.02),
    (0, 1.35, 0.5, 0.08, 0.5, E["warmglass"], 0.0),
    (0.45, 0.95, 0.05, 0.14, 0.05, E["gold"], 0.0),
    (0, 0.3, 0.9, 0.08, 0.5, E["greendark"], 0.01),
], -0.59, hd - 0.1, fy))
for i, x in enumerate((-0.66, 0.66)):
    xo.append(L.box(coll_e, f"EX_DoorFrame{i}", x, hd + 0.02, fy, 0.12, 0.12, 2.3, E["greendark"]))
xo.append(L.box(coll_e, "EX_DoorHeader", 0, hd + 0.02, fy + 2.3, 1.44, 0.12, 0.14, E["greendark"]))
xo.append(L.box(coll_e, "EX_DoorCanopy", 0, hd + 0.5, fy + 2.5, 2.4, 1.0, 0.1, E["slate"], bevel=0.02))
for i, x in enumerate((-1.3, 1.3)):
    xo.append(L.box(coll_e, f"EX_LanternArm{i}", x, hd + 0.15, 2.35, 0.06, 0.3, 0.06, E["iron"]))
    xo.append(L.box(coll_e, f"EX_Lantern{i}", x, hd + 0.3, 2.0, 0.22, 0.22, 0.34, E["lantern"], bevel=0.02))
    xo.append(L.box(coll_e, f"EX_LanternCap{i}", x, hd + 0.3, 2.34, 0.28, 0.28, 0.06, E["iron"], bevel=0.02))
xo.append(L.box(coll_e, "EX_Step", 0, hd + 0.5, 0.0, 2.6, 1.0, fy, E["step"], tile=1.0))
xo.append(L.box(coll_e, "EX_Apron", 0, hd + 1.6, 0.0, 8.0, 2.2, 0.03, E["step"], tile=1.5))
sign_x = 3.2
xo.append(L.box(coll_e, "EX_SignBracket", sign_x, hd + 0.45, 3.35, 0.06, 0.9, 0.06, E["iron"]))
xo.append(L.box(coll_e, "EX_SignBracketBrace", sign_x, hd + 0.3, 3.05, 0.06, 0.6, 0.06, E["iron"], rot=0.0))
xo.append(L.box(coll_e, "EX_SignBoard", sign_x, hd + 0.75, 2.4, 0.06, 0.9, 0.85, E["greendark"], bevel=0.02))
xo.append(L.box(coll_e, "EX_SignBoardTrim", sign_x, hd + 0.75, 2.4, 0.08, 0.96, 0.06, E["gold"]))
xo.append(L.box(coll_e, "EX_SignBoardTrimTop", sign_x, hd + 0.75, 3.19, 0.08, 0.96, 0.06, E["gold"]))
for k, (dz, dy) in enumerate(((-0.17, 0.0), (0.17, 0.0), (0.0, 0.2))):
    leaf = L.cyl(coll_e, f"EX_SignLeaf{k}", sign_x, hd + 0.75 + dz, 2.75 + dy, 0.17, 0.1, E["shamrock"], seg=10)
    leaf.rotation_euler = (0, math.pi / 2, 0)
    leaf.location = L.b(sign_x - 0.05, hd + 0.75 + dz, 2.75 + dy)
    xo.append(leaf)
xo.append(L.box(coll_e, "EX_SignStem", sign_x, hd + 0.72, 2.5, 0.1, 0.06, 0.28, E["shamrock"], rot=0.3))
for i, bx in enumerate((-4.6, 4.6)):
    xo.append(L.furn(coll_e, f"EX_Bench{i}", bx, hd + 0.5, 0.0, [
        (-0.7, 0, 0.0, 0.08, 0.4, 0.42, E["iron"]), (0.7, 0, 0.0, 0.08, 0.4, 0.42, E["iron"]),
        (0, 0, 0.42, 1.7, 0.45, 0.06, E["oak"]), (0, 0.2, 0.48, 1.7, 0.06, 0.4, E["oak"])]))
    cols_e.add(f"Bench{i}", bx, hd + 0.5, 0.0, 1.7, 0.5, 0.9)
for i, bx in enumerate((-2.2, 2.2)):
    gz = hd + 0.55
    xo.append(L.cyl(coll_e, f"EX_Barrel{i}", bx, gz, 0.0, 0.32, 0.85, E["oak"], seg=10))
    for k, y in enumerate((0.12, 0.7)):
        xo.append(L.cyl(coll_e, f"EX_BarrelHoop{i}{k}", bx, gz, y, 0.332, 0.06, E["pewter"], seg=10))
    xo.append(L.box(coll_e, f"EX_BarrelLeaf{i}", bx, gz, 0.85, 0.6, 0.6, 0.22, E["leaf"], bevel=0.08))
    xo.append(L.box(coll_e, f"EX_BarrelFlower{i}", bx, gz, 1.05, 0.46, 0.46, 0.12, (E["flower2"], E["flower"])[i], bevel=0.04))
    cols_e.add(f"Barrel{i}", bx, gz, 0.0, 0.7, 0.7, 1.1)
xo.append(L.box(coll_e, "EX_Blackboard", 1.9, hd + 1.7, 0.0, 0.7, 0.5, 1.0, E["iron"], rot=-0.4))
xo.append(L.box(coll_e, "EX_BlackboardFace", 1.9, hd + 1.7, 0.1, 0.6, 0.54, 0.8, E["greendark"], rot=-0.4))
cols_e.add("Blackboard", 1.9, hd + 1.7, 0.0, 0.7, 0.6, 1.0, rot=-0.4)
bad = L.check_grounded(xo, allow=("EX_Shell", "EX_Roof", "EX_Gable", "EX_Ridge", "EX_Chimney", "EX_Fascia", "EX_Sign", "EX_Win", "EX_Side", "Door", "EX_Door",
                                  "EX_Lantern", "EX_BarrelLeaf", "EX_BarrelFlower", "EX_BarrelHoop", "EX_BlackboardFace"))
print("EXTERIOR grounded violations:", bad)
assert not bad, bad
L.export_glb(os.path.join(OUT, "exterior.glb"), xo)
L.export_glb(os.path.join(OUT, "exterior.colsrc.glb"), xo + cols_e.items)
L.write_json(os.path.join(OUT, "exterior.layout.json"), {
    "version": 1, "key": KEY, "name": NAME, "footprint": [W, DN], "footprintCenterZ": zc, "doorLocal": [0.0, 1.25, hd],
    "interiorOffset": [round(c, 4) for c in interior_offset],
    "collision": [{"cx": 0.0, "cz": zc, "hx": W / 2 + 0.2, "hz": DN / 2 + 0.2, "hy": 2.2}],
})
L.snapshot(sc_ext, os.path.join(OUT, "preview.png"), (-18, 7, hd + 20), (0, 3.0, 0), lens=28, res=(768, 512))
heavy_e = sorted(((triangles([o]), o.name) for o in xo if o.type == "MESH"), reverse=True)[:6]
print("exterior:", len(xo), "objects,", triangles(xo), "triangles, interiorOffset", interior_offset, "depth", DN, "heaviest:", heavy_e)
