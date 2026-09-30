<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    variant = 'default',
    disabled = false,
    title,
    grow = false,
    onclick,
    children,
  }: {
    variant?: 'default' | 'primary' | 'ghost';
    disabled?: boolean;
    title?: string;
    /** Fill the available width in a row. */
    grow?: boolean;
    onclick: () => void;
    children: Snippet;
  } = $props();
</script>

<button class={variant} class:grow {disabled} {title} aria-label={title} {onclick}>{@render children()}</button>

<style>
  button {
    font: inherit;
    font-size: var(--text-sm);
    color: var(--text);
    background: var(--control);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0 10px;
    height: 28px;
    cursor: pointer;
    white-space: nowrap;
  }
  button:hover:not(:disabled) {
    background: var(--control-hover);
  }
  button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .grow {
    flex: 1;
  }
  .primary {
    background: var(--accent);
    border-color: transparent;
    color: var(--on-accent);
    font-weight: 600;
  }
  .primary:hover:not(:disabled) {
    background: var(--accent-hover);
  }
  .ghost {
    background: none;
    border-color: transparent;
    color: var(--muted);
    padding: 0 6px;
    height: 24px;
  }
  .ghost:hover:not(:disabled) {
    background: var(--control);
    color: var(--text);
  }
</style>
