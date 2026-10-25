"""Render a Wunioid music score (tools/music/songs/*.txt) to WAV and MP3, for Remastered mode (docs/music.md).

A small offline synth in the spirit of 1999 tracker music: 2-operator FM voices (the AdLib sound of the 1989
Revenge of Doh), band-limited saw / pulse voices with detune and a resonant low-pass, synthesized drums (the same
sample every hit, as a tracker's), echo and reverb sends, ducking by the kick, a master compressor and a soft
clipper. Deterministic: the same score gives the same file.

Score format (one statement per line; '#' at the start of a word starts a comment):
  tempo 128                                beats per minute
  steps 4                                  steps per beat (4: a step is a sixteenth); a bar is 4 beats
  ticks 6                                  arpeggio ticks per step (a tracker's speed)
  swing 0.15                               odd steps come this fraction of a step late
  echo time=3 feedback=0.35 tone=3500      ping-pong echo; time in steps, tone = low-pass of the repeats (Hz)
  reverb time=1.6 tone=6000 predelay=0.02  reverb; time = RT60 (s)
  master ratio=3 threshold=0.5 loud=0.85  bus compressor; loud = level into the soft clipper (higher = denser)
  inst <name> <type> key=value ...         an instrument (types and keys below)
  pattern <name> [bars]                    starts a pattern; its length defaults to the longest line
  <inst> <token> <token> ...               a line of the pattern, one token per step; lines for the same
                                           instrument are joined; a line shorter than the pattern repeats;
                                           an instrument without a line in a pattern is silent there
  <inst>.<key> <value|.> ...               knob automation (keys: AUTO below): a value sets the knob at that step,
                                           the knob moves linearly between values (cutoff: in octaves) across
                                           patterns, and holds after the last one; these lines don't repeat
  song <pattern>[+n|-n] ...                the order list; +n / -n transposes the pattern's notes (not drums)
  loop <index>                             the order the loop returns to (default 0)

Tokens: '.' holds the note, '-' releases it, '|' is ignored (bar lines), x*N repeats token x N times. A note is C4, F#3, Bb5 (C4 = middle C);
C4+E4+G4 is a chord; ^37 after a note is a tracker arpeggio (semitone offsets in hex, one per tick, cycled with
the note itself); :60 sets the velocity (0-99, default 80); ~ before a note glides into it from the previous one
without a new attack. Drum lines take the kit's letters, several at once (kh): k kick, s snare, g ghost snare, p clap,
h closed hat, o open hat, c crash, r ride, l / m / t low / mid / high tom; upper case = accent.

Instrument types: fm (sine carrier and modulator: ratio, index, isus, idecay, fb, cratio), saw, pulse (width;
pwm = depth and pwmrate = Hz of a width LFO), sync (a saw hard-synced to the note: sync = slave/master ratio,
plus syncenv at the attack, decaying with syncdecay; rendered 4x oversampled),
tri, sine, pluck (a Karplus-Strong string: bright = Hz of the pick, sustain = T60 in s; fixed pitch, no glide,
arpeggio or vibrato; with hpf, drive and cutoff it is a distorted guitar through a cabinet), drums (kit=electro
(808/909), hard (a distorted 909-like kick, crisp hats), rock, or break (a funk kit as sampled from vinyl for
drum'n'bass breaks); gain per letter: k=1 s=0.8 ...; drive = a saturation of the whole kit). Keys of all pitched types: gain, pan (-1..1), octave,
a d s r (attack, decay time constant, sustain level, release; s), voices, detune (cents, spread over the voices),
spread (stereo width of the voices), vib (cents), vibrate (Hz), vibdelay (s), glide (s), cutoff (Hz; 0 = no
filter), filter (lp2: 2-pole; ladder: 4-pole like the TB-303's, 24 dB/octave), res (0..1; a ladder
self-oscillates near 1), fenv (octaves of filter envelope at full velocity), fdecay (s), keytrack (0..1), hpf (Hz,
a high-pass before the drive), drive, level (gain after the drive and filter: gain sets how hard a driven
voice distorts, level how loud it is), dist (a distortion after the filter, as a pedal after a 303),
echo, reverb (send levels), duck (0..1, ducked by the kick), mono (1: a new note cuts the previous one), gate
(fraction of its last step a note sounds, 1 = legato; a 303 plays about 0.5), stack (semitones of extra voices
on every note, e.g. -12 for a sub-oscillator or -12,7; at stackgain), bend and bendtime (a pitch envelope:
semitones at the attack, decaying with this time constant; a hoover's swoop), chorus (mix of a Juno-like
stereo chorus: two delay lines swept in opposite phase).

Usage: uv run --with numpy --with scipy python tools/music/synth.py <song.txt> <out.wav> [--mp3 <out.mp3>]
           [--tempo BPM] [--song "A B B"] [--solo a,b] [--mute a,b] [--once] [--levels]
  Also writes <out>.json: {"sampleRate", "length", "loopStart", "loopEnd"} (samples). The loop region holds a
  second pass through the loop, so reverb and echo tails carry over the seam. --once (implied by --song)
  renders the order list once, without the second pass. --levels prints each instrument's level (dry, before
  the master) and the share of its energy per frequency band instead of rendering a file, for mixing by numbers.
"""
import argparse
import json
import re
import subprocess
import sys
import wave
from dataclasses import dataclass, field

import numpy as np
from scipy import signal

