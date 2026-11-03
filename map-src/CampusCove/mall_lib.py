"""Shared context and helpers of the Cove Parkview Mall scripts (build_mall.py, mall_decor.py, mall_dressing.py).

`Ctx` owns the Blender collection, the COL_ boxes, the material dict `P`, the random generator and a lib_kit `Kit`
registry: every axis-aligned box built through `rect()` / `box()` is registered so `report()` can list coplanar
overlaps and contained boxes before the export (docs/BUILD_KIT.md). Cylinders, cones, texts and turned boxes are
built but not registered. Exclusion zones (`exclude`) and `clear()` implement the placement rules of docs/MALL.md
(escalator feet, open shopfronts, food court counters, walkway centre lanes, park gates).
"""
import math

import bmesh
import bpy

import lib_common as L
import lib_kit as K

TWO_PI = 2 * math.pi


class Ctx:
    def __init__(self, coll, cols, P, cat_mats, rnd):
        self.coll = coll
        self.cols = cols
        self.P = P
        self.CAT_MATS = cat_mats
        self.rnd = rnd
        self.kit = K.Kit()
        self.objs = []
        self.texts = 0
        self.tree_n = 0
        self.exclusions = []

    # ------------------------------------------------------------ primitives
    def add(self, o):
        self.objs.append(o)
        return o

    def register(self, name, x0, z0, x1, z1, y0, h, mat, col=False, tile=1.0):
        return self.kit.add(name, x0, z0, x1, z1, y0, y0 + h, mat, visible=True, collide=col, tile=tile)

    def rect(self, name, x0, z0, x1, z1, y0, h, mat, col=False, tile=2.0):
        cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
        sx, sz = abs(x1 - x0), abs(z1 - z0)
        self.register(name, x0, z0, x1, z1, y0, h, mat, col=col, tile=tile)
        o = self.add(L.box(self.coll, name, cx, cz, y0, sx, sz, h, mat, tile=tile))
        if col:
            self.cols.add(name, cx, cz, y0, sx, sz, h)
        return o

    def box(self, name, gx, gz, y0, sx, sz, h, mat, rot=0.0, bevel=0.0, tile=1.0, col=False):
        if abs(math.sin(rot)) < 1e-6:
            self.register(name, gx - sx / 2, gz - sz / 2, gx + sx / 2, gz + sz / 2, y0, h, mat, col=col, tile=tile)
        elif abs(math.cos(rot)) < 1e-6:
            self.register(name, gx - sz / 2, gz - sx / 2, gx + sz / 2, gz + sx / 2, y0, h, mat, col=col, tile=tile)
        o = self.add(L.box(self.coll, name, gx, gz, y0, sx, sz, h, mat, rot=rot, bevel=bevel, tile=tile))
        if col:
            self.cols.add(name, gx, gz, y0, sx, sz, h, rot=rot)
        return o

    def cyl(self, name, gx, gz, y0, radius, h, mat, seg=8, col=False):
        o = self.add(L.cyl(self.coll, name, gx, gz, y0, radius, h, mat, seg=seg))
        if col:
            self.cols.add(name, gx, gz, y0, 2 * radius + 0.1, 2 * radius + 0.1, h)
        return o

    def cone(self, name, gx, gz, y0, r1, r2, h, mat, seg=8):
        return self.add(L.cone(self.coll, name, gx, gz, y0, r1, r2, h, mat, seg=seg))

    def furn(self, name, gx, gz, rot, parts, col=None):
        o = self.add(L.furn(self.coll, name, gx, gz, rot, parts))
        if col:
            sx, sz, h = col
            self.cols.add(name, gx, gz, 0.0, sx, sz, h, rot=rot)
        return o

    def text(self, name, body, gx, gz, y0, size, mat, yaw):
        self.texts += 1
        cu = bpy.data.curves.new(name + "_cu", "FONT")
        cu.body = body
        cu.size = size
        cu.extrude = 0.0
        cu.resolution_u = 1
        cu.align_x = "CENTER"
        cu.align_y = "BOTTOM"
        tmp = bpy.data.objects.new(name + "_tmp", cu)
        self.coll.objects.link(tmp)
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
        self.coll.objects.unlink(tmp)
        bpy.data.objects.remove(tmp)
        bpy.data.curves.remove(cu)
        me.materials.append(mat)
        ob = bpy.data.objects.new(name, me)
        ob.rotation_euler = (math.pi / 2, 0, yaw)
        ob.location = L.b(gx, gz, y0)
        self.coll.objects.link(ob)
        return self.add(ob)

    def wedge(self, name, x0, z0, x1, z1, y_lo, y_hi, rise, mat):
        """A ramp over [x0,x1]x[z0,z1] climbing from y_lo to y_hi in the `rise` direction ('+x', '-x', '+z', '-z')."""
        me = bpy.data.meshes.new(name)
        bm = bmesh.new()
        cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
        hx, hz = (x1 - x0) / 2, (z1 - z0) / 2

        def h(x, z):
            t = {"+x": (x + hx) / (2 * hx), "-x": (hx - x) / (2 * hx), "+z": (z + hz) / (2 * hz), "-z": (hz - z) / (2 * hz)}[rise]
            return y_lo + (y_hi - y_lo) * t
        corners = [(-hx, -hz), (hx, -hz), (hx, hz), (-hx, hz)]
        bottom = [bm.verts.new((x, -z, 0.0)) for x, z in corners]
        top = [bm.verts.new((x, -z, h(x, z))) for x, z in corners]
        bm.faces.new(reversed(bottom))
        bm.faces.new(top)
        for i in range(4):
            j = (i + 1) % 4
            bm.faces.new((bottom[i], bottom[j], top[j], top[i]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.normal_update()
        uv = bm.loops.layers.uv.verify()
        for f in bm.faces:
            for l in f.loops:
                l[uv].uv = (l.vert.co.x / 2.0, (l.vert.co.y + l.vert.co.z) / 2.0)
        bm.to_mesh(me)
        bm.free()
        me.materials.append(mat)
        ob = bpy.data.objects.new(name, me)
        ob.location = L.b(cx, cz, 0.0)
        self.coll.objects.link(ob)
        return self.add(ob)

    def blob(self, name, gx, gz, y0, r, mat, sy=1.0):
        rnd = self.rnd
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r)
        for v in bm.verts:
            v.co.x += rnd.uniform(-0.14, 0.14) * r
            v.co.y += rnd.uniform(-0.14, 0.14) * r
            v.co.z = (v.co.z + rnd.uniform(-0.14, 0.14) * r) * sy
        zmin = min(v.co.z for v in bm.verts)
        for v in bm.verts:
            v.co.z -= zmin
        bm.normal_update()
        uv = bm.loops.layers.uv.verify()
        for f in bm.faces:
            for l in f.loops:
                l[uv].uv = (l.vert.co.x, l.vert.co.z)
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        me.materials.append(mat)
        ob = bpy.data.objects.new(name, me)
        ob.location = L.b(gx, gz, y0)
        self.coll.objects.link(ob)
        return self.add(ob)

    # ------------------------------------------------------------ placement rules
    def exclude(self, x0, z0, x1, z1, label):
        self.exclusions.append((min(x0, x1), min(z0, z1), max(x0, x1), max(z0, z1), label))

    def blocked_by(self, x, z, hx, hz):
        """The label of the first exclusion zone the footprint (x ± hx, z ± hz) touches, or None."""
        for x0, z0, x1, z1, label in self.exclusions:
            if x + hx > x0 and x - hx < x1 and z + hz > z0 and z - hz < z1:
                return label
        return None

    def clear(self, x, z, hx, hz):
        return self.blocked_by(x, z, hx, hz) is None

    # ------------------------------------------------------------ street furniture
    def tree(self, kind, gx, gz, s=1.0):
        P, rnd = self.P, self.rnd
        self.tree_n += 1
        i = self.tree_n
        if kind == "pine":
            self.cyl(f"MT_Pine{i:03d}_Trunk", gx, gz, 0.0, 0.18 * s, 1.2 * s, P["trunk"], seg=6)
            for k, (r1, h0, hh) in enumerate(((1.5, 0.9, 1.9), (1.15, 2.1, 1.7), (0.8, 3.2, 1.6))):
                self.cone(f"MT_Pine{i:03d}_Tier{k}", gx, gz, h0 * s, r1 * s, 0.05 * s, hh * s, P["pine"], seg=7)
        else:
            self.cone(f"MT_Tree{i:03d}_Trunk", gx, gz, 0.0, 0.2 * s, 0.12 * s, 1.9 * s, P["trunk"], seg=6)
            leaves = P["blossom"] if kind == "blossom" else None
            for k in range(3):
                a = rnd.uniform(0, TWO_PI)
                o = rnd.uniform(0.2, 0.7) * s
                self.blob(f"MT_Tree{i:03d}_Leaf{k}", gx + o * math.cos(a), gz + o * math.sin(a), rnd.uniform(1.5, 2.3) * s, rnd.uniform(0.85, 1.25) * s,
                          leaves or rnd.choice((P["leaf"], P["leaf2"])), sy=0.85)
        self.cols.add(f"Mall_Tree{i:03d}", gx, gz, 0.0, 0.6, 0.6, 3.0)

    def bench(self, name, gx, gz, rot):
        P = self.P
        self.furn(name, gx, gz, rot, [
            (-0.7, 0, 0.0, 0.08, 0.4, 0.42, P["steel"]), (0.7, 0, 0.0, 0.08, 0.4, 0.42, P["steel"]),
            (0, 0, 0.42, 1.7, 0.45, 0.06, P["wood"], 0.01), (0, 0.2, 0.48, 1.7, 0.06, 0.4, P["wood"], 0.01)], col=(1.7, 0.5, 0.9))

    def planter(self, name, gx, gz, w=1.6, d=0.7, flowers=True):
        P, rnd = self.P, self.rnd
        self.add(L.box(self.coll, f"{name}_Box", gx, gz, 0.0, w, d, 0.55, P["band"], bevel=0.02))
        self.add(L.box(self.coll, f"{name}_Leaf", gx, gz, 0.55, w - 0.2, d - 0.2, 0.3, P["leaf"], bevel=0.08))
        if flowers:
            self.add(L.box(self.coll, f"{name}_Flower", gx, gz, 0.78, w - 0.5, d - 0.4, 0.1, rnd.choice((P["flower"], P["flower2"], P["pink"])), bevel=0.04))
        self.cols.add(name, gx, gz, 0.0, w, d, 0.6)

    def lamp(self, name, gx, gz, h=4.0):
        P = self.P
        self.cyl(f"{name}_Pole", gx, gz, 0.0, 0.07, h, P["steel"], seg=6)
        self.add(L.box(self.coll, f"{name}_Head", gx, gz, h, 0.5, 0.5, 0.3, P["lamp"], bevel=0.03))
        self.cols.add(name, gx, gz, 0.0, 0.3, 0.3, h)

    def bin_(self, name, gx, gz):
        self.cyl(name, gx, gz, 0.0, 0.28, 0.9, self.P["dark"], seg=8)
        self.cols.add(name, gx, gz, 0.0, 0.6, 0.6, 0.9)

    def pillar(self, name, gx, gz, y0, h, r=0.35):
        self.cyl(name, gx, gz, y0, r, h, self.P["wall"], seg=12)
        self.cols.add(name, gx, gz, y0, 2 * r + 0.1, 2 * r + 0.1, h)

    def railing(self, name, axis, fixed, a0, a1, y0, gaps=()):
        """Glass balustrade with a steel handrail; `gaps` = [(g0, g1)] left open (escalator landings)."""
        P = self.P
        pieces = []
        cur = a0
        for g0, g1 in sorted(gaps):
            if g0 - cur > 0.05:
                pieces.append((cur, g0))
            cur = g1
        if a1 - cur > 0.05:
            pieces.append((cur, a1))
        for i, (p0, p1) in enumerate(pieces):
            if axis == "x":
                self.rect(f"{name}_Glass{i}", p0, fixed - 0.03, p1, fixed + 0.03, y0 + 0.08, 0.95, P["glass"])
                self.rect(f"{name}_Rail{i}", p0, fixed - 0.05, p1, fixed + 0.05, y0 + 1.03, 0.07, P["rail"])
                self.rect(f"{name}_Base{i}", p0, fixed - 0.06, p1, fixed + 0.06, y0, 0.08, P["steel"])
                self.cols.add(f"{name}_{i}", (p0 + p1) / 2, fixed, y0, p1 - p0, 0.12, 1.1)
            else:
                self.rect(f"{name}_Glass{i}", fixed - 0.03, p0, fixed + 0.03, p1, y0 + 0.08, 0.95, P["glass"])
                self.rect(f"{name}_Rail{i}", fixed - 0.05, p0, fixed + 0.05, p1, y0 + 1.03, 0.07, P["rail"])
                self.rect(f"{name}_Base{i}", fixed - 0.06, p0, fixed + 0.06, p1, y0, 0.08, P["steel"])
                self.cols.add(f"{name}_{i}", fixed, (p0 + p1) / 2, y0, 0.12, p1 - p0, 1.1)

    def kiosk(self, name, gx, gz, yaw, label, mat):
        """An octagonal sales kiosk: desk, four posts, a tent roof and a two-sided sign."""
        P = self.P
        self.cyl(f"{name}_Desk", gx, gz, 0.0, 1.4, 1.05, P["wall"], seg=8)
        self.cyl(f"{name}_Top", gx, gz, 1.05, 1.5, 0.06, mat, seg=8)
        for k in range(4):
            a = TWO_PI * k / 4 + math.pi / 4 + yaw
            self.cyl(f"{name}_Post{k}", gx + 1.25 * math.cos(a), gz + 1.25 * math.sin(a), 1.11, 0.04, 1.5, P["steel"], seg=5)
        self.cone(f"{name}_Roof", gx, gz, 2.6, 1.9, 0.2, 0.6, mat, seg=8)
        self.add(L.box(self.coll, f"{name}_Sign", gx, gz, 2.12, 2.2, 0.08, 0.42, P["dark"], rot=yaw))
        fx, fz = math.sin(yaw), math.cos(yaw)
        self.text(f"{name}_Text", label, gx + fx * 0.06, gz + fz * 0.06, 2.2, 0.26, P["sign"], yaw)
        self.text(f"{name}_TextB", label, gx - fx * 0.06, gz - fz * 0.06, 2.2, 0.26, P["sign"], yaw + math.pi)
        self.cols.add(name, gx, gz, 0.0, 3.0, 3.0, 1.1)

    def banner(self, name, gx, gz, yaw, mat, label):
        """A cloth banner hung from a balcony edge, the label on the walkway side."""
        P = self.P
        self.add(L.box(self.coll, f"{name}_Bar", gx, gz, 5.5, 1.3, 0.06, 0.06, P["steel"], rot=yaw))
        self.add(L.box(self.coll, f"{name}_Cloth", gx, gz, 3.3, 1.1, 0.04, 2.2, mat, rot=yaw))
        fx, fz = math.sin(yaw), math.cos(yaw)
        self.text(f"{name}_Text", label, gx + fx * 0.03, gz + fz * 0.03, 4.15, 0.22, P["sign"], yaw)

    def way_sign(self, name, body, gx, gz, yaw, wire_to=5.6):
        """A hanging direction board at a walkway junction; the wires reach `wire_to` (the slab or truss above)."""
        P = self.P
        self.add(L.box(self.coll, f"{name}_Board", gx, gz, 3.9, 3.4, 0.08, 0.6, P["band"], rot=yaw))
        fx, fz = math.sin(yaw), math.cos(yaw)
        self.text(f"{name}_Text", body, gx + fx * 0.06, gz + fz * 0.06, 4.05, 0.3, P["sign"], yaw)
        for o_ in (-1.5, 1.5):
            self.cyl(f"{name}_Wire{int(o_ * 10)}", gx + o_ * math.cos(yaw), gz - o_ * math.sin(yaw), 4.5, 0.012, wire_to - 4.5, P["steel"], seg=4)

    def plaza_sign(self, name, body, gx, gz, y, yaw, wire_to=7.0):
        P = self.P
        self.add(L.box(self.coll, f"{name}_Board", gx, gz, y, 4.6, 0.08, 0.9, P["band"], rot=yaw))
        fx, fz = math.sin(yaw), math.cos(yaw)
        self.text(f"{name}_Text", body, gx + fx * 0.06, gz + fz * 0.06, y + 0.22, 0.45, P["sign"], yaw)
        self.text(f"{name}_TextB", body, gx - fx * 0.06, gz - fz * 0.06, y + 0.22, 0.45, P["sign"], yaw + math.pi)
        for o_ in (-2.0, 2.0):
            self.cyl(f"{name}_Wire{int(o_)}", gx + o_ * math.cos(yaw), gz - o_ * math.sin(yaw), y + 0.9, 0.012, wire_to - y - 0.9, P["steel"], seg=4)

    def sculpture(self, name, gx, gz):
        """Stacked, slightly turned blocks on a stone drum: a court landmark."""
        P = self.P
        self.cyl(f"{name}_Base", gx, gz, 0.0, 1.6, 0.5, P["stone"], seg=12)
        y = 0.5
        for k, (ox, oz, s, h, mat) in enumerate(((0.0, 0.0, 1.1, 1.3, P["band"]), (0.3, -0.2, 0.8, 1.0, P["red"]), (-0.25, 0.25, 0.6, 0.9, P["yellow"]), (0.1, 0.1, 0.4, 0.8, P["blue"]))):
            self.add(L.box(self.coll, f"{name}_Cube{k}", gx + ox, gz + oz, y, s, s, h, mat, rot=0.4 * k, bevel=0.02))
            y += h
        self.cols.add(name, gx, gz, 0.0, 3.2, 3.2, 1.2)

    # ------------------------------------------------------------ checks
    def report(self, show=30):
        """List coplanar overlaps and contained boxes among the registered boxes; raise KitError if any."""
        return K.report(self.kit, show=show)
