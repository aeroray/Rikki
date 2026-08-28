<script lang="ts">
  import { scale } from "svelte/transition";

  let {
    src,
    onclose,
  }: {
    src: string;
    onclose: () => void;
  } = $props();

  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
</script>

<div
  class="absolute inset-0 z-20 flex items-center justify-center"
  role="dialog"
  aria-modal="true"
  aria-label="图片预览"
  tabindex="-1"
  in:scale={{ duration: reduceMotion ? 0 : 150, start: 0.96 }}
  out:scale={{ duration: reduceMotion ? 0 : 100, start: 0.96 }}
>
  <button
    type="button"
    class="absolute inset-0 bg-black/55 backdrop-blur-xl"
    aria-label="关闭预览"
    onclick={onclose}
  ></button>
  <img
    {src}
    alt="剪贴板图片预览"
    draggable="false"
    class="relative z-10 max-h-[calc(100%-40px)] max-w-[calc(100%-40px)] object-contain outline outline-1 outline-white/10"
  />
</div>
