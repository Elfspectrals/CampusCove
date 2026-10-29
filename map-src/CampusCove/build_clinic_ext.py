import os

W, D = 16.0, 13.0
hw, hd = W / 2, D / 2
sc_ext = L.new_build_scene("WORK_" + KEY + "_exterior")
coll_e = bpy.data.collections.new("Exterior")
sc_ext.collection.children.link(coll_e)
cols_e = L.Collisions(coll_e)
E = {
    "found": L.make_mat("EX_Foundation", "#8d8f94", 0.9, "noise", 0.03),
    "wall": L.make_mat("EX_ClinicWall", "#f3f5f2", 0.85, "noise", 0.02),
    "mint": L.make_mat("EX_ClinicMint", "#7cc6b4", 0.8, "noise", 0.03),
    "roof": L.make_mat("EX_ClinicRoof", "#9aa3a8", 0.9, "tiles", 0.04, accent="#8a9398"),
    "glass": L.make_mat("EX_Glass", "#9fd6ea", 0.1, "noise", 0.02, alpha=0.45),
    "frame": L.make_mat("EX_FrameWhite", "#e2e6e4", 0.5, "noise", 0.02),
    "door": L.make_mat("EX_ClinicDoor", "#5aa996", 0.45, "noise", 0.03),
    "red": L.make_mat("EX_ClinicCross", "#e0534f", 0.4, "noise", 0.0, emit="#ff6b62", emit_strength=0.8),
    "sign": L.make_mat("EX_SignWhite", "#ffffff", 0.4, "noise", 0.0, emit="#ffffff", emit_strength=0.6),
    "signbg": L.make_mat("EX_SignBoard", "#2f6f63", 0.7, "noise", 0.02),
    "step": L.make_mat("EX_Paving", "#b8b2a6", 0.9, "tiles", 0.03, accent="#a49e92"),
    "metal": L.make_mat("EX_Metal", "#6f757d", 0.5, "noise", 0.03),
    "wood": L.make_mat("EX_BenchWood", "#a8794f", 0.8, "planks", 0.04, accent="#8d6440"),
    "pot": L.make_mat("EX_Planter", "#d9d4c7", 0.85, "noise", 0.03),
    "leaf": L.make_mat("EX_Leaf", "#4f9d54", 0.9, "noise", 0.06),
    "flower": L.make_mat("EX_Flowers", "#f2a7b8", 0.9, "noise", 0.08),
}
xo = []
SHELL_H = 3.3
WIN_Y = (0.9, 2.3)
front_win = ((-5.5, -2.5), (2.5, 5.5))
side_win = ((-7.0, -4.0), (1.5, 3.5))
shell, interior_offset, zb = L.walk_in_shell(coll_e, cols_e, W, hd, SHELL_H, E["wall"], E["glass"],
                                             [(a, b, *WIN_Y) for a, b in front_win], [(a, b, *WIN_Y) for a, b in side_win], [(a, b, *WIN_Y) for a, b in side_win])
xo += shell
DN = hd - zb
zc = (hd + zb) / 2
xo.append(L.box(coll_e, "EX_Plinth", 0, zc, 0.0, W + 0.4, DN + 0.4, 0.19, E["found"], bevel=0.02, tile=2.0))
xo.append(L.box(coll_e, "EX_Walls", 0, zc, SHELL_H, W, DN, 4.2 - SHELL_H, E["wall"], tile=2.0))
xo += L.perimeter(coll_e, "EX_MintBand", W + 0.08, hd + 0.04, zb - 0.04, 0.2, 0.6, 0.24, E["mint"], front_gaps=[(-0.75, 0.75)])
xo.append(L.box(coll_e, "EX_MintBandTop", 0, zc, 3.3, W + 0.1, DN + 0.1, 0.25, E["mint"], tile=2.0))
xo.append(L.box(coll_e, "EX_Roof", 0, zc, 4.2, W + 0.3, DN + 0.3, 0.15, E["roof"], tile=2.0))
xo += L.perimeter(coll_e, "EX_Parapet", W + 0.3, hd + 0.15, zb - 0.15, 4.35, 0.45, 0.25, E["wall"])
xo.append(L.box(coll_e, "EX_RoofUnit", -4.0, zc - 2.0, 4.35, 1.6, 1.2, 0.9, E["metal"], bevel=0.03))
zf = hd + 0.03
y_lo, y_hi = WIN_Y[0] + 0.2, WIN_Y[1] + 0.2
for side, (x0, x1) in zip("LR", front_win):
    cx = (x0 + x1) / 2
    xo.append(L.box(coll_e, f"EX_Mullion{side}", cx, zf + 0.02, y_lo, 0.1, 0.08, y_hi - y_lo, E["frame"]))
    xo.append(L.box(coll_e, f"EX_WinTop{side}", cx, zf + 0.02, y_hi, x1 - x0 + 0.2, 0.08, 0.1, E["frame"]))
    xo.append(L.box(coll_e, f"EX_WinSill{side}", cx, zf + 0.12, y_lo - 0.08, x1 - x0 + 0.2, 0.28, 0.08, E["frame"]))
