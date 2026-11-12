"""Built-in fittings for walk-in house interiors: fireplace, kitchen island and hood, bath fixtures (shower, WC, vanity,
tub), built-ins (bookshelves, wardrobe, closet rail), ceiling treatments (coffers, beams, tray), balustrade, chandelier.

Every builder is parameterised (size, materials) and takes `B`, the Mirror wrapper of build_house_v2.py (box / cyl /
cone / col / coll), so the next house reuses them instead of copying geometry (CLAUDE.md modular rule).
Game coordinates (x, z), y = floor height of the level. A wall anchor is `((x, z), facing)`: a point on the room-side
face of a wall and the direction pointing into the room ("+x", "-x", "+z", "-z"); `along` runs on the wall, `depth`
into the room, `off` is the gap between the wall face and the piece, `shift` moves it along the wall.
Materials come from the caller's dict M (keys used: trim, dark, steel, ceramic, glass, mirror, lamp, cabinet, stone,
soot, art, beam, plaster, books, shelf, fabric, closet, island_top, vanity_top, water, fixture, candle, rail, iron).
"""
import math

import lib_common as L

FACING = {"+x": (1.0, 0.0), "-x": (-1.0, 0.0), "+z": (0.0, 1.0), "-z": (0.0, -1.0)}
COUNTER_H = 0.86


def flip(facing, m):
    """The facing seen in a plan mirrored across x = 0 (m = -1)."""
    return {"+x": "-x", "-x": "+x"}.get(facing, facing) if m < 0 else facing


def _frame(wall, along, depth, off, shift):
    (x, z), f = wall
    nx, nz = FACING[f]
    tx, tz = -nz, nx
    cx = x + nx * (off + depth / 2) + tx * shift
    cz = z + nz * (off + depth / 2) + tz * shift
    sx, sz = (depth, along) if nx else (along, depth)
    return cx, cz, sx, sz


def wbox(B, name, wall, y0, along, depth, h, mat, off=0.0, shift=0.0, **kw):
    cx, cz, sx, sz = _frame(wall, along, depth, off, shift)
    return B.box(name, cx, cz, y0, sx, sz, h, mat, **kw)


def wcol(B, name, wall, y0, along, depth, h, off=0.0, shift=0.0):
    cx, cz, sx, sz = _frame(wall, along, depth, off, shift)
    return B.col(name, cx, cz, y0, sx, sz, h)


