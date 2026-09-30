<script lang="ts">
  let {
    time,
    duration,
    fps,
    playing,
    liveFps,
    loop,
    ontoggle,
    onseek,
  }: {
    time: number;
    duration: number;
    fps: number;
    playing: boolean;
    liveFps: number;
    loop: boolean;
    ontoggle: () => void;
    onseek: (t: number) => void;
  } = $props();

  const frame = $derived(Math.round(time * fps));
  const total = $derived(Math.round(duration * fps));
</script>

<div class="transport">
  <button class="play" onclick={ontoggle} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚' : '▶'}</button>
  <input
    type="range"
    min="0"
    max={duration}
    step={1 / fps}
    value={time}
    oninput={(e) => onseek(Number(e.currentTarget.value))}
    aria-label="Timeline"
  />
  <span class="time">
    {time.toFixed(2)}s / {duration}s · frame {frame}/{total}{loop ? ' ⟲' : ''}
  </span>
  <span class="fps" class:low={playing && liveFps < fps * 0.8}>{playing ? `${liveFps.toFixed(0)} fps` : `${fps} fps`}</span>
</div>

<style>
  .transport {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 14px;
    border-top: 1px solid var(--border);
    background: var(--panel);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .play {
    width: 34px;
    padding: 4px 0;
  }
  input {
    flex: 1;
    accent-color: var(--accent);
  }
  .time,
  .fps {
    color: var(--muted);
    white-space: nowrap;
  }
  .fps {
    min-width: 48px;
    text-align: right;
  }
  .fps.low {
    color: var(--error);
  }
</style>
