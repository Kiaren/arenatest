"""Tile preview renders into one contact sheet.

  blender -b --factory-startup --python tools/blender/sheet.py -- out.png cols a.png b.png ...
"""

import sys

import bpy
import numpy as np

args = sys.argv[sys.argv.index("--") + 1:]
out, cols, files = args[0], int(args[1]), args[2:]
tiles = []
for path in files:
    img = bpy.data.images.load(path)
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    tiles.append(px[int(h * 0.08):int(h * 0.92), int(w * 0.27):int(w * 0.73)])
th, tw = tiles[0].shape[:2]
rows = (len(tiles) + cols - 1) // cols
sheet = np.zeros((rows * th, cols * tw, 4), dtype=np.float32)
sheet[..., 3] = 1
for i, tile in enumerate(tiles):
    r = rows - 1 - i // cols
    c = i % cols
    sheet[r * th:(r + 1) * th, c * tw:(c + 1) * tw] = tile[:th, :tw]
img = bpy.data.images.new("sheet", cols * tw, rows * th)
img.pixels = sheet.ravel()
img.filepath_raw = out
img.file_format = "PNG"
img.save()
