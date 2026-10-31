# Plan & progress

## Goals (from the user)
1. Restore and remaster *Wunioid* (1999) in the same way as *Dark Planet Remastered*
   (`../dark-planet`, https://aimfeld.github.io/dark-planet/).
2. Runs in the browser as a GitHub page; maybe also on itch.io. No Steam release.
3. A faithful **Classic** mode and a **Remastered** mode, switchable at any time.

## Architecture (confirmed by the user, session 1)
- **The Dark Planet stack**: TypeScript + Vite + PixiJS 8 (WebGL) + Web Audio + Vitest, Python asset tools under
  `tools/` (stdlib, or `uv run --with …`), a GitHub Action deploying to GitHub Pages, installable PWA. The same
  `dist/` zipped is an itch.io HTML5 upload. Input, fullscreen, gamepad, touch, SFX and deployment code can be
  carried over from Dark Planet.
- **One simulation, two renderers.** A deterministic port of the original's game logic on a fixed tick, shared by
  both modes so they play the same.
  - *Classic*: the original 640×480 picture (to be confirmed) with the original sprites and sounds, scaled to the
    window.
  - *Remastered*: the same state at native resolution and refresh rate, interpolated between ticks, with
    upscaled or re-rendered graphics and effects (particles, glow). Same sounds.
- **Controls**: the original has keyboard and joystick only. The remake adds mouse (pointer lock), touch buttons
  (◀ ▶ left, Fire right; decision 8) and gamepad. The tall playfield suits phones held upright.

## Phases
### Phase 0: Investigation & setup ✅ (sessions 1–2, 2026-10-24)
- [x] Inventory (`docs/inventory.md`): Delphi 3 + DelphiX, no source; ~53 game procedures; 65 images, 19 sounds,
  32 levels, 2 courses, high scores.
- [x] Original files moved into `original_source/` (unchanged).
- [x] `tools/delphi_dfm.py` (Delphi form stream parser) and `tools/extract_assets.py` (PNG, WAV, level renders,
  `assets.json` → `original_source/extracted/`).
- [x] Level, course and high-score formats: first pass in session 1, verified against the code in session 2
  (`docs/file-formats.md`).
- [x] REA/Ghidra analysis of `WUNIOID.EXE` (snapshot in `.rea/`).
- [x] Wine 9.0 installed by the user. The game starts but needs a fullscreen mode change that fails on this
  multi-monitor desktop, and quits inside a Wine virtual desktop.
- [–] ~~Run the original in a virtual X server (Xvfb + xdotool) for captures and scripted input~~: deferred
  (user, session 1); work from the code first and come back to it only if really necessary. The user can play
  the original with plain `wine WUNIOID.EXE` (fullscreen).
- [x] Git repository, public GitHub repo `aimfeld/wunioid` (session 1), `README.md`.
- [–] ~~Get the DelphiX source~~: not needed (session 2). The DelphiX routines the game calls were named from
  their code and the VMTs (`docs/re-notes.md`).

### Phase 1: Reverse-engineer the gameplay 🔄 (session 2, 2026-10-24)
- [x] Name the game's procedures: classes and virtual overrides from the VMTs (`tools/delphi_rtti.py`),
  published methods from the method tables, the rest from what they do. Ghidra headless dump of all 105 game
  functions (`tools/ghidra_dump.sh`). Table in `docs/re-notes.md`.
- [x] Game loop and timing: frame-locked, `SpriteEngine.Move(20)` every tick, `LagCount` unused; DXTimer 22 ms
  (≈ 45.45 ticks/s nominal), Flip with vsync; 640×480×16, playfield frame at 0, 0, HUD text at x 500.
- [x] Paddle: input bits, 6 px/tick, kinds (80/120/40 px, gun), glue 800, gun 500, shots, cooldown 15.
- [x] Ball: speed 3.0 (×2 px), angle maths and quirks (`norm`, `reflect`, paddle offset ×2, clamp 20…160),
  walls, stone bounce with corner and neighbour tests, Bubbler speed-up, piercing, mega ball, multiball limit 30.
- [x] Stones: hits, counting stones, Granit, Block, Bubbler, Eater, Doubler, BeBack, Goldie, Killer, gems;
  Bonus, Move, Hike, Iron; shatter animation. **Correction:** kind 1 is GemRed (extractor fixed).
- [x] Capsules: drop tables per gem colour, all 16 effects and durations.
- [x] Lives, scoring, level end, course end, game over, banners and sounds.
- [x] High scores, course files (`docs/file-formats.md`). Editors: only the state machine and menus so far;
  the level editor's mouse handling (DrawMouseDown 0x41aad4) is left for Phase 4 (done in session 10).
- [x] `docs/gameplay-spec.md`, `docs/file-formats.md`, `docs/re-notes.md`.
- [x] Decided (user, session 2): fixed tick 1000/22 ≈ 45.45 Hz; blocking banners and the "Well done" phase
  run at the tick rate too (decisions 6 and 7).
- [ ] Check the spec against the original running in Wine (played by the user): `FPS:` value, `Level: 0` on the
  first level, the ball after piercing ends, Hike/Move/Goldie behaviour, the 170°–190° angle guard. The remake can
  now be played side by side for this.

### Phase 2: Engine + Classic mode 🔄 (session 3, 2026-10-24)
- [x] Scaffold `game/` (Vite + TypeScript + PixiJS + Vitest, Dark Planet's versions). `tools/export_game_data.py`
  → `game/public/data/` (PNG with alpha from the 16-bit colour key, the WAVs, the raw `.lev`/`.cse`/`scr` files,
  `data.json`; committed like Dark Planet's data). Fixed 22 ms tick in `src/main.ts`.
- [x] Simulation `src/sim/`: a procedure-by-procedure port (`sprites.ts` = TPaddle/TBall/TStone/…, `world.ts` =
  TForm1: engine list, grid, Collisions, PlayTick, states). Delphi Random, 6-byte Real, Round half-even, NormAngle.
  PlayTick is a generator: the blocking banners and "Well done" run one loop iteration per tick (decision 7).
  31 tests (`npm test`), including an autopilot run through the default course.
- [x] Classic renderer `src/render/classicView.ts` (640×480 canvas drawn like DelphiX, PixiJS integer scale), HUD,
  banners; sounds `src/audio/sfx.ts` (each play a new voice, as the original).
- [x] Courses and high scores: course game, Game ▸ New / Pause, Level ▸ Test, Course ▸ Load / Editor, the name
  prompt and the course editor dialog (view only until Phase 4). High scores in `localStorage`, starting
  from the 2011 tables. The name prompt (both modes) is filled with the last name entered, kept in
  `wunioid.settings` (user; a remake convenience, the original's InputBox default is not verified).
- [x] Input: the original keys, gamepad, mouse and touch (target steering at the paddle's 6 px/tick, see open
  question 1); F fullscreen, P pause, F2 new game. PWA: manifest, icons (`tools/export_icons.py`), service worker.
- [x] `tools/screenshot.mjs`: dev server + headless Chrome, runs steps in the page and saves the picture or the window.
- [x] Deploy to GitHub Pages (session 3): https://aimfeld.github.io/wunioid/. Pages builds from GitHub Actions; the
  `github-pages` environment only accepts `production`. `bin/deploy.sh` tests, builds and pushes `main` to
  `production` (as Dark Planet).
- [x] Tried on desktop and a phone by the user (session 4): plays and feels like the original, but steering by
  dragging is too hard on a phone.
- [x] Touch buttons (session 4, decision 8): `src/input/touch.ts` after Dark Planet's. ◀ ▶ bottom left, Fire bottom
  right, fullscreen (where the browser has it); the left half of the window is the arrow pad (split where ◀ and ▶
  meet, the thumb slides between them), the right half Fire. The picture moves beside the buttons in landscape,
  above them in portrait. Shown on a coarse-pointer device and after a touch, hidden after a mouse click. Touch
  dragging removed (`pointer.ts` → `mouse.ts`, mouse only). `tools/screenshot.mjs` takes `SIZE=WxH TOUCH=1`.
- [x] Auto-update of the installed app (session 4, as Dark Planet's `registerOffline`): a start from the cache asks
  the server first and reloads into a new version ("Loading update…"); the app asks again when it comes back to the
  screen and hourly, and reloads once a new version has taken over and the game has no progress (first level, score
  0, no dialog), at the latest when the next game starts. The touch fullscreen button is hidden in the installed app
  (fullscreen already). Checked against `vite preview` in headless Chrome.
- [x] Manifest `id` `"./"` → `"/wunioid/"` (session 4): an `id` resolves against the start URL's *origin*, so
  `"./"` was `https://aimfeld.github.io/`, the same as Dark Planet's; Android Chrome took Wunioid for the
  installed Dark Planet ("already installed", then "Could not open app"). Confirmed: installs as its own app (user).
- [x] iPhone fixes (session 4, user report): two quick taps on Fire zoomed the page and threw the layout off
  screen; `touch.ts` cancels `touchend` document-wide, except in the menus and dialogs (they need the click), as
  Dark Planet's fix. No sound on the iPhone: likely the silent switch, which mutes Web Audio in iOS's "ambient"
  session (Dark Planet escapes it through its music element); `sfx.ts` asks for `navigator.audioSession.type =
  'playback'` (Safari 16.4+) and also resumes from iOS's "interrupted" state. Confirmed on the iPhone: sounds
  play, no zoom on a double tap (user).
- [x] Phone portrait layout (session 5, decision 10): portrait is the default orientation (manifest, and the touch
  fullscreen button locks it where the browser can). In a portrait window with the touch buttons, Classic shows
  only the playfield (`Rahmen`'s 428 px, full width) under a HUD strip (`Lifes` left, `Score` centre, `Level`
  right, no FPS); a landscape window keeps the whole 640 × 480 picture beside the buttons.
  Always scaled to the full width (an integer scale left black bars at the sides at 2.625 dpr). Confirmed on the
  user's phone.
- [ ] Try the touch buttons on a phone; try a gamepad.
- [ ] Open questions for the user: (1) mouse: steer at the paddle's own speed (now) or move the paddle
  straight to the pointer? (2) the menu bar: always there (faded until hovered, now) or hidden in fullscreen?
  (3) the HUD font (MS Sans Serif 12 pt is approximated with Arial).

### Phase 3: Remastered mode 🔄 (session 6, 2026-10-24)
Remastered is the default (user, session 6). First version in place; needs the user's eye and a real device.
- [x] Graphics (decision 11): upscaling compared first (Lanczos, hq4x, xBR: the 30 x 15 pre-rendered 3D sprites
  only get blurry), then **re-rendered**: `tools/remaster_render.py` (`npm run remaster`) ray-traces height fields
  (bevelled octagon stones, drum capsules, spheres, the paddle's gold cage over its light bar, the gun paddle's
  glass dome, the shot rocket) at 4x with 4 x 4 supersampling, colours sampled from the originals, every animation
  with the original's frames and meaning (gem glint of bonus stones, rolling capsule labels, the piercing ball's
  colour cycle, Killer's colour cycle, Bubbler's water, Eater / Doubler clouds). The playfield frame is re-rendered
  in white marble; the 9 background tiles are upscaled (Lanczos, wrapped, sharpened). Out: two 2048² WebP atlas
  pages, `frame.webp`, `sprites.json` in `game/public/remaster/` (committed like `data/`). Not re-rendered:
  the shatter animations (particles instead), the editor's labels and palette (the originals, smoothly scaled,
  until Phase 4).
- [x] Banners re-rendered like the originals (user, session 8: closer to the original's lava text and wave):
  `tools/remaster_banners.py`, after Dark Planet's `tools/menu_items.py`: Comic Neue Bold (letter-spaced like
  Comic Sans), flat faces extruded 6 px deep (user: flat letters, deeper relief), soft lava blobs in the originals'
  colours, a depth wave running down the text in perspective, its direction, length (56 px), amplitude (3 px) and
  phase fitted to the originals' motion. At 3x (not 4x) and 12 frames per loop (the original has 8), to keep the
  atlas at 5 pages (2.2 MB; it was 10 at 4x / 16 frames); `sprites.json` gets a `scales` entry for them. The view picks the frame from the sprite's
  animation position plus the sub-tick part, so the wave runs smoothly; pop-in, fade-out and a soft shadow stay.
- [x] The title "Wunioid" in the same look (user, session 8: "let's see how that looks"): a still (no wave) from
  `remaster_banners.title()`, `remaster/title.webp` (trimmed, 40 KB), in the HUD panel (a sprite over a soft
  shadow, instead of the gold Pixi text) and on the title screen (an `<img>`, instead of the CSS gradient text).
- [x] `src/render/remasteredView.ts`: the same 640 × 480 layout (portrait: the playfield under a 34 px strip),
  scaled to fill the area (not integer). Positions interpolated between the last two ticks (`beforeTick`; a jump
  over 48 px snaps). Effects from comparing ticks (`afterTick`, render only): splinters in the stone's colour where
  a stone shatters, a flash and dust when a stone takes a hit and stays, sparks off the paddle, a ring when a
  capsule is collected, muzzle flash and hit sparks for shots, glows (balls, shots, capsules, the paddle: green
  with glue, blue with the gun), light on the floor, ball trails, shadows, a dimmed and vignetted background, a
  shake on D'Oh / Game Over, a fade into each level. Banners are text (Comic Neue Bold, OFL, in
  `public/fonts/`) in the TextImageList's gold, popping in and fading out.
- [x] HUD (decision 9) `src/render/remastered/hud.ts`: a panel right of the playfield in the frame's marble look
  (user, session 9: the same white marble relief as the playfield; the frame now goes on round the panel, closed at
  the bottom, the playfield's right border shared as the divider: `remaster/panel-frame.webp`, x 412–640):
  title, score (counting up), the course's best, lives as small paddles, level n / count and course, bars for the
  power-ups that run out (glue 800, gun 500, piercing 400, mega ball 300 ticks), key hint. Portrait strip: lives,
  score, level, thin power-up bars.
- [x] Menus (user, session 6: "don't stick with the ugly windows menu"; decision 12) `src/ui/menu.ts`, Remastered
  only: a title screen (Play, Choose course with cards: levels and best score, High scores per course, Graphics,
  Fullscreen), the pause menu (Esc, ☰ touch button, gamepad Start), the high-score name entry and the table after
  it (Play again / Main menu). Keys ↑ ↓ ← → Enter Space Esc, gamepad d-pad / A / B. Remastered starts on the title
  screen; Classic starts a game at once and keeps the Windows menu bar and dialogs (plus Game ▸ Remastered).
- [x] Switching at any time (decision 13): **R**, the menus' Graphics row, Classic's Game ▸ Remastered; saved
  (`wunioid.settings` in localStorage, with the chosen course). `?classic` / `?remastered` in the URL pick one for
  a visit. Both pictures share one PixiJS application (`render/app.ts`); the game goes on unchanged. If the
  Remastered files can't load, Classic shows.
- [x] `tools/screenshot.mjs`: `MODE=classic|remastered`; Remastered steps save the window; DEV globals `menu`,
  `startCourse()`, `pause()`.
- [ ] **User:** play Remastered on desktop and the phone: the look of the re-renders (capsules, magic gems, paddle,
  Bubbler, frame), the effects (too much? too little?), the HUD, the menus, smoothness at 60/120 Hz.
- [x] User (session 7): weaker light around the balls and the paddle (about half the size and brightness). The
  ball's trail glides with the ball (sampled along the interpolated path) instead of stepping at the tick rate.
- [x] Gems closer to the originals (user, session 7). **Capsules** are 3D models, as in 1999: a cut gem (the
  tangent planes of a box rounded by an ellipsoid: flat facets, 8 around the long axis, 4 tiers towards the ends),
  ray-traced exactly as a convex polyhedron, rolling 360° about its long axis over the 19 frames (frame 9.5 faces
  us), with the label extruded 2 px out of its front face (Liberation Sans Bold, ray-marched) and seen faintly
  through the glass, upside down, from behind (as in the originals' frames 0–2 and 16–18). Before, the capsule was
  a cylinder with the label painted on. User: "very close to the original now". **Still gems** come from the same
  renderer (`gem_body`), facing us: octagonal across (bevels about 30 % of the height, as the originals') with one
  chamfer at the ends (the originals' octagon outline), lighter and less saturated than the capsules, as in the
  originals. The body colour is limited softly by its main channel, so lit facets keep their order of brightness
  and the hue stays; the gloss goes on top. **Magic gems** (attribute Bonus) pulse with light from within instead
  of a glint sweeping across: the original's frames 0 → 5 → 10 brighten the whole stone, its shadowed facets most
  (pulse = sin(π f / 10)^0.5: the light × 1.25 plus a little of the gem's colour); toned down (user) so the cut
  stays visible when fully lit. The view adds a faint halo with the same pulse.
- [x] BeBack (the yellow sandstone, 2 hits, returns after 300 ticks) plays `Crunch` when its second hit hides it
  (user, session 7). Remastered only: the original is silent there (TStone.Hit 0x417ff8 hides it without a sound),
  so Classic stays so; `remasteredView.afterTick` adds the sound when a stone it saw visible turns invisible.
  Its dust (user, session 8): none at the first hit (only the flash), a 1.8 times larger cloud (more, bigger,
  faster pieces) at the second, with the Crunch.
- [ ] Subtle, irregular jerks in the ball's motion on the user's desktop: the display path, not the game, as far as
  measured; set aside by the user (session 7). Details, measurements and what is left to try:
  [known-issues.md](known-issues.md).
- [ ] Banners' and HUD's font: Comic Neue stands in for the original's Comic Sans look; check with the user.
- [ ] Maybe: re-render the background tiles too (they are upscaled, soft on large screens); a sound for menu
  moves. (The level editor's palette in the remastered look: done, Phase 4.)

- [x] Music plan (session 9, decision 14): approach, and the *Revenge of Doh* title music transcribed from a
  YouTube recording (120 BPM, G minor, bass Gm–F | E♭–D, the hook): [music.md](music.md).
- [x] **User:** compare the rendered transcription of the hook with the original: matches (session 9).
- [–] ~~Part B's melody~~: five candidates, none right; **decision (user, session 9): leave B out.**
- [x] Synth additions (session 9): `pluck` (Karplus-Strong, tuned within 2 cents; with `hpf`, `drive`, `cutoff`
  a distorted guitar), a `rock` drum kit, `level` (gain after the drive), master `loud`, `--levels` (mixing by
  numbers: each instrument's level and spectrum).
- [x] **User:** techno over metal; decision: TB-303-dominated acid techno with knob turning and heavy beats.
- [x] Synth for acid (session 9): `filter=ladder` (4-pole, 24 dB/octave, measured: −12 dB at the cutoff,
  +17 dB peak at res 0.95, stable under fast sweeps), knob automation lines (`acid.cutoff 300 .*62 2400`),
  `swing`, `gate`, `dist` (after the filter), `kit=hard`, `x*N` token repetition.
- [x] **User:** take 1 ("Acid Doh") is the favourite; its FM lead (breakdown, drop) is "very lame".
- [x] **User:** of SH-101, JP-8000 supersaw and Alpha Juno hoover leads for take 1, the SH-101 is best, "room
  for improvements". Synth: `stack`/`stackgain` (extra voices, e.g. a sub-octave), `bend`/`bendtime`.
- [x] **User:** of three SH-101-based leads (PWM + Juno chorus, hard sync, a second 303), the hard-sync lead is
  best, "still a bit soft", and the melody should match the original more. Synth: `pwm`/`pwmrate`, `chorus`,
  `sync`/`syncenv`/`syncdecay`.
- [x] **User:** of two versions with a louder sync lead (doubled by a square an octave below) playing the hook
  exactly, over the original's harmony (Gm – F | E♭ – D | Gm – F | E♭ – F), the one where the 303 plays the full
  four-bar hook too is better; written into `menu_acid1.txt`.
- [x] **User:** a smoother buildup without the kick from the start: 8 bars of the 303 fading in, hats, a pad
  swell and a snare roll; the kick at bar 9 (the loop start).
- [ ] **User:** listen to the new intro of `menu_acid1.txt`.
- [x] `tools/music/synth.py` (session 9): text scores (format in its docstring) → WAV + MP3 + loop points
  (JSON); 2-op FM, band-limited saw/pulse with detune and a resonant low-pass, tracker arpeggios, glides,
  synthesized 808/909-style drums, ping-pong echo, reverb, ducking by the kick, bus compressor, soft clipper.
  The loop region holds a second pass, so tails carry over the seam. About 50 s for a 3-minute song.
  Tempo 128 BPM for the menu track (user).
- [x] Session 13: drum'n'bass instead of techno (user: "I was a big drum'n'bass fan at the time"), then liquid
  ("more chill"): five takes, **the menu track is `menu_liquid4.txt` "Deep Water"** (reese, harp, choir lead on
  the hook at half time) with the short roll into the melody ([music.md](music.md)). Synth: `kit=break` (a funk kit
  band-limited like a sampled break), ghost snare `g`, drum-kit `drive`. `tools/music/gen_liquid.py` writes the
  five liquid scores.
- [x] Session 14: the full version of the menu track, `menu_full.txt` (`tools/music/gen_menu.py`, 2:59, intro 22 s
  once): a second harmony with a new melody, two hook variations, a harmony voice, flute counter-melodies, a
  16-bar breakdown, an outro back into the first drop ([music.md](music.md)). Tools: `tools/music/compose.py`
  (chord symbols and voice leading, a melody notation, a harmony check, mixing by numbers with `--balance` →
  `tools/music/levels.json`); synth: drum kits got `level`.
- [x] **User:** keep `menu_full.txt` (session 15).
- [x] Session 14: 20 level-track candidates, `level_01..20_*.txt` (`tools/music/gen_levels_dnb.py`: 10 drum'n'bass,
  2:11–2:16; `gen_levels_acid.py`: 10 acid techno with the TB-303, 2:16–2:35), each an intro once and a loop
  ([music.md](music.md)).
- [x] **User** (session 15): kept 03, 07, 09, 11, 12, 14, 17, 19, 20 (N = 9) and the full menu track; the
  others discarded.
- [x] Session 15: the music in the game ([music.md](music.md), In the game): `tools/music/export_music.py` →
  `game/public/music/` (MP3s and `music.json` with the loop points); `src/audio/music.ts` (Web Audio loop between
  the loop points, one track decoded at a time, the effects' AudioContext): the menu track in the menus and the
  editor, level n's track (n − 1) mod 9 from its start at each level, fades at "Well done" and "Game over",
  held by the pause menu, Remastered only; a Music selector (Off / Low / Medium / High) in the title and pause
  menus; `test/music.test.ts`. Service worker: the music in its own cache, best effort.
- [ ] **User:** check in the game by ear: the music's volume against the effects (Medium = gain 0.25), the loop
  seams, the fades, Safari/iOS (the MP3 encoder delay is handled by the decoded length, checked in Chrome only).
- [ ] Level tracks: refine by ear, if needed.

### Phase 4: Editors and release 🔄 (session 10, 2026-10-25)
User (session 10): the editors didn't work in the remake (they were view only); wanted in both modes.
- [x] Read the editors in the original (`docs/re-notes.md`, Level editor and Course editor): DrawMouseDown and the
  `Creator` palette, Level ▸ New / Edit / Save as / Load, every course editor handler and its messages.
- [x] Simulation (`world.ts`): StartEditor with the palette sprite (`Creator`), EditorTick, `editorMouseDown`
  (DrawMouseDown), `newLevel`, CreateBackground reusing the tile sprite, the course editor's operations
  (add, delete, move, new, save, reset). `test/editor.test.ts`.
- [x] Player files (`src/storage.ts`): levels and courses saved in `localStorage` in the original formats, over
  the shipped files of the same name; import of `.lev` / `.cse` files and download of any level or course.
- [x] Classic: the Level menu works (New, Edit, Test, Save as, Load), the editor takes left and right clicks;
  Windows-style Open / Save As dialogs (overwrite confirmation, plus the remake's Import… and Download); the
  course editor's buttons and menus all work, with the original's messages.
- [x] Remastered: Level editor and Course editor on the title screen; in the editor the HUD panel holds the
  palette (re-rendered stones and tiles on the original's click rectangles, the brush and background marked, an
  eraser for touch, Test and Menu buttons); Esc / Menu opens the editor menu (Back, Test, New, Load, Save as, Course
  editor, Main menu); Esc in a test goes back to the editor; drag paints (the original takes clicks only);
  Load level edits the level (the original tests it); a course editor screen (levels list, Up, Down, Delete,
  Add, New, Open, Save as, Reset high scores, Play) and a file screen (load, save, import, download).
- [x] User (session 10): drag paints in Classic too (deviation, the original takes clicks only); Remastered: a Test
  button left of Menu under the palette, and Esc (or Start, the touch menu button) in a test game goes straight
  back to the editor (the HUD hint says "Esc editor").
- [x] Deviation (needs the user's OK): Course ▸ New doesn't save the emptied high-score table over the previous
  course's (the original does, `docs/re-notes.md`).
- [x] User (session 12): the two Remastered editors made editing hard (no test from the course editor, no way to
  make a level and put it in a course, too much going back and forth). **Merged into one Editor** (Remastered only;
  Classic keeps the original's two): the course is the document. `src/editorProject.ts` holds the course and
  working copies of its levels (entries of the same file share one copy); nothing reaches the files until Save.
  `src/ui/editorPanel.ts`, a course panel left of the picture (under it in portrait): the levels as pictures
  (`src/render/thumbnail.ts`, the original images) in play order, a click edits one; the selected one has ▲ ▼,
  rename (✎ or double click), duplicate and take out (the file stays); + New level / + Add level… (a list with
  pictures) insert after it; unsaved marks (●) on the course and each changed level; Save (Ctrl+S; a new course
  asks for its name), Play course (saves first: "Save & play course"), Test level (the red, primary button),
  ☰ Menu. The editor's menu (Esc): New course, Open course…, Save course as…, Import…, download the level or the
  course, Reset high scores, Main menu. The title screen has one Editor button. A course game started from the editor can go back to it (pause
  menu, and after the high-score table). The brush and the eraser stay through tests and level changes
  (`World.keepBrush`, Remastered only; the original resets the brush). The palette's Test and Menu buttons moved
  to the panel. The editor survives a trip to the main menu; leaving the page with unsaved changes asks first, and
  the auto-update waits for them. New levels are empty and black, as the original's Level ▸ New.
- [ ] **User:** try both editors (Classic and Remastered), on desktop and on a phone (landscape is the better way
  to edit on a phone: in portrait the whole 640 × 480 picture is small).
- [ ] Maybe: delete the player's own files (and restore a shipped one); a hover mark in the Remastered palette;
  drag to reorder the course panel's levels; play a course from the selected level.
- [ ] README with screenshots, itch.io page.

### New courses (session 11, 2026-10-25)
User: three new courses of 20 levels each, using the stones in new combinations; the user play-tests them and
weeds out the weak ones.
- [x] Sources as text in `courses/*.txt` (one course per file, a 13 × 17 grid of letters per level, an idea
  comment each); `tools/build_courses.py` → `game/public/data/levels/*.lev`, `<Course>.cse`, `data.json`, and
  preview sheets (`--preview DIR`). It fails on a level with no counting stones or one walled in by Iron, and
  notes levels whose stones can only be reached through BeBacks. `export_game_data.py` (`npm run data`) runs it.
- [x] **Postcards** (pictures, gentle to medium), **Contraptions** (machines and puzzles, medium), **Inferno**
  (hard). File names CamelCase like the originals', none reused.
- [x] `test/autoplay.test.ts` (`AUTOPLAY=1 npx vitest run test/autoplay.test.ts --silent=false`, or
  `AUTOPLAY=Inferno` for one course): plays every level three times with an autopilot (aims at the landing spot,
  random paddle offset) and endless lives; reports the median time and balls lost, fails a level no run finishes.
  All 60 finish in all runs. `test/courses.test.ts` (always): each course has its 20 levels, all with stones.
- Learned on the way (design rules): a room closed by Iron with nothing breakable in it can hold a ball in an
  endless bounce (soft lock): mazes and cages use Granit inside. Two staggered rows of stones one empty row apart
  act as a wall. A 1-row (15 px) pocket or a gap the ball has to enter sideways is nearly unreachable. Nothing
  deadly straight above the paddle's start (the ball launches up col 8). Hike stones only turn when blocked, so a
  1-wide shaft with walls at its ends makes an elevator, and a lone Hike stone circles the field's edge clockwise.
- [x] The settings' default course was `'default'` (no `.cse`) and only worked as the first name in sort order;
  now `'default.cse'`, so the new courses don't take its place for a new player.
- [ ] **User:** play-test the 60 levels and drop or change the weak ones (edit `courses/*.txt`, `npm run data`).
  Slow for the autopilot (> 10 min): Castle, Impostors, Chomp, Labyrinth, Gauntlet. Many balls lost: Jellyfish,
  Asteroids, Cerberus, Gauntlet.
- [ ] Decide the order of the courses in the menu (now by name: Contraptions, default, Inferno, Mystery,
  Postcards).

## Decisions (user)
1. Tech stack: the Dark Planet stack (session 1).
2. The level and course editors are in scope (session 1).
3. The probable *Simpsons* samples (Doh, MultiDoh, Woohoo, Haahaa, IMean) stay, in Classic and Remastered
   (session 1).
4. No music in Classic; the original has none (session 1). Remastered gets music (decision 14).
5. GitHub repo `aimfeld/wunioid`, served at https://aimfeld.github.io/wunioid/ (session 1).
6. Fixed simulation tick of 1000/22 ≈ 45.45 Hz, as the original's 22 ms DXTimer (session 2).
7. Blocking banners (D'Oh!, Game Over, Course Done) and the "Well done" phase run at the tick rate, not at the
   display refresh rate as in the original (session 2).
8. Touch: buttons instead of dragging, ◀ ▶ for the left thumb and Fire for the right, as Dark Planet's touch
   buttons (session 4).
9. Remastered mode gets a finished, good-looking HUD in a style consistent with the original
   (session 4).
10. Phones default to portrait. There, even Classic diverges from the original: no FPS counter, `Lifes` /
    `Score` / `Level` in a strip above the playfield, and the playfield at the full width (session 5).
11. Remastered graphics are re-rendered (ray-traced height fields at 4x by `tools/remaster_render.py`), not
    upscaled (session 6).
12. Remastered has its own menus (title screen, course choice, high scores, pause, name entry); Classic keeps the
    original's Windows menu bar and dialogs (session 6).
13. Remastered is the default; switch at any time with R or the menus (session 6).
14. Remastered gets music (session 9): the title/main menu plays an original track that nods to the *Revenge
    of Doh* (DOS) title music; the levels play independent tracks in 1999 game-music style, repeating (6
    planned; session 13: the user picks N of 20 candidates; session 15: 9 kept). Menu track: liquid drum'n'bass
    (session 13), the full version `menu_full.txt` (session 15). Made as
    text scores rendered by a Python synth to MP3 ([music.md](music.md)).
