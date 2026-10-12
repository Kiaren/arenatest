"""Build one class set from classes.py.

  blender -b --factory-startup --python tools/blender/build_set.py -- <classId> [--champion] [--preview]
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import armory as A
import classes as C
import kit as K

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
class_id = ARGS[0]
champion = "--champion" in ARGS
spec = dict(C.SETS[class_id])
if champion:
    extra = C.CHAMPIONS[class_id]
    spec["build"] = extra["build"]
    spec["recolor"] = {**spec["recolor"], **extra["recolor"]}
    spec["palette"] = {**spec["palette"], **extra["palette"]}
body = K.MAN if spec["body"] == "man" else K.WOMAN
name = class_id + ("_champion" if champion else "")

arm = A.load_hero(os.path.join(ROOT, "assets", "heroes", body.file))
for mat_name, color in spec["recolor"].items():
    A.recolor(mat_name, color, rough=0.75)

prefix = class_id[:2].upper() + ("C_" if champion else "_")
palette = dict(C.BASE)
palette.update(spec["palette"])
mats = {}
for key, (color, metal, rough, glow) in palette.items():
    if glow:
        strength = 3.0 if glow is True else float(glow)
        mats[key] = A.material(prefix + key, color, metal=0.0, rough=0.4, emit=color, strength=strength)
    else:
        mats[key] = A.material(prefix + key, color, metal=metal, rough=rough)

kit = K.Set(body, arm, prefix, mats)
spec["build"](kit)
kit.build()

if "--preview" in ARGS:
    out = os.path.join(ROOT, "tools", "blender", "out")
    os.makedirs(out, exist_ok=True)
    k = body.H / 4.845
    mid = (0, 0, 2.9 * k)
    A.pose(arm, "Man_Idle" if spec["body"] == "man" else "Idle", 12)
    A.render(os.path.join(out, name + "_front.png"), (3.2 * k, -10.5 * k, 4.2 * k), mid)
    A.render(os.path.join(out, name + "_back.png"), (-4.5 * k, 9.5 * k, 5.0 * k), mid)
else:
    A.export(os.path.join(ROOT, "assets", "heroes", name + ".glb"), arm)
    print("EXPORTED", name)
