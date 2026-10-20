"""Tech Hub (job: Dev). Run inside Blender: exec(open(<this file>).read()).

Outputs (map-src/CampusCove/out/work/tech_hub/):
  interior.glb, interior.colsrc.glb, interior.layout.json, exterior.glb, exterior.colsrc.glb

Interior (game space): x in [-7, 7], z in [-9, 5.2], door on the front wall at z=+5.1 (house convention).
8 dev stations: desk_dev_NN / seat_dev_NN / station_dev_NN (layout json), 6 meeting seats, 1 sofa lounge.
"""
import importlib
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else r"C:\Users\zombo\CampusCove\map-src\CampusCove"
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import lib_common as L
importlib.reload(L)
import bpy

KEY = "tech_hub"
OUT = os.path.join(L.OUT_ROOT, "work", KEY)
H = 3.0  # interior floor-to-ceiling

# ================================================================ INTERIOR
sc = L.new_build_scene("WORK_" + KEY + "_interior")
coll = bpy.data.collections.new("Interior")
sc.collection.children.link(coll)
cols = L.Collisions(coll)

M = {
    "floor": L.make_mat("IN_FloorCarpet", "#6f7d8c", 0.95, "checker", 0.03, accent="#66758a"),
    "wall": L.make_mat("IN_WallWhite", "#eceae4", 0.9, "noise", 0.02),
    "accent": L.make_mat("IN_WallTeal", "#2f9a9b", 0.9, "noise", 0.03),
    "ceil": L.make_mat("IN_Ceiling", "#f4f3ee", 0.95, "noise", 0.01),
    "oak": L.make_mat("IN_DeskOak", "#c9a36a", 0.55, "planks", 0.04, accent="#a98550"),
    "metal": L.make_mat("IN_MetalDark", "#3a3f47", 0.4, "noise", 0.03),
    "fabric": L.make_mat("IN_ChairTeal", "#2e8f94", 0.95, "noise", 0.04),
    "black": L.make_mat("IN_Bezel", "#16181c", 0.5, "noise", 0.01),
    "screen": L.make_mat("IN_Screen", "#2a6ed8", 0.3, "stripes", 0.03, accent="#3a86ff", emit="#2a6ed8"),
    "glass": L.make_mat("IN_Glass", "#bfe4f2", 0.1, "noise", 0.01, alpha=0.28),
    "lamp": L.make_mat("IN_LightPanel", "#fffbe8", 0.5, "noise", 0.0, emit="#fff4d0"),
    "pot": L.make_mat("IN_Terracotta", "#b9633f", 0.8, "noise", 0.04),
    "leaf": L.make_mat("IN_Leaf", "#4f9d54", 0.9, "noise", 0.06),
    "sofa": L.make_mat("IN_SofaGrey", "#5c6b8a", 0.95, "noise", 0.04),
    "rack": L.make_mat("IN_ServerRack", "#262a31", 0.45, "stripes", 0.02, accent="#1c1f24"),
    "led": L.make_mat("IN_Led", "#37e08a", 0.4, "noise", 0.0, emit="#37e08a"),
    "board": L.make_mat("IN_Whiteboard", "#fafafa", 0.4, "noise", 0.01),
    "sky": L.make_mat("IN_SkyBackdrop", "#a9cdee", 1.0, "noise", 0.01),
    "mat": L.make_mat("IN_Doormat", "#3b3b43", 1.0, "stripes", 0.03, accent="#2b2b32"),
    "marble": L.make_mat("IN_Marble", "#e6e3dc", 0.25, "noise", 0.03),
}

X0, X1, Z0, Z1 = -7.0, 7.0, -9.0, 5.0  # floor extent; front wall slab z 5.0..5.2
T = 0.2
objs = []

# floor / ceiling
objs.append(L.box(coll, "House_Floor_Main", 0, (Z0 + Z1) / 2, -0.1, X1 - X0, Z1 - Z0, 0.1, M["floor"], tile=2.0))
objs.append(L.box(coll, "Ceiling", 0, (Z0 + 5.2) / 2, H, 14.4, 14.4 + 0.0, 0.1, M["ceil"], tile=2.0))

