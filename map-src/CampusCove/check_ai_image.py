import sys
from collections import deque

import numpy as np
from PIL import Image

SIZE = 256
LEGS = {"quadruped": (2, 4), "biped": (1, 2)}
MIN_ASPECT = {"quadruped": 1.05, "biped": 0.6}
LEG_BAND = (0.04, 0.12)
MIN_LEG_WIDTH = 0.01
MIN_PIECE_AREA = 0.005


def pieces(mask):
    left = mask.copy()
    h, w = mask.shape
    areas = []
    for y, x in zip(*np.nonzero(mask)):
        if not left[y, x]:
            continue
        left[y, x] = False
        queue, area = deque([(y, x)]), 0
        while queue:
            cy, cx = queue.popleft()
            area += 1
            for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                if 0 <= ny < h and 0 <= nx < w and left[ny, nx]:
                    left[ny, nx] = False
                    queue.append((ny, nx))
        areas.append(area)
    return [a for a in areas if a >= MIN_PIECE_AREA * mask.sum()]


def legs_on_ground(mask):
    rows = np.nonzero(mask.any(axis=1))[0]
    top, bottom = rows.min(), rows.max()
    height = bottom - top
    band = mask[bottom - int(LEG_BAND[1] * height):bottom - int(LEG_BAND[0] * height) + 1].any(axis=0)
    runs, width = 0, 0
    for filled in list(band) + [False]:
        if filled:
            width += 1
            continue
        if width >= MIN_LEG_WIDTH * mask.shape[1]:
            runs += 1
        width = 0
    return runs


def problems(mask, kind):
    if not mask.any():
        return ["no subject on the background"]
    found = []
    count = len(pieces(mask))
    if count != 1:
        found.append(f"{count} separate objects, expected one")
    if mask[0].any() or mask[-1].any() or mask[:, 0].any() or mask[:, -1].any():
        found.append("the subject touches the image border")
    rows, cols = np.nonzero(mask.any(axis=1))[0], np.nonzero(mask.any(axis=0))[0]
    aspect = (cols.max() - cols.min()) / max(1, rows.max() - rows.min())
    if aspect < MIN_ASPECT[kind]:
        found.append(f"width / height is {aspect:.2f}, a {kind} side view is at least {MIN_ASPECT[kind]}")
    legs = legs_on_ground(mask)
    low, high = LEGS[kind]
    if not low <= legs <= high:
        found.append(f"{legs} legs on the ground, a {kind} side view shows {low} to {high}")
    return found


def subject_mask(path):
    from rembg import new_session, remove
    cut = remove(Image.open(path).convert("RGB"), session=new_session())
    return np.asarray(cut.resize((SIZE, SIZE)))[:, :, 3] > 127


if __name__ == "__main__":
    path, kind = sys.argv[1], sys.argv[2]
    if kind not in LEGS:
        sys.exit(f"unknown kind {kind}, expected one of {sorted(LEGS)}")
    found = problems(subject_mask(path), kind)
    for problem in found:
        print(f"{path}: {problem}")
    if found:
        sys.exit(1)
    print(f"{path}: looks like a {kind} side view")
