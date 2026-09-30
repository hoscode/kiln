import type { Session } from '../../../../engine2d';
import { renderToSvg } from '../../../../engine2d';
import { pieces } from '../../../../pieces';
import { createSession, is2D, renderFrames, renderPng, renderVideo, type KilnPiece } from '../../../../runtime';
import type { Request, Response } from './protocol';

// The tsconfig uses DOM types, so describe the worker scope we use.
const scope = self as unknown as {
  postMessage(msg: Response, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<Request>) => void) | null;
};

const byId = new Map(pieces.map((p) => [p.id, p]));

// Previews reuse one session: resizing reallocates, param changes just update.
let preview: { sizeKey: string; valueKey: string; session: Session } | undefined;

function previewSession(piece: KilnPiece, req: Request): Session {
  const width = Math.round(req.pxWidth);
  const height = Math.round(req.pxWidth / piece.aspect);
  const sizeKey = `${piece.id}:${width}x${height}`;
  const valueKey = JSON.stringify([req.values, req.seed]);
  if (preview?.sizeKey !== sizeKey) {
    preview?.session.dispose();
    preview = { sizeKey, valueKey, session: createSession(piece, req.values, req.seed, width, height) };
  } else if (preview.valueKey !== valueKey) {
    preview.session.update(req.values, req.seed);
    preview.valueKey = valueKey;
  }
  return preview.session;
}

scope.onmessage = async ({ data: req }) => {
  const { id } = req;
  const t0 = performance.now();
  const ms = () => performance.now() - t0;
  const onProgress = (done: number, total: number) => scope.postMessage({ id, kind: 'progress', done, total });
  try {
    const piece = byId.get(req.pieceId);
    if (!piece) throw new Error(`Unknown piece "${req.pieceId}"`);

    switch (req.kind) {
      case 'preview': {
        const session = previewSession(piece, req);
        session.render(req.t);
        const bitmap = await session.bitmap();
        scope.postMessage({ id, kind: 'preview', bitmap, ms: ms() }, [bitmap]);
        break;
      }
      case 'png': {
        const meta = { piece: piece.id, seed: req.seed, t: req.t, params: req.values };
        const blob = await renderPng(piece, req.values, req.seed, req.pxWidth, {
          t: req.t,
          samples: req.samples,
          shutter: req.shutter,
          text: { kiln: JSON.stringify(meta) },
          onProgress,
        });
        scope.postMessage({ id, kind: 'png', blob, ms: ms() });
        break;
      }
      case 'svg': {
        if (!is2D(piece)) throw new Error('Only 2D pieces have SVG output');
        scope.postMessage({ id, kind: 'svg', svg: renderToSvg(piece, req.values, req.seed, req.t), ms: ms() });
        break;
      }
      case 'video': {
        if (req.format === 'mp4') {
          const blob = await renderVideo(piece, req.values, req.seed, req.pxWidth, { ...req, onProgress });
          scope.postMessage({ id, kind: 'video', blob, ms: ms() });
        } else {
          const count = await renderFrames(piece, req.values, req.seed, req.pxWidth, { ...req, onProgress }, async (i, png) => {
            const res = await fetch(`/api/frames/${req.name}/${String(i).padStart(5, '0')}.png`, { method: 'PUT', body: png });
            if (!res.ok) throw new Error(`Saving frame ${i} failed: ${res.status} ${await res.text()}`);
          });
          scope.postMessage({ id, kind: 'frames', dir: `renders/${req.name}`, count, ms: ms() });
        }
        break;
      }
    }
  } catch (e) {
    scope.postMessage({ id, kind: 'error', message: e instanceof Error ? (e.stack ?? e.message) : String(e) });
  }
};
