// The Classic picture: the original's 640 x 480 surface, drawn as DelphiX does (SpriteEngine.Draw sorted by Z,
// sprites at Trunc(X), Trunc(Y), the pattern Trunc(AnimPos)), then the HUD (TForm1.DrawHud 0x41b560). PixiJS
// shows it at the largest integer scale that fits the window, with nearest-neighbour sampling.
// In a portrait window on a phone (the remake, user) it shows only the playfield, under a strip with the HUD (no
// FPS), so the playfield can take the full width.

import { Application, Container, Rectangle, Sprite as PixiSprite, Texture } from 'pixi.js';
import type { Manifest } from '../data';
import type { Rect } from '../input/touch';
import { Tiles } from '../sim/sprites';
import { GameState, type World } from '../sim/world';

export const W = 640;
export const H = 480;
/** The HUD (Observed): canvas text at x 500, font size 12, white, transparent background. */
const HUD_X = 500;
/** MS Sans Serif is a bitmap font: no smoothing. Size 12 pt at 96 dpi is 16 px; the face is approximated. */
const HUD_FONT = '16px "MS Sans Serif", "Microsoft Sans Serif", Arial, sans-serif';
/** The phone portrait picture: the playfield frame's width (`Rahmen`, 428 x 480) under the HUD strip. */
export const FIELD_W = 428;
export const STRIP_H = 24;
const STRIP_PAD = 6;

export type Images = Record<string, HTMLImageElement>;

export async function loadImages(base: string, manifest: Manifest): Promise<Images> {
  const entries = await Promise.all(Object.entries(manifest.images).map(async ([name, info]) => {
    const img = new Image();
    img.src = base + 'images/' + info.file;
    await img.decode();
    return [name, img] as const;
  }));
  return Object.fromEntries(entries);
}

/** A HUD line drawn once and kept until its text changes, with the edges made hard like GDI's bitmap fonts. */
class TextLine {
  private text = '';
  readonly canvas = document.createElement('canvas');

  draw(text: string): HTMLCanvasElement {
    if (text === this.text) return this.canvas;
    this.text = text;
    const c = this.canvas, ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.font = HUD_FONT;
    c.width = Math.max(1, Math.ceil(ctx.measureText(text).width) + 2);
    c.height = 20;
    ctx.font = HUD_FONT;
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#fff';
    ctx.fillText(text, 0, 1);
    const img = ctx.getImageData(0, 0, c.width, c.height);
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i] >= 128 ? 255 : 0;
    ctx.putImageData(img, 0, 0);
    return c;
  }
}

export class ClassicView {
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: Texture;
  private readonly field: Texture; // the playfield part of the picture
  private readonly sprite: PixiSprite;
  private readonly stripCanvas = document.createElement('canvas');
  private readonly stripCtx: CanvasRenderingContext2D;
  private readonly stripTexture: Texture;
  private readonly stripSprite: PixiSprite;
  private readonly hud = [new TextLine(), new TextLine(), new TextLine(), new TextLine()];
  private readonly root = new Container();
  private area: Rect | null = null;
  private strip = false;

  constructor(private readonly app: Application, private readonly images: Images, private readonly manifest: Manifest) {
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    this.texture = Texture.from(this.canvas);
    this.texture.source.scaleMode = 'nearest';
    this.field = new Texture({ source: this.texture.source, frame: new Rectangle(0, 0, FIELD_W, H) });
    this.sprite = new PixiSprite(this.texture);
    this.stripCanvas.width = FIELD_W;
    this.stripCanvas.height = STRIP_H;
    this.stripCtx = this.stripCanvas.getContext('2d')!;
    this.stripTexture = Texture.from(this.stripCanvas);
    this.stripTexture.source.scaleMode = 'nearest';
    this.stripSprite = new PixiSprite(this.stripTexture);
    this.stripSprite.visible = false;
    this.root.addChild(this.sprite, this.stripSprite);
    app.stage.addChild(this.root);
    window.addEventListener('resize', () => this.layout());
    this.layout();
  }

  get element(): HTMLCanvasElement {
    return this.app.canvas;
  }

  set visible(on: boolean) {
    this.root.visible = on;
  }

  /**
   * The window part to draw the picture in (CSS pixels; the touch controls take the rest), or null: all of it.
   * `strip`: the playfield alone, with the HUD strip above it (phone portrait).
   */
  setArea(area: Rect | null, strip = false): void {
    const a = this.area;
    if (strip === this.strip &&
      (a === area || (a && area && a.x === area.x && a.y === area.y && a.w === area.w && a.h === area.h))) return;
    this.area = area && { ...area };
    this.strip = strip;
    this.sprite.texture = strip ? this.field : this.texture;
    this.stripSprite.visible = strip;
    this.layout();
  }

