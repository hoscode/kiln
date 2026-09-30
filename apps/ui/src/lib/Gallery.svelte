<script lang="ts">
  import type { Snapshot } from './gallery';

  let {
    items,
    onselect,
    ondelete,
  }: {
    items: Snapshot[];
    onselect: (s: Snapshot) => void;
    ondelete: (s: Snapshot) => void;
  } = $props();
</script>

<div class="strip">
  {#each items as s (s.id)}
    <div class="item">
      <button class="thumb" onclick={() => onselect(s)} title="seed {s.seed} · {new Date(s.createdAt).toLocaleString()}">
        <img src={s.thumb} alt="seed {s.seed}" loading="lazy" />
      </button>
      <button class="del" onclick={() => ondelete(s)} aria-label="Delete snapshot">×</button>
    </div>
  {:else}
    <p class="empty">Press <kbd>S</kbd> to save a variation here.</p>
  {/each}
</div>

<style>
  .strip {
    display: flex;
    gap: 8px;
    padding: 10px 14px;
    overflow-x: auto;
    border-top: 1px solid var(--border);
    background: var(--panel);
    min-height: 92px;
    align-items: center;
  }
  .item {
    position: relative;
    flex: none;
  }
  .thumb {
    all: unset;
    cursor: pointer;
    display: block;
    border-radius: 4px;
    overflow: hidden;
    outline: 1px solid var(--border);
  }
  .thumb:hover {
    outline-color: var(--accent);
  }
  img {
    display: block;
    height: 72px;
    width: auto;
  }
  .del {
    position: absolute;
    top: 2px;
    right: 2px;
    padding: 0 5px;
    font-size: 12px;
    line-height: 16px;
    opacity: 0;
  }
  .item:hover .del {
    opacity: 1;
  }
  .empty {
    margin: 0;
    color: var(--muted);
    font-size: 12px;
  }
  kbd {
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0 4px;
    font-family: inherit;
  }
</style>
