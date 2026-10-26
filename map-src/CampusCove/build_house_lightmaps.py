"""Baked lighting for the 10 house interiors (docs/OPEN_WORLD.md, phase 3).

Edits the shipped interior.glb: every lit mesh gets a second UV map packed into one atlas per house, Cycles
bakes the irradiance of the ceiling lamps (Light_* nodes) and a soft sky fill into lightmap.jpg, and the
interior is exported with that UV map as TEXCOORD_1. The sky planes, the entrance door and the window glass
are left out of the bake.
Raw exports go to out/houses/<key>/{interior.glb,lightmap.jpg}, then `npm run assets:optimize -- houses`.

Headless only (resets the file for each house):
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
    --python map-src/CampusCove/build_house_lightmaps.py [-- house_01 house_02 ...]
Work interiors (raw builds in out/work/<key>/, baked in place, then `npm run assets:optimize -- work`):
    --python map-src/CampusCove/build_house_lightmaps.py -- work [cafe boutique tech_hub]
"""
import os
import re
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.normpath(os.path.join(HERE, "..", "..", "front", "public", "assets", "houses"))
OUT = os.path.join(HERE, "out", "houses")
KEYS = [f"house_{i:02d}" for i in range(1, 11)]
WORK_DIR = os.path.join(HERE, "out", "work")
WORK_KEYS = ["cafe", "boutique", "tech_hub"]

LIGHTMAP_UV = "Lightmap"
LIGHTMAP_SIZE = 1024
LIGHTMAP_JPEG_QUALITY = 85
LIGHTMAP_MARGIN_DIV = 0.3
BAKE_SAMPLES = 512
LAMP_POWER_W = 120.0
LAMP_DROP = 0.2
SKY_FILL_STRENGTH = 0.35
UNLIT_NAMES = re.compile(r"^(Sky_|Door_Entrance|Window_.*_Glass|Walls_.*_Glass|Glass_)")


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def setup_render():
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = BAKE_SAMPLES
    scene.cycles.use_denoising = True
    world = bpy.data.worlds.new("SkyFill")
    world.use_nodes = True
    background = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    background.inputs[0].default_value = (0.78, 0.86, 1.0, 1.0)
    background.inputs[1].default_value = SKY_FILL_STRENGTH
    scene.world = world


def add_lamps(objects):
    lamps = [o for o in objects if o.name.startswith("Light_")]
    if not lamps:
        raise RuntimeError("interior has no Light_* node to bake")
    for lamp in lamps:
        center = sum((lamp.matrix_world @ v.co for v in lamp.data.vertices), Vector()) / len(lamp.data.vertices)
        data = bpy.data.lights.new(f"Bake_{lamp.name}", type="POINT")
        data.energy = LAMP_POWER_W
        data.color = (1.0, 0.9, 0.78)
        data.shadow_soft_size = 0.25
        light = bpy.data.objects.new(f"Bake_{lamp.name}", data)
        light.location = (center.x, center.y, center.z - LAMP_DROP)
        bpy.context.scene.collection.objects.link(light)
    return len(lamps)


def pack_lightmap_uvs(meshes):
    for obj in meshes:
        layers = obj.data.uv_layers
        while len(layers) > 1:
            layers.remove(layers[-1])
        layers.active = layers.new(name=LIGHTMAP_UV)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=1e-4)
    bpy.ops.mesh.tris_convert_to_quads()
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.lightmap_pack(PREF_CONTEXT="ALL_FACES", PREF_PACK_IN_ONE=True, PREF_NEW_UVLAYER=False,
                             PREF_BOX_DIV=12, PREF_MARGIN_DIV=LIGHTMAP_MARGIN_DIV)
    bpy.ops.object.mode_set(mode="OBJECT")


def bake(meshes, image):
    added = []
    for material in {slot.material for obj in meshes for slot in obj.material_slots if slot.material}:
        material.use_nodes = True
        node = material.node_tree.nodes.new("ShaderNodeTexImage")
        node.image = image
        material.node_tree.nodes.active = node
        added.append((material, node))
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, margin=4, use_clear=True)
    for material, node in added:
        material.node_tree.nodes.remove(node)


def build_interior(key, source_dir, out_dir):
    objects = import_glb(os.path.join(source_dir, key, "interior.glb"))
    setup_render()
    lamps = add_lamps(objects)
    meshes = [o for o in objects if o.type == "MESH" and not UNLIT_NAMES.match(o.name)]
    unlit = [o for o in objects if o.type == "MESH" and UNLIT_NAMES.match(o.name)]
    for obj in unlit:
        obj.hide_render = True
    pack_lightmap_uvs(meshes)

    image = bpy.data.images.new("Lightmap", LIGHTMAP_SIZE, LIGHTMAP_SIZE, float_buffer=True)
    image.colorspace_settings.name = "Non-Color"
    bake(meshes, image)
    os.makedirs(os.path.join(out_dir, key), exist_ok=True)
    image.file_format = "JPEG"
    image.save(filepath=os.path.join(out_dir, key, "lightmap.jpg"), quality=LIGHTMAP_JPEG_QUALITY)

    for obj in unlit:
        obj.hide_render = False
    for obj in meshes:
        obj.data.uv_layers[0].active = True
        obj.data.uv_layers[0].active_render = True
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(out_dir, key, "interior.glb"),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_image_format="AUTO",
        export_cameras=False,
        export_lights=False,
    )
    print(f"LIGHTMAP {key}: {len(meshes)} meshes, {lamps} lamps")


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if args[:1] == ["work"]:
        keys, source_dir, out_dir = args[1:] or WORK_KEYS, WORK_DIR, WORK_DIR
    else:
        keys, source_dir, out_dir = args or KEYS, ASSETS, OUT
    for key in keys:
        bpy.ops.wm.read_homefile(use_empty=True)
        build_interior(key, source_dir, out_dir)


main()
