import os

W = 12.0
hw, hd = W / 2, 8.0
sc_ext = L.new_build_scene("WORK_" + KEY + "_exterior")
coll_e = bpy.data.collections.new("Exterior")
sc_ext.collection.children.link(coll_e)
cols_e = L.Collisions(coll_e)
E = {
    "found": L.make_mat("EX_Foundation", "#8d8f94", 0.9, "noise", 0.03),
    "wall": L.make_mat("EX_SportsConcrete", "#d9d6cf", 0.9, "noise", 0.03),
    "clad": L.make_mat("EX_SportsTealCladding", "#2a9d8f", 0.7, "stripes", 0.03, accent="#258c80"),
    "roof": L.make_mat("EX_SportsRoof", "#8f969b", 0.9, "noise", 0.03),
    "glass": L.make_mat("EX_Glass", "#9fd6ea", 0.1, "noise", 0.02, alpha=0.45),
    "frame": L.make_mat("EX_SportsFrame", "#3a3f45", 0.5, "noise", 0.02),
    "door": L.make_mat("EX_SportsDoor", "#3a3f45", 0.45, "noise", 0.03),
    "metal": L.make_mat("EX_Metal", "#6f757d", 0.5, "noise", 0.03),
    "sign": L.make_mat("EX_SignWhite", "#ffffff", 0.4, "noise", 0.0, emit="#ffffff", emit_strength=0.6),
    "step": L.make_mat("EX_Paving", "#b8b2a6", 0.9, "tiles", 0.03, accent="#a49e92"),
}
xo = []
SHELL_H = 3.8
TOP_Y = 4.6
fy = L.INTERIOR_FLOOR_Y
shell, interior_offset, zb = L.walk_in_shell(coll_e, cols_e, W, hd, SHELL_H, E["wall"], E["glass"],
                                             [(a, b, *WIN_Y) for a, b in FRONT_WINDOWS],
                                             [(a, b, *SIDE_WIN_Y) for a, b in WEST_WINDOWS],
                                             [(a, b, *SIDE_WIN_Y) for a, b in EAST_WINDOWS],
                                             interior_back=Z0 - 0.2)
xo += shell
DN = hd - zb
zc = (hd + zb) / 2
xo.append(L.box(coll_e, "EX_Plinth", 0, zc, 0.0, W + 0.4, DN + 0.4, 0.19, E["found"], bevel=0.02, tile=2.0))
xo.append(L.box(coll_e, "EX_Walls", 0, zc, SHELL_H, W, DN, TOP_Y - SHELL_H, E["wall"], tile=2.0))
xo += L.perimeter(coll_e, "EX_Fascia", W + 0.1, hd + 0.05, zb - 0.05, SHELL_H + 0.1, 0.55, 0.25, E["clad"])
xo.append(L.box(coll_e, "EX_Roof", 0, zc, TOP_Y, W + 0.2, DN + 0.2, 0.12, E["roof"], tile=2.0))
xo += L.perimeter(coll_e, "EX_Parapet", W + 0.2, hd + 0.1, zb - 0.1, TOP_Y + 0.12, 0.35, 0.2, E["wall"])
xo.append(L.box(coll_e, "EX_RoofUnit", 3.0, zc - 3.0, TOP_Y + 0.12, 1.6, 1.2, 0.8, E["metal"], bevel=0.03))

zf = hd + 0.03
for side, (x0, x1) in zip("LR", FRONT_WINDOWS):
    for k, x in enumerate((x0, (x0 + x1) / 2, x1)):
        xo.append(L.box(coll_e, f"EX_Mullion{side}{k}", x, zf + 0.02, WIN_Y[0] + fy, 0.08, 0.08, WIN_Y[1] - WIN_Y[0], E["frame"]))
    xo.append(L.box(coll_e, f"EX_WinTop{side}", (x0 + x1) / 2, zf + 0.02, WIN_Y[1] + fy, x1 - x0 + 0.08, 0.08, 0.08, E["frame"]))
    xo.append(L.box(coll_e, f"EX_WinSill{side}", (x0 + x1) / 2, zf + 0.06, WIN_Y[0] + fy - 0.06, x1 - x0 + 0.08, 0.16, 0.06, E["frame"]))
for i, x in enumerate((-0.98, 0.98)):
    xo.append(L.box(coll_e, f"EX_CladFin{i}", x, zf + 0.06, 0.19, 0.4, 0.12, SHELL_H - 0.09, E["clad"]))
xo.append(L.hinged_door(coll_e, [
    (0, 0.08, 1.18, 0.06, 2.02, E["glass"], 0.0),
    (0, 0.0, 1.18, 0.07, 0.08, E["door"], 0.0),
    (0, 2.1, 1.18, 0.07, 0.08, E["door"], 0.0),
    (0.45, 0.95, 0.05, 0.14, 0.05, E["metal"], 0.0),
], -0.59, hd - 0.1, 0.2))
for i, x in enumerate((-0.66, 0.66)):
    xo.append(L.box(coll_e, f"EX_DoorFrame{i}", x, zf + 0.02, 0.2, 0.12, 0.12, 2.3, E["frame"]))
xo.append(L.box(coll_e, "EX_DoorHeader", 0, zf + 0.02, 2.4, 1.44, 0.12, 0.12, E["frame"]))
xo.append(L.box(coll_e, "EX_Canopy", 0, hd + 0.5, 2.75, 3.0, 1.0, 0.14, E["frame"], bevel=0.02))
xo.append(L.box(coll_e, "EX_SignBoard", 0, hd + 0.14, SHELL_H + 0.15, 7.6, 0.06, 0.45, E["frame"]))
xo.append(L.text_mesh(coll_e, "EX_SignText", "COVE SPORTS PARK", 0, hd + 0.19, SHELL_H + 0.22, 0.32, 0.02, E["sign"]))
xo.append(L.box(coll_e, "EX_CanopyEdge", 0, hd + 0.97, 2.6, 3.0, 0.06, 0.35, E["clad"]))
xo.append(L.text_mesh(coll_e, "EX_SignReception", "RECEPTION", 0, hd + 1.02, 2.68, 0.2, 0.01, E["sign"]))
xo.append(L.box(coll_e, "EX_Step", 0, hd + 0.5, 0.0, 3.0, 1.0, 0.1, E["step"], tile=2.0))

bad = L.check_grounded(xo, allow=("EX_Shell", "EX_Walls", "EX_Fascia", "EX_Roof", "EX_Parapet", "EX_Mullion", "EX_WinTop", "EX_WinSill",
                                  "Door", "EX_Door", "EX_Canopy", "EX_Sign", "EX_CladFin"))
print("EXTERIOR grounded violations:", bad)
assert not bad, bad
L.export_glb(os.path.join(OUT, "exterior.glb"), xo)
L.export_glb(os.path.join(OUT, "exterior.colsrc.glb"), xo + cols_e.items)
L.write_json(os.path.join(OUT, "exterior.layout.json"), {
    "version": 1, "key": KEY, "name": NAME, "footprint": [W, DN], "footprintCenterZ": zc, "doorLocal": [0.0, 1.25, hd],
    "interiorOffset": [round(c, 4) for c in interior_offset],
    "collision": [{"cx": 0.0, "cz": zc, "hx": W / 2 + 0.2, "hz": DN / 2 + 0.2, "hy": 2.2}],
})
L.snapshot(sc_ext, os.path.join(OUT, "preview.png"), (-12, 6, hd + 16), (0, 2.2, 0), lens=28, res=(768, 512))
print("exterior:", len(xo), "objects,", triangles(xo), "triangles, interiorOffset", interior_offset, "depth", DN)
