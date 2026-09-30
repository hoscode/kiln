<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    title,
    open = $bindable(true),
    actions,
    children,
  }: {
    title: string;
    open?: boolean;
    actions?: Snippet;
    children: Snippet;
  } = $props();
</script>

<section class:open>
  <header>
    <button class="toggle" onclick={() => (open = !open)} aria-expanded={open}>
      <span class="chevron" aria-hidden="true">›</span>
      {title}
    </button>
    {#if actions && open}<div class="actions">{@render actions()}</div>{/if}
  </header>
  {#if open}<div class="body">{@render children()}</div>{/if}
</section>

<style>
  section {
    border-bottom: 1px solid var(--border);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--pad) 0 calc(var(--pad) - 4px);
    height: 38px;
  }
  .toggle {
    all: unset;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .toggle:hover {
    color: var(--text);
  }
  .chevron {
    display: inline-block;
    width: 10px;
    transition: transform 0.12s;
  }
  .open .chevron {
    transform: rotate(90deg);
  }
  .actions {
    display: flex;
    gap: 2px;
  }
  .body {
    display: grid;
    gap: var(--gap);
    padding: 0 var(--pad) var(--pad);
  }
</style>
