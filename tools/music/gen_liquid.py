"""Generates tools/music/songs/menu_liquid{1..5}.txt, the liquid drum'n'bass takes on the menu track (docs/music.md).

Take 4 ("Deep Water") is the chosen menu track; the others are kept as a sound palette. The scores are the source
once written: edit a score by hand, or change this script and regenerate (it overwrites all five).

Usage: python3 tools/music/gen_liquid.py tools/music/songs
"""
import sys

NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
PC = {n: i for i, n in enumerate(NAMES)} | {'Db': 1, 'D#': 3, 'Gb': 6, 'G#': 8, 'A#': 10}


def midi(n):
    name, octv = (n[:2], n[2:]) if len(n) > 2 and n[1] in '#b' else (n[:1], n[1:])
    return 12 * (int(octv) + 1) + PC[name]


def name(m):
    return f'{NAMES[m % 12]}{m // 12 - 1}'


def tr(n, k):
    return name(midi(n) + k)


def chord(ns, k=0, vel=None):
    s = '+'.join(tr(n, k) for n in ns)
    return f'{s}:{vel}' if vel else s


def half(tokens):
    """Doubles every step: the hook at half time."""
    out = []
    for t in tokens.replace('|', ' ').split():
        out += [t, '.']
    return out


def bars(tokens, n):
    toks = tokens if isinstance(tokens, list) else tokens.replace('|', ' ').split()
    exp = []
    for t in toks:
        if '*' in t and not t.startswith('*'):
            a, b = t.rsplit('*', 1)
            exp += [a] * int(b)
        else:
            exp.append(t)
    assert len(exp) == 16 * n, (len(exp), 16 * n, tokens)
    return ' '.join(exp)


# The hook (docs/music.md), sixteenths, then at half time: 8 bars.
H1 = 'G5 . A5 Bb5 A5 . G5 . A5 . D6 . A5 . . .'
H2 = 'G5 . A5 Bb5 A5 . G5 . G5 . F#5 . G5 . A5 .'
H4 = 'Bb5 . C6 D6 C6 . Bb5 . C6 . F6 . C6 . - .'
HOOK = half(f'{H1} {H2} {H1} {H4}')
# Take 1's TB-303 line (menu_acid1.txt), four bars of sixteenths, a chord every two beats: at half time it fits
# the chord-per-bar harmony below. ACID_ROLL fills each held step with the note an octave up, soft (a rolling 303).
ACID = ("G2:99 . A2:70 Bb2:80 A2:99 . G2:70 G3:55 A2:99 . D3:99 . A2:80 A3:60 ~G3 A2:70 | G2:99 . A2:70 Bb2:80 "
        "A2:99 . G2:70 G3:55 G2:99 . F#2:99 F#3:55 G2:99 G3:60 A2:99 ~A3 | G2:99 . A2:70 Bb2:80 A2:99 . G2:70 G3:55 "
        "A2:99 . D3:99 . A2:80 A3:60 ~G3 A2:70 | Bb2:99 . C3:70 D3:80 C3:99 . Bb2:70 Bb3:55 C3:99 . F3:99 . C3:80 "
        "C4:60 ~Bb3 C3:70")
ACID_HALF = half(ACID)


def acid_roll():
    out = []
    for t in ACID.replace('|', ' ').split():
        if t == '.':
            out += ['.', '.']
        else:
            n = t.lstrip('~').split(':')[0]
            out += [t, f'{tr(n, 12)}:40']
    return out


ACID_ROLL = acid_roll()
ACID303 = ('saw filter=ladder cutoff=300 res=0.7 fenv=2.4 fdecay=0.16 a=0.002 d=0.4 s=0.8 r=0.015 glide=0.06 '
           'gate=0.55 dist=1.6 gain=0.55 level=0.7 echo=0.3 reverb=0.15 duck=0.25')

# The original's harmony, a chord per bar at half time, in jazzier voicings: Gm9, F6/9, Ebmaj9, D7b9, ..., F9.
ROOTS = ['G1', 'F1', 'Eb1', 'D1', 'G1', 'F1', 'Eb1', 'F1']
VOX = [['Bb3', 'D4', 'F4', 'A4'], ['A3', 'C4', 'D4', 'G4'], ['G3', 'Bb3', 'D4', 'F4'], ['F#3', 'A3', 'C4', 'Eb4'],
       ['Bb3', 'D4', 'F4', 'A4'], ['A3', 'C4', 'D4', 'G4'], ['G3', 'Bb3', 'D4', 'F4'], ['A3', 'C4', 'Eb4', 'G4']]


