// Choreography: when does each element of a crowd act? A wave field maps a
// position to a delay in [0, 1]; `stagger` turns a delay into eased progress
// inside a time window. Reusable for flips, reveals, rises, color changes…
import { ease } from './anim';
import type { Vec2 } from './geom';
import { TAU } from './geom';
import type { Noise } from './noise';

export type WavePattern = 'radial' | 'sweep' | 'spiral' | 'rings' | 'noise';
export const WAVE_PATTERNS: readonly WavePattern[] = ['radial', 'sweep', 'spiral', 'rings', 'noise'];

export interface WaveOptions {
  /** Distance over which the wave travels from delay 0 to 1. */
  radius: number;
  /** Sweep direction, radians. */
  angle?: number;
  /** Spiral tightness. */
  turns?: number;
  /** Ripples across the radius (rings pattern). */
  rings?: number;
  /** Required for the noise pattern. */
  noise?: Noise;
  /** Mix in per-position randomness, 0..1, so neighbours don't move in lockstep. */
  jitter?: number;
}

export type WaveField = (x: number, y: number) => number;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const frac = (x: number) => x - Math.floor(x);

/** Deterministic 0..1 value per position. */
export function hash2(x: number, y: number): number {
  return frac(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
}

export function waveField(pattern: WavePattern, o: WaveOptions): WaveField {
  const R = o.radius;
  let base: WaveField;
  switch (pattern) {
    case 'radial':
      base = (x, y) => Math.hypot(x, y) / R;
      break;
    case 'sweep': {
      const c = Math.cos(o.angle ?? 0), s = Math.sin(o.angle ?? 0);
      base = (x, y) => (x * c + y * s) / (2 * R) + 0.5;
      break;
    }
    case 'spiral': {
      const k = o.turns ?? 1;
      base = (x, y) => (frac(Math.atan2(y, x) / TAU + 1) + (k * Math.hypot(x, y)) / R) / (1 + k);
      break;
    }
    case 'rings': {
      const n = o.rings ?? 3;
      base = (x, y) => frac((Math.hypot(x, y) / R) * n);
      break;
    }
    case 'noise': {
      const noise = o.noise;
      if (!noise) throw new Error('waveField("noise") needs a noise source');
      base = (x, y) => noise.fbm2((x / R) * 1.5, (y / R) * 1.5, 3) * 0.9 + 0.5;
      break;
    }
  }
  const j = o.jitter ?? 0;
  return (x, y) => clamp01((1 - j) * base(x, y) + j * hash2(x, y));
}

/** Unit direction the wave travels at (x, y): the delay gradient. */
export function waveDirection(field: WaveField, x: number, y: number, eps = 0.05): Vec2 {
  const dx = field(x + eps, y) - field(x - eps, y);
  const dy = field(x, y + eps) - field(x, y - eps);
  const len = Math.hypot(dx, dy);
  return len > 1e-9 ? [dx / len, dy / len] : [1, 0];
}

/** Eased 0 → 1 progress of an action starting at `start`, lasting `length` (both in loop units). */
export function act(phase: number, start: number, length: number, sharpness = 3): number {
  const x = (phase - start) / length;
  return x <= 0 ? 0 : x >= 1 ? 1 : ease(x, sharpness);
}

/**
 * Stagger an action across a window: delay 0 starts at `from`, delay 1
 * finishes exactly at `from + span`.
 */
export function stagger(phase: number, delay: number, from: number, span: number, length: number, sharpness = 3): number {
  return act(phase, from + delay * Math.max(0, span - length), length, sharpness);
}
