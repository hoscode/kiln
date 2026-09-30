<script lang="ts">
  /** 0..1, or null for indeterminate. */
  let { value }: { value: number | null } = $props();
</script>

<div class="track" role="progressbar" aria-valuemin="0" aria-valuemax="1" aria-valuenow={value ?? undefined}>
  <div class="bar" class:indeterminate={value === null} style:width={value === null ? '30%' : `${value * 100}%`}></div>
</div>

<style>
  .track {
    height: 4px;
    background: var(--control);
    border-radius: 2px;
    overflow: hidden;
    width: 100%;
  }
  .bar {
    height: 100%;
    background: var(--accent);
    transition: width 0.15s;
  }
  .indeterminate {
    animation: slide 1.2s ease-in-out infinite;
  }
  @keyframes slide {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(340%);
    }
  }
</style>
