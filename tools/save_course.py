"""The editor's Save in `npm run dev`: a course and its levels from the editor → courses/*.txt, then the build.

Usage: python3 tools/save_course.py courses game/public/data original_source < request.json
Called by the dev server (game/vite.config.ts). The request: {"course": "Postcards.cse", "entries": [level file
names in play order], "levels": {file name: base64 of the .lev bytes, for every entry}, "renamed": {new file name:
the name it had when the course was opened}}. Prints {"ok": true, "problems": [...], "notes": [...], "written":
[source files]} or {"ok": false, "error": "..."}.

What changes in the sources (tools/build_courses.py has the format):
- The course's source (found by its `course` line; a new course gets courses/<Course>.txt) lists the entries in
  order: a `level` block for the levels it defines, a `use` line for the others (defined in another source, one of
  the original levels, or a second entry of the same level).
- A changed level gets a new grid and key line in the source that defines it, whichever that is; its `level` line
  and comments stay. Unchanged levels stay as written.
- A level that was renamed keeps its block (and comments) under the new name, if nothing else uses the old one.
- A level taken out of the course is dropped from its source, or moved to the first source that uses it.
- The original levels and courses (original_source/) can't change: saving a changed original level is refused
  (rename it first), and so is saving over an original course.
Problems (a level without counting stones, or walled in) don't stop the save: they come back to show.
"""
import base64
import contextlib
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from build_courses import (  # noqa: E402
    ATTRS, COLS, DEFAULT_KEY, KINDS, build, level_bytes, level_grid, level_line, parse_lines)

CODE = {n: k for k, n in KINDS.items()}
ATTR = {n: a for a, n in ATTRS.items()}
CHAR = {}  # (kind, attr) → its default cell character
for ch, cell in DEFAULT_KEY.items():
    CHAR.setdefault(cell, ch)
SPARE = [c for c in 'abcdefhijklmnpqstuwxyzAFHIJLMNOPQRSTVWXZ6789@%&+=-~^$!' if c not in DEFAULT_KEY]


class Failure(Exception):
    pass


def words(line):
    return line.split(';', 1)[0].split()


class Item:
    """A `level` block (its line, comments, key and rows, and the blank lines after it) or a `use` line."""

    def __init__(self, kind, name, lines):
        self.kind, self.name, self.lines = kind, name, lines

    @property
    def key(self):
        return self.name.lower()

    def grid(self):
        _, levels = parse_lines(self.lines, self.name)
        return levels[0][2], levels[0][1]


class Source:
    def __init__(self, path, lines):
        self.path, self.head, self.items, self.course = path, [], [], None
        for line in lines:
            w = words(line)
            if w and w[0] in ('level', 'use'):
                name = ' '.join(w[1:]) if w[0] == 'use' else level_line(w)[0]
                self.items.append(Item(w[0], name, [line]))
            elif self.items:
                self.items[-1].lines.append(line)
            else:
                if w and w[0] == 'course':
                    self.course = ' '.join(w[1:])
                self.head.append(line)
        self.dirty = False

    def text(self):
        out = list(self.head)
        for item in self.items:
            if item.kind == 'level' and out and out[-1].strip():
                out.append('')
            out += item.lines
        while out and not out[-1].strip():
            out.pop()
        return '\n'.join(out) + '\n'


def normal(grid):
    """Empty cells without attributes (the editor's eraser may leave one; the format has no place for it)."""
    return [[(k, a if k else 0) for k, a in row] for row in grid]


def block(name, grid, tile, old=None):
    """A level block; the comments of the old block (before its first key or row) stay."""
    comments, old_key = [], {}
    for line in (old or [])[1:]:
        w = words(line)
        if not w and line.strip():
            comments.append(line)
        elif w and w[0] == 'key':
            old_key.update(item.split('=') for item in w[1:])
        elif w:
            break
    chars, extra = dict(CHAR), {}
    reuse = {(KINDS[code[0]], ATTRS[code[1]]): ch for ch, code in old_key.items() if code[0] in KINDS and code[1] in ATTRS}
    spare = [c for c in SPARE if c not in old_key]
    for r, row in enumerate(grid):
        for c, cell in enumerate(row):
            kind, attr = cell
            if cell in chars:
                continue
            if not 1 <= kind <= 13 or attr not in ATTR:
                raise Failure(f'{name}: column {c + 1}, row {r + 1}: kind {kind}, attribute {attr} has no letter')
            ch = reuse.get(cell) or spare.pop(0)
            chars[cell] = ch
            extra[ch] = f'{ch}={CODE[kind]}{ATTR[attr]}'
    rows = [''.join(chars[cell] for cell in row) for row in grid]
    while rows and rows[-1] == '.' * COLS:
        rows.pop()
    order = [ch for ch in old_key if ch in extra] + [ch for ch in extra if ch not in old_key]
    key = [f'key {" ".join(extra[ch] for ch in order)}'] if extra else []
    return [f'level {name} tile {tile}', *comments, *key, *rows, '']


def check_name(name, what):
    if not name or name != name.strip() or '  ' in name or name.startswith('.') or any(c in name for c in ';\t\n\\/:*?"<>|'):
        raise Failure(f'{what} {name!r}: a name without ; \\ / : * ? " < > |, tabs or double spaces, please')
    try:
        if len(name.encode('latin-1')) > 46:
            raise Failure(f'{what} {name}: at most 46 characters')
    except UnicodeEncodeError:
        raise Failure(f'{what} {name}: letters of Western European languages only')


