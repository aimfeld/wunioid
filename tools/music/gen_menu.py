"""Generates tools/music/songs/menu_full.txt, the full version of the title / main menu track "Deep Water"
(docs/music.md): menu_liquid4.txt's sound and its nod to the Revenge of Doh title music (the hook note for note at
half time over the original's harmony, voiced Gm9 - F6/9 | Ebmaj9 - D7b9 | Gm9 - F6/9 | Ebmaj9 - F9), grown to
about three minutes: a 16-bar intro played once, then a loop with a second harmony (a ii-V in B-flat turning
back to G minor), a new melody over it, two variations of the hook, a harmony voice, two counter-melodies on a
flute, a breakdown and an outro that leads back into the first drop.

Usage: python3 tools/music/gen_menu.py tools/music/songs [--balance]   (see compose.py)
"""
import compose as c
from compose import Track, bars, chord, half, hold, lead, per_chord, ramp, root, steps, tr
from gen_liquid import (CRASH, H1, H2, HATS, HOOK, KICK, ON_BEAT, ROLL_IN, SNARE, SNARE_FILL, VERSIONS, VOX,
                        arp16)

DEEP = VERSIONS[3]['insts']   # "Deep Water": sub, pad, reese, harp, choir, bell (and the break kit)

# Harmony A: the original's, a chord per bar, voiced as in menu_liquid4 (VOX). Harmony B: new, a ii-V-I in B-flat
# to its IV, then ii-V into G minor (back to A).
A = ['Gm9', 'F6/9', 'Ebmaj9', 'D7b9', 'Gm9', 'F6/9', 'Ebmaj9', 'F9']
B = ['Cm9', 'F9', 'Bbmaj9', 'Ebmaj7#11', 'Am7b5', 'D7b9', 'Gm9', 'D7b9']
VA = VOX
VB = lead(B, start='Bb3')


def low(sym):
    """The bass note between D1 and C#2."""
    n = c.midi(root(sym, 1))
    return c.name(n + 12 if n < c.midi('D1') else n)


def sub_line(i, sym, v):   # root, a push on 3-and, a slide up the octave into the next bar (menu_liquid4)
    r = low(sym)
    return f'{r}/10 {r}/4 ~{tr(r, 12)}/2'


def prog_line(prog, voices, fn):
    return per_chord(range(len(prog)), lambda i, _: fn(i, prog[i], voices[i]))


def sub(prog, voices, held=False):
    return prog_line(prog, voices, (lambda i, s, v: f'{low(s)}/16') if held else sub_line)


def reese(prog, voices):
    return prog_line(prog, voices, lambda i, s, v: f'{low(s)}/16')


def pad(prog, voices):
    return prog_line(prog, voices, lambda i, s, v: f'{chord(v)}/16')


def harp(prog, voices, k=0):
    return prog_line(prog, voices, lambda i, s, v: ' '.join(arp16(k)(i, s, v).split()))


def bell_arp(prog, voices):   # eighths over the voicing, an octave up
    def f(i, s, v):
        a, b_, c_, d = (tr(x, 12) for x in v)
        return f'{a}/2 {c_}/2 {b_}/2 {d}/2 {c_}/2 {b_}/2 {d}/2 {tr(a, 12)}/2'
    return prog_line(prog, voices, f)


def wobble(lo, hi, nbars=8):   # the reese's filter opening and closing every bar
    return ' '.join([f'{lo} .*7 {hi} .*7'] * nbars)


# --- Melodies (written as the hook is: the choir sounds an octave lower, the bell and the flute as written) -----

# The hook at half time (gen_liquid.HOOK) and its two variations: HV1 answers the first half with a new, rising
# phrase; HV2 embellishes it (pickups, a run instead of the held A, a lift at the end).
HV1 = steps(f'{" ".join(half(H1 + " " + H2))} '
            '| D6/4 C6/2 Bb5/2 A5/4 Bb5/4 | C6/4 A5/4 G5/8 | Bb5/4 C6/2 D6/2 F6/4 D6/4 | Eb6/4 C6/4 A5/4 F5/4')
