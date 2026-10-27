"""Builds the mini town (TOWN) around a central town hall, with 10 house lots.

Exports:
  out/town/town.glb           visual map (ground, roads, town hall, props) - houses are NOT baked in:
                              the game places houses/<key>/exterior.glb from town.layout.json
  out/town/town.colsrc.glb    COL_* boxes for everything, houses included -> town.collision.json
  public/assets/town/town.layout.json   spawn + house transforms + door points (game coords)
Requires build_houses.py to have run (EXT_<key> collections + HOUSES list).
"""
import bpy, math, os, json
from mathutils import Vector
exec(open(r"C:\Users\Utilisateur\CampusCove\map-src\CampusCove\lib\cc_lib.py").read())
_hg = {"__name__": "houses_defs"}
_src = open(os.path.join(ROOT, "build_houses.py"), encoding="utf-8").read()
exec(_src.split("# ================================================================ EXTERIOR")[0], _hg)
HOUSES = _hg["HOUSES"]

C = reset_coll("TOWN")
CC = reset_coll("TOWN_COL", C)
PV = reset_coll("TOWN_PREVIEW_HOUSES")   # instances for renders only (not exported)

M = {
    "grass": mat("TW_Grass", "T_Grass", tile=4.0, rough=1.0),
    "cobble": mat("TW_Cobble", "T_Cobble", tile=3.0, rough=0.9),
    "paving": mat("TW_Paving", "T_Paving", tile=2.0, rough=0.9),
    "asphalt": mat("TW_Asphalt", "T_Asphalt", tile=4.0, rough=0.95),
    "curb": mat("TW_Curb", "T_Concrete", tile=2.0, rough=0.8),
    "line": mat("TW_RoadLine", color=(0.95, 0.9, 0.7), rough=0.6),
    "stone": mat("TW_Stone", "T_StoneBlock", tile=2.0, rough=0.85),
    "marble": mat("TW_Marble", "T_Marble", tile=1.5, rough=0.3),
    "roof": mat("TW_RoofSlate", "T_RoofSlate", tile=2.0, rough=0.85),
    "trim": mat("TW_Trim", color=(0.93, 0.92, 0.88), rough=0.45),
    "door": mat("TW_Door", "T_WoodGrain", tile=1.2, rough=0.45),
    "glass": mat("TW_Glass", color=(0.2, 0.3, 0.42), rough=0.08, metal=0.3),
    "glass_lit": mat("TW_GlassLit", color=(1.0, 0.86, 0.6), rough=0.2, emit=(1.0, 0.8, 0.5), emit_str=0.8),
    "gold": mat("TW_Gold", color=(1.0, 0.78, 0.35), rough=0.3, metal=1.0),
    "clock": mat("TW_ClockFace", color=(0.98, 0.96, 0.9), rough=0.4, emit=(1.0, 0.95, 0.85), emit_str=0.6),
    "dark": mat("TW_MetalDark", color=(0.08, 0.09, 0.1), rough=0.4, metal=0.6),
    "lamp": mat("TW_LampGlow", color=(1.0, 0.95, 0.85), emit=(1.0, 0.9, 0.7), emit_str=3.0),
    "wood": mat("TW_Wood", "T_WoodGrain", tile=1.0, rough=0.6),
    "flag": mat("TW_Flag", color=(0.15, 0.35, 0.75), rough=0.8),
    "flag2": mat("TW_FlagStar", color=(0.98, 0.85, 0.3), rough=0.8),
    "water": mat("TW_Water", color=(0.25, 0.55, 0.75), rough=0.05, alpha=0.75),
    "leaf": mat("TW_Leaf", color=(0.2, 0.48, 0.22), rough=0.85),
    "leaf2": mat("TW_LeafLight", color=(0.4, 0.65, 0.28), rough=0.85),
    "bark": mat("TW_Bark", color=(0.36, 0.25, 0.16), rough=0.9),
    "hedge": mat("TW_Hedge", "T_Hedge", tile=1.5, rough=1.0),
    "flowers": mat("TW_Flowers", color=(0.95, 0.5, 0.6), rough=0.8),
    "sign": mat("TW_SignBoard", color=(0.12, 0.22, 0.32), rough=0.5),
}