def fireplace(B, name, wall, y, ceil_h, M, style="mantel"):
    """'mantel': painted surround, black firebox, stone hearth, mantel shelf, raised overmantel with a painting.
    'hood': stone jambs, timber lintel and a tapered plaster hood up to the ceiling (Tuscan)."""
    if style == "mantel":
        out = [wbox(B, f"{name}_Hearth", wall, y, 1.9, 0.5, 0.03, M["stone"]),
               wbox(B, f"{name}_Firebox", wall, y + 0.03, 0.9, 0.16, 0.8, M["soot"]),
               wbox(B, f"{name}_LegA", wall, y, 0.38, 0.2, 1.15, M["trim"], shift=-0.64),
               wbox(B, f"{name}_LegB", wall, y, 0.38, 0.2, 1.15, M["trim"], shift=0.64),
               wbox(B, f"{name}_Header", wall, y + 0.83, 0.9, 0.2, 0.32, M["trim"]),
               wbox(B, f"{name}_Mantel", wall, y + 1.15, 1.95, 0.3, 0.07, M["trim"]),
               wbox(B, f"{name}_Overmantel", wall, y + 1.4, 1.3, 0.05, 1.0, M["trim"]),
               wbox(B, f"{name}_Art", wall, y + 1.52, 1.0, 0.02, 0.76, M["art"], off=0.05)]
        wcol(B, name, wall, y, 1.95, 0.5, 1.25)
        return out
    if style == "stone":
        out = [wbox(B, f"{name}_Hearth", wall, y, 1.96, 0.5, 0.05, M["stone"]),
               wbox(B, f"{name}_Firebox", wall, y + 0.05, 0.86, 0.22, 0.78, M["soot"]),
               wbox(B, f"{name}_JambA", wall, y + 0.05, 0.42, 0.3, 0.78, M["stone"], shift=-0.64),
               wbox(B, f"{name}_JambB", wall, y + 0.05, 0.42, 0.3, 0.78, M["stone"], shift=0.64),
               wbox(B, f"{name}_Lintel", wall, y + 0.83, 1.7, 0.3, 0.34, M["stone"]),
               wbox(B, f"{name}_Mantel", wall, y + 1.17, 1.9, 0.34, 0.12, M["beam"]),
               wbox(B, f"{name}_Breast", wall, y + 1.29, 1.5, 0.22, ceil_h - 1.29, M["stone"])]
        wcol(B, name, wall, y, 1.96, 0.5, 1.3)
        return out
    if style == "linear":
        out = [wbox(B, f"{name}_Breast", wall, y, 2.6, 0.30, ceil_h - y, M["stone"]),
               wbox(B, f"{name}_Bench", wall, y, 3.0, 0.50, 0.38, M["stone"]),
               wbox(B, f"{name}_Firebox", wall, y + 0.62, 1.6, 0.02, 0.42, M["soot"], off=0.30),
               wbox(B, f"{name}_Glow", wall, y + 0.66, 1.4, 0.01, 0.06, M["candle"], off=0.32)]
        wcol(B, name, wall, y, 3.0, 0.5, 0.45)
        wcol(B, f"{name}Breast", wall, y, 2.6, 0.30, 2.0)
        return out
    out = [wbox(B, f"{name}_Hearth", wall, y, 2.1, 0.62, 0.16, M["stone"]),
           wbox(B, f"{name}_Firebox", wall, y + 0.16, 0.9, 0.42, 0.86, M["soot"]),
           wbox(B, f"{name}_JambA", wall, y + 0.16, 0.34, 0.5, 0.86, M["stone"], shift=-0.62),
           wbox(B, f"{name}_JambB", wall, y + 0.16, 0.34, 0.5, 0.86, M["stone"], shift=0.62),
           wbox(B, f"{name}_Lintel", wall, y + 1.02, 1.6, 0.56, 0.22, M["beam"]),
           wbox(B, f"{name}_Hood", wall, y + 1.24, 1.5, 0.48, 0.5, M["plaster"]),
           wbox(B, f"{name}_Flue", wall, y + 1.74, 1.0, 0.36, ceil_h - 1.74, M["plaster"])]
    wcol(B, name, wall, y, 2.1, 0.62, 1.3)
    return out


def inglenook(B, name, wall, y, M, width=2.9, depth=1.3, header_y=2.25):
    out = []
    for tag, sgn in (("A", -1), ("B", 1)):
        settle = sgn * (width / 2 - 0.225)
        out += [wbox(B, f"{name}_Base{tag}", wall, y, 0.45, depth, 0.40, M["beam"], shift=settle),
                wbox(B, f"{name}_Seat{tag}", wall, y + 0.40, 0.47, depth + 0.02, 0.05, M["beam"], shift=settle),
                wbox(B, f"{name}_Back{tag}", wall, y, 0.06, depth, 1.40, M["beam"], shift=sgn * (width / 2 - 0.03)),
                wbox(B, f"{name}_Post{tag}", wall, y, 0.1, 0.1, header_y, M["beam"], off=depth - 0.1, shift=sgn * (width / 2 - 0.05))]
        wcol(B, f"{name}{tag}", wall, y, 0.45, depth, 1.4, shift=settle)
    out.append(wbox(B, f"{name}_Header", wall, y + header_y, width, 0.2, 0.22, M["beam"], off=depth - 0.2))
    return out


def mudroom_bench(B, name, wall, y, along, M, depth=0.45):
    out = [wbox(B, f"{name}_Base", wall, y, along, depth, 0.40, M["closet"]),
           wbox(B, f"{name}_Seat", wall, y + 0.40, along + 0.04, depth + 0.03, 0.05, M["beam"]),
           wbox(B, f"{name}_Back", wall, y + 0.45, along, 0.02, 1.35, M["closet"]),
           wbox(B, f"{name}_HookRail", wall, y + 1.55, along, 0.03, 0.12, M["beam"], off=0.02),
           wbox(B, f"{name}_Shelf", wall, y + 1.80, along + 0.04, 0.30, 0.03, M["closet"])]
    hooks = int(along / 0.4)
    for k in range(hooks):
        out.append(wbox(B, f"{name}_Hook{k}", wall, y + 1.57, 0.03, 0.08, 0.03, M["fixture"], off=0.05,
                        shift=-along / 2 + along * (k + 0.5) / hooks))
    wcol(B, name, wall, y, along + 0.04, depth + 0.03, 0.5)
    return out


