"""Re-render the banners (TextImageList: Let's go!, D'Oh!, ...) at 3x for the Remastered renderer.

The 1999 banners are 3D text, rendered like Dark Planet's main menu items (../dark-planet/tools/menu_items.py):
flat Comic Sans letters, deeply extruded (olive-brown walls), a yellow-orange lava texture on their faces, and a
depth wave (3ds Max's Wave modifier) running down through the text, seen in perspective. The face bulges and tilts,
so the outline, the visible walls (the inner ones: the camera is in front of the middle) and the shading change
from frame to frame: measured on the originals, the left and right ends move in and out by up to 3 px, mirrored,
and each horizontal band of the text does so at a different time. 8 frames per loop at 0.4 frames per tick.

This renderer extrudes a TrueType glyph mask (Comic Neue Bold, the remaster's font), deforms it, splats it point by
point into a supersampled z-buffer and shades it. The text is fitted to the original's outline (frame 0), so it
sits where the original does. FRAMES frames per loop instead of 8, so the smooth remaster shows a smooth wave. The
wave's direction, length, amplitude and phase were fitted to the originals' motion (each band's horizontal shift
per frame, on Game Over and Course Done). It matches the originals' style, not their pixels.

Usage: uv run --with numpy --with pillow python tools/remaster_banners.py game/public/data <out.png> [names]
       (the originals' frames next to these, 4x, for comparing; remaster_render.py packs them into the atlas)
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

S = 3  # output px per original px (not 4 like the other sprites: 7 x FRAMES large frames; soft, no fine detail)
SS = 2  # supersampling per output px
FRAMES = 12
PATTERNS = 8  # the originals' frames
FONT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'game', 'public', 'fonts', 'ComicNeue-Bold.ttf')
TEXTS = {'GameOver': 'Game Over!', 'DOh': "D'Oh!", 'Shootem': "Shoot 'em!", '1up': '1 Up', 'Welldone': 'Well Done!',
         'Letsgo': "Let's go!", 'CourseDone': 'Course Done!'}
BOLD = 2  # extra stroke width per side at the 400 px the glyphs are drawn at: the originals' letters are bolder
TRACK = 30  # extra space between the letters, px at 400 px
CHUNK = 1 << 20  # points per batch (memory)

DEPTH = 6.0  # extrusion, px: the inner walls show 3 to 4 px wide at the ends of the text, as in the originals
FOCAL = 260.0  # camera distance from the text, px
WAVE_AMP = 3.0  # px of depth
WAVE_LEN = 56.0  # px of height
WAVE_PHASE = 0.0625  # of a wave length: frame 0 as in the originals
LIGHT = np.array([0.45, -0.6, -0.66])  # towards the light: upper right, in front (camera space: y down, z away)
LIGHT /= np.linalg.norm(LIGHT)
# sampled from the originals: the faces are saturated orange with soft red-orange and yellow blotches (no dark
# parts), the walls dark olive brown
LAVA = np.array([[214, 76, 12], [238, 104, 18], [252, 132, 24], [255, 162, 34], [255, 200, 46], [255, 232, 72]]) / 255
SIDE = np.array([88, 56, 8]) / 255


# ---- noise (value noise, as in remaster_render.py)

def _hash(ix, iy, seed):
    h = (ix * 374761393 + iy * 668265263 + seed * 1442695041) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFF) / 65535.0


def vnoise(x, y, seed=0):
    x0 = np.floor(x).astype(np.int64)
    y0 = np.floor(y).astype(np.int64)
    fx, fy = x - x0, y - y0
    ux, uy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a, b = _hash(x0, y0, seed), _hash(x0 + 1, y0, seed)
    c, d = _hash(x0, y0 + 1, seed), _hash(x0 + 1, y0 + 1, seed)
    return (a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uy


def fbm(x, y, seed=0, octaves=4):
    total, amp, norm = 0, 1.0, 0
    for o in range(octaves):
        total = total + amp * vnoise(x * 2 ** o, y * 2 ** o, seed + o * 17)
        norm += amp
        amp *= 0.5
    return total / norm


def lava(u, v, seed):
    """The texture at (u, v) on the text (original px): soft blobs 3 to 6 px across, a little stretched at an angle
    and warped, through the originals' colours."""
    a, b = u * 0.8 + v * 0.6, v * 0.8 - u * 0.6
    q = fbm(a / 7, b / 4.5, seed, 2)
    r = fbm(a / 7 + 0.7 * q, b / 4.5 + 0.5 * q, seed + 5, 2)
    t = np.clip((r - 0.28) / 0.48, 0, 1)
    k = t * (len(LAVA) - 1)
    i = np.minimum(k.astype(int), len(LAVA) - 2)
    f = (k - i)[:, None]
    return LAVA[i] * (1 - f) + LAVA[i + 1] * f


