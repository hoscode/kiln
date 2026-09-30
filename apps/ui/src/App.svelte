<script lang="ts">
  import { onDestroy } from 'svelte';
  import { pieces } from '../../../pieces/2d';
  import { randomValues, resolve } from '../../../engine2d';
  import Gallery from './lib/Gallery.svelte';
  import { deleteSnapshot, listSnapshots, saveSnapshot, thumbnail, type Snapshot } from './lib/gallery';
  import ParamPanel from './lib/ParamPanel.svelte';
  import type { Job } from './lib/protocol';
  import { Renderer } from './lib/renderer';
  import { download, load, readHash, save, writeHash } from './lib/util';

  const EXPORT_SIZES = [2048, 4096, 8192, 16384];

  // URL hash wins over saved state, so shared links open exactly.
  const saved = load();
  const linked = readHash();
  let pieceId = $state(linked.pieceId ?? saved.pieceId ?? pieces[0]?.id);
  let seeds: Record<string, number> = $state({ ...saved.seeds });
  let stored: Record<string, Record<string, unknown>> = $state({ ...saved.values });
  if (linked.pieceId && linked.seed !== undefined) seeds[linked.pieceId] = linked.seed;
  if (linked.pieceId && linked.values) stored[linked.pieceId] = linked.values;

  const piece = $derived(pieces.find((p) => p.id === pieceId) ?? pieces[0]);
  const seed = $derived(seeds[piece.id] ?? 1);
  const values = $derived(resolve(piece.params, stored[piece.id]));

  let canvas: HTMLCanvasElement | undefined = $state();
  let stageW = $state(0);
  let stageH = $state(0);
  let renderMs = $state(0);
  let error = $state('');
  let exportW = $state(4096);
  let busy = $state('');
  let snapshots: Snapshot[] = $state([]);
  const pieceSnapshots = $derived(snapshots.filter((s) => s.pieceId === piece.id));

  let bitmapCtx: ImageBitmapRenderingContext | null = null;
  const renderer = new Renderer({
    frame(bitmap, ms) {
      if (!canvas) return bitmap.close();
      bitmapCtx ??= canvas.getContext('bitmaprenderer');
      canvas.style.width = `${bitmap.width / devicePixelRatio}px`;
      canvas.style.height = `${bitmap.height / devicePixelRatio}px`;
      bitmapCtx?.transferFromImageBitmap(bitmap);
      renderMs = ms;
      error = '';
    },
    error(message) {
      error = message;
    },
  });
  onDestroy(() => renderer.dispose());

  listSnapshots()
    .then((s) => (snapshots = s))
    .catch(() => {}); // no gallery API outside the dev server

  function job(pxWidth: number): Job {
    return { pieceId: piece.id, values: $state.snapshot(values), seed, pxWidth };
  }

  function setSeed(s: number) {
    seeds[piece.id] = Math.max(0, Math.floor(s) || 0);
  }
  function setParam(key: string, value: unknown) {
    stored[piece.id] = { ...stored[piece.id], [key]: value };
  }
  function resetParams() {
    delete stored[piece.id];
  }
  function diceParams() {
    stored[piece.id] = randomValues(piece.params);
  }

  $effect(() => {
    save({ pieceId, seeds: $state.snapshot(seeds), values: $state.snapshot(stored) });
  });

  $effect(() => {
    writeHash(piece.id, seed, $state.snapshot(stored[piece.id]));
  });

  $effect(() => {
    if (!stageW || !stageH) return;
    const pad = 48;
    const cssW = Math.max(120, Math.floor(Math.min(stageW - pad, (stageH - pad) * piece.aspect)));
    renderer.preview(job(Math.round(cssW * devicePixelRatio)));
  });

  async function exportPng() {
    const w = exportW;
    busy = `PNG ${w}px…`;
    try {
      const blob = await renderer.png(job(w), (done, total) => (busy = `PNG ${w}px · strip ${done}/${total}`));
      download(blob, `${piece.id}-${seed}-${w}.png`);
    } catch (e) {
      error = `PNG export failed: ${e instanceof Error ? e.message : e}`;
    } finally {
      busy = '';
    }
  }

  async function exportSvg() {
    busy = 'SVG…';
    try {
      const svg = await renderer.svg(job(0));
      download(new Blob([svg], { type: 'image/svg+xml' }), `${piece.id}-${seed}.svg`);
    } catch (e) {
      error = `SVG export failed: ${e instanceof Error ? e.message : e}`;
    } finally {
      busy = '';
    }
  }

  async function saveCurrent() {
    if (!canvas) return;
    try {
      const snap = await saveSnapshot({ pieceId: piece.id, seed, values: $state.snapshot(values) }, thumbnail(canvas));
      snapshots = [snap, ...snapshots];
    } catch (e) {
      error = `Save failed: ${e instanceof Error ? e.message : e}`;
    }
  }

  function restore(s: Snapshot) {
    pieceId = s.pieceId;
    seeds[s.pieceId] = s.seed;
    stored[s.pieceId] = { ...s.values };
  }

  async function removeSnapshot(s: Snapshot) {
    await deleteSnapshot(s.id).catch((e) => (error = String(e)));
    snapshots = snapshots.filter((x) => x.id !== s.id);
  }

  function onKey(e: KeyboardEvent) {
    const el = e.target as HTMLElement;
    if (el.matches('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowRight') setSeed(seed + 1);
    else if (e.key === 'ArrowLeft') setSeed(seed - 1);
    else if (e.key === 'r') setSeed(Math.floor(Math.random() * 1e6));
    else if (e.key === 'd') diceParams();
    else if (e.key === 's') saveCurrent();
    else return;
    e.preventDefault();
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="app">
  <aside class="side">
    <h1>kiln</h1>
    <nav>
      {#each pieces as p (p.id)}
        <button class:active={p.id === piece.id} onclick={() => (pieceId = p.id)}>
          <span>{p.title}</span>
          {#if p.tags}<small>{p.tags.join(' · ')}</small>{/if}
        </button>
      {/each}
    </nav>
    <footer>
      <kbd>←</kbd><kbd>→</kbd> seed · <kbd>R</kbd> random seed<br />
      <kbd>D</kbd> dice params · <kbd>S</kbd> save
    </footer>
  </aside>

  <main class="stage">
    <div class="view" bind:clientWidth={stageW} bind:clientHeight={stageH}>
      <canvas bind:this={canvas}></canvas>
      <div class="status">
        {piece.title} · seed {seed} · {renderMs.toFixed(0)} ms{#if busy} · {busy}{/if}
      </div>
      {#if error}<pre class="error">{error}</pre>{/if}
    </div>
    <Gallery items={pieceSnapshots} onselect={restore} ondelete={removeSnapshot} />
  </main>

  <aside class="panel">
    <section>
      <h2>Seed</h2>
      <div class="seed">
        <button onclick={() => setSeed(seed - 1)} aria-label="Previous seed">‹</button>
        <input type="number" min="0" value={seed} onchange={(e) => setSeed(Number(e.currentTarget.value))} />
        <button onclick={() => setSeed(seed + 1)} aria-label="Next seed">›</button>
        <button onclick={() => setSeed(Math.floor(Math.random() * 1e6))}>Random</button>
      </div>
    </section>

    <section>
      <div class="head">
        <h2>Parameters</h2>
        <span>
          <button class="ghost" onclick={diceParams}>Dice</button>
          <button class="ghost" onclick={resetParams}>Reset</button>
        </span>
      </div>
      <ParamPanel schema={piece.params} {values} onchange={setParam} />
    </section>

    <section>
      <h2>Export</h2>
      <div class="export">
        <select bind:value={exportW}>
          {#each EXPORT_SIZES as w (w)}<option value={w}>{w}px</option>{/each}
        </select>
        <button onclick={exportPng} disabled={!!busy}>PNG</button>
        <button onclick={exportSvg} disabled={!!busy}>SVG</button>
        <button onclick={saveCurrent}>Save</button>
      </div>
    </section>
  </aside>
</div>

<style>
  .app {
    display: grid;
    grid-template-columns: 200px 1fr 320px;
    height: 100vh;
  }
  .side,
  .panel {
    background: var(--panel);
    border-color: var(--border);
    overflow-y: auto;
  }
  .side {
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    padding: 16px 10px;
  }
  .panel {
    border-left: 1px solid var(--border);
    padding: 16px;
    display: grid;
    align-content: start;
    gap: 22px;
  }
  h1 {
    font-size: 15px;
    letter-spacing: 0.08em;
    margin: 0 6px 16px;
  }
  h2 {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--muted);
    margin: 0 0 10px;
    font-weight: 600;
  }
  nav {
    display: grid;
    gap: 2px;
  }
  nav button {
    all: unset;
    cursor: pointer;
    padding: 8px 10px;
    border-radius: 8px;
    display: grid;
    gap: 2px;
  }
  nav button:hover {
    background: var(--hover);
  }
  nav button.active {
    background: var(--active);
  }
  nav small {
    color: var(--muted);
    font-size: 11px;
  }
  footer {
    margin-top: auto;
    font-size: 11px;
    color: var(--muted);
    line-height: 1.9;
    padding: 0 6px;
  }
  kbd {
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0 4px;
    font-family: inherit;
  }
  .stage {
    display: grid;
    grid-template-rows: 1fr auto;
    min-width: 0;
    min-height: 0;
    background: var(--stage);
  }
  .view {
    position: relative;
    display: grid;
    place-items: center;
    overflow: hidden;
    min-height: 0;
  }
  canvas {
    box-shadow: 0 10px 40px rgb(0 0 0 / 0.35);
  }
  .status {
    position: absolute;
    top: 10px;
    left: 14px;
    font-size: 11px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .error {
    position: absolute;
    inset: auto 16px 16px;
    max-height: 40%;
    overflow: auto;
    margin: 0;
    background: var(--error-bg);
    color: var(--error);
    padding: 12px;
    border-radius: 8px;
    font-size: 12px;
    white-space: pre-wrap;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .seed,
  .export {
    display: flex;
    gap: 6px;
  }
  .seed input {
    width: 0;
    flex: 1;
  }
  .export select {
    flex: 1;
  }
</style>
