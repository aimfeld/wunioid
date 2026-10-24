// The Remastered picture (Phase 3): the same simulation state as Classic, drawn at the display's resolution and
// refresh rate. Sprites are the re-renders of tools/remaster_render.py at their original places and sizes, moved
// smoothly: positions are interpolated between the last two ticks (beforeTick keeps the older one; a jump of more
// than SNAP px is a new place, not motion). Render only: the simulation, and so the gameplay, stays the same.
//
// Effects come from comparing the state of two ticks (afterTick), so a paused game spawns nothing and its particles
// stand still: a stone that shatters bursts into splinters of its colour (instead of the shatter animation), a
// stone that takes a hit and stays flashes, the ball throws sparks off the paddle, a collected capsule leaves a ring,
// shots get a muzzle flash and sparks where they end. Balls, shots and capsules glow and light the floor, balls
// leave a short trail, everything casts a shadow on the background, which is dimmed towards its edges. Losing the
// ball shakes the picture; a new level fades in. The banners are text in the TextImageList's colours.
//
// Layout: the picture is the original's 640 x 480 (the playfield in the frame and the HUD panel right of it), or in
// a phone's portrait window the playfield under a HUD strip, scaled to fill the area (not integer: nothing here is
// pixel art).

import { Application, Container, Graphics, Sprite as PixiSprite, Text, TilingSprite } from 'pixi.js';
import type { Rect } from '../input/touch';
import { Ball, Bonus, Frame, Paddle, Shatter, Shot, Stone, TextSprite, Tiles, type Sprite } from '../sim/sprites';
import { GameState, type World } from '../sim/world';
import { BALL_COLORS, CAPSULE_COLORS, RemasterAssets, SHATTER_COLORS, STONE_COLORS } from './remastered/assets';
import { FONT, Hud, PANEL_X, STRIP_H, goldFill } from './remastered/hud';

export const W = 640;
export const H = 480;
const FIELD_W = PANEL_X;
const FIELD = { x0: 14, y0: 14, x1: 414, y1: 480 }; // inside the frame
const SNAP = 48;
const SHADOW = { dx: 3, dy: 4, alpha: 0.42 };
const MAX_PARTICLES = 700;
const TRAIL = 6; // ticks
const TRAIL_STEP = 0.5; // ticks between the trail's glows
const FADE_TICKS = 12;
const BANNERS: Record<string, string> = {
  GameOver: 'Game Over!', DOh: "D'Oh!", Shootem: "Shoot 'em!", '1up': '1 Up', Welldone: 'Well Done!',
  Letsgo: "Let's go!", CourseDone: 'Course Done!',
};
/** Their ticks (the ShowText calls), so their age is known whenever they are first drawn. */
const BANNER_TICKS: Record<string, number> = { GameOver: 200, DOh: 100, Shootem: 100, '1up': 100, Welldone: 200,
  Letsgo: 100, CourseDone: 200 };

interface Particle {
  s: PixiSprite;
  x: number;
  y: number;
  vx: number; // px per tick
  vy: number;
  g: number; // gravity, px per tick²
  rot: number;
  vr: number;
  t0: number; // ticks
  life: number;
  size0: number; // px
  size1: number;
  alpha: number;
}

interface Drawn {
  s: PixiSprite;
  shadow: PixiSprite | null;
  flash: PixiSprite | null;
  seen: number;
}

interface Banner {
  t: Text;
  total: number;
}