def island(B, name, x, z, y, length, depth, M, pendants=2, ceil_y=None, light_prefix="Light_L0_"):
    """Kitchen island along x: plinth, cabinet body with doors on the -z (cooking) side, top overhanging the +z side for
    stools, and pendant lamps (`<light_prefix>Pendant<k>` nodes, baked as lamps) hanging from ceil_y."""
    out = [B.box(f"{name}_Plinth", x, z, y, length - 0.1, depth - 0.1, 0.1, M["dark"]),
           B.box(f"{name}_Body", x, z, y + 0.1, length, depth, COUNTER_H - 0.1, M["cabinet"]),
           B.box(f"{name}_Top", x, z + 0.14, y + COUNTER_H, length + 0.08, depth + 0.36, 0.05, M["island_top"])]
    n = 3
    for k in range(n):
        px = x - length / 2 + length * (k + 0.5) / n
        out.append(B.box(f"{name}_Door{k}", px, z - depth / 2 - 0.01, y + 0.14, length / n - 0.04, 0.02, COUNTER_H - 0.24, M["cabinet"], bevel=0.006))
        out.append(B.box(f"{name}_Pull{k}", px, z - depth / 2 - 0.03, y + COUNTER_H - 0.18, 0.22, 0.02, 0.02, M["steel"]))
    B.col(name, x, z, y, length, depth, COUNTER_H + 0.05)
    if ceil_y is not None:
        for k in range(pendants):
            px = x - length / 2 + length * (k + 0.5) / pendants
            out.append(B.box(f"Fit_{name.replace('Fit_', '')}Wire{k}", px, z, ceil_y - 0.75, 0.012, 0.012, 0.75, M["dark"]))
            out.append(B.cone(f"{light_prefix}Pendant{k}", px, z, ceil_y - 0.97, 0.2, 0.06, 0.22, M["lamp"], seg=10))
    return out


def range_hood(B, name, wall, y, ceil_h, M, style="steel"):
    """Hood over the cooktop: stainless canopy and flue, or a plaster hood on a timber band (Tuscan)."""
    if style == "steel":
        return [wbox(B, f"{name}_Canopy", wall, y + 1.62, 0.9, 0.5, 0.28, M["steel"]),
                wbox(B, f"{name}_Flue", wall, y + 1.9, 0.32, 0.26, ceil_h - 1.9, M["steel"])]
    return [wbox(B, f"{name}_Band", wall, y + 1.55, 1.2, 0.62, 0.16, M["beam"]),
            wbox(B, f"{name}_Hood", wall, y + 1.71, 1.05, 0.52, ceil_h - 1.71, M["plaster"])]


def wardrobe(B, name, wall, y, along, M, h=2.3, depth=0.6, doors=2):
    """Built-in wardrobe: carcass, flat doors and pulls."""
    out = [wbox(B, f"{name}_Body", wall, y, along, depth - 0.02, h, M["closet"])]
    w = along / doors
    for k in range(doors):
        sh = -along / 2 + w * (k + 0.5)
        out.append(wbox(B, f"{name}_Door{k}", wall, y + 0.06, w - 0.03, 0.02, h - 0.1, M["closet"], off=depth - 0.02, shift=sh, bevel=0.006))
        edge = (w / 2 - 0.08) * (1 if k % 2 == 0 else -1)
        out.append(wbox(B, f"{name}_Pull{k}", wall, y + 0.95, 0.025, 0.025, 0.3, M["steel"], off=depth, shift=sh + edge))
    wcol(B, name, wall, y, along, depth, h)
    return out


def bookshelves(B, name, wall, y, along, M, h=2.4, depth=0.36, rows=5):
    """Floor-to-cornice built-in library: back, plinth, sides, bay dividers, shelves and one block of books per row."""
    out = [wbox(B, f"{name}_Back", wall, y, along, 0.02, h, M["shelf"]),
           wbox(B, f"{name}_Plinth", wall, y, along, depth, 0.1, M["shelf"]),
           wbox(B, f"{name}_Top", wall, y + h - 0.06, along + 0.06, depth + 0.03, 0.06, M["shelf"])]
    for k, sgn in enumerate((-1, 1)):
        out.append(wbox(B, f"{name}_Side{k}", wall, y + 0.1, 0.04, depth, h - 0.16, M["shelf"], shift=sgn * (along / 2 - 0.02)))
    bays = max(1, round(along / 0.9))
    for k in range(1, bays):
        out.append(wbox(B, f"{name}_Div{k}", wall, y + 0.1, 0.03, depth - 0.02, h - 0.16, M["shelf"], off=0.02, shift=-along / 2 + along * k / bays))
    step = (h - 0.16) / rows
    for r in range(rows):
        yy = y + 0.1 + r * step
        if r:
            out.append(wbox(B, f"{name}_Shelf{r}", wall, yy - 0.02, along - 0.08, depth - 0.02, 0.02, M["shelf"], off=0.02))
        out.append(wbox(B, f"{name}_Books{r}", wall, yy, along - 0.12, depth - 0.12, step * 0.72, M["books"], off=0.04, tile=0.5))
    wcol(B, name, wall, y, along, depth, h)
    return out


