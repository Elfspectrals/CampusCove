if "SKINS_DIR" not in globals():
    raise RuntimeError("Run these scripts through run.py (blender --background --python front/scripts/skins/run.py): they share state via exec().")

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
            P.commit(fr)
        tr = ad.nla_tracks.new()
        tr.name = name
        st = tr.strips.new(name, 0, act)
        st.name = name
        ad.action = None
    bpy.ops.object.mode_set(mode='OBJECT')
    scn = bpy.context.scene
    scn.render.fps = fps


def min_jerk(u):
    return u * u * u * (10 - 15 * u + 6 * u * u)


def key_poses(keys):
    def pose_at(ph):
        for (t0, a), (t1, b) in zip(keys, keys[1:]):
            if ph <= t1:
                w = min_jerk((ph - t0) / (t1 - t0))
                return {k: a.get(k, 0.0) + (b.get(k, 0.0) - a.get(k, 0.0)) * w for k in a.keys() | b.keys()}
        return dict(keys[-1][1])
    return pose_at


SIDES = (('.L', 1.0, 0.0), ('.R', -1.0, 0.5))

JOG = dict(frames=21, speed=5.0, df=0.22, y_td=-0.29, roll_at=0.097, toe_off=35, kick=0.2, reach=0.1, lift=0.2,
           dorsi=12, hips_z=-0.065, bob=0.022, sway=0.012, roll=3, yaw=6, twist=8, nod=1.5, hips_pitch=2, spine=5,
           chest=3, head=-5.5, track=0.085, arm_mid=-5, arm_amp=25, arm_lag=0.03, tuck=15, elbow=80, elbow_amp=10)

SPRINT = dict(frames=18, speed=8.5, df=0.17, y_td=-0.36, roll_at=0.076, toe_off=40, kick=0.15, reach=0.1, lift=0.36,
              dorsi=15, hips_z=-0.075, bob=0.03, sway=0.008, roll=2.5, yaw=8, twist=11, nod=2, hips_pitch=3, spine=8,
              chest=6, head=-12, track=0.075, arm_mid=-7.5, arm_amp=47.5, arm_lag=0.03, tuck=12, elbow=85, elbow_amp=15)


def _frame(axis, hinge):
    y = axis.normalized()
    x = (hinge - hinge.dot(y) * y).normalized()
    return Matrix((x, y, x.cross(y))).transposed()


def _aim(rest, target, hinge):
    return _frame(target, hinge) @ _frame(rest, Vector((1, 0, 0))).transposed()


def _set_rot(P, bone, m):
    e = m.to_euler('XYZ')
    P.rx(bone, math.degrees(e.x)); P.ry(bone, math.degrees(e.y)); P.rz(bone, math.degrees(e.z))


def leg_ik(P, side, ankle, pitch=0.0, toe=0.0):
    bones = P.arm.data.bones
    hips, ul, ll = bones['Hips'], bones['UpperLeg' + side], bones['LowerLeg' + side]
    rh = Euler(P.rot.get('Hips', (0.0, 0.0, 0.0)), 'XYZ').to_matrix()
    hip = hips.head_local + P.loc.get('Hips', Vector((0, 0, 0))) + rh @ (ul.head_local - hips.head_local)
    thigh, shin = ul.tail_local - ul.head_local, ll.tail_local - ll.head_local
    l1, l2 = thigh.length, shin.length
    d = Vector(ankle) - hip
    dist = min(d.length, 0.9995 * (l1 + l2))
    dn = d.normalized()
    hinge = rh @ Vector((1, 0, 0))
    hinge = (hinge - hinge.dot(dn) * dn).normalized()
    cos_a = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist)
    a = math.acos(max(-1.0, min(1.0, cos_a)))
    knee = hip + l1 * (math.cos(a) * dn + math.sin(a) * dn.cross(hinge))
    r1 = _aim(thigh, knee - hip, hinge)
    r2 = _aim(shin, hip + dist * dn - knee, hinge)
    _set_rot(P, 'UpperLeg' + side, rh.transposed() @ r1)
    _set_rot(P, 'LowerLeg' + side, r1.transposed() @ r2)
    _set_rot(P, 'Foot' + side, r2.transposed() @ Matrix.Rotation(math.radians(pitch), 3, 'X'))
    _set_rot(P, 'Toe' + side, Matrix.Rotation(math.radians(toe - pitch), 3, 'X'))


def _hermite(p0, p1, m0, m1, u):
    u2, u3 = u * u, u * u * u
    return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (3 * u2 - 2 * u3) * p1 + (u3 - u2) * m1


