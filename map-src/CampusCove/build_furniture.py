"""Cove Home furniture range: 45 placeable decoration assets sold in the Cove Home store.

Each item sits on the floor at the origin (z = 0), front facing -Y (game +Z), in collection DECOR_<key>.
Exported to out/decor/<key>/model.glb (-> `make assets-optimize`) + front/public/assets/decor/<key>/preview.png.
FURNITURE (below) is the single source of truth for keys / names / departments / prices: build_store.py
lays the showroom out from it and ShopSeeder lists the same codes (`decor_<key>`).

Run inside Blender: exec(open(<this file>).read()). Set ONLY = ["sofa_classic", ...] beforehand to rebuild a subset.
"""
import bpy, math, os, json
exec(open(r"C:\Users\Utilisateur\CampusCove\map-src\CampusCove\lib\cc_lib.py").read())

# (key, name, department, coins price, rarity, max_stack, description)
FURNITURE = [
    # living room
    ("sofa_classic", "Hamno Sofa", "living", 450, 2, 2, "Two-seat sofa in teal fabric, deep cushions."),
    ("sofa_corner", "Vik Corner Sofa", "living", 780, 3, 1, "L-shaped corner sofa for movie nights."),
    ("armchair_lounge", "Lumi Armchair", "living", 260, 2, 4, "Mustard lounge armchair on oak legs."),
    ("coffee_table_round", "Rund Coffee Table", "living", 140, 1, 2, "Round oak coffee table with a lower shelf."),
    ("tv_bench", "Skarm TV Bench", "living", 320, 2, 1, "Low TV bench, flat screen included."),
    ("side_table", "Lilla Side Table", "living", 80, 1, 4, "Small white side table with a drawer."),
    ("pouf_knit", "Mjuk Pouf", "living", 60, 1, 6, "Chunky knitted pouf, cream."),
    ("rug_round", "Solrund Rug", "living", 90, 1, 4, "Round sunny rug, 1.8 m."),
    ("floor_lamp_arc", "Bage Arc Lamp", "living", 210, 2, 3, "Brass arc lamp that reaches over the sofa."),
    # bedroom
    ("bed_double", "Dromma Double Bed", "bedroom", 520, 2, 1, "Double bed with upholstered headboard."),
    ("bed_single", "Vila Single Bed", "bedroom", 300, 1, 2, "Single pine bed, navy duvet."),
    ("nightstand", "Natt Nightstand", "bedroom", 90, 1, 4, "Two-drawer nightstand with a little lamp."),
    ("wardrobe", "Garde Wardrobe", "bedroom", 380, 2, 2, "Two-door wardrobe, 2 m tall."),
    ("dresser", "Lada Dresser", "bedroom", 240, 1, 2, "Six-drawer chest in white and oak."),
    ("mirror_standing", "Spegel Mirror", "bedroom", 120, 1, 3, "Full-length standing mirror."),
    # kitchen & dining
    ("bar_stool", "Hog Bar Stool", "kitchen", 70, 1, 8, "Tall stool with a round oak seat."),
    ("kitchen_counter", "Kok Counter", "kitchen", 300, 2, 4, "Base cabinet with sink and worktop."),
    ("fridge_retro", "Kyl Retro Fridge", "kitchen", 420, 3, 1, "Rounded retro fridge in mint."),
    ("stove_oven", "Varme Stove", "kitchen", 360, 2, 1, "Four-burner stove with oven."),
    ("round_dining_table", "Cirkel Dining Table", "kitchen", 190, 1, 2, "Round dining table on a pedestal."),
    ("dining_bench", "Bank Bench", "kitchen", 110, 1, 4, "Solid oak bench for the dining table."),
    # office
    ("desk_study", "Plugga Desk", "office", 200, 1, 2, "Study desk with a drawer unit."),
    ("office_chair", "Snurra Office Chair", "office", 160, 1, 4, "Swivel chair on five wheels."),
    ("filing_cabinet", "Arkiv Cabinet", "office", 100, 1, 4, "Three-drawer steel filing cabinet."),
    ("desk_lamp", "Ljus Desk Lamp", "office", 50, 1, 6, "Adjustable work lamp."),
    ("computer_setup", "Dator Battlestation", "office", 480, 3, 1, "Desk, dual screens and RGB tower."),
    # bathroom
    ("bathtub", "Bada Bathtub", "bathroom", 400, 2, 1, "Freestanding tub on brass feet."),
    ("sink_vanity", "Tvatt Vanity", "bathroom", 220, 1, 2, "Vanity unit with basin and mirror."),
    ("toilet", "Toa Toilet", "bathroom", 150, 1, 2, "Classic white toilet."),
    ("towel_rack", "Handduk Towel Rack", "bathroom", 45, 1, 4, "Ladder towel rack with towels."),
    # kids & play
    ("bunk_bed", "Klattra Bunk Bed", "kids", 560, 3, 1, "Bunk bed with ladder, sleeps two."),
    ("toy_chest", "Leka Toy Chest", "kids", 85, 1, 4, "Painted chest full of toys."),
    ("bean_bag", "Sacko Bean Bag", "kids", 95, 1, 6, "Squishy bean bag, coral."),
    ("arcade_cabinet", "Pixel Arcade", "kids", 900, 4, 1, "Retro arcade cabinet with a glowing screen."),
    # storage
    ("cube_shelf", "Kub Shelf", "storage", 150, 1, 3, "4x4 cube shelf with storage boxes."),
    ("coat_rack", "Rock Coat Stand", "storage", 65, 1, 4, "Coat stand with hooks and a hat."),
    # plants & decor
    ("cactus", "Taggig Cactus", "plants", 35, 1, 10, "Easy-going cactus in a pot."),
    ("monstera", "Monstera Plant", "plants", 120, 2, 6, "Big leafy monstera, 1.4 m."),
    ("vase_tulips", "Tulpan Vase", "plants", 40, 1, 10, "Glass vase with tulips."),
    ("globe", "Varld Globe", "plants", 75, 1, 4, "Desk globe on a wooden stand."),
    ("aquarium", "Akvarium Tank", "plants", 340, 3, 1, "Aquarium on a cabinet, fish included."),
    # outdoor
    ("garden_bench", "Park Garden Bench", "outdoor", 170, 1, 3, "Slatted garden bench."),
    ("parasol", "Sol Parasol", "outdoor", 130, 1, 3, "Striped parasol on a heavy base."),
    ("bbq_grill", "Grilla BBQ", "outdoor", 230, 2, 2, "Kettle barbecue on three legs."),
    ("sun_lounger", "Slappna Sun Lounger", "outdoor", 190, 1, 4, "Reclining sun lounger."),
]