def closet_rail(B, name, wall, y, along, M, shift=0.0):
    """Walk-in closet run: shoe shelf, hanging clothes on a rod, two shelves above."""
    out = [wbox(B, f"{name}_Shoes", wall, y, along, 0.36, 0.25, M["shelf"], shift=shift),
           wbox(B, f"{name}_Clothes", wall, y + 0.75, along - 0.12, 0.4, 0.9, M["fabric"], off=0.03, shift=shift, tile=0.5),
           wbox(B, f"{name}_Rod", wall, y + 1.68, along - 0.04, 0.025, 0.025, M["steel"], off=0.28, shift=shift),
           wbox(B, f"{name}_Shelf", wall, y + 1.75, along, 0.42, 0.025, M["shelf"], shift=shift),
           wbox(B, f"{name}_TopShelf", wall, y + 2.15, along, 0.42, 0.025, M["shelf"], shift=shift)]
    wcol(B, name, wall, y, along, 0.45, 2.2, shift=shift)
    return out


def shower(B, name, corner, sx, sz, y, M, size=0.95):
    """Shower tray in a room corner: `corner` = the inner corner (x, z), sx / sz = +-1 pointing into the room. Glass
    front and a part side panel (Glass_* nodes stay out of the bake), riser and head on the x wall."""
    x, z = corner
    s = size
    cx, cz = x + sx * s / 2, z + sz * s / 2
    out = [B.box(f"{name}_Tray", cx, cz, y, s, s, 0.08, M["ceramic"], bevel=0.01),
           B.box(f"{name}_Drain", cx, cz, y + 0.08, 0.1, 0.1, 0.005, M["steel"]),
           B.box(f"Glass_{name}Front", cx, z + sz * s, y + 0.08, s, 0.02, 1.9, M["glass"]),
           B.box(f"Glass_{name}Side", x + sx * s, z + sz * s * 0.3, y + 0.08, 0.02, s * 0.6, 1.9, M["glass"]),
           B.box(f"{name}_Pipe", x + sx * 0.04, cz, y + 0.9, 0.03, 0.03, 1.2, M["steel"]),
           B.box(f"{name}_Head", x + sx * 0.14, cz, y + 2.05, 0.2, 0.2, 0.03, M["steel"])]
    B.col(name, cx, cz, y, s, s, 2.0)
    return out


def wc(B, name, wall, y, M):
    out = [wbox(B, f"{name}_Bowl", wall, y, 0.36, 0.5, 0.38, M["ceramic"], off=0.2, bevel=0.03),
           wbox(B, f"{name}_Seat", wall, y + 0.38, 0.4, 0.46, 0.04, M["ceramic"], off=0.22, bevel=0.02),
           wbox(B, f"{name}_Tank", wall, y + 0.3, 0.42, 0.18, 0.5, M["ceramic"], off=0.02, bevel=0.02)]
    wcol(B, name, wall, y, 0.44, 0.72, 0.8)
    return out


def vanity(B, name, wall, y, along, M, basins=1, depth=0.48):
    """Vanity cabinet with a stone top, vessel basin(s), taps and a framed mirror above each basin."""
    out = [wbox(B, f"{name}_Plinth", wall, y, along - 0.04, depth - 0.06, 0.1, M["dark"]),
           wbox(B, f"{name}_Body", wall, y + 0.1, along, depth - 0.02, 0.68, M["cabinet"], bevel=0.01),
           wbox(B, f"{name}_Top", wall, y + 0.78, along + 0.04, depth, 0.05, M["vanity_top"], bevel=0.01)]
    for k in range(basins):
        sh = -along / 2 + along * (k + 0.5) / basins
        out += [wbox(B, f"{name}_Basin{k}", wall, y + 0.83, 0.44, 0.34, 0.03, M["ceramic"], off=0.08, shift=sh),
                wbox(B, f"{name}_Tap{k}", wall, y + 0.83, 0.05, 0.05, 0.22, M["steel"], off=0.04, shift=sh),
                wbox(B, f"{name}_MirrorFrame{k}", wall, y + 1.17, 0.68, 0.012, 0.86, M["trim"], off=0.013, shift=sh),
                wbox(B, f"{name}_Mirror{k}", wall, y + 1.2, 0.6, 0.012, 0.8, M["mirror"], off=0.025, shift=sh)]
    wcol(B, name, wall, y, along + 0.04, depth, 0.85)
    return out