interface StoneMark {
  x: number;
  y: number;
  image: string;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class RemasteredView {
  readonly root = new Container();
  private readonly scene = new Container(); // picture px; shaken
  private readonly field = new Container(); // the playfield, clipped to inside the frame
  private readonly tiles: TilingSprite;
  private readonly dim = new Graphics();
  private readonly vignette: PixiSprite;
  private readonly floor = new Container(); // light on the background (additive)
  private readonly shadows = new Container();
  private readonly objects = new Container();
  private readonly glows = new Container(); // additive
  private readonly splinters = new Container();
  private readonly sparks = new Container(); // additive
  private readonly frame: PixiSprite;
  private readonly banners = new Container();
  private readonly fade = new Graphics();
  readonly hud: Hud;
  private area: Rect | null = null;
  private strip = false;
  private scale = 1;

  private readonly drawn = new Map<Sprite, Drawn>();
  private readonly prev = new Map<Sprite, [number, number]>();
  private readonly trails = new Map<Ball, [number, number][]>();
  private readonly hits = new Map<Stone, number>();
  private readonly flashes = new Map<Stone, number>(); // tick of the last hit
  private readonly bannerTexts = new Map<TextSprite, Banner>();
  private readonly seenShatters = new WeakSet<Shatter>();
  private readonly seenShots = new WeakSet<Shot>();
  private stones: StoneMark[] = [];
  private bonuses: Bonus[] = [];
  private shots: Shot[] = [];
  private particles: Particle[] = [];
  private pool: PixiSprite[] = [];
  private glowPool: PixiSprite[] = [];
  private glowUsed = 0;
  private ticks = 0; // the view's clock: ticks seen
  private shakeT = -99;
  private fadeT = -99;
  private lastFrame: Frame | null = null;
  private frameNo = 0;

  constructor(private readonly app: Application, private readonly assets: RemasterAssets) {
    const tile = assets.get('Tile1')!;
    this.tiles = new TilingSprite({ texture: tile.textures[0], width: FIELD.x1 - FIELD.x0, height: FIELD.y1 - FIELD.y0 });
    this.tiles.tileScale.set(tile.scale);
    this.tiles.position.set(FIELD.x0, FIELD.y0);
    this.dim.rect(FIELD.x0, FIELD.y0, FIELD.x1 - FIELD.x0, FIELD.y1 - FIELD.y0).fill({ color: 0x000000, alpha: 0.22 });
    this.vignette = new PixiSprite(assets.vignette);
    this.vignette.position.set(FIELD.x0, FIELD.y0);
    this.vignette.setSize(FIELD.x1 - FIELD.x0, FIELD.y1 - FIELD.y0);
    this.vignette.alpha = 0.55;
    const mask = new Graphics().rect(FIELD.x0, FIELD.y0, FIELD.x1 - FIELD.x0, FIELD.y1 - FIELD.y0).fill(0xffffff);
    this.field.addChild(this.tiles, this.dim, this.vignette, this.floor, this.shadows, this.objects, this.glows,
      this.splinters, this.sparks, mask);
    this.field.mask = mask;
    this.frame = new PixiSprite(assets.frame);
    this.frame.scale.set(0.25);
    this.hud = new Hud(assets);
    this.scene.addChild(this.field, this.frame, this.banners, this.hud.panel, this.hud.strip);
    this.root.addChild(this.scene, this.fade);
    app.stage.addChild(this.root);
    window.addEventListener('resize', () => this.layout());
    this.layout();
  }

  /** The Remastered graphics (sprites.json, the atlases, the frame) and the font. */
  static async create(app: Application, base: string, assets: Promise<RemasterAssets>): Promise<RemasteredView> {
    const font = new FontFace(FONT, `url(${base}fonts/ComicNeue-Bold.ttf)`, { weight: 'bold' });
    document.fonts.add(font);
    await Promise.all([font.load().catch(() => undefined), assets]);
    return new RemasteredView(app, await assets);
  }

  get element(): HTMLCanvasElement {
    return this.app.canvas;
  }

  set visible(on: boolean) {
    this.root.visible = on;
  }

  set touch(on: boolean) {
    this.hud.touch = on;
  }

  /** As ClassicView.setArea: the window part to draw in, `strip` for the phone portrait picture. */
  setArea(area: Rect | null, strip = false): void {
    const a = this.area;
    if (strip === this.strip &&
      (a === area || (a && area && a.x === area.x && a.y === area.y && a.w === area.w && a.h === area.h))) return;
    this.area = area && { ...area };
    this.strip = strip;
    this.layout();
  }

  get picture(): Rect {
    const s = this.scale;
    return this.strip
      ? { x: this.root.x, y: this.root.y, w: FIELD_W * s, h: (H + STRIP_H) * s }
      : { x: this.root.x, y: this.root.y, w: W * s, h: H * s };
  }

  /** Client coordinates to picture pixels (the playfield's, as Classic's). */
  toScreen(cx: number, cy: number): [number, number] {
    const s = this.scale;
    return [(cx - this.root.x) / s, (cy - this.root.y) / s - (this.strip ? STRIP_H : 0)];
  }

  private layout(): void {
    const a = this.area ?? { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
    const [pw, ph] = this.strip ? [FIELD_W, H + STRIP_H] : [W, H];
    const s = Math.min(a.w / pw, a.h / ph);
    this.scale = s;
    this.root.scale.set(s);
    this.root.position.set(Math.round(a.x + (a.w - pw * s) / 2), Math.round(a.y + (a.h - ph * s) / 2));
    this.scene.y = this.strip ? STRIP_H : 0;
    this.hud.panel.visible = !this.strip;
    this.hud.strip.visible = this.strip;
    this.hud.strip.y = -STRIP_H;
    const r = s * (window.devicePixelRatio || 1);
    this.hud.setResolution(r);
    for (const b of this.bannerTexts.values()) b.t.resolution = r;
    this.fade.clear().rect(0, 0, pw, ph).fill(0x000000);
  }

  // ---- ticks

  /** Before each tick: where every sprite is, for the interpolation. */
  beforeTick(w: World): void {
    this.prev.clear();
    for (const s of w.sprites) this.prev.set(s, [s.x, s.y]);
    for (const b of w.balls) {
      let t = this.trails.get(b);
      if (!t) this.trails.set(b, (t = []));
      t.push([b.x + b.w / 2, b.y + b.h / 2]);
      if (t.length > TRAIL) t.shift();
    }
  }

  /** After each tick: the events for the effects. */
  afterTick(w: World): void {
    this.ticks++;
    const now = this.ticks;
    // a new level
    const frame = w.sprites.find((s): s is Frame => s instanceof Frame) ?? null;
    if (frame !== this.lastFrame) {
      this.lastFrame = frame;
      this.fadeT = now;
      this.trails.clear();
      this.hits.clear();
      this.flashes.clear();
      this.clearParticles();
    }
    for (const b of this.trails.keys()) if (!w.balls.includes(b)) this.trails.delete(b);
    // splinters where a stone shattered, in the stone's colour
    for (const s of w.sprites) {
      if (s instanceof Shatter && !this.seenShatters.has(s)) {
        this.seenShatters.add(s);
        const sx = s.x + 15, sy = s.y + 10;
        const near = this.stones.find((m) => Math.abs(m.x - sx) < 3 && Math.abs(m.y - sy) < 3);
        const color = (near && STONE_COLORS[near.image]) ?? SHATTER_COLORS[s.image] ?? 0xffffff;
        this.burst(sx + 15, sy + 7.5, color, near?.image === 'Granit' || near?.image === 'Block');
      }
    }
    // stones that took a hit and stay
    for (const s of w.sprites) {
      if (!(s instanceof Stone) || !s.visible) continue;
      const h = this.hits.get(s);
      if (h !== undefined && s.hits < h) {
        this.flashes.set(s, now);
        this.dust(s.x + 15, s.y + 7.5, STONE_COLORS[s.image] ?? 0xffffff);
      }
      this.hits.set(s, s.hits);
    }
    this.stones = w.sprites.filter((s): s is Stone => s instanceof Stone).map((s) => ({ x: s.x, y: s.y, image: s.image }));
    // the paddle hits the ball
    const p = w.paddle;
    if (p && w.sounds.some((n) => n.startsWith('PaddleBall'))) {
      for (const b of w.balls) {
        if (b.dy < 0 && Math.abs(b.y + b.h - p.y) < 10) this.sparkBurst(b.x + b.w / 2, p.y, 0xfff0b0, 10, 2.6);
      }
    }
    // collected capsules: gone above the bottom
    for (const b of this.bonuses) {
      if (!w.bonuses.includes(b) && b.y <= 480 && p) this.pickup(b.x + 15, b.y + 10, CAPSULE_COLORS[b.image] ?? 0xffffff);
    }
    this.bonuses = [...w.bonuses];
    // shots: a muzzle flash, sparks where they end inside the field
    for (const s of w.shots) {
      if (!this.seenShots.has(s)) {
        this.seenShots.add(s);
        this.sparkBurst(s.x + 2.5, s.y + 18, 0xffc080, 5, 1.6);
      }
    }
    for (const s of this.shots) if (!w.shots.includes(s) && s.y > 16) this.sparkBurst(s.x + 2.5, s.y, 0xffe0a0, 8, 2.2);
    this.shots = [...w.shots];
    if (w.sounds.includes('Doh') || w.sounds.includes('MultiDoh')) this.shakeT = now;
  }

  // ---- particles

  private sprite(): PixiSprite {
    const s = this.pool.pop() ?? new PixiSprite();
    s.anchor.set(0.5);
    s.visible = true;
    return s;
  }

  private add(p: Omit<Particle, 's' | 't0'> & { texture: 'shard' | 'spark' | 'glow' | 'ring'; color: number; layer: Container }): void {
    if (this.particles.length >= MAX_PARTICLES) return;
    const s = this.sprite();
    s.texture = this.assets[p.texture];
    s.tint = p.color;
    s.blendMode = p.layer === this.sparks ? 'add' : 'normal';
    p.layer.addChild(s);
    this.particles.push({ s, x: p.x, y: p.y, vx: p.vx, vy: p.vy, g: p.g, rot: p.rot, vr: p.vr, t0: this.ticks, life: p.life,
      size0: p.size0, size1: p.size1, alpha: p.alpha });
  }

  private burst(x: number, y: number, color: number, stony: boolean): void {
    const n = stony ? 14 : 18;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 0.8 + Math.random() * 2.8;
      this.add({ texture: 'shard', color, layer: this.splinters, x: x + (Math.random() - 0.5) * 24, y: y + (Math.random() - 0.5) * 10,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.2, g: 0.22, rot: Math.random() * 6.3, vr: (Math.random() - 0.5) * 0.6,
        life: 26 + Math.random() * 16, size0: 4 + Math.random() * 5, size1: 2, alpha: 1 });
    }
    for (let i = 0; i < (stony ? 4 : 10); i++) {
      const a = Math.random() * Math.PI * 2, v = 1 + Math.random() * 3;
      this.add({ texture: 'spark', color: stony ? 0xffffff : color | 0x404040, layer: this.sparks, x, y, vx: Math.cos(a) * v,
        vy: Math.sin(a) * v, g: 0.05, rot: 0, vr: 0, life: 10 + Math.random() * 10, size0: 5, size1: 1, alpha: 1 });
    }
    this.add({ texture: 'glow', color, layer: this.sparks, x, y, vx: 0, vy: 0, g: 0, rot: 0, vr: 0, life: 12, size0: 40,
      size1: 70, alpha: 0.7 });
  }

  private dust(x: number, y: number, color: number): void {
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2, v = 0.5 + Math.random() * 1.5;
      this.add({ texture: 'shard', color, layer: this.splinters, x: x + (Math.random() - 0.5) * 20, y, vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 0.6, g: 0.18, rot: Math.random() * 6.3, vr: (Math.random() - 0.5) * 0.5, life: 18,
        size0: 3, size1: 1, alpha: 1 });
    }
  }

