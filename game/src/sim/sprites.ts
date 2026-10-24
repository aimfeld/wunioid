// The original's sprite classes (TPaddle, TBall, TStone, TStoneKlirr, TBonus, TShot, TTextSprite and the
// frame and tile sprites), ported procedure by procedure. Addresses refer to WUNIOID.EXE, the rules are in
// docs/gameplay-spec.md. Everything moves per tick: DoMove always gets MoveCount 20.

import { div, direction, mod, mod2f, normAngle, real48, roundHalfEven } from './numeric';
import type { World } from './world';

export const MOVE_COUNT = 20;
export const LEFT_WALL = 14;
export const RIGHT_WALL = 414;
export const TOP_WALL = 14;
export const BOTTOM = 500;
export const MAX_BALLS = 30;
/** 0.02 × MoveCount = 0.4 frames per tick (all looping animations). */
const ANIM_SPEED = 0.02;

/** DelphiX TImageSprite with the fields the game uses. */
export class Sprite {
  x = 0;
  y = 0;
  z = 0;
  w = 0;
  h = 0;
  image = '';
  animCount = 0;
  animLooped = false;
  animPos = 0;
  animSpeed = 0;
  visible = true;
  dead = false;
  /** Draw order among equal Z: DelphiX inserts a sprite before the others of its Z (0x40e5f8), so newer is lower. */
  drawSeq: number;

  constructor(readonly world: World) {
    this.drawSeq = world.add(this);
  }

  setImage(name: string): void {
    const info = this.world.images[name];
    if (!info) throw new Error(`no image ${name}`);
    this.image = name;
    this.w = info.width;
    this.h = info.height;
  }

  /** The image's pattern count (TPictureCollectionItem.PatternCount). */
  get patterns(): number {
    return this.world.images[this.image].frames;
  }

  /** TSprite.SetZ (0x40e888): re-sorted into the draw list only when Z changes. */
  setZ(z: number): void {
    if (z === this.z) return;
    this.z = z;
    this.drawSeq = this.world.nextDrawSeq();
  }

  /** Start a looping animation over all patterns at 0.4 frames per tick. */
  protected loop(randomStart: boolean): void {
    this.animCount = this.patterns;
    this.animLooped = true;
    this.animSpeed = ANIM_SPEED;
    if (randomStart) this.animPos = this.world.random(this.animCount);
  }

  /** The pattern drawn (TImageSprite.GetDrawImageIndex). */
  get frame(): number {
    return Math.trunc(this.animPos);
  }

  /** TImageSprite.DoMove (0x40e968): the animation. */
  animate(): void {
    this.animPos = MOVE_COUNT * this.animSpeed + this.animPos;
    if (!this.animLooped) {
      if (this.animCount <= this.animPos) {
        this.animPos = this.animCount - 1;
        this.animSpeed = 0;
      }
      if (this.animPos < 0) {
        this.animPos = 0;
        this.animSpeed = 0;
      }
    } else if (this.animCount < 1) this.animPos = 0;
    else this.animPos = mod2f(this.animPos, this.animCount);
  }

  doMove(): void {
    this.animate();
  }

  /** TSprite.Dead (0x40e67c): freed by SpriteEngine.Dead at the end of the tick. */
  die(): void {
    this.dead = true;
  }

  /** OverlapRect (0x402aa8) of the two GetBoundsRects: Bounds(Trunc(X), Trunc(Y), W, H), strict on all sides. */
  overlaps(o: Sprite): boolean {
    const ax = Math.trunc(this.x), ay = Math.trunc(this.y), bx = Math.trunc(o.x), by = Math.trunc(o.y);
    return ax < bx + o.w && ax + this.w > bx && ay < by + o.h && ay + this.h > by;
  }
}

/** TBackGround (0x419e18): the frame `Rahmen` at 0, 0. */
export class Frame extends Sprite {
  constructor(world: World) {
    super(world);
    this.setImage('Rahmen');
    this.setZ(0);
  }
}

