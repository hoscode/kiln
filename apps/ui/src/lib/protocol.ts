// Messages between the UI and render workers.

export interface Job {
  pieceId: string;
  values: Record<string, unknown>;
  seed: number;
  pxWidth: number;
}

export type Request = Job & { id: number; kind: 'preview' | 'png' | 'svg' };

export type Response =
  | { id: number; kind: 'preview'; bitmap: ImageBitmap; ms: number }
  | { id: number; kind: 'png'; blob: Blob; ms: number }
  | { id: number; kind: 'svg'; svg: string; ms: number }
  | { id: number; kind: 'progress'; done: number; total: number }
  | { id: number; kind: 'error'; message: string };