  /** Where the picture is (the playfield and the strip in phone portrait), in CSS pixels. */
  get picture(): Rect {
    const s = this.sprite.scale.x;
    return this.strip
      ? { x: this.sprite.x, y: this.stripSprite.y, w: FIELD_W * s, h: (H + STRIP_H) * s }
      : { x: this.sprite.x, y: this.sprite.y, w: W * s, h: H * s };
  }

  /** Client coordinates to picture pixels. */
  toScreen(cx: number, cy: number): [number, number] {
    const s = this.sprite.scale.x;
    return [(cx - this.sprite.x) / s, (cy - this.sprite.y) / s];
  }

  /**
   * The largest integer scale in device pixels (every source pixel stays sharp), centred in the area; where that
   * would leave much of it empty (phones), the largest scale that fits. Phone portrait always fills the width.
   */
  private layout(): void {
    const dpr = window.devicePixelRatio || 1;
    const a = this.area ?? { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
    const [pw, ph] = this.strip ? [FIELD_W, H + STRIP_H] : [W, H];
    const fit = Math.min((a.w * dpr) / pw, (a.h * dpr) / ph);
    const scale = !this.strip && Math.floor(fit) >= 1 && Math.floor(fit) / fit >= 0.75 ? Math.floor(fit) : fit;
    const s = scale / dpr;
    const x = Math.floor(a.x + (a.w - pw * s) / 2), y = Math.floor(a.y + (a.h - ph * s) / 2);
    this.sprite.scale.set(s);
    this.stripSprite.scale.set(s);
    this.stripSprite.position.set(x, y);
    this.sprite.position.set(x, this.strip ? y + STRIP_H * s : y);
  }

  /** One pattern of an image list item at (x, y). */
  private drawPattern(name: string, frame: number, x: number, y: number): void {
    const img = this.images[name], info = this.manifest.images[name];
    const cols = Math.max(1, Math.floor(img.width / info.width));
    const sx = (frame % cols) * info.width, sy = Math.floor(frame / cols) * info.height;
    this.ctx.drawImage(img, sx, sy, info.width, info.height, x, y, info.width, info.height);
  }

  /** TForm1.DrawFrame (0x41b230): black, the sprites, the HUD in states 1 and 2. `fps`: ticks per second. */
  draw(w: World, fps: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    if (w.state !== GameState.CourseEditor) {
      for (const s of w.drawList()) {
        const x = Math.trunc(s.x), y = Math.trunc(s.y);
        if (s instanceof Tiles) {
          for (let ty = 0; ty < Tiles.MAP_H; ty++) {
            for (let tx = 0; tx < Tiles.MAP_W; tx++) this.drawPattern(s.image, 0, x + tx * s.w, y + ty * s.h);
          }
        } else this.drawPattern(s.image, s.frame, x, y);
      }
      if ((w.state === GameState.Course || w.state === GameState.Test) && !this.strip) this.drawHud(w, fps);
    }
    if (this.strip) this.drawStrip(w);
    this.texture.source.update();
    this.app.render();
  }

  private drawHud(w: World, fps: number): void {
    const lines = [`FPS: ${fps}`];
    if (w.paddle) {
      lines.push(`Lifes: ${w.lives}`, `Score: ${w.score}`);
      if (w.state === GameState.Course) lines.push(`Level: ${w.levelIndex}`);
    }
    lines.forEach((text, i) => this.ctx.drawImage(this.hud[i].draw(text), HUD_X, 30 + 30 * i));
  }

  /** Phone portrait: the HUD without FPS in one row, lives on the left, score in the middle, level on the right. */
  private drawStrip(w: World): void {
    const ctx = this.stripCtx;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, FIELD_W, STRIP_H);
    if ((w.state === GameState.Course || w.state === GameState.Test) && w.paddle) {
      const y = (STRIP_H - 20) / 2;
      const lives = this.hud[1].draw(`Lifes: ${w.lives}`), score = this.hud[2].draw(`Score: ${w.score}`);
      ctx.drawImage(lives, STRIP_PAD, y);
      ctx.drawImage(score, Math.round((FIELD_W - score.width) / 2), y);
      if (w.state === GameState.Course) {
        const level = this.hud[3].draw(`Level: ${w.levelIndex}`);
        ctx.drawImage(level, FIELD_W - STRIP_PAD - level.width, y);
      }
    }
    this.stripTexture.source.update();
  }
}