/** DelphiX TBackgroundSprite (CreateBackground 0x41aed0): 10 × 12 tiles of 40 × 40 from 14, 14. */
export class Tiles extends Sprite {
  static readonly MAP_W = 10;
  static readonly MAP_H = 12;

  constructor(world: World, tile: number) {
    super(world);
    this.setImage(`Tile${tile}`);
    this.x = 14;
    this.y = 14;
    this.setZ(1);
  }

  override doMove(): void {} // TSprite.DoMove: nothing
}

export const enum PaddleKind {
  Normal = 0,
  Gun = 1,
  Long = 2,
  Short = 3,
}

const PADDLE_IMAGES = ['Paddle', 'PaddleGun', 'PaddleLong', 'PaddleShort'];

export class Paddle extends Sprite {
  gunTimer = 0; // +0x5c
  cooldown = 0; // +0x60
  glueTimer = 0; // +0x64
  kind = PaddleKind.Normal; // +0x68

  /** TPaddle.Create (0x416e20). */
  constructor(world: World) {
    super(world);
    this.setImage('Paddle');
    world.paddle = this;
    this.x = 200;
    this.y = 430;
    this.setZ(2);
  }

  /** TPaddle.DoMove (0x416ed8). */
  override doMove(): void {
    this.animate();
    const input = this.world.input, balls = this.world.balls;
    if (this.cooldown > 0) this.cooldown--;
    if (this.gunTimer > 0 && --this.gunTimer === 0) this.setKind(PaddleKind.Normal);
    if (this.glueTimer > 0) this.glueTimer--;
    if (input.left && this.x > LEFT_WALL) {
      this.x = this.x - 0.3 * MOVE_COUNT;
      for (let i = 0, n = balls.length; i < n; i++) if (balls[i].glued) balls[i].x = balls[i].x - 0.3 * MOVE_COUNT;
    }
    if (input.right && this.w + this.x < RIGHT_WALL) {
      this.x = 0.3 * MOVE_COUNT + this.x;
      for (let i = 0, n = balls.length; i < n; i++) if (balls[i].glued) balls[i].x = 0.3 * MOVE_COUNT + balls[i].x;
    }
    if (input.up || input.fire) {
      for (let i = 0, n = balls.length; i < n; i++) {
        const b = balls[i];
        if (!b.glued) continue;
        b.glued = false;
        b.angle = Math.min(160, Math.max(20, this.offset(b) + 90));
        b.setDirection();
      }
    }
    if (input.fire && this.gunTimer > 0 && this.cooldown === 0 && this.kind === PaddleKind.Gun) this.fire();
  }

  /** TPaddle.Fire (0x4171b0). */
  fire(): void {
    const left = new Shot(this.world);
    left.x = this.x + 15;
    left.y = this.y - left.h;
    const right = new Shot(this.world);
    right.x = this.w + this.x - 15 - right.w;
    right.y = this.y - right.h;
    this.cooldown = 15;
    this.world.sound('Shoot');
  }

  /** TPaddle.BallOffset (0x41724c): Round((paddle centre − ball centre) × 2). */
  offset(b: Ball): number {
    return roundHalfEven((this.x + div(this.w, 2) - (b.x + div(b.w, 2))) * 2);
  }

  /** TPaddle.SetKind (0x4172a0). */
  setKind(kind: PaddleKind): void {
    if (kind === PaddleKind.Gun) this.gunTimer = 500;
    this.setImage(PADDLE_IMAGES[kind]);
    this.kind = kind;
  }
}

export class Ball extends Sprite {
  bounced = false; // +0x5c, this tick
  piercing = false; // +0x5d
  glued = true; // +0x5e
  angle = 75; // +0x60, integer degrees
  speed = 3; // +0x64 (Real)
  dx = 0; // +0x6a (Real)
  dy = 0; // +0x70 (Real)
  megaTimer = 0; // +0x78
  piercingTimer = 0; // +0x7c

