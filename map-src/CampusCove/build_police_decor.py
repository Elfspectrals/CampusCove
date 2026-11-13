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
import bpy

ONLY = globals().get("ONLY_DECOR")
MAX_MATERIALS = 6
PATROL_CAR_SLUG = "a_white_police_patrol_sedan_car_with_a_d"

sc = L.new_build_scene("DECOR_police")
coll = bpy.data.collections.new("PoliceDecor")
sc.collection.children.link(coll)


def police_lockers():
    body = L.make_mat("DC_LockerBody", "#5f7f9c", 0.55, "noise", 0.03)
    door = L.make_mat("DC_LockerDoor", "#6f90ad", 0.5, "noise", 0.02)
    dark = L.make_mat("DC_LockerDark", "#262a31", 0.6, "noise", 0.02)
    steel = L.make_mat("DC_LockerSteel", "#c3c8cf", 0.35, "noise", 0.02)
    parts = [
        L.box(coll, "Plinth", 0.0, 0.0, 0.0, 1.56, 0.46, 0.08, dark),
        L.box(coll, "Body", 0.0, 0.0, 0.08, 1.6, 0.5, 1.82, body, bevel=0.01),
        L.box(coll, "Top", 0.0, 0.0, 1.9, 1.64, 0.54, 0.04, body),
    ]
    for i in range(4):
        x = -0.6 + i * 0.4
        parts.append(L.box(coll, f"Door{i}", x, 0.255, 0.14, 0.37, 0.02, 1.7, door))
        parts.append(L.box(coll, f"Handle{i}", x + 0.12, 0.27, 0.95, 0.03, 0.02, 0.12, steel))
        parts.append(L.box(coll, f"Tag{i}", x, 0.267, 1.62, 0.12, 0.006, 0.06, steel))
        for k in range(3):
            parts.append(L.box(coll, f"Vent{i}_{k}", x, 0.267, 1.38 - k * 0.06, 0.24, 0.006, 0.025, dark))
    return parts


def wanted_board():
    wood = L.make_mat("DC_BoardFrame", "#5a3d2a", 0.7, "planks", 0.04, accent="#4a3122")
    cork = L.make_mat("DC_BoardCork", "#b88a5a", 0.95, "noise", 0.08)
    paper = L.make_mat("DC_WantedPaper", "#efe6cf", 0.9, "noise", 0.03)
    photo = L.make_mat("DC_WantedPhoto", "#3b3631", 0.8, "noise", 0.05)
    header = L.make_mat("DC_BoardHeader", "#1f3350", 0.6, "noise", 0.02)
    parts = [
        L.box(coll, "FootL", -0.95, 0.0, 0.0, 0.1, 0.5, 0.06, wood),
        L.box(coll, "FootR", 0.95, 0.0, 0.0, 0.1, 0.5, 0.06, wood),
        L.box(coll, "PostL", -0.95, 0.0, 0.06, 0.07, 0.07, 1.94, wood),
        L.box(coll, "PostR", 0.95, 0.0, 0.06, 0.07, 0.07, 1.94, wood),
        L.box(coll, "Frame", 0.0, 0.0, 0.72, 1.86, 0.06, 1.2, wood),
        L.box(coll, "Cork", 0.0, 0.035, 0.78, 1.74, 0.01, 0.94, cork),
        L.box(coll, "Header", 0.0, 0.035, 1.74, 1.74, 0.012, 0.14, header),
        L.text_mesh(coll, "HeaderText", "WANTED", 0.0, 0.043, 1.765, 0.1, 0.002, paper),
    ]
    for i, (x, y) in enumerate(((-0.6, 1.2), (0.0, 1.23), (0.6, 1.19), (-0.6, 0.8), (0.0, 0.83), (0.6, 0.81))):
        parts.append(L.box(coll, f"Paper{i}", x, 0.042, y, 0.36, 0.004, 0.44, paper))
        parts.append(L.box(coll, f"Photo{i}", x, 0.046, y + 0.18, 0.2, 0.003, 0.18, photo))
        parts.append(L.box(coll, f"Line{i}", x, 0.046, y + 0.08, 0.26, 0.003, 0.03, photo))
    return parts


def bike_rack():
    steel = L.make_mat("DC_RackSteel", "#9aa1a9", 0.4, "noise", 0.03)
    base = L.make_mat("DC_RackBase", "#3a3f47", 0.6, "noise", 0.03)
    parts = [L.box(coll, "RailN", 0.0, -0.32, 0.0, 2.1, 0.06, 0.04, base), L.box(coll, "RailS", 0.0, 0.32, 0.0, 2.1, 0.06, 0.04, base)]
    for i in range(5):
        x = -0.9 + i * 0.45
        parts.append(L.box(coll, f"HoopN{i}", x, -0.3, 0.04, 0.04, 0.04, 0.76, steel))
        parts.append(L.box(coll, f"HoopS{i}", x, 0.3, 0.04, 0.04, 0.04, 0.76, steel))
        parts.append(L.box(coll, f"HoopTop{i}", x, 0.0, 0.8, 0.04, 0.64, 0.04, steel))
    return parts


def parking_barrier():
    post = L.make_mat("DC_BarrierPost", "#e8b923", 0.6, "stripes", 0.03, accent="#2a2c31")
    arm = L.make_mat("DC_BarrierArm", "#f4f2ec", 0.6, "stripes", 0.02, accent="#d83a34")
    dark = L.make_mat("DC_BarrierDark", "#2a2c31", 0.6, "noise", 0.02)
    return [
        L.box(coll, "Base", 0.0, 0.0, 0.0, 0.45, 0.45, 0.06, dark),
        L.box(coll, "Post", 0.0, 0.0, 0.06, 0.32, 0.32, 1.0, post, bevel=0.02),
        L.box(coll, "Weight", -0.35, 0.0, 0.86, 0.4, 0.14, 0.2, dark),
        L.box(coll, "Arm", 2.1, 0.0, 0.9, 4.0, 0.08, 0.1, arm),
        L.box(coll, "Rest", 3.9, 0.0, 0.0, 0.08, 0.08, 0.9, dark),
    ]


def patrol_car():
    return L.import_ai_model(coll, PATROL_CAR_SLUG, "DC_PatrolCar")


DECOR = {
    "police_lockers": police_lockers,
    "wanted_board": wanted_board,
    "bike_rack": bike_rack,
    "parking_barrier": parking_barrier,
    "patrol_car": patrol_car,
}

results = [L.ship_decor(sc, coll, key, build(), MAX_MATERIALS) for key, build in DECOR.items() if not ONLY or key in ONLY]
print("POLICE DECOR", results)