# walls (door on front wall, windows on front/sides)
win = 0.9, 2.3
objs += L.wall(coll, "Walls_Front", "x", 5.1, T, X0 - T, X1 + T, H, M["wall"],
               openings=[(-5.5, -2.5, *win), (-0.6, 0.6, 0.0, 2.2), (2.5, 5.5, *win)], cols=cols, glass=M["glass"], col_tag="Wall_Front")
objs += L.wall(coll, "Walls_Back", "x", Z0 - 0.1, T, X0 - T, X1 + T, H, M["wall"], cols=cols, col_tag="Wall_Back")
objs += L.wall(coll, "Walls_W", "z", X0 - 0.1, T, Z0, 5.2, H, M["wall"],
               openings=[(-6.75, -4.25, *win), (-2.75, -0.25, *win), (1.0, 3.5, *win)], cols=cols, glass=M["glass"], col_tag="Wall_W")
objs += L.wall(coll, "Walls_E", "z", X1 + 0.1, T, Z0, 5.2, H, M["wall"],
               openings=[(-6.75, -4.25, *win), (-2.75, -0.25, *win), (1.0, 3.5, *win)], cols=cols, glass=M["glass"], col_tag="Wall_E")
# door pieces (entrance)
objs.append(L.box(coll, "Door_Entrance", 0, 5.1, 0.01, 1.18, 0.06, 2.18, L.make_mat("IN_DoorWood", "#4a4f57", 0.45, "noise", 0.03), bevel=0.02))
objs.append(L.box(coll, "Door_Entrance_Handle", 0.42, 4.97, 0.98, 0.04, 0.12, 0.04, M["metal"]))
objs.append(L.box(coll, "Door_Entrance_Sign", 0, 4.99, 2.37, 0.5, 0.02, 0.16, M["accent"]))
objs.append(L.box(coll, "Entry_Doormat", 0, 4.5, 0.0, 1.0, 0.6, 0.012, M["mat"]))

# accent stripe on the back wall + sky planes + ceiling lights
objs.append(L.box(coll, "Wall_AccentStripe", 0, Z0 + 0.03, 1.3, 13.8, 0.04, 0.3, M["accent"]))
for i, (lx, lz) in enumerate([(-4, -6), (0, -6), (4, -6), (-4, -1.5), (0, -1.5), (4, -1.5), (-4, 3), (4, 3)]):
    objs.append(L.box(coll, f"Light_{i:02d}", lx, lz, H - 0.05, 1.4, 0.4, 0.05, M["lamp"]))
for nm, gx, gz, sx, sz in [("Sky_Back", 0, -13, 32, 0.05), ("Sky_Front", 0, 14, 32, 0.05),
                           ("Sky_West", -12, 2, 0.05, 32), ("Sky_East", 12, 2, 0.05, 32)]:
    objs.append(L.box(coll, nm, gx, gz, -3.0, sx, sz, 9.0, M["sky"]))

