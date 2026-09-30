<script lang="ts">
  import { getPalette, paletteNames, type Param, type ParamSchema } from '../../../../engine2d';

  let {
    schema,
    values,
    onchange,
  }: {
    schema: ParamSchema;
    values: Record<string, unknown>;
    onchange: (key: string, value: unknown) => void;
  } = $props();

  const labelOf = (key: string, p: Param) =>
    p.label ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
  const stepOf = (p: Param) => (p.kind === 'number' ? p.step : 1);
  const fmt = (n: number, step: number) =>
    step >= 1 ? String(Math.round(n)) : n.toFixed(Math.min(4, Math.ceil(-Math.log10(step))));
</script>

<div class="params">
  {#each Object.entries(schema) as [key, param] (key)}
    <label class="row" class:wide={param.kind === 'palette'}>
      <span class="name">{labelOf(key, param)}</span>
      {#if param.kind === 'number' || param.kind === 'int'}
        <input
          type="range"
          min={param.min}
          max={param.max}
          step={stepOf(param)}
          value={values[key] as number}
          oninput={(e) => onchange(key, Number(e.currentTarget.value))}
        />
        <span class="val">{fmt(values[key] as number, stepOf(param))}</span>
      {:else if param.kind === 'bool'}
        <input type="checkbox" checked={values[key] as boolean} onchange={(e) => onchange(key, e.currentTarget.checked)} />
      {:else if param.kind === 'color'}
        <input type="color" value={values[key] as string} oninput={(e) => onchange(key, e.currentTarget.value)} />
      {:else if param.kind === 'choice'}
        <select value={values[key]} onchange={(e) => onchange(key, e.currentTarget.value)}>
          {#each param.options as opt (opt)}<option value={opt}>{opt}</option>{/each}
        </select>
      {:else if param.kind === 'palette'}
        <select value={values[key]} onchange={(e) => onchange(key, e.currentTarget.value)}>
          {#each paletteNames as name (name)}<option value={name}>{name}</option>{/each}
        </select>
        {@const pal = getPalette(values[key] as string)}
        <span class="swatches" style:background={pal.bg}>
          {#each pal.colors as c, i (i)}<i style:background={c}></i>{/each}
        </span>
      {/if}
    </label>
  {/each}
</div>

<style>
  .params {
    display: grid;
    gap: 10px;
  }
  .row {
    display: grid;
    grid-template-columns: 96px 1fr 44px;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }
  .row.wide {
    grid-template-columns: 96px 1fr;
  }
  .name {
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .val {
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--text);
  }
  input[type='range'] {
    width: 100%;
    accent-color: var(--accent);
  }
  select {
    grid-column: 2 / -1;
  }
  .swatches {
    grid-column: 2 / -1;
    display: flex;
    gap: 3px;
    padding: 4px;
    border-radius: 6px;
    border: 1px solid var(--border);
  }
  .swatches i {
    flex: 1;
    height: 14px;
    border-radius: 3px;
  }
</style>
