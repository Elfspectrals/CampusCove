from mathutils import Matrix, Euler, Quaternion, Vector
import math

class Pose:
    def __init__(self, arm):
        self.arm = arm
        self.rest = {}
        for b in arm.data.bones:
            self.rest[b.name] = b.matrix_local.to_3x3()   # armature-space rest orientation
        self.reset()

    def reset(self):
        self.rot = {}
        self.loc = {}

    def rx(self, b, deg): self._r(b, 0, deg)
    def ry(self, b, deg): self._r(b, 1, deg)
    def rz(self, b, deg): self._r(b, 2, deg)

    def _r(self, b, i, deg):
        r = self.rot.setdefault(b, [0.0, 0.0, 0.0])
        r[i] += math.radians(deg)

    def move(self, b, x=0.0, y=0.0, z=0.0):
        l = self.loc.setdefault(b, Vector((0, 0, 0)))
        l += Vector((x, y, z))

    def commit(self, frame, key=True):
        for pb in self.arm.pose.bones:
            n = pb.name
            pb.rotation_mode = 'QUATERNION'
            m = self.rest[n]
            r = self.rot.get(n)
            if r:
                rw = Euler(r, 'XYZ').to_matrix()
                q = (m.inverted() @ rw @ m).to_quaternion()
            else:
                q = Quaternion((1, 0, 0, 0))
            pb.rotation_quaternion = q
            if key: pb.keyframe_insert('rotation_quaternion', frame=frame)
            if n in self.loc or n == 'Hips':
                v = self.loc.get(n, Vector((0, 0, 0)))
                pb.location = m.inverted() @ v
                if key: pb.keyframe_insert('location', frame=frame)


def sample_actions(arm, clips, fps=30):
    """clips: name -> (nframes, fn(ph, P)). Builds one action per clip and an NLA track for each."""
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='POSE')
    ad = arm.animation_data_create()
    for t in list(ad.nla_tracks):
        ad.nla_tracks.remove(t)
    for a in list(bpy.data.actions):
        if a.name in clips:
            bpy.data.actions.remove(a)
    P = Pose(arm)
    for name, (nf, fn) in clips.items():
        act = bpy.data.actions.new(name)
        ad.action = act
        for pb in arm.pose.bones:
            pb.rotation_mode = 'QUATERNION'
            pb.rotation_quaternion = (1, 0, 0, 0)
            pb.location = (0, 0, 0)
        for fr in range(nf + 1):
            P.reset()
            fn(fr / nf, P)
            P.commit(fr + 1)
        tr = ad.nla_tracks.new()
        tr.name = name
        st = tr.strips.new(name, 1, act)
        st.name = name
        ad.action = None
    bpy.ops.object.mode_set(mode='OBJECT')
    scn = bpy.context.scene
    scn.render.fps = fps


def gait_idle(P_, extras=None):
    S = math.sin
    def f(ph, P):
        a = 2 * math.pi * ph
        # breathing + weight shift
        P.rx('Chest', 1.4 * S(a)); P.rx('Spine', 0.8 * S(a)); P.rx('Head', -1.6 * S(a - 0.5)); P.ry('Head', 2.5 * S(a * 0.5))
        P.move('Hips', 0, 0, 0.004 * S(a * 2))
        P.ry('Hips', 1.2 * S(a)); P.ry('Spine', -1.0 * S(a))
        P.rx('UpperArm.L', -1.5 * S(a - 0.4)); P.rx('UpperArm.R', -1.5 * S(a - 0.4))
        P.rx('LowerArm.L', -3 - 1.5 * S(a)); P.rx('LowerArm.R', -3 - 1.5 * S(a))
        if extras:
            extras(ph, P, 0.0, 1.0)
    return f


def gait_walk(extras=None, amp=1.0):
    S, C = math.sin, math.cos
    def f(ph, P):
        a = 2 * math.pi * ph
        s = S(a)
        P.move('Hips', 0, 0, 0.018 * (1 - abs(C(a))) * amp - 0.008)
        P.rz('Hips', 3.0 * s)           # pelvis yaw
        P.rz('Chest', -3.5 * s)         # counter twist
        P.ry('Hips', 2.0 * C(a))        # sway
        P.rx('Spine', 2.0)
        for side, ph0 in (('.L', 0.0), ('.R', math.pi)):
            t = a + ph0
            sw = S(t)
            P.rx('UpperLeg' + side, -26 * sw * amp)                    # forward = -deg about +X (legs point down)
            knee = max(0.0, -C(t) * 0.8 + 0.2 * sw) if False else max(0.0, S(t + 1.1))
            P.rx('LowerLeg' + side, 34 * knee * amp)                    # shin flexes backward
            P.rx('Foot' + side, 10 * sw * amp - 12 * knee * amp)
            P.rx('UpperArm' + side, 24 * sw * amp)                      # arms opposite to same-side leg
            P.rx('LowerArm' + side, -(14 + 16 * max(0.0, -sw)) * amp)
        if extras:
            extras(ph, P, 0.55 * amp, 2.0)
    return f


def gait_run(extras=None):
    S, C = math.sin, math.cos
    def f(ph, P):
        a = 2 * math.pi * ph
        s = S(a)
        P.move('Hips', 0, 0, 0.045 * (1 - abs(C(a))) - 0.03)
        P.rx('Hips', 7)
        P.rx('Spine', 6); P.rx('Chest', 4); P.rx('Head', -8)
        P.rz('Hips', 5.0 * s); P.rz('Chest', -7.0 * s)
        for side, ph0 in (('.L', 0.0), ('.R', math.pi)):
            t = a + ph0
            sw = S(t)
            P.rx('UpperLeg' + side, -(18 + 40 * sw))
            knee = max(0.0, S(t + 1.0)) * 0.85 + 0.15
            P.rx('LowerLeg' + side, 70 * knee * (0.5 + 0.5 * max(0.0, S(t + 1.4))) + 8)
            P.rx('Foot' + side, 15 * sw - 22 * knee)
            P.rx('UpperArm' + side, 42 * sw)
            P.rx('LowerArm' + side, -(75 + 12 * (-sw)))
            P.rz('UpperArm' + side, 0)
        if extras:
            extras(ph, P, 1.0, 3.0)
    return f


def show_pose(arm, fn, ph):
    if arm.animation_data:
        for t in arm.animation_data.nla_tracks:
            t.mute = True
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='POSE')
    P = Pose(arm)
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
    fn(ph, P)
    P.commit(1, key=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.context.view_layer.update()
    return P


def export_glb(path, objs, draco=True):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_apply=False, export_yup=True,
              export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
              export_skins=True, export_materials='EXPORT', export_image_format='AUTO',
              export_cameras=False, export_lights=False, use_active_scene=True)
    if draco:
        kw.update(export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
                  export_draco_position_quantization=14, export_draco_normal_quantization=10)
    bpy.ops.export_scene.gltf(**kw)
