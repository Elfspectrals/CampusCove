"""Builds the 10 houses: an exterior (EXT_<key>) and its own interior (INT_<key>) each.

Exterior: built at the origin, front door centred on the front face (y = -D/2), facing -Y (game +Z).
Interior: every interior shares one entrance convention so the game needs a single spawn / exit:
  * entrance door centred on the front wall at Blender y = -5.0  (game z = +5.0)
  * the rooms extend towards +Y (game -Z); floor at z = 0, ceiling at 2.8 m
  * spawn = game (0, 1.6, 3.7) facing -Z; exit trigger = game (0, 4.75)
Collision boxes live in INT_<key>_COL (exported to a separate *.colsrc.glb).
"""
import bpy, math, os
exec(open(r"C:\Users\Utilisateur\CampusCove\map-src\CampusCove\lib\cc_lib.py").read())

H_IN = 2.8          # interior ceiling height
TE, TI = 0.2, 0.12  # exterior / interior wall thickness
Y0 = -5.0           # interior front wall line (entrance)

# ---------------------------------------------------------------- house definitions
HOUSES = [
    dict(key="house_01", name="Maple Cottage", W=8.0, D=7.5, floors=1, wall="T_SidingWhite", roof="T_RoofRed", roof_type="gable_x",
         trim=(0.95, 0.95, 0.92), door=(0.55, 0.18, 0.15), porch=True, chimney=True, layout="A", theme="classic", offer="rent", price=90),
    dict(key="house_02", name="Bluebell Bungalow", W=9.0, D=7.5, floors=1, wall="T_SidingBlue", roof="T_RoofSlate", roof_type="gable_x",
         trim=(0.96, 0.96, 0.94), door=(0.95, 0.85, 0.4), porch=False, chimney=False, layout="A", theme="scandi", offer="rent", price=110),
    dict(key="house_03", name="Sunny Nook", W=8.5, D=8.0, floors=1, wall="T_SidingYellow", roof="T_RoofBrown", roof_type="gable_y",
         trim=(0.97, 0.97, 0.95), door=(0.2, 0.45, 0.6), porch=True, chimney=False, layout="A", theme="sunny", offer="rent", price=120),
    dict(key="house_04", name="Mint Villa", W=10.0, D=9.0, floors=1, wall="T_SidingMint", roof="T_RoofGreen", roof_type="gable_x",
         trim=(0.97, 0.97, 0.95), door=(0.6, 0.3, 0.45), porch=True, chimney=True, layout="B", theme="sage", offer="buy", price=1800),
    dict(key="house_05", name="Brick Townhouse", W=9.0, D=9.0, floors=2, wall="T_BrickRed", roof="T_RoofSlate", roof_type="gable_x",
         trim=(0.92, 0.9, 0.85), door=(0.12, 0.2, 0.35), porch=False, chimney=True, layout="B", theme="navy", offer="buy", price=2400),
    dict(key="house_06", name="Rose Cottage", W=9.5, D=9.0, floors=1, wall="T_SidingRose", roof="T_RoofRed", roof_type="gable_y",
         trim=(0.98, 0.97, 0.95), door=(0.95, 0.95, 0.92), porch=True, chimney=False, layout="B", theme="blush", offer="rent", price=160),
    dict(key="house_07", name="Terracotta Casa", W=11.0, D=9.0, floors=1, wall="T_PlasterTerracotta", roof="T_RoofGravel", roof_type="flat",
         trim=(0.95, 0.9, 0.8), door=(0.35, 0.22, 0.14), porch=False, chimney=False, layout="C", theme="terracotta", offer="buy", price=2800),
    dict(key="house_08", name="Modern Cube", W=11.5, D=9.5, floors=2, wall="T_PlasterWhite", roof="T_RoofGravel", roof_type="flat",
         trim=(0.15, 0.15, 0.17), door=(0.15, 0.15, 0.17), porch=False, chimney=False, layout="C", theme="mono", offer="buy", price=3600),
    dict(key="house_09", name="Neon Loft", W=11.0, D=10.0, floors=2, wall="T_PlasterCharcoal", roof="T_RoofGravel", roof_type="flat",
         trim=(0.6, 0.3, 1.0), door=(0.9, 0.3, 0.8), porch=False, chimney=False, layout="C", theme="neon", offer="buy", price=3200),
    dict(key="house_10", name="Forest Lodge", W=12.0, D=10.0, floors=1, wall="T_WoodGrain", roof="T_RoofGreen", roof_type="gable_x",
         trim=(0.9, 0.85, 0.7), door=(0.25, 0.4, 0.25), porch=True, chimney=True, layout="C", theme="forest", offer="buy", price=4000),
]

