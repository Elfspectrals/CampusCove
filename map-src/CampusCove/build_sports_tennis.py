import importlib
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
import bmesh
import bpy

KEY = "sports_tennis"
OUT = os.path.join(L.OUT_ROOT, "park", KEY)
RACKET_OUT = os.path.join(L.OUT_ROOT, "decor", "tennis_racket")
BASKET_OUT = os.path.join(L.OUT_ROOT, "decor", "tennis_ball_basket")
FP = SP.FOOTPRINTS[KEY]
STUB = SP.DOOR_STUBS[KEY]
Y = SP.Y

NET_Z = -271.5
COURT_CX = (-454.645, -432.355)
HALF_LEN = 11.885
SINGLES_HW = 4.115
DOUBLES_HW = 5.485
SERVICE_DEPTH = 6.40
NET_H_CENTRE = 0.914
NET_H_POST = 1.07
NET_HALF_SPAN = 6.399
RUNOFF_SIDE = 3.66
RUNOFF_END = 6.40
STRIP = (-445.5, -441.5)
OUTER = (COURT_CX[0] - DOUBLES_HW - RUNOFF_SIDE, COURT_CX[1] + DOUBLES_HW + RUNOFF_SIDE, NET_Z - HALF_LEN - RUNOFF_END, NET_Z + HALF_LEN + RUNOFF_END)
FENCE_GAP = 0.3
FENCE = (OUTER[0] - FENCE_GAP, OUTER[1] + FENCE_GAP, OUTER[2] - FENCE_GAP, OUTER[3] + FENCE_GAP)
GATE = (STUB[2], STUB[3])
FENCE_H = 3.0
POST_STEP = 2.5
LINE_W = 0.05
BASELINE_W = 0.10
SURFACE_TOP = 0.08
COURT_TOP = 0.085
LINE_TOP = 0.09
FENCE_TILE = 0.4

sc = L.new_build_scene("PARK_" + KEY)
coll = bpy.data.collections.new(KEY)
sc.collection.children.link(coll)
site = S.Site(coll, "SportsTennis", seed=91)

shared = SP.site_materials()
M = {
    "lawn": shared["lawn"],
    "paving": shared["paving"],
    "surround": L.make_mat("TW_TennisSurround", "#4f8a5b", 0.85, "noise", 0.03),
    "court": L.make_mat("TW_TennisCourt", "#3f6fa8", 0.8, "noise", 0.03),
    "line": L.make_mat("TW_TennisLine", "#f4f4ef", 0.7, "noise", 0.0),
    "net": None,
    "tape": L.make_mat("TW_TennisNetTape", "#f4f4ef", 0.7, "noise", 0.0),
    "iron": L.make_mat("TW_TennisPost", "#2e3236", 0.5, "noise", 0.02),
    "lamp": L.make_mat("TW_TennisLampGlow", "#fff1c4", 0.5, "noise", 0.0, emit="#ffd27a", emit_strength=1.4),
    "wood": L.make_mat("TW_TennisBenchWood", "#9c6b43", 0.85, "planks", 0.05, accent="#7e5433"),
    "sign": L.make_mat("TW_TennisSignBoard", "#2a9d8f", 0.7, "noise", 0.02),
    "sign_text": L.make_mat("TW_TennisSignText", "#f3f1ea", 0.8, "noise", 0.0),
    "plinth": L.make_mat("TW_TennisFencePlinth", "#b9b7b1", 0.95, "noise", 0.03),
}


def mesh_material(name, cell, wire, rgb, roughness):
    size = cell * 4
    img = bpy.data.images.get(name + "_tex") or bpy.data.images.new(name + "_tex", size, size, alpha=True)
    px = []
    for y in range(size):
        for x in range(size):
            on = (x % cell) < wire or (y % cell) < wire
            px.extend((*rgb, 1.0 if on else 0.0))
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
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


M["fence"] = mesh_material("TW_TennisFence", 16, 3, (0.16, 0.24, 0.2), 0.6)
M["net"] = mesh_material("TW_TennisNet", 8, 2, (0.08, 0.08, 0.09), 0.8)


def panel(s, name, axis, fixed, a0, a1, y0, y1, mat, tile):
    bm = bmesh.new()
    p = [(a0, y0), (a1, y0), (a1, y1), (a0, y1)]
    vs = [bm.verts.new(L.b(a, fixed, y) if axis == "x" else L.b(fixed, a, y)) for a, y in p]
    face = bm.faces.new(vs)
    uv = bm.loops.layers.uv.verify()
    for loop, (a, y) in zip(face.loops, p):
        loop[uv].uv = ((a - a0) / tile, (y - y0) / tile)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    s.coll.objects.link(ob)
    return s.add(ob)


