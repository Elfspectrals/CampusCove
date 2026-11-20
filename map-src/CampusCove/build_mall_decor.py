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
PALETTE = 6
COLOURED_SATURATION = 1.9
COLOURED = ("high_chair", "kiosk_cart")
METAL_SATURATION = 0.6
BRIGHTNESS = 1.4
LOOKS = {
    "gift_box_display": {"coral": dict(hue=0.01, min_saturation=0.55), "teal": dict(hue=0.5, min_saturation=0.5), "gold": dict(hue=0.12, min_saturation=0.65)},
    "info_desk": {"sand": dict(hue=0.1, min_saturation=0.3), "teal": dict(hue=0.5, min_saturation=0.4), "berry": dict(hue=0.88, min_saturation=0.4)},
}
PALETTE_BY_KEY = {"kiosk_cart_a": 4, "kiosk_cart_b": 4, "kiosk_cart_c": 4, "box_stack_a": 5, "box_stack_b": 5, "box_stack_c": 5, "dumpster_a": 4, "dumpster_b": 4, "dumpster_c": 4, "extinguisher": 4}

PACKS = {
    "mall_food_court": ("condiment_stand", "ice_cream_freezer", "popcorn_cart", "tray_bin_station", "tray_trolley",
                        "high_chair_a", "high_chair_b", "high_chair_c", "drink_dispenser_a", "drink_dispenser_b", "drink_dispenser_c",
                        "janitor_cart_a", "janitor_cart_b", "janitor_cart_c"),
    "mall_plaza": ("charging_station", "ficus_pot", "fountain_statue", "indoor_palm", "massage_chair", "info_totem_a", "info_totem_b", "info_totem_c", "kiosk_cart_a", "kiosk_cart_b", "kiosk_cart_c"),
    "mall_service": ("box_stack_a", "box_stack_b", "box_stack_c", "cable_reel", "dumpster_a", "dumpster_b", "dumpster_c", "extinguisher",
                     "hand_truck_a", "hand_truck_b", "hand_truck_c", "mop_bucket", "gas_cylinders_a", "gas_cylinders_b", "gas_cylinders_c",
                     "pallet_jack_a", "pallet_jack_b", "pallet_jack_c"),
    "mall_parking": ("delivery_van_a", "delivery_van_c", "ev_charger", "motorcycle_a", "motorcycle_b", "sedan", "suv",
                     "pay_station_a", "pay_station_b", "pay_station_c"),
    "mall_identity": ("brochure_rack", "directory_totem", "gift_box_display_a", "gift_box_display_b", "gift_box_display_c",
                      "info_desk_a", "info_desk_b", "info_desk_c"),
}

def _family(key):
    return key.rsplit("_", 1)[0]


KEYS = [key for keys in PACKS.values() for key in keys]
SECOND_WAVE = tuple(k for k in KEYS if _family(k) in ("drink_dispenser", "janitor_cart", "info_totem", "gas_cylinders", "pay_station", "pallet_jack"))

def _jobs(key):
    family = _family(key)
    if family in LOOKS:
        return [(f"{key}_{look}", dict(brightness=BRIGHTNESS, **params)) for look, params in LOOKS[family].items()]
    if family in COLOURED:
        return [(key, dict(saturation=COLOURED_SATURATION, brightness=BRIGHTNESS))]
    if key in SECOND_WAVE:
        return [(key, dict(saturation=METAL_SATURATION, brightness=BRIGHTNESS))]
    return [(key, {})]


sc = L.new_build_scene("DECOR_mall")
coll = bpy.data.collections.new("MallDecor")
sc.collection.children.link(coll)

ready = [k for k in KEYS if (not ONLY or k in ONLY) and os.path.exists(os.path.join(L.OUT_ROOT, "ai", k, "model.glb"))]
results, failures = [], []
for key in ready:
    for shipped, tone in _jobs(key):
        try:
            results.append(L.ship_decor(sc, coll, shipped, L.import_ai_model(coll, key, f"DC_Mall_{shipped}", palette=PALETTE_BY_KEY.get(key, PALETTE), **tone), MAX_MATERIALS))
        except (RuntimeError, ValueError) as error:
            failures.append((shipped, str(error)))
print("MALL DECOR", results)
if failures:
    raise RuntimeError(f"mall decor failed: {failures}")