# ---- the model

def glyph_image(text):
    """The text drawn at 400 px and cropped. Letter by letter, TRACK apart: Comic Sans spaces its letters (and
    apostrophes) wider than Comic Neue."""
    f = ImageFont.truetype(FONT, 400)
    pad = 40 + BOLD
    width = sum(f.getlength(ch) + TRACK for ch in text)
    img = Image.new('L', (round(width) + 2 * pad, 600 + 2 * pad))
    draw, x = ImageDraw.Draw(img), pad
    for ch in text:
        draw.text((x, pad), ch, font=f, fill=255, stroke_width=BOLD, stroke_fill=255)
        x += f.getlength(ch) + TRACK
    return img.crop(img.getbbox())


def glyph_mask(text, box, ms):
    """The text's mask at ms model px per original px, stretched to fill box = (w, h) original px."""
    img = glyph_image(text)
    return np.array(img.resize((round(box[0] * ms), round(box[1] * ms)), Image.LANCZOS)) > 127


def neighbours(m, op):
    p = np.pad(m, 1)
    return op(op(p[:-2, 1:-1], p[2:, 1:-1]), op(p[1:-1, :-2], p[1:-1, 2:]))


class Banner:
    def __init__(self, text, size, box, seed, scale=S):
        """`text` filling box = (x0, y0, x1, y1) in a frame of size = (w, h) original px, rendered at `scale` output
        px per original px."""
        self.w, self.h = size
        self.s, ms = scale, scale * SS * 1.5  # model px per original px: denser than the screen samples, so no holes
        x0, y0, x1, y1 = box
        self.origin = np.array([x0, y0], float)
        mask = glyph_mask(text, (x1 - x0, y1 - y0), ms)
        self.centre = np.array([(x0 + x1) / 2, (y0 + y1) / 2])
        vs, us = np.nonzero(mask)
        self.face = np.stack([us, vs], 1) / ms  # (u, v) original px, from the text's top-left (flat, at z = 0)
        self.face_col = lava(self.face[:, 0] + x0, self.face[:, 1] + y0, seed)
        # the sides: along the outline, DEPTH px back
        blur = mask.astype(np.float32)
        for _ in range(3):
            p = np.pad(blur, 1, mode='edge')
            blur = (p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:] + 2 * p[1:-1, 1:-1]) / 6
        gy, gx = np.gradient(blur)
        ev, eu = np.nonzero(mask & ~neighbours(mask, np.logical_and))
        n = -np.stack([gx[ev, eu], gy[ev, eu]], 1)
        n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-6)
        steps = np.arange(0, DEPTH, 1 / (ms * 1.5))
        self.side = np.stack([np.repeat(eu, len(steps)) / ms, np.repeat(ev, len(steps)) / ms,
                              np.tile(steps, len(eu))], 1)
        self.side_n = np.repeat(n, len(steps), 0)
        self.side_col = np.repeat(lava(eu / ms + x0, ev / ms + y0, seed), len(steps), 0)

    def wave(self, v, t):
        """The Wave modifier: depth (px, away from the camera) and its slope along v, running down the text; none
        for t = None."""
        if t is None:
            return np.zeros_like(v), np.zeros_like(v)
        a = 2 * np.pi * (v / WAVE_LEN - t + WAVE_PHASE)
        return WAVE_AMP * np.sin(a), WAVE_AMP * 2 * np.pi / WAVE_LEN * np.cos(a)

    def render(self, t):
        """Frame t in [0, 1) of the loop (None: still): an RGBA image at scale x the frame's size."""
        S = self.s
        W, H = self.w * S * SS, self.h * S * SS
        pixels, depths, colours = [], [], []
        parts = (('face', self.face, None), ('side', self.side, self.side_n))
        for kind, pts, nrm in parts:
            for c in range(0, len(pts), CHUNK):
                p = pts[c:c + CHUNK]
                wz, wv = self.wave(p[:, 1], t)
                if kind == 'face':
                    z = wz
                    # tangents (1, 0, 0) and (0, 1, dz/dv); their cross product, towards the camera (-z)
                    n = np.stack([np.zeros(len(p)), wv, -np.ones(len(p))], 1)
                    base = self.face_col[c:c + CHUNK]
                else:
                    z = wz + p[:, 2]
                    n = np.concatenate([nrm[c:c + CHUNK], np.zeros((len(p), 1))], 1)
                    base = self.side_col[c:c + CHUNK]
                n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)
                q = np.stack([p[:, 0] + self.origin[0] - self.centre[0], p[:, 1] + self.origin[1] - self.centre[1],
                              z], 1)
                view = np.array([0, 0, -FOCAL]) - q
                view /= np.linalg.norm(view, axis=1, keepdims=True)
                facing = (n * view).sum(1) > -0.05
                p, q, n, view, base = p[facing], q[facing], n[facing], view[facing], base[facing]
                k = FOCAL / (FOCAL + q[:, 2])
                ix = ((q[:, 0] * k + self.centre[0]) * S * SS).astype(int)
                iy = ((q[:, 1] * k + self.centre[1]) * S * SS).astype(int)
                col = shade(n, view, base, kind == 'face', p[:, 2] if kind == 'side' else None)
                ok = (ix >= 0) & (iy >= 0) & (ix < W) & (iy < H)
                pixels.append(iy[ok] * W + ix[ok])
                depths.append(q[ok, 2].astype(np.float32))
                colours.append(col[ok].astype(np.float32))
        pixels, depths, colours = np.concatenate(pixels), np.concatenate(depths), np.concatenate(colours)
        order = np.argsort(-depths, kind='stable')  # far first; nearer points overwrite them
        rgb = np.zeros((H * W, 3), np.float32)
        cov = np.zeros(H * W, np.float32)
        rgb[pixels[order]] = colours[order]
        cov[pixels[order]] = 1
        rgb = rgb.reshape(self.h * S, SS, self.w * S, SS, 3).sum((1, 3))
        cov = cov.reshape(self.h * S, SS, self.w * S, SS).sum((1, 3))
        rgb = rgb / np.maximum(cov, 1)[..., None]
        img = np.dstack([np.clip(rgb, 0, 1), cov / SS ** 2])
        return Image.fromarray((img * 255 + 0.5).astype(np.uint8), 'RGBA')