x0, x1, z0, z1 = FP
for k, (a, b, c, d) in enumerate([(x0, x1, z0, FENCE[2]), (x0, x1, FENCE[3], z1), (x0, FENCE[0], FENCE[2], FENCE[3]), (FENCE[1], x1, FENCE[2], FENCE[3])]):
    if k == 2:
        S.rect(site, "ST_LawnW0", a, c, b, GATE[0], 0.0, Y["lawn"], M["lawn"], tile=3.0)
        S.rect(site, "ST_LawnW1", a, GATE[1], b, d, 0.0, Y["lawn"], M["lawn"], tile=3.0)
        S.rect(site, "ST_GatePath", a, GATE[0], b, GATE[1], 0.0, Y["paving"], M["paving"])
        continue
    S.rect(site, f"ST_Lawn{k}", a, c, b, d, 0.0, Y["lawn"], M["lawn"], tile=3.0)
S.rect(site, "ST_FenceApron", FENCE[0], FENCE[2], FENCE[1], FENCE[3], 0.0, Y["paving"], M["paving"])
S.rect(site, "ST_Surround", OUTER[0], OUTER[2], OUTER[1], OUTER[3], Y["paving"], SURFACE_TOP, M["surround"], tile=4.0)


def court_lines(i, cx):
    tag = f"ST_Court{i + 1}"
    S.rect(site, f"{tag}_Surface", cx - DOUBLES_HW, NET_Z - HALF_LEN, cx + DOUBLES_HW, NET_Z + HALF_LEN, SURFACE_TOP, COURT_TOP, M["court"], tile=4.0)
    lines = []
    for side in (-1, 1):
        zb = NET_Z + side * HALF_LEN
        lines.append(L.box(coll, f"{tag}_Baseline{side:+d}", cx, zb - side * BASELINE_W / 2, COURT_TOP, 2 * DOUBLES_HW, BASELINE_W, LINE_TOP - COURT_TOP, M["line"]))
        zs = NET_Z + side * SERVICE_DEPTH
        lines.append(L.box(coll, f"{tag}_Service{side:+d}", cx, zs, COURT_TOP, 2 * SINGLES_HW, LINE_W, LINE_TOP - COURT_TOP, M["line"]))
        lines.append(L.box(coll, f"{tag}_CentreMark{side:+d}", cx, zb - side * 0.15, COURT_TOP, LINE_W, 0.1, LINE_TOP - COURT_TOP, M["line"]))
        lines.append(L.box(coll, f"{tag}_CentreService{side:+d}", cx, NET_Z + side * SERVICE_DEPTH / 2, COURT_TOP, LINE_W, SERVICE_DEPTH, LINE_TOP - COURT_TOP, M["line"]))
        for hw, nm in ((DOUBLES_HW, "Doubles"), (SINGLES_HW, "Singles")):
            lines.append(L.box(coll, f"{tag}_{nm}{side:+d}", cx + side * (hw - LINE_W / 2), NET_Z, COURT_TOP, LINE_W, 2 * HALF_LEN, LINE_TOP - COURT_TOP, M["line"]))
    site.add(L.join(coll, f"{tag}_Lines", lines))


def net(i, cx):
    tag = f"ST_Court{i + 1}"
    for side in (-1, 1):
        x = cx + side * NET_HALF_SPAN
        site.add(L.cyl(coll, f"{tag}_NetPost{side:+d}", x, NET_Z, COURT_TOP, 0.04, NET_H_POST, M["iron"], seg=8))
    panel(site, f"{tag}_Net", "x", NET_Z, cx - NET_HALF_SPAN, cx + NET_HALF_SPAN, COURT_TOP + 0.03, NET_H_CENTRE, M["net"], 0.2)
    site.add(L.box(coll, f"{tag}_NetTape", cx, NET_Z, NET_H_CENTRE - 0.03, 2 * NET_HALF_SPAN, 0.03, 0.07, M["tape"]))
    site.add(L.box(coll, f"{tag}_NetStrap", cx, NET_Z, COURT_TOP, 0.05, 0.03, NET_H_CENTRE - COURT_TOP, M["tape"]))
    site.col(f"Net{i + 1}", cx, NET_Z, 2 * NET_HALF_SPAN + 0.1, 0.2, NET_H_POST, y0=0.0)


