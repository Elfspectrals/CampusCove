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

SLUG = "a_single_pair_of_white_leather_figure_ic"
MAX_MATERIALS = 2

sc = L.new_build_scene("ITEM_ice_skates")
coll = bpy.data.collections.new("IceSkates")
sc.collection.children.link(coll)
skates = L.ship_decor(sc, coll, "ice_skates", L.import_ai_model(coll, SLUG, "DC_IceSkates"), MAX_MATERIALS)
print("ICE_SKATES", skates)
