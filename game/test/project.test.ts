import { describe, expect, it } from 'vitest';
import { cleanName, EditorProject, type Saving } from '../src/editorProject';
import { cellOffset, emptyLevel, type Level } from '../src/sim/files';
import { LEAVE_ONE_LEVEL, type Files } from '../src/sim/world';

function files(): Files {
  const level = (k: number) => {
    const l = emptyLevel();
    l[cellOffset(1, 1)] = k;
    return l;
  };
  return {
    levels: new Map([['A.lev', level(1)], ['B.lev', level(2)], ['C.lev', level(3)], ['Level1.lev', level(4)]]),
    courses: new Map([['Two.cse', ['A.lev', 'B.lev', 'Gone.lev']], ['Twice.cse', ['A.lev', 'A.lev']]]),
    scores: new Map(),
  };
}

function project() {
  const f = files();
  const saved = { levels: new Map<string, Level>(), courses: new Map<string, string[]>(), last: null as Saving | null };
  const p = new EditorProject(f, {
    save: (s) => {
      for (const l of s.changed) saved.levels.set(l, s.levels.get(l)!);
      saved.courses.set(s.course, s.entries);
      saved.last = s;
    },
  });
  return { p, f, saved };
}

describe('editor project', () => {
  it('opens a course on its first level, without the levels that are missing (saving drops them)', () => {
    const { p } = project();
    p.open('Twice.cse');
    expect([p.name, p.entries, p.current, p.dirty]).toEqual(['Twice.cse', ['A.lev', 'A.lev'], 0, false]);
    p.open('Two.cse');
    expect([p.name, p.entries, p.current, p.courseDirty]).toEqual(['Two.cse', ['A.lev', 'B.lev'], 0, true]);
  });

  it('edits working copies: the files change only on save, and only the changed levels are written', async () => {
    const { p, f, saved } = project();
    p.open('Two.cse');
    p.select(1);
    p.level[cellOffset(2, 2)] = 7;
    expect(f.levels.get('B.lev')![cellOffset(2, 2)]).toBe(0);
    expect([p.levelDirty(0), p.levelDirty(1), p.dirty]).toEqual([false, true, true]);
    expect(await p.save()).toEqual([]);
    expect(f.levels.get('B.lev')![cellOffset(2, 2)]).toBe(7);
    expect([...saved.levels.keys()]).toEqual(['B.lev']);
    expect(saved.courses.get('Two.cse')).toEqual(['A.lev', 'B.lev']);
    expect(p.dirty).toBe(false);
    p.level[cellOffset(3, 3)] = 1; // the saved copy is not the working one
    expect(f.levels.get('B.lev')![cellOffset(3, 3)]).toBe(0);
  });

  it('adds new levels after the current one under free names, and existing ones sharing a copy', () => {
    const { p } = project();
    p.open('Two.cse');
    expect(p.addNew()).toBe(1);
    expect(p.entries).toEqual(['A.lev', 'Level2.lev', 'B.lev']); // Level1.lev is taken
    expect([p.levelDirty(1), p.level.every((b) => b === 0)]).toEqual([true, true]);
    p.addExisting('A.lev');
    expect(p.entries).toEqual(['A.lev', 'Level2.lev', 'A.lev', 'B.lev']);
    expect(p.levelOf(2)).toBe(p.levelOf(0));
    p.duplicate(3);
    expect(p.entries).toEqual(['A.lev', 'Level2.lev', 'A.lev', 'B.lev', 'B1.lev']);
    expect(p.current).toBe(4);
    expect(p.level).not.toBe(p.levelOf(3));
    expect(p.level).toEqual(p.levelOf(3));
  });

  it('moves and removes entries, keeping the current one, but never the last entry', () => {
    const { p } = project();
    p.open('Two.cse');
    p.addNew(); // A, Level2, B; current 1
    expect(p.move(1, -1)).toBe(0);
    expect([p.entries, p.current]).toEqual([['Level2.lev', 'A.lev', 'B.lev'], 0]);
    expect(p.move(0, -1)).toBe(0);
    p.select(2);
    expect(p.remove(0)).toBeNull();
    expect([p.entries, p.current]).toEqual([['A.lev', 'B.lev'], 1]);
    expect(p.remove(1)).toBeNull();
    expect([p.entries, p.current]).toEqual([['A.lev'], 0]);
    expect(p.remove(0)).toBe(LEAVE_ONE_LEVEL);
  });

  it('renames an entry to a free name (the buffer goes along unless another entry shares it)', async () => {
    const { p, f, saved } = project();
    p.open('Two.cse');
    const a = p.level;
    expect(p.rename(0, 'B')).toMatch(/already/);
    expect(p.rename(0, '  ')).toMatch(/name/);
    expect(p.rename(0, 'New: one?')).toBeNull();
    expect(p.entries).toEqual(['New one.lev', 'B.lev']);
    expect(p.level).toBe(a);
    expect(p.levelDirty(0)).toBe(true);
    p.rename(0, 'Newer');
    await p.save();
    expect(f.levels.has('Newer.lev') && f.levels.has('A.lev')).toBe(true);
    expect(saved.last!.renamed).toEqual(new Map([['Newer.lev', 'A.lev']])); // the file it was read from
    p.rename(1, 'C2');
    await p.save();
    expect(saved.last!.renamed).toEqual(new Map([['C2.lev', 'B.lev']])); // only since the last save

    p.open('Twice.cse');
    p.rename(1, 'Other');
    expect(p.levelOf(1)).not.toBe(p.levelOf(0));
  });

  it('a new course needs a name to save, and Save as writes the course under another name', async () => {
    const { p, f } = project();
    p.newCourse();
    expect([p.name, p.entries, p.dirty]).toEqual([null, ['Level2.lev'], true]);
    await expect(p.save()).rejects.toThrow();
    await p.save('Mine.cse');
    expect([p.name, f.courses.get('Mine.cse'), p.dirty]).toEqual(['Mine.cse', ['Level2.lev'], false]);
    p.open('Two.cse');
    await p.save('Copy.cse');
    expect([p.name, f.courses.get('Copy.cse'), f.courses.get('Two.cse')]).toEqual(['Copy.cse', ['A.lev', 'B.lev'],
      ['A.lev', 'B.lev', 'Gone.lev']]);
  });

  it('a failed save changes nothing; the problems a store finds come back', async () => {
    const f = files();
    let answer: () => Promise<string[]> = () => Promise.reject(new Error('no'));
    const p = new EditorProject(f, { save: () => answer() });
    p.open('Two.cse');
    p.level[cellOffset(2, 2)] = 7;
    p.rename(0, 'Z');
    await expect(p.save('Other.cse')).rejects.toThrow('no');
    expect([p.name, f.courses.has('Other.cse'), f.levels.has('Z.lev'), p.dirty]).toEqual(['Two.cse', false, false, true]);
    answer = () => Promise.resolve(['Z.lev: no counting stones']);
    expect(await p.save()).toEqual(['Z.lev: no counting stones']);
    expect([f.courses.get('Two.cse'), p.dirty]).toEqual([['Z.lev', 'B.lev'], false]);
  });

  it('cleans file names', () => {
    expect(cleanName(' My/Level.lev ', 'lev')).toBe('MyLevel.lev');
    expect(cleanName('x'.repeat(60), 'cse').length).toBe(50);
    expect(cleanName('', 'lev')).toBe('');
  });
});
