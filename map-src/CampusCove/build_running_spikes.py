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

SLUG = "a_pair_of_track_running_spikes_shoes_whi"
MAX_MATERIALS = 2

sc = L.new_build_scene("ITEM_running_spikes")
coll = bpy.data.collections.new("RunningSpikes")
sc.collection.children.link(coll)
spikes = L.ship_decor(sc, coll, "running_spikes", L.import_ai_model(coll, SLUG, "DC_RunningSpikes"), MAX_MATERIALS)
print("RUNNING_SPIKES", spikes)