SR = 44100
PITCH_CLASSES = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
NOTE_RE = re.compile(r'([A-G])([#b]?)(-?\d)$')
DRUMS = 'ksgpohcrlmt'
DRUM_PAN = dict(k=0, s=0.05, g=0.1, p=-0.1, h=0.3, o=0.3, c=-0.25, r=-0.3, l=-0.35, m=0, t=0.35)
DRUM_GAIN = dict(k=1, s=0.8, g=0.3, p=0.7, h=0.35, o=0.35, c=0.45, r=0.3, l=0.7, m=0.7, t=0.7)
PITCHED = dict(gain=0.5, pan=0.0, octave=0, a=0.002, d=0.3, s=0.7, r=0.08, voices=1, detune=0.0, spread=0.5,
               vib=0.0, vibrate=5.5, vibdelay=0.25, glide=0.06, cutoff=0.0, res=0.0, fenv=0.0, fdecay=0.15,
               keytrack=0.0, drive=0.0, echo=0.0, reverb=0.0, duck=0.0, mono=1, width=0.5,
               ratio=1.0, index=1.0, isus=0.3, idecay=0.2, fb=0.0, cratio=1.0, bright=3000.0, sustain=3.0,
               hpf=0.0, level=1.0, filter='lp2', dist=0.0, gate=1.0, stack=0.0, stackgain=0.7, bend=0.0,
               bendtime=0.08, pwm=0.0, pwmrate=0.6, sync=1.0, syncenv=0.0, syncdecay=0.15, chorus=0.0)
AUTO = ('cutoff', 'res', 'fenv', 'fdecay', 'drive', 'dist', 'level', 'echo', 'reverb')
TYPES = ('fm', 'saw', 'pulse', 'tri', 'sine', 'sync', 'pluck', 'drums')


# --- Score ---------------------------------------------------------------------------------------------------

@dataclass
class Inst:
    name: str
    type: str
    p: dict


@dataclass
class Pattern:
    name: str
    bars: int | None
    lines: dict = field(default_factory=dict)   # inst name -> list of parsed tokens
    autos: dict = field(default_factory=dict)   # (inst name, key) -> list of values or None
    length: int = 0


@dataclass
class Song:
    tempo: float = 120
    steps: int = 4
    ticks: int = 6
    swing: float = 0.0
    fx: dict = field(default_factory=lambda: {'echo': {}, 'reverb': {}, 'master': {}})
    insts: dict = field(default_factory=dict)
    patterns: dict = field(default_factory=dict)
    order: list = field(default_factory=list)   # (pattern name, transpose)
    loop: int = 0


def pitch(s):
    m = NOTE_RE.match(s)
    if not m:
        raise ValueError(f'bad note {s!r}')
    return 12 * (int(m[3]) + 1) + PITCH_CLASSES[m[1]] + {'#': 1, 'b': -1, '': 0}[m[2]]


def parse_token(tok, drums):
    """None (hold), ('off',), ('note', pitches, vel, arp, glide) or ('drum', [(letter, accent)])."""
    if tok == '.':
        return None
    if tok == '-':
        return ('off',)
    if drums:
        if any(c.lower() not in DRUMS for c in tok):
            raise ValueError(f'bad drum token {tok!r}')
        return ('drum', [(c.lower(), c.isupper()) for c in tok])
    vel = 0.8
    if ':' in tok:
        tok, v = tok.split(':')
        vel = int(v) / 99
    arp = []
    if '^' in tok:
        tok, a = tok.split('^')
        arp = [int(c, 16) for c in a]
    glide = tok.startswith('~')
    return ('note', [pitch(p) for p in tok.lstrip('~').split('+')], vel, arp, glide)


def parse_value(v):
    try:
        return float(v)
    except ValueError:
        return v


def parse_song(text):
    song = Song()
    pat = None
    for no, raw in enumerate(text.splitlines(), 1):
        line = re.sub(r'(^|\s)#.*$', '', raw).replace('|', ' ').split()
        line = [t for tok in line for t in ([tok[:tok.rindex('*')]] * int(tok[tok.rindex('*') + 1:])
                                              if re.match(r'.+\*\d+$', tok) else [tok])]
        if not line:
            continue
        try:
            word, args = line[0], line[1:]
            if word in ('tempo', 'steps', 'ticks', 'loop', 'swing'):
                setattr(song, word, float(args[0]) if word in ('tempo', 'swing') else int(args[0]))
            elif word in song.fx:
                song.fx[word].update({k: float(v) for k, v in (a.split('=') for a in args)})
            elif word == 'inst':
                name, typ = args[0], args[1]
                if typ not in TYPES:
                    raise ValueError(f'unknown instrument type {typ!r}')
                p = dict(DRUM_GAIN, gain=0.8, echo=0.0, reverb=0.0, drive=0.0, kit='electro') if typ == 'drums' else dict(PITCHED)
                for a in args[2:]:
                    k, v = a.split('=')
                    if k not in p:
                        raise ValueError(f'unknown key {k!r} for {typ}')
                    p[k] = parse_value(v)
                song.insts[name] = Inst(name, typ, p)
            elif word == 'pattern':
                pat = Pattern(args[0], int(args[1]) if len(args) > 1 else None)
                song.patterns[pat.name] = pat
            elif word == 'song':
                for a in args:
                    m = re.match(r'(.+?)([+-]\d+)?$', a)
                    song.order.append((m[1], int(m[2] or 0)))
            elif '.' in word and word.split('.')[0] in song.insts:
                iname, key = word.split('.', 1)
                if key not in AUTO or song.insts[iname].type == 'drums':
                    raise ValueError(f'cannot automate {word!r} (keys: {", ".join(AUTO)})')
                if pat is None:
                    raise ValueError('line outside a pattern')
                pat.autos.setdefault((iname, key), []).extend(None if t == '.' else float(t) for t in args)
            elif word in song.insts:
                if pat is None:
                    raise ValueError('line outside a pattern')
                drums = song.insts[word].type == 'drums'
                pat.lines.setdefault(word, []).extend(parse_token(t, drums) for t in args)
            else:
                raise ValueError(f'unknown statement or instrument {word!r}')
        except (ValueError, IndexError, KeyError) as e:
            sys.exit(f'line {no}: {e}\n  {raw}')
    bar = 4 * song.steps
    for pat in song.patterns.values():
        pat.length = pat.bars * bar if pat.bars else max(len(t) for t in [*pat.lines.values(), *pat.autos.values()])
    for name, _ in song.order:
        if name not in song.patterns:
            sys.exit(f'song: unknown pattern {name!r}')
    return song


