// The Delphi 3 numerics the original's game logic depends on: Random, the 6-byte Real, Round and the angle
// helpers of TBall (docs/re-notes.md, "Angles and the ball's direction").

/** Delphi's Random (System._RandInt): RandSeed := RandSeed * $08088405 + 1, result = high dword of seed * n. */
export class DelphiRandom {
  constructor(public seed: number) {
    this.seed = seed | 0;
  }

  /** Random(n): 0 … n−1 (0 for n ≤ 1). */
  next(n: number): number {
    this.seed = (Math.imul(this.seed, 0x08088405) + 1) | 0;
    return Math.floor(((this.seed >>> 0) * (n >>> 0)) / 0x100000000);
  }
}

const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);

/**
 * A value stored in a Delphi `Real` (6 bytes, 39 fraction bits): the ball's speed and direction (TBall +0x64, +0x6a,
 * +0x70) are Reals. Rounds a double's 52 fraction bits to 39, half away from zero (Inferred: System._Ext2Real
 * rounds; the exact mode doesn't matter at this precision).
 */
export function real48(x: number): number {
  if (x === 0 || !Number.isFinite(x)) return x;
  f64[0] = x;
  let lo = u32[0] + 0x1000;
  let hi = u32[1];
  if (lo >= 0x100000000) {
    lo -= 0x100000000;
    hi = (hi + 1) >>> 0;
  }
  u32[0] = (lo & ~0x1fff) >>> 0;
  u32[1] = hi;
  return f64[0];
}

/** Delphi Round: the x87 default, round half to even. */
export function roundHalfEven(x: number): number {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

/** Delphi `div` and `mod`: truncating. */
export const div = (a: number, b: number) => Math.trunc(a / b);
export const mod = (a: number, b: number) => a % b;

/**
 * TBall.NormAngle (0x4193f0): |a mod 360| for a > 0, else |a mod 360 + 1440|. Values ≤ 0 are not brought into
 * 0…359 (0 → 1440, −30 → 1410); comparisons against it keep the quirk.
 */
export function normAngle(a: number): number {
  return a > 0 ? Math.abs(mod(a, 360)) : Math.abs(mod(a, 360) + 1440);
}

/** TBall.SetDirection (0x419378): dx = cos a, dy = −sin a (90° is up), stored as Reals. */
export function direction(a: number): [number, number] {
  const r = normAngle(a) * (2 * Math.PI) * (1 / 360);
  return [real48(Math.cos(r)), real48(-Math.sin(r))];
}

/** DelphiX Mod2f (looping animations): i − Trunc(i / i2)·i2, moved into 0 … i2. */
export function mod2f(i: number, i2: number): number {
  if (i2 === 0) return i;
  const r = i - Math.trunc(i / i2) * i2;
  return r < 0 ? i2 + r : r;
}
