"""Cove Sports Park core site (docs/sports/MASTER_PLAN.md § 3-9): the road spur west of Cove Heights, the turning bulb,
the car park, the gate plaza, the bus stop, the fence with its main and service gates, the inside streets and the
site lawn with a hole at each venue footprint (lib_sports.FOOTPRINTS).

Run build_sports_reception.py first (it writes the pavilion layouts this script places).
Outputs: out/park/sports_site/{sports_road,sports_entrance,sports_reception,sports_complex}.glb + sports_site.layout.json,
then `npm run assets:optimize -- park sports_site` and `node scripts/apply-sports-site.mjs` (from front/).
"""
import importlib
import json
import math
import os
import random
import sys

if "__file__" not in globals():
    raise RuntimeError('Run with exec(open(p).read(), {"__file__": p}) so the script can find lib_common.py')
HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import lib_common as L
importlib.reload(L)
import lib_site as S
importlib.reload(S)
import lib_sports as SP
importlib.reload(SP)
import bmesh
import bpy

PI = math.pi
OUT = os.path.join(L.OUT_ROOT, "park", "sports_site")
RECEPTION_OUT = os.path.join(L.OUT_ROOT, "work", "sports_reception")
Y = SP.Y
ROAD_LINE_TOP = 0.06

FENCE = {"minX": -586.0, "maxX": -362.0, "minZ": -426.0, "maxZ": -186.0}
CLEAR = 3.0
ZONES = {
    "sports_road": {"minX": -429.5, "maxX": -258.95, "minZ": -151.95, "maxZ": -140.05},
    "sports_entrance": {"minX": -526.0, "maxX": -429.5, "minZ": -186.0, "maxZ": -140.05},
    "sports_reception": {"minX": -453.5, "maxX": -429.5, "minZ": -183.0, "maxZ": -155.0},
    "sports_complex": dict(FENCE),
}
ZONE_SPLIT_X = ZONES["sports_road"]["minX"]

ROAD_Z = -146.0
CARRIAGE = 3.0
ASPHALT_X1 = -257.0
BANDS_X1 = -258.95
SIDE_BANDS = (("curb", 0.0, 0.15), ("verge", 0.15, 1.15), ("walk", 1.15, 2.95))
BULB = (-474.0, -156.0)
BULB_R = 13.0
RING = {"curb": (13.0, 13.15), "verge": (13.15, 14.15), "walk": (14.15, 15.95)}
POLY_SEGMENTS = 64
AISLE_Z = (-159.0, -153.0)
CAR_PARK = (-526.0, -490.0, -166.0, -146.0)
CURB_W = 0.15
FOOTPATH = (-492.0, -490.0, -174.0, -166.0)
PLAZA = (-490.0, -453.5, -186.0, -172.0)
PLAZA_APRON_X = (-482.0, -466.0)
LINK_PATH = (-457.5, -453.5, -172.0, -151.95)
BUS = {"pole": (-457.0, -149.65), "bay": (-457.0, -445.0), "boarding": (-452.0, -150.6), "shelter": (-448.5, -153.6),
       "pad": (-453.5, -443.5, -154.95, -151.95)}

GATE_Z = FENCE["maxZ"]
GATE_PIERS = {"P1": (-477.6, -477.2), "P2": (-476.0, -475.6), "P3": (-474.4, -474.0), "P4": (-472.4, -472.0), "P5": (-470.8, -470.4)}
GATE_PASSAGES = {"E1": (-477.2, -476.0), "E2": (-475.6, -474.4), "W": (-474.0, -472.4), "X": (-472.0, -470.8)}
GATE_TRIGGER = {"minX": -477.6, "maxX": -472.4, "minZ": -188.5, "maxZ": -186.15}
SERVICE_GATE = (-404.0, -398.0)
FENCE_H = 2.4
POST_STEP = 2.5
PLINTH = (0.25, 0.20)

PROMENADE = (-479.0, -469.0, -310.0, -186.0)
PROMENADE_PAVING = (-478.0, -470.0)
C1 = (-583.0, -365.0, -250.0, -242.0)
C2 = (-583.0, -365.0, -310.0, -301.0)
SW_STREET = (-543.0, -537.0, -242.0, -189.0)
SE_STREET = (-404.0, -398.0, -242.0, GATE_Z)
UTILITY = (-580.0, -566.0, -270.0, -255.0)
UTILITY_GATE = (-574.5, -571.5)
EAST_GREEN = ((-414.0, -365.0, -301.0, -275.0), (-386.0, -365.0, -275.0, -250.0))

sc = L.new_build_scene("PARK_sports_site")
colls = {}
for key in ZONES:
    c = bpy.data.collections.new(key)
    sc.collection.children.link(c)
    colls[key] = c
road = S.Site(colls["sports_road"], "SportsRoad", seed=71)
ent = S.Site(colls["sports_entrance"], "SportsSite", seed=72)
rec = S.Site(colls["sports_reception"], "SportsReception", seed=73)
cpx = S.Site(colls["sports_complex"], "SportsSite", seed=74)

