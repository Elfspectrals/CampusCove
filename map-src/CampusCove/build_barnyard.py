import importlib
import math
import os
import sys

if "__file__" not in globals():
    raise RuntimeError('Run with exec(open(p).read(), {"__file__": p}) so the script can find lib_common.py')
HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import lib_common as L
importlib.reload(L)
import bpy
import numpy as np
from mathutils import Matrix, Vector

ONLY = globals().get("ONLY_ANIMALS")
FPS = 30
IDLE_S = 4.0
GRAZE_S = 3.0
PECK_S = 2.0
MAX_SWING = 0.5
AXIS_SIDE = Vector((1, 0, 0))
AXIS_UP = Vector((0, 0, 1))
PREVIEWS = os.path.join(L.FRONT_ASSETS, "animals")
SPEEDS = L._read_json(os.path.join(L.FRONT_ASSETS, "animals", "animals.json"))["animals"]

QUADRUPED_GAIT = {"HL": 0.0, "FL": 0.25, "HR": 0.5, "FR": 0.75}
BIRD_GAIT = {"L": 0.0, "R": 0.5}

ANIMALS = {
    "cow": dict(slug="a_black_and_white_dairy_cow_with_small_h", palette=5, head=1, legs=4, leg_top=0.5, neck=0.66, skull=0.82, graze=1.25, step_s=1.2),
    "pig": dict(slug="a_pink_farm_pig_with_a_round_snout_and_f", palette=6, head=1, legs=4, leg_top=0.38, neck=0.72, skull=0.84, graze=0.45, step_s=0.8),
    "sheep": dict(slug="a_white_woolly_sheep_with_a_black_face_a", palette=4, head=1, legs=4, leg_top=0.42, neck=0.68, skull=0.82, graze=0.6, step_s=1.0),
    "dog": dict(slug="a_brown_farm_dog_with_floppy_ears_and_a_", palette=6, head=1, legs=4, leg_top=0.48, neck=0.7, skull=0.82, graze=0.7, step_s=0.45),
    "hen": dict(slug="a_brown_hen_with_a_small_red_comb_and_a_", palette=5, head=1, legs=2, leg_top=0.24, neck=0.62, skull=0.78, graze=1.0, step_s=0.5),
    "rooster": dict(slug="a_white_rooster_with_a_big_red_comb_red_", palette=6, head=1, legs=2, leg_top=0.24, neck=0.62, skull=0.78, graze=1.0, step_s=0.5),
}

sc = L.new_build_scene("ANIMALS")
sc.render.fps = FPS
coll = bpy.data.collections.new("Animals")
sc.collection.children.link(coll)


