<script lang="ts">
  import { i18n } from "$lib/i18n";
  import { scale } from "svelte/transition";

  let {
    src,
    onclose,
  }: {
    src: string;
    onclose: () => void;
  } = $props();

  let broken = $state(false);

  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
</script>

<div
  class="absolute inset-0 z-20 flex items-center justify-center"
  role="dialog"
  aria-modal="true"
  aria-label={i18n.t("clip.previewTitle")}
  tabindex="-1"
  in:scale={{ duration: reduceMotion ? 0 : 150, start: 0.96 }}
  out:scale={{ duration: reduceMotion ? 0 : 100, start: 0.96 }}
>
  <button
    type="button"
    class="absolute inset-0 bg-black/55 backdrop-blur-xl"
    aria-label={i18n.t("clip.closePreview")}
    onclick={onclose}
  ></button>
  {#if broken}
    <p class="relative z-10 px-4 text-[14px] leading-5 text-ink">{i18n.t("clip.previewMissing")}</p>
  {:else}
    <img
      {src}
      alt={i18n.t("clip.previewAlt")}
      draggable="false"
      class="relative z-10 max-h-[calc(100%-40px)] max-w-[calc(100%-40px)] object-contain outline outline-1 outline-hairline"
      onerror={() => (broken = true)}
    />
  {/if}
</div>