R_PLAZA, R_SIDE_IN, R_ROAD_IN, R_ROAD_OUT, R_SIDE_OUT, R_DOOR, R_HEDGE = 15.0, 17.0, 17.0, 22.0, 24.0, 30.0, 46.0


def ring(name, r0, r1, z0, z1, m, seg=96):
    import bmesh
    bm = bmesh.new()
    rings = []
    for z in (z0, z1):
        inner = [bm.verts.new((r0 * math.cos(2 * math.pi * i / seg), r0 * math.sin(2 * math.pi * i / seg), z)) for i in range(seg)]
        outer = [bm.verts.new((r1 * math.cos(2 * math.pi * i / seg), r1 * math.sin(2 * math.pi * i / seg), z)) for i in range(seg)]
        rings.append((inner, outer))
    (bi, bo), (ti, to) = rings
    for i in range(seg):
        j = (i + 1) % seg
        bm.faces.new((ti[i], to[i], to[j], ti[j]))
        bm.faces.new((bo[i], bo[j], to[j], to[i]))
        bm.faces.new((bi[j], bi[i], ti[i], ti[j]))
    return _finish(name, bm, (0, 0, 0), [m], C)


def pos(r, a, z=0.0):
    return (r * math.cos(a), r * math.sin(a), z)


# ---------------------------------------------------------------- ground, plaza, roads
cyl("Ground", (0, 0, -0.1), 80.0, 0.2, M["grass"], C, seg=72)
cyl("Plaza", (0, 0, 0.0), R_PLAZA, 0.12, M["cobble"], C, seg=96)                 # top 0.06
ring("Plaza_Curb", R_PLAZA, R_PLAZA + 0.3, 0.0, 0.14, M["curb"])
ring("Road", R_ROAD_IN + 0.3, R_ROAD_OUT, 0.0, 0.03, M["asphalt"])
ring("Sidewalk_Out", R_ROAD_OUT, R_SIDE_OUT, 0.0, 0.12, M["paving"])
ring("Road_Line", (R_ROAD_IN + R_ROAD_OUT) / 2 - 0.08, (R_ROAD_IN + R_ROAD_OUT) / 2 + 0.08, 0.0, 0.035, M["line"], seg=96)
# crosswalk toward the spawn (south)
for i in range(6):
    x = -2.5 + i * 1.0
    box("Crosswalk", (x, -(R_ROAD_IN + R_ROAD_OUT) / 2, 0.036), (0.5, R_ROAD_OUT - R_ROAD_IN - 0.4, 0.01), M["line"], C)

# ---------------------------------------------------------------- town hall (centre, front faces -Y)
TH_W, TH_D, TH_H = 16.0, 10.0, 7.0
P = [box("TH_Base", (0, 0, 0.35), (TH_W + 0.6, TH_D + 0.6, 0.7), M["stone"], C),
     box("TH_Walls", (0, 0, 0.7 + TH_H / 2), (TH_W, TH_D, TH_H), M["stone"], C),
     box("TH_Cornice", (0, 0, 0.7 + TH_H + 0.15), (TH_W + 0.5, TH_D + 0.5, 0.3), M["trim"], C)]
P.append(prism_roof("TH_Roof", 0, 0, 0.7 + TH_H + 0.3, TH_W, TH_D, 2.6, M["roof"], C, overhang=0.3, ridge_axis="x", end_mat=M["stone"]))
# portico: steps, columns, pediment
fy = -TH_D / 2
for i in range(4):
    P.append(box("TH_Step", (0, fy - 3.0 + i * 0.6 + 0.3, 0.09 + i * 0.17), (9.0 - i * 0.4, 0.6 * (4 - i) + 0.6, 0.18 + i * 0.0), M["marble"], C))
