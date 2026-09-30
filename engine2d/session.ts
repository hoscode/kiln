// Rendering sessions: a piece + params + seed bound to an output size, able to
// render any time t. Engines implement `Session`; the runtime drives them for
// previews, stills and video alike.
import { fract } from './anim';
import { createNoise, type Noise } from './noise';
import type { AnyPiece, PieceMeta, TimeContext } from './piece';
import { animationFor, UNITS } from './piece';
import { createRng, type Rng } from './prng';
import { CanvasSurface, SvgSurface } from './surface';

type Values = Record<string, unknown>;

export interface FrameOptions {
  /** Sub-frames averaged per frame (motion blur + anti-aliasing). */
  samples?: number;
  /** Fraction of the frame interval the shutter is open (0.5 = 180° shutter). */
  shutter?: number;
}

export interface Session {
  readonly width: number;
  readonly height: number;
  /** Canvas height; smaller than `height` when rendering in strips. */
  readonly tileHeight: number;
  readonly canvas: OffscreenCanvas;
  /** Render rows [offsetY, offsetY + tileHeight) of the frame at time t. */
  render(t: number, opts?: FrameOptions, offsetY?: number): void;
  /** RGBA of the first `rows` rows of the last render, top-down. */
  readRows(rows: number): Uint8ClampedArray;
  /** Copy of the last render, for display. */
  bitmap(): Promise<ImageBitmap>;
  /** Swap params/seed without reallocating (and restart simulations). */
  update(values: Values, seed: number): void;
  dispose(): void;
}

const noiseFor = (seed: number) => createNoise(createRng(seed ^ 0x5bd1e995));

export function timeContext(
  piece: PieceMeta,
  values: Values,
  seed: number,
  t: number,
  rng: Rng = createRng(seed),
  noise: Noise = noiseFor(seed),
): TimeContext<never> {
  const anim = animationFor(piece, values);
  const fps = anim?.fps ?? 60;
  const duration = anim?.duration ?? 0;
  return {
    p: values as never,
    rng,
    noise,
    W: UNITS,
    H: UNITS / piece.aspect,
    t,
    phase: duration ? fract(t / duration) : 0,
    frame: Math.round(t * fps),
    fps,
    duration,
    seed,
  };
}

/**
 * In simulations, randomness in draw() comes from a per-frame stream so that
 * state only ever evolves in step(). Otherwise playing frame-by-frame and
 * jumping straight to a frame would diverge.
 */
const frameRng = (seed: number, frame: number) => createRng((seed ^ Math.imul(frame + 1, 0x9e3779b1)) >>> 0);

// sRGB ↔ linear lookup tables: motion blur averages light, not display values.
const TO_LINEAR = Float32Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});
const TO_SRGB = Uint8ClampedArray.from({ length: 4096 }, (_, i) => {
  const v = i / 4095;
  return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
});

interface SimRun {
  state: unknown;
  frame: number;
  offsetY: number;
  rng: Rng;
  noise: Noise;
}

export class Canvas2DSession implements Session {
  readonly canvas: OffscreenCanvas;
  private ctx: OffscreenCanvasRenderingContext2D;
  private sim?: SimRun;
  private accum?: Float32Array;

  constructor(
    private piece: AnyPiece,
    private values: Values,
    private seed: number,
    readonly width: number,
    readonly height: number,
    readonly tileHeight = height,
  ) {
    this.canvas = new OffscreenCanvas(width, tileHeight);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error(`Could not allocate a ${width}×${tileHeight} canvas`);
    this.ctx = ctx;
  }

  private get fps() {
    return this.piece.animation?.fps ?? 60;
  }

