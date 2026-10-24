import { describe, expect, it } from 'vitest';
import { Bonus, Capsule, PaddleKind, StoneAttr, StoneKind } from '../src/sim/sprites';
import { GameState, NO_INPUT } from '../src/sim/world';
import { courseGame, makeLevel, press, testGame, ticks } from './helpers';

describe('start of a course game', () => {
  it('builds the first level of the default course', async () => {
    const w = await courseGame();
    expect(w.state).toBe(GameState.Course);
    expect(w.course.name).toBe('default.cse');
    expect([w.score, w.lives, w.levelIndex]).toEqual([0, 3, 0]);
    expect([w.paddle!.x, w.paddle!.y, w.paddle!.w]).toEqual([200, 430, 80]);
    expect(w.balls.length).toBe(1);
    const b = w.balls[0];
    expect([b.x, b.y, b.glued, b.speed]).toEqual([240, 418, true, 3]);
    expect(w.stonesLeft).toBe(28); // Hi.lev
    expect(w.text?.image).toBe('Letsgo');
    expect(w.tiles?.image).toBe('Tile1');
  });

  it('draws by Z, newer sprites under older ones of the same Z', async () => {
    const w = await courseGame();
    const order = w.drawList().map((s) => s.image);
    expect(order[0]).toBe('Rahmen');
    expect(order[1]).toBe('Tile1');
    expect(order.at(-1)).toBe('Letsgo');
    // the paddle and the first ball were created before the stones: drawn over them
    expect(order.indexOf('Paddle')).toBeGreaterThan(order.indexOf('GemRed'));
    expect(order.indexOf('Ball')).toBeLessThan(order.indexOf('Paddle'));
  });
});

describe('paddle', () => {
  it('moves 6 px per tick and carries the glued ball', async () => {
    const w = await courseGame();
    ticks(w, 3, press({ left: true }));
    expect(w.paddle!.x).toBe(182);
    expect(w.balls[0].x).toBe(222);
    ticks(w, 40, press({ left: true }));
    expect(w.paddle!.x).toBe(14); // 200 − 31 × 6
    ticks(w, 60, press({ right: true }));
    expect(w.paddle!.x + w.paddle!.w).toBe(418); // checked before the step: past the right wall
  });

  it('releases the ball at 90° plus the offset', async () => {
    const w = await courseGame();
    w.tick(press({ up: true }));
    const b = w.balls[0];
    expect(b.glued).toBe(false);
    // paddle centre 240, ball centre 246: Round(−6 × 2) = −12
    expect(b.angle).toBe(78);
    expect(b.x).toBeCloseTo(240 + 6 * Math.cos((78 * Math.PI) / 180), 9);
    expect(b.y).toBeCloseTo(418 - 6 * Math.sin((78 * Math.PI) / 180), 9);
  });

  it('bounces a ball coming down, normalising the reflected angle first', async () => {
    const w = await courseGame();
    const b = w.balls[0];
    Object.assign(b, { glued: false, x: 231, y: 420, angle: 300 });
    b.setDirection();
    w.tick(NO_INPUT);
    // moved to x 234 (centre 240 = the paddle's), Reflect(0) gives 1140, NormAngle 60, offset 0
    expect(b.angle).toBe(60);
    expect(w.sounds.some((s) => s.startsWith('PaddleBall'))).toBe(true);
  });

  it('holds the ball with glue', async () => {
    const w = await courseGame();
    const b = w.balls[0];
    Object.assign(b, { glued: false, x: 231, y: 420, angle: 300 });
    b.setDirection();
    w.paddle!.glueTimer = 10;
    w.tick(NO_INPUT);
    expect(b.glued).toBe(true);
    expect(b.y).toBe(418);
  });
});

