"""Generates the acid techno level tracks tools/music/songs/level_11,12,14,17,19,20_*.txt (docs/music.md; the user
kept these six of ten candidates, session 15):
TB-303 lines with slow knob turning (cutoff, resonance, distortion over whole sections), hard 909-like or 808
kits, menu_acid1.txt as the reference sound. Original melodies. Every track: an intro without the kick, played
once, then a loop (main, B section, breakdown, rise, drop, outro) whose outro closes the knobs back to where the
main section starts.

Usage (compose.py): python3 tools/music/gen_levels_acid.py tools/music/songs [--balance] [file names]
"""
from compose import (Track, steps, ramp, lead, chord, root, per_chord, parse_chord, parse_spec,
                     name, SCALES, PC, main)

# --- Sound palette (from the menu takes) ---------------------------------------------------------------------

ACID = ('saw filter=ladder cutoff=200 res=0.7 fenv=3.2 fdecay=0.16 a=0.002 d=0.4 s=0.8 r=0.015 glide=0.06 '
        'gate=0.55 dist=2.5 gain=0.6 level=0.9 echo=0.12 duck=0.15')
ACID_PULSE = ('pulse width=0.5 filter=ladder cutoff=300 res=0.8 fenv=2.6 fdecay=0.12 a=0.002 d=0.3 s=0.7 r=0.015 '
              'glide=0.05 gate=0.5 dist=3 gain=0.5 level=0.6 echo=0.35 reverb=0.12 pan=0.3')
SUB = 'sine a=0.003 d=0.2 s=0.6 r=0.04 gain=0.75 duck=0.7'
LEAD = ('sync sync=1.0 syncenv=3.0 syncdecay=0.2 voices=2 detune=12 spread=0.3 filter=ladder cutoff=2500 res=0.3 '
        'fenv=1.0 fdecay=0.2 a=0.001 d=0.8 s=0.85 r=0.1 glide=0.035 vib=15 vibdelay=0.25 dist=2.0 gain=0.5 '
        'level=1.4 echo=0.3 reverb=0.2')
BODY = ('pulse width=0.42 filter=ladder cutoff=1100 res=0.35 fenv=1.6 fdecay=0.25 a=0.002 d=0.6 s=0.8 r=0.1 '
        'glide=0.035 vib=15 vibdelay=0.25 dist=1.5 octave=-1 gain=0.5 level=0.8 echo=0.2 reverb=0.15')
PAD = 'saw voices=6 detune=30 spread=1.0 a=0.6 d=3 s=0.85 r=1.2 cutoff=1400 gain=0.45 reverb=0.55 mono=0'
STAB = ('saw voices=3 detune=16 spread=0.5 a=0.002 d=0.08 s=0.0 r=0.05 cutoff=1200 res=0.4 fenv=2.4 fdecay=0.06 '
        'gain=0.7 echo=0.5 reverb=0.3 mono=0 pan=-0.2')
SUPERSAW = ('saw voices=7 detune=38 spread=1.0 a=0.003 d=0.3 s=0.5 r=0.2 cutoff=4000 res=0.1 fenv=0.8 fdecay=0.2 '
            'gain=0.35 echo=0.3 reverb=0.4 mono=0')
SUPERPAD = 'saw voices=7 detune=32 spread=1.0 a=0.8 d=4 s=0.9 r=1.5 cutoff=2400 gain=0.35 reverb=0.6 chorus=0.3 mono=0'
HOOVER = ('saw voices=7 detune=50 spread=1.0 a=0.02 d=2 s=0.9 r=0.4 vib=10 glide=0.1 cutoff=2600 res=0.15 drive=2 '
          'bend=-5 bendtime=0.09 gain=0.4 level=1.4 reverb=0.35 duck=0.4')
BELL = 'fm ratio=3.5 index=1.4 isus=0 idecay=0.3 a=0.001 d=0.9 s=0 r=0.6 gain=0.3 echo=0.4 reverb=0.4 mono=0 pan=-0.3'
SQUARE = ('pulse width=0.5 a=0.002 d=0.2 s=0.5 r=0.05 cutoff=3500 res=0.15 gain=0.35 echo=0.35 reverb=0.2 '
          'pan=0.25')
SQUARE_LEAD = ('pulse width=0.5 a=0.002 d=0.5 s=0.7 r=0.08 vib=18 vibdelay=0.15 glide=0.04 cutoff=4200 res=0.1 '
               'gain=0.4 echo=0.3 reverb=0.2 pan=-0.1')

