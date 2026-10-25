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
  pages, `frame.webp`, `sprites.json` in `game/public/remaster/` (0.6 MB, committed like `data/`). Not re-rendered:
  the shatter animations (particles instead), the banners (text instead), the editor's labels and palette (the
  originals, smoothly scaled, until Phase 4).
- [x] `src/render/remasteredView.ts`: the same 640 × 480 layout (portrait: the playfield under a 34 px strip),
  scaled to fill the area (not integer). Positions interpolated between the last two ticks (`beforeTick`; a jump
  over 48 px snaps). Effects from comparing ticks (`afterTick`, render only): splinters in the stone's colour where
  a stone shatters, a flash and dust when a stone takes a hit and stays, sparks off the paddle, a ring when a
  capsule is collected, muzzle flash and hit sparks for shots, glows (balls, shots, capsules, the paddle: green
  with glue, blue with the gun), light on the floor, ball trails, shadows, a dimmed and vignetted background, a
  shake on D'Oh / Game Over, a fade into each level. Banners are text (Comic Neue Bold, OFL, in
  `public/fonts/`) in the TextImageList's gold, popping in and fading out.
- [x] HUD (decision 9) `src/render/remastered/hud.ts`: a panel right of the playfield in the frame's marble look:
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
- [ ] **User:** play Remastered on desktop and the phone: the look of the re-renders (capsules, paddle, Bubbler,
  frame), the effects (too much? too little?), the HUD, the menus, smoothness at 60/120 Hz.
- [x] User (session 7): weaker light around the balls and the paddle (about half the size and brightness). The
  ball's trail glides with the ball (sampled along the interpolated path) instead of stepping at the tick rate.
- [ ] Subtle, irregular jerks in the ball's motion on the user's desktop: the display path, not the game, as far as
  measured; set aside by the user (session 7). Details, measurements and what is left to try:
  [known-issues.md](known-issues.md).
- [ ] Banners' and HUD's font: Comic Neue stands in for the original's Comic Sans look; check with the user.
- [ ] Maybe: re-render the background tiles too (they are upscaled, soft on large screens); a sound for menu
  moves; the level editor's palette in the remastered look (Phase 4).

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
10. Phones default to portrait. There, even Classic diverges from the original: no FPS counter, `Lifes` /
    `Score` / `Level` in a strip above the playfield, and the playfield at the full width (session 5).
11. Remastered graphics are re-rendered (ray-traced height fields at 4x by `tools/remaster_render.py`), not
    upscaled (session 6).
12. Remastered has its own menus (title screen, course choice, high scores, pause, name entry); Classic keeps the
    original's Windows menu bar and dialogs (session 6).
13. Remastered is the default; switch at any time with R or the menus (session 6).
