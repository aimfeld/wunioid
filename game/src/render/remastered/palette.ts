// The level editor's palette in the Remastered HUD panel: the original's `Creator` image (stones, attributes,
// backgrounds) re-laid with the re-rendered stones and tiles, on the same click rectangles as DrawMouseDown
// (0x41aad4): stones in cells of 35 x 23 from 460, 75 (rows of 4), the attributes in a row from 460, 191,
// backgrounds in cells of 45 x 47 from 460, 244 (rows of 3). The brush and the background are highlighted (the
// original shows neither). The empty last stone cell holds the remake's eraser (for touch, with no right button),
// and under the hints a Test button starts a test game (Esc in it comes back) and a Menu button opens the editor's
// menu (as Esc).

import { Container, Graphics, Rectangle, Sprite, Text, Texture, type TextStyleOptions } from 'pixi.js';
import { levelTile } from '../../sim/files';
import { STONE_IMAGES } from '../../sim/sprites';
import type { World } from '../../sim/world';
import type { RemasterAssets } from './assets';

export const STONES = { x: 460, y: 75, w: 35, h: 23, cols: 4 };
export const ATTRS = { x: 460, y: 191, w: 35, h: 23 };
export const TILES = { x: 460, y: 244, w: 45, h: 47, cols: 3 };
/** The eraser: the 16th stone cell (DrawMouseDown takes 1…13 only). */
export const ERASER = { x: STONES.x + 3 * STONES.w, y: STONES.y + 3 * STONES.h, w: STONES.w, h: STONES.h };

/** The Test and Menu buttons. */
export const TEST = { x: 450, y: 436, w: 72, h: 22 };
export const MENU = { x: 530, y: 436, w: 72, h: 22 };

const inside = (r: { x: number; y: number; w: number; h: number }, x: number, y: number) =>
  x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
export const onEraser = (x: number, y: number) => inside(ERASER, x, y);
export const onTest = (x: number, y: number) => inside(TEST, x, y);
export const onMenu = (x: number, y: number) => inside(MENU, x, y);
/** In the stone or attribute rows (a click there picks a brush, or nothing). */
export const onBrushes = (x: number, y: number) =>
  x > STONES.x && x < STONES.x + 4 * STONES.w && ((y > STONES.y && y < STONES.y + 4 * STONES.h) || (y > ATTRS.y && y < ATTRS.y + ATTRS.h));

const HEAD: TextStyleOptions = { fontFamily: 'Comic Neue', fontWeight: 'bold', fontSize: 12, fill: 0x9aa2e6, letterSpacing: 2 };
const HINT: TextStyleOptions = { fontFamily: 'Comic Neue', fontWeight: 'bold', fontSize: 11, fill: 0x8c94d8, letterSpacing: 0.5,
  align: 'center', lineHeight: 15 };
const GOLD = 0xffd24a;

export class EditorPalette {
  readonly root = new Container();
  readonly texts: Text[] = [];
  private readonly mark = new Graphics(); // the brush
  private readonly tileMark = new Graphics(); // the background
  private readonly hint: Text;
  private readonly touchHint: Text;

