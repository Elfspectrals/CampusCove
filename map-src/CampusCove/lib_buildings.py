import json
import math
import os

import bpy
import numpy as np

import lib_common as L
import lib_kit as K

FLOOR_TOP = 0.04
LOFT_Y = 2.6
ROOF_OVERHANG = 0.3
CHIMNEY_SINK = 0.3
PREFIX = "FB_"
SIDES = ("front", "back", "left", "right")
with open(os.path.join(L.FRONT_ASSETS, "buildings", "buildings.json"), encoding="utf-8") as f:
    TEMPLATES = json.load(f)["buildings"]


def _darker(hex_color, factor=0.85):
    r, g, b = (int(hex_color[i:i + 2], 16) for i in (1, 3, 5))
    return "#" + "".join(f"{round(c * factor):02x}" for c in (r, g, b))


def _texture_mat(name, key, tint):
    folder = os.path.join(L.FRONT_ASSETS, "textures", key)
    with open(os.path.join(folder, "texture.json"), encoding="utf-8") as f:
        meta = json.load(f)
    stale = bpy.data.materials.get(name)
    if stale is not None:
        bpy.data.materials.remove(stale)
    stale_img = bpy.data.images.get(name + "_tex")
    if stale_img is not None:
        bpy.data.images.remove(stale_img)
    source = bpy.data.images.load(os.path.join(folder, meta["maps"]["color"]), check_existing=True)
    pixels = np.empty(len(source.pixels), dtype=np.float32)
    source.pixels.foreach_get(pixels)
    rgba = pixels.reshape(-1, 4)
    rgba[:, :3] *= np.array(L._hex(tint), dtype=np.float32)
    image = bpy.data.images.new(name + "_tex", *source.size)
    image.pixels.foreach_set(rgba.ravel())
    image.pack()
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = image
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.85
    bsdf.inputs["Metallic"].default_value = 0.0
    return m, meta["tileMeters"]


def materials(prop):
    template = TEMPLATES[prop["building"]]
    colors = prop["colors"]
    mats = {part: L.make_mat(f"TW_{PREFIX}{prop['id']}_{part}", colors[part], 0.85, template["patterns"][part], 0.05, accent=_darker(colors[part]))
            for part in ("walls", "roof", "trim", "floor", "door") if part not in prop.get("textures", {})}
    mats["glass"] = L.make_mat("TW_BuildingGlass", "#9fc6d8", 0.2, "noise", 0.0)
    mats["beam"] = L.make_mat("TW_BuildingBeam", "#6e4f33", 0.85, "planks", 0.04, accent="#5a3f28")
    mats["loft"] = L.make_mat("TW_BuildingLoft", "#9c7448", 0.85, "planks", 0.05, accent="#7e5c38")
    mats["lamp"] = L.make_mat("TW_BuildingLamp", "#fff1c4", 0.5, "noise", 0.0, emit="#ffd27a", emit_strength=1.6)
    mats["chimney"] = L.make_mat("TW_BuildingChimney", "#9a6b55", 0.9, "tiles", 0.05, accent="#7f5644")
    return mats


def _side_line(side, rect):
    x0, z0, x1, z1 = rect
    return {"front": ("x", z0), "back": ("x", z1), "left": ("z", x0), "right": ("z", x1)}[side]


def _span(opening):
    half = opening["width"] / 2
    return opening["offset"] - half, opening["offset"] + half


