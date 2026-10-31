"""Shared helpers for the music generators (gen_menu.py, gen_levels_*.py; docs/music.md): notes, chord symbols
and voice leading, a melody notation with durations, a harmony check, Track (a song as Python data, written out
as a score for synth.py) and mixing by numbers (balance(): each instrument's level set so that it sits at a
target level in the mix, measured as synth.py --levels does).

Melody notation (steps()): words separated by spaces, '|' is ignored (bar lines).
  G5         a note for one step (a sixteenth at steps 4); G5/4 the note and three holds (a quarter)
  ~A5/2      glides into A5 (no new attack); G5:90 velocity (0-99); C4+Eb4+G4/8 a chord; A4^37 an arpeggio
  -/4        a rest of four steps; ./3 three holds
  x*N        repeats the word N times (G5/2*4 = four eighths)
Chord symbols (chord()): root + quality, e.g. Gm9, F6/9, Ebmaj9, D7b9, F9, Cm11, Bbadd9, Esus4, A7sus4, Bm7b5;
'/X' after a quality other than 6/9 is a bass note (C/E), used by the harmony check and root().

Automation (synth.py): a knob moves linearly from one value to the next, across patterns, starting from the
instrument's setting at 0:00. ramp() and hold() end on the last step so a knob doesn't drift towards the next
pattern's first value; give every pattern of the loop its own value for each automated knob.

Usage of a generator: python3 tools/music/gen_x.py <out dir> [--balance] [names...]; --balance renders the main
sections, sets the levels (stored in tools/music/levels.json, read on every run) and needs numpy and scipy:
  uv run --with numpy --with scipy python tools/music/gen_x.py tools/music/songs --balance
"""
import fcntl
import importlib.util
import json
import os
import re
import sys
import tempfile

NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
PC = {n: i for i, n in enumerate(NAMES)} | {'Db': 1, 'D#': 3, 'Gb': 6, 'G#': 8, 'A#': 10, 'Cb': 11, 'E#': 5,
                                           'Fb': 4, 'B#': 0}
HERE = os.path.dirname(os.path.abspath(__file__))
LEVELS = os.path.join(HERE, 'levels.json')


# --- Notes ---------------------------------------------------------------------------------------------------

def midi(n):
    name_, octv = (n[:2], n[2:]) if len(n) > 2 and n[1] in '#b' else (n[:1], n[1:])
    return 12 * (int(octv) + 1) + PC[name_]


def name(m):
    return f'{NAMES[m % 12]}{m // 12 - 1}'


def tr(n, k):
    return name(midi(n) + k)


NOTE_IN_TOKEN = re.compile(r'([A-G][#b]?-?\d)')


def shift(tokens, k):
    """Transposes every note in a list of step tokens by k semitones."""
    return [NOTE_IN_TOKEN.sub(lambda m: tr(m[1], k), t) for t in tokens]


SCALES = dict(major=[0, 2, 4, 5, 7, 9, 11], minor=[0, 2, 3, 5, 7, 8, 10], dorian=[0, 2, 3, 5, 7, 9, 10],
              phrygian=[0, 1, 3, 5, 7, 8, 10], mixolydian=[0, 2, 4, 5, 7, 9, 10], lydian=[0, 2, 4, 6, 7, 9, 11],
              harmonic=[0, 2, 3, 5, 7, 8, 11])


def dshift(tokens, deg, key, mode='minor'):
    """Transposes diatonically by deg scale steps in key (e.g. 'G') and mode; notes outside the scale move with
    their nearest scale note below."""
    pcs = [(PC[key] + i) % 12 for i in SCALES[mode]]

    def move(m):
        n = midi(m[1])
        below = next(n - d for d in range(12) if (n - d) % 12 in pcs)
        i = pcs.index(below % 12)
        octs, j = divmod(i + deg, 7)
        target = below - (pcs[i] - pcs[0]) % 12 + 12 * octs + (pcs[j] - pcs[0]) % 12
        return name(target + (n - below))
    return [NOTE_IN_TOKEN.sub(move, t) for t in tokens]


# --- Chords --------------------------------------------------------------------------------------------------

