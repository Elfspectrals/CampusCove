import os

W, D = 16.0, 36.0
hw, hd = W / 2, D / 2
sc_ext = L.new_build_scene("WORK_" + KEY + "_exterior")
coll_e = bpy.data.collections.new("Exterior")
sc_ext.collection.children.link(coll_e)
cols_e = L.Collisions(coll_e)
E = {
    "found": L.make_mat("EX_Foundation", "#8d8f94", 0.9, "noise", 0.03),
    "wall": L.make_mat("EX_StorageCladding", "#8f9aa2", 0.6, "stripes", 0.03, accent="#7f8a92"),
    "band": L.make_mat("EX_StorageBand", "#e2b53a", 0.6, "noise", 0.03),
    "roof": L.make_mat("EX_StorageRoof", "#6d757c", 0.7, "stripes", 0.03, accent="#626a71"),
    "glass": L.make_mat("EX_Glass", "#9fd6ea", 0.1, "noise", 0.02, alpha=0.45),
    "door": L.make_mat("EX_StorageDoor", "#4f6f8f", 0.45, "noise", 0.03),
    "loading": L.make_mat("EX_StorageLoadingDoor", "#b5603a", 0.55, "stripes", 0.04, accent="#a5532f"),
    "metal": L.make_mat("EX_Metal", "#6f757d", 0.5, "noise", 0.03),
    "signbg": L.make_mat("EX_StorageSignBoard", "#20262b", 0.7, "noise", 0.02),
    "sign": L.make_mat("EX_StorageSignGlow", "#ffd36a", 0.4, "noise", 0.0, emit="#ffc84a", emit_strength=0.9),
    "step": L.make_mat("EX_Paving", "#b8b2a6", 0.9, "tiles", 0.03, accent="#a49e92"),
    "hazard": L.make_mat("EX_StorageHazard", "#e2b53a", 0.7, "stripes", 0.0, accent="#202020"),
}
xo = []
SHELL_H = 5.3
shell, interior_offset, zb = L.walk_in_shell(coll_e, cols_e, W, hd, SHELL_H, E["wall"], E["glass"], [], [], [],
                                             interior_back=Z0 - 0.2)
xo += shell
DN = hd - zb
zc = (hd + zb) / 2
ROOF_Y = 6.2
xo.append(L.box(coll_e, "EX_Plinth", 0, zc, 0.0, W + 0.4, DN + 0.4, 0.19, E["found"], bevel=0.02, tile=2.0))
xo.append(L.box(coll_e, "EX_Walls", 0, zc, SHELL_H, W, DN, ROOF_Y - SHELL_H, E["wall"], tile=2.0))
xo += L.perimeter(coll_e, "EX_Band", W + 0.08, hd + 0.04, zb - 0.04, 0.2, 0.5, 0.24, E["band"], front_gaps=[(-0.75, 0.75)])
xo.append(L.gable_roof(coll_e, "EX_Roof", 0, zc, ROOF_Y, W + 0.6, DN + 0.6, 1.6, E["roof"], ridge_axis="z"))
zf = hd + 0.03
xo.append(L.box(coll_e, "EX_LoadingDoor", 4.0, zf + 0.02, 0.2, 4.6, 0.06, 4.0, E["loading"]))
xo.append(L.box(coll_e, "EX_LoadingDoorFrame", 4.0, zf + 0.04, 4.2, 5.0, 0.1, 0.25, E["band"]))
xo.append(L.box(coll_e, "EX_LoadingDoorHazard", 4.0, zf + 0.6, 0.0, 4.6, 1.2, 0.012, E["hazard"]))
xo.append(L.hinged_door(coll_e, [
    (0, 0.0, 1.18, 0.06, 2.18, E["door"], 0.02),
    (0.45, 0.95, 0.05, 0.14, 0.05, E["metal"], 0.0),
], -0.59, hd - 0.1, 0.2))
for i, x in enumerate((-0.66, 0.66)):
    xo.append(L.box(coll_e, f"EX_DoorFrame{i}", x, zf + 0.02, 0.2, 0.12, 0.12, 2.3, E["band"]))
xo.append(L.box(coll_e, "EX_DoorHeader", 0, zf + 0.02, 2.4, 1.44, 0.12, 0.12, E["band"]))
xo.append(L.box(coll_e, "EX_Canopy", 0, hd + 0.9, 2.75, 2.4, 1.8, 0.12, E["metal"], bevel=0.02))
xo.append(L.box(coll_e, "EX_SignBoard", -2.2, hd + 0.08, 4.4, 7.0, 0.1, 1.1, E["signbg"]))
xo.append(L.text_mesh(coll_e, "EX_SignText", "COVE STORAGE", -2.2, hd + 0.15, 4.62, 0.62, 0.0, E["sign"]))
xo.append(L.box(coll_e, "EX_Step", 0, hd + 1.0, 0.0, 3.0, 2.0, 0.1, E["step"], tile=2.0))
bad = L.check_grounded(xo, allow=("EX_Shell", "EX_Walls", "EX_Band", "EX_Roof", "EX_Loading", "Door", "EX_Door", "EX_Canopy", "EX_Sign"))
print("EXTERIOR grounded violations:", bad)
assert not bad, bad
L.export_glb(os.path.join(OUT, "exterior.glb"), xo)
L.export_glb(os.path.join(OUT, "exterior.colsrc.glb"), xo + cols_e.items)
L.write_json(os.path.join(OUT, "exterior.layout.json"), {
    "version": 1, "key": KEY, "name": NAME, "footprint": [W, DN], "footprintCenterZ": zc, "doorLocal": [0.0, 1.25, hd],
    "interiorOffset": [round(c, 4) for c in interior_offset],
    "collision": [{"cx": 0.0, "cz": zc, "hx": W / 2 + 0.2, "hz": DN / 2 + 0.2, "hy": 2.2}],
})
L.snapshot(sc_ext, os.path.join(OUT, "preview.png"), (-22, 9, hd + 26), (0, 3.0, 0), lens=28, res=(768, 512))
print("exterior:", len(xo), "objects,", triangles(xo), "triangles, interiorOffset", interior_offset, "depth", DN)