KITS = {
    'hard': dict(kick='drums kit=hard gain=0.6 k=1.3 reverb=0.04',
                 perc='drums kit=hard gain=0.5 p=1.2 s=1.0 g=0.4 c=0.9 l=0.9 m=0.9 t=0.9 reverb=0.15',
                 hats='drums kit=hard gain=0.3 h=1.0 o=0.9 r=0.8 reverb=0.12'),
    'electro': dict(kick='drums kit=electro gain=0.55 k=1.15 reverb=0.04',
                    perc='drums kit=electro gain=0.5 p=1.3 s=0.9 g=0.4 c=0.9 l=0.8 m=0.8 t=0.8 reverb=0.18',
                    hats='drums kit=electro gain=0.35 h=1.1 o=1.0 r=0.6 reverb=0.1'),
}


def spec(base, **kw):
    typ, p = parse_spec(base)
    p.update({k: f'{v:g}' if isinstance(v, (int, float)) else v for k, v in kw.items()})
    return typ + ' ' + ' '.join(f'{k}={v}' for k, v in p.items())


# --- Drums ---------------------------------------------------------------------------------------------------

K4 = 'K . . . K . . . K . . . K . . .'
K4_END = 'K . . . K . . . K . . . - . . .'
CLAP = '. . . . P . . . . . . . P . . .'
HATS16 = 'h h o h h h o h h h o h h h o h'
OFFBEAT = '. . o . . . o . . . o . . . o .'
SOFT_OFF = '. . h . . . h . . . h . . . h .'
ROLL_HALF = '. . . . P . . . S . s s S s S S'
ROLL_2 = 'S . . . S . . . S . s . S . s . | S s S s S s S s S S S S S S S S'
TOMS = '. . . . P . . . l l m m t t T T'
RISE = ' '.join(['s . . . ' * 4] * 4 + ['s . s . ' * 4] * 2 + ['s s s s ' * 4, 'S s S s ' * 2 + 'S S S S S S S S'])