QUALITIES = {
    '': [0, 4, 7], 'm': [0, 3, 7], '5': [0, 7], 'dim': [0, 3, 6], 'aug': [0, 4, 8], 'sus2': [0, 2, 7],
    'sus4': [0, 5, 7], 'add9': [0, 4, 7, 14], 'madd9': [0, 3, 7, 14], '6': [0, 4, 7, 9], 'm6': [0, 3, 7, 9],
    '6/9': [0, 4, 7, 9, 14], 'm6/9': [0, 3, 7, 9, 14], '7': [0, 4, 7, 10], 'm7': [0, 3, 7, 10],
    'maj7': [0, 4, 7, 11], 'mmaj7': [0, 3, 7, 11], '7sus4': [0, 5, 7, 10], 'm7b5': [0, 3, 6, 10],
    'dim7': [0, 3, 6, 9], '9': [0, 4, 7, 10, 14], 'm9': [0, 3, 7, 10, 14], 'maj9': [0, 4, 7, 11, 14],
    '7b9': [0, 4, 7, 10, 13], '7#9': [0, 4, 7, 10, 15], '11': [0, 7, 10, 14, 17], 'm11': [0, 3, 7, 10, 14, 17],
    'maj7#11': [0, 4, 7, 11, 18], '13': [0, 4, 7, 10, 14, 21], 'm13': [0, 3, 7, 10, 14, 21], '9sus4': [0, 5, 7, 10, 14],
}
CHORD_RE = re.compile(r'([A-G][#b]?)(.*?)(?:/([A-G][#b]?))?$')


def parse_chord(sym):
    """(root pitch class, intervals, bass pitch class)."""
    if sym.endswith('6/9'):
        m = re.match(r'([A-G][#b]?)(m?6/9)$', sym)
        return PC[m[1]], QUALITIES[m[2]], PC[m[1]]
    m = CHORD_RE.match(sym)
    if not m or m[2] not in QUALITIES:
        raise ValueError(f'bad chord {sym!r}')
    return PC[m[1]], QUALITIES[m[2]], PC[m[3]] if m[3] else PC[m[1]]


def pcs(sym):
    r, iv, b = parse_chord(sym)
    return {(r + i) % 12 for i in iv} | {b}


def root(sym, octave=1):
    """The bass note of a chord symbol in the given octave (G1 for Gm9)."""
    return name(12 * (octave + 1) + parse_chord(sym)[2])


def tones(sym, n=4):
    """The chord's tones for an n-voice voicing, as intervals above the root: the root is left out of rich chords
    (rootless, the bass has it), then the fifth."""
    r, iv, _ = parse_chord(sym)
    iv = list(iv)
    if len(iv) > n and 0 in iv:
        iv.remove(0)
    if len(iv) > n and 7 in iv:
        iv.remove(7)
    while len(iv) > n:
        iv.pop(-1)
    return r, iv


def voicings(sym, lo, hi, n=4):
    """All close-ish voicings of the chord (each tone once, within an octave and a half) in [lo, hi]."""
    r, iv = tones(sym, n)
    out = []
    pcs_ = sorted({(r + i) % 12 for i in iv})
    for base in range(midi(lo), midi(hi) + 1):
        if base % 12 not in pcs_:
            continue
        v, cur = [base], base
        for _ in range(len(pcs_) - 1):
            cur = next(cur + d for d in range(1, 13) if (cur + d) % 12 in pcs_ and (cur + d) not in v
                       and (cur + d) % 12 not in [x % 12 for x in v])
            v.append(cur)
        if v[-1] <= midi(hi) and v[-1] - v[0] <= 18:
            out.append(v)
    return out


def rough(v):
    """A penalty for muddy voicings: minor seconds between neighbouring voices, close intervals low down."""
    pen = 0
    for a, b in zip(v, v[1:]):
        pen += 5 if b - a == 1 else 0
        pen += 3 if b - a <= 3 and a < 55 else 0
    return pen


def lead(prog, start='G3', lo=None, hi=None, n=4):
    """Voice leading: for each chord symbol the voicing nearest to the previous one (the first nearest to
    start). Returns lists of note names."""
    s = midi(start)
    lo = lo or name(s - 5)
    hi = hi or name(s + 19)
    prev, out = None, []
    for sym in prog:
        cands = voicings(sym, lo, hi, n)
        if not cands:
            raise ValueError(f'no voicing for {sym} in {lo}..{hi}')
        if prev is None:
            best = min(cands, key=lambda v: abs(v[0] - s) + rough(v))
        else:
            best = min(cands, key=lambda v: sum(abs(a - b) for a, b in zip(v, prev)) + abs(len(v) - len(prev))
                       + rough(v))
        prev = best
        out.append([name(m) for m in best])
    return out