# --- Events ----------------------------------------------------------------------------------------------------

@dataclass
class Note:
    start: float            # s
    vel: float
    arp: list
    segs: list              # (time from start in s, pitches); later segments glide in
    end: float = 0.0        # gate end, s
    cut: float | None = None  # mono: the next note's start


def collect(song, order, step_dur):
    """Per instrument: the notes (pitched) or the hits [(time, letter, accent)] (drums); the automation points
    {(inst, key): [(time, value)]}; total length in s."""
    raw = {name: [] for name in song.insts}
    autos = {}
    pos = 0
    def when(step):
        return (step + (song.swing if step % 2 else 0)) * step_dur
    for name, transpose in order:
        pat = song.patterns[name]
        for key, vals in pat.autos.items():
            autos.setdefault(key, []).extend(((pos + i) * step_dur, v) for i, v in enumerate(vals) if v is not None)
        for iname in song.insts:
            toks = pat.lines.get(iname)
            if toks is None:
                raw[iname].append((pos, ('off',)))
                continue
            for i in range(pat.length):
                ev = toks[i % len(toks)]
                if ev and ev[0] == 'note' and transpose:
                    ev = (ev[0], [p + transpose for p in ev[1]], *ev[2:])
                if ev:
                    raw[iname].append((pos + i, ev))
        pos += pat.length
    total = pos * step_dur
    out = {}
    for iname, evs in raw.items():
        if song.insts[iname].type == 'drums':
            out[iname] = [(when(s), c, acc) for s, ev in evs if ev[0] == 'drum' for c, acc in ev[1]]
            continue
        notes, cur = [], None
        for s, ev in evs:
            t = when(s)
            if ev[0] == 'note' and ev[4] and cur:
                cur.segs.append((t - cur.start, ev[1]))
                continue
            if cur:
                cur.end = t
                cur = None
            if ev[0] == 'note':
                cur = Note(t, ev[2], ev[3], [(0.0, ev[1])])
                notes.append(cur)
        if cur:
            cur.end = total
        gate = song.insts[iname].p['gate']
        for note in notes:
            if gate < 1:
                note.end = max(note.start + 0.005, note.end - (1 - gate) * step_dur)
        for a, b in zip(notes, notes[1:]):
            a.cut = b.start
        out[iname] = notes
    return out, autos, total


# --- Voices ----------------------------------------------------------------------------------------------------

def blep(fr, dt):
    y = np.zeros_like(fr)
    m = fr < dt
    x = fr[m] / dt[m]
    y[m] = x + x - x * x - 1
    m = fr > 1 - dt
    x = (fr[m] - 1) / dt[m]
    y[m] = x * x + x + x + 1
    return y


def saw(phase, dt):
    fr = phase % 1.0
    return 2 * fr - 1 - blep(fr, dt)


def oscillator(typ, freq, p, t, vel, phase0):
    dt = freq / SR
    phase = phase0 + np.cumsum(dt) - dt[0]
    if typ == 'saw':
        return saw(phase, dt)
    if typ == 'pulse':
        width = p['width'] + p['pwm'] * np.sin(2 * np.pi * p['pwmrate'] * t) if p['pwm'] else p['width']
        return saw(phase, dt) - saw(phase + np.clip(width, 0.03, 0.97), dt)
    if typ == 'sync':
        over = 4
        f4 = np.repeat(freq, over)
        t4 = np.arange(len(f4)) / (SR * over)
        master = phase0 + np.cumsum(f4 / (SR * over))
        ratio = p['sync'] + p['syncenv'] * np.exp(-t4 / max(p['syncdecay'], 1e-4))
        slave = 2 * ((master % 1.0) * ratio % 1.0) - 1
        return signal.resample_poly(slave, 1, over)[:len(freq)]
    if typ == 'tri':
        return 4 * np.abs(phase % 1.0 - 0.5) - 1
    if typ == 'sine':
        return np.sin(2 * np.pi * phase)
    mph = 2 * np.pi * phase * p['ratio']
    mod = np.sin(mph + p['fb'] * np.sin(mph))
    index = p['index'] * (p['isus'] + (1 - p['isus']) * np.exp(-t / max(p['idecay'], 1e-4))) * (0.5 + 0.5 * vel)
    return np.sin(2 * np.pi * phase * p['cratio'] + index * mod)


def pluck(f0, L, vel, p, rng):
    """Karplus-Strong: a noise burst through a delay line with an averaging low-pass and an all-pass for the
    fractional part of the period."""
    period = SR / f0
    n = int(period - 1.1)
    d = period - 0.5 - n                     # all-pass delay, in [0.6, 1.6)
    c = (1 - d) / (1 + d)
    rho = 10 ** (-3 * period / SR / max(p['sustain'], 0.01))
    burst = rng.uniform(-1, 1, n + 1)
    burst = butter(burst, min(p['bright'] * (0.4 + 0.6 * vel), 0.45 * SR), 'lowpass', 1)
    x = np.zeros(L)
    x[:min(L, len(burst))] = burst[:L]
    a = np.zeros(n + 3)
    a[0], a[1] = 1.0, c
    a[n] -= rho * 0.5 * c
    a[n + 1] -= rho * 0.5 * (1 + c)
    a[n + 2] -= rho * 0.5
    return signal.lfilter([1.0, c], a, x)