M = {
    "oak": mat("DC_Oak", "T_WoodFloorLight", tile=1.2, rough=0.55),
    "wood": mat("DC_Wood", "T_WoodGrain", tile=0.8, rough=0.5),
    "walnut": mat("DC_Walnut", "T_WoodDark", tile=0.8, rough=0.5),
    "white": mat("DC_PaintWhite", "T_PlasterWhite", tile=2.0, rough=0.6),
    "black": mat("DC_MetalBlack", color=(0.08, 0.08, 0.09), rough=0.35, metal=0.6),
    "steel": mat("DC_Steel", color=(0.62, 0.64, 0.68), rough=0.3, metal=0.8),
    "brass": mat("DC_Brass", color=(0.85, 0.65, 0.3), rough=0.3, metal=1.0),
    "teal": mat("DC_FabricTeal", "T_FabricTeal", tile=0.4, rough=0.95),
    "grey": mat("DC_FabricGrey", "T_FabricGrey", tile=0.4, rough=0.95),
    "mustard": mat("DC_FabricMustard", "T_FabricMustard", tile=0.4, rough=0.95),
    "navy": mat("DC_FabricNavy", "T_FabricNavy", tile=0.4, rough=0.95),
    "coral": mat("DC_FabricCoral", "T_FabricCoral", tile=0.4, rough=0.95),
    "linen": mat("DC_FabricLinen", "T_FabricLinen", tile=0.4, rough=0.95),
    "olive": mat("DC_FabricOlive", "T_FabricOlive", tile=0.4, rough=0.95),
    "purple": mat("DC_FabricPurple", "T_FabricPurple", tile=0.4, rough=0.95),
    "knit": mat("DC_KnitCream", "T_KnitCream", tile=0.3, rough=1.0),
    "rug": mat("DC_RugSun", "T_RugSun", tile=1.8, rough=1.0),
    "stripes": mat("DC_RugStripes", "T_RugStripes", tile=1.0, rough=0.9),
    "ceramic": mat("DC_Ceramic", color=(0.95, 0.96, 0.97), rough=0.2),
    "marble": mat("DC_Marble", "T_Marble", tile=0.8, rough=0.25),
    "mint": mat("DC_EnamelMint", color=(0.6, 0.86, 0.76), rough=0.3),
    "red": mat("DC_PaintRed", color=(0.8, 0.2, 0.18), rough=0.5),
    "yellow": mat("DC_PaintYellow", color=(0.98, 0.78, 0.2), rough=0.5),
    "blue": mat("DC_PaintBlue", color=(0.2, 0.45, 0.85), rough=0.5),
    "green": mat("DC_PaintGreen", color=(0.3, 0.7, 0.4), rough=0.5),
    "glass": mat("DC_Glass", color=(0.7, 0.88, 0.95), rough=0.05, alpha=0.35),
    "mirror": mat("DC_Mirror", color=(0.85, 0.92, 0.98), rough=0.02, metal=1.0),
    "water": mat("DC_Water", color=(0.25, 0.6, 0.85), rough=0.1, alpha=0.6),
    "screen": mat("DC_Screen", color=(0.1, 0.25, 0.55), emit=(0.25, 0.55, 1.0), emit_str=1.8),
    "rgb": mat("DC_RgbGlow", color=(0.7, 0.2, 0.9), emit=(0.8, 0.25, 1.0), emit_str=3.0),
    "shade": mat("DC_LampShade", color=(1.0, 0.93, 0.78), emit=(1.0, 0.85, 0.6), emit_str=2.5),
    "pot": mat("DC_Terracotta", color=(0.75, 0.4, 0.26), rough=0.85),
    "soil": mat("DC_Soil", color=(0.22, 0.15, 0.1), rough=1.0),
    "leaf": mat("DC_Leaf", color=(0.2, 0.5, 0.24), rough=0.8),
    "leaf2": mat("DC_LeafLight", color=(0.38, 0.65, 0.28), rough=0.8),
    "cactus": mat("DC_Cactus", color=(0.32, 0.58, 0.36), rough=0.8),
    "pink": mat("DC_FlowerPink", color=(0.95, 0.45, 0.6), rough=0.7),
    "orange": mat("DC_FishOrange", color=(1.0, 0.5, 0.12), rough=0.5),
    "sand": mat("DC_Sand", color=(0.9, 0.8, 0.6), rough=1.0),
    "ocean": mat("DC_GlobeOcean", color=(0.2, 0.5, 0.8), rough=0.5),
}


def legs4(P, C, w, d, h, m, s=0.045, inset=0.03, z0=0.0, round_legs=False):
    for dx in (-w / 2 + inset + s / 2, w / 2 - inset - s / 2):
        for dy in (-d / 2 + inset + s / 2, d / 2 - inset - s / 2):
            if round_legs:
                P.append(cyl("Leg", (dx, dy, z0 + h / 2), s / 2, h, m, C, seg=8))
            else:
                P.append(box("Leg", (dx, dy, z0 + h / 2), (s, s, h), m, C))


def drawer_fronts(P, C, x, w, z0, rows, h, m_front, m_knob, y=None, d=0.0):
    """Stack of drawer fronts on the -Y face (y = front plane)."""
    for i in range(rows):
        zc = z0 + h * (i + 0.5)
        P.append(box("Drawer", (x, y - 0.01, zc), (w - 0.04, 0.02, h - 0.03), m_front, C, bevel=0.004))
        P.append(box("Knob", (x, y - 0.03, zc), (0.1, 0.02, 0.02), m_knob, C))


# ---------------------------------------------------------------- living
def b_sofa_classic(C):
    W, D = 1.8, 0.86
    P = [box("Base", (0, 0, 0.3), (W, D, 0.22), M["teal"], C, bevel=0.03),
         box("Back", (0, D / 2 - 0.1, 0.62), (W, 0.2, 0.5), M["teal"], C, bevel=0.05)]
    for sx in (-1, 1):
        P.append(box("Arm", (sx * (W / 2 - 0.1), 0, 0.5), (0.2, D, 0.42), M["teal"], C, bevel=0.05))
    for sx in (-0.39, 0.39):
        P.append(box("Cushion", (sx, -0.06, 0.47), (0.76, 0.66, 0.14), M["teal"], C, bevel=0.04))
        P.append(box("BackCushion", (sx, 0.22, 0.68), (0.74, 0.16, 0.4), M["teal"], C, bevel=0.05))
    P.append(box("Pillow", (-0.62, 0.1, 0.66), (0.34, 0.12, 0.34), M["mustard"], C, bevel=0.05))
    legs4(P, C, W - 0.1, D - 0.1, 0.19, M["oak"], s=0.05)
    return P


def b_sofa_corner(C):
    P = [box("BaseA", (0, 0, 0.3), (2.4, 0.9, 0.22), M["grey"], C, bevel=0.03),
         box("BaseB", (0.75, -0.9, 0.3), (0.9, 0.9, 0.22), M["grey"], C, bevel=0.03),
         box("BackA", (0, 0.35, 0.62), (2.4, 0.2, 0.5), M["grey"], C, bevel=0.05),
         box("ArmL", (-1.1, 0, 0.5), (0.2, 0.9, 0.42), M["grey"], C, bevel=0.05),
         box("ArmR", (1.1, -0.45, 0.5), (0.2, 1.8, 0.42), M["grey"], C, bevel=0.05)]
    for x in (-0.6, 0.15):
        P.append(box("Cushion", (x, -0.05, 0.47), (0.72, 0.7, 0.14), M["grey"], C, bevel=0.04))
        P.append(box("BackCushion", (x, 0.2, 0.7), (0.72, 0.16, 0.4), M["grey"], C, bevel=0.05))
    P.append(box("Chaise", (0.65, -0.65, 0.47), (0.7, 1.35, 0.14), M["grey"], C, bevel=0.04))
    P.append(box("Pillow", (-0.75, 0.1, 0.68), (0.36, 0.12, 0.36), M["coral"], C, bevel=0.05))
    P.append(box("Pillow2", (0.75, 0.1, 0.68), (0.36, 0.12, 0.36), M["teal"], C, bevel=0.05))
    P.append(box("Throw", (0.65, -1.1, 0.55), (0.72, 0.4, 0.03), M["stripes"], C))
    for x, y in ((-1.15, 0.38), (1.15, 0.38), (-1.15, -0.38), (1.15, -1.3), (0.35, -1.3)):
        P.append(box("Leg", (x, y, 0.1), (0.05, 0.05, 0.19), M["black"], C))
    return P


