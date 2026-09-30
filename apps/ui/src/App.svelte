<script lang="ts">
  import { pieces } from '../../../pieces/2d';
  import { randomValues, renderToCanvas, renderToPng, renderToSvg, resolve } from '../../../engine2d';
  import ParamPanel from './lib/ParamPanel.svelte';
  import { download, load, save } from './lib/util';

  const EXPORT_SIZES = [2048, 4096, 8192, 16384];

  const saved = load();
  let pieceId = $state(saved.pieceId ?? pieces[0]?.id);
  let seeds: Record<string, number> = $state(saved.seeds ?? {});
  let stored: Record<string, Record<string, unknown>> = $state(saved.values ?? {});

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
    const p = piece, v = values, s = seed;
    if (!canvas || !stageW || !stageH) return;
    const pad = 64;
    const cssW = Math.max(120, Math.floor(Math.min(stageW - pad, (stageH - pad) * p.aspect)));
    const frame = requestAnimationFrame(() => {
      if (!canvas) return;
      const t0 = performance.now();
      try {
        renderToCanvas(p, v, s, canvas, cssW * devicePixelRatio);
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssW / p.aspect}px`;
        error = '';
      } catch (e) {
        error = e instanceof Error ? (e.stack ?? e.message) : String(e);
      }
      renderMs = performance.now() - t0;
    });
    return () => cancelAnimationFrame(frame);
  });

  async function exportPng() {
    busy = `Rendering ${exportW}px…`;
    await new Promise((r) => setTimeout(r, 30)); // let the status paint first
    try {
      const blob = await renderToPng(piece, values, seed, exportW);
      download(blob, `${piece.id}-${seed}-${exportW}.png`);
    } catch (e) {
      error = `PNG export failed at ${exportW}px (browser canvas limit?): ${e}`;
    } finally {
      busy = '';
    }
  }

  function exportSvg() {
    const svg = renderToSvg(piece, values, seed);
    download(new Blob([svg], { type: 'image/svg+xml' }), `${piece.id}-${seed}.svg`);
  }

  function onKey(e: KeyboardEvent) {
    const el = e.target as HTMLElement;
    if (el.matches('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowRight') setSeed(seed + 1);
    else if (e.key === 'ArrowLeft') setSeed(seed - 1);
    else if (e.key === 'r') setSeed(Math.floor(Math.random() * 1e6));
    else if (e.key === 'd') diceParams();
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
      <kbd>←</kbd><kbd>→</kbd> seed · <kbd>R</kbd> random seed · <kbd>D</kbd> dice params
    </footer>
  </aside>

  <main class="stage" bind:clientWidth={stageW} bind:clientHeight={stageH}>
    <canvas bind:this={canvas}></canvas>
    {#if error}<pre class="error">{error}</pre>{/if}
    <div class="status">
      {piece.title} · seed {seed} · {renderMs.toFixed(0)} ms{#if busy} · {busy}{/if}
    </div>
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
        <button onclick={exportSvg}>SVG</button>
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
    position: relative;
    display: grid;
    place-items: center;
    overflow: hidden;
    background: var(--stage);
  }
  canvas {
    box-shadow: 0 10px 40px rgb(0 0 0 / 0.35);
  }
  .status {
    position: absolute;
    bottom: 10px;
    left: 14px;
    font-size: 11px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .error {
    position: absolute;
    inset: auto 16px 36px;
    max-height: 40%;
    overflow: auto;
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
