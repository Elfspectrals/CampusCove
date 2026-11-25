import importlib.util
import os

from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("bake_ref_atlas", os.path.join(HERE, "bake_ref_atlas.py"))
B = importlib.util.module_from_spec(spec)
spec.loader.exec_module(B)

BOX = (0.0, 2.0, 0.0, 1.0)
ALL = {"front", "back", "side"}


def test_each_face_picks_the_view_it_looks_at():
    assert B.view_of(Vector((0, -1, 0)), ALL) == "front"
    assert B.view_of(Vector((0, 1, 0)), ALL) == "back"
    assert B.view_of(Vector((-1, 0, 0)), ALL) == "side"
    assert B.view_of(Vector((1, 0, 0)), ALL) == "side"


def test_missing_views_fall_back_to_front():
    assert B.view_of(Vector((0, 1, 0)), {"front"}) == "front"
    assert B.view_of(Vector((1, 0, 0)), {"front", "back"}) == "front"


def test_horizontal_position_follows_the_camera_of_each_view():
    assert B.across("front", Vector((0, -1, 0)), Vector((0.5, 0, 0)), BOX) == 0.25
    assert B.across("back", Vector((0, 1, 0)), Vector((0.5, 0, 0)), BOX) == 0.75
    assert B.across("side", Vector((-1, 0, 0)), Vector((0, 0.25, 0)), BOX) == 0.75
    assert B.across("side", Vector((1, 0, 0)), Vector((0, 0.25, 0)), BOX) == 0.25


def test_atlas_tiles_do_not_overlap():
    assert B.atlas_uv("front", 0.5, 1.0) == (0.25, 1.0)
    assert B.atlas_uv("back", 0.0, 0.0) == (0.5, 0.5)
    assert B.atlas_uv("side", 1.0, 0.5) == (0.5, 0.25)


for test in (test_each_face_picks_the_view_it_looks_at, test_missing_views_fall_back_to_front,
             test_horizontal_position_follows_the_camera_of_each_view, test_atlas_tiles_do_not_overlap):
    test()
    print(f"ok {test.__name__}")
