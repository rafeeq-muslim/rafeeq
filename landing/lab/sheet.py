# Tiles harness frames into sheet.png (shoot.mjs skips it without a full ffmpeg build).
import sys, glob, os
from PIL import Image
d = sys.argv[1]; cols = int(sys.argv[2]) if len(sys.argv) > 2 else 6
fs = sorted(f for f in glob.glob(os.path.join(d, '[0-9][0-9].png')))
ims = [Image.open(f) for f in fs]
w, h = ims[0].size; s = 300 / w
tw, th = int(w * s), int(h * s)
rows = (len(ims) + cols - 1) // cols
S = Image.new('RGB', (cols * tw + (cols - 1) * 6, rows * th + (rows - 1) * 6), 'white')
for i, im in enumerate(ims):
    S.paste(im.convert('RGB').resize((tw, th)), ((i % cols) * (tw + 6), (i // cols) * (th + 6)))
S.save(os.path.join(d, 'sheet.png'))
print(os.path.join(d, 'sheet.png'), S.size)
