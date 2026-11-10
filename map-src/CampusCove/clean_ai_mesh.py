import bpy, math, os, sys
from mathutils import Vector

WOOD_SOURCE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../front/public/assets/decor/dining_table/model.glb")
WOOD_MATERIAL = "DC_Wood"
WOOD_UV_PER_METRE = 1.2
VOXELS_PER_HEIGHT = 200
MIN_DECIMATE_RATIO = 0.4


def tri_count(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def activate(o):
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o


def wood_material():
    objects = import_glb(WOOD_SOURCE)
    material = bpy.data.materials.get(WOOD_MATERIAL)
    if material is None:
        raise RuntimeError(f"{WOOD_MATERIAL} not found in {WOOD_SOURCE}")
    for o in objects:
        bpy.data.objects.remove(o)
    return material


def single_mesh(path):
    objects = import_glb(path)
    meshes = [o for o in objects if o.type == "MESH"]
    if len(meshes) != 1:
        raise RuntimeError(f"expected one mesh in {path}, found {len(meshes)}")
    mesh = meshes[0]
    world = mesh.matrix_world.copy()
    mesh.parent = None
    mesh.matrix_world = world
    for o in objects:
        if o is not mesh:
            bpy.data.objects.remove(o)
    return mesh


def stand_on_origin(o, height):
    activate(o)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    points = [v.co for v in o.data.vertices]
    low = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    high = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    scale = height / (high.z - low.z)
    centre = (low + high) / 2
    for v in o.data.vertices:
        v.co = Vector(((v.co.x - centre.x) * scale, (v.co.y - centre.y) * scale, (v.co.z - low.z) * scale))


def reduce_to(o, height, target_tris):
    remesh = o.modifiers.new("remesh", "REMESH")
    remesh.mode = "VOXEL"
    remesh.voxel_size = height / VOXELS_PER_HEIGHT
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    while tri_count(o) > target_tris:
        decimate = o.modifiers.new("decimate", "DECIMATE")
        decimate.ratio = max(MIN_DECIMATE_RATIO, target_tris / tri_count(o))
        bpy.ops.object.modifier_apply(modifier=decimate.name)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40))


def apply_wood(o):
    o.data.materials.clear()
    o.data.materials.append(wood_material())
    activate(o)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.cube_project(cube_size=1 / WOOD_UV_PER_METRE)
    bpy.ops.object.mode_set(mode="OBJECT")


def main(raw_path, out_path, name, height, target_tris):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    o = single_mesh(raw_path)
    o.name = name
    stand_on_origin(o, height)
    reduce_to(o, height, target_tris)
    apply_wood(o)
    activate(o)
    bpy.ops.export_scene.gltf(filepath=out_path, export_format="GLB", use_selection=True)
    print(f"{name}: {tri_count(o)} tris, {tuple(round(d, 2) for d in o.dimensions)} m -> {out_path}")


if __name__ == "__main__":
    raw_path, out_path, name, height, target_tris = sys.argv[sys.argv.index("--") + 1:]
    main(raw_path, out_path, name, float(height), int(target_tris))
