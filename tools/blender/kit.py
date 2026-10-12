"""Parametric armor kit shared by the class sets.

Landmarks describe each base body in its T-pose (Blender Z up, facing -Y).
X values are given for the left side; builders mirror them with s = +1 / -1.
"""

import math
from types import SimpleNamespace

from mathutils import Matrix, Vector

import armory as A

MAN = SimpleNamespace(
    file="man.glb", H=4.845, u=1.0,
    head_c=(0, 0.06, 4.45), head_r=(0.3, 0.36, 0.42), face_y=-0.3, brow_z=4.4, chin_z=4.0,
    neck_c=(0, 0.08, 3.98), neck_r=(0.37, 0.33),
    chest_c=(0, 0.05, 3.42), chest_r=(0.56, 0.47, 0.76), chest_z=(2.86, 3.96), back_y=0.52,
    waist_c=(0, 0.04, 2.56), waist_r=0.52, waist_z=(2.28, 2.86), waist_sq=0.9,
    belt_z=(2.17, 2.33), belt_r=0.56, belt_y=0.02, belt_sq=0.88,
    shoulder=(0.64, 0.06, 3.86), pauldron_r=0.44,
    arm_y=0.05, arm_z=3.79, upper=(0.66, 1.14), upper_r=0.18, elbow=1.2, fore=(1.3, 2.04), fore_r=(0.16, 0.21),
    hand=(2.24, 0.08, 3.77), hand_r=(0.32, 0.19, 0.13), grip=(2.13, -0.1, 3.72),
    leg_x=(0.302, 0.318), leg_y=-0.03, hip_z=2.15, thigh=(1.4, 2.12), thigh_r=0.2, knee_z=1.34, knee_y=-0.17,
    shin=(0.26, 1.42), shin_r=0.19, foot_y=-0.18, foot_z=0.04, foot_r=(0.2, 0.42, 0.25), toe_y=-0.55,
    bones=dict(chest="Torso", belly="Abdomen", hips="Hips", head="Head", shoulder="Shoulder", upper="UpperArm",
               lower="LowerArm", hand="Palm", thigh="UpperLeg", shin="LowerLeg", foot="Foot"),
    body_mesh="BaseHuman",
)

WOMAN = SimpleNamespace(
    file="woman.glb", H=1.844, u=0.36,
    head_c=(0, -0.04, 1.68), head_r=(0.125, 0.165, 0.17), face_y=-0.19, brow_z=1.71, chin_z=1.55,
    neck_c=(0, -0.06, 1.52), neck_r=(0.09, 0.085),
    chest_c=(0, -0.085, 1.34), chest_r=(0.15, 0.13, 0.3), chest_z=(1.16, 1.52), back_y=0.04,
    waist_c=(0, -0.08, 1.14), waist_r=0.14, waist_z=(1.08, 1.18), waist_sq=0.85,
    belt_z=(1.09, 1.15), belt_r=0.15, belt_y=-0.08, belt_sq=0.82,
    shoulder=(0.15, -0.07, 1.455), pauldron_r=0.09,
    arm_y=-0.06, arm_z=1.443, upper=(0.14, 0.33), upper_r=0.045, elbow=0.335, fore=(0.35, 0.57), fore_r=(0.04, 0.05),
    hand=(0.67, -0.1, 1.43), hand_r=(0.12, 0.08, 0.035), grip=(0.66, -0.1, 1.41),
    leg_x=(0.097, 0.097), leg_y=-0.05, hip_z=1.04, thigh=(0.6, 1.0), thigh_r=0.075, knee_z=0.56, knee_y=-0.1,
    shin=(0.1, 0.6), shin_r=0.062, foot_y=-0.12, foot_z=0.02, foot_r=(0.065, 0.15, 0.09), toe_y=-0.26,
    bones=dict(chest="Chest", belly="Abdomen", hips="Hips", head="Head", shoulder="Shoulder", upper="UpperArm",
               lower="LowerArm", hand="Wrist", thigh="UpperLeg", shin="LowerLeg", foot="Foot"),
    body_mesh="Formal_Body",
    skirt_z=(0.6, 1.13), skirt_r=0.21,
)


def P(co, no):
    return (co, no)


def V(*a):
    return Vector(a if len(a) == 3 else a[0])


def sfx(s):
    return ".L" if s > 0 else ".R"


def bone(b, key, s=None):
    return b.bones[key] + (sfx(s) if s is not None else "")


def leg_x(b, s):
    return b.leg_x[0] if s > 0 else -b.leg_x[1]


def frame(origin, up, fwd):
    """Matrix whose local +Z is `up` and local -Y faces `fwd`."""
    z = Vector(up).normalized()
    f = Vector(fwd)
    y = -(f - z * f.dot(z)).normalized()
    x = y.cross(z)
    o = Vector(origin)
    return Matrix(((x.x, y.x, z.x, o.x), (x.y, y.y, z.y, o.y), (x.z, y.z, z.z, o.z), (0, 0, 0, 1)))


