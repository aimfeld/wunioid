# Gameplay spec (Classic mode)

The behaviour the remake must reproduce, reverse-engineered from `WUNIOID.EXE` in session 2 (2026-10-24).
Evidence and addresses are in `docs/re-notes.md`; this file states the rules. Status tags: **O** observed in the
code or data, **I** inferred, **U** unknown. Untagged statements are O. Nothing here has been checked against
the running game yet; §12 lists the checks.

## 0. Conventions
- **1 tick = one DXTimer event.** The original calls every sprite's `DoMove(20)` once per tick, whatever the
  elapsed time, so all speeds are per tick. Nominal rate 1000/22 ≈ **45.45 ticks/s** (I, see re-notes →
  Timing); the remake runs a fixed 45.45 Hz tick (decision 6). Speeds below are already multiplied out
  (`0.3 × 20 = 6 px/tick`).
- Coordinates: screen pixels of the 640×480 picture, origin top left, y down. A sprite's X, Y is its top-left
  corner, stored as a double. The playfield frame `Rahmen` (428×480) sits at 0, 0; the HUD text is at x 500.
- Collision boxes are `Bounds(Trunc(X), Trunc(Y), W, H)`; two boxes collide when they overlap with strict `<`
  on all four sides. Never pixel-exact.
- Angles are integer degrees, 0 = right, 90 = up. Direction dx = cos a, dy = −sin a (screen y down).
- `Random(n)`: Delphi's generator, 0…n−1. Exact sequences don't matter.
- Order within a tick (O, TimerTimer + PlayTick): input → every sprite's DoMove in creation order (paddle
  before balls before stones, as created in StartLevel; capsules, shots, shatters later) → collisions (§6) →
  remove dead sprites → ball/lives check → level-complete check → draw. Sprites created during the moves move
  from the next tick on; balls, shots and capsules leave their lists the moment they die, and the collision loops
  then go on with whatever now has the same index (O, session 3, re-notes).

## 1. Playfield and grid
- Walls: left x = 14, right x = 414, top y = 14. The bottom is open; a ball whose bottom edge passes y 500 is
  lost (the screen ends at 480).
- Stone grid: 13 columns × 17 rows of 30×15 stones. Cell (col, row), 1-based: X = (col−1)·30 + 19,
  Y = (row−1)·15 + 19. The level file stores kind and attribute per cell (`docs/file-formats.md`).
- Background: level byte 442 = tile 1–9 (`Tile1`…`Tile9`, 40×40) repeated 10×12 from 14, 14, drawn above the
  frame (Z 1 over Z 0); 0 = no tiles.
- Draw order (Z): frame 0, background 1, paddle/balls/stones 2, capsules/shots/shatters/attribute labels 3,
  text banners 20. Equal Z: the newest underneath (O, session 3: DelphiX inserts a sprite before the others of its
  Z), so the paddle and the level's first ball are drawn over the stones, later balls under them.

## 2. Paddle
- Start of each level: a new paddle at X 200, Y 430, normal, all timers 0.
- Kinds: normal 80×14, gun 80×14, long 120×14, short 40×14 (the image sets the size).
- Each tick, in order:
  1. Shot cooldown −1 (if > 0). Gun timer −1 (if > 0); reaching 0 makes the paddle normal. Glue timer −1
     (if > 0).
  2. Left held and X > 14: X −= 6 and every glued ball moves 6 left. Right held and X + W < 414: X += 6,
     glued balls too. (Both can apply in one tick and cancel out.) X is always 200 + 6k, so the paddle stops at
     exactly X 14 on the left, but on the right ends past the wall at X + W = 418 (normal, gun), 416 (long) or
     414 (short). SetKind doesn't clamp: Pad+ at the right wall reaches X + W = 458 (I, session 3; this replaces
     "X min ≈ 8").
  3. Up or Fire held: every glued ball is released with angle = clamp(90 + offset, 20, 160) (§3.3).
  4. Fire held, gun timer > 0, cooldown 0, kind gun: two shots (§7), cooldown 15, sound `Shoot`.
