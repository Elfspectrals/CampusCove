import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
SKINS_DIR = HERE + "/"
RAW_DIR = SKINS_DIR + "out/"
OUT_WEAR = os.path.abspath(os.path.join(HERE, "..", "..", "public", "assets", "wear")) + "/"
os.makedirs(RAW_DIR, exist_ok=True)

argv = globals().get("WEAR_ARGS") or (sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

exec(open(SKINS_DIR + "anim.py", encoding="utf8").read())
exec(open(SKINS_DIR + "clips.py", encoding="utf8").read())
exec(open(SKINS_DIR + "base_body.py", encoding="utf8").read())
exec(open(SKINS_DIR + "wear.py", encoding="utf8").read())
exec(open(SKINS_DIR + "wear_preview.py", encoding="utf8").read())

sc = studio()
for o in list(sc.objects):
    bpy.data.objects.remove(o, do_unlink=True)
body_coll = wipe("WEAR_BASE")
arm = build_armature(None, "Armature_base")
body_objs = build_base_body(body_coll, arm)
sample_actions(arm, make_clips(None))
piece_coll = wipe("WEAR_PIECES")
pieces = {}
for slot, spec in WEAR.items():
    for key in spec["items"]:
        pieces[(slot, key)] = build_piece(slot, key, piece_coll, arm, body_objs)


def tris(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


print("base", sum(tris(o) for o in body_objs), "tris")
for (slot, key), ob in pieces.items():
    print(slot, key, tris(ob), "tris")

if "build" not in argv:
    os.makedirs(OUT_WEAR + "base", exist_ok=True)
    export_piece_glb(OUT_WEAR + "base/model.glb", [arm] + body_objs, animations=True)
    for (slot, key), ob in pieces.items():
        d = OUT_WEAR + "%s/%s/" % (slot, key)
        os.makedirs(d, exist_ok=True)
        export_piece_glb(d + "model.glb", [arm, ob], animations=False)
    print("exported", len(pieces) + 1, "files into", OUT_WEAR)

if "previews" in argv:
    for (slot, key), ob in pieces.items():
        print(render_piece_preview(slot, key, ob, pieces, body_objs, arm))