  /** TBall.Create (0x4189c4): glued to the paddle, its left edge at the paddle's centre. */
  constructor(world: World) {
    super(world);
    this.setImage('Ball');
    world.balls.push(this);
    const p = world.paddle!;
    this.x = div(p.w, 2) + p.x;
    this.y = p.y - this.h;
    this.setZ(2);
    this.setDirection();
  }

  /** TBall.SetDirection (0x419378). */
  setDirection(): void {
    [this.dx, this.dy] = direction(this.angle);
  }

  /** TBall.Reflect (0x419428). */
  reflect(axis: number): void {
    this.angle = normAngle(axis * 2 - normAngle(this.angle));
    this.setDirection();
  }

  /** Taken out of the ball list (TList.Remove) and freed at the end of the tick. */
  remove(): void {
    this.die();
    const balls = this.world.balls, i = balls.indexOf(this);
    if (i >= 0) balls.splice(i, 1);
  }

  /** TBall.DoMove (0x418ac0). */
  override doMove(): void {
    this.animate();
    const w = this.world;
    if (mod(normAngle(this.angle), 90) === 0) {
      this.angle += 1;
      this.setDirection();
    }
    const a = normAngle(this.angle);
    if (a >= 170 && a <= 190) {
      this.angle = a < 181 ? 168 : 192;
      this.setDirection();
    }
    if (this.megaTimer > 0 && --this.megaTimer === 0) {
      this.remove();
      for (let i = 1; i <= 3; i++) {
        if (w.balls.length >= MAX_BALLS) continue;
        const b = new Ball(w);
        b.x = div(this.w, 2) + this.x;
        b.y = div(this.h, 2) + this.y;
        b.angle = (i - 1) * 120 + 30;
        b.setDirection();
        b.glued = false;
      }
    }
    if (this.piercingTimer > 0 && --this.piercingTimer === 0) {
      this.piercing = false;
      this.animPos = 0;
      this.animLooped = false;
    }
    if (!this.glued) {
      if (this.dx < 0 && this.x < LEFT_WALL) this.reflect(270);
      if (this.dx > 0 && this.w + this.x > RIGHT_WALL) this.reflect(90);
      if (this.dy < 0 && this.y < TOP_WALL) this.reflect(180);
      if (this.dy > 0 && this.h + this.y > BOTTOM) this.remove();
      this.x = MOVE_COUNT * 0.1 * this.dx * this.speed + this.x;
      this.y = MOVE_COUNT * 0.1 * this.dy * this.speed + this.y;
    }
    this.bounced = false;
  }

  /** TBall.MakePiercing (0x419454). */
  makePiercing(): void {
    this.piercingTimer = 400;
    this.piercing = true;
    this.loop(true);
  }

  /** TBall.MakeMegaBall (0x419498): piercing with no timer, split into three after 300 ticks. */
  makeMegaBall(): void {
    this.piercing = true;
    this.setImage('MegaBall');
    this.loop(true);
    this.megaTimer = 300;
    this.y = this.world.paddle!.y - this.h;
    this.x = this.world.random(20) + this.x - 10;
  }

  /** TBall.NeighbourFree (0x418d50): is the cell beside `s` open for a bounce off that side? */
  private free(s: Stone, dc: number, dr: number): boolean {
    const c = s.col + dc;
    if (c < 1 || c > 13) return false;
    const n = this.world.cell(c, s.row + dr);
    if (n) {
      if (n.attr === StoneAttr.Move && !n.moveBlocked()) return true;
      if (n.visible && s.attr !== StoneAttr.Move) return false;
    }
    return true;
  }