- Losing a ball (§9) makes the paddle normal but keeps its position, and keeps a running glue timer.

## 3. Ball
### 3.1 State
Size 12×12 (`Ball`, frame 0) or 20×20 (`MegaBall`). Angle (int), speed (starts 3.0), direction (dx, dy),
glued flag, piercing flag, piercing timer, mega timer, bounced-this-tick flag. Up to 30 balls (checked before
creating extra balls, not for the replacement ball after a loss).

### 3.2 New ball
Glued, X = paddle.X + paddle.W div 2 (its left edge at the paddle's centre), Y = paddle.Y − 12, speed 3.0,
angle 75 (replaced on release).

### 3.3 Angle helpers (keep the quirks)
- `norm(a)` = a mod 360 if a > 0, else (a mod 360) + 1440, with truncating mod. 0 → 1440, −30 → 1410.
- `reflect(axis)`: a := norm(2·axis − norm(a)); direction := (cos a, −sin a).
- `offset` = round_half_even(2 × (paddle.X + paddle.W div 2 − (ball.X + ball.W div 2))). Hitting left of the
  paddle centre gives a positive offset, i.e. a steeper leftward angle.

### 3.4 Each tick (DoMove)
1. Animation step (only animated balls, §3.6).
2. If norm(a) mod 90 = 0: a += 1, direction updated.
3. If 170 ≤ norm(a) ≤ 190: a := 168 if norm(a) < 181, else 192; direction updated. (There is no such guard
   near 0°/360°.)
4. Mega timer −1 if > 0; at 0 the ball is removed and 3 balls (while fewer than 30) appear at its centre
   (X + W div 2, Y + H div 2 as the new balls' X, Y) with angles 30, 150, 270, not glued, normal size.
5. Piercing timer −1 if > 0; at 0 piercing ends and the looping animation stops (§3.6).
6. If not glued:
   - dx < 0 and X < 14 → reflect(270); dx > 0 and X + W > 414 → reflect(90);
   - dy < 0 and Y < 14 → reflect(180); dy > 0 and Y + H > 500 → the ball is lost (removed);
   - then X += 2·speed·dx, Y += 2·speed·dy (6 px/tick at speed 3).
7. Clear the bounced-this-tick flag.

### 3.5 Speed
Only the Bubbler changes it: each Bubbler hit adds 0.5 while speed < 6 (so 3.0 → 6.0 in six hits, at most
6.0). It never decreases; a new ball starts at 3.0.

### 3.6 Piercing and mega ball
- Piercing (Killer stone, `−−o` capsule): 400 ticks. The ball passes through stones (no bounce) and destroys
  any stone with one hit, except: Granit bounces it as usual and loses 1 hit, a Killer loses 1 hit (and renews
  the piercing), Iron is unaffected. The ball image starts animating (21 frames, 0.4 frames/tick, random start).
  When it ends, AnimPos is reset to 0 and looping stops; the animation then runs once to frame 20 and stays
  (I, §12).
- Mega ball (`Big` capsule): a new glued ball, image `MegaBall`, piercing, animated, placed at
  Y = paddle.Y − 20 and X = (paddle.X + paddle.W div 2) + Random(20) − 10, mega timer 300. It stays glued until
  released. When the timer ends it splits into 3 normal balls (§3.4).

## 4. Stones
### 4.1 Kinds
| # | Kind | Hits | Counts* | Animated | Special |
|---|---|---|---|---|---|
| 1–5 | GemRed, GemOrange, GemGreen, GemBlue, GemViolet | 1 | yes | with Bonus | drop capsules with Bonus |
| 6 | Granit | 25 | no | | bounces piercing balls, can't be one-hit |
| 7 | Block | 2 | yes | | |
| 8 | Bubbler | 1 | no | yes | ball speed +0.5 |
| 9 | Eater | 3 | no | yes | eats the ball |
| 10 | Doubler | 3 | no | yes | splits the ball |
| 11 | BeBack | 2 | no | | hides for 300 ticks, then returns |
| 12 | Goldie | 1 | no | | turns its 8 neighbours into Goldies |
| 13 | Killer | 3 | no | yes | makes the ball piercing |

\* "Counts": the level is complete when every counting stone is gone. Only gems and Blocks count, and not
with the Iron attribute. Uncountable stones may stay.

Animated stones loop all frames at 0.4 frames/tick from a random frame.

### 4.2 Attributes
- **Bonus** (1): the stone sparkles (animated) and every hit on a gem drops a capsule (§5). Destroyed with the
  sound `Bonus` and no shatter animation.
- **Move** (2): slides horizontally 2 px/tick, starting rightwards, turning at the walls (X < 14 → right,
  X + W > 414 → left) and when it overlaps another visible stone (left of it → go left, else right). It only
  starts if one of the two neighbouring grid cells of its **original** cell is free (empty, the wall doesn't
  count as free, a sliding Move stone counts as free). Its grid cell never changes.
- **Hike** (3): jumps to a neighbouring empty cell every 10 ticks (the first jump on the first tick). It
  keeps going in its direction (up at first); if blocked it turns to the first free perpendicular direction
  in the order right, up, left, down, or turns back if three sides are blocked. Inside cols 1…13, rows
  1…17; any stone (even a hidden BeBack) blocks. It keeps its kind and remaining hits.
- **Iron** (4): hits don't reduce its hits, so it's indestructible (piercing balls and shots included); sound
  `Iron` instead of `Abprall`. Doesn't count, and Goldie doesn't convert it.

### 4.3 Being hit (by a ball or a shot)
In order:
1. Bonus attribute on a gem: drop a capsule (§5).
2. Eater, hit by a ball: the ball is removed; sound `Eat` if other balls remain.
3. Doubler, hit by a ball, fewer than 30 balls: a new ball at the same position, angle = the ball's (already
   reflected) angle + Random(20) − 10; sound `Double`.
4. Goldie: each of its 8 neighbours that exists and isn't Iron or Move becomes a Goldie: visible (a hidden
   BeBack reappears), no attribute, 1 hit, not animated. A counting neighbour stops counting.
