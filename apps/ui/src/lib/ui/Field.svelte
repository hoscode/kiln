<script lang="ts">
  import type { Snippet } from 'svelte';

  // One labelled row: label · control · optional value readout.
  let { label, value, children }: { label: string; value?: string; children: Snippet } = $props();
</script>

<div class="field" class:has-value={value !== undefined}>
  <span class="label" title={label}>{label}</span>
  <div class="control">{@render children()}</div>
  {#if value !== undefined}<span class="value">{value}</span>{/if}
</div>

<style>
  .field {
    display: grid;
    grid-template-columns: var(--label-w) 1fr;
    align-items: center;
    gap: 8px;
    min-height: 26px;
    font-size: var(--text-sm);
  }
  .field.has-value {
    grid-template-columns: var(--label-w) 1fr 40px;
  }
  .label {
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .control {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .value {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
</style>