  /** TBall.BounceOffStone (0x418e14). */
  bounceOffStone(s: Stone): void {
    if (this.bounced) return;
    let b = false;
    if (!this.piercing || s.kind === StoneKind.Granit) {
      const bx = this.x, by = this.y, bw = this.w, bh = this.h;
      const sx = s.x, sy = s.y, sw = s.w, sh = s.h;
      // left side
      if (bx <= sx && sx <= bw + bx && this.dx > 0 && this.free(s, -1, 0)) {
        if (by + 3 <= sy && sy <= bh + by && this.dy > 0 && this.free(s, 0, -1)) {
          this.reflect(30);
          b = true;
        }
        if (!b && by <= sh + sy && sh + sy <= bh + by - 3 && this.dy < 0 && this.free(s, 0, 1)) {
          this.reflect(150);
          b = true;
        }
        if (!b) {
          this.reflect(90);
          b = true;
        }
      }
      // right side
      if (!b && bx <= sw + sx && sw + sx <= bw + bx && this.dx < 0 && this.free(s, 1, 0)) {
        if (by + 3 <= sy && sy <= bh + by && this.dy > 0 && this.free(s, 0, -1)) {
          this.reflect(330);
          b = true;
        }
        if (!b && by <= sh + sy && sh + sy <= bh + by - 3 && this.dy < 0 && this.free(s, 0, 1)) {
          this.reflect(210);
          b = true;
        }
        if (!b) {
          this.reflect(270);
          b = true;
        }
      }
      // top
      if (!b && by <= sy && sy <= bh + by && this.dy > 0 && this.free(s, 0, -1)) {
        if (bx + 1 <= sx && sx <= bw + bx && normAngle(this.angle) > 220 && this.free(s, -1, 0)) {
          this.reflect(30);
          b = true;
        }
        if (!b && bx <= sw + sx && sw + sx <= bw + bx - 1 && normAngle(this.angle) < 320 && this.free(s, 1, 0)) {
          this.reflect(330);
          b = true;
        }
        if (!b) {
          this.reflect(0);
          b = true;
        }
      }
      // bottom
      if (!b && by <= sh + sy && sh + sy <= bh + by && this.dy < 0 && this.free(s, 0, 1)) {
        if (bx + 1 <= sx && sx <= bw + bx && normAngle(this.angle) < 140 && this.free(s, -1, 0)) {
          this.reflect(150);
          b = true;
        }
        if (!b && bx <= sw + sx && sw + sx <= bw + bx - 1 && normAngle(this.angle) > 40 && this.free(s, 1, 0)) {
          this.reflect(210);
          b = true;
        }
        if (!b) {
          this.reflect(180);
          b = true;
        }
      }
    }
    s.hit(this);
    if (b) this.bounced = true;
    if (s.kind === StoneKind.Bubbler && this.speed < 6) this.speed = real48(this.speed + 0.5);
  }
}

export const enum StoneKind {
  GemRed = 1,
  GemOrange = 2,
  GemGreen = 3,
  GemBlue = 4,
  GemViolet = 5,
  Granit = 6,
  Block = 7,
  Bubbler = 8,
  Eater = 9,
  Doubler = 10,
  BeBack = 11,
  Goldie = 12,
  Killer = 13,
}

export const enum StoneAttr {
  None = 0,
  Bonus = 1,
  Move = 2,
  Hike = 3,
  Iron = 4,
}

export const STONE_IMAGES = ['', 'GemRed', 'GemOrange', 'GemGreen', 'GemBlue', 'GemViolet', 'Granit', 'Block',
  'Bubbler', 'Eater', 'Doubler', 'BeBack', 'Goldie', 'Killer'];
const STONE_HITS = [0, 1, 1, 1, 1, 1, 25, 2, 1, 3, 3, 2, 1, 3];
const SHATTER_IMAGES = ['', 'ZGemRed', 'ZGemOrange', 'ZGemGreen', 'ZGemBlue', 'ZGemViolet', 'ZGranit', 'ZBlock',
  'ZGemBlue', 'ZGemBlue', 'ZGemBlue', 'ZBlock', 'ZGemOrange', 'ZGemRed'];
