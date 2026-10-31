"""Build the remake's own courses from text sources: courses/*.txt → .lev files and a .cse per course.

Usage: python tools/build_courses.py courses game/public/data [--preview DIR] [--original original_source]
  (--preview needs pillow: uv run --with pillow python tools/build_courses.py ...)
Writes levels/<name>.lev and <Course>.cse below the data directory and adds them to data.json. With --original,
also removes the .lev and .cse files (and their data.json entries) of levels and courses that are gone from the
sources. Called by export_game_data.py too, so a fresh export keeps them. In `npm run dev`, the editor's Save
writes the sources (tools/save_course.py).

Source format (one course per file, levels in course order):
    ; a comment (anywhere on a line)
    course Postcards
    level Welcome tile 3
    key m=rm h=Yh          (optional: extra single-character cells for this level)
    .............          (17 rows of 13 cells; missing rows at the bottom are empty)
    use Hi                 (a level defined in another course's source, or one of the original levels)
Names may have spaces; `tile N` at the end of a level line is the background (0, black, if left out).

Cells, one character each (a key line adds more, as <char>=<kind><attribute>):
    .  empty
    r o g b v   GemRed GemOrange GemGreen GemBlue GemViolet
    1 2 3 4 5   the same gems with the Bonus attribute
    G Granit  B Block  U Bubbler  E Eater  D Doubler  C BeBack (comes back)  Y Goldie  K Killer
    #  Granit with the Iron attribute (indestructible; Zup still removes it)
Two-character cell codes in key lines: the kind letter above, then the attribute: . none, * Bonus, m Move,
h Hike, i Iron.

Checks, for each level: it has counting stones (gems and Blocks without Iron), and every one of them can be
reached from the bottom without passing an Iron stone (Iron Move stones slide, so they don't count as walls).
"""
import json
import os
import struct
import sys

COLS, ROWS = 13, 17
LEVEL_SIZE = COLS * ROWS * 2 + 1
KINDS = {'r': 1, 'o': 2, 'g': 3, 'b': 4, 'v': 5, 'G': 6, 'B': 7, 'U': 8, 'E': 9, 'D': 10, 'C': 11, 'Y': 12, 'K': 13}
ATTRS = {'.': 0, '*': 1, 'm': 2, 'h': 3, 'i': 4}
BONUS, MOVE, HIKE, IRON = 1, 2, 3, 4
DEFAULT_KEY = {'.': (0, 0), '#': (6, IRON), **{k: (n, 0) for k, n in KINDS.items()},
               **{str(n): (n, BONUS) for n in range(1, 6)}}
STONES = ['GemRed', 'GemOrange', 'GemGreen', 'GemBlue', 'GemViolet', 'Granit', 'Block', 'Bubbler', 'Eater',
          'Doubler', 'BeBack', 'Goldie', 'Killer']


def counts(kind, attr):
    """TStone.Counts: gems and Blocks without Iron."""
    return (1 <= kind <= 5 or kind == 7) and attr != IRON


def parse(path):
    """A course source → (course name, [(level name, tile, grid)]), grid[row][col] = (kind, attr); tile and grid
    are None for a `use` line."""
    course, levels = parse_lines(open(path, encoding='utf-8'), path)
    if not course:
        raise SystemExit(f'{path}: no course line')
    return course, levels


def parse_lines(lines, path):
    """parse() on the lines of a source, or of a part of one (then the course may be None)."""
    course, levels, cur = None, [], None

    def finish():
        if cur:
            name, tile, key, rows, line = cur
            if len(rows) > ROWS:
                raise SystemExit(f'{path}:{line}: level {name}: {len(rows)} rows, at most {ROWS}')
            rows += ['.' * COLS] * (ROWS - len(rows))
            levels.append((name, tile, [[key[ch] for ch in row] for row in rows]))

    for n, raw in enumerate(lines, 1):
        line = raw.split(';', 1)[0].rstrip()
        if not line.strip():
            continue
        words = line.split()
        if words[0] == 'course':
            course = ' '.join(words[1:])
        elif words[0] == 'level':
            finish()
            name, tile = level_line(words)
            cur = (name, tile, dict(DEFAULT_KEY), [], n)
        elif words[0] == 'use':
            finish()
            cur = None
            levels.append((' '.join(words[1:]), None, None))
        elif words[0] == 'key':
            for item in words[1:]:
                ch, code = item.split('=')
                cur[2][ch] = (KINDS[code[0]], ATTRS[code[1]])
        else:
            row = line.strip()
            if cur is None or len(row) != COLS or any(ch not in cur[2] for ch in row):
                raise SystemExit(f'{path}:{n}: not a row of {COLS} known cells: {row!r}')
            cur[3].append(row)
    finish()
    return course, levels


