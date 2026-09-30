import type { Noise } from './noise';
import type { ParamSchema, ParamValues } from './params';
import type { Rng } from './prng';
import type { Surface } from './surface';

/** Width of every piece in abstract units; height is UNITS / aspect. */
export const UNITS = 1000;

export interface DrawContext<P> {
  g: Surface;
  p: P;
  rng: Rng;
  noise: Noise;
  W: number;
  H: number;
  /** Time in seconds (0 for stills). */
  t: number;
  seed: number;
}

export interface Piece<S extends ParamSchema = ParamSchema> {
  id: string;
  title: string;
  tags?: string[];
  /** width / height */
  aspect: number;
  params: S;
  draw(ctx: DrawContext<ParamValues<S>>): void;
}

export type AnyPiece = Piece<any>;

export function definePiece<const S extends ParamSchema>(piece: Piece<S>): Piece<S> {
  return piece;
}
