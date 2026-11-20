"""Extérieurs du Cove Parkview Mall : vitrage des vides du toit, façades, sorties, quai, aires de service, couloirs, pourtour, parking, haies du parc.

`build(ctx, M)` s'appelle après le décor sur le `mall_lib.Ctx` de build_mall.py. Les pièces des façades Nord et Sud courent sur toute la
longueur (débords aux angles), celles de l'Ouest et de l'Est s'arrêtent aux angles : aucune pièce ne recouvre une autre.
"""
import math

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
EXIT_DOOR_W, EXIT_DOOR_H, EXIT_CUT = 1.8, 2.2, 2.5
EXITS = {"W": (-60.0, -20.0, 20.0, 60.0), "S": (-350.0, -180.0), "N": (-310.0,)}
LADDER_X, LADDER_W, LADDER_OUT, LADDER_RAIL = -190.0, 0.5, 0.5, 0.1
LADDER_RUNG_STEP = 0.4
SIGN_TEXT = "COVE PARKVIEW MALL"
SIGN_SIZE = 0.5
SIGN_AT = {"N": (-330.0, -150.0), "S": (-340.0, -180.0), "W": (-40.0, 40.0)}
YAW = {"N": math.pi, "S": 0.0, "W": -math.pi / 2, "E": math.pi / 2}
WALK_W, WALK_FROM, TREE_OFF = 3.2, 0.3, 2.0
TREE_STEP, LAMP_STEP = 16.0, 32.0
YARD_MARGIN = 6.0
HEDGE_H, HEDGE_D, HEDGE_SEG, HEDGE_GAP = 1.5, 0.9, 4.0, 2.0
LOT = {"x": (-140.0, -100.0), "z": (6.0, 21.0), "entry_x": (-110.0, -102.0), "entry_z0": -6.7, "bays": (1, 3, 6, 9, 11, 2, 13)}
CAR_SIZE = (1.8, 4.2)


def _spans(lo, hi, cuts):
    spans = [(lo, hi)]
    for c0, c1 in cuts:
        spans = [piece for a, b in spans for piece in ((a, min(b, c0)), (max(a, c1), b)) if piece[1] - piece[0] > 0.05]
    return spans


def _inside(spans, value):
    return any(a <= value <= b for a, b in spans)


def _face(M, side):
    axis = "x" if side in ("N", "S") else "z"
    sign = -1.0 if side in ("N", "W") else 1.0
    face = {"N": M.Z0, "S": M.Z1, "W": M.X0, "E": M.X1}[side]
    return axis, sign, face


def _wall_rect(ctx, M, name, side, a0, a1, out0, out1, y0, h, mat):
    axis, sign, face = _face(M, side)
    lo, hi = sorted((face + sign * out0, face + sign * out1))
    if axis == "x":
        return ctx.rect(name, a0, lo, a1, hi, y0, h, mat)
    return ctx.rect(name, lo, a0, hi, a1, y0, h, mat)


def _wall_text(ctx, M, name, side, along, out, y0, size, mat, body):
    axis, sign, face = _face(M, side)
    gx, gz = (along, face + sign * out) if axis == "x" else (face + sign * out, along)
    ctx.text(name, body, gx, gz, y0, size, mat, YAW[side])


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


def _corner_caps(ctx, M):
    top = M.ROOF2 + 0.3
    for name, z0, z1 in (("NE", M.N_IN, M.PARK[2]), ("SE", M.PARK[3], M.S_IN)):
        ctx.rect(f"Roof_Cap_{name}", M.PARK[1], z0, M.E_IN, z1, top, CAP_H, ctx.P["roof"], tile=4.0)


def _facade_run(ctx, M, side, a0, a1, cuts, header_cuts=()):
    P = ctx.P

    def piece(name, index, p0, p1, out, y0, h, mat):
        _wall_rect(ctx, M, f"Outer_{name}_{side}{index}", side, p0, p1, 0.0, out, y0, h, mat)

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


def _exits(ctx, M):
    P = ctx.P
    for side, centres in EXITS.items():
        for k, a in enumerate(centres):
            tag = f"{side}{k}"
            _wall_rect(ctx, M, f"Outer_ExitDoor_{tag}", side, a - EXIT_DOOR_W / 2, a + EXIT_DOOR_W / 2, 0.02, 0.04, 0.0, EXIT_DOOR_H, P["dark"])
            _wall_rect(ctx, M, f"Outer_ExitStep_{tag}", side, a - 1.3, a + 1.3, 0.06, 1.0, 0.0, 0.12, P["stone"])
            _wall_rect(ctx, M, f"Outer_ExitSign_{tag}", side, a - 0.5, a + 0.5, 0.06, 0.14, EXIT_DOOR_H + 0.2, 0.25, P["band"])
            _wall_text(ctx, M, f"Outer_ExitText_{tag}", side, a, 0.16, EXIT_DOOR_H + 0.23, 0.18, P["sign"], "EXIT")
            _wall_rect(ctx, M, f"Outer_ExitLamp_{tag}", side, a - 0.15, a + 0.15, 0.06, 0.26, EXIT_DOOR_H + 0.7, 0.25, P["lamp"])


