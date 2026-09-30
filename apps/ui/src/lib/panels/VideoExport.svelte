<script lang="ts">
  import { canEncodeVideo, type VideoCodec } from 'mediabunny';
  import { videoSize } from '../../../../../runtime';
  import { studio } from '../studio.svelte';
  import Button from '../ui/Button.svelte';
  import Field from '../ui/Field.svelte';
  import Section from '../ui/Section.svelte';
  import Select from '../ui/Select.svelte';
  import Slider from '../ui/Slider.svelte';
  import { download } from '../util';

  type Format = VideoCodec | 'frames';

  const SIZES = [1280, 1920, 2560, 3840].map((w) => ({ value: w, label: `${w}px` }));
  const FORMATS: { value: Format; label: string }[] = [
    { value: 'avc', label: 'MP4 · H.264' },
    { value: 'hevc', label: 'MP4 · HEVC' },
    { value: 'av1', label: 'MP4 · AV1' },
    { value: 'frames', label: 'PNG sequence' },
  ];
  /** Mbps at 1080p60, scaled by pixel count and frame rate. */
  const QUALITY = { good: 16, high: 32, max: 64 } as const;
  type Quality = keyof typeof QUALITY;
  const SAMPLES = [1, 4, 8, 16, 32].map((n) => ({ value: n, label: n === 1 ? 'Off' : `${n} sub-frames` }));

  let samples = $state(8);
  let shutter = $state(0.5);
  let width = $state(1920);
  let format: Format = $state('avc');
  let quality: Quality = $state('high');
  let supported = $state(true);

  const anim = $derived(studio.anim!);
  const size = $derived(videoSize(width, studio.piece.aspect));
  const frames = $derived(Math.round(anim.duration * anim.fps));
  const bitrate = $derived(QUALITY[quality] * 1e6 * ((size.width * size.height) / (1920 * 1080)) * (anim.fps / 60));

  $effect(() => {
    const f = format;
    if (f === 'frames') return void (supported = true);
    let alive = true;
    canEncodeVideo(f, { width: size.width, height: size.height, bitrate })
      .then((ok) => alive && (supported = ok))
      .catch(() => alive && (supported = false));
    return () => {
      alive = false;
    };
  });

  function render() {
    const name = `${studio.piece.id}-${studio.seed}-${Date.now().toString(36)}`;
    const fps = anim.fps;
    studio.run('Video', async (progress) => {
      const res = await studio.renderer.video(
        {
          ...studio.job(width, 0),
          fps,
          duration: anim.duration,
          samples,
          shutter,
          format: format === 'frames' ? 'frames' : 'mp4',
          codec: format === 'frames' ? 'avc' : format,
          bitrate,
          name,
        },
        progress,
      );
      if (res.kind === 'video') download(res.blob, `${name}.mp4`);
      else
        studio.notice = `Saved ${res.count} frames to ${res.dir}/\n\nProRes master:\nffmpeg -framerate ${fps} -i ${res.dir}/%05d.png -c:v prores_ks -profile:v 3 ${name}.mov`;
    });
  }

  function frame() {
    const w = width;
    const f = Math.round(studio.time * anim.fps);
    studio.run(`Frame ${f}`, async (progress) => {
      const { blob } = await studio.renderer.png({ ...studio.job(w), samples, shutter }, progress);
      download(blob, `${studio.piece.id}-${studio.seed}-f${f}-${w}.png`);
    });
  }
</script>

<Section title="Motion blur">
  <Field label="Samples">
    <Select label="Motion blur samples" value={samples} options={SAMPLES} onchange={(n) => (samples = n)} />
  </Field>
  <Field label="Shutter" value={`${Math.round(shutter * 360)}°`}>
    <Slider label="Shutter angle" min={0} max={1} step={0.05} value={shutter} disabled={samples === 1} oninput={(v) => (shutter = v)} />
  </Field>
</Section>

<Section title="Render">
  <Field label="Size">
    <Select label="Video width" value={width} options={SIZES} onchange={(w) => (width = w)} />
  </Field>
  <Field label="Format">
    <Select label="Video format" value={format} options={FORMATS} onchange={(f) => (format = f)} />
  </Field>
  {#if format !== 'frames'}
    <Field label="Quality">
      <Select label="Video quality" value={quality} options={Object.keys(QUALITY) as Quality[]} onchange={(q) => (quality = q)} />
    </Field>
  {/if}

  <p class="hint" class:warn={!supported}>
    {#if supported}
      {size.width} × {size.height} · {frames} frames at {anim.fps} fps{samples > 1 ? ` · ${samples}× sub-frames` : ''}{format !== 'frames'
        ? ` · ${Math.round(bitrate / 1e6)} Mbps`
        : ''}
    {:else}
      This browser can't encode {format.toUpperCase()} at {size.width} × {size.height}.
    {/if}
  </p>

  <Button variant="primary" disabled={!!studio.task || !supported} onclick={render}>Render video</Button>
  <div class="row">
    <Button grow disabled={!!studio.task} title="PNG of the current frame, with motion blur" onclick={frame}>Current frame</Button>
    <Button grow title="Save to gallery (S)" onclick={() => studio.saveSnapshot()}>Save</Button>
  </div>
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
  .warn {
    color: var(--error);
  }
</style>
