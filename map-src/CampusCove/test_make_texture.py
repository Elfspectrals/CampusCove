import json, os, tempfile

import numpy as np
from PIL import Image

import make_texture as T

SIZE = 256


def nearly_tileable_image():
    y, x = np.mgrid[0:SIZE, 0:SIZE]
    value = 128 + 40 * np.sin(2 * np.pi * x / SIZE) + 40 * np.cos(2 * np.pi * y / SIZE) + 0.1 * (x + y)
    return Image.fromarray(np.round(np.stack([value, value * 0.8, value * 0.6], axis=2)).astype(np.uint8))


def test_wrap_is_closed_on_both_axes():
    original = nearly_tileable_image()
    before = np.asarray(original, dtype=int)
    assert np.abs(before[:, 0] - before[:, -1]).max() > 20
    tile = np.asarray(T.make_seamless(original), dtype=int)
    assert tile.shape == before.shape, tile.shape
    assert np.abs(tile[:, 0] - tile[:, -1]).max() <= 1, np.abs(tile[:, 0] - tile[:, -1]).max()
    assert np.abs(tile[0] - tile[-1]).max() <= 1, np.abs(tile[0] - tile[-1]).max()


def test_pixels_away_from_the_edges_are_untouched():
    original = nearly_tileable_image()
    inner = slice(T.WRAP_BAND, SIZE - T.WRAP_BAND)
    tile = np.asarray(T.make_seamless(original))
    assert np.array_equal(tile[inner, inner], np.asarray(original)[inner, inner])


def test_library_keeps_each_key_in_one_category():
    color = Image.new("RGB", (64, 64), (200, 120, 90))
    with tempfile.TemporaryDirectory() as root:
        T.add_to_library(root, "red_brick", "Red brick", 2.0, "stone", color)
        T.add_to_library(root, "red_brick", "Red brick", 1.5, "brick", color)
        with open(os.path.join(root, "categories.json")) as f:
            categories = json.load(f)
        with open(os.path.join(root, "red_brick", "texture.json")) as f:
            texture = json.load(f)
        assert categories == {"version": 1, "categories": [
            {"id": "stone", "label": "Stone", "keys": []},
            {"id": "brick", "label": "Brick", "keys": ["red_brick"]}]}, categories
        assert texture == {"version": 1, "key": "red_brick", "label": "Red brick", "tileMeters": 1.5,
                           "maps": {"color": "color.png"}}, texture
        assert Image.open(os.path.join(root, "red_brick", "preview.png")).size == (T.PREVIEW_SIZE, T.PREVIEW_SIZE)


def test_invalid_key_is_refused():
    with tempfile.TemporaryDirectory() as root:
        try:
            T.add_to_library(root, "Red-Brick", "Red brick", 2.0, "stone", Image.new("RGB", (8, 8)))
        except ValueError:
            return
        raise AssertionError("invalid key accepted")


for test in (test_wrap_is_closed_on_both_axes, test_pixels_away_from_the_edges_are_untouched,
             test_library_keeps_each_key_in_one_category, test_invalid_key_is_refused):
    test()
    print(f"ok {test.__name__}")