def tub(B, name, x, z, y, length, width, axis, M):
    """Freestanding tub on four feet: bottom, four rim walls, water surface and a floor-standing filler at one end."""
    lx, lz = (length, width) if axis == "x" else (width, length)
    t, hb = 0.08, 0.06
    out = [B.box(f"{name}_Bottom", x, z, y + hb, lx, lz, 0.1, M["ceramic"], bevel=0.02)]
    for k, (dx, dz, sx, sz) in enumerate(((0, lz / 2 - t / 2, lx, t), (0, -lz / 2 + t / 2, lx, t),
                                          (lx / 2 - t / 2, 0, t, lz - 2 * t), (-lx / 2 + t / 2, 0, t, lz - 2 * t))):
        out.append(B.box(f"{name}_Rim{k}", x + dx, z + dz, y + hb + 0.1, sx, sz, 0.46, M["ceramic"], bevel=0.015))
    out.append(B.box(f"{name}_Water", x, z, y + hb + 0.1, lx - 2 * t, lz - 2 * t, 0.3, M["water"]))
    for k, (sx, sz) in enumerate(((1, 1), (1, -1), (-1, 1), (-1, -1))):
        out.append(B.box(f"{name}_Foot{k}", x + sx * (lx / 2 - 0.12), z + sz * (lz / 2 - 0.12), y, 0.08, 0.08, hb, M["fixture"]))
    ex, ez = (x + lx / 2 + 0.12, z) if axis == "x" else (x, z + lz / 2 + 0.12)
    out.append(B.box(f"{name}_Filler", ex, ez, y, 0.05, 0.05, 0.95, M["steel"]))
    B.col(name, x, z, y, lx, lz, 0.62)
    return out


def coffers(B, name, x0, x1, z0, z1, y_ceil, M, nx, nz, w=0.14, d=0.16):
    """Coffered ceiling: a grid of painted beams under the ceiling (the x beams 1 cm shallower so no faces coincide)."""
    out = []
    for i in range(nx + 1):
        out.append(B.box(f"{name}_Z{i}", x0 + (x1 - x0) * i / nx, (z0 + z1) / 2, y_ceil - d, w, z1 - z0 + w, d, M["trim"]))
    for j in range(nz + 1):
        out.append(B.box(f"{name}_X{j}", (x0 + x1) / 2, z0 + (z1 - z0) * j / nz, y_ceil - d + 0.01, x1 - x0 + w, w, d - 0.01, M["trim"]))
    return out


def beams(B, name, x0, x1, z0, z1, y_ceil, M, axis="z", spacing=1.2, w=0.18, d=0.22):
    """Exposed timber beams wall to wall, running along `axis`."""
    span = (x1 - x0) if axis == "z" else (z1 - z0)
    n = max(1, round(span / spacing))
    out = []
    for i in range(n):
        t = (i + 0.5) / n
        if axis == "z":
            out.append(B.box(f"{name}{i}", x0 + (x1 - x0) * t, (z0 + z1) / 2, y_ceil - d, w, z1 - z0, d, M["beam"]))
        else:
            out.append(B.box(f"{name}{i}", (x0 + x1) / 2, z0 + (z1 - z0) * t, y_ceil - d, x1 - x0, w, d, M["beam"]))
    return out


def tray(B, name, x0, x1, z0, z1, y_ceil, M, band=0.5, drop=0.16):
    """Tray ceiling: a dropped band around the room, the centre left at full height."""
    return [B.box(f"{name}_S", (x0 + x1) / 2, z0 + band / 2, y_ceil - drop, x1 - x0, band, drop, M["trim"]),
            B.box(f"{name}_N", (x0 + x1) / 2, z1 - band / 2, y_ceil - drop, x1 - x0, band, drop, M["trim"]),
            B.box(f"{name}_W", x0 + band / 2, (z0 + z1) / 2, y_ceil - drop, band, z1 - z0 - 2 * band, drop, M["trim"]),
            B.box(f"{name}_E", x1 - band / 2, (z0 + z1) / 2, y_ceil - drop, band, z1 - z0 - 2 * band, drop, M["trim"])]


