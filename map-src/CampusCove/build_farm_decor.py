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
import bpy

ONLY = globals().get("ONLY_DECOR")
MAX_MATERIALS = 6

sc = L.new_build_scene("DECOR_farm")
coll = bpy.data.collections.new("FarmDecor")
sc.collection.children.link(coll)


def ai(slug, material):
    return lambda: L.import_ai_model(coll, slug, f"DC_{material}")


def apple_tree(slug, n, layout):
    return lambda: L.import_ai_apple_tree(coll, slug, f"DC_AppleTree{n}", layout)


def tool_rack():
    wood = L.make_mat("DC_RackWood", "#9a7448", 0.85, "planks", 0.05, accent="#7e5c38")
    handle = L.make_mat("DC_ToolHandle", "#c79a62", 0.8, "noise", 0.04)
    metal = L.make_mat("DC_ToolMetal", "#8a8f96", 0.4, "noise", 0.03)
    parts = [L.box(coll, f"Post{k}", gx, 0.0, 0.0, 0.08, 0.08, 1.5, wood) for k, gx in enumerate((-0.62, 0.62))]
    parts += [L.box(coll, f"Bar{k}", 0.0, 0.0, y, 1.32, 0.06, 0.06, wood) for k, y in enumerate((0.25, 1.38))]
    parts += [L.box(coll, f"Foot{k}", gx, 0.0, 0.0, 0.1, 0.4, 0.06, wood) for k, gx in enumerate((-0.62, 0.62))]
    for k, gx in enumerate((-0.36, 0.0, 0.36)):
        parts.append(L.cyl(coll, f"Handle{k}", gx, -0.06, 0.06, 0.018, 1.3, handle, seg=6))
    parts.append(L.box(coll, "RakeHead", -0.36, -0.06, 1.36, 0.42, 0.04, 0.05, metal))
    parts += [L.box(coll, f"RakeTine{k}", -0.54 + 0.06 * k, -0.06, 1.41, 0.015, 0.015, 0.1, metal) for k in range(7)]
    parts.append(L.box(coll, "ForkBar", 0.0, -0.06, 1.36, 0.2, 0.03, 0.03, metal))
    parts += [L.box(coll, f"ForkTine{k}", -0.08 + 0.08 * k, -0.06, 1.39, 0.015, 0.015, 0.22, metal) for k in range(3)]
    parts.append(L.box(coll, "ShovelBlade", 0.36, -0.06, 0.06, 0.22, 0.03, 0.3, metal, bevel=0.01))
    return parts


def pen_wood():
    return L.make_mat("DC_PenPost", "#6e4f33", 0.85, "noise", 0.04), L.make_mat("DC_PenRail", "#a9825a", 0.85, "planks", 0.05, accent="#86633f")


def fence_panel():
    post, rail = pen_wood()
    parts, _ = L.fence_run(coll, "Fence", -1.25, 0.0, 1.25, 0.0, post, rail)
    return parts


def fence_gate():
    post, rail = pen_wood()
    parts = [L.box(coll, f"GatePost{k}", gx, 0.0, 0.0, 0.16, 0.16, 1.3, post, bevel=0.015) for k, gx in enumerate((-0.8, 0.8))]
    parts += [L.box(coll, f"GateBar{k}", 0.0, 0.0, y, 1.44, 0.06, 0.1, rail) for k, y in enumerate((0.2, 0.55, 0.9))]
    parts += [L.box(coll, f"GateStile{k}", gx, 0.0, 0.15, 0.08, 0.07, 0.9, rail) for k, gx in enumerate((-0.66, 0.66))]
    brace = L.box(coll, "GateBrace", 0.0, 0.0, 0.0, 0.07, 0.05, 1.49, rail)
    brace.location.z = 0.22
    brace.rotation_euler.y = math.atan2(1.32, 0.7)
    brace.location.x = -0.62
    parts.append(brace)
    return parts


