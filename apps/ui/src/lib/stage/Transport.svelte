<script lang="ts">
  import { studio } from '../studio.svelte';
  import Button from '../ui/Button.svelte';
  import Slider from '../ui/Slider.svelte';

  const anim = $derived(studio.anim!);
  const frame = $derived(Math.round(studio.time * anim.fps));
  const total = $derived(Math.round(anim.duration * anim.fps));
  const slow = $derived(studio.playing && studio.liveFps < anim.fps * 0.8);
</script>

<div class="transport">
  <Button variant="ghost" title="Previous frame (,)" onclick={() => studio.stepFrame(-1)}>⏮</Button>
  <Button title={studio.playing ? 'Pause (Space)' : 'Play (Space)'} onclick={() => studio.togglePlay()}>
    {studio.playing ? '❚❚' : '▶'}
  </Button>
  <Button variant="ghost" title="Next frame (.)" onclick={() => studio.stepFrame(1)}>⏭</Button>

  <Slider label="Timeline" min={0} max={anim.duration} step={1 / anim.fps} value={studio.time} oninput={(t) => studio.seek(t)} />

  <span class="readout">
    <span>{studio.time.toFixed(2)} / {anim.duration}s</span>
    <span>f {frame}/{total}{anim.loop ? ' ⟲' : ''}</span>
    <span class:slow>{studio.playing ? `${studio.liveFps.toFixed(0)}` : anim.fps} fps</span>
  </span>
</div>

<style>
  .transport {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px var(--pad);
    border-top: 1px solid var(--border);
    background: var(--panel);
  }
  .readout {
    display: flex;
    gap: 12px;
    margin-left: 6px;
    font-size: var(--text-xs);
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .slow {
    color: var(--error);
  }
</style>
