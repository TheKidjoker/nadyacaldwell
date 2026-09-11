/**
 * Deterministic PRNG (mulberry32).
 *
 * The floral arrangements are generated from a seed so that every build
 * produces byte-identical markup. Change a seed to re-roll an arrangement.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Rounding helpers. Every digit here is multiplied by ~1,300 SVG nodes in the
 * shipped HTML, so precision is kept to what is actually visible: at render
 * scale one user unit is roughly one CSS pixel. */

/** 1dp — positions and lengths. */
export const r1 = (n: number): number => Math.round(n * 10) / 10;

/** 2dp — scale factors, where small differences still read. */
export const r2 = (n: number): number => Math.round(n * 100) / 100;

/** Whole degrees — rotations. */
export const rDeg = (n: number): number => Math.round(n);
