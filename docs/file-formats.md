# File formats

Verified against the code (session 2, addresses in `docs/re-notes.md`) and the files in `original_source/`.
All integers little-endian. `string[50]` is a Delphi ShortString: 1 length byte + 50 bytes, unused bytes
undefined.

## Level `.lev` (443 bytes)
Read and written whole with `BlockRead`/`BlockWrite` of 0x1bb bytes into the level buffer (`LoadLevel`
0x41b9d8, `Save1Click` 0x41b824). Files live in `<game dir>\Levels\`.

| Offset | Size | Content |
|---|---|---|
| 0 | 442 | 13 columns × 17 rows, **column by column**: cell (col, row), 1-based, at `(col−1)·34 + (row−1)·2` |
| +0 of a cell | 1 | stone kind: 0 empty, 1 GemRed, 2 GemOrange, 3 GemGreen, 4 GemBlue, 5 GemViolet, 6 Granit, 7 Block, 8 Bubbler, 9 Eater, 10 Doubler, 11 BeBack, 12 Goldie, 13 Killer |
| +1 of a cell | 1 | attribute: 0 none, 1 Bonus, 2 Move, 3 Hike, 4 Iron |
| 442 | 1 | background tile: 0 none, 1–9 = `Tile1`…`Tile9` |

The kind numbers come from the case statement in `TStone.Create` (0x41739c). (The string literals before that
procedure are in another order, which misled the first pass.)

## Course `.cse`
Loaded from the game directory (`LoadCourse` 0x41c898), saved by the course editor (0x41c318).

| Offset | Size | Content |
|---|---|---|
| 0 | 4 | `u32` number of levels n |
| 4 + 51·i | 51 | `string[50]` level file name (relative to `Levels\`) |

`default.cse` = 4 + 24 × 51 = 1228 bytes, `Mystery.cse` = 4 + 11 × 51 = 565 bytes. When a course is loaded,
entries whose file doesn't exist in `Levels\` are dropped from the list.

**In the remake** (`game/src/storage.ts`): the player's levels, courses and high scores are kept in
`localStorage` in these same formats, base64, under `wunioid.level.<file>`, `wunioid.course.<file>` and
`wunioid.scores.<file>`, over the shipped files of the same name. Imported files must have these sizes (443
bytes for a level, 4 + 51 n for a course); downloads are the files as the original writes them.

## High scores `<course>scr`
The name is `ChangeFileExt(course, 'scr')` with no dot: `default.cse` → `defaultscr`. Read by 0x41c58c,
written by 0x41c128 after every new entry; course "NoName" has none.

| Offset | Size | Content |
|---|---|---|
| 0 | 4 | `u32` number of entries n (at most 10) |
| 4 + 59·i | 51 | `string[50]` list text: score in decimal, 3 spaces, name |
| +51 | 4 | `i32` score |
| +55 | 4 | `i32` level index reached (0-based; 23 = the last level of `default`) |

Entries are sorted by score, highest first. Example (`defaultscr`, 2011): `5146000   ac`, 5146000, 23.

The 1998 files in `Levels/` (`defaultscr` 4 bytes, `Mysteryscr` 224 bytes) use an older 55-byte record (no
level field) from an earlier build; this EXE doesn't read that format correctly (I).