def chorus(x, mix):
    """Juno-like chorus: the mono sum through two delay lines (3.5 ms +- 1.8 ms at 0.5 Hz, opposite phase)."""
    m = x.mean(axis=0)
    n = np.arange(len(m))
    out = x.copy()
    for c, sign in ((0, 1), (1, -1)):
        d = (0.0035 + sign * 0.0018 * np.sin(2 * np.pi * 0.5 * n / SR)) * SR
        out[c] += mix * np.interp(n - d, n, m, left=0)
    return out / (1 + mix * 0.5)


def adsr(t, gate, p):
    a, d, s, r = max(p['a'], 0.001), max(p['d'], 1e-4), p['s'], max(p['r'], 0.002)
    def level(x):
        return np.where(x < a, x / a, s + (1 - s) * np.exp(-(np.maximum(x, a) - a) / d))
    env = level(t)
    rel = t >= gate
    lg = float(level(np.array([gate]))[0])
    tr = t[rel] - gate
    env[rel] = lg * np.exp(-tr / (r / 4)) * np.clip(1 - tr / r, 0, 1)
    return env


def semitones(note, chord_index, t, p, tick):
    """The pitch curve of one chord voice: glides between segments, arpeggio, vibrato, octave."""
    def at(seg):
        ps = seg[1]
        return ps[min(chord_index, len(ps) - 1)]
    curve = np.full(len(t), float(at(note.segs[0])))
    for (t0, _), seg in zip(note.segs, note.segs[1:]):
        prev, new = curve[np.searchsorted(t, seg[0]) - 1] if seg[0] > 0 else curve[0], at(seg)
        m = t >= seg[0]
        k = np.clip((t[m] - seg[0]) / max(p['glide'], 1e-4), 0, 1)
        curve[m] = prev + (new - prev) * k
    if note.arp:
        offs = np.array([0] + note.arp)
        curve += offs[(t / tick).astype(int) % len(offs)]
    if p['bend']:
        curve += p['bend'] * np.exp(-t / max(p['bendtime'], 1e-4))
    if p['vib']:
        curve += p['vib'] / 100 * np.sin(2 * np.pi * p['vibrate'] * t) * np.clip((t - p['vibdelay']) / 0.2, 0, 1)
    return curve + 12 * p['octave']


def pan_gains(pan):
    a = (np.clip(pan, -1, 1) + 1) * np.pi / 4
    return np.sqrt(2) * np.cos(a), np.sqrt(2) * np.sin(a)


def render_pitched(inst, notes, n, tick, rng):
    p = inst.p
    out = np.zeros((2, n))
    voices = int(p['voices'])
    det = np.linspace(-p['detune'] / 2, p['detune'] / 2, voices) if voices > 1 else [0.0]
    stack = [float(v) for v in str(p['stack']).split(',') if float(v)]
    layers = [(0.0, 1.0)] + [(st, p['stackgain']) for st in stack]
    pans = np.linspace(-p['spread'], p['spread'], voices) + p['pan'] if voices > 1 else [p['pan']]
    for note in notes:
        i0 = int(round(note.start * SR))
        gate = note.end - note.start
        length = gate + p['r']
        if p['mono'] and note.cut is not None:
            length = min(length, note.cut - note.start + 0.004)
        L = min(int(length * SR), n - i0)
        if L <= 0:
            continue
        t = np.arange(L) / SR
        env = adsr(t, gate, p) * note.vel
        if p['mono'] and note.cut is not None and note.cut - note.start < gate + p['r']:
            env *= np.clip((note.cut - note.start + 0.004 - t) / 0.004, 0, 1)
        for ci, (st, lg) in ((ci, layer) for ci in range(len(note.segs[0][1])) for layer in layers):
            freq = 440 * 2 ** ((semitones(note, ci, t, p, tick) + st - 69) / 12)
            for v in range(voices):
                if inst.type == 'pluck':
                    w = pluck(freq[0] * 2 ** (det[v] / 1200), L, note.vel, p, rng) * env * lg
                    gl, gr = pan_gains(pans[v])
                    out[0, i0:i0 + L] += w * gl
                    out[1, i0:i0 + L] += w * gr
                    continue
                phase0 = rng.random() if voices > 1 else 0.0
                w = oscillator(inst.type, freq * 2 ** (det[v] / 1200), p, t, note.vel, phase0) * env * lg
                gl, gr = pan_gains(pans[v])
                out[0, i0:i0 + L] += w * gl
                out[1, i0:i0 + L] += w * gr
    out *= p['gain'] / np.sqrt(voices)
    return out


def knob(inst, key, autos, n):
    """The knob's value per sample: automated (linear; cutoff in octaves) or the instrument's setting."""
    pts = autos.get((inst.name, key))
    if not pts:
        return np.full(n, float(inst.p[key]))
    ts = np.array([0.0] + [t for t, _ in pts]) * SR
    vs = np.array([float(inst.p[key])] + [v for _, v in pts])
    if key == 'cutoff':
        return 2 ** np.interp(np.arange(n), ts, np.log2(np.maximum(vs, 1)))
    return np.interp(np.arange(n), ts, vs)


