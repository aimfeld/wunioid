# Known issues

## Subtle jerks in the ball's motion on the user's desktop (the user's Linux display path, not the game)

**Symptom (user):** in Remastered, the balls move with a slight jerk now and then. The user first saw it as
"regular, about every 2 s", then on a closer look as irregular: sometimes two jerks within a second, sometimes smooth
for 3–4 s. The user remembers the same in the original. Seen on both of the user's monitors, and with the external one
disconnected (the laptop's 240 Hz panel alone).

**The user's system:** Linux, Cinnamon desktop on X11 (Muffin compositor); Google Chrome 156 on X11
(`--ozone-platform=x11`); a hybrid laptop with AMD Radeon 780M + NVIDIA RTX 4060 Mobile. Displays: the laptop panel
eDP-1 2560 × 1600 at 240 Hz, and an external ultrawide on HDMI-1-0 (the primary, on the NVIDIA GPU) 3440 × 1440 at
49.99 Hz (it also offers 99.98 and 59.97 Hz).

### What we changed
- **The ball's trail** (kept, deployed) was drawn at the tick positions, so its glows stepped at 45 Hz under a ball
  that glides at the display's rate. It is now sampled along the interpolated path, every half tick
  (`RemasteredView.trail`). A real improvement on any display that isn't 45 Hz, but not the jerk's cause.
- **A frame clock** (reverted, session 7): `game/src/frameClock.ts` evened out jitter in requestAnimationFrame's
  timestamps (frames close to a whole number of refresh periods counted as exactly that; the period was learnt; the
  difference to real time was fed back slowly), since every ms of jitter puts the ball a quarter pixel off its line.
  Removed because the user's Chrome had no such jitter (0.1 ms), current browsers time rAF to the vsync, and on a
  display with a variable refresh rate (FreeSync / G-Sync, phones switching 60 / 120 Hz) one odd frame would skew
  its period estimate and the ball's timing for a second or so. In commit 29699fd if it is ever needed.

### What we measured
- **The simulation** moves the ball evenly: 6 px per tick at speed 3 (1.247, −5.869 at 78°), only the direction
  changes at bounces (vitest probe over 200 ticks).
- **In the user's Chrome** (the dev server, a recorder injected via Claude in Chrome, 20 s with the ball in play, the
  window on the external monitor):
  - Frames every 20.005 ms (49.988 Hz, in step with the 49.99 Hz monitor), timestamps on a straight line within
    −0.07…+0.15 ms; 3 late frames in 20 s (one of 120 ms, two of 40 ms), not at the jerks' rhythm.
  - The ball's drawn position (the sprite handed to PixiJS) moves 6.00 ± 0.03 px per tick in every frame, except at
    bounces.
  - Drawing a frame takes under 2 ms. Garbage collection frees ~650 KB every ~0.6 s (and ~2–3 MB every ~8 s)
    without late frames.
- **A bare test page** (`tools/smoothness.html`: three balls at constant speed on a plain canvas, placed by the rAF
  timestamp only, no game, no ticks, no PixiJS) shows **the same jerk** to the user. Its frame timing in Chrome was as
  clean (20.000 ms, p1 19.90, p99 20.10, no late frames in 8 s).
- **Firefox** shows the same jerk (user, 2026-10-31), so it isn't Chrome's.
- **A Windows gaming laptop** (user, 2026-10-31): the game runs perfectly smooth in Edge and in Firefox. Same code,
  so the jerk belongs to the Linux laptop's display path (X11, Muffin, the drivers), not the game.
- **Fullscreen without the compositor** (user, 2026-10-31): `unredirect-fullscreen-windows` on, the game in
  fullscreen (F): no better. Either Muffin wasn't the cause or the X server and driver still pace the frames
  unevenly (TearFree, the copy between the GPUs).
- **TearFree off** on eDP-1 (user, 2026-10-31, `xrandr --output eDP-1 --set TearFree off`), the game on the laptop
  panel: still jerky. Reverted to `auto`.
- **The system** (2026-10-31): Cinnamon 6.6.9, Muffin's `unredirect-fullscreen-windows` is off (so even fullscreen
  windows go through the compositor). The browsers render on the AMD iGPU (only Xorg runs on the NVIDIA GPU, per
  `nvidia-smi`). The HDMI output is on the NVIDIA GPU, so its frames get copied from the AMD GPU by the X server.
  amdgpu `TearFree` is `auto`, `VariableRefresh` is disabled (eDP-1 could do it). Display scale 1.

### Conclusion so far
The game hands the browser smooth motion, and Chrome's frame clock is regular. The frames get uneven after the browser
(the compositor or the driver); Firefox has it too. A likely mechanism (inferred): on X11 a browser times its
frames by its own vsync estimate, not by when Muffin repaints, so the two clocks drift slowly against each other and
near their crossing a frame now and then misses Muffin's repaint (shown twice, then the ball jumps). That fits the
irregular clusters (two jerks in a second, then seconds of smooth motion). Not proven: we can't see the actual
presentation times from the page.

The original's jerk (1999, Windows) probably had another cause: a 22 ms DXTimer on Windows' ~15.6 ms timer
resolution gives ticks of uneven length, each drawn as it comes. The remake's fixed tick with interpolation does not
have that.

### Not tried yet
- The phone (the deployed game): a different display path altogether.
- The external monitor at 59.97 or 99.98 Hz; other Chrome GPU settings (chrome://gpu, the ANGLE backend in
  chrome://flags).
- A Wayland session: the most likely fix (the browser learns when frames reach the screen).
- Unrelated to the jerk, but could read as one: the ball still sinks up to one step (6 px) into the paddle or a stone
  before it turns, as in the original (the tick moves it, then the collision turns it). The picture could draw the
  bounce at the contact point.