def per_bar(fn):
    return ' | '.join(fn(i, r, v) for i, (r, v) in enumerate(zip(ROOTS, VOX)))


def held(k=0):  # whole-bar chords (pads, strings)
    return per_bar(lambda i, r, v: f'{chord(v, k)} .*15')


def sub_line(i, r, v):  # root, a push on 3-and with the kick, a slide up the octave into the next bar
    return f'{r} .*9 {r} . . . ~{tr(r, 12)} .'


def sub_held(i, r, v):
    return f'{r} .*15'


def comp_rhodes(i, r, v):  # sustained hit, a softer re-hit on 2-and, an anticipation
    return f'{chord(v, 0, 80)} .*5 - {chord(v, 0, 55)} .*3 - . . {chord(v, 0, 65)} -'


def arp8(k):  # an arpeggio in eighths over the voicing
    def f(i, r, v):
        a, b, c, d = (tr(x, k) for x in v)
        return f'{a} . {c} . {b} . {d} . {c} . {b} . {d} . {tr(a, 12)} .'
    return f


def arp16(k):  # a harp in sixteenths, up and down two octaves
    def f(i, r, v):
        a, b, c, d = (tr(x, k) for x in v)
        up = [a, b, c, d, tr(a, 12), tr(b, 12), tr(c, 12), tr(d, 12)]
        return ' '.join(up + up[::-1])
    return f


def funk_bass(i, r, v):  # the original's octave jumps, funked up: root, octave, a push and a slide
    lo, hi = tr(r, 12), tr(r, 24)
    return f'{lo}:90 . . {hi}:60 - . {lo}:80 . . . {lo}:90 . {hi}:70 - ~{tr(r, 22)}:60 .'


def skank(i, r, v):  # guitar chops on the offbeats
    c = chord(v[1:] + [tr(v[0], 12)])
    return f'. . {c}:70 . . . {c}:45 . . . {c}:70 . . {c}:40 {c}:55 .'


def reese_line(i, r, v):
    return f'{r} .*15'


# Breaks: kick and ghost snares on one line, the backbeat snare on its own (more reverb), hats shuffled.
KICK = {
    'two': 'K . . . . . . g . g K . . . . g | K . . g . . . g . . K . . . g .',
    'roll': 'K . . . . . . g . g K . . . . g | . . K g . . . g . g K . . . . .',
    'funk': 'K . . g . . g . . g K . . g . g | K . K . . . . g . g . K . . g .',
}
SNARE = '. . . . S . . . . . . . S . . .'
SNARE_FILL = '. . . . S . . . . . . . S . . . | . . . . S . . s . S . s S s S S'
HATS = {
    'shuffle': 'h . H h h . H . h . H h h . H h',
    'eighths': 'h . H . h . H . h . H . h . H h',
    'ride': 'r . h . r h h . r . h . r . h h',
    'open': 'h . o . h h o . h . o h h . o h',
}


def song(cfg):
    I = cfg['insts']
    out = [f'# Wunioid: title / main menu (Remastered), liquid drum\'n\'bass take {cfg["no"]}, "{cfg["title"]}".',
           f'# {cfg["about"]}',
           '# The hook of the Revenge of Doh title music at half time (one bar of the hook over two bars of the break),',
           '# over the original\'s harmony as Gm9 - F6/9 | Ebmaj9 - D7b9 | Gm9 - F6/9 | Ebmaj9 - F9, a chord per bar.',
           '# Generated by tools/music/gen_liquid.py.',
           'tempo 172', 'steps 4', f'swing {cfg.get("swing", 0.1)}',
           'echo time=3 feedback=0.45 tone=2500', 'reverb time=3.2 tone=6000 predelay=0.03',
           'master ratio=3 threshold=0.35 loud=1.0', '']
    out += [f'inst {k} {v}' for k, v in I.items()]
    for sec, lines in cfg['sections']:
        out += ['', f'pattern {sec} 8'] + [l for l in lines if l]
    out += ['', 'song intro a1 a2 brk b1 b2', 'loop 1', '']
    return '\n'.join(out)


