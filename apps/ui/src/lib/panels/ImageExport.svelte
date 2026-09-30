<script lang="ts">
  import { isShader } from '../../../../../runtime';
  import { studio } from '../studio.svelte';
  import Button from '../ui/Button.svelte';
  import Field from '../ui/Field.svelte';
  import Section from '../ui/Section.svelte';
  import Select from '../ui/Select.svelte';
  import { download } from '../util';

  const SIZES = [2048, 4096, 8192, 16384].map((w) => ({ value: w, label: `${w}px${w >= 8192 ? ' · print' : ''}` }));

  let width = $state(4096);
  const height = $derived(Math.round(width / studio.piece.aspect));

  function png() {
    const w = width;
    studio.run(`PNG ${w}px`, async (progress) => {
      const { blob } = await studio.renderer.png({ ...studio.job(w, 0), samples: 1, shutter: 0 }, progress);
      download(blob, `${studio.piece.id}-${studio.seed}-${w}.png`);
    });
  }

  function svg() {
    studio.run('SVG', async () => {
      const { svg } = await studio.renderer.svg(studio.job(0, 0));
      download(new Blob([svg], { type: 'image/svg+xml' }), `${studio.piece.id}-${studio.seed}.svg`);
    });
  }
</script>

<Section title="Export">
  <Field label="Size">
    <Select label="Export width" value={width} options={SIZES} onchange={(w) => (width = w)} />
  </Field>
  <p class="hint">{width} × {height}px PNG, rendered in strips, params embedded.</p>
  <div class="row">
    <Button variant="primary" grow disabled={!!studio.task} onclick={png}>Export PNG</Button>
    <Button disabled={!!studio.task || isShader(studio.piece)} title="Vector, for plotters" onclick={svg}>SVG</Button>
  </div>
  <Button title="Save to gallery (S)" onclick={() => studio.saveSnapshot()}>Save to gallery</Button>
</Section>

<style>
  .row {
    display: flex;
    gap: 6px;
  }
  .hint {
    margin: 0;
    font-size: var(--text-xs);
    color: var(--muted);
  }
</style>
