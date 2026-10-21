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
from mathutils import Vector

OUT_ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "out"))

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
def export_glb(path, objs):
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


def text_mesh(coll, name, body, gx, gz, y0, size, extrude, mat, facing="+z"):
    """Flat 3D lettering as a real mesh (no font data needed at export). facing: '+z' = readable from game +Z."""
    cu = bpy.data.curves.new(name + "_cu", "FONT")
    cu.body = body
    cu.size = size
    cu.extrude = extrude
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
                   win_e=((-6.75, -4.25), (-2.75, -0.25), (1.0, 3.5)), light_pts=((-4, -6), (0, -6), (4, -6), (-4, -1.5), (0, -1.5), (4, -1.5), (-4, 3), (4, 3))):
    """Floor, ceiling, 4 walls (door at x=0 on the front wall z=5.1), door, doormat, accent stripe, ceiling lights, sky."""
    X0, X1, Z0, Z1, T = -7.0, 7.0, -9.0, 5.0, 0.2
    win = (0.9, 2.3)
    objs = []
    objs.append(box(coll, "House_Floor_Main", 0, (Z0 + Z1) / 2, -0.1, X1 - X0, Z1 - Z0, 0.1, M["floor"], tile=2.0))
    objs.append(box(coll, "Ceiling", 0, (Z0 + 5.2) / 2, H, 14.4, 14.4, 0.1, M["ceil"], tile=2.0))
    objs += wall(coll, "Walls_Front", "x", 5.1, T, X0 - T, X1 + T, H, M["wall"],
                 openings=[(a, bb, *win) for a, bb in win_front] + [(-0.6, 0.6, 0.0, 2.2)], cols=cols, glass=M["glass"], col_tag="Wall_Front")
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
