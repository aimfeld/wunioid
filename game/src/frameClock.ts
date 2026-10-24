// The time from one animation frame to the next, smoothed. requestAnimationFrame's timestamps can jitter by a few ms
// around the display's refresh (some browsers give the callback's time, not the vsync's), and every ms of jitter
// moves the ball a quarter pixel off its line in the interpolated picture: a slight judder. Frames close to a whole
// number of refresh periods count as exactly that many; the period is learnt from the frames, and the difference to
// real time is fed back slowly, so the game keeps real time.

const GAIN = 0.02; // how fast the period estimate and the drift correction follow
const TOLERANCE = 0.4; // of a period
const MAX_PERIOD = 50; // ms; longer frames are stalls, not a refresh rate

export class FrameClock {
  private period = 1000 / 60;
  private last: number | null = null;
  private drift = 0; // real time not given out yet, ms

  /** The time since the last frame, ms (0 for the first frame after a reset). */
  step(now: number): number {
    if (this.last === null) {
      this.last = now;
      return 0;
    }
    const dt = now - this.last;
    this.last = now;
    if (dt <= 0) return 0;
    const n = Math.round(dt / this.period);
    let out = dt;
    if (n >= 1 && Math.abs(dt - n * this.period) < TOLERANCE * this.period) {
      this.period += GAIN * (dt / n - this.period);
      out = n * this.period;
    } else if (dt < MAX_PERIOD) {
      this.period += 0.2 * (dt - this.period); // another refresh rate (a new display): learn it quickly
    }
    this.drift += dt - out;
    if (Math.abs(this.drift) > MAX_PERIOD) {
      out += this.drift;
      this.drift = 0;
    } else {
      const d = GAIN * this.drift;
      out += d;
      this.drift -= d;
    }
    return Math.max(0, out);
  }

  /** The next frame starts afresh (the page was hidden). */
  reset(): void {
    this.last = null;
    this.drift = 0;
  }
}
