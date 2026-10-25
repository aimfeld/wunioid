# Music (Remastered only)

The original has no music. Remastered adds some (decision 14 in [PLAN.md](PLAN.md)):

- **Title / main menu:** an original track that nods to the title music of *Arkanoid: Revenge of Doh* (DOS, 1989).
- **Levels:** independent tracks in the style of 1999 game music (tracker era: FastTracker 2 / Impulse Tracker,
  sample-based drums, detuned saw and square leads, arpeggios, echo), track = (level − 1) mod N. **Session 13
  (user):** 20 full candidates, the user picks the best: (liquid) drum'n'bass and acid techno with the TB-303
  like `menu_acid1.txt`; N = the number picked.
- **Menu track versions** to pick from (user, session 9; draft 1 was "too tame"), in `tools/music/songs/`:
  `menu_metal.txt` (140 BPM: double-tracked distorted guitars, gallops, double kicks, twin-lead harmony in
  thirds, the AdLib hook as the intro), `menu_techno.txt` (132 BPM: 909 drums, 303 acid line on Gm – F – E♭ – D,
  minor-seventh stabs, the hook on the FM lead and a hoover; the bare AdLib hook in the breakdown),
  `menu_synthpop.txt` (draft 1, 128 BPM, without B). All open the A part with the original's first bar.
- **Style decision (user, session 9): TB-303-dominated acid techno** with knob turning (slow sweeps of cutoff,
  resonance, distortion over many bars) and heavy techno beats; techno was preferred over metal. Three takes on
  the melody to pick from: `menu_acid1.txt` "Acid Doh" (135 BPM, the 303 plays the hook as an acid bassline),
  `menu_acid2.txt` "Doh Sequencer" (138 BPM, two 303s: the original's bass figure and a looped cell of the hook;
  the full hook on the FM lead), `menu_acid3.txt` "Dark Doh" (130 BPM, Phrygian 303 drone, the hook mirrored
  around G on a second 303, the original hook bare in the breakdown and at half speed on a hoover in the drop).
- **The menu track: take 1, `menu_acid1.txt`** (user, session 9). Its lead went from the FM lead ("very lame")
  through SH-101, supersaw, hoover, PWM + chorus and 303 candidates to a **hard-sync lead** (swept at each note),
  doubled an octave below by an SH-101-like square for body ("still a bit soft" without it). The lead plays the
  hook **note for note** at the original octave, and the harmony is the original's (Gm – F | E♭ – D | Gm – F |
  E♭ – F, a chord every two beats; pad, stabs, sub). The 303 plays the **full four-bar hook** too (preferred over
  the two-bar acid figure). **Intro:** 8 bars without the kick (user: "a smoother buildup, without the bassdrum
  from the very start"): the 303 fades in closed (−24 dB to −13 dB), soft hats, a pad swell and a snare roll;
  the kick comes in at bar 9, where the loop starts, so the intro plays only once.
- **Drum'n'bass candidate** (user's idea, session 13; superseded by liquid): `menu_dnb.txt`, take 1 at 172 BPM over a
  two-step break (synth `kit=break`: a dry funk kit band-limited like a sampled break, ghost snares `g`, kit
  `drive`), a held sub on the chord roots, ride in the main and drop; the 303 line, lead, harmony and knob curves
  are take 1's. The hook stays one bar per bar (about 1.4× the original's speed); a half-time version (the hook
  over two bars, the break at full speed) is still to try.
- **Liquid drum'n'bass candidates** (user: "more chill d'n'b", session 13): `menu_liquid1..5.txt`, generated
  by `tools/music/gen_liquid.py` (regenerating overwrites all five), 172 BPM, the hook at half time (one hook bar
  over two bars of the break), the harmony voiced Gm9 – F6/9 | E♭maj9 – D7♭9 | Gm9 – F6/9 | E♭maj9 – F9 (a chord
  per bar), a soft two-step break (ghost snares, shuffled hats, reverb on the snare), a sub, long reverb. Form:
  intro (8 bars, played once) – a1 – a2 (+ counter-melody) – brk (no kick or snare) – b1 – b2 (+ harmony),
  48 bars, 67 s, loop from bar 9. With the TB-303 (user: keep it "in some versions"): 1 "Horizons" (Rhodes, pad,
  flute hook, bell arpeggio; take 1's 303 line at half time), 2 "Doh Strings" (strings and cellos on the hook,
  take 1's 303 line rolling in sixteenths with soft octave ghosts), 3 "Soft Acid" (the 303 plays the hook,
  Rhodes, vibraphone); without: 4 "Deep Water", 5 "Doh Funk" (guitar chops, FM bass with the original's octave
  jumps, electric-piano hook, brass stabs).
- **THE MENU TRACK: `menu_liquid4.txt` "Deep Water"** (user, session 13: liked best of the five, and kept over
  the livelier leads tried for it). A reese bass (two detuned saws, ladder filter opening and closing every
  bar) over a sine sub (root, a push on 3-and, a slide up the octave into the next bar), a pad, a harp in
  sixteenths up and down two octaves of each voicing, the hook on a soft choir lead (detuned saws, low-passed,
  slow attack, vibrato, chorus; an octave below the original), a bell doubling the hook from a2, the harp an
  octave up in b2. Drums: kit=break `roll` pattern (bar 2 has no kick on the downbeat; the user doesn't mind
  that one).
  - Its lead was first judged "too tame"; a hard-sync lead with a square below, a Minimoog-style lead and a
    singing synth guitar were tried and dropped ("stick with menu_liquid4").
  - **The roll into the melody** (user: "the rapid (snare?) onset seems to enter on the wrong beat"): without a
    kick, hats accented on the offbeat eighths were heard as the beat, and a roll from beat 3 of bar 7 then
    sounded displaced. Now the hats in the intro and the breakdown are accented on 1 and 3, and of four rolls
    (two bars from the downbeat; one bar of sixteenths; the last two beats; backbeat and toms) the user chose
    **only the last two beats**, four soft and four accented sixteenths (`ROLL_IN` in the generator).
  - **Still to do:** the full version (see PLAN).
- **Punchy** (user, session 9), the menu track too: tight kick and snare, a prominent, compressed bass, the drums
  pushing the mix (a 1999 arrangement, not a straight AdLib cover).

## Approach (agreed with the user, session 9)
- Songs are text scores (tracker-like patterns) in `tools/music/`, rendered by a Python synth (2-operator FM
  voices for the AdLib sound, saw/pulse voices with filter, synthesized drums, echo/reverb) to WAV, then MP3 with
  ffmpeg (MP3 because Safari decodes Ogg unreliably, as in Dark Planet).
- The game decodes the current track into a Web Audio buffer and loops it with exact `loopStart`/`loopEnd`
  (an `<audio loop>` would click or leave a gap: MP3 encoder delay and padding). One track decoded at a time.
- One track first (the menu track plus the shared sound palette), refined with the user by ear, then the rest.

## Reference: the Revenge of Doh title music (DOS)
Source: https://www.youtube.com/watch?v=6lUJseWHcSI ("DOS Game: Arkanoid - Revenge of DOH", DOSBox recording,
AdLib). The title music runs from 0:03.5 to about 0:27.5 (user: "starts at 0:03 and stops around 0:30"); from
0:27.6 a different piece follows (a D pedal with a chromatic melody, to 0:39). Transcribed by spectral analysis
(sixteenth-note grid, `numpy`; throwaway scripts, not in the repo) and to be confirmed by ear (render:
see PLAN).