def cutoff_curve(inst, notes, n, autos):
    p = inst.p
    fc = knob(inst, 'cutoff', autos, n)
    fenv, fdecay = knob(inst, 'fenv', autos, n), knob(inst, 'fdecay', autos, n)
    for note, nxt in zip(notes, notes[1:] + [None]):
        i0 = int(round(note.start * SR))
        i1 = min(int(round(nxt.start * SR)) if nxt else n, n)
        if i1 <= i0:
            continue
        t = np.arange(i1 - i0) / SR
        key = p['keytrack'] * (note.segs[0][1][0] + 12 * p['octave'] - 60) / 12
        env = fenv[i0] * note.vel * np.exp(-t / max(fdecay[i0], 1e-4))
        fc[i0:i1] *= 2 ** (key + env)
    return fc


def lowpass(x, fc, res, block=64):
    """Resonant 2-pole low-pass (RBJ biquad) with the cutoff and resonance updated every block."""
    nb = -(-x.shape[1] // block)
    w0 = 2 * np.pi * np.clip(fc[::block][:nb], 20, 0.45 * SR) / SR
    q = 0.707 + 10 * np.clip(res[::block][:nb], 0, 1) ** 1.5
    alpha = np.sin(w0) / (2 * q)
    cw = np.cos(w0)
    a0 = 1 + alpha
    b0, b1, a1, a2 = (1 - cw) / 2 / a0, (1 - cw) / a0, -2 * cw / a0, (1 - alpha) / a0
    y = np.zeros_like(x)
    z = np.zeros((2, 2))
    for k in range(nb):
        s = slice(k * block, (k + 1) * block)
        if not x[:, s].any() and np.abs(z).max() < 1e-7:
            continue
        y[:, s], z = signal.lfilter([b0[k], b1[k], b0[k]], [1, a1[k], a2[k]], x[:, s], axis=-1, zi=z)
    return y


def ladder(x, fc, res, block=32):
    """4-pole ladder low-pass (24 dB/octave, resonance by negative feedback k = 4 res; self-oscillates at 1),
    the linear model H(s) = 1 / ((1 + s/wc)^4 + k) through the bilinear transform, run as two biquads with the
    cutoff and resonance updated every block. The passband loss of high resonance is made up by half."""
    nb = -(-x.shape[1] // block)
    f = np.clip(fc[::block][:nb], 20, 0.42 * SR)
    k = 3.98 * np.clip(res[::block][:nb], 0, 1)
    wc = 2 * SR * np.tan(np.pi * f / SR)
    ang = np.exp(1j * np.pi * np.array([1, 3]) / 4)
    sp = wc[:, None] * (-1 + k[:, None] ** 0.25 * ang[None, :])      # one pole of each conjugate pair
    zp = (1 + sp / (2 * SR)) / (1 - sp / (2 * SR))
    a1, a2 = -2 * zp.real, np.abs(zp) ** 2                               # (nb, 2) each
    g = (1 + a1 + a2) / 4                                                # unity DC gain per section
    comp = (1 + k) ** 0.5
    y = np.zeros_like(x)
    z = np.zeros((2, 2, 2))                                              # section, channel, state
    for b in range(nb):
        s = slice(b * block, (b + 1) * block)
        if not x[:, s].any() and np.abs(z).max() < 1e-7:
            continue
        v = x[:, s]
        for sec in range(2):
            v, z[sec] = signal.lfilter([g[b, sec], 2 * g[b, sec], g[b, sec]], [1, a1[b, sec], a2[b, sec]], v,
                                       axis=-1, zi=z[sec])
        y[:, s] = v * comp[b] / (1 + k[b])
    return y


def saturate(x, d):
    """tanh drive normalised to unity at full scale; d is a number or a per-sample array."""
    d = np.maximum(d, 1e-3)
    return np.tanh(d * x) / np.tanh(d)


# --- Drums -----------------------------------------------------------------------------------------------------

def butter(x, f, kind, order=2):
    return signal.sosfilt(signal.butter(order, f, kind, fs=SR, output='sos'), x)


def drum_kit(style='electro'):
    """The kit's samples: 'electro' (808/909-like), 'hard', 'rock' (tight, acoustic-like, for double kicks) or
    'break' (a dry funk kit, band-limited like a break sampled from vinyl); 'g' is a short ghost snare."""
    rng = np.random.default_rng(1999)
    def T(d):
        return np.arange(int(d * SR)) / SR
    def noise(d):
        return rng.uniform(-1, 1, int(d * SR))
    def metal(d):  # the 808's six square waves
        t = T(d)
        return sum(np.sign(np.sin(2 * np.pi * f * 1.7 * t)) for f in (205.3, 304.4, 369.6, 522.7, 540.0, 800.0)) / 6
    kit = {}
    t = T(0.45)
    f = 46 + 130 * np.exp(-t / 0.022) + 25 * np.exp(-t / 0.1)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.3)
    click = butter(noise(0.45), 2500, 'highpass') * np.exp(-t / 0.002) * 0.6
    kit['k'] = np.tanh(2.2 * (body + click))
    t = T(0.35)
    tone = (np.sin(2 * np.pi * np.cumsum(185 * (1 + 0.15 * np.exp(-t / 0.01))) / SR) * np.exp(-t / 0.06)
            + 0.5 * np.sin(2 * np.pi * 330 * t) * np.exp(-t / 0.04))
    rattle = butter(butter(noise(0.35), 1800, 'highpass'), 9000, 'lowpass') * np.exp(-t / 0.11)
    kit['s'] = np.tanh(1.6 * (0.6 * tone + 0.9 * rattle))
    t = T(0.4)
    bursts = sum(np.exp(-np.maximum(t - d, 0) / 0.004) * (t >= d) for d in (0, 0.011, 0.022))
    tail = np.exp(-np.maximum(t - 0.033, 0) / 0.12) * (t >= 0.033)
    kit['p'] = butter(noise(0.4), [900, 2600], 'bandpass') * (bursts + tail) * 2.0
    for c, d in (('h', 0.05), ('o', 0.45)):
        t = T(d)
        m = butter(0.7 * metal(d) + 0.5 * noise(d), [7000, 15000], 'bandpass')
        kit[c] = m * np.exp(-t / (0.03 if c == 'h' else 0.22)) * 2.5
    t = T(1.8)
    kit['c'] = butter(0.5 * metal(1.8) + noise(1.8), 4500, 'highpass') * np.exp(-t / 0.7) * 1.5
    t = T(1.0)
    kit['r'] = (butter(metal(1.0) + 0.3 * noise(1.0), 3500, 'highpass') * np.exp(-t / 0.45)
                + 0.3 * np.sin(2 * np.pi * 2400 * t) * np.exp(-t / 0.3))
    for c, base in (('l', 105), ('m', 150), ('t', 210)):
        t = T(0.5)
        f = base * (1 + 0.6 * np.exp(-t / 0.04))
        kit[c] = np.tanh(1.5 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.22))
    if style == 'hard':
        t = T(0.5)
        f = 50 + 190 * np.exp(-t / 0.018) + 40 * np.exp(-t / 0.07)
        body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.22)
        click = butter(noise(0.5), [1500, 6000], 'bandpass') * np.exp(-t / 0.0025) * 1.2
        kick = np.tanh(4.0 * (body + click))
        kit['k'] = butter(kick, 6000, 'lowpass') * np.minimum(1, np.exp(-(t - 0.25) / 0.06))
        t = T(0.45)
        bursts = sum(np.exp(-np.maximum(t - d, 0) / 0.005) * (t >= d) for d in (0, 0.009, 0.019, 0.027))
        tail = np.exp(-np.maximum(t - 0.035, 0) / 0.16) * (t >= 0.035)
        kit['p'] = np.tanh(1.5 * butter(noise(0.45), [800, 3800], 'bandpass') * (bursts + tail) * 2.5)
        for c, d, dec in (('h', 0.07, 0.022), ('o', 0.5, 0.17)):
            t = T(d)
            m = butter(0.8 * metal(d) + 0.6 * noise(d), 8000, 'highpass', 4)
            kit[c] = m * np.exp(-t / dec) * np.minimum(t / 0.0005, 1)
        t = T(0.9)
        kit['r'] = butter(metal(0.9) * 0.7 + 0.4 * noise(0.9), 5000, 'highpass') * np.exp(-t / 0.35)
    if style == 'rock':
        t = T(0.3)
        f = 52 + 95 * np.exp(-t / 0.012) + 20 * np.exp(-t / 0.06)
        body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.11)
        beater = butter(noise(0.3), [2500, 7000], 'bandpass') * np.exp(-t / 0.004) * 1.4
        kit['k'] = np.tanh(2.5 * (body + beater))
        t = T(0.45)
        tone = np.sin(2 * np.pi * np.cumsum(205 * (1 + 0.25 * np.exp(-t / 0.008))) / SR) * np.exp(-t / 0.07)
        wires = butter(butter(noise(0.45), 900, 'highpass'), 11000, 'lowpass') * np.exp(-t / 0.16)
        kit['s'] = np.tanh(2.0 * (0.7 * tone + 1.0 * wires))
        for c, d, dec in (('h', 0.09, 0.035), ('o', 0.6, 0.3)):
            t = T(d)
            kit[c] = butter(0.3 * metal(d) + noise(d), [5500, 16000], 'bandpass') * np.exp(-t / dec)
        t = T(2.5)
        kit['c'] = butter(0.3 * metal(2.5) + noise(2.5), 3000, 'highpass') * np.exp(-t / 1.0) * np.minimum(t / 0.002, 1)
        for c, base in (('l', 85), ('m', 120), ('t', 165)):
            t = T(0.7)
            f = base * (1 + 0.35 * np.exp(-t / 0.06))
            head = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.3)
            kit[c] = np.tanh(1.8 * (head + butter(noise(0.7), 3000, 'highpass')
                                    * np.exp(-t / 0.01) * 0.4))
    if style == 'break':
        t = T(0.25)
        f = 55 + 110 * np.exp(-t / 0.012) + 15 * np.exp(-t / 0.05)
        body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.09)
        beater = butter(noise(0.25), [1200, 5000], 'bandpass') * np.exp(-t / 0.003) * 1.6
        kit['k'] = np.tanh(3.0 * (body + beater))
        t = T(0.4)
        tone = (np.sin(2 * np.pi * np.cumsum(200 * (1 + 0.3 * np.exp(-t / 0.006))) / SR) * np.exp(-t / 0.05)
                + 0.4 * np.sin(2 * np.pi * 340 * t) * np.exp(-t / 0.03))
        crack = butter(noise(0.4), [2000, 8000], 'bandpass') * np.exp(-t / 0.004) * 1.5
        wires = butter(butter(noise(0.4), 1200, 'highpass'), 10000, 'lowpass') * np.exp(-t / 0.13)
        kit['s'] = np.tanh(3.0 * (0.8 * tone + crack + 1.1 * wires))
        for c, d, dec in (('h', 0.08, 0.02), ('o', 0.5, 0.18)):
            t = T(d)
            kit[c] = butter(0.25 * metal(d) + noise(d), [6000, 13000], 'bandpass') * np.exp(-t / dec)
        t = T(1.2)
        kit['r'] = (butter(0.6 * metal(1.2) + 0.3 * noise(1.2), 4000, 'highpass') * np.exp(-t / 0.5)
                    + 0.4 * np.sin(2 * np.pi * 3100 * t) * np.exp(-t / 0.35))
        for c in ('k', 's', 'h', 'o', 'r'):  # the vinyl's band
            kit[c] = butter(butter(kit[c], 11000, 'lowpass'), 35, 'highpass')
    t = np.arange(len(kit['s'])) / SR
    kit['g'] = kit['s'] * np.exp(-t / 0.05)
    for c in kit:
        kit[c] = kit[c] / np.abs(kit[c]).max()
        kit[c][-64:] *= np.linspace(1, 0, 64)
    return kit


