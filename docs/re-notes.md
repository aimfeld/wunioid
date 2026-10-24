# Reverse-engineering notes (findings ledger)

Each finding is marked **Observed** (seen directly in bytes or disassembly), **Inferred** (reasoned from
observations) or **Unknown**. Addresses are virtual addresses in `WUNIOID.EXE` (image base 0x400000). REA
Evidence IDs are from session 2 (2026-10-24); they identify the analysis that was run but aren't portable.

The rules that follow from these findings are written up in `docs/gameplay-spec.md`.

## Tools and how to reproduce (session 2)
- `tools/delphi_rtti.py`: lists the Delphi 3 classes from their VMTs (self pointer at VMT−64, class name at
  −32, instance size −28, parent −24, field table −44, method table −40), with published methods, published
  fields and the virtual slots each class overrides. `--json` writes the same as JSON.
- `tools/ghidra_dump.sh [start] [end] [name]`: Ghidra 12.1.4 headless with `tools/ghidra/DumpGame.java`. It
  creates the functions auto-analysis misses (Ghidra's analysis only finds procedures reached by direct calls;
  every event handler and virtual method is reached through a method table or VMT), then writes decompiled C and
  assembly of every function in the range to `original_source/extracted/ghidra/<name>.txt`. Default: the game
  units 0x416a00–0x41d600 → `game.txt` (105 functions).
- `tools/ghidra/consts.py`: decodes the x87 constants (`_DAT_` symbols) a dump references, in the size the
  instruction loads (`float`, `double`, `extended`). Ghidra's C mangles the x87 stack in the ball code, so the
  ball physics were read from the assembly, not the C.
- The REA MCP server can't create functions, so it can't decompile handlers it didn't find. It was used for
  the DelphiX library routines Ghidra did find (`ev_50b4b620…`, `ev_f49511c8…`, `ev_44c4f37f…`).

## Classes (Observed, `tools/delphi_rtti.py`)
| VMT | Class | Size | Parent | Overrides |
|---|---|---|---|---|
| 0x41676c | TForm1 | 0x280 | TDXForm | — |
| 0x416ae8 | TPaddle | 0x6c | TImageSprite | DoMove 0x416ed8, Create 0x416e20 |
| 0x416b48 | TBall | 0x80 | TImageSprite | DoMove 0x418ac0, Create 0x4189c4 |
| 0x416ba8 | TBonus | 0x60 | TImageSprite | DoMove 0x41994c (Create 0x419554 is static) |
| 0x416c08 | TStone | 0x78 | TImageSprite | DoMove 0x417cd4, new virtual slot 6 `Hit` 0x417ff8 |
| 0x416c6c | TStoneKlirr | 0x5c | TImageSprite | DoMove 0x41899c |
| 0x416cd0 | TShot | 0x5c | TImageSprite | DoMove 0x419da8, Create 0x419d10 |
| 0x416d30 | TBackGround | 0x5c | TImageSprite | Create 0x419e18 |
| 0x416d94 | TCreatorSprite | 0x5c | TImageSprite | Create 0x41aa14 |
| 0x416dfc | TTextSprite | 0x60 | TImageSprite | DoMove 0x419fec |
| 0x41bc58 | TInfoform | | TForm | |
| 0x41bdbc | TCourseEditor | 0x230 | TForm | 12 published handlers |
| 0x41c11c | THighScore | 0xc | TObject | fields +4 score, +8 level |

DelphiX `TSprite` virtual slots (Observed from the VMTs of TSprite 0x40e14c / TImageSprite 0x40e1ac, and what
each override does): 0 DoCollision, 1 DoDraw, 2 DoMove(MoveCount), 3 GetBoundsRect, 4 TestCollision,
5 constructor Create(AParent). TImageSprite overrides 1–5.

DelphiX field offsets used by the game (Observed in the DelphiX routines and their use): +4 Engine, +8 Parent,
+0x10 Deaded, +0x1a Visible, +0x1c X (double), +0x24 Y (double), +0x2c Z, +0x30 Width, +0x34 Height,
+0x38 AnimCount, +0x3c AnimLooped, +0x40 AnimPos (double), +0x48 AnimSpeed (double), +0x54 Image, +0x58
PixelCheck.

