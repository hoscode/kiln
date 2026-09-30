<script lang="ts" generics="T extends string | number">
  let {
    value,
    options,
    disabled = false,
    label,
    onchange,
  }: {
    value: T;
    options: readonly ({ value: T; label?: string } | T)[];
    disabled?: boolean;
    label?: string;
    onchange: (v: T) => void;
  } = $props();

  const normalized = $derived(options.map((o) => (typeof o === 'object' ? o : { value: o, label: String(o) })));
</script>

<select
  {disabled}
  aria-label={label}
  value={String(value)}
  onchange={(e) => onchange(normalized[e.currentTarget.selectedIndex].value)}
>
  {#each normalized as o (o.value)}<option value={String(o.value)}>{o.label ?? o.value}</option>{/each}
</select>

<style>
  select {
    width: 100%;
    min-width: 0;
  }
</style>