for i, cx in enumerate(COURT_CX):
    court_lines(i, cx)
    net(i, cx)


def fence_side(name, axis, fixed, a0, a1):
    ln = a1 - a0
    mid = (a0 + a1) / 2
    cx, cz = (mid, fixed) if axis == "x" else (fixed, mid)
    sx, sz = (ln, 0.25) if axis == "x" else (0.25, ln)
    site.add(L.box(coll, f"{name}_Plinth", cx, cz, Y["paving"], sx, sz, 0.15, M["plinth"], tile=2.0))
    site.add(L.box(coll, f"{name}_Rail", cx, cz, FENCE_H - 0.05, *((ln, 0.05) if axis == "x" else (0.05, ln)), 0.05, M["iron"]))
    panel(site, f"{name}_Mesh", axis, fixed, a0, a1, Y["paving"] + 0.15, FENCE_H - 0.05, M["fence"], FENCE_TILE)
    n = max(1, math.ceil(ln / POST_STEP - 1e-6))
    posts = [L.box(coll, f"{name}_Post{k:02d}", *((a0 + ln * k / n, fixed) if axis == "x" else (fixed, a0 + ln * k / n)), Y["paving"], 0.08, 0.08,
                   FENCE_H - Y["paving"], M["iron"]) for k in range(n + 1)]
    site.add(L.join(coll, f"{name}_Posts", posts))
    site.col(name.replace("ST_", ""), cx, cz, sx if axis == "x" else 0.3, 0.3 if axis == "x" else sz, FENCE_H)


fx0, fx1, fz0, fz1 = FENCE
fence_side("ST_FenceN", "x", fz0, fx0, fx1)
fence_side("ST_FenceS", "x", fz1, fx0, fx1)
fence_side("ST_FenceE", "z", fx1, fz0, fz1)
fence_side("ST_FenceW0", "z", fx0, fz0, GATE[0])
fence_side("ST_FenceW1", "z", fx0, GATE[1], fz1)
site.add(L.box(coll, "ST_GateLintel", fx0, (GATE[0] + GATE[1]) / 2, FENCE_H - 0.3, 0.1, GATE[1] - GATE[0], 0.3, M["iron"]))
site.add(L.box(coll, "ST_GateSign", fx0 - 0.08, (GATE[0] + GATE[1]) / 2, FENCE_H - 0.95, 0.06, 2.2, 0.55, M["sign"]))
sign = L.text_mesh(coll, "ST_GateSignText", "TENNIS", fx0 - 0.12, (GATE[0] + GATE[1]) / 2, FENCE_H - 0.85, 0.32, 0.01, M["sign_text"], resolution=2)
sign.rotation_euler = (math.pi / 2, 0.0, -math.pi / 2)
site.add(sign)

for k, z in enumerate((NET_Z - 8.0, NET_Z + 8.0)):
    S.bench(site, f"ST_Bench{k}", (STRIP[0] + STRIP[1]) / 2, z, math.pi / 2, M)
for k, (x, z) in enumerate(((FENCE[0] - 1.2, FENCE[2] - 1.2), (FENCE[1] + 1.2, FENCE[2] - 1.2), (FENCE[0] - 1.2, FENCE[3] + 1.2), (FENCE[1] + 1.2, FENCE[3] + 1.2))):
    S.street_lamp(site, f"ST_Lamp{k}", x, z, M)

STAND_ROWS = 3
STAND_RISE = 0.3
STAND_DEPTH = 0.85
STAND_GAP = 0.3
STAND_LEN = 2 * DOUBLES_HW + 1.0
M["stand"] = L.make_mat("TW_TennisStandConcrete", "#c9c5bc", 0.9, "noise", 0.03)
M["seat"] = L.make_mat("TW_TennisStandSeat", "#2a9d8f", 0.6, "planks", 0.03, accent="#258c80")


def stand(name, cx, fence_z, away):
    for k in range(STAND_ROWS):
        z0 = fence_z + away * (STAND_GAP + STAND_DEPTH * k)
        zc = z0 + away * STAND_DEPTH / 2
        h = STAND_RISE * (k + 1)
        site.add(L.box(coll, f"{name}_Step{k}", cx, zc, 0.0, STAND_LEN, STAND_DEPTH, h, M["stand"], tile=2.0))
        site.add(L.box(coll, f"{name}_Seat{k}", cx, zc - away * 0.1, h, STAND_LEN - 0.4, 0.4, 0.04, M["seat"]))
        site.col(f"{name.replace('ST_', '')}Step{k}", cx, zc, STAND_LEN, STAND_DEPTH, h)


