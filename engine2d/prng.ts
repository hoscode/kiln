// Seeded randomness. All randomness in a piece must flow from here so that
// (params, seed) → identical output at any resolution.

export interface Rng {
  (): number; // [0, 1)
  range(min: number, max: number): number;
  int(min: number, max: number): number; // [min, max)
  pick<T>(items: readonly T[]): T;
  chance(p: number): boolean;
  gauss(mean?: number, sd?: number): number;
  shuffle<T>(items: T[]): T[];
  /** Independent stream, so adding draws in one place doesn't shift another. */
  fork(label?: string): Rng;
}

export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

function splitmix32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) | 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
}

export function createRng(seed: number): Rng {
  const init = splitmix32(seed);
  let a = init(), b = init(), c = init(), d = init();

  // sfc32
  const next = () => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) next();

  let spare: number | null = null;
  const rng = next as Rng;
  rng.range = (min, max) => min + (max - min) * next();
  rng.int = (min, max) => Math.floor(min + (max - min) * next());
  rng.pick = (items) => items[Math.floor(next() * items.length)];
  rng.chance = (p) => next() < p;
  rng.gauss = (mean = 0, sd = 1) => {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return mean + sd * v;
    }
    let u = 0, v = 0, s = 0;
    do {
      u = next() * 2 - 1;
      v = next() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const k = Math.sqrt((-2 * Math.log(s)) / s);
    spare = v * k;
    return mean + sd * u * k;
  };
  rng.shuffle = (items) => {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  };
  rng.fork = (label) =>
    createRng((Math.floor(next() * 4294967296) ^ (label ? hashString(label) : 0)) >>> 0);
  return rng;
}