xo.append(L.hinged_door(coll_e, [
    (0, 0.0, 1.18, 0.06, 2.18, E["door"], 0.02),
    (0, 1.0, 0.8, 0.08, 1.0, E["glass"], 0.0),
    (0.45, 0.95, 0.05, 0.14, 0.05, E["metal"], 0.0),
], -0.59, hd - 0.1, 0.2))
for i, x in enumerate((-0.66, 0.66)):
    xo.append(L.box(coll_e, f"EX_DoorFrame{i}", x, zf + 0.02, 0.2, 0.12, 0.12, 2.3, E["frame"]))
xo.append(L.box(coll_e, "EX_DoorHeader", 0, zf + 0.02, 2.4, 1.44, 0.12, 0.12, E["frame"]))
xo.append(L.box(coll_e, "EX_Canopy", 0, hd + 1.2, 2.75, 4.0, 2.4, 0.14, E["frame"], bevel=0.02))
xo.append(L.box(coll_e, "EX_CanopyEdge", 0, hd + 2.37, 2.6, 4.0, 0.06, 0.18, E["mint"]))
for i, x in enumerate((-1.8, 1.8)):
    xo.append(L.cyl(coll_e, f"EX_CanopyPost{i}", x, hd + 2.2, 0.0, 0.07, 2.75, E["frame"], seg=8))
xo.append(L.box(coll_e, "EX_SignBoard", 0, hd + 0.08, 2.95, 4.6, 0.1, 0.7, E["signbg"]))
xo.append(L.text_mesh(coll_e, "EX_SignText", "CLINIC", 0, hd + 0.15, 3.05, 0.48, 0.04, E["sign"]))
xo.append(L.box(coll_e, "EX_SignCrossBg", 0, hd + 0.2, 4.45, 1.6, 0.12, 1.6, E["sign"], bevel=0.04))
xo.append(L.box(coll_e, "EX_SignCrossH", 0, hd + 0.28, 5.05, 1.2, 0.1, 0.4, E["red"]))
xo.append(L.box(coll_e, "EX_SignCrossV", 0, hd + 0.28, 4.65, 0.4, 0.1, 1.2, E["red"]))
xo.append(L.box(coll_e, "EX_Step", 0, hd + 1.2, 0.0, 5.0, 2.4, 0.1, E["step"], tile=2.0))
for i, bx in enumerate((-5.0, 5.0)):
    xo.append(L.furn(coll_e, f"EX_Bench{i}", bx, hd + 1.4, 0.0, [
        (-0.7, 0, 0.0, 0.08, 0.4, 0.42, E["metal"]), (0.7, 0, 0.0, 0.08, 0.4, 0.42, E["metal"]),
        (0, 0, 0.42, 1.7, 0.45, 0.06, E["wood"], 0.01), (0, 0.2, 0.48, 1.7, 0.06, 0.4, E["wood"], 0.01)]))
    cols_e.add(f"Bench{i}", bx, hd + 1.4, 0.0, 1.7, 0.5, 0.9)
for i, px in enumerate((-2.6, 2.6)):
    xo.append(L.box(coll_e, f"EX_Planter{i}", px, hd + 0.6, 0.0, 1.2, 0.6, 0.5, E["pot"], bevel=0.03))
    xo.append(L.box(coll_e, f"EX_PlanterLeaf{i}", px, hd + 0.6, 0.5, 1.05, 0.45, 0.25, E["leaf"], bevel=0.08))
    xo.append(L.box(coll_e, f"EX_PlanterFlower{i}", px, hd + 0.6, 0.72, 0.8, 0.3, 0.1, E["flower"], bevel=0.04))
    cols_e.add(f"Planter{i}", px, hd + 0.6, 0.0, 1.2, 0.6, 0.6)
bad = L.check_grounded(xo, allow=("EX_Shell", "EX_Walls", "EX_MintBand", "EX_Roof", "EX_Parapet", "EX_Mullion", "EX_WinTop", "EX_WinSill",
                                  "Door", "EX_Door", "EX_Canopy", "EX_Sign", "EX_PlanterLeaf", "EX_PlanterFlower"))
print("EXTERIOR grounded violations:", bad)
assert not bad, bad
L.export_glb(os.path.join(OUT, "exterior.glb"), xo)
L.export_glb(os.path.join(OUT, "exterior.colsrc.glb"), xo + cols_e.items)
L.write_json(os.path.join(OUT, "exterior.layout.json"), {
    "version": 1, "key": KEY, "name": NAME, "footprint": [W, DN], "footprintCenterZ": zc, "doorLocal": [0.0, 1.25, hd],
    "interiorOffset": [round(c, 4) for c in interior_offset],
    "collision": [{"cx": 0.0, "cz": zc, "hx": W / 2 + 0.2, "hz": DN / 2 + 0.2, "hy": 2.2}],
})
L.snapshot(sc_ext, os.path.join(OUT, "preview.png"), (-14, 6, hd + 18), (0, 2.5, 0), lens=28, res=(768, 512))
print("exterior:", len(xo), "objects,", triangles(xo), "triangles, interiorOffset", interior_offset, "depth", DN)
