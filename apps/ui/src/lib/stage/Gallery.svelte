<script lang="ts">
  import { studio } from '../studio.svelte';
  import Kbd from '../ui/Kbd.svelte';
</script>

<div class="strip">
  {#each studio.pieceSnapshots as s (s.id)}
    <div class="item">
      <button class="thumb" onclick={() => studio.restore(s)} title="seed {s.seed} · {new Date(s.createdAt).toLocaleString()}">
        <img src={s.thumb} alt="seed {s.seed}" loading="lazy" />
      </button>
      <button class="del" onclick={() => studio.removeSnapshot(s)} aria-label="Delete snapshot">×</button>
    </div>
  {:else}
    <p class="empty">Press <Kbd>S</Kbd> to keep a variation here.</p>
  {/each}
</div>

<style>
  .strip {
    display: flex;
    gap: 8px;
    padding: 10px var(--pad);
    overflow-x: auto;
    border-top: 1px solid var(--border);
    background: var(--panel);
    height: 84px;
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
    height: 62px;
    width: auto;
  }
  .del {
    all: unset;
    cursor: pointer;
    position: absolute;
    top: 3px;
    right: 3px;
    width: 16px;
    height: 16px;
    text-align: center;
    line-height: 15px;
    border-radius: 50%;
    background: rgb(0 0 0 / 0.6);
    color: #fff;
    font-size: 12px;
    opacity: 0;
  }
  .item:hover .del {
    opacity: 1;
  }
  .empty {
    margin: 0;
    color: var(--muted);
    font-size: var(--text-sm);
  }
</style>
