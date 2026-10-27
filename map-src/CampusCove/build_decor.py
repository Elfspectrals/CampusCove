"""Builds the 5 decoration assets into collections DECOR_<key>.

Each item sits on the floor at the origin (z = 0), front facing -Y (game +Z).
Exported to front/public/assets/decor/<key>/model.glb + preview.png.
"""
import bpy, math, os
exec(open(r"C:\Users\Utilisateur\CampusCove\map-src\CampusCove\lib\cc_lib.py").read())

M = {
    "wood": mat("DC_Wood", "T_WoodGrain", tile=0.8, rough=0.5),
    "wood_light": mat("DC_WoodLight", "T_WoodFloorLight", tile=1.2, rough=0.5),
    "fabric": mat("DC_FabricTeal", "T_FabricTeal", tile=0.4, rough=0.95),
    "metal": mat("DC_MetalBlack", color=(0.08, 0.08, 0.09), rough=0.35, metal=0.6),
    "brass": mat("DC_Brass", color=(0.85, 0.65, 0.3), rough=0.3, metal=1.0),
    "shade": mat("DC_LampShade", color=(1.0, 0.93, 0.78), emit=(1.0, 0.85, 0.6), emit_str=2.5),
    "pot": mat("DC_Terracotta", color=(0.75, 0.4, 0.26), rough=0.85),
    "soil": mat("DC_Soil", color=(0.22, 0.15, 0.1), rough=1.0),
    "leaf": mat("DC_Leaf", color=(0.2, 0.5, 0.24), rough=0.8),
    "leaf2": mat("DC_LeafLight", color=(0.38, 0.65, 0.28), rough=0.8),
    "book1": mat("DC_BookRed", color=(0.7, 0.18, 0.15), rough=0.8),
    "book2": mat("DC_BookNavy", color=(0.14, 0.2, 0.45), rough=0.8),
    "book3": mat("DC_BookMustard", color=(0.85, 0.62, 0.2), rough=0.8),
    "book4": mat("DC_BookSage", color=(0.45, 0.6, 0.45), rough=0.8),
}

DECOR = [
    dict(key="wooden_chair", name="Wooden Chair"),
    dict(key="dining_table", name="Dining Table"),
    dict(key="floor_lamp", name="Floor Lamp"),
    dict(key="potted_plant", name="Potted Plant"),
    dict(key="bookshelf", name="Bookshelf"),
]


def build_wooden_chair(C):
    P = []
    P.append(box("Seat", (0, 0, 0.45), (0.46, 0.44, 0.05), M["wood"], C, bevel=0.01))
    P.append(box("Cushion", (0, -0.01, 0.485), (0.42, 0.4, 0.04), M["fabric"], C, bevel=0.015))
    for dx in (-0.19, 0.19):
        for dy in (-0.18, 0.18):
            P.append(box("Leg", (dx, dy, 0.215), (0.045, 0.045, 0.43), M["wood"], C))
    for dx in (-0.19, 0.19):
        P.append(box("BackPost", (dx, 0.19, 0.75), (0.045, 0.045, 0.56), M["wood"], C))
    for z in (0.68, 0.84, 0.98):
        P.append(box("BackRail", (0, 0.19, z), (0.38, 0.03, 0.05), M["wood"], C, bevel=0.005))
    P.append(box("Stretcher", (0, 0, 0.14), (0.38, 0.03, 0.03), M["wood"], C))
    return join(P, "Decor_wooden_chair")


def build_dining_table(C):
    P = [box("Top", (0, 0, 0.74), (1.4, 0.85, 0.05), M["wood_light"], C, bevel=0.01),
         box("Apron", (0, 0, 0.68), (1.3, 0.75, 0.08), M["wood"], C)]
    for dx in (-0.62, 0.62):
        for dy in (-0.35, 0.35):
            P.append(box("Leg", (dx, dy, 0.36), (0.07, 0.07, 0.72), M["wood"], C, bevel=0.005))
    P.append(cyl("Vase", (0.35, 0.05, 0.85), 0.05, 0.16, M["pot"], C, seg=10, r2=0.04))
    P.append(sphere("Flowers", (0.35, 0.05, 0.97), 0.08, M["book3"], C, seg=8))
    return join(P, "Decor_dining_table")