# -------- dev stations (2 rows x 4)
stations = []
dev_xs = [-5.2, -1.8, 1.8, 5.2]
rows = [(-1.5, "A"), (-5.0, "B")]
n = 0
for (dz, _) in rows:
    for dx in dev_xs:
        n += 1
        tag = f"{n:02d}"
        # desk with 2 monitors
        parts = [
            (0, 0, 0.70, 1.6, 0.8, 0.05, M["oak"], 0.01),
            (-0.72, 0, 0.0, 0.05, 0.7, 0.70, M["metal"]),
            (0.72, 0, 0.0, 0.05, 0.7, 0.70, M["metal"]),
            (0, -0.33, 0.30, 1.4, 0.03, 0.4, M["metal"]),
            (-0.35, -0.2, 0.75, 0.22, 0.2, 0.02, M["black"]),
            (0.35, -0.2, 0.75, 0.22, 0.2, 0.02, M["black"]),
            (-0.35, -0.2, 0.77, 0.04, 0.04, 0.15, M["black"]),
            (0.35, -0.2, 0.77, 0.04, 0.04, 0.15, M["black"]),
            (-0.35, -0.2, 0.92, 0.6, 0.04, 0.36, M["black"]),
            (0.35, -0.2, 0.92, 0.6, 0.04, 0.36, M["black"]),
            (-0.35, -0.17, 0.94, 0.54, 0.01, 0.32, M["screen"]),
            (0.35, -0.17, 0.94, 0.54, 0.01, 0.32, M["screen"]),
            (0, 0.18, 0.75, 0.42, 0.14, 0.02, M["black"]),
        ]
        # the user sits on the +z side looking toward -z: monitors at the back (lz<0) with the screen facing +z
        desk = L.furn(coll, f"desk_dev_{tag}", dx, dz, 0.0, parts)
        # chair
        cz = dz + 0.95
        chair_parts = [
            (0, 0, 0.45, 0.46, 0.46, 0.06, M["fabric"], 0.01),
            (0, 0.22, 0.51, 0.44, 0.06, 0.48, M["fabric"], 0.01),
            (0, 0, 0.04, 0.06, 0.06, 0.41, M["metal"]),
            (0, 0, 0.0, 0.52, 0.05, 0.04, M["metal"]),
            (0, 0, 0.0, 0.05, 0.52, 0.04, M["metal"]),
        ]
        seat = L.furn(coll, f"seat_dev_{tag}", dx, cz, 0.0, chair_parts)
        objs += [desk, seat]
        cols.add(f"Desk_dev_{tag}", dx, dz, 0.0, 1.6, 0.8, 0.75)
        stations.append({
            "id": f"station_dev_{tag}", "job": "dev", "seat": f"seat_dev_{tag}", "desk": f"desk_dev_{tag}",
            "position": [dx, 0.0, cz], "yaw": 0.0, "lookAt": [dx, 1.0, dz],
        })

# -------- meeting room (glass), east back corner
for (nm, ax, fixed, a0, a1, ops) in [
    ("Glass_Meet_Front", "x", -6.6, 2.9, 7.0, [(3.7, 4.7, 0.0, 2.2)]),
    ("Glass_Meet_Side", "z", 2.9, -9.0, -6.6, []),
]:
    objs += L.wall(coll, nm, ax, fixed, 0.05, a0, a1, H, M["glass"], openings=ops, cols=cols, col_tag=nm)
mt = L.furn(coll, "MeetingTable", 5.0, -7.8, 0.0, [
    (0, 0, 0.72, 2.4, 0.9, 0.05, M["oak"], 0.01),
    (-0.9, 0, 0.0, 0.08, 0.7, 0.72, M["metal"]),
    (0.9, 0, 0.0, 0.08, 0.7, 0.72, M["metal"]),
])
objs.append(mt)
cols.add("MeetingTable", 5.0, -7.8, 0.0, 2.4, 0.9, 0.77)
objs.append(L.box(coll, "Wall_Whiteboard", 5.0, Z0 + 0.04, 1.0, 2.6, 0.04, 1.2, M["board"]))
mn = 0
for xx in (4.2, 5.0, 5.8):
    mn += 1
    cfront = [(0, 0, 0.45, 0.46, 0.46, 0.06, M["fabric"], 0.01), (0, 0.22, 0.51, 0.44, 0.06, 0.48, M["fabric"], 0.01),
              (0, 0, 0.04, 0.06, 0.06, 0.41, M["metal"]), (0, 0, 0.0, 0.52, 0.05, 0.04, M["metal"]), (0, 0, 0.0, 0.05, 0.52, 0.04, M["metal"])]
    objs.append(L.furn(coll, f"seat_meeting_{mn:02d}", xx, -7.0, 0.0, cfront))
    mn += 1
    objs.append(L.furn(coll, f"seat_meeting_{mn:02d}", xx, -8.6, math.pi, cfront))

# -------- server room (glass), west back corner
for (nm, ax, fixed, a0, a1, ops) in [
    ("Glass_Server_Front", "x", -6.6, -7.0, -2.9, [(-4.4, -3.4, 0.0, 2.2)]),
    ("Glass_Server_Side", "z", -2.9, -9.0, -6.6, []),
]:
    objs += L.wall(coll, nm, ax, fixed, 0.05, a0, a1, H, M["glass"], openings=ops, cols=cols, col_tag=nm)
