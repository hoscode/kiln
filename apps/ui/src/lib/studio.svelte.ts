// App state and actions, shared by every panel. Components read `studio.*`
// and call its methods instead of passing state through props.
import { randomValues, resolve } from '../../../../engine2d';
import { pieces } from '../../../../pieces';
import type { KilnPiece } from '../../../../runtime';
import { deleteSnapshot, listSnapshots, saveSnapshot, thumbnail, type Snapshot } from './gallery';
import type { Job } from './protocol';
import { Renderer } from './renderer';
import { load, readHash } from './util';

export type Mode = 'image' | 'video';

export const modeOf = (p: KilnPiece): Mode => (p.animation ? 'video' : 'image');

export interface Task {
  label: string;
  done: number;
  total: number;
  /** Seconds remaining, once there's enough progress to estimate. */
  eta?: number;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

class Studio {
  // --- selection & params (persisted) ---
  pieceByMode: Record<Mode, string | undefined> = $state({ image: undefined, video: undefined });
  mode: Mode = $state('image');
  seeds: Record<string, number> = $state({});
  stored: Record<string, Record<string, unknown>> = $state({});

  modePieces = $derived(pieces.filter((p) => modeOf(p) === this.mode));
  piece = $derived(this.modePieces.find((p) => p.id === this.pieceByMode[this.mode]) ?? this.modePieces[0] ?? pieces[0]);
  seed = $derived(this.seeds[this.piece.id] ?? 1);
  values = $derived(resolve(this.piece.params, this.stored[this.piece.id]));
  anim = $derived(this.piece.animation);

  // --- playback ---
  time = $state(0);
  playing = $state(false);
  liveFps = $state(0);
  renderMs = $state(0);

  // --- feedback ---
  task: Task | null = $state(null);
  error = $state('');
  notice = $state('');

  // --- gallery ---
  snapshots: Snapshot[] = $state([]);
  pieceSnapshots = $derived(this.snapshots.filter((s) => s.pieceId === this.piece.id));

  /** Stage installs this to receive preview frames. */
  frameSink: ((bitmap: ImageBitmap) => void) | null = null;
  /** Stage's canvas, for gallery thumbnails. */
  canvas: HTMLCanvasElement | null = null;

  readonly renderer = new Renderer({
    frame: (bitmap, ms) => {
      if (this.frameSink) this.frameSink(bitmap);
      else bitmap.close();
      this.renderMs = ms;
      this.error = '';
    },
    error: (message) => (this.error = message),
  });

  constructor() {
    // URL hash wins over saved state, so shared links open exactly.
    const saved = load();
    const linked = readHash();
    this.pieceByMode = { image: undefined, video: undefined, ...saved.pieceByMode };
    this.seeds = { ...saved.seeds };
    this.stored = { ...saved.values };
    this.mode = saved.mode ?? 'image';

    const linkedPiece = pieces.find((p) => p.id === linked.pieceId);
    if (linkedPiece) {
      this.mode = modeOf(linkedPiece);
      this.pieceByMode[this.mode] = linkedPiece.id;
      if (linked.seed !== undefined) this.seeds[linkedPiece.id] = linked.seed;
      if (linked.values) this.stored[linkedPiece.id] = linked.values;
    }
    this.playing = this.mode === 'video';

    listSnapshots()
      .then((s) => (this.snapshots = s))
      .catch(() => {}); // no gallery API outside the dev server
  }

  // --- selection ---

  setMode(mode: Mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.time = 0;
    this.playing = mode === 'video';
  }

  selectPiece(id: string) {
    const p = pieces.find((x) => x.id === id);
    if (!p) return;
    this.mode = modeOf(p);
    this.pieceByMode[this.mode] = id;
    this.time = 0;
    this.playing = !!p.animation;
  }

  setSeed(s: number) {
    this.seeds[this.piece.id] = Math.max(0, Math.floor(s) || 0);
  }

  randomSeed() {
    this.setSeed(Math.floor(Math.random() * 1e6));
  }

  setParam(key: string, value: unknown) {
    this.stored[this.piece.id] = { ...this.stored[this.piece.id], [key]: value };
  }

  resetParams() {
    delete this.stored[this.piece.id];
  }

  diceParams() {
    this.stored[this.piece.id] = randomValues(this.piece.params);
  }

  // --- playback ---

  togglePlay() {
    if (this.anim) this.playing = !this.playing;
  }

  seek(t: number) {
    this.playing = false;
    this.time = Math.min(this.anim?.duration ?? 0, Math.max(0, t));
  }

  stepFrame(n: number) {
    if (this.anim) this.seek(Math.round(this.time * this.anim.fps + n) / this.anim.fps);
  }

  // --- rendering ---

  job(pxWidth: number, t = this.time): Job {
    return { pieceId: this.piece.id, values: $state.snapshot(this.values), seed: this.seed, pxWidth, t };
  }

  /** Run one export at a time with progress, ETA, cancel and error reporting. */
  async run<T>(label: string, fn: (progress: (done: number, total: number) => void) => Promise<T>): Promise<T | undefined> {
    if (this.task) return;
    const started = performance.now();
    this.task = { label, done: 0, total: 0 };
    this.notice = '';
    try {
      return await fn((done, total) => {
        const eta = done > 0 ? ((performance.now() - started) / done) * (total - done) / 1000 : undefined;
        this.task = { label, done, total, eta };
      });
    } catch (e) {
      if (errorText(e) !== 'Cancelled') this.error = `${label} failed: ${errorText(e)}`;
    } finally {
      this.task = null;
    }
  }

  cancel() {
    this.renderer.cancel();
  }

  // --- gallery ---

  async saveSnapshot() {
    if (!this.canvas) return;
    try {
      const snap = await saveSnapshot({ pieceId: this.piece.id, seed: this.seed, values: $state.snapshot(this.values) }, thumbnail(this.canvas));
      this.snapshots = [snap, ...this.snapshots];
    } catch (e) {
      this.error = `Save failed: ${errorText(e)}`;
    }
  }

  restore(s: Snapshot) {
    this.selectPiece(s.pieceId);
    this.seeds[s.pieceId] = s.seed;
    this.stored[s.pieceId] = { ...s.values };
  }

  async removeSnapshot(s: Snapshot) {
    await deleteSnapshot(s.id).catch((e) => (this.error = errorText(e)));
    this.snapshots = this.snapshots.filter((x) => x.id !== s.id);
  }
}

export const studio = new Studio();

if (import.meta.hot) import.meta.hot.dispose(() => studio.renderer.dispose());
