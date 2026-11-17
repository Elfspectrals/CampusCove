import os

W = 34.0
hw, hd = W / 2, 28.5
sc_ext = L.new_build_scene("WORK_" + KEY + "_exterior")
coll_e = bpy.data.collections.new("Exterior")
sc_ext.collection.children.link(coll_e)
cols_e = L.Collisions(coll_e)
E = {
    "found": L.make_mat("EX_Foundation", "#8d8f94", 0.9, "noise", 0.03),
    "wall": L.make_mat("EX_SportsConcrete", "#d9d6cf", 0.9, "noise", 0.03),
    "clad": L.make_mat("EX_SportsTealCladding", "#2a9d8f", 0.7, "stripes", 0.03, accent="#258c80"),
    "panel": L.make_mat("EX_GymPanel", "#3f7fb5", 0.7, "stripes", 0.03, accent="#3873a5"),
    "roof": L.make_mat("EX_SportsRoof", "#8f969b", 0.9, "noise", 0.03),
    "glass": L.make_mat("EX_Glass", "#9fd6ea", 0.1, "noise", 0.02, alpha=0.45),
    "frame": L.make_mat("EX_SportsFrame", "#3a3f45", 0.5, "noise", 0.02),
    "door": L.make_mat("EX_SportsDoor", "#3a3f45", 0.45, "noise", 0.03),
    "exit": L.make_mat("EX_GymFireExit", "#5c6b73", 0.5, "noise", 0.02),
    "exitsign": L.make_mat("EX_GymExitSign", "#2fbf71", 0.4, "noise", 0.0, emit="#2fbf71", emit_strength=0.8),
    "metal": L.make_mat("EX_Metal", "#6f757d", 0.5, "noise", 0.03),
    "sign": L.make_mat("EX_SignWhite", "#ffffff", 0.4, "noise", 0.0, emit="#ffffff", emit_strength=0.6),
    "step": L.make_mat("EX_Paving", "#b8b2a6", 0.9, "tiles", 0.03, accent="#a49e92"),
}
xo = []
fy = L.INTERIOR_FLOOR_Y
SHELL_H = H + fy + 0.1
TOP_Y = SHELL_H + 0.7
shell, interior_offset, zb = L.walk_in_shell(coll_e, cols_e, W, hd, SHELL_H, E["wall"], E["glass"],
                                             [(a, b, *WIN_Y) for a, b in FRONT_WINDOWS],
                                             [(a, b, *HIGH_WIN_Y) for a, b in HIGH_WINDOWS],
                                             [(a, b, *HIGH_WIN_Y) for a, b in HIGH_WINDOWS],
                                             interior_back=Z0 - 0.2)
xo += shell
DN = hd - zb
zc = (hd + zb) / 2
xo.append(L.box(coll_e, "EX_Plinth", 0, zc, 0.0, W + 0.4, DN + 0.4, 0.19, E["found"], bevel=0.02, tile=2.0))
xo.append(L.box(coll_e, "EX_Walls", 0, zc, SHELL_H, W, DN, TOP_Y - SHELL_H, E["wall"], tile=2.0))
xo += L.perimeter(coll_e, "EX_Fascia", W + 0.1, hd + 0.05, zb - 0.05, SHELL_H - 0.4, 0.9, 0.25, E["clad"])
xo += L.perimeter(coll_e, "EX_Band", W + 0.08, hd + 0.04, zb - 0.04, 3.4 + fy, 0.5, 0.24, E["panel"], front_gaps=[(-1.6, 1.6)])
xo.append(L.box(coll_e, "EX_Roof", 0, zc, TOP_Y, W + 0.2, DN + 0.2, 0.14, E["roof"], tile=2.0))
xo += L.perimeter(coll_e, "EX_Parapet", W + 0.2, hd + 0.1, zb - 0.1, TOP_Y + 0.14, 0.45, 0.22, E["wall"])
for i, (ux, uz) in enumerate(((-8.0, zc - 10.0), (8.0, zc - 10.0), (0.0, zc + 6.0))):
    xo.append(L.box(coll_e, f"EX_RoofUnit{i}", ux, uz, TOP_Y + 0.14, 2.2, 1.6, 1.0, E["metal"], bevel=0.03))