HV2 = steps('G5/4 A5/2 Bb5/2 A5/4 G5/2 Bb5/2 | A5/4 D6/4 C6/2 A5/2 G5/2 A5/2 | G5/4 A5/2 Bb5/2 A5/4 G5/4 '
            '| G5/4 F#5/4 G5/4 A5/2 Bb5/2 | G5/4 A5/2 Bb5/2 A5/4 G5/2 Bb5/2 | A5/4 D6/4 F6/4 E6/2 D6/2 '
            '| Bb5/4 C6/2 D6/2 C6/4 Bb5/4 | C6/4 F6/4 G6/2 F6/2 C6/4')
# A harmony voice under the hook (thirds and sixths below, chord tones), for choir2.
HOOK_HARM = steps('D5/4 F5/2 G5/2 F5/4 D5/4 | F5/4 A5/4 F5/8 | Eb5/4 F5/2 G5/2 F5/4 Eb5/4 | Eb5/4 D5/4 Eb5/4 F#5/4 '
                  '| D5/4 F5/2 G5/2 F5/4 D5/4 | F5/4 A5/4 F5/8 | G5/4 A5/2 Bb5/2 A5/4 G5/4 | A5/4 C6/4 A5/4 -/4')
# The B melody over harmony B: the hook's opening cell (G A Bb A G) carried through the ii-V, home at bar 7.
BMEL = steps('G5/4 A5/2 Bb5/2 C6/4 Bb5/4 | A5/4 C6/4 D6/8 | D6/4 C6/2 Bb5/2 A5/4 Bb5/4 | Bb5/4 G5/4 A5/8 '
             '| C6/4 D6/2 Eb6/2 D6/4 C6/4 | D6/6 C6/2 A5/4 F#5/4 | G5/4 A5/2 Bb5/2 A5/4 G5/4 | D6/4 C6/4 A5/4 F#5/4')
BMEL_HARM = steps('Eb5/4 F5/2 G5/2 A5/4 G5/4 | F5/4 A5/4 A5/8 | Bb5/4 A5/2 G5/2 F5/4 G5/4 | G5/4 Eb5/4 F5/8 '
                  '| Eb5/4 F5/2 G5/2 F5/4 Eb5/4 | A5/8 F#5/4 D5/4 | D5/4 F5/2 G5/2 F5/4 D5/4 | F#5/4 Eb5/4 C5/4 A4/4')
# Counter-melodies on the flute, in the gaps of the tune: C1 over harmony A, C2 over harmony B.
C1 = steps('-/16 | -/8 C6/2 D6/2 F6/2 G6/2 | G6/8 F6/4 D6/4 | Eb6/8 D6/4 C6/4 '
           '| Bb5/16 | -/8 A5/2 C6/2 D6/2 F6/2 | G6/12 F6/4 | Eb6/4 C6/4 A5/8')
C2 = steps('-/16 | -/8 G6/2 F6/2 Eb6/2 C6/2 | D6/16 | -/8 Bb5/2 D6/2 G6/4 '
           '| G6/8 Eb6/8 | -/8 F#6/2 Eb6/2 C6/2 A5/2 | D6/16 | -/8 A5/2 C6/2 Eb6/2 F#6/2')
TEASE = steps(' '.join(half(H1 + ' ' + H2)) + ' -/64')   # the first half of the hook, then rest

# --- Drums -------------------------------------------------------------------------------------------------------