THEMES = {
    #           living wall       bedroom wall       main floor          wet floor           sofa              accent             rug             cabinet
    "classic": ("T_PlasterCream", "T_PlasterBlue", "T_WoodFloor", "T_TileFloorBath", "T_FabricTeal", "T_FabricMustard", "T_Rug", (0.42, 0.55, 0.45)),
    "scandi": ("T_PlasterWhite", "T_PlasterSand", "T_WoodFloorLight", "T_TileWhite", "T_FabricGrey", "T_FabricOlive", "T_RugStripes", (0.88, 0.88, 0.85)),
    "sunny": ("T_PlasterSand", "T_PlasterBlush", "T_WoodFloor", "T_TileTerracotta", "T_FabricCoral", "T_FabricTeal", "T_RugSun", (0.85, 0.62, 0.25)),
    "sage": ("T_PlasterSage", "T_PlasterCream", "T_WoodFloorLight", "T_TileWhite", "T_FabricLinen", "T_FabricCoral", "T_Rug", (0.9, 0.86, 0.76)),
    "navy": ("T_PlasterBlue", "T_PlasterWhite", "T_WoodFloorEbony", "T_TileWhite", "T_FabricMustard", "T_FabricTeal", "T_RugStripes", (0.15, 0.2, 0.38)),
    "blush": ("T_PlasterBlush", "T_PlasterWhite", "T_WoodFloorLight", "T_TileWhite", "T_FabricGrey", "T_FabricCoral", "T_Rug", (0.95, 0.93, 0.9)),
    "terracotta": ("T_PlasterTerracotta", "T_PlasterBlush", "T_WoodFloor", "T_TileTerracotta", "T_FabricMustard", "T_FabricOlive", "T_RugSun", (0.36, 0.42, 0.26)),
    "mono": ("T_PlasterWhite", "T_PlasterCharcoal", "T_WoodFloorEbony", "T_TileWhite", "T_FabricGrey", "T_FabricNavy", "T_RugStripes", (0.12, 0.12, 0.14)),
    "neon": ("T_PlasterCharcoal", "T_PlasterCharcoal", "T_WoodFloorEbony", "T_TileFloorBath", "T_FabricPurple", "T_FabricNavy", "T_RugNeon", (0.08, 0.08, 0.11)),
    "forest": ("T_PlasterSage", "T_PlasterSand", "T_WoodFloor", "T_TileKitchen", "T_FabricOlive", "T_FabricMustard", "T_RugStripes", (0.42, 0.55, 0.45)),
}


# ================================================================ EXTERIOR
def build_exterior(h):
    key = h["key"]
    C = reset_coll(f"EXT_{key}")
    p = f"EX_{key}_"
    W, D = h["W"], h["D"]
    FH = 3.0
    HT = FH * h["floors"]
    wall_tile = 1.6 if "Brick" in h["wall"] else 2.0
    m_wall = mat(p + "Wall", h["wall"], tile=wall_tile, rough=0.85)
    m_trim = mat(p + "Trim", color=h["trim"], rough=0.45)
    m_roof = mat(p + "Roof", h["roof"], tile=2.0 if h["roof_type"] != "flat" else 3.0, rough=0.85)
    m_base = mat("EX_Foundation", "T_StoneBlock", tile=1.5, rough=0.9)
    m_glass = mat("EX_WindowGlass", color=(0.2, 0.3, 0.4), rough=0.08, metal=0.3)
    m_glass_lit = mat("EX_WindowGlassLit", color=(1.0, 0.86, 0.6), rough=0.2, emit=(1.0, 0.8, 0.5), emit_str=0.7)
    m_door = mat(p + "Door", color=h["door"], rough=0.45)
    m_metal = mat("EX_MetalDark", color=(0.1, 0.1, 0.12), rough=0.4, metal=0.6)
    m_wood = mat("EX_WoodPost", "T_WoodGrain", tile=1.0, rough=0.6)
    m_plant = mat("EX_Bush", color=(0.22, 0.5, 0.24), rough=0.85)
    m_flower = mat("EX_Flowers", color=(0.95, 0.45, 0.55), rough=0.8)
    m_lamp = mat("EX_PorchLamp", color=(1.0, 0.9, 0.7), emit=(1.0, 0.85, 0.6), emit_str=2.5)
    P = []
    P.append(box("Foundation", (0, 0, 0.15), (W + 0.2, D + 0.2, 0.3), m_base, C))
    P.append(box("Walls", (0, 0, 0.3 + HT / 2), (W, D, HT), m_wall, C))
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.append(box("Corner", (sx * (W / 2 - 0.05), sy * (D / 2 - 0.05), 0.3 + HT / 2), (0.16, 0.16, HT), m_trim, C))
    if h["floors"] > 1:
        P.append(box("FloorBand", (0, 0, 0.3 + FH), (W + 0.08, D + 0.08, 0.12), m_trim, C))

    # windows: proud panels on every face (front skips the door bay)
    lit = [False, True, False, True, False, False, True]
    wi = [0]

    def window(face, s, zc, w=1.2, hgt=1.3):
        g = m_glass_lit if lit[wi[0] % len(lit)] else m_glass
        wi[0] += 1
        o = 0.04
        if face in "NS":
            y = (D / 2 + o / 2) * (1 if face == "N" else -1)
            sz = lambda a, b, c: (a, c, b)
            loc = lambda dz, dd: (s, y + dd * (1 if face == "N" else -1), zc + dz)
        else:
            x = (W / 2 + o / 2) * (1 if face == "E" else -1)
            sz = lambda a, b, c: (c, a, b)
            loc = lambda dz, dd: (x + dd * (1 if face == "E" else -1), s, zc + dz)
        return [box("WinFrame", loc(0, 0), sz(w + 0.14, hgt + 0.14, o), m_trim, C),
                box("WinGlass", loc(0, 0.012), sz(w, hgt, o), g, C),
                box("WinMullion", loc(0, 0.03), sz(0.05, hgt, o), m_trim, C),
                box("WinBar", loc(0, 0.03), sz(w, 0.05, o), m_trim, C),
                box("WinSill", loc(-hgt / 2 - 0.08, 0.06), sz(w + 0.25, 0.07, 0.14), m_trim, C)]

    for f in range(h["floors"]):
        zc = 0.3 + f * FH + 1.6
        for s in (-W / 3.2, W / 3.2):
            P += window("S", s, zc)
        if f > 0:
            P += window("S", 0, zc, w=1.0)
        for s in (-W / 4, W / 4):
            P += window("N", s, zc)
        for s in ((-D / 4, D / 4) if D > 8.5 else (0,)):
            P += window("E", s, zc)
            P += window("W", s, zc)

    # front door + frame
    fy = -D / 2
    P += [box("DoorFrame", (0, fy - 0.04, 0.3 + 1.15), (1.36, 0.08, 2.36), m_trim, C),
          box("Door", (0, fy - 0.07, 0.3 + 1.1), (1.1, 0.06, 2.2), m_door, C, bevel=0.01),
          box("DoorWindow", (0, fy - 0.105, 0.3 + 1.65), (0.5, 0.02, 0.5), m_glass_lit, C),
          cyl("DoorKnob", (0.4, fy - 0.12, 0.3 + 1.05), 0.035, 0.05, m_metal, C, seg=10, rot=(math.pi / 2, 0, 0)),
          box("Step", (0, fy - 0.55, 0.12), (1.8, 0.9, 0.24), m_base, C),
          box("Doormat", (0, fy - 0.55, 0.245), (1.0, 0.6, 0.01), m_door, C),
          box("NumberPlate", (0.95, fy - 0.03, 0.3 + 1.9), (0.3, 0.02, 0.2), m_trim, C),
          box("PorchLamp", (-0.95, fy - 0.08, 0.3 + 1.95), (0.14, 0.1, 0.24), m_lamp, C)]
    if h["porch"]:
        pd = 1.8
        P += [box("PorchFloor", (0, fy - pd / 2, 0.15), (min(W - 1.0, 5.0), pd, 0.3), m_wood, C),
              box("PorchRoof", (0, fy - pd / 2, 0.3 + 2.55), (min(W - 0.6, 5.4), pd + 0.3, 0.12), m_trim, C)]
        for sx in (-1, 1):
            P.append(box("PorchPost", (sx * (min(W - 1.0, 5.0) / 2 - 0.12), fy - pd + 0.15, 0.3 + 1.27), (0.12, 0.12, 2.55), m_trim, C))
    else:
        P.append(box("Canopy", (0, fy - 0.45, 0.3 + 2.5), (1.8, 0.9, 0.1), m_trim, C))
    # flower boxes under the front windows
    for s in (-W / 3.2, W / 3.2):
        P += [box("FlowerBox", (s, fy - 0.15, 0.3 + 0.8), (1.3, 0.25, 0.2), m_wood, C),
              box("Flowers", (s, fy - 0.15, 0.3 + 0.95), (1.2, 0.2, 0.12), m_flower, C, bevel=0.04)]
    # side bushes
    for sx in (-1, 1):
        P.append(sphere("Bush", (sx * (W / 2 - 0.4), fy - 0.6, 0.45), 0.5, m_plant, C, seg=8, smooth=False))

    # roof
    top = 0.3 + HT
    if h["roof_type"] == "flat":
        P += [box("RoofSlab", (0, 0, top + 0.1), (W + 0.3, D + 0.3, 0.2), m_trim, C),
              box("RoofTop", (0, 0, top + 0.21), (W - 0.2, D - 0.2, 0.02), m_roof, C)]
        for name, loc, size in (("ParN", (0, D / 2 + 0.05, top + 0.45), (W + 0.3, 0.2, 0.5)),
                                ("ParS", (0, -D / 2 - 0.05, top + 0.45), (W + 0.3, 0.2, 0.5)),
                                ("ParE", (W / 2 + 0.05, 0, top + 0.45), (0.2, D + 0.3, 0.5)),
                                ("ParW", (-W / 2 - 0.05, 0, top + 0.45), (0.2, D + 0.3, 0.5))):
            P.append(box(name, loc, size, m_wall, C))
        P.append(box("RoofUnit", (W / 4, D / 5, top + 0.55), (1.2, 0.9, 0.7), m_metal, C, bevel=0.03))
    else:
        axis = "x" if h["roof_type"] == "gable_x" else "y"
        span = D if axis == "x" else W
        rh = span * 0.32
        P.append(prism_roof("Roof", 0, 0, top, W, D, rh, m_roof, C, overhang=0.35, ridge_axis=axis, end_mat=m_wall))
        P.append(box("Eave", (0, 0, top + 0.04), (W + 0.7, D + 0.7, 0.08), m_trim, C))
    if h["chimney"]:
        cx_, cy_ = W / 3.5, D / 6
        P.append(box("Chimney", (cx_, cy_, top + 1.3), (0.6, 0.6, 2.6), mat("EX_ChimneyBrick", "T_BrickRed", tile=1.2), C))
        P.append(box("ChimneyCap", (cx_, cy_, top + 2.65), (0.75, 0.75, 0.1), m_trim, C))

    obj = join(P, f"House_{key}")
    for poly in obj.data.polygons:
        poly.use_smooth = False
    return C


