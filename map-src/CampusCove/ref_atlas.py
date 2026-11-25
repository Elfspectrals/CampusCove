import os
import sys

import numpy as np
from PIL import Image

LONG_SIDE = 1024
MIN_SIDE = 16
GRID = 2
POSITIONS = {"ref": (0, 0), "ref_back": (1, 0), "ref_side": (0, 1)}


def bleed(rgb, subject):
    color = np.where(subject[..., None], rgb, 0.0)
    filled = subject.astype(np.float32)
    while not filled.all():
        total = np.zeros_like(color)
        count = np.zeros_like(filled)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            total += np.roll(np.roll(color * filled[..., None], dy, axis=0), dx, axis=1)
            count += np.roll(np.roll(filled, dy, axis=0), dx, axis=1)
        grow = (filled == 0) & (count > 0)
        color[grow] = total[grow] / count[grow][..., None]
        filled[grow] = 1.0
    return color


def erode(mask, pixels):
    for _ in range(pixels):
        mask = mask & np.roll(mask, 1, 0) & np.roll(mask, -1, 0) & np.roll(mask, 1, 1) & np.roll(mask, -1, 1)
    return mask


def subject_size(subject):
    rows, cols = np.nonzero(subject)
    return cols.max() - cols.min() + 1, rows.max() - rows.min() + 1


def cell_size(subject):
    width, height = subject_size(subject)
    scale = min(LONG_SIDE, max(width, height)) / max(width, height)
    return max(MIN_SIDE, round(width * scale)), max(MIN_SIDE, round(height * scale))


def tile_of(rgb, subject, size):
    rows, cols = np.nonzero(subject)
    box = (slice(rows.min(), rows.max() + 1), slice(cols.min(), cols.max() + 1))
    seed = erode(subject, 2)
    if not seed.any():
        seed = subject
    filled = bleed(rgb, seed)[box]
    return np.asarray(Image.fromarray((filled * 255).astype(np.uint8)).resize(size, Image.LANCZOS))


def view_files(folder, name):
    mask = "mask.png" if name == "ref" else f"mask_{name.removeprefix('ref_')}.png"
    return os.path.join(folder, f"{name}.png"), os.path.join(folder, mask)


def load_view(folder, name):
    image_path, mask_path = view_files(folder, name)
    rgb = np.asarray(Image.open(image_path).convert("RGB"), dtype=np.float32) / 255
    return rgb, np.asarray(Image.open(mask_path).convert("L")) > 127


def build_atlas(folder):
    width, height = cell_size(load_view(folder, "ref")[1])
    atlas = np.zeros((height * GRID, width * GRID, 3), dtype=np.uint8)
    for name, (col, row) in POSITIONS.items():
        if not os.path.exists(view_files(folder, name)[0]):
            continue
        atlas[row * height:(row + 1) * height, col * width:(col + 1) * width] = tile_of(*load_view(folder, name), (width, height))
    return atlas


if __name__ == "__main__":
    folder = sys.argv[1]
    Image.fromarray(build_atlas(folder)).save(os.path.join(folder, "atlas.png"))
    print(f"{folder}/atlas.png: {[n for n in POSITIONS if os.path.exists(view_files(folder, n)[0])]}")
