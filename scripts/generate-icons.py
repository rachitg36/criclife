from PIL import Image, ImageDraw, ImageFilter
import math, os

BG = (5, 7, 13); CY = (34,211,238); VI = (168,85,247); WH = (242,245,255)
def lerp(a,b,t): return tuple(int(a[i]+(b[i]-a[i])*t) for i in range(3))

def seam_point(f, R, bulge):
    """f in [0,1] top->bottom. Returns (dx,dy) offset from centre."""
    ang = (f - 0.5) * math.pi * 0.90          # sweep most of the ball height
    dy  = math.sin(ang) * R * 0.86
    dx  = math.cos(ang) * R * bulge            # sideways bulge = the seam curve
    return dx, dy

def draw_icon(size, maskable=False):
    S = size * 4
    img = Image.new("RGB", (S, S), BG)
    d = ImageDraw.Draw(img)
    for y in range(S):
        d.line([(0, y), (S, y)], fill=lerp(BG, (11, 17, 36), y / S))

    cx = cy = S // 2
    R = int(S * 0.30) if maskable else int(S * 0.355)

    # Ball body — concentric rings, light source upper-left
    steps = 120
    for i in range(steps, 0, -1):
        t = i / steps
        r = int(R * t)
        col = lerp(CY, VI, (1 - t) ** 1.3)
        ox = int((1 - t) * R * 0.16)   # offset shifts highlight up-left
        oy = int((1 - t) * R * 0.20)
        d.ellipse([cx - r + ox, cy - r + oy, cx + r + ox, cy + r + oy], fill=col)

    # Seam — a real curve down the ball, drawn as a polyline
    seam_w = max(3, int(S * 0.016))
    bulge = 0.30
    pts = []
    for i in range(101):
        dx, dy = seam_point(i / 100, R, bulge)
        pts.append((cx + dx, cy + dy))
    d.line(pts, fill=WH, width=seam_w, joint="curve")

    # Stitches — short bars perpendicular to the seam tangent
    n = 11
    sw = max(3, int(S * 0.013))
    for i in range(n):
        f = (i + 0.5) / n
        dx, dy = seam_point(f, R, bulge)
        dx2, dy2 = seam_point(min(1, f + 0.01), R, bulge)
        tx, ty = dx2 - dx, dy2 - dy
        L = math.hypot(tx, ty) or 1
        nx, ny = -ty / L, tx / L               # normal to the tangent
        half = R * 0.115
        x0, y0 = cx + dx - nx * half, cy + dy - ny * half
        x1, y1 = cx + dx + nx * half, cy + dy + ny * half
        d.line([(x0, y0), (x1, y1)], fill=WH, width=sw)

    img = img.filter(ImageFilter.SMOOTH)
    return img.resize((size, size), Image.LANCZOS)

os.makedirs("icons", exist_ok=True)
for sz in (192, 512):
    draw_icon(sz).save(f"icons/icon-{sz}.png", optimize=True)
draw_icon(512, maskable=True).save("icons/icon-maskable-512.png", optimize=True)
draw_icon(180).save("icons/apple-touch-icon.png", optimize=True)

og = Image.new("RGB", (1200, 630), BG)
d = ImageDraw.Draw(og)
for y in range(630):
    d.line([(0, y), (1200, y)], fill=lerp((5,7,13), (18,26,48), y/630))
og.paste(draw_icon(320), (90, 155))
og.save("og-default.png", optimize=True)
print("ok")
