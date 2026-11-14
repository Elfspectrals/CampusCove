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
import lib_boxing as B
importlib.reload(B)
import bpy

GLOVES_SLUG = "a_pair_of_red_leather_boxing_gloves_side"
MAX_MATERIALS = 4

sc = L.new_build_scene("DECOR_boxing")
coll = bpy.data.collections.new("BoxingDecor")
sc.collection.children.link(coll)
DECOR = {
    "punch_bag": lambda: B.punch_bag_parts(coll, B.punch_bag_materials()),
    "boxing_gloves": lambda: L.import_ai_model(coll, GLOVES_SLUG, "DC_BoxingGloves"),
}
for key, build in DECOR.items():
    print(L.ship_decor(sc, coll, key, build(), MAX_MATERIALS))