describe('ball', () => {
  it('reflects off the left wall', async () => {
    const w = await courseGame();
    const b = w.balls[0];
    Object.assign(b, { glued: false, x: 13.5, y: 300, angle: 135 });
    b.setDirection();
    w.tick(NO_INPUT);
    expect(b.angle).toBe(45);
  });

  it('steers out of the band around 180°', async () => {
    const w = await courseGame();
    const b = w.balls[0];
    Object.assign(b, { glued: false, x: 200, y: 300, angle: 175 });
    b.setDirection();
    w.tick(NO_INPUT);
    expect(b.angle).toBe(168);
    b.angle = 185;
    w.tick(NO_INPUT);
    expect(b.angle).toBe(192);
  });

  it('takes two hits to break a Block', async () => {
    const w = await testGame(makeLevel([[7, 10, StoneKind.Block], [1, 1, StoneKind.GemRed]]));
    const b = w.balls[0];
    const shoot = () => {
      Object.assign(b, { glued: false, x: 208, y: 170, angle: 91 });
      b.setDirection();
      w.tick(NO_INPUT);
    };
    shoot();
    expect(b.angle).toBe(269); // off the bottom side: Reflect(180)
    expect(w.cell(7, 10)!.hits).toBe(1);
    expect(w.sounds).toContain('Abprall');
    expect(w.score).toBe(0);
    shoot();
    expect(w.cell(7, 10)).toBeNull();
    expect(w.sounds).toContain('Crunch');
    expect([w.score, w.stonesLeft]).toEqual([500, 1]);
    expect(w.sprites.some((s) => s.image === 'ZBlock')).toBe(true);
  });

  it('is lost at the bottom: D\'Oh! for 100 ticks, then a new ball', async () => {
    const w = await courseGame();
    const b = w.balls[0];
    Object.assign(b, { glued: false, x: 300, y: 495, angle: 271 });
    b.setDirection();
    w.paddle!.setKind(PaddleKind.Long);
    w.tick(NO_INPUT);
    expect(w.sounds).toContain('Doh');
    expect(w.balls.length).toBe(0);
    expect(w.inLoop).toBe(true);
    ticks(w, 98, press({ left: true }));
    expect(w.paddle!.x).toBe(200); // frozen
    expect(w.balls.length).toBe(0);
    w.tick(NO_INPUT);
    expect(w.inLoop).toBe(false);
    expect([w.balls.length, w.lives, w.paddle!.kind]).toEqual([1, 2, PaddleKind.Normal]);
  });

  it('game over: a high score with fewer than 10 entries, whatever the score', async () => {
    const w = await courseGame();
    w.lives = 0;
    const b = w.balls[0];
    Object.assign(b, { glued: false, x: 300, y: 495, angle: 271 });
    b.setDirection();
    w.tick(NO_INPUT);
    expect(w.sounds).toContain('MultiDoh');
    ticks(w, 199);
    expect(w.state).toBe(GameState.CourseEditor);
    expect(w.pendingHighScore).toEqual({ score: 0, level: 0, place: 9 });
    let saved = '';
    w.onHighScores = (file, list) => (saved = `${file} ${list.length} ${list[9].text}`);
    w.enterHighScore('Wuni');
    expect(saved).toBe('defaultscr 10 0   Wuni');
    w.courseEditorOpen = false;
    ticks(w, 2);
    expect(w.state).toBe(GameState.Course);
    expect(w.lives).toBe(3);
  });
});

describe('stones', () => {
  it('Hike jumps up on the first tick, then every 10 ticks', async () => {
    const w = await testGame(makeLevel([[7, 10, StoneKind.GemRed, StoneAttr.Hike], [1, 1, StoneKind.GemRed]]));
    w.tick(NO_INPUT);
    expect(w.cell(7, 10)).toBeNull();
    expect(w.cell(7, 9)?.attr).toBe(StoneAttr.Hike);
    ticks(w, 9);
    expect(w.cell(7, 9)).not.toBeNull();
    w.tick(NO_INPUT);
    expect(w.cell(7, 8)?.kind).toBe(StoneKind.GemRed);
    expect(w.stonesLeft).toBe(2);
  });

  it('Hike turns right first when blocked', async () => {
    const w = await testGame(makeLevel([[7, 10, StoneKind.GemRed, StoneAttr.Hike], [7, 9, StoneKind.Granit], [1, 1, StoneKind.GemRed]]));
    w.tick(NO_INPUT);
    expect(w.cell(8, 10)?.dir).toBe(1);
  });

  it('Goldie turns its neighbours into Goldies, except Iron and Move', async () => {
    const w = await testGame(makeLevel([
      [5, 5, StoneKind.Goldie], [4, 4, StoneKind.GemRed], [5, 4, StoneKind.Block],
      [6, 5, StoneKind.Block, StoneAttr.Iron], [5, 6, StoneKind.GemGreen, StoneAttr.Move], [1, 17, StoneKind.GemBlue],
    ]));
    expect(w.stonesLeft).toBe(4);
    w.cell(5, 5)!.hit(null);
    expect(w.cell(5, 5)).toBeNull();
    expect(w.cell(4, 4)!.kind).toBe(StoneKind.Goldie);
    expect(w.cell(5, 4)!.kind).toBe(StoneKind.Goldie);
    expect(w.cell(6, 5)!.kind).toBe(StoneKind.Block);
    expect(w.cell(5, 6)!.kind).toBe(StoneKind.GemGreen);
    expect([w.stonesLeft, w.score]).toEqual([2, 500]);
  });

  it('BeBack hides for 300 ticks and comes back with 2 hits', async () => {
    const w = await testGame(makeLevel([[5, 5, StoneKind.BeBack], [1, 17, StoneKind.GemBlue]]));
    const s = w.cell(5, 5)!;
    s.hit(null);
    s.hit(null);
    expect([s.visible, s.timer, w.score]).toEqual([false, 300, 500]);
    ticks(w, 300);
    expect([s.visible, s.hits]).toEqual([true, 2]);
    expect(w.sounds).toContain('BeBack');
  });

  it('a Bonus gem always drops a capsule when hit', async () => {
    const w = await testGame(makeLevel([[5, 5, StoneKind.GemViolet, StoneAttr.Bonus], [1, 17, StoneKind.GemBlue]]));
    const s = w.cell(5, 5)!;
    s.hit(null);
    expect(w.bonuses.length).toBe(1);
    expect([w.bonuses[0].x, w.bonuses[0].y]).toEqual([s.x, s.y]);
    expect(['B$Violet', 'BZup', 'BEnd']).toContain(w.bonuses[0].image);
    expect(w.sounds).toContain('Bonus');
    expect(w.sprites.some((x) => x.image.startsWith('Z'))).toBe(false); // no shatter
  });

  it('Eater eats the ball, Doubler splits it', async () => {
    const w = await testGame(makeLevel([[5, 5, StoneKind.Eater], [8, 5, StoneKind.Doubler], [1, 17, StoneKind.GemBlue]]));
    const ball = w.balls[0];
    ball.glued = false;
    w.cell(8, 5)!.hit(ball);
    expect(w.balls.length).toBe(2);
    expect(w.sounds).toContain('Double');
    w.cell(5, 5)!.hit(ball);
    expect(w.balls.length).toBe(1);
    expect(w.sounds).toContain('Eat');
  });
});

