<script lang="ts">
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
</script>

<kbd>{@render children()}</kbd>

<style>
  kbd {
    display: inline-block;
    min-width: 18px;
    text-align: center;
    border: 1px solid var(--border);
    border-bottom-width: 2px;
    border-radius: 4px;
    padding: 0 4px;
    font: inherit;
    font-size: var(--text-xs);
    line-height: 16px;
    color: var(--text);
  }
</style>
