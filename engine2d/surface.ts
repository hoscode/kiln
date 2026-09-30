// A drawing surface in abstract units. Pieces draw through this interface, so
// the same code renders to a canvas at any resolution or to SVG (plotters).
import type { Vec2 } from './geom';
import { createRng } from './prng';

export type Blend = 'source-over' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'soft-light' | 'lighter';

export interface Style {
  fill?: string;
  stroke?: string;
  width?: number;
  alpha?: number;
  blend?: Blend;
  cap?: CanvasLineCap;
  join?: CanvasLineJoin;
}

/** A clip region is the union of circles and polygons. */
export type ClipShape = { x: number; y: number; r: number } | readonly Vec2[];

export interface Surface {
  readonly width: number;
  readonly height: number;
  background(color: string): void;
  path(points: readonly Vec2[], style: Style, closed?: boolean): void;
  circle(x: number, y: number, r: number, style: Style): void;
  /** Many line segments in one stroke: [x0, y0, x1, y1, x0, y0, …]. Fast for particles. */
  segments(coords: ArrayLike<number>, style: Style): void;
  /** Draw inside the union of shapes only. */
  clip(shapes: readonly ClipShape[], draw: () => void): void;
  /** Film/paper grain. Raster only; a no-op in SVG. */
  grain(amount: number): void;
}

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export class CanvasSurface implements Surface {
  constructor(
    private ctx: Ctx2D,
    readonly width: number,
    readonly height: number,
    private seed: number,
    /** Full image width in pixels; differs from the canvas when rendering a strip. */
    private pxWidth = ctx.canvas.width,
    /** Pixel row of the full image at this canvas's top edge. */
    private offsetY = 0,
    /** Animation frame; moves the grain so it shimmers like film instead of sitting on the glass. */
    private frame = 0,
  ) {
    const scale = pxWidth / width;
    ctx.setTransform(scale, 0, 0, scale, 0, -offsetY);
  }

  background(color: string) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  path(points: readonly Vec2[], style: Style, closed = false) {
    if (points.length < 2) return;
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    if (closed) ctx.closePath();
    this.paint(style);
  }

  circle(x: number, y: number, r: number, style: Style) {
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, 0, Math.PI * 2);
    this.paint(style);
  }

  segments(coords: ArrayLike<number>, style: Style) {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let i = 0; i + 3 < coords.length; i += 4) {
      ctx.moveTo(coords[i], coords[i + 1]);
      ctx.lineTo(coords[i + 2], coords[i + 3]);
    }
    this.paint(style);
  }

  clip(shapes: readonly ClipShape[], draw: () => void) {
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    for (const s of shapes) {
      if (isPoly(s)) {
        if (s.length < 3) continue;
        ctx.moveTo(s[0][0], s[0][1]);
        for (let i = 1; i < s.length; i++) ctx.lineTo(s[i][0], s[i][1]);
        ctx.closePath();
      } else {
        ctx.moveTo(s.x + s.r, s.y);
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      }
    }
    ctx.clip();
    draw();
    ctx.restore();
  }

  grain(amount: number) {
    if (amount <= 0) return;
    const ctx = this.ctx;
    const pattern = ctx.createPattern(grainTile(this.seed), 'repeat');
    if (!pattern) return;
    const { width, height } = ctx.canvas;
    // Keep grain a similar visual size between preview and large exports,
    // and aligned across strips.
    const jx = this.frame ? (this.frame * 211) % 512 : 0;
    const jy = this.frame ? (this.frame * 331) % 512 : 0;
    const k = Math.max(1, this.pxWidth / 1600);
    pattern.setTransform(new DOMMatrix().translate(-jx * k, -this.offsetY - jy * k).scale(k));
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = amount;
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  private paint(s: Style) {
    const ctx = this.ctx;
    ctx.globalAlpha = s.alpha ?? 1;
    ctx.globalCompositeOperation = s.blend ?? 'source-over';
    if (s.fill) {
      ctx.fillStyle = s.fill;
      ctx.fill();
    }
    if (s.stroke) {
      ctx.strokeStyle = s.stroke;
      ctx.lineWidth = s.width ?? 1;
      ctx.lineCap = s.cap ?? 'round';
      ctx.lineJoin = s.join ?? 'round';
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

const isPoly = (s: ClipShape): s is readonly Vec2[] => Array.isArray(s);

let grainCache: { seed: number; tile: OffscreenCanvas } | undefined;

function grainTile(seed: number): OffscreenCanvas {
  if (grainCache?.seed === seed) return grainCache.tile;
  const size = 512;
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const rng = createRng(seed ^ 0xa5a5a5a5);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (rng() + rng() + rng() - 1.5) * 150;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  grainCache = { seed, tile: canvas };
  return canvas;
}

const f = (n: number) => String(Math.round(n * 100) / 100);

export class SvgSurface implements Surface {
  private els: string[] = [];
  private clipId = 0;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {}

  background(color: string) {
    this.els.push(`<rect width="${f(this.width)}" height="${f(this.height)}" fill="${color}"/>`);
  }

  path(points: readonly Vec2[], style: Style, closed = false) {
    if (points.length < 2) return;
    let d = `M${f(points[0][0])} ${f(points[0][1])}`;
    for (let i = 1; i < points.length; i++) d += `L${f(points[i][0])} ${f(points[i][1])}`;
    if (closed) d += 'Z';
    this.els.push(`<path d="${d}"${attrs(style)}/>`);
  }

  circle(x: number, y: number, r: number, style: Style) {
    this.els.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}"${attrs(style)}/>`);
  }

  segments(coords: ArrayLike<number>, style: Style) {
    let d = '';
    for (let i = 0; i + 3 < coords.length; i += 4)
      d += `M${f(coords[i])} ${f(coords[i + 1])}L${f(coords[i + 2])} ${f(coords[i + 3])}`;
    if (d) this.els.push(`<path d="${d}"${attrs(style)}/>`);
  }

  clip(shapes: readonly ClipShape[], draw: () => void) {
    const id = `clip${this.clipId++}`;
    const defs = shapes
      .map((s) =>
        isPoly(s)
          ? `<path d="M${s.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z"/>`
          : `<circle cx="${f(s.x)}" cy="${f(s.y)}" r="${f(s.r)}"/>`,
      )
      .join('');
    this.els.push(`<clipPath id="${id}">${defs}</clipPath><g clip-path="url(#${id})">`);
    draw();
    this.els.push('</g>');
  }

  grain() {}

  toString() {
    const w = f(this.width), h = f(this.height);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">\n${this.els.join('\n')}\n</svg>\n`;
  }
}

function attrs(s: Style): string {
  let a = ` fill="${s.fill ?? 'none'}"`;
  if (s.stroke) {
    a += ` stroke="${s.stroke}" stroke-width="${f(s.width ?? 1)}"`;
    a += ` stroke-linecap="${s.cap ?? 'round'}" stroke-linejoin="${s.join ?? 'round'}"`;
  }
  if (s.alpha !== undefined && s.alpha < 1) a += ` opacity="${Math.round(s.alpha * 1e4) / 1e4}"`;
  if (s.blend && s.blend !== 'source-over')
    a += ` style="mix-blend-mode:${s.blend === 'lighter' ? 'plus-lighter' : s.blend}"`;
  return a;
}