def b_armchair_lounge(C):
    P = [box("Seat", (0, -0.02, 0.38), (0.62, 0.62, 0.16), M["mustard"], C, bevel=0.05),
         box("Back", (0, 0.3, 0.68), (0.72, 0.16, 0.56), M["mustard"], C, bevel=0.06)]
    for sx in (-1, 1):
        P.append(box("Arm", (sx * 0.38, 0, 0.5), (0.12, 0.7, 0.3), M["mustard"], C, bevel=0.05))
        for dy in (-0.28, 0.28):
            P.append(cyl("Leg", (sx * 0.3, dy, 0.15), 0.025, 0.3, M["oak"], C, seg=8, r2=0.018))
    P.append(box("Frame", (0, 0.02, 0.29), (0.74, 0.7, 0.05), M["oak"], C, bevel=0.01))
    return P


def b_coffee_table_round(C):
    P = [cyl("Top", (0, 0, 0.43), 0.45, 0.04, M["oak"], C, seg=24),
         cyl("Shelf", (0, 0, 0.14), 0.38, 0.025, M["oak"], C, seg=24)]
    for i in range(4):
        a = i * math.pi / 2 + math.pi / 4
        P.append(cyl("Leg", (0.32 * math.cos(a), 0.32 * math.sin(a), 0.21), 0.025, 0.42, M["walnut"], C, seg=8))
    P.append(box("Book", (0.1, 0.05, 0.47), (0.24, 0.17, 0.04), M["red"], C))
    P.append(box("Book2", (0.12, 0.04, 0.505), (0.2, 0.15, 0.03), M["blue"], C))
    P.append(cyl("Mug", (-0.18, -0.1, 0.49), 0.04, 0.08, M["ceramic"], C, seg=10))
    return P


def b_tv_bench(C):
    P = [box("Body", (0, 0, 0.27), (1.6, 0.42, 0.38), M["white"], C, bevel=0.01),
         box("Top", (0, 0, 0.47), (1.62, 0.44, 0.03), M["oak"], C, bevel=0.005)]
    for x in (-0.55, 0.0, 0.55):
        P.append(box("Door", (x, -0.215, 0.27), (0.5, 0.02, 0.32), M["oak"], C, bevel=0.005))
    legs4(P, C, 1.5, 0.36, 0.08, M["black"], s=0.04)
    P += [box("TvStand", (0, 0.05, 0.5), (0.3, 0.18, 0.03), M["black"], C),
          box("TvNeck", (0, 0.07, 0.6), (0.06, 0.04, 0.2), M["black"], C),
          box("TvFrame", (0, 0.06, 0.92), (1.2, 0.05, 0.7), M["black"], C, bevel=0.01),
          box("TvScreen", (0, 0.033, 0.92), (1.14, 0.01, 0.64), M["screen"], C),
          box("Speaker", (0.62, -0.02, 0.56), (0.14, 0.14, 0.15), M["grey"], C, bevel=0.02)]
    return P


def b_side_table(C):
    P = [box("Top", (0, 0, 0.53), (0.45, 0.45, 0.04), M["white"], C, bevel=0.008),
         box("Box", (0, 0, 0.44), (0.42, 0.42, 0.14), M["white"], C),
         box("Drawer", (0, -0.215, 0.44), (0.38, 0.02, 0.1), M["oak"], C)]
    legs4(P, C, 0.42, 0.42, 0.37, M["oak"], s=0.04)
    P.append(cyl("Vase", (0.1, 0.05, 0.62), 0.05, 0.14, M["pot"], C, seg=10, r2=0.035))
    return P


def b_pouf_knit(C):
    return [cyl("Pouf", (0, 0, 0.21), 0.3, 0.4, M["knit"], C, seg=20),
            cyl("Top", (0, 0, 0.42), 0.28, 0.04, M["knit"], C, seg=20)]


def b_rug_round(C):
    return [cyl("Rug", (0, 0, 0.01), 0.9, 0.02, M["rug"], C, seg=40)]


def rod(name, a, b, r, m, C, seg=6):
    """Cylinder from point a to point b in the XZ plane (y = 0)."""
    mx, mz = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
    ln = math.hypot(b[0] - a[0], b[1] - a[1])
    ang = math.atan2(b[0] - a[0], b[1] - a[1])  # tilt from +Z towards +X
    return cyl(name, (mx, 0, mz), r, ln + r, m, C, seg=seg, rot=(0, ang, 0))


def b_floor_lamp_arc(C):
    P = [box("Base", (-0.5, 0, 0.06), (0.36, 0.36, 0.12), M["marble"], C, bevel=0.01),
         rod("Pole", (-0.5, 0.1), (-0.5, 1.7), 0.02, M["brass"], C)]
    pts = [(0.0 - 0.5 * math.cos(math.radians(a)), 1.7 + 0.5 * math.sin(math.radians(a))) for a in range(0, 91, 15)]
    pts.append((0.5, 1.86))
    for i in range(len(pts) - 1):
        P.append(rod("Arc", pts[i], pts[i + 1], 0.018, M["brass"], C))
    P.append(cyl("Shade", (0.5, 0, 1.76), 0.24, 0.2, M["brass"], C, seg=18, r2=0.06))
    P.append(cyl("Bulb", (0.5, 0, 1.66), 0.18, 0.02, M["shade"], C, seg=18))
    return P


# ---------------------------------------------------------------- bedroom
def b_bed_double(C):
    W, L = 1.6, 2.1
    P = [box("Frame", (0, 0, 0.2), (W + 0.08, L, 0.22), M["linen"], C, bevel=0.03),
         box("Mattress", (0, -0.02, 0.4), (W, L - 0.08, 0.2), M["white"], C, bevel=0.04),
         box("Duvet", (0, -0.25, 0.52), (W + 0.04, 1.5, 0.08), M["teal"], C, bevel=0.03),
         box("Fold", (0, 0.45, 0.53), (W + 0.04, 0.22, 0.1), M["white"], C, bevel=0.04),
         box("Headboard", (0, L / 2 + 0.03, 0.6), (W + 0.16, 0.12, 1.0), M["linen"], C, bevel=0.05)]
    for x in (-0.38, 0.38):
        P.append(box("Pillow", (x, 0.82, 0.56), (0.62, 0.32, 0.14), M["white"], C, bevel=0.05))
    legs4(P, C, W, L, 0.09, M["oak"], s=0.06)
    return P


