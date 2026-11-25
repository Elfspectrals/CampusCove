import os
import sys

import numpy as np
from PIL import Image
from rembg import new_session, remove

from view_drift import MIN_MIRROR_OVERLAP, check_views, mirror_overlap


def mask_name(path):
    stem = os.path.splitext(os.path.basename(path))[0]
    return "mask.png" if stem == "ref" else f"mask_{stem.removeprefix('ref_')}.png"


def subject_mask(path, session):
    cut = remove(Image.open(path).convert("RGB"), session=session)
    subject = np.asarray(cut)[:, :, 3] > 127
    if not subject.any():
        sys.exit(f"{path}: rembg found no subject")
    rows, cols = np.nonzero(subject)
    if rows.min() == 0 or cols.min() == 0 or rows.max() == subject.shape[0] - 1 or cols.max() == subject.shape[1] - 1:
        sys.exit(f"{path}: the subject touches the image edge, the object is cut: use another image or another SEED")
    out = os.path.join(os.path.dirname(path), mask_name(path))
    Image.fromarray(np.where(subject, 255, 0).astype(np.uint8)).save(out)
    print(f"{out}: {int(subject.mean() * 100)}% subject")
    return subject


session = new_session()
subjects = {os.path.splitext(os.path.basename(path))[0]: subject_mask(path, session) for path in sys.argv[1:]}
boxes = {name: (int(np.ptp(np.nonzero(s.any(axis=0))[0]) + 1), int(np.ptp(np.nonzero(s.any(axis=1))[0]) + 1)) for name, s in subjects.items()}
problems = check_views(boxes)
if "ref_back" in subjects:
    overlap = mirror_overlap(subjects["ref"], subjects["ref_back"])
    if overlap < MIN_MIRROR_OVERLAP:
        problems.append(f"ref_back: its mirrored silhouette overlaps the reference by {overlap:.0%}, the view was not turned a half turn (needs {MIN_MIRROR_OVERLAP:.0%})")
if problems:
    sys.exit("generated views do not match the reference, try another SEED:\n" + "\n".join(problems))
