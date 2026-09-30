<script lang="ts">
  import { getPalette, paletteNames, type Param, type ParamSchema } from '../../../../../engine2d';
  import { studio } from '../studio.svelte';
  import Button from '../ui/Button.svelte';
  import Field from '../ui/Field.svelte';
  import Section from '../ui/Section.svelte';
  import Select from '../ui/Select.svelte';
  import Slider from '../ui/Slider.svelte';

  // Params grouped into sections, in order of first appearance.
  const groups = $derived.by(() => {
    const out = new Map<string, [string, Param][]>();
    for (const entry of Object.entries(studio.piece.params as ParamSchema)) {
      const name = entry[1].group ?? 'Parameters';
      if (!out.has(name)) out.set(name, []);
      out.get(name)!.push(entry);
    }
    return [...out];
  });
  const labelOf = (key: string, p: Param) =>
    p.label ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
  const stepOf = (p: Param) => (p.kind === 'number' ? p.step : 1);
  const fmt = (n: number, step: number) =>
    step >= 1 ? String(Math.round(n)) : n.toFixed(Math.min(4, Math.ceil(-Math.log10(step))));
</script>

{#snippet paramActions()}
  <Button variant="ghost" title="Randomize parameters (D)" onclick={() => studio.diceParams()}>Dice</Button>
  <Button variant="ghost" title="Reset to defaults" onclick={() => studio.resetParams()}>Reset</Button>
{/snippet}

{#each groups as [title, params], gi (title)}
<Section {title} actions={gi === 0 ? paramActions : undefined}>
  {#each params as [key, param] (key)}
    {@const v = studio.values[key]}
    {#if param.kind === 'number' || param.kind === 'int'}
      <Field label={labelOf(key, param)} value={fmt(v as number, stepOf(param))}>
        <Slider
          label={labelOf(key, param)}
          min={param.min}
          max={param.max}
          step={stepOf(param)}
          value={v as number}
          oninput={(x) => studio.setParam(key, x)}
        />
      </Field>
    {:else if param.kind === 'bool'}
      <Field label={labelOf(key, param)}>
        <input type="checkbox" checked={v as boolean} onchange={(e) => studio.setParam(key, e.currentTarget.checked)} />
      </Field>
    {:else if param.kind === 'color'}
      <Field label={labelOf(key, param)}>
        <input type="color" value={v as string} oninput={(e) => studio.setParam(key, e.currentTarget.value)} />
      </Field>
    {:else if param.kind === 'choice'}
      <Field label={labelOf(key, param)}>
        <Select label={labelOf(key, param)} value={v as string} options={param.options} onchange={(x) => studio.setParam(key, x)} />
      </Field>
    {:else if param.kind === 'palette'}
      {@const pal = getPalette(v as string)}
      <Field label={labelOf(key, param)}>
        <Select label={labelOf(key, param)} value={v as string} options={paletteNames} onchange={(x) => studio.setParam(key, x)} />
      </Field>
      <div class="swatches" style:background={pal.bg}>
        {#each pal.colors as c, i (i)}<i style:background={c}></i>{/each}
      </div>
    {/if}
  {/each}
</Section>
{/each}

<style>
  .swatches {
    display: flex;
    gap: 3px;
    padding: 4px;
    margin-left: calc(var(--label-w) + 8px);
    border-radius: var(--radius);
    border: 1px solid var(--border);
  }
  .swatches i {
    flex: 1;
    height: 12px;
    border-radius: 2px;
  }
</style>
