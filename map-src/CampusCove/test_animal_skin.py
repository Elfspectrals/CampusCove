import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lib_skin as LS

TARGET_TRIS = 4000
MAX_STRETCHED_EDGE_RATIO = 0.03
STRETCH_LIMIT = 2.0
SHIPPED_ANIMALS = os.path.normpath(os.path.join(HERE, "../../front/public/assets/animals"))


def ellipsoid(bm, centre, radii):
    made = bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=10, radius=1.0)["verts"]
    bmesh.ops.scale(bm, vec=Vector(radii), verts=made)
    bmesh.ops.translate(bm, vec=Vector(centre), verts=made)


def tube(bm, start, end, radius_start, radius_end):
    start, end = Vector(start), Vector(end)
    axis = end - start
    rotation = Vector((0, 0, 1)).rotation_difference(axis.normalized()).to_matrix().to_4x4()
    placement = Matrix.Translation((start + end) / 2) @ rotation
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=12, radius1=radius_start, radius2=radius_end, depth=axis.length, matrix=placement)


def solid_from(name, build):
    bm = bmesh.new()
    build(bm)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    reach = max(obj.dimensions)
    remesh = obj.modifiers.new("remesh", "REMESH")
    remesh.mode = "VOXEL"
    remesh.voxel_size = reach / 70
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    while sum(len(p.vertices) - 2 for p in obj.data.polygons) > TARGET_TRIS:
        decimate = obj.modifiers.new("decimate", "DECIMATE")
        decimate.ratio = 0.8
        bpy.ops.object.modifier_apply(modifier=decimate.name)
    return obj


def armature_from(name, chains):
    data = bpy.data.armatures.new(name)
    arm = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    for bone_name, head, tail, parent in chains:
        edit = data.edit_bones.new(bone_name)
        edit.head, edit.tail = Vector(head), Vector(tail)
        if parent:
            edit.parent = data.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


def chain(prefix, points, parent=None):
    out = []
    for i in range(len(points) - 1):
        name = f"{prefix}{i}"
        out.append((name, points[i], points[i + 1], parent if i == 0 else f"{prefix}{i - 1}"))
    return out


def line(start, end, steps):
    return [tuple(Vector(start).lerp(Vector(end), i / steps)) for i in range(steps + 1)]


def worm():
    def build(bm):
        tube(bm, (0, 0, 0.05), (1.0, 0, 0.05), 0.04, 0.02)
    return build, chain("seg", line((0, 0, 0.05), (1.0, 0, 0.05), 8))


def fish():
    def build(bm):
        ellipsoid(bm, (0.25, 0, 0.2), (0.25, 0.07, 0.12))
        tube(bm, (0.45, 0, 0.2), (0.62, 0, 0.2), 0.04, 0.01)
        tube(bm, (0.55, 0, 0.12), (0.7, 0, 0.3), 0.02, 0.005)
    return build, chain("spine", line((0, 0, 0.2), (0.62, 0, 0.2), 6))


def bird():
    def build(bm):
        ellipsoid(bm, (0, 0, 0.35), (0.12, 0.09, 0.14))
        tube(bm, (0.08, 0, 0.42), (0.14, 0, 0.58), 0.04, 0.03)
        ellipsoid(bm, (0.16, 0, 0.62), (0.05, 0.04, 0.05))
        for side in (-0.04, 0.04):
            tube(bm, (0, side, 0.25), (0, side, 0.13), 0.015, 0.012)
            tube(bm, (0, side, 0.13), (0.01, side, 0.0), 0.012, 0.01)
    bones = [("body", (-0.1, 0, 0.35), (0.08, 0, 0.35), None), ("neck", (0.08, 0, 0.42), (0.16, 0, 0.62), "body")]
    for side, tag in ((-0.04, "R"), (0.04, "L")):
        bones += [(f"hip_{tag}", (0, side, 0.25), (0, side, 0.13), "body"), (f"ankle_{tag}", (0, side, 0.13), (0.01, side, 0.0), f"hip_{tag}")]
    return build, bones


def tiger():
    def build(bm):
        ellipsoid(bm, (0, 0, 0.7), (0.3, 0.14, 0.16))
        ellipsoid(bm, (0.38, 0, 0.82), (0.11, 0.09, 0.09))
        tube(bm, (-0.3, 0, 0.75), (-0.75, 0, 0.55), 0.03, 0.02)
        for x in (-0.2, 0.2):
            for y in (-0.08, 0.08):
                tube(bm, (x, y, 0.65), (x, y, 0.32), 0.05, 0.035)
                tube(bm, (x, y, 0.32), (x, y, 0.0), 0.035, 0.03)
    bones = [("hips", (-0.25, 0, 0.7), (0.0, 0, 0.7), None), ("chest", (0.0, 0, 0.7), (0.25, 0, 0.72), "hips"),
             ("head", (0.25, 0, 0.72), (0.45, 0, 0.82), "chest")]
    for x, parent, tag in ((-0.2, "hips", "H"), (0.2, "chest", "F")):
        for y, side in ((-0.08, "R"), (0.08, "L")):
            bones += [(f"leg_{tag}{side}", (x, y, 0.65), (x, y, 0.32), parent), (f"shin_{tag}{side}", (x, y, 0.32), (x, y, 0.0), f"leg_{tag}{side}")]
    return build, bones