def build_floor_lamp(C):
    P = [cyl("Base", (0, 0, 0.02), 0.18, 0.04, M["metal"], C, seg=20),
         cyl("Pole", (0, 0, 0.8), 0.016, 1.55, M["brass"], C, seg=8),
         cyl("Shade", (0, 0, 1.58), 0.24, 0.32, M["shade"], C, seg=20, r2=0.15),
         cyl("ShadeRim", (0, 0, 1.425), 0.245, 0.02, M["brass"], C, seg=20),
         cyl("Switch", (0.03, 0, 1.0), 0.02, 0.05, M["metal"], C, seg=8, rot=(0, math.pi / 2, 0))]
    return join(P, "Decor_floor_lamp")


def build_potted_plant(C):
    P = [cyl("Pot", (0, 0, 0.2), 0.2, 0.4, M["pot"], C, seg=14, r2=0.24),
         cyl("PotRim", (0, 0, 0.41), 0.255, 0.04, M["pot"], C, seg=14),
         cyl("Soil", (0, 0, 0.42), 0.22, 0.02, M["soil"], C, seg=14)]
    leaves = [((0, 0, 0.75), 0.28, "leaf"), ((0.14, -0.08, 0.95), 0.2, "leaf2"), ((-0.12, 0.1, 1.05), 0.2, "leaf"),
              ((0.02, 0.02, 1.2), 0.16, "leaf2"), ((-0.15, -0.12, 0.85), 0.16, "leaf2")]
    for loc, r, m in leaves:
        P.append(sphere("Leaves", loc, r, M[m], C, seg=8, scale=(1, 1, 1.15), smooth=False))
    P.append(cyl("Stem", (0, 0, 0.6), 0.025, 0.4, M["wood"], C, seg=6))
    return join(P, "Decor_potted_plant")


def build_bookshelf(C):
    W, D, H = 1.0, 0.34, 1.8
    P = [box("SideL", (-W / 2 + 0.02, 0, H / 2), (0.04, D, H), M["wood"], C),
         box("SideR", (W / 2 - 0.02, 0, H / 2), (0.04, D, H), M["wood"], C),
         box("Back", (0, D / 2 - 0.01, H / 2), (W, 0.02, H), M["wood"], C),
         box("Top", (0, 0, H - 0.02), (W, D, 0.04), M["wood"], C)]
    books = ["book1", "book2", "book3", "book4"]
    for k, z in enumerate((0.04, 0.48, 0.92, 1.36)):
        P.append(box("Shelf", (0, 0, z), (W - 0.08, D - 0.02, 0.03), M["wood"], C))
        x, i = -W / 2 + 0.07, 0
        limit = W / 2 - 0.1 - (0.25 if k % 2 else 0)
        while x < limit:
            w = 0.035 + 0.02 * ((i * 7 + k) % 3)
            h = 0.25 + 0.05 * ((i * 5 + k) % 3)
            P.append(box("Book", (x + w / 2, -0.02, z + 0.015 + h / 2), (w, 0.24, h), M[books[(i + k) % 4]], C))
            x += w + 0.006
            i += 1
        if k % 2:
            P.append(cyl("Ornament", (W / 2 - 0.2, -0.02, z + 0.1), 0.06, 0.18, M["pot"], C, seg=10))
    return join(P, "Decor_bookshelf")


BUILDERS = {
    "wooden_chair": build_wooden_chair,
    "dining_table": build_dining_table,
    "floor_lamp": build_floor_lamp,
    "potted_plant": build_potted_plant,
    "bookshelf": build_bookshelf,
}

built = []
for d in DECOR:
    C = reset_coll(f"DECOR_{d['key']}")
    obj = BUILDERS[d["key"]](C)
    for poly in obj.data.polygons:
        poly.use_smooth = False
    size = export_collection(f"DECOR_{d['key']}", os.path.join(ROOT, "out", "decor", d["key"], "model.glb"))
    render_preview(f"DECOR_{d['key']}", os.path.join(PUBLIC, "decor", d["key"], "preview.png"), size=512,
                   yaw_deg=35, pitch_deg=22, fill=0.95)
    built.append((d["key"], size))
result = {"decor": built}
