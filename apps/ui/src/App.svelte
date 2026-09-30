<script lang="ts">
  import ImageExport from './lib/panels/ImageExport.svelte';
  import ParamPanel from './lib/panels/ParamPanel.svelte';
  import PieceList from './lib/panels/PieceList.svelte';
  import SeedPanel from './lib/panels/SeedPanel.svelte';
  import VideoExport from './lib/panels/VideoExport.svelte';
  import Gallery from './lib/stage/Gallery.svelte';
  import Stage from './lib/stage/Stage.svelte';
  import TopBar from './lib/stage/TopBar.svelte';
  import Transport from './lib/stage/Transport.svelte';
  import { studio } from './lib/studio.svelte';
  import Kbd from './lib/ui/Kbd.svelte';
  import { save, writeHash } from './lib/util';

  $effect(() => {
    save({
      mode: studio.mode,
      pieceByMode: $state.snapshot(studio.pieceByMode),
      seeds: $state.snapshot(studio.seeds),
      values: $state.snapshot(studio.stored),
    });
  });

  $effect(() => {
    writeHash(studio.piece.id, studio.seed, $state.snapshot(studio.stored[studio.piece.id]));
  });

  // Playback clock. Previews are latest-wins, so a slow piece drops preview
  // frames but stays in time; exports are always frame-exact.
  $effect(() => {
    const anim = studio.anim;
    if (!studio.playing || !anim) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      let next = studio.time + (now - last) / 1000;
      last = now;
      if (next >= anim.duration) {
        if (anim.loop) next %= anim.duration;
        else {
          next = anim.duration;
          studio.playing = false;
        }
      }
      studio.time = next;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  const KEYS: Record<string, () => void> = {
    ArrowRight: () => studio.setSeed(studio.seed + 1),
    ArrowLeft: () => studio.setSeed(studio.seed - 1),
    r: () => studio.randomSeed(),
    d: () => studio.diceParams(),
    s: () => studio.saveSnapshot(),
    ' ': () => studio.togglePlay(),
    ',': () => studio.stepFrame(-1),
    '.': () => studio.stepFrame(1),
    '1': () => studio.setMode('image'),
    '2': () => studio.setMode('video'),
  };

  function onKey(e: KeyboardEvent) {
    const el = e.target as HTMLElement;
    if (el.matches('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
    const action = KEYS[e.key];
    if (!action) return;
    e.preventDefault();
    action();
  }

  const SHORTCUTS: [string[], string][] = [
    [['1', '2'], 'image / video'],
    [['←', '→'], 'seed'],
    [['R'], 'random seed'],
    [['D'], 'dice params'],
    [['S'], 'save to gallery'],
  ];
  const VIDEO_SHORTCUTS: [string[], string][] = [
    [['Space'], 'play / pause'],
    [[',', '.'], 'step frame'],
  ];
</script>

<svelte:window onkeydown={onKey} />

<div class="app">
  <TopBar />

  <aside class="side">
    <PieceList />
    <footer>
      {#each studio.mode === 'video' ? [...SHORTCUTS, ...VIDEO_SHORTCUTS] : SHORTCUTS as [keys, what] (what)}
        <div>{#each keys as k (k)}<Kbd>{k}</Kbd>{/each} <span>{what}</span></div>
      {/each}
    </footer>
  </aside>

  <main>
    <Stage />
    {#if studio.anim}<Transport />{/if}
    <Gallery />
  </main>

  <aside class="inspector">
    <SeedPanel />
    <ParamPanel />
    {#if studio.mode === 'video' && studio.anim}
      <VideoExport />
    {:else}
      <ImageExport />
    {/if}
    {#if studio.notice}
      <div class="notice">
        <button aria-label="Dismiss" onclick={() => (studio.notice = '')}>×</button>
        <pre>{studio.notice}</pre>
      </div>
    {/if}
  </aside>
</div>

<style>
  .app {
    display: grid;
    grid-template-columns: var(--side-w) 1fr var(--inspector-w);
    grid-template-rows: auto 1fr;
    height: 100vh;
  }
  .app > :global(header) {
    grid-column: 1 / -1;
  }
  .side,
  .inspector {
    background: var(--panel);
    overflow-y: auto;
    min-height: 0;
  }
  .side {
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
  }
  .inspector {
    border-left: 1px solid var(--border);
  }
  main {
    display: grid;
    grid-template-rows: 1fr auto auto;
    min-width: 0;
    min-height: 0;
  }
  footer {
    margin-top: auto;
    display: grid;
    gap: 6px;
    padding: var(--pad);
    font-size: var(--text-xs);
    color: var(--muted);
  }
  footer span {
    margin-left: 4px;
  }
  .notice {
    position: relative;
    margin: var(--pad);
    padding: 10px 28px 10px 10px;
    background: var(--control);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .notice pre {
    margin: 0;
    font-size: var(--text-xs);
    white-space: pre-wrap;
    word-break: break-all;
  }
  .notice button {
    all: unset;
    cursor: pointer;
    position: absolute;
    top: 4px;
    right: 8px;
    color: var(--muted);
  }
</style>