def b_bed_single(C):
    W, L = 0.95, 2.05
    P = [box("Frame", (0, 0, 0.28), (W + 0.06, L, 0.12), M["oak"], C, bevel=0.01),
         box("Mattress", (0, 0, 0.42), (W, L - 0.06, 0.16), M["white"], C, bevel=0.04),
         box("Duvet", (0, -0.2, 0.52), (W + 0.04, 1.5, 0.07), M["navy"], C, bevel=0.03),
         box("Pillow", (0, 0.78, 0.55), (0.6, 0.32, 0.12), M["white"], C, bevel=0.05),
         box("Head", (0, L / 2, 0.55), (W + 0.06, 0.05, 0.75), M["oak"], C, bevel=0.01),
         box("Foot", (0, -L / 2, 0.38), (W + 0.06, 0.05, 0.45), M["oak"], C, bevel=0.01)]
    legs4(P, C, W + 0.06, L, 0.22, M["oak"], s=0.06, inset=0.0)
    return P


def b_nightstand(C):
    P = [box("Body", (0, 0, 0.32), (0.45, 0.4, 0.5), M["white"], C, bevel=0.008),
         box("Top", (0, 0, 0.585), (0.47, 0.42, 0.03), M["oak"], C, bevel=0.005)]
    drawer_fronts(P, C, 0, 0.45, 0.08, 2, 0.24, M["white"], M["brass"], y=-0.2)
    legs4(P, C, 0.42, 0.36, 0.07, M["oak"], s=0.04)
    P += [cyl("LampBase", (0.1, 0.05, 0.64), 0.06, 0.08, M["ceramic"], C, seg=12),
          cyl("LampShade", (0.1, 0.05, 0.78), 0.1, 0.14, M["shade"], C, seg=14, r2=0.07)]
    return P


def b_wardrobe(C):
    W, D, H = 1.0, 0.58, 2.0
    P = [box("Body", (0, 0, H / 2 + 0.05), (W, D, H), M["white"], C, bevel=0.01),
         box("Plinth", (0, 0, 0.03), (W - 0.04, D - 0.04, 0.06), M["oak"], C)]
    for sx in (-1, 1):
        P.append(box("Door", (sx * W / 4, -D / 2 - 0.01, H / 2 + 0.05), (W / 2 - 0.02, 0.02, H - 0.04), M["oak"], C, bevel=0.004))
        P.append(box("Handle", (sx * 0.06, -D / 2 - 0.035, 1.1), (0.02, 0.025, 0.35), M["black"], C))
    return P


def b_dresser(C):
    W, D, H = 1.2, 0.48, 0.85
    P = [box("Body", (0, 0, H / 2 + 0.08), (W, D, H), M["white"], C, bevel=0.01),
         box("Top", (0, 0, H + 0.095), (W + 0.02, D + 0.02, 0.03), M["oak"], C, bevel=0.005)]
    for x in (-W / 4, W / 4):
        drawer_fronts(P, C, x, W / 2, 0.1, 3, (H - 0.04) / 3, M["white"], M["brass"], y=-D / 2)
    legs4(P, C, W - 0.04, D - 0.04, 0.08, M["oak"], s=0.04)
    P.append(sphere("Plant", (0.4, 0.05, H + 0.2), 0.1, M["leaf2"], C, seg=8, smooth=False))
    P.append(cyl("Pot", (0.4, 0.05, H + 0.15), 0.07, 0.1, M["pot"], C, seg=10))
    return P


def b_mirror_standing(C):
    P = [box("Frame", (0, 0, 0.85), (0.6, 0.05, 1.6), M["oak"], C, bevel=0.01),
         box("Glass", (0, -0.03, 0.85), (0.5, 0.01, 1.5), M["mirror"], C),
         box("Stand", (0, 0.25, 0.75), (0.04, 0.04, 1.5), M["oak"], C, rot_z=0)]
    P[-1].rotation_euler = (math.radians(-18), 0, 0)
    P.append(box("Foot", (0, 0.02, 0.02), (0.6, 0.08, 0.04), M["oak"], C))
    return P


# ---------------------------------------------------------------- kitchen & dining
def b_bar_stool(C):
    P = [cyl("Seat", (0, 0, 0.74), 0.19, 0.05, M["oak"], C, seg=18),
         cyl("Ring", (0, 0, 0.3), 0.17, 0.02, M["black"], C, seg=16)]
    for i in range(4):
        a = i * math.pi / 2 + math.pi / 4
        P.append(cyl("Leg", (0.14 * math.cos(a), 0.14 * math.sin(a), 0.36), 0.015, 0.72, M["black"], C, seg=6))
    return P


def b_kitchen_counter(C):
    W, D = 1.2, 0.6
    P = [box("Body", (0, 0.02, 0.45), (W, D - 0.04, 0.8), M["white"], C),
         box("Plinth", (0, 0.04, 0.04), (W, D - 0.1, 0.08), M["black"], C),
         box("Worktop", (0, 0, 0.88), (W + 0.02, D, 0.04), M["marble"], C),
         box("Sink", (-0.25, -0.02, 0.89), (0.5, 0.4, 0.03), M["steel"], C),
         cyl("Tap", (-0.25, 0.2, 0.98), 0.015, 0.2, M["steel"], C, seg=8),
         box("Spout", (-0.25, 0.13, 1.08), (0.03, 0.15, 0.03), M["steel"], C)]
    for x in (-0.3, 0.3):
        P.append(box("Door", (x, -D / 2 + 0.01, 0.47), (0.58, 0.02, 0.7), M["mint"], C, bevel=0.004))
        P.append(box("Handle", (x + (0.22 if x < 0 else -0.22), -D / 2 - 0.01, 0.75), (0.02, 0.02, 0.12), M["steel"], C))
    P.append(cyl("Board", (0.3, -0.05, 0.915), 0.14, 0.02, M["oak"], C, seg=14))
    return P


def b_fridge_retro(C):
    P = [box("Body", (0, 0, 0.85), (0.7, 0.7, 1.6), M["mint"], C, bevel=0.08),
         box("Split", (0, -0.355, 1.2), (0.62, 0.01, 0.02), M["steel"], C),
         box("HandleTop", (0.26, -0.39, 1.4), (0.04, 0.05, 0.25), M["steel"], C, bevel=0.01),
         box("HandleBottom", (0.26, -0.39, 0.95), (0.04, 0.05, 0.35), M["steel"], C, bevel=0.01),
         box("Badge", (0, -0.36, 1.5), (0.18, 0.01, 0.05), M["brass"], C)]
    legs4(P, C, 0.62, 0.6, 0.06, M["steel"], s=0.05)
    return P


