import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cellOffset, emptyLevel, parseCourse } from '../src/sim/files';

// tools/save_course.py, the editor's Save in `npm run dev` (src/devSave.ts): on copies of courses/ and public/data.
const repo = new URL('../../', import.meta.url).pathname;
let dir = '';
const courses = () => join(dir, 'courses'), data = () => join(dir, 'data');
const source = (course: string) => readFileSync(join(courses(), `${course}.txt`), 'utf8');
const level = (name: string) => new Uint8Array(readFileSync(join(data(), 'levels', name)));
const course = (name: string) => parseCourse(new Uint8Array(readFileSync(join(data(), name))));
const original = (name: string) => new Uint8Array(readFileSync(join(repo, 'original_source/Levels', name)));
const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64');

function save(name: string, entries: string[], levels: Record<string, Uint8Array>, renamed: Record<string, string> = {}) {
  const req = { course: name, entries, levels: Object.fromEntries(Object.entries(levels).map(([n, l]) => [n, b64(l)])), renamed };
  const out = execFileSync('python3', [join(repo, 'tools/save_course.py'), courses(), data(), join(repo, 'original_source')],
    { input: JSON.stringify(req), stdio: ['pipe', 'pipe', 'ignore'] });
  return JSON.parse(out.toString()) as { ok: boolean; error?: string; problems?: string[] };
}
/** Save the course as it is, with `change` applied to its entries and levels. */
function resave(name: string, change: (entries: string[], levels: Record<string, Uint8Array>) => void = () => {}, renamed = {}) {
  const entries = course(name);
  const levels = Object.fromEntries(entries.map((n) => [n, existsSync(join(data(), 'levels', n)) ? level(n) : original(n)]));
  change(entries, levels);
  return save(name, entries, levels, renamed);
}

describe('the dev save into the course sources', () => {
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'wunioid-save-'));
    cpSync(join(repo, 'courses'), courses(), { recursive: true });
    cpSync(join(repo, 'game/public/data'), data(), { recursive: true, filter: (f) => !/[/\\](images|sounds)$/.test(f) });
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('leaves an unchanged course as written', () => {
    const before = source('Postcards');
    expect(resave('Postcards.cse').ok).toBe(true);
    expect(source('Postcards')).toBe(before);
  });

  it('writes a changed level\'s grid and keeps its comment; the order and a new level go in the course', () => {
    const r = resave('Postcards.cse', (entries, levels) => {
      levels['Smiley.lev'][cellOffset(1, 1)] = 13; // a Move Killer
      levels['Smiley.lev'][cellOffset(1, 1) + 1] = 2;
      entries.reverse();
      entries.push('Fresh.lev', 'Hi.lev');
      levels['Fresh.lev'] = emptyLevel();
      levels['Hi.lev'] = original('Hi.lev');
    });
    expect(r).toEqual({ ok: true, problems: ['Fresh.lev: no counting stones (it would end at once)'], notes: [], written: ['courses/Postcards.txt'] });
    expect(source('Postcards')).toMatch(/level Smiley tile 6\n; A friendly start.*\nkey a=Km\na\.{12}\n/);
    expect(source('Postcards')).toMatch(/level Fresh tile 0\n\nuse Hi\n$/);
    const order = course('Postcards.cse');
    expect([order[0], order.at(-3), order.at(-2), order.at(-1)]).toEqual(['Fireworks.lev', 'Smiley.lev', 'Fresh.lev', 'Hi.lev']);
    expect(level('Smiley.lev')[cellOffset(1, 1)]).toBe(13);
  });

  it('keeps a renamed level\'s block; a level taken out moves to a course that uses it, or goes', () => {
    resave('Postcards.cse', (entries, levels) => {
      entries[entries.indexOf('Aquarium.lev')] = 'Fishbowl.lev';
      levels['Fishbowl.lev'] = levels['Aquarium.lev'];
    }, { 'Fishbowl.lev': 'Aquarium.lev' });
    expect(source('Postcards')).toMatch(/level Fishbowl tile 2\n; Fish \(Move gems\).*\nkey f=om w=vm y=bm x=rm h=Uh\n/);
    expect(existsSync(join(data(), 'levels/Aquarium.lev'))).toBe(false);

    expect(save('My Mix.cse', ['Butterfly.lev', 'Snowman.lev'], { 'Butterfly.lev': level('Butterfly.lev'), 'Snowman.lev': level('Snowman.lev') }).ok).toBe(true);
    expect(source('My Mix')).toMatch(/^course My Mix\nuse Butterfly\nuse Snowman\n$/m);
    resave('Postcards.cse', (entries) => {
      for (const n of ['Butterfly.lev', 'Sunset.lev']) entries.splice(entries.indexOf(n), 1);
    });
    expect(source('My Mix')).toMatch(/course My Mix\n\nlevel Butterfly tile 6\n; Violet wings/);
    expect(source('Postcards')).not.toMatch(/Butterfly|Sunset/);
    expect([existsSync(join(data(), 'levels/Butterfly.lev')), existsSync(join(data(), 'levels/Sunset.lev'))]).toEqual([true, false]);
    expect(course('My Mix.cse')).toEqual(['Butterfly.lev', 'Snowman.lev']);
  });

  it('refuses changes to the original levels and courses, and names the format can\'t hold', () => {
    const hi = original('Hi.lev');
    hi[0] = 5;
    expect(save('My Mix.cse', ['Hi.lev'], { 'Hi.lev': hi }).error).toMatch(/Hi is one of the original levels/);
    expect(save('default.cse', ['Hi.lev'], { 'Hi.lev': original('Hi.lev') }).error).toMatch(/original courses/);
    expect(save('My Mix.cse', ['A;b.lev'], { 'A;b.lev': emptyLevel() }).error).toMatch(/a name without/);
    expect(save('../x.cse', ['Hi.lev'], { 'Hi.lev': original('Hi.lev') }).error).toMatch(/a name without/);
    expect(course('My Mix.cse')).toEqual(['Butterfly.lev', 'Snowman.lev']);
  });
});