export const ATTR_IMAGES = ['', 'ABonus', 'AMove', 'AHike', 'AIron'];

/** Hike directions (DirToDelta 0x417a6c): 1 right, 2 up, 3 left, 4 down, as (column, row) steps. */
const HIKE_STEPS: [number, number][] = [[0, 0], [1, 0], [0, -1], [-1, 0], [0, 1]];

export class Stone extends Sprite {
  kind: StoneKind; // +0x5c
  attr: StoneAttr; // +0x5d
  col: number; // +0x60, 1…13
  row: number; // +0x64, 1…17
  hits = 0; // +0x68
  label: Sprite | null = null; // +0x6c, the attribute in the editor
  /** +0x70: Move 2 = not started, then 1 / −1; Hike 1…4 (HIKE_STEPS), 2 at first. */
  dir = 2;
  timer: number; // +0x74: BeBack hidden, Hike step

  /** TStone.Create (0x41739c). `hikeKind` > 0: a stone made by a Hike step. */
  constructor(world: World, hikeKind: number, row: number, col: number) {
    super(world);
    if (hikeKind === 0) {
      [this.kind, this.attr] = world.levelCell(col, row);
    } else {
      this.kind = hikeKind;
      this.attr = StoneAttr.Hike;
    }
    this.col = col;
    this.row = row;
    this.setImage(STONE_IMAGES[this.kind]);
    this.x = (col - 1) * 30 + 19;
    this.y = (row - 1) * 15 + 19;
    this.setZ(2);
    this.timer = hikeKind === 0 ? 0 : 10;
    const k = this.kind;
    if (this.attr === StoneAttr.Bonus || (k >= StoneKind.Bubbler && k <= StoneKind.Doubler) || k === StoneKind.Killer) {
      this.loop(true);
    }
    this.hits = STONE_HITS[k] ?? 0;
    if (this.counts() && hikeKind === 0) world.stonesLeft++;
    if (world.state === 3 && this.attr !== StoneAttr.None) {
      const label = new Sprite(world);
      label.setImage(ATTR_IMAGES[this.attr]);
      label.x = this.x + 15;
      label.y = this.y + 7;
      label.setZ(3);
      this.label = label;
    }
  }

  /** TStone.Counts (0x41868c): gems and Blocks without Iron count towards the level's end. */
  counts(): boolean {
    return this.kind !== StoneKind.Granit && !(this.kind >= 8 && this.kind <= 13) && this.attr !== StoneAttr.Iron;
  }

  /** TStone.MoveBlocked (0x417948): neither side cell of its (original) cell is free. */
  moveBlocked(): boolean {
    const w = this.world;
    const free = (s: Stone | null) => s === null || (s.attr === StoneAttr.Move && s.dir !== 2);
    return !((free(w.cell(this.col - 1, this.row)) && this.col !== 1) || (free(w.cell(this.col + 1, this.row)) && this.col !== 13));
  }

  /** TStone.DoMove (0x417cd4): Move, BeBack, Hike. */
  override doMove(): void {
    this.animate();
    if (this.attr === StoneAttr.Move && !this.moveBlocked()) {
      if (this.dir === 2) this.dir = 1;
      this.x = 0.1 * MOVE_COUNT * this.dir + this.x;
      if (this.x < LEFT_WALL) this.dir = 1;
      if (this.w + this.x > RIGHT_WALL) this.dir = -1;
    }
    if (this.kind === StoneKind.BeBack && this.timer > 0 && --this.timer === 0) {
      this.visible = true;
      this.world.sound('BeBack');
      this.hits = 2;
    }
    if (this.attr === StoneAttr.Hike && --this.timer < 1) this.hikeStep();
  }