def b_stove_oven(C):
    P = [box("Body", (0, 0, 0.45), (0.6, 0.6, 0.86), M["white"], C, bevel=0.01),
         box("Top", (0, 0, 0.895), (0.6, 0.6, 0.02), M["black"], C),
         box("OvenDoor", (0, -0.305, 0.4), (0.52, 0.02, 0.45), M["black"], C, bevel=0.005),
         box("OvenGlass", (0, -0.318, 0.42), (0.4, 0.01, 0.25), M["screen"], C),
         box("Handle", (0, -0.34, 0.66), (0.44, 0.03, 0.03), M["steel"], C),
         box("Backguard", (0, 0.28, 1.0), (0.6, 0.04, 0.2), M["white"], C)]
    for x in (-0.14, 0.14):
        for y in (-0.12, 0.12):
            P.append(cyl("Burner", (x, y, 0.91), 0.08, 0.015, M["steel"], C, seg=14))
    for x in (-0.2, -0.07, 0.07, 0.2):
        P.append(cyl("Knob", (x, -0.31, 0.78), 0.025, 0.03, M["black"], C, seg=10, rot=(math.pi / 2, 0, 0)))
    P.append(cyl("Pot", (0.14, 0.12, 0.98), 0.09, 0.14, M["red"], C, seg=14))
    return P


def b_round_dining_table(C):
    return [cyl("Top", (0, 0, 0.74), 0.55, 0.04, M["white"], C, seg=28),
            cyl("Pedestal", (0, 0, 0.38), 0.06, 0.7, M["oak"], C, seg=12),
            cyl("Foot", (0, 0, 0.03), 0.3, 0.06, M["oak"], C, seg=20, r2=0.22),
            cyl("Bowl", (0, 0, 0.8), 0.12, 0.08, M["ceramic"], C, seg=16, r2=0.08),
            sphere("Apple", (0.04, 0.02, 0.85), 0.04, M["red"], C, seg=8),
            sphere("Apple2", (-0.05, -0.03, 0.85), 0.04, M["green"], C, seg=8)]


def b_dining_bench(C):
    P = [box("Seat", (0, 0, 0.44), (1.4, 0.36, 0.05), M["oak"], C, bevel=0.008)]
    for x in (-0.6, 0.6):
        P.append(box("Leg", (x, 0, 0.21), (0.06, 0.32, 0.42), M["oak"], C, bevel=0.005))
    P.append(box("Stretcher", (0, 0, 0.12), (1.2, 0.04, 0.05), M["oak"], C))
    return P


# ---------------------------------------------------------------- office
def b_desk_study(C):
    P = [box("Top", (0, 0, 0.74), (1.3, 0.65, 0.035), M["white"], C, bevel=0.005),
         box("Drawers", (0.4, 0, 0.36), (0.42, 0.6, 0.72), M["oak"], C)]
    drawer_fronts(P, C, 0.4, 0.42, 0.02, 3, 0.23, M["oak"], M["black"], y=-0.3)
    for y in (-0.28, 0.28):
        P.append(box("Leg", (-0.6, y, 0.36), (0.045, 0.045, 0.72), M["black"], C))
    P.append(box("Laptop", (-0.2, -0.05, 0.765), (0.34, 0.24, 0.015), M["steel"], C))
    lid = box("LaptopLid", (-0.2, 0.07, 0.88), (0.34, 0.015, 0.23), M["steel"], C)
    lid.rotation_euler = (math.radians(-12), 0, 0)
    P.append(lid)
    return P


def b_office_chair(C):
    P = [box("Seat", (0, 0, 0.5), (0.5, 0.48, 0.08), M["black"], C, bevel=0.03),
         box("Back", (0, 0.24, 0.85), (0.46, 0.06, 0.55), M["black"], C, bevel=0.03),
         box("BackMesh", (0, 0.205, 0.85), (0.4, 0.01, 0.48), M["teal"], C),
         cyl("Gas", (0, 0, 0.3), 0.03, 0.36, M["steel"], C, seg=8)]
    for i in range(5):
        a = i * 2 * math.pi / 5
        P.append(box("Spoke", (0.15 * math.cos(a), 0.15 * math.sin(a), 0.08), (0.3, 0.04, 0.03), M["black"], C, rot_z=a))
        P.append(sphere("Wheel", (0.29 * math.cos(a), 0.29 * math.sin(a), 0.035), 0.035, M["black"], C, seg=6))
    for sx in (-1, 1):
        P.append(box("Arm", (sx * 0.27, 0.0, 0.66), (0.05, 0.3, 0.03), M["black"], C))
        P.append(box("ArmPost", (sx * 0.27, 0.05, 0.58), (0.03, 0.03, 0.16), M["black"], C))
    return P


def b_filing_cabinet(C):
    P = [box("Body", (0, 0, 0.5), (0.45, 0.6, 1.0), M["steel"], C, bevel=0.01)]
    for i in range(3):
        z = 0.18 + i * 0.32
        P.append(box("Front", (0, -0.305, z), (0.41, 0.02, 0.29), M["steel"], C, bevel=0.004))
        P.append(box("Pull", (0, -0.33, z + 0.07), (0.16, 0.03, 0.025), M["black"], C))
        P.append(box("Label", (0, -0.318, z + 0.0), (0.1, 0.01, 0.05), M["white"], C))
    return P


def b_desk_lamp(C):
    P = [cyl("Base", (0, 0, 0.015), 0.09, 0.03, M["black"], C, seg=14),
         cyl("Arm1", (0.03, 0, 0.2), 0.012, 0.38, M["yellow"], C, seg=6, rot=(0, math.radians(10), 0)),
         cyl("Arm2", (0.13, 0, 0.42), 0.012, 0.28, M["yellow"], C, seg=6, rot=(0, math.radians(75), 0)),
         cyl("Head", (0.27, 0, 0.38), 0.07, 0.12, M["yellow"], C, seg=12, r2=0.03),
         cyl("Bulb", (0.27, 0, 0.32), 0.06, 0.01, M["shade"], C, seg=12)]
    return P


def b_computer_setup(C):
    P = [box("Top", (0, 0, 0.74), (1.6, 0.75, 0.04), M["black"], C, bevel=0.005),
         box("Strip", (0, -0.376, 0.735), (1.6, 0.01, 0.015), M["rgb"], C)]
    for x in (-0.75, 0.75):
        P.append(box("LegFrame", (x, 0, 0.36), (0.06, 0.65, 0.04), M["black"], C))
        P.append(box("LegPost", (x, 0, 0.37), (0.06, 0.06, 0.72), M["black"], C))
    for x, rz in ((-0.32, 0.2), (0.32, -0.2)):
        P.append(box("MonStand", (x, 0.15, 0.77), (0.2, 0.15, 0.02), M["black"], C))
        P.append(box("MonNeck", (x, 0.17, 0.86), (0.04, 0.03, 0.18), M["black"], C))
        P.append(box("Monitor", (x, 0.13, 1.05), (0.58, 0.04, 0.34), M["black"], C, bevel=0.008, rot_z=rz))
        P.append(box("MonScreen", (x, 0.11, 1.05), (0.54, 0.01, 0.3), M["screen"], C, rot_z=rz))
    P += [box("Keyboard", (0, -0.15, 0.77), (0.44, 0.14, 0.02), M["black"], C),
          box("KeyGlow", (0, -0.15, 0.782), (0.42, 0.12, 0.004), M["rgb"], C),
          box("Mouse", (0.32, -0.15, 0.77), (0.06, 0.1, 0.025), M["black"], C, bevel=0.01),
          box("Tower", (0.6, 0.05, 0.28), (0.22, 0.48, 0.5), M["black"], C, bevel=0.01),
          box("TowerGlass", (0.488, 0.05, 0.3), (0.01, 0.4, 0.4), M["rgb"], C)]
    return P