shared = SP.site_materials()
M = {
    "lawn": shared["lawn"],
    "paving": shared["paving"],
    "asphalt": L.make_mat("TW_SportsAsphalt", "#3b3c40", 0.95, "noise", 0.05),
    "curb": L.make_mat("TW_SportsCurbPaving", "#c9c2b2", 0.9, "noise", 0.04),
    "verge": L.make_mat("TW_SportsVergeGrass", "#78ad55", 1.0, "noise", 0.06),
    "walk": L.make_mat("TW_SportsWalkPaving", "#d8ccb2", 0.9, "tiles", 0.05, accent="#c4b79b"),
    "plaza": L.make_mat("TW_SportsPlazaPaving", "#e0d6c2", 0.9, "tiles", 0.05, accent="#cbbfa8"),
    "utility": L.make_mat("TW_SportsUtilityPaving", "#a9a7a1", 0.95, "noise", 0.04),
    "line": L.make_mat("TW_SportsRoadLine", "#efe8d6", 0.8, "noise", 0.02),
    "stall": L.make_mat("TW_SportsParkingLine", "#f2f0e6", 0.8, "noise", 0.02),
    "accessible": L.make_mat("TW_SportsAccessibleLine", "#2f6fb0", 0.8, "noise", 0.02),
    "iron": L.make_mat("TW_SportsFencePost", "#2e3236", 0.6, "noise", 0.02),
    "brass": L.make_mat("TW_SportsPadlock", "#c9a24a", 0.4, "noise", 0.03),
    "plinth": L.make_mat("TW_SportsFencePlinth", "#b9b7b1", 0.95, "noise", 0.03),
    "pier": L.make_mat("TW_SportsPierConcrete", "#d9d6cf", 0.9, "noise", 0.03),
    "reader": L.make_mat("TW_SportsReaderGlow", "#1f2a33", 0.4, "stripes", 0.0, accent="#3fd18a", emit="#3fd18a", emit_strength=0.8),
    "flap": L.make_mat("TW_SportsGateGlass", "#bfe4f2", 0.1, "noise", 0.01, alpha=0.35),
    "lamp": L.make_mat("TW_SportsLampGlow", "#fff1c4", 0.5, "noise", 0.0, emit="#ffd27a", emit_strength=1.4),
    "wood": L.make_mat("TW_SportsBenchWood", "#9c6b43", 0.85, "planks", 0.05, accent="#7e5433"),
    "sign": L.make_mat("TW_SportsSignBoard", "#2a9d8f", 0.7, "noise", 0.02),
    "sign_text": L.make_mat("TW_SportsSignText", "#f3f1ea", 0.8, "noise", 0.0),
    "frame": L.make_mat("TW_SportsShelterFrame", "#3a3f45", 0.5, "noise", 0.02),
    "glass": L.make_mat("TW_SportsShelterGlass", "#bfe4f2", 0.1, "noise", 0.01, alpha=0.35),
    "screen_wall": L.make_mat("TW_SportsScreenWall", "#b4b1a8", 0.9, "stripes", 0.03, accent="#a5a299"),
    "transformer": L.make_mat("TW_SportsTransformer", "#5f7d5a", 0.6, "stripes", 0.03, accent="#536f4f"),
    "cabinet": L.make_mat("TW_SportsTelecomCabinet", "#9aa3a8", 0.6, "noise", 0.02),
    "bin_green": L.make_mat("TW_SportsWasteBinGreen", "#3f7a4a", 0.7, "noise", 0.03),
    "bin_blue": L.make_mat("TW_SportsWasteBinBlue", "#2f5d8f", 0.7, "noise", 0.03),
    "bin_yellow": L.make_mat("TW_SportsWasteBinYellow", "#d9b13a", 0.7, "noise", 0.03),
    "trunk": L.make_mat("TW_SportsTrunk", "#7a5a3c", 0.85, "planks", 0.05, accent="#5c4229"),
    "leaf": L.make_mat("TW_SportsLeaf", "#6e9a4c", 0.9, "noise", 0.07),
    "leaf_light": L.make_mat("TW_SportsLeafLight", "#8fb262", 0.9, "noise", 0.07),
    "leaf_dark": L.make_mat("TW_SportsLeafDark", "#3f6b3c", 0.9, "noise", 0.06),
}


def fence_mesh_material():
    """Welded mesh panel: anthracite wires, transparent cells, alpha clipped (Math Round on the alpha) and double-sided."""
    name = "TW_SportsFence"
    size, wire = 64, 3
    img = bpy.data.images.get(name + "_tex") or bpy.data.images.new(name + "_tex", size, size, alpha=True)
    px = []
    for y in range(size):
        for x in range(size):
            on = (x % 16) < wire or (y % 32) < wire
            px.extend((0.18, 0.2, 0.22, 1.0) if on else (0.18, 0.2, 0.22, 0.0))
    img.pixels.foreach_set(px)
    img.pack()
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = False
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = "Closest"
    clip = nt.nodes.new("ShaderNodeMath")
    clip.operation = "ROUND"
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(tex.outputs["Alpha"], clip.inputs[0])
    nt.links.new(clip.outputs[0], bsdf.inputs["Alpha"])
    bsdf.inputs["Roughness"].default_value = 0.6
    return mat


M["fence"] = fence_mesh_material()
FENCE_TILE = 0.4