P.append(box("TH_PorticoFloor", (0, fy - 1.3, 0.62), (8.0, 2.6, 0.16), M["marble"], C))
for x in (-3.3, -1.1, 1.1, 3.3):
    P.append(cyl("TH_Column", (x, fy - 2.2, 0.7 + 2.9), 0.32, 5.8, M["marble"], C, seg=14))
    P.append(box("TH_ColumnCap", (x, fy - 2.2, 0.7 + 5.85), (0.85, 0.85, 0.2), M["trim"], C))
P.append(box("TH_Entablature", (0, fy - 1.3, 0.7 + 6.2), (8.4, 2.9, 0.6), M["trim"], C))
P.append(prism_roof("TH_Pediment", 0, fy - 1.3, 0.7 + 6.5, 8.4, 2.9, 1.6, M["roof"], C, overhang=0.15, ridge_axis="y", end_mat=M["trim"]))
P += [box("TH_DoorFrame", (0, fy - 0.05, 0.7 + 1.7), (2.6, 0.1, 3.4), M["trim"], C),
      box("TH_Door", (0, fy - 0.1, 0.7 + 1.6), (2.2, 0.08, 3.2), M["door"], C),
      box("TH_DoorGlass", (0, fy - 0.15, 0.7 + 2.9), (1.8, 0.02, 0.5), M["glass_lit"], C)]
for x in (-6.0, -4.2, 4.2, 6.0):
    for z in (2.4, 5.4):
        P += [box("TH_WinFrame", (x, fy - 0.03, 0.7 + z), (1.3, 0.06, 2.1), M["trim"], C),
              box("TH_Win", (x, fy - 0.07, 0.7 + z), (1.05, 0.04, 1.8), M["glass_lit"] if (x + z) % 3 < 1 else M["glass"], C)]
for side in (-1, 1):
    for y in (-2.5, 0, 2.5):
        for z in (2.4, 5.4):
            P += [box("TH_WinFrameS", (side * (TH_W / 2 + 0.03), y, 0.7 + z), (0.06, 1.3, 2.1), M["trim"], C),
                  box("TH_WinS", (side * (TH_W / 2 + 0.07), y, 0.7 + z), (0.04, 1.05, 1.8), M["glass"], C)]
# clock tower
tz = 0.7 + TH_H + 0.3
P += [box("TH_Tower", (0, 1.0, tz + 2.6), (3.6, 3.6, 5.2), M["stone"], C),
      box("TH_TowerCornice", (0, 1.0, tz + 5.3), (4.0, 4.0, 0.25), M["trim"], C)]
P.append(prism_roof("TH_TowerRoof", 0, 1.0, tz + 5.4, 3.6, 3.6, 2.4, M["roof"], C, overhang=0.25, ridge_axis="x", end_mat=M["stone"]))
for ang, (dx, dy) in ((0, (0, -1)), (90, (1, 0)), (180, (0, 1)), (270, (-1, 0))):
    cx, cy = dx * 1.82, 1.0 + dy * 1.82
    face = cyl("TH_Clock", (cx, cy, tz + 3.4), 1.0, 0.06, M["clock"], C, seg=24, rot=(math.pi / 2, 0, math.radians(ang)))
    hand1 = box("TH_ClockHandH", (cx + dx * 0.04, cy + dy * 0.04, tz + 3.65), (0.08 if dy else 0.02, 0.02 if dy else 0.08, 0.5), M["dark"], C)
    hand2 = box("TH_ClockHandM", (cx + dx * 0.05 + (0.3 if dy else 0), cy + dy * 0.05 + (0 if dy else 0.3), tz + 3.4),
                (0.6 if dy else 0.02, 0.02 if dy else 0.6, 0.06), M["dark"], C)
    P += [face, hand1, hand2]
P.append(cyl("TH_Spire", (0, 1.0, tz + 8.4), 0.05, 1.6, M["gold"], C, seg=8))
P.append(sphere("TH_SpireBall", (0, 1.0, tz + 9.25), 0.18, M["gold"], C, seg=10))
town_hall = join(P, "TownHall")
text_mesh("TownHall_Sign", "TOWN HALL", (0, fy - 2.82, 0.7 + 6.2), 0.55, M["gold"], C, extrude=0.04)
# flag poles either side of the steps
for sx in (-1, 1):
    join([cyl("FlagPole", (sx * 5.6, fy - 3.4, 4.0), 0.07, 8.0, M["trim"], C, seg=8),
          box("Flag", (sx * 5.6 + 0.8, fy - 3.4, 7.2), (1.5, 0.04, 1.0), M["flag"], C),
          box("FlagStar", (sx * 5.6 + 0.8, fy - 3.43, 7.2), (0.4, 0.02, 0.4), M["flag2"], C)], f"FlagPole_{sx + 1}")
