"""Shared helpers for building class armor sets in Blender.

Every piece is modeled in world space around the hero's T-pose (Blender Z up,
character facing -Y), then parented to a bone so it follows the animations.
"""

import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector


def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rgb(hex_color):
    h = hex_color.lstrip("#")
    return tuple(_lin(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4))


def material(name, color, metal=0.0, rough=0.5, emit=None, strength=1.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    try:
        mat.use_nodes = True
    except AttributeError:
        pass
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*rgb(color), 1.0)
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = rough
    if emit:
        bsdf.inputs["Emission Color"].default_value = (*rgb(emit), 1.0)
        bsdf.inputs["Emission Strength"].default_value = strength
    mat.diffuse_color = (*rgb(color), 1.0)
    return mat


def recolor(name, color, metal=None, rough=None, emit=None, strength=None):
    mat = bpy.data.materials.get(name)
    if not mat:
        return
    bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if not bsdf:
        return
    bsdf.inputs["Base Color"].default_value = (*rgb(color), 1.0)
    if metal is not None:
        bsdf.inputs["Metallic"].default_value = metal
    if rough is not None:
        bsdf.inputs["Roughness"].default_value = rough
    if emit:
        bsdf.inputs["Emission Color"].default_value = (*rgb(emit), 1.0)
        bsdf.inputs["Emission Strength"].default_value = strength or 1.0


