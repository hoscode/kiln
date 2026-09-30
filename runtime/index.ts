// Engine-agnostic glue: any kiln piece → a Session → stills or video.
import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, type VideoCodec } from 'mediabunny';
import { Canvas2DSession, createPngWriter, type AnyPiece, type FrameOptions, type Session } from '../engine2d';
import { GLSession, SceneSession, type ScenePiece, type ShaderPiece } from '../enginegl';

type Values = Record<string, unknown>;

export type KilnPiece = AnyPiece | ShaderPiece | ScenePiece<any, any>;

export const isShader = (p: KilnPiece): p is ShaderPiece => p.engine === 'shader';
export const isScene = (p: KilnPiece): p is ScenePiece => p.engine === 'scene';
/** Canvas/SVG pieces — the only ones with vector output. */
export const is2D = (p: KilnPiece): p is AnyPiece => !p.engine || p.engine === '2d';

export function createSession(
  piece: KilnPiece,
  values: Values,
  seed: number,
  width: number,
  height: number,
  tileHeight = height,
): Session {
  if (isShader(piece)) return new GLSession(piece, values, seed, width, height, tileHeight);
  if (isScene(piece)) return new SceneSession(piece, values, seed, width, height, tileHeight);
  return new Canvas2DSession(piece as AnyPiece, values, seed, width, height, tileHeight);
}

export interface Progress {
  (done: number, total: number): void;
}

export interface StillOptions extends FrameOptions {
  t?: number;
  /** Text metadata embedded in the PNG. */
  text?: Record<string, string>;
  onProgress?: Progress;
  /** Largest strip to allocate; 16M pixels stays within Safari's canvas limit. */
  maxStripPixels?: number;
}

/**
 * PNG rendered in horizontal strips, so output size isn't limited by the
 * browser's maximum canvas size. Each strip re-renders the frame, which is
 * safe because rendering is deterministic.
 */
export async function renderPng(piece: KilnPiece, values: Values, seed: number, pxWidth: number, opts: StillOptions = {}) {
  const width = Math.round(pxWidth);
  const height = Math.round(pxWidth / piece.aspect);
  const stripH = Math.max(1, Math.min(height, Math.floor((opts.maxStripPixels ?? 16_000_000) / width)));
  const total = Math.ceil(height / stripH);
  const session = createSession(piece, values, seed, width, height, stripH);
  const png = createPngWriter(width, height, opts.text);
  try {
    for (let i = 0; i < total; i++) {
      const y = i * stripH;
      const rows = Math.min(stripH, height - y);
      session.render(opts.t ?? 0, opts, y);
      await png.writeRows(session.readRows(rows), rows);
      opts.onProgress?.(i + 1, total);
    }
  } finally {
    session.dispose();
  }
  return png.finish();
}

export interface VideoOptions extends FrameOptions {
  fps: number;
  duration: number;
  codec: VideoCodec;
  /** Bits per second. */
  bitrate: number;
  onProgress?: Progress;
}

/** Even dimensions (required by 4:2:0 video) for a given width and aspect. */
export function videoSize(pxWidth: number, aspect: number) {
  const even = (n: number) => Math.max(2, 2 * Math.round(n / 2));
  return { width: even(pxWidth), height: even(pxWidth / aspect) };
}

/** Frame times for an animation: loops stop one frame short so they wrap seamlessly. */
export function frameTimes(fps: number, duration: number) {
  const n = Math.max(1, Math.round(fps * duration));
  return Array.from({ length: n }, (_, i) => i / fps);
}

/**
 * Frame-exact MP4: every frame is rendered (with optional sub-frame motion
 * blur) no matter how long it takes, then encoded with WebCodecs.
 */
export async function renderVideo(piece: KilnPiece, values: Values, seed: number, pxWidth: number, opts: VideoOptions) {
  const { width, height } = videoSize(pxWidth, piece.aspect);
  const session = createSession(piece, values, seed, width, height);
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const source = new CanvasSource(session.canvas, { codec: opts.codec, bitrate: opts.bitrate, keyFrameInterval: 2 });
  output.addVideoTrack(source, { frameRate: opts.fps });
  const times = frameTimes(opts.fps, opts.duration);
  try {
    await output.start();
    for (let i = 0; i < times.length; i++) {
      session.render(times[i], opts);
      await source.add(times[i], 1 / opts.fps);
      opts.onProgress?.(i + 1, times.length);
    }
    await output.finalize();
  } catch (e) {
    await output.cancel().catch(() => {});
    throw e;
  } finally {
    session.dispose();
  }
  return new Blob([output.target.buffer!], { type: 'video/mp4' });
}

/**
 * Lossless PNG sequence, one file per frame, handed to `write` (the UI sends
 * them to the dev server, which saves to renders/<name>/). Master in ffmpeg,
 * e.g. ProRes: ffmpeg -framerate 60 -i %05d.png -c:v prores_ks -profile:v 3 out.mov
 */
export async function renderFrames(
  piece: KilnPiece,
  values: Values,
  seed: number,
  pxWidth: number,
  opts: Omit<VideoOptions, 'codec' | 'bitrate'>,
  write: (index: number, png: Blob) => Promise<void>,
) {
  const width = Math.round(pxWidth);
  const height = Math.round(pxWidth / piece.aspect);
  const session = createSession(piece, values, seed, width, height);
  const times = frameTimes(opts.fps, opts.duration);
  try {
    for (let i = 0; i < times.length; i++) {
      session.render(times[i], opts);
      const png = createPngWriter(width, height);
      await png.writeRows(session.readRows(height), height);
      await write(i, await png.finish());
      opts.onProgress?.(i + 1, times.length);
    }
  } finally {
    session.dispose();
  }
  return times.length;
}
