"""Open world doors for the 10 town houses (docs/OPEN_WORLD.md, phase 0).

The house build scripts are lost, so this edits the shipped exterior.glb: the door leaf (+ its window and
knob) becomes its own node `Door`, origin on the hinge, and the door frame and the front wall get a
walk-through opening. interior.glb needs nothing: its front wall already has a 1.2 x 2.2 m opening behind
`Door_Entrance`.
Raw exports go to out/houses/<key>/, then `npm run assets:optimize -- houses` compresses them back into
front/public/assets/houses/<key>/. The door metadata used by the town layout is printed per house.

Headless only (resets the file for each house):
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
    --python map-src/CampusCove/build_house_doors.py
"""
import json
import os
import re
import sys

import bmesh
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.normpath(os.path.join(HERE, "..", "..", "front", "public", "assets", "houses"))
OUT = os.path.join(HERE, "out", "houses")
KEYS = [f"house_{i:02d}" for i in range(1, 11)]

OPENING_HALF_WIDTH = 0.54
OPENING_HEIGHT = 2.18
INTERIOR_FLOOR_CLEARANCE = 0.01
INTERIOR_FRONT_WALL_OUTER_Z = 5.2
INTERIOR_INSET = 0.02


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def islands(bm):
    seen = set()
    for face in bm.faces:
        if face in seen:
            continue
        group, stack = [], [face]
        seen.add(face)
        while stack:
            current = stack.pop()
            group.append(current)
            for edge in current.edges:
                for linked in edge.link_faces:
                    if linked not in seen:
                        seen.add(linked)
                        stack.append(linked)
        coords = [v.co for f in group for v in f.verts]
        lo = [min(c[k] for c in coords) for k in range(3)]
        hi = [max(c[k] for c in coords) for k in range(3)]
        yield group, lo, hi


def size(lo, hi):
    return [hi[k] - lo[k] for k in range(3)]


def find_one(candidates, what, key):
    if len(candidates) != 1:
        raise RuntimeError(f"{key}: expected one {what}, found {len(candidates)}")
    return candidates[0]


