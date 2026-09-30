<script lang="ts">
  import { studio } from '../studio.svelte';
</script>

<nav aria-label="Pieces">
  {#each studio.modePieces as p (p.id)}
    <button class:active={p.id === studio.piece.id} onclick={() => studio.selectPiece(p.id)}>
      <span class="title">{p.title}</span>
      <span class="meta">
        {#if p.animation}{p.animation.duration}s{p.animation.loop ? ' loop' : ''} ·{/if}
        {p.tags?.join(' · ')}
      </span>
    </button>
  {:else}
    <p class="empty">No {studio.mode} pieces yet.</p>
  {/each}
</nav>

<style>
  nav {
    display: grid;
    gap: 2px;
    padding: 8px;
  }
  button {
    all: unset;
    cursor: pointer;
    display: grid;
    gap: 2px;
    padding: 8px 10px;
    border-radius: var(--radius);
  }
  button:hover {
    background: var(--control);
  }
  button.active {
    background: var(--control-hover);
    box-shadow: inset 2px 0 0 var(--accent);
  }
  .title {
    font-size: var(--text-md);
  }
  .meta {
    font-size: var(--text-xs);
    color: var(--muted);
  }
  .empty {
    color: var(--muted);
    font-size: var(--text-sm);
    padding: 8px 10px;
  }
</style>
