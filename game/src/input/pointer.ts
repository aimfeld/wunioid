// Mouse and touch (the remake; the original disables DXInput's mouse). The pointer gives a target for the paddle's
// centre, and the paddle goes there at its own 6 px per tick through Left / Right, so the game plays as with the
// keys. Mouse: a held button is Button1 (fire, release the ball). Touch: drag anywhere to steer; a short tap is
// one Button1, and a second finger held down is Button1 held (the gun).

const TAP_MS = 250;
const TAP_SLOP = 12; // CSS px

export class Pointer {
  /** The paddle centre the player points at, in picture pixels; null until the pointer is used. */
  target: number | null = null;
  private mouseDown = false;
  private touches = new Map<number, { t: number; x: number; y: number; moved: boolean }>();
  private tapped = false;
  private sampledFire = false;

  constructor(el: HTMLElement, private readonly toScreen: (cx: number, cy: number) => [number, number]) {
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') {
        if (e.button === 0) this.mouseDown = true;
      } else {
        this.touches.set(e.pointerId, { t: e.timeStamp, x: e.clientX, y: e.clientY, moved: false });
        if (this.touches.size === 1) this.aim(e);
      }
    });
    el.addEventListener('pointermove', (e) => {
      const touch = this.touches.get(e.pointerId);
      if (touch) {
        if (Math.hypot(e.clientX - touch.x, e.clientY - touch.y) > TAP_SLOP) touch.moved = true;
        if (this.touches.keys().next().value !== e.pointerId) return; // the first finger steers
      }
      this.aim(e);
    });
    const up = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') {
        if (e.button === 0) this.mouseDown = false;
        return;
      }
      const touch = this.touches.get(e.pointerId);
      this.touches.delete(e.pointerId);
      if (touch && !touch.moved && e.timeStamp - touch.t < TAP_MS && e.type === 'pointerup') this.tapped = true;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    window.addEventListener('blur', () => {
      this.mouseDown = false;
      this.touches.clear();
    });
  }

  private aim(e: PointerEvent): void {
    this.target = this.toScreen(e.clientX, e.clientY)[0];
  }

  sample(): void {
    this.sampledFire = this.mouseDown || this.touches.size >= 2 || this.tapped;
    this.tapped = false;
  }

  get fire(): boolean {
    return this.sampledFire;
  }

  /** Left / Right towards the target; within half a step of it the paddle stays. */
  steer(paddleCentre: number): { left: boolean; right: boolean } {
    if (this.target === null) return { left: false, right: false };
    return { left: this.target < paddleCentre - 3, right: this.target > paddleCentre + 3 };
  }
}
