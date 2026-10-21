// A tileable plain-weave texture for the cloth: R, G the surface normal's
// tilt (0.5 = flat), B height (0 in the gaps between threads, 1 on top of a
// crossing), A thread tone (0.5 = average). Mipmapped by the GPU, so from
// afar it averages out to a flat, evenly toned surface instead of aliasing.

/** Threads across one tile, in each direction. */
export const WEAVE_THREADS = 32;
const SIZE = 512;
const PX = SIZE / WEAVE_THREADS; // pixels per thread

let cached: ImageData | undefined;

export function weaveTexture(): ImageData {
  if (cached) return cached;
  const rnd = mulberry(0x5eed);
  // Each thread drifts a little off its grid line and varies in thickness.
  const thread = () =>
    Array.from({ length: WEAVE_THREADS }, () => ({
      offset: (rnd() - 0.5) * 0.2,
      width: 0.86 + rnd() * 0.14,
      tone: (rnd() - 0.5) * 2,
      slub: Array.from({ length: 6 }, () => rnd() - 0.5), // thickness along its length
    }));
  const warp = thread(); // runs along v (columns)
  const weft = thread(); // runs along u (rows)
  const fibre = periodicNoise(rnd, 128, 8); // fine streaks, stretched along each thread

  const height = new Float32Array(SIZE * SIZE);
  const tone = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const gx = x / PX, gy = y / PX;
      const i = Math.floor(gx), j = Math.floor(gy);
      const w = warp[i], f = weft[j];
      // Smooth over-under: a warp thread rises over odd/even weft rows in turn.
      const wElev = 0.5 + 0.5 * Math.cos(Math.PI * (gy - 0.5) + Math.PI * i);
      const fElev = 1 - (0.5 + 0.5 * Math.cos(Math.PI * (gx - 0.5) + Math.PI * j));
      const wSlub = 1 + 0.18 * lerpLoop(w.slub, gy / WEAVE_THREADS);
      const fSlub = 1 + 0.18 * lerpLoop(f.slub, gx / WEAVE_THREADS);
      const wProf = profile((gx - i - 0.5 - w.offset) / (0.5 * w.width * wSlub));
      const fProf = profile((gy - j - 0.5 - f.offset) / (0.5 * f.width * fSlub));
      const wFib = fibre(x * 4, y / 4);
      const fFib = fibre(y * 4 + 61, x / 4 + 17);
      // Twisted yarn: fine diagonal ridges running around each thread.
      const wTwist = Math.sin(2 * Math.PI * (gy * 5 + (gx - i) * 1.6));
      const fTwist = Math.sin(2 * Math.PI * (gx * 5 + (gy - j) * 1.6));
      const hw = wProf > 0 ? (0.35 + 0.65 * wElev) * (0.55 + 0.45 * wProf) + 0.035 * wFib + 0.03 * wTwist * wProf : 0;
      const hf = fProf > 0 ? (0.35 + 0.65 * fElev) * (0.55 + 0.45 * fProf) + 0.035 * fFib + 0.03 * fTwist * fProf : 0;
      const k = y * SIZE + x;
      height[k] = Math.max(hw, hf, 0);
      tone[k] = hw >= hf ? 0.06 * w.tone + 0.05 * wFib : 0.06 * f.tone + 0.05 * fFib;
    }
  }

  const img = new ImageData(SIZE, SIZE);
  const at = (x: number, y: number) => height[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)];
  const strength = 3.0; // height units per pixel → normal tilt
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5 * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 0.5 * strength;
      const len = Math.hypot(dx, dy, 1);
      const k = y * SIZE + x;
      const o = k * 4;
      img.data[o] = 127.5 - (dx / len) * 127.5;
      img.data[o + 1] = 127.5 - (dy / len) * 127.5;
      img.data[o + 2] = height[k] * 255;
      img.data[o + 3] = 127.5 + tone[k] * 127.5;
    }
  }
  return (cached = img);
}

/** Round thread cross-section, s in -1..1 across the thread. */
const profile = (s: number) => (Math.abs(s) < 1 ? Math.sqrt(1 - s * s) : 0);

/** Smooth looping interpolation through `v` for t in 0..1. */
function lerpLoop(v: number[], t: number) {
  const f = (((t % 1) + 1) % 1) * v.length;
  const i = Math.floor(f);
  const s = f - i;
  const e = s * s * (3 - 2 * s);
  return v[i] * (1 - e) + v[(i + 1) % v.length] * e;
}

/** Value noise in -1..1 that tiles every `period` units (x and y wrap). */
function periodicNoise(rnd: () => number, period: number, cells: number) {
  const grid = Array.from({ length: cells * cells }, () => rnd() * 2 - 1);
  const g = (i: number, j: number) => grid[(((j % cells) + cells) % cells) * cells + (((i % cells) + cells) % cells)];
  const scale = cells / period;
  return (x: number, y: number) => {
    const fx = x * scale, fy = y * scale;
    const i = Math.floor(fx), j = Math.floor(fy);
    const sx = fx - i, sy = fy - j;
    const ex = sx * sx * (3 - 2 * sx), ey = sy * sy * (3 - 2 * sy);
    const a = g(i, j) * (1 - ex) + g(i + 1, j) * ex;
    const b = g(i, j + 1) * (1 - ex) + g(i + 1, j + 1) * ex;
    return a * (1 - ey) + b * ey;
  };
}

function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