  /** TStone.BlockedSides (0x4179d8): how many of the 4 neighbour cells hold a stone or lie outside. */
  private blockedSides(): number {
    const w = this.world, c = this.col, r = this.row;
    let n = 0;
    if (w.cell(c + 1, r) !== null || c + 1 > 13) n++;
    if (w.cell(c, r - 1) !== null || r - 1 < 1) n++;
    if (w.cell(c - 1, r) !== null || c - 1 < 1) n++;
    if (w.cell(c, r + 1) !== null || r + 1 > 17) n++;
    return n;
  }

  /** TStone.HikeStep (0x417ac4): move to a neighbouring empty cell, as a new stone. */
  private hikeStep(): void {
    const w = this.world;
    const open = (d: number) => {
      const [dc, dr] = HIKE_STEPS[d];
      const c = this.col + dc, r = this.row + dr;
      return w.cell(c, r) === null && c >= 1 && c <= 13 && r >= 1 && r <= 17;
    };
    const blocked = this.blockedSides();
    let to = open(this.dir) ? this.dir : 0;
    // otherwise the first open side across the current direction (right, up, left, down), or any if 3 are blocked
    for (let d = 1; d <= 4 && to === 0; d++) {
      if (((this.dir + d) & 1) === 0 && blocked !== 3) continue;
      if (open(d)) {
        to = d;
        this.dir = d;
      }
    }
    if (to === 0) return;
    const [dc, dr] = HIKE_STEPS[to];
    const s = new Stone(w, this.kind, this.row + dr, this.col + dc);
    w.setCell(this.col + dc, this.row + dr, s);
    s.hits = this.hits;
    s.dir = this.dir;
    this.die();
    w.setCell(this.col, this.row, null);
  }

  /** TStone.Goldify (0x417dec): the 8 neighbours (not Iron, not Move) become Goldies. */
  private goldify(): void {
    const w = this.world;
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        const c = this.col + dc, r = this.row + dr;
        if (c < 1 || c > 13 || r < 1 || r > 17 || (dc === 0 && dr === 0)) continue;
        const n = w.cell(c, r);
        if (!n || n.attr === StoneAttr.Iron || n.attr === StoneAttr.Move) continue;
        if (n.counts()) w.stonesLeft--;
        n.kind = StoneKind.Goldie;
        n.setImage('Goldie');
        n.animPos = 0;
        n.animCount = 0;
        n.visible = true;
        n.attr = StoneAttr.None;
        n.hits = 1;
      }
    }
  }

  /** A capsule from a gem with the Bonus attribute (the Random rolls of TStone.Hit). */
  private dropCapsule(): void {
    const w = this.world;
    let n = 0;
    switch (this.kind) {
      case StoneKind.GemRed: {
        const r = w.random(6);
        n = r < 4 ? Capsule.SRed : r === 4 ? Capsule.OneUp : Capsule.Gun;
        break;
      }
      case StoneKind.GemOrange: {
        const r = w.random(5);
        n = r < 4 ? Capsule.SOrange : Capsule.Big;
        break;
      }
      case StoneKind.GemGreen: {
        const r = w.random(7);
        n = r < 4 ? Capsule.SGreen : r === 4 ? Capsule.Glue : r === 5 ? Capsule.PadPlus : Capsule.PadMinus;
        break;
      }
      case StoneKind.GemBlue: {
        const r = w.random(10);
        n = r < 6 ? Capsule.SBlue : r < 8 ? Capsule.TwoBalls : r === 8 ? Capsule.Piercing : Capsule.FiveBalls;
        break;
      }
      case StoneKind.GemViolet: {
        const r = w.random(10);
        n = r < 8 ? Capsule.SViolet : r === 8 ? Capsule.Zup : Capsule.End;
        break;
      }
    }
    if (n) new Bonus(w, this.y, this.x, n);
  }

  /** TStone.Hit (0x417ff8, virtual): hit by a ball, or by a shot (null). */
  hit(ball: Ball | null): void {
    const w = this.world;
    if (this.attr === StoneAttr.Bonus) this.dropCapsule();
    if (this.kind === StoneKind.Eater && ball) {
      ball.remove();
      if (w.balls.length > 0) w.sound('Eat');
    }
    if (this.kind === StoneKind.Doubler && ball && w.balls.length < MAX_BALLS) {
      const b = new Ball(w);
      b.x = ball.x;
      b.y = ball.y;
      b.glued = false;
      b.angle = w.random(20) + ball.angle - 10;
      b.setDirection();
      w.sound('Double');
    }
    if (this.kind === StoneKind.Goldie) this.goldify();
    if (this.kind === StoneKind.Killer && ball) ball.makePiercing();
    if (this.attr !== StoneAttr.Iron) this.hits--;
    if (ball && ball.piercing && this.kind !== StoneKind.Granit && this.kind !== StoneKind.Killer && this.attr !== StoneAttr.Iron) {
      this.hits = 0;
    }
    if (this.hits < 1 && this.kind === StoneKind.BeBack) {
      this.visible = false;
      this.timer = 300;
      w.score += 500;
    }
    if (this.hits < 1 && this.kind !== StoneKind.BeBack) {
      if (w.cell(this.col, this.row)?.counts()) w.stonesLeft--;
      if (this.attr === StoneAttr.Bonus) w.sound('Bonus');
      else this.shatter();
      this.die();
      w.setCell(this.col, this.row, null);
      w.score += 500;
    }
    if (this.hits > 0) w.sound(this.attr === StoneAttr.Iron ? 'Iron' : 'Abprall');
  }

  /** TStone.Shatter (0x418614). */
  private shatter(): void {
    new Shatter(this.world, this.kind, this.y, this.x);
    this.world.sound(this.kind === StoneKind.Granit || this.kind === StoneKind.Block ? 'Crunch' : 'Klirr');
  }
}