def level_line(words):
    """`level <name> [tile N]` → (name, tile)."""
    if len(words) >= 4 and words[-2] == 'tile':
        return ' '.join(words[1:-2]), int(words[-1])
    return ' '.join(words[1:]), 0


def reachable(grid, wall):
    """The cells a ball can get to from below the grid, through cells that aren't `wall(kind, attr)`."""
    seen = {(ROWS - 1, c) for c in range(COLS) if not wall(*grid[ROWS - 1][c])}
    todo = list(seen)
    while todo:
        r, c = todo.pop()
        for rr, cc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
            if 0 <= rr < ROWS and 0 <= cc < COLS and (rr, cc) not in seen and not wall(*grid[rr][cc]):
                seen.add((rr, cc))
                todo.append((rr, cc))
    return seen


def check(name, grid):
    """Problems that make a level unwinnable: no counting stones, or one walled in by Iron (Iron Move stones
    slide away, but count as walls here). Also a note on stones that only a hidden BeBack lets the ball reach."""
    targets = [(r, c) for r in range(ROWS) for c in range(COLS) if counts(*grid[r][c])]
    if not targets:
        return [f'{name}: no counting stones (it would end at once)'], []
    where = lambda cells: ', '.join(f'col {c + 1} row {r + 1}' for r, c in cells)  # noqa: E731
    seen = reachable(grid, lambda k, a: a == IRON)
    shut = [t for t in targets if t not in seen]
    if shut:
        return [f'{name}: counting stones walled in by Iron: {where(shut)}'], []
    seen = reachable(grid, lambda k, a: a == IRON or (k == 11 and a != MOVE))
    behind = [t for t in targets if t not in seen]
    return [], [f'{name}: {len(behind)} counting stones only reachable through BeBacks'] if behind else []


def level_grid(b):
    """A .lev file's bytes → (grid, tile); the inverse of level_bytes."""
    if len(b) != LEVEL_SIZE:
        raise ValueError(f'a level has {LEVEL_SIZE} bytes, not {len(b)}')
    return [[(b[c * ROWS * 2 + r * 2], b[c * ROWS * 2 + r * 2 + 1]) for c in range(COLS)] for r in range(ROWS)], b[-1]


def level_bytes(grid, tile):
    b = bytearray(LEVEL_SIZE)
    for r in range(ROWS):
        for c in range(COLS):
            b[c * ROWS * 2 + r * 2], b[c * ROWS * 2 + r * 2 + 1] = grid[r][c]
    b[-1] = tile
    return bytes(b)


def course_bytes(files):
    out = struct.pack('<I', len(files))
    for f in files:
        raw = f.encode('latin-1')
        assert len(raw) <= 50, f
        out += bytes([len(raw)]) + raw + bytes(50 - len(raw))
    return out


