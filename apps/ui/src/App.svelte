<script lang="ts">
  import { canEncodeVideo, type VideoCodec } from 'mediabunny';
  import { onDestroy } from 'svelte';
  import { randomValues, resolve } from '../../../engine2d';
  import { pieces } from '../../../pieces';
  import { isShader, videoSize } from '../../../runtime';
  import Gallery from './lib/Gallery.svelte';
  import { deleteSnapshot, listSnapshots, saveSnapshot, thumbnail, type Snapshot } from './lib/gallery';
  import ParamPanel from './lib/ParamPanel.svelte';
  import type { Job } from './lib/protocol';
  import { Renderer } from './lib/renderer';
  import Transport from './lib/Transport.svelte';
  import { download, load, readHash, save, writeHash } from './lib/util';

  const EXPORT_SIZES = [2048, 4096, 8192, 16384];
  const VIDEO_SIZES = [1280, 1920, 2560, 3840];
  const VIDEO_FORMATS: { value: VideoCodec | 'frames'; label: string }[] = [
    { value: 'avc', label: 'MP4 · H.264' },
    { value: 'hevc', label: 'MP4 · HEVC' },
    { value: 'av1', label: 'MP4 · AV1' },
    { value: 'frames', label: 'PNG frames' },
  ];
  /** Mbps at 1080p60; scaled by pixel count and frame rate. */
  const QUALITIES = { good: 16, high: 32, max: 64 } as const;
  const SAMPLES = [1, 4, 8, 16, 32];

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
  let notice = $state('');
  let snapshots: Snapshot[] = $state([]);
  const pieceSnapshots = $derived(snapshots.filter((s) => s.pieceId === piece.id));

  // Animation
  const anim = $derived(piece.animation);
  let time = $state(0);
  let playing = $state(!!pieces.find((p) => p.id === pieceId)?.animation);
  let liveFps = $state(0);
  let samples = $state(8);
  let shutter = $state(0.5);
  let videoW = $state(1920);
  let videoFormat: VideoCodec | 'frames' = $state('avc');
  let quality: keyof typeof QUALITIES = $state('high');
  let codecOk = $state(true);

  let bitmapCtx: ImageBitmapRenderingContext | null = null;
  let fpsCount = 0;
  let fpsSince = performance.now();
  const renderer = new Renderer({
    frame(bitmap, ms) {
      if (!canvas) return bitmap.close();
      bitmapCtx ??= canvas.getContext('bitmaprenderer');
      canvas.style.width = `${bitmap.width / devicePixelRatio}px`;
      canvas.style.height = `${bitmap.height / devicePixelRatio}px`;
      bitmapCtx?.transferFromImageBitmap(bitmap);
      renderMs = ms;
      error = '';
      fpsCount++;
      const now = performance.now();
      if (now - fpsSince >= 500) {
        liveFps = (fpsCount * 1000) / (now - fpsSince);
        fpsCount = 0;
        fpsSince = now;
      }
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
    return { pieceId: piece.id, values: $state.snapshot(values), seed, pxWidth, t: time };
  }

  function selectPiece(id: string) {
    pieceId = id;
    time = 0;
    playing = !!pieces.find((p) => p.id === id)?.animation;
  }

  function seek(t: number) {
    playing = false;
    time = Math.min(anim?.duration ?? 0, Math.max(0, t));
  }

  function stepFrame(n: number) {
    if (anim) seek(Math.round(time * anim.fps + n) / anim.fps);
  }

  function bitrate(width: number, height: number) {
    return QUALITIES[quality] * 1e6 * ((width * height) / (1920 * 1080)) * ((anim?.fps ?? 60) / 60);
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

  // Playback clock. Rendering is latest-wins, so slow pieces drop preview
  // frames but stay in time; exports are always frame-exact.
  $effect(() => {
    const a = anim;
    if (!playing || !a) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      let next = time + (now - last) / 1000;
      last = now;
      if (next >= a.duration) {
        if (a.loop) next %= a.duration;
        else {
          next = a.duration;
          playing = false;
        }
      }
      time = next;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  $effect(() => {
    const format = videoFormat;
    if (!anim || format === 'frames') {
      codecOk = true;
      return;
    }
    const { width, height } = videoSize(videoW, piece.aspect);
    let alive = true;
    canEncodeVideo(format, { width, height, bitrate: bitrate(width, height) })
      .then((ok) => alive && (codecOk = ok))
      .catch(() => alive && (codecOk = false));
    return () => {
      alive = false;
    };
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
      const { blob } = await renderer.png(
        { ...job(w), samples: anim ? samples : 1, shutter },
        (done, total) => (busy = `PNG ${w}px · strip ${done}/${total}`),
      );
      const frame = anim ? `-f${Math.round(time * anim.fps)}` : '';
      download(blob, `${piece.id}-${seed}${frame}-${w}.png`);
    } catch (e) {
      error = `PNG export failed: ${e instanceof Error ? e.message : e}`;
    } finally {
      busy = '';
    }
  }

  async function exportSvg() {
    busy = 'SVG…';
    try {
      const { svg } = await renderer.svg(job(0));
      download(new Blob([svg], { type: 'image/svg+xml' }), `${piece.id}-${seed}.svg`);
    } catch (e) {
      error = `SVG export failed: ${e instanceof Error ? e.message : e}`;
    } finally {
      busy = '';
    }
  }

  async function exportVideo() {
    if (!anim) return;
    const format = videoFormat;
    const { width, height } = videoSize(videoW, piece.aspect);
    const name = `${piece.id}-${seed}-${Date.now().toString(36)}`;
    const started = performance.now();
    busy = 'Video…';
    notice = '';
    try {
      const res = await renderer.video(
        {
          ...job(videoW),
          t: 0,
          fps: anim.fps,
          duration: anim.duration,
          samples,
          shutter,
          format: format === 'frames' ? 'frames' : 'mp4',
          codec: format === 'frames' ? 'avc' : format,
          bitrate: bitrate(width, height),
          name,
        },
        (done, total) => {
          const left = ((performance.now() - started) / done) * (total - done);
          busy = `Video · frame ${done}/${total} · ~${Math.ceil(left / 1000)}s left`;
        },
      );
      if (res.kind === 'video') download(res.blob, `${name}.mp4`);
      else
        notice = `Saved ${res.count} frames to ${res.dir}/. ProRes master:\nffmpeg -framerate ${anim.fps} -i ${res.dir}/%05d.png -c:v prores_ks -profile:v 3 ${name}.mov`;
    } catch (e) {
      if (!(e instanceof Error && e.message === 'Cancelled')) error = `Video export failed: ${e instanceof Error ? e.message : e}`;
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
    selectPiece(s.pieceId);
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
    else if (e.key === ' ' && anim) playing = !playing;
    else if (e.key === ',') stepFrame(-1);
    else if (e.key === '.') stepFrame(1);
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
        <button class:active={p.id === piece.id} onclick={() => selectPiece(p.id)}>
          <span>{p.title}</span>
          {#if p.tags}<small>{p.tags.join(' · ')}</small>{/if}
        </button>
      {/each}
    </nav>
    <footer>
      <kbd>←</kbd><kbd>→</kbd> seed · <kbd>R</kbd> random seed<br />
      <kbd>D</kbd> dice params · <kbd>S</kbd> save<br />
      <kbd>Space</kbd> play · <kbd>,</kbd><kbd>.</kbd> frame
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
    {#if anim}
      <Transport
        {time}
        duration={anim.duration}
        fps={anim.fps}
        loop={!!anim.loop}
        {playing}
        {liveFps}
        ontoggle={() => (playing = !playing)}
        onseek={seek}
      />
    {/if}
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

    {#if anim}
      <section>
        <h2>Motion blur</h2>
        <div class="grid">
          <span>Samples</span>
          <select bind:value={samples}>
            {#each SAMPLES as n (n)}<option value={n}>{n === 1 ? 'Off' : `${n} sub-frames`}</option>{/each}
          </select>
          <span>Shutter</span>
          <span class="inline">
            <input type="range" min="0" max="1" step="0.05" bind:value={shutter} disabled={samples === 1} />
            <small>{Math.round(shutter * 360)}°</small>
          </span>
        </div>
      </section>
    {/if}

    <section>
      <h2>{anim ? 'Still' : 'Export'}</h2>
      <div class="export">
        <select bind:value={exportW}>
          {#each EXPORT_SIZES as w (w)}<option value={w}>{w}px</option>{/each}
        </select>
        <button onclick={exportPng} disabled={!!busy}>PNG</button>
        <button onclick={exportSvg} disabled={!!busy || isShader(piece)}>SVG</button>
        <button onclick={saveCurrent}>Save</button>
      </div>
    </section>

    {#if anim}
      <section>
        <h2>Video</h2>
        <div class="grid">
          <span>Width</span>
          <select bind:value={videoW}>
            {#each VIDEO_SIZES as w (w)}<option value={w}>{w}px</option>{/each}
          </select>
          <span>Format</span>
          <select bind:value={videoFormat}>
            {#each VIDEO_FORMATS as f (f.value)}<option value={f.value}>{f.label}</option>{/each}
          </select>
          {#if videoFormat !== 'frames'}
            <span>Quality</span>
            <select bind:value={quality}>
              {#each Object.keys(QUALITIES) as q (q)}<option value={q}>{q}</option>{/each}
            </select>
          {/if}
        </div>
        {#if !codecOk}<p class="warn">This browser can't encode that codec at this size.</p>{/if}
        <p class="hint">
          {Math.round(anim.duration * anim.fps)} frames at {anim.fps} fps{samples > 1 ? `, ${samples}× sub-frames each` : ''}.
        </p>
        <div class="export">
          {#if busy}
            <button onclick={() => renderer.cancel()}>Cancel</button>
          {:else}
            <button class="primary" onclick={exportVideo} disabled={!codecOk}>Render video</button>
          {/if}
        </div>
      </section>
    {/if}

    {#if notice}
      <pre class="notice">{notice}</pre>
    {/if}
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
    grid-template-rows: 1fr auto auto;
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
  .export .primary {
    flex: 1;
    background: var(--accent);
    color: #1a1406;
    border-color: transparent;
    font-weight: 600;
  }
  .grid {
    display: grid;
    grid-template-columns: 96px 1fr;
    gap: 8px;
    align-items: center;
    font-size: 12px;
    color: var(--muted);
    margin-bottom: 10px;
  }
  .inline {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .inline input {
    flex: 1;
    accent-color: var(--accent);
  }
  .hint,
  .warn {
    font-size: 11px;
    color: var(--muted);
    margin: 0 0 10px;
  }
  .warn {
    color: var(--error);
  }
  .notice {
    font-size: 11px;
    white-space: pre-wrap;
    word-break: break-all;
    background: var(--hover);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 10px;
    margin: 0;
  }
</style>