## Procedure names
Published handlers come from TForm1's method table (Observed). Other names are ours (Inferred from what the
code does).

| Address | Name | Notes |
|---|---|---|
| 0x416e20 | TPaddle.Create | x 200, y 430, Z 2, image `Paddle` |
| 0x416ed8 | TPaddle.DoMove | timers, input, glued balls, release, fire |
| 0x4171b0 | TPaddle.Fire | two shots, cooldown 15, sound `Shoot` |
| 0x41724c | TPaddle.BallOffset | Round(2 × (paddle centre − ball centre)) |
| 0x417298 | TPaddle.AddScore | score += n |
| 0x4172a0 | TPaddle.SetKind | 0 normal, 1 gun (timer 500), 2 long, 3 short |
| 0x41739c | TStone.Create(kind, row, col) | |
| 0x417948 | TStone.MoveBlocked | both side neighbours blocked |
| 0x4179d8 | TStone.BlockedSides | nested, counts blocked sides (0–4) |
| 0x417a6c | DirToDelta | nested: 1 right, 2 up, 3 left, 4 down |
| 0x417ac4 | TStone.HikeStep | nested in DoMove |
| 0x417cd4 | TStone.DoMove | Move, BeBack, Hike |
| 0x417dec | TStone.Goldify | nested in Hit |
| 0x417ff8 | TStone.Hit(ball or nil) | virtual slot 6 |
| 0x418614 | TStone.Shatter | TStoneKlirr + sound |
| 0x41868c | TStone.Counts | counts towards level completion |
| 0x4186a8 | TStoneKlirr.Create | |
| 0x41899c | TStoneKlirr.DoMove | dies on its last frame |
| 0x4189c4 | TBall.Create | glued to the paddle |
| 0x418ac0 | TBall.DoMove | |
| 0x418d50 | TBall.NeighbourFree | nested in BounceOffStone |
| 0x418e14 | TBall.BounceOffStone | |
| 0x419378 | TBall.SetDirection | dx = cos, dy = −sin |
| 0x4193f0 | TBall.NormAngle | |
| 0x419428 | TBall.Reflect(axis) | |
| 0x419454 | TBall.MakePiercing | 400 ticks |
| 0x419498 | TBall.MakeMegaBall | 300 ticks, then splits |
| 0x419554 | TBonus.Create | |
| 0x41994c | TBonus.DoMove | |
| 0x4199ac | TBonus.Collect | |
| 0x419d10 | TShot.Create | |
| 0x419da8 | TShot.DoMove | (0x419da0 is the literal `Shot`, not code) |
| 0x419df0 | TShot.HitStone | |
| 0x419e18 | TBackGround.Create | frame `Rahmen` |
| 0x419eac | TTextSprite.Create(name, blocking, ticks) | |
| 0x419fec | TTextSprite.DoMove | |
| 0x41a010 | TForm1.Collisions | paddle/ball, ball/stone, shot/stone, moving stones, bonus/paddle |
| 0x41a5dc | TForm1.StartLevel | |
| 0x41a68c | TForm1.StartTest | state 2 |
| 0x41a6a4 | TForm1.StartGame | state 1 |
| 0x41a784 | TForm1.PlayTick | |
| 0x41a940 | TForm1.StartEditor | state 3 |
| 0x41a9b8 | TForm1.ShowCourseEditor | state 4 |
| 0x41a9dc | TForm1.CourseEditorTick | |
| 0x41a9f4 | TForm1.EditorTick | |
| 0x41aa9c / 0x41aab8 | ColOfX / RowOfY | editor |
| 0x41aad4 | DrawMouseDown | published, editor |
| 0x41ae50 | TForm1.CreateStones | |
| 0x41aed0 | TForm1.CreateBackground | tiles |
| 0x41afb0 | TForm1.ShowText(name, ticks, blocking) | |
| 0x41b044 | TForm1.NextLevel | |
| 0x41b168 | TimerTimer | published |
| 0x41b230 | TForm1.DrawFrame | |
| 0x41b288 | Exit1Click | published |
| 0x41b290 | TForm1.GoFullscreen | 640×480×16 |
| 0x41b314 | TForm1.GoWindowed | client 640×480 |
| 0x41b434 | TForm1.Init | called from the program block |
| 0x41b4b4 | TForm1.LevelDone | |
| 0x41b540 | TForm1.PlaySound(name) | |
| 0x41b560 | TForm1.DrawHud | |
| 0x41b704 | TForm1.ClearLevel | |
| 0x41b798 | TForm1.LastLevelIndex | |
| 0x41b7b4 … 0x41bbb4 | Neu1Click, SoundInitialize, New1Click, Save1Click, Load1Click, Pause1Click, Test1Click, Create1Click, Editor1Click, Load2Click | published |
| 0x41b9d8 | TForm1.LoadLevel(name) | |
| 0x41c128 / 0x41c58c | TCourseEditor.SaveHighScores / LoadHighScores | |
| 0x41c318 | TCourseEditor.SaveCourseAs | |
| 0x41c7c8 | TCourseEditor.RemoveMissingLevels | |
| 0x41c898 | TCourseEditor.LoadCourse(name) | |
| 0x41ca28 | TCourseEditor.IsHighScore(score) | |
| 0x41ca78 | TCourseEditor.HighScorePlace | nested |
| 0x41cb34 | TCourseEditor.AddHighScore(score, level) | |
| 0x41cd40 | TCourseEditor.ClearHighScores | |
| 0x41cdac … 0x41d22c | Close1Click, FormClose, AddClick, DeleteClick, MoveUpClick, MoveDownClick, New1Click, Saveas1Click, Open1Click, HighScoreResetClick, HighScoreListBoxClick, Info1Click | published |
| 0x41d400 | program block | creates Form1, CourseEditor, Infoform; Init; Timer.Enabled := True |

