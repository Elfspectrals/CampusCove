import importlib
import json
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
import lib_buildings as B
importlib.reload(B)
import bpy

prop = json.loads(globals()["BUILDING_PROP"])
out = globals()["BUILDING_OUT"]
sc = L.new_build_scene("BUILDING_preview")
coll = bpy.data.collections.new("BuildingPreview")
sc.collection.children.link(coll)
kit = B.local_kit(prop)
K.report(kit)
objs = kit.build(coll, prefix=f"{B.PREFIX}{prop['id']}")
L.export_glb(out, objs)
print("BUILDING PREVIEW", out, len(objs), "objects")