def smoothstep(edge0, edge1, x):
    t = np.clip((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def body_mesh(key, cfg):
    meshes = L.import_ai_model(coll, cfg["slug"], f"AN_{key.capitalize()}", palette=cfg["palette"])
    if len(meshes) != 1:
        raise RuntimeError(f"{key}: out/ai/{cfg['slug']} should hold one mesh, got {len(meshes)}")
    meshes += L.add_ai_eyes(coll, meshes[0], cfg["slug"], f"AN_{key.capitalize()}_Eye")
    obj = L.join(coll, f"Animal_{key}", meshes)
    obj.data.transform(Matrix.Rotation(-math.pi / 2 * cfg["head"], 4, "Z") @ obj.matrix_world)
    obj.matrix_world = Matrix.Identity(4)
    verts = np.array([v.co[:] for v in obj.data.vertices])
    lo, hi = verts.min(0), verts.max(0)
    width, length = hi[0] - lo[0], hi[1] - lo[1]
    if width > length:
        raise RuntimeError(f"{key}: the body is {width:.2f} m wide for {length:.2f} m long, the concept image was not a side view; "
                           "regenerate with VIEW=side CHECK=quadruped or CHECK=biped")
    obj.data.transform(Matrix.Translation((-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2])))
    return obj


def find_legs(key, verts, cfg, height):
    low = verts[verts[:, 2] < 0.2 * height]
    ahead = -low[:, 1]
    if cfg["legs"] == 4:
        middle = (ahead.min() + ahead.max()) / 2
        groups = {
            "FL": (ahead >= middle) & (low[:, 0] >= 0),
            "FR": (ahead >= middle) & (low[:, 0] < 0),
            "HL": (ahead < middle) & (low[:, 0] >= 0),
            "HR": (ahead < middle) & (low[:, 0] < 0),
        }
    else:
        spread = low[:, :2] - low[:, :2].mean(0)
        apart = spread @ np.linalg.svd(spread, full_matrices=False)[2][0]
        groups = {"L": apart >= 0, "R": apart < 0}
    legs = {}
    for name, mask in groups.items():
        if mask.sum() < 8:
            raise RuntimeError(f"{key}: leg {name} has {mask.sum()} vertices near the ground, regenerate the model with the legs apart")
        foot = low[mask][:, :2]
        centre = foot.mean(0)
        legs[name] = (centre, float(np.percentile(np.linalg.norm(foot - centre, axis=1), 95)) * 1.3)
    return legs


def build_rig(key, obj, cfg):
    verts = np.array([v.co[:] for v in obj.data.vertices])
    height = verts[:, 2].max()
    ahead = -verts[:, 1]
    rear, front = ahead.min(), ahead.max()
    length = front - rear
    leg_top = cfg["leg_top"] * height
    knee = leg_top * 0.5
    spine_z = leg_top + 0.4 * (height - leg_top)
    s = (ahead - rear) / length
    head_z = float(verts[s > cfg["skull"], 2].mean())
    legs = find_legs(key, verts, cfg, height)

    def at(frac, z):
        return Vector((0.0, -(rear + frac * length), z))

    arm_data = bpy.data.armatures.new(f"Rig_{key}")
    arm = bpy.data.objects.new(f"Rig_{key}", arm_data)
    coll.objects.link(arm)
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")

    def bone(name, head, tail, parent=None):
        b = arm_data.edit_bones.new(name)
        b.head, b.tail = head, tail
        if parent:
            b.parent = arm_data.edit_bones[parent]
        return b

    bone("hips", at(0.15, spine_z), at(0.45, spine_z))
    bone("chest", at(0.45, spine_z), at(cfg["neck"], spine_z), "hips")
    bone("neck", at(cfg["neck"], spine_z), at(cfg["skull"], head_z), "chest")
    bone("head", at(cfg["skull"], head_z), at(1.0, head_z), "neck")
    for name, (centre, _) in legs.items():
        x, y = float(centre[0]), float(centre[1])
        parent = "chest" if name.startswith("F") else "hips"
        bone(f"leg_{name}", Vector((x, y, leg_top)), Vector((x, y, knee)), parent)
        bone(f"shin_{name}", Vector((x, y, knee)), Vector((x, y, 0.0)), f"leg_{name}")
    bpy.ops.object.mode_set(mode="OBJECT")

    z = verts[:, 2]
    centres = [("hips", 0.3), ("chest", (0.45 + cfg["neck"]) / 2), ("neck", (cfg["neck"] + cfg["skull"]) / 2), ("head", min(1.0, cfg["skull"] + 0.08))]
    weights = {name: np.zeros(len(verts)) for name, _ in centres}
    for (a, sa), (b, sb) in zip(centres, centres[1:]):
        f = np.clip((s - sa) / (sb - sa), 0.0, 1.0)
        span = (s >= sa) & (s < sb)
        weights[a][span] += 1 - f[span]
        weights[b][span] += f[span]
    weights["hips"][s < centres[0][1]] = 1.0
    weights["head"][s >= centres[-1][1]] = 1.0
    lifted = np.where(s < cfg["skull"], smoothstep(spine_z - 0.2 * height, spine_z, z), 1.0)
    for name in ("neck", "head"):
        dropped = weights[name] * (1 - lifted)
        weights[name] -= dropped
        weights["chest"] += dropped

    centres_xy = np.array([c for c, _ in legs.values()])
    nearest = np.argmin(np.linalg.norm(verts[:, None, :2] - centres_xy[None], axis=2), axis=1)
    blend = 0.3 * leg_top
    for i, (name, (centre, radius)) in enumerate(legs.items()):
        mine = (nearest == i) & (np.linalg.norm(verts[:, :2] - centre, axis=1) < radius) & (z < leg_top)
        on_leg = np.where(mine, smoothstep(leg_top, leg_top - 0.2 * leg_top, z), 0.0)
        upper = smoothstep(knee - blend, knee + blend, z)
        for body in weights:
            if not body.startswith(("leg_", "shin_")):
                weights[body] *= 1 - on_leg
        weights[f"leg_{name}"] = on_leg * upper
        weights[f"shin_{name}"] = on_leg * (1 - upper)

    for name, w in weights.items():
        group = obj.vertex_groups.new(name=name)
        for i in np.nonzero(w > 1e-4)[0]:
            group.add([int(i)], float(w[i]), "REPLACE")
    obj.parent = arm
    obj.modifiers.new("Armature", "ARMATURE").object = arm
    return arm, legs, height, leg_top


def pose_at(cfg, clip, t, legs, height, leg_top, speed):
    rot = {}
    loc = {}
    bird = cfg["legs"] == 2
    if clip == "walk":
        period = cfg["step_s"]
        gait = BIRD_GAIT if bird else QUADRUPED_GAIT
        swing = min(MAX_SWING, math.atan(speed * period / 2 / leg_top) * 0.85)
        for name in legs:
            phase = 2 * math.pi * (t / period + gait[name])
            rot[f"leg_{name}"] = Matrix.Rotation(-swing * math.sin(phase), 3, AXIS_SIDE)
            folds_back = 1.0 if name.startswith("F") else -1.0
            rot[f"shin_{name}"] = Matrix.Rotation(folds_back * 0.7 * max(0.0, math.cos(phase)), 3, AXIS_SIDE)
        bob = 4 * math.pi * t / period
        loc["hips"] = Vector((0, 0, (0.03 if bird else 0.012) * height * math.cos(bob)))
        rot["neck"] = Matrix.Rotation((0.18 if bird else 0.05) * math.sin(bob), 3, AXIS_SIDE)
    elif clip == "idle":
        look = math.sin(2 * math.pi * t / IDLE_S)
        rot["neck"] = Matrix.Rotation((0.5 * look ** 3) if bird else 0.25 * look, 3, AXIS_UP)
        loc["hips"] = Vector((0, 0, 0.006 * height * math.sin(4 * math.pi * t / IDLE_S)))
    else:
        if bird:
            u = (t % (PECK_S / 2)) / (PECK_S / 2)
            dip = math.sin(math.pi * min(1.0, u / 0.35)) ** 2 if u < 0.35 else 0.0
            rot["neck"] = Matrix.Rotation(cfg["graze"] * dip, 3, AXIS_SIDE)
        else:
            chew = math.sin(4 * math.pi * t / GRAZE_S)
            rot["neck"] = Matrix.Rotation(cfg["graze"] + 0.05 * chew, 3, AXIS_SIDE)
            rot["head"] = Matrix.Rotation(0.15 + 0.08 * chew, 3, AXIS_SIDE)
    return rot, loc


def animate(arm, cfg, legs, height, leg_top, speed):
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
    arm.animation_data_create()
    clips = {"idle": IDLE_S, "walk": cfg["step_s"], "graze": PECK_S if cfg["legs"] == 2 else GRAZE_S}
    for clip, seconds in clips.items():
        arm.animation_data.action = None
        frames = round(seconds * FPS)
        for frame in range(frames + 1):
            rot, loc = pose_at(cfg, clip, frame / frames * seconds, legs, height, leg_top, speed)
            for pb in arm.pose.bones:
                rest = pb.bone.matrix_local.to_3x3()
                inverse = rest.inverted()
                pb.rotation_quaternion = (inverse @ rot.get(pb.name, Matrix.Identity(3)) @ rest).to_quaternion()
                pb.location = inverse @ loc.get(pb.name, Vector())
                pb.keyframe_insert("rotation_quaternion", frame=frame)
                pb.keyframe_insert("location", frame=frame)
        action = arm.animation_data.action
        action.name = f"{clip}_{arm.name}"
        track = arm.animation_data.nla_tracks.new()
        track.name = clip
        track.strips.new(clip, 0, action)
        arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)


def ship(key, cfg):
    obj = body_mesh(key, cfg)
    arm, legs, height, leg_top = build_rig(key, obj, cfg)
    animate(arm, cfg, legs, height, leg_top, SPEEDS[key]["speed"])
    bpy.context.view_layer.update()
    out = os.path.join(L.OUT_ROOT, "animals", key)
    L.export_glb(os.path.join(out, "model.glb"), [arm, obj], export_skins=True, export_animations=True,
                 export_animation_mode="NLA_TRACKS", export_force_sampling=True, export_frame_range=False)
    os.makedirs(os.path.join(PREVIEWS, key), exist_ok=True)
    L.render_preview(sc, obj, os.path.join(PREVIEWS, key, "preview.png"))
    obj.hide_render = True
    return {"key": key, "tris": sum(len(p.vertices) - 2 for p in obj.data.polygons), "dims": tuple(round(x, 3) for x in obj.dimensions), "legs": sorted(legs)}


results = [ship(key, cfg) for key, cfg in ANIMALS.items() if not ONLY or key in ONLY]
print("ANIMALS", results)
