import os

W = 30.8
SHELL_H = 7.8
ATTIC_TOP = 9.0
STRING_Y = 4.9
BLIND_WIN = (5.5, 7.0)
COLUMN_XS = (-6.4, -4.0, -1.6, 1.6, 4.0, 6.4)
COLUMN_TOP = 6.8
ENTABLATURE_H = 1.0
PEDIMENT_H = 2.4
STONE_TILE = 3.0
hw = W / 2
sc_ext = L.new_build_scene("WORK_" + KEY + "_exterior")
coll_e = bpy.data.collections.new("Exterior")
sc_ext.collection.children.link(coll_e)
cols_e = L.Collisions(coll_e)
E = {
    "found": L.make_mat("EX_Foundation", "#8d8f94", 0.9, "noise", 0.03),
    "base": L.make_mat("EX_PoliceStoneBase", "#a9a196", 0.9, "tiles", 0.04, accent="#968e83"),
    "trim": L.make_mat("EX_PoliceTrim", "#ece6d8", 0.75, "noise", 0.02),
    "roof": L.make_mat("EX_RoofGravel", "#6f7076", 0.95, "noise", 0.05),
    "glass": L.make_mat("EX_Glass", "#9fd6ea", 0.1, "noise", 0.02, alpha=0.45),
    "blind": L.make_mat("EX_PoliceBlindWindow", "#2c3a4a", 0.2, "noise", 0.02),
    "door": L.make_mat("EX_PoliceDoor", "#3b2a1f", 0.5, "planks", 0.03, accent="#2f2118"),
    "metal": L.make_mat("EX_Metal", "#6f757d", 0.5, "noise", 0.03),
    "navy": L.make_mat("EX_PoliceNavy", "#1f3350", 0.6, "noise", 0.02),
    "gold": L.make_mat("EX_PoliceGold", "#d4ad52", 0.4, "noise", 0.02, emit="#f2cf73", emit_strength=0.5),
    "lamp": L.make_mat("EX_PoliceLantern", "#fff1c4", 0.5, "noise", 0.0, emit="#fff1c4"),
}
E["stone"], _ = B._texture_mat("EX_PoliceStone", "light_limestone_ashlar_blocks", "#f2ebdd")
E["column"], COLUMN_TILE = B._texture_mat("EX_PoliceColumn", "facade", "#ffffff")
E["step"], STEP_TILE = B._texture_mat("EX_PoliceSteps", "paving", "#e8e2d6")
xo = []
front = [(a, b, *WIN_HALL) for a, b in FRONT_HALL_WINDOWS] + [(a, b, *WIN_LOW) for a, b in FRONT_ROOM_WINDOWS]
shell, interior_offset, zb = L.walk_in_shell(coll_e, cols_e, W, HD, SHELL_H, E["stone"], E["glass"], front,
                                             [(a, b, *WIN_LOW) for a, b in WEST_WINDOWS], [(a, b, *WIN_LOW) for a, b in EAST_WINDOWS],
                                             interior_back=Z0 - T)
retile([o for o in shell if o.active_material is E["stone"]], STONE_TILE)
xo += shell
oz = interior_offset[2]
fy = L.INTERIOR_FLOOR_Y
DN = HD - zb
zc = (HD + zb) / 2
zf = HD + 0.03
xo.append(L.box(coll_e, "EX_Plinth", 0, zc, 0.0, W + 0.4, DN + 0.4, 0.19, E["found"], bevel=0.02, tile=2.0))
xo += L.perimeter(coll_e, "EX_BaseBand", W + 0.12, HD + 0.06, zb - 0.06, 0.19, 0.8, 0.26, E["base"], front_gaps=[(-0.8, 0.8)], tile=1.5)
xo += L.perimeter(coll_e, "EX_StringCourse", W + 0.16, HD + 0.08, zb - 0.08, STRING_Y, 0.25, 0.28, E["trim"], tile=2.0)
xo += L.cornice(coll_e, "EX_Cornice", W, HD, zb, SHELL_H - 0.3, ATTIC_TOP, E["trim"], E["stone"], tile=STONE_TILE)
xo.append(L.box(coll_e, "EX_Roof", 0, zc, SHELL_H, W, DN, 0.15, E["roof"], tile=3.0))
xo.append(L.box(coll_e, "EX_RoofUnit0", -9.0, zc - 4.0, SHELL_H + 0.15, 2.4, 1.6, 1.0, E["metal"], bevel=0.03))
xo.append(L.box(coll_e, "EX_RoofUnit1", 9.5, zc - 6.0, SHELL_H + 0.15, 1.6, 1.6, 0.8, E["metal"], bevel=0.03))


