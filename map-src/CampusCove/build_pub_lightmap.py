"""Lightmap bake for the pub interior (two levels: ground floor + techno bunker cellar). Headless only:

  "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup \
    --python map-src/CampusCove/build_pub_lightmap.py

Reuses build_house_lightmaps.py on out/work/pub/interior.glb with three pub specifics:
- the multi-level lightmap size (2048);
- Strobe_* / Laser_* lenses stay out of the bake (the front pulses them at runtime, they must not bake in as constant light);
- cellar lamps (Light_* below the ground floor) take the colour of their emissive material (deep red, UV violet)
  instead of the warm default, so the bunker bakes dark and coloured while the ground floor keeps its warm light.
Then `npm run assets:optimize -- work`.
"""
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "build_house_lightmaps.py")
CELLAR_BELOW = -0.2

code = open(SRC, encoding="utf-8").read().rstrip()
assert code.endswith("main()"), "build_house_lightmaps.py no longer ends with main()"
g = {"__file__": SRC, "__name__": "pub_lightmap"}
exec(compile(code[: -len("main()")], SRC, "exec"), g)

g["UNLIT_NAMES"] = re.compile(g["UNLIT_NAMES"].pattern.rstrip(")") + r"|Strobe_|Laser_)")
_add_lamps = g["add_lamps"]


def add_lamps(objects, power):
    count = _add_lamps(objects, power)
    sources = [o for o in objects if o.name.startswith("Light_") and not g["NOT_A_LAMP"].search(o.name)]
    bpy = g["bpy"]
    for lamp in (o for o in bpy.context.scene.objects if o.name.startswith("Bake_Lamp")):
        if lamp.location.z > CELLAR_BELOW:
            continue
        nearest = min(sources, key=lambda o: (o.matrix_world.translation - lamp.location).length, default=None)
        mat = nearest.active_material if nearest else None
        node = mat.node_tree.nodes.get("Principled BSDF") if mat and mat.use_nodes else None
        if node is None:
            continue
        col = node.inputs["Emission Color"].default_value if "Emission Color" in node.inputs else node.inputs["Base Color"].default_value
        lamp.data.color = (col[0], col[1], col[2])
    return count


g["add_lamps"] = add_lamps
g["bpy"].ops.wm.read_homefile(use_empty=True)
g["build_interior"]("pub", g["WORK_DIR"], g["WORK_DIR"], lightmap_size=g["MULTI_LEVEL_LIGHTMAP_SIZE"])
