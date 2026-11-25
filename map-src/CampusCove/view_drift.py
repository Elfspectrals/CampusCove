MAX_ASPECT_DRIFT = 0.2


def aspect(box):
    width, height = box
    return width / height


def check_views(boxes):
    reference = aspect(boxes["ref"])
    back = boxes.get("ref_back")
    if back is None or abs(aspect(back) - reference) / reference <= MAX_ASPECT_DRIFT:
        return []
    return [f"ref_back: subject is {back[0]}x{back[1]}px, a half turn of the reference ({boxes['ref'][0]}x{boxes['ref'][1]}px) keeps its proportions"]


MIN_MIRROR_OVERLAP = 0.85
SAMPLE = 128


def cropped(mask):
    from PIL import Image
    import numpy as np
    rows, cols = np.nonzero(mask)
    box = mask[rows.min():rows.max() + 1, cols.min():cols.max() + 1]
    return np.asarray(Image.fromarray(box.astype(np.uint8) * 255).resize((SAMPLE, SAMPLE))) > 127


def mirror_overlap(reference, back):
    mirrored = cropped(back)[:, ::-1]
    original = cropped(reference)
    return (mirrored & original).sum() / (mirrored | original).sum()