5. Killer, hit by a ball: the ball becomes piercing (§3.6).
6. Hits −1, unless Iron. A piercing ball against a stone that isn't Granit, Killer or Iron: hits := 0.
7. Hits ≤ 0:
   - BeBack: hidden for 300 ticks (no collisions), score +500; then visible again with 2 hits and the sound
     `BeBack`. It can be destroyed again and again for 500 each time.
   - anything else: score +500; the shatter animation (`Z<kind>`, 60×40 at X − 15, Y − 10, 9 frames at 1.2
     frames/tick, removed after 8 ticks) with sound `Crunch` (Granit, Block) or `Klirr`, or for the Bonus
     attribute no shatter and the sound `Bonus`; the stone is removed.
8. Hits > 0: sound `Iron` (Iron) or `Abprall`.

Shatter images: gems their colour, Granit `ZGranit`, Block and BeBack `ZBlock`, Bubbler/Eater/Doubler
`ZGemBlue`, Goldie `ZGemOrange`, Killer `ZGemRed`.

## 5. Capsules
- A gem with the Bonus attribute always drops one capsule when hit, at the stone's X, Y:

  | Gem | Roll | Capsule |
  |---|---|---|
  | Red | Random(6) | 0–3 $Red, 4 1Up, 5 Gun |
  | Orange | Random(5) | 0–3 $Orange, 4 Big |
  | Green | Random(7) | 0–3 $Green, 4 Glue, 5 Pad+, 6 Pad− |
  | Blue | Random(10) | 0–5 $Blue, 6–7 2xo, 8 −−o, 9 5xo |
  | Violet | Random(10) | 0–7 $Violet, 8 Zup, 9 End |
- 30×20, falls 3.2 px/tick, 19-frame spin at 0.4 frames/tick from frame 0; removed at Y > 500. Collected when
  it overlaps the paddle, except during the "Well done" phase.
