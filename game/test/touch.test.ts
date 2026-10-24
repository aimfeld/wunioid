import { describe, expect, it } from 'vitest';
import { touchLayout, type Rect } from '../src/input/touch';

const NONE = { l: 0, r: 0, t: 0, b: 0 };
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('touchLayout', () => {
  for (const [name, vw, vh, inset] of [
    ['phone portrait', 390, 844, { ...NONE, t: 47, b: 34 }],
    ['phone landscape', 844, 390, { ...NONE, l: 47, r: 47, b: 21 }],
    ['tablet', 1024, 768, NONE],
  ] as const) {
    for (const strip of [24, 34]) it(`${name}, strip ${strip}: the buttons stay on screen and off the picture`, () => {
      const l = touchLayout(vw, vh, inset, strip);
      expect(l.portrait).toBe(vh > vw);
      expect(l.game.w / l.game.h).toBeCloseTo(l.portrait ? 428 / (480 + strip) : 640 / 480);
      if (l.portrait) expect(l.game.w).toBeCloseTo(vw - inset.l - inset.r); // the full width
      for (const b of [l.left, l.right, l.fire, l.fullscreen, l.menu]) {
        expect(overlaps(b, l.game)).toBe(false);
        expect(b.x).toBeGreaterThanOrEqual(inset.l);
        expect(b.y).toBeGreaterThanOrEqual(inset.t);
        expect(b.x + b.w).toBeLessThanOrEqual(vw - inset.r);
        expect(b.y + b.h).toBeLessThanOrEqual(vh - inset.b);
      }
      expect(overlaps(l.left, l.right) || overlaps(l.right, l.fire) || overlaps(l.fullscreen, l.right)).toBe(false);
      expect(overlaps(l.menu, l.fullscreen) || overlaps(l.menu, l.right) || overlaps(l.menu, l.left)).toBe(false);
      expect(l.right.x + l.right.w).toBeLessThan(vw / 2); // the pad is the left half of the window
    });
  }
});
