"""Generates the drum'n'bass level tracks tools/music/songs/level_03,07,09_*.txt (docs/music.md; the user kept these
three of ten candidates, session 15; the acid techno tracks are gen_levels_acid.py's).

Every track has the same form: an intro (8 bars, played once: pad fading in, keys, hats on 1 and 3 in the second
half, the short roll on the last two beats), then the loop: a0 (the groove, no melody), a1 (hook A), a2 (+ the
counter-melody), b1 / b2 (the B harmony, hook B; b2 doubled a third below), brk1 (no drums: the hook on the
doubling voice), brk2 (hats, sub, the hook, the roll), d1 (the drop: hook doubled an octave up), d2 (the hook's
variation), e1 (B again, a ride), out (B, the last bar without the kick: the roll back into a0). 96 bars.
Melodies are written in sounding pitch (no instrument has an octave shift).

Usage: uv run --with numpy --with scipy python tools/music/gen_levels_dnb.py tools/music/songs [--balance] [files]
"""

from compose import NOTE_IN_TOKEN, Track, bars, chord, dshift, lead, main, midi, name, pcs, ramp, root, shift, steps, tr

# --- Sound palette (from the menu takes, tools/music/songs/) --------------------------------------------------

KICK_KIT = 'drums kit=break gain=0.6 k=1.3 g=0.3 drive=1.2 reverb=0.04'
SNARE_KIT = 'drums kit=break gain=0.8 s=1.0 reverb=0.22'
HATS_KIT = 'drums kit=break gain=0.45 h=1.0 o=0.7 r=0.6 reverb=0.12'
FX_KIT = 'drums kit=break gain=0.4 c=1.0 reverb=0.3'
SUB = 'sine a=0.004 d=0.6 s=0.9 r=0.08 glide=0.05 gain=0.5 duck=0.45'
PAD = 'saw voices=6 detune=24 spread=1.0 a=1.2 d=4 s=0.9 r=2.0 cutoff=1100 gain=0.25 reverb=0.6 chorus=0.3 mono=0'
BELL = 'fm ratio=3.5 index=1.2 isus=0 idecay=0.3 a=0.001 d=0.9 s=0 r=0.6 gain=0.1 echo=0.4 reverb=0.4 mono=0 pan=-0.3'
REESE = ('saw voices=2 detune=22 spread=0.3 filter=ladder cutoff=300 res=0.2 a=0.01 d=2 s=0.9 r=0.1 glide=0.06 '
         'dist=1.5 gain=0.5 level=0.7 duck=0.4')
ACID = ('saw filter=ladder cutoff=300 res=0.7 fenv=2.4 fdecay=0.16 a=0.002 d=0.4 s=0.8 r=0.015 glide=0.06 gate=0.55 '
        'dist=1.6 gain=0.55 level=0.7 echo=0.2 reverb=0.1 duck=0.25')
SYNC = ('sync sync=1.0 syncenv=3.0 syncdecay=0.2 voices=2 detune=12 spread=0.3 filter=ladder cutoff=2500 res=0.3 '
        'fenv=1.0 fdecay=0.2 a=0.001 d=0.8 s=0.85 r=0.1 glide=0.035 vib=15 vibdelay=0.25 dist=2.0 gain=0.5 level=1.4 '
        'echo=0.3 reverb=0.2')
BODY = ('pulse width=0.42 filter=ladder cutoff=1100 res=0.35 fenv=1.6 fdecay=0.25 a=0.002 d=0.6 s=0.8 r=0.1 '
        'glide=0.035 vib=15 vibdelay=0.25 dist=1.5 gain=0.5 level=0.8 echo=0.2 reverb=0.15')
HOOVER = ('saw voices=7 detune=50 spread=1.0 a=0.02 d=2 s=0.9 r=0.4 vib=10 glide=0.1 cutoff=2600 res=0.15 drive=2 '
          'gain=0.4 level=1.4 reverb=0.35 duck=0.4')
STAB = ('saw voices=3 detune=16 spread=0.5 a=0.002 d=0.08 s=0.0 r=0.05 cutoff=1200 res=0.4 fenv=2.4 fdecay=0.06 '
        'gain=0.7 echo=0.5 reverb=0.3 mono=0 pan=-0.2')
SQUARE = ('pulse width=0.25 a=0.002 d=0.3 s=0.7 r=0.08 cutoff=4200 res=0.1 vib=18 vibdelay=0.15 glide=0.03 gain=0.5 '
          'echo=0.3 reverb=0.2')
