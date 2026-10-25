// The player's files, kept in localStorage in the original's formats (base64): high scores (`<course>scr`), and
// the levels and courses made in the editors. The original writes them next to the EXE (Levels\ for the levels);
// here they go over the shipped files of the same name. Files can also be imported and downloaded.

import { parseCourse, parseHighScores, parseLevel, writeCourse, writeHighScores, type HighScore, type Level } from './sim/files';
import type { Files } from './sim/world';

const SCORES_KEY = 'wunioid.scores.'; // + the high-score file name (defaultscr)
const LEVEL_KEY = 'wunioid.level.'; // + the level file name (Hi.lev)
const COURSE_KEY = 'wunioid.course.'; // + the course file name (default.cse)

const encode = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const decode = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function get(key: string): Uint8Array | null {
  try {
    const b64 = localStorage.getItem(key);
    return b64 === null ? null : decode(b64);
  } catch {
    return null;
  }
}

function put(key: string, bytes: Uint8Array): void {
  try {
    localStorage.setItem(key, encode(bytes));
  } catch {
    // no storage (private window): not kept
  }
}

function keys(prefix: string): string[] {
  try {
    return Object.keys(localStorage).filter((k) => k.startsWith(prefix));
  } catch {
    return [];
  }
}

/** The stored levels, courses and high scores over the shipped files. */
export function loadStoredFiles(files: Files): void {
  for (const k of keys(LEVEL_KEY)) {
    try {
      files.levels.set(k.slice(LEVEL_KEY.length), parseLevel(get(k)!));
    } catch (e) {
      console.warn(`stored level ${k}:`, e);
    }
  }
  for (const k of keys(COURSE_KEY)) {
    try {
      files.courses.set(k.slice(COURSE_KEY.length), parseCourse(get(k)!));
    } catch (e) {
      console.warn(`stored course ${k}:`, e);
    }
  }
  for (const k of keys(SCORES_KEY)) {
    try {
      files.scores.set(k.slice(SCORES_KEY.length), parseHighScores(get(k)!));
    } catch (e) {
      console.warn(`stored high scores ${k}:`, e);
    }
  }
}

export const storeScores = (file: string, scores: HighScore[]) => put(SCORES_KEY + file, writeHighScores(scores));
export const storeLevel = (name: string, level: Level) => put(LEVEL_KEY + name, level);
export const storeCourse = (name: string, levels: string[]) => put(COURSE_KEY + name, writeCourse(levels));

/** File names sorted as a file dialog lists them. */
export const sortedNames = (names: Iterable<string>) => [...names].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));

/** Offer a file to save (the browser's download). */
export function download(name: string, bytes: Uint8Array): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Files chosen by the player, `.lev` or `.cse` (by extension), into the files and the storage. Returns the names
 * imported and the problems.
 */
export async function importFiles(chosen: File[], files: Files): Promise<{ names: string[]; errors: string[] }> {
  const names: string[] = [], errors: string[] = [];
  for (const f of chosen) {
    const name = f.name.slice(0, 50);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      if (/\.lev$/i.test(name)) {
        const level = parseLevel(bytes);
        files.levels.set(name, level);
        storeLevel(name, level);
      } else if (/\.cse$/i.test(name)) {
        const levels = parseCourse(bytes);
        files.courses.set(name, levels);
        storeCourse(name, levels);
      } else throw new Error('not a level (.lev) or course (.cse)');
      names.push(name);
    } catch (e) {
      errors.push(`${f.name}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return { names, errors };
}