- Effects:

  | Capsule | Effect |
  |---|---|
  | $Red, $Orange, $Green, $Blue, $Violet | score +10000, sound `Money` |
  | 1Up | lives +1 (up to 25), sound `Woohoo`, banner `1up` |
  | Gun | gun paddle for 500 ticks, banner `Shootem` |
  | Glue | glue for 800 ticks: a ball hitting the paddle sticks to it (released with Up/Fire) |
  | Pad+ | long paddle (until the ball is lost or another size capsule) |
  | Pad− | short paddle, sound `Haahaa` |
  | 2xo | every ball gets a copy at its position, angle ± up to 10° (Random(20) − 10) |
  | 5xo | 5 new balls glued on the paddle at X = paddle.X + (i−1)·(W div 4) − 6, i = 1…5 |
  | −−o | every ball becomes piercing for 400 ticks |
  | Big | a mega ball on the paddle (§3.6) |
  | Zup | every Granit stone disappears (no score, no animation) |
  | End | the level ends ("Well done", next level); only in course games |

  Gun, Pad+ and Pad− replace each other (one paddle kind at a time); a gun timer still running after Pad+/Pad−
  turns the paddle back to normal when it ends (O, quirk).

## 6. Collisions, once per tick after all movement
1. **Paddle**: each ball (first to last) not glued, overlapping the paddle, moving down (dy > 0) and with
   Y < paddle.Y: angle := clamp(norm(reflect(0)) + offset, 20, 160), direction updated. With glue running the
   ball sticks: glued, Y = paddle.Y − H. Sound `PaddleBall` or `PaddleBall2` at random.
2. **Ball–stone**: each ball (last to first) not glued against each visible stone (column by column, rows top
   to bottom) it overlaps: bounce (§6.1), then the stone is hit (§4.3). A ball bounces at most once per tick;
   after its first bounce the remaining stones it overlaps that tick are neither bounced off nor hit. Piercing
   balls never set the flag, so they hit every stone they overlap.
3. **Shot–stone**: each shot against each visible stone it overlaps: the stone is hit without a ball, the shot
   is removed.
4. **Move stones**: each Move stone overlapping another visible stone turns (§4.2).
5. **Capsules**: collected on overlap with the paddle (§5).

### 6.1 Ball–stone bounce
Skip if the ball bounced this tick. If piercing and the stone isn't Granit: no bounce. Otherwise, with ball
(bx, by, bw, bh), stone (sx, sy, sw, sh), and free(dc, dr) = the neighbour cell is open (column outside 1–13
is closed; an empty cell, a sliding Move stone, or a hidden stone is open; a visible stone is closed unless
this stone is itself a Move stone), test the sides in this order and take the first match:

| Side | Condition | Corner tests (first match) | Otherwise |
|---|---|---|---|
| left | sx ≥ bx, bx + bw ≥ sx, dx > 0, free(−1, 0) | top-left: by + 3 ≤ sy ≤ by + bh, dy > 0, free(0, −1) → reflect(30); bottom-left: sy + sh ≥ by, by + bh − 3 ≥ sy + sh, dy < 0, free(0, 1) → reflect(150) | reflect(90) |
| right | sx + sw ≥ bx, bx + bw ≥ sx + sw, dx < 0, free(1, 0) | top-right (as top-left) → reflect(330); bottom-right (as bottom-left) → reflect(210) | reflect(270) |
| top | sy ≥ by, by + bh ≥ sy, dy > 0, free(0, −1) | bx + 1 ≤ sx ≤ bx + bw, norm(a) > 220, free(−1, 0) → reflect(30); sx + sw ≥ bx, bx + bw − 1 ≥ sx + sw, norm(a) < 320, free(1, 0) → reflect(330) | reflect(0) |
| bottom | sy + sh ≥ by, by + bh ≥ sy + sh, dy < 0, free(0, 1) | as top's corners with norm(a) < 140 → reflect(150), norm(a) > 40 → reflect(210) | reflect(180) |

Positions are the doubles, not truncated. If no side matches there's no bounce, but the stone is still hit. A
Bubbler then adds speed (§3.5).

