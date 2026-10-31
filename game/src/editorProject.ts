// The Remastered editor's document (the remake; Classic keeps the original's two editors): a course and working
// copies of its levels, edited together and saved together. A course is a list of level file names (a level can be
// in several courses, or twice in one: its entries share one copy). Nothing reaches the files until `save`.

import { emptyLevel, type Level } from './sim/files';
import { LEAVE_ONE_LEVEL, type Files } from './sim/world';

/** What a save writes. */
export interface Saving {
  course: string;
  /** The level file names in play order. */
  entries: string[];
  /** A copy of each entry's level. */
  levels: Map<string, Level>;
  /** The levels new or changed since they were read. */
  changed: string[];
  /** Renamed levels: the new name → the file it was read from. */
  renamed: Map<string, string>;
}

/**
 * Where a save writes (main.ts: the player's storage; in `npm run dev` the course sources, devSave.ts). Returns the
 * problems to show (a level that can't be won), if any; throws if nothing was saved.
 */
export interface ProjectStore {
  save(s: Saving): void | Promise<string[]>;
}

const same = (a: ArrayLike<number> | undefined, b: ArrayLike<number> | undefined) =>
  a !== undefined && b !== undefined && a.length === b.length && Array.prototype.every.call(a, (x, i) => x === b[i]);

/** Up to 50 characters (a course keeps a string[50] per level), without the characters a file name can't have. */
export const cleanName = (name: string, ext: 'lev' | 'cse') => {
  const n = name.trim().replace(/[\\/:*?"<>|]/g, '').replace(new RegExp(`\\.${ext}$`, 'i'), '');
  return n ? `${n.slice(0, 50 - ext.length - 1)}.${ext}` : '';
};

export class EditorProject {
  /** The course file; null for a new course that was never saved. */
  name: string | null = null;
  /** The level file names in play order. */
  entries: string[] = [];
  /** The entry being edited. */
  current = 0;
  private readonly work = new Map<string, Level>();
  /** Renamed since read: the name → the file it was read from. */
  private readonly renamed = new Map<string, string>();

  constructor(private readonly files: Files, private readonly store: ProjectStore) {}

  /** A course from the files (without levels that don't exist, as LoadCourse). */
  open(course: string): void {
    const levels = this.files.courses.get(course);
    if (!levels) throw new Error(`no course ${course}`);
    this.name = course;
    this.work.clear();
    this.renamed.clear();
    this.entries = levels.filter((l) => this.files.levels.has(l));
    for (const l of this.entries) this.work.set(l, new Uint8Array(this.files.levels.get(l)!));
    this.current = 0;
    if (this.entries.length === 0) this.addNew();
  }

  /** A new course with one empty level. */
  newCourse(): void {
    this.name = null;
    this.work.clear();
    this.renamed.clear();
    this.entries = [];
    this.addNew();
  }

  /** The level being edited (the world edits this buffer in place). */
  get level(): Level {
    return this.levelOf(this.current);
  }

  levelOf(i: number): Level {
    return this.work.get(this.entries[i])!;
  }

  select(i: number): void {
    if (i >= 0 && i < this.entries.length) this.current = i;
  }

  /** Not saved: a new file, or changed since. */
  levelDirty(i: number): boolean {
    const name = this.entries[i];
    return !same(this.work.get(name), this.files.levels.get(name));
  }

  get courseDirty(): boolean {
    const saved = this.name === null ? undefined : this.files.courses.get(this.name);
    return saved === undefined || saved.length !== this.entries.length || saved.some((l, i) => l !== this.entries[i]);
  }

  get dirty(): boolean {
    return this.courseDirty || this.entries.some((_, i) => this.levelDirty(i));
  }

  /** A level name that no file and no entry has: `<base><n>.lev`. */
  freeName(base: string): string {
    const b = base.replace(/\.lev$/i, '').replace(/\d+$/, '') || 'Level';
    const taken = (n: string) => this.files.levels.has(n) || this.work.has(n);
    for (let n = 1; ; n++) {
      const name = cleanName(`${b}${n}`, 'lev');
      if (!taken(name)) return name;
    }
  }

  private insert(name: string, level: Level): number {
    if (!this.work.has(name)) this.work.set(name, level);
    const at = this.entries.length === 0 ? 0 : this.current + 1;
    this.entries.splice(at, 0, name);
    this.current = at;
    return at;
  }

  /** An empty level after the current one, selected. */
  addNew(): number {
    return this.insert(this.freeName('Level'), emptyLevel());
  }

  /** A level file after the current one (it shares the copy of an entry of the same name). */
  addExisting(name: string): number {
    const level = this.files.levels.get(name);
    if (!level && !this.work.has(name)) throw new Error(`no level ${name}`);
    return this.insert(name, this.work.get(name) ?? new Uint8Array(level!));
  }

  /** A copy of entry `i` under a new name, after the current one. */
  duplicate(i: number): number {
    this.current = i;
    return this.insert(this.freeName(this.entries[i]), new Uint8Array(this.levelOf(i)));
  }

  /** Entry `i` out of the course (the message if it is the last; the file stays). */
  remove(i: number): string | null {
    if (i < 0 || i >= this.entries.length) return null;
    if (this.entries.length < 2) return LEAVE_ONE_LEVEL;
    const [name] = this.entries.splice(i, 1);
    if (!this.entries.includes(name)) this.work.delete(name);
    if (this.current > i || this.current >= this.entries.length) this.current--;
    return null;
  }

  /** Entry `i` one place up (−1) or down; the current entry goes along. Its new index. */
  move(i: number, d: -1 | 1): number {
    const e = this.entries;
    if (i < 0 || i >= e.length || i + d < 0 || i + d >= e.length) return i;
    e.splice(i + d, 0, ...e.splice(i, 1));
    if (this.current === i) this.current = i + d;
    else if (this.current === i + d) this.current = i;
    return i + d;
  }

  /**
   * Entry `i` under another file name (saved there; the old file stays). An error if the name is empty or another
   * level has it.
   */
  rename(i: number, to: string): string | null {
    const name = cleanName(to, 'lev'), old = this.entries[i];
    if (!name) return 'The level needs a name.';
    if (name === old) return null;
    if (this.files.levels.has(name) || this.work.has(name)) return `There is a level ${name.replace(/\.lev$/i, '')} already.`;
    const level = this.levelOf(i);
    this.entries[i] = name;
    const shared = this.entries.includes(old);
    this.work.set(name, shared ? new Uint8Array(level) : level);
    if (!shared) this.work.delete(old);
    const from = this.renamed.get(old) ?? old;
    if (!shared) this.renamed.delete(old);
    if (this.files.levels.has(from)) this.renamed.set(name, from);
    return null;
  }

  /**
   * The changed levels and the course, under `as` if given (Save course as; a new course needs a name). The
   * problems the store found; throws if it saved nothing.
   */
  async save(as?: string): Promise<string[]> {
    const name = as ?? this.name;
    if (!name) throw new Error('a new course needs a name');
    const entries = [...this.entries];
    const levels = new Map(entries.map((l) => [l, new Uint8Array(this.work.get(l)!)]));
    const changed = [...levels.keys()].filter((l) => !same(levels.get(l), this.files.levels.get(l)));
    const problems = await this.store.save({ course: name, entries, levels, changed, renamed: new Map(this.renamed) }) ?? [];
    for (const l of changed) this.files.levels.set(l, levels.get(l)!);
    this.name = name;
    this.files.courses.set(name, entries);
    this.renamed.clear();
    return problems;
  }
}
