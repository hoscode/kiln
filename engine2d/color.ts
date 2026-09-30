// Color in OKLab / OKLCH: perceptually even mixing and adjustments.
// Output is always sRGB hex so it works in canvas, SVG, and other tools.
import type { Rng } from './prng';

export type RGB = [number, number, number]; // sRGB, 0..1
export type Lab = [number, number, number]; // OKLab
export type LCH = [number, number, number]; // OKLCH, hue in degrees

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function hexToRgb(hex: string): RGB {
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  const to = (c: number) => Math.round(clamp01(c) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function rgbToOklab([r, g, b]: RGB): Lab {
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToRgb([L, a, b]: Lab): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

export function toOklch(hex: string): LCH {
  const [L, a, b] = rgbToOklab(hexToRgb(hex));
  const h = (Math.atan2(b, a) * 180) / Math.PI;
  return [L, Math.hypot(a, b), h < 0 ? h + 360 : h];
}

export function oklch(L: number, C: number, h: number): string {
  const r = (h * Math.PI) / 180;
  return rgbToHex(oklabToRgb([L, C * Math.cos(r), C * Math.sin(r)]));
}

/** Perceptual mix of two colors (in OKLab). */
export function mix(a: string, b: string, t: number): string {
  const A = rgbToOklab(hexToRgb(a));
  const B = rgbToOklab(hexToRgb(b));
  return rgbToHex(oklabToRgb([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]));
}

/** Shift lightness (dL), chroma (scale) and hue (degrees). */
export function adjust(hex: string, dL = 0, chroma = 1, dh = 0): string {
  const [L, C, h] = toOklch(hex);
  return oklch(clamp01(L + dL), Math.max(0, C * chroma), h + dh);
}

/** Small random variation — makes repeated colors feel hand-mixed. */
export function jitter(hex: string, rng: Rng, amount = 0.03): string {
  return adjust(hex, rng.gauss(0, amount), 1 + rng.gauss(0, amount * 2), rng.gauss(0, amount * 60));
}

/** Sample a multi-stop gradient at t ∈ [0, 1]. */
export function gradient(stops: readonly string[], t: number): string {
  const x = clamp01(t) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  return mix(stops[i], stops[i + 1], x - i);
}
