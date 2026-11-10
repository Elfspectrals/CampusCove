import importlib.util
import os

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("clean_ai_mesh", os.path.join(HERE, "clean_ai_mesh.py"))
C = importlib.util.module_from_spec(spec)
spec.loader.exec_module(C)


def sphere():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=0.5, location=(0, 0, 0.5))
    return bpy.context.active_object


def remeshed_tri_count(height):
    o = sphere()
    remesh = o.modifiers.new("remesh", "REMESH")
    remesh.mode = "VOXEL"
    remesh.voxel_size = height / C.VOXELS_PER_HEIGHT
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    return C.tri_count(o)


def test_dense_mesh_lands_between_min_ratio_and_target():
    o = sphere()
    C.reduce_to(o, 1.0, 800)
    tris = C.tri_count(o)
    assert C.MIN_DECIMATE_RATIO * 800 <= tris <= 800, tris


def test_mesh_already_under_target_is_not_decimated():
    expected = remeshed_tri_count(1.0)
    o = sphere()
    C.reduce_to(o, 1.0, expected)
    assert C.tri_count(o) == expected, (C.tri_count(o), expected)


for test in (test_dense_mesh_lands_between_min_ratio_and_target, test_mesh_already_under_target_is_not_decimated):
    test()
    print(f"ok {test.__name__}")
