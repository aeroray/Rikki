<script lang="ts">
  import { i18n } from "$lib/i18n";
  import { fade, scale } from "svelte/transition";

  let {
    src,
    onclose,
  }: {
    src: string | null;
    onclose: () => void;
  } = $props();

  let broken = $state(false);

  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  $effect(() => {
    src;
    broken = false;
  });
</script>

{#if src}
  <!-- The overlay layer is the window's shape, and the backdrop paints that
       shape itself. The backdrop is a flat tint and not a `backdrop-blur`, for
       the reason `ActionConfirm` records: at the rounded corner the blur layer is
       clipped less than the tint under it and leaves a white sliver along the arc.
       The wrapper carries the radius only so the backdrop's `rounded-[inherit]`
       has something to inherit. -->
  <div
    class="absolute inset-0 z-40 flex items-center justify-center rounded-[inherit]"
    role="dialog"
    aria-modal="true"
    aria-label={i18n.t("clip.previewTitle")}
  >
    <button
      type="button"
      class="absolute inset-0 rounded-[inherit] bg-black/55"
      aria-label={i18n.t("clip.closePreview")}
      onclick={onclose}
      in:fade={{ duration: reduceMotion ? 0 : 150 }}
      out:fade={{ duration: reduceMotion ? 0 : 100 }}
    ></button>
    {#if broken}
      <p class="relative z-10 px-4 text-[14px] leading-5 text-ink">{i18n.t("clip.previewMissing")}</p>
    {:else}
      <img
        {src}
        alt={i18n.t("clip.previewAlt")}
        draggable="false"
        class="media-outline relative z-10 max-h-[calc(100%-40px)] max-w-[calc(100%-40px)] object-contain"
        in:scale={{ duration: reduceMotion ? 0 : 150, start: 0.95 }}
        out:scale={{ duration: reduceMotion ? 0 : 100, start: 0.95 }}
        onerror={() => (broken = true)}
      />
    {/if}
  </div>
{/if}
