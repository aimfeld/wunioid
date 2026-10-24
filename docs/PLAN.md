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
### Phase 0: Investigation & setup 🔄 (session 1, 2026-10-24)
- [x] Inventory (`docs/inventory.md`): Delphi 3 + DelphiX, no source; ~53 game procedures; 65 images, 19 sounds,
  32 levels, 2 courses, high scores.
- [x] Original files moved into `original_source/` (unchanged).
- [x] `tools/delphi_dfm.py` (Delphi form stream parser) and `tools/extract_assets.py` (PNG, WAV, level renders,
  `assets.json` → `original_source/extracted/`).
- [x] Level, course and high-score formats: first pass in `docs/inventory.md`; level format verified by rendering.
- [x] REA/Ghidra analysis of `WUNIOID.EXE` (snapshot in `.rea/`).
- [x] Wine 9.0 installed by the user. The game starts but needs a fullscreen mode change that fails on this
  multi-monitor desktop, and quits inside a Wine virtual desktop.
- [–] ~~Run the original in a virtual X server (Xvfb + xdotool) for captures and scripted input~~: deferred
  (user, session 1); work from the code first and come back to it only if really necessary. The user can play
  the original with plain `wine WUNIOID.EXE` (fullscreen).
- [x] Git repository, public GitHub repo `aimfeld/wunioid` (session 1), `README.md`.
- [ ] Get the DelphiX source matching the units in the EXE (`DXClass`, `DXDraws`, `DXSprite`, `DXSounds`,
  `ODXInput`, `DIB`, `fWave`, `HDirectX`, `PDXRender`) for naming library routines.

### Phase 1: Reverse-engineer the gameplay
- [ ] Name the game's procedures: published methods (`TimerTimer`, `Neu1Click`, …) from the method tables,
  virtual methods (`DoMove`, `DoCollision`, `DoDraw` of `TBall`, `TStone`, …) from the VMTs, DelphiX routines
  from its source. Record in `docs/re-notes.md`.
- [ ] Game loop and timing: what `TimerTimer` does per frame, whether movement scales with DelphiX's `LagCount`
  (milliseconds since the last frame) or is per frame; screen mode and layout (playfield, HUD).
- [ ] Paddle: input, speed, sizes (normal, long, short, gun), glue, shots.
- [ ] Ball: speed, acceleration, angle off the paddle, wall/stone collisions (floating point), mega ball,
  multiball, losing a ball.
- [ ] Stones: hits per type, points, behaviours of Granit, Block, Bubbler, Eater, Doubler, BeBack, Goldie,
  Killer, gems; attributes Bonus, Move, Hike, Iron; shatter animation (`TStoneKlirr`).
- [ ] Bonuses: drop chance and choice, the 16 capsules and their effects ($ colours, 1Up, Gun, Glue, Pad+/−,
  2xo, 5xo, −−o, Big, Zup, End), durations.
- [ ] Lives, scoring, level end, course end, game over, text banners and which sound plays when.
- [ ] High scores (name entry, record format), courses, level and course editors.
- [ ] `docs/gameplay-spec.md`: the rules in ticks, each with the address it came from. `docs/file-formats.md`.
- [ ] Check the spec against the original running in Wine (played by the user, or Xvfb if really necessary).

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
