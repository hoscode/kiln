<script lang="ts">
  let {
    value,
    min,
    max,
    step = 1,
    disabled = false,
    label,
    oninput,
  }: {
    value: number;
    min: number;
    max: number;
    step?: number;
    disabled?: boolean;
    label?: string;
    oninput: (v: number) => void;
  } = $props();
</script>

<input
  type="range"
  {min}
  {max}
  {step}
  {value}
  {disabled}
  aria-label={label}
  oninput={(e) => oninput(Number(e.currentTarget.value))}
/>

<style>
  input {
    width: 100%;
    margin: 0;
    accent-color: var(--accent);
  }
</style>
