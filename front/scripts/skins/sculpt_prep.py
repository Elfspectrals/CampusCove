"""One-time prep of a haircut sculpt: places a raw image-to-3D bust (Hunyuan3D-2mini output, normalised to a 2 m cube,
facing -Y) on our man's head, keeps only the head and hair, decimates it and saves it as `sculpts/hair_<key>.glb`, the
detail source `sculpt_bake.py` wraps and bakes the haircut onto. Alignment: the sculpt's nose tip goes on our nose tip
and its top on the top of our current haircut. Run it once per new sculpt, before `run_wear.py`; the build itself
never re-aligns, so rebuilding the wear pieces stays reproducible.

blender --background --factory-startup --python front/scripts/skins/sculpt_prep.py -- <raw.glb> <key>
"""
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.abspath(os.path.join(HERE, "..", "..", "public", "assets", "wear"))
raw, key = sys.argv[sys.argv.index("--") + 1:][:2]
TARGET_FACES = 150_000

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)


def imp(p):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=p)
    return [o for o in bpy.data.objects if o not in before]


def world_co(o):
    co = np.empty(len(o.data.vertices) * 3)
    o.data.vertices.foreach_get("co", co)
    m = np.array(o.matrix_world)
    return co.reshape(-1, 3) @ m[:3, :3].T + m[:3, 3]


ours = imp(os.path.join(ASSETS, "base", "model.glb")) + imp(os.path.join(ASSETS, "hair", key, "model.glb"))
bpy.context.view_layer.update()
head = world_co(next(o for o in ours if o.name.startswith("Body_head_m")))
band = head[(head[:, 2] > 1.62) & (head[:, 2] < 1.80)]
nose = band[band[:, 1].argmin()]
hair_top = world_co(next(o for o in ours if o.name.startswith("Wear_hair_")))[:, 2].max()
for o in ours:
    bpy.data.objects.remove(o, do_unlink=True)

sculpt = next(o for o in imp(raw) if o.type == "MESH")
bpy.context.view_layer.update()
sc = world_co(sculpt)
sband = sc[(sc[:, 2] > 0.0) & (sc[:, 2] < 0.4)]  # face height on the 2 m bust: below any fringe or quiff
snose = sband[sband[:, 1].argmin()]
s = float((hair_top - nose[2]) / (sc[:, 2].max() - snose[2]))
sculpt.scale = (s, s, s)
sculpt.location = Vector((0.0, nose[1] - snose[1] * s, nose[2] - snose[2] * s))
bpy.context.view_layer.objects.active = sculpt
sculpt.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# keep the head and hair: everything below the shoulders' line is useless for a haircut and doubles the file
import bmesh
bm = bmesh.new()
bm.from_mesh(sculpt.data)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < 1.5], context="VERTS")
bm.to_mesh(sculpt.data)
bm.free()
dec = sculpt.modifiers.new("dec", "DECIMATE")
dec.ratio = min(1.0, TARGET_FACES / max(1, len(sculpt.data.polygons)))
bpy.ops.object.modifier_apply(modifier="dec")
sculpt.name = "Sculpt_hair_" + key
sculpt.data.materials.clear()

out = os.path.join(HERE, "sculpts", "hair_%s.glb" % key)
os.makedirs(os.path.dirname(out), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", use_selection=True, export_yup=True, export_materials="NONE",
                          export_normals=False, export_draco_mesh_compression_enable=True,
                          export_draco_mesh_compression_level=10, export_draco_position_quantization=16)
print("sculpt", key, "scale %.4f" % s, "nose", nose.round(3), "faces", len(sculpt.data.polygons), "->", out,
      "%.1f MB" % (os.path.getsize(out) / 1e6))
