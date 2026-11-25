import importlib.util
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("clean_ai_mesh", os.path.join(HERE, "clean_ai_mesh.py"))
cleaner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cleaner)

GRID = 2
POSITIONS = {"front": (0, 0), "back": (1, 0), "side": (0, 1)}
VIEW_FILES = {"front": "ref.png", "back": "ref_back.png", "side": "ref_side.png"}
MATERIAL = "AI_Ref"


def view_of(normal, available):
    if abs(normal.y) >= abs(normal.x):
        view = "front" if normal.y < 0 else "back"
    else:
        view = "side"
    return view if view in available else "front"


def across(view, normal, point, box):
    x0, x1, y0, y1 = box
    if view == "front":
        return (point.x - x0) / (x1 - x0)
    if view == "back":
        return (x1 - point.x) / (x1 - x0)
    return (y1 - point.y) / (y1 - y0) if normal.x < 0 else (point.y - y0) / (y1 - y0)


def atlas_uv(view, across_value, up_value):
    col, row = POSITIONS[view]
    return (col + across_value) / GRID, (GRID - 1 - row + up_value) / GRID


def atlas_material(atlas_path):
    image = bpy.data.images.load(atlas_path)
    image.pack()
    material = bpy.data.materials.new(MATERIAL)
    material.use_nodes = True
    shader = next(n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    shader.inputs["Roughness"].default_value = 0.8
    texture = material.node_tree.nodes.new("ShaderNodeTexImage")
    texture.image = image
    material.node_tree.links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    return material


def main(model_path, folder):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    o = cleaner.single_mesh(model_path)
    available = {view for view, file in VIEW_FILES.items() if os.path.exists(os.path.join(folder, file))}
    points = [o.matrix_world @ v.co for v in o.data.vertices]
    box = (min(p.x for p in points), max(p.x for p in points), min(p.y for p in points), max(p.y for p in points))
    z0, z1 = min(p.z for p in points), max(p.z for p in points)
    mesh = o.data
    rotation = o.matrix_world.to_3x3()
    uv = mesh.uv_layers.new(name="RefAtlas")
    mesh.uv_layers.active = uv
    for polygon in mesh.polygons:
        normal = (rotation @ polygon.normal).normalized()
        view = view_of(normal, available)
        for loop_index in polygon.loop_indices:
            point = points[mesh.loops[loop_index].vertex_index]
            uv.data[loop_index].uv = atlas_uv(view, across(view, normal, point, box), (point.z - z0) / (z1 - z0))
    for layer in [layer for layer in mesh.uv_layers if layer.name != uv.name]:
        mesh.uv_layers.remove(layer)
    mesh.materials.clear()
    mesh.materials.append(atlas_material(os.path.join(folder, "atlas.png")))
    cleaner.activate(o)
    bpy.ops.export_scene.gltf(filepath=model_path, export_format="GLB", use_selection=True)
    print(f"{o.name}: atlas from {sorted(available)} -> {model_path}")


if __name__ == "__main__":
    main(*sys.argv[sys.argv.index("--") + 1:])