def chord(notes, k=0, vel=None):
    """A chord token: notes joined with '+', transposed by k, with an optional velocity."""
    s = '+'.join(tr(n, k) for n in notes)
    return f'{s}:{vel}' if vel else s


# --- Melody notation -----------------------------------------------------------------------------------------

def steps(text):
    """The melody notation (module docstring) as step tokens for a score line."""
    if isinstance(text, list):
        return text
    out = []
    for w in text.replace('|', ' ').split():
        rep = 1
        m = re.match(r'(.+)\*(\d+)$', w)
        if m:
            w, rep = m[1], int(m[2])
        n = 1
        if '/' in w and not w.endswith('6/9'):
            w, ln = w.rsplit('/', 1)
            n = int(ln)
        out += ([w] + ['.'] * (n - 1)) * rep
    return out


def bars(text, n, steps_per_bar=16):
    t = steps(text)
    if len(t) != n * steps_per_bar:
        raise ValueError(f'{len(t)} steps, expected {n} bars = {n * steps_per_bar}: {" ".join(t)[:120]}')
    return t


def half(text):
    """Every step doubled: a melody at half time."""
    return [x for t in steps(text) for x in (t, '.')]


def ramp(*points, n):
    """An automation line of n steps through the values, evenly spaced; the last value at the last step (so the
    knob holds it into the next pattern instead of moving towards the next pattern's first value)."""
    out = ['.'] * n
    for i, v in enumerate(points):
        out[round(i * (n - 1) / max(1, len(points) - 1))] = f'{v:g}'
    return out


def hold(v, n):
    return ramp(v, v, n=n)


def per_chord(prog, fn, length=16):
    """Concatenates fn(i, sym) for each chord of a progression; fn returns notation for `length` steps."""
    out = []
    for i, sym in enumerate(prog):
        t = steps(fn(i, sym))
        if len(t) != length:
            raise ValueError(f'{sym}: {len(t)} steps, expected {length}')
        out += t
    return out


# --- Track ---------------------------------------------------------------------------------------------------

def parse_spec(spec):
    words = spec.split()
    return words[0], {k: v for k, v in (w.split('=') for w in words[1:])}