def shell(kit, name, prop, mats, thick):
    w, d = prop["size"]
    h = prop["height"]
    rect = (-w / 2, -d / 2, w / 2, d / 2)
    x0, z0, x1, z1 = rect
    t = thick / 2
    for cx, cz in ((x0, z0), (x1, z0), (x0, z1), (x1, z1)):
        kit.corner(f"{name}_Corner_{'W' if cx < 0 else 'E'}{'S' if cz < 0 else 'N'}", cx, cz, 0.0, h, thick, mats["walls"])
    for side in SIDES:
        axis, fixed = _side_line(side, rect)
        lo, hi = (x0 + t, x1 - t) if axis == "x" else (z0 + t, z1 - t)
        here = [o for o in prop["openings"] if o["side"] == side]
        kit.wall(f"{name}_Wall_{side}", axis, fixed, lo, hi, 0.0, h, thick, mats["walls"], openings=[(*_span(o), o["bottom"], o["top"]) for o in here])
        for k, o in enumerate(here):
            a, b = _span(o)
            if o["type"] == "door":
                kit.door_frame(f"{name}_Door_{side}{k}", axis, fixed, a, b, 0.0, o["top"], thick, mats["trim"], leaf=None)
            else:
                kit.add(f"{name}_Glass_{side}{k}", *K._along(axis, fixed, a, b, 0.04), o["bottom"], o["top"], mats["glass"])
    kit.gable_roof(f"{name}_Roof", x0 - ROOF_OVERHANG, z0 - ROOF_OVERHANG, x1 + ROOF_OVERHANG, z1 + ROOF_OVERHANG, h, prop["roof"], mats["roof"], ridge_axis=prop["ridge"])
    kit.floor(f"{name}_Floor", x0 + t, z0 + t, x1 - t, z1 - t, FLOOR_TOP, mats["floor"], thick=FLOOR_TOP - K.MIN_GAP, tile=1.5)
    return rect


def _inward(side):
    return {"front": (0, 1), "back": (0, -1), "left": (1, 0), "right": (-1, 0)}[side]


def _lowest_roof(prop, x0, z0, x1, z1):
    w, d = prop["size"]
    if prop["ridge"] == "x":
        far, half = max(abs(z0), abs(z1)), d / 2 + ROOF_OVERHANG
    else:
        far, half = max(abs(x0), abs(x1)), w / 2 + ROOF_OVERHANG
    return prop["height"] + prop["roof"] * (1 - far / half)


def farmhouse(kit, name, prop, mats, rect, thick):
    x0, z0, x1, z1 = rect
    h = prop["height"]
    chimney = (x1 - 2.2, z1 - 2.4, x1 - 1.4, z1 - 1.6)
    kit.add(f"{name}_Chimney", *chimney, _lowest_roof(prop, *chimney) - CHIMNEY_SINK, h + prop["roof"] + 0.8, mats["chimney"])
    for k, o in enumerate(o for o in prop["openings"] if o["type"] == "door"):
        axis, fixed = _side_line(o["side"], rect)
        ix, iz = _inward(o["side"])
        a = _span(o)[0] + 0.1
        inner = fixed + (iz if axis == "x" else ix) * (thick / 2 + 0.02)
        far = inner + (iz if axis == "x" else ix) * (o["width"] - 0.2)
        if axis == "x":
            kit.add(f"{name}_DoorOpen{k}", a, inner, a + 0.05, far, FLOOR_TOP, o["top"] - 0.1, mats["door"], collide=True)
        else:
            kit.add(f"{name}_DoorOpen{k}", inner, a, far, a + 0.05, FLOOR_TOP, o["top"] - 0.1, mats["door"], collide=True)


