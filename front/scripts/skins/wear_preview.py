if "SKINS_DIR" not in globals():
    raise RuntimeError("Run these scripts through run_wear.py (blender --background --python front/scripts/skins/run_wear.py): they share state via exec().")

PREVIEW_FRAMING = {
    "hair": ((0.0, 1.74), 0.42),
    "head_accessory": ((0.0, 1.74), 0.48),
    "top": ((0.0, 1.25), 0.95),
    "bottom": ((0.0, 0.55), 1.15),
    "shoes": ((-0.06, 0.08), 0.5),
}


def render_piece_preview(slot, key, ob, pieces, body_objs, arm):
    for t in (arm.animation_data.nla_tracks if arm.animation_data else []):
        t.mute = True
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
    hides = set(ob["hides"].split(",")) if ob["hides"] else set()
    for o in body_objs:
        o.hide_render = o["region"] in hides
    for other in pieces.values():
        other.hide_render = other is not ob
    sc = studio()
    setup_render((256, 256), samples=48)
    lights(sc, power=1.0)
    (cy, cz), size = PREVIEW_FRAMING[slot]
    cam = camera(sc, (1.6, -4.2 + cy, cz + 0.25), (0, cy, cz), 50)
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = size
    fl = bpy.data.objects.get("SK_Floor")
    if fl:
        fl.hide_render = True
    d = OUT_WEAR + "%s/%s/" % (slot, key)
    os.makedirs(d, exist_ok=True)
    sc.render.filepath = d + "preview.png"
    bpy.ops.render.render(write_still=True, scene="SKIN_STUDIO")
    for t in (arm.animation_data.nla_tracks if arm.animation_data else []):
        t.mute = False
    return sc.render.filepath