CHIP = ('pulse width=0.25 a=0.002 d=0.1 s=0.3 r=0.05 cutoff=2400 res=0.3 fenv=1.4 fdecay=0.06 gain=0.32 echo=0.45 '
        'reverb=0.2 pan=0.3')

# --- Drums (kit=break; one step = a sixteenth, patterns of one or two bars) -----------------------------------

KICK = {
    'two': 'K . . . . . . g . g K . . . . g | K . . g . . . g . . K . . . g .',
    'roll': 'K . . . . . . g . g K . . . . g | . . K g . . . g . g K . . . . .',
    'funk': 'K . . g . . g . . g K . . g . g | K . K . . . . g . g . K . . g .',
    'step': 'K . . . . . . . . . K . . . . . | K . . . . . . . . . K . . . . .',
    'dark': 'K . . . . . . . . . K . . . . . | . . K . . . . . . K . . . . . .',
    'soft': 'K . . . . . . g . . K . . . . . | K . . . . . . g . . . K . . . .',
    'jungle': 'K . g . . g K . . g K . . g . g | K . g K . g . g . g . K . g . .',
}
SNARE = '. . . . S . . . . . . . S . . .'
SNARE_FILL = '. . . . S . . s . S . s S s S S'          # the last bar of a section before a change
JUNGLE_SNARE = '. . . . S . . s . s . . S . . s | . . . . S . . s . . s . S . s .'
JUNGLE_FILL = '. s . . S . s s . S s . S s S S'
TOM_FILL = '. . . . S . . . l . l . m . t t'            # the electro kit's toms (the break kit has none)
HATS = {
    'shuffle': 'h . H h h . H . h . H h h . H h',
    'eighths': 'h . H . h . H . h . H . h . H h',
    'ride': 'r . h . r h h . r . h . r . h h',
    'open': 'h . o . h h o . h . o h h . o h',
    'busy': 'h h H h h h H h h h H h h H h H',
    'sparse': 'h . . . h . h . h . . . h . h .',
}
ON_BEAT = 'H . h h h . h . H . h h h . h .'       # accents on 1 and 3: without a kick, offbeat accents sound like the beat
ROLL_IN = '-/16 | -/8 s s s s S S S S'         # the short roll into a drop (user, session 13)


