import importlib
import os
import sys

if "__file__" not in globals():
    raise RuntimeError('Run with exec(open(p).read(), {"__file__": p}) so the script can find lib_common.py')
HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import lib_common as L
importlib.reload(L)
import lib_kit as K
importlib.reload(K)
import lib_buildings as B
importlib.reload(B)
import bpy

BOUNDS = {"minX": -42.6, "maxX": -2.0, "minZ": -200.0, "maxZ": -130.0}
GATE = {"x": -8.5, "z": -130.0, "width": 3.0}
PATH_W = 2.4
FENCE_INSET = 0.5
HOUSE_DOOR = (-36.0, -142.0)
OUT = os.path.join(L.OUT_ROOT, "park", "farm_site")

sc = L.new_build_scene("PARK_farm_site")
coll = bpy.data.collections.new("FarmSite")
sc.collection.children.link(coll)
P = {
    "grass": L.make_mat("TW_GrassFarm", "#8cc266", 1.0, "noise", 0.06),
    "path": L.make_mat("TW_FarmPath", "#c7ad84", 0.95, "noise", 0.07),
    "post": L.make_mat("TW_FarmPost", "#6e4f33", 0.85, "noise", 0.04),
    "rail": L.make_mat("TW_FarmRail", "#a9825a", 0.85, "planks", 0.05, accent="#86633f"),
    "trim": L.make_mat("TW_FarmTrim", "#f6f3ec", 0.7, "noise", 0.02),
}
so = []
col = []


def add(o):
    so.append(o)
    return o


def add_col(name, gx, gz, sx, sz, h, yaw=0.0, y0=0.0):
    col.append({"name": f"COL_Farm_{name}", "cx": round(gx, 3), "cz": round(gz, 3), "hx": round(sx / 2, 3), "hz": round(sz / 2, 3), "hy": round(h / 2, 3),
                "cy": round(y0 + h / 2, 3), "yaw": round(yaw, 4)})


def fence(name, ax, az, bx, bz):
    objs, c = L.fence_run(coll, f"FS_{name}", ax, az, bx, bz, P["post"], P["rail"])
    for o in objs:
        add(o)
    add_col(name, c["cx"], c["cz"], c["sx"], c["sz"], c["h"], c["yaw"])


add(L.box(coll, "FS_Lawn", (BOUNDS["minX"] + BOUNDS["maxX"]) / 2, (BOUNDS["minZ"] + BOUNDS["maxZ"]) / 2, 0.0, BOUNDS["maxX"] - BOUNDS["minX"],
          BOUNDS["maxZ"] - BOUNDS["minZ"], 0.02, P["grass"], tile=2.0))
trunk_z = -158.0
add(L.box(coll, "FS_PathGate", GATE["x"], (BOUNDS["maxZ"] + trunk_z - PATH_W / 2) / 2, 0.02, PATH_W, BOUNDS["maxZ"] - trunk_z + PATH_W / 2, 0.015, P["path"], tile=2.0))
yard_west = -38.0
add(L.box(coll, "FS_PathYard", (yard_west + GATE["x"] - PATH_W / 2) / 2, trunk_z, 0.02, GATE["x"] - PATH_W / 2 - yard_west, PATH_W, 0.015, P["path"], tile=2.0))
add(L.box(coll, "FS_PathHouse", HOUSE_DOOR[0], (HOUSE_DOOR[1] + trunk_z + PATH_W / 2) / 2, 0.02, 1.6, HOUSE_DOOR[1] - trunk_z - PATH_W / 2, 0.015, P["path"], tile=2.0))

kit = K.Kit()
B.zone_buildings(kit, "farm")
K.report(kit)
for o in kit.build(coll, merge=False):
    add(o)
for b in kit.boxes:
    if b.collide:
        add_col(b.name.removeprefix("FS_").removeprefix(B.PREFIX), (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, b.x1 - b.x0, b.z1 - b.z0, b.y1 - b.y0, y0=b.y0)

x0, x1 = BOUNDS["minX"] + FENCE_INSET, BOUNDS["maxX"] - FENCE_INSET
z0, z1 = BOUNDS["minZ"] + FENCE_INSET, BOUNDS["maxZ"] - FENCE_INSET
gate0, gate1 = GATE["x"] - GATE["width"] / 2, GATE["x"] + GATE["width"] / 2
fence("FenceNorthW", x0, z1, gate0, z1)
fence("FenceNorthE", gate1, z1, x1, z1)
fence("FenceEast", x1, z1, x1, z0)
fence("FenceSouth", x1, z0, x0, z0)
fence("FenceWest", x0, z0, x0, z1)
for k, gx in enumerate((gate0, gate1)):
    add(L.box(coll, f"FS_GatePost{k}", gx, z1, 0.0, 0.22, 0.22, 2.4, P["post"], bevel=0.02))
add(L.box(coll, "FS_GateBeam", GATE["x"], z1, 2.4, GATE["width"] + 0.5, 0.16, 0.16, P["post"]))
add(L.box(coll, "FS_GateBoard", GATE["x"], z1 + 0.1, 2.6, 2.4, 0.05, 0.4, P["rail"]))
add(L.text_mesh(coll, "FS_GateText", "COVE FARM", GATE["x"], z1 + 0.14, 2.68, 0.22, 0.01, P["trim"], facing="+z"))

decor_objs, decor_cols, crop_plants = L.zone_decor(coll, "farm", "COL_Farm_")
so += decor_objs
col += decor_cols

bad = L.check_grounded(so, allow=("FS_Path", "FS_Fence", "FS_Lawn", "FS_GateBeam", "FS_GateBoard", "FS_GateText", B.PREFIX, "ZD_"))
print("FARM grounded violations:", bad)
assert not bad, bad

L.export_glb(os.path.join(OUT, "farm_site.glb"), so, use_active_scene=True)
L.write_json(os.path.join(OUT, "farm_site.layout.json"), {
    "version": 1,
    "bounds": BOUNDS,
    "gate": GATE,
    "collision": col,
    "crops": crop_plants,
})
print("farm site:", len(so), "objects,", len(col), "collision boxes,", len(crop_plants), "crop plants, gate", GATE)