def line(n, bar, last=None, first=None):
    """n bars of a repeating pattern (one or more bars), with the first / last bar(s) replaced."""
    t = steps(bar)
    out = (t * (n * 16 // len(t) + 1))[:n * 16]
    if first:
        f = steps(first)
        out[:len(f)] = f
    if last:
        tail = steps(last)
        out[len(out) - len(tail):] = tail
    return out


def crash(n):
    return ['c'] + ['.'] * (n * 16 - 1)


def drums(n, kind='full', kick=K4, clap=CLAP, hats=HATS16, roll=ROLL_HALF, kick_end=K4_END, cr=True):
    """Kick, perc (clap, snare fills, crash, toms) and hats for a section."""
    if kind == 'intro':
        return {'hats': line(n, SOFT_OFF, last=' '.join([OFFBEAT] * (n // 2))),
                'perc': line(n, '.', last=ROLL_2)}
    if kind == 'brk':
        return {'hats': line(n, '.', last=' '.join([OFFBEAT] * (n // 2))), 'perc': crash(n) if cr else None}
    if kind == 'rise':
        return {'perc': steps(RISE) if n == 8 else line(n, '.', last=RISE),
                'hats': line(n, '.', last=' '.join([HATS16] * (n // 2)))}
    return {'kick': line(n, kick, last=kick_end if roll else None),
            'perc': line(n, clap, last=roll),
            'perc#c': crash(n) if cr else None,
            'hats': line(n, hats)}


def kit(t, kind='hard', kick=-7, perc=-10.5, hats=-19, extra=None):
    for k, target in (('kick', kick), ('perc', perc), ('hats', hats)):
        t.inst(k, spec(KITS[kind][k], **(extra or {}).get(k, {})), mix=target)


# --- Parts -----------------------------------------------------------------------------------------------------

DEGREES = {'R': [0], 'O': [12], 'L': [-12], '2': [2, 1], 'b2': [1], '4': [5, 6], '6': [8, 9], 'b6': [8],
           '7': [10, 11], '9': [14, 13]}


def riff(pat, sym, octave=2, key=None, mode='minor'):
    """A 303 line from a template over a chord: R root, O octave, L octave below, 3 / 5 the chord's third and
    fifth, 7 its seventh (b7 or maj7, whichever is in the key), 2 4 6 9 b2 b6; a trailing ' an octave up, a
    leading , an octave down; ~ (slide) and :vel kept."""
    r, iv, _ = parse_chord(sym)
    base = 12 * (octave + 1) + r
    scale = {(PC[key] + i) % 12 for i in SCALES[mode]} if key else None
    out = []
    for tok in steps(pat):
        if tok in '.-':
            out.append(tok)
            continue
        glide = tok.startswith('~')
        body, _, vel = tok.lstrip('~').partition(':')
        shift = 12 * body.count("'") - 12 * body.count(',')
        deg = body.strip("',")
        if deg == '3':
            cands = [i for i in (3, 4, 5, 2) if i in iv][:1] or [3]
        elif deg == '5':
            cands = [i for i in (7, 6, 8) if i in iv][:1] or [7]
        else:
            cands = DEGREES[deg]
            inchord = [i for i in cands if i in iv or i - 12 in iv or i + 12 in iv]
            cands = inchord + cands
        if scale:
            cands = [i for i in cands if (r + i) % 12 in scale] or cands
        note = name(base + cands[0] + shift)
        out.append(('~' if glide else '') + note + (':' + vel if vel else ''))
    return out


def prog_riff(pats, prog, octave=2, key=None, mode='minor'):
    """One template bar per chord (templates cycled)."""
    out = []
    for i, sym in enumerate(prog):
        out += riff(pats[i % len(pats)], sym, octave, key, mode)
    return out


def chords(prog, voicing, fn):
    return per_chord(prog, lambda i, s: fn(chord(voicing[i])))


def held(prog, voicing):
    return chords(prog, voicing, lambda c: f'{c}/16')


def sub_off(prog, octave=1):
    return per_chord(prog, lambda i, s: ('-/2 ' + root(s, octave) + '/2 ') * 4)


def knobs(inst, n, **kv):
    return {f'{inst}.{k}': ramp(*(v if isinstance(v, tuple) else (v, v)), n=n * 16) for k, v in kv.items()}


def fade(level, n, start=0.1):
    return ramp(round(level * start, 3), level, n=n * 16)


# --- 11 Acid Rain ----------------------------------------------------------------------------------------------

def acid_rain():
    t = Track('level_11_acid_rain', 'Acid Rain', 'A classic acid bassline in A minor over a hard 909 kit, the knobs '
              'turned slowly open; a hard-sync hook joins in the breakdown and the drop.', 135, swing=0.08,
              echo='time=3 feedback=0.45 tone=3000', reverb='time=2.4 tone=7000 predelay=0.03',
              master='ratio=4 threshold=0.3 loud=1.1')
    kit(t)
    t.inst('acid', ACID, mix=-6.5)
    t.inst('sub', SUB, mix=-7)
    t.inst('stab', STAB, mix=-12)
    t.inst('pad', PAD, mix=-13)
    t.inst('lead', LEAD, mix=-6.5)
    t.inst('body', BODY, mix=-11)
    A = ['Am']
    P = ['Am', 'F', 'G', 'Em']
    R = ["R:99 . O:70 R:80 3:99 R:70 ~O . ,7:99 . R:80 O:60 5:99 . 3:80 ~O:70",
         "R:99 R:60 O:70 - 5:99 . R:70 7:60 R:99 . 3:99 ~4 5:80 . ,7:99 ~R"]
    riffA = prog_riff(R, ['Am', 'Am'], key='A')
    riffP = prog_riff(R, P, key='A')
    V = lead(P, 'C4', n=3)
    stabs = chords(P, V, lambda c: f'-/2 {c} - -/4 -/2 {c} - -/2 {c} -')
    hook = ('E5/2 A5/2 -/2 A5/2 B5/2 C6/4 B5/2 | A5/6 G5/2 F5/4 A5/4 | G5/2 B5/2 -/2 B5/2 D6/2 C6/2 B5/2 G5/2 | '
            'G5/2 A5/2 B5/8 -/4 | E5/2 A5/2 -/2 A5/2 B5/2 C6/4 D6/2 | E6/6 D6/2 C6/4 A5/4 | '
            'B5/4 D6/4 G6/4 F6/2 D6/2 | E6/12 -/4')
    t.pattern('intro', 8, {**drums(8, 'intro'), 'acid': riffA, 'pad': held(A, lead(A, 'C4')),
                           'acid.level': fade(0.9, 8), 'pad.level': fade(1, 8, 0.05),
                           **knobs('acid', 8, cutoff=(90, 350), res=0.7, dist=2.5)}, harmony=A)
    t.pattern('main', 16, {**drums(16), 'acid': riffA, 'sub': sub_off(A),
                           **knobs('acid', 16, cutoff=(350, 900), res=(0.7, 0.8), dist=(2.5, 3))})
    t.pattern('b', 16, {**drums(16, roll=ROLL_2), 'acid': riffP, 'sub': sub_off(P), 'stab': stabs,
                        **knobs('acid', 16, cutoff=(900, 1600), res=0.8, dist=(3, 3.5))}, harmony=P)
    t.pattern('brk', 8, {**drums(8, 'brk'), 'pad': held(P, lead(P, 'C4')), 'lead': hook, 'body': hook,
                         'acid': per_chord(P, lambda i, s: ' '.join(riff('R:99/4 5:70/4 O:80/4 3:99/4', s, key='A'))),
                         **knobs('acid', 8, cutoff=(400, 700), res=0.92, dist=2)}, harmony=P)
    t.pattern('rise', 8, {**drums(8, 'rise'), 'acid': riffA, **knobs('acid', 8, cutoff=(300, 2200), res=0.9, dist=(2, 4))})
    t.pattern('drop', 16, {**drums(16), 'acid': riffP, 'sub': sub_off(P), 'stab': stabs, 'pad': held(P, lead(P, 'C4')),
                           'lead': hook, 'body': hook, **knobs('acid', 16, cutoff=(2600, 2900, 2200), res=0.88, dist=5)},
              harmony=P)
    t.pattern('out', 8, {**drums(8), 'acid': riffA, 'sub': sub_off(A),
                         **knobs('acid', 8, cutoff=(2000, 350), res=(0.88, 0.7), dist=(5, 2.5))})
    t.song('intro', 'main', 'b', 'brk', 'rise', 'drop', 'out', loop='main')
    t.main = ['drop']
    return t


# --- 12 Resonance ----------------------------------------------------------------------------------------------

def resonance():
    t = Track('level_12_resonance', 'Resonance', 'Two 303s interlocking in E minor, a low saw and a high square in '
              'dotted accents, panned apart; claps, and a hoover singing over the breakdown and the drop.', 138,
              swing=0.06, echo='time=3 feedback=0.45 tone=3200', reverb='time=2.6 tone=7000 predelay=0.03',
              master='ratio=4 threshold=0.3 loud=1.1')
    kit(t)
    t.inst('acid', spec(ACID, pan=-0.25), mix=-7)
    t.inst('acid2', spec(ACID_PULSE, pan=0.35), mix=-9.5)
    t.inst('sub', SUB, mix=-7)
    t.inst('pad', PAD, mix=-13)
    t.inst('hoover', HOOVER, mix=-8)
    A = ['Em']
    B = ['C', 'D', 'Em', 'Bm']
    D = ['Em', 'D', 'C', 'Bm']
    R1 = ["R:99 . R:60 O:80 - R:99 3:70 . R:99 ~O . 7:80 R:99 . 5:70 ~7",
          "R:99 . R:60 O:80 - R:99 3:70 . ,7:99 . 3:70 ~R 5:99 . 7:80 O:60"]
    R2 = ["5:99 . O:70 3':99 . 5:70 O:99 . 3':60 5:99 . O:70 7:99 . 5:70 ~O"]
    low = lambda p: prog_riff(R1, p, key='E')
    high = lambda p: prog_riff(R2, p, octave=3, key='E')
    melody = ('B4/8 G4/8 | A4/8 F#4/8 | G4/8 E4/8 | F#4/16 | B4/8 D5/8 | A4/8 F#4/8 | G4/4 A4/4 B4/4 E5/4 | D5/16')
    t.pattern('intro', 8, {**drums(8, 'intro'), 'acid': low(A * 2), 'pad': held(A, lead(A, 'B3')),
                           'acid.level': fade(0.9, 8), 'pad.level': fade(1, 8, 0.05),
                           **knobs('acid', 8, cutoff=(90, 300), res=0.75, dist=2.5),
                           **knobs('acid2', 8, cutoff=300, res=0.8, dist=3)}, harmony=A)
    t.pattern('main', 16, {**drums(16), 'acid': low(A * 2), 'acid2': ['-'] + ['.'] * 127 + high(A) * 8,
                           'sub': sub_off(A), **knobs('acid', 16, cutoff=(300, 800), res=(0.75, 0.82), dist=(2.5, 3)),
                           **knobs('acid2', 16, cutoff=(300, 700), res=0.8, dist=3)})
    t.pattern('b', 16, {**drums(16, roll=ROLL_2), 'acid': low(B), 'acid2': high(B), 'sub': sub_off(B),
                        **knobs('acid', 16, cutoff=(800, 1400), res=0.82, dist=(3, 3.5)),
                        **knobs('acid2', 16, cutoff=(700, 1600, 900), res=(0.8, 0.88), dist=3)}, harmony=B)
    t.pattern('brk', 8, {**drums(8, 'brk'), 'pad': held(D, lead(D, 'B3')), 'hoover': melody,
                         'acid2': high(D), **knobs('acid2', 8, cutoff=(500, 900), res=0.9, dist=2.5),
                         **knobs('acid', 8, cutoff=300, res=0.82, dist=3)}, harmony=D)
    t.pattern('rise', 8, {**drums(8, 'rise'), 'acid': low(A * 2), 'acid2': high(D),
                          **knobs('acid', 8, cutoff=(300, 2000), res=0.9, dist=(3, 4.5)),
                          **knobs('acid2', 8, cutoff=(900, 1800), res=0.9, dist=3)}, harmony=D)
    t.pattern('drop', 16, {**drums(16), 'acid': low(D), 'acid2': high(D), 'sub': sub_off(D),
                           'pad': held(D, lead(D, 'B3')), 'hoover': melody,
                           **knobs('acid', 16, cutoff=(2400, 2800, 2000), res=0.88, dist=5),
                           **knobs('acid2', 16, cutoff=(1800, 2400, 1200), res=0.9, dist=3.5)}, harmony=D)
    t.pattern('out', 8, {**drums(8), 'acid': low(A * 2), 'acid2': high(A), 'sub': sub_off(A),
                         **knobs('acid', 8, cutoff=(1800, 300), res=(0.88, 0.75), dist=(5, 2.5)),
                         **knobs('acid2', 8, cutoff=(1200, 300), res=(0.9, 0.8), dist=(3.5, 3))})
    t.song('intro', 'main', 'b', 'brk', 'rise', 'drop', 'out', loop='main')
    t.main = ['drop']
    return t


# --- 13 Squelch Factory ----------------------------------------------------------------------------------------


def laser_wall():
    t = Track('level_14_laser_wall', 'Laser Wall', 'Hard acid in D minor at 140: a 303 rolling in straight '
              'sixteenths, a pounding kick, supersaw stabs on the offbeats and a hard-sync riff.', 140, swing=0.0,
              echo='time=3 feedback=0.4 tone=3500', reverb='time=2.2 tone=7000 predelay=0.02',
              master='ratio=4 threshold=0.28 loud=1.15')
    kit(t, kick=-6.5, extra=dict(kick=dict(k=1.4, drive=1.3)))
    t.inst('acid', spec(ACID, dist=3.5), mix=-6.5)
    t.inst('sub', SUB, mix=-7.5)
    t.inst('saws', SUPERSAW, mix=-12)
    t.inst('lead', LEAD, mix=-7)
    t.inst('body', BODY, mix=-11)
    A = ['Dm']
    B = ['Dm', 'Bb', 'C', 'Dm']
    R = ["R:99 O:70 R:80 3:99 R:70 O:80 5:99 R:70 7':99 R:70 O:80 3':99 R:70 ~2' O:80 5:99"]
    riffA = riff(R[0], 'Dm', key='D')
    riffB = prog_riff(R, B, key='D')
    VA, VB = lead(A, 'D4', n=3), lead(B, 'D4', n=3)
    stab = lambda p, v: chords(p, v, lambda c: f'-/2 {c}/2 ' * 4)
    lriff = 'D5/2 D5/2 F5/2 D5/2 A5/2 D5/2 G5/2 F5/2 | D5/2 D5/2 F5/2 D5/2 C6/2 A5/2 G5/2 E5/2'
    lmel = ('A5/4 D6/4 C6/2 A5/2 F5/4 | F5/4 Bb5/4 A5/2 F5/2 D5/4 | G5/4 C6/4 E6/4 D6/4 | D6/12 -/4')
    t.pattern('intro', 8, {**drums(8, 'intro'), 'acid': riffA, 'acid.level': fade(0.9, 8),
                           'saws': ['-'] * 64 + chords(A * 4, VA * 4, lambda c: f'-/2 {c}:50/2 ' * 4),
                           **knobs('acid', 8, cutoff=(100, 380), res=0.75, dist=3.5)}, harmony=A)
    t.pattern('main', 16, {**drums(16), 'acid': riffA, 'sub': sub_off(A), 'saws': stab(A, VA),
                           'lead': ['-'] + ['.'] * 127 + steps(lriff) * 4, 'body': ['-'] + ['.'] * 127 + steps(lriff) * 4,
                           **knobs('acid', 16, cutoff=(380, 1000), res=(0.75, 0.85), dist=(3.5, 4.5))}, harmony=A)
    t.pattern('b', 16, {**drums(16, roll=ROLL_2), 'acid': riffB, 'sub': sub_off(B), 'saws': stab(B, VB),
                        'lead': lmel, 'body': lmel,
                        **knobs('acid', 16, cutoff=(1000, 1800), res=0.85, dist=(4.5, 5))}, harmony=B)
    t.pattern('brk', 8, {**drums(8, 'brk'), 'saws': held(B, VB), 'lead': lmel,
                         'acid': per_chord(B, lambda i, s: ' '.join(riff('R:99/4 O:70/4 5:80/4 3:99/4', s, key='D'))),
                         **knobs('acid', 8, cutoff=(500, 800), res=0.93, dist=3)}, harmony=B)
    t.pattern('rise', 8, {**drums(8, 'rise'), 'acid': riffA, 'lead': ['-'] * 64 + steps(lriff) * 2,
                          **knobs('acid', 8, cutoff=(300, 2400), res=0.9, dist=(3, 6))}, harmony=A)
    DR = A * 8 + B * 2
    VD = VA * 8 + VB * 2
    t.pattern('drop', 16, {**drums(16), 'acid': prog_riff(R, DR, key='D'), 'sub': sub_off(DR), 'saws': stab(DR, VD),
                           'lead': steps(lriff) * 4 + steps(lmel) * 2, 'body': steps(lriff) * 4 + steps(lmel) * 2,
                           **knobs('acid', 16, cutoff=(2800, 3200, 2400), res=0.9, dist=(6, 7))}, harmony=DR)
    t.pattern('out', 8, {**drums(8), 'acid': riffA, 'sub': sub_off(A), 'saws': stab(A, VA),
                         **knobs('acid', 8, cutoff=(2200, 380), res=(0.9, 0.75), dist=(7, 3.5))}, harmony=A)
    t.song('intro', 'main', 'b', 'brk', 'rise', 'drop', 'out', loop='main')
    t.main = ['drop']
    return t


# --- 15 Warp Field ---------------------------------------------------------------------------------------------


def molten_core():
    t = Track('level_17_molten_core', 'Molten Core', 'Dark acid in B-flat Phrygian: a droning 303 slowly '
              'pushed into heavy distortion, a hoover moaning over it, tom rolls between the sections.', 134,
              swing=0.05, echo='time=3 feedback=0.45 tone=2500', reverb='time=3.2 tone=5500 predelay=0.03',
              master='ratio=4 threshold=0.3 loud=1.1')
    kit(t, extra=dict(kick=dict(drive=1.3)))
    t.inst('acid', spec(ACID, dist=2), mix=-6)
    t.inst('sub', SUB, mix=-7)
    t.inst('hoover', spec(HOOVER, cutoff=2000), mix=-8)
    t.inst('pad', spec(PAD, cutoff=900), mix=-13)
    A = ['Bbm']
    B = ['Bbm', 'B', 'Bbm', 'Ab']
    R = ["R:99 R:60 O:70 R:60 b2:99 R:60 R:70 O:99 R:60 3:80 R:60 O:99 b2:70 ~R R:60 O:80",
         "R:99 R:60 O:70 R:60 b2:99 R:60 4:70 3:99 R:60 b2:80 R:60 O:99 b6:70 ~5 R:60 ,7:80"]
    drone = prog_riff(R, ['Bbm', 'Bbm'], octave=1, key='Bb', mode='phrygian')
    droneB = prog_riff(R, B, octave=1, key='Bb', mode='phrygian')
    hoov = 'Bb4/16 | B4/8 Ab4/8 | Bb4/12 Db5/4 | F4/16 | Bb4/8 Db5/8 | D#5/8 C#5/4 B4/4 | Bb4/16 | C5/8 Eb5/8'
    t.pattern('intro', 8, {**drums(8, 'intro'), 'acid': drone, 'pad': held(A, lead(A, 'Db4')), 'pad.level': fade(1, 8, 0.05),
                           'acid.level': fade(0.9, 8), **knobs('acid', 8, cutoff=(80, 280), res=0.75, dist=2)}, harmony=A)
    t.pattern('main', 16, {**drums(16, roll=TOMS), 'acid': drone, 'sub': sub_off(A),
                           **knobs('acid', 16, cutoff=(280, 700), res=(0.75, 0.85), dist=(2, 5))})
    t.pattern('b', 16, {**drums(16, roll=TOMS), 'acid': droneB, 'sub': sub_off(B), 'hoover': hoov,
                        'pad': held(B, lead(B, 'Db4')),
                        **knobs('acid', 16, cutoff=(700, 1200, 800), res=0.85, dist=(5, 8))}, harmony=B)
    t.pattern('brk', 8, {**drums(8, 'brk'), 'pad': held(B, lead(B, 'Db4')), 'hoover': hoov,
                         'acid': per_chord(B, lambda i, s: ' '.join(riff('R:99/6 b2:70/2 R:80/8', s, octave=1, key='Bb', mode='phrygian'))),
                         **knobs('acid', 8, cutoff=(400, 600), res=0.92, dist=(3, 2))}, harmony=B)
    t.pattern('rise', 8, {**drums(8, 'rise'), 'acid': drone, 'perc#t': ['.'] * 112 + steps('l l m m t t T T l m t T l m t T'),
                          **knobs('acid', 8, cutoff=(250, 1800), res=0.9, dist=(2, 7))})
    t.pattern('drop', 16, {**drums(16, roll=TOMS), 'acid': droneB, 'sub': sub_off(B), 'hoover': hoov,
                           'pad': held(B, lead(B, 'Db4')),
                           **knobs('acid', 16, cutoff=(2000, 2600, 1600), res=0.88, dist=(8, 9))}, harmony=B)
    t.pattern('out', 8, {**drums(8, roll=TOMS), 'acid': drone, 'sub': sub_off(A),
                         **knobs('acid', 8, cutoff=(1500, 280), res=(0.88, 0.75), dist=(9, 2))})
    t.song('intro', 'main', 'b', 'brk', 'rise', 'drop', 'out', loop='main')
    t.main = ['drop']
    return t


# --- 18 Chrome Circuit -----------------------------------------------------------------------------------------


def ricochet():
    t = Track('level_19_ricochet', 'Ricochet', 'Fast acid in C-sharp minor at 141, FastTracker style: square '
              'leads with tick arpeggios bouncing over a hard kit and a busy 303.', 141, swing=0.0,
              echo='time=3 feedback=0.4 tone=3500', reverb='time=2.0 tone=7000 predelay=0.02',
              master='ratio=4 threshold=0.3 loud=1.1')
    kit(t)
    t.inst('acid', spec(ACID, dist=3), mix=-7)
    t.inst('sub', SUB, mix=-7.5)
    t.inst('arp', SQUARE, mix=-13)
    t.inst('lead', SQUARE_LEAD, mix=-7)
    t.inst('pad', spec(PAD, cutoff=1800), mix=-13)
    P = ['C#m', 'A', 'B', 'G#m']
    R = ["R:99 O:70 R:80 - 5:99 R:70 O:99 R:70 3':99 ~O R:70 5:80 R:99 O:70 7:99 ~O"]
    acid = prog_riff(R, P, key='C#')

    def tracker(i, s):
        r, iv, _ = parse_chord(s)
        a = '37c' if 3 in iv else '47c'
        n = name(60 + r if r < 6 else 48 + r)
        return f'{n}^{a}/3 {n}^{a}/3 {n}^{a}/2 -/2 {n}^{a}/2 {n}^{a}/4'
    arp = per_chord(P, tracker)
    mel = 'G#5/4 E5/2 C#5/2 G#5/4 B5/2 G#5/2 | A5/6 G#5/2 E5/4 C#5/4 | F#5/4 D#5/2 B4/2 F#5/4 A5/2 F#5/2 | G#5/8 D#5/4 B4/4'
    mel2 = ('C#6^c/4 B5/2 G#5/2 E5/4 G#5/4 | E6^c/6 C#6/2 A5/4 E5/4 | D#6^c/4 B5/2 F#5/2 D#5/4 F#5/4 | '
            'G#5^c/12 -/4')
    t.pattern('intro', 8, {**drums(8, 'intro'), 'arp': arp, 'arp.level': fade(1, 8, 0.1),
                           'acid': ['-'] * 64 + acid, **knobs('acid', 8, cutoff=(120, 380), res=0.75, dist=3)}, harmony=P)
    t.pattern('main', 16, {**drums(16), 'acid': acid, 'sub': sub_off(P), 'arp': arp,
                           **knobs('acid', 16, cutoff=(380, 1000), res=(0.75, 0.83), dist=(3, 3.5))}, harmony=P)
    t.pattern('b', 16, {**drums(16, roll=ROLL_2), 'acid': acid, 'sub': sub_off(P), 'arp': arp,
                        'lead': steps(mel) * 2 + steps(mel2) * 2,
                        **knobs('acid', 16, cutoff=(1000, 1700, 1200), res=0.85, dist=(3.5, 4))}, harmony=P)
    t.pattern('brk', 8, {**drums(8, 'brk'), 'pad': held(P, lead(P, 'B3')), 'lead': steps(mel2) + steps(mel), 'arp': arp,
                         'acid': ['-'] * 128, **knobs('acid', 8, cutoff=300, res=0.85, dist=3)}, harmony=P)
    t.pattern('rise', 8, {**drums(8, 'rise'), 'acid': acid, 'arp': arp,
                          **knobs('acid', 8, cutoff=(300, 2400), res=0.9, dist=(3, 5))}, harmony=P)
    t.pattern('drop', 16, {**drums(16), 'acid': acid, 'sub': sub_off(P), 'arp': arp, 'pad': held(P, lead(P, 'B3')),
                           'lead': steps(mel) + steps(mel2) + steps(mel) + steps(mel2),
                           **knobs('acid', 16, cutoff=(2600, 3000, 2200), res=0.88, dist=(5, 6))}, harmony=P)
    t.pattern('out', 8, {**drums(8), 'acid': acid, 'sub': sub_off(P), 'arp': arp,
                         **knobs('acid', 8, cutoff=(2000, 380), res=(0.88, 0.75), dist=(6, 3))}, harmony=P)
    t.song('intro', 'main', 'b', 'brk', 'rise', 'drop', 'out', loop='main')
    t.main = ['drop']
    return t


# --- 20 Lift Off -----------------------------------------------------------------------------------------------

def lift_off():
    t = Track('level_20_lift_off', 'Lift Off', 'Euphoric acid in E major: Emaj9 - C#m9 - Amaj9 - B6 under a wide '
              'pad and bell arpeggios, the 303 climbing, a hard-sync melody soaring over the drop.', 136, swing=0.04,
              echo='time=3 feedback=0.5 tone=3800', reverb='time=3.0 tone=7500 predelay=0.03',
              master='ratio=4 threshold=0.3 loud=1.1')
    kit(t)
    t.inst('acid', ACID, mix=-7)
    t.inst('sub', SUB, mix=-7)
    t.inst('pad', SUPERPAD, mix=-11.5)
    t.inst('bell', spec(BELL, gain=0.2, pan=0.3), mix=-15)
    t.inst('lead', LEAD, mix=-6.5)
    t.inst('body', BODY, mix=-11)
    P = ['Emaj9', 'C#m9', 'Amaj9', 'B6']
    B = ['Amaj9', 'B6', 'G#m7', 'C#m9']
    VP, VB = lead(P, 'G#3'), lead(B, 'G#3')
    R = ["R:99 . O:70 R:80 5:99 R:70 ~O . 3':99 . R:70 5:80 O:99 . 7:80 ~O"]
    acid = lambda p: prog_riff(R, p, key='E', mode='major')
    bells = lambda p, v: chords(p, v, lambda c: ' '.join((lambda n: [n[0], n[1], n[2], n[3]] * 2 + [n[2], n[1], n[3], n[2]] * 2)(
        [x[:-1] + str(int(x[-1]) + 1) for x in c.split('+')])))
    melA = 'B5/4 G#5/2 B5/2 D#6/4 C#6/2 B5/2 | B5/6 G#5/2 E5/4 F#5/4 | C#6/4 B5/2 A5/2 E5/4 G#5/2 A5/2 | B5/8 F#5/4 D#5/4'
    melB = 'G#5/4 B5/4 E6/4 D#6/2 B5/2 | C#6/6 B5/2 G#5/4 E5/4 | E5/4 A5/4 C#6/4 B5/2 A5/2 | B5/4 C#6/4 D#6/8'
    mel = steps(melA) + steps(melB)
    t.pattern('intro', 8, {**drums(8, 'intro'), 'pad': held(P, VP), 'pad.level': fade(1, 8, 0.05),
                           'bell': ['-'] * 64 + bells(P, VP), 'acid': ['-'] * 64 + acid(P), 'acid.level': ramp(0.2, 0.9, n=128),
                           **knobs('acid', 8, cutoff=(90, 320), res=0.7, dist=2.5)}, harmony=P)
    t.pattern('main', 16, {**drums(16), 'acid': acid(P), 'sub': sub_off(P), 'pad': held(P, VP), 'bell': bells(P, VP),
                           **knobs('acid', 16, cutoff=(320, 900), res=(0.7, 0.8), dist=(2.5, 3))}, harmony=P)
    t.pattern('b', 16, {**drums(16, roll=ROLL_2), 'acid': acid(B), 'sub': sub_off(B), 'pad': held(B, VB), 'bell': bells(B, VB),
                        **knobs('acid', 16, cutoff=(900, 1600, 1200), res=0.84, dist=(3, 3.5))}, harmony=B)
    t.pattern('brk', 16, {**drums(16, 'brk'), 'pad': held(P, VP), 'lead': mel, 'bell': ['-'] * 128 + bells(P, VP) * 2,
                          'acid': ['-'] * 128 + acid(P) * 2, **knobs('acid', 16, cutoff=(300, 300, 700), res=0.88, dist=2.5)},
              harmony=P)
    t.pattern('rise', 8, {**drums(8, 'rise'), 'acid': acid(P), 'pad': held(P, VP), 'bell': bells(P, VP),
                          **knobs('acid', 8, cutoff=(700, 2400), res=0.9, dist=(2.5, 4))}, harmony=P)
    t.pattern('drop', 16, {**drums(16), 'acid': acid(P), 'sub': sub_off(P), 'pad': held(P, VP), 'bell': bells(P, VP),
                           'lead': mel, 'body': mel,
                           **knobs('acid', 16, cutoff=(2600, 3000, 2200), res=0.88, dist=(4, 4.5))}, harmony=P)
    t.pattern('out', 8, {**drums(8), 'acid': acid(P), 'sub': sub_off(P), 'pad': held(P, VP), 'bell': bells(P, VP),
                         **knobs('acid', 8, cutoff=(2000, 320), res=(0.88, 0.7), dist=(4.5, 2.5))}, harmony=P)
    t.song('intro', 'main', 'b', 'brk', 'rise', 'drop', 'out', loop='main')
    t.main = ['drop']
    return t


TRACKS = [acid_rain(), resonance(), laser_wall(), molten_core(), ricochet(), lift_off()]

if __name__ == '__main__':
    main(TRACKS)
