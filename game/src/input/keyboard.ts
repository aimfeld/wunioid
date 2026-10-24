// Keyboard → the DXInput states the paddle reads. The form keeps DelphiX's default key assigns (Observed,
// TDXInput.Keyboard.Assigns): Up = K / ↑ / Num8, Left = H / ← / Num4, Right = L / → / Num6, Button1 = Z / Space.
// Codes are key positions, as DirectInput's scan codes: Z is the key left of X (Y on a German keyboard).

import type { Input } from '../sim/world';

const KEYS = {
  up: ['KeyK', 'ArrowUp', 'Numpad8'],
  left: ['KeyH', 'ArrowLeft', 'Numpad4'],
  right: ['KeyL', 'ArrowRight', 'Numpad6'],
  fire: ['KeyZ', 'Space'],
};
const CAPTURED = new Set([...Object.values(KEYS).flat(), 'ArrowDown']);

export class Keyboard {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>(); // since the last takePress
  private readonly tapped = new Set<string>(); // since the last sample
  private sampled = new Set<string>();

  constructor(target: Window) {
    target.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (CAPTURED.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
      this.tapped.add(e.code);
    });
    target.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
    });
    target.addEventListener('blur', () => this.down.clear());
    target.document?.addEventListener('visibilitychange', () => this.down.clear());
  }

  /** The keys for the next tick: held now, or pressed since the last sample (a tap between ticks counts). */
  sample(): void {
    this.sampled = new Set([...this.down, ...this.tapped]);
    this.tapped.clear();
  }

  input(): Input {
    const held = (codes: string[]) => codes.some((c) => this.sampled.has(c));
    return { up: held(KEYS.up), left: held(KEYS.left), right: held(KEYS.right), fire: held(KEYS.fire) };
  }

  /** True once per key press. */
  takePress(code: string): boolean {
    return this.pressed.delete(code);
  }

  /** Forget presses made while a dialog had the keyboard. */
  clearPresses(): void {
    this.pressed.clear();
  }
}
