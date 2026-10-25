# Music (Remastered only)

The original has no music. Remastered adds some (decision 14 in [PLAN.md](PLAN.md)):

- **Title / main menu:** an original track that nods to the title music of *Arkanoid: Revenge of Doh* (DOS, 1989).
- **Levels:** 6 independent tracks in the style of 1999 game music (tracker era: FastTracker 2 / Impulse Tracker,
  sample-based drums, detuned saw and square leads, arpeggios, echo; trance, techno, breakbeat, synth-pop),
  track = (level − 1) mod 6.
- **Menu track versions** to pick from (user, session 9; draft 1 was "too tame"), in `tools/music/songs/`:
  `menu_metal.txt` (140 BPM: double-tracked distorted guitars, gallops, double kicks, twin-lead harmony in
  thirds, the AdLib hook as the intro), `menu_techno.txt` (132 BPM: 909 drums, 303 acid line on Gm – F – E♭ – D,
  minor-seventh stabs, the hook on the FM lead and a hoover; the bare AdLib hook in the breakdown),
  `menu_synthpop.txt` (draft 1, 128 BPM, without B). All open the A part with the original's first bar.
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
