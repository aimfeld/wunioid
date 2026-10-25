// The Remastered graphics: the sprites re-rendered at 4x by tools/remaster_render.py (atlas pages and an index),
// the playfield frame, and textures made here for the effects (soft glows, sparks, shards). Images without a
// re-render (the editor's labels and palette) fall back to the original, smoothly scaled.

import { ImageSource, Rectangle, Texture } from 'pixi.js';
import type { Manifest } from '../../data';
import type { Images } from '../classicView';

export const SCALE = 4; // texture px per original px

interface Index {
  scale: number;
  /** The sprites at another scale (the banners). */
  scales?: Record<string, number>;
  pages: string[];
  frames: Record<string, [number, number, number, number, number][]>;
}

export interface Frames {
  textures: Texture[];
  /** Sprite scale that draws a texture at the original size. */
  scale: number;
}

async function image(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

function source(img: HTMLImageElement | HTMLCanvasElement): ImageSource {
  return new ImageSource({ resource: img, autoGenerateMipmaps: true, scaleMode: 'linear', alphaMode: 'premultiply-alpha-on-upload' });
}

/** A radial falloff in white (tinted where used): `hard` 0 = a soft glow, towards 1 a bright core. */
function radial(size: number, hard: number): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(Math.max(0.01, hard * 0.5), `rgba(255,255,255,${0.6 + 0.4 * hard})`);
  g.addColorStop(0.55, `rgba(255,255,255,${0.18 * (1 - hard) + 0.05})`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new Texture({ source: source(c) });
}

/** A splinter: a thin bevelled triangle, light on one side. */
function shard(): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d')!;
  ctx.beginPath();
  ctx.moveTo(2, 26);
  ctx.lineTo(30, 14);
  ctx.lineTo(9, 3);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, 0, 32, 32);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.5, '#d8d8d8');
  g.addColorStop(1, '#7a7a7a');
  ctx.fillStyle = g;
  ctx.fill();
  return new Texture({ source: source(c) });
}

/** A ring for the capsule pick-up. */
function ring(size: number): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.3, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.7, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new Texture({ source: source(c) });
}

/** The playfield's darkening towards its edges, over the tiles. */
function vignette(): Texture {
  const c = document.createElement('canvas');
  c.width = 200;
  c.height = 240;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(100, 110, 40, 100, 120, 170);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.75)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 200, 240);
  return new Texture({ source: source(c) });
}

export class RemasterAssets {
  readonly glow = radial(128, 0);
  readonly spark = radial(32, 0.6);
  readonly shard = shard();
  readonly ring = ring(128);
  readonly vignette = vignette();

  /** frame: the playfield frame (4x); panelFrame: its continuation round the HUD panel, from x 412 (4x); title:
   * 'Wunioid' in the banners' lava look, trimmed (tools/remaster_banners.py). */
  private constructor(private readonly sprites: Map<string, Frames>, readonly frame: Texture,
    readonly panelFrame: Texture, readonly title: Texture) {}

  /** The re-rendered sprites, and the originals (smoothly scaled) for the images without one. */
  static async load(base: string, images: Images, manifest: Manifest): Promise<RemasterAssets> {
    const index: Index = await (await fetch(base + 'remaster/sprites.json')).json();
    const [pages, frameImg, panelFrameImg, titleImg] = await Promise.all([
      Promise.all(index.pages.map((p) => image(base + 'remaster/' + p))),
      image(base + 'remaster/frame.webp'),
      image(base + 'remaster/panel-frame.webp'),
      image(base + 'remaster/title.webp'),
    ]);
    const sources = pages.map(source);
    const sprites = new Map<string, Frames>();
    for (const [name, frames] of Object.entries(index.frames)) {
      if (/^Tile\d$/.test(name)) {
        // a background tile repeats: its own texture, so neither filtering nor mipmaps reach into the atlas
        const [p, x, y, w, h] = frames[0];
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        c.getContext('2d')!.drawImage(pages[p], x, y, w, h, 0, 0, w, h);
        const src = new ImageSource({ resource: c, autoGenerateMipmaps: true, scaleMode: 'linear', addressMode: 'repeat' });
        sprites.set(name, { scale: 1 / index.scale, textures: [new Texture({ source: src })] });
        continue;
      }
      sprites.set(name, {
        scale: 1 / (index.scales?.[name] ?? index.scale),
        textures: frames.map(([p, x, y, w, h]) => new Texture({ source: sources[p], frame: new Rectangle(x, y, w, h) })),
      });
    }
    for (const [name, info] of Object.entries(manifest.images)) {
      if (sprites.has(name) || !images[name]) continue;
      const img = images[name], src = source(img);
      const cols = Math.max(1, Math.floor(img.width / info.width));
      const textures: Texture[] = [];
      for (let f = 0; f < info.frames; f++) {
        const sx = (f % cols) * info.width, sy = Math.floor(f / cols) * info.height;
        textures.push(new Texture({ source: src, frame: new Rectangle(sx, sy, info.width, info.height) }));
      }
      sprites.set(name, { scale: 1, textures });
    }
    return new RemasterAssets(sprites, new Texture({ source: source(frameImg) }), new Texture({ source: source(panelFrameImg) }),
      new Texture({ source: source(titleImg) }));
  }

  get(name: string): Frames | undefined {
    return this.sprites.get(name);
  }

  has(name: string): boolean {
    return this.sprites.has(name);
  }
}

/** Colours of the stones (tools/remaster_render.py), for their splinters and hit flashes. */
export const STONE_COLORS: Record<string, number> = {
  GemRed: 0xf0302a, GemOrange: 0xffb43c, GemGreen: 0x4cc84a, GemBlue: 0x5a56e6, GemViolet: 0xee3ae6,
  Granit: 0xb4b6b8, Block: 0xd6c838, BeBack: 0xdcb428, Goldie: 0xffeaa0, Bubbler: 0x78b0e2, Eater: 0x9a9a9a,
  Doubler: 0xa8a8c8, Killer: 0xc5525a,
};

/** The shatter animations' colours, where the stone is not known. */
export const SHATTER_COLORS: Record<string, number> = {
  ZGemRed: 0xf0302a, ZGemOrange: 0xffb43c, ZGemGreen: 0x4cc84a, ZGemBlue: 0x5a56e6, ZGemViolet: 0xee3ae6,
  ZGranit: 0xb4b6b8, ZBlock: 0xd6c838,
};

/** Capsule body colours by image (tools/remaster_render.py CAPSULES). */
export const CAPSULE_COLORS: Record<string, number> = {
  'B$Red': 0xee4139, B1Up: 0xe64141, BGun: 0xde4141, 'B$Green': 0x6abd5a, BGlue: 0x62a45a, 'BPad+': 0x62a45a,
  'BPad-': 0x5aa452, 'B$Blue': 0x736ad5, B2xo: 0x6a62de, B5xo: 0x6262cd, 'B--o': 0x6a62de, 'B$Orange': 0xeeb452,
  BBig: 0xdea452, 'B$Violet': 0xde4acd, BZup: 0xc539c5, BEnd: 0xc539c5,
};

/** The piercing ball's colour cycle (the Ball patterns), for its glow. */
export const BALL_COLORS = [0xd8dcff, 0xc08ab4, 0xd66aa8, 0xe4508a, 0xe63c5c, 0xf02a2a, 0xf03c14, 0xf06a14, 0xf09a14,
  0xf0d014, 0xe8e030, 0xc8c850, 0xa0a070, 0x7070a0, 0x5040d0, 0x3028e0, 0x2a2af0, 0x4038f0, 0x5a50e0, 0x7070d0,
  0xd8dcff];