# ================================================================ geometry helpers
def poly(s, name, pts, y1, mat, y0=0.0, tile=2.0):
    """Flat slab whose outline is the game-space polygon pts [(x, z)], from y0 to y1."""
    bm = bmesh.new()
    top = [bm.verts.new(L.b(x, z, y1)) for x, z in pts]
    bot = [bm.verts.new(L.b(x, z, y0)) for x, z in pts]
    bm.faces.new(top)
    bm.faces.new(list(reversed(bot)))
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((bot[i], bot[j], top[j], top[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return s.add(S._mesh(s, name, bm, mat, tile))


def rect_minus(outer, holes):
    """Axis-aligned rectangle (x0, x1, z0, z1) minus holes, as disjoint rectangles (column sweep)."""
    x0, x1, z0, z1 = outer
    cuts = sorted({x0, x1, *[v for h in holes for v in (h[0], h[1]) if x0 < v < x1]})
    out = []
    for a, b in zip(cuts, cuts[1:]):
        mid = (a + b) / 2
        spans = sorted((max(h[2], z0), min(h[3], z1)) for h in holes if h[0] < mid < h[1] and h[2] < z1 and h[3] > z0)
        cur = z0
        for s0, s1 in spans:
            if s0 > cur:
                out.append((a, b, cur, s0))
            cur = max(cur, s1)
        if cur < z1:
            out.append((a, b, cur, z1))
    return out


STEP = 2 * PI / POLY_SEGMENTS


def ring_pt(r, a):
    """Point at game angle a on the POLY_SEGMENTS-gon of radius r around the bulb (vertices at k * STEP), so every
    ring band, the carriageway disc and the cuts share the same chords."""
    k = math.floor(a / STEP)
    t = a / STEP - k
    a0, a1 = k * STEP, (k + 1) * STEP
    x = (1 - t) * math.cos(a0) + t * math.cos(a1)
    z = (1 - t) * math.sin(a0) + t * math.sin(a1)
    return BULB[0] + r * x, BULB[1] + r * z


def arc(r, a0, a1):
    """Polygon points from angle a0 to a1 (either direction), with every vertex in between."""
    pts = [ring_pt(r, a0)]
    lo, hi = sorted((a0, a1))
    ks = [k for k in range(math.floor(lo / STEP) + 1, math.ceil(hi / STEP)) if lo < k * STEP < hi]
    if a1 < a0:
        ks.reverse()
    pts += [ring_pt(r, k * STEP) for k in ks]
    pts.append(ring_pt(r, a1))
    return pts


def angle_where(r, lo, hi, f):
    """Angle in [lo, hi] where f(point on the r polygon) crosses zero (bisection; f changes sign on the interval)."""
    flo = f(ring_pt(r, lo))
    for _ in range(60):
        mid = (lo + hi) / 2
        if (f(ring_pt(r, mid)) > 0) == (flo > 0):
            lo, flo = mid, f(ring_pt(r, mid))
        else:
            hi = mid
    return (lo + hi) / 2


def spur_corner_angle(d):
    """East side: where the spur's north band edge z = ROAD_Z - CARRIAGE - d meets the ring polygon of radius 13 + d."""
    z_line = ROAD_Z - CARRIAGE - d
    return angle_where(BULB_R + d, 0.0, PI / 2, lambda p: p[1] - z_line)


def west_cut_angle(r, z_line):
    """West side: where the ring polygon of radius r crosses z = z_line (angles around pi)."""
    return angle_where(r, PI / 2, 3 * PI / 2, lambda p: z_line - p[1])


def corner_curve(d0, d1, n=6):
    return [ring_pt(BULB_R + d, spur_corner_angle(d)) for d in (d0 + (d1 - d0) * i / n for i in range(n + 1))]


# ================================================================ spur (Cove Road west leg, extended to the bulb)
zc_n, zc_s = ROAD_Z - CARRIAGE, ROAD_Z + CARRIAGE
S.rect(road, "SR_Asphalt", ZONE_SPLIT_X, zc_n, ASPHALT_X1, zc_s, 0.0, Y["asphalt"], M["asphalt"])
a_corner = spur_corner_angle(0.0)
poly(ent, "SE_SpurAsphalt", [(ZONE_SPLIT_X, zc_s), (BULB[0], zc_s)] + arc(BULB_R, PI / 2, a_corner)[1:] + [(ZONE_SPLIT_X, zc_n)],
     Y["asphalt"], M["asphalt"])
S.dashed_line(road, "SR_CentreLine", (BANDS_X1 - 1.5, ROAD_Z), (ZONE_SPLIT_X, ROAD_Z), 0.12, Y["asphalt"], ROAD_LINE_TOP, M["line"])
S.dashed_line(ent, "SE_CentreLine", (ZONE_SPLIT_X, ROAD_Z), (-462.0, ROAD_Z), 0.12, Y["asphalt"], ROAD_LINE_TOP, M["line"])

bay_x0, bay_x1 = BUS["bay"]
SOUTH_VERGE_Z = zc_s + (SIDE_BANDS[1][1] + SIDE_BANDS[1][2]) / 2
for key, d0, d1 in SIDE_BANDS:
    top, mat = Y[key], M[key]
    sz0, sz1 = zc_s + d0, zc_s + d1
    S.rect(road, f"SR_South_{key}", ZONE_SPLIT_X, sz0, BANDS_X1, sz1, 0.0, top, mat)
    S.rect(ent, f"SE_South_{key}", BULB[0], sz0, ZONE_SPLIT_X, sz1, 0.0, top, mat)
    nz0, nz1 = zc_n - d1, zc_n - d0
    S.rect(road, f"SR_North_{key}", ZONE_SPLIT_X, nz0, BANDS_X1, nz1, 0.0, top, mat)
    corner = corner_curve(d0, d1)
    west = [(ZONE_SPLIT_X, nz1), corner[0][0:2]] + corner[1:] + [(ZONE_SPLIT_X, nz0)]
    if key == "verge":
        poly(ent, f"SE_North_{key}W", [(bay_x0, nz1), corner[0]] + corner[1:] + [(bay_x0, nz0)], top, mat)
        S.rect(ent, f"SE_North_{key}E", bay_x1, nz0, ZONE_SPLIT_X, nz1, 0.0, top, mat)
        S.rect(ent, "SE_BusBoarding", bay_x0, nz0, bay_x1, nz1, 0.0, Y["walk"], M["walk"])
    else:
        poly(ent, f"SE_North_{key}", west, top, mat)

# ================================================================ turning bulb
poly(ent, "SE_BulbAsphalt", [ring_pt(BULB_R, k * STEP) for k in range(POLY_SEGMENTS)], Y["asphalt"], M["asphalt"])
for key, (r0, r1) in RING.items():
    d0, d1 = r0 - BULB_R, r1 - BULB_R
    top, mat = Y[key], M[key]
    north = (arc(r1, spur_corner_angle(d1), west_cut_angle(r1, AISLE_Z[0]) - 2 * PI)
             + arc(r0, west_cut_angle(r0, AISLE_Z[0]) - 2 * PI, spur_corner_angle(d0)) + corner_curve(d0, d1)[1:-1])
    poly(ent, f"SE_Ring_{key}N", north, top, mat)
    south = arc(r1, west_cut_angle(r1, AISLE_Z[1]), PI / 2) + arc(r0, PI / 2, west_cut_angle(r0, AISLE_Z[1]))
    poly(ent, f"SE_Ring_{key}S", south, top, mat)
aisle_s = west_cut_angle(BULB_R, AISLE_Z[1])
aisle_n = west_cut_angle(BULB_R, AISLE_Z[0])
poly(ent, "SE_AisleAsphalt", [(CAR_PARK[1], AISLE_Z[0]), (CAR_PARK[1], AISLE_Z[1])] + arc(BULB_R, aisle_s, aisle_n), Y["asphalt"], M["asphalt"])

# ================================================================ car park (painted stalls, no cars)
cx0, cx1, cz0, cz1 = CAR_PARK
S.rect(ent, "SE_CarParkAsphalt", cx0, cz0, cx1, cz1, 0.0, Y["asphalt"], M["asphalt"])
S.rect(ent, "SE_CarParkCurbW", cx0 - CURB_W, cz0 - CURB_W, cx0, cz1 + CURB_W, 0.0, Y["curb"], M["curb"])
S.rect(ent, "SE_CarParkCurbS", cx0, cz1, cx1 + CURB_W, cz1 + CURB_W, 0.0, Y["curb"], M["curb"])
S.rect(ent, "SE_CarParkCurbN", cx0, cz0 - CURB_W, FOOTPATH[0], cz0, 0.0, Y["curb"], M["curb"])
S.rect(ent, "SE_CarParkCurbE0", cx1, cz0, cx1 + CURB_W, AISLE_Z[0], 0.0, Y["curb"], M["curb"])
S.rect(ent, "SE_CarParkCurbE1", cx1, AISLE_Z[1], cx1 + CURB_W, cz1, 0.0, Y["curb"], M["curb"])
LINE_W = 0.12
LINE_Y = (Y["asphalt"], Y["asphalt"] + 0.008)
stalls = []


def stall_row(tag, xs, z0, z1, mat_fill=None):
    for k, x in enumerate(xs):
        S.rect(ent, f"SE_Stall{tag}_Line{k:02d}", x - LINE_W / 2, z0, x + LINE_W / 2, z1, LINE_Y[0], LINE_Y[1], M["stall"])
    for k, (a, b) in enumerate(zip(xs, xs[1:])):
        stalls.append({"row": tag, "center": [round((a + b) / 2, 3), 0.0, round((z0 + z1) / 2, 3)], "size": [round(b - a, 2), round(z1 - z0, 2)],
                       "accessible": mat_fill is not None and k >= len(xs) - 3})


south_xs = [-522.0 + 2.5 * k for k in range(13)]
stall_row("S", south_xs, -153.0, -148.0)
north_xs = [-524.2 + 2.5 * k for k in range(11)] + [-495.6, -492.0]
stall_row("N", north_xs, -164.0, -159.0, M["accessible"])
for k, (a, b) in enumerate(((-499.2, -495.6), (-495.6, -492.0))):
    S.rect(ent, f"SE_StallAccessible{k}", a + LINE_W, -163.4, b - LINE_W, -159.6, LINE_Y[0], LINE_Y[1], M["accessible"])
S.rect(ent, "SE_Footpath", FOOTPATH[0], FOOTPATH[2], FOOTPATH[1], FOOTPATH[3], 0.0, Y["paving"], M["paving"])

# ================================================================ gate plaza, link path, bus stop
S.rect(ent, "SE_Plaza", PLAZA[0], PLAZA[2], PLAZA[1], PLAZA[3], 0.0, Y["plaza"], M["plaza"])
r_out = RING["walk"][1]
apron_e = angle_where(r_out, -PI / 2, 0.0, lambda p: p[0] - PLAZA_APRON_X[1])
apron_w = angle_where(r_out, -PI, -PI / 2, lambda p: PLAZA_APRON_X[0] - p[0])
poly(ent, "SE_PlazaApron", [(PLAZA_APRON_X[0], PLAZA[3]), (PLAZA_APRON_X[1], PLAZA[3])] + arc(r_out, apron_e, apron_w), Y["plaza"], M["plaza"])
S.rect(ent, "SE_LinkPath", LINK_PATH[0], LINK_PATH[2], LINK_PATH[1], LINK_PATH[3], 0.0, Y["paving"], M["paving"])
px0, px1, pz0, pz1 = BUS["pad"]
S.rect(ent, "SE_BusPad", px0, pz0, px1, pz1, 0.0, Y["walk"], M["walk"])
S.bus_shelter(ent, "SE_BusShelter", *BUS["shelter"], PI, "COVE SPORTS PARK", M)
pole_x, pole_z = BUS["pole"]
ent.add(L.cyl(ent.coll, "SE_BusStopPole", pole_x, pole_z, Y["walk"], 0.04, 2.9, M["iron"], seg=8))
ent.add(L.box(ent.coll, "SE_BusStopFlag", pole_x, pole_z + 0.03, 2.35, 0.5, 0.03, 0.5, M["sign"]))
for side, dz, flip in (("S", 0.05, 0.0), ("N", 0.01, PI)):
    t = L.text_mesh(ent.coll, f"SE_BusStopText{side}", "BUS", pole_x, pole_z + dz, 2.5, 0.18, 0.005, M["sign_text"], resolution=2)
    t.rotation_euler = (PI / 2, 0, flip)
    ent.add(t)
ent.col("BusStopPole", pole_x, pole_z, 0.2, 0.2, 2.0, y0=Y["walk"])

# ================================================================ lamps, signpost, trees (outside the fence)
for k, x in enumerate(range(-275, -456, -20)):
    site = road if x > ZONE_SPLIT_X else ent
    S.street_lamp(site, f"S{'R' if site is road else 'E'}_LampSpur{k:02d}", float(x), SOUTH_VERGE_Z, M)
for k, (x, z) in enumerate(((BULB[0], BULB[1] - 13.65), (-525.0, -156.0), (-488.0, -184.0), (-459.0, -184.0))):
    S.street_lamp(ent, f"SE_Lamp{k}", x, z, M)
S.signpost(road, "SR_Signpost", -262.0, SOUTH_VERGE_Z, [("Cove Sports Park", PI / 2), ("Cove Heights", 0.0)], M)
for k, (x, z) in enumerate(((-521.0, -179.0), (-511.0, -178.5), (-501.0, -179.0), (-521.0, -143.0), (-508.0, -143.2), (-495.0, -143.0))):
    S.tree(ent, f"SE_Tree{k:02d}", x, z, M, scale=1.0 + 0.08 * (k % 3))

# ================================================================ reception footprint ground
rx0, rx1, rz0, rz1 = (ZONES["sports_reception"][k] for k in ("minX", "maxX", "minZ", "maxZ"))
S.rect(rec, "SRc_Lawn", rx0, rz0, rx1, rz1, 0.0, Y["lawn"], M["lawn"], tile=3.0)
for k, (x, z) in enumerate(((-432.5, -160.0), (-432.5, -168.0), (-432.5, -178.5), (-446.0, -161.0))):
    S.tree(rec, f"SRc_Tree{k}", x, z, M, scale=0.9 + 0.1 * (k % 2))

# ================================================================ entrance lawn (around the reception footprint)
ex = ZONES["sports_entrance"]
for k, (a, b, c, d) in enumerate(rect_minus((ex["minX"], ex["maxX"], ex["minZ"], ex["maxZ"]), [(rx0, rx1, rz0, rz1)])):
    S.rect(ent, f"SE_Lawn{k}", a, c, b, d, 0.0, Y["lawn"], M["lawn"], tile=3.0)

# ================================================================ fenced site: lawn with holes at the venue footprints
for k, (a, b, c, d) in enumerate(rect_minus((FENCE["minX"], FENCE["maxX"], FENCE["minZ"], FENCE["maxZ"]), list(SP.FOOTPRINTS.values()))):
    S.rect(cpx, f"SC_Lawn{k:02d}", a, c, b, d, 0.0, Y["lawn"], M["lawn"], tile=3.0)


def paving(s, name, r, top=None, mat=None):
    x0, x1, z0, z1 = r
    S.rect(s, name, x0, z0, x1, z1, 0.0, top or Y["paving"], mat or M["paving"])


paving(cpx, "SC_PromenadeS", (PROMENADE_PAVING[0], PROMENADE_PAVING[1], C1[3], PROMENADE[3]))
paving(cpx, "SC_PromenadeN", (PROMENADE_PAVING[0], PROMENADE_PAVING[1], C2[3], C1[2]))
paving(cpx, "SC_StreetC1", C1)
paving(cpx, "SC_StreetC2", C2)
paving(cpx, "SC_StreetSW", SW_STREET)
paving(cpx, "SC_StreetSE", SE_STREET)
for key, r in SP.DOOR_STUBS.items():
    paving(cpx, f"SC_DoorStub_{key}", r)

# ---------------------------------------------------------------- fence
def fence_segment(name, axis, fixed, a0, a1, end_posts=(True, True)):
    ln = a1 - a0
    mid = (a0 + a1) / 2
    cx, cz = (mid, fixed) if axis == "x" else (fixed, mid)
    sx, sz = (ln, PLINTH[0]) if axis == "x" else (PLINTH[0], ln)
    cpx.add(L.box(cpx.coll, f"{name}_Plinth", cx, cz, 0.0, sx, sz, PLINTH[1], M["plinth"], tile=2.0))
    rx, rz = (ln, 0.05) if axis == "x" else (0.05, ln)
    cpx.add(L.box(cpx.coll, f"{name}_Rail", cx, cz, FENCE_H - 0.05, rx, rz, 0.05, M["iron"]))
    bm = bmesh.new()
    p = [(a0, PLINTH[1]), (a1, PLINTH[1]), (a1, FENCE_H - 0.05), (a0, FENCE_H - 0.05)]
    vs = [bm.verts.new(L.b(a, fixed, y) if axis == "x" else L.b(fixed, a, y)) for a, y in p]
    face = bm.faces.new(vs)
    uv = bm.loops.layers.uv.verify()
    for loop, (a, y) in zip(face.loops, p):
        loop[uv].uv = ((a - a0) / FENCE_TILE, (y - PLINTH[1]) / FENCE_TILE)
    me = bpy.data.meshes.new(f"{name}_Mesh")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(M["fence"])
    ob = bpy.data.objects.new(f"{name}_Mesh", me)
    cpx.coll.objects.link(ob)
    cpx.add(ob)
    n = max(1, math.ceil(ln / POST_STEP - 1e-6))
    posts = [L.box(cpx.coll, f"{name}_Post{k:03d}", *((a0 + ln * k / n, fixed) if axis == "x" else (fixed, a0 + ln * k / n)), PLINTH[1], 0.08, 0.08,
                   FENCE_H - PLINTH[1], M["iron"]) for k in range(n + 1) if (k > 0 or end_posts[0]) and (k < n or end_posts[1])]
    cpx.add(L.join(cpx.coll, f"{name}_Posts", posts))
    cx_, cz_ = (mid, fixed) if axis == "x" else (fixed, mid)
    cpx.col(name.replace("SC_", ""), cx_, cz_, ln if axis == "x" else 0.3, 0.3 if axis == "x" else ln, 2.6)


f = FENCE
fence_segment("SC_FenceN", "x", f["minZ"], f["minX"], f["maxX"])
fence_segment("SC_FenceW", "z", f["minX"], f["minZ"], f["maxZ"], end_posts=(False, False))
fence_segment("SC_FenceE", "z", f["maxX"], f["minZ"], f["maxZ"], end_posts=(False, False))
fence_segment("SC_FenceS0", "x", f["maxZ"], f["minX"], GATE_PIERS["P1"][0], end_posts=(True, False))
fence_segment("SC_FenceS1", "x", f["maxZ"], GATE_PIERS["P5"][1], SERVICE_GATE[0], end_posts=(False, True))
fence_segment("SC_FenceS2", "x", f["maxZ"], SERVICE_GATE[1], f["maxX"])

# ---------------------------------------------------------------- main gate (drawn open; the socket checks the pass)
for nm, (a, b) in GATE_PIERS.items():
    cpx.add(L.box(cpx.coll, f"SC_Gate{nm}", (a + b) / 2, GATE_Z, 0.0, b - a, 0.4, 2.6, M["pier"], bevel=0.02))
    cpx.col(f"Gate{nm}", (a + b) / 2, GATE_Z, b - a, 0.4, 2.6)
for nm in ("P1", "P2", "P3"):
    a, b = GATE_PIERS[nm]
    cpx.add(L.box(cpx.coll, f"SC_GateReader{nm}", (a + b) / 2, GATE_Z + 0.225, 1.0, 0.18, 0.05, 0.26, M["reader"]))
for nm, (a, b) in GATE_PASSAGES.items():
    if nm == "W":
        cpx.add(L.box(cpx.coll, "SC_GateWideLeaf", a + 0.03, GATE_Z - 0.85, 0.15, 0.04, 1.5, 1.05, M["flap"]))
        continue
    for side, x in (("a", a + 0.02), ("b", b - 0.02)):
        cpx.add(L.box(cpx.coll, f"SC_GateFlap{nm}{side}", x, GATE_Z, 0.3, 0.02, 0.36, 0.9, M["flap"]))
for nm in ("P1", "P5"):
    a, b = GATE_PIERS[nm]
    cpx.add(L.box(cpx.coll, f"SC_GateMast{nm}", (a + b) / 2, GATE_Z, 2.6, 0.14, 0.14, 1.3, M["iron"]))
sign_x0, sign_x1 = GATE_PIERS["P1"][0] + 0.1, GATE_PIERS["P5"][1] - 0.1
cpx.add(L.box(cpx.coll, "SC_GateSignBoard", (sign_x0 + sign_x1) / 2, GATE_Z, 3.15, sign_x1 - sign_x0, 0.08, 0.65, M["sign"]))
for side, (dz, flip) in (("S", (0.06, 0.0)), ("N", (-0.06, PI))):
    t = L.text_mesh(cpx.coll, f"SC_GateSignText{side}", "COVE SPORTS PARK", (sign_x0 + sign_x1) / 2, GATE_Z + dz, 3.3, 0.36, 0.01,
                    M["sign_text"], resolution=2)
    t.rotation_euler = (PI / 2, 0, flip)
    cpx.add(t)
GATE_TOGGLE = [{"name": f"COL_SportsSite_Gate{nm}", "cx": round((a + b) / 2, 3), "cz": GATE_Z, "hx": round((b - a) / 2, 3), "hz": 0.15, "cy": 1.1,
                "hy": 1.1, "yaw": 0.0, "direction": "out" if nm == "X" else "both" if nm == "W" else "in"} for nm, (a, b) in GATE_PASSAGES.items()]

# ---------------------------------------------------------------- service gate (locked)
S.swing_gate(cpx, "SC_ServiceGate", SERVICE_GATE[0] + 0.05, SERVICE_GATE[1] - 0.05, GATE_Z, M, h=2.2, locked=True)

# ---------------------------------------------------------------- utility compound
ux0, ux1, uz0, uz1 = UTILITY
paving(cpx, "SC_UtilityPad", UTILITY, top=Y["paving"], mat=M["utility"])
paving(cpx, "SC_UtilityPath", (UTILITY_GATE[0], UTILITY_GATE[1], uz1, C1[2]))
WALL_T, WALL_H = 0.2, 2.2
for nm, (a, b, c, d) in {"N": (ux0, ux1, uz0, uz0 + WALL_T), "W": (ux0, ux0 + WALL_T, uz0 + WALL_T, uz1), "E": (ux1 - WALL_T, ux1, uz0 + WALL_T, uz1),
                         "S0": (ux0 + WALL_T, UTILITY_GATE[0], uz1 - WALL_T, uz1), "S1": (UTILITY_GATE[1], ux1 - WALL_T, uz1 - WALL_T, uz1)}.items():
    cpx.add(L.box(cpx.coll, f"SC_UtilityWall{nm}", (a + b) / 2, (c + d) / 2, Y["paving"], b - a, d - c, WALL_H, M["screen_wall"], tile=2.0))
    cpx.col(f"UtilityWall{nm}", (a + b) / 2, (c + d) / 2, b - a, d - c, WALL_H + Y["paving"])
S.swing_gate(cpx, "SC_UtilityGate", UTILITY_GATE[0], UTILITY_GATE[1], uz1 - WALL_T / 2, M, h=2.0, locked=True)
cpx.add(L.furn(cpx.coll, "SC_Transformer", -576.0, -265.0, 0.0, [
    (0, 0, Y["paving"], 2.4, 1.6, 1.8, M["transformer"], 0.03), *[(dx, -0.86, Y["paving"] + 0.2, 0.06, 0.12, 1.4, M["transformer"]) for dx in (-0.9, -0.5, -0.1, 0.3, 0.7)],
    (0, 0, Y["paving"] + 1.8, 2.5, 1.7, 0.08, M["cabinet"])]))
cpx.col("Transformer", -576.0, -265.0, 2.5, 1.9, 1.9)
cpx.add(L.furn(cpx.coll, "SC_TelecomCabinet", -570.0, -267.5, 0.0, [(0, 0, Y["paving"], 1.0, 0.6, 1.6, M["cabinet"], 0.02)]))
cpx.col("TelecomCabinet", -570.0, -267.5, 1.0, 0.6, 1.7)
for k, (x, mat) in enumerate(((-577.5, "bin_green"), (-575.9, "bin_blue"), (-574.3, "bin_yellow"))):
    cpx.add(L.furn(cpx.coll, f"SC_WasteBin{k}", x, -258.0, 0.0, [(0, 0, Y["paving"], 1.2, 1.0, 1.25, M[mat], 0.02),
                                                                (0, 0.02, Y["paving"] + 1.25, 1.24, 1.04, 0.08, M[mat], 0.02)]))
cpx.col("WasteBins", -575.9, -258.0, 4.4, 1.1, 1.4)

# ---------------------------------------------------------------- lamps, benches, trees inside
lamps = [(x, z) for z in range(-196, -297, -20) for x in (PROMENADE[0] + 0.5, PROMENADE[1] - 0.5)]
lamps += [(float(x), C1[3] - 0.5) for x in range(-575, -374, 25) if not (-481 <= x <= -467 or -406 <= x <= -396 or -545 <= x <= -535)]
lamps += [(float(x), C2[2] + 0.5) for x in range(-575, -374, 25) if not -481 <= x <= -467]
for k, (x, z) in enumerate(lamps):
    S.street_lamp(cpx, f"SC_Lamp{k:02d}", x, z, M)
benches = [(-405.0, -284.0, PI), (-395.0, -284.0, PI), (-385.0, -284.0, PI), (-375.0, -284.0, PI), (-376.0, -264.0, PI / 2), (-376.0, -258.0, PI / 2)]
for k, (x, z, rot) in enumerate(benches):
    S.bench(cpx, f"SC_Bench{k}", x, z, rot, M)

keep_out = [(*r, 2.5) for r in SP.FOOTPRINTS.values()] + [(*r, 2.5) for r in SP.DOOR_STUBS.values()]
keep_out += [(*r, 2.5) for r in (C1, C2, SW_STREET, SE_STREET, (PROMENADE[0], PROMENADE[1], PROMENADE[2], PROMENADE[3]), UTILITY,
                                  (UTILITY_GATE[0], UTILITY_GATE[1], uz1, C1[2]))]
keep_out += [(x - 0.2, x + 0.2, z - 0.2, z + 0.2, 2.5) for x, z, _ in benches] + [(x, x, z, z, 3.0) for x, z in lamps]


def free_spot(x, z):
    if not (FENCE["minX"] + CLEAR + 2.0 <= x <= FENCE["maxX"] - CLEAR - 2.0 and FENCE["minZ"] + CLEAR + 2.0 <= z <= FENCE["maxZ"] - CLEAR - 2.0):
        return False
    return all(not (a - m <= x <= b + m and c - m <= z <= d + m) for a, b, c, d, m in keep_out)


rnd = random.Random(1914)
trees = []
for gx in range(-580, -364, 9):
    for gz in range(-420, -188, 9):
        x, z = gx + rnd.uniform(-2.5, 2.5), gz + rnd.uniform(-2.5, 2.5)
        if free_spot(x, z) and all(math.hypot(x - tx, z - tz) > 6.0 for tx, tz in trees):
            trees.append((x, z))
for k, (x, z) in enumerate(trees):
    S.tree(cpx, f"SC_Tree{k:02d}", round(x, 2), round(z, 2), M, scale=round(0.9 + 0.3 * rnd.random(), 2))

# ================================================================ reception pavilion (built by build_sports_reception.py)
ext = json.load(open(os.path.join(RECEPTION_OUT, "exterior.layout.json")))
inner = json.load(open(os.path.join(RECEPTION_OUT, "interior.layout.json")))
RECEPTION_YAW = -PI / 2
door_x = PLAZA[1] + 1.0
RECEPTION_POS = (door_x + ext["doorLocal"][2], -176.8)
ox, oy, oz = ext["interiorOffset"]
cos_y, sin_y = math.cos(RECEPTION_YAW), math.sin(RECEPTION_YAW)


def to_world(lx, ly, lz):
    return [round(RECEPTION_POS[0] + lx * cos_y + lz * sin_y, 3), round(ly, 3), round(RECEPTION_POS[1] - lx * sin_y + lz * cos_y, 3)]


def interior_to_world(p):
    return to_world(p[0] + ox, p[1] + oy, p[2] + oz)


door = to_world(*ext["doorLocal"])
body = ext["collision"][0]
body_center = to_world(0.0, 0.0, ext["footprintCenterZ"])
rec.cols.append({"name": "COL_Work_sports_reception", "cx": body_center[0], "cz": body_center[2], "hx": round(body["hz"], 3), "hz": round(body["hx"], 3),
                 "hy": body["hy"], "cy": body["hy"], "yaw": 0.0})
fp_w, fp_d = ext["footprint"]
plinth = (body_center[0] - fp_d / 2 - 0.2, body_center[0] + fp_d / 2 + 0.2, body_center[2] - fp_w / 2 - 0.2, body_center[2] + fp_w / 2 + 0.2)
assert rx0 <= plinth[0] and plinth[1] <= rx1 and rz0 - 1e-6 <= plinth[2] and plinth[3] <= rz1, ("reception outside its footprint", plinth)

# ================================================================ audit, export
rects = {f"fp_{k}": (v[0], v[2], v[1], v[3]) for k, v in SP.FOOTPRINTS.items()}
rects.update({"C1": (C1[0], C1[2], C1[1], C1[3]), "C2": (C2[0], C2[2], C2[1], C2[3]), "SW": (SW_STREET[0], SW_STREET[2], SW_STREET[1], SW_STREET[3]),
              "SE": (SE_STREET[0], SE_STREET[2], SE_STREET[1], SE_STREET[3]), "promenade": (PROMENADE[0], PROMENADE[2], PROMENADE[1], PROMENADE[3]),
              "utility": (UTILITY[0], UTILITY[2], UTILITY[1], UTILITY[3])})
bad = S.check_disjoint(rects, allowed={("C1", "promenade"), ("C2", "promenade"), ("C1", "SW"), ("C1", "SE")})
print("SPORTS overlaps:", bad)
assert not bad, bad
for s in (road, ent, rec, cpx):
    feet = [o for o in s.objs if o.type == "MESH" and (o.name.endswith("_Base") or "Bench" in o.name or o.name.endswith("_Trunk"))]
    g = L.check_grounded(feet)
    assert not g, g
for c in cpx.cols:
    assert FENCE["minX"] - 0.5 <= c["cx"] <= FENCE["maxX"] + 0.5 and FENCE["minZ"] - 0.5 <= c["cz"] <= FENCE["maxZ"] + 0.5, c

for key, s in (("sports_road", road), ("sports_entrance", ent), ("sports_reception", rec), ("sports_complex", cpx)):
    L.export_glb(os.path.join(OUT, f"{key}.glb"), s.objs, use_active_scene=True)
    print(f"{key}: {len(s.objs)} objects, {s.tris()} tris, {len(s.cols)} COL")
fence_tris = sum(len(p.vertices) - 2 for o in cpx.objs if o.name.startswith("SC_Fence") and o.type == "MESH" for p in o.data.polygons)
print("fence:", fence_tris, "tris;", len(trees), "trees inside")

L.write_json(os.path.join(OUT, "sports_site.layout.json"), {
    "version": 1,
    "zones": ZONES,
    "gate": {"x": -474.0, "z": GATE_Z, "width": round(GATE_PIERS["P5"][1] - GATE_PIERS["P1"][0], 3)},
    "sportsComplex": {
        "gate": {"toggle": GATE_TOGGLE, "trigger": GATE_TRIGGER, "readers": [[round(sum(GATE_PIERS[nm]) / 2, 3), 1.13, round(GATE_Z + 0.25, 3)]
                                                                           for nm in ("P1", "P2", "P3")]},
        "serviceGate": {"x": round(sum(SERVICE_GATE) / 2, 3), "z": GATE_Z, "width": SERVICE_GATE[1] - SERVICE_GATE[0], "locked": True},
        "busStop": {"id": "sports_complex", "name": "Cove Sports Park", "pole": [pole_x, 0.0, pole_z], "boarding": [BUS["boarding"][0], 0.0, BUS["boarding"][1]],
                    "bus": {"minX": -457.0, "maxX": -445.0, "z": -147.5}, "yaw": PI / 2},
        "turningBulb": {"center": [BULB[0], 0.0, BULB[1]], "radius": BULB_R},
        "carPark": {"bounds": {"minX": CAR_PARK[0], "maxX": CAR_PARK[1], "minZ": CAR_PARK[2], "maxZ": CAR_PARK[3]}, "stalls": stalls},
    },
    "adminTeleport": {"position": [-474.0, 0.0, -181.0], "yaw": 0.0},
    "reception": {
        "kind": "work", "key": "sports_reception", "name": ext["name"], "job": "sports",
        "position": [RECEPTION_POS[0], 0.0, RECEPTION_POS[1]], "rotationY": round(RECEPTION_YAW, 4),
        "door": door, "footprint": [round(fp_w, 3), round(fp_d, 3)], "interiorOffset": ext["interiorOffset"],
    },
    "points": {
        "passClerk": interior_to_world(inner["npcs"]["passClerk"]),
        "passCounter": interior_to_world(inner["counters"]["pass"]),
        "clerkYaw": round(math.atan2(sin_y, cos_y), 4),
    },
    "collision": road.cols + ent.cols + rec.cols + cpx.cols,
})
print("reception door", door, "clerk", interior_to_world(inner["npcs"]["passClerk"]))
L.snapshot(sc, os.path.join(OUT, "site_preview.png"), (-474.0, 140.0, -100.0), (-474.0, 0.0, -300.0), lens=24, res=(1280, 800))
