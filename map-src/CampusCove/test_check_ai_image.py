import numpy as np

import check_ai_image as C

SIZE = C.SIZE


def side_view(legs, body=(60, 120, 30, 226), leg_height=60, extra=None):
    mask = np.zeros((SIZE, SIZE), dtype=bool)
    top, bottom, left, right = body
    mask[top:bottom, left:right] = True
    for x in legs:
        mask[bottom:bottom + leg_height, x:x + 10] = True
    if extra:
        y0, y1, x0, x1 = extra
        mask[y0:y1, x0:x1] = True
    return mask


def test_four_legged_side_view_passes():
    assert C.problems(side_view([40, 70, 170, 200]), "quadruped") == []


def test_extra_leg_is_reported():
    found = C.problems(side_view([40, 70, 120, 170, 200]), "quadruped")
    assert any("5 legs" in p for p in found), found


def test_fused_legs_are_reported():
    found = C.problems(side_view([40, 46]), "quadruped")
    assert any("1 legs" in p for p in found), found


def test_overlapping_leg_pairs_pass():
    assert C.problems(side_view([40, 170]), "quadruped") == []


def test_second_object_is_reported():
    found = C.problems(side_view([40, 70, 170, 200], extra=(200, 230, 100, 140)), "quadruped")
    assert any("2 separate objects" in p for p in found), found


def test_three_quarter_view_is_too_narrow():
    found = C.problems(side_view([95, 115, 135, 150], body=(40, 150, 90, 165), leg_height=50), "quadruped")
    assert any("width / height" in p for p in found), found


def test_bird_with_two_legs_passes():
    assert C.problems(side_view([110, 140], body=(60, 160, 80, 190), leg_height=40), "biped") == []


for test in (test_four_legged_side_view_passes, test_extra_leg_is_reported, test_fused_legs_are_reported,
             test_overlapping_leg_pairs_pass,
             test_second_object_is_reported, test_three_quarter_view_is_too_narrow, test_bird_with_two_legs_passes):
    test()
    print(f"ok {test.__name__}")