DelphiX routines called by the game (Observed from their code):
0x40d8f4 TPictureCollection.Find(name) (raises if missing), 0x40d8d8 GetItem(index), 0x40d244 / 0x40d160 /
0x40d1fc pattern width / height / count, 0x40e67c TSprite.Dead, 0x40e888 TSprite.SetZ, 0x40e8b0
TImageSprite.Create, 0x40e968 TImageSprite.DoMove (`ev_50b4b620…`), 0x40e8e4 TImageSprite.GetBoundsRect,
0x40efe0 TImageSprite.TestCollision, 0x40e6a8 TSprite.TestCollision (returns True), 0x402aa8 OverlapRect,
0x40f7b8 SpriteEngine.Move, 0x40f790 / 0x40f684 SpriteEngine.Dead, 0x40f79c SpriteEngine.Draw, 0x413450
TCustomDXInput.Update, 0x40c224 TCustomDXDraw.CanDraw, 0x40c1f4 Flip, 0x416460 TWaveCollection.Find,
0x416198 TWaveCollectionItem.Play, 0x402e8c TCustomDXTimer idle handler (`ev_44c4f37f…`).

## Globals (Observed, BSS/DATA)
| Address | Meaning |
|---|---|
| 0x41e274 | game state: 0 none, 1 course game, 2 level test, 3 level editor, 4 course editor shown |
| 0x41e278 | requested state (initial value 1: a course game starts at launch) |
| 0x41e27c | go fullscreen on the next tick (initial value 1) |
| 0x420c98 | Form1 |
| 0x420ca0 | the paddle |
| 0x420ca4 | stone grid `TStone[15][19]`, index col × 19 + row, cols 1–13 and rows 1–17 used, the rest nil |
| 0x421118 | background tile sprite |
| 0x421120 | the level buffer (443 bytes, the `.lev` file) |
| 0x4212da | = level byte 442, background tile 1–9 (0 = none) |
| 0x4212dc | score |
| 0x4212e0 | spare lives |
| 0x4212e4 | stones left (counting stones only) |
| 0x4212e8 | level index in the course (0-based) |
| 0x4212ec | `End` capsule collected |
| 0x4212f0 | current non-blocking text sprite |
| 0x4212f4 | level-done phase (capsules can't be collected) |
| 0x421300 / 0x421304 / 0x421308 | CourseEditor, base directory, course file name |
| Form1+0x274 / +0x278 / +0x27c | TLists of shots, balls, capsules |

## Timing (session 2)
- **Observed:** TimerTimer (0x41b168) never reads `LagCount` (ECX). PlayTick (0x41a784) calls
  `SpriteEngine.Move(20)`: every sprite's `DoMove` gets MoveCount = 20 every tick, regardless of elapsed time.
  So the game is **frame-locked**: speeds below are per tick.
- **Observed:** the form's `TDXTimer`: Interval 22, ActiveOnly. Its idle handler (0x402e8c) fires when
  `timeGetTime − last ≥ Interval` and then sets `last := now` (not `last + Interval`), so the period is at least
  22 ms. FrameRate (shown as `FPS:`) is ticks per second.
- **Observed:** `TDXDraw` options include `doFlip` and `doWaitVBlank`; each tick ends with `Flip`.
- **Inferred:** the nominal rate is 1000/22 ≈ 45.5 ticks/s. With 1 ms `timeGetTime` and a 60 Hz display, Flip
  waits for the next vertical blank within the 22 ms, so the rate stays 45.5 Hz with uneven frame pacing. On
  machines where `timeGetTime` had coarse resolution it would have been slower. **Unknown:** the rate the user
  saw in 1999; the in-game `FPS:` display in Wine would tell.
- **Observed:** blocking text banners (`ShowText` with blocking = True) and the "Well done" phase run their own
  loops that call DoMove, collisions and DrawFrame directly, without the timer. **Inferred:** they ran at the
  display refresh rate (Flip with vsync), so they were faster than normal play on displays above 45 Hz.

## Display and input (Observed)
- `GoFullscreen` (0x41b290): DXDraw display 640×480, 16 bpp, fullscreen option. `GoWindowed` (0x41b314):
  client area 640×480. Startup (0x41b434) goes windowed, the first tick goes fullscreen (0x41e27c).
- Keyboard assigns (form `Input.Keyboard.Assigns`, 36 states × 3 virtual keys): Up = K / ↑ / Num8, Down = J /
  ↓ / Num2, Left = H / ← / Num4, Right = L / → / Num6, Button1 = Z / Space, Button2 = X / Enter (DelphiX
  defaults). The joystick is bound too; the mouse is disabled. The game reads `Input.States` bits 0 Up, 2 Left,
  3 Right, 4 Button1 (paddle DoMove).
- HUD (0x41b560): canvas text, font size 12, white, transparent, at x 500: `FPS: n` y 30, `Lifes: n` y 60,
  `Score: n` y 90, and in course games `Level: n` y 120. **Observed:** the level shown is the 0-based course
  index (0x4212e8), so the first level shows `Level: 0`.
- Sound: primary buffer format 22050 Hz, 8 bit, mono (SoundInitialize 0x41b7bc). `PlaySound` finds the wave by
  name and plays it once, non-looping.

## Gameplay findings (session 2)
All Observed in the procedures named, unless marked. The spec has them as rules.

### Angles and the ball's direction
- The ball stores an integer angle in degrees (+0x60), speed (+0x64) and direction dx (+0x6a), dy (+0x70) as
  6-byte `Real`s. `SetDirection` (0x419378): dx = cos(a·2π/360), dy = −sin(a·2π/360) (`FCHS`): 90° = up.
  Constants: 2π (extended @0x4193d8), 1/360 (extended @0x4193e4).
- `NormAngle` (0x4193f0): `if a > 0 then |a mod 360| else |a mod 360 + 1440|` with truncating `mod`. Values ≤ 0
  are **not** brought into 0…359 (e.g. −255 → 1185, 0 → 1440). Comparisons against NormAngle results inherit
  this quirk.
- `Reflect(axis)` (0x419428): a := NormAngle(2·axis − NormAngle(a)), then SetDirection. Axes used: 0 and 180
  (horizontal surfaces), 90 and 270 (vertical), 30, 150, 210, 330 (corners).
- `BallOffset` (0x41724c): Round((paddle.X + paddle.W div 2 − (ball.X + ball.W div 2)) × 2.0) (constant
  2.0 float @0x417294; `FSUBP` = paddle − ball). Round is the x87 default, round half to even.

### Ball (TBall)
- Create (0x4189c4): image `Ball` (12×12, AnimCount 0, so frame 0), X = paddle.X + paddle.W div 2, Y = paddle.Y
  − 12, Z 2, speed 3.0 (`Real` bytes 82 00 00 00 00 40), angle 75, glued, not piercing; added to the ball list.
- DoMove (0x418ac0), per tick, in this order: inherited DoMove (animation); if NormAngle mod 90 = 0 then angle
  += 1; if 170 ≤ NormAngle ≤ 190 then angle := 168 (if < 181) or 192; mega-ball timer (+0x78) runs out → the
  ball dies and 3 balls (if fewer than 30) appear at its centre with angles 30, 150, 270; piercing timer
  (+0x7c) runs out → piercing off, AnimPos 0, AnimLooped off. If not glued: wall checks then move:
  dx < 0 and X < 14 → Reflect(270); dx > 0 and X + W > 414 → Reflect(90); dy < 0 and Y < 14 → Reflect(180);
  dy > 0 and Y + H > 500 → the ball dies; then X += MoveCount·0.1·speed·dx, Y += MoveCount·0.1·speed·dy
  (0.1 extended @0x418d44). Finally the bounced-this-tick flag (+0x5c) is cleared.
- **Inferred:** only the near-horizontal band around 180° is guarded; angles near 0°/360° are not.
- **Inferred:** after the piercing timer the looping stops but AnimSpeed stays, so the ball animates once to
  its last frame (frame 20) and stays there. To check in the game.

### Paddle (TPaddle)
- Create (0x416e20): X 200, Y 430 (doubles 0x4069…, 0x407ae…), Z 2, timers 0, kind 0.
- DoMove (0x416ed8): shot cooldown (+0x60) −1 if > 0; gun timer (+0x5c) −1 if > 0 and at 0 → kind normal;
  glue timer (+0x64) −1 if > 0. Left held and X > 14 → X −= 0.3·MoveCount (0.3 extended @0x4171a0, so 6 px),
  and glued balls move with it. Right held and X + W < 414 → X += 6, glued balls too. Up or Button1 held → every
  glued ball is released: angle := BallOffset + 90, clamped to 20…160, unglued.
  Button1 held, gun timer > 0, cooldown 0 and kind = gun → Fire.
- Fire (0x4171b0): shots at X + 15 and X + W − 15 − 5, Y = paddle.Y − 20; cooldown 15; sound `Shoot`.
- SetKind (0x4172a0): 0 `Paddle` 80 px, 1 `PaddleGun` 80 px and gun timer 500, 2 `PaddleLong` 120 px, 3
  `PaddleShort` 40 px. Width and height are taken from the image.

### Collisions (TForm1.Collisions 0x41a010), once per tick after all DoMoves
All tests are `OverlapRect` of `GetBoundsRect` = Bounds(Trunc(X), Trunc(Y), W, H) (0x40e8e4), strict `<`.
PixelCheck is never set, so TestCollision is always True.
1. Each ball (first to last) that isn't glued, overlaps the paddle, has dy > 0 and Y < paddle.Y: Reflect(0);
   angle := NormAngle(angle) + BallOffset; clamp 20…160; SetDirection; if glue timer > 0: glued, Y := paddle.Y −
   H. Sound `PaddleBall` or `PaddleBall2` (Random(2)).
2. Each ball (last to first) that isn't glued, against each visible stone (col 1…13 outer, row 1…17 inner):
   overlap → BounceOffStone. The loop re-checks that the ball index is still valid (an Eater removes balls).
3. Each shot (last to first) against each visible stone: overlap → the stone is hit with no ball, the shot
   dies.
4. Each Move stone against every other visible stone: overlap → direction := −1 if its X ≤ the other's X,
   else +1.
5. Unless in the level-done phase, each capsule (last to first) overlapping the paddle is collected.

### BounceOffStone (0x418e14), ball against one stone
Skipped if the ball already bounced this tick (+0x5c). If the ball is piercing and the stone isn't Granit, no
bounce happens but the stone is hit. Otherwise four side tests in order, each with corner sub-tests; the first
that applies reflects the ball. `F(dc, dr)` = NeighbourFree (0x418d50): column col+dc outside 1…13 → False;
the neighbour cell (col+dc, row+dr) is empty, or a Move stone that isn't blocked, → True; a visible neighbour,
unless this stone is a Move stone, → False; else True. (bx, by, bw, bh) = ball, (sx, sy, sw, sh) = stone.
- Left side: sx ≥ bx, bx + bw ≥ sx, dx > 0, F(−1, 0):
  top-left corner if by + 3 ≤ sy ≤ by + bh, dy > 0, F(0, −1) → Reflect(30);
  else bottom-left if sy + sh ≥ by, by + bh − 3 ≥ sy + sh, dy < 0, F(0, 1) → Reflect(150);
  else Reflect(90).
- Right side: sx + sw ≥ bx, bx + bw ≥ sx + sw, dx < 0, F(1, 0): top-right (same test as top-left) →
  Reflect(330); bottom-right → Reflect(210); else Reflect(270).
- Top: sy ≥ by, by + bh ≥ sy, dy > 0, F(0, −1): top-left if bx + 1 ≤ sx ≤ bx + bw, NormAngle > 220, F(−1, 0)
  → Reflect(30); top-right if sx + sw ≥ bx, bx + bw − 1 ≥ sx + sw, NormAngle < 320, F(1, 0) → Reflect(330);
  else Reflect(0).
- Bottom: sy + sh ≥ by, by + bh ≥ sy + sh, dy < 0, F(0, 1): bottom-left (as above), NormAngle < 140 →
  Reflect(150); bottom-right, NormAngle > 40 → Reflect(210); else Reflect(180).
Then `stone.Hit(ball)` in every case (bounce or not); a bounce sets the ball's bounced flag. A Bubbler hit
with speed < 6 adds 0.5 to the speed (constants 6 @0x419370, 0.5 @0x419374).

### Stones (TStone)
- Create (0x41739c): kind and attribute from the level buffer, X = (col − 1)·30 + 19, Y = (row − 1)·15 + 19,
  Z 2. Kinds (case statement; the literal pool is in a different order): 1 GemRed, 2 GemOrange, 3 GemGreen,
  4 GemBlue, 5 GemViolet, 6 Granit, 7 Block, 8 Bubbler, 9 Eater, 10 Doubler, 11 BeBack, 12 Goldie,
  13 Killer. Attributes 1 Bonus, 2 Move, 3 Hike, 4 Iron. Hits: gems, Bubbler, Goldie 1; Block, BeBack 2;
  Eater, Doubler, Killer 3; Granit 25. Animated (all patterns, looping, AnimSpeed 0.02, random start frame):
  attribute Bonus, Bubbler, Eater, Doubler, Killer. Move direction (+0x70) 2 = not started. Timer (+0x74) 0,
  or 10 for a stone made by a Hike step. In the editor (state 3) an attribute label sprite is added.
- **Correction (session 2):** `tools/extract_assets.py` and `docs/inventory.md` had the gem order of the
  literal pool (GemGreen first). Fixed: kind 1 is GemRed.
- Counts (0x41868c): kind not Granit and not 8…13, and attribute not Iron. Only gems and Block count towards
  "stones left"; counted at creation (not for Hike copies).
- DoMove (0x417cd4): Move: unless MoveBlocked (both side cells hold a stone that isn't an unblocked Move stone,
  or are the wall), direction 2 → 1, X += 0.1·MoveCount·direction (2 px), X < 14 → +1, X + W > 414 → −1. The
  grid cell doesn't change while a Move stone slides. BeBack hidden: timer −1, at 0 visible again, sound
  `BeBack`, hits 2. Hike: timer −1, < 1 → HikeStep.
- HikeStep (0x417ac4): tries its direction (1 right, 2 up, 3 left, 4 down; 2 at first); if that cell is empty
  and inside cols 1…13, rows 1…17, it moves there. Otherwise tries directions 1…4 in order, only those
  perpendicular to the current one, or all of them if 3 sides are blocked (BlockedSides 0x4179d8), and takes the
  first empty cell, making it the new direction. Moving = a new stone (same kind, attribute Hike, timer 10, hits
  and direction copied) in the new cell, the old one dies.
- Hit (0x417ff8), with the ball or nil (shot):
  1. Attribute Bonus: a capsule by gem kind at the stone's position: Red Random(6): 0–3 $Red, 4 1Up, 5 Gun;
     Orange Random(5): 0–3 $Orange, 4 Big; Green Random(7): 0–3 $Green, 4 Glue, 5 Pad+, 6 Pad−; Blue
     Random(10): 0–5 $Blue, 6–7 2xo, 8 −−o, 9 5xo; Violet Random(10): 0–7 $Violet, 8 Zup, 9 End. Other kinds
     with Bonus drop nothing.
  2. Eater and a ball: the ball dies; sound `Eat` if other balls remain.
  3. Doubler, a ball, fewer than 30 balls: a new ball at the same place, angle = ball angle + Random(20) − 10;
     sound `Double`.
  4. Goldie: every existing neighbour of the 8 that isn't Iron or Move becomes a Goldie (kind 12, image
     `Goldie`, not animated, visible, no attribute, 1 hit); a neighbour that counted is uncounted.
  5. Killer and a ball: the ball becomes piercing.
  6. Hits −1 unless Iron. A piercing ball against a stone that isn't Granit, Killer or Iron: hits := 0.
  7. Hits < 1: BeBack hides (invisible, timer 300), score +500. Any other kind: uncounted if it counted; sound
     `Bonus` for the Bonus attribute, else Shatter (sound `Crunch` for Granit and Block, `Klirr` otherwise); the
     stone dies, its cell is cleared, score +500.
  8. Hits > 0: sound `Iron` for Iron, else `Abprall`.
