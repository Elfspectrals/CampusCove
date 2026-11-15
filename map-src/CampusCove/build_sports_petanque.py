"""Cove Sports Park boulodrome (docs/sports/MASTER_PLAN.md § 6, docs/sports/petanque.md): four gravel pistes of
4 x 15 m (long axis z) inside 0.2 m wooden boards, a paved surround with benches and lamps, plane trees on the lawn
and the coach strip at the south end. Piste centres and sizes come from the sport rules file (one owner for the
socket, the front and this build).

Outputs: out/park/sports_petanque/sports_petanque.glb + sports_petanque.layout.json + preview.png,
then `npm run assets:optimize -- park sports_petanque` and `node scripts/apply-sports-petanque.mjs` (from front/).
Also ships the Set of Boules (gear_boules) as decor/petanque_boules for its shop prop at Summit Sports.
"""
import importlib
import json
import math
import os
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
import bpy

PI = math.pi
KEY = "sports_petanque"
OUT = os.path.join(L.OUT_ROOT, "park", KEY)
RULES = json.load(open(os.path.join(L.FRONT_ASSETS, "sports", "rules", "petanque.json")))
Y = SP.Y
FP = SP.FOOTPRINTS[KEY]
OUTER = (-411.0, -389.0, -274.0, -253.0)
PATH = (-402.0, -398.0, OUTER[3], FP[3])
BOARD_W = 0.2
BOARD_TOP = Y["walk"]
GRAVEL_TOP = Y["paving"]

sc = L.new_build_scene("PARK_sports_petanque")
coll = bpy.data.collections.new(KEY)
sc.collection.children.link(coll)
site = S.Site(coll, "SportsPetanque", seed=91)

shared = SP.site_materials()
M = {
    "lawn": shared["lawn"],
    "paving": shared["paving"],
    "gravel": L.make_mat("TW_SportsPetanqueGravel", "#cdb58c", 1.0, "noise", 0.08),
    "board": L.make_mat("TW_SportsPetanqueBoard", "#8a5a34", 0.85, "planks", 0.05, accent="#6f4527"),
    "wood": L.make_mat("TW_SportsBenchWood", "#9c6b43", 0.85, "planks", 0.05, accent="#7e5433"),
    "iron": L.make_mat("TW_SportsFencePost", "#2e3236", 0.6, "noise", 0.02),
    "lamp": L.make_mat("TW_SportsLampGlow", "#fff1c4", 0.5, "noise", 0.0, emit="#ffd27a", emit_strength=1.4),
    "trunk": L.make_mat("TW_SportsPlaneTrunk", "#9b8c74", 0.85, "noise", 0.08),
    "leaf": L.make_mat("TW_SportsLeaf", "#6e9a4c", 0.9, "noise", 0.07),
    "leaf_light": L.make_mat("TW_SportsLeafLight", "#8fb262", 0.9, "noise", 0.07),
}


def piste_bounds(p):
    (cx, cz), (w, l) = p["centre"], p["sizeM"]
    return (cx - w / 2, cx + w / 2, cz - l / 2, cz + l / 2)


PISTES = [piste_bounds(p) for p in RULES["pistes"]]
PIT = (min(b[0] for b in PISTES) - BOARD_W, max(b[1] for b in PISTES) + BOARD_W,
       min(b[2] for b in PISTES) - BOARD_W, max(b[3] for b in PISTES) + BOARD_W)
assert OUTER[0] < PIT[0] and PIT[1] < OUTER[1] and OUTER[2] < PIT[2] and PIT[3] < OUTER[3], ("pistes outside the paved area", PIT)


def rect_minus(outer, holes):
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


for k, (x0, x1, z0, z1) in enumerate(rect_minus(FP, [OUTER, PATH])):
    S.rect(site, f"SP_Lawn{k:02d}", x0, z0, x1, z1, 0.0, Y["lawn"], M["lawn"], tile=3.0)