def preview(course, levels, data, out):
    """A contact sheet of the course's levels, drawn from the exported stone images (editor-style labels)."""
    from PIL import Image, ImageDraw
    img = lambda n: Image.open(os.path.join(data, 'images', n + '.png')).convert('RGBA')  # noqa: E731
    stones = {i + 1: img(n).crop((0, 0, 30, 15)) for i, n in enumerate(STONES)}
    tiles = {i: img(f'Tile{i}') for i in range(1, 10)}
    marks = {MOVE: 'M', HIKE: 'H', IRON: 'I'}
    per_row, cw, ch = 5, COLS * 30 + 10, ROWS * 15 + 28
    sheet = Image.new('RGB', (per_row * cw, -(-len(levels) // per_row) * ch), (24, 24, 30))
    d = ImageDraw.Draw(sheet)
    for i, (name, tile, grid) in enumerate(levels):
        x0, y0 = (i % per_row) * cw + 5, (i // per_row) * ch + 22
        d.text((x0, y0 - 16), f'{i + 1}. {name}', fill=(240, 240, 240))
        field = Image.new('RGBA', (COLS * 30, ROWS * 15), (0, 0, 0, 255))
        if tile:
            for y in range(0, field.height, 40):
                for x in range(0, field.width, 40):
                    field.paste(tiles[tile], (x, y))
        fd = ImageDraw.Draw(field)
        for r in range(ROWS):
            for c in range(COLS):
                kind, attr = grid[r][c]
                if kind:
                    field.alpha_composite(stones[kind], (c * 30, r * 15))
                if attr == BONUS:
                    fd.text((c * 30 + 22, r * 15 + 1), '*', fill=(255, 255, 255))
                elif attr:
                    fd.rectangle((c * 30 + 1, r * 15 + 2, c * 30 + 9, r * 15 + 13), fill=(0, 0, 0))
                    fd.text((c * 30 + 2, r * 15 + 2), marks[attr], fill=(255, 255, 80))
        sheet.paste(field.convert('RGB'), (x0, y0))
    sheet.save(os.path.join(out, course + '.png'))


def build(src, data, preview_dir=None, original=None, strict=True):
    """Builds every course source. Returns the problems and notes; with `strict`, problems end the program (after
    everything was written)."""
    taken = {f.lower(): f for f in os.listdir(os.path.join(original, 'Levels'))} if original else {}
    manifest_path = os.path.join(data, 'data.json')
    manifest = json.load(open(manifest_path))
    problems, notes, defined, courses = [], [], {}, []
    for fn in sorted(os.listdir(src)):
        if not fn.endswith('.txt'):
            continue
        course, levels = parse(os.path.join(src, fn))
        if any(c.lower() == course.lower() for _, c, _ in courses):
            raise SystemExit(f'{fn}: course {course} twice')
        for name, tile, grid in levels:
            file = name + '.lev'
            if grid is None:
                continue
            if file.lower() in taken:
                raise SystemExit(f'{fn}: {file} is the name of one of the original levels')
            if file.lower() in defined:
                raise SystemExit(f'{fn}: {file} twice')
            defined[file.lower()] = (file, tile, grid)
        courses.append((fn, course, levels))
    for file, tile, grid in defined.values():
        errors, info = check(file, grid)
        problems += errors
        notes += info
        open(os.path.join(data, 'levels', file), 'wb').write(level_bytes(grid, tile))
        if file not in manifest['levels']:
            manifest['levels'].append(file)
    built = set()
    for fn, course, levels in courses:
        files = []
        for name, tile, grid in levels:
            file = name + '.lev'
            if grid is None:  # a use line: the file's own spelling
                if file.lower() in defined:
                    file = defined[file.lower()][0]
                elif file.lower() in taken:
                    file = taken[file.lower()]
                else:
                    raise SystemExit(f'{fn}: use {name}: no such level')
            files.append(file)
        open(os.path.join(data, course + '.cse'), 'wb').write(course_bytes(files))
        built.add(course + '.cse')
        if course + '.cse' not in manifest['courses']:
            manifest['courses'].append(course + '.cse')
        if preview_dir:
            preview(course, [resolve(data, name, tile, grid) for name, tile, grid in levels], data, preview_dir)
        print(f'{course}: {len(files)} levels')
    if original:  # what the sources no longer have
        gone = [f for f in manifest['levels'] if f.lower() not in taken and f.lower() not in defined]
        for f in gone:
            os.remove(os.path.join(data, 'levels', f))
        cses = {f.lower() for f in os.listdir(original) if f.lower().endswith('.cse')}
        old = [f for f in manifest['courses'] if f.lower() not in cses and f not in built]
        for f in old:
            os.remove(os.path.join(data, f))
        manifest['levels'] = [f for f in manifest['levels'] if f not in gone]
        manifest['courses'] = [f for f in manifest['courses'] if f not in old]
    print('\n'.join(f'note: {n}' for n in notes))
    manifest['levels'].sort(key=str.lower)
    manifest['courses'].sort(key=str.lower)
    json.dump(manifest, open(manifest_path, 'w'), indent=1)
    if problems and strict:
        raise SystemExit('\n'.join(problems))
    return problems, notes


def resolve(data, name, tile, grid):
    """A course entry with its grid (a `use` line's from the built or exported .lev)."""
    if grid is None:
        grid, tile = level_grid(open(os.path.join(data, 'levels', name + '.lev'), 'rb').read())
    return name, tile, grid


if __name__ == '__main__':
    args = sys.argv[1:]
    opt = lambda f: args[args.index(f) + 1] if f in args else None  # noqa: E731
    build(args[0], args[1], opt('--preview'), opt('--original'))
