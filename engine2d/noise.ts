// Seeded simplex noise (after Stefan Gustavson), plus fbm and curl helpers.
import type { Rng } from './prng';

export interface Noise {
  /** Simplex 2D in [-1, 1]. */
  noise2(x: number, y: number): number;
  /** Simplex 3D in [-1, 1]. Use z as time for animated fields. */
  noise3(x: number, y: number, z: number): number;
  /** Simplex 4D in [-1, 1]. */
  noise4(x: number, y: number, z: number, w: number): number;
  /**
   * 2D noise that loops in time: phase ∈ [0, 1) walks a circle of the given
   * radius through the extra dimensions, so phase 0 and 1 are identical.
   */
  loop2(x: number, y: number, phase: number, radius?: number): number;
  /** Fractal sum of noise2, normalized to roughly [-1, 1]. */
  fbm2(x: number, y: number, octaves?: number, lacunarity?: number, gain?: number): number;
  /** Divergence-free 2D flow from the gradient of noise2. */
  curl2(x: number, y: number, eps?: number): [number, number];
}

// 3D/4D kernels use r² = 0.5 (not the classic 0.6), which keeps the noise
// continuous across simplex boundaries; 0.6 causes tiny jumps that flicker
// in animation.
const grad3 = new Float32Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
  1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
  0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const F3 = 1 / 3;
const G3 = 1 / 6;
const F4 = (Math.sqrt(5) - 1) / 4;
const G4 = (5 - Math.sqrt(5)) / 20;

// The 32 edge midpoints of a 4D hypercube.
const grad4 = new Float32Array([
  0, 1, 1, 1, 0, 1, 1, -1, 0, 1, -1, 1, 0, 1, -1, -1, 0, -1, 1, 1, 0, -1, 1, -1, 0, -1, -1, 1, 0, -1, -1, -1,
  1, 0, 1, 1, 1, 0, 1, -1, 1, 0, -1, 1, 1, 0, -1, -1, -1, 0, 1, 1, -1, 0, 1, -1, -1, 0, -1, 1, -1, 0, -1, -1,
  1, 1, 0, 1, 1, 1, 0, -1, 1, -1, 0, 1, 1, -1, 0, -1, -1, 1, 0, 1, -1, 1, 0, -1, -1, -1, 0, 1, -1, -1, 0, -1,
  1, 1, 1, 0, 1, 1, -1, 0, 1, -1, 1, 0, 1, -1, -1, 0, -1, 1, 1, 0, -1, 1, -1, 0, -1, -1, 1, 0, -1, -1, -1, 0,
]);

export function createNoise(rng: Rng): Noise {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  const perm = new Uint8Array(512);
  const permMod12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
    permMod12[i] = perm[i] % 12;
  }

  function noise2(xin: number, yin: number): number {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;

    let n = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      const g = permMod12[ii + perm[jj]] * 3;
      t0 *= t0;
      n += t0 * t0 * (grad3[g] * x0 + grad3[g + 1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      const g = permMod12[ii + i1 + perm[jj + j1]] * 3;
      t1 *= t1;
      n += t1 * t1 * (grad3[g] * x1 + grad3[g + 1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      const g = permMod12[ii + 1 + perm[jj + 1]] * 3;
      t2 *= t2;
      n += t2 * t2 * (grad3[g] * x2 + grad3[g + 1] * y2);
    }
    return 70 * n;
  }

  function noise3(xin: number, yin: number, zin: number): number {
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const z0 = zin - (k - t);

    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 1, 0];
      else if (x0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 0, 1];
      else [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 1, 0, 1];
    } else {
      if (y0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 0, 1, 1];
      else if (x0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 0, 1, 1];
      else [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 1, 1, 0];
    }

    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
    const ii = i & 255, jj = j & 255, kk = k & 255;

    const corner = (g: number, x: number, y: number, z: number) => {
      let tt = 0.5 - x * x - y * y - z * z;
      if (tt < 0) return 0;
      tt *= tt;
      return tt * tt * (grad3[g * 3] * x + grad3[g * 3 + 1] * y + grad3[g * 3 + 2] * z);
    };
    return (
      76 *
      (corner(permMod12[ii + perm[jj + perm[kk]]], x0, y0, z0) +
        corner(permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]], x1, y1, z1) +
        corner(permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]], x2, y2, z2) +
        corner(permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]], x3, y3, z3))
    );
  }

  function noise4(x: number, y: number, z: number, w: number): number {
    const s = (x + y + z + w) * F4;
    const i = Math.floor(x + s), j = Math.floor(y + s), k = Math.floor(z + s), l = Math.floor(w + s);
    const t = (i + j + k + l) * G4;
    const x0 = x - (i - t), y0 = y - (j - t), z0 = z - (k - t), w0 = w - (l - t);

    // Rank each coordinate to find which simplex we're in.
    let rx = 0, ry = 0, rz = 0, rw = 0;
    if (x0 > y0) rx++; else ry++;
    if (x0 > z0) rx++; else rz++;
    if (x0 > w0) rx++; else rw++;
    if (y0 > z0) ry++; else rz++;
    if (y0 > w0) ry++; else rw++;
    if (z0 > w0) rz++; else rw++;

    const ii = i & 255, jj = j & 255, kk = k & 255, ll = l & 255;
    const corner = (di: number, dj: number, dk: number, dl: number, off: number) => {
      const cx = x0 - di + off * G4, cy = y0 - dj + off * G4, cz = z0 - dk + off * G4, cw = w0 - dl + off * G4;
      let tt = 0.5 - cx * cx - cy * cy - cz * cz - cw * cw;
      if (tt < 0) return 0;
      const g = (perm[ii + di + perm[jj + dj + perm[kk + dk + perm[ll + dl]]]] % 32) * 4;
      tt *= tt;
      return tt * tt * (grad4[g] * cx + grad4[g + 1] * cy + grad4[g + 2] * cz + grad4[g + 3] * cw);
    };
    const b = (r: number, n: number) => (r >= n ? 1 : 0);
    return (
      62 *
      (corner(0, 0, 0, 0, 0) +
        corner(b(rx, 3), b(ry, 3), b(rz, 3), b(rw, 3), 1) +
        corner(b(rx, 2), b(ry, 2), b(rz, 2), b(rw, 2), 2) +
        corner(b(rx, 1), b(ry, 1), b(rz, 1), b(rw, 1), 3) +
        corner(1, 1, 1, 1, 4))
    );
  }

  function loop2(x: number, y: number, phase: number, radius = 1): number {
    const a = phase * Math.PI * 2;
    return noise4(x, y, radius * Math.cos(a), radius * Math.sin(a));
  }

  function fbm2(x: number, y: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
    let sum = 0, amp = 1, norm = 0, f = 1;
    for (let o = 0; o < octaves; o++) {
      sum += amp * noise2(x * f + o * 17.31, y * f - o * 9.77);
      norm += amp;
      amp *= gain;
      f *= lacunarity;
    }
    return sum / norm;
  }

  function curl2(x: number, y: number, eps = 1e-3): [number, number] {
    const dx = (noise2(x + eps, y) - noise2(x - eps, y)) / (2 * eps);
    const dy = (noise2(x, y + eps) - noise2(x, y - eps)) / (2 * eps);
    return [dy, -dx];
  }

  return { noise2, noise3, noise4, loop2, fbm2, curl2 };
}