col_box("TownHall", (0, 0, 4.0), (TH_W + 0.6, TH_D + 0.6, 8.0), CC)
col_box("TownHall_Portico", (0, fy - 1.3, 3.5), (8.0, 2.6, 7.0), CC)
for x in (-3.3, -1.1, 1.1, 3.3):
    col_box(f"TH_Column_{x}", (x, fy - 2.2, 3.0), (0.64, 0.64, 6.0), CC)
for sx in (-1, 1):
    col_box(f"FlagPole_{sx}", (sx * 5.6, fy - 3.4, 2.0), (0.3, 0.3, 4.0), CC)

# ---------------------------------------------------------------- plaza furniture
def fountain(name, x, y):
    parts = [cyl(name + "_Basin", (x, y, 0.3), 1.6, 0.5, M["marble"], C, seg=24),
             cyl(name + "_Water", (x, y, 0.52), 1.45, 0.04, M["water"], C, seg=24),
             cyl(name + "_Column", (x, y, 0.9), 0.25, 1.2, M["marble"], C, seg=12),
             cyl(name + "_Bowl", (x, y, 1.55), 0.7, 0.2, M["marble"], C, seg=16, r2=0.45)]
    join(parts, name)
    col_box(name, (x, y, 0.5), (3.2, 3.2, 1.0), CC)


fountain("Fountain_W", -10.0, -6.0)
fountain("Fountain_E", 10.0, -6.0)


def bench(name, x, y, rot):
    parts = [box("Seat", (0, 0, 0.45), (1.8, 0.5, 0.08), M["wood"], C), box("Back", (0, 0.24, 0.75), (1.8, 0.06, 0.45), M["wood"], C),
             box("LegL", (-0.75, 0, 0.22), (0.08, 0.5, 0.44), M["dark"], C), box("LegR", (0.75, 0, 0.22), (0.08, 0.5, 0.44), M["dark"], C)]
    o = join(parts, name)
    o.location = (x, y, 0.06)
    o.rotation_euler = (0, 0, rot)
    col_box(name, (x, y, 0.5), (1.9, 0.6, 1.0), CC, rot_z=rot)


for i, a in enumerate((math.radians(-135), math.radians(-45), math.radians(160), math.radians(20))):
    x, y, _ = pos(12.5, a)
    bench(f"Bench_Plaza_{i}", x, y, a + math.pi / 2)


def planter_tree(name, x, y, s=1.0):
    parts = [box(name + "_Planter", (x, y, 0.35), (1.6, 1.6, 0.7), M["stone"], C),
             box(name + "_Soil", (x, y, 0.71), (1.4, 1.4, 0.02), M["bark"], C),
             cyl(name + "_Trunk", (x, y, 1.6 * s), 0.14 * s, 1.8 * s, M["bark"], C, seg=8),
             sphere(name + "_Crown", (x, y, 3.0 * s), 1.2 * s, M["leaf"], C, seg=10, smooth=False),
             sphere(name + "_Crown2", (x + 0.4, y - 0.3, 2.7 * s), 0.8 * s, M["leaf2"], C, seg=8, smooth=False)]
    join(parts, name)
    col_box(name, (x, y, 0.5), (1.6, 1.6, 1.0), CC)


for i, (x, y) in enumerate(((-11.0, 7.0), (11.0, 7.0), (-7.0, 11.5), (7.0, 11.5))):
    planter_tree(f"PlazaTree_{i}", x, y)