def load_hero(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    for obj in list(bpy.data.objects):
        if obj.type == "MESH" and obj.parent is None:
            bpy.data.objects.remove(obj)
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    arm.data.pose_position = "REST"
    bpy.context.view_layer.update()
    for action in bpy.data.actions:
        if "|" in action.name:
            action.name = action.name.split("|")[-1]
    return arm


def xf(bm, mat4, verts=None):
    for v in verts if verts is not None else bm.verts:
        v.co = mat4 @ v.co
    return bm


def aim(direction):
    return Vector((0, 0, 1)).rotation_difference(Vector(direction).normalized()).to_matrix().to_4x4()


def shell(center, radii, planes=(), segs=(56, 36), rot=None):
    """Ellipsoid surface trimmed by planes. Each plane keeps the side its normal faces."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs[0], v_segments=segs[1], radius=1.0)
    m = Matrix.Translation(center) @ (rot.to_4x4() if rot else Matrix()) @ Matrix.Diagonal((*radii, 1.0))
    xf(bm, m)
    return cut(bm, planes)


def cut(bm, planes):
    """Trim bm by planes. Each plane keeps the side its normal faces."""
    for co, no in planes:
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-6, plane_co=Vector(co), plane_no=Vector(no), clear_inner=True)
    return bm


def tube(p0, p1, r0, r1, squash=(1.0, 1.0), segs=40, caps=False):
    p0, p1 = Vector(p0), Vector(p1)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=segs, radius1=r0, radius2=r1, depth=(p1 - p0).length)
    xf(bm, Matrix.Translation((p0 + p1) / 2) @ aim(p1 - p0) @ Matrix.Diagonal((squash[0], squash[1], 1.0, 1.0)))
    return bm


def box(center, size, rot=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    xf(bm, Matrix.Translation(center) @ (rot.to_4x4() if rot else Matrix()) @ Matrix.Diagonal((*size, 1.0)))
    return bm


def gem(center, radius, squash=(1.0, 1.0, 1.0)):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
    xf(bm, Matrix.Translation(center) @ Matrix.Diagonal((radius * squash[0], radius * squash[1], radius * squash[2], 1.0)))
    return bm


def ring(center, rx, ry, minor, rot=None, segs=64, msegs=10, keep=None, flat=1.0):
    """Elliptical torus in the XY plane, optionally rotated, trimmed by keep(co)."""
    bm = bmesh.new()
    grid = []
    for i in range(segs):
        u = 2 * math.pi * i / segs
        c = Vector((rx * math.cos(u), ry * math.sin(u), 0))
        d = Vector((math.cos(u) / rx, math.sin(u) / ry, 0)).normalized()
        row = []
        for j in range(msegs):
            v = 2 * math.pi * j / msegs
            row.append(bm.verts.new(c + d * minor * math.cos(v) + Vector((0, 0, minor * flat * math.sin(v)))))
        grid.append(row)
    for i in range(segs):
        for j in range(msegs):
            a, b = grid[i][j], grid[(i + 1) % segs][j]
            c, d = grid[(i + 1) % segs][(j + 1) % msegs], grid[i][(j + 1) % msegs]
            bm.faces.new((a, b, c, d))
    xf(bm, Matrix.Translation(center) @ (rot.to_4x4() if rot else Matrix()))
    if keep:
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not keep(v.co)], context="VERTS")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def horn(p0, p1, p2, r0, rings=18, segs=12, power=1.0, flat=1.0, twist=0.0):
    """Tapered spike along a quadratic Bezier from p0 (base) to p2 (tip)."""
    p0, p1, p2 = Vector(p0), Vector(p1), Vector(p2)

    def at(t):
        return (1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t * t * p2

    def tangent(t):
        d = 2 * (1 - t) * (p1 - p0) + 2 * t * (p2 - p1)
        return d.normalized() if d.length > 1e-9 else (p2 - p0).normalized()

    bm = bmesh.new()
    tan = tangent(0)
    ref = Vector((0, 0, 1)) if abs(tan.z) < 0.9 else Vector((1, 0, 0))
    n = tan.cross(ref).normalized()
    rows = []
    for i in range(rings):
        t = i / (rings - 1)
        tan = tangent(t)
        n = (n - tan * n.dot(tan)).normalized()
        b = tan.cross(n)
        c = at(t)
        if i == rings - 1:
            rows.append([bm.verts.new(c)])
            continue
        r = r0 * (1 - t) ** power
        rows.append([
            bm.verts.new(c + (n * math.cos(a + twist * t) * flat + b * math.sin(a + twist * t)) * r)
            for a in (2 * math.pi * k / segs for k in range(segs))
        ])
    for i in range(rings - 1):
        cur, nxt = rows[i], rows[i + 1]
        for k in range(segs):
            if len(nxt) == 1:
                bm.faces.new((cur[k], cur[(k + 1) % segs], nxt[0]))
            else:
                bm.faces.new((cur[k], cur[(k + 1) % segs], nxt[(k + 1) % segs], nxt[k]))
    bm.faces.new(list(reversed(rows[0])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


class Piece:
    """One exported mesh: several parts merged, parented to one bone."""

    def __init__(self, name, bone):
        self.name = name
        self.bone = bone
        self.bm = bmesh.new()
        self.mats = []

    def add(self, part, mat, solid=0.0, bevel=0.0, bevel_angle=35, offset=1.0):
        if mat not in self.mats:
            self.mats.append(mat)
        idx = self.mats.index(mat)
        me = bpy.data.meshes.new("tmp")
        part.to_mesh(me)
        part.free()
        ob = bpy.data.objects.new("tmp", me)
        bpy.context.scene.collection.objects.link(ob)
        if solid:
            mod = ob.modifiers.new("solid", "SOLIDIFY")
            mod.thickness = solid
            mod.offset = offset
            mod.use_even_offset = True
            mod.use_quality_normals = True
        if bevel:
            mod = ob.modifiers.new("bevel", "BEVEL")
            mod.width = bevel
            mod.segments = 2
            mod.limit_method = "ANGLE"
            mod.angle_limit = math.radians(bevel_angle)
        dg = bpy.context.evaluated_depsgraph_get()
        baked = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), depsgraph=dg)
        bpy.data.objects.remove(ob)
        bpy.data.meshes.remove(me)
        self.bm.faces.ensure_lookup_table()
        start = len(self.bm.faces)
        self.bm.from_mesh(baked)
        bpy.data.meshes.remove(baked)
        self.bm.faces.ensure_lookup_table()
        for f in self.bm.faces[start:]:
            f.material_index = idx
        return self

    def build(self, arm, sharp=40):
        lim = math.radians(sharp)
        for f in self.bm.faces:
            f.smooth = True
        for e in self.bm.edges:
            e.smooth = not (len(e.link_faces) == 2 and e.calc_face_angle(0) > lim)
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        for mat in self.mats:
            me.materials.append(mat)
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(ob)
        attach(ob, arm, self.bone)
        return ob


def attach(ob, arm, bone):
    world = ob.matrix_world.copy()
    ob.parent = arm
    ob.parent_type = "BONE"
    ob.parent_bone = bone
    bpy.context.view_layer.update()
    ob.matrix_world = world


def pose(arm, action_name, frame):
    arm.data.pose_position = "POSE"
    action = bpy.data.actions.get(action_name)
    if not arm.animation_data:
        arm.animation_data_create()
    arm.animation_data.action = action
    if action is not None and hasattr(arm.animation_data, "action_slot") and len(getattr(action, "slots", [])):
        arm.animation_data.action_slot = action.slots[0]
    bpy.context.scene.frame_set(frame)


def render(path, cam_loc, target, size=(900, 1100), lens=50):
    scene = bpy.context.scene
    for engine in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.film_transparent = False
    if not scene.world:
        scene.world = bpy.data.worlds.new("World")
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get("Background")
    bg.inputs[0].default_value = (0.16, 0.15, 0.17, 1)
    bg.inputs[1].default_value = 0.7
    cam = scene.camera
    if not cam:
        cam = bpy.data.objects.new("PreviewCam", bpy.data.cameras.new("PreviewCam"))
        scene.collection.objects.link(cam)
        scene.camera = cam
        for name, loc, power, color in (("Key", (-6, -8, 9), 1500, (1.0, 0.93, 0.85)),
                                         ("Rim", (7, 8, 7), 1200, (0.75, 0.82, 1.0)),
                                         ("Fill", (8, -6, 3), 500, (1.0, 0.9, 0.8))):
            light = bpy.data.objects.new(name, bpy.data.lights.new(name, "AREA"))
            light.data.energy = power
            light.data.size = 6
            light.data.color = color
            light.location = loc
            light.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
            scene.collection.objects.link(light)
    cam.data.lens = lens
    cam.location = cam_loc
    cam.rotation_euler = (Vector(target) - Vector(cam_loc)).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


USED_CLIPS = {
    "Man_Idle", "Man_Run", "Man_Jump", "Man_SwordSlash", "Man_Punch", "Man_Death",
    "Idle", "Run", "Sword_Slash", "Kick_Right", "Punch_Left", "Gun_Shoot", "Interact", "Idle_Neutral", "Death",
}


def export(path, arm):
    arm.data.pose_position = "POSE"
    if arm.animation_data:
        arm.animation_data.action = None
    for action in list(bpy.data.actions):
        if action.name not in USED_CLIPS:
            bpy.data.actions.remove(action)
    for obj in list(bpy.data.objects):
        if obj.type in {"CAMERA", "LIGHT"}:
            bpy.data.objects.remove(obj)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_yup=True,
        export_apply=False,
    )
