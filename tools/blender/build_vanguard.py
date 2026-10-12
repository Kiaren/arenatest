"""Vanguard starting set: spiked navy and crimson plate, horned helm, red blade.

Run from the project folder:
  blender -b --factory-startup --python tools/blender/build_vanguard.py -- [--preview]
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from mathutils import Matrix, Vector

import armory as A

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []

CHAMP = "--champion" in ARGS

arm = A.load_hero(os.path.join(ROOT, "assets", "heroes", "man.glb"))

A.recolor("Skin", "#5f8a3a", rough=0.62)
A.recolor("Shirt", "#1a2034", rough=0.8)
A.recolor("Pants", "#171b29", rough=0.8)
A.recolor("Socks", "#121620", rough=0.8)
A.recolor("Hair", "#121014", rough=0.7)

if CHAMP:
    # Warlord: obsidian plate, gold edges, crimson trims that smoulder like cooling lava.
    PLATE = A.material("VGC_Plate", "#30344a", metal=0.6, rough=0.32)
    DARK = A.material("VGC_Iron", "#16171e", metal=0.6, rough=0.4)
    EDGE = A.material("VGC_Edge", "#e2aa46", metal=0.9, rough=0.22)
    CRIMSON = A.material("VGC_Crimson", "#9a120c", metal=0.2, rough=0.4, emit="#ff2208", strength=0.45)
    LEATHER = A.material("VGC_Leather", "#1e1410", metal=0.0, rough=0.85)
    BONE = A.material("VGC_Bone", "#f0e4c4", metal=0.0, rough=0.5)
    GLOW = A.material("VGC_Glow", "#ff6a1a", metal=0.0, rough=0.4, emit="#ff5a10", strength=4.5)
    BLADE = A.material("VGC_Blade", "#2a0806", metal=0.7, rough=0.28, emit="#c0200a", strength=1.1)
else:
    PLATE = A.material("VG_Plate", "#3a5288", metal=0.55, rough=0.38)
    DARK = A.material("VG_Iron", "#262b38", metal=0.6, rough=0.42)
    EDGE = A.material("VG_Edge", "#9aa3bd", metal=0.85, rough=0.26)
    CRIMSON = A.material("VG_Crimson", "#b0182a", metal=0.25, rough=0.42)
    LEATHER = A.material("VG_Leather", "#2a1c16", metal=0.0, rough=0.85)
    BONE = A.material("VG_Bone", "#e6dcc0", metal=0.0, rough=0.55)
    GLOW = A.material("VG_Glow", "#ff2a14", metal=0.0, rough=0.4, emit="#ff1e08", strength=3.0)
    BLADE = A.material("VG_Blade", "#4a0a10", metal=0.7, rough=0.3, emit="#7a0a06", strength=0.6)

Z = Vector((0, 0, 1))


def plane(co, no):
    return (co, no)


# ---------------------------------------------------------------- torso
chest = A.Piece("VG_Chest", "Torso")
chest.add(A.shell((0, 0.05, 3.42), (0.56, 0.47, 0.76), [plane((0, 0, 2.86), (0, 0, 1)), plane((0, 0, 3.96), (0, 0, -1))]), PLATE, solid=0.045, bevel=0.012)
panel = A.shell((0, 0.05, 3.42), (0.61, 0.52, 0.8), [
    plane((0, 0, 3.0), (0, 0, 1)), plane((0, 0, 3.88), (0, 0, -1)), plane((0, -0.2, 0), (0, -1, 0)),
    plane((0.07, 0, 2.95), (-0.94, 0, 0.34)), plane((-0.07, 0, 2.95), (0.94, 0, 0.34)),
])
chest.add(panel, CRIMSON, solid=0.02, bevel=0.006)
chest.add(A.shell((0, 0.05, 3.42), (0.63, 0.54, 0.81), [
    plane((0, 0, 3.02), (0, 0, 1)), plane((0, 0, 3.86), (0, 0, -1)), plane((0, -0.2, 0), (0, -1, 0)),
    plane((-0.035, 0, 0), (1, 0, 0)), plane((0.035, 0, 0), (-1, 0, 0)),
], segs=(96, 48)), EDGE, solid=0.025, bevel=0.008)
chest.add(A.horn((0, -0.57, 3.52), (0, -0.7, 3.55), (0, -0.84, 3.64), 0.07, segs=8), DARK)
chest.add(A.ring((0, 0.08, 3.98), 0.37, 0.33, 0.075, msegs=12), EDGE)
chest.add(A.ring((0, 0.05, 2.9), 0.575, 0.485, 0.03), EDGE)
for k in range(14):
    a = 2 * math.pi * k / 14
    chest.add(A.gem((0.6 * math.cos(a), 0.05 + 0.51 * math.sin(a), 2.93), 0.028), EDGE)
chest.build(arm)

belly = A.Piece("VG_Belly", "Abdomen")
for i, (z0, r) in enumerate(((2.84, 0.5), (2.66, 0.52), (2.48, 0.54))):
    belly.add(A.tube((0, 0.04, z0 - 0.2), (0, 0.04, z0), r + 0.02, r, squash=(1.0, 0.9)), PLATE if i != 1 else DARK, solid=0.035, bevel=0.01)
belly.build(arm)

belt = A.Piece("VG_Belt", "Hips")
belt.add(A.tube((0, 0.02, 2.17), (0, 0.02, 2.33), 0.56, 0.55, squash=(1.0, 0.88)), LEATHER, solid=0.04, bevel=0.008)
belt.add(A.box((0, -0.53, 2.25), (0.3, 0.06, 0.24)), DARK, bevel=0.02)
belt.add(A.box((0, -0.565, 2.25), (0.18, 0.04, 0.15)), EDGE, bevel=0.012)
belt.add(A.gem((0, -0.6, 2.25), 0.055, (1, 0.6, 1)), GLOW)
for s in (-1, 1):
    belt.add(A.horn((s * 0.11, -0.56, 2.3), (s * 0.2, -0.62, 2.36), (s * 0.24, -0.66, 2.47), 0.035, segs=8), BONE)
# Crimson tabard panels front and back, short enough to clear the thighs.
belt.add(A.box((0, -0.5, 1.98), (0.26, 0.02, 0.42)), CRIMSON, bevel=0.01)
belt.add(A.box((0, 0.5, 1.98), (0.32, 0.02, 0.42)), CRIMSON, bevel=0.01)
belt.build(arm)

# ---------------------------------------------------------------- shoulders
for side, bone in ((1, "Shoulder.L"), (-1, "Shoulder.R")):
    s = side
    p = A.Piece("VG_Pauldron" + (".L" if s > 0 else ".R"), bone)
    inner = plane((s * 0.3, 0, 0), (s, 0, 0))
    p.add(A.shell((s * 0.64, 0.06, 3.86), (0.44, 0.44, 0.38), [plane((0, 0, 3.7), (0, 0, 1)), inner]), PLATE, solid=0.05, bevel=0.014)
    c = (s * 0.64, 0.06)
    p.add(A.cut(A.tube((*c, 3.76), (*c, 3.58), 0.43, 0.53, segs=56), [plane((s * 0.44, 0, 0), (s, 0, 0))]), DARK, solid=0.035, bevel=0.01)
    p.add(A.cut(A.tube((*c, 3.6), (*c, 3.42), 0.52, 0.6, segs=56), [plane((s * 0.56, 0, 0), (s, 0, 0))]), PLATE, solid=0.035, bevel=0.01)
    p.add(A.ring((*c, 3.43), 0.6, 0.6, 0.03, keep=lambda co, s=s: co.x * s > 0.58), CRIMSON)
    p.add(A.ring((*c, 3.73), 0.415, 0.415, 0.035, keep=lambda co, s=s: co.x * s > 0.36), CRIMSON)
    p.add(A.ring((*c, 3.72), 0.43, 0.36, 0.045, rot=Matrix.Rotation(math.pi / 2, 3, "X"), keep=lambda co, s=s: co.z > 3.74 and co.x * s > 0.3), EDGE)
    for k in range(7):
        a = math.pi * (k + 0.5) / 7 - math.pi / 2
        p.add(A.gem((c[0] + s * 0.44 * math.cos(a), c[1] + 0.44 * math.sin(a), 3.75), 0.026), EDGE)
    spikes = (
        ((s * 0.6, 0.12, 4.16), (s * 0.66, 0.24, 4.8), (s * 1.02, 0.5, 5.2), 0.14),
        ((s * 0.84, 0.02, 4.06), (s * 1.02, 0.1, 4.5), (s * 1.42, 0.3, 4.74), 0.11),
        ((s * 0.98, -0.1, 3.9), (s * 1.24, -0.12, 4.1), (s * 1.6, 0.02, 4.2), 0.085),
    )
    for base, ctrl, tip, r0 in spikes:
        p.add(A.horn(base, ctrl, tip, r0, power=1.15), DARK, bevel=0.0)
        p.add(A.ring(Vector(base) + Vector((0, 0, -0.02)), r0 * 1.15, r0 * 1.15, 0.025, rot=A.aim(Vector(ctrl) - Vector(base)).to_3x3(), segs=24, msegs=8), CRIMSON)
    p.add(A.gem((s * 0.64, -0.36, 3.92), 0.06, (1, 0.6, 1)), GLOW)
    p.build(arm)

# ---------------------------------------------------------------- arms
for side, sfx in ((1, ".L"), (-1, ".R")):
    s = side
    upper = A.Piece("VG_Rerebrace" + sfx, "UpperArm" + sfx)
    upper.add(A.tube((s * 0.66, 0.04, 3.8), (s * 1.14, 0.06, 3.79), 0.2, 0.17, squash=(1.0, 1.05)), DARK, solid=0.035, bevel=0.01)
    upper.build(arm)

    lower = A.Piece("VG_Vambrace" + sfx, "LowerArm" + sfx)
    lower.add(A.shell((s * 1.2, 0.1, 3.8), (0.15, 0.16, 0.16), [plane((0, 0.08, 0), (0, 1, 0))]), PLATE, solid=0.03, bevel=0.01)
    lower.add(A.horn((s * 1.2, 0.24, 3.8), (s * 1.22, 0.4, 3.82), (s * 1.18, 0.55, 3.86), 0.06, segs=8), DARK)
    lower.add(A.tube((s * 1.3, 0.07, 3.79), (s * 2.04, 0.08, 3.79), 0.16, 0.21), PLATE, solid=0.035, bevel=0.01)
    lower.add(A.ring((s * 2.02, 0.08, 3.79), 0.215, 0.215, 0.03, rot=A.aim((1, 0, 0)).to_3x3(), segs=40), CRIMSON)
    lower.add(A.ring((s * 1.32, 0.07, 3.79), 0.17, 0.17, 0.025, rot=A.aim((1, 0, 0)).to_3x3(), segs=40), EDGE)
    for k, x in enumerate((1.45, 1.62, 1.79)):
        lower.add(A.horn((s * x, 0.08, 3.96), (s * (x + 0.05), 0.08, 4.06), (s * (x + 0.14), 0.08, 4.12), 0.045, segs=6, flat=0.45), DARK)
    lower.build(arm)

    hand = A.Piece("VG_Gauntlet" + sfx, "Palm" + sfx)
    hand.add(A.shell((s * 2.27, 0.08, 3.77), (0.34, 0.19, 0.13)), DARK, bevel=0.008)
    hand.add(A.shell((s * 2.16, 0.08, 3.77), (0.25, 0.2, 0.14), [plane((0, 0, 3.8), (0, 0, 1))]), PLATE, solid=0.025, bevel=0.008)
    for x in (2.08, 2.2, 2.32):
        hand.add(A.box((s * x, 0.08, 3.86), (0.08, 0.26, 0.04)), EDGE, bevel=0.01)
    hand.build(arm)

# ---------------------------------------------------------------- legs
for side, sfx in ((1, ".L"), (-1, ".R")):
    s = side
    cx = 0.302 if s > 0 else -0.318
    thigh = A.Piece("VG_Tasset" + sfx, "UpperLeg" + sfx)
    keep_front = plane((0, 0.02, 0), (0, -1, 0))
    outer = plane((cx - s * 0.08, 0, 0), (s, 0, 0))
    thigh.add(A.shell((cx, -0.03, 1.95), (0.27, 0.26, 0.62), [plane((0, 0, 1.86), (0, 0, 1)), plane((0, 0, 2.2), (0, 0, -1)), outer]), PLATE, solid=0.035, bevel=0.01)
    thigh.add(A.shell((cx, -0.03, 1.8), (0.29, 0.28, 0.62), [plane((0, 0, 1.56), (0, 0, 1)), plane((0, 0, 1.9), (0, 0, -1)), outer]), DARK, solid=0.035, bevel=0.01)
    thigh.add(A.shell((cx, -0.03, 1.75), (0.2, 0.2, 0.5), [plane((0, 0, 1.45), (0, 0, 1)), plane((0, 0, 2.05), (0, 0, -1)), keep_front]), DARK, solid=0.03, bevel=0.008)
    thigh.add(A.tube((cx, -0.02, 1.4), (cx, -0.02, 2.12), 0.19, 0.21), DARK, solid=0.03, bevel=0.008)
    thigh.build(arm)

    shin = A.Piece("VG_Greave" + sfx, "LowerLeg" + sfx)
    shin.add(A.shell((cx, -0.17, 1.34), (0.19, 0.15, 0.19), [plane((0, -0.1, 0), (0, -1, 0))]), PLATE, solid=0.03, bevel=0.01)
    shin.add(A.horn((cx, -0.31, 1.38), (cx, -0.46, 1.42), (cx, -0.55, 1.58), 0.065, segs=8), DARK)
    shin.add(A.tube((cx, -0.03, 0.26), (cx, -0.04, 1.42), 0.2, 0.19, squash=(0.95, 1.05)), PLATE, solid=0.035, bevel=0.01)
    shin.add(A.ring((cx, -0.04, 1.22), 0.2, 0.21, 0.03, segs=40), CRIMSON)
    shin.add(A.shell((cx, -0.05, 0.75), (0.205, 0.23, 0.5), [plane((0, -0.12, 0), (0, -1, 0)), plane((0, 0, 0.32), (0, 0, 1)), plane((0, 0, 1.16), (0, 0, -1))]), EDGE, solid=0.02, bevel=0.006)
    shin.build(arm)

    foot = A.Piece("VG_Sabaton" + sfx, "Foot" + sfx)
    foot.add(A.shell((cx, -0.18, 0.04), (0.2, 0.42, 0.25), [plane((0, 0, 0.012), (0, 0, 1))]), PLATE, solid=0.03, bevel=0.01)
    foot.add(A.ring((cx, -0.18, 0.06), 0.205, 0.425, 0.025, segs=48), DARK)
    foot.add(A.horn((cx, -0.5, 0.12), (cx, -0.64, 0.14), (cx, -0.72, 0.24), 0.05, segs=8), DARK)
    foot.build(arm)

# ---------------------------------------------------------------- head
helm = A.Piece("VG_Helm", "Head")
hc = (0, 0.06, 4.5)
helm.add(A.shell(hc, (0.37, 0.44, 0.44), [plane((0, 0, 4.36), (0, 0, 1))]), PLATE, solid=0.04, bevel=0.012)
helm.add(A.shell(hc, (0.37, 0.44, 0.44), [plane((0, 0, 4.06), (0, 0, 1)), plane((0, 0, 4.38), (0, 0, -1)), plane((0, -0.02, 0), (0, 1, 0))]), PLATE, solid=0.04, bevel=0.012)
for s in (-1, 1):
    helm.add(A.shell(hc, (0.375, 0.445, 0.445), [plane((0, 0, 4.1), (0, 0, 1)), plane((0, 0, 4.38), (0, 0, -1)), plane((s * 0.2, 0, 0), (s, 0, 0)), plane((0, 0.0, 0), (0, -1, 0))]), DARK, solid=0.04, bevel=0.01)
helm.add(A.ring((0, 0.06, 4.4), 0.39, 0.455, 0.045, msegs=10), CRIMSON)
helm.add(A.box((0, -0.43, 4.28), (0.07, 0.05, 0.26)), EDGE, bevel=0.012)
for s in (-1, 1):
    helm.add(A.gem((s * 0.12, -0.37, 4.33), 0.045, (1.5, 0.5, 0.6)), GLOW)
for k, (y, h) in enumerate(((-0.3, 0.2), (0.0, 0.28), (0.3, 0.2))):
    helm.add(A.horn((0, y, 4.88 - abs(y) * 0.35), (0, y - 0.04, 4.98 + h * 0.4), (0, y - 0.1, 5.0 + h), 0.07, segs=6, flat=0.4), DARK)
for s in (-1, 1):
    helm.add(A.horn((s * 0.33, 0.06, 4.56), (s * 0.66, -0.02, 4.7), (s * 0.66, -0.3, 5.36), 0.12, power=1.1), DARK)
    helm.add(A.ring((s * 0.34, 0.06, 4.56), 0.12, 0.12, 0.03, rot=A.aim((s, 0, 0.15)).to_3x3(), segs=24, msegs=8), CRIMSON)
    helm.add(A.horn((s * 0.11, -0.27, 4.1), (s * 0.13, -0.33, 4.18), (s * 0.12, -0.34, 4.32), 0.035, segs=8), BONE)
helm.build(arm)

# ---------------------------------------------------------------- sword
# Grip runs along the fist (world Y). Blade points forward (-Y) with its flat facing
# up in the T-pose, so the overhead game camera sees the full width.
SWORD = Matrix(((1, 0, 0, -2.13), (0, -1, 0, -0.1), (0, 0, -1, 3.72), (0, 0, 0, 1)))
# Local frame: x = edge-to-edge width, y = blade length, z = blade thickness.


def blade(length=2.6, base=0.17, stations=80):
    import bmesh
    bm = bmesh.new()
    rows = []
    for i in range(stations + 1):
        t = i / stations
        taper = (1 - t) ** 0.55 if t > 0.62 else 1.0 + 0.25 * math.sin(t / 0.62 * math.pi)
        top = base * taper
        bot = base * taper * 0.92
        frac = (t * 7.0) % 1.0
        if 0.08 < t < 0.85:
            top += 0.12 * frac ** 2.2
        frac2 = (t * 5.0 + 0.5) % 1.0
        if 0.15 < t < 0.8:
            bot += 0.07 * frac2 ** 2.5
        th = 0.05 * (1 - t) + 0.01
        y = length * t
        if i == stations:
            rows.append([bm.verts.new((0.02, y + 0.06, 0))])
            continue
        rows.append([bm.verts.new(c) for c in (
            (top, y, 0), (top * 0.42, y, th), (-bot * 0.42, y, th),
            (-bot, y, 0), (-bot * 0.42, y, -th), (top * 0.42, y, -th),
        )])
    glow_sides = {0, 2, 3, 5}
    for i in range(stations):
        a, b = rows[i], rows[i + 1]
        for k in range(6):
            if len(b) == 1:
                f = bm.faces.new((a[k], a[(k + 1) % 6], b[0]))
            else:
                f = bm.faces.new((a[k], a[(k + 1) % 6], b[(k + 1) % 6], b[k]))
            f.material_index = 1 if k in glow_sides else 0
    bm.faces.new(list(reversed(rows[0])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def split(bm, index):
    """Return a copy of bm holding only faces with this material index."""
    import bmesh
    out = bm.copy()
    bmesh.ops.delete(out, geom=[f for f in out.faces if f.material_index != index], context="FACES")
    return out


sword = A.Piece("VG_Sword", "Palm.R")
full = blade(length=3.0, base=0.19) if CHAMP else blade()
body, edges = split(full, 0), split(full, 1)
full.free()
sword.add(A.xf(body, SWORD), BLADE)
sword.add(A.xf(edges, SWORD), GLOW)
for zs in (1, -1):
    sword.add(A.xf(A.box((0, 1.05 if CHAMP else 0.9, zs * 0.043), (0.035, 1.75 if CHAMP else 1.45, 0.012)), SWORD), GLOW)
if CHAMP:
    for k, y in enumerate((0.45, 0.95, 1.45, 1.95)):
        for zs in (1, -1):
            sword.add(A.xf(A.gem((0, y, zs * 0.05), 0.05 - k * 0.006, (1, 1.4, 0.4)), SWORD), EDGE)
sword.add(A.xf(A.box((0, -0.02, 0), (0.56, 0.11, 0.13)), SWORD), DARK, bevel=0.02)
sword.add(A.xf(A.box((0, -0.02, 0), (0.22, 0.15, 0.16)), SWORD), CRIMSON, bevel=0.02)
for s in (-1, 1):
    sword.add(A.xf(A.horn((s * 0.25, 0.0, 0), (s * 0.5, 0.02, 0), (s * 0.54, 0.38, 0), 0.07, segs=8, flat=0.7), SWORD), DARK)
    sword.add(A.xf(A.gem((0, -0.02, s * 0.08), 0.05, (1, 1, 0.5)), SWORD), GLOW)
sword.add(A.xf(A.tube((0, -0.07, 0), (0, -0.5, 0), 0.045, 0.04, segs=12, caps=True), SWORD), LEATHER)
for k in range(5):
    sword.add(A.xf(A.ring((0, -0.12 - k * 0.08, 0), 0.05, 0.05, 0.012, rot=A.aim((0, 1, 0)).to_3x3(), segs=16, msegs=6), SWORD), DARK)
sword.add(A.xf(A.gem((0, -0.56, 0), 0.075), SWORD), DARK)
for d in ((1, 0, 0), (-1, 0, 0), (0, -1, 0)):
    base = Vector((0, -0.56, 0)) + Vector(d) * 0.06
    sword.add(A.xf(A.horn(base, base + Vector(d) * 0.06, base + Vector(d) * 0.13, 0.03, segs=6), SWORD), DARK)
sword.build(arm)

# ---------------------------------------------------------------- champion extras
if CHAMP:
    import kit as K
    cape = A.material("VGC_Cape", "#5e0c0e", metal=0.0, rough=0.8)
    kit = K.Set(K.MAN, arm, "VGC_", {"cloth": cape, "trim": EDGE, "glow": GLOW, "dark": DARK})
    kit.cape("cloth", trim="trim", length=1.05, width=1.1)
    kit.crown("dark", "glow", spikes=9, height=1.25, lift=0.72, size=1.3, back=True)
    kit.bands("glow", belt=False)
    kit.build()
    for side, bone in ((1, "Shoulder.L"), (-1, "Shoulder.R")):
        s = side
        p = A.Piece("VGC_Brand" + (".L" if s > 0 else ".R"), bone)
        p.add(A.horn((s * 0.4, 0.3, 4.12), (s * 0.42, 0.5, 4.75), (s * 0.62, 0.78, 5.35), 0.12, power=1.15), DARK)
        p.add(A.ring((s * 0.4, 0.3, 4.1), 0.13, 0.13, 0.028, rot=A.aim((0.05 * s, 0.3, 1)).to_3x3(), segs=24, msegs=8), GLOW)
        for k in range(3):
            p.add(A.gem((s * (0.5 + 0.16 * k), -0.4 + 0.02 * k, 3.66 - 0.04 * k), 0.035), EDGE)
        p.build(arm)

# ---------------------------------------------------------------- output
name = "vanguard_champion" if CHAMP else "vanguard"
if "--preview" in ARGS:
    out = os.path.join(ROOT, "tools", "blender", "out")
    os.makedirs(out, exist_ok=True)
    A.pose(arm, "Man_Idle", 12)
    A.render(os.path.join(out, name + "_front.png"), (3.2, -10.5, 4.2), (0, 0, 2.9))
    A.render(os.path.join(out, name + "_back.png"), (-4.5, 9.5, 5.0), (0, 0, 2.9))
    A.pose(arm, "Man_SwordSlash", 10)
    A.render(os.path.join(out, name + "_slash.png"), (6.5, -8.5, 4.6), (0, 0, 2.9))
    A.render(os.path.join(out, name + "_head.png"), (1.2, -4.2, 4.7), (0, 0, 4.4), size=(900, 900))
else:
    A.export(os.path.join(ROOT, "assets", "heroes", name + ".glb"), arm)
    print("EXPORTED", name)