DRUMS = {
    'kick': 'drums kit=break gain=0.6 k=1.3 g=0.3 drive=1.2 reverb=0.04',
    'snare': 'drums kit=break gain=0.8 s=1.0 reverb=0.22',
    'hats': 'drums kit=break gain=0.45 h=1.0 o=0.7 r=0.6 reverb=0.12',
    'fx': 'drums kit=break gain=0.4 c=1.0 reverb=0.3',
}
SUB = 'sine a=0.004 d=0.6 s=0.9 r=0.08 glide=0.05 gain=0.5 duck=0.45'
PAD = 'saw voices=6 detune=24 spread=1.0 a=1.2 d=4 s=0.9 r=2.0 cutoff=1100 gain=0.25 reverb=0.6 chorus=0.3 mono=0'
RHODES = ('fm ratio=1 index=1.6 isus=0.15 idecay=0.5 a=0.002 d=1.4 s=0.35 r=0.5 gain=0.32 chorus=0.45 '
          'reverb=0.35 echo=0.1 mono=0 pan=0.1')
TINE = 'fm cratio=7 ratio=1 index=0.6 isus=0 idecay=0.03 a=0.001 d=0.07 s=0 r=0.06 gain=0.1 mono=0 pan=0.1'


def full_snare(fill):
    return f'snare {bars((SNARE + " ") * 6 + SNARE_FILL, 8)}' if fill else f'snare {bars(SNARE, 1)}'


ON_BEAT = 'H . h h h . h . H . h h h . h .'  # accents on 1 and 3: without a kick, offbeat accents sound like the beat


def intro_hats(h):
    return f'hats  .*64 {bars(" ".join([ON_BEAT] * 4), 4)}'


# The roll into the melody (end of the intro and of the breakdown): only the last two beats, louder at the end
# (user, session 13: of four rolls, this one; a roll from the downbeat of bar 7 sounded displaced).
ROLL_IN = '. .*15 | . .*7 s s s s S S S S'
CRASH = 'c .*127'


def V(no, title, about, insts, kick, hats, lead, counter, harmony, extras=lambda sec: [], swing=0.1, hook=None, roll=None):
    """The common arrangement: intro (8 bars: keys and pad, hats in the second half, a roll into the drop),
    a1 (the break, bass and hook), a2 (+ counter-melody), brk (no kick or snare, the hook alone), b1, b2."""
    lead_line = '\n'.join(f'{l} {bars(hook or HOOK, 8)}' for l in (lead if isinstance(lead, list) else [lead]))
    sec = []
    sec.append(('intro', [*extras('intro'), intro_hats(hats), f'snare .*96 {bars(roll or ROLL_IN, 2)}', 'pad.level 0.1 .*126 0.8']))
    sec.append(('a1', [f'fx {CRASH}', f'kick  {bars(KICK[kick], 2)}', full_snare(False), f'hats  {bars(HATS[hats], 1)}',
                       *extras('a1'), lead_line]))
    sec.append(('a2', [f'kick  {bars(KICK[kick], 2)}', full_snare(True), f'hats  {bars(HATS[hats], 1)}',
                       *extras('a2'), lead_line, counter]))
    sec.append(('brk', [f'hats  {bars(ON_BEAT, 1)}', f'snare .*96 {bars(roll or ROLL_IN, 2)}',
                        *extras('brk'), lead_line]))
    sec.append(('b1', [f'fx {CRASH}', f'kick  {bars(KICK[kick], 2)}', full_snare(False), f'hats  {bars(HATS[hats], 1)}',
                       *extras('b1'), lead_line, counter]))
    sec.append(('b2', [f'kick  {bars(KICK[kick], 2)}', full_snare(True), f'hats  {bars(HATS[hats], 1)}',
                       *extras('b2'), lead_line, counter, harmony]))
    return dict(no=no, title=title, about=about, insts=dict(DRUMS) | insts, sections=sec, swing=swing)


def sub_for(s):
    return f'sub   {bars(per_bar(sub_held if s in ("intro", "brk") else sub_line), 8)}'