def cutter(name, x0, x1, y0, y1, z0, z1):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x = x0 if v.co.x < 0 else x1
        v.co.y = y0 if v.co.y < 0 else y1
        v.co.z = z0 if v.co.z < 0 else z1
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def boolean_cut(target, tool, material_index):
    tool.data.materials.append(target.data.materials[material_index])
    mod = target.modifiers.new("Opening", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.solver = "EXACT"
    mod.material_mode = "TRANSFER"
    mod.object = tool
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(tool, do_unlink=True)


def delete_faces(obj, predicate):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    doomed = [f for f in bm.faces if predicate(f)]
    bmesh.ops.delete(bm, geom=doomed, context="FACES")
    bm.to_mesh(obj.data)
    bm.free()
    return len(doomed)


def export(objs, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_image_format="AUTO",
        export_cameras=False,
        export_lights=False,
    )


def is_frame(lo, hi):
    s = size(lo, hi)
    return abs(s[0] - 1.36) < 0.03 and abs(s[2] - 2.36) < 0.03 and s[1] < 0.12


def is_leaf(lo, hi):
    s = size(lo, hi)
    return abs(s[0] - 1.10) < 0.03 and abs(s[2] - 2.20) < 0.03 and s[1] < 0.1


def separate_faces(obj, pick, name):
    """Moves the faces returned by pick(bmesh, islands) into a new object called `name`."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    chosen = pick(bm, list(islands(bm)))
    if not chosen:
        raise RuntimeError(f"{obj.name}: nothing to separate as {name}")
    for f in bm.faces:
        f.select_set(False)
    for f in chosen:
        f.select_set(True)
    bm.to_mesh(obj.data)
    bm.free()
    before = set(bpy.data.objects)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.separate(type="SELECTED")
    bpy.ops.object.mode_set(mode="OBJECT")
    part = find_one([o for o in bpy.data.objects if o not in before], name, obj.name)
    part.name = name
    return part


def join_into(target, parts):
    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:
        p.select_set(True)
    target.select_set(True)
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.join()


def build_exterior(key):
    house = find_one([o for o in import_glb(os.path.join(ASSETS, key, "exterior.glb")) if o.type == "MESH"], "mesh", key)
    house.name = f"House_{key}"
    bpy.context.view_layer.objects.active = house
    house.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    wall_index = find_one([i for i, m in enumerate(house.data.materials) if re.match(r"EX_.*Wall$", m.name)], "wall material", key)
    found = {}

    def pick_door(bm, parts):
        frame = find_one([(lo, hi) for g, lo, hi in parts if is_frame(lo, hi)], "door frame", key)
        leaf = find_one([(g, lo, hi) for g, lo, hi in parts if is_leaf(lo, hi)], "door leaf", key)
        group, leaf_lo, leaf_hi = leaf
        found.update(frame=frame, leaf_lo=leaf_lo, leaf_hi=leaf_hi)
        accessories = [g for g, lo, hi in parts
                       if g is not group
                       and lo[0] >= leaf_lo[0] - 0.01 and hi[0] <= leaf_hi[0] + 0.01
                       and lo[2] >= leaf_lo[2] - 0.01 and hi[2] <= leaf_hi[2] + 0.01
                       and lo[1] >= leaf_lo[1] - 0.08 and hi[1] <= leaf_hi[1] + 0.001]
        return set(group).union(*map(set, accessories))

    door = separate_faces(house, pick_door, "Door")
    frame_lo, frame_hi = found["frame"]
    leaf_lo, leaf_hi = found["leaf_lo"], found["leaf_hi"]
    door_plane_y = frame_hi[1]
    floor_z = leaf_lo[2]

    bpy.context.scene.cursor.location = (leaf_lo[0], leaf_hi[1], leaf_lo[2])
    bpy.ops.object.select_all(action="DESELECT")
    door.select_set(True)
    bpy.context.view_layer.objects.active = door
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")

    frame = separate_faces(house, lambda bm, parts: find_one([set(g) for g, lo, hi in parts if is_frame(lo, hi)], "door frame", key),
                           "DoorFrame")

    def pick_front_wall(bm, parts):
        def holds_door(group):
            return any(f.material_index == wall_index and f.normal.y < -0.99
                       and abs(f.calc_center_median().y - door_plane_y) < 1e-3
                       and min(v.co.x for v in f.verts) < -OPENING_HALF_WIDTH < OPENING_HALF_WIDTH < max(v.co.x for v in f.verts)
                       for f in group)
        return find_one([set(g) for g, lo, hi in parts if holds_door(g)], "wall behind the door", key)

    wall = separate_faces(house, pick_front_wall, "FrontWall")

    opening_bottom = floor_z + INTERIOR_FLOOR_CLEARANCE
    opening_top = opening_bottom + OPENING_HEIGHT
    pocket_back_y = door_plane_y + 0.02
    boolean_cut(frame, cutter("FrameCutter", -OPENING_HALF_WIDTH, OPENING_HALF_WIDTH, frame_lo[1] - 0.05, frame_hi[1] + 0.05,
                              opening_bottom, opening_top), frame.data.polygons[0].material_index)
    boolean_cut(wall, cutter("WallCutter", -OPENING_HALF_WIDTH, OPENING_HALF_WIDTH, door_plane_y - 0.05, pocket_back_y,
                             opening_bottom, opening_top), wall_index)

    def is_pocket_back(f):
        c = f.calc_center_median()
        return abs(c.y - pocket_back_y) < 1e-3 and abs(f.normal.y) > 0.99 and abs(c.x) < OPENING_HALF_WIDTH
    if delete_faces(wall, is_pocket_back) == 0:
        raise RuntimeError(f"{key}: opening has no back face to open")

    def is_wall_bottom(f):
        return f.material_index == wall_index and f.normal.z < -0.99
    delete_faces(wall, is_wall_bottom)

    join_into(house, [frame, wall])
    export([house, door], os.path.join(OUT, key, "exterior.glb"))
    return {
        "doorPlaneZ": round(-door_plane_y, 3),
        "floorY": round(floor_z, 3),
        "interiorOffset": [0, round(floor_z + INTERIOR_FLOOR_CLEARANCE, 3),
                           round(-door_plane_y - INTERIOR_INSET - INTERIOR_FRONT_WALL_OUTER_Z, 3)],
        "doorHinge": [round(leaf_lo[0], 3), round(floor_z, 3), round(-leaf_hi[1], 3)],
    }


def main():
    keys = [a for a in sys.argv[sys.argv.index("--") + 1:]] if "--" in sys.argv else KEYS
    doors = {}
    for key in keys:
        bpy.ops.wm.read_homefile(use_empty=True)
        doors[key] = build_exterior(key)
    print("HOUSE_DOORS " + json.dumps(doors))


main()
