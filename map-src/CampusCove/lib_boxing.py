import lib_common as L

ROPE_HEIGHTS = (0.45, 0.8, 1.15, 1.5)
ROPE_WALL_H = 2.4
STEP_COUNT = 3


def ring_materials():
    return {
        "canvas": L.make_mat("IN_RingCanvas", "#d9d3c4", 0.95, "noise", 0.03),
        "skirt": L.make_mat("IN_RingSkirt", "#1f3a5f", 0.8, "stripes", 0.03, accent="#1a3251"),
        "rope": L.make_mat("IN_RingRope", "#f2efe8", 0.6, "noise", 0.01),
        "rope_top": L.make_mat("IN_RingRopeTop", "#c8352d", 0.6, "noise", 0.01),
        "post": L.make_mat("IN_RingPost", "#2b2f35", 0.4, "noise", 0.02),
        "pad_red": L.make_mat("IN_RingPadRed", "#c8352d", 0.6, "noise", 0.02),
        "pad_blue": L.make_mat("IN_RingPadBlue", "#2f5d9f", 0.6, "noise", 0.02),
        "pad_white": L.make_mat("IN_RingPadWhite", "#f2efe8", 0.6, "noise", 0.02),
        "step": L.make_mat("IN_RingStep", "#3a3f47", 0.7, "noise", 0.03),
    }


class Ring:

    def __init__(self, cx, cz, inside=6.1, deck=7.3, deck_y=0.9):
        self.cx, self.cz, self.inside, self.deck, self.deck_y = cx, cz, inside, deck, deck_y
        self.post = inside / 2 + 0.1

    def build(self, coll, M):
        cx, cz, y, d, p = self.cx, self.cz, self.deck_y, self.deck, self.post
        objs = [
            L.box(coll, "Ring_Skirt", cx, cz, 0.0, d - 0.1, d - 0.1, y - 0.04, M["skirt"], tile=2.0),
            L.box(coll, "Ring_Canvas", cx, cz, y - 0.04, d, d, 0.04, M["canvas"], tile=2.0),
        ]
        pads = {(-1, -1): "pad_red", (1, 1): "pad_blue", (-1, 1): "pad_white", (1, -1): "pad_white"}
        for (sx, sz), pad in pads.items():
            tag = f"{'W' if sx < 0 else 'E'}{'N' if sz < 0 else 'S'}"
            objs.append(L.cyl(coll, f"Ring_Post_{tag}", cx + sx * p, cz + sz * p, y, 0.07, ROPE_HEIGHTS[-1] + 0.12, M["post"], seg=10))
            objs.append(L.box(coll, f"Ring_Pad_{tag}", cx + sx * (p - 0.1), cz + sz * (p - 0.1), y + 0.3, 0.22, 0.22, 1.3, M[pad], bevel=0.04))
        span = 2 * p
        for i, h in enumerate(ROPE_HEIGHTS):
            mat = M["rope_top"] if i == len(ROPE_HEIGHTS) - 1 else M["rope"]
            for side, (gx, gz, sx, sz) in {"N": (cx, cz - p, span, 0.05), "S": (cx, cz + p, span, 0.05),
                                           "W": (cx - p, cz, 0.05, span), "E": (cx + p, cz, 0.05, span)}.items():
                objs.append(L.box(coll, f"Ring_Rope_{side}{i}", gx, gz, y + h, sx, sz, 0.05, mat))
        step_x0, step_x1 = cx - p + 0.25, cx - p + 1.45
        step_z0 = cz + d / 2
        depth = 0.3
        for k in range(STEP_COUNT):
            h = y * (STEP_COUNT - k) / STEP_COUNT
            z = step_z0 + depth * k + depth / 2
            objs.append(L.box(coll, f"Ring_Step_{k}", (step_x0 + step_x1) / 2, z, 0.0, step_x1 - step_x0, depth, h, M["step"]))
        wall = span + 0.2
        cols = [
            ("Ring_Ropes_N", cx, cz - p, y, wall, 0.2, ROPE_WALL_H),
            ("Ring_Ropes_S", cx, cz + p, y, wall, 0.2, ROPE_WALL_H),
            ("Ring_Ropes_W", cx - p, cz, y, 0.2, wall, ROPE_WALL_H),
            ("Ring_Ropes_E", cx + p, cz, y, 0.2, wall, ROPE_WALL_H),
        ]
        corner = self.inside / 2 - 0.6
        front = cz + d / 2 + STEP_COUNT * depth + 0.9
        data = {
            "deck": {"minX": cx - d / 2, "maxX": cx + d / 2, "minZ": cz - d / 2, "maxZ": cz + d / 2},
            "ring": {"centre": [cx, y, cz], "half": round(self.inside / 2, 3)},
            "corners": {"red": [cx - corner, y, cz - corner], "blue": [cx + corner, y, cz + corner]},
            "exits": {"red": [cx - 1.0, 0.0, front], "blue": [cx + 1.6, 0.0, front]},
            "coach": [cx - d / 2 - 0.55, 0.0, cz + d / 2 + 0.35],
            "stairs": [{"name": "Ring_Steps", "minX": step_x0, "maxX": step_x1, "minZ": step_z0, "maxZ": step_z0 + depth * STEP_COUNT,
                        "y0": 0.0, "y1": y, "rise": "-z"}],
        }
        return objs, cols, data

    def lights(self, coll, M, ceiling):
        half = self.inside / 2
        return [L.box(coll, f"Light_Ring_{k}", self.cx + sx * half * 0.5, self.cz + sz * half * 0.5, ceiling - 0.7, 1.6, 0.5, 0.06, M["lamp"])
                for k, (sx, sz) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1)))]


def punch_bag_parts(coll, M):
    bag_x = 0.55
    parts = [
        L.box(coll, "PB_Base", 0.0, 0.0, 0.0, 0.8, 0.8, 0.08, M["frame"], bevel=0.02),
        L.box(coll, "PB_Weight", 0.0, 0.0, 0.08, 0.5, 0.5, 0.12, M["weight"], bevel=0.03),
        L.box(coll, "PB_Upright", 0.0, 0.0, 0.2, 0.08, 0.08, 2.2, M["frame"]),
        L.box(coll, "PB_Arm", bag_x / 2, 0.0, 2.32, bag_x + 0.12, 0.08, 0.08, M["frame"]),
        L.cyl(coll, "PB_Chain", bag_x, 0.0, 1.75, 0.015, 0.57, M["frame"], seg=6),
        L.cyl(coll, "PB_Bag", bag_x, 0.0, 0.7, 0.18, 1.0, M["bag"], seg=14),
        L.cyl(coll, "PB_BagTop", bag_x, 0.0, 1.66, 0.19, 0.09, M["bag_trim"], seg=14),
        L.cyl(coll, "PB_BagBottom", bag_x, 0.0, 0.66, 0.19, 0.06, M["bag_trim"], seg=14),
    ]
    return parts


def punch_bag_materials():
    return {
        "frame": L.make_mat("DC_PunchBagFrame", "#2b2f35", 0.4, "noise", 0.02),
        "weight": L.make_mat("DC_PunchBagWeight", "#4a4f57", 0.7, "noise", 0.03),
        "bag": L.make_mat("DC_PunchBagLeather", "#b8322c", 0.55, "noise", 0.04),
        "bag_trim": L.make_mat("DC_PunchBagTrim", "#1d2126", 0.5, "noise", 0.02),
    }
