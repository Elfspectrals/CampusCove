"""Extérieurs du Cove Parkview Mall : puits de lumière vitrés sur les vides du toit, socle, bandeau, corniche et pilastres des quatre façades.

`build(ctx, M)` s'appelle après le décor sur le `mall_lib.Ctx` de build_mall.py. Les pièces des façades Nord et Sud courent sur toute la
longueur (débords aux angles), celles de l'Ouest et de l'Est s'arrêtent aux angles : aucune pièce ne recouvre une autre.
"""
PLINTH_H, PLINTH_OUT = 0.9, 0.25
BAND_Y, BAND_H, BAND_OUT = 9.4, 0.7, 0.06
CORNICE_H, CORNICE_OUT = 0.5, 0.45
PILASTER_W, PILASTER_OUT, PILASTER_STEP = 0.8, 0.4, 12.0
SKY_GLASS_H = 0.08
SKY_GLASS_RISE = 0.1


def _spans(lo, hi, cuts):
    spans = [(lo, hi)]
    for c0, c1 in cuts:
        spans = [piece for a, b in spans for piece in ((a, min(b, c0)), (max(a, c1), b)) if piece[1] - piece[0] > 0.05]
    return spans


def _skylights(ctx, M):
    bal_e_out, bal_e_in = M.E_OUT - M.BAL, M.E_IN + M.BAL
    bal_p_out, bal_p_in = M.N_OUT + M.BAL, M.N_IN - M.BAL
    bal_w_out, bal_w_in = M.W_OUT + M.BAL, M.W_IN - M.BAL
    voids = (
        ("Paradise", M.P_UP[0], bal_p_out, M.P_UP[1], bal_p_in),
        ("East", bal_e_in, M.PARK[2], bal_e_out, M.PARK[3]),
        ("CourtNE", M.PARK[1], M.N_OUT, bal_e_out, M.N_IN),
        ("CourtSE", M.PARK[1], M.S_IN, bal_e_out, M.S_OUT),
        ("West", bal_w_out, M.PARK[2], bal_w_in, M.PARK[3]),
    )
    for name, x0, z0, x1, z1 in voids:
        ctx.rect(f"Roof_Sky_{name}", x0, z0, x1, z1, M.ROOF2 + SKY_GLASS_RISE, SKY_GLASS_H, ctx.P["glass"])


def _facade_run(ctx, M, side, a0, a1, cuts):
    P = ctx.P
    ax = "x" if side in ("N", "S") else "z"
    sign = -1.0 if side in ("N", "W") else 1.0
    face = {"N": M.Z0, "S": M.Z1, "W": M.X0, "E": M.X1}[side]

    def piece(name, index, p0, p1, out, y0, h, mat):
        lo, hi = sorted((face, face + sign * out))
        if ax == "x":
            ctx.rect(f"Outer_{name}_{side}{index}", p0, lo, p1, hi, y0, h, mat)
        else:
            ctx.rect(f"Outer_{name}_{side}{index}", lo, p0, hi, p1, y0, h, mat)

    for run, (p0, p1) in enumerate(_spans(a0, a1, cuts)):
        piece("Plinth", run, p0, p1, PLINTH_OUT, 0.0, PLINTH_H, P["stone"])
        piece("Band", run, p0, p1, BAND_OUT, BAND_Y, BAND_H, P["band"])
        piece("Cornice", run, p0, p1, CORNICE_OUT, M.ROOF2 - CORNICE_H, CORNICE_H, P["slab"])
        n = max(1, int((p1 - p0) // PILASTER_STEP))
        for i in range(n):
            centre = p0 + (p1 - p0) * (i + 0.5) / n
            piece("Pilaster", f"{run}_{i}", centre - PILASTER_W / 2, centre + PILASTER_W / 2, PILASTER_OUT, PLINTH_H, BAND_Y - PLINTH_H, P["wall_out"])


def build(ctx, M):
    _skylights(ctx, M)
    by_x = lambda wanted: sorted(((a["x0"], a["x1"]) for a in M.ANCHORS if (a["rotationY"] == 0.0) == wanted))
    north_cuts = by_x(True) + [(M.DOCK_X[0] - 2.0, M.DOCK_X[1] + 8.0)]
    south_cuts = by_x(False)
    entrance = [(-M.ENTRANCE_HW - 1.0, M.ENTRANCE_HW + 1.0)]
    _facade_run(ctx, M, "N", M.X0 - PLINTH_OUT, M.X1 + PLINTH_OUT, north_cuts)
    _facade_run(ctx, M, "S", M.X0 - PLINTH_OUT, M.X1 + PLINTH_OUT, south_cuts)
    _facade_run(ctx, M, "W", M.Z0, M.Z1, [])
    _facade_run(ctx, M, "E", M.Z0, M.Z1, entrance)
