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
  the level editor's mouse handling (DrawMouseDown 0x41aad4) is left for Phase 4.
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
  prompt and the course editor dialog (view only; its editing is Phase 4). High scores in `localStorage`, starting
  from the 2011 tables.
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
- [ ] Try the touch buttons on a phone; try a gamepad.
- [ ] Open questions for the user: (1) mouse: steer at the paddle's own speed (now) or move the paddle
  straight to the pointer? (2) the menu bar: always there (faded until hovered, now) or hidden in fullscreen?
  (3) the HUD font (MS Sans Serif 12 pt is approximated with Arial).

### Phase 3: Remastered mode
- [ ] Graphics: choose between upscaling (hq2x/xBR/AI) and re-rendering the stones, balls and paddles.
- [ ] Interpolated motion at the display's refresh rate; effects.
- [ ] Finish the HUD (everything outside the playfield; user, session 4): the original never finished it (plain
  `FPS` / `Lifes` / `Score` / `Level` text at x 500 on black). Make it beautiful, in a style consistent with the
  original's graphics (the playfield frame, stones, capsules). Idea: in portrait on a phone, put it above the
  playfield so the playfield can fill the width (Classic shows the whole 640 × 480 picture, at ~0.6× on a phone).
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
8. Touch: buttons instead of dragging, ◀ ▶ for the left thumb and Fire for the right, as Dark Planet's touch
   buttons (session 4).
9. Remastered mode gets a finished, good-looking HUD in a style consistent with the original
   (session 4).