def tile(text, nbars):
    t = steps(text)
    n = nbars * 16
    return (t * (n // len(t) + 1))[:n]


def with_last(text, nbars, last):
    """The pattern tiled over nbars, its last bar replaced."""
    return tile(text, nbars - 1) + steps(last)


# --- Lines from a progression (one chord per bar) --------------------------------------------------------------

def pad(V, k=0):
    return [x for v in V for x in steps(f'{chord(v, k)}/16')]


def comp(V, style='rhodes'):
    """Keys comping: a sustained hit, a softer re-hit on 2-and, an anticipation."""
    pat = {'rhodes': '{c80}/6 - {c55}/4 - . . {c65} -',
           'sparse': '{c75}/12 - . . .',
           'pushes': '- . {c70}/4 - . {c55}/3 - {c75}/4'}[style]
    return [x for v in V for x in steps(pat.format(c80=chord(v, 0, 80), c55=chord(v, 0, 55), c65=chord(v, 0, 65),
                                                    c75=chord(v, 0, 75), c70=chord(v, 0, 70)))]


def arp16(V, k=12):
    out = []
    for v in V:
        up = [tr(x, k) for x in v] + [tr(x, k + 12) for x in v]
        out += up + up[::-1]
    return out


def arp8(V, k=12):
    out = []
    for v in V:
        a, b, c, d = (tr(x, k) for x in v[:4])
        out += steps(f'{a}/2 {c}/2 {b}/2 {d}/2 {c}/2 {b}/2 {d}/2 {tr(a, 12)}/2')
    return out


def sub_line(prog, octave=1):
    """Root, a push on 3-and with the kick, a slide up the octave into the next bar."""
    return [x for s in prog for x in steps(f'{root(s, octave)}/10 {root(s, octave)}/4 ~{root(s, octave + 1)}/2')]


def sub_held(prog, octave=1):
    return [x for s in prog for x in steps(f'{root(s, octave)}/16')]


def roots(prog, octave=1):
    return [x for s in prog for x in steps(f'{root(s, octave)}/16')]


def wobble(nbars, lo=250, hi=700):
    """The reese's filter opening and closing every bar."""
    return steps(' '.join([f'{lo} ./7 {hi} ./7'] * nbars)) + []


def stabs(V, k=0):
    out = []
    for v in V:
        out += steps(f'-/2 {chord(v, k, 85)} -/7 {chord(v, k, 70)} -/5')
    return out


def arpeggio(prog, octave=4):
    """Tracker arpeggios on each chord's root (^37 minor, ^47 major, ^57 sus), in sixteenths."""
    out = []
    for s in prog:
        q = '57' if 'sus' in s else '37' if ('m' in s.replace('maj', '')) else '47'
        r = root(s, octave)
        out += steps(f'{r}^{q}:80/2 {r}^{q}:50/2 {r}^{q}:70/2 -/2 {r}^{q}:80/2 -/2 {r}^{q}:60/2 {r}^{q}:45/2')
    return out


def harmonize(tokens, prog, lo=3, hi=9):
    """A second voice under a melody: each note's nearest chord tone (of the chord at that step) between lo and
    hi semitones below it."""
    out = []
    for i, t in enumerate(tokens):
        cs = pcs(prog[(i // 16) % len(prog)])

        def below(m):
            n = midi(m[1])
            return name(next(n - d for d in range(lo, hi + 1) if (n - d) % 12 in cs))
        out.append(NOTE_IN_TOKEN.sub(below, t) if NOTE_IN_TOKEN.search(t) else t)
    return out


# --- The common arrangement ------------------------------------------------------------------------------------

SECTIONS = [('intro', 'A'), ('a0', 'A'), ('a1', 'A'), ('a2', 'A'), ('b1', 'B'), ('b2', 'B'), ('brk1', 'A'),
            ('brk2', 'A'), ('d1', 'A'), ('d2', 'A'), ('e1', 'B'), ('out', 'B')]


def build(t, c):
    """c: progA/progB (8 chords), VA/VB (voicings), lead/double/counter (instrument names, double optional),
    hookA/hookA2/hookB/hookB2/counterA (8 bars each; hookA2 = hookA with a new ending), drums (kick, kickB,
    hats, hatsB, snare, fill), bed(kind, sec, prog, V) -> lines, extra(sec) -> lines (automation)."""
    H = {k: bars(c[k], 8) for k in ('hookA', 'hookB', 'counterA')}
    H['hookA2'] = bars(c.get('hookA2') or c['hookA'], 8)
    H['hookB2'] = bars(c.get('hookB2') or c['hookB'], 8)
    dblA = c.get('doubleA') or shift(H['hookA'], 12)
    dblA2 = c.get('doubleA2') or shift(H['hookA2'], 12)
    dblB = c.get('doubleB') or harmonize(H['hookB2'], c['progB'])
    L, D, C = c['lead'], c.get('double'), c['counter']
    snare, fill = c.get('snare', SNARE), c.get('fill', SNARE_FILL)
    kick, kickB = c['kick'], c.get('kickB', c['kick'])
    hats, hatsB = c['hats'], c.get('hatsB', c['hats'])
    for sec, part in SECTIONS:
        prog, V = (c['progA'], c['VA']) if part == 'A' else (c['progB'], c['VB'])
        kind = sec if sec in ('intro', 'brk1', 'brk2', 'out') else 'main'
        lines = {}
        # drums
        k = KICK[kickB if part == 'B' else kick]
        h = HATS[hatsB if part == 'B' else hats]
        if sec in ('a0', 'd1', 'b1'):
            lines['fx'] = 'c/128'
        if kind == 'main':
            lines['kick'] = tile(k, 8)
            lines['snare'] = with_last(snare, 8, fill) if sec in ('a2', 'b2', 'd2', 'e1') else tile(snare, 8)
            lines['hats'] = tile(HATS['ride'] if sec == 'e1' else h, 8)
        elif kind in ('intro', 'brk2'):
            lines['hats'] = '-/64 ' + ' '.join([ON_BEAT] * 4)
            lines['snare'] = '-/96 ' + ROLL_IN
        elif kind == 'out':
            lines['kick'] = tile(k, 7) + steps('-/16')
            lines['snare'] = tile(snare, 6) + steps(ROLL_IN)
            lines['hats'] = tile(h, 7) + steps(ON_BEAT)
        # melody
        if sec in ('a1', 'a2', 'brk2', 'd1'):
            lines[L] = H['hookA']
        if sec == 'd2':
            lines[L] = H['hookA2']
        if sec in ('b1', 'e1'):
            lines[L] = H['hookB']
        if sec in ('b2', 'out'):
            lines[L] = H['hookB2']
        if sec == 'brk1':
            lines[D or L] = dblA if D else H['hookA']
        if D and sec == 'd1':
            lines[D] = dblA
        if D and sec == 'd2':
            lines[D] = dblA2
        if D and sec in ('b2', 'out'):
            lines[D] = dblB
        if sec in ('a2', 'brk2', 'd1', 'd2'):
            lines[C] = bars(c['counterA'], 8)
        if sec == 'e1' and c.get('counterB'):
            lines[C] = bars(c['counterB'], 8)
        lines.update(c['bed'](kind, sec, prog, V))
        lines.update(c.get('extra', lambda s: {})(sec))
        t.pattern(sec, 8, lines, harmony=prog)
    t.song(*[s for s, _ in SECTIONS], loop='a0')
    t.main = ['d1', 'd2']


def track(no, slug, title, about, tempo, insts, swing=0.1, echo='time=3 feedback=0.45 tone=2500',
          reverb='time=3.2 tone=6000 predelay=0.03', **c):
    t = Track(f'level_{no:02d}_{slug}', title, about, tempo, swing=swing, echo=echo, reverb=reverb)
    t.inst('kick', KICK_KIT, mix=-8)
    t.inst('snare', SNARE_KIT, mix=-10)
    t.inst('hats', HATS_KIT, mix=-20)
    t.inst('fx', FX_KIT)
    for name_, (spec, mix, *at) in insts.items():
        t.inst(name_, spec, mix=mix, at=at[0] if at else None)
    c['VA'] = c.get('VA') or lead(c['progA'], c.get('vstart', 'Bb3'))
    c['VB'] = c.get('VB') or lead(c['progB'], c['VA'][-1][0])
    build(t, c)
    return t


def bed_liquid(keys='keys', tine=None, arp='harp', arp_k=12, arp_main=False, bass=None, bass_fn=None, pad_name='pad',
               reese_cut=(250, 700), extra=None):
    """The liquid bed: pad (fading in over the intro), keys comping, an arpeggio (intro and breakdown; also in
    the main sections with arp_main), sub (held in brk2), a bass voice in the main sections."""
    def bed(kind, sec, prog, V):
        L = {pad_name: pad(V)}
        if kind == 'intro':
            L[f'{pad_name}.level'] = ramp(0.1, 1, n=128)
        if keys and kind != 'brk1':
            L[keys] = comp(V, 'sparse' if kind == 'brk2' else 'rhodes')
            if tine:
                L[tine] = L[keys]
        if arp and (kind in ('intro', 'brk1', 'brk2') or arp_main):
            L[arp] = (arp16 if arp == 'harp' else arp8)(V, arp_k)
        if kind in ('main', 'out'):
            L['sub'] = sub_line(prog)
            if bass:
                L[bass] = bass_fn(prog) if bass_fn else roots(prog)
                if bass == 'reese':
                    L['reese.cutoff'] = wobble(8, *reese_cut)
        elif kind == 'brk2':
            L['sub'] = sub_held(prog)
        if extra:
            L.update(extra(kind, sec, prog, V))
        return L
    return bed


TRACKS = []

# --- 03 Brick Breaker ------------------------------------------------------------------------------------------
ACID_RIFF = ('D2:99 D2:50 D3:80 D2:50 F2:99 D2:50 C3:85 D2:50 A2:99 D2:50 D3:85 ~C3:70 D2:99 F2:55 G2:85 A2:70')


def acid_rolling(prog, key='D', base='Dm'):
    """The riff moved diatonically to each chord's root."""
    deg = {'D': 0, 'E': 1, 'F': 2, 'G': 3, 'A': 4, 'Bb': -2, 'C': -1}
    out = []
    for s in prog:
        r = root(s, 2)[:-1]
        out += dshift(steps(ACID_RIFF), deg[r], key, 'minor')
    return out


def acid_knobs(sec):
    cut = {'a0': (300, 500), 'a1': (500, 800), 'a2': (800, 1300, 700), 'b1': (700, 1500), 'b2': (1500, 2200, 900),
           'brk1': (900, 300), 'brk2': (300, 1800), 'd1': (2000, 2800), 'd2': (2800, 1200), 'e1': (1200, 900),
           'out': (900, 300), 'intro': (200, 300)}[sec]
    res = {'d1': (0.8, 0.88), 'd2': (0.88, 0.8), 'brk2': (0.7, 0.85)}.get(sec, (0.72, 0.72))
    dist = {'d1': (2.5, 3.5), 'd2': (3.5, 2.0)}.get(sec, (1.8, 1.8))
    return {'acid.cutoff': ramp(*cut, n=128), 'acid.res': ramp(*res, n=128), 'acid.dist': ramp(*dist, n=128)}


TRACKS.append(track(
    3, 'brick_breaker', 'Brick Breaker', 'Rolling acid drum\'n\'bass in D minor: a TB-303 rolling in sixteenths, '
    'its knobs turning over the whole track, a reese, the hook on the hard-sync lead.', 174,
    dict(sub=(SUB, -6), reese=(REESE, -10), acid=(ACID, -9), pad=(PAD, -12), stab=(STAB, -13),
         lead=(SYNC, -6.5), body=(BODY, -14)),
    key='D', mode='minor', vstart='A3', kick='two', kickB='roll', hats='eighths', hatsB='shuffle',
    progA=['Dm9', 'Dm9', 'Bbmaj9', 'C6', 'Dm9', 'Dm9', 'Gm9', 'A7sus4'],
    progB=['Bbmaj9', 'C6', 'Am7', 'Dm9', 'Gm9', 'C6', 'F6/9', 'A7sus4'],
    lead='lead', double='body', counter='stab',
    hookA='A5/3 A5/3 C6/2 D6/4 C6/2 A5/2 | G5/4 F5/4 E5/4 D5/4 | F5/3 F5/3 A5/2 Bb5/4 A5/2 F5/2 | G5/8 E5/4 C5/4 | '
          'A5/3 A5/3 C6/2 D6/4 E6/2 F6/2 | E6/4 D6/4 C6/4 A5/4 | Bb5/3 Bb5/3 A5/2 G5/4 F5/2 D5/2 | E5/6 G5/2 A5/8',
    hookA2='A5/3 A5/3 C6/2 D6/4 C6/2 A5/2 | G5/4 F5/4 E5/4 D5/4 | F5/3 F5/3 A5/2 Bb5/4 A5/2 F5/2 | G5/8 E5/4 C5/4 | '
           'D6/3 D6/3 F6/2 E6/4 D6/2 C6/2 | A5/8 -/4 G5/2 A5/2 | Bb5/4 D6/4 A5/4 G5/4 | A5/12 -/4',
    hookB='D6/8 C6/4 A5/4 | G5/8 E5/8 | E5/4 G5/4 A5/4 C6/4 | A5/12 -/4 | Bb5/8 A5/4 G5/4 | E5/8 G5/4 A5/4 | '
          'C6/8 A5/4 F5/4 | E5/8 D5/4 E5/4',
    doubleA=shift(bars('A5/3 A5/3 C6/2 D6/4 C6/2 A5/2 | G5/4 F5/4 E5/4 D5/4 | F5/3 F5/3 A5/2 Bb5/4 A5/2 F5/2 | '
                       'G5/8 E5/4 C5/4 | A5/3 A5/3 C6/2 D6/4 E6/2 F6/2 | E6/4 D6/4 C6/4 A5/4 | '
                       'Bb5/3 Bb5/3 A5/2 G5/4 F5/2 D5/2 | E5/6 G5/2 A5/8', 8), -12),
    doubleA2=shift(bars('A5/3 A5/3 C6/2 D6/4 C6/2 A5/2 | G5/4 F5/4 E5/4 D5/4 | F5/3 F5/3 A5/2 Bb5/4 A5/2 F5/2 | '
                        'G5/8 E5/4 C5/4 | D6/3 D6/3 F6/2 E6/4 D6/2 C6/2 | A5/8 -/4 G5/2 A5/2 | '
                        'Bb5/4 D6/4 A5/4 G5/4 | A5/12 -/4', 8), -12),
    counterA='-/128',
    bed=bed_liquid(keys=None, arp=None, bass='reese', reese_cut=(220, 600),
                   extra=lambda kind, sec, prog, V: {
                       'acid': acid_rolling(prog), **acid_knobs(sec),
                       **({'stab': stabs(V)} if kind == 'main' and sec != 'a0' else {}),
                       **({'acid.level': ramp(0.1, 0.7, n=128)} if sec == 'intro' else {})}),
))
# --- 07 Dark Matter --------------------------------------------------------------------------------------------


def reese_riff(prog):
    out = []
    for i in range(0, len(prog), 2):
        r = root(prog[i], 1)
        if r.startswith('E'):
            out += steps('E1/6 E1:70/2 G1/2 E1:60/2 F1/4 | E1/10 Bb1:70/2 A1:70/2 G1:70/2')
        else:
            out += steps(f'{r}/6 {r}:70/2 {tr(r, 7)}/2 {r}:60/2 {tr(r, 12)}/4 | {r}/12 {tr(r, -2)}:70/4')
    return out


def dark_knobs(sec):
    cut = {'intro': (150, 250), 'a0': (250, 500), 'a1': (400, 900), 'a2': (900, 400), 'b1': (300, 1100),
           'b2': (1100, 400), 'brk1': (200, 200), 'brk2': (200, 900), 'd1': (1200, 1600), 'd2': (1600, 600),
           'e1': (600, 1000), 'out': (1000, 250)}[sec]
    dist = {'d1': (3, 4.5), 'd2': (4.5, 3), 'b2': (2.5, 3.5)}.get(sec, (2.5, 2.5))
    return {'reese.cutoff': ramp(*cut, n=128), 'reese.dist': ramp(*dist, n=128),
            'zap.cutoff': ramp(*({'d1': (500, 1400), 'd2': (1400, 600)}.get(sec, (500, 500))), n=128)}


def zap_stabs(prog):
    out = []
    for s in prog:
        r = root(s, 3)
        out += steps(f'-/2 {r}:99 -/5 {r}:70 - {tr(r, 1)}:99 -/2 {r}:80 -/2')
    return out


TRACKS.append(track(
    7, 'dark_matter', 'Dark Matter', 'Dark techstep in E phrygian: a growling reese riff, distorted 303 stabs, a '
    'hoover moaning over a hard break.', 172,
    dict(sub=(SUB, -6.5), reese=(REESE.replace('voices=2', 'voices=3').replace('res=0.2', 'res=0.35'), -7),
         zap=(ACID.replace('dist=1.6', 'dist=4').replace('cutoff=300', 'cutoff=500').replace('res=0.7', 'res=0.85'),
              -12),
         hoover=(HOOVER, -7), pad=(PAD.replace('cutoff=1100', 'cutoff=800'), -12), bell=(BELL, -19)),
    key='E', mode='phrygian', vstart='G3', kick='step', kickB='dark', hats='sparse', hatsB='eighths',
    progA=['Em', 'Em', 'Em', 'F', 'Em', 'C', 'Dm', 'F'],
    progB=['Am', 'Am', 'F', 'F', 'G', 'G', 'F', 'F'],
    lead='hoover', double='bell', counter='zap',
    hookA='E5/16 | D5/8 E5/8 | G5/10 F5/6 | F5/8 E5/8 | B4/16 | C5/8 B4/8 | A4/8 D5/8 | C5/8 B4/4 A4/4',
    hookA2='E5/16 | D5/8 E5/8 | G5/10 F5/6 | F5/8 E5/8 | G5/16 | E5/8 G5/8 | F5/8 A5/8 | C6/8 B5/4 A5/4',
    hookB='A4/16 | C5/8 B4/8 | A4/16 | C5/8 -/8 | B4/16 | D5/8 B4/8 | A4/16 | F4/8 E4/8',
    counterA=zap_stabs(['Em', 'Em', 'Em', 'F', 'Em', 'C', 'Dm', 'F']),
    counterB=zap_stabs(['Am', 'Am', 'F', 'F', 'G', 'G', 'F', 'F']),
    snare='. . . . S . . . . . . . S . . .', fill=TOM_FILL,
    bed=lambda kind, sec, prog, V: {
        'pad': pad([v[:3] for v in V]), **({'pad.level': ramp(0.1, 1, n=128)} if kind == 'intro' else {}),
        **({'reese': reese_riff(prog), 'sub': roots(prog)} if kind in ('main', 'out', 'brk2') else {}),
        **({'reese': reese_riff(prog)} if kind == 'intro' else {}),
        **dark_knobs(sec)},
))

# --- 09 Capsule Rush -------------------------------------------------------------------------------------------
def acid_squelch(prog):
    """Squelches: short accented 303 hits, a slide between, rests."""
    out = []
    for i, s in enumerate(prog):
        r = root(s, 2)
        if i % 2 == 0:
            out += steps(f'{r}:99 -/2 {tr(r, 12)}:80 -/2 {r}:99 ~{tr(r, 7)}:70 -/4 {tr(r, 12)}:99 -/3')
        else:
            out += steps(f'-/2 {r}:99 {r}:60 -/4 {tr(r, 10)}:99 ~{tr(r, 12)}:80 -/2 {r}:99 -/3')
    return out


TRACKS.append(track(
    9, 'capsule_rush', 'Capsule Rush', 'Jungle-flavoured drum\'n\'bass in B minor: chopped breaks, snare rolls '
    'and toms, 303 squelches, a square lead with tracker arpeggios, FastTracker 2 style.', 176,
    dict(sub=(SUB, -6), reese=(REESE, -10), acid=(ACID.replace('res=0.7', 'res=0.85'), -11),
         lead=(SQUARE, -6.5), chip=(CHIP, -15), pad=(PAD, -13), bell=(BELL, -19)),
    key='B', mode='minor', vstart='A3', kick='jungle', hats='busy', hatsB='eighths',
    snare=JUNGLE_SNARE, fill=JUNGLE_FILL,
    progA=['Bm9', 'Bm9', 'Gmaj9', 'A6', 'Bm9', 'Bm9', 'Em9', 'F#7sus4'],
    progB=['Gmaj9', 'A6', 'F#m7', 'Bm9', 'Em9', 'A6', 'Dmaj9', 'F#7sus4'],
    lead='lead', double='bell', counter='chip',
    hookA='F#5/2 F#5/2 D5/2 F#5/2 A5/4 F#5/2 E5/2 | D5/4 C#5/4 B4/8 | B5/2 B5/2 G5/2 B5/2 D6/4 B5/2 A5/2 | '
          'F#5/4 E5/4 C#5/8 | F#5/2 F#5/2 D5/2 F#5/2 B5/4 A5/2 F#5/2 | A5/4 B5/4 C#6/8 | D6/4 B5/4 G5/4 E5/4 | '
          'F#5^57/16',
    hookA2='F#5/2 F#5/2 D5/2 F#5/2 A5/4 F#5/2 E5/2 | D5/4 C#5/4 B4/8 | B5/2 B5/2 G5/2 B5/2 D6/4 B5/2 A5/2 | '
           'F#5/4 E5/4 C#5/8 | B5/2 B5/2 A5/2 B5/2 D6/4 C#6/2 B5/2 | A5/4 F#5/4 B5^37/8 | '
           'G5/2 G5/2 B5/2 D6/2 E6/4 D6/2 B5/2 | C#6/8 B5^57/8',
    hookB='D6/4 B5/4 G5/2 A5/2 B5/4 | C#6/4 A5/4 E5/8 | A5^47/8 C#6/4 E6/4 | D6^47/12 -/4 | G5/4 B5/4 E6/8 | '
          'E6/4 C#6/4 A5/8 | F#5/4 A5/4 C#6/8 | B5/8 C#6/8',
    counterA=arpeggio(['Bm9', 'Bm9', 'Gmaj9', 'A6', 'Bm9', 'Bm9', 'Em9', 'F#7sus4']),
    counterB=arpeggio(['Gmaj9', 'A6', 'F#m7', 'Bm9', 'Em9', 'A6', 'Dmaj9', 'F#7sus4']),
    bed=bed_liquid(keys=None, arp='chip', arp_k=12, bass='reese', reese_cut=(250, 900),
                   extra=lambda kind, sec, prog, V: {
                       **({'acid': acid_squelch(prog)} if kind in ('main', 'out') else {}),
                       'acid.cutoff': ramp(*{'a0': (400, 700), 'a1': (700, 1000), 'a2': (1000, 1600, 800),
                                             'b1': (800, 1800), 'b2': (1800, 1000), 'd1': (1500, 2600),
                                             'd2': (2600, 1200), 'e1': (1200, 1600), 'out': (1600, 400)}.get(
                           sec, (400, 400)), n=128)}),
))
# jungle: tom fills at the ends of a2 and d2 on the snare line
for pname in ('a2', 'd2'):
    nb, lines = TRACKS[-1].patterns[pname]
    lines[:] = [(k, tile(JUNGLE_SNARE, 7) + steps(TOM_FILL) if k == 'snare' else v) for k, v in lines]


if __name__ == '__main__':
    main(TRACKS)
