import { createNoise } from './noise';
import type { ParamSchema, ParamValues } from './params';
import type { AnyPiece, DrawContext } from './piece';
import { UNITS } from './piece';
import { createPngWriter } from './png';
import { createRng } from './prng';
import { CanvasSurface, SvgSurface, type Ctx2D, type Surface } from './surface';

type Values = Record<string, unknown>;
type AnyValues = ParamValues<ParamSchema>;

function makeContext(values: Values, seed: number, g: Surface, t: number): DrawContext<AnyValues> {
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

/** Draw the piece into ctx, where ctx's canvas shows rows [offsetY, offsetY + height) of a pxWidth-wide image. */
function drawInto(piece: AnyPiece, values: Values, seed: number, ctx: Ctx2D, pxWidth: number, offsetY: number, t: number) {
  const g = new CanvasSurface(ctx, UNITS, UNITS / piece.aspect, seed, pxWidth, offsetY);
  piece.draw(makeContext(values, seed, g, t));
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
  drawInto(piece, values, seed, ctx, canvas.width, 0, t);
}

export interface PngOptions {
  t?: number;
  /** Text metadata embedded in the PNG. */
  text?: Record<string, string>;
  onProgress?: (done: number, total: number) => void;
  /** Largest strip to allocate; 16M pixels stays within Safari's canvas limit. */
  maxStripPixels?: number;
}

/**
 * Render to PNG in horizontal strips, so output size isn't limited by the
 * browser's maximum canvas size. The piece is drawn once per strip; that's
 * safe because drawing is deterministic.
 */
export async function renderPng(piece: AnyPiece, values: Values, seed: number, pixelWidth: number, opts: PngOptions = {}) {
  const width = Math.round(pixelWidth);
  const height = Math.round(pixelWidth / piece.aspect);
  const stripH = Math.max(1, Math.min(height, Math.floor((opts.maxStripPixels ?? 16_000_000) / width)));
  const total = Math.ceil(height / stripH);

  const canvas = new OffscreenCanvas(width, stripH);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error(`Could not allocate a ${width}×${stripH} strip`);
  const png = createPngWriter(width, height, opts.text);

  for (let i = 0; i < total; i++) {
    const y = i * stripH;
    const rows = Math.min(stripH, height - y);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, stripH);
    drawInto(piece, values, seed, ctx, width, y, opts.t ?? 0);
    await png.writeRows(ctx.getImageData(0, 0, width, rows).data, rows);
    opts.onProgress?.(i + 1, total);
  }
  return png.finish();
}

export function renderToSvg(piece: AnyPiece, values: Values, seed: number, t = 0): string {
  const g = new SvgSurface(UNITS, UNITS / piece.aspect);
  piece.draw(makeContext(values, seed, g, t));
  return g.toString();
}