  constructor(assets: RemasterAssets) {
    const cx = STONES.x + 2 * STONES.w;
    const heading = (s: string, y: number) => {
      const t = new Text({ text: s, style: HEAD });
      t.anchor.set(0.5, 0);
      t.position.set(cx, y);
      this.texts.push(t);
      this.root.addChild(t);
    };
    const title = new Text({ text: 'LEVEL EDITOR', style: { ...HEAD, fontSize: 16, fill: GOLD, letterSpacing: 3 } });
    title.anchor.set(0.5, 0);
    title.position.set(526, 26);
    this.texts.push(title);
    this.root.addChild(title);
    heading('STONES', 58);
    heading('ATTRIBUTES', 174);
    heading('BACKGROUNDS', 227);
    const wells = new Graphics();
    this.root.addChild(wells);
    for (let k = 1; k <= 13; k++) {
      const f = assets.get(STONE_IMAGES[k]);
      if (!f) continue;
      const x = STONES.x + ((k - 1) % STONES.cols) * STONES.w, y = STONES.y + Math.trunc((k - 1) / STONES.cols) * STONES.h;
      const s = new Sprite(f.textures[0]);
      s.scale.set(f.scale);
      s.position.set(x + 2.5, y + 4);
      this.root.addChild(s);
    }
    // the attributes as the original palette shows them (white; the labels on the stones are black)
    const creator = assets.get('Creator')?.textures[0];
    if (creator) {
      const s = new Sprite(new Texture({ source: creator.source,
        frame: new Rectangle(creator.frame.x + ATTRS.x - 460, creator.frame.y + ATTRS.y - 50, 4 * ATTRS.w, ATTRS.h) }));
      s.position.set(ATTRS.x, ATTRS.y);
      this.root.addChild(s);
    }
    for (let t = 1; t <= 9; t++) {
      const f = assets.get(`Tile${t}`);
      if (!f) continue;
      const x = TILES.x + ((t - 1) % TILES.cols) * TILES.w, y = TILES.y + Math.trunc((t - 1) / TILES.cols) * TILES.h;
      wells.roundRect(x + 1.5, y + 2.5, 42, 42, 4).fill({ color: 0x000000, alpha: 0.45 });
      const s = new Sprite(f.textures[0]);
      s.setSize(40, 40);
      s.position.set(x + 2.5, y + 3.5);
      const clip = new Graphics().roundRect(x + 2.5, y + 3.5, 40, 40, 3).fill(0xffffff);
      s.mask = clip;
      this.root.addChild(clip, s);
    }
    // the eraser
    const e = new Graphics()
      .roundRect(ERASER.x + 4, ERASER.y + 3, ERASER.w - 8, ERASER.h - 6, 5).fill({ color: 0x000000, alpha: 0.35 })
      .stroke({ color: 0xc8ccff, width: 1, alpha: 0.6 })
      .moveTo(ERASER.x + 13, ERASER.y + 7).lineTo(ERASER.x + 22, ERASER.y + 16)
      .moveTo(ERASER.x + 22, ERASER.y + 7).lineTo(ERASER.x + 13, ERASER.y + 16)
      .stroke({ color: 0xff8070, width: 2.2, cap: 'round' });
    this.root.addChild(e, this.tileMark, this.mark);
    this.hint = new Text({ text: 'Left click  place\nRight click  remove', style: HINT });
    this.touchHint = new Text({ text: 'Tap  place\nTap ✕, then a stone  remove', style: HINT });
    for (const t of [this.hint, this.touchHint]) {
      t.anchor.set(0.5, 0);
      t.position.set(526, 398);
      this.texts.push(t);
      this.root.addChild(t);
    }
    for (const [b, label, color] of [[TEST, 'Test', 0xd8452e], [MENU, 'Menu', 0x4b52b8]] as const) {
      const pill = new Graphics()
        .roundRect(b.x, b.y, b.w, b.h, 11).fill({ color })
        .roundRect(b.x + 1, b.y + 1, b.w - 2, b.h / 2 - 1, 10).fill({ color: 0xffffff, alpha: 0.12 });
      const text = new Text({ text: label, style: { ...HEAD, fontSize: 13, fill: 0xffffff, letterSpacing: 1 } });
      text.anchor.set(0.5);
      text.position.set(b.x + b.w / 2, b.y + b.h / 2);
      this.texts.push(text);
      this.root.addChild(pill, text);
    }
  }

  set touch(on: boolean) {
    this.hint.visible = !on;
    this.touchHint.visible = on;
  }

  update(w: World, erase: boolean): void {
    this.mark.clear();
    let r: { x: number; y: number; w: number; h: number };
    if (erase) r = ERASER;
    else if (w.brushAttr) r = { ...ATTRS, x: ATTRS.x + (w.brush - 1) * ATTRS.w };
    else {
      r = { x: STONES.x + ((w.brush - 1) % STONES.cols) * STONES.w, y: STONES.y + Math.trunc((w.brush - 1) / STONES.cols) * STONES.h,
        w: STONES.w, h: STONES.h };
    }
    this.mark.roundRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, 5).stroke({ color: GOLD, width: 2 });
    this.tileMark.clear();
    const t = levelTile(w.level);
    if (t >= 1 && t <= 9) {
      const x = TILES.x + ((t - 1) % TILES.cols) * TILES.w, y = TILES.y + Math.trunc((t - 1) / TILES.cols) * TILES.h;
      this.tileMark.roundRect(x, y + 1, 45, 45, 6).stroke({ color: GOLD, width: 2 });
    }
  }
}