- Shatter (TStoneKlirr 0x4186a8): image by kind (gems their colour, Granit `ZGranit`, Block and BeBack
  `ZBlock`, Bubbler/Eater/Doubler `ZGemBlue`, Goldie `ZGemOrange`, Killer `ZGemRed`), at X − 15, Y − 10, Z 3,
  AnimSpeed 0.06 (×20 = 1.2 frames per tick), not looping; dies when AnimPos = AnimCount − 1 (DelphiX clamps a
  non-looping animation there).

### Capsules (TBonus) and their effects (TBonus.Collect 0x4199ac)
- Create (0x419554): image by number, at the stone's X, Y, Z 3, 19 frames looping at 0.4 per tick from frame 0.
  DoMove (0x41994c): Y += 0.16·MoveCount (3.2 px, 0.16 extended @0x41999c); dies at Y > 500.
- Numbers and effects: 1 $Red, 4 $Blue, 8 $Green, 12 $Orange, 14 $Violet: score +10000, sound `Money`.
  2 1Up: lives +1 (if < 25), sound `Woohoo`, text `1up` 100. 3 Gun: paddle kind gun (500 ticks), text
  `Shootem` 100. 5 2xo: each ball (last to first, while fewer than 30) gets a copy at its position with angle
  ± Random(20)−10. 6 −−o: every ball becomes piercing (400 ticks). 7 5xo: 5 new glued balls at paddle.X +
  (i−1)·(W div 4) − 6, i = 1…5 (if fewer than 30). 9 Glue: glue timer 800. 10 Pad+: long paddle. 11 Pad−:
  short paddle, sound `Haahaa`. 13 Big: a new glued ball becomes a mega ball. 15 Zup: all Granit stones die
  (no score, no shatter). 16 End: level finished (course games only).