# ---------------------------------------------------------------- bathroom
def b_bathtub(C):
    W, L, T = 0.8, 1.68, 0.07
    P = [box("Bottom", (0, 0, 0.2), (W - 0.06, L - 0.06, 0.1), M["ceramic"], C, bevel=0.04),
         box("Water", (0, 0, 0.5), (W - 2 * T, L - 2 * T, 0.02), M["water"], C)]
    for sx in (-1, 1):
        P.append(box("Side", (sx * (W / 2 - T / 2), 0, 0.42), (T, L, 0.46), M["ceramic"], C, bevel=0.03))
        P.append(box("End", (0, sx * (L / 2 - T / 2), 0.42), (W, T, 0.46), M["ceramic"], C, bevel=0.03))
    for x in (-0.3, 0.3):
        for y in (-0.7, 0.7):
            P.append(sphere("Foot", (x, y, 0.07), 0.07, M["brass"], C, seg=8, scale=(1, 1, 1.2)))
    P += [cyl("Tap", (0, 0.78, 0.75), 0.02, 0.26, M["brass"], C, seg=8),
          box("Spout", (0, 0.72, 0.86), (0.03, 0.14, 0.03), M["brass"], C),
          sphere("Duck", (0.15, -0.3, 0.54), 0.05, M["yellow"], C, seg=8)]
    return P


def b_sink_vanity(C):
    P = [box("Cabinet", (0, 0, 0.45), (0.8, 0.46, 0.7), M["oak"], C, bevel=0.008),
         box("Top", (0, 0, 0.82), (0.82, 0.48, 0.04), M["white"], C),
         cyl("Basin", (0, -0.03, 0.89), 0.2, 0.1, M["ceramic"], C, seg=18, r2=0.17),
         cyl("Tap", (0, 0.15, 0.94), 0.015, 0.2, M["steel"], C, seg=8),
         box("Spout", (0, 0.09, 1.03), (0.025, 0.12, 0.025), M["steel"], C),
         box("Mirror", (0, 0.22, 1.45), (0.62, 0.03, 0.7), M["oak"], C, bevel=0.01),
         box("MirrorGlass", (0, 0.2, 1.45), (0.54, 0.01, 0.62), M["mirror"], C),
         box("MirrorPost", (0, 0.22, 1.0), (0.06, 0.03, 0.3), M["oak"], C)]
    legs4(P, C, 0.76, 0.42, 0.1, M["black"], s=0.04)
    for x in (-0.2, 0.2):
        P.append(box("Door", (x, -0.235, 0.47), (0.36, 0.02, 0.6), M["white"], C, bevel=0.004))
    return P


def b_toilet(C):
    return [cyl("Pedestal", (0, -0.05, 0.2), 0.16, 0.4, M["ceramic"], C, seg=14, r2=0.13),
            box("Bowl", (0, -0.1, 0.38), (0.4, 0.5, 0.06), M["ceramic"], C, bevel=0.06),
            box("Seat", (0, -0.1, 0.42), (0.38, 0.48, 0.03), M["white"], C, bevel=0.05),
            box("Tank", (0, 0.2, 0.6), (0.42, 0.18, 0.42), M["ceramic"], C, bevel=0.03),
            box("TankLid", (0, 0.2, 0.82), (0.44, 0.2, 0.03), M["ceramic"], C, bevel=0.01),
            cyl("Button", (0, 0.2, 0.84), 0.03, 0.01, M["steel"], C, seg=10)]


def b_towel_rack(C):
    P = []
    for x in (-0.22, 0.22):
        p = box("Rail", (x, 0.05, 0.75), (0.04, 0.04, 1.55), M["oak"], C)
        p.rotation_euler = (math.radians(-10), 0, 0)
        P.append(p)
    for i, z in enumerate((0.35, 0.7, 1.05, 1.35)):
        P.append(cyl("Rung", (0, 0.05 - (z - 0.75) * math.tan(math.radians(10)), z), 0.015, 0.44, M["oak"], C, seg=6, rot=(0, math.pi / 2, 0)))
    P.append(box("Towel", (0, -0.0, 0.88), (0.36, 0.04, 0.4), M["teal"], C, bevel=0.01))
    P.append(box("Towel2", (0, -0.06, 0.5), (0.36, 0.04, 0.3), M["coral"], C, bevel=0.01))
    return P


# ---------------------------------------------------------------- kids & play
def b_bunk_bed(C):
    W, L = 1.0, 2.05
    P = []
    for x in (-W / 2, W / 2):
        for y in (-L / 2, L / 2):
            P.append(box("Post", (x, y, 0.85), (0.07, 0.07, 1.7), M["oak"], C))
    for z, duvet in ((0.25, "coral"), (1.25, "teal")):
        P.append(box("Slats", (0, 0, z), (W, L, 0.06), M["oak"], C))
        P.append(box("Mattress", (0, 0, z + 0.1), (W - 0.06, L - 0.06, 0.14), M["white"], C, bevel=0.03))
        P.append(box("Duvet", (0, -0.2, z + 0.19), (W - 0.02, 1.5, 0.06), M[duvet], C, bevel=0.02))
        P.append(box("Pillow", (0, 0.75, z + 0.21), (0.55, 0.3, 0.1), M["white"], C, bevel=0.04))
    for y in (-L / 2, L / 2):
        P.append(box("GuardEnd", (0, y, 1.55), (W, 0.04, 0.2), M["oak"], C))
    P.append(box("GuardSide", (0, -0.2 + 0.0, 1.55), (0.04, 0.0 + 1.3, 0.2), M["oak"], C))
    P[-1].location.x = -W / 2
    for z in (0.5, 0.8, 1.1, 1.4):
        P.append(box("Ladder", (W / 2 + 0.06, -0.75, z), (0.04, 0.4, 0.04), M["oak"], C))
    P.append(box("LadderRail", (W / 2 + 0.06, -0.55, 0.85), (0.04, 0.04, 1.7), M["oak"], C))
    P.append(box("LadderRail2", (W / 2 + 0.06, -0.95, 0.85), (0.04, 0.04, 1.7), M["oak"], C))
    return P


def b_toy_chest(C):
    P = [box("Chest", (0, 0, 0.24), (0.8, 0.45, 0.44), M["blue"], C, bevel=0.02),
         box("Lid", (0, 0.12, 0.6), (0.82, 0.04, 0.4), M["yellow"], C, bevel=0.01)]
    P[-1].rotation_euler = (math.radians(-70), 0, 0)
    P[-1].location = (0, 0.3, 0.6)
    P += [box("Band", (0, -0.23, 0.24), (0.82, 0.01, 0.08), M["yellow"], C),
          box("Block", (-0.2, -0.05, 0.5), (0.12, 0.12, 0.12), M["red"], C, bevel=0.01),
          box("Block2", (-0.05, 0.0, 0.48), (0.12, 0.12, 0.12), M["green"], C, bevel=0.01),
          sphere("Ball", (0.18, -0.02, 0.52), 0.1, M["coral"], C, seg=10),
          sphere("TeddyHead", (0.05, 0.1, 0.6), 0.08, M["wood"], C, seg=8)]
    return P


