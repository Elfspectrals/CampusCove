if "SKINS_DIR" not in globals():
    raise RuntimeError("Run these scripts through run.py (blender --background --python front/scripts/skins/run.py): they share state via exec().")

SP_ = SKINS_DIR
exec(open(SP_ + "produce.py", encoding="utf8").read())
exec(open(SP_ + "clips.py", encoding="utf8").read())
exec(open(SP_ + "neon.py", encoding="utf8").read())
exec(open(SP_ + "street.py", encoding="utf8").read())
exec(open(SP_ + "oracle.py", encoding="utf8").read())

def hero_neon(ph, P):
    P.rz('Hips', 4); P.rz('Chest', -5); P.rz('Head', 7)
    P.rx('UpperLeg.L', -6); P.rx('LowerLeg.L', 5); P.rx('UpperLeg.R', 4); P.rx('LowerLeg.R', 3)
    P.rx('UpperArm.L', 10); P.ry('UpperArm.L', 40); P.rz('UpperArm.L', 30); P.rx('LowerArm.L', -80)       # left hand rests on the katana hilt
    P.ry('UpperArm.R', 8); P.rx('LowerArm.R', -18)
    neon_extras(0.2, P, 0.1, 1.0)

def hero_street(ph, P):
    P.rz('Hips', 3); P.rz('Chest', -3); P.rz('Head', -9)
    P.rx('UpperLeg.L', -7); P.rx('LowerLeg.L', 6); P.rx('UpperLeg.R', 4); P.rx('LowerLeg.R', 2)
    P.rx('UpperArm.L', -10); P.rx('LowerArm.L', -48)
    P.rx('UpperArm.R', 8); P.rx('LowerArm.R', -28)
    street_extras(0.2, P, 0.1, 1.0)

def hero_oracle(ph, P):
    P.rz('Hips', 2); P.rz('Head', 6); P.rx('Head', 2)
    P.rx('UpperLeg.L', -4); P.rx('UpperLeg.R', 3)
    P.ry('UpperArm.L', -40); P.rx('LowerArm.L', -60)       # raised casting hand
    P.rx('UpperArm.R', 0); P.rx('LowerArm.R', -25)
    oracle_extras(0.3, P, 0.1, 1.0)
    P.ry('Halo1', 20); P.rz('Halo2', 25)
    for nm in ('Orb1', 'Orb2', 'Orb3'):
        P.rz(nm, 25)

JOBS = {
    "neon_ronin": dict(b=build_neon_ronin, ex=NR_EXTRA, cl=neon_extras, col="NEON", hero=hero_neon,
                       key=(0.9, 0.95, 1.0), rim=(0.2, 0.9, 1.0), rim2=(1.0, 0.2, 0.8), tint=(0, 200, 255)),
    "street_luxe": dict(b=build_street_luxe, ex=SL_EXTRA, cl=street_extras, col="STREET", hero=hero_street,
                        key=(1.0, 0.93, 0.8), rim=(1.0, 0.75, 0.35), rim2=(0.6, 0.7, 1.0), tint=(255, 190, 70)),
    "astral_oracle": dict(b=build_astral_oracle, ex=AO_EXTRA, cl=oracle_extras, col="ORACLE", hero=hero_oracle,
                          key=(0.9, 0.9, 1.0), rim=(0.65, 0.5, 1.0), rim2=(1.0, 0.8, 0.4), tint=(150, 110, 255)),
}

def render_preview(key, out_png, az=28.0):
    j = JOBS[key]
    arm, skin, st = produce(key, j["b"], j["ex"], make_clips(j["cl"]), j["col"], export=False)
    show_pose(arm, j["hero"], 0.0)
    sc = studio()
    setup_render((1024, 1024), samples=96)
    lc = lights(sc, key=j["key"], rim=j["rim"], power=1.0)
    # coloured second rim from the other side
    d = bpy.data.lights.new("Rim2", 'AREA'); d.energy = 300; d.color = j["rim2"]; d.size = 1.6
    o = bpy.data.objects.new("Rim2", d); lc.objects.link(o)
    o.location = (-2.6, 2.0, 2.0); o.rotation_euler = (V((0, 0, 0.95)) - V(o.location)).to_track_quat('-Z', 'Y').to_euler()
    a = math.radians(az)
    dist = 5.2
    camera(sc, (math.sin(a) * dist, -math.cos(a) * dist, 1.25), (0, 0, 0.93), 62)
    fl = bpy.data.objects.get("SK_Floor")
    if fl: fl.hide_render = True
    sc.render.filepath = RAW_DIR + "pv_%s_raw.png" % key
    bpy.ops.render.render(write_still=True, scene="SKIN_STUDIO")
    return sc.render.filepath
