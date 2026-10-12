import bpy, sys, os

argv = sys.argv[sys.argv.index("--") + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=argv[0])

for obj in bpy.data.objects:
    print("OBJ", obj.name, obj.type, "parent=", obj.parent.name if obj.parent else None,
          "scale=", tuple(round(s, 3) for s in obj.scale), "dims=", tuple(round(d, 3) for d in obj.dimensions))
    if obj.type == "ARMATURE":
        mw = obj.matrix_world
        for b in obj.data.bones:
            h = mw @ b.head_local
            t = mw @ b.tail_local
            print("BONE", b.name, "parent=", b.parent.name if b.parent else None,
                  "head=", tuple(round(v, 3) for v in h), "tail=", tuple(round(v, 3) for v in t))
for a in bpy.data.actions:
    print("ACTION", a.name, tuple(round(f) for f in a.frame_range))
for m in bpy.data.materials:
    print("MAT", m.name)