def chandelier(B, name, light, x, z, y_top, drop, M, style="brass", arms=6, r=0.42):
    """Candle chandelier hanging `drop` below y_top: rod, body, straight arms with cups and candles; 'iron' adds a
    ring and chains. `light` names the small glowing bulb under the body, the node the lightmap bake turns into a lamp."""
    met = M["fixture"]
    yb = y_top - drop
    out = [B.box(f"{name}_Rod", x, z, yb + 0.22, 0.025, 0.025, drop - 0.22, met),
           B.cyl(f"{name}_Body", x, z, yb, 0.1, 0.22, met, seg=8),
           B.cyl(light, x, z, yb - 0.1, 0.06, 0.1, M["lamp"], seg=8)]
    ends = []
    for k in range(arms):
        a = 2 * math.pi * k / arms
        ex, ez = x + r * math.cos(a), z + r * math.sin(a)
        ends.append((ex, ez))
        out.append(L.beam(B.coll, f"{name}_Arm{k}", (B.x(x), z, yb + 0.1), (B.x(ex), ez, yb + 0.1), 0.025, 0.025, met))
        out.append(B.cyl(f"{name}_Cup{k}", ex, ez, yb + 0.1, 0.045, 0.03, met, seg=6))
        out.append(B.cyl(f"{name}_Candle{k}", ex, ez, yb + 0.13, 0.018, 0.1, M["candle"], seg=6))
    if style == "iron":
        for k in range(arms):
            (ax, az), (bx, bz) = ends[k], ends[(k + 1) % arms]
            out.append(L.beam(B.coll, f"{name}_Ring{k}", (B.x(ax), az, yb + 0.08), (B.x(bx), bz, yb + 0.08), 0.03, 0.03, met))
        for k in range(0, arms, 2):
            ax, az = ends[k]
            out.append(L.beam(B.coll, f"{name}_Chain{k}", (B.x(ax), az, yb + 0.1), (B.x(x), z, yb + 0.75), 0.012, 0.012, met))
    return out


def balustrade(B, name, axis, fixed, a0, a1, y, M, style="spindle", h=1.0, step=0.2):
    """Gallery guard along a floor edge (axis 'x': runs along x at z = fixed): white spindles under a timber handrail,
    or a wrought-iron railing. Adds the blocking collision."""
    ln = a1 - a0

    def at(a):
        return (a, fixed) if axis == "x" else (fixed, a)

    if style == "iron":
        out = L.railing(B.coll, name, [tuple(at(a0)), tuple(at(a1))], y, h, 0.14, M["iron"], post=0.05, bar=0.018)
    elif style == "glass":
        out = L.railing(B.coll, name, [tuple(at(a0)), tuple(at(a1))], y, h, step, M["dark"], post=0.05, bar=0.018, glass=M["glass"])
        for o in out:
            if o.name.startswith(f"{name}_Glass"):
                o.name = f"Glass_{o.name}"
    else:
        def bx(nm, a, y0, along, thick, hh, mat):
            px, pz = at(a)
            sx, sz = (along, thick) if axis == "x" else (thick, along)
            return B.box(f"{name}_{nm}", px, pz, y0, sx, sz, hh, mat)

        out = [bx("Rail", (a0 + a1) / 2, y + h - 0.06, ln, 0.07, 0.06, M["rail"]),
               bx("Shoe", (a0 + a1) / 2, y, ln - 0.1, 0.06, 0.05, M["trim"]),
               bx("NewelA", a0 + 0.05, y, 0.1, 0.1, h + 0.08, M["trim"]),
               bx("NewelB", a1 - 0.05, y, 0.1, 0.1, h + 0.08, M["trim"])]
        n = max(2, int(ln / step))
        for k in range(1, n):
            out.append(bx(f"Bal{k:02d}", a0 + ln * k / n, y + 0.05, 0.035, 0.035, h - 0.11, M["trim"]))
    cx, cz = at((a0 + a1) / 2)
    B.col(name, cx, cz, y, ln if axis == "x" else 0.08, 0.08 if axis == "x" else ln, 1.05)
    return out
