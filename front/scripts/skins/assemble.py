def assemble(G, extra, name, coll):
    """G: name -> (Mesh, weighting). Returns (armature, joined mesh)."""
    for o in list(bpy.data.objects):
        if o.name.startswith(("Armature_" + name, "Skin_" + name)):
            bpy.data.objects.remove(o, do_unlink=True)
    arm = build_armature(extra, "Armature_" + name)
    all_bones = [b.name for b in arm.data.bones]
    objs = []
    for gname, (M, w) in G.items():
        ob = M.finish(coll)
        if w[0] == 'rigid':
            weight_rigid(ob, w[1])
        else:
            bones = w[1] or [b for b in all_bones if not b.startswith(('Cape', 'Sash', 'Orb', 'Halo'))]
            weight_auto(ob, arm, bones, sigma=w[2])
        objs.append(ob)
    skin = join_and_bind(objs, arm, coll, "Skin_" + name)
    return arm, skin


def stats(ob):
    me = ob.data
    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    return {"tris": tris, "verts": len(me.vertices), "mats": len(me.materials), "dim": [round(x, 3) for x in ob.dimensions]}


def render(path, cam_loc=(2.4, -4.4, 1.3), target=(0, 0, 0.98), lens=75, res=(700, 900), rim=(0.35, 0.6, 1.0), key=(1, 0.95, 0.9), power=1.0):
    sc = studio()
    setup_render(res)
    lights(sc, key=key, rim=rim, power=power)
    camera(sc, cam_loc, target, lens)
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True, scene="SKIN_STUDIO")
