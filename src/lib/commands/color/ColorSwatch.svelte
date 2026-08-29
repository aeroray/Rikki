<script lang="ts">
  import type { ParsedColor } from "$lib/commands/color/parse";
  import { i18n } from "$lib/i18n";
  import { Droplet } from "@lucide/svelte";

  let { color }: { color: ParsedColor } = $props();

  const transparent = $derived(color.rgba.a < 1 - 0.5 / 255);
  const name = $derived(
    i18n.locale === "zh-CN" ? `${color.nameZh} · ${color.nameEn}` : color.nameEn,
  );
</script>

<div class="flex items-center gap-3 px-1">
  <span
    class="relative size-16 shrink-0 overflow-hidden rounded-md outline outline-1 outline-hairline"
    class:color-check={transparent}
    aria-hidden="true"
  >
    <span class="absolute inset-0" style="background-color: {color.rgbaCss}"></span>
  </span>
  <span class="min-w-0">
    <span class="block truncate font-medium text-[18px] leading-6 tracking-[-0.05px] text-ink">
      {color.hex}
    </span>
    <span class="mt-1 flex items-center gap-1.5 text-[13px] leading-5 text-ink-subtle">
      <Droplet class="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
      <span class="truncate">{name}</span>
    </span>
  </span>
</div>

<style>
  .color-check {
    background-color: var(--color-surface-1);
    background-image:
      linear-gradient(45deg, var(--color-hairline) 25%, transparent 25%),
      linear-gradient(-45deg, var(--color-hairline) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, var(--color-hairline) 75%),
      linear-gradient(-45deg, transparent 75%, var(--color-hairline) 75%);
    background-size: 10px 10px;
    background-position:
      0 0,
      0 5px,
      5px -5px,
      -5px 0;
  }
</style>
