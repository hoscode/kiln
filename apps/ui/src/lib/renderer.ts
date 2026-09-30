import type { Job, Request, Response } from './protocol';
import RenderWorker from './render.worker?worker';

interface Handlers {
  frame(bitmap: ImageBitmap, ms: number): void;
  error(message: string): void;
}

/**
 * Rendering off the main thread. Previews go to one long-lived worker with
 * latest-wins scheduling; each export gets its own worker so previews stay
 * live while a large image renders.
 */
export class Renderer {
  private previewWorker = new RenderWorker();
  private exporters = new Set<Worker>();
  private busy = false;
  private queued: Job | null = null;
  private nextId = 1;

  constructor(private handlers: Handlers) {
    this.previewWorker.onmessage = ({ data }: MessageEvent<Response>) => {
      this.busy = false;
      if (data.kind === 'preview') handlers.frame(data.bitmap, data.ms);
      else if (data.kind === 'error') handlers.error(data.message);
      this.pump();
    };
    this.previewWorker.onerror = (e) => {
      this.busy = false;
      handlers.error(e.message || 'Render worker failed to load (syntax error in a piece?)');
    };
  }

  /** While a frame renders, only the newest request is kept. */
  preview(job: Job) {
    this.queued = job;
    this.pump();
  }

  png(job: Job, onProgress?: (done: number, total: number) => void): Promise<Blob> {
    return this.oneShot<Blob>({ ...job, kind: 'png' }, onProgress);
  }

  svg(job: Job): Promise<string> {
    return this.oneShot<string>({ ...job, kind: 'svg' });
  }

  dispose() {
    this.previewWorker.terminate();
    for (const w of this.exporters) w.terminate();
  }

  private pump() {
    if (this.busy || !this.queued) return;
    const job = this.queued;
    this.queued = null;
    this.busy = true;
    this.previewWorker.postMessage({ ...job, id: this.nextId++, kind: 'preview' } satisfies Request);
  }

  private oneShot<T>(req: Omit<Request, 'id'>, onProgress?: (done: number, total: number) => void): Promise<T> {
    const worker = new RenderWorker();
    this.exporters.add(worker);
    const done = () => {
      worker.terminate();
      this.exporters.delete(worker);
    };
    return new Promise<T>((resolve, reject) => {
      worker.onmessage = ({ data }: MessageEvent<Response>) => {
        if (data.kind === 'progress') return onProgress?.(data.done, data.total);
        done();
        if (data.kind === 'png') resolve(data.blob as T);
        else if (data.kind === 'svg') resolve(data.svg as T);
        else if (data.kind === 'error') reject(new Error(data.message));
      };
      worker.onerror = (e) => {
        done();
        reject(new Error(e.message));
      };
      worker.postMessage({ ...req, id: this.nextId++ } satisfies Request);
    });
  }
}