def b_bean_bag(C):
    return [sphere("Bag", (0, 0, 0.28), 0.42, M["coral"], C, seg=14, scale=(1, 1, 0.68)),
            sphere("Back", (0, 0.2, 0.48), 0.32, M["coral"], C, seg=12, scale=(1.1, 0.7, 0.9))]


def b_arcade_cabinet(C):
    P = [box("Body", (0, 0.05, 0.9), (0.7, 0.75, 1.8), M["purple"], C, bevel=0.01),
         box("Marquee", (0, -0.25, 1.72), (0.66, 0.2, 0.18), M["rgb"], C),
         box("ScreenBox", (0, -0.26, 1.3), (0.66, 0.3, 0.55), M["black"], C),
         box("Screen", (0, -0.42, 1.3), (0.52, 0.01, 0.42), M["screen"], C),
         box("Panel", (0, -0.42, 0.95), (0.7, 0.4, 0.06), M["black"], C),
         box("Front", (0, -0.33, 0.45), (0.66, 0.02, 0.9), M["purple"], C),
         box("CoinDoor", (0, -0.345, 0.55), (0.24, 0.02, 0.2), M["steel"], C)]
    P[4].rotation_euler = (math.radians(15), 0, 0)
    P += [cyl("Stick", (-0.15, -0.45, 1.04), 0.012, 0.1, M["black"], C, seg=6),
          sphere("StickBall", (-0.15, -0.45, 1.1), 0.03, M["red"], C, seg=8)]
    for i, m in enumerate(("yellow", "blue", "green", "red")):
        P.append(cyl("Btn", (0.05 + i * 0.07, -0.44, 1.0), 0.022, 0.02, M[m], C, seg=10))
    for sx in (-1, 1):
        P.append(box("SideStripe", (sx * 0.355, 0.05, 1.0), (0.01, 0.7, 0.06), M["rgb"], C))
    return P


# ---------------------------------------------------------------- storage
def b_cube_shelf(C):
    S, D, N = 1.47, 0.39, 4
    P = []
    c = S / N
    for i in range(N + 1):
        P.append(box("Hor", (0, 0, i * c + 0.02 - (0.0 if i else 0)), (S, D, 0.04), M["white"], C))
        P.append(box("Ver", (-S / 2 + i * c, 0, S / 2 + 0.02), (0.04, D, S), M["white"], C))
    boxes = ["coral", "teal", "mustard", "grey"]
    for r in range(N):
        for k in range(N):
            if (r + k) % 3 == 0:
                P.append(box("Bin", (-S / 2 + c * (k + 0.5), -0.02, r * c + 0.04 + 0.15), (c - 0.08, D - 0.06, 0.3), M[boxes[(r + k) % 4]], C, bevel=0.01))
            elif (r + k) % 3 == 1:
                for j in range(4):
                    P.append(box("Book", (-S / 2 + c * k + 0.08 + j * 0.05, -0.02, r * c + 0.04 + 0.13), (0.035, 0.24, 0.26 - 0.02 * (j % 2)), M[["red", "blue", "yellow", "green"][j]], C))
    return P


def b_coat_rack(C):
    P = [cyl("Base", (0, 0, 0.02), 0.22, 0.04, M["black"], C, seg=16),
         cyl("Pole", (0, 0, 0.9), 0.025, 1.76, M["walnut"], C, seg=8),
         sphere("Top", (0, 0, 1.8), 0.04, M["walnut"], C, seg=8)]
    for i in range(4):
        a = i * math.pi / 2 + 0.3
        P.append(cyl("Hook", (0.1 * math.cos(a), 0.1 * math.sin(a), 1.68), 0.012, 0.22, M["walnut"], C, seg=6, rot=(math.cos(a) * 0 + math.radians(-50) * math.sin(a), math.radians(50) * math.cos(a), 0)))
    P.append(box("Coat", (0.12, -0.05, 1.3), (0.3, 0.12, 0.6), M["olive"], C, bevel=0.04))
    P.append(cyl("Hat", (-0.08, 0.06, 1.74), 0.13, 0.03, M["navy"], C, seg=14))
    P.append(cyl("HatTop", (-0.08, 0.06, 1.8), 0.08, 0.1, M["navy"], C, seg=14))
    return P


# ---------------------------------------------------------------- plants & decor
def b_cactus(C):
    P = [cyl("Pot", (0, 0, 0.1), 0.12, 0.2, M["pot"], C, seg=12, r2=0.14),
         cyl("Soil", (0, 0, 0.2), 0.125, 0.01, M["sand"], C, seg=12),
         cyl("Body", (0, 0, 0.42), 0.07, 0.45, M["cactus"], C, seg=8),
         sphere("Cap", (0, 0, 0.64), 0.07, M["cactus"], C, seg=8),
         cyl("ArmL", (-0.1, 0, 0.45), 0.04, 0.16, M["cactus"], C, seg=8),
         cyl("ArmLLink", (-0.06, 0, 0.38), 0.035, 0.08, M["cactus"], C, seg=8, rot=(0, math.pi / 2, 0)),
         cyl("ArmR", (0.1, 0, 0.53), 0.035, 0.14, M["cactus"], C, seg=8),
         cyl("ArmRLink", (0.06, 0, 0.47), 0.03, 0.08, M["cactus"], C, seg=8, rot=(0, math.pi / 2, 0)),
         sphere("Flower", (0, 0, 0.71), 0.03, M["pink"], C, seg=8)]
    return P


def b_monstera(C):
    P = [cyl("Pot", (0, 0, 0.18), 0.22, 0.36, M["white"], C, seg=14, r2=0.2),
         cyl("Soil", (0, 0, 0.36), 0.2, 0.02, M["soil"], C, seg=14)]
    for i in range(9):
        a = i * 2.4
        r = 0.18 + 0.05 * (i % 3)
        h = 0.75 + 0.08 * (i % 4)
        x, y = r * math.cos(a), r * math.sin(a)
        stem = cyl("Stem", (x / 2, y / 2, 0.36 + h / 2), 0.01, h, M["leaf"], C, seg=5)
        stem.rotation_euler = (-y * 0.8, x * 0.8, 0)
        P.append(stem)
        leaf = sphere("Leaf", (x * 1.6, y * 1.6, 0.36 + h), 0.2, M["leaf" if i % 2 else "leaf2"], C, seg=8, scale=(1.1, 0.75, 0.12), smooth=False)
        leaf.rotation_euler = (0.4 * math.sin(a), -0.4 * math.cos(a), a)
        P.append(leaf)
    return P


def b_vase_tulips(C):
    P = [cyl("Vase", (0, 0, 0.13), 0.08, 0.26, M["glass"], C, seg=14, r2=0.06),
         cyl("Water", (0, 0, 0.08), 0.07, 0.15, M["water"], C, seg=12)]
    for i in range(5):
        a = i * 2 * math.pi / 5
        x, y = 0.05 * math.cos(a), 0.05 * math.sin(a)
        s = cyl("Stem", (x * 0.6, y * 0.6, 0.32), 0.006, 0.36, M["leaf2"], C, seg=4)
        s.rotation_euler = (-y * 3, x * 3, 0)
        P.append(s)
        P.append(sphere("Tulip", (x * 1.2, y * 1.2, 0.5 + 0.02 * (i % 2)), 0.035, M[("pink", "red", "yellow")[i % 3]], C, seg=8, scale=(1, 1, 1.4)))
    return P


