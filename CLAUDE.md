# CLAUDE.md

Remake of *Wunioid* (1999 Windows brick breaker inspired by *Arkanoid: Revenge of Doh*, Delphi 3 + DelphiX) by
the user (Wunibald / Adrian, Horse Productions). **The source is lost**: gameplay must be reverse-engineered from
`original_source/WUNIOID.EXE`. Sister project: `../dark-planet` (same approach and stack; reuse its code and
conventions). Read `docs/PLAN.md` for the current phase and next tasks, `docs/inventory.md` for what exists.

## Keep these docs current
- `docs/PLAN.md`: tick off tasks, add new ones, and record decisions the user confirms.
- `docs/re-notes.md`: every RE finding, marked Observed / Inferred / Unknown, with addresses (and REA Evidence IDs
  when available).
- `docs/file-formats.md`: format specs, once decoded and verified.
Update them at the end of each piece of work, not only at session end.

## Ground rules
- `original_source/` is the pristine original. Never modify files there. Generated output goes in
  `original_source/extracted/` (gitignored) or outside the repo. Run the original from a copy (it writes high
  scores and levels next to the EXE).
- Python tools in `tools/` use the stdlib, or `uv run --with pefile --with pillow` (no system packages).
- Reverse-engineered behaviour must come from evidence (disassembly, observation in Wine), not guesses. Say
  clearly when something is inferred.

## Reverse engineering
- REA 6.7.0 is registered as the MCP server `rea` (Ghidra 12.1.4 in `~/opt`). Use the `reverse-engineer-anything`
  skill and prefer the MCP tools. A snapshot of the analysis is in `.rea/WUNIOID.EXE.snapshot` (pass it to
  `open_binary`). `list_procedures` output is too large for the context: query the saved result with `jq`.
- Ghidra's auto-analysis misses every procedure reached only through a VMT or method table (all event handlers
  and sprite methods), and REA can't create functions. Use `tools/ghidra_dump.sh` (decompiled C + assembly of
  the game units → `original_source/extracted/ghidra/game.txt`), `tools/delphi_rtti.py` (classes, VMTs) and
  `tools/ghidra/consts.py` (x87 constants). Read float code in the assembly: Ghidra's C garbles the x87 stack.
- PE image base 0x400000, CODE at 0x401000 (file offset 0x400). Game code: unit `wunioid` 0x416a00–0x41bd00, `Info`,
  `CourseEdit` + `Project1` 0x41c000–0x41d600. Everything below 0x416a00 is DelphiX (statically linked); the RTL and
  VCL are imported from `vcl30.dpl`.
- Delphi 3 register calling convention: `Self`/1st argument in EAX, then EDX, ECX, rest on the stack. Long strings
  are refcounted with a -8 header; string literals sit just before the procedure that uses them.
- `TFORM1` (RCDATA) holds all graphics and sounds as DelphiX image/wave lists: `tools/extract_assets.py`.

## The remake (`game/`)
- Dark Planet's stack and layout. `src/sim/` is a procedure-by-procedure port: keep each function's original
  address in its doc comment and the original's order of operations, quirks included (list indexing, NormAngle).
- Check changes with `npm test` and, for the picture, `node tools/screenshot.mjs <dir> [steps]` (headless Chrome).

## Running the original
- Wine 9.0, prefix `~/.local/share/wineprefixes/wunioid`. The game switches to a fullscreen mode; Wine can't do
  that on the user's multi-monitor desktop and the game quits inside a Wine virtual desktop. A virtual X server
  (Xvfb) is deferred (user): work from the code and ask the user to check things in the running game.
- Don't `pkill -f` with a pattern that also appears in your own command line (it kills the shell).
