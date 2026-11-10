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
from mathutils import Vector

ONLY = globals().get("ONLY_DECOR")
MAX_MATERIALS = 6
PREVIEWS = os.path.join(L.FRONT_ASSETS, "decor")

sc = L.new_build_scene("DECOR_farm")
coll = bpy.data.collections.new("FarmDecor")
sc.collection.children.link(coll)


def ai(slug, material):
    return lambda: L.import_ai_model(coll, slug, f"DC_{material}")


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
}


def ship(key, parts):
    obj = L.join(coll, f"Decor_{key}", parts)
    obj.location = (0, 0, 0)
    bpy.context.view_layer.update()
    obj.location.z -= min((obj.matrix_world @ Vector(c)).z for c in obj.bound_box)
    bpy.context.view_layer.update()
    bad = L.check_grounded([obj])
    if bad:
        raise RuntimeError(f"{key} is not grounded: {bad}")
    if len(obj.data.materials) > MAX_MATERIALS:
        raise RuntimeError(f"{key} uses {len(obj.data.materials)} materials (max {MAX_MATERIALS})")
    out = os.path.join(L.OUT_ROOT, "decor", key)
    os.makedirs(out, exist_ok=True)
    L.export_glb(os.path.join(out, "model.glb"), [obj])
    os.makedirs(os.path.join(PREVIEWS, key), exist_ok=True)
    L.render_preview(sc, obj, os.path.join(PREVIEWS, key, "preview.png"))
    obj.hide_render = True
    return {"key": key, "tris": sum(len(p.vertices) - 2 for p in obj.data.polygons), "dims": tuple(round(x, 3) for x in obj.dimensions)}


results = [ship(key, build()) for key, build in DECOR.items() if not ONLY or key in ONLY]
print("FARM DECOR", results)