def street_lamp(name, x, y):
    join([cyl("Base", (x, y, 0.2), 0.16, 0.4, M["dark"], C, seg=10), cyl("Pole", (x, y, 2.2), 0.06, 4.0, M["dark"], C, seg=8),
          sphere("Globe", (x, y, 4.35), 0.26, M["lamp"], C, seg=10), cyl("Cap", (x, y, 4.62), 0.28, 0.07, M["dark"], C, seg=10, r2=0.05)], name)
    col_box(name, (x, y, 1.0), (0.35, 0.35, 2.0), CC)


for i in range(20):
    a = (i + 0.5) * 2 * math.pi / 20
    x, y, _ = pos(R_SIDE_OUT - 0.6, a)
    street_lamp(f"Lamp_Out_{i:02d}", x, y)
for i in range(8):
    a = i * 2 * math.pi / 8 + math.pi / 8
    x, y, _ = pos(R_PLAZA - 0.8, a)
    if y < -4 and abs(x) < 6:      # keep the town-hall steps clear
        continue
    street_lamp(f"Lamp_Plaza_{i}", x, y)

# welcome sign by the spawn
join([box("SignPostL", (-1.3, -R_PLAZA + 0.8, 1.0), (0.12, 0.12, 2.0), M["wood"], C),
      box("SignPostR", (1.3, -R_PLAZA + 0.8, 1.0), (0.12, 0.12, 2.0), M["wood"], C),
      box("SignBoard", (0, -R_PLAZA + 0.8, 1.75), (3.0, 0.1, 0.8), M["sign"], C)], "WelcomeSign")
text_mesh("WelcomeSign_Text", "CAMPUS COVE", (0, -R_PLAZA + 0.74, 1.75), 0.38, M["gold"], C, extrude=0.02)
col_box("WelcomeSign", (0, -R_PLAZA + 0.8, 1.0), (3.0, 0.3, 2.0), CC)

# ---------------------------------------------------------------- house lots
layout_houses = []
angles = [math.radians(-72 + 36 * k) for k in range(10)]
for h, a in zip(HOUSES, angles):
    D, W = h["D"], h["W"]
    rc = R_DOOR + D / 2
    cx, cy, _ = pos(rc, a)
    rot = a - math.pi / 2                     # house front (-Y) faces the town centre
    # path from the sidewalk to the door + lot lawn edging
    pmid = (R_SIDE_OUT + R_DOOR - 0.9) / 2
    px, py, _ = pos(pmid, a)
    path = box(f"Path_{h['key']}", (px, py, 0.03), (R_DOOR - 0.9 - R_SIDE_OUT, 1.6, 0.06), M["paving"], C, rot_z=a)
    bpy.context.view_layer.update()
    box_uv(path)
    # mailbox at the end of the path
    mx, my, _ = pos(R_SIDE_OUT + 0.6, a + 0.06)
    join([box("MailPost", (mx, my, 0.5), (0.08, 0.08, 1.0), M["wood"], C),
          box("MailBox", (mx, my, 1.05), (0.25, 0.4, 0.25), M["flag"], C, bevel=0.03)], f"Mailbox_{h['key']}")
    col_box(f"Mailbox_{h['key']}", (mx, my, 0.6), (0.3, 0.45, 1.2), CC, rot_z=a)
    # collision for the house body (porch posts / steps are low or thin)
    col_box(f"House_{h['key']}", (cx, cy, 2.0), (W + 0.2, D + 0.2, 4.0), CC, rot_z=rot)
    # preview instance (render only)
    inst = bpy.data.objects.new(f"PV_{h['key']}", None)
    inst.instance_type = 'COLLECTION'
    inst.instance_collection = bpy.data.collections[f"EXT_{h['key']}"]
    inst.location = (cx, cy, 0)
    inst.rotation_euler = (0, 0, rot)
    PV.objects.link(inst)
    door_r = R_DOOR - 0.8                     # stand point in front of the door step
    dx, dy, _ = pos(door_r, a)
    layout_houses.append({
        "key": h["key"], "name": h["name"],
        "position": [round(cx, 3), 0.0, round(-cy, 3)],
        "rotationY": round(rot, 5),
        "door": [round(dx, 3), 1.25, round(-dy, 3)],
        "offer": h["offer"], "price": h["price"],
    })

