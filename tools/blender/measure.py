import bpy, sys

argv = sys.argv[sys.argv.index("--") + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=argv[0])
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
arm.data.pose_position = "REST"
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
pts = []
for body in [o for o in bpy.data.objects if o.type == "MESH" and o.parent == arm]:
    ev = body.evaluated_get(dg)
    mesh = ev.to_mesh()
    found = [ev.matrix_world @ v.co for v in mesh.vertices]
    print("MESH", body.name, len(found), "z[%.3f,%.3f]" % (min(p.z for p in found), max(p.z for p in found)))
    pts += found
top = max(p.z for p in pts)
step = top / 24
reach = top * 0.17
print("COUNT", len(pts), "TOP", round(top, 3), "STEP", round(step, 3))
for i in range(24):
    z0 = i * step
    sl = [p for p in pts if z0 <= p.z < z0 + step]
    if not sl:
        continue
    core = [p for p in sl if abs(p.x) < reach] or sl
    print("Z %.3f n=%d x[%.3f,%.3f] y[%.3f,%.3f] coreX[%.3f,%.3f] coreY[%.3f,%.3f]" % (
        z0, len(sl), min(p.x for p in sl), max(p.x for p in sl), min(p.y for p in sl), max(p.y for p in sl),
        min(p.x for p in core), max(p.x for p in core), min(p.y for p in core), max(p.y for p in core)))
for i in range(1, 10):
    xs = i * top * 0.05
    sl = [p for p in pts if xs <= p.x < xs + top * 0.05 and p.z > top * 0.7]
    if sl:
        print("ARM x %.3f z[%.3f,%.3f] y[%.3f,%.3f]" % (xs, min(p.z for p in sl), max(p.z for p in sl), min(p.y for p in sl), max(p.y for p in sl)))
