// The original's files (docs/file-formats.md): levels (.lev), courses (.cse) and high scores (<course>scr).

export const COLS = 13;
export const ROWS = 17;
export const LEVEL_SIZE = COLS * ROWS * 2 + 1; // 443

/** A level buffer: column-major (kind, attribute) cells, then the background tile. */
export type Level = Uint8Array;

export const emptyLevel = (): Level => new Uint8Array(LEVEL_SIZE);
/** Offset of cell (col, row), 1-based. */
export const cellOffset = (col: number, row: number) => (col - 1) * ROWS * 2 + (row - 1) * 2;
export const levelTile = (level: Level) => level[LEVEL_SIZE - 1];

export function parseLevel(bytes: Uint8Array): Level {
  if (bytes.length !== LEVEL_SIZE) throw new Error(`a level has ${LEVEL_SIZE} bytes, not ${bytes.length}`);
  return new Uint8Array(bytes);
}

/** A Delphi string[50]: a length byte and 50 bytes. */
const SHORT_STRING = 51;

function readShortString(b: Uint8Array, at: number): string {
  const n = Math.min(b[at], SHORT_STRING - 1);
  return String.fromCharCode(...b.subarray(at + 1, at + 1 + n));
}

function writeShortString(b: Uint8Array, at: number, s: string): void {
  const n = Math.min(s.length, SHORT_STRING - 1);
  b[at] = n;
  for (let i = 0; i < n; i++) b[at + 1 + i] = s.charCodeAt(i) & 0xff;
}

/** A course: the level file names in play order. */
export function parseCourse(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = view.getUint32(0, true);
  if (bytes.length !== 4 + SHORT_STRING * n) throw new Error(`a course of ${n} levels has ${4 + SHORT_STRING * n} bytes, not ${bytes.length}`);
  return Array.from({ length: n }, (_, i) => readShortString(bytes, 4 + SHORT_STRING * i));
}

export function writeCourse(levels: string[]): Uint8Array {
  const b = new Uint8Array(4 + SHORT_STRING * levels.length);
  new DataView(b.buffer).setUint32(0, levels.length, true);
  levels.forEach((name, i) => writeShortString(b, 4 + SHORT_STRING * i, name));
  return b;
}

export interface HighScore {
  /** The list text: score, three spaces, name. */
  text: string;
  score: number;
  /** The course's level index reached (0-based). */
  level: number;
}

const SCORE_RECORD = SHORT_STRING + 8;

export function parseHighScores(bytes: Uint8Array): HighScore[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = Math.min(view.getUint32(0, true), Math.floor((bytes.length - 4) / SCORE_RECORD));
  return Array.from({ length: n }, (_, i) => {
    const at = 4 + SCORE_RECORD * i;
    return { text: readShortString(bytes, at), score: view.getInt32(at + 51, true), level: view.getInt32(at + 55, true) };
  });
}

export function writeHighScores(scores: HighScore[]): Uint8Array {
  const b = new Uint8Array(4 + SCORE_RECORD * scores.length);
  const view = new DataView(b.buffer);
  view.setUint32(0, scores.length, true);
  scores.forEach((s, i) => {
    const at = 4 + SCORE_RECORD * i;
    writeShortString(b, at, s.text);
    view.setInt32(at + 51, s.score, true);
    view.setInt32(at + 55, s.level, true);
  });
  return b;
}

/** ChangeFileExt(course, 'scr'): default.cse → defaultscr. */
export const highScoreFile = (course: string) => course.replace(/\.[^.\\/]*$/, '') + 'scr';
