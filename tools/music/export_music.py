"""Renders the game's music (docs/music.md) into game/public/music/: an MP3 per track and music.json, the playlist
with the loop points the game's Music (game/src/audio/music.ts) loops with.

The menu track plays on the title screen, in the menus and in the editor; level n plays LEVELS[(n - 1) % len].
The order alternates drum'n'bass and acid techno (the scores keep their candidate numbers, session 14).

Usage: uv run --with numpy --with scipy python tools/music/export_music.py [game/public/music] [--jobs 3]
"""
import argparse
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
SONGS = os.path.join(HERE, 'songs')
MENU = ('menu', 'menu_full', 'Deep Water')
LEVELS = [
    ('brick_breaker', 'level_03_brick_breaker', 'Brick Breaker'),
    ('acid_rain', 'level_11_acid_rain', 'Acid Rain'),
    ('dark_matter', 'level_07_dark_matter', 'Dark Matter'),
    ('resonance', 'level_12_resonance', 'Resonance'),
    ('capsule_rush', 'level_09_capsule_rush', 'Capsule Rush'),
    ('laser_wall', 'level_14_laser_wall', 'Laser Wall'),
    ('molten_core', 'level_17_molten_core', 'Molten Core'),
    ('ricochet', 'level_19_ricochet', 'Ricochet'),
    ('lift_off', 'level_20_lift_off', 'Lift Off'),
]


def render(out_dir, track):
    name, score, title = track
    wav = os.path.join(out_dir, name + '.wav')
    subprocess.run([sys.executable, os.path.join(HERE, 'synth.py'), os.path.join(SONGS, score + '.txt'), wav,
                    '--mp3', os.path.join(out_dir, name + '.mp3')], check=True, stdout=subprocess.DEVNULL)
    os.remove(wav)
    with open(os.path.join(out_dir, name + '.json')) as f:
        info = json.load(f)
    os.remove(os.path.join(out_dir, name + '.json'))
    print(f'{name}.mp3: "{title}", loop {info["loopStart"] / info["sampleRate"]:.2f}-'
          f'{info["loopEnd"] / info["sampleRate"]:.2f} s', flush=True)
    return dict(file=name + '.mp3', title=title, **info)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('out', nargs='?', default=os.path.join(HERE, '..', '..', 'game', 'public', 'music'))
    ap.add_argument('--jobs', type=int, default=3, help='renders at once (each takes 1-3 GB)')
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    with ThreadPoolExecutor(args.jobs) as pool:
        menu, *levels = pool.map(lambda t: render(args.out, t), [MENU, *LEVELS])
    with open(os.path.join(args.out, 'music.json'), 'w') as f:
        json.dump(dict(menu=menu, levels=levels), f, indent=1)
        f.write('\n')


if __name__ == '__main__':
    main()
