SP_ = SKINS_DIR

import os
exec(open(SP_ + "anim.py", encoding="utf8").read())
exec(open(SP_ + "assemble.py", encoding="utf8").read())

def produce(key, builder, extra, clips, coll_name, export=True, to_project=False):
    sc = studio()
    for o in list(sc.objects):
        if o.name.startswith("SK_"):
            continue
        bpy.data.objects.remove(o, do_unlink=True)
    coll = wipe(coll_name)
    G = builder(coll)
    arm, skin = assemble(G, extra, key, coll)
    floor(sc)
    sample_actions(arm, clips)
    st = stats(skin)
    if export:
        d = (OUT_ + key + "/") if to_project else (RAW_DIR + "export_" + key + "/")
        os.makedirs(d, exist_ok=True)
        export_glb(d + "model.glb", [arm, skin])
        st["glb_bytes"] = os.path.getsize(d + "model.glb")
        st["path"] = d + "model.glb"
    st["actions"] = [a.name for a in bpy.data.actions if a.name in clips]
    return arm, skin, st
