"""Business district scenery (everything that is NOT a building): gate pillars, avenue, plaza, lamps, trees, benches.
Authored directly in WORLD game space (same origin as town.glb). Run inside Blender.

Layout (game xz):
  hedge gate        : opening x in [-6.1, 6.1] at z ~ 46 (segments COL_Hedge_35/36 are removed by front/scripts/open-town-gate.mjs)
  avenue            : x in [-3, 3], z 22 -> 52 (paving over the grass)
  plaza             : x in [-29, 29], z 48 -> 56 (buildings' doors face it, door line z = 56)
  buildings         : tech_hub x=-20, boutique x=0, cafe x=+20 (rotation pi: door faces -Z, towards the town)
Outputs: out/work/district/district.glb, district.layout.json (collision boxes + building placements)
"""
import importlib
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else r"C:\Users\zombo\CampusCove\map-src\CampusCove"
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import lib_common as L
importlib.reload(L)
import bpy

KEY = "district"
OUT = os.path.join(L.OUT_ROOT, "work", KEY)
DOOR_Z = 56.0

sc = L.new_build_scene("WORK_" + KEY)
coll = bpy.data.collections.new("District")
sc.collection.children.link(coll)
D = {
    "paving": L.make_mat("TW_PavingWork", "#c9c2b4", 0.9, "tiles", 0.03, accent="#b0a99b"),
    "avenue": L.make_mat("TW_AvenueWork", "#d6cfc2", 0.9, "tiles", 0.02, accent="#bdb6a8"),
    "curb": L.make_mat("TW_CurbWork", "#9a9a9a", 0.8, "noise", 0.03),
    "stone": L.make_mat("TW_StoneWork", "#b5ada0", 0.85, "tiles", 0.04, accent="#9b9386"),
    "metal": L.make_mat("TW_MetalWork", "#3a3f47", 0.4, "noise", 0.03),
    "lamp": L.make_mat("TW_LampGlow", "#fff1c4", 0.5, "noise", 0.0, emit="#fff1c4"),
    "sign": L.make_mat("TW_SignBoardWork", "#2b3a33", 0.7, "noise", 0.02),
    "signtxt": L.make_mat("TW_SignTextWork", "#38e8ff", 0.3, "noise", 0.0, emit="#38e8ff"),
    "leaf": L.make_mat("TW_LeafWork", "#4f9d54", 0.9, "noise", 0.06),
    "trunk": L.make_mat("TW_TrunkWork", "#7a5638", 0.8, "planks", 0.04, accent="#5e4129"),
    "wood": L.make_mat("TW_BenchWood", "#a9784a", 0.7, "planks", 0.04, accent="#8d6238"),
    "grass": L.make_mat("TW_GrassWork", "#79b765", 1.0, "noise", 0.06),
}
objs = []
col = []  # world-space collision boxes: dict(name, cx, cz, hx, hz, hy, yaw)


def add_col(name, gx, gz, sx, sz, h, yaw=0.0):
    col.append({"name": name, "cx": round(gx, 3), "cz": round(gz, 3), "hx": round(sx / 2, 3), "hz": round(sz / 2, 3), "hy": round(h / 2, 3), "cy": round(h / 2, 3), "yaw": yaw})


# --- ground surfaces (slightly above the town ground at y ~ -0.005)
objs.append(L.box(coll, "DS_Plaza", 0, 52.0, 0.0, 58.0, 8.0, 0.04, D["paving"], tile=2.0))
objs.append(L.box(coll, "DS_Avenue", 0, 37.0, 0.0, 6.0, 30.0, 0.03, D["avenue"], tile=2.0))
objs.append(L.box(coll, "DS_GateApron", 0, 47.0, 0.0, 14.0, 6.0, 0.035, D["avenue"], tile=2.0))
for nm, gx, gz, sx, sz in [("DS_CurbPlazaN", 0, 48.0, 58.2, 0.3), ("DS_CurbPlazaE", 29.1, 52.0, 0.3, 8.0), ("DS_CurbPlazaW", -29.1, 52.0, 0.3, 8.0),
                           ("DS_CurbAvenueE", 3.15, 33.0, 0.3, 22.0), ("DS_CurbAvenueW", -3.15, 33.0, 0.3, 22.0)]:
    objs.append(L.box(coll, nm, gx, gz, 0.0, sx, sz, 0.1, D["curb"], tile=1.0))
# grass beyond the plaza (behind the buildings) so the district does not float on the town grass edge
objs.append(L.box(coll, "DS_GrassBack", 0, 66.0, 0.0, 60.0, 14.0, 0.02, D["grass"], tile=2.0))


# --- gate pillars (flank the 12.2 m hedge opening) + signs
def pillar(side, gx):
    tag = side
    objs.append(L.box(coll, f"DS_GatePillar{tag}", gx, 46.0, 0.0, 1.0, 1.0, 3.2, D["stone"], bevel=0.03, tile=1.0))
    objs.append(L.box(coll, f"DS_GateCap{tag}", gx, 46.0, 3.2, 1.3, 1.3, 0.2, D["stone"], bevel=0.03))
    objs.append(L.box(coll, f"DS_GateLamp{tag}", gx, 46.0, 3.4, 0.5, 0.5, 0.5, D["lamp"], bevel=0.04))
    add_col(f"COL_Work_GatePillar{tag}", gx, 46.0, 1.2, 1.2, 3.6)