## 7. Shots
5×20, at paddle.X + 15 and paddle.X + W − 20, Y = paddle.Y − 20. Rise 11 px/tick; removed at Y ≤ 14 or when
they hit a visible stone (the stone takes a hit without a ball: no Eater/Doubler/Killer effects).

## 8. Score, lives, levels
- Score: +500 per destroyed stone (any kind, each BeBack disappearance too), +10000 per money capsule.
  Nothing else scores.
- Lives: a new game has 3 spare lives (HUD `Lifes: 3`); 1Up adds one, up to 25.
- HUD at x 500: `FPS: n` (y 30), `Lifes: n` (60), `Score: n` (90), `Level: n` (120, course games only, 0-based:
  the first level shows `Level: 0`). Font size 12, white, Windows default font.

## 9. Flow
- **Launch**: the default course `default.cse` is loaded and a course game starts at once, fullscreen.
- **New game** (Game ▸ New): level index 0, score 0, lives 3, first level of the course, banner `Letsgo`
  (non-blocking, 100 ticks).
- **Start of a level**: everything is cleared and rebuilt (frame, new paddle, one glued ball, stones,
  background). Falling capsules, shots and extra balls vanish.
- **Ball lost**: when no balls remain: with spare lives, sound `Doh`, blocking banner `DOh` (100 ticks, the game
  freezes), paddle normal, a new glued ball, lives −1. Without, sound `MultiDoh`, blocking `GameOver` (200),
  then the high-score check (§10); with no high score a new game starts immediately.
- **Level complete** (no counting stones left, or `End`): banner `Welldone` (200 ticks) and sound `Woohoo`;
  the game keeps running (balls bounce, stones can still be hit) but capsules can't be collected and lost balls
  don't cost lives; then the next level. After the last level: sound `IMean`, blocking `CourseDone` (200), then
  the high-score check.
- **Level test** (Level ▸ Test or Load): the level in the buffer with score 0 and lives 3; completing it returns
  to the editor, game over restarts it.
- **Pause** stops the timer (no ticks, no drawing).
- Banners: X = 214 − W div 2, Y 120, 8 frames looping at 0.4 frames/tick. A new non-blocking banner replaces the
  current one. A blocking banner of n ticks runs n − 1 iterations in which only it moves; it then disappears on
  the next normal tick.
- **I:** blocking banners and the "Well done" phase ran at the display refresh rate in the original. The remake
  runs them at the tick rate (decision 7, `docs/PLAN.md`).

## 10. High scores
Per course, up to 10 entries (score, name, level index). A score qualifies with fewer than 10 entries (any
score, even 0; both shipped tables have 9) or when it beats the 10th. The game switches to a window, shows the
course editor and asks "`n`. place / Please enter your name (No blanks!)"; the entry goes before the first lower
score. Course "NoName" (unsaved) keeps none. Closing the course editor starts a new game.
File format in `docs/file-formats.md`.

## 11. Sounds (WaveList names)
Each PlaySound starts the wave once; a sound already playing isn't cut off but overlaps (MaxPlayingCount 0, O).
`Shoot` fire · `PaddleBall`/`PaddleBall2` paddle · `Abprall` stone hit, not destroyed · `Iron` Iron stone hit ·
`Klirr` stone shatters · `Crunch` Granit/Block shatters · `Bonus` Bonus stone destroyed · `Eat` Eater ·
`Double` Doubler · `BeBack` BeBack returns · `Money` money capsule · `Woohoo` 1Up and level complete ·
`Haahaa` Pad− · `Doh` ball lost · `MultiDoh` game over · `IMean` course complete. `Signal`, `StoneHit1` are in
the list but nothing plays them (O: the names don't occur in the code section).

## 12. Open points and checks in the original
- Tick rate: the remake uses 45.45 Hz (decision 6). Check the `FPS:` display in the running game.
- Ball animation after piercing ends (stays on frame 20?).
- `Level: 0` on the first level.
- The editors: `docs/re-notes.md` (Level editor, Course editor).
