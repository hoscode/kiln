<script lang="ts" generics="T extends string">
  let {
    value,
    options,
    label,
    onchange,
  }: {
    value: T;
    options: readonly { value: T; label: string; hint?: string }[];
    label: string;
    onchange: (v: T) => void;
  } = $props();
</script>

<div class="segmented" role="tablist" aria-label={label}>
  {#each options as o (o.value)}
    <button role="tab" aria-selected={o.value === value} class:active={o.value === value} onclick={() => onchange(o.value)}>
      {o.label}
      {#if o.hint}<small>{o.hint}</small>{/if}
    </button>
  {/each}
</div>

<style>
  .segmented {
    display: inline-flex;
    padding: 2px;
    gap: 2px;
    background: var(--control);
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) + 2px);
  }
  button {
    all: unset;
    cursor: pointer;
    padding: 4px 14px;
    border-radius: var(--radius);
    font-size: var(--text-sm);
    color: var(--muted);
    display: flex;
    gap: 6px;
    align-items: baseline;
  }
  button:hover {
    color: var(--text);
  }
  button.active {
    background: var(--panel);
    color: var(--text);
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.3);
  }
  small {
    font-size: var(--text-xs);
    color: var(--muted);
  }
</style>
