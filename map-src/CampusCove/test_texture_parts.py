import json, os, tempfile

import numpy as np
from PIL import Image

import texture_parts as P

SIZE = 64


def bricks_image():
    rng = np.random.default_rng(3)
    pixels = np.empty((SIZE, SIZE, 3))
    pixels[:] = (0.65, 0.35, 0.28)
    pixels[::16, :] = (0.88, 0.85, 0.80)
    pixels[:, ::32] = (0.88, 0.85, 0.80)
    pixels += rng.uniform(-0.04, 0.04, pixels.shape)
    return Image.fromarray(np.round(np.clip(pixels, 0, 1) * 255).astype(np.uint8))


def noise_image():
    rng = np.random.default_rng(5)
    pixels = 0.5 + rng.uniform(-0.05, 0.05, (SIZE, SIZE, 3))
    return Image.fromarray(np.round(pixels * 255).astype(np.uint8))


def library_texture(root, image):
    folder = os.path.join(root, "bricks")
    os.makedirs(folder)
    image.save(os.path.join(folder, "color.png"))
    with open(os.path.join(folder, "texture.json"), "w") as f:
        json.dump({"version": 1, "key": "bricks", "label": "Bricks", "tileMeters": 2, "maps": {"color": "color.png"}}, f)
    return folder


def test_bricks_split_into_bricks_and_mortar():
    with tempfile.TemporaryDirectory() as root:
        folder = library_texture(root, bricks_image())
        parts = P.texture(folder, ["Bricks", "Mortar"])
        assert [p["id"] for p in parts] == ["bricks", "mortar"], parts
        mask = np.asarray(Image.open(os.path.join(folder, "mask.png")))[..., 0]
        assert mask[8, 8] == 0 and mask[0, 8] == 1, (mask[8, 8], mask[0, 8])
        meta = json.load(open(os.path.join(folder, "texture.json")))
        assert meta["maps"]["mask"] == "mask.png" and len(meta["parts"]) == 2, meta


def test_plain_noise_has_no_parts():
    with tempfile.TemporaryDirectory() as root:
        folder = library_texture(root, noise_image())
        assert P.texture(folder) == []
        meta = json.load(open(os.path.join(folder, "texture.json")))
        assert "parts" not in meta and "mask" not in meta["maps"], meta
        assert not os.path.exists(os.path.join(folder, "mask.png"))


for test in (test_bricks_split_into_bricks_and_mortar, test_plain_noise_has_no_parts):
    test()
    print(f"ok {test.__name__}")
