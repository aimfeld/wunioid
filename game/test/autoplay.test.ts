// Plays every level of the remake's own courses (courses/*.txt, built by tools/build_courses.py) with an
// autopilot and endless lives, and reports how long each took and how many balls it lost. A level the
// autopilot can't finish, or where nothing scores for a long while (a ball circling out of reach), fails.
// Slow, so only on request: AUTOPLAY=1 npx vitest run test/autoplay.test.ts (AUTOPLAY=Postcards for one course).

import { describe, expect, it } from 'vitest';
import type { Ball } from '../src/sim/sprites';
import type { World } from '../src/sim/world';
import { gameData, press, remakeCourses, testGame } from './helpers';

const COURSES = remakeCourses();
const LIMIT = 60000; // ticks, 22 min of play
const STALL = 9000; // ticks without a score

/** Where a falling ball's left edge will be when it reaches the paddle's top, off the side walls. */
function landing(b: Ball, paddleY: number): number {
  const t = (paddleY - b.h - b.y) / b.dy;
  const span = 400 - b.w;
  let x = b.x + b.dx * t - 14;
  x = ((x % (2 * span)) + 2 * span) % (2 * span);
  return 14 + (x > span ? 2 * span - x : x);
}

/** Catch the ball that lands first, at a random spot of the paddle so the angles vary. */
function pilot(w: World, aim: { offset: number; ball: Ball | null }) {
  const p = w.paddle;
  if (!p) return press({});
  const falling = w.balls.filter((b) => !b.glued && b.dy > 0 && b.y < p.y);
  const next = falling.sort((a, b) => (p.y - a.y) / a.dy - (p.y - b.y) / b.dy)[0];
  if (next !== aim.ball) {
    aim.ball = next ?? null;
    aim.offset = w.random(56) - 28;
  }
  const target = next ? landing(next, p.y) + next.w / 2 + aim.offset : 214;
  const centre = p.x + p.w / 2;
  return press({ left: target < centre - 3, right: target > centre + 3, up: w.balls.some((b) => b.glued), fire: true });
}

/** The stones left, a letter per kind (a = GemRed … m = Killer), _ for a hidden one. */
function board(w: World): string {
  const rows: string[] = [];
  for (let r = 1; r <= 17; r++) {
    let s = '';
    for (let c = 1; c <= 13; c++) {
      const st = w.cell(c, r);
      s += st ? (st.visible ? String.fromCharCode(96 + st.kind) : '_') : '.';
    }
    rows.push(s);
  }
  return '\n' + rows.join('\n');
}

interface Result { level: string; ticks: number; lost: number; done: boolean; stalled: boolean }

async function play(name: string, level: Uint8Array, seed: number): Promise<Result> {
  const w = await testGame(level, seed);
  const aim = { offset: 0, ball: null as Ball | null };
  let lost = 0, lastScore = 0, lastChange = 0, t = 0;
  for (; t < LIMIT && w.stonesLeft > 0; t++) {
    const lives = w.lives;
    w.tick(pilot(w, aim));
    if (w.lives < lives) lost++;
    w.lives = 3;
    if (w.score !== lastScore) [lastScore, lastChange] = [w.score, t];
    if (t - lastChange > STALL) {
      if (process.env.AUTOPLAY_DEBUG) console.log(name, board(w), w.balls.map((b) => `${b.x.toFixed(0)},${b.y.toFixed(0)} a${b.angle}`));
      break;
    }
  }
  if (process.env.AUTOPLAY_DEBUG && t >= LIMIT) console.log(name, board(w), w.stonesLeft);
  return { level: name, ticks: t, lost, done: w.stonesLeft === 0, stalled: t - lastChange > STALL };
}

const only = process.env.AUTOPLAY;
const SEEDS = [1, 2, 3];
const minutes = (ticks: number) => (ticks / 45.45 / 60).toFixed(1).padStart(5);

describe.runIf(only)('autoplay', () => {
  for (const course of COURSES.filter((c) => only === '1' || c.startsWith(only ?? ''))) {
    it(`finishes every level of ${course}`, async () => {
      const files = (await gameData()).files;
      const levels = files.courses.get(course)!;
      const failed: string[] = [];
      const lines = [];
      for (const [i, name] of levels.entries()) {
        const runs = [];
        for (const seed of SEEDS) runs.push(await play(name, files.levels.get(name)!, seed));
        const done = runs.filter((r) => r.done);
        if (done.length === 0) failed.push(name);
        const ticks = runs.map((r) => (r.done ? r.ticks : Infinity)).sort((a, b) => a - b);
        lines.push(`${String(i + 1).padStart(2)} ${name.padEnd(20)} ${done.length}/${runs.length} done, ` +
          `median ${minutes(ticks[runs.length >> 1])} min, ${runs.map((r) => r.lost).join('/')} balls lost` +
          runs.filter((r) => !r.done).map((r) => (r.stalled ? '  STALL' : '  LIMIT')).join(''));
      }
      console.log(`${course}\n${lines.join('\n')}`);
      expect(failed).toEqual([]);
    }, 1_800_000);
  }
});