# trees between lots + hedge ring
for k, a in enumerate(angles):
    for j, (dr, da) in enumerate(((3.0, 0.5), (8.0, 0.5))):
        ta = a + math.radians(18) * (1 if j == 0 else 1)
        x, y, _ = pos(R_DOOR + dr, ta)
        s = 0.9 + 0.25 * ((k + j) % 3) / 2
        join([cyl("Trunk", (x, y, 1.3 * s), 0.2 * s, 2.6 * s, M["bark"], C, seg=8),
              sphere("Crown", (x, y, 3.5 * s), 1.7 * s, M["leaf"], C, seg=10, smooth=False),
              sphere("Crown2", (x + 0.6, y - 0.5, 3.0 * s), 1.1 * s, M["leaf2"], C, seg=8, smooth=False)], f"Tree_{k}_{j}")
        col_box(f"Tree_{k}_{j}", (x, y, 1.0), (0.6, 0.6, 2.0), CC)
hedges = []
for i in range(48):
    a = (i + 0.5) * 2 * math.pi / 48
    x, y, _ = pos(R_HEDGE, a)
    hb = box("Hedge", (x, y, 0.8), (1.0, 2 * math.pi * R_HEDGE / 48 + 0.1, 1.6), M["hedge"], C, bevel=0.15, rot_z=a)
    hedges.append(hb)
    col_box(f"Hedge_{i:02d}", (x, y, 0.8), (1.0, 2 * math.pi * R_HEDGE / 48 + 0.1, 1.6), CC, rot_z=a)
bpy.context.view_layer.update()
for hb in hedges:
    box_uv(hb)
join(hedges, "HedgeRing")

# skyline backdrop (inward-facing cylinder; "Sky" names never collide)
import bmesh
seg, Rsky, z0, z1 = 64, 75.0, -2.0, 30.0
bm = bmesh.new()
lo = [bm.verts.new((Rsky * math.cos(2 * math.pi * i / seg), Rsky * math.sin(2 * math.pi * i / seg), z0)) for i in range(seg)]
hi = [bm.verts.new((Rsky * math.cos(2 * math.pi * i / seg), Rsky * math.sin(2 * math.pi * i / seg), z1)) for i in range(seg)]
uvl = bm.loops.layers.uv.new("UVMap")
for i in range(seg):
    j = (i + 1) % seg
    f = bm.faces.new((lo[j], lo[i], hi[i], hi[j]))
    for lp in f.loops:
        k = lo.index(lp.vert) if lp.vert in lo else hi.index(lp.vert)
        if k == 0 and i == seg - 1:
            k = seg
        lp[uvl].uv = (3.0 * k / seg, 0.0 if lp.vert in lo else 1.0)
sky = mat("TW_SkyBackdrop", "T_SkyBackdrop", rough=1.0, emit=(1, 1, 1), emit_str=1.0)
nt = sky.node_tree
nt.links.new(nt.nodes["Image Texture"].outputs[0], nt.nodes["Principled BSDF"].inputs["Emission Color"])
_finish("Sky_Ring", bm, (0, 0, 0), [sky], C, uv=False)

for o in C.objects:
    if o.type == 'MESH':
        for poly in o.data.polygons:
            poly.use_smooth = False

# ---------------------------------------------------------------- export
out = os.path.join(ROOT, "out", "town")
s1 = export_collection("TOWN", os.path.join(out, "town.glb"))
s2 = export_collection("TOWN_COL", os.path.join(out, "town.colsrc.glb"))
layout = {
    "version": 1,
    "spawn": [0.0, 1.6, round(R_PLAZA - 2.0, 2)],
    "spawnYaw": 0.0,
    "townHall": {"position": [0.0, 0.0, 0.0]},
    "houses": layout_houses,
}
os.makedirs(os.path.join(PUBLIC, "town"), exist_ok=True)
with open(os.path.join(PUBLIC, "town", "town.layout.json"), "w") as fh:
    fh.write(json.dumps(layout, indent=2))
result = {"town_bytes": s1, "col_bytes": s2, "houses": len(layout_houses)}