def render_drums(inst, hits, n, kit):
    out = np.zeros((2, n))
    hats = sorted(t for t, c, _ in hits if c in 'ho')
    for t, c, accent in hits:
        smp = kit[c]
        i0 = int(round(t * SR))
        L = min(len(smp), n - i0)
        if c == 'o':  # the next hat chokes an open hat
            later = [h for h in hats if h > t + 1e-6]
            if later:
                L = min(L, int(round((later[0] - t) * SR)))
        if L <= 0:
            continue
        w = smp[:L] * (1.0 if accent else 0.72) * inst.p[c] * inst.p['gain']
        if L < len(smp):
            w = w * np.clip((L - np.arange(L)) / 200, 0, 1)
        gl, gr = pan_gains(DRUM_PAN[c])
        out[0, i0:i0 + L] += w * gl
        out[1, i0:i0 + L] += w * gr
    return out


def duck_curve(kicks, n, amount):
    s = np.zeros(n)
    L = int(0.35 * SR)
    shape = np.minimum(np.arange(L) / (0.004 * SR), 1) * np.exp(-np.arange(L) / (0.11 * SR))
    for t in kicks:
        i0 = int(round(t * SR))
        m = min(L, n - i0)
        if m > 0:
            s[i0:i0 + m] = np.maximum(s[i0:i0 + m], shape[:m])
    return 1 - amount * s