- MakePiercing (0x419454): piercing timer 400, piercing on, the image animates (all patterns, looping, 0.02,
  random start). It doesn't change the image.
- MakeMegaBall (0x419498): piercing, image `MegaBall` (20×20, animated), mega timer 300, Y = paddle.Y − 20,
  X += Random(20) − 10. It stays glued until released; at the end of the timer it splits into 3 (see Ball).

### Shots (TShot)
- Create (0x419d10): image `Shot` (5×20), Z 3, added to the shot list. DoMove (0x419da8): Y −= 11 per tick
  (not scaled by MoveCount); dies at Y ≤ 14. Hitting a stone: Hit(nil), the shot dies.

### Text banners (TTextSprite)
- Create (0x419eac): image from TextImageList, X = 214 − W div 2, Y = 120, Z 20, all patterns looping at 0.02
  (0.4 frames per tick), counter = ticks. DoMove (0x419fec) counts down and dies at 0.
- ShowText (0x41afb0): a non-blocking banner replaces the previous one. A blocking banner runs its own loop
  (DoMove(20), free dead sprites, DrawFrame) until it ends; nothing else moves.
- Used: `Letsgo` 100 (new game), `DOh` 100 blocking (ball lost), `GameOver` 200 blocking, `1up` 100,
  `Shootem` 100, `Welldone` 200 (non-blocking, with the level-done loop), `CourseDone` 200 blocking.