  render(t: number, opts: FrameOptions = {}, offsetY = 0) {
    if (this.piece.setup) return this.renderSim(t, offsetY);

    const frame = Math.round(t * this.fps);
    const n = Math.max(1, Math.round(opts.samples ?? 1));
    if (n === 1) return this.drawAt(t, frame, offsetY);

    // Stratified sub-frames across the open shutter, averaged in linear light.
    const shutter = opts.shutter ?? 0.5;
    const acc = (this.accum ??= new Float32Array(this.width * this.tileHeight * 4));
    acc.fill(0);
    for (let s = 0; s < n; s++) {
      this.drawAt(t + (((s + 0.5) / n - 0.5) * shutter) / this.fps, frame, offsetY);
      const d = this.ctx.getImageData(0, 0, this.width, this.tileHeight).data;
      for (let i = 0; i < d.length; i++) acc[i] += TO_LINEAR[d[i]];
    }
    const out = this.ctx.createImageData(this.width, this.tileHeight);
    for (let i = 0; i < acc.length; i++) {
      out.data[i] = (i & 3) === 3 ? 255 : TO_SRGB[Math.min(4095, ((acc[i] / n) * 4095) | 0)];
    }
    this.ctx.putImageData(out, 0, 0);
  }

  readRows(rows: number) {
    return this.ctx.getImageData(0, 0, this.width, rows).data;
  }

  bitmap() {
    return createImageBitmap(this.canvas);
  }

  update(values: Values, seed: number) {
    this.values = values;
    this.seed = seed;
    this.sim = undefined;
  }

  dispose() {}

  private surface(offsetY: number, frame: number) {
    return new CanvasSurface(this.ctx, UNITS, UNITS / this.piece.aspect, this.seed, this.width, offsetY, frame);
  }

  private clear() {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.width, this.tileHeight);
  }

  private drawAt(t: number, frame: number, offsetY: number) {
    this.clear();
    const time = timeContext(this.piece, this.values, this.seed, t);
    this.piece.draw({ ...time, g: this.surface(offsetY, frame), state: undefined });
  }

  /** Step the simulation to the frame at t, replaying from the start if needed. */
  private renderSim(t: number, offsetY: number) {
    const piece = this.piece;
    const target = Math.max(0, Math.round(t * this.fps));
    let sim = this.sim;
    if (!sim || sim.frame > target || sim.offsetY !== offsetY) {
      const rng = createRng(this.seed);
      const noise = noiseFor(this.seed);
      const state = piece.setup!(timeContext(piece, this.values, this.seed, 0, rng, noise));
      sim = this.sim = { state, frame: 0, offsetY, rng, noise };
      this.clear();
      if (piece.persist) this.drawSim(sim);
    }
    while (sim.frame < target) {
      sim.frame++;
      piece.step?.(sim.state, timeContext(piece, this.values, this.seed, sim.frame / this.fps, sim.rng, sim.noise));
      if (piece.persist) this.drawSim(sim);
    }
    if (!piece.persist) {
      this.clear();
      this.drawSim(sim);
    }
  }

  private drawSim(sim: SimRun) {
    const time = timeContext(this.piece, this.values, this.seed, sim.frame / this.fps, frameRng(this.seed, sim.frame), sim.noise);
    this.piece.draw({ ...time, g: this.surface(sim.offsetY, sim.frame), state: sim.state });
  }
}

/** SVG of the frame at t. Simulations are stepped to t and drawn once. */
export function renderToSvg(piece: AnyPiece, values: Values, seed: number, t = 0): string {
  const g = new SvgSurface(UNITS, UNITS / piece.aspect);
  if (!piece.setup) {
    piece.draw({ ...timeContext(piece, values, seed, t), g, state: undefined });
    return g.toString();
  }
  const fps = piece.animation?.fps ?? 60;
  const rng = createRng(seed);
  const noise = noiseFor(seed);
  const state = piece.setup(timeContext(piece, values, seed, 0, rng, noise));
  const target = Math.max(0, Math.round(t * fps));
  for (let f = 1; f <= target; f++) piece.step?.(state, timeContext(piece, values, seed, f / fps, rng, noise));
  piece.draw({ ...timeContext(piece, values, seed, target / fps, frameRng(seed, target), noise), g, state });
  return g.toString();
}
