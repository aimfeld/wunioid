# Known issues

## Subtle jerks in the ball's motion on the user's desktop (open, set aside by the user, session 7)

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

### Conclusion so far
The game hands the browser smooth motion, and Chrome's frame clock is regular. The frames get uneven after Chrome
(the compositor, the driver, or Chrome on X11, which gets no real feedback on when frames reach the screen). Inferred,
not proven: we can't see the actual presentation times from the page.

The original's jerk (1999, Windows) probably had another cause: a 22 ms DXTimer on Windows' ~15.6 ms timer
resolution gives ticks of uneven length, each drawn as it comes. The remake's fixed tick with interpolation does not
have that.

### Not tried yet
- Fullscreen (F) with Cinnamon's "Disable compositing for full-screen windows" (System Settings → General), so the
  frames bypass the compositor.
- Firefox, on the game and on `tools/smoothness.html`.
- The phone (the deployed game): a different display path altogether.
- The external monitor at 59.97 or 99.98 Hz; other Chrome GPU settings (chrome://gpu, the ANGLE backend in
  chrome://flags); a Wayland session.
- Unrelated to the jerk, but could read as one: the ball still sinks up to one step (6 px) into the paddle or a stone
  before it turns, as in the original (the tick moves it, then the collision turns it). The picture could draw the
  bounce at the contact point.
