import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
SKINS_DIR = HERE + "/"
OUT_CLIPS = os.path.abspath(os.path.join(HERE, "..", "..", "public", "assets", "animations", "boxing", "clips.glb"))

argv = globals().get("BOXING_ARGS") or (sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

exec(open(SKINS_DIR + "lib.py", encoding="utf8").read())
exec(open(SKINS_DIR + "anim.py", encoding="utf8").read())
exec(open(SKINS_DIR + "boxing.py", encoding="utf8").read())

sc = studio()
for o in list(sc.objects):
    bpy.data.objects.remove(o, do_unlink=True)
arm = build_armature(None, "Armature_boxing")
sample_actions(arm, boxing_clips())

if "build" not in argv:
    os.makedirs(os.path.dirname(OUT_CLIPS), exist_ok=True)
    export_glb(OUT_CLIPS, [arm], draco=False)
    print("exported", OUT_CLIPS)