def trims(name, cx, cz, width, y0, y1, axis):
    sx, sz = (width + 0.24, 0.1) if axis == "x" else (0.1, width + 0.24)
    xo.append(L.box(coll_e, f"{name}_Lintel", cx, cz, y1 + fy, sx, sz, 0.18, E["trim"]))
    xo.append(L.box(coll_e, f"{name}_Sill", cx, cz, y0 + fy - 0.08, sx, sz * 1.6 if axis == "x" else sz, 0.08, E["trim"]))


def blind(name, cx, cz, width, axis):
    sx, sz = (width, 0.04) if axis == "x" else (0.04, width)
    fx, fz = (width + 0.2, 0.08) if axis == "x" else (0.08, width + 0.2)
    xo.append(L.box(coll_e, f"{name}_Frame", cx, cz, BLIND_WIN[0] - 0.1, fx, fz, BLIND_WIN[1] - BLIND_WIN[0] + 0.2, E["trim"]))
    xo.append(L.box(coll_e, f"{name}_Pane", cx + (0.0 if axis == "x" else (0.03 if cx > 0 else -0.03)), cz + (0.03 if axis == "x" else 0.0),
                    BLIND_WIN[0], sx, sz, BLIND_WIN[1] - BLIND_WIN[0], E["blind"]))


for i, (a, b) in enumerate(FRONT_HALL_WINDOWS):
    trims(f"EX_HallWin{i}", (a + b) / 2, zf, b - a, *WIN_HALL, "x")
for i, (a, b) in enumerate(FRONT_ROOM_WINDOWS):
    trims(f"EX_FrontWin{i}", (a + b) / 2, zf, b - a, *WIN_LOW, "x")
    blind(f"EX_FrontBlind{i}", (a + b) / 2, HD + 0.02, b - a, "x")
for side, sx, wins in (("W", -1, WEST_WINDOWS), ("E", 1, EAST_WINDOWS)):
    for i, (a, b) in enumerate(wins):
        trims(f"EX_{side}Win{i}", sx * (hw + 0.03), (a + b) / 2 + oz, b - a, *WIN_LOW, "z")
    for i, z in enumerate((-16.0, -11.5, -7.0, 1.0)):
        blind(f"EX_{side}Blind{i}", sx * (hw + 0.02), z + oz, 2.0, "z")

xo.append(L.box(coll_e, "EX_Portico", 0, HD + PORTICO_DEPTH / 2, 0.0, 2 * PORTICO_HALF_W, PORTICO_DEPTH, fy, E["step"], tile=STEP_TILE))
xo.append(L.box(coll_e, "EX_Step", 0, HD + PORTICO_DEPTH + STEP_DEPTH / 2, 0.0, 2 * STEP_HALF_W, STEP_DEPTH, fy / 2, E["step"], tile=STEP_TILE))
for i, sx in enumerate((-1, 1)):
    cx = sx * (STEP_HALF_W + 0.4)
    depth = PORTICO_DEPTH + STEP_DEPTH
    xo.append(L.box(coll_e, f"EX_StepCheek{i}", cx, HD + depth / 2, 0.0, 0.8, depth, 0.9, E["base"], bevel=0.02))
    xo.append(L.box(coll_e, f"EX_StepCheekCap{i}", cx, HD + depth / 2, 0.9, 0.9, depth + 0.1, 0.1, E["trim"]))
    cols_e.add(f"StepCheek{i}", cx, HD + depth / 2, 0.0, 0.9, depth + 0.1, 1.0)
col_z = HD + PORTICO_DEPTH - 0.6
for i, x in enumerate(COLUMN_XS):
    xo += L.column(coll_e, f"EX_Column{i}", x, col_z, fy, COLUMN_TOP - fy, 0.3, E["column"], E["trim"], tile=COLUMN_TILE)
    cols_e.add(f"Column{i}", x, col_z, 0.0, 0.7, 0.7, COLUMN_TOP)
