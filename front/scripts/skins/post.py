"""Turns the raw Blender hero renders (out/pv_<key>_raw.png) into the 512x512 shop previews.

    python front/scripts/skins/post.py        (needs Pillow + numpy)
"""
import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.join(HERE, "out")
OUT_DIR = os.path.abspath(os.path.join(HERE, "..", "..", "public", "assets", "skins"))
TINTS = {"neon_ronin": (0, 200, 255), "street_luxe": (255, 190, 70), "astral_oracle": (150, 110, 255)}


def post(raw, out, tint, size=512, pad=0.035, glow=0.30):
    im = Image.open(raw).convert("RGBA")
    bbox = im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    im = im.crop(bbox)
    w, h = im.size
    side = int(max(w, h) / (1 - 2 * pad))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.alpha_composite(im, ((side - w) // 2, side - h - int(side * pad * 0.8)))
    # soft radial glow in the skin's theme colour behind the character
    yy, xx = np.mgrid[0:side, 0:side]
    r = np.sqrt(((xx - side / 2) / (side * 0.42)) ** 2 + ((yy - side * 0.55) / (side * 0.5)) ** 2)
    a = np.clip(1 - r, 0, 1) ** 2 * glow * 255
    g = np.zeros((side, side, 4), dtype=np.uint8)
    g[..., 0], g[..., 1], g[..., 2], g[..., 3] = tint[0], tint[1], tint[2], a.astype(np.uint8)
    base = Image.fromarray(g, "RGBA")
    base.alpha_composite(canvas)
    base.resize((size, size), Image.LANCZOS).save(out, optimize=True)


if __name__ == "__main__":
    for key, tint in TINTS.items():
        raw = os.path.join(RAW_DIR, f"pv_{key}_raw.png")
        out = os.path.join(OUT_DIR, key, "preview.png")
        post(raw, out, tint)
        print("wrote", out)
