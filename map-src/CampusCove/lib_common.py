"""Shared helpers for the CampusCove Blender build scripts (run inside Blender via the MCP).

Conventions (see docs/ASSETS_STYLE_GUIDE.md):
  * All positions are given in GAME space (x, z, height). Blender is Z-up, the glTF export is Y-up
    with game z = -blender y, so a game point (gx, gz) lives at blender (gx, -gz).
  * Every object has its origin at the CENTER-BOTTOM of its footprint -> a furniture piece with
    base height 0 never sinks into the floor. `check_grounded()` fails the build otherwise.
  * Low-poly, tiny procedural textures (64 px) so exported materials are textured like the houses.
  * Interiors: floor y=0, front wall (door) at game z=+5, rooms extend towards -Z.
"""
import bpy
import bmesh
import json
import math
import os
import random
from mathutils import Matrix, Vector

OUT_ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "out"))
FIELD_SOIL = 0.03
FRONT_ASSETS = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "front", "public", "assets"))

_tex_cache = {}
_mat_cache = {}


def b(gx, gz, h=0.0):
    """game (x, z, height) -> blender (x, y, z)."""
    return (gx, -gz, h)


# ---------------------------------------------------------------- scene
def new_build_scene(name):
    """Dedicated scene so the user's own scene is never touched."""
    old = bpy.data.scenes.get(name)
    if old:
        for o in list(old.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.scenes.remove(old)
    sc = bpy.data.scenes.new(name)
    bpy.context.window.scene = sc
    _mat_cache.clear()
    _tex_cache.clear()
    bpy.data.orphans_purge(do_recursive=True)
    return sc


# ---------------------------------------------------------------- textures / materials
def _hex(c):
    c = c.lstrip("#")
    return tuple(int(c[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def make_texture(key, base, var=0.06, pattern="noise", size=64, accent=None, seed=1):
    """Tiny procedural texture. pattern: noise | planks | tiles | stripes | checker."""
    if key in _tex_cache:
        return _tex_cache[key]
    stale = bpy.data.images.get(key)
    if stale is not None:
        bpy.data.images.remove(stale)
    rnd = random.Random(seed + hash(key) % 1000)
    r0, g0, b0 = _hex(base)
    ar, ag, ab = _hex(accent) if accent else (r0 * 0.8, g0 * 0.8, b0 * 0.8)
    img = bpy.data.images.new(key, size, size, alpha=False)
    px = []
    for y in range(size):
        for x in range(size):
            k = rnd.uniform(-var, var)
            r, g, bl = r0 + k, g0 + k, b0 + k
            if pattern == "planks":
                if y % 16 == 0:
                    r, g, bl = ar, ag, ab
                elif (x + (y // 16) * 21) % 64 == 0:
                    r, g, bl = ar, ag, ab
            elif pattern == "tiles":
                if x % 32 == 0 or y % 32 == 0:
                    r, g, bl = ar, ag, ab
            elif pattern == "stripes":
                if (x // 8) % 2 == 0:
                    r, g, bl = ar + k, ag + k, ab + k
            elif pattern == "checker":
                if ((x // 16) + (y // 16)) % 2 == 0:
                    r, g, bl = ar + k, ag + k, ab + k
            px.extend((max(0, min(1, r)), max(0, min(1, g)), max(0, min(1, bl)), 1.0))
    img.pixels.foreach_set(px)
    img.pack()
    _tex_cache[key] = img
    return img


def make_mat(name, base, rough=0.9, pattern="noise", var=0.05, accent=None, alpha=None, emit=None, emit_strength=1.2):
    """Textured Principled material (image -> base color). `alpha` makes it a blended glass."""
    if name in _mat_cache:
        return _mat_cache[name]
    stale = bpy.data.materials.get(name)
    if stale is not None:
        bpy.data.materials.remove(stale)
    stale_img = bpy.data.images.get(name + "_tex")
    if stale_img is not None:
        bpy.data.images.remove(stale_img)
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = make_texture(name + "_tex", base, var, pattern, accent=accent)
    tex.interpolation = "Closest"
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = 0.0
    if alpha is not None:
        bsdf.inputs["Alpha"].default_value = alpha
        m.blend_method = "BLEND" if hasattr(m, "blend_method") else m.blend_method
    if emit:
        bsdf.inputs["Emission Color"].default_value = (*_hex(emit), 1.0)
        bsdf.inputs["Emission Strength"].default_value = emit_strength
    _mat_cache[name] = m
    return m


# ---------------------------------------------------------------- geometry
def _box_uv(bm, tile=1.0):
    """World-scale box projection UVs so texel density is constant."""
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for l in f.loops:
            p = l.vert.co
            if ax == 0:
                l[uv].uv = (p.y / tile, p.z / tile)
            elif ax == 1:
                l[uv].uv = (p.x / tile, p.z / tile)
            else:
                l[uv].uv = (p.x / tile, p.y / tile)


def box(coll, name, gx, gz, y0, sx, sz, h, mat, rot=0.0, bevel=0.0, tile=1.0):
    """Axis box with its origin at the center-bottom. (gx, gz): game footprint center,
    y0: base height, (sx, sz): footprint size along game x / z, h: height, rot: yaw (radians)."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= sx
        v.co.y *= sz
        v.co.z = (v.co.z + 0.5) * h
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=min(bevel, min(sx, sz, h) * 0.45), segments=1, affect="EDGES")
    bm.normal_update()
    _box_uv(bm, tile)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    ob.location = b(gx, gz, y0)
    ob.rotation_euler = (0, 0, rot)
    coll.objects.link(ob)
    return ob


def cyl(coll, name, gx, gz, y0, radius, h, mat, seg=8, tile=1.0):
    """Low-poly cylinder, origin center-bottom."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=radius, radius2=radius, depth=h)
    for v in bm.verts:
        v.co.z += h / 2
    bm.normal_update()
    _box_uv(bm, tile)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    ob.location = b(gx, gz, y0)
    coll.objects.link(ob)
    return ob


def cone(coll, name, gx, gz, y0, r1, r2, h, mat, seg=8):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r1, radius2=r2, depth=h)
    for v in bm.verts:
        v.co.z += h / 2
    bm.normal_update()
    _box_uv(bm, 1.0)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    ob.location = b(gx, gz, y0)
    coll.objects.link(ob)
    return ob


def join(coll, name, objs, mat_keep=True):
    """Join `objs` into one object (origin = center-bottom of the union footprint)."""
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    # world-space center-bottom of the union
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    cx = sum(p.x for p in pts) / len(pts)
    cy = sum(p.y for p in pts) / len(pts)
    zmin = min(p.z for p in pts)
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.data.name = name
    # move origin to the center-bottom without moving geometry
    cursor = bpy.context.scene.cursor.location.copy()
    bpy.context.scene.cursor.location = (cx, cy, zmin)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    bpy.context.scene.cursor.location = cursor
    return ob


# ---------------------------------------------------------------- collision + layout
class Collisions:
    """COL_ boxes are exported only in <name>.colsrc.glb (turned into JSON by extract-collision.mjs)."""

    def __init__(self, coll):
        self.coll = coll
        self.items = []

    def add(self, name, gx, gz, y0, sx, sz, h, rot=0.0):
        mat = bpy.data.materials.get("COL_mat") or bpy.data.materials.new("COL_mat")
        o = box(self.coll, "COL_" + name, gx, gz, y0, sx, sz, h, mat, rot=rot)
        o.display_type = "WIRE"
        self.items.append(o)
        return o


def check_grounded(objs, tol=0.03, allow=()):
    """Furniture rule: lowest point of every object must sit between y=0 and y=tol."""
    bad = []
    for o in objs:
        if o.type != "MESH" or o.name.startswith(("COL_", "Sky_", "Ceiling", "Rug", "Walls")):
            continue
        if any(o.name.startswith(a) for a in allow):
            continue
        low = min((o.matrix_world @ Vector(c)).z for c in o.bound_box)
        if low < -0.001 or low > tol:
            bad.append((o.name, round(low, 3)))
    return bad


# ---------------------------------------------------------------- export
def export_glb(path, objs, **gltf_options):
    """Export only `objs`. Selection in the user's other scenes is saved, cleared, then restored."""
    import contextlib
    import io
    os.makedirs(os.path.dirname(path), exist_ok=True)
    saved = []
    for sc in bpy.data.scenes:
        for vl in sc.view_layers:
            for o in vl.objects:
                if o.select_get(view_layer=vl):
                    saved.append((o, vl))
                    o.select_set(False, view_layer=vl)
    scene = objs[0].users_scene[0]
    bpy.context.window.scene = scene
    vl = scene.view_layers[0]
    for o in objs:
        o.select_set(True, view_layer=vl)
    vl.objects.active = objs[0]
    with contextlib.redirect_stdout(io.StringIO()):
        bpy.ops.export_scene.gltf(
            filepath=path,
            export_format="GLB",
            use_selection=True,
            export_apply=True,
            export_yup=True,
            export_image_format="AUTO",
            export_materials="EXPORT",
            export_cameras=False,
            export_lights=False,
            **gltf_options,
        )
    for o in objs:
        o.select_set(False, view_layer=vl)
    for o, v in saved:
        try:
            o.select_set(True, view_layer=v)
        except Exception:
            pass


def write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def yaw_towards(from_gx, from_gz, to_gx, to_gz):
    """Game yaw (radians) so that the player at `from` looks at `to` (0 = facing -Z)."""
    return math.atan2(-(to_gx - from_gx), -(to_gz - from_gz))


# ---------------------------------------------------------------- walls + composite furniture
def wall(coll, name, axis, fixed, thick, a0, a1, H, mat, openings=(), cols=None, glass=None, col_tag=None):
    """Wall running along game x (axis='x', at z=fixed) or game z (axis='z', at x=fixed).
    openings: [(a, b, y0, y1)] holes. Returns the created objects. `cols` (Collisions) gets one COL_ box
    per solid piece; `glass` (material) fills each non-door hole (y0 > 0) with a thin pane."""
    objs = []
    ops = sorted(openings)
    cur = a0
    idx = 0

    def piece(lo, hi, y0, y1, suffix):
        if hi - lo < 0.01 or y1 - y0 < 0.01:
            return None
        mid = (lo + hi) / 2
        if axis == "x":
            o = box(coll, f"{name}_{suffix}", mid, fixed, y0, hi - lo, thick, y1 - y0, mat, tile=2.0)
        else:
            o = box(coll, f"{name}_{suffix}", fixed, mid, y0, thick, hi - lo, y1 - y0, mat, tile=2.0)
        objs.append(o)
        if cols is not None:
            tag = (col_tag or name)
            if axis == "x":
                cols.add(f"{tag}_{suffix}", mid, fixed, y0, hi - lo, thick, y1 - y0)
            else:
                cols.add(f"{tag}_{suffix}", fixed, mid, y0, thick, hi - lo, y1 - y0)
        return o

    for (a, bb, y0, y1) in ops:
        piece(cur, a, 0, H, f"{idx:02d}")
        if y0 > 0.01:
            piece(a, bb, 0, y0, f"{idx:02d}s")
        if y1 < H - 0.01:
            piece(a, bb, y1, H, f"{idx:02d}l")
        if glass is not None and y0 > 0.01:
            mid = (a + bb) / 2
            if axis == "x":
                g = box(coll, f"{name}_Glass{idx}", mid, fixed, y0, bb - a, 0.03, y1 - y0, glass)
            else:
                g = box(coll, f"{name}_Glass{idx}", fixed, mid, y0, 0.03, bb - a, y1 - y0, glass)
            objs.append(g)
        cur = bb
        idx += 1
    piece(cur, a1, 0, H, f"{idx:02d}")
    return objs


def furn(coll, name, gx, gz, rot, parts, join_parts=True):
    """Composite furniture. parts: [(lx, lz, y0, sx, sz, h, mat, bevel)] in the piece's local frame
    (local -z = the direction it faces at rot=0, i.e. game -Z). All parts are joined into one object whose
    origin is center-bottom. `rot` = blender yaw (0 faces game -Z, -pi/2 faces +x, +pi/2 faces -x, pi faces +Z)."""
    c, s = math.cos(rot), math.sin(rot)
    made = []
    for i, p in enumerate(parts):
        lx, lz, y0, sx, sz, h, mat = p[:7]
        bev = p[7] if len(p) > 7 else 0.0
        bx = lx * c - (-lz) * s
        by = lx * s + (-lz) * c
        o = box(coll, f"{name}_p{i}", gx + bx, gz - by, y0, sx, sz, h, mat, rot=rot, bevel=bev)
        made.append(o)
    if join_parts and len(made) > 1:
        return join(coll, name, made)
    made[0].name = name
    return made[0]


# ---------------------------------------------------------------- preview renders
def snapshot(scene, path, cam_game, look_game, lens=24.0, res=(960, 640), hide_prefixes=(), light_strength=1.0):
    """Workbench texture render for visual checks / preview.png. cam_game, look_game: (x, height, z) in game space."""
    import contextlib
    import io
    from mathutils import Vector as V
    cam_data = bpy.data.cameras.new("SNAP_cam")
    cam_data.lens = lens
    cam = bpy.data.objects.new("SNAP_cam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = (cam_game[0], -cam_game[2], cam_game[1])
    d = V((look_game[0], -look_game[2], look_game[1])) - V(cam.location)
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    hidden = []
    for o in scene.objects:
        if o.name.startswith("COL_") or any(o.name.startswith(p) for p in hide_prefixes):
            if not o.hide_render:
                o.hide_render = True
                hidden.append(o)
    scene.render.engine = "BLENDER_WORKBENCH"
    sh = scene.display.shading
    sh.light = "STUDIO"
    sh.color_type = "TEXTURE"
    sh.show_shadows = False
    sh.show_cavity = False
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.film_transparent = False
    scene.render.filepath = path
    scene.render.image_settings.file_format = "PNG"
    # sky-ish background
    if scene.world is None:
        scene.world = bpy.data.worlds.new("SNAP_world")
    scene.world.color = (0.62, 0.77, 0.93)
    old = bpy.context.window.scene
    bpy.context.window.scene = scene
    with contextlib.redirect_stdout(io.StringIO()):
        bpy.ops.render.render(write_still=True)
    bpy.context.window.scene = old
    for o in hidden:
        o.hide_render = False
    bpy.data.objects.remove(cam, do_unlink=True)
    return path


def text_mesh(coll, name, body, gx, gz, y0, size, extrude, mat, facing="+z", resolution=None):
    """Flat 3D lettering as a real mesh (no font data needed at export). facing: '+z' = readable from game +Z.
    resolution: curve resolution of the glyph outlines (Blender default 12); 2-3 keeps small labels cheap."""
    cu = bpy.data.curves.new(name + "_cu", "FONT")
    cu.body = body
    cu.size = size
    cu.extrude = extrude
    if resolution is not None:
        cu.resolution_u = resolution
    cu.align_x = "CENTER"
    cu.align_y = "BOTTOM"
    tmp = bpy.data.objects.new(name + "_tmp", cu)
    coll.objects.link(tmp)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    coll.objects.unlink(tmp)
    bpy.data.objects.remove(tmp)
    bpy.data.curves.remove(cu)
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    # text lies in the XY plane facing +Z(blender); rotate so it faces game +Z (= blender -Y)
    ob.rotation_euler = (math.pi / 2, 0, 0 if facing == "+z" else math.pi)
    ob.location = b(gx, gz, y0)
    coll.objects.link(ob)
    return ob


# ---------------------------------------------------------------- shared interior kit
def std_mats(wall="#eceae4", floor=("#c9b08a", "planks", "#a98b64")):
    """Common IN_ materials shared by every work interior."""
    return {
        "floor": make_mat("IN_Floor", floor[0], 0.6, floor[1], 0.04, accent=floor[2]),
        "wall": make_mat("IN_WallMain", wall, 0.9, "noise", 0.02),
        "ceil": make_mat("IN_Ceiling", "#f4f3ee", 0.95, "noise", 0.01),
        "oak": make_mat("IN_DeskOak", "#c9a36a", 0.55, "planks", 0.04, accent="#a98550"),
        "walnut": make_mat("IN_WoodDark", "#7a5638", 0.5, "planks", 0.04, accent="#5e4129"),
        "metal": make_mat("IN_MetalDark", "#3a3f47", 0.4, "noise", 0.03),
        "steel": make_mat("IN_Steel", "#b9bec6", 0.35, "noise", 0.03),
        "black": make_mat("IN_Bezel", "#16181c", 0.5, "noise", 0.01),
        "glass": make_mat("IN_Glass", "#bfe4f2", 0.1, "noise", 0.01, alpha=0.28),
        "lamp": make_mat("IN_LightPanel", "#fffbe8", 0.5, "noise", 0.0, emit="#fff4d0"),
        "pot": make_mat("IN_Terracotta", "#b9633f", 0.8, "noise", 0.04),
        "leaf": make_mat("IN_Leaf", "#4f9d54", 0.9, "noise", 0.06),
        "sky": make_mat("IN_SkyBackdrop", "#a9cdee", 1.0, "noise", 0.01),
        "mat": make_mat("IN_Doormat", "#3b3b43", 1.0, "stripes", 0.03, accent="#2b2b32"),
        "door": make_mat("IN_DoorWood", "#4a4f57", 0.45, "noise", 0.03),
        "marble": make_mat("IN_Marble", "#e6e3dc", 0.25, "noise", 0.03),
    }


def interior_shell(coll, cols, M, accent_mat, H=3.0, win_front=((-5.5, -2.5), (2.5, 5.5)), win_w=((-6.75, -4.25), (-2.75, -0.25), (1.0, 3.5)),
                   win_e=((-6.75, -4.25), (-2.75, -0.25), (1.0, 3.5)), light_pts=((-4, -6), (0, -6), (4, -6), (-4, -1.5), (0, -1.5), (4, -1.5), (-4, 3), (4, 3)),
                   win_front_y=(0.9, 2.3)):
    """Floor, ceiling, 4 walls (door at x=0 on the front wall z=5.1), door, doormat, accent stripe, ceiling lights, sky."""
    X0, X1, Z0, Z1, T = -7.0, 7.0, -9.0, 5.0, 0.2
    win = (0.9, 2.3)
    objs = []
    objs.append(box(coll, "House_Floor_Main", 0, (Z0 + Z1) / 2, -0.1, X1 - X0, Z1 - Z0, 0.1, M["floor"], tile=2.0))
    objs.append(box(coll, "Ceiling", 0, (Z0 + 5.2) / 2, H, 14.4, 14.4, 0.1, M["ceil"], tile=2.0))
    objs += wall(coll, "Walls_Front", "x", 5.1, T, X0 - T, X1 + T, H, M["wall"],
                 openings=[(a, bb, *win_front_y) for a, bb in win_front] + [(-0.6, 0.6, 0.0, 2.2)], cols=cols, glass=M["glass"], col_tag="Wall_Front")
    objs += wall(coll, "Walls_Back", "x", Z0 - 0.1, T, X0 - T, X1 + T, H, M["wall"], cols=cols, col_tag="Wall_Back")
    objs += wall(coll, "Walls_W", "z", X0 - 0.1, T, Z0, 5.2, H, M["wall"], openings=[(a, bb, *win) for a, bb in win_w], cols=cols, glass=M["glass"], col_tag="Wall_W")
    objs += wall(coll, "Walls_E", "z", X1 + 0.1, T, Z0, 5.2, H, M["wall"], openings=[(a, bb, *win) for a, bb in win_e], cols=cols, glass=M["glass"], col_tag="Wall_E")
    objs.append(box(coll, "Door_Entrance", 0, 5.1, 0.01, 1.18, 0.06, 2.18, M["door"], bevel=0.02))
    objs.append(box(coll, "Door_Entrance_Handle", 0.42, 4.97, 0.98, 0.04, 0.12, 0.04, M["metal"]))
    objs.append(box(coll, "Door_Entrance_Sign", 0, 4.99, 2.37, 0.5, 0.02, 0.16, accent_mat))
    objs.append(box(coll, "Entry_Doormat", 0, 4.5, 0.0, 1.0, 0.6, 0.012, M["mat"]))
    objs.append(box(coll, "Wall_AccentStripe", 0, Z0 + 0.03, 1.3, 13.8, 0.04, 0.3, accent_mat))
    for i, (lx, lz) in enumerate(light_pts):
        objs.append(box(coll, f"Light_{i:02d}", lx, lz, H - 0.05, 1.4, 0.4, 0.05, M["lamp"]))
    for nm, gx, gz, sx, sz in [("Sky_Back", 0, -13, 32, 0.05), ("Sky_Front", 0, 14, 32, 0.05), ("Sky_West", -12, 2, 0.05, 32), ("Sky_East", 12, 2, 0.05, 32)]:
        objs.append(box(coll, nm, gx, gz, -3.0, sx, sz, 9.0, M["sky"]))
    return objs


INTERIOR_FRONT_OUTER_Z = 5.2
INTERIOR_BACK_OUTER_Z = -9.2
INTERIOR_FLOOR_Y = 0.2
SHELL_THICKNESS = 0.2
SHELL_GAP = 0.005
DOOR_OPENING = (-0.6, 0.6, 0.0, 2.2)


def walk_in_shell(coll, cols, W, zf, H, mat, glass, front, west, east, interior_back=INTERIOR_BACK_OUTER_Z):
    t = SHELL_THICKNESS
    oz = zf - t - SHELL_GAP - INTERIOR_FRONT_OUTER_Z
    zb = oz + interior_back - SHELL_GAP - t
    fy = INTERIOR_FLOOR_Y
    lift = lambda y: y + fy if y > 0.01 else 0.0
    front_ops = [(a, bb, lift(y0), y1 + fy) for a, bb, y0, y1 in [*front, DOOR_OPENING]]
    side = lambda ops: [(a + oz, bb + oz, y0 + fy, y1 + fy) for a, bb, y0, y1 in ops]
    hw = W / 2
    objs = []
    objs += wall(coll, "EX_ShellFront", "x", zf - t / 2, t, -hw, hw, H, mat, openings=front_ops, cols=cols, glass=glass, col_tag="Shell_Front")
    objs += wall(coll, "EX_ShellBack", "x", zb + t / 2, t, -hw, hw, H, mat, cols=cols, col_tag="Shell_Back")
    objs += wall(coll, "EX_ShellW", "z", -hw + t / 2, t, zb + t, zf - t, H, mat, openings=side(west), cols=cols, glass=glass, col_tag="Shell_W")
    objs += wall(coll, "EX_ShellE", "z", hw - t / 2, t, zb + t, zf - t, H, mat, openings=side(east), cols=cols, glass=glass, col_tag="Shell_E")
    return objs, (0.0, fy, oz), zb


def perimeter(coll, name, W, zf, zb, y0, h, thick, mat, front_gaps=(), tile=1.0):
    hw = W / 2
    objs = []
    cur, idx = -hw, 0
    for a, bb in sorted(front_gaps):
        if a - cur > 0.01:
            objs.append(box(coll, f"{name}_Front{idx}", (cur + a) / 2, zf - thick / 2, y0, a - cur, thick, h, mat, tile=tile))
        cur, idx = bb, idx + 1
    objs.append(box(coll, f"{name}_Front{idx}", (cur + hw) / 2, zf - thick / 2, y0, hw - cur, thick, h, mat, tile=tile))
    objs.append(box(coll, f"{name}_Back", 0, zb + thick / 2, y0, W, thick, h, mat, tile=tile))
    for side, x in (("W", -hw + thick / 2), ("E", hw - thick / 2)):
        objs.append(box(coll, f"{name}_{side}", x, (zf + zb) / 2, y0, thick, zf - zb - 2 * thick, h, mat, tile=tile))
    return objs


def hinged_door(coll, parts, hinge_x, zf, y0):
    stale = bpy.data.objects.get("Door")
    if stale:
        stale.name = "Door_stale"
    door = join(coll, "Door", [box(coll, f"Door_{i}", gx, zf, y0 + py, sx, sz, h, m, bevel=bv) for i, (gx, py, sx, sz, h, m, bv) in enumerate(parts)])
    pivot = Vector(b(hinge_x, zf, y0))
    door.data.transform(Matrix.Translation(door.location - pivot))
    door.location = pivot
    return door


def chair_parts(M, seat, back=None):
    back = back or seat
    return [(0, 0, 0.45, 0.46, 0.46, 0.06, seat, 0.01), (0, 0.22, 0.51, 0.44, 0.06, 0.48, back, 0.01),
            (0, 0, 0.04, 0.06, 0.06, 0.41, M["metal"]), (0, 0, 0.0, 0.52, 0.05, 0.04, M["metal"]), (0, 0, 0.0, 0.05, 0.52, 0.04, M["metal"])]


def plant(coll, M, name, gx, gz):
    return furn(coll, name, gx, gz, 0.0, [(0, 0, 0.0, 0.4, 0.4, 0.4, M["pot"], 0.03), (0, 0, 0.4, 0.5, 0.5, 0.5, M["leaf"], 0.08), (0, 0, 0.9, 0.35, 0.35, 0.4, M["leaf"], 0.06)])


ALLOW_INTERIOR = ("House_Floor", "Door_", "Light_", "Wall_", "Walls_", "Glass_", "Entry_", "Sky_")


def gable_roof(coll, name, gx, gz, y0, sx, sz, h, mat, ridge_axis="x", tile=2.0):
    """Two-slope roof prism: footprint sx x sz centred on (gx, gz), ridge height h above y0. Origin center-bottom."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    hx, hz = sx / 2, sz / 2
    # blender coords: x = game x, y = -game z
    if ridge_axis == "x":
        base = [(-hx, -hz, 0), (hx, -hz, 0), (hx, hz, 0), (-hx, hz, 0)]
        ridge = [(-hx, 0, h), (hx, 0, h)]
        faces = [(0, 1, 5, 4), (2, 3, 4, 5), (0, 4, 3), (1, 2, 5), (0, 3, 2, 1)]
    else:
        base = [(-hx, -hz, 0), (hx, -hz, 0), (hx, hz, 0), (-hx, hz, 0)]
        ridge = [(0, -hz, h), (0, hz, h)]
        faces = [(0, 1, 4), (2, 3, 5), (1, 2, 5, 4), (3, 0, 4, 5), (0, 3, 2, 1)]
    vs = [bm.verts.new(p) for p in base + ridge]
    for f in faces:
        try:
            bm.faces.new([vs[i] for i in f])
        except ValueError:
            pass
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    _box_uv(bm, tile)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    ob.location = b(gx, gz, y0)
    coll.objects.link(ob)
    return ob


REF_TEXTURE_SIZE = 256
FLAT_EDGE_PX = 3
PALETTE_SMOOTH_PASSES = 2
PALETTE_SAMPLE_SIZE = 512
SHADE_HUE_GAP = 0.06
SHADE_MIN_SATURATION = 0.25
SHADE_MAX_VALUE_GAP = 0.3


def _bleed_subject(rgb, subject):
    import numpy as np
    color = np.where(subject[..., None], rgb, 0.0)
    filled = subject.astype(np.float32)
    while not filled.all():
        total = np.zeros_like(color)
        count = np.zeros_like(filled)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            total += np.roll(np.roll(color * filled[..., None], dy, axis=0), dx, axis=1)
            count += np.roll(np.roll(filled, dy, axis=0), dx, axis=1)
        grow = (filled == 0) & (count > 0)
        color[grow] = total[grow] / count[grow][..., None]
        filled[grow] = 1.0
    return np.where(filled[..., None] > 0, color, rgb).astype(np.float32)


def _erode(mask, pixels):
    import numpy as np
    for _ in range(pixels):
        mask = mask & np.roll(mask, 1, 0) & np.roll(mask, -1, 0) & np.roll(mask, 1, 1) & np.roll(mask, -1, 1)
    return mask


def _kmeans(pixels, k):
    import numpy as np
    rng = np.random.default_rng(0)
    centres = [pixels[rng.integers(len(pixels))]]
    for _ in range(1, k):
        far = np.min([((pixels - c) ** 2).sum(axis=1) for c in centres], axis=0)
        centres.append(pixels[rng.choice(len(pixels), p=far / far.sum())])
    centres = np.array(centres)
    for _ in range(20):
        labels = np.argmin(((pixels[:, None] - centres[None]) ** 2).sum(axis=2), axis=1)
        centres = np.array([pixels[labels == i].mean(axis=0) if (labels == i).any() else centres[i] for i in range(k)])
    return centres


def _merge_shades(pixels, centres):
    import colorsys
    import numpy as np
    labels = np.argmin(((pixels[:, None] - centres[None]) ** 2).sum(axis=2), axis=1)
    counts = np.bincount(labels, minlength=len(centres))
    hsv = [colorsys.rgb_to_hsv(*c) for c in centres]
    keep = list(range(len(centres)))
    for a in sorted(range(len(centres)), key=lambda i: counts[i]):
        for b in keep:
            if b == a or counts[b] < counts[a]:
                continue
            hue_gap = min(abs(hsv[a][0] - hsv[b][0]), 1 - abs(hsv[a][0] - hsv[b][0]))
            if hue_gap < SHADE_HUE_GAP and min(hsv[a][1], hsv[b][1]) > SHADE_MIN_SATURATION and abs(hsv[a][2] - hsv[b][2]) < SHADE_MAX_VALUE_GAP:
                keep.remove(a)
                break
    return centres[keep]


def _posterize(rgb, centres):
    import numpy as np
    labels = np.argmin(((rgb[:, :, None] - centres[None, None]) ** 2).sum(axis=3), axis=2)
    for _ in range(PALETTE_SMOOTH_PASSES):
        stack = np.stack([np.roll(np.roll(labels, dy, 0), dx, 1) for dy in (-1, 0, 1) for dx in (-1, 0, 1)])
        votes = np.stack([(stack == i).sum(axis=0) for i in range(len(centres))])
        labels = np.argmax(votes, axis=0)
    return centres[labels].astype(np.float32)


def project_ref_image(objs, image_path, material_name, background_threshold=0.3, highlight_margin=0.12, near_white=0.9, grey_spread=0.08, max_washed=0.3,
                      palette=0):
    import numpy as np
    source = bpy.data.images.load(image_path, check_existing=True)
    if min(source.size) < REF_TEXTURE_SIZE:
        raise ValueError(f"{image_path}: {tuple(source.size)} is smaller than {REF_TEXTURE_SIZE} px")
    step = source.size[0] // (PALETTE_SAMPLE_SIZE if palette else REF_TEXTURE_SIZE)
    pixels = np.empty(source.size[0] * source.size[1] * 4, dtype=np.float32)
    source.pixels.foreach_get(pixels)
    rgb = np.ascontiguousarray(pixels.reshape(source.size[1], source.size[0], 4)[::step, ::step, :3])
    height, width = rgb.shape[:2]
    if palette:
        mask_path = os.path.join(os.path.dirname(image_path), "mask.png")
        if not os.path.exists(mask_path):
            raise ValueError(f"{mask_path} is missing: a palette projection needs the rembg silhouette (map-src/CampusCove/ai_mask.py)")
        mask = bpy.data.images.load(mask_path, check_existing=True)
        alpha = np.empty(mask.size[0] * mask.size[1] * 4, dtype=np.float32)
        mask.pixels.foreach_get(alpha)
        subject = np.ascontiguousarray(alpha.reshape(mask.size[1], mask.size[0], 4)[::step, ::step, 0]) > 0.5
    else:
        subject = np.abs(rgb - rgb[2, 2]).sum(axis=-1) > background_threshold
    rows, cols = np.nonzero(subject)
    if rows.size == 0:
        raise ValueError(f"{image_path}: no subject found on the background")
    px0, px1, py0, py1 = cols.min(), cols.max(), rows.min(), rows.max()
    lightness = rgb.max(axis=-1)
    washed = subject & (lightness > near_white) & (rgb.max(axis=-1) - rgb.min(axis=-1) < grey_spread)
    highlight = subject & (lightness > np.percentile(lightness[subject], 85) + highlight_margin)
    if washed.sum() < max_washed * subject.sum():
        highlight |= washed
    seed = _erode(subject, FLAT_EDGE_PX) if palette else subject & ~highlight
    if not seed.any():
        raise ValueError(f"{image_path}: the whole subject reads as highlight")
    bled = _bleed_subject(rgb, seed)
    if palette:
        bled = _posterize(bled, _merge_shades(rgb[seed], _kmeans(rgb[seed], palette)))
    image = bpy.data.images.new(material_name, width, height)
    image.pixels.foreach_set(np.concatenate([bled, np.ones((height, width, 1), dtype=np.float32)], axis=-1).ravel())
    image.pack()
    material = bpy.data.materials.new(material_name)
    material.use_nodes = True
    shader = next(n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    shader.inputs["Roughness"].default_value = 0.8
    texture = material.node_tree.nodes.new("ShaderNodeTexImage")
    texture.image = image
    material.node_tree.links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    points = {o: [o.matrix_world @ v.co for v in o.data.vertices] for o in objs}
    every = [p for pts in points.values() for p in pts]
    x0, x1 = min(p.x for p in every), max(p.x for p in every)
    z0, z1 = min(p.z for p in every), max(p.z for p in every)
    for o in objs:
        mesh = o.data
        uv = mesh.uv_layers.new(name="RefProjection")
        mesh.uv_layers.active = uv
        for loop in mesh.loops:
            p = points[o][loop.vertex_index]
            uv.data[loop.index].uv = ((px0 + (p.x - x0) / (x1 - x0) * (px1 - px0)) / width, (py0 + (p.z - z0) / (z1 - z0) * (py1 - py0)) / height)
        for layer in [layer for layer in mesh.uv_layers if layer.name != uv.name]:
            mesh.uv_layers.remove(layer)
        mesh.materials.clear()
        mesh.materials.append(material)
    return material


def fence_run(coll, name, ax, az, bx, bz, post_mat, rail_mat, spacing=2.5):
    length = math.hypot(bx - ax, bz - az)
    yaw = math.atan2(-(bz - az), bx - ax)
    steps = max(1, round(length / spacing))
    objs = [box(coll, f"{name}_Post{k:02d}", ax + (bx - ax) * k / steps, az + (bz - az) * k / steps, 0.0, 0.14, 0.14, 1.1, post_mat) for k in range(steps + 1)]
    objs += [box(coll, f"{name}_Rail{k}", (ax + bx) / 2, (az + bz) / 2, h, length + 0.05, 0.07, 0.09, rail_mat, rot=yaw) for k, h in enumerate((0.45, 0.85))]
    collision = {"cx": (ax + bx) / 2, "cz": (az + bz) / 2, "sx": length + 0.2, "sz": 0.3, "h": 1.2, "yaw": yaw}
    return objs, collision


def _read_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _decor_collision(prop, cuboids, col_prefix):
    x, y, z = prop["position"]
    sx, sy, sz = prop["scale"]
    yaw = prop["yaw"]
    cos, sin = math.cos(yaw), math.sin(yaw)
    out = []
    for i, c in enumerate(cuboids):
        if abs(c["qx"]) > 1e-6 or abs(c["qz"]) > 1e-6:
            raise ValueError(f"decor/{prop['key']}/collision.json: cuboid {i} is tilted, only yaw is baked")
        lx, lz = c["cx"] * sx, c["cz"] * sz
        out.append({
            "name": f"{col_prefix}ZD_{prop['id']}_{i}",
            "cx": round(x + lx * cos + lz * sin, 3),
            "cy": round(y + c["cy"] * sy, 3),
            "cz": round(z - lx * sin + lz * cos, 3),
            "hx": round(c["hx"] * sx, 3),
            "hy": round(c["hy"] * sy, 3),
            "hz": round(c["hz"] * sz, 3),
            "yaw": round(yaw + 2 * math.atan2(c["qy"], c["qw"]), 4),
        })
    return out


def _crop_prototype(coll, crop_key, crop, cache):
    if crop_key in cache:
        return cache[crop_key]
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(FRONT_ASSETS, *crop["plant"].split("/")))
    imported = [o for o in bpy.data.objects if o not in before]
    bpy.context.view_layer.update()
    meshes = [o for o in imported if o.type == "MESH"]
    if not meshes:
        raise ValueError(f"{crop['plant']} has no mesh")
    for o in meshes:
        world = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = world
        for c in list(o.users_collection):
            c.objects.unlink(o)
        coll.objects.link(o)
    for o in imported:
        if o.type != "MESH":
            bpy.data.objects.remove(o, do_unlink=True)
    proto = join(coll, f"ZD_crop_{crop_key}", meshes) if len(meshes) > 1 else meshes[0]
    proto.location = (0.0, 0.0, 0.0)
    proto.rotation_euler = (0.0, 0.0, 0.0)
    proto.name = proto.data.name = f"ZD_crop_{crop_key}"
    coll.objects.unlink(proto)
    cache[crop_key] = proto
    return proto


def _place_field(coll, prop, crops, cache):
    crop = crops[prop["crop"]]
    x, y, z = prop["position"]
    width, depth = prop["size"]
    soil_mat = make_mat("TW_FieldSoil", "#6e4b32", 1.0, "stripes", 0.05, accent="#5a3c27")
    objs = [box(coll, f"ZD_{prop['id']}_soil", x, z, y, width, depth, FIELD_SOIL, soil_mat, rot=prop["yaw"], tile=1.5)]
    proto = _crop_prototype(coll, prop["crop"], crop, cache)
    plants = []
    for i, (px, py, pz, pyaw) in enumerate(prop["plants"]):
        ob = bpy.data.objects.new(f"ZD_{prop['id']}_{i:03d}", proto.data)
        coll.objects.link(ob)
        ob.location = b(px, pz, py + FIELD_SOIL)
        ob.rotation_euler = (0.0, 0.0, pyaw)
        objs.append(ob)
        plants.append({"crop": prop["crop"], "position": [px, round(py + FIELD_SOIL, 3), pz]})
    return objs, plants


def _place_decor(coll, prop):
    x, y, z = prop["position"]
    sx, sy, sz = prop["scale"]
    placement = Matrix.Translation(b(x, z, y)) @ Matrix.Rotation(prop["yaw"], 4, "Z") @ Matrix.Diagonal((sx, sz, sy, 1.0))
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(FRONT_ASSETS, "decor", prop["key"], "model.glb"))
    imported = [o for o in bpy.data.objects if o not in before]
    bpy.context.view_layer.update()
    meshes = [o for o in imported if o.type == "MESH"]
    if not meshes:
        raise ValueError(f"decor/{prop['key']}/model.glb has no mesh")
    worlds = {o: placement @ o.matrix_world for o in meshes}
    for o in meshes:
        o.parent = None
        o.matrix_world = worlds[o]
        for c in list(o.users_collection):
            c.objects.unlink(o)
        coll.objects.link(o)
    for o in imported:
        if o.type != "MESH":
            bpy.data.objects.remove(o, do_unlink=True)
    for i, o in enumerate(meshes):
        o.name = f"ZD_{prop['id']}_{prop['key']}" + (f"_{i}" if len(meshes) > 1 else "")
        o.data.name = o.name
    return meshes


def zone_decor(coll, zone_key, col_prefix):
    path = os.path.join(FRONT_ASSETS, "zones", f"{zone_key}.json")
    listed = zone_key in _read_json(os.path.join(FRONT_ASSETS, "zones", "index.json"))["zones"]
    if listed != os.path.exists(path):
        raise ValueError(f"zones/index.json and zones/{zone_key}.json disagree: listed {listed}, file {os.path.exists(path)}")
    if not listed:
        return [], [], []
    decor = _read_json(path)
    if decor["zone"] != zone_key:
        raise ValueError(f"zones/{zone_key}.json belongs to zone {decor['zone']}")
    crops = _read_json(os.path.join(FRONT_ASSETS, "crops", "crops.json"))["crops"]
    objs, cols, plants, prototypes = [], [], [], {}
    for prop in decor["props"]:
        if prop["kind"] == "field":
            field_objs, field_plants = _place_field(coll, prop, crops, prototypes)
            objs += field_objs
            plants += field_plants
        elif prop["kind"] == "decor":
            objs += _place_decor(coll, prop)
            cols += _decor_collision(prop, _read_json(os.path.join(FRONT_ASSETS, "decor", prop["key"], "collision.json"))["cuboids"], col_prefix)
    return objs, cols, plants


def import_ai_model(coll, slug, material_name, palette=0):
    folder = os.path.join(OUT_ROOT, "ai", slug)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(folder, "model.glb"))
    imported = [o for o in bpy.data.objects if o not in before]
    bpy.context.view_layer.update()
    meshes = [o for o in imported if o.type == "MESH"]
    if not meshes:
        raise ValueError(f"out/ai/{slug}/model.glb has no mesh")
    for o in meshes:
        world = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = world
        for c in list(o.users_collection):
            c.objects.unlink(o)
        coll.objects.link(o)
    for o in imported:
        if o.type != "MESH":
            bpy.data.objects.remove(o, do_unlink=True)
    project_ref_image(meshes, os.path.join(folder, "ref.png"), material_name, palette=palette)
    return meshes


def ship_decor(sc, coll, key, parts, max_materials):
    obj = join(coll, f"Decor_{key}", parts)
    obj.location = (0, 0, 0)
    bpy.context.view_layer.update()
    obj.location.z -= min((obj.matrix_world @ Vector(c)).z for c in obj.bound_box)
    bpy.context.view_layer.update()
    bad = check_grounded([obj])
    if bad:
        raise RuntimeError(f"{key} is not grounded: {bad}")
    if len(obj.data.materials) > max_materials:
        raise RuntimeError(f"{key} uses {len(obj.data.materials)} materials (max {max_materials})")
    out = os.path.join(OUT_ROOT, "decor", key)
    os.makedirs(out, exist_ok=True)
    export_glb(os.path.join(out, "model.glb"), [obj])
    os.makedirs(os.path.join(FRONT_ASSETS, "decor", key), exist_ok=True)
    render_preview(sc, obj, os.path.join(FRONT_ASSETS, "decor", key, "preview.png"))
    obj.hide_render = True
    return {"key": key, "tris": sum(len(p.vertices) - 2 for p in obj.data.polygons), "dims": tuple(round(x, 3) for x in obj.dimensions)}


APPLE_ON_TREE_TRIS = 50
APPLE_ON_TREE_HEIGHT = 0.24
CROWN_BRIGHTNESS = 1.5
_tree_apple = {}


def _apple_for_trees(coll):
    if "mesh" not in _tree_apple:
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(FRONT_ASSETS, "items", "farm", "apple", "model.glb"))
        imported = [o for o in bpy.data.objects if o not in before]
        meshes = [o for o in imported if o.type == "MESH"]
        if len(meshes) != 1:
            raise ValueError(f"items/farm/apple/model.glb should hold one mesh, got {len(meshes)}")
        apple = meshes[0]
        for o in imported:
            if o is not apple:
                bpy.data.objects.remove(o, do_unlink=True)
        apple.parent = None
        for c in list(apple.users_collection):
            c.objects.unlink(apple)
        coll.objects.link(apple)
        bpy.context.view_layer.objects.active = apple
        decimate = apple.modifiers.new("Decimate", "DECIMATE")
        decimate.ratio = APPLE_ON_TREE_TRIS / sum(len(p.vertices) - 2 for p in apple.data.polygons)
        bpy.ops.object.modifier_apply(modifier=decimate.name)
        apple.data.transform(apple.matrix_world)
        apple.matrix_world.identity()
        low = min(v.co.z for v in apple.data.vertices)
        size = max(v.co.z for v in apple.data.vertices) - low
        apple.data.transform(Matrix.Scale(APPLE_ON_TREE_HEIGHT / size, 4) @ Matrix.Translation((0, 0, -low - size / 2)))
        coll.objects.unlink(apple)
        if len(apple.data.uv_layers) != 1 or len(apple.data.materials) != 1:
            raise ValueError("items/farm/apple/model.glb should have one UV map and one material")
        apple.data.uv_layers[0].name = "RefProjection"
        apple.data.materials[0].name = "IT_Crop_Apple"
        if apple.data.materials[0].name != "IT_Crop_Apple":
            raise ValueError(f"another material already holds the name IT_Crop_Apple: {apple.data.materials[0].name}")
        _tree_apple["mesh"] = apple.data
    return _tree_apple["mesh"]


def _fibonacci(count):
    golden = math.pi * (3 - math.sqrt(5))
    for i in range(count):
        z = 1 - 2 * (i + 0.5) / count
        r = math.sqrt(1 - z * z)
        yield Vector((r * math.cos(golden * i), r * math.sin(golden * i), z))


def _apple_directions(layout, rnd):
    if layout == "spread":
        return [(d, 1.0) for d in _fibonacci(22) if d.z > -0.55]
    if layout == "low":
        return [(d, 1.0) for d in _fibonacci(40) if -0.6 < d.z < 0.05]
    if layout == "clusters":
        picks = []
        for centre in [d for d in _fibonacci(9) if d.z > -0.4][:5]:
            for _ in range(3):
                picks.append(((centre + Vector((rnd.uniform(-0.22, 0.22), rnd.uniform(-0.22, 0.22), rnd.uniform(-0.22, 0.22)))).normalized(), 0.9))
        return picks
    if layout == "few_big":
        return [(d, 1.45) for d in _fibonacci(9) if d.z > -0.5]
    raise ValueError(f"unknown apple layout {layout}")


def _brighten(material, factor):
    import numpy as np
    image = next(n for n in material.node_tree.nodes if n.type == "TEX_IMAGE").image
    pixels = np.empty(len(image.pixels), dtype=np.float32)
    image.pixels.foreach_get(pixels)
    rgba = pixels.reshape(-1, 4)
    rgba[:, :3] = np.clip(rgba[:, :3] * factor, 0.0, 1.0)
    image.pixels.foreach_set(rgba.ravel())
    image.pack()


EYE_DARK = 0.22
EYE_MIN_AREA = 0.0002
EYE_MAX_AREA = 0.006
EYE_HEAD_SHARE = 0.3
EYE_SIZE_BOOST = 1.15


def _image_rgb(path, size):
    import numpy as np
    image = bpy.data.images.load(path, check_existing=True)
    step = image.size[0] // size
    pixels = np.empty(image.size[0] * image.size[1] * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    return np.ascontiguousarray(pixels.reshape(image.size[1], image.size[0], 4)[::step, ::step, :3])


def _find_pupil(rgb, subject):
    import numpy as np
    from collections import deque
    rows, cols = np.nonzero(subject)
    head = subject & (np.arange(subject.shape[1])[None, :] > cols.max() - EYE_HEAD_SHARE * (cols.max() - cols.min()))
    head &= np.arange(subject.shape[0])[:, None] > rows.min() + 0.4 * (rows.max() - rows.min())
    dark = head & (rgb.max(axis=-1) < EYE_DARK)
    left = dark.copy()
    h, w = dark.shape
    found = []
    for y, x in zip(*np.nonzero(dark)):
        if not left[y, x]:
            continue
        left[y, x] = False
        queue, cells = deque([(y, x)]), []
        while queue:
            cy, cx = queue.popleft()
            cells.append((cy, cx))
            for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                if 0 <= ny < h and 0 <= nx < w and left[ny, nx]:
                    left[ny, nx] = False
                    queue.append((ny, nx))
        area = len(cells) / subject.sum()
        cells = np.array(cells)
        span = cells.max(axis=0) - cells.min(axis=0) + 1
        if EYE_MIN_AREA <= area <= EYE_MAX_AREA and max(span) <= 2 * min(span):
            found.append((len(cells), cells.mean(axis=0), np.sqrt(len(cells) / np.pi)))
    if not found:
        return None
    _, (row, col), radius = max(found, key=lambda f: f[0])
    return row, col, radius


def add_ai_eyes(coll, obj, slug, material_name):
    import numpy as np
    from mathutils.bvhtree import BVHTree
    folder = os.path.join(OUT_ROOT, "ai", slug)
    rgb = _image_rgb(os.path.join(folder, "ref.png"), PALETTE_SAMPLE_SIZE)
    subject = _image_rgb(os.path.join(folder, "mask.png"), PALETTE_SAMPLE_SIZE)[:, :, 0] > 0.5
    pupil = _find_pupil(rgb, subject)
    if pupil is None:
        raise ValueError(f"out/ai/{slug}/ref.png: no eye found on the head (a small dark spot); regenerate the concept image")
    row, col, radius_px = pupil
    rows, cols = np.nonzero(subject)
    verts = [obj.matrix_world @ v.co for v in obj.data.vertices]
    x0, x1 = min(p.x for p in verts), max(p.x for p in verts)
    z0, z1 = min(p.z for p in verts), max(p.z for p in verts)
    metres_per_px = (x1 - x0) / (cols.max() - cols.min())
    target = Vector((x0 + (col - cols.min()) * metres_per_px, 0.0, z0 + (row - rows.min()) * (z1 - z0) / (rows.max() - rows.min())))
    radius = radius_px * metres_per_px * EYE_SIZE_BOOST
    bvh = BVHTree.FromObject(obj, bpy.context.evaluated_depsgraph_get())
    inverse = obj.matrix_world.inverted()
    depth = max(p.y for p in verts) - min(p.y for p in verts)
    glossy = bpy.data.materials.new(material_name)
    glossy.use_nodes = True
    shader = next(n for n in glossy.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = (0.02, 0.02, 0.02, 1.0)
    shader.inputs["Roughness"].default_value = 0.15
    eyes = []
    for side in (1.0, -1.0):
        start = target + Vector((0.0, side * depth * 2, 0.0))
        hit, normal, _, _ = bvh.ray_cast(inverse @ start, inverse.to_3x3() @ Vector((0.0, -side, 0.0)))
        if hit is None:
            raise ValueError(f"out/ai/{slug}: the eye at {tuple(round(c, 3) for c in target)} misses the head on side {side:+.0f}")
        mesh = bpy.data.meshes.new(f"{material_name}_{'L' if side > 0 else 'R'}")
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=2, radius=radius)
        bm.to_mesh(mesh)
        bm.free()
        mesh.materials.append(glossy)
        eye = bpy.data.objects.new(mesh.name, mesh)
        world_normal = (obj.matrix_world.to_3x3() @ normal).normalized()
        eye.location = obj.matrix_world @ hit - world_normal * radius * 0.35
        eye.rotation_euler = world_normal.to_track_quat("Z", "Y").to_euler()
        eye.scale = (1.0, 1.0, 0.55)
        coll.objects.link(eye)
        for poly in mesh.polygons:
            poly.use_smooth = True
        eyes.append(eye)
    return eyes


def import_ai_apple_tree(coll, slug, material_name, layout):
    from mathutils.bvhtree import BVHTree
    meshes = import_ai_model(coll, slug, material_name)
    if len(meshes) != 1:
        raise ValueError(f"out/ai/{slug} should hold one mesh, got {len(meshes)}")
    tree = meshes[0]
    _brighten(tree.data.materials[0], CROWN_BRIGHTNESS)
    tree.data.transform(tree.matrix_world)
    tree.matrix_world.identity()
    top = max(v.co.z for v in tree.data.vertices)
    crown = [v.co for v in tree.data.vertices if v.co.z > 0.45 * top]
    centre = sum(crown, Vector()) / len(crown)
    reach = max((c - centre).length for c in crown) * 2
    bvh = BVHTree.FromObject(tree, bpy.context.evaluated_depsgraph_get())
    apple_mesh = _apple_for_trees(coll)
    rnd = random.Random(slug)
    apples = []
    for direction, scale in _apple_directions(layout, rnd):
        hit, normal, _, _ = bvh.ray_cast(centre + direction * reach, -direction)
        if hit is None:
            continue
        apple = bpy.data.objects.new(f"{material_name}_Apple{len(apples)}", apple_mesh)
        apple.location = hit + normal * (APPLE_ON_TREE_HEIGHT * scale * 0.2)
        apple.rotation_euler = (rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3), rnd.uniform(0, 2 * math.pi))
        apple.scale = (scale, scale, scale)
        coll.objects.link(apple)
        apple.data = apple.data.copy()
        apples.append(apple)
    if len(apples) < 4:
        raise ValueError(f"out/ai/{slug}: only {len(apples)} apples landed on the crown ({layout})")
    return [tree] + apples


def render_preview(sc, obj, path):
    import contextlib
    import io
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    ctr = sum(corners, Vector()) / 8
    cam_data = bpy.data.cameras.new("PV_cam")
    cam_data.type = "ORTHO"
    cam = bpy.data.objects.new("PV_cam", cam_data)
    sc.collection.objects.link(cam)
    cam.location = ctr + Vector((0.5, -0.9, 0.7)).normalized() * 3
    cam.rotation_euler = (ctr - cam.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.view_layer.update()
    inv = cam.matrix_world.inverted()
    pts = [inv @ c for c in corners]
    w = max(p.x for p in pts) - min(p.x for p in pts)
    h = max(p.y for p in pts) - min(p.y for p in pts)
    cam_data.ortho_scale = max(w, h) * 1.12
    cam_data.shift_x = (max(p.x for p in pts) + min(p.x for p in pts)) / 2 / cam_data.ortho_scale
    cam_data.shift_y = (max(p.y for p in pts) + min(p.y for p in pts)) / 2 / cam_data.ortho_scale
    sc.camera = cam
    sun = bpy.data.objects.new("PV_sun", bpy.data.lights.new("PV_sun", "SUN"))
    sun.data.energy = 2.6
    sun.rotation_euler = (0.8, 0.3, 0.7)
    sc.collection.objects.link(sun)
    sc.render.engine = "BLENDER_EEVEE"
    if sc.world is None:
        sc.world = bpy.data.worlds.new("PV_world")
        sc.world.use_nodes = True
        bg = next(n for n in sc.world.node_tree.nodes if n.type == "BACKGROUND")
        bg.inputs[0].default_value = (0.42, 0.45, 0.55, 1.0)
        bg.inputs[1].default_value = 0.9
    sc.view_settings.view_transform = "Standard"
    sc.render.resolution_x = sc.render.resolution_y = 512
    sc.render.film_transparent = True
    sc.render.filepath = path
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    hidden = [o for o in sc.objects if o.type == "MESH" and o is not obj and not o.hide_render]
    for o in hidden:
        o.hide_render = True
    with contextlib.redirect_stdout(io.StringIO()):
        bpy.ops.render.render(write_still=True)
    for o in hidden:
        o.hide_render = False
    bpy.data.objects.remove(cam, do_unlink=True)
    bpy.data.objects.remove(sun, do_unlink=True)