def save(req, courses_dir, data, original):
    course = req['course']
    if not course.lower().endswith('.cse'):
        raise Failure(f'{course}: not a course file')
    stem = course[:-4]
    check_name(stem, 'Course')
    entries = req['entries']
    if not entries:
        raise Failure('a course needs a level')
    levels = {n: base64.b64decode(b) for n, b in req['levels'].items()}
    renamed = {n[:-4].lower(): o[:-4].lower() for n, o in req.get('renamed', {}).items()}
    for n in entries:
        if not n.lower().endswith('.lev') or n not in levels:
            raise Failure(f'{n}: no level')
        check_name(n[:-4], 'Level')

    sources = [Source(os.path.join(courses_dir, fn), open(os.path.join(courses_dir, fn), encoding='utf-8').read().splitlines())
               for fn in sorted(os.listdir(courses_dir)) if fn.endswith('.txt')]
    defs = {i.key: (s, i) for s in sources for i in s.items if i.kind == 'level'}
    uses = {}
    for s in sources:
        for i in s.items:
            if i.kind == 'use':
                uses.setdefault(i.key, []).append((s, i))
    originals = {f[:-4].lower(): f for f in os.listdir(os.path.join(original, 'Levels')) if f.lower().endswith('.lev')}
    original_courses = {f[:-4].lower() for f in os.listdir(original) if f.lower().endswith('.cse')}

    target = next((s for s in sources if (s.course or '').lower() == stem.lower()), None)
    if target is None:
        if stem.lower() in original_courses:
            raise Failure(f'{stem} is one of the original courses: save it under another name (Save course as…)')
        path = os.path.join(courses_dir, stem + '.txt')
        if os.path.exists(path):
            raise Failure(f'{path} is there already, for another course')
        target = Source(path, [f'; {stem}: made in the editor. Format and cell letters: tools/build_courses.py.',
                               f'course {stem}'])
        sources.append(target)
    target.dirty = True

    # the changed levels, wherever they are defined
    names = list(dict.fromkeys(entries))
    grids = {n: tuple(map(tuple, normal(level_grid(levels[n])[0]))) for n in names}
    tiles = {n: levels[n][-1] for n in names}
    for n in names:
        key = n[:-4].lower()
        if key in defs:
            s, item = defs[key]
            grid, tile = item.grid()
            if tuple(map(tuple, normal(grid))) != grids[n] or tile != tiles[n]:
                item.lines = block(item.name, grids[n], tiles[n], item.lines)
                s.dirty = True
        elif key in originals:
            want = open(os.path.join(original, 'Levels', originals[key]), 'rb').read()
            if level_bytes(normal(level_grid(want)[0]), want[-1]) != level_bytes(grids[n], tiles[n]):
                raise Failure(f'{n[:-4]} is one of the original levels: rename it (✎) to keep your changes')

    # the course's own list
    elsewhere = lambda key: [(s, i) for s, i in uses.get(key, []) if s is not target]  # noqa: E731
    keys = {n[:-4].lower() for n in names}
    items, seen = [], set()
    for n in entries:
        name, key = n[:-4], n[:-4].lower()
        if key in seen or (key in defs and defs[key][0] is not target) or (key in originals and key not in defs):
            items.append(Item('use', name, [f'use {name}']))
        elif key in defs:
            items.append(defs[key][1])
        else:
            old = renamed.get(key, '')
            mine = defs.get(old)
            if mine and mine[0] is target and old not in keys and not elsewhere(old):
                grid, tile = mine[1].grid()
                if tuple(map(tuple, normal(grid))) == grids[n] and tile == tiles[n]:
                    mine[1].lines[0] = f'level {name} tile {tile}'
                else:
                    mine[1].lines = block(name, grids[n], tiles[n], mine[1].lines)
                mine[1].name = name
                defs[key] = defs.pop(old)
                items.append(mine[1])
            else:
                items.append(Item('level', name, block(name, grids[n], tiles[n])))
        seen.add(key)
    # the levels taken out: gone, or to the first source that still uses them
    for item in target.items:
        if item.kind == 'level' and item.key not in keys and defs.get(item.key, (None, None))[1] is item:
            users = elsewhere(item.key)
            if users:
                s, use = users[0]
                s.items[s.items.index(use)] = item
                s.dirty = True
    target.items = items

    before = {s.path: open(s.path, encoding='utf-8').read() if os.path.exists(s.path) else None for s in sources if s.dirty}
    for s in sources:
        if s.dirty:
            open(s.path, 'w', encoding='utf-8').write(s.text())
    try:
        with contextlib.redirect_stdout(sys.stderr):
            problems, notes = build(courses_dir, data, original=original, strict=False)
    except SystemExit as e:  # the sources don't build: back as they were
        for path, text in before.items():
            if text is None:
                os.remove(path)
            else:
                open(path, 'w', encoding='utf-8').write(text)
        with contextlib.redirect_stdout(sys.stderr):
            build(courses_dir, data, original=original, strict=False)
        raise Failure(str(e))
    mine = lambda lines: [p for p in lines if p.split(':', 1)[0] in names]  # noqa: E731
    return {'ok': True, 'problems': mine(problems), 'notes': mine(notes),
            'written': sorted(os.path.relpath(p, os.path.join(courses_dir, '..')) for p in before)}


if __name__ == '__main__':
    try:
        result = save(json.load(sys.stdin), *sys.argv[1:4])
    except Failure as e:
        result = {'ok': False, 'error': str(e)}
    print(json.dumps(result))