def _stance(s, g, foot):
    contact = g['y_td'] + g['speed'] * g['frames'] / 30 * s
    if s < g['roll_at']:
        return contact, foot['ankle_z'], 0.0
    pitch = g['toe_off'] * min_jerk((s - g['roll_at']) / (g['df'] - g['roll_at']))
    p = math.radians(pitch)
    by, bz = foot['ball_to_ankle']
    return contact - by + by * math.cos(p) - bz * math.sin(p), foot['ball_z'] + by * math.sin(p) + bz * math.cos(p), pitch


def _foot_track(s, g, foot):
    if s < g['df']:
        y, z, pitch = _stance(s, g, foot)
        return y, z, pitch, 0.0
    y0, z0, p0 = _stance(g['df'], g, foot)
    u = (s - g['df']) / (1 - g['df'])
    swing = (1 - g['df']) * g['speed'] * g['frames'] / 30
    y = _hermite(y0, g['y_td'], g['kick'] * swing, g['reach'] * swing, u)
    z = z0 + (foot['ankle_z'] - z0) * min_jerk(u) + g['lift'] * math.sin(math.pi * u ** 0.7)
    pitch = p0 * (1 - min_jerk(min(1.0, u / 0.5))) - g['dorsi'] * math.sin(math.pi * u)
    return y, z, pitch, pitch * min_jerk(min(1.0, u / 0.3))


def gait_cycle(g, extras, energy, harmonics):
    C = math.cos
    def f(ph, P):
        bones = P.arm.data.bones
        ankle, ball = bones['Foot.L'].head_local, bones['Toe.L'].head_local
        foot = dict(ankle_z=ankle.z, ball_z=ball.z, ball_to_ankle=(ankle.y - ball.y, ankle.z - ball.z))
        mid = g['df'] / 2
        a = 2 * math.pi * (ph - mid)
        stride = C(2 * math.pi * ph)
        P.move('Hips', g['sway'] * C(a), 0, g['hips_z'] - g['bob'] * C(2 * a))
        P.rx('Hips', g['hips_pitch']); P.ry('Hips', -g['roll'] * C(a)); P.rz('Hips', -g['yaw'] * stride)
        P.rx('Spine', g['spine']); P.ry('Spine', 0.7 * g['roll'] * C(a))
        P.rx('Chest', g['chest']); P.rz('Chest', g['twist'] * stride)
        P.rx('Head', g['head'] + g['nod'] * C(2 * a)); P.rz('Head', (g['yaw'] - g['twist']) * stride)
        for side, sgn, off in SIDES:
            y, z, pitch, toe = _foot_track((ph - off) % 1.0, g, foot)
            leg_ik(P, side, (sgn * g['track'], y, z), pitch, toe)
            t = C(2 * math.pi * (ph - off - g['arm_lag']))
            P.rx('UpperArm' + side, g['arm_mid'] + g['arm_amp'] * t)
            P.ry('UpperArm' + side, sgn * g['tuck'])
            P.rx('LowerArm' + side, -(g['elbow'] - g['elbow_amp'] * t))
        if extras:
            extras(ph - mid, P, energy, harmonics)
    return f


def gait_idle(P_, extras=None):
    S = math.sin
    def f(ph, P):
        a = 2 * math.pi * ph
        w = S(a - 0.8)
        P.move('Hips', 0.012 * w, 0, -0.008)
        P.ry('Hips', -1.5 * w); P.ry('Spine', 1.0 * w); P.ry('Chest', 0.5 * w)
        P.rx('Spine', -0.7 * S(a)); P.rx('Chest', -1.5 * S(a))
        P.rx('Head', 1.2 * S(2 * a - 0.6)); P.rz('Head', 4 * S(a + 1.0) + 1.5 * S(3 * a))
        for side, sgn, _ in SIDES:
            P.move('Shoulder' + side, 0, 0, 0.005 * S(a))
            P.rx('UpperArm' + side, -1.5 * S(a - 0.4)); P.ry('UpperArm' + side, sgn * 12)
            P.rx('LowerArm' + side, -(8 + 2 * S(a - 0.3)))
            P.rx('Hand' + side, 2 * S(2 * a))
            leg_ik(P, side, P.arm.data.bones['Foot' + side].head_local)
        if extras:
            extras(ph, P, 0.0, 1.0)
    return f


def gait_walk(extras=None):
    return gait_cycle(JOG, extras, 0.55, 2)


def gait_run(extras=None):
    return gait_cycle(SPRINT, extras, 1.0, 2)


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