### Flow (PlayTick 0x41a784, TimerTimer 0x41b168)
- TimerTimer: first tick goes fullscreen; Input.Update; a requested state change starts that state (1
  StartGame, 2 StartTest, 3 StartEditor, 4 ShowCourseEditor); otherwise the state's tick (PlayTick for 1 and 2);
  DrawFrame unless state 4.
- PlayTick: SpriteEngine.Move(20); Collisions; free dead sprites. No balls left: lives > 0 → sound `Doh`,
  blocking `DOh`, paddle normal, new ball, lives −1. No lives → sound `MultiDoh`, blocking `GameOver`; course
  game: a high score → windowed course editor and the name prompt, else a new game at once; test: restart.
  Stones left = 0 → LevelDone, then NextLevel (course) or back to the editor (test). `End` collected in a
  course game → LevelDone and NextLevel.
- LevelDone (0x41b4b4): `Welldone` 200 and sound `Woohoo`; capsules can't be collected; loop of Input.Update,
  Move(20), Collisions, free, DrawFrame until the banner ends. Lives aren't checked in this loop.
- NextLevel (0x41b044): next course entry → LoadLevel and StartLevel; after the last: sound `IMean`, blocking
  `CourseDone` 200, then high score as at game over.
- StartGame (0x41a6a4): level index 0, score 0, lives 3, load `default.cse` if the course is empty, first
  level, StartLevel, `Letsgo` 100. StartTest (0x41a68c): score 0, lives 3, StartLevel with the level in the
  buffer.