# ================================================================ INTERIOR
def build_interior(h):
    key = h["key"]
    C = reset_coll(f"INT_{key}")
    CC = reset_coll(f"INT_{key}_COL", C)
    p = f"IN_{key}_"
    th = THEMES[h["theme"]]
    Wi, Di = h["W"] - 0.6, h["D"] - 0.6
    XL, XR, YB = -Wi / 2, Wi / 2, Y0 + Di
    M = {
        "liv": mat(p + "WallLiving", th[0], tile=2.0, rough=0.9),
        "bed": mat(p + "WallBed", th[1], tile=2.0, rough=0.9),
        "out": mat("IN_WallOuter", "T_PlasterWhite", tile=2.0, rough=0.9),
        "floor": mat(p + "Floor", th[2], tile=2.0, rough=0.55),
        "wet": mat(p + "FloorWet", th[3], tile=1.2, rough=0.35),
        "bathwall": mat("IN_BathTile", "T_TileWhite", tile=1.2, rough=0.25),
        "splash": mat("IN_Backsplash", "T_TileKitchen", tile=1.2, rough=0.25),
        "sofa": mat(p + "Sofa", th[4], tile=0.5, rough=0.95),
        "accent": mat(p + "Accent", th[5], tile=0.5, rough=0.95),
        "rug": mat(p + "Rug", th[6], tile=1.0, rough=1.0),
        "cab": mat(p + "Cabinet", color=th[7], rough=0.45),
        "ceiling": mat("IN_Ceiling", "T_Ceiling", tile=2.0, rough=0.95),
        "wood": mat("IN_WoodDark", "T_WoodGrain", tile=1.0, rough=0.5),
        "trim": mat("IN_Trim", color=(0.93, 0.93, 0.9), rough=0.4),
        "marble": mat("IN_Marble", "T_Marble", tile=1.0, rough=0.2),
        "metal": mat("IN_Steel", color=(0.75, 0.76, 0.78), rough=0.25, metal=1.0),
        "black": mat("IN_Black", color=(0.04, 0.04, 0.05), rough=0.4),
        "porcelain": mat("IN_Porcelain", color=(0.96, 0.96, 0.95), rough=0.15),
        "linen": mat("IN_Linen", "T_FabricLinen", tile=0.5, rough=0.95),
        "glass": mat("IN_Glass", color=(0.7, 0.85, 0.95), rough=0.05, alpha=0.25),
        "panel": mat(p + "CeilingLight", color=(1.0, 0.97, 0.9), emit=(1.0, 0.95, 0.85), emit_str=4.0),
        "lamp": mat("IN_LampGlow", color=(1.0, 0.92, 0.75), emit=(1.0, 0.85, 0.6), emit_str=3.0),
        "screen": mat("IN_Screen", color=(0.02, 0.03, 0.05), rough=0.1, emit=(0.08, 0.14, 0.25), emit_str=1.0),
        "plant": mat("IN_Plant", color=(0.2, 0.48, 0.22), rough=0.8),
        "pot": mat("IN_Pot", color=(0.72, 0.38, 0.24), rough=0.85),
        "door": mat("IN_DoorWood", "T_WoodGrain", tile=1.2, rough=0.45),
        "sky": mat("IN_SkyBackdrop", "T_SkyBackdrop", rough=1.0, emit=(1, 1, 1), emit_str=1.0),
    }
    nt = M["sky"].node_tree
    nt.links.new(nt.nodes["Image Texture"].outputs[0], nt.nodes["Principled BSDF"].inputs["Emission Color"])
    furniture = []   # objects that get a collision box

    def F(o):
        furniture.append(o)
        return o

    # ---------------- layout: rooms + interior walls (+ door spans) per variant
    lay = h["layout"]
    walls_int = []   # (name, a, b, openings(list of (s0,s1)), side_mats)
    floors = []      # (name, rect, material)
    if lay == "A":   # studio + bathroom pod in the back-right corner
        bx0 = XR - 2.6
        by0 = YB - 2.6
        floors += [("House_Floor_Main", (XL, XR, Y0, YB), M["floor"]), ("House_Floor_Bath", (bx0, XR, by0, YB), M["wet"])]
        walls_int += [("Wall_BathV", (bx0, by0), (bx0, YB), [(0.4, 1.4)], (M["liv"], M["bathwall"])),
                      ("Wall_BathH", (bx0 - TI / 2, by0), (XR, by0), [], (M["liv"], M["bathwall"]))]
        rooms = dict(bath=(bx0, XR, by0, YB), kitchen=(XL, bx0 - 0.2, YB - 0.65, YB), bed=(XL, XL + 2.3, Y0 + 1.2, by0 - 0.3),
                     living=(XR - 3.2, XR, Y0, by0 - 0.2), dining=(XL + 2.5, bx0 - 0.3, YB - 2.4, YB - 0.9))
        side_window_y = (Y0 + by0) / 2
        back_window_x = (XL + bx0) / 2
    elif lay == "B":  # living/kitchen at the front, bedroom + bathroom at the back
        ym = Y0 + Di * 0.52
        xs = XR - 3.0
        floors += [("House_Floor_Living", (XL, XR, Y0, ym), M["floor"]), ("House_Floor_Bedroom", (XL, xs, ym, YB), M["floor"]),
                   ("House_Floor_Bath", (xs, XR, ym, YB), M["wet"])]
        walls_int += [("Wall_Mid", (XL, ym), (XR, ym), [(1.0, 2.1), (xs - XL + 0.6, xs - XL + 1.6)], (M["liv"], M["bed"])),
                      ("Wall_BathV", (xs, ym + TI / 2), (xs, YB), [], (M["bed"], M["bathwall"]))]
        rooms = dict(bath=(xs, XR, ym, YB), bed=(XL, xs, ym, YB), kitchen=(XL, XL + 0.65, Y0 + 0.6, ym - 0.1),
                     living=(XR - 3.4, XR, Y0, ym), dining=(XL + 1.0, XL + 3.0, Y0 + 2.2, ym - 1.0))
        side_window_y = (Y0 + ym) / 2
        back_window_x = (XL + xs) / 2
    else:             # "C": bedroom + bathroom on the left, open living / kitchen on the right
        xs = XL + 4.0
        ym = Y0 + Di * 0.55
        floors += [("House_Floor_Living", (xs, XR, Y0, YB), M["floor"]), ("House_Floor_Bedroom", (XL, xs, Y0, ym), M["floor"]),
                   ("House_Floor_Bath", (XL, xs, ym, YB), M["wet"])]
        walls_int += [("Wall_Side", (xs, Y0), (xs, YB), [(ym - Y0 - 1.6, ym - Y0 - 0.5), (ym - Y0 + 0.5, ym - Y0 + 1.6)], (M["bed"], M["liv"])),
                      ("Wall_BedBath", (XL, ym), (xs - TI / 2, ym), [], (M["bed"], M["bathwall"]))]
        rooms = dict(bath=(XL, xs, ym, YB), bed=(XL, xs, Y0, ym), kitchen=(xs + 0.2, XR, YB - 0.65, YB),
                     living=(XR - 3.4, XR, Y0, ym - 0.5), dining=((xs + XR) / 2 - 1.0, (xs + XR) / 2 + 0.6, YB - 2.6, YB - 1.2))
        side_window_y = (Y0 + ym) / 2
        back_window_x = (xs + XR) / 2

    # ---------------- floors + ceiling
    for name, (x0, x1, y0, y1), m in floors:
        box(name, ((x0 + x1) / 2, (y0 + y1) / 2, -0.05 + (0.002 if "Bath" in name else 0)), (x1 - x0 + 0.02, y1 - y0 + 0.02, 0.1), m, C)
    box("Ceiling", (0, (Y0 + YB) / 2, H_IN + 0.05), (Wi + 2 * TE, Di + 2 * TE, 0.1), M["ceiling"], C)

    # ---------------- outer walls with windows + entrance
    WIN = (0.9, 2.2)
    outer = []
    outer += wall("Wall_Front", (XL - TE, Y0 - TE / 2), (XR + TE, Y0 - TE / 2), TE, H_IN, M["liv"], C,
                  openings=[(Wi / 2 + TE - 0.6, Wi / 2 + TE + 0.6, 0, 2.2),
                            (Wi / 2 + TE - Wi / 3 - 0.7, Wi / 2 + TE - Wi / 3 + 0.7, *WIN),
                            (Wi / 2 + TE + Wi / 3 - 0.7, Wi / 2 + TE + Wi / 3 + 0.7, *WIN)],
                  side_mats=(M["out"], M["liv"]))
    outer += wall("Wall_Back", (XL - TE, YB + TE / 2), (XR + TE, YB + TE / 2), TE, H_IN, M["liv"], C,
                  openings=[(back_window_x - XL + TE - 0.7, back_window_x - XL + TE + 0.7, 1.15, 2.2)],
                  side_mats=(M["liv"], M["out"]))
    west_window = lay != "B"   # layout B runs the kitchen along the west wall
    for side, x in (("W", XL - TE / 2), ("E", XR + TE / 2)):
        has_win = side == "E" or west_window
        outer += wall(f"Wall_{side}", (x, Y0 - TE), (x, YB + TE), TE, H_IN, M["liv"], C,
                      openings=[(side_window_y - Y0 + TE - 0.7, side_window_y - Y0 + TE + 0.7, *WIN)] if has_win else [],
                      side_mats=((M["liv"], M["out"]) if side == "E" else (M["out"], M["liv"])))
    # walls facing bedroom / bath get their room material on the inside face
    for o in outer:
        bpy.context.view_layer.update()
        cx, cy = o.location.x, o.location.y
        for rname, mkey in (("bed", "bed"), ("bath", "bathwall")):
            x0, x1, y0, y1 = rooms[rname]
            if x0 - 0.3 <= cx <= x1 + 0.3 and y0 - 0.3 <= cy <= y1 + 0.3 and (o.dimensions.x < x1 - x0 + 0.5 or o.dimensions.y < y1 - y0 + 0.5):
                for i, m in enumerate(o.data.materials):
                    if m == M["liv"]:
                        o.data.materials[i] = M[mkey]
    inner = []
    for name, a, b, ops, sm in walls_int:
        inner += wall(name, a, b, TI, H_IN, sm[0], C, openings=[(s0, s1, 0, 2.1) for s0, s1 in ops], side_mats=sm)
    for o in outer + inner:
        bpy.context.view_layer.update()
        if o.location.z - o.dimensions.z / 2 < 0.5:      # floor-touching pieces block movement
            col_from_object(o, CC)
    join(outer + inner, "Walls")

    # windows: frame + glass + sky backdrop (no collision on the sky: name starts with Sky)
    def window_frame(name, cx, cy, axis, w, zb, zt):
        t = TE + 0.04
        sz = (lambda a, b: (a, t, b)) if axis == "x" else (lambda a, b: (t, a, b))
        parts = [box(name, (cx, cy, zb - 0.02), sz(w + 0.1, 0.04), M["trim"], C),
                 box(name, (cx, cy, zt + 0.02), sz(w + 0.1, 0.04), M["trim"], C),
                 box(name, (cx, cy, (zb + zt) / 2), sz(0.05, zt - zb), M["trim"], C)]
        g = box(name + "_Glass", (cx, cy, (zb + zt) / 2), sz(w, zt - zb), M["glass"], C)
        g.scale = (1, 0.02 / t, 1) if axis == "x" else (0.02 / t, 1, 1)
        join(parts, name)
    window_frame("Window_F1", -Wi / 3, Y0 - TE / 2, "x", 1.4, *WIN)
    window_frame("Window_F2", Wi / 3, Y0 - TE / 2, "x", 1.4, *WIN)
    window_frame("Window_B", back_window_x, YB + TE / 2, "x", 1.4, 1.15, 2.2)
    if west_window:
        window_frame("Window_W", XL - TE / 2, side_window_y, "y", 1.4, *WIN)
    window_frame("Window_E", XR + TE / 2, side_window_y, "y", 1.4, *WIN)
    for name, loc, size in (("Sky_Front", (0, Y0 - 3.5, 1.4), (Wi + 14, 0.05, 9)), ("Sky_Back", (0, YB + 3.5, 1.4), (Wi + 14, 0.05, 9)),
                            ("Sky_West", (XL - 3.5, (Y0 + YB) / 2, 1.4), (0.05, Di + 14, 9)),
                            ("Sky_East", (XR + 3.5, (Y0 + YB) / 2, 1.4), (0.05, Di + 14, 9))):
        o = box(name, loc, size, M["sky"], C)
        ax = 0 if size[0] > size[1] else 1
        lo = loc[ax] - size[ax] / 2
        uvd = o.data.uv_layers.active.data
        for poly in o.data.polygons:
            for li in poly.loop_indices:
                v = o.matrix_world @ o.data.vertices[o.data.loops[li].vertex_index].co
                uvd[li].uv = ((v[ax] - lo) / size[ax], (v.z - (loc[2] - size[2] / 2)) / size[2])

    # entrance door (closed, the exit trigger is in front of it) + interior door frames
    box("Door_Entrance", (0, Y0 - TE / 2, 1.1), (1.18, 0.06, 2.18), M["door"], C, bevel=0.01)
    cyl("Door_Entrance_Handle", (0.42, Y0 + 0.02, 1.0), 0.02, 0.14, M["metal"], C, seg=10, rot=(math.pi / 2, 0, 0))
    box("Door_Entrance_Sign", (0, Y0 + 0.005, 2.45), (0.5, 0.01, 0.16), M["lamp"], C)
    box("Entry_Doormat", (0, Y0 + 0.5, 0.006), (1.0, 0.6, 0.012), M["accent"], C)

    # ---------------- furniture by room
    def sofa(x, y, rot_z, wdt=2.2):
        parts = [box("SofaBase", (0, 0, 0.22), (wdt, 0.9, 0.3), M["sofa"], C, bevel=0.04),
                 box("SofaBack", (0, 0.36, 0.58), (wdt, 0.2, 0.55), M["sofa"], C, bevel=0.06),
                 box("SofaArmL", (-wdt / 2 + 0.1, 0, 0.42), (0.2, 0.9, 0.45), M["sofa"], C, bevel=0.06),
                 box("SofaArmR", (wdt / 2 - 0.1, 0, 0.42), (0.2, 0.9, 0.45), M["sofa"], C, bevel=0.06),
                 box("SofaPillow", (-wdt / 2 + 0.45, 0.18, 0.6), (0.38, 0.14, 0.34), M["accent"], C, bevel=0.05),
                 box("SofaPillow", (wdt / 2 - 0.45, 0.18, 0.6), (0.38, 0.14, 0.34), M["accent"], C, bevel=0.05)]
        o = join(parts, "Sofa")
        o.location = (x, y, 0)
        o.rotation_euler = (0, 0, rot_z)
        return F(o)

    def coffee_table(x, y, rot_z=0.0):
        parts = [box("CTTop", (0, 0, 0.4), (1.1, 0.55, 0.05), M["wood"], C, bevel=0.01)]
        for dx in (-0.48, 0.48):
            for dy in (-0.22, 0.22):
                parts.append(box("CTLeg", (dx, dy, 0.19), (0.05, 0.05, 0.38), M["wood"], C))
        o = join(parts, "CoffeeTable")
        o.location = (x, y, 0)
        o.rotation_euler = (0, 0, rot_z)
        return F(o)

    def rug(x, y, sx, sy):
        o = box("Rug", (x, y, 0.006), (sx, sy, 0.012), M["rug"], C)
        uvd = o.data.uv_layers.active.data
        for li, lp in enumerate(o.data.loops):
            v = o.data.vertices[lp.vertex_index].co
            uvd[li].uv = (v.x + 0.5, v.y + 0.5)
        return o

    def plant(x, y, s=1.0):
        parts = [cyl("Pot", (x, y, 0.18 * s), 0.17 * s, 0.36 * s, M["pot"], C, r2=0.2 * s),
                 sphere("Leaves", (x, y, 0.62 * s), 0.3 * s, M["plant"], C, scale=(1, 1, 1.1), smooth=False),
                 sphere("Leaves", (x + 0.1 * s, y - 0.1 * s, 0.82 * s), 0.2 * s, M["plant"], C, smooth=False)]
        return F(join(parts, "Plant"))

    def tv(x, y, rot_z):
        parts = [box("TVStand", (0, 0, 0.25), (1.6, 0.42, 0.5), M["wood"], C, bevel=0.01),
                 box("TVBody", (0, 0.02, 0.95), (1.3, 0.06, 0.75), M["black"], C, bevel=0.01),
                 box("TVScreen", (0, -0.013, 0.95), (1.22, 0.005, 0.68), M["screen"], C),
                 box("TVFoot", (0, 0.02, 0.54), (0.3, 0.15, 0.08), M["black"], C)]
        o = join(parts, "TV")
        o.location = (x, y, 0)
        o.rotation_euler = (0, 0, rot_z)
        return F(o)

    def chair(x, y, rot_z):
        parts = [box("ChairSeat", (0, 0, 0.45), (0.44, 0.44, 0.05), M["wood"], C, bevel=0.01),
                 box("ChairBack", (0, 0.2, 0.75), (0.44, 0.04, 0.55), M["wood"], C, bevel=0.01),
                 box("ChairPad", (0, 0, 0.485), (0.4, 0.4, 0.03), M["accent"], C, bevel=0.01)]
        for dx in (-0.19, 0.19):
            for dy in (-0.19, 0.19):
                parts.append(box("ChairLeg", (dx, dy, 0.215), (0.04, 0.04, 0.43), M["wood"], C))
        o = join(parts, "Chair")
        o.location = (x, y, 0)
        o.rotation_euler = (0, 0, rot_z)
        return F(o)

    def dining(rect):
        x0, x1, y0, y1 = rect
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        F(join([box("DTTop", (cx, cy, 0.74), (1.2, 0.8, 0.05), M["wood"], C, bevel=0.01)] +
               [box("DTLeg", (cx + dx, cy + dy, 0.36), (0.06, 0.06, 0.72), M["wood"], C)
                for dx in (-0.52, 0.52) for dy in (-0.32, 0.32)], "DiningTable"))
        chair(cx - 0.3, cy + 0.65, 0)
        chair(cx + 0.3, cy + 0.65, 0)
        chair(cx - 0.3, cy - 0.65, math.pi)
        chair(cx + 0.3, cy - 0.65, math.pi)

    def kitchen_run(rect, along):
        """Counter along a wall. along='x' (back wall, front faces -Y) or 'y' (left wall, front faces +X)."""
        x0, x1, y0, y1 = rect
        parts = []
        if along == "x":
            L = x1 - x0 - 0.9
            cx, cy = x0 + L / 2, (y0 + y1) / 2
            parts += [box("CounterBody", (cx, cy, 0.44), (L, 0.6, 0.88), M["cab"], C),
                      box("CounterTop", (cx, cy - 0.01, 0.9), (L + 0.02, 0.63, 0.04), M["marble"], C),
                      box("CounterKick", (cx, cy - 0.28, 0.05), (L, 0.06, 0.1), M["black"], C),
                      box("Backsplash", (cx, y1 - 0.01, 1.2), (L, 0.02, 0.56), M["splash"], C),
                      box("Sink", (cx + L / 4, cy, 0.9), (0.6, 0.4, 0.02), M["metal"], C),
                      box("Cooktop", (cx - L / 4, cy, 0.925), (0.6, 0.45, 0.012), M["black"], C),
                      box("UpperCab", (cx - L / 4, y1 - 0.18, 1.95), (min(1.6, L / 2), 0.35, 0.7), M["cab"], C)]
            n = max(2, int(L / 0.6))
            for i in range(n):
                parts.append(box("Handle", (x0 + (i + 0.5) * L / n, cy - 0.31, 0.75), (0.15, 0.02, 0.02), M["metal"], C))
            fridge = box("Fridge", (x1 - 0.45, cy + 0.05, 1.0), (0.8, 0.7, 2.0), M["metal"], C, bevel=0.02)
        else:
            L = y1 - y0 - 0.9
            cx, cy = (x0 + x1) / 2, y0 + L / 2
            parts += [box("CounterBody", (cx, cy, 0.44), (0.6, L, 0.88), M["cab"], C),
                      box("CounterTop", (cx + 0.01, cy, 0.9), (0.63, L + 0.02, 0.04), M["marble"], C),
                      box("CounterKick", (cx + 0.28, cy, 0.05), (0.06, L, 0.1), M["black"], C),
                      box("Backsplash", (x0 + 0.01, cy, 1.2), (0.02, L, 0.56), M["splash"], C),
                      box("Sink", (cx, cy - L / 4, 0.9), (0.4, 0.6, 0.02), M["metal"], C),
                      box("Cooktop", (cx, cy + L / 4, 0.925), (0.45, 0.6, 0.012), M["black"], C),
                      box("UpperCab", (x0 + 0.18, cy, 1.95), (0.35, min(1.6, L / 2), 0.7), M["cab"], C)]
            n = max(2, int(L / 0.6))
            for i in range(n):
                parts.append(box("Handle", (cx + 0.31, y0 + (i + 0.5) * L / n, 0.75), (0.02, 0.15, 0.02), M["metal"], C))
            fridge = box("Fridge", (cx + 0.05, y1 - 0.45, 1.0), (0.7, 0.8, 2.0), M["metal"], C, bevel=0.02)
        F(join(parts, "Kitchen"))
        F(fridge)

    def bedroom(rect, head_wall):
        x0, x1, y0, y1 = rect
        if head_wall == "W":       # head against the west wall
            cy = (y0 + y1) / 2
            bed = [box("BedFrame", (x0 + 1.05, cy, 0.2), (2.1, 1.65, 0.3), M["wood"], C, bevel=0.02),
                   box("Headboard", (x0 + 0.04, cy, 0.6), (0.08, 1.75, 1.15), M["wood"], C, bevel=0.02),
                   box("Mattress", (x0 + 1.07, cy, 0.44), (2.02, 1.56, 0.2), M["linen"], C, bevel=0.05),
                   box("Duvet", (x0 + 1.35, cy, 0.56), (1.45, 1.62, 0.08), M["accent"], C, bevel=0.04),
                   box("Pillow", (x0 + 0.3, cy - 0.4, 0.62), (0.35, 0.62, 0.15), M["linen"], C, bevel=0.06),
                   box("Pillow", (x0 + 0.3, cy + 0.4, 0.62), (0.35, 0.62, 0.15), M["linen"], C, bevel=0.06)]
            F(join(bed, "Bed"))
            for sy in (-1, 1):
                F(join([box("Nightstand", (x0 + 0.26, cy + sy * 1.15, 0.27), (0.42, 0.42, 0.54), M["wood"], C, bevel=0.01),
                        cyl("BedLamp", (x0 + 0.26, cy + sy * 1.15, 0.7), 0.12, 0.22, M["lamp"], C, seg=14, r2=0.08)], "Nightstand"))
        else:                       # head against the back (north) wall
            cx = (x0 + x1) / 2
            bed = [box("BedFrame", (cx, y1 - 1.05, 0.2), (1.65, 2.1, 0.3), M["wood"], C, bevel=0.02),
                   box("Headboard", (cx, y1 - 0.04, 0.6), (1.75, 0.08, 1.15), M["wood"], C, bevel=0.02),
                   box("Mattress", (cx, y1 - 1.07, 0.44), (1.56, 2.02, 0.2), M["linen"], C, bevel=0.05),
                   box("Duvet", (cx, y1 - 1.35, 0.56), (1.62, 1.45, 0.08), M["accent"], C, bevel=0.04),
                   box("Pillow", (cx - 0.4, y1 - 0.3, 0.62), (0.62, 0.35, 0.15), M["linen"], C, bevel=0.06),
                   box("Pillow", (cx + 0.4, y1 - 0.3, 0.62), (0.62, 0.35, 0.15), M["linen"], C, bevel=0.06)]
            F(join(bed, "Bed"))
            for sx in (-1, 1):
                F(join([box("Nightstand", (cx + sx * 1.15, y1 - 0.26, 0.27), (0.42, 0.42, 0.54), M["wood"], C, bevel=0.01),
                        cyl("BedLamp", (cx + sx * 1.15, y1 - 0.26, 0.7), 0.12, 0.22, M["lamp"], C, seg=14, r2=0.08)], "Nightstand"))
        return bed

    def wardrobe(x, y, along):
        size = (1.6, 0.6, 2.0) if along == "x" else (0.6, 1.6, 2.0)
        F(join([box("Wardrobe", (x, y, 1.0), size, M["trim"], C, bevel=0.01),
                box("WardrobeSeam", (x, y - 0.305, 1.0) if along == "x" else (x + 0.305, y, 1.0),
                    (0.01, 0.01, 1.9), M["black"], C)], "Wardrobe"))

    def bathroom(rect, mirror=False):
        """Tub on the back wall; toilet + vanity on the east wall, or the west wall when mirror=True
        (used when the bathroom door is on the east side)."""
        x0, x1, y0, y1 = rect
        wx, s = (x0, 1) if mirror else (x1, -1)      # fixture wall x and the direction into the room
        F(join([box("Tub", (x0 + 0.9, y1 - 0.4, 0.28), (1.7, 0.75, 0.56), M["porcelain"], C, bevel=0.04),
                box("TubWater", (x0 + 0.9, y1 - 0.4, 0.5), (1.5, 0.55, 0.02), M["glass"], C)], "Bathtub"))
        F(join([box("ToiletTank", (wx + s * 0.35, y1 - 1.6, 0.6), (0.18, 0.42, 0.4), M["porcelain"], C, bevel=0.03),
                cyl("ToiletBowl", (wx + s * 0.6, y1 - 1.6, 0.22), 0.2, 0.42, M["porcelain"], C, seg=14, r2=0.17)], "Toilet"))
        F(join([box("Vanity", (wx + s * 0.28, y0 + 0.75, 0.42), (0.5, 0.9, 0.84), M["wood"], C, bevel=0.01),
                box("VanityTop", (wx + s * 0.29, y0 + 0.75, 0.86), (0.54, 0.94, 0.04), M["marble"], C),
                box("Mirror", (wx + s * 0.015, y0 + 0.75, 1.6), (0.02, 0.7, 0.8), M["metal"], C)], "Vanity"))

    def living(rect, facing):
        x0, x1, y0, y1 = rect
        cy = (y0 + y1) / 2
        sofa(x1 - 0.5, cy, -math.pi / 2)             # back against the east wall, facing west
        coffee_table(x1 - 1.55, cy, math.pi / 2)
        rug(x1 - 1.6, cy, 1.9, 2.6)
        tv(x0 + 0.25 if facing else x1 - 2.9, cy, math.pi / 2)   # screen faces the sofa (+X)
        plant(x1 - 0.35, y0 + 0.4)

    if lay == "A":
        kitchen_run(rooms["kitchen"], "x")
        bedroom(rooms["bed"], "W")
        dining(rooms["dining"])
        bathroom(rooms["bath"])
        x0, x1, y0, y1 = rooms["living"]
        cy = (y0 + y1) / 2 + 0.3
        sofa(x1 - 0.5, cy, -math.pi / 2)
        coffee_table(x1 - 1.55, cy, math.pi / 2)
        rug(x1 - 1.6, cy, 1.9, 2.4)
        plant(XL + 0.4, Y0 + 0.45)
    elif lay == "B":
        kitchen_run(rooms["kitchen"], "y")
        bedroom(rooms["bed"], "N")
        wardrobe(rooms["bed"][0] + 0.32, rooms["bed"][2] + 1.7, "y")
        bathroom(rooms["bath"])
        living(rooms["living"], facing=True)
        dining(rooms["dining"])
    else:
        kitchen_run(rooms["kitchen"], "x")
        bedroom(rooms["bed"], "W")
        wardrobe(rooms["bed"][0] + 1.0, rooms["bed"][3] - 0.36, "x")
        bathroom(rooms["bath"], mirror=True)
        living(rooms["living"], facing=False)
        dining(rooms["dining"])
        plant(XR - 0.4, YB - 1.2)

    # ceiling lights per room
    for rname in ("living", "bed", "bath", "kitchen", "dining"):
        x0, x1, y0, y1 = rooms[rname]
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        join([cyl("LightRim", (cx, cy, H_IN - 0.02), 0.3, 0.04, M["trim"], C, seg=20),
              cyl("LightPanel", (cx, cy, H_IN - 0.045), 0.27, 0.01, M["panel"], C, seg=20)], f"Light_{rname}")

    for o in furniture:
        col_from_object(o, CC)
    for o in C.objects:
        if o.type == 'MESH' and not o.name.startswith(("Bed", "Sofa")):
            for poly in o.data.polygons:
                poly.use_smooth = poly.use_smooth and False
    return C




