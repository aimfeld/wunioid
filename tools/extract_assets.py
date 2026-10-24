"""Extract WUNIOID.EXE's embedded DelphiX image and wave lists, and decode the level files.

Usage: uv run --with pefile --with pillow python tools/extract_assets.py original_source original_source/extracted
Writes <list>/<index>_<name>.png, sounds/<index>_<name>.wav, levels/<name>.png and assets.json.
"""
import io
import json
import os
import struct
import sys
import wave

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
from delphi_dfm import load_forms  # noqa: E402

IMAGE_LISTS = ['StoneImageList', 'GameImageList', 'BackGndImageList', 'TextImageList']
# Stone type n in a .lev cell is STONES[n - 1] (name table in the EXE @0x41782c).
STONES = ['GemGreen', 'GemBlue', 'GemRed', 'GemOrange', 'GemViolet', 'Granit', 'Block', 'Bubbler', 'Eater',
          'Doubler', 'BeBack', 'Goldie', 'Killer']
ATTRIBUTES = ['ABonus', 'AMove', 'AHike', 'AIron']
COLS, ROWS = 13, 17
STONE_W, STONE_H = 30, 15


def dib_to_image(blob):
    """DelphiX picture data: ShortString class name 'TDIB', then BITMAPINFOHEADER, colour table, pixels."""
    assert blob[:5] == b'\x04TDIB', blob[:8]
    dib = blob[5:]
    hdr_size, _, _, _, bpp, compression = struct.unpack('<IiiHHI', dib[:20])
    colours = struct.unpack('<I', dib[32:36])[0]
    if bpp <= 8:
        table = (colours or 1 << bpp) * 4
    else:
        table = 12 if compression == 3 else 0  # BI_BITFIELDS masks
    bmp = b'BM' + struct.pack('<IHHI', 14 + len(dib), 0, 0, 14 + hdr_size + table) + dib
    im = Image.open(io.BytesIO(bmp))
    im.load()
    return im.convert('RGB'), bpp


def read_level(path):
    b = open(path, 'rb').read()
    assert len(b) == COLS * ROWS * 2 + 1, (path, len(b))
    # Column-major: cell (col, row) at 2 * (col * ROWS + row).
    grid = [[(b[2 * (c * ROWS + r)], b[2 * (c * ROWS + r) + 1]) for c in range(COLS)] for r in range(ROWS)]
    return grid, b[-1]


def render_level(grid, tile, images):
    im = Image.new('RGB', (COLS * STONE_W, ROWS * STONE_H))
    if tile:
        t = images[f'Tile{tile}']
        for y in range(0, im.height, t.height):
            for x in range(0, im.width, t.width):
                im.paste(t, (x, y))
    d = ImageDraw.Draw(im)
    for r, row in enumerate(grid):
        for c, (stone, attr) in enumerate(row):
            x, y = c * STONE_W, r * STONE_H
            if stone:
                s = images[STONES[stone - 1]].crop((0, 0, STONE_W, STONE_H))
                mask = s.convert('L').point(lambda v: 255 if v else 0)
                im.paste(s, (x, y), mask)
            if attr:
                d.text((x + 2, y + 2), ATTRIBUTES[attr - 1][1], fill=(255, 255, 255))
    return im


def main(src, out):
    form = load_forms(os.path.join(src, 'WUNIOID.EXE'))['TFORM1']
    manifest = {'images': {}, 'sounds': [], 'levels': {}}
    images = {}
    for lst in IMAGE_LISTS:
        os.makedirs(os.path.join(out, lst), exist_ok=True)
        manifest['images'][lst] = []
        for i, item in enumerate(form.find(lst).props['Items']):
            im, bpp = dib_to_image(item['Picture.Data'].data)
            name = item['Name']
            images[name] = im
            im.save(os.path.join(out, lst, f'{i:02d}_{name.replace("$", "S")}.png'))
            manifest['images'][lst].append({
                'name': name, 'width': im.width, 'height': im.height, 'bpp': bpp,
                'patternWidth': item['PatternWidth'], 'patternHeight': item['PatternHeight'],
                'transparent': item['Transparent'], 'transparentColor': item['TransparentColor'],
            })
    os.makedirs(os.path.join(out, 'sounds'), exist_ok=True)
    for i, item in enumerate(form.find('WaveList').props['Items']):
        data = item['Wave.WAVE'].data
        w = wave.open(io.BytesIO(data))
        open(os.path.join(out, 'sounds', f'{i:02d}_{item["Name"]}.wav'), 'wb').write(data)
        manifest['sounds'].append({'name': item['Name'], 'rate': w.getframerate(), 'bits': w.getsampwidth() * 8,
                                   'seconds': round(w.getnframes() / w.getframerate(), 3), 'looped': item['Looped']})
    os.makedirs(os.path.join(out, 'levels'), exist_ok=True)
    for fn in sorted(os.listdir(os.path.join(src, 'Levels'))):
        if fn.lower().endswith('.lev'):
            grid, tile = read_level(os.path.join(src, 'Levels', fn))
            render_level(grid, tile, images).save(os.path.join(out, 'levels', fn[:-4] + '.png'))
            manifest['levels'][fn] = {'tile': tile, 'grid': grid}
    json.dump(manifest, open(os.path.join(out, 'assets.json'), 'w'), indent=1)
    print(f'{sum(map(len, manifest["images"].values()))} images, {len(manifest["sounds"])} sounds, '
          f'{len(manifest["levels"])} levels -> {out}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