- StartLevel (0x41a5dc): clear all sprites; new lists; frame `Rahmen` (0, 0, Z 0); a new paddle (so all paddle
  timers reset); a ball; stones; background tiles (TBackgroundSprite at 14, 14, Z 1, 10×12 tiles of
  `Tile<n>` 40×40); hide the cursor; `End` and level-done flags off.
- DrawFrame (0x41b230): if CanDraw: fill black, SpriteEngine.Draw (sorted by Z), HUD in states 1–2, Flip.
- Pause1Click toggles the menu check and `Timer.Enabled`.

### High scores and courses (CourseEdit)
- IsHighScore: fewer than 10 entries, or the score beats the last entry. HighScorePlace: the first entry with a
  lower score, else the end. AddHighScore: InputBox "`n`. place" / "Please enter your name (No blanks!)"; list
  text = `score` + 3 spaces + name; keeps 10; saves. Nothing is saved for course "NoName".
- High-score file name = `ChangeFileExt(course, 'scr')` → `default.cse` gives `defaultscr` (no dot).
- LoadCourse: `<base>\<name>`, then the high scores, then drops entries whose `<base>\Levels\<file>` is
  missing.
- See `docs/file-formats.md`.

## Open questions
- **Unknown:** the editor (DrawMouseDown 0x41aad4, palette `Creator` at 460, 50) is only partly read; it's
  needed in Phase 4.
- **Unknown:** the tick rate the original actually ran at (see Timing).
- **To check in the game:** the ball's animation after piercing ends; whether the 170°–190° guard and the
  missing 0°/360° guard are visible in play; `Level: 0` on the first level.
