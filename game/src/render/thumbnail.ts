// A level's picture for the editor's lists, with the original's images (Canvas 2D): the background tiles, the
// stones (first pattern) and their attribute labels, as the level editor shows them. Only the stone area of the
// playfield (x 14…414, y 14…284).

import { cellOffset, COLS, levelTile, ROWS, type Level } from '../sim/files';
import { ATTR_IMAGES, STONE_IMAGES } from '../sim/sprites';
import type { Manifest } from '../data';
import type { Images } from './classicView';

const X0 = 14, Y0 = 14;
export const THUMB_W = 400, THUMB_H = 270;

export class Thumbnails {
  constructor(private readonly images: Images, private readonly manifest: Manifest) {}

  /** Draw `level` into `canvas`, which is `w` CSS px wide (sharp at the device pixel ratio). */
  draw(canvas: HTMLCanvasElement, level: Level, w: number): void {
    const dpr = window.devicePixelRatio || 1;
    const h = Math.round((w * THUMB_H) / THUMB_W);
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const s = canvas.width / THUMB_W;
    ctx.setTransform(s, 0, 0, s, -X0 * s, -Y0 * s);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const tile = this.images[`Tile${levelTile(level)}`];
    if (tile) {
      ctx.globalAlpha = 0.75;
      for (let y = Y0; y < Y0 + THUMB_H; y += tile.height) {
        for (let x = X0; x < X0 + THUMB_W; x += tile.width) ctx.drawImage(tile, x, y);
      }
      ctx.globalAlpha = 1;
    }
    for (let col = 1; col <= COLS; col++) {
      for (let row = 1; row <= ROWS; row++) {
        const o = cellOffset(col, row), x = (col - 1) * 30 + 19, y = (row - 1) * 15 + 19;
        this.pattern(STONE_IMAGES[level[o]], ctx, x, y);
        this.pattern(ATTR_IMAGES[level[o + 1]], ctx, x, y);
      }
    }
  }

  private pattern(name: string | undefined, ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const img = name ? this.images[name] : undefined, info = name ? this.manifest.images[name] : undefined;
    if (img && info) ctx.drawImage(img, 0, 0, info.width, info.height, x, y, info.width, info.height);
  }
}
