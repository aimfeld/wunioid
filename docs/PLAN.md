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
- **Controls**: the original has keyboard and joystick only. The remake adds mouse (pointer lock), touch (drag the
  paddle) and gamepad. The tall playfield suits phones held upright.

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
  the level editor's mouse handling (DrawMouseDown 0x41aad4) is left for Phase 4.
- [x] `docs/gameplay-spec.md`, `docs/file-formats.md`, `docs/re-notes.md`.
- [x] Decided (user, session 2): fixed tick 1000/22 ≈ 45.45 Hz; blocking banners and the "Well done" phase
  run at the tick rate too (decisions 6 and 7).
- [ ] Check the spec against the original running in Wine (played by the user): `FPS:` value, `Level: 0` on the
  first level, the ball after piercing ends, Hike/Move/Goldie behaviour, the 170°–190° angle guard.

### Phase 2: Engine + Classic mode
- [ ] Scaffold `game/` (Vite + TypeScript + PixiJS + Vitest), asset export into `game/public/`, fixed-tick loop.
- [ ] Deterministic simulation ported from the original, with tests.
- [ ] Classic renderer, HUD, text banners, sounds.
- [ ] Courses (default, Mystery), high scores in `localStorage`.
- [ ] Keyboard, mouse, touch, gamepad; fullscreen; PWA.
- [ ] Deploy to GitHub Pages.

### Phase 3: Remastered mode
- [ ] Graphics: choose between upscaling (hq2x/xBR/AI) and re-rendering the stones, balls and paddles.
- [ ] Interpolated motion at the display's refresh rate; effects.
- [ ] Switching between Classic and Remastered at any time.

### Phase 4: Editors and release
- [ ] Level editor and course editor in the browser, as in the original, with `.lev`/`.cse` import and export
  and storage in `localStorage`.
- [ ] README with screenshots, itch.io page.

## Decisions (user)
1. Tech stack: the Dark Planet stack (session 1).
2. The level and course editors are in scope (session 1).
3. The probable *Simpsons* samples (Doh, MultiDoh, Woohoo, Haahaa, IMean) stay, in Classic and Remastered
   (session 1).
4. No music in either mode; the original has none (session 1).
5. GitHub repo `aimfeld/wunioid`, served at https://aimfeld.github.io/wunioid/ (session 1).
6. Fixed simulation tick of 1000/22 ≈ 45.45 Hz, as the original's 22 ms DXTimer (session 2).
7. Blocking banners (D'Oh!, Game Over, Course Done) and the "Well done" phase run at the tick rate, not at the
   display refresh rate as in the original (session 2).
