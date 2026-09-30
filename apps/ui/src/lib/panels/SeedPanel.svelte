<script lang="ts">
  import { studio } from '../studio.svelte';
  import Button from '../ui/Button.svelte';
  import Section from '../ui/Section.svelte';
</script>

<Section title="Seed">
  <div class="row">
    <Button title="Previous seed (←)" onclick={() => studio.setSeed(studio.seed - 1)}>‹</Button>
    <input
      type="number"
      min="0"
      aria-label="Seed"
      value={studio.seed}
      onchange={(e) => studio.setSeed(Number(e.currentTarget.value))}
    />
    <Button title="Next seed (→)" onclick={() => studio.setSeed(studio.seed + 1)}>›</Button>
    <Button title="Random seed (R)" onclick={() => studio.randomSeed()}>Random</Button>
  </div>
</Section>

<style>
  .row {
    display: flex;
    gap: 6px;
  }
  input {
    flex: 1;
    width: 0;
    text-align: center;
  }
</style>
