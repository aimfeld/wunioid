"""Export the original's graphics, sounds, levels, courses and high scores for the browser game.

Usage: uv run --with pefile --with pillow python tools/export_game_data.py original_source game/public/data
Writes images/<name>.png (with alpha), sounds/<name>.wav, levels/*.lev, *.cse, *scr and data.json.

Transparency: DelphiX draws an image list item with a colour key when `Transparent` is set. The key is the item's
TransparentColor as the 640x480x16 display surface stores it, and the pixels are compared after the image was
converted to that surface, so every pixel whose 16-bit value equals the key's is transparent (Inferred, RGB 5:6:5
assumed; it makes a few near-black pixels of the paddles and Granit transparent too, see docs/re-notes.md).
"""
import io
import json
import os
import shutil
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from delphi_dfm import load_forms  # noqa: E402
from extract_assets import IMAGE_LISTS, dib_to_image  # noqa: E402

NAMED_COLOURS = {'clBlack': 0x000000, 'clWhite': 0xFFFFFF}


def key_rgb(colour):
    """A Delphi TColor (named or $00BBGGRR) as (r, g, b)."""
    c = NAMED_COLOURS[colour] if isinstance(colour, str) else colour
    return c & 0xFF, (c >> 8) & 0xFF, (c >> 16) & 0xFF


def rgb565(r, g, b):
    return (r >> 3) << 11 | (g >> 2) << 5 | b >> 3


def file_name(name):
    """Image names contain $, + and - (B$Red, BPad+, B--o); keep the files URL-plain."""
    return name.replace('$', 'S').replace('+', 'Plus').replace('-', 'Minus')


def with_alpha(im, colour):
    key = rgb565(*key_rgb(colour))
    rgba = im.convert('RGBA')
    rgba.putdata([(r, g, b, 0 if rgb565(r, g, b) == key else 255) for r, g, b, _ in rgba.getdata()])
    return rgba


def main(src, out):
    form = load_forms(os.path.join(src, 'WUNIOID.EXE'))['TFORM1']
    for sub in ('images', 'sounds', 'levels'):
        shutil.rmtree(os.path.join(out, sub), ignore_errors=True)
        os.makedirs(os.path.join(out, sub))
    manifest = {'images': {}, 'sounds': [], 'levels': [], 'courses': [], 'scores': []}
    for lst in IMAGE_LISTS:
        for item in form.find(lst).props['Items']:
            im, _ = dib_to_image(item['Picture.Data'].data)
            name = item['Name']
            if item['Transparent']:
                im = with_alpha(im, item['TransparentColor'])
            im.save(os.path.join(out, 'images', file_name(name) + '.png'), optimize=True)
            # DelphiX: PatternWidth/Height 0 means one pattern of the whole image
            pw, ph = item['PatternWidth'] or im.width, item['PatternHeight'] or im.height
            manifest['images'][name] = {'file': file_name(name) + '.png', 'list': lst, 'width': pw, 'height': ph,
                                        'frames': (im.width // pw) * (im.height // ph)}
    for item in form.find('WaveList').props['Items']:
        open(os.path.join(out, 'sounds', item['Name'] + '.wav'), 'wb').write(item['Wave.WAVE'].data)
        manifest['sounds'].append(item['Name'])
    for fn in sorted(os.listdir(os.path.join(src, 'Levels')), key=str.lower):
        if fn.lower().endswith('.lev'):
            shutil.copyfile(os.path.join(src, 'Levels', fn), os.path.join(out, 'levels', fn))
            manifest['levels'].append(fn)
    # Courses and the 2011 high scores beside the EXE (Levels/*scr are an older record format, docs/file-formats.md)
    for fn in sorted(os.listdir(src), key=str.lower):
        path = os.path.join(src, fn)
        if fn.lower().endswith('.cse') or (fn.lower().endswith('scr') and os.path.isfile(path)):
            shutil.copyfile(path, os.path.join(out, fn))
            manifest['courses' if fn.lower().endswith('.cse') else 'scores'].append(fn)
    json.dump(manifest, open(os.path.join(out, 'data.json'), 'w'), indent=1)
    print(f'{len(manifest["images"])} images, {len(manifest["sounds"])} sounds, {len(manifest["levels"])} levels, '
          f'{len(manifest["courses"])} courses -> {out}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
