import { describe, expect, it } from 'vitest';
import { FrameClock } from '../src/frameClock';

/** The clock's steps for frames at `times`. */
function steps(times: number[]): number[] {
  const c = new FrameClock();
  return times.map((t) => c.step(t));
}

describe('FrameClock', () => {
  it('evens out jitter around the refresh period and keeps real time', () => {
    const p = 1000 / 60;
    const times = Array.from({ length: 600 }, (_, i) => 1000 + i * p + (i % 2 ? 2.5 : -2.5) * ((i * 7) % 3 === 0 ? 1 : 0.4));
    const out = steps(times);
    const late = out.slice(300);
    expect(Math.max(...late) - Math.min(...late)).toBeLessThan(0.3);
    const total = out.reduce((a, b) => a + b, 0);
    expect(Math.abs(total - (times.at(-1)! - times[0]))).toBeLessThan(p);
  });

  it('counts a dropped frame as two periods', () => {
    const p = 1000 / 60;
    const times = Array.from({ length: 200 }, (_, i) => i * p);
    times.push(times.at(-1)! + 2 * p, times.at(-1)! + 3 * p);
    const out = steps(times);
    expect(out.at(-2)).toBeCloseTo(2 * p, 1);
    expect(out.at(-1)).toBeCloseTo(p, 1);
  });

  it('learns another refresh rate', () => {
    const p = 1000 / 144;
    const out = steps(Array.from({ length: 300 }, (_, i) => i * p + (i % 3) * 0.8));
    for (const dt of out.slice(200)) expect(dt).toBeCloseTo(p, 0);
  });

  it('passes a stall through and starts at 0 after a reset', () => {
    const c = new FrameClock();
    expect(c.step(0)).toBe(0);
    c.step(16.7);
    expect(c.step(516.7)).toBeCloseTo(500, 0);
    c.reset();
    expect(c.step(9000)).toBe(0);
    expect(c.step(8990)).toBe(0);
  });
});
