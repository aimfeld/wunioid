# Inventory (2026-10-24)

What survives of *Wunioid* (1999), an Arkanoid-style brick breaker for Windows by Wunibald (Adrian),
"Freeware by Horse Productions 1999". **There is no source code.** Everything has to come from the compiled
EXE and the data files.

## Files in the repository

| File | Date | Size | What it is |
|---|---|---|---|
| `WUNIOID.EXE` | 2003-01-18 | 3,321,603 | The game: Win32 PE GUI, Delphi 3, all graphics and sounds embedded |
| `wunioid.zip` | 1999-03-24 | 1,325,293 | The release as uploaded with WS_FTP to `ln.active.ch/ivsch/public_html` (March 1999) |
| `vcl30.dpl` | 1997-01-30 | 1,230,848 | Borland's Delphi 3 VCL runtime package; the EXE needs it beside it |
| `Levels/*.lev` | 1998-10-03 … 10-17 | 443 each | 32 levels (incl. `test.lev`) |
| `default.cse` | 1998-10-10 | 1,228 | Course (level list) "default": 24 levels |
| `Mystery.cse` | 1998-10-14 | 565 | Course "Mystery": 11 levels |
| `defaultscr`, `Mysteryscr` | 2011-07 | 535 each | High scores for the two courses (played in 2011: ac, Wunibald, AC, Adi, Aceman, ACE) |
| `Levels/defaultscr`, `Levels/Mysteryscr` | 1998-10 | 4 / 224 | Older high-score files in an earlier record format (Wuni, Wooni, AC, Berni) |
| `WS_FTP.LOG` | 1999-03-24 | 178 | FTP log of the upload |

The zip holds the same 32 levels, both courses, `VCL30.DPL` and the EXE. The loose levels, courses and DPL are
byte-identical to the zip's. **The two EXEs are the same build**: the 2003 copy differs only in 9 PE header
bytes and 771 zero bytes appended to the resource section. The code and resources are identical.