/** TStoneKlirr: the shatter animation, 9 frames at 1.2 per tick, then gone. */
export class Shatter extends Sprite {
  /** TStoneKlirr.Create (0x4186a8). */
  constructor(world: World, kind: StoneKind, y: number, x: number) {
    super(world);
    this.setImage(SHATTER_IMAGES[kind]);
    this.x = x - 15;
    this.y = y - 10;
    this.setZ(3);
    this.animCount = this.patterns;
    this.animLooped = false;
    this.animSpeed = 0.06;
  }

  /** TStoneKlirr.DoMove (0x41899c): dies on its last frame. */
  override doMove(): void {
    this.animate();
    if (this.animCount - 1 === this.animPos) this.die();
  }
}

/** Capsule numbers (TBonus +0x5c). */
export const enum Capsule {
  SRed = 1,
  OneUp = 2,
  Gun = 3,
  SBlue = 4,
  TwoBalls = 5,
  Piercing = 6,
  FiveBalls = 7,
  SGreen = 8,
  Glue = 9,
  PadPlus = 10,
  PadMinus = 11,
  SOrange = 12,
  Big = 13,
  SViolet = 14,
  Zup = 15,
  End = 16,
}

export const CAPSULE_IMAGES = ['', 'B$Red', 'B1Up', 'BGun', 'B$Blue', 'B2xo', 'B--o', 'B5xo', 'B$Green', 'BGlue',
  'BPad+', 'BPad-', 'B$Orange', 'BBig', 'B$Violet', 'BZup', 'BEnd'];

export class Bonus extends Sprite {
  n: Capsule;

  /** TBonus.Create (0x419554), at the stone's position. */
  constructor(world: World, y: number, x: number, n: Capsule) {
    super(world);
    this.setImage(CAPSULE_IMAGES[n]);
    this.x = x;
    this.y = y;
    this.setZ(3);
    this.n = n;
    this.loop(false);
    world.bonuses.push(this);
  }

  private remove(): void {
    this.die();
    const list = this.world.bonuses, i = list.indexOf(this);
    if (i >= 0) list.splice(i, 1);
  }

