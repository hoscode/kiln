// Timing helpers for animated pieces. `phase` is t / duration in [0, 1).

/** Symmetric ease with adjustable sharpness (k = 1 is linear); the Bees & Bombs staple. */
export function ease(x: number, k = 3): number {
  return x < 0.5 ? 0.5 * Math.pow(2 * x, k) : 1 - 0.5 * Math.pow(2 * (1 - x), k);
}

export const easeInOutSine = (x: number) => -(Math.cos(Math.PI * x) - 1) / 2;
export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Wrap into [0, 1). */
export const fract = (x: number) => x - Math.floor(x);

/** 0 → 1 → 0 over one period. */
export const pingpong = (x: number) => 1 - Math.abs(1 - 2 * fract(x));

/** Local progress of an element whose motion is delayed by `delay` (in loop units). */
export const delayed = (phase: number, delay: number) => fract(phase - delay);