def b_globe(C):
    return [cyl("Base", (0, 0, 0.02), 0.12, 0.04, M["walnut"], C, seg=14),
            cyl("Post", (0, 0, 0.12), 0.015, 0.18, M["brass"], C, seg=6),
            sphere("Globe", (0, 0, 0.38), 0.18, M["ocean"], C, seg=16),
            sphere("Land", (0.06, -0.06, 0.42), 0.12, M["green"], C, seg=8, scale=(1, 0.6, 0.8)),
            sphere("Land2", (-0.08, 0.04, 0.32), 0.1, M["green"], C, seg=8, scale=(0.7, 1, 0.9))] + [
        cyl("Meridian", (0, 0, 0.38), 0.205, 0.02, M["brass"], C, seg=24, rot=(math.pi / 2, 0, math.radians(20)))]


def b_aquarium(C):
    P = [box("Cabinet", (0, 0, 0.36), (1.0, 0.42, 0.72), M["walnut"], C, bevel=0.01),
         box("TankFrame", (0, 0, 0.74), (1.0, 0.42, 0.04), M["black"], C),
         box("Glass", (0, 0, 1.02), (0.98, 0.4, 0.52), M["glass"], C),
         box("Water", (0, 0, 0.99), (0.94, 0.36, 0.44), M["water"], C),
         box("Sand", (0, 0, 0.79), (0.94, 0.36, 0.05), M["sand"], C),
         box("Lid", (0, 0, 1.3), (1.0, 0.42, 0.04), M["black"], C)]
    for i, (x, z) in enumerate(((-0.25, 1.0), (0.15, 1.1), (0.3, 0.92))):
        P.append(sphere("Fish", (x, -0.05, z), 0.05, M["orange"], C, seg=8, scale=(1.5, 0.5, 1)))
    for x in (-0.38, 0.38):
        P.append(cyl("Weed", (x, 0.08, 0.95), 0.025, 0.3, M["leaf2"], C, seg=5))
    return P


# ---------------------------------------------------------------- outdoor
def b_garden_bench(C):
    P = []
    for i in range(4):
        P.append(box("SeatSlat", (0, -0.2 + i * 0.12, 0.44), (1.5, 0.09, 0.03), M["wood"], C))
    for i in range(3):
        P.append(box("BackSlat", (0, 0.27, 0.6 + i * 0.13), (1.5, 0.03, 0.09), M["wood"], C))
    for x in (-0.68, 0.68):
        P.append(box("SideFrame", (x, 0, 0.21), (0.05, 0.5, 0.42), M["black"], C))
        P.append(box("BackFrame", (x, 0.28, 0.65), (0.05, 0.04, 0.5), M["black"], C))
        P.append(box("Armrest", (x, 0.02, 0.64), (0.06, 0.55, 0.04), M["black"], C))
    return P


def b_parasol(C):
    P = [box("Base", (0, 0, 0.05), (0.5, 0.5, 0.1), M["steel"], C, bevel=0.02),
         cyl("Pole", (0, 0, 1.15), 0.025, 2.2, M["white"], C, seg=8),
         cyl("Canopy", (0, 0, 2.15), 1.3, 0.35, M["stripes"], C, seg=12, r2=0.05),
         cyl("Finial", (0, 0, 2.36), 0.04, 0.08, M["white"], C, seg=8)]
    return P


def b_bbq_grill(C):
    P = [sphere("Kettle", (0, 0, 0.78), 0.3, M["red"], C, seg=14, scale=(1, 1, 0.75)),
         cyl("Rim", (0, 0, 0.82), 0.3, 0.02, M["black"], C, seg=16),
         cyl("Handle", (0, 0, 1.03), 0.04, 0.04, M["black"], C, seg=8),
         box("Tray", (0, 0, 0.3), (0.45, 0.45, 0.02), M["black"], C)]
    for i in range(3):
        a = i * 2 * math.pi / 3
        leg = cyl("Leg", (0.2 * math.cos(a), 0.2 * math.sin(a), 0.33), 0.018, 0.68, M["black"], C, seg=6)
        leg.rotation_euler = (-0.25 * math.sin(a), 0.25 * math.cos(a), 0)
        P.append(leg)
    return P


def b_sun_lounger(C):
    P = [box("Frame", (0, -0.15, 0.3), (0.65, 1.4, 0.05), M["oak"], C),
         box("Pad", (0, -0.15, 0.35), (0.6, 1.36, 0.05), M["stripes"], C, bevel=0.015)]
    back = box("Back", (0, 0.7, 0.55), (0.6, 0.7, 0.07), M["stripes"], C, bevel=0.015)
    back.rotation_euler = (math.radians(40), 0, 0)
    P.append(back)
    for y in (-0.8, 0.45):
        for x in (-0.28, 0.28):
            P.append(box("Leg", (x, y, 0.14), (0.05, 0.05, 0.28), M["oak"], C))
    P.append(box("Towel", (0, -0.4, 0.39), (0.5, 0.35, 0.02), M["teal"], C))
    return P


BUILDERS = {k: globals()["b_" + k] for k, *_ in FURNITURE}

# ---------------------------------------------------------------- build + export
ONLY = globals().get("ONLY")
built = []
for key, name, dept, price, rarity, stack, desc in FURNITURE:
    if ONLY and key not in ONLY:
        continue
    C = reset_coll(f"DECOR_{key}")
    parts = [p for p in BUILDERS[key](C) if p]
    obj = join(parts, f"Decor_{key}")
    bpy.context.view_layer.update()
    # rest on the floor exactly
    zmin = min((obj.matrix_world @ v.co).z for v in obj.data.vertices)
    obj.location.z -= zmin
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    xs = [v.co.x for v in obj.data.vertices]
    ys = [v.co.y for v in obj.data.vertices]
    zs = [v.co.z for v in obj.data.vertices]
    dims = [round(max(xs) - min(xs), 2), round(max(zs) - min(zs), 2), round(max(ys) - min(ys), 2)]  # game w, h, d
    if not globals().get("SKIP_EXPORT"):
        export_collection(f"DECOR_{key}", os.path.join(ROOT, "out", "decor", key, "model.glb"))
    if not globals().get("SKIP_PREVIEW"):
        render_preview(f"DECOR_{key}", os.path.join(PUBLIC, "decor", key, "preview.png"), size=512, yaw_deg=35, pitch_deg=22, fill=0.95)
    built.append({"key": key, "tris": sum(len(p.vertices) - 2 for p in obj.data.polygons), "dims": dims})

# Manifest read by build_store.py (footprints) and kept for reference.
manifest_path = os.path.join(ROOT, "out", "decor", "furniture.manifest.json")
manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) else {}
for b_ in built:
    manifest[b_["key"]] = b_["dims"]
os.makedirs(os.path.dirname(manifest_path), exist_ok=True)
json.dump(manifest, open(manifest_path, "w"), indent=1)
result = {"built": built}
