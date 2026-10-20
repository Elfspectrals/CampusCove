"""Builds the three premium skins in Blender and writes them into front/public/assets/skins/.

    blender --background --python front/scripts/skins/run.py              # GLBs (rigged + Idle/Walk/Run)
    blender --background --python front/scripts/skins/run.py -- previews  # raw hero renders -> out/
    python front/scripts/skins/post.py                                    # raw renders -> preview.png (needs Pillow)

It also works from Blender's Text editor / the Blender MCP: set `__file__` to this path and exec it.
"""
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
SKINS_DIR = HERE + "/"
RAW_DIR = SKINS_DIR + "out/"
OUT_ = os.path.abspath(os.path.join(HERE, "..", "..", "public", "assets", "skins")) + "/"
os.makedirs(RAW_DIR, exist_ok=True)

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []

if "previews" in argv:
    exec(open(SKINS_DIR + "preview.py", encoding="utf8").read())
    for _key in JOBS:
        print(render_preview(_key, None))
else:
    exec(open(SKINS_DIR + "produce.py", encoding="utf8").read())
    exec(open(SKINS_DIR + "clips.py", encoding="utf8").read())
    exec(open(SKINS_DIR + "neon.py", encoding="utf8").read())
    exec(open(SKINS_DIR + "street.py", encoding="utf8").read())
    exec(open(SKINS_DIR + "oracle.py", encoding="utf8").read())
    for _key, _b, _ex, _cl, _col in (
        ("neon_ronin", build_neon_ronin, NR_EXTRA, neon_extras, "NEON"),
        ("street_luxe", build_street_luxe, SL_EXTRA, street_extras, "STREET"),
        ("astral_oracle", build_astral_oracle, AO_EXTRA, oracle_extras, "ORACLE"),
    ):
        _arm, _skin, _st = produce(_key, _b, _ex, make_clips(_cl), _col, to_project=True)
        print(_key, {k: _st[k] for k in ("tris", "glb_bytes", "dim", "actions")})