def _exit_cuts(side):
    return [(a - EXIT_CUT, a + EXIT_CUT) for a in EXITS.get(side, ())]


def _roof_ladder(ctx, M):
    P = ctx.P
    top = M.ROOF2 + 1.1
    half = LADDER_W / 2
    for i, sx in enumerate((-1.0, 1.0)):
        c = LADDER_X + sx * half
        _wall_rect(ctx, M, f"Outer_LadderRail{i}", "N", c - LADDER_RAIL / 2, c + LADDER_RAIL / 2, LADDER_OUT, LADDER_OUT + LADDER_RAIL, 0.0, top, P["steel"])
        for k, y in enumerate((2.0, 6.0, 8.5)):
            _wall_rect(ctx, M, f"Outer_LadderBracket{i}_{k}", "N", c - LADDER_RAIL / 2, c + LADDER_RAIL / 2, 0.0, LADDER_OUT, y, LADDER_RAIL, P["steel"])
    for k in range(int((top - 0.5) // LADDER_RUNG_STEP)):
        _wall_rect(ctx, M, f"Outer_LadderRung{k}", "N", LADDER_X - half + LADDER_RAIL / 2, LADDER_X + half - LADDER_RAIL / 2, LADDER_OUT, LADDER_OUT + LADDER_RAIL,
                   0.5 + k * LADDER_RUNG_STEP, 0.06, P["steel"])
    _wall_text(ctx, M, "Outer_RoofAccessText", "N", LADDER_X - 4.5, 0.08, 2.4, 0.3, P["sign"], "ROOF ACCESS")


def _signs(ctx, M):
    for side, positions in SIGN_AT.items():
        for k, a in enumerate(positions):
            _wall_text(ctx, M, f"Outer_NameText_{side}{k}", side, a, BAND_OUT + 0.02, BAND_Y + 0.1, SIGN_SIZE, ctx.P["sign"], SIGN_TEXT)


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


def _perimeter(ctx, M):
    P = ctx.P
    anchors_north = [(a["x0"] - YARD_MARGIN, a["x1"] + YARD_MARGIN) for a in M.ANCHORS if a["rotationY"] == 0.0]
    anchors_south = [(a["x0"] - YARD_MARGIN, a["x1"] + YARD_MARGIN) for a in M.ANCHORS if a["rotationY"] != 0.0]
    yard = {"N": anchors_north + [(M.DOCK_X[0] - 4.0, M.DOCK_X[1] + DOCK_CUT_END)], "S": anchors_south, "W": [], "E": [(-14.0, 14.0)]}
    ranges = {"N": (M.X0 - WALK_W, M.X1 + WALK_W), "S": (M.X0 - WALK_W, M.X1 + WALK_W), "W": (M.Z0, M.Z1), "E": (M.Z0, M.Z1)}
    for side, (a0, a1) in ranges.items():
        spans = _spans(a0, a1, yard[side])
        axis, sign, face = _face(M, side)
        for run, (p0, p1) in enumerate(spans):
            _wall_rect(ctx, M, f"Outer_Walk_{side}{run}", side, p0, p1, WALK_FROM, WALK_FROM + WALK_W, -0.1, 0.1, P["paving"])
        free = lambda a: _inside(spans, a) and all(abs(a - c) > EXIT_CUT + 1.0 for c in EXITS.get(side, ()))
        tree_off = face + sign * (WALK_FROM + WALK_W + TREE_OFF)
        lamp_off = face + sign * (WALK_FROM + WALK_W - 0.4)
        for k, a in enumerate(a for a in range(int(a0 + TREE_STEP / 2), int(a1), int(TREE_STEP)) if free(a)):
            ctx.tree(("round", "blossom", "pine")[k % 3], *((a, tree_off) if axis == "x" else (tree_off, a)), 1.0)
        for k, a in enumerate(a for a in range(int(a0 + LAMP_STEP / 2), int(a1), int(LAMP_STEP)) if free(a)):
            ctx.lamp(f"Outer_PerimeterLamp_{side}{k}", *((a, lamp_off) if axis == "x" else (lamp_off, a)), 4.0)


def _park_hedges(ctx, M):
    P = ctx.P
    gap = M.EXIT_W / 2 + HEDGE_GAP
    walls = (("N", "x", M.PARK[2], 1.0, (M.PARK[0] + HEDGE_D, M.PARK[1] - HEDGE_D), (-250.0, -270.0)),
             ("S", "x", M.PARK[3], -1.0, (M.PARK[0] + HEDGE_D, M.PARK[1] - HEDGE_D), (-250.0, -270.0)),
             ("W", "z", M.PARK[0], 1.0, (M.PARK[2], M.PARK[3]), (0.0,)), ("E", "z", M.PARK[1], -1.0, (M.PARK[2], M.PARK[3]), (0.0,)))
    for side, axis, fixed, inward, (a0, a1), openings in walls:
        for k in range(int((a1 - a0) // HEDGE_SEG)):
            p0 = a0 + k * HEDGE_SEG
            p1 = p0 + HEDGE_SEG
            if any(p1 > c - gap and p0 < c + gap for c in openings):
                continue
            lo, hi = sorted((fixed, fixed + inward * HEDGE_D))
            x0, z0, x1, z1 = (p0, lo, p1, hi) if axis == "x" else (lo, p0, hi, p1)
            if not ctx.clear((x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2):
                continue
            ctx.rect(f"Park_Hedge_{side}{k}", x0, z0, x1, z1, 0.0, HEDGE_H, P["leaf"], col=True)


def _lot(ctx, M):
    P = ctx.P
    x0, x1 = LOT["x"]
    z0, z1 = LOT["z"]
    ctx.rect("Parking_AsphaltS", x0, z0, x1, z1, -0.09, 0.1, P["service"], tile=3.0)
    ctx.rect("Parking_EntryS", LOT["entry_x"][0], LOT["entry_z0"], LOT["entry_x"][1], z0, -0.09, 0.1, P["service"], tile=3.0)
    ctx.rect("Parking_KerbS", x0, z1, x1, z1 + 0.3, 0.0, 0.14, P["stone"], col=True)
    for k in range(15):
        x = x0 + 1.0 + k * 2.7
        ctx.rect(f"Parking_LineSN{k}", x - 0.06, z0 + 0.3, x + 0.06, z0 + 5.3, 0.01, 0.02, P["soon"])
        ctx.rect(f"Parking_LineSS{k}", x - 0.06, z1 - 5.3, x + 0.06, z1 - 0.3, 0.01, 0.02, P["soon"])
    colours = (P["blue"], P["red"], P["wall"], P["yellow"], P["dark"], P["pink"], P["band"])
    for k, bay in enumerate(LOT["bays"]):
        gx = x0 + 1.0 + bay * 2.7 + 1.35
        gz = z0 + 2.8 if k % 2 else z1 - 2.8
        ctx.box(f"CarS{k}_Body", gx, gz, 0.3, CAR_SIZE[0], CAR_SIZE[1], 0.6, colours[k % len(colours)], bevel=0.06)
        ctx.box(f"CarS{k}_Cabin", gx, gz, 0.9, 1.6, 2.0, 0.6, P["glass"], bevel=0.08)
        for wx, wz in ((-0.85, -1.3), (0.85, -1.3), (-0.85, 1.3), (0.85, 1.3)):
            ctx.box(f"CarS{k}_Wheel{int(wx * 10)}{int(wz * 10)}", gx + wx, gz + wz, 0.0, 0.22, 0.6, 0.6, P["dark"])
        ctx.cols.add(f"CarS{k}", gx, gz, 0.0, 2.0, 4.4, 1.5)
    for i, gx in enumerate((x0 + 0.6, x1 - 0.6)):
        ctx.lamp(f"Parking_LampS{i}", gx, (z0 + z1) / 2, 4.5)


def build(ctx, M):
    _skylights(ctx, M)
    _corner_caps(ctx, M)
    _dock(ctx, M)
    _yards(ctx, M)
    _roof_plant(ctx, M)
    _service_corridors(ctx, M)
    by_x = lambda wanted: sorted(((a["x0"], a["x1"]) for a in M.ANCHORS if (a["rotationY"] == 0.0) == wanted))
    north_cuts = by_x(True) + [(M.DOCK_X[0] - 2.0, M.DOCK_X[1] + DOCK_CUT_END), (LADDER_X - 2.0, LADDER_X + 2.0)] + _exit_cuts("N")
    south_cuts = by_x(False) + _exit_cuts("S")
    entrance = [(-M.ENTRANCE_HW - 1.0, M.ENTRANCE_HW + 1.0)]
    _facade_run(ctx, M, "N", M.X0 - PLINTH_OUT, M.X1 + PLINTH_OUT, north_cuts)
    _facade_run(ctx, M, "S", M.X0 - PLINTH_OUT, M.X1 + PLINTH_OUT, south_cuts)
    _facade_run(ctx, M, "W", M.Z0, M.Z1, _exit_cuts("W"))
    _facade_run(ctx, M, "E", M.Z0, M.Z1, entrance, entrance)
    _exits(ctx, M)
    _roof_ladder(ctx, M)
    _signs(ctx, M)
    _perimeter(ctx, M)
    _park_hedges(ctx, M)
    _lot(ctx, M)