VERSIONS = [
    V(1, 'Horizons', 'Good Looking style: Rhodes comping and a warm pad, the hook on a breathy flute, a bell answering; take 1\'s '
      '303 line at half time underneath, its knobs turning slowly.',
      dict(sub=SUB, pad=PAD, keys=RHODES, tine=TINE, acid=ACID303,
           flute='tri a=0.03 d=1 s=0.9 r=0.25 vib=14 vibrate=5 vibdelay=0.3 glide=0.04 cutoff=3500 gain=0.6 echo=0.35 reverb=0.45',
           bell='fm ratio=3.5 index=1.4 isus=0 idecay=0.3 a=0.001 d=0.9 s=0 r=0.6 gain=0.13 echo=0.4 reverb=0.4 mono=0 pan=-0.3'),
      'two', 'shuffle', 'flute', f'bell  {bars(per_bar(arp8(12)), 8)}',
      f'pad   {bars(held(12), 8)}',
      lambda s: [f'pad   {bars(held(), 8)}', f'keys  {bars(per_bar(comp_rhodes), 8)}',
                 f'tine  {bars(per_bar(comp_rhodes), 8)}'] + ([] if s == 'intro' else [sub_for(s)])
      + ({'a1': ['acid.cutoff 250 .*126 600'], 'a2': ['acid.cutoff 600 .*62 1100 .*62 500', 'acid.res 0.75'],
          'b1': ['acid.cutoff 450 .*126 1400', 'acid.res 0.8'], 'b2': ['acid.cutoff 1400 .*62 1900 .*62 400']}.get(s, []))
      + ([f'acid  {bars(ACID_HALF, 8)}'] if s in ('a1', 'a2', 'b1', 'b2') else [])),
    V(2, 'Doh Strings', 'Orchestral liquid: a string section plays the hook and cellos double it, take 1\'s 303 line rolls underneath '
      'in sixteenths (each note answered an octave up); a soft piano arpeggio in the intro and the break.',
      dict(sub=SUB, acid=ACID303, strings='saw voices=5 detune=14 spread=0.9 a=0.35 d=3 s=0.9 r=0.9 cutoff=2600 res=0.1 gain=0.6 '
                            'vib=10 vibrate=5 vibdelay=0.2 chorus=0.3 reverb=0.55 octave=-1 glide=0.05',
           pad='saw voices=6 detune=18 spread=1.0 a=0.9 d=4 s=0.9 r=1.6 cutoff=1800 gain=0.2 reverb=0.7 chorus=0.3 mono=0',
           piano='fm ratio=1 index=2.2 isus=0.05 idecay=0.18 a=0.001 d=0.9 s=0.15 r=0.5 gain=0.2 reverb=0.4 echo=0.15 mono=0 pan=-0.15',
           cello='saw voices=3 detune=10 spread=0.4 a=0.3 d=3 s=0.9 r=0.9 cutoff=1200 gain=0.32 reverb=0.5 octave=-2 glide=0.05'),
      'two', 'eighths', 'strings', f'piano {bars(per_bar(arp8(12)), 8)}', f'cello {bars(HOOK, 8)}',
      lambda s: [f'pad   {bars(held(), 8)}'] + ([] if s == 'intro' else [sub_for(s)])
      + ([f'piano {bars(per_bar(arp8(0)), 8)}'] if s in ('intro', 'brk') else [f'acid  {bars(ACID_ROLL, 8)}'])
      + ({'a1': ['acid.cutoff 200 .*126 500', 'acid.level 0.45 .*126 0.7'], 'a2': ['acid.cutoff 500 .*62 1000 .*62 450'],
          'b1': ['acid.cutoff 350 .*126 1300', 'acid.res 0.8'], 'b2': ['acid.cutoff 1300 .*62 1800 .*62 400']}.get(s, []))),
    V(3, 'Soft Acid', 'The 303 goes liquid: it plays the hook at half time, closed and gently resonant, swimming in '
                      'echo; Rhodes underneath, a vibraphone answering.',
      dict(sub=SUB, pad=PAD, keys=RHODES, tine=TINE,
           acid='saw filter=ladder cutoff=400 res=0.6 fenv=1.6 fdecay=0.25 a=0.002 d=0.5 s=0.8 r=0.05 glide=0.08 '
                'gate=0.8 dist=1.2 gain=0.65 level=0.8 octave=-2 echo=0.4 reverb=0.3 duck=0.2',
           vibes='fm ratio=4 index=1.0 isus=0 idecay=0.4 a=0.001 d=1.2 s=0 r=0.7 gain=0.14 echo=0.3 reverb=0.45 mono=0 pan=-0.3'),
      'roll', 'shuffle', 'acid', f'vibes {bars(per_bar(arp8(12)), 8)}', 'acid.res 0.6 .*126 0.85',
      lambda s: [f'pad   {bars(held(), 8)}', f'keys  {bars(per_bar(comp_rhodes), 8)}', f'tine  {bars(per_bar(comp_rhodes), 8)}']
      + ([] if s == 'intro' else [sub_for(s)])
      + ({'a1': ['acid.cutoff 350 .*126 900'], 'a2': ['acid.cutoff 900 .*62 1600 .*62 700'],
          'brk': ['acid.cutoff 500', 'acid.res 0.75'], 'b1': ['acid.cutoff 600 .*126 1800', 'acid.res 0.8'],
          'b2': ['acid.cutoff 1800 .*62 2400 .*62 500']}.get(s, []))),
    V(4, 'Deep Water', 'Deep and rolling: a moving reese bass, a harp in sixteenths, the hook on a soft choir lead.',
      dict(sub=SUB, pad=PAD,
           reese='saw voices=2 detune=22 spread=0.3 filter=ladder cutoff=300 res=0.2 a=0.01 d=2 s=0.9 r=0.1 glide=0.06 '
                 'dist=1.5 gain=0.5 level=0.7 duck=0.4',
           harp='pluck bright=4500 sustain=2.0 a=0.001 d=1 s=0.6 r=0.3 gain=0.45 echo=0.25 reverb=0.4 mono=0 pan=0.25',
           choir='saw voices=4 detune=14 spread=0.7 cutoff=1300 res=0.15 a=0.12 d=2 s=0.9 r=0.5 vib=12 vibrate=4.5 '
                 'vibdelay=0.3 glide=0.07 chorus=0.5 gain=0.6 echo=0.3 reverb=0.55 octave=-1',
           bell='fm ratio=3.5 index=1.2 isus=0 idecay=0.3 a=0.001 d=0.9 s=0 r=0.6 gain=0.1 echo=0.4 reverb=0.4 mono=0 pan=-0.3'),
      'roll', 'shuffle', 'choir', f'bell  {bars(HOOK, 8)}', f'harp  {bars(per_bar(arp16(12)), 8)}',
      lambda s: [f'pad   {bars(held(), 8)}', f'harp  {bars(per_bar(arp16(0)), 8)}']
      + ([] if s == 'intro' else [sub_for(s), f'reese {bars(per_bar(reese_line), 8)}',
                                  'reese.cutoff ' + ' '.join(['250 .*7 700 .*7'] * 8)])),
    V(5, 'Doh Funk', 'Liquid funk: guitar chops on the offbeats, a slap-ish FM bass with the original\'s octave jumps, '
                     'the hook on an electric piano, open hats.',
      dict(sub='sine a=0.004 d=0.6 s=0.9 r=0.08 glide=0.05 gain=0.4 duck=0.45', pad=PAD,
           bass='fm ratio=1 index=3.0 isus=0.1 idecay=0.07 fb=0.3 a=0.001 d=0.3 s=0.6 r=0.04 glide=0.04 cutoff=1800 gain=0.4 duck=0.3',
           guitar='pluck bright=3500 sustain=0.6 a=0.001 d=0.12 s=0 r=0.05 gain=0.6 reverb=0.25 echo=0.15 mono=0 pan=-0.35',
           ep='fm ratio=1 index=2.0 isus=0.2 idecay=0.35 a=0.002 d=1.2 s=0.5 r=0.3 gain=0.6 chorus=0.5 reverb=0.35 echo=0.25 glide=0.03 octave=-1',
           eptine='fm cratio=7 ratio=1 index=0.6 isus=0 idecay=0.03 a=0.001 d=0.07 s=0 r=0.06 gain=0.12 octave=-1',
           brass='saw voices=3 detune=10 spread=0.5 a=0.03 d=0.25 s=0.5 r=0.15 cutoff=1500 fenv=1.0 fdecay=0.1 gain=0.3 reverb=0.3 mono=0 pan=0.2'),
      'funk', 'open', 'ep', f'brass {bars(per_bar(lambda i, r, v: f". .*9 {chord(v[1:], 12)}:80 - . {chord(v[1:], 12)}:60 - ."), 8)}',
      f'eptine {bars(HOOK, 8)}',
      lambda s: [f'pad   {bars(held(), 8)}', f'guitar {bars(per_bar(skank), 8)}']
      + ([] if s == 'intro' else [f'bass  {bars(per_bar(funk_bass), 8)}' if s != 'brk' else '',
                                  sub_for(s)]), swing=0.12),
]


if __name__ == '__main__':
    for v in VERSIONS:
        path = f'{sys.argv[1]}/menu_liquid{v["no"]}.txt'
        with open(path, 'w') as f:
            f.write(song(v))
        print(path)