def barn(kit, name, prop, mats, rect, thick):
    x0, z0, x1, z1 = rect
    h = prop["height"]
    t = thick / 2
    ix0, iz0, ix1, iz1 = x0 + t, z0 + t, x1 - t, z1 - t
    iw, idp = ix1 - ix0, iz1 - iz0
    for k, o in enumerate(o for o in prop["openings"] if o["type"] == "door"):
        axis, fixed = _side_line(o["side"], rect)
        ix, iz = _inward(o["side"])
        out = fixed - (iz if axis == "x" else ix) * (t + 0.02)
        a, b = _span(o)
        half = o["width"] / 2
        for j, (p, q) in enumerate(((a - half, a), (b, b + half))):
            lo, hi = sorted((out, out - (iz if axis == "x" else ix) * 0.06))
            box = (p, lo, q, hi) if axis == "x" else (lo, p, hi, q)
            kit.add(f"{name}_DoorOpen{k}{'AB'[j]}", *box, 0.0, o["top"] - 0.1, mats["door"], collide=True)
    left_doors = [_span(o) for o in prop["openings"] if o["type"] == "door" and o["side"] == "left"]
    for k, f in enumerate((0.237, 0.478)):
        z = iz0 + f * idp
        if any(a <= z + 0.04 and b >= z - 0.04 for a, b in left_doors):
            continue
        kit.add(f"{name}_Stall{k}", ix0, z - 0.04, ix0 + 2.6, z + 0.04, FLOOR_TOP, 1.35, mats["loft"], collide=True)
    loft_z = iz1 - 0.296 * idp
    kit.slab(f"{name}_Loft", ix0, loft_z, ix1, iz1, LOFT_Y, 0.15, mats["loft"])
    for k, f in enumerate((0.33, 0.67)):
        kit.pillar(f"{name}_LoftPost{k}", ix0 + f * iw, loft_z + 0.1, FLOOR_TOP, LOFT_Y - FLOOR_TOP, mats["beam"], w=0.2)
    ladder_x, ladder_z = ix0 + 0.82 * iw, loft_z - 0.06
    for k, gx in enumerate((ladder_x - 0.25, ladder_x + 0.25)):
        kit.add(f"{name}_LadderRail{k}", gx - 0.03, ladder_z - 0.03, gx + 0.03, ladder_z + 0.03, FLOOR_TOP, LOFT_Y + 0.9, mats["beam"])
    for k in range(9):
        y = FLOOR_TOP + 0.3 * (k + 1)
        kit.add(f"{name}_LadderRung{k}", ladder_x - 0.22, ladder_z - 0.02, ladder_x + 0.22, ladder_z + 0.02, y, y + 0.04, mats["beam"])
    kit.add(f"{name}_LadderCol", ladder_x - 0.28, ladder_z - 0.05, ladder_x + 0.28, ladder_z + 0.05, FLOOR_TOP, LOFT_Y, mats["beam"], visible=False, collide=True)
    beams = [iz0 + f * idp for f in (0.172, 0.456)]
    for k, z in enumerate(beams):
        kit.add(f"{name}_Beam{k}", ix0, z - 0.12, ix1, z + 0.12, h - 0.4, h - 0.2, mats["beam"])
    lamp_x, lamp_z = (ix0 + ix1) / 2, beams[1]
    kit.add(f"{name}_LampWire", lamp_x - 0.02, lamp_z - 0.02, lamp_x + 0.02, lamp_z + 0.02, 3.2, h - 0.4, mats["beam"])
    kit.add(f"{name}_Lamp", lamp_x - 0.15, lamp_z - 0.15, lamp_x + 0.15, lamp_z + 0.15, 2.85, 3.2, mats["lamp"])


INTERIORS = {"farmhouse": farmhouse, "barn": barn}


def local_kit(prop):
    if prop["building"] not in TEMPLATES:
        raise ValueError(f"{prop['id']}: no building template {prop['building']}")
    name = f"{PREFIX}{prop['id']}"
    thick = TEMPLATES[prop["building"]]["thick"]
    mats = materials(prop)
    tiles = {}
    for part, key in prop.get("textures", {}).items():
        mats[part], tiles[part] = _texture_mat(f"TW_{PREFIX}{prop['id']}_{part}", key, prop["colors"][part])
    kit = K.Kit()
    rect = shell(kit, name, prop, mats, thick)
    INTERIORS[prop["building"]](kit, name, prop, mats, rect, thick)
    for part, tile in tiles.items():
        for b in kit.boxes:
            if b.mat is mats[part]:
                b.tile = tile
    return kit


def place(kit, local, prop):
    turns = round(prop["yaw"] / (math.pi / 2))
    if abs(turns * math.pi / 2 - prop["yaw"]) > 1e-3:
        raise ValueError(f"{prop['id']}: buildings turn by quarter turns, yaw {prop['yaw']}")
    cos, sin = round(math.cos(prop["yaw"])), round(math.sin(prop["yaw"]))
    cx, _, cz = prop["position"]

    def world(x, z):
        return cx + x * cos + z * sin, cz - x * sin + z * cos

    for b in local.boxes:
        ax, az = world(b.x0, b.z0)
        bx, bz = world(b.x1, b.z1)
        extra = dict(b.extra)
        if b.shape == "gable" and turns % 2:
            extra["ridge_axis"] = "z" if extra["ridge_axis"] == "x" else "x"
        kit._register(K.Box(b.name, ax, az, bx, bz, b.y0, b.y1, b.mat, visible=b.visible, collide=b.collide, opening=b.opening, tile=b.tile, bevel=b.bevel,
                            shape=b.shape, extra=extra))


def zone_buildings(kit, zone_key):
    path = os.path.join(L.FRONT_ASSETS, "zones", f"{zone_key}.json")
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        props = [p for p in json.load(f)["props"] if p["kind"] == "building"]
    for prop in props:
        place(kit, local_kit(prop), prop)
    return props
