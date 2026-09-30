<script lang="ts">
  import { pieces } from '../../../../../pieces';
  import { modeOf, studio, type Mode } from '../studio.svelte';
  import Button from '../ui/Button.svelte';
  import Progress from '../ui/Progress.svelte';
  import Segmented from '../ui/Segmented.svelte';

  const count = (m: Mode) => String(pieces.filter((p) => modeOf(p) === m).length);
  const MODES = [
    { value: 'image' as const, label: 'Image', hint: count('image') },
    { value: 'video' as const, label: 'Video', hint: count('video') },
  ];

  const task = $derived(studio.task);
</script>

<header>
  <div class="brand">kiln</div>
  <Segmented label="Mode" value={studio.mode} options={MODES} onchange={(m) => studio.setMode(m)} />

  <div class="status">
    {#if task}
      <span class="label">
        {task.label}{task.total ? ` · ${task.done}/${task.total}` : '…'}{task.eta !== undefined ? ` · ~${Math.ceil(task.eta)}s left` : ''}
      </span>
      <span class="bar"><Progress value={task.total ? task.done / task.total : null} /></span>
      <Button variant="ghost" onclick={() => studio.cancel()}>Cancel</Button>
    {:else}
      <span class="label">{studio.piece.title} · seed {studio.seed} · {studio.renderMs.toFixed(0)} ms/frame</span>
    {/if}
  </div>
</header>

<style>
  header {
    display: grid;
    grid-template-columns: var(--side-w) auto 1fr;
    align-items: center;
    height: 48px;
    border-bottom: 1px solid var(--border);
    background: var(--panel);
    padding-right: var(--pad);
  }
  .brand {
    padding-left: var(--pad);
    font-weight: 700;
    letter-spacing: 0.12em;
  }
  .status {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    min-width: 0;
    font-size: var(--text-xs);
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .label {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .bar {
    width: 160px;
    flex: none;
  }
</style>
