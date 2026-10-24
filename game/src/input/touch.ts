// Touch controls (the remake, after Dark Planet's): an HTML overlay with ◀ ▶ for the left thumb and Fire
// (Button1: release the ball, the gun) for the right. In a level the overlay takes every touch: the left half of
// the window is the arrow pad, split between ◀ and ▶ where the two buttons meet, so the thumb can rock or slide
// from one to the other without looking; the right half is Fire. The picture moves aside to leave the buttons
// room: beside them in a landscape window, above them in a portrait one. In portrait the picture is the playfield
// alone with the HUD as a strip on top (the remake, user), so the playfield takes the full width.

import { NO_INPUT, type Input } from '../sim/world';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Insets {
  l: number;
  r: number;
  t: number;
  b: number;
}

export interface TouchLayout {
  /** Where the view draws the picture (CSS pixels): 640 x 480, or in portrait the playfield and the HUD strip. */
  game: Rect;
  /** A portrait window: the playfield with the HUD strip above it (ClassicView.setArea). */
  portrait: boolean;
  left: Rect; // ◀
  right: Rect; // ▶
  fire: Rect;
  fullscreen: Rect;
  /** The Remastered menu (pause): beside the fullscreen button. */
  menu: Rect;
}

const W = 640;
const H = 480;
/** In portrait: the playfield (ClassicView's FIELD_W) under the HUD strip (`strip` px: Classic 24, Remastered 34). */
const PW = 428;

export function touchLayout(vw: number, vh: number, inset: Insets, strip = 24): TouchLayout {
  const PH = 480 + strip;
  const unit = Math.round(Math.max(36, Math.min(60, Math.min(vw, vh) * 0.12)));
  const m = Math.round(unit * 0.25);
  const b = Math.round(unit * 1.5); // the button size
  const side = Math.max(inset.l, inset.r) + 2 * b + 3 * m; // the arrow pad's column, the same on the right
  const landscape = vw >= vh;
  const [area, pw, ph]: [Rect, number, number] = landscape
    ? [{ x: side, y: inset.t, w: vw - 2 * side, h: vh - inset.t - inset.b }, W, H]
    : [{ x: inset.l, y: inset.t, w: vw - inset.l - inset.r, h: vh - inset.t - inset.b - b - 2 * m }, PW, PH];
  const s = Math.max(0, Math.min(area.w / pw, area.h / ph));
  const game = { x: area.x + (area.w - pw * s) / 2, y: area.y + (area.h - ph * s) / 2, w: pw * s, h: ph * s };
  const y = vh - inset.b - m - b;
  const left = { x: inset.l + m, y, w: b, h: b };
  const fire = { x: vw - inset.r - m - b, y, w: b, h: b };
  // landscape: fullscreen above Fire in the top corner, the menu above the arrows; portrait: both between the
  // arrows and Fire
  const mid = Math.round((left.x + 2 * b + m + fire.x) / 2);
  return {
    game,
    portrait: !landscape,
    left,
    right: { ...left, x: left.x + b + m },
    fire,
    fullscreen: landscape
      ? { x: fire.x + (b - unit) / 2, y: inset.t + m, w: unit, h: unit }
      : { x: mid + Math.round(m / 2), y: y + (b - unit) / 2, w: unit, h: unit },
    menu: landscape
      ? { x: left.x + (b - unit) / 2, y: inset.t + m, w: unit, h: unit }
      : { x: mid - Math.round(m / 2) - unit, y: y + (b - unit) / 2, w: unit, h: unit },
  };
}

const CSS = `
#touch { position: fixed; inset: 0; pointer-events: none; z-index: 5; font: bold 16px sans-serif;
  color: rgba(255,255,255,.75); user-select: none; -webkit-user-select: none; touch-action: none; }
#touch.play { pointer-events: auto; }
#touch .b { position: absolute; box-sizing: border-box; border-radius: 50%; display: flex; align-items: center;
  justify-content: center; background: rgba(255,255,255,.12); border: 2px solid rgba(255,255,255,.35);
  pointer-events: auto; }
#touch .b.on { background: rgba(255,200,80,.45); border-color: rgba(255,220,120,.9); color: #fff; }
#touch .b[hidden] { display: none; }
`;

type Dir = 'left' | 'right';

export class TouchControls {
  readonly root = document.createElement('div');
  private readonly left = this.button('◀');
  private readonly right = this.button('▶');
  private readonly fire = this.button('Fire');
  private readonly fullscreen = this.button('⛶');
  private readonly menu = this.button('☰');
  /** Called by the menu button; none: the button is hidden (Classic). */
  onMenu: (() => void) | null = null;
  private layoutNow: TouchLayout | null = null;
  private playing = false;
  private readonly holds = new Map<number, Dir | 'fire'>(); // by pointerId
  private tapped = new Set<Dir | 'fire'>(); // pressed since the last sample
  private sampled = new Set<Dir | 'fire'>();

