# Music (Remastered only)

The original has no music. Remastered adds some (decision 14 in [PLAN.md](PLAN.md)):

- **Title / main menu:** an original track that nods to the title music of *Arkanoid: Revenge of Doh* (DOS, 1989).
- **Levels:** independent tracks in the style of 1999 game music (tracker era: FastTracker 2 / Impulse Tracker,
  sample-based drums, detuned saw and square leads, arpeggios, echo), track = (level − 1) mod N. **Session 13
  (user):** 20 full candidates, the user picks the best: (liquid) drum'n'bass and acid techno with the TB-303
  like `menu_acid1.txt`; N = the number picked. **Session 15 (user): 9 kept** (below), N = 9.
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
  - **The full version** (session 14, to judge by ear): `menu_full.txt`, written by `tools/music/gen_menu.py`
    (imports the sounds, the hook and the drum patterns from `gen_liquid.py`), 172 BPM, 128 bars, 2:59; the
    16-bar intro plays once (22 s), the loop returns to the first drop. Form: intro (pad swell, the harp opening
    up, the bell teasing the hook's first two bars; then hats on 1 and 3, the sub, the reese, the bell with the
    first half of the hook, the short roll) | A1 (= menu_liquid4's a1) A2 (+ bell doubling, flute counter-melody)
    | B1 B2: a **second harmony** Cm9 – F9 – B♭maj9 – E♭maj7♯11 – Am7♭5 – D7♭9 – Gm9 – D7♭9 (ii–V in B♭, then
    ii–V back to G minor), a **new melody** on the choir that carries the hook's opening cell (G A B♭ A G) through
    it, bell arpeggios, the two-step kick and the ride, a harmony voice and a second counter-melody, a tom fill
    | A3 (the hook answered by a new rising phrase) A4 (the hook embellished: pickups, a run instead of the held
    A, a lift at the end; harmony voice) | breakdown (8 bars bare, no drums or bass: the hook on the bell alone over the pad, the
    harp closing; 8 bars: hats on 1 and 3, the choir hook, the flute's counter, the reese opening, the roll)
    | D1 (everything, harp an octave up, harmony voice) D2 (embellished hook + counter) B3 (the new melody on a
    flute lead and the bell) B4 D3 (the answered hook) | outro (the kick and snare stop after four bars, the bell
    plays the hook's first half as in the intro, the roll into A1, so the loop seam sounds like the first drop).
    Levels in the drop (D1 D2): kick −7.7, snare −9.8, hats −20.3, sub −6.2, reese −8.7, pad −11.2, harp −17.2,
    choir −6.8, harmony −12.7, bell −19.2, flute (counter) −17 (−13.6 in A2); the flute lead in B3 −7.6.
- **The level tracks** (session 14: 20 candidates, mixed by numbers; **session 15, user: kept 03, 07, 09, 11, 12,
  14, 17, 19, 20**, the other eleven discarded). Scores `tools/music/songs/level_NN_<name>.txt` (the candidate
  numbers), written by `tools/music/gen_levels_dnb.py` and `gen_levels_acid.py`; original melodies, an intro
  played once, then a loop.
  - **Drum'n'bass** (96 bars, 2:11–2:14, intro 8 bars ≈ 11 s; one form: intro – a0 (groove) – hook A twice (+
    counter-melody) – harmony B with hook B twice (+ a harmony voice: the nearest chord tone 3–9 semitones below,
    `harmonize()`) – breakdown (no drums, the hook on the doubling voice; then hats, sub, the roll) – drop (the
    hook an octave up; the hook with a new ending) – B over a ride – out (the last bar without the kick, the roll
    into a0)): 03 *Brick Breaker* (D minor, 174: rolling acid DnB, a 303 in sixteenths with its knobs turning
    over the whole track, reese, the hard-sync lead with a square below, stabs), 07 *Dark Matter* (E Phrygian,
    172: techstep, a growling reese riff with filter and distortion sweeps, distorted 303 stabs, a hoover),
    09 *Capsule Rush* (B minor, 176: jungle flavour, chopped breaks, rolls and tom fills, 303 squelches, a square
    lead and chip arpeggios with tracker arps).
  - **Acid techno** (2:16–2:35, intro 8 bars without the kick ≈ 14 s, the kick where the loop starts; main 16 –
    B 16 – breakdown 8–16 – rise 8 – drop 16 – outro 8, which turns the knobs back to the loop start's values):
    11 *Acid Rain* (A minor, 135: a classic 303 line, hard 909 kit, B over Am–F–G–Em with stabs, the hard-sync
    lead (+ pulse an octave below) on a hook in the breakdown and drop), 12 *Resonance* (E minor, 138: two 303s
    interlocking, a low saw left and a high square right, claps, a hoover melody), 14 *Laser Wall* (D minor, 140:
    hard acid, straight-sixteenth 303, supersaw stabs, a hard-sync riff), 17 *Molten Core* (B♭ Phrygian, 134:
    dark, a droning 303 with distortion up to 9, a hoover, tom rolls), 19 *Ricochet* (C♯ minor, 141:
    FastTracker style, square chord arpeggios on tracker ticks, a square lead, a busy 303), 20 *Lift Off*
    (E major, 136: euphoric, supersaw pad, bell arpeggios, a climbing 303, a hard-sync melody).
  - In the acid tracks, one drum part carries clap, rolls, crash and toms, so the balance sets the rolls
    through the clap (the `s=`/`c=` gains in the generator's `KITS` set them apart).
  - Discarded (session 15): 01 Glass Horizon, 02 Velvet Orbit, 04 Deep Field, 05 Neon Rain, 06 Silver Ball,
    08 Afterglow, 10 Low Gravity, 13 Squelch Factory, 15 Warp Field, 16 Paddle Dance, 18 Chrome Circuit.
- **In the game** (session 15): `tools/music/export_music.py` renders the menu track and the level tracks to
  `game/public/music/*.mp3` (28 MB) and `music.json` (the playlist with each track's loop points, in samples).
  **Playlist order** (alternating drum'n'bass and acid; one list in the script): Brick Breaker, Acid Rain, Dark
  Matter, Resonance, Capsule Rush, Laser Wall, Molten Core, Ricochet, Lift Off; level n plays
  `levels[(n − 1) mod 9]`. `game/src/audio/music.ts` decodes one track at a time and loops it with an
  AudioBufferSourceNode between the loop points; the effects and the music share one AudioContext.
  - What plays (`main.ts`, `musicWanted`): Remastered only (Classic stays silent, as the original). The menu
    track on the title screen, in the menus, the editor and the high-score screens; in a game (or a test) the
    level's track, from its intro at every level start (also a new game); it fades out at "Well done" (2.5 s;
    it stays silent through "Course done") and at "Game over"; the pause menu holds it and Resume goes on
    where it stopped; P and a hidden page suspend the context (effects too). A new track fades the old one out
    (0.6 s). `World.levelStarts` (the remake's, counts StartLevel) restarts a level's track.
  - Volume: a **Music** selector in the title and pause menus, Off / Low / Medium / High (gains 0.12, 0.25,
    0.45 under the effects' 0.5; the tracks are about −11 dBFS RMS, the effects −15…−20 dBFS RMS: Medium puts
    the music about −12 dB under its master level), saved in the settings, Medium by default. To check by ear.
  - The MP3's encoder delay: Chrome decodes to exactly the rendered length (it reads the LAME gapless header);
    a decoder that leaves the delay in gives a longer buffer, and then the loop points move by the LAME delay
    (1105 samples).
  - Service worker: the music has its own cache (`wunioid-media-<hash>`), filled best effort on install and on
    a miss, so code updates don't download it again.
- **Punchy** (user, session 9), the menu track too: tight kick and snare, a prominent, compressed bass, the drums
  pushing the mix (a 1999 arrangement, not a straight AdLib cover).

## Tools (session 14)
- `tools/music/compose.py`: shared by the generators: chord symbols (`Gm9`, `F6/9`, `D7b9`, …) with voice
  leading (`lead()`: each voicing nearest the previous one, no minor seconds or close intervals low down), a
  melody notation with durations (`G5/4 A5/2 ~Bb5/2 -/4`), `half()`, `ramp()`/`hold()` for knobs, `Track`
  (a song as Python data → a score; drum lines layered with `'snare#t'`), a **harmony check** (notes on a beat a
  semitone above a chord tone, not in the chord, are reported; the original hook's G over D7♭9 is one, on
  purpose) and **mixing by numbers**: each instrument gets a target (dB relative to the mix), `--balance`
  renders the main sections and sets the levels (stored in `tools/music/levels.json`; linear because `level`
  sits after every nonlinearity; drum kits got a `level` key for that). Only the relative levels are set:
  targets that don't add up to the mix are all off by the same amount.

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
