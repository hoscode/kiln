// Messages between the UI and render workers.
import type { VideoCodec } from 'mediabunny';

export interface Job {
  pieceId: string;
  values: Record<string, unknown>;
  seed: number;
  pxWidth: number;
  /** Seconds. */
  t: number;
}

export interface Quality {
  /** Sub-frames per frame (motion blur + AA). */
  samples: number;
  shutter: number;
}

export interface VideoSettings extends Quality {
  fps: number;
  duration: number;
  format: 'mp4' | 'frames';
  codec: VideoCodec;
  bitrate: number;
  /** Folder name under renders/ for PNG sequences. */
  name: string;
}

export type Request =
  | (Job & { id: number; kind: 'preview' })
  | (Job & Quality & { id: number; kind: 'png' })
  | (Job & { id: number; kind: 'svg' })
  | (Job & VideoSettings & { id: number; kind: 'video' });

export type Response =
  | { id: number; kind: 'preview'; bitmap: ImageBitmap; ms: number }
  | { id: number; kind: 'png'; blob: Blob; ms: number }
  | { id: number; kind: 'svg'; svg: string; ms: number }
  | { id: number; kind: 'video'; blob: Blob; ms: number }
  | { id: number; kind: 'frames'; dir: string; count: number; ms: number }
  | { id: number; kind: 'progress'; done: number; total: number }
  | { id: number; kind: 'error'; message: string };

export type Result = Exclude<Response, { kind: 'progress' | 'error' | 'preview' }>;
