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
exec(open(SKINS_DIR + "fit.py", encoding="utf8").read())
exec(open(SKINS_DIR + "stylized.py", encoding="utf8").read())
exec(open(SKINS_DIR + "sculpt_bake.py", encoding="utf8").read())
exec(open(SKINS_DIR + "stylized_base.py", encoding="utf8").read())
exec(open(SKINS_DIR + "wear_preview.py", encoding="utf8").read())

sc = studio()
for o in list(sc.objects):
    bpy.data.objects.remove(o, do_unlink=True)
body_coll = wipe("WEAR_BASE")
arm = build_armature(None, "Armature_base")
body_objs = build_stylized_base(body_coll, arm)
heads = {sex: build_stylized_head(body_coll, arm, sex) for sex in ("m", "f")}
faces = {sex: build_face_presets(body_coll, arm, heads[sex], sex) for sex in ("m", "f")}
woman_top = build_woman_top(body_coll, arm, body_objs)
sample_actions(arm, {**make_clips(None), "Pick": (90, pose_pick()), "Browse": (120, pose_browse()), "TakeItem": (45, pose_take_item()), "Pay": (45, pose_pay())})
piece_coll = wipe("WEAR_PIECES")
pieces = {}
for slot, spec in WEAR.items():
    for key in spec["items"]:
        if slot == "hair":
            pieces[(slot, key)] = build_stylized_hair(piece_coll, arm, key, heads["m"])
        elif slot == "head_accessory":
            pieces[(slot, key)] = build_stylized_headwear(piece_coll, arm, key, heads["m"])
        else:
            pieces[(slot, key)] = build_piece(slot, key, piece_coll, arm, body_objs + [heads["m"]])


def tris(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


print("base", sum(tris(o) for o in body_objs), "tris + head", tris(heads["m"]), "+ one face", max(tris(o) for fs in faces.values() for o in fs))
for (slot, key), ob in pieces.items():
    print(slot, key, tris(ob), "tris")

# "previews" renders every piece; "previews=newcomer,hoodie" only those keys
preview_keys = next((a.split("=", 1)[1].split(",") for a in argv if a.startswith("previews=")), None)
if "previews" in argv or preview_keys:
    for (slot, key), ob in pieces.items():
        if preview_keys and key not in preview_keys and slot not in preview_keys:
            continue
        for o in faces["f"] + faces["m"][1:] + [heads["f"], woman_top]:
            o.hide_render = True
        print("preview", render_piece_preview(slot, key, ob, pieces, body_objs + [heads["m"]], arm))

if "build" not in argv:
    os.makedirs(OUT_WEAR + "base", exist_ok=True)
    trees = {}
    for fit in FIT_KEYS:
        sex = fit.split("_")[0]
        own = body_objs + [heads[sex]] + ([woman_top] if sex == "f" else [])
        bodies = own if fit == REFERENCE_FIT else [fitted_copy(o, arm, fit, body_coll) for o in own]
        export_piece_glb(OUT_WEAR + "base/model%s.glb" % fit_url_suffix(fit), [arm] + bodies + faces[sex], animations=True)
        trees[fit] = body_tree(bodies)
        if fit != REFERENCE_FIT:
            remove_copies(bodies)
    files = len(FIT_KEYS)
    for (slot, key), ob in pieces.items():
        d = OUT_WEAR + "%s/%s/" % (slot, key)
        os.makedirs(d, exist_ok=True)
        for fit in (FIT_KEYS if slot in FITTED_SLOTS else (REFERENCE_FIT,)):
            piece = fitted_copy(ob, arm, fit, piece_coll)
            if slot in CLEARANCE:
                pushed = push_out(piece, trees[fit], CLEARANCE[slot])
                if pushed and fit == REFERENCE_FIT:
                    print("pushed out", slot, key, pushed, "verts")
            export_piece_glb(d + "model%s.glb" % fit_url_suffix(fit), [arm, piece], animations=False)
            remove_copies([piece])
            files += 1
    print("exported", files, "files into", OUT_WEAR)
