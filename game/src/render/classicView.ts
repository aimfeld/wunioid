// The Classic picture: the original's 640 x 480 surface, drawn as DelphiX does (SpriteEngine.Draw sorted by Z,
// sprites at Trunc(X), Trunc(Y), the pattern Trunc(AnimPos)), then the HUD (TForm1.DrawHud 0x41b560). PixiJS
// shows it at the largest integer scale that fits the window, with nearest-neighbour sampling.

import { Application, Sprite as PixiSprite, Texture } from 'pixi.js';
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
  private readonly sprite: PixiSprite;
  private readonly hud = [new TextLine(), new TextLine(), new TextLine(), new TextLine()];
  private area: Rect | null = null;

  private constructor(private readonly app: Application, private readonly images: Images, private readonly manifest: Manifest) {
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    this.texture = Texture.from(this.canvas);
    this.texture.source.scaleMode = 'nearest';
    this.sprite = new PixiSprite(this.texture);
    app.stage.addChild(this.sprite);
    window.addEventListener('resize', () => this.layout());
    this.layout();
  }

  static async create(parent: HTMLElement, images: Images, manifest: Manifest): Promise<ClassicView> {
    const app = new Application();
    // autoStart off: the game loop renders once per animation frame, after the ticks
    await app.init({ resizeTo: window, background: '#000000', antialias: false, autoDensity: true,
      resolution: window.devicePixelRatio || 1, autoStart: false });
    parent.appendChild(app.canvas);
    return new ClassicView(app, images, manifest);
  }

  get element(): HTMLCanvasElement {
    return this.app.canvas;
  }

  /** The window part to draw the picture in (CSS pixels; the touch controls take the rest), or null: all of it. */
  setArea(area: Rect | null): void {
    const a = this.area;
    if (a === area || (a && area && a.x === area.x && a.y === area.y && a.w === area.w && a.h === area.h)) return;
    this.area = area && { ...area };
    this.layout();
  }

  /** Where the picture is, in CSS pixels. */
  get picture(): Rect {
    const s = this.sprite.scale.x;
    return { x: this.sprite.x, y: this.sprite.y, w: W * s, h: H * s };
  }

  /** Client coordinates to picture pixels. */
  toScreen(cx: number, cy: number): [number, number] {
    const s = this.sprite.scale.x;
    return [(cx - this.sprite.x) / s, (cy - this.sprite.y) / s];
  }

  /**
   * The largest integer scale in device pixels (every source pixel stays sharp), centred in the area; where that
   * would leave much of it empty (phones), the largest scale that fits.
   */
  private layout(): void {
    const dpr = window.devicePixelRatio || 1;
    const a = this.area ?? { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
    const fit = Math.min((a.w * dpr) / W, (a.h * dpr) / H);
    const scale = Math.floor(fit) >= 1 && Math.floor(fit) / fit >= 0.75 ? Math.floor(fit) : fit;
    this.sprite.scale.set(scale / dpr);
    this.sprite.x = Math.floor(a.x + (a.w - (W * scale) / dpr) / 2);
    this.sprite.y = Math.floor(a.y + (a.h - (H * scale) / dpr) / 2);
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
      if (w.state === GameState.Course || w.state === GameState.Test) this.drawHud(w, fps);
    }
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
}
