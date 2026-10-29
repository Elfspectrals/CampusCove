import os
import sys

if "__file__" not in globals():
    raise RuntimeError('Run with exec(open(p).read(), {"__file__": p}) so the script can find lib_common.py')
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
FOOD_SCRIPT = os.path.join(HERE, "build_food_items.py")
food = {"__file__": FOOD_SCRIPT, "ONLY_ITEMS": ("medical_only",)}
exec(open(FOOD_SCRIPT, encoding="utf-8").read(), food)
L, tube, cube, ship = food["L"], food["tube"], food["cube"], food["ship"]


def bandage():
    cloth = L.make_mat("IT_Bandage_Cloth", "#f6f1e7", 0.95, "checker", 0.03, accent="#ebe4d6")
    core = L.make_mat("IT_Bandage_Core", "#d9cbb3", 0.9, "noise", 0.03)
    clip = L.make_mat("IT_Bandage_Clip", "#c9ced3", 0.4, "noise", 0.02)
    return [
        tube("Roll", 0.034, 0.034, 0.0, 0.038, cloth, seg=14),
        tube("Core", 0.012, 0.012, 0.0005, 0.038, core, seg=10),
        cube("Tail", (0.065, -0.02, 0.001), (0.09, 0.036, 0.002), cloth),
        cube("Clip", (0.034, 0.0, 0.019), (0.004, 0.016, 0.01), clip),
    ]


def painkillers():
    bottle = L.make_mat("IT_Pills_Bottle", "#f09a3e", 0.3, "noise", 0.04, accent="#e2862a")
    cap = L.make_mat("IT_Pills_Cap", "#fbfbf8", 0.6, "noise", 0.02)
    label = L.make_mat("IT_Pills_Label", "#fff4dc", 0.8, "stripes", 0.03, accent="#7cc6b4")
    return [
        tube("Bottle", 0.025, 0.025, 0.0, 0.075, bottle, seg=12),
        tube("Label", 0.0262, 0.0262, 0.018, 0.035, label, seg=12),
        tube("Cap", 0.027, 0.027, 0.075, 0.02, cap, seg=12),
    ]


def medkit():
    shell = L.make_mat("IT_Medkit_Shell", "#e0534f", 0.6, "noise", 0.03, accent="#c94541")
    white = L.make_mat("IT_Medkit_Cross", "#fbfbf8", 0.5, "noise", 0.01)
    latch = L.make_mat("IT_Medkit_Latch", "#3a3f47", 0.4, "noise", 0.02)
    return [
        cube("Box", (0, 0, 0.06), (0.26, 0.1, 0.12), shell),
        cube("Lid", (0, 0, 0.122), (0.262, 0.102, 0.006), latch),
        cube("CrossH", (0, -0.0505, 0.065), (0.07, 0.003, 0.022), white),
        cube("CrossV", (0, -0.0505, 0.065), (0.022, 0.003, 0.07), white),
        cube("HandleL", (-0.045, 0, 0.135), (0.012, 0.016, 0.025), latch),
        cube("HandleR", (0.045, 0, 0.135), (0.012, 0.016, 0.025), latch),
        cube("HandleTop", (0, 0, 0.148), (0.1, 0.016, 0.012), latch),
    ]


MEDICAL = {"bandage": bandage, "painkillers": painkillers, "medkit": medkit}
print([ship(("items", "medical"), key, build()) for key, build in MEDICAL.items()])
