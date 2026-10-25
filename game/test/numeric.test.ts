import { describe, expect, it } from 'vitest';
import { DelphiRandom, direction, mod2f, normAngle, real48, roundHalfEven } from '../src/sim/numeric';
import { highScoreFile, parseCourse, parseHighScores, writeCourse, writeHighScores } from '../src/sim/files';
import { gameData } from './helpers';

describe('Delphi numerics', () => {
  it('Random follows the Delphi generator', () => {
    const r = new DelphiRandom(0);
    // seeds 1, 0x08088406, …: high dword of seed * n
    expect([r.next(100), r.next(100)]).toEqual([0, 3]);
    expect(r.seed).toBe(0x08088406);
    const all = new DelphiRandom(12345);
    for (let i = 0; i < 1000; i++) {
      const v = all.next(6);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
    }
  });

  it('NormAngle keeps the quirk for angles ≤ 0', () => {
    expect(normAngle(370)).toBe(10);
    expect(normAngle(360)).toBe(0);
    expect(normAngle(0)).toBe(1440);
    expect(normAngle(-30)).toBe(1410);
    expect(normAngle(-255)).toBe(1185);
  });

  it('rounds half to even, like the x87', () => {
    expect([roundHalfEven(2.5), roundHalfEven(3.5), roundHalfEven(-2.5), roundHalfEven(-12), roundHalfEven(1.4)])
      .toEqual([2, 4, -2, -12, 1]);
  });

  it('Real keeps 39 fraction bits', () => {
    expect(real48(3)).toBe(3);
    expect(real48(0.5)).toBe(0.5);
    const third = real48(1 / 3);
    expect(Math.abs(third - 1 / 3)).toBeLessThan(2 ** -40);
    expect(third).not.toBe(1 / 3);
    expect(real48(-1 / 3)).toBe(-third);
  });

  it('direction: 90° is up', () => {
    const [dx, dy] = direction(90);
    expect(dx).toBeCloseTo(0, 12);
    expect(dy).toBe(-1);
    expect(direction(1440 + 30)[0]).toBeCloseTo(Math.cos(Math.PI / 6), 10);
  });

  it('Mod2f wraps into 0 … n', () => {
    expect(mod2f(11.2, 11)).toBeCloseTo(0.2, 12);
    expect(mod2f(-0.4, 11)).toBeCloseTo(10.6, 12);
  });
});

describe('original files', () => {
  it('reads the courses and high scores', async () => {
    const { files } = await gameData();
    const def = files.courses.get('default.cse')!;
    expect(def.length).toBe(24);
    expect(def[0]).toBe('Hi.lev');
    expect(def[23]).toBe('GoodVsEvil.lev');
    expect(files.courses.get('Mystery.cse')!.length).toBe(11);
    const scores = files.scores.get('defaultscr')!;
    expect(scores[0]).toEqual({ text: '5146000   ac', score: 5146000, level: 23 });
    expect(scores.length).toBe(9);
    expect(files.levels.size).toBe(32 + 60); // the original's and the remake's three courses of 20
  });

  it('writes what it reads', () => {
    const course = ['Hi.lev', 'Clouds.lev'];
    expect(parseCourse(writeCourse(course))).toEqual(course);
    const scores = [{ text: '500   Adi', score: 500, level: 1 }];
    expect(parseHighScores(writeHighScores(scores))).toEqual(scores);
    expect(highScoreFile('default.cse')).toBe('defaultscr');
  });
});
