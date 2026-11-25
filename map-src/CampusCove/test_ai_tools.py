import json
import os
import tempfile

import numpy as np
from PIL import Image

import ai_meta
import install_ai_decor
import ref_atlas
import view_drift


def expect_exit(call):
    try:
        call()
    except SystemExit:
        return
    raise AssertionError("no refusal")


def test_back_view_must_keep_the_proportions_of_the_reference():
    assert view_drift.check_views({"ref": (100, 200), "ref_back": (95, 170)}) == []
    assert len(view_drift.check_views({"ref": (100, 200), "ref_back": (60, 200)})) == 1


def test_scale_of_the_views_and_the_side_view_are_not_judged():
    assert view_drift.check_views({"ref": (100, 200), "ref_back": (150, 300), "ref_side": (30, 400)}) == []
    assert view_drift.check_views({"ref": (100, 200)}) == []


def test_back_view_must_be_the_mirror_of_the_reference():
    asymmetric = np.zeros((100, 100), dtype=bool)
    asymmetric[:, :60] = True
    asymmetric[:30, 60:] = True
    mirrored = asymmetric[:, ::-1]
    assert view_drift.mirror_overlap(asymmetric, mirrored) > 0.95
    assert view_drift.mirror_overlap(asymmetric, asymmetric) < view_drift.MIN_MIRROR_OVERLAP
    assert view_drift.mirror_overlap(asymmetric[:, :60], asymmetric[:, :60]) > 0.95


def test_meta_refuses_a_folder_held_by_another_input():
    with tempfile.TemporaryDirectory() as folder:
        ai_meta.check(folder, "a table")
        ai_meta.write(folder, ["input=a table", "seed=42"])
        ai_meta.check(folder, "a table")
        expect_exit(lambda: ai_meta.check(folder, "a chair"))
        assert json.load(open(os.path.join(folder, "meta.json")))["seed"] == "42"


def square(color, left, right):
    rgb = np.full((64, 64, 3), 255, dtype=np.uint8)
    rgb[:, left:right] = color
    mask = np.zeros((64, 64), dtype=np.uint8)
    mask[:, left:right] = 255
    return rgb, mask


def test_atlas_puts_each_view_in_its_own_tile():
    with tempfile.TemporaryDirectory() as folder:
        for name, color, (left, right) in (("ref", (255, 0, 0), (10, 30)), ("ref_back", (0, 255, 0), (20, 60))):
            rgb, mask = square(color, left, right)
            Image.fromarray(rgb).save(os.path.join(folder, f"{name}.png"))
            Image.fromarray(mask).save(os.path.join(folder, ref_atlas.view_files(folder, name)[1]))
        atlas = ref_atlas.build_atlas(folder)
        assert atlas.shape == (128, 40, 3)
        assert (atlas[:64, :20] == (255, 0, 0)).all()
        assert (atlas[:64, 20:] == (0, 255, 0)).all()
        assert (atlas[64:, :20] == 0).all()


def test_cell_keeps_the_aspect_of_the_subject():
    _, mask = square((0, 0, 0), 10, 14)
    assert ref_atlas.cell_size(mask > 0) == (16, 64)
    assert ref_atlas.cell_size(np.ones((2000, 500), dtype=bool)) == (256, 1024)


CATEGORIES = '''{
  "categories": [
    { "id": "tables", "label": "Tables", "keys": ["desk", "side_table"] },
    { "id": "empty", "label": "Empty", "keys": [] },
    { "id": "wrapped", "label": "Wrapped", "keys": ["a",
      "b"] }
  ]
}
'''


def prepared_assets(root):
    source = os.path.join(root, "out")
    os.makedirs(source)
    for name in ("model.glb", "collision.json", "parts.json", "parts_Main.png"):
        open(os.path.join(source, name), "w").write(name)
    assets = os.path.join(root, "decor")
    os.makedirs(assets)
    open(os.path.join(assets, "categories.json"), "w").write(CATEGORIES)
    return source, assets


def test_install_copies_files_and_lists_the_key():
    with tempfile.TemporaryDirectory() as root:
        source, assets = prepared_assets(root)
        install_ai_decor.install(source, assets, "lantern", "tables")
        install_ai_decor.install(source, assets, "lamp", "empty")
        install_ai_decor.install(source, assets, "shelf", "wrapped")
        assert sorted(os.listdir(os.path.join(assets, "lantern"))) == ["collision.json", "model.glb", "parts.json", "parts_Main.png"]
        listed = {c["id"]: c["keys"] for c in json.load(open(os.path.join(assets, "categories.json")))["categories"]}
        assert listed == {"tables": ["desk", "side_table", "lantern"], "empty": ["lamp"], "wrapped": ["a", "b", "shelf"]}


def test_install_never_overwrites_or_duplicates():
    with tempfile.TemporaryDirectory() as root:
        source, assets = prepared_assets(root)
        install_ai_decor.install(source, assets, "lantern", "tables")
        before = open(os.path.join(assets, "categories.json")).read()
        expect_exit(lambda: install_ai_decor.install(source, assets, "lantern", "tables"))
        expect_exit(lambda: install_ai_decor.install(source, assets, "desk", "tables"))
        expect_exit(lambda: install_ai_decor.install(source, assets, "other", "nowhere"))
        assert open(os.path.join(assets, "categories.json")).read() == before
        assert not os.path.exists(os.path.join(assets, "other"))


for test in (test_back_view_must_keep_the_proportions_of_the_reference, test_scale_of_the_views_and_the_side_view_are_not_judged, test_back_view_must_be_the_mirror_of_the_reference,
             test_meta_refuses_a_folder_held_by_another_input, test_atlas_puts_each_view_in_its_own_tile, test_cell_keeps_the_aspect_of_the_subject,
             test_install_copies_files_and_lists_the_key, test_install_never_overwrites_or_duplicates):
    test()
    print(f"ok {test.__name__}")