for k, (x0, x1, z0, z1) in enumerate(rect_minus(OUTER, [PIT]) + [PATH]):
    S.rect(site, f"SP_Paving{k:02d}", x0, z0, x1, z1, 0.0, Y["paving"], M["paving"])
for k, (x0, x1, z0, z1) in enumerate(PISTES, start=1):
    S.rect(site, f"SP_Piste{k}_Gravel", x0, z0, x1, z1, 0.0, GRAVEL_TOP, M["gravel"], tile=1.5)

board_xs = sorted({round(b[0] - BOARD_W, 4) for b in PISTES} | {round(b[1], 4) for b in PISTES})
for k, x in enumerate(board_xs):
    S.rect(site, f"SP_BoardSide{k}", x, PIT[2] + BOARD_W, x + BOARD_W, PIT[3] - BOARD_W, 0.0, BOARD_TOP, M["board"], tile=1.0)
S.rect(site, "SP_BoardNorth", PIT[0], PIT[2], PIT[1], PIT[2] + BOARD_W, 0.0, BOARD_TOP, M["board"], tile=1.0)
S.rect(site, "SP_BoardSouth", PIT[0], PIT[3] - BOARD_W, PIT[1], PIT[3], 0.0, BOARD_TOP, M["board"], tile=1.0)

coach = RULES["coach"]
benches = [(-407.0, -254.0, 0.0), (-404.0, -254.0, 0.0), (-396.0, -254.0, 0.0), (-393.0, -254.0, 0.0),
           (-410.0, -268.0, -PI / 2), (-410.0, -261.0, -PI / 2), (-390.0, -268.0, PI / 2), (-390.0, -261.0, PI / 2)]
for k, (x, z, rot) in enumerate(benches):
    assert math.hypot(x - coach[0], z - coach[1]) > 2.0, ("bench on the coach spot", x, z)
    S.bench(site, f"SP_Bench{k}", x, z, rot, M)
lamps = [(OUTER[0] + 0.5, OUTER[2] + 0.5), (OUTER[1] - 0.5, OUTER[2] + 0.5), (OUTER[0] + 0.5, OUTER[3] - 0.5), (OUTER[1] - 0.5, OUTER[3] - 0.5)]
for k, (x, z) in enumerate(lamps):
    S.street_lamp(site, f"SP_Lamp{k}", x, z, M)
trees = [(x, z) for x in (FP[0] + 1.5, FP[1] - 1.5) for z in (-271.0, -264.5, -258.0)]
for k, (x, z) in enumerate(trees):
    S.tree(site, f"SP_PlaneTree{k}", x, z, M, scale=1.15)

M.update({
    "stone": L.make_mat("TW_SportsSignStone", "#b9b2a4", 0.9, "noise", 0.04),
    "plaster": L.make_mat("TW_SportsSignPlaster", "#2a6f5f", 0.8, "noise", 0.03),
    "coping": L.make_mat("TW_SportsSignCoping", "#d9d6cf", 0.9, "noise", 0.03),
    "gold": L.make_mat("TW_SportsSignLetters", "#f3e3b0", 0.6, "noise", 0.0),
    "slate": L.make_mat("TW_SportsPetanqueSlate", "#2b3033", 0.9, "noise", 0.03),
    "chalk": L.make_mat("TW_SportsPetanqueChalk", "#f2f0ea", 0.9, "noise", 0.0),
})
S.monument_sign(site, "SP_Sign", -405.5, -251.25, PI, "BOULODROME", M)


def slate_board(name, gx, gz, number):
    site.add(L.box(coll, f"{name}_Post", gx, gz, 0.0, 0.08, 0.08, 1.5, M["board"]))
    site.add(L.box(coll, f"{name}_Slate", gx, gz + 0.05, 0.9, 0.7, 0.03, 0.5, M["slate"], bevel=0.01))
    site.add(L.text_mesh(coll, f"{name}_Number", str(number), gx, gz + 0.068, 1.02, 0.24, 0.004, M["chalk"], facing="+z", resolution=2))
    site.col(name, gx, gz, 0.3, 0.3, 1.5)


