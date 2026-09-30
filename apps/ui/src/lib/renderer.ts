import type { Job, Quality, Request, Response, Result, VideoSettings } from './protocol';
import RenderWorker from './render.worker?worker';

interface Handlers {
  frame(bitmap: ImageBitmap, ms: number): void;
  error(message: string): void;
}

type Progress = (done: number, total: number) => void;

/**
 * Rendering off the main thread. Previews go to one long-lived worker with
 * latest-wins scheduling; each export gets its own worker so previews stay
 * live while a large image or video renders.
 */
export class Renderer {
  private previewWorker = new RenderWorker();
  private exporters = new Map<Worker, (e: Error) => void>();
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

  png(job: Job & Quality, onProgress?: Progress) {
    return this.oneShot({ ...job, kind: 'png' }, onProgress) as Promise<Extract<Result, { kind: 'png' }>>;
  }

  svg(job: Job) {
    return this.oneShot({ ...job, kind: 'svg' }) as Promise<Extract<Result, { kind: 'svg' }>>;
  }

  video(job: Job & VideoSettings, onProgress?: Progress) {
    return this.oneShot({ ...job, kind: 'video' }, onProgress) as Promise<Extract<Result, { kind: 'video' | 'frames' }>>;
  }

  /** Abort all running exports. */
  cancel() {
    for (const [worker, reject] of this.exporters) {
      worker.terminate();
      reject(new Error('Cancelled'));
    }
    this.exporters.clear();
  }

  dispose() {
    this.previewWorker.terminate();
    this.cancel();
  }

  private pump() {
    if (this.busy || !this.queued) return;
    const job = this.queued;
    this.queued = null;
    this.busy = true;
    this.previewWorker.postMessage({ ...job, id: this.nextId++, kind: 'preview' } satisfies Request);
  }

  private oneShot(req: Omit<Exclude<Request, { kind: 'preview' }>, 'id'>, onProgress?: Progress): Promise<Result> {
    const worker = new RenderWorker();
    return new Promise<Result>((resolve, reject) => {
      this.exporters.set(worker, reject);
      const done = () => {
        worker.terminate();
        this.exporters.delete(worker);
      };
      worker.onmessage = ({ data }: MessageEvent<Response>) => {
        if (data.kind === 'progress') return onProgress?.(data.done, data.total);
        done();
        if (data.kind === 'error') reject(new Error(data.message));
        else if (data.kind !== 'preview') resolve(data);
      };
      worker.onerror = (e) => {
        done();
        reject(new Error(e.message));
      };
      worker.postMessage({ ...req, id: this.nextId++ } as Request);
    });
  }
}