def wire_panel():
    post = pen_wood()[0]
    wire = L.make_mat("DC_ChickenWire", "#b7bcc2", 0.4, "noise", 0.02)
    parts = [L.box(coll, f"WirePost{k}", gx, 0.0, 0.0, 0.1, 0.1, 1.2, post) for k, gx in enumerate((-1.25, 1.25))]
    parts += [L.box(coll, f"WireRow{k}", 0.0, 0.0, 0.05 + 0.15 * k, 2.4, 0.012, 0.012, wire) for k in range(8)]
    parts += [L.box(coll, f"WireCol{k}", -1.1 + 0.2 * k, 0.0, 0.05, 0.012, 0.012, 1.07, wire) for k in range(12)]
    parts.append(L.box(coll, "WireTop", 0.0, 0.0, 1.1, 2.5, 0.06, 0.06, post))
    return parts


def mud_patch():
    mud = L.make_mat("DC_Mud", "#5a3f2a", 1.0, "noise", 0.08, accent="#4a3322")
    parts = []
    for k, (gx, gz, r, sx) in enumerate(((0.0, 0.0, 1.0, 1.5), (0.9, 0.5, 0.6, 1.2), (-1.0, -0.4, 0.55, 1.1))):
        puddle = L.cyl(coll, f"Mud{k}", gx, gz, 0.0, r, 0.03 + 0.01 * k, mud, seg=12)
        puddle.scale.x = sx
        parts.append(puddle)
    return parts


def hay_rack():
    post, rail = pen_wood()
    straw = L.make_mat("DC_RackHay", "#d8bf6a", 0.95, "stripes", 0.07, accent="#c2a756")
    parts = [L.box(coll, f"RackLeg{k}", gx, gz, 0.0, 0.08, 0.08, 1.1, post) for k, (gx, gz) in enumerate(((-0.75, -0.3), (0.75, -0.3), (-0.75, 0.3), (0.75, 0.3)))]
    parts.append(L.box(coll, "RackTrough", 0.0, 0.0, 0.35, 1.58, 0.68, 0.08, rail))
    parts.append(L.box(coll, "RackHay", 0.0, 0.0, 0.43, 1.4, 0.5, 0.45, straw, bevel=0.06))
    for side, gz in (("F", -0.3), ("B", 0.3)):
        parts += [L.box(coll, f"RackSlat{side}{k}", -0.6 + 0.2 * k, gz, 0.43, 0.04, 0.04, 0.62, rail) for k in range(7)]
        parts.append(L.box(coll, f"RackRail{side}", 0.0, gz, 1.05, 1.58, 0.06, 0.06, rail))
    return parts


DECOR = {
    "scarecrow": ai("a_single_straw_scarecrow_with_a_hat_and_", "Scarecrow"),
    "hay_bale_round": ai("a_single_round_golden_hay_bale_lying_on_", "HayBale"),
    "water_trough": ai("a_single_long_wooden_water_trough_for_an", "WaterTrough"),
    "milk_churn": ai("a_single_old_metal_milk_churn_with_a_lid", "MilkChurn"),
    "feed_sacks": ai("a_single_stack_of_three_burlap_feed_sack", "FeedSacks"),
    "wooden_barrel": ai("a_single_wooden_barrel_with_metal_hoops", "Barrel"),
    "chicken_coop": ai("a_single_small_red_wooden_chicken_coop_w", "ChickenCoop"),
    "stone_well": ai("a_single_round_stone_water_well_with_a_s", "StoneWell"),
    "watering_can": ai("a_single_green_metal_watering_can", "WateringCan"),
    "vegetable_crate": ai("a_single_wooden_crate_full_of_fresh_vege", "VegetableCrate"),
    "tool_rack": tool_rack,
    "chicken_feeder": ai("a_single_round_galvanized_metal_chicken_", "ChickenFeeder"),
    "fence_panel": fence_panel,
    "fence_gate": fence_gate,
    "wire_panel": wire_panel,
    "mud_patch": mud_patch,
    "hay_rack": hay_rack,
    "apple_tree_1": apple_tree("a_leafy_tree_with_a_round_dark_green_cro", 1, "spread"),
    "apple_tree_2": apple_tree("a_leafy_tree_with_a_tall_oval_dark_green", 2, "low"),
    "apple_tree_3": apple_tree("a_leafy_tree_with_a_wide_spreading_dark_", 3, "clusters"),
    "apple_tree_4": apple_tree("a_leafy_tree_with_a_lumpy_dark_green_cro", 4, "few_big"),
}


results = [L.ship_decor(sc, coll, key, build(), MAX_MATERIALS) for key, build in DECOR.items() if not ONLY or key in ONLY]
print("FARM DECOR", results)