class Set:
    def __init__(self, b, arm, prefix, mats):
        self.b = b
        self.arm = arm
        self.prefix = prefix
        self.m = mats
        self.pieces = {}

    def piece(self, name, key, s=None):
        full = self.prefix + name + (sfx(s) if s is not None else "")
        if full not in self.pieces:
            self.pieces[full] = A.Piece(full, bone(self.b, key, s))
        return self.pieces[full]

    def build(self):
        for piece in self.pieces.values():
            if len(piece.bm.verts):
                piece.build(self.arm)
            else:
                piece.bm.free()
        self.pieces = {}

    # ------------------------------------------------------------ shoulders
    def pauldrons(self, style="dome", size=1.0, spikes=0, main="plate", alt="dark", trim="trim", accent="glow", lames=2):
        b, u, m = self.b, self.b.u, self.m
        for s in (1, -1):
            p = self.piece("Pauldron", "shoulder", s)
            r = b.pauldron_r * size
            c = V(s * b.shoulder[0], b.shoulder[1], b.shoulder[2])
            inner = P((s * (abs(c.x) - r * 0.78), 0, 0), (s, 0, 0))
            if style == "disc":
                axis = V(s * 0.75, 0, 0.66)
                p.add(A.tube(c + axis * r * 0.25, c + axis * r * 0.5, r * 1.08, r * 1.0, segs=40, caps=True), m[main], bevel=0.012 * u)
                p.add(A.ring(c + axis * r * 0.5, r * 1.0, r * 1.0, 0.05 * r, rot=A.aim(axis).to_3x3(), segs=40), m[trim])
                p.add(A.gem(c + axis * r * 0.56, r * 0.22, (1, 1, 0.6)), m[accent])
                for k in range(8):
                    a = 2 * math.pi * k / 8
                    off = A.aim(axis).to_3x3() @ V(math.cos(a) * r * 0.75, math.sin(a) * r * 0.75, 0)
                    p.add(A.gem(c + axis * r * 0.52 + off, r * 0.06), m[trim])
                continue
            if style == "fur":
                for k in range(16):
                    a = math.pi * (k / 15) - math.pi / 2
                    base = c + V(s * math.cos(a) * r * 0.55, math.sin(a) * r * 0.75, r * 0.1)
                    tip = base + V(s * math.cos(a) * r * 0.5, math.sin(a) * r * 0.45, r * (0.25 + 0.15 * (k % 3)))
                    p.add(A.horn(base, base.lerp(tip, 0.5) + V(0, 0, r * 0.15), tip, r * 0.32, segs=7, rings=8, power=0.8), m["fur"])
                p.add(A.shell(c, (r * 0.95, r * 0.95, r * 0.7), [P((0, 0, c.z - r * 0.25), (0, 0, 1)), inner]), m[main], solid=0.035 * u, bevel=0.01 * u)
                continue
            dome_mat = m["bone"] if style == "skull" else m[main]
            p.add(A.shell(c, (r, r, r * 0.86), [P((0, 0, c.z - r * 0.36), (0, 0, 1)), inner]), dome_mat, solid=0.11 * r, bevel=0.03 * r)
            for i in range(lames):
                z0 = c.z - r * (0.32 + 0.4 * i)
                p.add(A.cut(A.tube(V(c.x, c.y, z0), V(c.x, c.y, z0 - r * 0.42), r * (0.98 + 0.2 * i), r * (1.2 + 0.2 * i), segs=56),
                            [P((s * (abs(c.x) - r * (0.45 - 0.2 * i)), 0, 0), (s, 0, 0))]), m[alt if i % 2 == 0 else main], solid=0.08 * r, bevel=0.022 * r)
            bottom = c.z - r * (0.32 + 0.4 * lames) - r * 0.02
            p.add(A.ring(V(c.x, c.y, bottom), r * (1.0 + 0.2 * lames), r * (1.0 + 0.2 * lames), 0.065 * r,
                         keep=lambda co, s=s, c=c, r=r: co.x * s > abs(c.x) - r * 0.2), m[trim])
            p.add(A.ring(V(c.x, c.y, c.z - r * 0.3), r * 0.95, r * 0.95, 0.075 * r, keep=lambda co, s=s, c=c, r=r: co.x * s > abs(c.x) - r * 0.62), m[trim])
            if style == "skull":
                for e in (-1, 1):
                    p.add(A.gem(c + V(s * r * 0.55, e * r * 0.3 - r * 0.2, r * 0.25), r * 0.17, (0.6, 1, 1)), m[accent])
                for e in (-1, 1):
                    base = c + V(s * r * 0.3, e * r * 0.45, r * 0.6)
                    p.add(A.horn(base, base + V(s * r * 0.4, e * r * 0.5, r * 0.9), base + V(s * r * 1.2, e * r * 0.2, r * 0.6), r * 0.22), m["bone"])
            if style == "crystal":
                for k, (ox, oy, h) in enumerate(((0.1, 0.0, 1.5), (0.45, 0.35, 1.0), (0.45, -0.35, 1.05), (0.75, 0.0, 0.8))):
                    base = c + V(s * r * ox, r * oy, r * 0.65)
                    p.add(A.horn(base, base + V(s * r * 0.15, r * oy * 0.3, r * h * 0.5), base + V(s * r * (0.35 + ox * 0.3), r * oy * 0.5, r * h), r * 0.2, segs=5, rings=6, power=0.9), m[accent])
            if style == "wing":
                for k in range(5):
                    a = 0.2 + k * 0.28
                    base = c + V(s * r * 0.35, r * 0.25, r * 0.55)
                    tip = base + V(s * r * (0.6 + 0.35 * k), r * 0.5, r * (1.6 - 0.25 * k))
                    p.add(A.horn(base, base.lerp(tip, 0.5) + V(s * r * 0.1, r * 0.2, 0), tip, r * 0.24, segs=6, flat=0.25, power=0.7), m[trim if k % 2 else main])
            if style == "leaf":
                for k in range(7):
                    a = math.pi * k / 6 - math.pi / 2
                    base = c + V(s * math.cos(a) * r * 0.6, math.sin(a) * r * 0.6, r * 0.25)
                    tip = base + V(s * math.cos(a) * r * 0.75, math.sin(a) * r * 0.65, r * 0.55)
                    p.add(A.horn(base, base.lerp(tip, 0.5) + V(0, 0, r * 0.25), tip, r * 0.3, segs=6, flat=0.22, power=0.6), m["leaf"])
            for k in range(spikes):
                f = (k + 0.5) / spikes
                base = c + V(s * r * (0.05 + 0.6 * f), r * (0.2 - 0.4 * f), r * (0.75 - 0.35 * f))
                ctrl = base + V(s * r * 0.2, r * 0.15, r * (1.0 - 0.4 * f))
                tip = base + V(s * r * (0.9 + 0.5 * f), r * (0.5 - 0.3 * f), r * (1.7 - 0.9 * f))
                p.add(A.horn(base, ctrl, tip, r * (0.3 - 0.08 * f), power=1.15), m[alt])
            for k in range(7):
                a = math.pi * (k + 0.5) / 7 - math.pi / 2
                p.add(A.gem(V(c.x + s * r * 0.98 * math.cos(a), c.y + r * 0.98 * math.sin(a), c.z - r * 0.28), r * 0.055), m[trim])

    # ------------------------------------------------------------ torso
    def chest(self, style="plate", main="plate", trim="trim", panel=None, collar=True, spike=False):
        b, u, m = self.b, self.b.u, self.m
        p = self.piece("Chest", "chest")
        c, r = V(b.chest_c), V(b.chest_r)
        z0, z1 = b.chest_z
        thick = 0.045 if style == "plate" else 0.025
        p.add(A.shell(c, r, [P((0, 0, z0), (0, 0, 1)), P((0, 0, z1), (0, 0, -1))]), m[main], solid=thick * u, bevel=0.01 * u)
        grow = (thick + 0.012) * u
        outer = (r.x + grow, r.y + grow, r.z + grow)
        if panel:
            pz0, pz1 = z0 + (z1 - z0) * 0.12, z1 - (z1 - z0) * 0.08
            wedge = r.x * 0.12
            if style == "robe":
                planes = [P((0, 0, pz0), (0, 0, 1)), P((0, 0, pz1), (0, 0, -1)), P((0, c.y - r.y * 0.4, 0), (0, -1, 0)),
                          P((wedge, 0, pz1), (-0.94, 0, -0.34)), P((-wedge, 0, pz1), (0.94, 0, -0.34))]
            else:
                planes = [P((0, 0, pz0), (0, 0, 1)), P((0, 0, pz1), (0, 0, -1)), P((0, c.y - r.y * 0.4, 0), (0, -1, 0)),
                          P((wedge, 0, pz0), (-0.94, 0, 0.34)), P((-wedge, 0, pz0), (0.94, 0, 0.34))]
            p.add(A.shell(c, outer, planes), m[panel], solid=0.02 * u, bevel=0.006 * u)
        if style == "leather":
            for s in (1, -1):
                a = c + V(s * r.x * 0.85, -r.y * 0.25, r.z * 0.45)
                bb = c + V(-s * r.x * 0.75, -r.y * 0.6, -r.z * 0.45)
                strap = A.tube(a, bb, 0.035 * u + r.x * 0.03, 0.035 * u + r.x * 0.03, squash=(1, 0.35), segs=8, caps=True)
                p.add(A.cut(strap, [P((0, c.y, 0), (0, -1, 0))]), m["leather2"])
                if s > 0:
                    p.add(A.box(c + V(0, -r.y * 1.0, -r.z * 0.05), (r.x * 0.2, r.y * 0.08, r.x * 0.16)), m[trim], bevel=0.008 * u)
        if style == "lamellar":
            for k in range(5):
                z = z0 + (z1 - z0) * (0.12 + 0.17 * k)
                f = math.sqrt(max(0.05, 1 - ((z - c.z) / r.z) ** 2))
                p.add(A.ring(V(c.x, c.y, z), r.x * f + grow, r.y * f + grow, 0.018 * u + r.x * 0.012, flat=0.5), m[trim])
        if style == "coat":
            for s in (1, -1):
                lapel = A.shell(c, outer, [P((0, 0, z0 + (z1 - z0) * 0.5), (0, 0, 1)), P((0, 0, z1 - 0.01), (0, 0, -1)),
                                           P((0, c.y - r.y * 0.3, 0), (0, -1, 0)), P((s * 0.02 * u, 0, 0), (s, 0, 0)),
                                           P((s * r.x * 0.12, 0, z0 + (z1 - z0) * 0.5), (-s * 0.96, 0, 0.28))])
                p.add(lapel, m["dark"], solid=0.02 * u, bevel=0.005 * u)
                p.add(A.cut(A.ring(V(c.x, c.y, z0 + (z1 - z0) * 0.75), r.x + grow * 1.5, r.y + grow * 1.5, 0.012 * u + r.x * 0.01, rot=Matrix.Rotation(-s * 0.9, 3, "Y")),
                            [P((0, c.y - r.y * 0.5, 0), (0, -1, 0))]), m[trim])
            for k in range(4):
                z = z0 + (z1 - z0) * (0.12 + 0.12 * k)
                for s in (1, -1):
                    p.add(A.gem(V(s * r.x * 0.22, c.y - r.y * 1.0 - grow, z), r.x * 0.05), m["metal"])
        if collar:
            nc, nr = V(b.neck_c), b.neck_r
            if style in ("robe", "coat"):
                p.add(A.tube(V(nc.x, nc.y, nc.z - 0.06 * u), V(nc.x, nc.y + 0.02 * u, nc.z + b.head_r[2] * 0.1), nr[0] * 1.02, nr[0] * 1.3, squash=(1, nr[1] / nr[0]), segs=40),
                      m[main if style == "coat" else trim], solid=0.02 * u, bevel=0.006 * u)
            else:
                p.add(A.ring(nc, nr[0], nr[1], 0.07 * u + nr[0] * 0.05, msegs=12), m[trim])
        if spike:
            p.add(A.horn(c + V(0, -r.y - grow, r.z * 0.15), c + V(0, -r.y - grow - 0.13 * u, r.z * 0.18), c + V(0, -r.y - grow - 0.27 * u, r.z * 0.28), 0.07 * u), m["dark"])
        p.add(A.ring(V(c.x, c.y, z0 + 0.02 * u), r.x * math.sqrt(1 - ((z0 - c.z) / r.z) ** 2) + grow * 0.6,
                     r.y * math.sqrt(1 - ((z0 - c.z) / r.z) ** 2) + grow * 0.6, 0.03 * u + r.x * 0.01), m[trim])

    def belly(self, main="plate", alt="dark", bands=3):
        b, u, m = self.b, self.b.u, self.m
        p = self.piece("Belly", "belly")
        z0, z1 = b.waist_z
        step = (z1 - z0) / bands
        for i in range(bands):
            top = z1 - step * i
            p.add(A.tube(V(0, b.waist_c[1], top - step * 1.05), V(0, b.waist_c[1], top), b.waist_r + 0.02 * u + 0.01 * i * u, b.waist_r, squash=(1.0, b.waist_sq)),
                  m[main if i % 2 == 0 else alt], solid=0.035 * u, bevel=0.01 * u)

    def belt(self, main="leather", buckle="metal", gem="glow", sash=None):
        b, u, m = self.b, self.b.u, self.m
        p = self.piece("Belt", "hips")
        z0, z1 = b.belt_z
        y, r = b.belt_y, b.belt_r
        p.add(A.tube(V(0, y, z0), V(0, y, z1), r, r * 0.99, squash=(1.0, b.belt_sq)), m[main], solid=0.04 * u, bevel=0.008 * u)
        front = y - r * b.belt_sq - 0.03 * u
        h = z1 - z0
        p.add(A.box(V(0, front, (z0 + z1) / 2), (h * 1.5, 0.05 * u + h * 0.2, h * 1.3)), m[buckle], bevel=0.015 * u)
        if gem:
            p.add(A.gem(V(0, front - 0.04 * u - h * 0.1, (z0 + z1) / 2), h * 0.32, (1, 0.6, 1)), m[gem])
        if sash:
            for k, (dx, ln) in enumerate(((0.18, 1.0), (0.3, 0.8))):
                top = V(r * 0.55 + dx * r * 0.3, y - r * b.belt_sq * 0.75, z0)
                p.add(A.box(top + V(0, 0, -h * 1.6 * ln), (h * 0.7, 0.02 * u + h * 0.08, h * 3.2 * ln), rot=Matrix.Rotation(0.12 * (k + 1), 3, "Y")), m[sash], bevel=0.006 * u)

    def tabard(self, mat, length=0.55, width=0.5, back=True):
        """Cloth panels hanging from the belt; split per leg so running legs don't pierce them."""
        b, u, m = self.b, self.b.u, self.m
        z0 = b.belt_z[0]
        y, r = b.belt_y, b.belt_r * b.belt_sq
        drop = (b.hip_z - b.knee_z) * length * 1.6
        for s in (1, -1):
            p = self.piece("Tabard", "thigh", s)
            for face in ((-1,) + ((1,) if back else ())):
                cy = y + face * (r + 0.02 * u)
                p.add(A.box(V(s * b.belt_r * width * 0.27, cy, z0 - drop / 2 + 0.02 * u), (b.belt_r * width * 0.5, 0.02 * u + r * 0.03, drop)), m[mat], bevel=0.006 * u)

    def skirt(self, mat, trim=None, length=1.0, flare=1.6):
        """Robe skirt as two halves riding the thighs."""
        b, u, m = self.b, self.b.u, self.m
        top = b.belt_z[0] + 0.01 * u
        bottom = top - (top - b.shin[0]) * length
        for s in (1, -1):
            p = self.piece("Skirt", "thigh", s)
            r0 = b.belt_r * 1.02
            r1 = r0 * flare
            half = A.cut(A.tube(V(0, b.belt_y, top), V(0, b.belt_y, bottom), r0, r1, squash=(1.0, b.belt_sq), segs=64), [P((s * -0.004 * u, 0, 0), (s, 0, 0))])
            p.add(half, m[mat], solid=0.02 * u, bevel=0.005 * u)
            if trim:
                p.add(A.ring(V(0, b.belt_y, bottom + 0.01 * u), r1 * 1.01, r1 * b.belt_sq * 1.01, 0.012 * u + r1 * 0.025,
                             keep=lambda co, s=s: co.x * s > -0.004 * u), m[trim])

    def cape(self, mat, trim=None, length=1.0, width=1.0):
        b, u, m = self.b, self.b.u, self.m
        p = self.piece("Cape", "chest")
        c, r = V(b.chest_c), V(b.chest_r)
        top = b.chest_z[1] - 0.05 * u
        bottom = top - (top - b.knee_z) * length
        rr = r.x * 1.12 * width
        cape = A.cut(A.tube(V(0, c.y + r.y * 0.45, bottom), V(0, c.y + r.y * 0.2, top), rr * 1.35, rr, squash=(1.0, 0.75), segs=48),
                     [P((0, c.y + r.y * 0.35, 0), (0, 1, 0))])
        p.add(cape, m[mat], solid=0.025 * u, bevel=0.006 * u)
        if trim:
            p.add(A.ring(V(0, c.y + r.y * 0.45, bottom + 0.015 * u), rr * 1.35, rr * 1.35 * 0.75, 0.02 * u + rr * 0.025,
                         keep=lambda co: co.y > c.y + r.y * 0.38), m[trim])
        for s in (1, -1):
            p.add(A.gem(V(s * r.x * 0.62, c.y - r.y * 0.55, top - 0.04 * u), r.x * 0.09, (1, 0.6, 1)), m[trim or mat])

    # ------------------------------------------------------------ limbs
    def arms(self, style="plate", main="plate", trim="trim", glove="dark", upper=True, fins=0, elbow=False):
        b, u, m = self.b, self.b.u, self.m
        X = V(1, 0, 0)
        for s in (1, -1):
            lo = self.piece("Bracer", "lower", s)
            f0, f1 = b.fore
            r0, r1 = b.fore_r
            y, z = b.arm_y, b.arm_z
            if style == "wrap":
                for k in range(6):
                    x = f0 + (f1 - f0) * (0.1 + 0.15 * k)
                    rr = r0 + (r1 - r0) * (0.1 + 0.15 * k)
                    lo.add(A.ring(V(s * x, y, z), rr * 0.92, rr * 0.92, rr * 0.18, rot=A.aim(X).to_3x3(), segs=24, msegs=6), m[main])
            else:
                lo.add(A.tube(V(s * f0, y, z), V(s * f1, y, z), r0, r1, segs=40), m[main], solid=0.035 * u, bevel=0.01 * u)
            lo.add(A.ring(V(s * (f1 - 0.02 * u), y, z), r1 * 1.03, r1 * 1.03, r1 * 0.15, rot=A.aim(X).to_3x3(), segs=40), m[trim])
            for k in range(fins):
                x = f0 + (f1 - f0) * (0.25 + 0.25 * k)
                lo.add(A.horn(V(s * x, y, z + r1 * 0.9), V(s * (x + r1 * 0.3), y, z + r1 * 1.5), V(s * (x + r1 * 0.9), y, z + r1 * 1.8), r1 * 0.28, segs=6, flat=0.45), m["dark"])
            if elbow:
                lo.add(A.shell(V(s * b.elbow, y + b.upper_r * 0.4, z), (b.upper_r * 0.85,) * 3, [P((0, y + b.upper_r * 0.2, 0), (0, 1, 0))]), m[main], solid=0.03 * u, bevel=0.01 * u)
            if glove:
                hd = self.piece("Glove", "hand", s)
                hc, hr = V(s * b.hand[0], b.hand[1], b.hand[2]), b.hand_r
                hd.add(A.shell(hc, (hr[0] * 1.05, hr[1] * 1.05, hr[2] * 1.15)), m[glove], bevel=0.006 * u)
            if upper:
                up = self.piece("Rerebrace", "upper", s)
                u0, u1 = b.upper
                if style == "wrap":
                    for k in range(4):
                        x = u0 + (u1 - u0) * (0.15 + 0.22 * k)
                        up.add(A.ring(V(s * x, y, z), b.upper_r * 1.0, b.upper_r * 1.0, b.upper_r * 0.18, rot=A.aim(X).to_3x3(), segs=24, msegs=6), m[main])
                else:
                    up.add(A.tube(V(s * u0, y, z), V(s * u1, y, z), b.upper_r * 1.1, b.upper_r * 0.95, segs=40), m["dark" if style == "plate" else main], solid=0.03 * u, bevel=0.01 * u)

    def legs(self, style="plate", main="plate", trim="trim", boot="dark", knee=True, knee_spike=False, height=1.0, cuff=False, thigh=None):
        b, u, m = self.b, self.b.u, self.m
        for s in (1, -1):
            cx = leg_x(b, s)
            sh = self.piece("Boot", "shin", s)
            s0, s1 = b.shin
            top = s0 + (s1 - s0) * height
            r = b.shin_r
            sh.add(A.tube(V(cx, b.leg_y, s0), V(cx, b.leg_y - 0.005 * u, top), r * 1.06, r * 1.0, squash=(0.95, 1.05)), m[main], solid=0.035 * u, bevel=0.01 * u)
            if cuff:
                sh.add(A.tube(V(cx, b.leg_y, top - r * 0.6), V(cx, b.leg_y - r * 0.2, top + r * 0.5), r * 1.08, r * 1.45, segs=40), m[boot], solid=0.03 * u, bevel=0.008 * u)
            sh.add(A.ring(V(cx, b.leg_y, top - r * 0.12), r * 1.05, r * 1.1, r * 0.15, segs=40), m[trim])
            if style == "plate":
                sh.add(A.shell(V(cx, b.leg_y - r * 0.1, (s0 + top) / 2), (r * 1.08, r * 1.2, (top - s0) * 0.55),
                               [P((0, b.leg_y - r * 0.6, 0), (0, -1, 0)), P((0, 0, s0 + r * 0.4), (0, 0, 1)), P((0, 0, top - r * 0.3), (0, 0, -1))]), m[trim], solid=0.02 * u, bevel=0.006 * u)
            if knee and height >= 0.95:
                kc = V(cx, b.knee_y, b.knee_z)
                sh.add(A.shell(kc, (r * 1.0, r * 0.8, r * 1.0), [P((0, b.knee_y + r * 0.35, 0), (0, -1, 0))]), m[main], solid=0.03 * u, bevel=0.01 * u)
                if knee_spike:
                    sh.add(A.horn(kc + V(0, -r * 0.75, r * 0.2), kc + V(0, -r * 1.5, r * 0.4), kc + V(0, -r * 2.0, r * 1.25), r * 0.33, segs=8), m["dark"])
            ft = self.piece("Sabaton", "foot", s)
            fr = b.foot_r
            ft.add(A.shell(V(cx, b.foot_y, b.foot_z), (fr[0], fr[1], fr[2]), [P((0, 0, 0.004 * u), (0, 0, 1))]), m[boot], solid=0.03 * u, bevel=0.01 * u)
            ft.add(A.ring(V(cx, b.foot_y, b.foot_z + 0.02 * u), fr[0] * 1.02, fr[1] * 1.01, fr[0] * 0.12, segs=48), m[trim])
            if thigh:
                th = self.piece("Cuisse", "thigh", s)
                t0, t1 = b.thigh
                th.add(A.tube(V(cx, b.leg_y, t0), V(cx, b.leg_y, t1), b.thigh_r * 0.98, b.thigh_r * 1.08), m[thigh], solid=0.03 * u, bevel=0.008 * u)

    # ------------------------------------------------------------ head
    def head(self, style, main="cloth", trim="trim", accent="glow", **kw):
        b, u, m = self.b, self.b.u, self.m
        p = self.piece("Head", "head")
        c, r = V(b.head_c), V(b.head_r)
        if style in ("hood", "cowl", "horned_hood"):
            hr = (r.x * 1.22, r.y * 1.16, r.z * 1.14)
            hc = c + V(0, r.y * 0.1, r.z * 0.04)
            open_y = c.y - r.y * 0.35
            face = P((0, open_y, 0), (0, 1, 0))
            p.add(A.shell(hc, hr, [P((0, 0, b.brow_z + r.z * 0.02), (0, 0, 1))]), m[main], solid=0.03 * u, bevel=0.008 * u)
            p.add(A.shell(hc, hr, [P((0, 0, b.chin_z - r.z * 0.15), (0, 0, 1)), P((0, 0, b.brow_z + r.z * 0.04), (0, 0, -1)), face]), m[main], solid=0.03 * u, bevel=0.008 * u)
            k = math.sqrt(max(0.05, 1 - ((open_y - hc.y) / hr[1]) ** 2))
            p.add(A.ring(V(0, open_y, hc.z), hr[0] * k + 0.02 * u, hr[2] * k + 0.02 * u, r.x * 0.07, rot=Matrix.Rotation(math.pi / 2, 3, "X"),
                         keep=lambda co: co.z > b.chin_z - r.z * 0.1), m[trim])
            if style == "hood":
                tip_base = hc + V(0, hr[1] * 0.75, hr[2] * 0.55)
                p.add(A.horn(tip_base, tip_base + V(0, r.y * 0.6, r.z * 0.1), tip_base + V(0, r.y * 1.1, -r.z * 0.45), r.x * 0.55, power=0.9), m[main])
            if style == "horned_hood":
                for s in (-1, 1):
                    base = hc + V(s * hr[0] * 0.8, 0, hr[2] * 0.45)
                    p.add(A.horn(base, base + V(s * r.x * 0.9, r.y * 0.4, r.z * 0.3), base + V(s * r.x * 0.6, -r.y * 0.6, r.z * 1.3), r.x * 0.28, twist=1.2), m[kw.get("horn", "bone")])
                    if kw.get("horns2"):
                        low = hc + V(s * hr[0] * 0.92, hr[1] * 0.3, hr[2] * 0.05)
                        p.add(A.horn(low, low + V(s * r.x * 0.9, r.y * 0.6, -r.z * 0.1), low + V(s * r.x * 1.5, r.y * 0.2, r.z * 0.9), r.x * 0.2, twist=0.8), m[kw.get("horn", "bone")])
            if kw.get("mantle", True):
                nc, nr = V(b.neck_c), b.neck_r
                p.add(A.tube(V(nc.x, nc.y + 0.02 * u, b.chin_z + r.z * 0.05), V(nc.x, nc.y + 0.04 * u, nc.z - r.z * 0.35), nr[0] * 1.15, nr[0] * 1.9, squash=(1, 0.95), segs=48), m[main], solid=0.025 * u, bevel=0.006 * u)
        if style == "circlet" or kw.get("circlet"):
            p.add(A.ring(V(c.x, c.y, b.brow_z + r.z * 0.12), r.x * 1.03, r.y * 1.03, r.x * 0.05, flat=1.6), m[trim])
            p.add(A.gem(V(0, c.y - r.y * 1.04, b.brow_z + r.z * 0.14), r.x * 0.14, (1, 0.6, 1.3)), m[accent])
        if style == "mitre":
            hc = V(c.x, c.y, b.brow_z + r.z * 0.1)
            p.add(A.tube(hc, hc + V(0, 0, r.z * 0.9), r.x * 1.04, r.x * 1.2, squash=(1, r.y / r.x), segs=40, caps=False), m[main], solid=0.03 * u, bevel=0.008 * u)
            p.add(A.horn(hc + V(0, 0, r.z * 0.85), hc + V(0, 0, r.z * 1.3), hc + V(0, 0, r.z * 1.8), r.x * 1.18, segs=24, rings=10, power=1.4), m[main])
            p.add(A.ring(hc + V(0, 0, r.z * 0.05), r.x * 1.06, r.y * 1.06, r.x * 0.07), m[trim])
            p.add(A.ring(hc + V(0, 0, r.z * 0.88), r.x * 1.2, r.y * 1.2, r.x * 0.07), m[trim])
            p.add(A.box(hc + V(0, -r.y * 1.12, r.z * 0.75), (r.x * 0.16, r.x * 0.04, r.z * 1.1)), m[trim], bevel=0.005 * u)
            p.add(A.box(hc + V(0, -r.y * 1.12, r.z * 0.85), (r.x * 0.6, r.x * 0.04, r.x * 0.16)), m[trim], bevel=0.005 * u)
            p.add(A.gem(hc + V(0, -r.y * 1.16, r.z * 0.85), r.x * 0.12), m[accent])
        if style == "halo" or kw.get("halo"):
            p.add(A.ring(c + V(0, r.y * 1.3, r.z * 0.55), r.x * 1.35, r.x * 1.35, r.x * 0.06, rot=Matrix.Rotation(math.pi / 2, 3, "X"), segs=64), m[accent])
            for k in range(12):
                a = 2 * math.pi * k / 12
                base = c + V(math.cos(a) * r.x * 1.35, r.y * 1.3, r.z * 0.55 + math.sin(a) * r.x * 1.35)
                d = V(math.cos(a), 0, math.sin(a))
                p.add(A.horn(base, base + d * r.x * 0.15, base + d * r.x * 0.35, r.x * 0.07, segs=5, rings=4), m[accent])
        if style == "antlers":
            p.add(A.ring(V(c.x, c.y, b.brow_z + r.z * 0.15), r.x * 1.05, r.y * 1.05, r.x * 0.09, flat=1.3), m[kw.get("band", "leather")])
            for s in (-1, 1):
                base = c + V(s * r.x * 0.75, r.y * 0.05, r.z * 0.6)
                tip = base + V(s * r.x * 1.6, r.y * 0.5, r.z * 2.2)
                p.add(A.horn(base, base + V(s * r.x * 0.5, r.y * 0.2, r.z * 1.2), tip, r.x * 0.17, power=0.8), m["antler"])
                for k, t in enumerate((0.35, 0.6, 0.8)):
                    pt = base.lerp(tip, t) + V(s * r.x * 0.1, 0, -r.z * 0.1)
                    p.add(A.horn(pt, pt + V(s * r.x * 0.35, -r.y * 0.35, r.z * 0.25), pt + V(s * r.x * (0.6 - 0.12 * k), -r.y * 0.8, r.z * (0.7 - 0.15 * k)), r.x * 0.1, rings=8, segs=8), m["antler"])
                for k in range(3):
                    lb = c + V(s * r.x * (0.9 - 0.1 * k), -r.y * (0.3 - 0.35 * k), r.z * 0.45)
                    p.add(A.horn(lb, lb + V(s * r.x * 0.3, -r.y * 0.1, r.z * 0.1), lb + V(s * r.x * 0.55, r.y * 0.1, -r.z * 0.2), r.x * 0.18, segs=6, flat=0.25, power=0.6), m["leaf"])
        if style == "kasa":
            hc = V(c.x, c.y, b.brow_z + r.z * 0.25)
            p.add(A.tube(hc, hc + V(0, 0, r.z * 0.75), r.x * 2.9, r.x * 0.15, segs=48, caps=False), m[main], solid=0.03 * u, bevel=0.008 * u, offset=-1.0)
            p.add(A.ring(hc + V(0, 0, 0.01 * u), r.x * 2.88, r.x * 2.88, r.x * 0.06), m[trim])
            p.add(A.ring(hc + V(0, 0, r.z * 0.3), r.x * 1.8, r.x * 1.8, r.x * 0.05), m[trim])
            p.add(A.gem(hc + V(0, 0, r.z * 0.78), r.x * 0.2), m[accent])
        if style == "tricorne":
            hc = V(c.x, c.y, b.brow_z + r.z * 0.15)
            p.add(A.tube(hc, hc + V(0, 0, r.z * 0.75), r.x * 1.08, r.x * 0.95, squash=(1, r.y / r.x), segs=40, caps=True), m[main], bevel=0.01 * u)
            brim = A.tube(hc + V(0, 0, -r.z * 0.02), hc + V(0, 0, r.z * 0.05), r.x * 2.0, r.x * 2.0, squash=(1, 0.9), segs=3 * 16, caps=True)
            for v in brim.verts:
                d = v.co - hc
                ang = math.atan2(d.y, d.x)
                lift = 0.5 + 0.5 * math.cos(3 * (ang + math.pi / 2))
                if d.length > r.x * 1.2:
                    v.co.z += lift * r.z * 0.55 * (d.length / (r.x * 2.0))
            p.add(brim, m[main], bevel=0.008 * u)
            p.add(A.ring(hc + V(0, 0, r.z * 0.1), r.x * 1.1, r.y * 1.1 * 0.95, r.x * 0.06), m[trim])
            fb = hc + V(r.x * 0.9, r.y * 0.2, r.z * 0.4)
            p.add(A.horn(fb, fb + V(r.x * 0.6, r.y * 0.9, r.z * 0.9), fb + V(r.x * 0.2, r.y * 2.2, r.z * 1.0), r.x * 0.32, segs=8, flat=0.18, power=0.7), m[accent])
        if style == "mask" or kw.get("mask"):
            p.add(A.shell(c + V(0, -r.y * 0.05, -r.z * 0.05), (r.x * 1.08, r.y * 1.1, r.z * 1.05),
                          [P((0, 0, b.brow_z - r.z * 0.25), (0, 0, -1)), P((0, 0, b.chin_z - r.z * 0.05), (0, 0, 1)), P((0, c.y - r.y * 0.1, 0), (0, -1, 0))]), m[kw.get("mask_mat", main)], solid=0.02 * u, bevel=0.006 * u)
        if kw.get("eyes"):
            for s in (-1, 1):
                p.add(A.gem(V(s * r.x * 0.38, b.face_y - r.y * 0.02, b.brow_z - r.z * 0.22), r.x * 0.12, (1.4, 0.5, 0.6)), m[accent])

    # ------------------------------------------------------------ weapons
    def _hand_frame(self, s, up, fwd, offset=(0, 0, 0)):
        g = V(s * self.b.grip[0], self.b.grip[1], self.b.grip[2]) + V(offset)
        return frame(g, up, fwd)

    def staff(self, s, head="crystal", shaft="wood", metal="metal", accent="glow", length=0.78, extra=None):
        """Held along the arm so it stands upright when the arm hangs; head toward the shoulder."""
        b, u, m = self.b, self.b.u, self.m
        L = b.H * length
        p = self.piece("Staff", "hand", s)
        M = self._hand_frame(s, (-s, -0.05, 0), (0, -1, 0), offset=(0, -b.hand_r[1] * 0.2, 0))
        bot, top = -L * 0.48, L * 0.52
        w = b.u * 0.05 + b.H * 0.006
        p.add(A.xf(A.tube(V(0, 0, bot), V(0, 0, top), w * 0.8, w, segs=12, caps=True), M), m[shaft], bevel=0.004 * u)
        for z in (top - w * 2, 0.0 + w * 2.5, -w * 2.5, bot + w * 1.5):
            p.add(A.xf(A.ring(V(0, 0, z), w * 1.15, w * 1.15, w * 0.35, segs=16, msegs=6), M), m[metal])
        hz = top
        if head == "crystal":
            for k in range(4):
                a = 2 * math.pi * k / 4
                base = V(math.cos(a) * w * 1.2, math.sin(a) * w * 1.2, hz - w * 2)
                p.add(A.xf(A.horn(base, base + V(math.cos(a) * w * 4, math.sin(a) * w * 4, w * 5), V(math.cos(a) * w * 1.5, math.sin(a) * w * 1.5, hz + w * 11), w * 0.9, segs=6), M), m[metal])
            p.add(A.xf(A.horn(V(0, 0, hz + w * 1), V(0, 0, hz + w * 6), V(0, 0, hz + w * 13), w * 2.0, segs=6, rings=8, power=0.8), M), m[accent])
            p.add(A.xf(A.horn(V(0, 0, hz + w * 2), V(0, 0, hz + w * 0), V(0, 0, hz - w * 3), w * 1.8, segs=6, rings=6, power=0.9), M), m[accent])
        if head == "sun":
            sc = V(0, 0, hz + w * 6)
            p.add(A.xf(A.ring(sc, w * 5, w * 5, w * 0.7, rot=Matrix.Rotation(math.pi / 2, 3, "X"), segs=40), M), m[metal])
            p.add(A.xf(A.gem(sc, w * 2.4), M), m[accent])
            for k in range(12):
                a = 2 * math.pi * k / 12
                d = V(math.cos(a), 0, math.sin(a))
                p.add(A.xf(A.horn(sc + d * w * 5.3, sc + d * w * 6.5, sc + d * w * (8.5 if k % 2 == 0 else 7.0), w * 0.7, segs=5, rings=4, flat=0.4), M), m[metal])
            p.add(A.xf(A.tube(V(0, 0, hz - w * 1), V(0, 0, hz + w * 1.5), w * 1.6, w * 1.2, segs=12, caps=True), M), m[metal])
        if head == "skull":
            sc = V(0, 0, hz + w * 3.5)
            p.add(A.xf(A.shell(sc, (w * 3, w * 3.4, w * 3.2)), M), m["bone"], bevel=0.003 * u)
            for e in (-1, 1):
                p.add(A.xf(A.gem(sc + V(e * w * 1.2, -w * 2.9, w * 0.3), w * 0.9, (1, 0.5, 0.8)), M), m[accent])
                base = sc + V(e * w * 2.4, 0, w * 1.5)
                p.add(A.xf(A.horn(base, base + V(e * w * 4, w * 1, w * 2), base + V(e * w * 2.5, -w * 2, w * 7), w * 1.0, twist=1.5), M), m["bone"])
            p.add(A.xf(A.horn(sc + V(0, 0, w * 3), sc + V(0, 0, w * 6), sc + V(0, w * 0.5, w * 10), w * 1.6, segs=8, rings=8, power=0.7), M), m[accent])
        if head == "gnarl":
            for k in range(5):
                a = 2 * math.pi * k / 5
                base = V(math.cos(a) * w * 0.8, math.sin(a) * w * 0.8, hz - w * 3)
                ctrl = V(math.cos(a) * w * 5, math.sin(a) * w * 5, hz + w * 5)
                p.add(A.xf(A.horn(base, ctrl, V(math.cos(a + 1.5) * w * 1.2, math.sin(a + 1.5) * w * 1.2, hz + w * 10), w * 0.9, segs=7), M), m[shaft])
            p.add(A.xf(A.gem(V(0, 0, hz + w * 5), w * 2.4), M), m[accent])
            for k in range(6):
                a = 2 * math.pi * k / 6
                lb = V(math.cos(a) * w * 2.5, math.sin(a) * w * 2.5, hz - w * 1)
                p.add(A.xf(A.horn(lb, lb + V(math.cos(a) * w * 2, math.sin(a) * w * 2, -w * 1), lb + V(math.cos(a) * w * 4, math.sin(a) * w * 4, -w * 3.5), w * 1.4, segs=6, flat=0.2, power=0.6), M), m["leaf"])
        if head == "jade":
            for k in range(3):
                p.add(A.xf(A.ring(V(0, 0, hz + w * (3 + 3.5 * k)), w * (4 - k * 0.8), w * (4 - k * 0.8), w * 0.6, rot=Matrix.Rotation(math.pi / 2, 3, "X"), segs=32), M), m[metal if k % 2 else accent])
            p.add(A.xf(A.gem(V(0, 0, hz + w * 6.5), w * 1.8), M), m[accent])
            p.add(A.xf(A.horn(V(0, 0, hz), V(0, 0, hz + w * 6), V(0, 0, hz + w * 14), w * 0.9, segs=8), M), m[shaft])
        if head == "mace":
            hc = V(0, 0, hz + w * 3)
            p.add(A.xf(A.shell(hc, (w * 3, w * 3, w * 3.6)), M), m[metal], bevel=0.003 * u)
            for k in range(8):
                a = 2 * math.pi * k / 8
                d = V(math.cos(a), math.sin(a), 0)
                p.add(A.xf(A.horn(hc + d * w * 2.2 - V(0, 0, w * 2.5), hc + d * w * 4.5, hc + d * w * 2.2 + V(0, 0, w * 2.5), w * 0.8, segs=4, rings=6, flat=0.25), M), m[metal])
            p.add(A.xf(A.gem(hc + V(0, 0, w * 4.2), w * 1.4), M), m[accent])
            p.add(A.xf(A.ring(hc, w * 3.05, w * 3.05, w * 0.4, segs=32), M), m[accent])
        if extra == "halo":
            hc = V(0, 0, hz + w * 6)
            for k, tilt in enumerate((0.5, -0.5)):
                p.add(A.xf(A.ring(hc, w * (6.5 - k), w * (6.5 - k), w * 0.3, rot=Matrix.Rotation(tilt, 3, "X"), segs=40, msegs=6), M), m[accent])
        if extra == "spires":
            for k in range(3):
                a = 2 * math.pi * k / 3
                base = V(math.cos(a) * w * 2.5, math.sin(a) * w * 2.5, hz - w * 1)
                p.add(A.xf(A.horn(base, base + V(math.cos(a) * w * 3, math.sin(a) * w * 3, w * 4), V(math.cos(a) * w * 4.5, math.sin(a) * w * 4.5, hz + w * 9), w * 0.8, segs=6), M), m[metal])

    def blade(self, s, kind="dagger", metal="steel", grip="leather", guard="metal", accent="glow"):
        b, u, m = self.b, self.b.u, self.m
        p = self.piece("Blade", "hand", s)
        M = self._hand_frame(s, (0, -1, 0), (0, 0, -1))
        w = b.u * 0.05 + b.H * 0.006
        if kind == "dagger":
            L, wid, th, hook = b.H * 0.2, w * 2.2, w * 0.5, 0.6
        else:
            L, wid, th, hook = b.H * 0.42, w * 1.0, w * 0.35, 0.0
        n = 24
        import bmesh
        bm = bmesh.new()
        rows = []
        for i in range(n + 1):
            t = i / n
            half = wid * (1 - t ** 1.6) * (1 + (0.25 * math.sin(t * math.pi) if kind == "dagger" else 0))
            bend = hook * wid * t * t
            z = L * t + w * 1.2
            if i == n:
                rows.append([bm.verts.new((bend, 0, z + w))])
                continue
            tt = th * (1 - t * 0.7)
            rows.append([bm.verts.new(c) for c in ((half + bend, 0, z), (bend, tt, z), (-half + bend, 0, z), (bend, -tt, z))])
        for i in range(n):
            a, c = rows[i], rows[i + 1]
            for k in range(4):
                if len(c) == 1:
                    bm.faces.new((a[k], a[(k + 1) % 4], c[0]))
                else:
                    bm.faces.new((a[k], a[(k + 1) % 4], c[(k + 1) % 4], c[k]))
        bm.faces.new(list(reversed(rows[0])))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        p.add(A.xf(bm, M), m[metal])
        if kind == "rapier":
            p.add(A.xf(A.shell(V(0, 0, w * 0.6), (w * 3.2, w * 3.2, w * 2.4), [P((0, 0, w * 0.4), (0, 0, -1))]), M), m[guard], solid=0.012 * u, bevel=0.004 * u)
            p.add(A.xf(A.ring(V(0, w * 0.0, -w * 2.4), w * 0.6, w * 3.0, w * 0.35, rot=Matrix.Rotation(math.pi / 2, 3, "Y"), keep=lambda co: True), M), m[guard])
            p.add(A.xf(A.box(V(0, 0, w * 0.9), (w * 5.5, w * 0.7, w * 0.7)), M), m[guard], bevel=0.003 * u)
        else:
            p.add(A.xf(A.box(V(0, 0, w * 0.8), (wid * 2.8, w * 0.9, w * 0.9)), M), m[guard], bevel=0.004 * u)
            for e in (-1, 1):
                p.add(A.xf(A.horn(V(e * wid * 1.3, 0, w * 0.8), V(e * wid * 1.8, 0, w * 1.4), V(e * wid * 1.6, 0, w * 3.2), w * 0.45, segs=6), M), m[guard])
        p.add(A.xf(A.tube(V(0, 0, w * 0.4), V(0, 0, -w * 5.0), w * 0.55, w * 0.5, segs=10, caps=True), M), m[grip])
        p.add(A.xf(A.gem(V(0, 0, -w * 5.4), w * 0.9), M), m[accent if kind == "rapier" else guard])

    def bow(self, s, wood="wood", grip="leather", string="string", tip="metal"):
        b, u, m = self.b, self.b.u, self.m
        p = self.piece("Bow", "hand", s)
        M = self._hand_frame(s, (-s, 0, 0), (0, -1, 0), offset=(0, -b.hand_r[1] * 0.3, 0))
        L = b.H * 0.36
        w = b.u * 0.05 + b.H * 0.006
        tips = []
        for e in (1, -1):
            base = V(0, -w * 0.5, e * w * 2.5)
            ctrl = V(0, -L * 0.42, e * L * 0.55)
            end = V(0, w * 1.5, e * L)
            p.add(A.xf(A.horn(base, ctrl, end, w * 1.05, power=0.55, segs=8, flat=0.7), M), m[wood])
            p.add(A.xf(A.horn(end, end + V(0, -w * 1.5, e * w * 1.5), end + V(0, -w * 3.5, e * w * 1.0), w * 0.5, segs=6), M), m[tip])
            tips.append(end)
        p.add(A.xf(A.tube(V(0, -w * 0.3, -w * 3), V(0, -w * 0.3, w * 3), w * 1.2, w * 1.2, segs=10, caps=True), M), m[grip])
        p.add(A.xf(A.tube(tips[0] + V(0, w * 0.3, 0), tips[1] + V(0, w * 0.3, 0), w * 0.12, w * 0.12, segs=5, caps=True), M), m[string])

    def shield(self, s, face="metal", rim="trim", boss="glow", emblem=None):
        b, u, m = self.b, self.b.u, self.m
        p = self.piece("Shield", "lower", s)
        f0, f1 = b.fore
        x = s * (f0 + f1) / 2
        R = b.H * 0.13
        c = V(x, b.arm_y, b.arm_z + b.fore_r[1] * 1.6)
        M = frame(c, (0, 0, 1), (-s, 0, 0))
        disc = A.shell(V(0, 0, -R * 0.75), (R, R * 1.15, R * 0.95), [P((0, 0, 0), (0, 0, 1))], segs=(48, 24))
        p.add(A.xf(disc, M), m[face], solid=0.03 * u, bevel=0.01 * u)
        p.add(A.xf(A.ring(V(0, 0, 0.005 * u), R * 0.66, R * 0.66 * 1.15, R * 0.06, segs=48), M), m[rim])
        p.add(A.xf(A.gem(V(0, 0, R * 0.22), R * 0.18), M), m[boss])
        if emblem:
            for k in range(4):
                a = math.pi / 2 * k
                p.add(A.xf(A.horn(V(math.cos(a) * R * 0.18, math.sin(a) * R * 0.18, R * 0.17), V(math.cos(a) * R * 0.3, math.sin(a) * R * 0.3, R * 0.15),
                                  V(math.cos(a) * R * 0.5, math.sin(a) * R * 0.5, R * 0.08), R * 0.06, segs=5, flat=0.4), M), m[emblem])

    def tome(self, s, cover="leather", page="page", metal="metal", accent="glow"):
        b, u, m = self.b, self.b.u, self.m
        p = self.piece("Tome", "hips")
        y = b.belt_y
        c = V(s * (b.belt_r + b.H * 0.02), y + b.belt_r * 0.1, b.belt_z[0] - b.H * 0.04)
        sz = b.H * 0.075
        p.add(A.box(c, (sz * 0.35, sz * 1.0, sz * 1.25)), m[cover], bevel=0.006 * u)
        p.add(A.box(c + V(-s * 0.0, 0, 0), (sz * 0.28, sz * 0.95, sz * 1.2)), m[page])
        p.add(A.box(c + V(s * sz * 0.18, 0, 0), (sz * 0.04, sz * 0.7, sz * 0.9)), m[metal], bevel=0.002 * u)
        p.add(A.gem(c + V(s * sz * 0.22, 0, 0), sz * 0.15), m[accent])
        for k in range(4):
            p.add(A.ring(c + V(0, 0, sz * 0.62 + k * sz * 0.13), sz * 0.08, sz * 0.08, sz * 0.025, rot=Matrix.Rotation(math.pi / 2 * (k % 2), 3, "X"), segs=12, msegs=5), m[metal])

    def orb(self, s, core="glow", cage="metal"):
        b, u, m = self.b, self.b.u, self.m
        p = self.piece("Orb", "hand", s)
        c = V(s * b.hand[0], b.hand[1] - b.hand_r[1] * 1.8, b.hand[2] + b.hand_r[2] * 0.5)
        R = b.H * 0.03
        p.add(A.gem(c, R), m[core])
        for k in range(3):
            p.add(A.ring(c, R * 1.35, R * 1.35, R * 0.07, rot=Matrix.Rotation(k * math.pi / 3, 3, "Z") @ Matrix.Rotation(math.pi / 2, 3, "X"), segs=32, msegs=6), m[cage])

    def quiver(self, body="leather", trim="metal", fletch="cloth"):
        b, u, m = self.b, self.b.u, self.m
        p = self.piece("Quiver", "chest")
        c, r = V(b.chest_c), V(b.chest_r)
        base = V(-r.x * 0.45, c.y + r.y + b.H * 0.03, c.z - r.z * 0.55)
        top = V(r.x * 0.35, c.y + r.y + b.H * 0.05, c.z + r.z * 0.65)
        R = b.H * 0.032
        p.add(A.tube(base, top, R * 0.9, R, segs=20, caps=True), m[body], bevel=0.004 * u)
        p.add(A.ring(top - (top - base).normalized() * R * 0.4, R * 1.05, R * 1.05, R * 0.12, rot=A.aim(top - base).to_3x3(), segs=24), m[trim])
        p.add(A.ring(base + (top - base).normalized() * R * 0.4, R * 1.0, R * 1.0, R * 0.12, rot=A.aim(top - base).to_3x3(), segs=24), m[trim])
        d = (top - base).normalized()
        for k in range(5):
            off = A.aim(d).to_3x3() @ V(math.cos(k * 1.3) * R * 0.5, math.sin(k * 1.3) * R * 0.5, 0)
            a0 = top + off - d * R
            a1 = a0 + d * b.H * 0.06
            p.add(A.tube(a0, a1, R * 0.08, R * 0.08, segs=5, caps=True), m["wood"])
            p.add(A.box(a1 - d * R * 0.4, (R * 0.05, R * 0.4, R * 0.9), rot=A.aim(d).to_3x3() @ Matrix.Rotation(k, 3, "Z")), m[fletch])
        strap = A.tube(V(r.x * 0.8, c.y - r.y * 0.6, c.z + r.z * 0.5), V(-r.x * 0.8, c.y - r.y * 0.6, c.z - r.z * 0.5), b.H * 0.008, b.H * 0.008, squash=(1, 0.4), segs=8, caps=True)
        p.add(strap, m[body])

    # ------------------------------------------------------------ champion extras
    @staticmethod
    def _feather(base, tip, width, facing, thick=0.12, bend=0.0):
        """Flat blade-shaped feather from base to tip, its broad side facing `facing`."""
        import bmesh
        base, tip, facing = V(base), V(tip), V(facing).normalized()
        d = tip - base
        side = d.cross(facing).normalized()
        bm = bmesh.new()
        rows = []
        n = 10
        for i in range(n + 1):
            t = i / n
            c = base + d * t + facing * (bend * d.length * math.sin(t * math.pi))
            if i == n:
                rows.append([bm.verts.new(c)])
                continue
            hw = width * (0.35 + 0.65 * math.sin(min(1.0, t * 1.6) * math.pi / 2)) * (1 - t ** 3)
            th = width * thick
            rows.append([bm.verts.new(c + side * hw), bm.verts.new(c + facing * th), bm.verts.new(c - side * hw), bm.verts.new(c - facing * th)])
        for i in range(n):
            a, nx = rows[i], rows[i + 1]
            for k in range(4):
                if len(nx) == 1:
                    bm.faces.new((a[k], a[(k + 1) % 4], nx[0]))
                else:
                    bm.faces.new((a[k], a[(k + 1) % 4], nx[(k + 1) % 4], nx[k]))
        bm.faces.new(list(reversed(rows[0])))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        return bm

    def wings(self, main="glow", alt="trim", span=0.36, feathers=9, rise=1.0):
        """Two layered fans of feathers behind the shoulders, clear of the arms."""
        b, u, m = self.b, self.b.u, self.m
        p = self.piece("Wings", "chest")
        c, r = V(b.chest_c), V(b.chest_r)
        L = b.H * span
        back = V(0, 1, 0)
        for s in (1, -1):
            root = V(s * r.x * 0.3, c.y + r.y + b.H * 0.03, c.z + r.z * 0.3)
            ctrl = root + V(s * L * 0.35, L * 0.12, L * 0.55 * rise)
            tip = root + V(s * L * 0.95, L * 0.22, L * 0.62 * rise)

            def arc(t):
                return (1 - t) ** 2 * root + 2 * (1 - t) * t * ctrl + t * t * tip

            for k in range(12):
                p.add(A.tube(arc(k / 12), arc((k + 1) / 12), b.H * 0.014 * (1 - 0.5 * k / 12), b.H * 0.014 * (1 - 0.5 * (k + 1) / 12), segs=8, caps=True), m[alt])
            for layer, (scale, depth, mat) in enumerate(((1.0, 0.0, main), (0.55, 0.012, alt))):
                count = feathers if layer == 0 else feathers - 2
                for k in range(count):
                    t = (k + 0.5) / count
                    a = arc(0.08 + 0.9 * t) + V(0, b.H * depth, 0)
                    phi = 0.15 + 1.05 * t ** 1.2
                    d = V(s * math.sin(phi), 0.12, -math.cos(phi)).normalized()
                    ln = L * (0.55 + 0.5 * t) * scale
                    p.add(self._feather(a, a + d * ln, L * 0.075 * (1.1 if layer else 1.0), back, bend=0.06), m[mat])

    def shards(self, mat="glow", count=3, size=1.0, lift=1.7):
        """Crystals hovering above each pauldron."""
        b, m = self.b, self.m
        for s in (1, -1):
            p = self.piece("Pauldron", "shoulder", s)
            r = b.pauldron_r * size
            c = V(s * b.shoulder[0], b.shoulder[1], b.shoulder[2] + r * lift)
            for k in range(count):
                a = 2 * math.pi * k / count + 0.4
                off = V(s * math.cos(a) * r * 0.55, math.sin(a) * r * 0.55, (k % 2) * r * 0.25)
                p.add(A.gem(c + off, r * 0.2, (0.55, 0.55, 1.9)), m[mat])
            p.add(A.gem(c + V(0, 0, r * 0.45), r * 0.24, (0.6, 0.6, 2.2)), m[mat])

    def crown(self, main="trim", accent="glow", spikes=7, height=1.0, lift=0.12, size=1.03, back=False):
        """Spiked crown; lift and size let it ride over hoods and helms."""
        b, u, m = self.b, self.b.u, self.m
        p = self.piece("Head", "head")
        c, r = V(b.head_c), V(b.head_r)
        z = b.brow_z + r.z * lift
        rx, ry = r.x * size, r.y * size
        p.add(A.ring(V(c.x, c.y, z), rx, ry, r.x * 0.06, flat=1.8), m[main])
        for k in range(spikes):
            a = -math.pi / 2 + (k - (spikes - 1) / 2) * (math.pi * (2.0 if back else 1.1) / max(1, spikes))
            base = V(c.x + math.cos(a) * rx, c.y + math.sin(a) * ry, z + r.z * 0.04)
            h = r.z * height * (0.75 if k % 2 else 1.15) * (1.0 if back else 1.0 - 0.35 * abs(k - (spikes - 1) / 2) / max(1, spikes / 2))
            out = V(math.cos(a), math.sin(a), 0) * r.x * 0.12
            p.add(A.horn(base, base + out + V(0, 0, h * 0.5), base + out * 1.6 + V(0, 0, h), r.x * 0.1, segs=5, rings=6, flat=0.5), m[main])
            if k % 2 == 0:
                p.add(A.gem(base + out * 0.6 + V(0, 0, h * 0.25), r.x * 0.07, (1, 0.6, 1.3)), m[accent])
        p.add(A.gem(V(0, c.y - ry - r.x * 0.05, z + r.z * 0.12), r.x * 0.16, (1, 0.6, 1.4)), m[accent])

    def bands(self, mat="glow", arms=True, legs=True, belt=True):
        """Glowing rune bands on the forearms, shins, and belt."""
        b, u, m = self.b, self.b.u, self.m
        X = V(1, 0, 0)
        for s in (1, -1):
            if arms:
                lo = self.piece("Bracer", "lower", s)
                f0, f1 = b.fore
                r0, r1 = b.fore_r
                for t in (0.35, 0.6):
                    x = f0 + (f1 - f0) * t
                    rr = (r0 + (r1 - r0) * t) * 1.08
                    lo.add(A.ring(V(s * x, b.arm_y, b.arm_z), rr, rr, rr * 0.08, rot=A.aim(X).to_3x3(), segs=32, msegs=6), m[mat])
            if legs:
                sh = self.piece("Boot", "shin", s)
                cx = leg_x(b, s)
                for t in (0.3, 0.55):
                    z = b.shin[0] + (b.shin[1] - b.shin[0]) * t
                    sh.add(A.ring(V(cx, b.leg_y, z), b.shin_r * 1.12, b.shin_r * 1.16, b.shin_r * 0.08, segs=32, msegs=6), m[mat])
        if belt:
            p = self.piece("Belt", "hips")
            z = (b.belt_z[0] + b.belt_z[1]) / 2
            p.add(A.ring(V(0, b.belt_y, z), b.belt_r * 1.03, b.belt_r * b.belt_sq * 1.03, (b.belt_z[1] - b.belt_z[0]) * 0.12, msegs=6), m[mat])

    def sigil(self, mat="glow", frame_mat="trim"):
        """Glowing emblem on the chest front."""
        b, u, m = self.b, self.b.u, self.m
        p = self.piece("Chest", "chest")
        c, r = V(b.chest_c), V(b.chest_r)
        f = V(0, c.y - r.y - 0.06 * u - r.y * 0.02, c.z + r.z * 0.2)
        p.add(A.gem(f, r.x * 0.14, (0.8, 0.35, 1.3)), m[mat])
        p.add(A.ring(f, r.x * 0.2, r.x * 0.2, r.x * 0.025, rot=Matrix.Rotation(math.pi / 2, 3, "X"), segs=32, msegs=6), m[frame_mat])
        for e in (-1, 1):
            p.add(A.horn(f + V(e * r.x * 0.2, 0, 0), f + V(e * r.x * 0.35, -r.y * 0.02, r.z * 0.05), f + V(e * r.x * 0.55, r.y * 0.1, r.z * 0.18),
                         r.x * 0.035, segs=5, rings=6, flat=0.5), m[mat])