def drop_interior(key):
    """Remove an interior from the .blend once exported: all interiors share object names
    (Door_Entrance, House_Floor_*...), so keeping them around would make Blender suffix the next
    one's names (.001, .002...) and the game looks these names up."""
    for cname in (f"INT_{key}_COL", f"INT_{key}"):
        c = bpy.data.collections.get(cname)
        if not c:
            continue
        for o in list(c.objects):
            bpy.data.objects.remove(o)
        bpy.data.collections.remove(c)
    bpy.data.orphans_purge(do_local_ids=True, do_recursive=True)


for h in HOUSES:                      # stale interiors from a previous run
    drop_interior(h["key"])

built = []
for h in HOUSES:
    build_exterior(h)
    build_interior(h)
    k = h["key"]
    out = os.path.join(ROOT, "out", "houses", k)
    e = export_collection(f"EXT_{k}", os.path.join(out, "exterior.glb"))
    i = export_collection(f"INT_{k}", os.path.join(out, "interior.glb"))
    c = export_collection(f"INT_{k}_COL", os.path.join(out, "interior.colsrc.glb"))
    drop_interior(k)
    render_preview(f"EXT_{k}", os.path.join(PUBLIC, "houses", k, "preview.png"), size=512, yaw_deg=32, pitch_deg=20, fill=0.95)
    built.append((k, e, i, c))
result = {"houses": built}