zf = hd + 0.03
for side, (x0, x1) in zip("LR", FRONT_WINDOWS):
    for k, x in enumerate((x0, (x0 + x1) / 2, x1)):
        xo.append(L.box(coll_e, f"EX_Mullion{side}{k}", x, zf + 0.02, WIN_Y[0] + fy, 0.08, 0.08, WIN_Y[1] - WIN_Y[0], E["frame"]))
    xo.append(L.box(coll_e, f"EX_WinTop{side}", (x0 + x1) / 2, zf + 0.02, WIN_Y[1] + fy, x1 - x0 + 0.08, 0.08, 0.08, E["frame"]))
    xo.append(L.box(coll_e, f"EX_WinSill{side}", (x0 + x1) / 2, zf + 0.06, WIN_Y[0] + fy - 0.06, x1 - x0 + 0.08, 0.16, 0.06, E["frame"]))
for i, x in enumerate((-0.98, 0.98)):
    xo.append(L.box(coll_e, f"EX_CladFin{i}", x, zf + 0.06, 0.19, 0.4, 0.12, 3.2, E["clad"]))
xo.append(L.hinged_door(coll_e, [
    (0, 0.08, 1.18, 0.06, 2.02, E["glass"], 0.0),
    (0, 0.0, 1.18, 0.07, 0.08, E["door"], 0.0),
    (0, 2.1, 1.18, 0.07, 0.08, E["door"], 0.0),
    (0.45, 0.95, 0.05, 0.14, 0.05, E["metal"], 0.0),
], -0.59, hd - 0.1, 0.2))
for i, x in enumerate((-0.66, 0.66)):
    xo.append(L.box(coll_e, f"EX_DoorFrame{i}", x, zf + 0.02, 0.2, 0.12, 0.12, 2.3, E["frame"]))
xo.append(L.box(coll_e, "EX_DoorHeader", 0, zf + 0.02, 2.4, 1.44, 0.12, 0.12, E["frame"]))
xo.append(L.box(coll_e, "EX_Canopy", 0, hd + 0.75, 2.85, 4.0, 1.5, 0.16, E["frame"], bevel=0.02))
xo.append(L.box(coll_e, "EX_CanopyEdge", 0, hd + 1.47, 2.7, 4.0, 0.06, 0.35, E["clad"]))
xo.append(L.box(coll_e, "EX_SignBoard", 0, hd + 0.14, 5.0, 11.0, 0.06, 1.0, E["frame"]))
xo.append(L.text_mesh(coll_e, "EX_SignText", "COVE GYMNASIUM", 0, hd + 0.19, 5.18, 0.62, 0.02, E["sign"]))
xo.append(L.text_mesh(coll_e, "EX_SignSports", "FOOTBALL - BASKETBALL", 0, hd + 1.52, 2.76, 0.18, 0.01, E["sign"]))
xo.append(L.box(coll_e, "EX_Step", 0, hd + 0.75, 0.0, 4.0, 1.5, 0.1, E["step"], tile=2.0))

zbk = zb - 0.03
xo.append(L.box(coll_e, "EX_FireExit", 0.0, zbk - 0.02, 0.2, 1.6, 0.06, 2.2, E["exit"]))
xo.append(L.box(coll_e, "EX_FireExitBar", 0.0, zbk - 0.06, 1.05, 1.3, 0.04, 0.06, E["metal"]))
xo.append(L.box(coll_e, "EX_FireExitSign", 0.0, zbk - 0.04, 2.55, 0.8, 0.04, 0.26, E["exitsign"]))
xo.append(L.box(coll_e, "EX_FireExitStep", 0.0, zb - 0.6, 0.0, 2.0, 1.2, 0.1, E["step"]))

bad = L.check_grounded(xo, allow=("EX_Shell", "EX_Walls", "EX_Fascia", "EX_Band", "EX_Roof", "EX_Parapet", "EX_Mullion", "EX_WinTop", "EX_WinSill",
                                  "Door", "EX_Door", "EX_Canopy", "EX_Sign", "EX_CladFin", "EX_FireExit"))
print("EXTERIOR grounded violations:", bad)
assert not bad, bad
L.export_glb(os.path.join(OUT, "exterior.glb"), xo)
L.export_glb(os.path.join(OUT, "exterior.colsrc.glb"), xo + cols_e.items)
L.write_json(os.path.join(OUT, "exterior.layout.json"), {
    "version": 1, "key": KEY, "name": NAME, "footprint": [W, DN], "footprintCenterZ": zc, "doorLocal": [0.0, 1.25, hd],
    "interiorOffset": [round(c, 4) for c in interior_offset],
    "collision": [{"cx": 0.0, "cz": zc, "hx": W / 2 + 0.2, "hz": DN / 2 + 0.2, "hy": 2.2}],
})
L.snapshot(sc_ext, os.path.join(OUT, "preview.png"), (-30, 14, hd + 34), (0, 4.0, 0), lens=28, res=(768, 512))
print("exterior:", len(xo), "objects,", triangles(xo), "triangles, interiorOffset", interior_offset, "depth", DN)
