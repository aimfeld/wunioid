"""App icons (PWA, favicon) from the exported sprites: gems, the ball and the short paddle on a background tile.

Usage: uv run --with pillow python tools/export_icons.py game/public/data/images game/public/icons
Run tools/export_game_data.py first. A 64 x 64 scene, scaled up with nearest neighbour; the content stays inside
the middle 80 % for maskable icons.
"""
import os
import sys

from PIL import Image

SIZES = {'icon-512.png': 512, 'icon-192.png': 192, 'apple-touch-icon.png': 180, 'favicon-32.png': 32}


def frame(images, name, w, h, i=0):
    return Image.open(os.path.join(images, name + '.png')).convert('RGBA').crop((i * w, 0, (i + 1) * w, h))


def scene(images):
    im = Image.new('RGBA', (64, 64))
    tile = frame(images, 'Tile1', 40, 40)
    for y in (0, 40):
        for x in (0, 40):
            im.paste(tile, (x, y))
    for (x, y), gem in zip([(2, 7), (32, 7), (2, 22), (32, 22)], ['GemRed', 'GemOrange', 'GemGreen', 'GemBlue']):
        im.alpha_composite(frame(images, gem, 30, 15), (x, y))
    im.alpha_composite(frame(images, 'Ball', 12, 12), (26, 37))
    im.alpha_composite(frame(images, 'PaddleShort', 40, 14), (12, 47))
    return im


def main(images, out):
    os.makedirs(out, exist_ok=True)
    im = scene(images)
    for name, size in SIZES.items():
        resample = Image.NEAREST if size % 64 == 0 or size > 64 else Image.LANCZOS
        im.resize((size, size), resample).convert('RGB').save(os.path.join(out, name), optimize=True)
    print(f'{len(SIZES)} icons -> {out}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