# --- Effects and master ----------------------------------------------------------------------------------------

def echo_bus(x, fx, step_dur):
    delay = fx.get('time', 3) * step_dur
    fb = fx.get('feedback', 0.35)
    reps = int(np.ceil(np.log(0.002) / np.log(fb)))
    ir = np.zeros((2, int(delay * SR * reps) + 1))
    for k in range(1, reps + 1):
        i = int(round(k * delay * SR))
        if i < ir.shape[1]:
            g = fb ** (k - 1)
            ir[(k + 1) % 2, i] += g
            ir[k % 2, i] += 0.3 * g
    mono = butter(x.mean(axis=0), fx.get('tone', 3500), 'lowpass')
    return np.stack([signal.oaconvolve(mono, ir[c])[:x.shape[1]] for c in (0, 1)])


def reverb_bus(x, fx):
    rng = np.random.default_rng(7)
    rt, tone = fx.get('time', 1.6), fx.get('tone', 6000)
    t = np.arange(int(rt * 1.3 * SR)) / SR
    pre = int(fx.get('predelay', 0.02) * SR)
    irs = []
    for _ in range(2):
        nz = rng.standard_normal(len(t))
        lo = butter(nz, tone, 'lowpass')
        ir = lo * np.exp(-6.91 * t / rt) + (nz - lo) * np.exp(-6.91 * t / (rt * 0.35))
        ir *= np.minimum(t / 0.008, 1)
        ir = np.concatenate([np.zeros(pre), ir])
        irs.append(ir / np.sqrt((ir ** 2).sum()))
    mono = butter(x.mean(axis=0), 200, 'highpass')
    return np.stack([signal.oaconvolve(mono, irs[c])[:x.shape[1]] for c in (0, 1)])