def shade(n, view, base, is_face, w):
    diff = np.clip(n @ LIGHT, 0, 1)[:, None]
    refl = 2 * (n * view).sum(1, keepdims=True) * n - view
    spec = (np.clip(refl @ LIGHT, 0, 1) ** 12)[:, None]
    if is_face:
        return base * (0.5 + 0.6 * diff) + 0.15 * spec * np.array([1, 0.7, 0.2])
    rim = np.clip(w / 0.6, 0.7, 1)[:, None]  # a faint line where the side meets the face
    return (SIDE + 0.25 * base) * (0.5 + 0.8 * diff) * rim


def fitted(name, original):
    """The banner `name`, fitted to its original (the TextImageList image, PATTERNS frames side by side): the same
    frame size, the text filling frame 0's outline."""
    a = np.array(original.convert('RGB')).max(2)
    w, h = a.shape[1] // PATTERNS, a.shape[0]
    ys, xs = np.nonzero(a[:, :w] > 60)
    return Banner(TEXTS[name], (w, h), (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1), len(name))


def frames(data, name):
    b = fitted(name, Image.open(os.path.join(data, 'images', name + '.png')))
    return [b.render(f / FRAMES) for f in range(FRAMES)]


TITLE_SCALE = 6  # the title screen shows it up to about 300 CSS px wide


def title():
    """The game's title, 'Wunioid', for the Remastered HUD and title screen: a still (no wave), its letters as tall as
    the banners' (46 px) and as wide as the font draws them, at TITLE_SCALE."""
    img = glyph_image('Wunioid')
    h = 46
    w = round(h * img.width / img.height)
    return Banner('Wunioid', (w + 14, h + 14), (7, 7, w + 7, h + 7), 7, TITLE_SCALE).render(None)


def compare(data, out, names):
    """Each banner: the originals' 8 frames (4x, nearest) next to every other frame of this renderer, on dark blue."""
    from multiprocessing import Pool
    with Pool() as pool:
        mine = pool.starmap(frames, [(data, n) for n in names])
    rows = []
    for name, ims in zip(names, mine):
        orig = Image.open(os.path.join(data, 'images', name + '.png')).convert('RGB')
        w, h = orig.width // PATTERNS, orig.height
        for k in range(PATTERNS):
            o = orig.crop((k * w, 0, (k + 1) * w, h)).resize((w * S, h * S), Image.NEAREST)
            rows.append((o, ims[k * FRAMES // PATTERNS]))
    cw = max(o.width for o, _ in rows) + 16
    sheet = Image.new('RGBA', (2 * cw, sum(o.height + 8 for o, _ in rows)), (32, 34, 70, 255))
    y = 0
    for o, m in rows:
        sheet.paste(o, (8, y))
        sheet.alpha_composite(m, (cw + 8, y))
        y += o.height + 8
    sheet.convert('RGB').save(out)


if __name__ == '__main__':
    compare(sys.argv[1], sys.argv[2], sys.argv[3].split(',') if len(sys.argv) > 3 else list(TEXTS))