- **120 BPM**, 4/4, **G minor**. 12 bars: A (1–4), B (5–8), A (9–12).
- **Bass:** one chord every 2 beats, **Gm – F | E♭ – D** (i – ♭VII – ♭VI – V), the last bar of A ending
  E♭ – F instead. G and F are held, E♭ and D jump octaves in eighths (E♭2 E♭3 …, D with a grace note from C♯).
- **Hook (A, the melody to nod to)**, sixteenths in brackets (8 = eighth, 16 = sixteenth, 4 = quarter):
  ```
  bar 1  G5:8 A5:16 Bb5:16  A5:8 G5:8   A5:8 D6:8   A5:4
  bar 2  G5:8 A5:16 Bb5:16  A5:8 G5:8   G5:8 F#5:8  G5:8 A5:8
  bar 3  = bar 1
  bar 4  Bb5:8 C6:16 D6:16  C6:8 Bb5:8  C6:8 F6:8   C6:4      (bar 1 a third higher)
  ```
  Confirmed by the user by ear (session 9: "the transcription matches").
- **B** (bars 5–8; bars 7–8 repeat 5–6; it also returns at 0:27.6 before the music stops): same bass, louder,
  held chords (F major over G – F, B♭ over E♭, D major over D). The melody is the "end of the melody, a segment
  which repeats once" (user) and is **not transcribed yet**: its attacks are weak and sit around A4–B♭4, inside
  the accompaniment, and neither a harmonic-sum pitch estimate nor per-pitch onsets separate it reliably
  (both work on A). Session 9: four candidate lines rendered for the user (scratchpad, not in the repo); a
  coordinate search over the lead line against the original's spectrum converged on repeated sixteenths on
  A4 / C5 (over G – F) and D4 (over E♭ – D): probably a pulsing accompaniment in the original that the
  reference lacks, not the melody (Inferred). None matched (user); **decision (user, session 9): leave B
  out**, the nod uses the hook only.
- AdLib FM timbres: a bright, slightly metallic lead (strong modulator at ratio 1), a plucked bass.

**The nod, not a quote:** the tune is Taito's and the remake is public. Keep the hook's rhythm
(eighth, two sixteenths, eighth, …), the opening contour G–A–B♭–A–G, the descending i–♭VII–♭VI–V bass with
octave jumps and an AdLib-like FM lead; the rest of the melody and the arrangement are new.
