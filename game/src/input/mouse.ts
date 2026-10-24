// The mouse (the remake; the original disables DXInput's mouse). The pointer gives a target for the paddle's
// centre, and the paddle goes there at its own 6 px per tick through Left / Right, so the game plays as with the
// keys. A held button is Button1 (fire, release the ball). Touch has its own buttons (touch.ts).

export class Mouse {
  /** The paddle centre the player points at, in picture pixels; null until the mouse is used. */
  target: number | null = null;
  private down = false;
  private sampledFire = false;

  constructor(el: HTMLElement, private readonly toScreen: (cx: number, cy: number) => [number, number]) {
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button === 0) this.down = true;
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') this.target = this.toScreen(e.clientX, e.clientY)[0];
    });
    const up = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button === 0) this.down = false;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    window.addEventListener('blur', () => (this.down = false));
  }

  sample(): void {
    this.sampledFire = this.down;
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
