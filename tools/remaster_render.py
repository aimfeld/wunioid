"""Re-render the game's sprites at 4x for the Remastered renderer (game/src/render/remasteredView.ts).

The 1999 sprites are small pre-rendered 3D pictures (30 x 15 gems, 12 px balls), so upscaling them only blurs
them (session 6: Lanczos, hq4x and xBR compared). This tool draws the same objects again: every sprite is a height
field (a bevelled octagon for the stones, a cylinder for the capsules, a sphere for the balls, tubes for the
paddle's cage) shaded with a light from the top left, supersampled 4 x 4 and stored at 4x the original size, so the
remaster draws it at the original position and size. Colours are sampled from the originals; every animation has
the original's frame count and meaning (the gems' glint, the capsules' rolling label, the piercing ball's colour
cycle, the Killer's colour cycle, Bubbler's water, the Eater's and Doubler's clouds). The background tiles are
upscaled (Lanczos, wrapped so they tile without seams). Not drawn: the shatter animations (particles in the
remaster), the banners (text in the remaster), the editor's attribute labels and palette (Phase 4).

Writes <out>/sprites-<p>.webp (atlas pages), <out>/frame.webp (the playfield frame) and <out>/sprites.json:
  {"scale": 4, "pages": [file...], "frames": {name: [[page, x, y, w, h], ...]}}  (4x px; w, h = 4 x the original)

Usage: uv run --with numpy --with pillow python tools/remaster_render.py game/public/data game/public/remaster [names]
       (names, comma-separated: only those, written to <out>/preview.png instead, for trying things out)
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

S = 4  # output px per original px
SS = 4  # supersampling per output px
R = S * SS  # samples per original px
PAGE = 2048
PAD = 6  # transparent px around each frame in the atlas (mipmaps reach a few px)
QUALITY = 92
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

LIGHT = np.array([-0.5, -0.62, 0.6])
LIGHT /= np.linalg.norm(LIGHT)
HALF = LIGHT + np.array([0, 0, 1.0])
HALF /= np.linalg.norm(HALF)


def hexrgb(h):
    return np.array([int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)])


def saturate(c, k=1.25, gain=1.0):
    g = c.mean()
    return np.clip((g + (c - g) * k) * gain, 0, 1)


# ---- sampling and output

def grid(w, h):
    """Sample centres in original px, shape (h*R, w*R)."""
    ys, xs = np.mgrid[0:h * R, 0:w * R]
    return (xs + 0.5) / R, (ys + 0.5) / R


def down(a):
    """Box-filter the supersampled picture to the output size (premultiplied, so edges stay clean)."""
    h, w = a.shape[:2]
    return a.reshape(h // SS, SS, w // SS, SS, -1).mean((1, 3))


def finish(rgb, alpha):
    """Premultiply, downsample, un-premultiply: an RGBA image at 4x."""
    a = np.clip(alpha, 0, 1)[..., None]
    pm = down(np.concatenate([np.clip(rgb, 0, 1) * a, a], -1))
    out = np.zeros_like(pm)
    al = pm[..., 3:]
    out[..., :3] = np.where(al > 1e-4, pm[..., :3] / np.maximum(al, 1e-4), 0)
    out[..., 3:] = al
    return Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')


def normals(z):
    gy, gx = np.gradient(z, 1 / R)
    n = np.stack([-gx, -gy, np.ones_like(z)], -1)
    return n / np.linalg.norm(n, axis=-1, keepdims=True)


def shade(n, base, amb=0.3, dif=0.8, spec=0.8, shin=40, env=0.25, spec_col=None):
    """Blinn-Phong with a sky reflection (brighter from above) and a fresnel rim."""
    d = np.clip((n * LIGHT).sum(-1), 0, 1)[..., None]
    s = (np.clip((n * HALF).sum(-1), 0, 1) ** shin)[..., None]
    sky = (0.5 - 0.5 * n[..., 1])[..., None]  # 1 facing up
    rim = ((1 - np.clip(n[..., 2], 0, 1)) ** 2)[..., None]
    sc = np.ones(3) if spec_col is None else spec_col
    return base * (amb + dif * d) + spec * s * sc + env * rim * sky * (0.5 + 0.5 * sc)


# ---- noise (periodic value noise, so animations loop)

def _hash(ix, iy, seed):
    h = (ix * 374761393 + iy * 668265263 + seed * 1442695041) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFF) / 65535.0


def vnoise(x, y, px, py, seed=0):
    """Value noise on an integer lattice, periodic with px x py cells."""
    x0 = np.floor(x).astype(np.int64)
    y0 = np.floor(y).astype(np.int64)
    fx, fy = x - x0, y - y0
    ux, uy = fx * fx * fx * (fx * (fx * 6 - 15) + 10), fy * fy * fy * (fy * (fy * 6 - 15) + 10)
    def at(i, j):
        return _hash(np.mod(x0 + i, px), np.mod(y0 + j, py), seed)
    a, b, c, d = at(0, 0), at(1, 0), at(0, 1), at(1, 1)
    return (a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uy


def fbm(x, y, px, py, seed=0, octaves=4):
    total, amp, norm = 0, 1.0, 0
    for o in range(octaves):
        f = 2 ** o
        total = total + amp * vnoise(x * f, y * f, px * f, py * f, seed + o * 17)
        norm += amp
        amp *= 0.5
    return total / norm


# ---- shapes

def octagon(x, y, w, h, ch, inset=0.45):
    """Signed distance (original px, positive inside) to a rectangle with chamfered corners."""
    qx = np.abs(x - w / 2) - (w / 2 - inset)
    qy = np.abs(y - h / 2) - (h / 2 - inset)
    cham = (qx + qy + ch) / np.sqrt(2)
    return -np.maximum(np.maximum(qx, qy), cham)


def bevel(d, b):
    """Height of a bevelled slab at depth d inside the edge: a rounded slope over b px, then flat."""
    t = np.clip(d / b, 0, 1)
    return (1 - (1 - t) ** 2.2) * b


def coverage(d):
    return np.clip(d * R + 0.5, 0, 1)


def edge_dark(d, width=0.55, k=0.55):
    """The dark outline the originals have: darken the outermost `width` px."""
    return (1 - k * (1 - np.clip(d / width, 0, 1)))[..., None]


def text_mask(text, w, h, size, dy=0.0, font=FONT, stretch=1.0):
    """The label at sample resolution, centred, `size` in original px."""
    f = ImageFont.truetype(font, int(size * R))
    img = Image.new('L', (w * R, h * R), 0)
    dr = ImageDraw.Draw(img)
    bb = dr.textbbox((0, 0), text, font=f)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    if stretch != 1.0:
        tmp = Image.new('L', (tw + 8, th + 8), 0)
        ImageDraw.Draw(tmp).text((4 - bb[0], 4 - bb[1]), text, font=f, fill=255)
        tmp = tmp.resize((int((tw + 8) * stretch), th + 8), Image.LANCZOS)
        img.paste(tmp, (int((w * R - tmp.width) / 2), int((h * R - tmp.height) / 2 + dy * R)))
    else:
        dr.text(((w * R - tw) / 2 - bb[0], (h * R - th) / 2 - bb[1] + dy * R), text, font=f, fill=255)
    return np.array(img) / 255.0


# ---- stones (30 x 15)

GEMS = {'GemRed': '#f0302a', 'GemOrange': '#ffb43c', 'GemGreen': '#4cc84a', 'GemBlue': '#5a56e6',
        'GemViolet': '#ee3ae6'}


def stone_shape(w=30, h=15, ch=4.0, b=4.2):
    x, y = grid(w, h)
    d = octagon(x, y, w, h, ch)
    return x, y, d, bevel(d, b)


def gem(col, glint=0.0, w=30, h=15):
    """A glossy gem. glint 0..1: the light sweep of the animated (bonus) gem, 0 = plain."""
    x, y, d, z = stone_shape(w, h)
    n = normals(z)
    base = saturate(hexrgb(col), 1.15)
    glow = np.exp(-(((x - w / 2) / (w * 0.32)) ** 2 + ((y - h * 0.62) / (h * 0.3)) ** 2))[..., None]
    c = shade(n, base, amb=0.32, dif=0.75, spec=0.85, shin=36, env=0.3) + glow * base * 0.35
    if glint > 0:
        pos = -6 + glint * (w + 12)  # a diagonal band from left to right
        band = np.exp(-((x + (y - h / 2) * 0.8 - pos) / 2.6) ** 2)[..., None]
        c = c + band * (0.55 * np.sin(np.pi * glint)) * (0.6 + 0.4 * base) + 0.12 * np.sin(np.pi * glint) * base
    return finish(c * edge_dark(d), coverage(d))


def rough(col, seed, grain=0.55, w=30, h=15, tint_var=0.25, gloss=0.25):
    """Granite / ore: the bevelled slab with a bumpy, grainy surface."""
    x, y, d, z = stone_shape(w, h)
    nz = fbm(x / 2.2, y / 2.2, 64, 64, seed, 5)
    z = z + (nz - 0.5) * grain * np.clip(d / 1.5, 0, 1)
    n = normals(z)
    base = hexrgb(col)[None, None, :] * (1 - tint_var / 2 + tint_var * fbm(x / 1.1, y / 1.1, 64, 64, seed + 5, 3))[..., None]
    c = shade(n, base, amb=0.36, dif=0.8, spec=gloss, shin=14, env=0.12)
    return finish(c * edge_dark(d), coverage(d))


def goldie(w=30, h=15):
    x, y, d, z = stone_shape(w, h)
    n = normals(z)
    base = hexrgb('#ffeaa0')
    c = shade(n, base, amb=0.38, dif=0.7, spec=0.9, shin=30, env=0.35, spec_col=hexrgb('#fff4d0'))
    glow = np.exp(-(((x - w / 2) / (w * 0.35)) ** 2 + ((y - h * 0.6) / (h * 0.32)) ** 2))[..., None]
    c = c + glow * np.array([0.25, 0.2, 0.05])
    return finish(c * edge_dark(d), coverage(d))


def clouds(col, frame, frames, seed, w=30, h=15, contrast=0.55):
    """Eater / Doubler: glossy, with clouds drifting through (periodic, so the loop has no jump)."""
    x, y, d, z = stone_shape(w, h)
    n = normals(z)
    P = 8  # noise period in lattice cells across the loop
    shift = P * frame / frames
    cl = fbm(x / 30 * P + shift, y / 30 * P * 0.9, P, 64, seed, 4)
    cl2 = fbm(x / 30 * P - shift, y / 30 * P * 0.9 + 3.3, P, 64, seed + 9, 3)
    v = np.clip(0.5 + (cl * 0.6 + cl2 * 0.4 - 0.5) * 2.2 * contrast, 0, 1)[..., None]
    base = hexrgb(col) * (0.6 + 0.65 * v)
    c = shade(n, base, amb=0.36, dif=0.72, spec=0.7, shin=34, env=0.28)
    return finish(c * edge_dark(d), coverage(d))


def bubbler(frame, frames, w=30, h=15):
    """Water in a glass slab with soft corners: moving caustics."""
    x, y = grid(w, h)
    d = octagon(x, y, w, h, 2.2, 0.45)
    z = bevel(d, 3.2)
    P = 5
    shift = P * frame / frames
    wave = fbm(x / 30 * P + shift, y / 15 * 2, P, 64, 3, 2) + 0.35 * fbm(x / 30 * P * 2 - 2 * shift, y / 15 * 4 + 7, 2 * P, 128, 4, 2)
    z = z + wave * 0.9 * np.clip(d / 2, 0, 1)
    n = normals(z)
    base = hexrgb('#78b0e2') * (0.8 + 0.25 * wave[..., None] / 1.6)
    c = shade(n, base, amb=0.38, dif=0.65, spec=1.0, shin=60, env=0.35, spec_col=hexrgb('#e8f6ff'))
    return finish(c * edge_dark(d), coverage(d))


KILLER = ['#9c9c83', '#bd7b8b', '#c5525a', '#c54a31', '#c59431', '#c5bd39', '#949462', '#5a5294', '#4a41a4', '#625a9c']


def killer(frame, w=30, h=15):
    """A glossy pill with an embossed yellow "KB"; its colour cycles."""
    x, y = grid(w, h)
    d = octagon(x, y, w, h, 4.5)
    z = bevel(d, 5.0)
    m = text_mask('KB', w, h, 10.5, dy=0.3)
    z = z + m * 0.5
    n = normals(z)
    body = saturate(hexrgb(KILLER[frame]), 1.35, 1.12)
    base = body * (1 - m[..., None]) + hexrgb('#ffe23a') * m[..., None]
    c = shade(n, base, amb=0.33, dif=0.75, spec=0.8, shin=34, env=0.3)
    return finish(c * edge_dark(d), coverage(d))


# ---- capsules (30 x 20, 19 frames: the label rolls over the front from the top down)

CAPSULES = {  # name: (body, label, label colour)
    'B$Red': ('#ee4139', '$$$', '#ffe23a'), 'B1Up': ('#e64141', '1UP', '#dcdcdc'),
    'BGun': ('#de4141', 'GUN', '#dcdcdc'), 'B$Green': ('#6abd5a', '$$$', '#ffe23a'),
    'BGlue': ('#62a45a', 'Glue', '#dcdcdc'), 'BPad+': ('#62a45a', 'Pad+', '#dcdcdc'),
    'BPad-': ('#5aa452', 'Pad-', '#dcdcdc'), 'B$Blue': ('#736ad5', '$$$', '#ffe23a'),
    'B2xo': ('#6a62de', '2xo', '#dcdcdc'), 'B5xo': ('#6262cd', '5xo', '#dcdcdc'),
    'B--o': ('#6a62de', '--o', '#dcdcdc'), 'B$Orange': ('#eeb452', '$$$', '#ffe23a'),
    'BBig': ('#dea452', 'Big', '#dcdcdc'), 'B$Violet': ('#de4acd', '$$$', '#ffe23a'),
    'BZup': ('#c539c5', 'Zup', '#dcdcdc'), 'BEnd': ('#c539c5', 'End', '#dcdcdc'),
}
CAPSULE_FRAMES = 19
_label_cache = {}


def capsule(name, frame, w=30, h=20):
    body, label, lcol = CAPSULES[name]
    x, y = grid(w, h)
    d = octagon(x, y, w, h, 4.5, 0.5)
    r = h / 2 - 0.5
    yy = np.clip((y - h / 2) / r, -0.999, 0.999)
    cyl = np.sqrt(1 - yy ** 2) * r
    ends = np.minimum(x, w - x)  # the drum rounds off towards its ends
    te = np.clip(ends / 7.0, 0, 1)
    z = cyl * (1 - (1 - te) ** 2) ** 0.7 * np.clip(d / 0.8, 0, 1) ** 0.5
    # the label on the cylinder: arc length from the front, rolled by the frame
    phi = np.arcsin(yy)
    roll = 2 * np.pi * (frame - 9.5) / CAPSULE_FRAMES
    v = (phi - roll)  # angle on the drum, 0 = the label's centre line
    v = (v + np.pi) % (2 * np.pi) - np.pi
    key = (label, w)
    if key not in _label_cache:
        lh = 64  # label texture: x in samples, v in [-pi/2, pi/2] over lh rows
        f = ImageFont.truetype(FONT, int(8.6 * R) if len(label) < 4 else int(7.6 * R))
        img = Image.new('L', (w * R, lh * R), 0)
        dr = ImageDraw.Draw(img)
        bb = dr.textbbox((0, 0), label, font=f)
        tw, th = bb[2] - bb[0], bb[3] - bb[1]
        # the label spans about 1.3 rad of the drum, squeezed onto lh rows
        tmp = Image.new('L', (tw + 4 * R, th + 4 * R), 0)
        ImageDraw.Draw(tmp).text((2 * R - bb[0], 2 * R - bb[1]), label, font=f, fill=255)
        tmp = tmp.resize((min(w * R - 2 * R, tmp.width), int(lh * R * 0.42)), Image.LANCZOS)
        img.paste(tmp, ((w * R - tmp.width) // 2, (lh * R - tmp.height) // 2))
        _label_cache[key] = (np.array(img) / 255.0, lh)
    tex, lh = _label_cache[key]
    row = np.clip(((v / np.pi) + 0.5) * (lh * R), 0, lh * R - 1).astype(int)
    col = np.clip((x * R).astype(int), 0, w * R - 1)
    m = tex[row, col] * (np.abs(v) < np.pi / 2) * np.clip(d / 1.2, 0, 1)
    z = z + m * 0.18
    n = normals(z)
    bc = saturate(hexrgb(body), 1.2)
    base = bc * (1 - m[..., None]) + hexrgb(lcol) * m[..., None]
    c = shade(n, base, amb=0.3, dif=0.78, spec=0.85, shin=40, env=0.32)
    return finish(c * edge_dark(d), coverage(d))


# ---- balls

BALL = ['#777777', '#836a7b', '#94527b', '#9c416a', '#9c314a', '#9c2020', '#9c2910', '#9c4a10', '#9c6a10', '#9c8b10',
        '#9c9420', '#8b8b31', '#737352', '#52526a', '#393183', '#24208b', '#202094', '#312994', '#41398b', '#525283',
        '#737373']


def sphere(dia, col, chrome=False):
    x, y = grid(dia, dia)
    r = dia / 2 - 0.35
    X, Y = (x - dia / 2) / r, (y - dia / 2) / r
    rr = X * X + Y * Y
    Z = np.sqrt(np.clip(1 - rr, 0, 1))
    n = np.stack([X, Y, Z], -1)
    base = col
    if chrome:  # the plain ball: polished steel, a horizon in the reflection
        refl_y = n[..., 1] - 2 * 0  # reflection of the view ray (0,0,1) about n: r = 2 n_z n - (0,0,1)
        ry = 2 * n[..., 2] * n[..., 1]  # the reflected view ray's y: -1 up (sky) .. 1 down (ground)
        sky = 0.95 - 0.3 * np.clip(ry + 1, 0, 1)
        ground = 0.32 + 0.2 * np.clip(ry, 0, 1)
        k = 1 / (1 + np.exp(-(ry - 0.12) / 0.09))
        env = (sky * (1 - k) + ground * k)[..., None]
        c = base * 0.2 + env * np.array([0.82, 0.86, 0.95]) + shade(n, base * 0, spec=1.0, shin=80, env=0)
    else:
        c = shade(n, base, amb=0.3, dif=0.8, spec=0.95, shin=60, env=0.35)
    d = (1 - np.sqrt(rr)) * r
    return finish(c * edge_dark(d, 0.4, 0.35), coverage(d))


def ball(frame):
    col = saturate(hexrgb(BALL[frame]), 1.3, 1.45)
    return sphere(12, col, chrome=frame in (0, 20))


def megaball(frame):
    col = saturate(hexrgb(BALL[frame]), 1.3, 1.45)
    return sphere(20, col, chrome=frame == 0)


# ---- paddles (14 px high)

def tube_height(dist, r):
    """A tube of radius r at distance dist from its centre line."""
    return np.sqrt(np.clip(r * r - dist * dist, 0, None))


def paddle(w, h=14):
    """The golden cage over a glowing capsule (the 1999 render: a light bar with two gold rings under wire arcs)."""
    x, y = grid(w, h)
    # the light capsule, behind
    x0, x1 = 0.12 * w, 0.89 * w
    cy, cr = h - 4.0, 3.6
    ex = np.clip(np.maximum(x0 + cr - x, x - (x1 - cr)), 0, None)
    dist = np.sqrt(ex ** 2 + (y - cy) ** 2)
    capsule_a = coverage(cr - dist) * (y < h - 0.3)
    zc = tube_height(dist, cr)
    nc = normals(zc)
    t = np.clip((x - x0) / (x1 - x0), 0, 1)
    endglow = np.clip(1 - np.minimum(t, 1 - t) / 0.22, 0, 1) ** 1.5
    cbase = hexrgb('#f2f2f6')[None, None] * (1 - endglow[..., None]) + hexrgb('#ffe830')[None, None] * endglow[..., None]
    cc = shade(nc, cbase, amb=0.55, dif=0.55, spec=0.9, shin=50, env=0.2) + 0.12
    # gold rings on the capsule
    rings = [0.35, 0.59]
    ring = np.zeros_like(x)
    for rx in rings:
        ring = np.maximum(ring, coverage(0.9 - np.abs(x - rx * w)))
    gold = hexrgb('#b8a028')
    cc = cc * (1 - ring[..., None]) + shade(nc, gold, amb=0.25, dif=0.8, spec=0.9, shin=30, env=0.2) * ring[..., None]
    # the cage: two elliptic arcs and a base rail, gold tubes
    cage_z = np.zeros_like(x)
    cage_a = np.zeros_like(x)
    for (rx, ry, tr) in [(w / 2 - 0.9, h - 0.9, 0.9), (w / 2 - 3.2, h - 3.6, 0.65)]:
        X, Y = (x - w / 2) / rx, (y - h) / ry
        rad = np.sqrt(X * X + Y * Y)
        # distance to the ellipse, approximately
        g = np.sqrt((X / rx) ** 2 + (Y / ry) ** 2) + 1e-6
        dd = (rad - 1) * rad / g
        dd = np.where(y < h, dd, 99)
        zt = tube_height(dd, tr)
        cage_z = np.maximum(cage_z, zt + 2.0 * (zt > 0))
        cage_a = np.maximum(cage_a, coverage(tr - np.abs(dd)))
    # struts from the inner arc down to the capsule's ends
    for sx in (0.07 * w + 1.5, 0.93 * w - 1.5):
        dd = np.abs(x - sx) - 0.0
        on = (y > h - 7) & (y < h)
        zt = tube_height(dd, 0.6) * on
        cage_z = np.maximum(cage_z, zt + 2.0 * (zt > 0))
        cage_a = np.maximum(cage_a, coverage(0.6 - dd) * on)
    ng = normals(cage_z)
    gc = shade(ng, hexrgb('#c8b030'), amb=0.22, dif=0.85, spec=1.0, shin=40, env=0.3, spec_col=hexrgb('#fff0a0'))
    a_cage = cage_a * 0.92
    rgb = cc * (1 - a_cage[..., None]) + gc * a_cage[..., None]
    alpha = np.maximum(capsule_a, a_cage)
    # a faint glass dome between the arcs
    X, Y = (x - w / 2) / (w / 2 - 0.9), (y - h) / (h - 0.9)
    inside = (X * X + Y * Y < 1) & (y < h)
    glass = inside * 0.18 * (1 - capsule_a)
    rgb = rgb * (1 - glass[..., None] * (alpha < 0.5)[..., None]) + hexrgb('#d8d080') * glass[..., None] * (alpha < 0.5)[..., None]
    alpha = np.maximum(alpha, glass)
    return finish(rgb, alpha)


def paddle_gun(w=80, h=14):
    """The gun paddle: a dark blue glass dome."""
    x, y = grid(w, h)
    rx, ry = w / 2 - 0.4, h - 0.4
    X, Y = (x - w / 2) / rx, (y - h) / ry
    rr = X * X + Y * Y
    Z = np.sqrt(np.clip(1 - rr, 0, 1))
    n = np.stack([X * (h / w) * 2.2, Y, Z], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    base = hexrgb('#1428a8')
    c = shade(n, base, amb=0.3, dif=0.8, spec=1.0, shin=50, env=0.5, spec_col=hexrgb('#a0c8ff'))
    band = np.exp(-((y - h * 0.55) / 1.2) ** 2) * (np.abs(X) < 0.85)
    c = c + band[..., None] * np.array([0.05, 0.12, 0.35])
    d = (1 - np.sqrt(rr)) * min(rx, ry)
    d = np.where(y < h, d, -1)
    return finish(c * edge_dark(d, 0.4, 0.4), coverage(np.minimum(d, h - y)))


def shot(w=5, h=20):
    """A small rocket: red nose and fins, white body with grey marks."""
    x, y = grid(w, h)
    cx = w / 2
    body_r = 1.35
    dist = np.abs(x - cx)
    nose = np.clip((y - 0.2) / 3.2, 0, 1)
    r = body_r * np.sqrt(nose)
    in_body = (y < h - 3)
    fins = (y >= h - 3.2) & (dist < 2.45 - (h - y) * 0.15)
    zb = tube_height(dist, r) * in_body
    zf = (0.6 * (y >= h - 3.2)) * fins
    z = np.maximum(zb, zf)
    n = normals(z)
    white = hexrgb('#f4f4f4')
    red = hexrgb('#e8241c')
    marks = ((np.floor((y - 5) / 2.6) % 2 == 0) & (y > 5) & (y < h - 4) & (dist < 0.45))
    base = np.where((y < 3.2)[..., None] | fins[..., None], red, white)
    base = np.where(marks[..., None], hexrgb('#808080'), base)
    c = shade(n, base, amb=0.4, dif=0.7, spec=0.7, shin=30, env=0.2)
    a = np.maximum(coverage(r - dist) * in_body, fins.astype(float))
    return finish(c, a)


# ---- background: tiles (upscaled) and the frame (re-rendered)

def tile(data, n):
    src = Image.open(os.path.join(data, 'images', 'Tile%d.png' % n)).convert('RGB')
    w, h = src.size
    big = Image.new('RGB', (w * 3, h * 3))
    for i in range(3):
        for j in range(3):
            big.paste(src, (i * w, j * h))
    up = big.resize((w * 3 * S, h * 3 * S), Image.LANCZOS).filter(ImageFilter.UnsharpMask(3, 60, 2))
    return up.crop((w * S, h * S, 2 * w * S, 2 * h * S)).convert('RGBA')


def frame_border(w=428, h=480, border=16):
    """The playfield frame: white marble, a rounded outer edge, a step down to the black inner edge."""
    xs = (np.arange(w * S) + 0.5) / S
    ys = (np.arange(h * S) + 0.5) / S
    X, Y = np.meshgrid(xs, ys)
    # distance from the outer edge (px), inside the frame, and from the inner edge
    d_out = np.minimum(np.minimum(X, w - X), Y)  # no bottom edge: the frame opens at the bottom
    d_in = border - d_out
    on = d_in > -0.5
    z = np.where(d_out < 2.2, np.sqrt(np.clip(1 - ((2.2 - d_out) / 2.2) ** 2, 0, 1)) * 2.2, 2.2)
    z = np.where(d_in < 4.2, z - (1 - np.clip(d_in / 4.2, 0, 1)) ** 1.6 * 2.6 * (d_in > 0), z)
    # marble veins
    v = fbm(X / 18, Y / 18, 64, 64, 11, 5)
    vein = np.exp(-((v - 0.5) / 0.05) ** 2) * 0.16 + np.exp(-((fbm(X / 9 + 3, Y / 9, 64, 64, 12, 4) - 0.5) / 0.04) ** 2) * 0.08 + (fbm(X / 30, Y / 30, 64, 64, 13, 3) - 0.5) * 0.25
    gy, gx = np.gradient(z, 1 / S)
    n = np.stack([-gx, -gy, np.ones_like(z)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    base = (np.array([0.93, 0.93, 0.95])[None, None] - vein[..., None] * np.array([0.55, 0.55, 0.5]))
    c = shade(n, base, amb=0.45, dif=0.6, spec=0.5, shin=25, env=0.15)
    c = c * np.where(d_in < 1.0, 0.35 + 0.65 * np.clip(d_in, 0, 1), 1.0)[..., None]
    a = np.clip(d_in + 0.5, 0, 1) * on
    img = np.concatenate([np.clip(c, 0, 1), a[..., None]], -1)
    return Image.fromarray((img * 255 + 0.5).astype(np.uint8), 'RGBA')


# ---- the list

def sprites(data):
    out = {}
    for name, col in GEMS.items():
        out[name] = [gem(col, 0.0)] + [gem(col, f / 10) for f in range(1, 10)] + [gem(col, 0.0)]
    out['Granit'] = [rough('#b4b6b8', 1, grain=0.7, tint_var=0.45)]
    out['Block'] = [rough('#d6c838', 2, grain=0.6, tint_var=0.35, gloss=0.35)]
    out['BeBack'] = [rough('#dcb428', 3, grain=0.75, tint_var=0.45, gloss=0.45)]
    out['Goldie'] = [goldie()]
    out['Bubbler'] = [bubbler(f, 11) for f in range(11)]
    out['Eater'] = [clouds('#8c8c8c', f, 10, 21) for f in range(10)]
    out['Doubler'] = [clouds('#a8a8c8', f, 10, 31) for f in range(10)]
    out['Killer'] = [killer(f) for f in range(10)]
    for name in CAPSULES:
        out[name] = [capsule(name, f) for f in range(CAPSULE_FRAMES)]
    out['Ball'] = [ball(f) for f in range(21)]
    out['MegaBall'] = [megaball(f) for f in range(20)]
    out['Paddle'] = [paddle(80)]
    out['PaddleLong'] = [paddle(120)]
    out['PaddleShort'] = [paddle(40)]
    out['PaddleGun'] = [paddle_gun()]
    out['Shot'] = [shot()]
    for n in range(1, 10):
        out['Tile%d' % n] = [tile(data, n)]
    return out


def pack(groups):
    """Shelf packing into PAGE x PAGE pages, tallest first. Returns pages and {name: [[page, x, y, w, h]]}."""
    items = [(name, i, im) for name, ims in groups.items() for i, im in enumerate(ims)]
    order = sorted(range(len(items)), key=lambda k: (-items[k][2].height, -items[k][2].width))
    pages, index = [], {name: [None] * len(ims) for name, ims in groups.items()}
    x = y = shelf = 0
    page = None
    for k in order:
        name, i, im = items[k]
        w, h = im.width + 2 * PAD, im.height + 2 * PAD
        if page is None or x + w > PAGE:
            x, y, shelf = 0, y + shelf, 0
        if page is None or y + h > PAGE:
            page = Image.new('RGBA', (PAGE, PAGE), (0, 0, 0, 0))
            pages.append(page)
            x = y = shelf = 0
        page.alpha_composite(im, (x + PAD, y + PAD))
        index[name][i] = [len(pages) - 1, x + PAD, y + PAD, im.width, im.height]
        x += w
        shelf = max(shelf, h)
    # crop the last page to what it uses
    last = pages[-1]
    bbox = last.getbbox()
    if bbox:
        pages[-1] = last.crop((0, 0, PAGE, min(PAGE, bbox[3] + PAD)))
    return pages, index


def main():
    data, out = sys.argv[1], sys.argv[2]
    only = sys.argv[3].split(',') if len(sys.argv) > 3 else None
    os.makedirs(out, exist_ok=True)
    if only:
        groups = {k: v for k, v in sprites(data).items() if k in only}
        rows = [im for ims in groups.values() for im in ims]
        if 'frame' in only:
            frame_border().crop((0, 0, 400, 400)).save(os.path.join(out, 'preview-frame.png'))
            if not rows:
                return
        cols = max(1, 1600 // (max(im.width for im in rows) + 8))
        cw = max(im.width for im in rows) + 8
        ch = max(im.height for im in rows) + 8
        sheet = Image.new('RGBA', (cols * cw, ((len(rows) + cols - 1) // cols) * ch), (32, 34, 70, 255))
        for k, im in enumerate(rows):
            sheet.alpha_composite(im, ((k % cols) * cw + 4, (k // cols) * ch + 4))
        sheet.save(os.path.join(out, 'preview.png'))
        print('preview', sheet.size)
        return
    groups = sprites(data)
    pages, index = pack(groups)
    files = []
    for p, page in enumerate(pages):
        f = 'sprites-%d.webp' % p
        page.save(os.path.join(out, f), quality=QUALITY, method=6, exact=False)
        files.append(f)
    frame_border().save(os.path.join(out, 'frame.webp'), quality=QUALITY, method=6)
    json.dump({'scale': S, 'pages': files, 'frames': index}, open(os.path.join(out, 'sprites.json'), 'w'),
              separators=(',', ':'))
    total = sum(os.path.getsize(os.path.join(out, f)) for f in files + ['frame.webp'])
    print('%d pages, %d sprites, %.1f MB' % (len(pages), sum(len(v) for v in index.values()), total / 1e6))


if __name__ == '__main__':
    main()
