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
import bpy

BOUNDS = {"minX": -42.6, "maxX": -2.0, "minZ": -200.0, "maxZ": -130.0}
GATE = {"x": -8.5, "z": -130.0, "width": 3.0}
PATH_W = 2.4
FENCE_INSET = 0.5
HOUSE = (-40.0, -142.0, -32.0, -135.0)
BARN = (-28.0, -152.0, -16.0, -138.0)
OUT = os.path.join(L.OUT_ROOT, "park", "farm_site")

sc = L.new_build_scene("PARK_farm_site")
coll = bpy.data.collections.new("FarmSite")
sc.collection.children.link(coll)
P = {
    "grass": L.make_mat("TW_GrassFarm", "#8cc266", 1.0, "noise", 0.06),
    "path": L.make_mat("TW_FarmPath", "#c7ad84", 0.95, "noise", 0.07),
    "post": L.make_mat("TW_FarmPost", "#6e4f33", 0.85, "noise", 0.04),
    "rail": L.make_mat("TW_FarmRail", "#a9825a", 0.85, "planks", 0.05, accent="#86633f"),
    "house": L.make_mat("TW_FarmHouseWall", "#efe3c8", 0.9, "planks", 0.04, accent="#dccfb2"),
    "house_roof": L.make_mat("TW_FarmHouseRoof", "#7a4a3a", 0.8, "tiles", 0.05, accent="#653a2c"),
    "trim": L.make_mat("TW_FarmTrim", "#f6f3ec", 0.7, "noise", 0.02),
    "door": L.make_mat("TW_FarmDoor", "#5b7f4a", 0.75, "planks", 0.04, accent="#4b6b3c"),
    "glass": L.make_mat("TW_FarmGlass", "#9fc6d8", 0.2, "noise", 0.0),
    "chimney": L.make_mat("TW_FarmChimney", "#9a6b55", 0.9, "tiles", 0.05, accent="#7f5644"),
    "barn": L.make_mat("TW_FarmBarnWall", "#b23a2e", 0.85, "planks", 0.05, accent="#962f25"),
    "barn_roof": L.make_mat("TW_FarmBarnRoof", "#5d5f66", 0.8, "tiles", 0.05, accent="#4a4c52"),
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


def farm_building(kit, name, rect, h, thick, wall, roof, roof_h, ridge_axis, doors, windows, trim, leaf, glass):
    x0, z0, x1, z1 = rect
    t = thick / 2
    for cx, cz in ((x0, z0), (x1, z0), (x0, z1), (x1, z1)):
        kit.corner(f"{name}_Corner_{cx:.0f}_{cz:.0f}", cx, cz, 0.0, h, thick, wall)
    sides = {"south": ("x", z0, x0 + t, x1 - t), "north": ("x", z1, x0 + t, x1 - t), "west": ("z", x0, z0 + t, z1 - t), "east": ("z", x1, z0 + t, z1 - t)}
    for side, (axis, fixed, a0, a1) in sides.items():
        openings = [(a, b, 0.0, dh) for s, a, b, dh in doors if s == side] + [(a, b, lo, hi) for s, a, b, lo, hi in windows if s == side]
        kit.wall(f"{name}_Wall_{side}", axis, fixed, a0, a1, 0.0, h, thick, wall, openings=openings)
        for k, (s, a, b, dh) in enumerate(d for d in doors if d[0] == side):
            kit.door_frame(f"{name}_Door_{side}{k}", axis, fixed, a, b, 0.0, dh, thick, trim, leaf=leaf)
        for k, (s, a, b, lo, hi) in enumerate(w for w in windows if w[0] == side):
            kit.add(f"{name}_Glass_{side}{k}", *K._along(axis, fixed, a, b, 0.04), lo, hi, glass)
    kit.gable_roof(f"{name}_Roof", x0 - 0.3, z0 - 0.3, x1 + 0.3, z1 + 0.3, h, roof_h, roof, ridge_axis=ridge_axis)


add(L.box(coll, "FS_Lawn", (BOUNDS["minX"] + BOUNDS["maxX"]) / 2, (BOUNDS["minZ"] + BOUNDS["maxZ"]) / 2, 0.0, BOUNDS["maxX"] - BOUNDS["minX"],
          BOUNDS["maxZ"] - BOUNDS["minZ"], 0.02, P["grass"], tile=2.0))
trunk_z = -158.0
add(L.box(coll, "FS_PathGate", GATE["x"], (BOUNDS["maxZ"] + trunk_z - PATH_W / 2) / 2, 0.02, PATH_W, BOUNDS["maxZ"] - trunk_z + PATH_W / 2, 0.015, P["path"], tile=2.0))
yard_west = -38.0
add(L.box(coll, "FS_PathYard", (yard_west + GATE["x"] - PATH_W / 2) / 2, trunk_z, 0.02, GATE["x"] - PATH_W / 2 - yard_west, PATH_W, 0.015, P["path"], tile=2.0))
house_door = -36.0
add(L.box(coll, "FS_PathHouse", house_door, (HOUSE[1] + trunk_z + PATH_W / 2) / 2, 0.02, 1.6, HOUSE[1] - trunk_z - PATH_W / 2, 0.015, P["path"], tile=2.0))

kit = K.Kit()
farm_building(kit, "FS_House", HOUSE, 3.0, 0.25, P["house"], P["house_roof"], 1.8, "x",
              doors=[("south", house_door - 0.6, house_door + 0.6, 2.1)],
              windows=[("south", -39.2, -38.0, 1.0, 2.0), ("south", -34.0, -32.8, 1.0, 2.0), ("east", -139.6, -138.4, 1.0, 2.0),
                       ("west", -139.6, -138.4, 1.0, 2.0)],
              trim=P["trim"], leaf=P["door"], glass=P["glass"])
kit.add("FS_House_Chimney", -34.2, -137.4, -33.4, -136.6, 3.6, 5.6, P["chimney"], collide=False)
farm_building(kit, "FS_Barn", BARN, 4.5, 0.3, P["barn"], P["barn_roof"], 3.0, "z",
              doors=[("east", -147.0, -143.0, 3.6)],
              windows=[("north", -23.0, -21.0, 2.8, 3.8), ("south", -23.0, -21.0, 2.8, 3.8)],
              trim=P["trim"], leaf=P["barn"], glass=P["glass"])
K.report(kit)
for o in kit.build(coll, merge=False):
    add(o)
for b in kit.boxes:
    if b.collide:
        add_col(b.name.removeprefix("FS_"), (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, b.x1 - b.x0, b.z1 - b.z0, b.y1 - b.y0, y0=b.y0)

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

bad = L.check_grounded(so, allow=("FS_Path", "FS_Fence", "FS_Lawn", "FS_GateBeam", "FS_GateBoard", "FS_GateText", "FS_House_Roof", "FS_Barn_Roof",
                                  "FS_House_Chimney", "FS_House_Glass", "FS_Barn_Glass", "FS_House_Door", "FS_Barn_Door", "FS_House_Wall", "FS_Barn_Wall",
                                  "ZD_"))
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
