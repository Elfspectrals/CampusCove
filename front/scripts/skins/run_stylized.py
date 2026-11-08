"""Stylized character prototype: builds a man and a woman and renders them for review (no export yet).

blender --background --factory-startup --python front/scripts/skins/run_stylized.py -- out=<folder>
"""
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
SKINS_DIR = HERE + "/"
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = next((a.split("=", 1)[1] for a in argv if a.startswith("out=")), os.path.join(HERE, "out", "stylized"))
os.makedirs(OUT, exist_ok=True)

exec(open(SKINS_DIR + "anim.py", encoding="utf8").read())
exec(open(SKINS_DIR + "base_body.py", encoding="utf8").read())
exec(open(SKINS_DIR + "wear.py", encoding="utf8").read())
exec(open(SKINS_DIR + "stylized.py", encoding="utf8").read())

sc = studio()
for o in list(sc.objects):
    bpy.data.objects.remove(o, do_unlink=True)
coll = wipe("STYLIZED")

# sex, hair style, hair colour
CAST = [("m", "short", "6b4423"), ("f", "long", "8a4b2a")]
groups = []
for sex, hair, hair_color in CAST:
    body = build_body(coll, sex)
    head = build_head(coll, sex)
    objs = [body, build_hands(coll, sex), build_underwear(body, sex), head, build_face(coll, head, sex), build_hair(coll, hair, hair_color, head)]
    if sex == "m":
        objs.append(build_beard(coll, head))
    groups.append(objs)


def place(dx):
    for gi, objs in enumerate(groups):
        for o in objs:
            o.location.x = (gi - 0.5) * dx


def tris(objs):
    return sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs)


for (sex, _, _), objs in zip(CAST, groups):
    print("stylized", sex, tris(objs), "tris", {o.name: tris([o]) for o in objs})


def shoot(name, res, cam_loc, target, lens=50, ortho=None):
    setup_render(res, samples=32)
    lights(sc, key=(1.0, 0.93, 0.86), rim=(0.85, 0.88, 1.0), fill=(0.95, 0.92, 0.9), power=0.9)
    cam = camera(sc, cam_loc, target, lens)
    cam.data.type = 'ORTHO' if ortho else 'PERSP'
    if ortho:
        cam.data.ortho_scale = ortho
    sc.render.filepath = os.path.join(OUT, name)
    bpy.ops.render.render(write_still=True, scene=sc.name)


place(0.8)
shoot("front.png", (1400, 1000), (0.0, -5.2, 1.0), (0, 0, 0.92), ortho=2.1)
shoot("three_quarter.png", (1400, 1000), (2.6, -4.4, 1.5), (0, 0, 0.95), lens=60)
place(0.42)
shoot("heads.png", (1400, 800), (0.55, -1.6, 1.78), (0, 0, 1.72), lens=85)
shoot("profile.png", (1400, 700), (1.9, -0.05, 1.74), (0, -0.02, 1.72), lens=85)
print("renders in", OUT)