for i, cx in enumerate(COURT_CX):
    stand(f"ST_StandN{i + 1}", cx, FENCE[2], -1)
    stand(f"ST_StandS{i + 1}", cx, FENCE[3], 1)

decor_objs, decor_cols, _ = L.zone_decor(coll, KEY, "COL_SportsTennis_")
for o in decor_objs:
    site.add(o)
site.cols += decor_cols

for c in site.cols:
    assert FP[0] <= c["cx"] - c["hx"] and c["cx"] + c["hx"] <= FP[1] and FP[2] <= c["cz"] - c["hz"] and c["cz"] + c["hz"] <= FP[3], c
assert FP[0] < OUTER[0] and OUTER[1] < FP[1] and FP[2] < OUTER[2] and OUTER[3] < FP[3], OUTER
assert STRIP[0] == round(COURT_CX[0] + DOUBLES_HW + RUNOFF_SIDE, 3) and STRIP[1] == round(COURT_CX[1] - DOUBLES_HW - RUNOFF_SIDE, 3), STRIP
feet = [o for o in site.objs if o.type == "MESH" and (o.name.endswith("_Base") or "Bench" in o.name or "_Step" in o.name)]
assert not L.check_grounded(feet), L.check_grounded(feet)

L.export_glb(os.path.join(OUT, f"{KEY}.glb"), site.objs, use_active_scene=True)
print(f"{KEY}: {len(site.objs)} objects, {site.tris()} tris, {len(site.cols)} COL")
L.write_json(os.path.join(OUT, f"{KEY}.layout.json"), {
    "version": 1,
    "zone": {"key": KEY, "bounds": {"minX": FP[0], "maxX": FP[1], "minZ": FP[2], "maxZ": FP[3]}},
    "courts": [{"id": f"tennis_{i + 1}", "centre": [cx, 0.0, NET_Z], "halfWidth": DOUBLES_HW, "halfLength": HALF_LEN, "netHeight": NET_H_CENTRE}
               for i, cx in enumerate(COURT_CX)],
    "gate": {"x": FENCE[0], "z": NET_Z, "width": GATE[1] - GATE[0]},
    "coach": [(STRIP[0] + STRIP[1]) / 2, 0.0, NET_Z],
    "collision": site.cols,
})
L.snapshot(sc, os.path.join(OUT, "preview.png"), (-485.0, 30.0, -240.0), (-443.5, 0.0, -271.5), lens=24, res=(1024, 640))

sc_r = L.new_build_scene("DECOR_tennis_racket")
coll_r = bpy.data.collections.new("tennis_racket")
sc_r.collection.children.link(coll_r)
R = {
    "frame": L.make_mat("IT_RacketFrame", "#2a9d8f", 0.35, "noise", 0.02),
    "grip": L.make_mat("IT_RacketGrip", "#2b2b2e", 0.9, "stripes", 0.04, accent="#3a3a3e"),
    "strings": mesh_material("IT_RacketStrings", 6, 1, (0.95, 0.95, 0.9), 0.7),
}
GRIP_H, THROAT_H, HEAD_W, HEAD_H, FRAME_T = 0.20, 0.17, 0.26, 0.32, 0.02
parts = [L.cyl(coll_r, "Racket_Grip", 0.0, 0.0, 0.0, 0.017, GRIP_H, R["grip"], seg=8)]
head_cy = GRIP_H + THROAT_H + HEAD_H / 2
SEGMENTS = 20


def bar(name, p0, p1):
    ln = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
    piece = L.box(coll_r, name, (p0[0] + p1[0]) / 2, 0.0, (p0[1] + p1[1]) / 2 - FRAME_T / 2, ln + 0.004, FRAME_T, FRAME_T, R["frame"])
    piece.rotation_euler = (0.0, -math.atan2(p1[1] - p0[1], p1[0] - p0[0]), 0.0)
    return piece


throat_top = head_cy - HEAD_H / 2 * math.sin(math.radians(60))
for side in (-1, 1):
    parts.append(bar(f"Racket_Throat{side:+d}", (0.0, GRIP_H), (side * HEAD_W / 2 * math.cos(math.radians(60)), throat_top)))
for k in range(SEGMENTS):
    a0, a1 = 2 * math.pi * k / SEGMENTS, 2 * math.pi * (k + 1) / SEGMENTS
    p0 = (HEAD_W / 2 * math.cos(a0), head_cy + HEAD_H / 2 * math.sin(a0))
    p1 = (HEAD_W / 2 * math.cos(a1), head_cy + HEAD_H / 2 * math.sin(a1))
    parts.append(bar(f"Racket_Head{k:02d}", p0, p1))
