import type { Noise } from './noise';
import type { ParamSchema, ParamValues } from './params';
import type { Rng } from './prng';
import type { Surface } from './surface';

/** Width of every piece in abstract units; height is UNITS / aspect. */
export const UNITS = 1000;

export interface Animation {
  /** Seconds. For loops, one full cycle. */
  duration: number;
  fps: number;
  /** Frame `duration * fps` equals frame 0, so playback wraps seamlessly. */
  loop?: boolean;
  /** Name of a number param (seconds) that overrides `duration`. */
  durationParam?: string;
}

/** A piece's animation with param-driven overrides applied. */
export function animationFor(piece: PieceMeta, values: Record<string, unknown>): Animation | undefined {
  const a = piece.animation;
  if (!a?.durationParam) return a;
  const d = Number(values[a.durationParam]);
  return Number.isFinite(d) && d > 0 ? { ...a, duration: d } : a;
}

/** Everything a piece knows about "when" and "where", minus the surface. */
export interface TimeContext<P> {
  p: P;
  rng: Rng;
  noise: Noise;
  W: number;
  H: number;
  /** Seconds (0 for stills). */
  t: number;
  /** t / duration in [0, 1); 0 for stills. */
  phase: number;
  /** Frame index at the animation's fps. */
  frame: number;
  fps: number;
  duration: number;
  seed: number;
}

export interface DrawContext<P, St = undefined> extends TimeContext<P> {
  g: Surface;
  /** Simulation state from setup/step (undefined for stateless pieces). */
  state: St;
}

/** Fields shared by every engine's pieces. */
export interface PieceMeta<S extends ParamSchema = ParamSchema> {
  id: string;
  title: string;
  tags?: string[];
  /** width / height */
  aspect: number;
  params: S;
  animation?: Animation;
}

/**
 * A canvas/SVG piece. Two shapes:
 *  - stateless: `draw` is a pure function of (params, seed, t) — scrub anywhere, motion blur works.
 *  - simulation: `setup` + `step` advance state one frame at a time (deterministic replay).
 */
export interface Piece<S extends ParamSchema = ParamSchema, St = undefined> extends PieceMeta<S> {
  engine?: '2d';
  /**
   * Keep the canvas between frames instead of clearing it (trails, accumulation).
   * The piece paints its own background on frame 0 and any fading after.
   */
  persist?: boolean;
  setup?(ctx: TimeContext<ParamValues<S>>): St;
  step?(state: St, ctx: TimeContext<ParamValues<S>>): void;
  draw(ctx: DrawContext<ParamValues<S>, St>): void;
}

export type AnyPiece = Piece<any, any>;

export function definePiece<const S extends ParamSchema, St = undefined>(piece: Piece<S, St>): Piece<S, St> {
  return piece;
}
