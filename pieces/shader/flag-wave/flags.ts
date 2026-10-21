// Flag artwork, drawn to a canvas that the shader samples as cloth colour.
// Add a flag with an SVG (any country from the flag-icons package, or your
// own) or a draw function; the shader reads the flag's proportions from the
// texture size.
import de from 'flag-icons/flags/4x3/de.svg?raw';
import es from 'flag-icons/flags/4x3/es.svg?raw';
import fr from 'flag-icons/flags/4x3/fr.svg?raw';
import it from 'flag-icons/flags/4x3/it.svg?raw';
import jp from 'flag-icons/flags/4x3/jp.svg?raw';
import ua from 'flag-icons/flags/4x3/ua.svg?raw';
import { drawSvg, parseSvg } from './svg';

export interface Flag {
  name: string;
  /** Width / height of the real flag. */
  ratio: number;
  /** Artwork, stretched to the flag's proportions… */
  svg?: string;
  /**
   * …except an emblem, kept undistorted: the art is scaled to the flag's
   * height and shifted so its x = `cx` (in SVG units) lands at `at` × width,
   * over the stretched copy, which supplies the background bands.
   */
  emblem?: { cx: number; at: number };
  /** Or draw it yourself, in pixels. */
  draw?: (ctx: OffscreenCanvasRenderingContext2D, w: number, h: number) => void;
}

export const flags = {
  es: { name: 'Spain', ratio: 3 / 2, svg: es, emblem: { cx: 206.3, at: 1 / 3 } },
  fr: { name: 'France', ratio: 3 / 2, svg: fr },
  it: { name: 'Italy', ratio: 3 / 2, svg: it },
  de: { name: 'Germany', ratio: 5 / 3, svg: de },
  ua: { name: 'Ukraine', ratio: 3 / 2, svg: ua },
  jp: { name: 'Japan', ratio: 3 / 2, svg: jp, emblem: { cx: 320, at: 1 / 2 } },
} satisfies Record<string, Flag>;

export type FlagCode = keyof typeof flags;
export const flagCodes = Object.keys(flags) as FlagCode[];

const cache = new Map<string, OffscreenCanvas>();

/** The flag drawn `width` pixels wide (memoized, so the GPU upload happens once). */
export function flagCanvas(flag: Flag, width = 2048): OffscreenCanvas {
  const key = `${flag.name}:${width}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const w = width;
  const h = Math.round(width / flag.ratio);
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  if (flag.draw) flag.draw(ctx, w, h);
  if (flag.svg) {
    const svg = parseSvg(flag.svg);
    drawSvg(ctx, svg, 0, 0, w, h);
    if (flag.emblem) {
      const [, , vw, vh] = (svg.attrs.viewBox ?? '0 0 640 480').split(/[\s,]+/).map(Number);
      const s = h / vh;
      drawSvg(ctx, svg, flag.emblem.at * w - flag.emblem.cx * s, 0, vw * s, h);
    }
  }
  cache.set(key, canvas);
  return canvas;
}