describe('capsules', () => {
  async function collect(n: Capsule) {
    const w = await testGame(makeLevel([[6, 10, StoneKind.Granit], [1, 17, StoneKind.GemBlue]]));
    new Bonus(w, w.paddle!.y, w.paddle!.x, n);
    w.tick(NO_INPUT);
    return w;
  }

  it('money: 10000', async () => {
    const w = await collect(Capsule.SGreen);
    expect(w.score).toBe(10000);
    expect(w.sounds).toContain('Money');
  });

  it('5xo: five glued balls', async () => {
    const w = await collect(Capsule.FiveBalls);
    expect(w.balls.length).toBe(6);
    expect(w.balls.slice(1).map((b) => b.x)).toEqual([194, 214, 234, 254, 274]);
  });

  it('Big: a mega ball that splits into three after 300 ticks', async () => {
    const w = await collect(Capsule.Big);
    const mega = w.balls[1];
    expect([mega.image, mega.piercing, mega.glued, mega.y]).toEqual(['MegaBall', true, true, 410]);
    expect(mega.megaTimer).toBe(300);
    mega.megaTimer = 2;
    ticks(w, 2);
    expect(w.balls.length).toBe(4);
    expect(w.balls.slice(1).map((b) => [b.x, b.y, b.glued])).toEqual(Array(3).fill([mega.x + 10, mega.y + 10, false]));
    // the third leaves at 270°, straight into the paddle the mega ball sat on: it bounces in the same tick
    expect(w.balls.slice(1, 3).map((b) => b.angle)).toEqual([30, 150]);
    expect(w.sounds.some((s) => s.startsWith('PaddleBall'))).toBe(true);
  });

  it('Zup removes the Granit stones', async () => {
    const w = await collect(Capsule.Zup);
    expect(w.cell(6, 10)).toBeNull();
    expect(w.score).toBe(0);
  });

  it('Gun: shots in pairs, 15 ticks apart', async () => {
    const w = await collect(Capsule.Gun);
    expect(w.paddle!.kind).toBe(PaddleKind.Gun);
    expect(w.text?.image).toBe('Shootem');
    ticks(w, 16, press({ fire: true }));
    expect(w.sounds.length + w.shots.length).toBeGreaterThan(0);
    expect(w.shots.length).toBeGreaterThanOrEqual(2);
  });
});

describe('a whole course', () => {
  it('plays the default course with an autopilot without failing', async () => {
    const w = await courseGame(7);
    let maxLevel = 0;
    for (let t = 0; t < 60000 && w.state === GameState.Course; t++) {
      const p = w.paddle;
      const target = w.balls.filter((b) => !b.glued).sort((a, b) => b.y - a.y)[0];
      const centre = p ? p.x + p.w / 2 : 0;
      const aim = target ? target.x + target.w / 2 : centre;
      w.tick(press({ left: aim < centre - 4, right: aim > centre + 4, up: t % 50 === 0, fire: true }));
      maxLevel = Math.max(maxLevel, w.levelIndex);
    }
    expect(w.score).toBeGreaterThan(0);
    expect(maxLevel).toBeGreaterThan(0);
  });
});
