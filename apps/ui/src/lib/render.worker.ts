import { renderPng, renderToCanvas, renderToSvg } from '../../../../engine2d';
import { pieces } from '../../../../pieces/2d';
import type { Request, Response } from './protocol';

// The tsconfig uses DOM types, so describe the worker scope we use.
const scope = self as unknown as {
  postMessage(msg: Response, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<Request>) => void) | null;
};

const byId = new Map(pieces.map((p) => [p.id, p]));
let canvas: OffscreenCanvas | undefined;

scope.onmessage = async ({ data: req }) => {
  const { id } = req;
  const t0 = performance.now();
  try {
    const piece = byId.get(req.pieceId);
    if (!piece) throw new Error(`Unknown piece "${req.pieceId}"`);

    if (req.kind === 'preview') {
      canvas ??= new OffscreenCanvas(1, 1);
      renderToCanvas(piece, req.values, req.seed, canvas, req.pxWidth);
      const bitmap = canvas.transferToImageBitmap();
      scope.postMessage({ id, kind: 'preview', bitmap, ms: performance.now() - t0 }, [bitmap]);
    } else if (req.kind === 'png') {
      const blob = await renderPng(piece, req.values, req.seed, req.pxWidth, {
        text: { kiln: JSON.stringify({ piece: piece.id, seed: req.seed, params: req.values }) },
        onProgress: (done, total) => scope.postMessage({ id, kind: 'progress', done, total }),
      });
      scope.postMessage({ id, kind: 'png', blob, ms: performance.now() - t0 });
    } else {
      const svg = renderToSvg(piece, req.values, req.seed);
      scope.postMessage({ id, kind: 'svg', svg, ms: performance.now() - t0 });
    }
  } catch (e) {
    scope.postMessage({ id, kind: 'error', message: e instanceof Error ? (e.stack ?? e.message) : String(e) });
  }
};