bm = bmesh.new()
ring = [bm.verts.new(L.b(HEAD_W / 2 * 0.94 * math.cos(2 * math.pi * k / SEGMENTS), 0.0, head_cy + HEAD_H / 2 * 0.94 * math.sin(2 * math.pi * k / SEGMENTS)))
        for k in range(SEGMENTS)]
face = bm.faces.new(ring)
uv = bm.loops.layers.uv.verify()
for loop in face.loops:
    loop[uv].uv = (loop.vert.co.x / 0.02, loop.vert.co.z / 0.02)
me = bpy.data.meshes.new("Racket_Strings")
bm.to_mesh(me)
bm.free()
me.materials.append(R["strings"])
strings = bpy.data.objects.new("Racket_Strings", me)
coll_r.objects.link(strings)
racket = [L.join(coll_r, "Racket_Frame", [p for p in parts if p.name.startswith(("Racket_Throat", "Racket_Head"))]), parts[0], strings]
L.export_glb(os.path.join(RACKET_OUT, "model.glb"), racket, use_active_scene=True)
L.snapshot(sc_r, os.path.join(RACKET_OUT, "preview.png"), (0.6, 0.45, 0.9), (0.0, 0.35, 0.0), lens=50, res=(512, 512))
print("tennis_racket:", sum(len(p.vertices) - 2 for o in racket for p in o.data.polygons), "tris")

sc_b = L.new_build_scene("DECOR_tennis_ball_basket")
coll_b = bpy.data.collections.new("tennis_ball_basket")
sc_b.collection.children.link(coll_b)
B = {
    "frame": L.make_mat("IT_BasketFrame", "#2e3236", 0.5, "noise", 0.02),
    "wire": mesh_material("IT_BasketWire", 8, 2, (0.18, 0.2, 0.22), 0.6),
    "ball": L.make_mat("IT_TennisBall", "#d8f04a", 0.7, "noise", 0.03),
}
BASKET_R, BASKET_Y0, BASKET_H = 0.24, 0.45, 0.45
parts = [L.cyl(coll_b, f"Basket_Leg{k}", 0.2 * math.cos(a), 0.2 * math.sin(a), 0.0, 0.012, BASKET_Y0, B["frame"], seg=6)
         for k, a in enumerate((0.25 * math.pi, 0.75 * math.pi, 1.25 * math.pi, 1.75 * math.pi))]
parts.append(L.cyl(coll_b, "Basket_Bottom", 0.0, 0.0, BASKET_Y0, BASKET_R, 0.02, B["frame"], seg=12))
wall = L.cyl(coll_b, "Basket_Wall", 0.0, 0.0, BASKET_Y0, BASKET_R, BASKET_H, B["wire"], seg=12, tile=0.12)
bpy.ops.mesh.primitive_torus_add(major_radius=BASKET_R, minor_radius=0.01, major_segments=16, minor_segments=4, location=L.b(0.0, 0.0, BASKET_Y0 + BASKET_H))
rim = bpy.context.active_object
rim.name = "Basket_Rim"
for c in rim.users_collection:
    c.objects.unlink(rim)
coll_b.objects.link(rim)
rim.data.materials.append(B["frame"])
parts.append(rim)
rnd = __import__("random").Random(17)
balls = []
for k in range(10):
    a, r = rnd.uniform(0, 2 * math.pi), rnd.uniform(0, BASKET_R - 0.04)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.033, location=L.b(r * math.cos(a), r * math.sin(a), BASKET_Y0 + BASKET_H - 0.05 + rnd.uniform(-0.02, 0.03)))
    ball = bpy.context.active_object
    ball.name = f"Basket_Ball{k:02d}"
    for c in ball.users_collection:
        c.objects.unlink(ball)
    coll_b.objects.link(ball)
    ball.data.materials.append(B["ball"])
    balls.append(ball)
basket = [L.join(coll_b, "Basket_Frame", parts), wall, L.join(coll_b, "Basket_Balls", balls)]
L.export_glb(os.path.join(BASKET_OUT, "model.glb"), basket, use_active_scene=True)
L.snapshot(sc_b, os.path.join(BASKET_OUT, "preview.png"), (0.9, 1.1, 1.2), (0.0, 0.6, 0.0), lens=50, res=(512, 512))
print("tennis_ball_basket:", sum(len(p.vertices) - 2 for o in basket for p in o.data.polygons), "tris")