def octopus():
    arms = 8
    def tentacle_points(i):
        angle = 2 * math.pi * i / arms
        direction = Vector((math.cos(angle), math.sin(angle), 0))
        return [tuple(direction * (0.12 + 0.11 * k) + Vector((0, 0, 0.2 - 0.03 * k))) for k in range(5)]
    def build(bm):
        ellipsoid(bm, (0, 0, 0.35), (0.16, 0.16, 0.2))
        for i in range(arms):
            points = tentacle_points(i)
            for k in range(4):
                tube(bm, points[k], points[k + 1], 0.045 - 0.008 * k, 0.045 - 0.008 * (k + 1))
    bones = [("mantle", (0, 0, 0.2), (0, 0, 0.5), None)]
    for i in range(arms):
        bones += chain(f"arm{i}_", tentacle_points(i), "mantle")
    return build, bones


def undulation(arm, phase):
    bones = list(arm.pose.bones)
    return {pb.name: Matrix.Rotation(0.45 * math.sin(phase - 0.8 * index), 3, "Z") for index, pb in enumerate(bones)}


def tentacle_curl(arm, phase):
    out = {}
    for pb in arm.pose.bones:
        if pb.name == "mantle":
            continue
        direction = Vector(pb.bone.tail_local) - Vector(pb.bone.head_local)
        axis = direction.cross(Vector((0, 0, 1)))
        out[pb.name] = Matrix.Rotation(0.7 * math.sin(phase), 3, axis.normalized())
    return out


def stride(arm, phase):
    out = {}
    for pb in arm.pose.bones:
        own = phase + (math.pi if pb.name.endswith("R") else 0.0)
        if pb.name.startswith(("leg_", "hip_")):
            out[pb.name] = Matrix.Rotation(-0.5 * math.sin(own), 3, "Y")
        elif pb.name.startswith(("shin_", "ankle_")):
            out[pb.name] = Matrix.Rotation(0.7 * max(0.0, math.cos(own)), 3, "Y")
    return out


ANIMALS = {
    "worm": (worm, undulation),
    "fish": (fish, undulation),
    "bird": (bird, stride),
    "tiger": (tiger, stride),
    "octopus": (octopus, tentacle_curl),
}


def apply_pose(arm, rotations):
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
        rest = pb.bone.matrix_local.to_3x3()
        pb.rotation_quaternion = (rest.inverted() @ rotations.get(pb.name, Matrix.Identity(3)) @ rest).to_quaternion()
    bpy.context.view_layer.update()


def stretched_edge_ratio(obj, arm, edges, rest_lengths, motion):
    worst = 0.0
    floor = 0.01 * max(obj.dimensions)
    usable = rest_lengths > floor
    for step in range(8):
        apply_pose(arm, motion(arm, 2 * math.pi * step / 8))
        evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh = evaluated.to_mesh()
        posed = np.array([v.co[:] for v in mesh.vertices])
        evaluated.to_mesh_clear()
        lengths = np.linalg.norm(posed[edges[:, 0]] - posed[edges[:, 1]], axis=1)
        ratio = np.maximum(lengths / rest_lengths, rest_lengths / np.maximum(lengths, 1e-9))
        worst = max(worst, float((ratio[usable] > STRETCH_LIMIT).sum()) / usable.sum())
    return worst


def run(name, builder, motion):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    build, bones = builder()
    obj = solid_from(name, build)
    arm = armature_from(f"Rig_{name}", bones)
    weights, _ = LS.skin_mesh(obj, arm)
    verts, edges, bones_table = LS.read_mesh(obj, arm)
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    worst_joint = max(LS.hard_edges_by_joint(weights, edges).values(), default=0)
    bleed, _ = LS.sibling_bleed(weights, bones_table)
    unblended = LS.proximity_weights(verts, edges, bones_table, blend=1e-4)
    rest_lengths = np.linalg.norm(verts[edges[:, 0]] - verts[edges[:, 1]], axis=1)
    stretched = stretched_edge_ratio(obj, arm, edges, rest_lengths, motion)
    print(f"{name:8} tris={tris:5d} bones={len(bones_table):3d} worst_joint={worst_joint} bleed={bleed:.3f} stretched={stretched:.4f}")
    assert LS.skin_problems(unblended, edges, bones_table), f"{name}: the unblended control does not tear, the joint limit proves nothing here"
    assert stretched <= MAX_STRETCHED_EDGE_RATIO, f"{name}: {stretched:.2%} of the edges stretch or squash more than {STRETCH_LIMIT}x in the test poses"


def shipped_problems(folder):
    found = {}
    for key in sorted(os.listdir(folder)):
        path = os.path.join(folder, key, "model.glb")
        if not os.path.isfile(path):
            continue
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=path)
        arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
        for obj in (o for o in bpy.data.objects if o.type == "MESH" and o.vertex_groups):
            verts, edges, bones = LS.read_mesh(obj, arm)
            problems = LS.skin_problems(LS.read_weights(obj, arm), edges, bones)
            if problems:
                found[f"{key}/{obj.name}"] = problems
    return found


if __name__ == "__main__":
    for animal, (builder, motion) in ANIMALS.items():
        run(animal, builder, motion)
    shipped = shipped_problems(SHIPPED_ANIMALS)
    assert not shipped, f"shipped animals tear or stick together: {shipped}"
    print("ANIMAL SKIN TEST OK")
