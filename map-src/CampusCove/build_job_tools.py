"""Job tools sold at Crispin's Hardware (docs/TOOLS.md): secateurs, crowbar, hammer, wrench.

Each one is a `make model` mesh standing upright, handle at the bottom, so the held-item grip (35 % of the height,
front/src/game/heldItem.ts) lands on the handle. Metres, origin centre-bottom, IT_Tool_ material.
Outputs out/items/tools/<key>/{model.glb,preview.png}. Then `cd front && npm run assets:optimize -- items`.
"""
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

TOOLS = {
    "secateurs": ("garden_bypass_pruning_shears_standing_up", "Secateurs"),
    "crowbar": ("a_red_painted_steel_crowbar_pry_bar_stan", "Crowbar"),
    "hammer": ("a_single_claw_hammer_standing_upright_wo", "Hammer"),
    "wrench": ("a_single_steel_adjustable_wrench_standin", "Wrench"),
}

sc = L.new_build_scene("ITEMS_job_tools")
coll = bpy.data.collections.new("JobTools")
sc.collection.children.link(coll)

results = []
for index, (key, (slug, name)) in enumerate(TOOLS.items()):
    meshes = L.import_ai_model(coll, slug, f"IT_Tool_{name}")
    obj = L.join(coll, key, meshes)
    obj.location = (0, 0, 0)
    bpy.context.view_layer.update()
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    obj.location.x -= (min(c.x for c in corners) + max(c.x for c in corners)) / 2
    obj.location.y -= (min(c.y for c in corners) + max(c.y for c in corners)) / 2
    obj.location.z -= min(c.z for c in corners)
    bpy.context.view_layer.update()
    bad = L.check_grounded([obj])
    if bad:
        raise RuntimeError(f"{key} is not grounded: {bad}")
    out = os.path.join(L.OUT_ROOT, "items", "tools", key)
    os.makedirs(out, exist_ok=True)
    L.export_glb(os.path.join(out, "model.glb"), [obj])
    L.render_preview(sc, obj, os.path.join(out, "preview.png"))
    results.append({"key": key, "tris": sum(len(p.vertices) - 2 for p in obj.data.polygons), "dims": tuple(round(x, 3) for x in obj.dimensions)})
    obj.location.x += 0.8 * index
print("JOB_TOOLS", results)