  /** `onFullscreen`: none where the page can't go fullscreen or already is (the installed app). */
  constructor(parent: HTMLElement, onFullscreen?: () => void) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root.id = 'touch';
    if (onFullscreen && document.fullscreenEnabled) {
      this.fullscreen.addEventListener('pointerup', (e) => {
        e.stopPropagation();
        onFullscreen();
      });
    } else this.fullscreen.remove(); // iPhone Safari, the installed app
    this.menu.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      this.onMenu?.();
    });
    parent.appendChild(this.root);
    this.root.addEventListener('pointerdown', (e) => this.press(e));
    this.root.addEventListener('pointermove', (e) => this.move(e));
    for (const type of ['pointerup', 'pointercancel'] as const) this.root.addEventListener(type, (e) => this.release(e));
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    // iOS zooms on a double tap (two quick taps on Fire) despite touch-action: none, and then reports the zoomed
    // viewport as window.innerWidth/innerHeight, which throws the layout off screen (Dark Planet's fix). Cancelling
    // touchend stops the zoom; the game reads pointer events, but the menus and dialogs need the click it
    // synthesises, so they keep it.
    document.addEventListener('touchend', (e) => {
      if (!(e.target instanceof Element && e.target.closest('.menubar, .backdrop, .wmenu'))) e.preventDefault();
    }, { passive: false });
    window.addEventListener('blur', () => this.holds.clear());
  }

  private button(label: string): HTMLElement {
    const el = document.createElement('div');
    el.className = 'b';
    el.textContent = label;
    this.root.appendChild(el);
    return el;
  }

  /** Per frame: whether to show the controls, whether a level runs (the overlay takes the touches) and the layout. */
  update(shown: boolean, playing: boolean, layout: TouchLayout): void {
    playing &&= shown;
    if (playing !== this.playing) {
      this.playing = playing;
      this.root.classList.toggle('play', playing);
      if (!playing) this.holds.clear();
    }
    this.root.hidden = !shown;
    this.layoutNow = layout;
    const put = (el: HTMLElement, r: Rect) =>
      Object.assign(el.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
    put(this.left, layout.left);
    put(this.right, layout.right);
    put(this.fire, layout.fire);
    put(this.fullscreen, layout.fullscreen);
    put(this.menu, layout.menu);
    this.menu.hidden = !this.onMenu || !playing;
    this.menu.style.fontSize = `${Math.round(layout.menu.w * 0.45)}px`;
    this.left.style.fontSize = this.right.style.fontSize = `${Math.round(layout.left.w * 0.4)}px`;
    this.fire.style.fontSize = `${Math.round(layout.fire.w * 0.26)}px`;
    this.fullscreen.style.fontSize = `${Math.round(layout.fullscreen.w * 0.45)}px`;
    const held = new Set(this.holds.values());
    for (const [el, id] of [[this.left, 'left'], [this.right, 'right'], [this.fire, 'fire']] as const) {
      el.hidden = !playing;
      el.classList.toggle('on', held.has(id));
    }
  }

  /** Take the buttons for the next tick: held now, or pressed since the last sample (a tap between ticks counts). */
  sample(): void {
    this.sampled = new Set([...this.holds.values(), ...this.tapped]);
    this.tapped.clear();
  }

  input(): Input {
    const on = (id: Dir | 'fire') => this.sampled.has(id);
    return { ...NO_INPUT, left: on('left'), right: on('right'), fire: on('fire') };
  }

  /** What a touch at x holds: the arrow on its side of the pad's split, or Fire on the right half. */
  private at(x: number): Dir | 'fire' {
    if (x >= window.innerWidth / 2) return 'fire';
    const l = this.layoutNow;
    const split = l ? (l.left.x + l.left.w + l.right.x) / 2 : window.innerWidth / 4;
    return x < split ? 'left' : 'right';
  }

  private press(e: PointerEvent): void {
    // a mouse click goes on to the game (main.ts hides the controls), the fullscreen button handles its own
    if (!this.playing || e.pointerType === 'mouse' || e.target === this.fullscreen || e.target === this.menu) return;
    e.preventDefault();
    this.root.setPointerCapture(e.pointerId);
    const id = this.at(e.clientX);
    this.holds.set(e.pointerId, id);
    this.tapped.add(id);
  }

  private move(e: PointerEvent): void {
    const h = this.holds.get(e.pointerId);
    if (h === undefined || h === 'fire') return;
    // the thumb slides between ◀ and ▶ (and stays on the pad past the middle of the window)
    const id = this.at(Math.min(e.clientX, window.innerWidth / 2 - 1));
    if (id !== h) {
      this.holds.set(e.pointerId, id);
      this.tapped.add(id);
    }
  }

  private release(e: PointerEvent): void {
    this.holds.delete(e.pointerId);
  }
}