ent_w = 2 * PORTICO_HALF_W + 0.4
xo.append(L.box(coll_e, "EX_Entablature", 0, HD + PORTICO_DEPTH / 2, COLUMN_TOP, ent_w, PORTICO_DEPTH, ENTABLATURE_H, E["stone"], tile=STONE_TILE))
xo.append(L.box(coll_e, "EX_EntablatureBand", 0, HD + PORTICO_DEPTH + 0.02, COLUMN_TOP + 0.15, ent_w - 0.4, 0.04, 0.3, E["navy"]))
ped_y = COLUMN_TOP + ENTABLATURE_H
xo += L.pediment(coll_e, "EX_Pediment", 0, HD + PORTICO_DEPTH / 2, ped_y - 0.1, ent_w, PORTICO_DEPTH, PEDIMENT_H, E["column"], E["trim"], tile=COLUMN_TILE)
xo.append(L.text_mesh(coll_e, "EX_SignText", "POLICE", 0, HD + PORTICO_DEPTH + 0.01, ped_y + 0.3, 1.05, 0.06, E["gold"]))

xo.append(L.hinged_door(coll_e, [
    (0, 0.0, 1.18, 0.06, 2.18, E["door"], 0.02),
    (0, 1.05, 0.7, 0.08, 0.9, E["glass"], 0.0),
    (0.45, 0.95, 0.05, 0.14, 0.05, E["metal"], 0.0),
], -0.59, HD - 0.1, fy))
for i, sx in enumerate((-1, 1)):
    xo.append(L.box(coll_e, f"EX_DoorPilaster{i}", sx * 0.95, zf + 0.04, fy, 0.3, 0.14, 3.0, E["trim"]))
    xo.append(L.box(coll_e, f"EX_Lantern{i}_Bracket", sx * 1.6, zf + 0.12, 2.5, 0.08, 0.24, 0.08, E["metal"]))
    xo.append(L.box(coll_e, f"EX_Lantern{i}", sx * 1.6, zf + 0.26, 2.3, 0.24, 0.24, 0.42, E["lamp"], bevel=0.02))
xo.append(L.box(coll_e, "EX_DoorHeader", 0, zf + 0.06, fy + 3.0, 2.3, 0.18, 0.4, E["trim"]))
xo.append(L.box(coll_e, "EX_DoorTransom", 0, zf, fy + 2.4, 1.2, 0.04, 0.5, E["blind"]))

bad = L.check_grounded(xo, allow=("EX_Shell", "EX_BaseBand", "EX_StringCourse", "EX_Cornice", "EX_Roof", "EX_Attic", "EX_HallWin", "EX_FrontWin",
                                  "EX_WWin", "EX_EWin", "EX_FrontBlind", "EX_WBlind", "EX_EBlind", "EX_StepCheekCap", "EX_Column", "EX_Entablature",
                                  "EX_Pediment", "EX_Sign", "Door", "EX_Door", "EX_Lantern"))
print("EXTERIOR grounded violations:", bad)
assert not bad, bad
L.export_glb(os.path.join(OUT, "exterior.glb"), xo)
L.export_glb(os.path.join(OUT, "exterior.colsrc.glb"), xo + cols_e.items)
L.write_json(os.path.join(OUT, "exterior.layout.json"), {
    "version": 1, "key": KEY, "name": NAME, "footprint": [W, round(DN, 3)], "footprintCenterZ": round(zc, 4), "doorLocal": [0.0, 1.25, HD],
    "interiorOffset": [round(c, 4) for c in interior_offset],
    "stepsEndZ": round(HD + PORTICO_DEPTH + STEP_DEPTH, 3),
    "collision": [{"cx": 0.0, "cz": round(zc, 4), "hx": W / 2 + 0.2, "hz": round(DN / 2 + 0.2, 4), "hy": ATTIC_TOP / 2}],
})
L.snapshot(sc_ext, os.path.join(OUT, "preview.png"), (-24, 7, HD + 26), (0, 4.0, 0), lens=26, res=(768, 512))
print("exterior:", len(xo), "objects,", triangles(xo), "triangles, interiorOffset", interior_offset, "depth", round(DN, 3))
