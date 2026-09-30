import { createNoise } from './noise';
import type { ParamSchema, ParamValues } from './params';
import type { AnyPiece, DrawContext } from './piece';
import { UNITS } from './piece';
import { createRng } from './prng';
import { CanvasSurface, SvgSurface, type Ctx2D, type Surface } from './surface';

type Values = Record<string, unknown>;
type AnyValues = ParamValues<ParamSchema>;

function makeContext(piece: AnyPiece, values: Values, seed: number, g: Surface, t: number): DrawContext<AnyValues> {
  return {
    g,
    p: values as AnyValues,
    rng: createRng(seed),
    // Separate stream: changing how many rng() calls a piece makes never reshapes its noise field.
    noise: createNoise(createRng(seed ^ 0x5bd1e995)),
    W: g.width,
    H: g.height,
    t,
    seed,
  };
}

export function renderToCanvas(
  piece: AnyPiece,
  values: Values,
  seed: number,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  pixelWidth: number,
  t = 0,
) {
  canvas.width = Math.round(pixelWidth);
  canvas.height = Math.round(pixelWidth / piece.aspect);
  const ctx = (canvas as OffscreenCanvas).getContext('2d') as Ctx2D | null;
  if (!ctx) throw new Error(`Could not allocate a ${canvas.width}×${canvas.height} canvas`);
  const g = new CanvasSurface(ctx, UNITS, UNITS / piece.aspect, seed);
  piece.draw(makeContext(piece, values, seed, g, t));
}

export async function renderToPng(piece: AnyPiece, values: Values, seed: number, pixelWidth: number, t = 0) {
  const canvas = new OffscreenCanvas(1, 1);
  renderToCanvas(piece, values, seed, canvas, pixelWidth, t);
  return canvas.convertToBlob({ type: 'image/png' });
}

export function renderToSvg(piece: AnyPiece, values: Values, seed: number, t = 0): string {
  const g = new SvgSurface(UNITS, UNITS / piece.aspect);
  piece.draw(makeContext(piece, values, seed, g, t));
  return g.toString();
}