def boule_rack(name, gx, gz):
    site.add(L.furn(coll, name, gx, gz, 0.0, [
        *[(px, 0.0, 0.0, 0.05, 0.3, 0.8, M["board"]) for px in (-0.42, 0.42)],
        *[(0.0, 0.0, y, 0.9, 0.3, 0.03, M["board"]) for y in (0.25, 0.55, 0.8)],
    ]))
    site.col(name, gx, gz, 0.95, 0.35, 0.83)


for k, b in enumerate(PISTES, start=1):
    slate_board(f"SP_Slate{k}", (b[0] + b[1]) / 2, OUTER[2] + 0.45, k)
for k, x in enumerate((OUTER[0] + 1.4, OUTER[1] - 1.4)):
    boule_rack(f"SP_Rack{k}", x, -256.5)

for c in site.cols:
    assert FP[0] <= c["cx"] - c["hx"] and c["cx"] + c["hx"] <= FP[1] and FP[2] <= c["cz"] - c["hz"] and c["cz"] + c["hz"] <= FP[3], c
    assert not any(b[0] <= c["cx"] <= b[1] and b[2] <= c["cz"] <= b[3] for b in PISTES), ("collision on a piste", c)
feet = [o for o in site.objs if o.type == "MESH" and (o.name.endswith("_Base") or "Bench" in o.name or o.name.endswith("_Trunk"))]
bad = L.check_grounded(feet)
assert not bad, bad

os.makedirs(OUT, exist_ok=True)
L.export_glb(os.path.join(OUT, f"{KEY}.glb"), site.objs, use_active_scene=True)
print(f"{KEY}: {len(site.objs)} objects, {site.tris()} tris, {len(site.cols)} COL")
L.write_json(os.path.join(OUT, f"{KEY}.layout.json"), {
    "version": 1,
    "zone": {"minX": FP[0], "maxX": FP[1], "minZ": FP[2], "maxZ": FP[3]},
    "pistes": [{"id": p["id"], "bounds": {"minX": b[0], "maxX": b[1], "minZ": b[2], "maxZ": b[3]}} for p, b in zip(RULES["pistes"], PISTES)],
    "collision": site.cols,
})
L.snapshot(sc, os.path.join(OUT, "preview.png"), (-400.0, 22.0, -236.0), (-400.0, 0.0, -264.0), lens=28, res=(1280, 800))


def boule(name, gx, gz, r, mat, groove):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=r, location=L.b(gx, gz, r))
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(mat)
    for c in list(o.users_collection):
        c.objects.unlink(o)
    coll.objects.link(o)
    parts = [o]
    if groove:
        for k, tilt in enumerate((0.0, PI / 2)):
            bpy.ops.mesh.primitive_torus_add(major_radius=r * 1.002, minor_radius=r * 0.04, major_segments=14, minor_segments=3,
                                             location=L.b(gx, gz, r), rotation=(0.0, PI / 2, tilt))
            g = bpy.context.active_object
            g.name = f"{name}_Groove{k}"
            g.data.materials.append(groove)
            for c in list(g.users_collection):
                c.objects.unlink(g)
            coll.objects.link(g)
            parts.append(g)
    return parts


steel = L.make_mat("DC_PetanqueBouleSteel", "#9aa1a8", 0.35, "noise", 0.03)
groove = L.make_mat("DC_PetanqueBouleGroove", "#4a4f55", 0.5, "noise", 0.02)
jack_wood = L.make_mat("DC_PetanqueJack", "#d9452f", 0.6, "noise", 0.03)
r = RULES["boule"]["radiusM"]
set_parts = []
for k, (x, z) in enumerate(((-r * 2.2, 0.0), (r * 2.2, 0.0), (0.0, r * 2.0))):
    set_parts += boule(f"Boule{k}", x, z, r, steel, groove)
set_parts += boule("Jack", 0.0, -r * 1.6, RULES["jack"]["radiusM"], jack_wood, None)
print("DECOR", L.ship_decor(sc, coll, "petanque_boules", set_parts, 4))