  private sparkBurst(x: number, y: number, color: number, n: number, speed: number): void {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI * Math.random(), v = speed * (0.4 + Math.random());
      this.add({ texture: 'spark', color, layer: this.sparks, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0.12,
        rot: 0, vr: 0, life: 8 + Math.random() * 8, size0: 4, size1: 1, alpha: 1 });
    }
    this.add({ texture: 'glow', color, layer: this.sparks, x, y, vx: 0, vy: 0, g: 0, rot: 0, vr: 0, life: 7, size0: 18,
      size1: 30, alpha: 0.8 });
  }

  private pickup(x: number, y: number, color: number): void {
    this.add({ texture: 'ring', color, layer: this.sparks, x, y, vx: 0, vy: 0, g: 0, rot: 0, vr: 0, life: 16, size0: 20,
      size1: 110, alpha: 1 });
    this.add({ texture: 'glow', color: 0xffffff, layer: this.sparks, x, y, vx: 0, vy: 0, g: 0, rot: 0, vr: 0, life: 10,
      size0: 50, size1: 80, alpha: 0.6 });
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, v = 1 + Math.random() * 2.5;
      this.add({ texture: 'spark', color: color | 0x303030, layer: this.sparks, x, y, vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 1, g: 0.06, rot: 0, vr: 0, life: 14 + Math.random() * 10, size0: 5, size1: 1, alpha: 1 });
    }
  }

  private clearParticles(): void {
    for (const p of this.particles) this.release(p.s);
    this.particles = [];
  }

  private release(s: PixiSprite): void {
    s.removeFromParent();
    s.visible = false;
    this.pool.push(s);
  }

  private drawParticles(now: number): void {
    const keep: Particle[] = [];
    for (const p of this.particles) {
      const t = now - p.t0;
      if (t >= p.life) {
        this.release(p.s);
        continue;
      }
      const k = t / p.life;
      p.s.position.set(p.x + p.vx * t, p.y + p.vy * t + 0.5 * p.g * t * t);
      p.s.rotation = p.rot + p.vr * t;
      const size = lerp(p.size0, p.size1, k);
      p.s.setSize(size, size);
      p.s.alpha = p.alpha * (k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4);
      keep.push(p);
    }
    this.particles = keep;
  }

  // ---- glows (rebuilt every frame from a pool)

  private glow(x: number, y: number, size: number, color: number, alpha: number, layer: Container = this.glows): void {
    let s = this.glowPool[this.glowUsed];
    if (!s) {
      s = new PixiSprite(this.assets.glow);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      this.glowPool.push(s);
    }
    this.glowUsed++;
    if (s.parent !== layer) layer.addChild(s);
    s.visible = true;
    s.position.set(x, y);
    s.setSize(size, size);
    s.tint = color;
    s.alpha = alpha;
  }

  // ---- drawing

  /** The picture `alpha` of the way from the last tick to the next one. */
  draw(w: World, alpha: number): void {
    const now = this.ticks + alpha;
    this.frameNo++;
    const playing = w.state !== GameState.CourseEditor;
    this.field.visible = this.frame.visible = this.banners.visible = playing;
    // background
    const tiles = w.tiles;
    const tile = this.assets.get(tiles ? tiles.image : 'Tile1')!;
    if (this.tiles.texture !== tile.textures[0]) this.tiles.texture = tile.textures[0];
    this.tiles.visible = tiles !== null || w.state === GameState.None;
    // sprites in the original's order
    this.glowUsed = 0;
    const list = playing ? w.drawList() : [];
    let order = 0;
    for (const s of list) {
      if (s instanceof Frame || s instanceof Tiles || s instanceof Shatter || s instanceof TextSprite) continue;
      const f = this.assets.get(s.image);
      if (!f) continue;
      let d = this.drawn.get(s);
      if (!d) {
        const sp = new PixiSprite();
        const shadow = s.z <= 3 ? new PixiSprite() : null;
        if (shadow) {
          shadow.tint = 0x000000;
          shadow.alpha = SHADOW.alpha;
        }
        d = { s: sp, shadow, flash: null, seen: 0 };
        this.drawn.set(s, d);
      }
      d.seen = this.frameNo;
      const tex = f.textures[Math.min(s.frame, f.textures.length - 1)];
      const pr = this.prev.get(s);
      let x = s.x, y = s.y;
      if (pr && Math.abs(s.x - pr[0]) <= SNAP && Math.abs(s.y - pr[1]) <= SNAP) {
        x = lerp(pr[0], s.x, alpha);
        y = lerp(pr[1], s.y, alpha);
      }
      d.s.texture = tex;
      d.s.scale.set(f.scale);
      d.s.position.set(x, y);
      this.objects.addChildAt(d.s, Math.min(order++, this.objects.children.length));
      if (d.shadow) {
        d.shadow.texture = tex;
        d.shadow.scale.set(f.scale);
        d.shadow.position.set(x + SHADOW.dx, y + SHADOW.dy);
        if (d.shadow.parent !== this.shadows) this.shadows.addChild(d.shadow);
      }
      this.effects(s, d, x, y, now, f.scale, alpha);
    }
    // forget sprites that are gone
    for (const [s, d] of this.drawn) {
      if (d.seen === this.frameNo) continue;
      d.s.destroy();
      d.shadow?.destroy();
      d.flash?.destroy();
      this.drawn.delete(s);
    }
    for (let i = this.glowUsed; i < this.glowPool.length; i++) this.glowPool[i].visible = false;
    this.drawParticles(now);
    this.drawBanners(w, now);
    // shake and fade
    const st = now - this.shakeT;
    const amp = st < 14 ? 4 * (1 - st / 14) : 0;
    this.field.position.set(amp * Math.sin(st * 2.9), amp * Math.cos(st * 3.7));
    const ft = now - this.fadeT;
    this.fade.visible = ft < FADE_TICKS;
    this.fade.alpha = 1 - ft / FADE_TICKS;
    this.hud.update(w);
    this.app.render();
  }

  /**
   * A ball's trail: glows along the path of its last ticks, at the same fraction of the way between ticks as the
   * ball, so they glide with it instead of stepping at the tick rate.
   */
  private trail(b: Ball, color: number, alpha: number): void {
    const t = this.trails.get(b);
    if (!t) return;
    const pts = [...t, [b.x + b.w / 2, b.y + b.h / 2]]; // the centre before each of the last ticks, and now
    const head = pts.length - 2 + alpha; // where the ball is drawn, in ticks along pts
    const n = Math.floor(TRAIL / TRAIL_STEP);
    for (let j = n; j >= 1; j--) {
      const at = head - j * TRAIL_STEP;
      if (at < 0) continue;
      const i = Math.floor(at);
      const a = pts[i], c = pts[Math.min(i + 1, pts.length - 1)];
      if (Math.abs(c[0] - a[0]) > SNAP || Math.abs(c[1] - a[1]) > SNAP) continue;
      const k = 1 - j / (n + 1);
      this.glow(lerp(a[0], c[0], at - i), lerp(a[1], c[1], at - i), b.w * (0.8 + 0.8 * k), color, 0.14 * k);
    }
  }

  /** Glows, trails, light on the floor and hit flashes of one sprite drawn at (x, y). */
  private effects(s: Sprite, d: Drawn, x: number, y: number, now: number, scale: number, alpha: number): void {
    const cx = x + s.w / 2, cy = y + s.h / 2;
    if (s instanceof Ball) {
      const color = s.piercing ? BALL_COLORS[s.frame % BALL_COLORS.length] : 0xc8d8ff;
      const big = s.w > 12;
      this.glow(cx, cy, big ? 50 : 28, color, s.piercing ? 0.45 : 0.22);
      this.glow(cx, cy + 4, big ? 110 : 70, color, 0.08, this.floor);
      if (!s.glued) this.trail(s, color, alpha);
    } else if (s instanceof Shot) {
      this.glow(cx, cy, 26, 0xff8040, 0.6);
    } else if (s instanceof Bonus) {
      const color = CAPSULE_COLORS[s.image] ?? 0xffffff;
      this.glow(cx, cy, 64, color, 0.35);
      this.glow(cx, cy, 90, color, 0.12, this.floor);
    } else if (s instanceof Paddle) {
      const glue = s.glueTimer > 0, gun = s.kind === 1;
      const color = glue ? 0x80ff70 : gun ? 0x5080ff : 0xfff0a0;
      this.glow(cx, y + s.h - 3, s.w * 1.3, color, glue ? 0.2 + 0.06 * Math.sin(now * 0.4) : 0.12, this.floor);
      this.glow(cx, y + s.h - 4, s.w * 0.7, color, 0.1);
    } else if (s instanceof Stone) {
      const t = this.flashes.get(s);
      const k = t === undefined ? 0 : 1 - (now - t) / 8;
      if (k > 0) {
        if (!d.flash) {
          d.flash = new PixiSprite();
          d.flash.blendMode = 'add';
          this.glows.addChild(d.flash);
        }
        d.flash.visible = true;
        d.flash.texture = d.s.texture;
        d.flash.scale.set(scale);
        d.flash.position.set(x, y);
        d.flash.alpha = k * 0.9;
      } else if (d.flash) d.flash.visible = false;
    }
  }

  private drawBanners(w: World, now: number): void {
    const live = new Set<TextSprite>();
    for (const s of w.sprites) {
      if (!(s instanceof TextSprite) || s.dead) continue;
      live.add(s);
      let b = this.bannerTexts.get(s);
      if (!b) {
        const t = new Text({ text: BANNERS[s.image] ?? s.image, style: {
          fontFamily: FONT, fontWeight: 'bold', fontSize: 52, fill: goldFill(), letterSpacing: 1,
          stroke: { color: 0x4a1c00, width: 7, join: 'round' },
          dropShadow: { color: 0x000000, alpha: 0.75, blur: 6, distance: 5, angle: Math.PI / 3 },
        } });
        t.anchor.set(0.5);
        t.resolution = this.scale * (window.devicePixelRatio || 1) * 1.2;
        this.banners.addChild(t);
        b = { t, total: Math.max(s.counter, BANNER_TICKS[s.image] ?? s.counter) };
        this.bannerTexts.set(s, b);
      }
      // pop in, sway gently, fade out over the last ticks
      const age = b.total - s.counter + (now % 1);
      const pop = age < 10 ? 1 + 0.25 * Math.sin((age / 10) * Math.PI) * (1 - age / 10) - 0.3 * (1 - age / 10) ** 2 : 1;
      b.t.scale.set(pop * Math.min(1, 380 / Math.max(1, b.t.width / b.t.scale.x)));
      b.t.position.set(214, 145 + Math.sin(age * 0.12) * 3);
      b.t.rotation = Math.sin(age * 0.08) * 0.02;
      b.t.alpha = Math.min(1, age / 4, s.counter / 8);
    }
    for (const [s, b] of this.bannerTexts) {
      if (live.has(s)) continue;
      b.t.destroy();
      this.bannerTexts.delete(s);
    }
  }
}
