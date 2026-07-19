from PIL import Image, ImageDraw
import math
import os

base = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets')

pad = Image.new('RGB', (512, 512), (216, 228, 232))
d = ImageDraw.Draw(pad)
for y in range(0, 512, 16):
    d.rectangle([0, y, 512, y + 6], fill=(200, 212, 218))
d.rectangle([12, 12, 500, 500], outline=(160, 176, 184), width=8)
d.rectangle([180, 80, 332, 432], fill=(192, 56, 64))
d.rectangle([80, 180, 432, 332], fill=(192, 56, 64))
d.rectangle([200, 100, 312, 412], fill=(210, 80, 88))
d.rectangle([100, 200, 412, 312], fill=(210, 80, 88))
pad.save(os.path.join(base, 'props', 'med', 'pad.png'))

panel = Image.new('RGB', (1024, 640), (18, 24, 32))
d = ImageDraw.Draw(panel)
for i in range(0, 1024, 32):
    col = 22 + (i // 32) % 3
    d.line([(i, 0), (i, 640)], fill=(col, col + 4, col + 10))
d.rectangle([0, 0, 1023, 639], outline=(64, 140, 160), width=6)
d.rectangle([16, 16, 1007, 623], outline=(40, 70, 80), width=2)
d.rectangle([16, 16, 1007, 72], fill=(28, 48, 58))
d.rectangle([24, 88, 999, 600], fill=(14, 20, 28))
for x, y in [(40, 100), (984, 100), (40, 580), (984, 580)]:
    d.ellipse([x - 6, y - 6, x + 6, y + 6], fill=(80, 200, 220))
panel.save(os.path.join(base, 'ui', 'panels', 'console-bg.png'))

dial = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
d = ImageDraw.Draw(dial)
d.ellipse([16, 16, 496, 496], fill=(24, 30, 38), outline=(80, 180, 200), width=10)
d.ellipse([48, 48, 464, 464], fill=(16, 22, 28), outline=(50, 90, 100), width=4)
for i in range(36):
    a = math.radians(i * 10 - 90)
    r0, r1 = (200, 230) if i % 3 == 0 else (210, 228)
    x0 = 256 + math.cos(a) * r0
    y0 = 256 + math.sin(a) * r0
    x1 = 256 + math.cos(a) * r1
    y1 = 256 + math.sin(a) * r1
    d.line(
        [(x0, y0), (x1, y1)],
        fill=(180, 220, 230) if i % 3 == 0 else (80, 120, 130),
        width=3 if i % 3 == 0 else 2,
    )
for i in range(-25, 26):
    a = math.radians(i - 90)
    x0 = 256 + math.cos(a) * 175
    y0 = 256 + math.sin(a) * 175
    x1 = 256 + math.cos(a) * 195
    y1 = 256 + math.sin(a) * 195
    d.line([(x0, y0), (x1, y1)], fill=(60, 180, 90), width=4)
d.ellipse([236, 236, 276, 276], fill=(200, 80, 60))
dial.save(os.path.join(base, 'ui', 'panels', 'gauge-face.png'))

prog = Image.new('RGB', (512, 128), (20, 28, 36))
d = ImageDraw.Draw(prog)
d.rectangle([0, 0, 511, 127], outline=(70, 160, 180), width=4)
d.rectangle([16, 40, 496, 88], fill=(10, 14, 18), outline=(40, 80, 90), width=2)
for i in range(12):
    x = 24 + i * 40
    d.rectangle([x, 48, x + 28, 80], fill=(30, 50, 60))
prog.save(os.path.join(base, 'ui', 'panels', 'download-slot.png'))

print('generated ok')