def master(x, fx):
    x = np.stack([butter(c, 25, 'highpass') for c in x])
    ratio, thr = fx.get('ratio', 3.0), fx.get('threshold', 0.5)
    x /= np.percentile(np.abs(x), 99.9) + 1e-9   # level the input so the threshold is relative
    block = 128
    nb = -(-x.shape[1] // block)
    peaks = np.pad(np.abs(x).max(axis=0), (0, nb * block - x.shape[1])).reshape(nb, block).max(axis=1)
    env = np.empty(nb)
    e = 0.0
    att, rel = np.exp(-block / (0.003 * SR)), np.exp(-block / (0.15 * SR))
    for k, pk in enumerate(peaks):
        e = att * e + (1 - att) * pk if pk > e else rel * e + (1 - rel) * pk
        env[k] = e
    gain = np.where(env > thr, (np.maximum(env, 1e-9) / thr) ** (1 / ratio - 1), 1.0)
    x *= np.interp(np.arange(x.shape[1]), np.arange(nb) * block + block / 2, gain)
    x /= np.percentile(np.abs(x), 99.95) / fx.get('loud', 0.85) + 1e-9
    a = np.abs(x)
    x = np.where(a <= 0.75, x, np.sign(x) * (0.75 + 0.25 * np.tanh((a - 0.75) / 0.25)))
    return x * 0.89


# --- Song ------------------------------------------------------------------------------------------------------

BANDS = ((20, 120), (120, 500), (500, 2000), (2000, 6000), (6000, 16000))


def band_split(x):
    """Percent of the energy in each of BANDS."""
    sp = np.abs(np.fft.rfft(x.mean(axis=0))) ** 2
    f = np.fft.rfftfreq(x.shape[1], 1 / SR)
    tot = sp.sum() + 1e-12
    return [100 * sp[(f >= lo) & (f < hi)].sum() / tot for lo, hi in BANDS]


def render(song, order, solo=(), mute=(), levels=None):
    step_dur = 60 / song.tempo / song.steps
    tick = step_dur / song.ticks
    events, autos, total = collect(song, order, step_dur)
    n = int(np.ceil(total * SR)) + int(2.5 * SR)
    rng = np.random.default_rng(42)
    kits = {}
    kicks = sorted(t for name, inst in song.insts.items() if inst.type == 'drums'
                   for t, c, _ in events[name] if c == 'k')
    dry, echo_send, reverb_send = (np.zeros((2, n)) for _ in range(3))
    for name, inst in song.insts.items():
        if (solo and name not in solo) or name in mute:
            continue
        if inst.type == 'drums':
            style = inst.p['kit']
            if style not in kits:
                kits[style] = drum_kit(style)
            x = render_drums(inst, events[name], n, kits[style])
            if inst.p['drive']:
                x = saturate(x, inst.p['drive'])
        else:
            x = render_pitched(inst, events[name], n, tick, rng)
            if inst.p['hpf']:
                x = np.stack([butter(c, inst.p['hpf'], 'highpass') for c in x])
            def automated(key):
                return (inst.name, key) in autos
            if inst.p['drive'] or automated('drive'):
                x = saturate(x, knob(inst, 'drive', autos, n))
            if inst.p['cutoff'] or automated('cutoff'):
                filt = ladder if inst.p['filter'] == 'ladder' else lowpass
                x = filt(x, cutoff_curve(inst, events[name], n, autos), knob(inst, 'res', autos, n))
            if inst.p['dist'] or automated('dist'):
                x = saturate(x, knob(inst, 'dist', autos, n))
            if inst.p['chorus']:
                x = chorus(x, inst.p['chorus'])
            if inst.p['duck']:
                x *= duck_curve(kicks, n, inst.p['duck'])
            x = x * (knob(inst, 'level', autos, n) if automated('level') else inst.p['level'])
        if levels is not None:
            levels[name] = x
        dry += x
        for key, send in (('echo', echo_send), ('reverb', reverb_send)):
            send += x * (knob(inst, key, autos, n) if (inst.name, key) in autos else inst.p[key])
    mix = dry
    if echo_send.any():
        mix = mix + echo_bus(echo_send, song.fx['echo'], step_dur)
    if reverb_send.any():
        mix = mix + reverb_bus(reverb_send, song.fx['reverb']) * 0.6
    return master(mix, song.fx['master']), step_dur


def write_wav(path, x):
    pcm = (np.clip(x, -1, 1).T * 32767).round().astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('song')
    ap.add_argument('out')
    ap.add_argument('--mp3')
    ap.add_argument('--tempo', type=float)
    ap.add_argument('--song', dest='order', help='order list to render once instead of the song line')
    ap.add_argument('--solo', default='')
    ap.add_argument('--mute', default='')
    ap.add_argument('--once', action='store_true')
    ap.add_argument('--levels', action='store_true', help="print each instrument's level and spectrum")
    args = ap.parse_args()
    with open(args.song) as f:
        song = parse_song(f.read())
    if args.tempo:
        song.tempo = args.tempo
    if args.order:
        song.order = [(m[1], int(m[2] or 0)) for m in (re.match(r'(.+?)([+-]\d+)?$', a) for a in args.order.split())]
        args.once = True
    solo, mute = set(filter(None, args.solo.split(','))), set(filter(None, args.mute.split(',')))
    lengths = [song.patterns[name].length for name, _ in song.order]
    if args.levels:
        levels = {}
        render(song, song.order, solo, mute, levels)
        mix = sum(levels.values())
        ref = np.sqrt((mix ** 2).mean())
        print('instrument   level (dB, mix = 0)  ' + '  '.join(f'{lo}-{hi}' for lo, hi in BANDS))
        for name, x in [('MIX', mix)] + list(levels.items()):
            db = 20 * np.log10(np.sqrt((x ** 2).mean()) / ref + 1e-12)
            print(f'{name:12s} {db:6.1f}               ' + '  '.join(f'{b:5.0f}%' for b in band_split(x)))
        return
    if args.once:
        x, step_dur = render(song, song.order, solo, mute)
        end = int(round(sum(lengths) * step_dur * SR))
        x = x[:, :end + int(2.0 * SR)]  # keep the tails
        info = dict(sampleRate=SR, length=x.shape[1], loopStart=0, loopEnd=end)
    else:
        x, step_dur = render(song, song.order + song.order[song.loop:], solo, mute)
        start = int(round(sum(lengths[:song.loop]) * step_dur * SR))
        end = int(round(sum(lengths) * step_dur * SR))
        x = np.concatenate([x[:, :start], x[:, end:end + end - start]], axis=1)
        info = dict(sampleRate=SR, length=x.shape[1], loopStart=start, loopEnd=end)
    write_wav(args.out, x)
    with open(re.sub(r'\.wav$', '', args.out) + '.json', 'w') as f:
        json.dump(info, f)
    if args.mp3:
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', args.out, '-codec:a', 'libmp3lame', '-q:a', '4',
                        args.mp3], check=True)
    print(f'{args.out}: {x.shape[1] / SR:.1f} s, loop {info["loopStart"] / SR:.2f}-{info["loopEnd"] / SR:.2f} s')


if __name__ == '__main__':
    main()
