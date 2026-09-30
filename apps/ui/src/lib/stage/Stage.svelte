<script lang="ts">
  import { studio } from '../studio.svelte';

  let canvas: HTMLCanvasElement | undefined = $state();
  let w = $state(0);
  let h = $state(0);

  // Receive preview frames from the worker; measure delivered fps while playing.
  $effect(() => {
    if (!canvas) return;
    const c = canvas;
    const ctx = c.getContext('bitmaprenderer');
    let count = 0;
    let since = performance.now();
    studio.canvas = c;
    studio.frameSink = (bitmap) => {
      c.style.width = `${bitmap.width / devicePixelRatio}px`;
      c.style.height = `${bitmap.height / devicePixelRatio}px`;
      ctx?.transferFromImageBitmap(bitmap);
      count++;
      const now = performance.now();
      if (now - since >= 500) {
        studio.liveFps = (count * 1000) / (now - since);
        count = 0;
        since = now;
      }
    };
    return () => {
      studio.frameSink = null;
      studio.canvas = null;
    };
  });

  // Request a preview whenever what's on screen should change.
  $effect(() => {
    if (!w || !h) return;
    const pad = 48;
    const cssW = Math.max(120, Math.floor(Math.min(w - pad, (h - pad) * studio.piece.aspect)));
    studio.renderer.preview(studio.job(Math.round(cssW * devicePixelRatio)));
  });
</script>

<div class="stage" bind:clientWidth={w} bind:clientHeight={h}>
  <canvas bind:this={canvas}></canvas>
  {#if studio.error}
    <div class="error" role="alert">
      <button class="close" aria-label="Dismiss" onclick={() => (studio.error = '')}>×</button>
      <pre>{studio.error}</pre>
    </div>
  {/if}
</div>

<style>
  .stage {
    position: relative;
    display: grid;
    place-items: center;
    overflow: hidden;
    min-height: 0;
    background: var(--stage);
  }
  canvas {
    box-shadow: 0 12px 48px rgb(0 0 0 / 0.4);
  }
  .error {
    position: absolute;
    inset: auto 16px 16px;
    max-height: 40%;
    overflow: auto;
    background: var(--error-bg);
    color: var(--error);
    border-radius: var(--radius);
    padding: 10px 32px 10px 12px;
  }
  pre {
    margin: 0;
    font-size: var(--text-sm);
    white-space: pre-wrap;
  }
  .close {
    all: unset;
    cursor: pointer;
    position: absolute;
    top: 6px;
    right: 10px;
    font-size: 16px;
  }
</style>