class Track:
    """A song as Python data. inst() adds an instrument (synth.py's 'inst' line without the name) with an optional
    mix target in dB; pattern() adds a pattern from a dict of lines ('lead': notation or tokens,
    'acid.cutoff': tokens) with an optional harmony for the check; song() sets the order and the loop."""

    def __init__(self, file, title, about, tempo, swing=0.0, echo='time=3 feedback=0.4 tone=3000',
                 reverb='time=2.5 tone=6000 predelay=0.03', master='ratio=3 threshold=0.35 loud=1.0', comment=''):
        self.file, self.title, self.about, self.tempo, self.swing = file, title, about, tempo, swing
        self.fx = dict(echo=echo, reverb=reverb, master=master)
        self.comment = comment
        self.insts, self.targets, self.measure = {}, {}, {}
        self.patterns, self.harmony = {}, {}
        self.order, self.loop = [], 0
        self.main = None
        self.trim = {}
        self.warnings = []

    def inst(self, name_, spec, mix=None, at=None):
        typ, p = parse_spec(spec)
        self.insts[name_] = (typ, p)
        if mix is not None:
            self.targets[name_] = mix
            if at:
                self.measure[name_] = at if isinstance(at, list) else [at]

    def pattern(self, name_, nbars, lines, harmony=None, per=16):
        n = nbars * 16
        out = []
        for key, val in lines.items():
            if val is None:
                continue
            iname = key.split('.')[0].split('#')[0]
            if iname not in self.insts:
                raise ValueError(f'{self.file}/{name_}: unknown instrument {iname!r}')
            toks = [str(t) for t in steps(val)]
            if '.' in key:
                if len(toks) > n:
                    raise ValueError(f'{self.file}/{name_}: {key} has {len(toks)} steps > {n}')
            elif n % len(toks):
                raise ValueError(f'{self.file}/{name_}: {key} has {len(toks)} steps, not a divisor of {n}')
            base = key.split('#')[0]
            prev = next((i for i, (k, _) in enumerate(out) if k == base), None)
            if '#' in key and prev is not None:   # 'snare#2': layered onto the snare's line (drums only)
                if self.insts[iname][0] != 'drums':
                    raise ValueError(f'{self.file}/{name_}: only drum lines can be layered ({key})')
                a = out[prev][1]
                m = max(len(a), len(toks))
                a, b = (a * (m // len(a)), toks * (m // len(toks)))
                toks = [''.join(x for x in (u, v) if x not in '.-') or '.' for u, v in zip(a, b)]
                out[prev] = (base, toks)
                continue
            out.append((base, toks))
        self.patterns[name_] = (nbars, out)
        if harmony:
            self.harmony[name_] = (harmony, per)
            self.check(name_)

    def song(self, *names, loop=0):
        self.order = list(names)
        self.loop = names.index(loop) if isinstance(loop, str) else loop

    # Harmony check: a note on a beat (or held over a chord change) a semitone above a chord tone, not in the
    # chord itself, is reported (minor ninths: G over F#, Eb over D in a minor chord, ...).
    def check(self, pname):
        nbars, lines = self.patterns[pname]
        prog, per = self.harmony[pname]
        n = nbars * 16
        for iname, toks in lines:
            if '.' in iname or self.insts[iname][0] == 'drums':
                continue
            full = (toks * (n // len(toks)))[:n]
            notes, cur = [], None
            for i, t in enumerate(full + ['-']):
                if t == '.':
                    continue
                if cur:
                    notes.append((cur[0], i, cur[1]))
                    cur = None
                if t != '-' and not t.startswith('~') and i < n:
                    cur = (i, [midi(m) for m in NOTE_IN_TOKEN.findall(t.split(':')[0].split('^')[0])])
                elif t.startswith('~') and i < n:
                    cur = (i, [midi(m) for m in NOTE_IN_TOKEN.findall(t)])
            for s, e, ps in notes:
                for ci in range(s // per, min((e - 1) // per, len(prog) * 99) + 1):
                    sym = prog[ci % len(prog)]
                    cs = pcs(sym)
                    cstart = ci * per
                    strong = (s % 4 == 0 and e - s >= 2) or (cstart > s and cstart < e and e - cstart >= 4)
                    if not strong:
                        continue
                    for p in ps:
                        if p % 12 not in cs and (p - 1) % 12 in cs:
                            self.warnings.append(f'{self.file} {pname} {iname}: {name(p)} over {sym} '
                                                 f'(bar {max(s, cstart) // 16 + 1}, step {max(s, cstart) % 16 + 1})')

    def spec(self, iname):
        typ, p = self.insts[iname]
        p = dict(p)
        t = self.trim.get(iname, 1.0)
        if t != 1.0:
            p['level'] = f'{float(p.get("level", 1.0)) * t:.3g}'
        return typ + ' ' + ' '.join(f'{k}={v}' for k, v in p.items())

    def score(self):
        out = [f'# Wunioid (Remastered): "{self.title}". {self.about}']
        out += [f'# {c}' for c in self.comment.splitlines() if c.strip()]
        out += [f'# Generated by tools/music/{os.path.basename(sys.argv[0])} (levels: tools/music/levels.json).',
                f'tempo {self.tempo:g}', 'steps 4', f'swing {self.swing:g}']
        out += [f'{k} {v}' for k, v in self.fx.items()] + ['']
        out += [f'inst {k} {self.spec(k)}' for k in self.insts]
        for pname, (nbars, lines) in self.patterns.items():
            out += ['', f'pattern {pname} {nbars}']
            for key, toks in lines:
                if '.' in key and key.split('.')[1] == 'level' and self.trim.get(key.split('.')[0], 1) != 1:
                    t = self.trim[key.split('.')[0]]
                    toks = [x if x == '.' else f'{float(x) * t:.3g}' for x in toks]
                out.append(f'{key:6s} ' + ' '.join(toks))
        out += ['', 'song ' + ' '.join(self.order), f'loop {self.loop}', '']
        return '\n'.join(out)

    def bars_of(self, names):
        return sum(self.patterns[p][0] for p in names)

    def duration(self):
        b = self.bars_of(self.order)
        return b * 240 / self.tempo, self.bars_of(self.order[:self.loop]) * 240 / self.tempo


# --- Mixing by numbers ---------------------------------------------------------------------------------------

def load_synth():
    spec = importlib.util.spec_from_file_location('synth', os.path.join(HERE, 'synth.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def balance(track, main):
    """Sets track.trim so that each instrument with a target sits at it (dB relative to the mix, RMS over the
    sections it is measured in, default `main`), as synth.py --levels measures. Levels are linear in the trims
    (level is applied after every nonlinearity), so one render per group of sections is enough."""
    import numpy as np
    synth = load_synth()
    track.trim = {}
    groups = {}
    for iname in track.targets:
        groups.setdefault(tuple(track.measure.get(iname, main)), []).append(iname)
    offset = None   # how far the main sections' targets are off as a whole (when they don't add up to the mix)
    for secs, names in sorted(groups.items(), key=lambda g: tuple(g[0]) != tuple(main)):
        song = synth.parse_song(track.score())
        levels = {}
        synth.render(song, [(s, 0) for s in secs], levels=levels)
        sig = {k: v for k, v in levels.items() if np.abs(v).max() > 1e-6}
        trims = {k: 1.0 for k in sig}
        on = [k for k in names if k in sig]
        if not on:
            continue
        for _ in range(40):
            mix = sum(trims[k] * sig[k] for k in sig)
            ref = np.sqrt((mix ** 2).mean())
            err = {k: track.targets[k] - 20 * np.log10(trims[k] * np.sqrt((sig[k] ** 2).mean()) / ref) for k in on}
            # The main sections: only the relative levels (the others stay put); elsewhere: the same offset.
            mean = sum(err.values()) / len(err) if offset is None else offset
            for k in on:
                trims[k] *= 10 ** ((err[k] - mean) / 20 * 0.7)
        if offset is None:
            g = np.exp(np.mean([np.log(trims[k]) for k in on]))
            for k in on:
                trims[k] /= g
            mix = sum(trims[k] * sig[k] for k in sig)
            ref = np.sqrt((mix ** 2).mean())
            offset = np.mean([track.targets[k] - 20 * np.log10(trims[k] * np.sqrt((sig[k] ** 2).mean()) / ref)
                              for k in on])
        for k in on:
            track.trim[k] = track.trim.get(k, 1.0) * trims[k]
        mix = sum(trims[k] * sig[k] for k in sig)
        ref = np.sqrt((mix ** 2).mean())
        print(f'  {track.file} [{" ".join(secs)}]: ' + ', '.join(
            f'{k} {20 * np.log10(trims[k] * np.sqrt((sig[k] ** 2).mean()) / ref):.1f}' for k in sig), flush=True)


def main(tracks, main_sections=lambda t: t.main):
    """The generator's command line: python3 gen_x.py <out dir> [--balance] [file names (without .txt)]."""
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    out_dir, pick = args[0], set(args[1:])
    stored = json.load(open(LEVELS)) if os.path.exists(LEVELS) else {}
    for t in tracks:
        if pick and t.file not in pick:
            continue
        if '--balance' in sys.argv:
            balance(t, main_sections(t))
            t.trim = {k: round(v, 4) for k, v in t.trim.items()}   # as stored, so a plain run writes the same score
            lock_path = os.path.join(tempfile.gettempdir(), 'wunioid-music-levels.lock')
            with open(lock_path, 'w') as lock:   # generators may balance in parallel
                fcntl.flock(lock, fcntl.LOCK_EX)
                stored = json.load(open(LEVELS)) if os.path.exists(LEVELS) else {}
                stored[t.file] = t.trim
                with open(LEVELS, 'w') as f:
                    json.dump(dict(sorted(stored.items())), f, indent=1)
        else:
            t.trim = stored.get(t.file, {})
        for w in t.warnings:
            print('  harmony:', w)
        path = os.path.join(out_dir, t.file + '.txt')
        with open(path, 'w') as f:
            f.write(t.score())
        total, intro = t.duration()
        print(f'{path}: {total:.0f} s, loop from {intro:.0f} s, "{t.title}"')