def kick(style='roll', n=8):
    return bars(' '.join([KICK[style]] * (n // 2)), n)


def snare(fill=None, n=8):
    last = {'snare': SNARE_FILL.split('|')[1], 'toms': '. . . . S . . . . . . . S . . .', None: SNARE}[fill]
    return bars(' '.join([SNARE] * (n - 1) + [last]), n)


TOMS = '-/16*7 | -/8 m/2 m l/2 l l l'   # a tom fill on the last two beats of the 8th bar (the electro kit's toms)
ROLL = bars(ROLL_IN, 2)
MIX = dict(kick=-7.5, snare=-9.5, hats=-20, sub=-6, reese=-8.5, pad=-11, harp=-17, choir=-6.5, choir2=-12.5,
           bell=-19, flute=-13)


def make():
    t = Track('menu_full', 'Deep Water', 'The title / main menu track (full version): liquid drum\'n\'bass, a reese '
              'over a sine sub, a harp in sixteenths, the hook of the Revenge of Doh title music at half time on a soft '
              'choir lead.', 172, swing=0.1, echo='time=3 feedback=0.45 tone=2500',
              reverb='time=3.2 tone=6000 predelay=0.03', master='ratio=3 threshold=0.35 loud=1.0',
              comment='Form: intro (16 bars, once) | A1 A2 (hook) B1 B2 (harmony B, new melody) A3 A4 (hook variations) '
                      '| breakdown (16) | D1 D2 (drop, hook and variation) B3 B4 D3 | outro (back to A1). 128 bars.\n'
                      'Generated from tools/music/gen_menu.py; the sounds and the hook are menu_liquid4\'s (gen_liquid.py).')
    for k in ('kick', 'snare', 'hats', 'fx', 'sub', 'pad', 'reese', 'harp', 'choir'):
        t.inst(k, DEEP[k], mix=MIX.get(k))
    t.inst('choir2', DEEP['choir'] + ' pan=-0.25 vib=10', mix=MIX['choir2'])
    t.inst('bell', DEEP['bell'], mix=MIX['bell'])
    t.inst('flute', 'tri a=0.03 d=1 s=0.9 r=0.25 vib=14 vibrate=5 vibdelay=0.3 glide=0.04 cutoff=3500 gain=0.6 '
                    'echo=0.35 reverb=0.45 pan=0.3', mix=MIX['flute'], at='a2')
    t.inst('lflute', 'tri a=0.03 d=1 s=0.9 r=0.25 vib=14 vibrate=5 vibdelay=0.3 glide=0.04 cutoff=3500 gain=0.6 '
                     'echo=0.35 reverb=0.45 pan=0.1', mix=-7, at='b3')   # the flute as the lead (B3)

    def beat(kick_style='roll', hats='shuffle', fill=None, crash=True):
        return {'fx': CRASH if crash else None, 'kick': kick(kick_style), 'snare': snare(fill),
                'hats': bars(HATS[hats], 1)}

    def bed(prog, voices, k=0, held=False, wob=(250, 700)):   # sub, reese, pad, harp
        return {'sub': sub(prog, voices, held), 'reese': reese(prog, voices), 'reese.cutoff': steps(wobble(*wob)),
                'pad': pad(prog, voices), 'pad.level': hold(0.8, 128), 'harp': harp(prog, voices, k),
                'harp.cutoff': hold(9000, 128)}

    # Intro: the pad swells, the harp opens, the bell teases the hook; hats on 1 and 3, the sub and the reese,
    # the short roll into the drop.
    t.pattern('intro1', 8, {'pad': pad(A, VA), 'pad.level': ramp(0.1, 0.8, n=128), 'harp': harp(A, VA),
                            'harp.cutoff': ramp(600, 2500, n=128), 'bell': ['-'] * 64 + TEASE[:32] + ['-'] * 32}, harmony=A)
    t.pattern('intro2', 8, {'pad': pad(A, VA), 'pad.level': hold(0.8, 128), 'harp': harp(A, VA),
                            'harp.cutoff': ramp(2500, 9000, n=128), 'hats': bars(ON_BEAT, 1),
                            'sub': sub(A, VA, held=True), 'reese': reese(A, VA), 'reese.cutoff': ramp(150, 400, n=128),
                            'bell': TEASE, 'snare': ['.'] * 96 + ROLL}, harmony=A)
    # A1, A2: the hook (menu_liquid4's a1, a2), then the bell doubling it and the flute's first counter-melody.
    t.pattern('a1', 8, beat() | bed(A, VA) | {'choir': HOOK}, harmony=A)
    t.pattern('a2', 8, beat(crash=False, fill='snare') | bed(A, VA) | {'choir': HOOK, 'bell': HOOK, 'flute': C1},
              harmony=A)
    # B1, B2: harmony B, the two-step kick and the ride; the new melody, bell arpeggios, then a harmony voice and the
    # second counter-melody.
    t.pattern('b1', 8, beat('two', 'ride') | bed(B, VB) | {'choir': BMEL, 'bell': bell_arp(B, VB)}, harmony=B)
    t.pattern('b2', 8, beat('two', 'ride', fill='toms', crash=False) | bed(B, VB, wob=(300, 900))
              | {'choir': BMEL, 'choir2': BMEL_HARM, 'flute': C2, 'snare#t': steps(TOMS)}, harmony=B)
    # A3, A4: the hook answered by a new phrase (HV1), then the embellished hook (HV2) with the bell and the harmony.
    t.pattern('a3', 8, beat() | bed(A, VA, k=12) | {'choir': HV1, 'flute': C1}, harmony=A)
    t.pattern('a4', 8, beat(crash=False, fill='snare') | bed(A, VA, k=12, wob=(300, 900))
              | {'choir': HV2, 'bell': HV2, 'choir2': HOOK_HARM}, harmony=A)
    # Breakdown: no drums or bass; the hook bare on the bell over the pad and a darkening harp. Then the sub held, the
    # hats on 1 and 3, the choir and the flute's counter-melody, the reese opening, the roll.
    t.pattern('brk1', 8, {'pad': pad(A, VA), 'pad.level': hold(0.8, 128), 'harp': harp(A, VA),
                          'harp.cutoff': ramp(9000, 900, n=128), 'bell': HOOK}, harmony=A)
    t.pattern('brk2', 8, {'pad': pad(A, VA), 'pad.level': hold(0.8, 128), 'harp': harp(A, VA),
                          'harp.cutoff': ramp(900, 9000, n=128), 'sub': sub(A, VA, held=True), 'hats': bars(ON_BEAT, 1),
                          'reese': reese(A, VA), 'reese.cutoff': ramp(150, 700, n=128), 'choir': HOOK, 'flute': C1,
                          'snare': ['.'] * 96 + ROLL}, harmony=A)
    # The drop: everything, the harp an octave up, the harmony voice; then the embellished hook with the counter.
    t.pattern('d1', 8, beat() | bed(A, VA, k=12, wob=(300, 1000)) | {'choir': HOOK, 'choir2': HOOK_HARM, 'bell': HOOK},
              harmony=A)
    t.pattern('d2', 8, beat(crash=False, fill='snare') | bed(A, VA, k=12, wob=(300, 1000))
              | {'choir': HV2, 'bell': HV2, 'flute': C1}, harmony=A)
    # B3, B4: the new melody on the bell and the flute in octaves over the ride, the choir resting; then the choir
    # takes it back with the harmony voice.
    t.pattern('b3', 8, beat('two', 'ride') | bed(B, VB) | {'bell': BMEL, 'lflute': BMEL}, harmony=B)
    t.pattern('b4', 8, beat('two', 'ride', fill='toms', crash=False) | bed(B, VB, wob=(300, 900))
              | {'choir': BMEL, 'choir2': BMEL_HARM, 'flute': C2, 'bell': bell_arp(B, VB), 'snare#t': steps(TOMS)},
              harmony=B)
    # D3: the hook answered (HV1) with everything; the outro thins out (no kick or snare in the last four bars, the
    # bell plays the hook's first half as in the intro) and rolls into A1 like the intro does.
    t.pattern('d3', 8, beat() | bed(A, VA, k=12, wob=(300, 1000))
              | {'choir': HV1, 'choir2': HOOK_HARM[:64] + ['-'] * 64, 'bell': HV1, 'flute': ['-'] * 64 + C1[64:]},
              harmony=A)
    t.pattern('out', 8, {'kick': kick()[:64] + ['-'] * 64, 'snare': steps(SNARE) * 4 + ['.'] * 32 + ROLL,
                         'hats': bars(HATS['shuffle'], 1) * 4 + bars(ON_BEAT, 1) * 4,
                         'sub': sub(A, VA)[:64] + sub(A, VA, held=True)[64:], 'reese': reese(A, VA),
                         'reese.cutoff': ramp(700, 200, n=128), 'pad': pad(A, VA), 'pad.level': hold(0.8, 128),
                         'harp': harp(A, VA), 'harp.cutoff': ramp(9000, 2500, 9000, n=128), 'bell': TEASE},
              harmony=A)
    t.song('intro1', 'intro2', 'a1', 'a2', 'b1', 'b2', 'a3', 'a4', 'brk1', 'brk2', 'd1', 'd2', 'b3', 'b4', 'd3', 'out',
           loop='a1')
    t.main = ['d1', 'd2']
    return t


if __name__ == '__main__':
    c.main([make()])
