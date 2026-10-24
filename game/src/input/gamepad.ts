// Gamepad → the DXInput states: the original binds the joystick to the same states as the keyboard (Observed,
// Joystick.BindInputStates, dead zone 50 of 1000). Standard mapping: stick or d-pad, A / B / RB fire.

import { NO_INPUT, type Input } from '../sim/world';

const DEAD_ZONE = 0.3;
const BUTTON = { fire: [0, 1, 5, 7], up: [12], left: [14], right: [15] };

export class Gamepad {
  private pad: globalThis.Gamepad | null = null;

  sample(): void {
    this.pad = null;
    if (typeof navigator.getGamepads !== 'function') return;
    for (const p of navigator.getGamepads()) {
      if (p?.connected) {
        this.pad = p;
        return;
      }
    }
  }

  input(): Input {
    const p = this.pad;
    if (!p) return NO_INPUT;
    const pressed = (ids: number[]) => ids.some((i) => p.buttons[i]?.pressed);
    const ax = p.axes[0] ?? 0, ay = p.axes[1] ?? 0;
    return {
      left: ax < -DEAD_ZONE || pressed(BUTTON.left),
      right: ax > DEAD_ZONE || pressed(BUTTON.right),
      up: ay < -DEAD_ZONE || pressed(BUTTON.up),
      fire: pressed(BUTTON.fire),
    };
  }
}