for i, xx in enumerate((-6.2, -5.0, -3.8)):
    rack = L.furn(coll, f"ServerRack_{i + 1:02d}", xx, -8.35, 0.0, [
        (0, 0, 0.0, 0.8, 0.9, 2.0, M["rack"], 0.01),
        (-0.1, 0.46, 1.4, 0.5, 0.02, 0.05, M["led"]),
        (-0.1, 0.46, 1.1, 0.5, 0.02, 0.05, M["led"]),
        (-0.1, 0.46, 0.8, 0.5, 0.02, 0.05, M["led"]),
    ])
    objs.append(rack)
    cols.add(f"ServerRack_{i + 1:02d}", xx, -8.35, 0.0, 0.8, 0.9, 2.0)

# -------- lounge (front left) + plants + coffee counter
sofa = L.furn(coll, "Sofa", -6.2, 2.5, -math.pi / 2, [
    (0, 0, 0.0, 2.0, 0.9, 0.42, M["sofa"], 0.03),
    (0, 0.38, 0.42, 2.0, 0.16, 0.45, M["sofa"], 0.03),
    (-0.92, 0, 0.42, 0.16, 0.9, 0.22, M["sofa"], 0.03),
    (0.92, 0, 0.42, 0.16, 0.9, 0.22, M["sofa"], 0.03),
])
objs.append(sofa)
cols.add("Sofa", -6.2, 2.5, 0.0, 0.9, 2.0, 0.85)
ct = L.furn(coll, "CoffeeTable", -4.6, 2.5, 0.0, [
    (0, 0, 0.38, 0.9, 0.6, 0.05, M["oak"], 0.01),
    (-0.38, -0.22, 0.0, 0.05, 0.05, 0.38, M["metal"]), (0.38, -0.22, 0.0, 0.05, 0.05, 0.38, M["metal"]),
    (-0.38, 0.22, 0.0, 0.05, 0.05, 0.38, M["metal"]), (0.38, 0.22, 0.0, 0.05, 0.05, 0.38, M["metal"]),
])
objs.append(ct)
cols.add("CoffeeTable", -4.6, 2.5, 0.0, 0.9, 0.6, 0.43)
counter = L.furn(coll, "Counter_Coffee", 5.6, 4.3, 0.0, [
    (0, 0, 0.0, 2.2, 0.6, 0.9, M["marble"], 0.01),
    (-0.6, 0, 0.9, 0.35, 0.3, 0.3, M["metal"], 0.01),
])
objs.append(counter)
cols.add("Counter_Coffee", 5.6, 4.3, 0.0, 2.2, 0.6, 1.2)
for i, (px, pz) in enumerate([(-6.4, 4.4), (6.4, 0.6), (-6.4, -6.0 + 0.0)]):
    plant = L.furn(coll, f"Plant_{i + 1:02d}", px, pz, 0.0, [
        (0, 0, 0.0, 0.4, 0.4, 0.4, M["pot"], 0.03),
        (0, 0, 0.4, 0.5, 0.5, 0.5, M["leaf"], 0.08),
        (0, 0, 0.9, 0.35, 0.35, 0.4, M["leaf"], 0.06),
    ])
    objs.append(plant)
    cols.add(f"Plant_{i + 1:02d}", px, pz, 0.0, 0.4, 0.4, 1.0)

# ---- checks + export
bad = L.check_grounded(objs, allow=("House_Floor", "Door_", "Light_", "Wall_", "Walls_", "Glass_", "Entry_", "Sky_"))
print("INTERIOR grounded violations:", bad)
assert not bad, bad

L.export_glb(os.path.join(OUT, "interior.glb"), objs)
L.export_glb(os.path.join(OUT, "interior.colsrc.glb"), objs + cols.items)
L.write_json(os.path.join(OUT, "interior.layout.json"), {
    "version": 1, "key": KEY, "job": "dev", "name": "Tech Hub",
    "spawn": [0.0, 1.6, 3.7], "exit": {"position": [0.0, 4.75], "radius": 1.4},
    "stations": stations,
    "seats": [{"id": f"seat_meeting_{i:02d}", "job": None} for i in range(1, 7)],
})
print("interior objects:", len(objs), "collision boxes:", len(cols.items), "stations:", len(stations))
