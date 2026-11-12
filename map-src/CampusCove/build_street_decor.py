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

sc = L.new_build_scene("DECOR_street")
coll = bpy.data.collections.new("StreetDecor")
sc.collection.children.link(coll)

DECOR = {
    "atm": lambda: L.import_ai_model(coll, "a_street_atm_cash_machine_kiosk_with_a_s", "DC_Atm"),
    "cash_bag": lambda: L.import_ai_model(coll, "a_small_canvas_money_bag_tied_with_a_rop", "DC_CashBag"),
}

results = [L.ship_decor(sc, coll, key, build(), MAX_MATERIALS) for key, build in DECOR.items() if not ONLY or key in ONLY]
print("STREET DECOR", results)
