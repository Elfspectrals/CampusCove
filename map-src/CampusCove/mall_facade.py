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
CAP_H = 0.05
LAMP_Y, LAMP_H, LAMP_W, LAMP_OUT = 3.8, 0.3, 0.4, 0.18
DOCK_CUT_END = 14.0
AC_SIZE = (2.2, 1.6, 1.3)
SVC_DADO_H, SVC_DADO_T = 1.0, 0.04
SVC_PIPE_Y, SVC_PIPE_S, SVC_PIPE_GAP = 3.5, 0.14, 0.15
SVC_EXT_STEP = 24.0


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


def _facade_run(ctx, M, side, a0, a1, cuts, header_cuts=()):
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

    for run, (p0, p1) in enumerate(_spans(a0, a1, header_cuts)):
        piece("Band", run, p0, p1, BAND_OUT, BAND_Y, BAND_H, P["band"])
        piece("Cornice", run, p0, p1, CORNICE_OUT, M.ROOF2 - CORNICE_H, CORNICE_H, P["slab"])
    for run, (p0, p1) in enumerate(_spans(a0, a1, cuts)):
        piece("Plinth", run, p0, p1, PLINTH_OUT, 0.0, PLINTH_H, P["stone"])
        n = max(1, int((p1 - p0) // PILASTER_STEP))
        for i in range(n):
            centre = p0 + (p1 - p0) * (i + 0.5) / n
            piece("Pilaster", f"{run}_{i}", centre - PILASTER_W / 2, centre + PILASTER_W / 2, PILASTER_OUT, PLINTH_H, BAND_Y - PLINTH_H, P["wall_out"])
            if i:
                bay = p0 + (p1 - p0) * i / n
                piece("Lamp", f"{run}_{i}", bay - LAMP_W / 2, bay + LAMP_W / 2, LAMP_OUT, LAMP_Y, LAMP_H, P["lamp"])


def _corner_caps(ctx, M):
    top = M.ROOF2 + 0.3
    for name, z0, z1 in (("NE", M.N_IN, M.PARK[2]), ("SE", M.PARK[3], M.S_IN)):
        ctx.rect(f"Roof_Cap_{name}", M.PARK[1], z0, M.E_IN, z1, top, CAP_H, ctx.P["roof"], tile=4.0)


def _dock(ctx, M):
    P = ctx.P
    x0, x1 = M.DOCK_X[0] - 2.0, M.DOCK_X[1] + 2.0
    z_out, z_wall = M.Z0 - 4.5, M.Z0
    ctx.rect("Dock_Canopy", x0, z_out - 1.0, x1, z_wall, 4.3, 0.25, P["dark"])
    for i, gx in enumerate((x0 + 0.4, x1 - 0.4)):
        ctx.cyl(f"Dock_CanopyPost{i}", gx, z_out + 0.4, 1.1, 0.1, 3.2, P["steel"], seg=8)
    ctx.rect("Dock_Edge", x0, z_out, x1, z_out + 0.3, 1.1, 0.02, P["caution"])
    for i, gx in enumerate((M.DOCK_X[0] + 0.5, M.DOCK_X[1] - 0.5)):
        ctx.box(f"Dock_Bumper{i}", gx, z_wall - 0.225, 1.1, 0.5, 0.25, 0.6, P["dark"])
        ctx.box(f"Dock_Lamp{i}", gx, z_wall - 0.2, 3.9, 0.3, 0.3, 0.25, P["lamp"])
    door0 = M.DOCK_X[1] + DOCK_CUT_END - 5.4
    ctx.rect("Dock_StaffDoor", door0, z_wall - 0.04, door0 + 1.6, z_wall - 0.02, 0.0, 2.2, P["dark"])
    ctx.rect("Dock_StaffStep", door0 - 0.4, z_wall - 1.2, door0 + 2.0, z_wall - 0.04, 0.0, 0.18, P["stone"])
    ctx.box("Dock_StaffLamp", door0 + 0.8, z_wall - 0.2, 2.5, 0.3, 0.3, 0.25, P["lamp"])


def _yards(ctx, M):
    for a in M.ANCHORS:
        depth = a["ext"]["footprint"][1]
        north = a["rotationY"] == 0.0
        sign = -1.0 if north else 1.0
        wall = M.Z0 if north else M.Z1
        lo, hi = a["x0"] - 6.0, a["x1"] + 6.0
        key = a["key"]
        for i, gx in enumerate((a["x0"] - 3.0, a["x1"] + 3.0)):
            ctx.lamp(f"Apron_Lamp_{key}{i}", gx, wall + sign * depth * 0.5, 4.5)
            ctx.bin_(f"Apron_Bin_{key}{i}", gx, wall + sign * 2.5)
            ctx.cyl(f"Apron_Bollard_{key}{i}", gx, wall + sign * (depth + 2.5), 0.0, 0.12, 0.9, ctx.P["yellow"], seg=8, col=True)
        front = wall + sign * (depth + 3.0)
        ctx.rect(f"Apron_Line_{key}", lo + 1.0, min(front, front + sign * 0.2), hi - 1.0, max(front, front + sign * 0.2), -0.01, 0.02, ctx.P["caution"])


def _roof_plant(ctx, M):
    high, low = M.ROOF2 + 0.3, M.ROOF1 + 0.3
    spots = [(-168.0, z, high) for z in (-60.0, -35.0, 35.0, 60.0)] + [(x, -83.0, high) for x in (-290.0, -265.0, -240.0, -215.0)]
    spots += [(x, z, low) for x, z in ((-370.0, -60.0), (-350.0, -82.0), (-320.0, -60.0), (-370.0, 60.0), (-350.0, 82.0), (-320.0, 60.0))]
    for i, (x, z, y) in enumerate(spots):
        ctx.box(f"Roof_Plant{i}", x, z, y, AC_SIZE[0], AC_SIZE[1], AC_SIZE[2], ctx.P["metal"], bevel=0.03)
        ctx.cyl(f"Roof_Vent{i}", x + 2.2, z, y, 0.25, 0.9, ctx.P["steel"], seg=8)


def _service_corridors(ctx, M):
    P = ctx.P
    gc, hh, nl = M.ANCHORS[2], M.ANCHORS[1], M.ANCHORS[0]
    t = M.WALL_T
    north = ((gc["x1"] + t, hh["x0"] - t), (hh["x1"] + t, M.WARE[0] - t))
    south = ((M.X0 + M.SVC, nl["x0"] - t), (nl["x1"] + t, M.X1 - t))
    runs = [("N", "x", M.Z0 + t, 1.0, (M.Z0 + t + M.SVC) / 2, span) for span in north]
    runs += [("S", "x", M.Z1 - t, -1.0, (M.Z1 - t - M.SVC) / 2, span) for span in south]
    runs += [("W", "z", M.X0 + t, 1.0, M.X0 + M.SVC / 2, (M.Z0 + t, M.Z1 - t))]
    for index, (side, axis, face, inward, centre, (p0, p1)) in enumerate(runs):
        def along(name, a0, a1, off0, off1, y0, h, mat):
            lo, hi = sorted((face + inward * off0, face + inward * off1))
            if axis == "x":
                ctx.rect(f"Svc_{name}_{side}{index}", a0, lo, a1, hi, y0, h, mat)
            else:
                ctx.rect(f"Svc_{name}_{side}{index}", lo, a0, hi, a1, y0, h, mat)
        along("Dado", p0, p1, 0.0, SVC_DADO_T, 0.0, SVC_DADO_H, P["dark"])
        along("Pipe", p0, p1, SVC_PIPE_GAP, SVC_PIPE_GAP + SVC_PIPE_S, SVC_PIPE_Y, SVC_PIPE_S, P["metal"])
        along("Guide", p0, p1, M.SVC / 2 - 0.06, M.SVC / 2 + 0.06, 0.0, 0.03, P["yellow"])
        for k in range(int((p1 - p0) // SVC_EXT_STEP)):
            a = p0 + SVC_EXT_STEP * (k + 0.5)
            along(f"Extinguisher{k}", a - 0.15, a + 0.15, SVC_DADO_T, SVC_DADO_T + 0.2, 1.1, 0.6, P["red"])


def build(ctx, M):
    _skylights(ctx, M)
    _corner_caps(ctx, M)
    _dock(ctx, M)
    _yards(ctx, M)
    _roof_plant(ctx, M)
    _service_corridors(ctx, M)
    by_x = lambda wanted: sorted(((a["x0"], a["x1"]) for a in M.ANCHORS if (a["rotationY"] == 0.0) == wanted))
    north_cuts = by_x(True) + [(M.DOCK_X[0] - 2.0, M.DOCK_X[1] + DOCK_CUT_END)]
    south_cuts = by_x(False)
    entrance = [(-M.ENTRANCE_HW - 1.0, M.ENTRANCE_HW + 1.0)]
    _facade_run(ctx, M, "N", M.X0 - PLINTH_OUT, M.X1 + PLINTH_OUT, north_cuts)
    _facade_run(ctx, M, "S", M.X0 - PLINTH_OUT, M.X1 + PLINTH_OUT, south_cuts)
    _facade_run(ctx, M, "W", M.Z0, M.Z1, [])
    _facade_run(ctx, M, "E", M.Z0, M.Z1, entrance, entrance)