  /** TBonus.DoMove (0x41994c): falls 3.2 px per tick. */
  override doMove(): void {
    this.animate();
    this.y = 0.16 * MOVE_COUNT + this.y;
    if (this.y > BOTTOM) this.remove();
  }

  /** TBonus.Collect (0x4199ac). */
  collect(): void {
    const w = this.world, paddle = w.paddle!, balls = w.balls;
    switch (this.n) {
      case Capsule.SRed:
      case Capsule.SBlue:
      case Capsule.SGreen:
      case Capsule.SOrange:
      case Capsule.SViolet:
        w.score += 10000;
        w.sound('Money');
        break;
      case Capsule.OneUp:
        if (w.lives < 25) w.lives++;
        w.sound('Woohoo');
        w.showText('1up', 100);
        break;
      case Capsule.Gun:
        paddle.setKind(PaddleKind.Gun);
        w.showText('Shootem', 100);
        break;
      case Capsule.TwoBalls:
        for (let i = balls.length - 1; i >= 0; i--) {
          if (balls.length >= MAX_BALLS) continue;
          const b = new Ball(w);
          b.x = balls[i].x;
          b.y = balls[i].y;
          b.glued = false;
          b.angle = balls[i].angle + w.random(20) - 10;
          b.setDirection();
        }
        break;
      case Capsule.Piercing:
        for (let i = 0, n = balls.length; i < n; i++) balls[i].makePiercing();
        break;
      case Capsule.FiveBalls:
        for (let i = 1; i <= 5; i++) {
          if (balls.length >= MAX_BALLS) continue;
          const b = new Ball(w);
          b.x = (i - 1) * div(paddle.w, 4) + paddle.x - 6;
        }
        break;
      case Capsule.Glue:
        paddle.glueTimer = 800;
        break;
      case Capsule.PadPlus:
        paddle.setKind(PaddleKind.Long);
        break;
      case Capsule.PadMinus:
        paddle.setKind(PaddleKind.Short);
        w.sound('Haahaa');
        break;
      case Capsule.Big:
        new Ball(w).makeMegaBall();
        break;
      case Capsule.Zup:
        for (let c = 1; c <= 13; c++) {
          for (let r = 1; r <= 17; r++) {
            const s = w.cell(c, r);
            if (s && s.kind === StoneKind.Granit) {
              s.die();
              w.setCell(c, r, null);
            }
          }
        }
        break;
      case Capsule.End:
        w.endCollected = true;
        break;
    }
    this.remove();
  }
}

export class Shot extends Sprite {
  /** TShot.Create (0x419d10). */
  constructor(world: World) {
    super(world);
    this.setImage('Shot');
    this.setZ(3);
    world.shots.push(this);
  }

  private remove(): void {
    this.die();
    const list = this.world.shots, i = list.indexOf(this);
    if (i >= 0) list.splice(i, 1);
  }

  /** TShot.DoMove (0x419da8): rises 11 px per tick (not scaled by MoveCount). */
  override doMove(): void {
    this.animate();
    this.y = this.y - 11;
    if (this.y <= TOP_WALL) this.remove();
  }

  /** TShot.HitStone (0x419df0): the stone takes a hit without a ball. */
  hitStone(s: Stone): void {
    s.hit(null);
    this.remove();
  }
}

/** TTextSprite: an animated banner from TextImageList. */
export class TextSprite extends Sprite {
  counter: number; // +0x5c, ticks left

  /** TTextSprite.Create (0x419eac); the blocking loop is World.showTextBlocking. */
  constructor(world: World, name: string, ticks: number) {
    super(world);
    this.setImage(name);
    this.x = 214 - div(this.w, 2);
    this.y = 120;
    this.setZ(20);
    this.loop(false);
    this.counter = ticks;
  }

  /** TTextSprite.DoMove (0x419fec). */
  override doMove(): void {
    this.animate();
    if (--this.counter === 0) {
      this.die();
      this.world.text = null;
    }
  }
}