## The EXE
- **Delphi 3** (runtime package `VCL30.dpl`), 113 KB of code, 845 procedures (Ghidra via REA).
- **DelphiX** (Hiroyuki Hori's DirectX components) is linked in statically: units `DXClass`, `DXDraws`,
  `DXSprite`, `DXSounds`, `ODXInput`, `DIB`, `fWave`, `HDirectX`, `PDXRender`, `DXConsts`. DirectDraw in 16-bit
  colour, DirectSound, DirectInput (keyboard and joystick; mouse disabled), `TDXSpriteEngine`, `TDXTimer`
  (interval 22 ms). DelphiX is open source, so its routines can be named from its source, like AniVGA and SMIX
  for Dark Planet.
- **Game units**: `wunioid` (main form, ~46 procedures, 0x416a00–0x41bd00), `Info`, `CourseEdit` (~7), `Project1`.
  About 53 procedures and 27 KB of code are ours, the rest is DelphiX. Ball physics uses floating point.
- **Classes**: `TForm1`, `TPaddle`, `TBall`, `TStone`, `TStoneKlirr` (breaking stone), `TBonus` (capsule),
  `TShot`, `TBackGround`, `TCreatorSprite` (editor palette), `TTextSprite`, `THighScore`, `TCourseEditor`,
  `TInfoform`.
- **Menus** (Windows menu bar): Game (New, Pause, Exit), Level (New, Edit, Test, Save as, Load), Course (Load,
  Editor). The game has a **built-in level editor** (click stones from the palette into the grid) and a
  **course editor** dialog (level list, move up/down, add, delete, high scores, reset).
- **Texts**: English, very few: `Score:`, `Lifes:`, `Level:`, `FPS:`, the high-score name prompt, editor dialogs.
  No story, no manual.
- **Resources**: the form `TFORM1` (3.2 MB) holds everything in DelphiX image and wave lists; `TCOURSEEDITOR`
  and `TINFOFORM` are the dialogs.

## Assets (all extracted, see below)
Images are DelphiX `TDIB` (BITMAPINFOHEADER + pixels, 8/16/24 bpp); sounds are plain RIFF WAV.

| List | Count | Content |
|---|---|---|
| `StoneImageList` | 36 | 13 stone types (Gem green/blue/red/orange/violet animated 11 frames, Granit, Block, BeBack, Bubbler, Eater, Doubler, Goldie, Killer), 16 bonus capsules (19-frame rotation: $Red/Green/Blue/Orange/Violet, 1Up, Gun, Glue, Pad+, Pad−, 2xo, 5xo, −−o, Big, Zup, End), 7 shatter animations (60×40, 9 frames) |
| `GameImageList` | 12 | Paddle (normal, long, short, gun), Ball (21 frames, 12 px), MegaBall (20 frames, 20 px), Shot, Creator (editor palette), 4 attribute labels (Bonus, Move, Hike, Iron) |
| `BackGndImageList` | 10 | Frame "Rahmen" 428×480, 9 background tiles 40×40 |
| `TextImageList` | 7 | Animated text: Game Over!, D'Oh!, Shoot 'em!, 1 Up, Well Done!, Let's go!, Course Done! |
| `WaveList` | 19 | 11025 Hz 8-bit mono: Signal, PaddleBall, PaddleBall2, StoneHit1, Bonus, Klirr, Doh, MultiDoh, Woohoo, Money, Shoot, Abprall, Crunch, Eat, Double, BeBack, IMean, Iron, Haahaa |

Stones are 30×15, the playfield frame is 428×480, so the game runs at 640×480 (true colour) with the HUD beside
the playfield (to be confirmed). Graphics are 3D-rendered. There is **no music**. Several samples (Doh,
MultiDoh, Woohoo, Haahaa, IMean) are probably clips from *The Simpsons*; to be checked by ear.

All files above now live in `original_source/` (moved there on 2026-10-24, unchanged).

## File formats (first pass, to be verified against the code)
- **`.lev`** (443 bytes): 13 columns × 17 rows, stored **column by column**, 2 bytes per cell = (stone type,
  attribute), then 1 byte background tile. Stone type 0 = empty, 1–13 in the order of the EXE's name table
  (GemGreen, GemBlue, GemRed, GemOrange, GemViolet, Granit, Block, Bubbler, Eater, Doubler, BeBack, Goldie,
  Killer). Attribute 0 = none, 1–4 = Bonus, Move, Hike, Iron. Verified by rendering all levels
  (`tools/extract_assets.py`): Hi, Flower, Batman, Titanic etc. come out as their names say.
- **`.cse`**: `u32` count, then `string[50]` file names (51 bytes each).
- **`<course>scr`** (high scores): `u32` count, then 59-byte records: a `ShortString` "score␣␣␣name", …,
  `i32` score, `i32` level. The 1998 files use 55-byte records (score at the end only).

## Extraction tools
- `tools/delphi_dfm.py`: parses Delphi binary form streams (TPF0) from the EXE's resources into a component tree.
- `tools/extract_assets.py`: image lists → PNG, wave list → WAV, levels → PNG renders, plus `assets.json`
  (names, pattern sizes, transparency, level grids), into `original_source/extracted/` (local only).

## What we don't have
- Source code (Delphi `.pas`/`.dfm`), DelphiX version used, the 3D scenes behind the graphics.
- A way to watch the original here yet. Wine 9.0 is installed and starts the game, but the game switches to a
  fullscreen display mode, which Wine can't set on this multi-monitor desktop (`ChangeDisplaySettings` returns
  −2), and inside a Wine virtual desktop it quits. Next try: a virtual X server (Xvfb) at 640×480×16.
- The rules: ball speed, angles, bonus effects, stone behaviours (Move, Hike, Eater, Doubler, BeBack, Bubbler,
  Killer…), scoring, lives. All of that is in the ~53 game procedures.
