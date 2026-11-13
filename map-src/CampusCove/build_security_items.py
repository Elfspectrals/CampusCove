"""Reinforced door lock (tool) and alarm box (decor), both from `make model`. Outputs: out/items/tools/reinforced_lock/{model.glb,preview.png} and out/decor/alarm/. Then `npm run assets:optimize -- items tools` and `-- decor alarm`."""
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

LOCK_SLUG = "a_heavy_duty_door_deadbolt_lock_made_of_"
ALARM_SLUG = "a_wall_mounted_home_burglar_alarm_contro"
MAX_MATERIALS = 6

sc = L.new_build_scene("ITEM_security")
coll = bpy.data.collections.new("Security")
sc.collection.children.link(coll)

lock = L.import_ai_model(coll, LOCK_SLUG, "IT_ReinforcedLock")
if len(lock) != 1:
    raise RuntimeError(f"out/ai/{LOCK_SLUG}/model.glb: expected one mesh, got {len(lock)}")
lock_out = os.path.join(L.OUT_ROOT, "items", "tools", "reinforced_lock")
os.makedirs(lock_out, exist_ok=True)
L.export_glb(os.path.join(lock_out, "model.glb"), lock)
L.render_preview(sc, lock[0], os.path.join(lock_out, "preview.png"))

alarm = L.ship_decor(sc, coll, "alarm", L.import_ai_model(coll, ALARM_SLUG, "DC_Alarm"), MAX_MATERIALS)
print("SECURITY", {"lock_tris": sum(len(p.vertices) - 2 for p in lock[0].data.polygons), "alarm": alarm})