pillar("W", -6.6)
pillar("E", 6.6)
for tag, gx, body in (("W", -6.6, "DISTRICT"), ("E", 6.6, "BUSINESS")):
    objs.append(L.box(coll, f"DS_GateSign{tag}", gx, 45.45, 1.3, 1.9, 0.12, 0.6, D["sign"]))
    objs.append(L.text_mesh(coll, f"DS_GateSignText{tag}", body, gx, 45.37, 1.38, 0.3, 0.03, D["signtxt"], facing="-z"))


# --- lamps along the avenue and the plaza
def lamp(name, gx, gz):
    objs.append(L.cyl(coll, f"{name}_Pole", gx, gz, 0.0, 0.07, 3.2, D["metal"], seg=6))
    objs.append(L.box(coll, f"{name}_Head", gx, gz, 3.2, 0.5, 0.5, 0.3, D["lamp"], bevel=0.03))
    add_col(f"COL_Work_{name}", gx, gz, 0.3, 0.3, 3.4)


n = 0
for gz in (26.0, 34.0, 42.0):
    for sx in (-3.7, 3.7):
        n += 1
        lamp(f"DS_AveLamp{n:02d}", sx, gz)
for gx in (-26.0, -10.0, 10.0, 26.0):
    n += 1
    lamp(f"DS_PlazaLamp{n:02d}", gx, 49.0)

# --- trees + benches on the plaza
for i, gx in enumerate((-27.0, -14.0, 14.0, 27.0)):
    objs.append(L.cyl(coll, f"DS_TreeTrunk{i}", gx, 50.5, 0.0, 0.22, 1.6, D["trunk"], seg=6))
    objs.append(L.cone(coll, f"DS_TreeA{i}", gx, 50.5, 1.4, 1.5, 0.3, 2.2, D["leaf"], seg=7))
    objs.append(L.cone(coll, f"DS_TreeB{i}", gx, 50.5, 2.9, 1.1, 0.05, 1.8, D["leaf"], seg=7))
    add_col(f"COL_Work_Tree{i}", gx, 50.5, 0.6, 0.6, 3.0)
for i, gx in enumerate((-6.0, 6.0)):
    bench = L.furn(coll, f"DS_Bench{i}", gx, 50.2, math.pi, [(0, 0, 0.42, 1.8, 0.5, 0.06, D["wood"], 0.01), (0, 0.22, 0.48, 1.8, 0.06, 0.45, D["wood"], 0.01),
                                                          (-0.8, 0, 0.0, 0.08, 0.45, 0.42, D["metal"]), (0.8, 0, 0.0, 0.08, 0.45, 0.42, D["metal"])])
    objs.append(bench)
    add_col(f"COL_Work_Bench{i}", gx, 50.2, 1.8, 0.5, 0.9)

bad = L.check_grounded(objs, allow=("DS_Gate", "DS_Plaza", "DS_Avenue", "DS_Curb", "DS_Grass", "DS_Tree", "DS_AveLamp", "DS_PlazaLamp"))
print("DISTRICT grounded violations:", bad)
assert not bad, bad

# --- building placements (world game space). rotation pi: local +Z (door) points to world -Z (the town)
placements = [
    {"key": "tech_hub", "name": "Tech Hub", "job": "dev", "x": -20.0, "depth": 14.0},
    {"key": "boutique", "name": "Boutique", "job": "commerce", "x": 0.0, "depth": 12.0},
    {"key": "cafe", "name": "Campus Cafe", "job": "resto", "x": 20.0, "depth": 13.0},
]
works = []
for p in placements:
    z = DOOR_Z + p["depth"] / 2
    ext = json.load(open(os.path.join(L.OUT_ROOT, "work", p["key"], "exterior.layout.json"), encoding="utf-8"))
    dl = ext["doorLocal"]
    works.append({
        "key": p["key"], "name": p["name"], "job": p["job"],
        "position": [p["x"], 0.0, z], "rotationY": math.pi,
        # interaction point in front of the door, in world space (local +Z -> world -Z)
        "door": [round(p["x"] - dl[0], 3), dl[1], round(z - dl[2], 3)],
        "footprint": ext["footprint"],
    })
    # building body collision (yaw pi keeps an axis-aligned box)
    c = ext["collision"][0]
    add_col(f"COL_Work_{p['key']}", p["x"], z, c["hx"] * 2, c["hz"] * 2, c["hy"] * 2)

L.export_glb(os.path.join(OUT, "district.glb"), objs)
L.write_json(os.path.join(OUT, "district.layout.json"), {
    "version": 1, "gate": {"x": 0.0, "z": 46.0, "width": 12.2},
    "bounds": {"minZ": -48.9622, "maxZ": 74.0},
    "works": works, "collision": col,
})
print("district objects:", len(objs), "collision boxes:", len(col), "works:", [(w["key"], w["position"], w["door"]) for w in works])
