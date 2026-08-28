<script module lang="ts">
  let idSeq = 0;
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";

  type Props = HTMLAttributes<HTMLDivElement> & {
    children: Snippet;
    class?: string;
    viewportClass?: string;
  };

  let {
    children,
    class: className = "",
    viewportClass = "",
    ...rest
  }: Props = $props();

  const MIN_THUMB = 24;
  const HIDE_MS = 800;
  const viewportId = `rikki-scroll-${++idSeq}`;

  let viewport: HTMLDivElement | undefined = $state();
  let track: HTMLDivElement | undefined = $state();
  let overflow = $state(false);
  let thumbHeight = $state(MIN_THUMB);
  let thumbTop = $state(0);
  let dragging = $state(false);
  let recentlyScrolled = $state(false);
  let scrollPct = $state(0);
  let dragOffset = 0;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  function layout() {
    const el = viewport;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    overflow = scrollHeight > clientHeight + 1;
    if (!overflow) {
      thumbHeight = MIN_THUMB;
      thumbTop = 0;
      scrollPct = 0;
      return;
    }
    const trackSize = track?.clientHeight ?? clientHeight;
    const nextHeight = Math.max(MIN_THUMB, (clientHeight / scrollHeight) * trackSize);
    const maxThumb = Math.max(0, trackSize - nextHeight);
    const maxScroll = scrollHeight - clientHeight;
    thumbHeight = nextHeight;
    thumbTop = maxScroll <= 0 ? 0 : (scrollTop / maxScroll) * maxThumb;
    scrollPct = maxScroll <= 0 ? 0 : Math.round((scrollTop / maxScroll) * 100);
  }

  function markScrolled() {
    recentlyScrolled = true;
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      recentlyScrolled = false;
      hideTimer = null;
    }, HIDE_MS);
  }

  function onScroll() {
    layout();
    markScrolled();
  }

  function scrollFromClientY(clientY: number, offset: number) {
    if (!viewport || !track) return;
    const trackRect = track.getBoundingClientRect();
    const maxThumb = Math.max(0, trackRect.height - thumbHeight);
    const y = Math.max(0, Math.min(maxThumb, clientY - trackRect.top - offset));
    const maxScroll = viewport.scrollHeight - viewport.clientHeight;
    viewport.scrollTop = maxThumb <= 0 ? 0 : (y / maxThumb) * maxScroll;
  }

  function onThumbPointerDown(event: PointerEvent) {
    event.preventDefault();
    event.stopPropagation();
    dragging = true;
    const thumb = event.currentTarget as HTMLElement;
    dragOffset = event.clientY - thumb.getBoundingClientRect().top;
    thumb.setPointerCapture(event.pointerId);
  }

  function onThumbPointerMove(event: PointerEvent) {
    if (!dragging) return;
    scrollFromClientY(event.clientY, dragOffset);
  }

  function onThumbPointerUp(event: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    markScrolled();
  }

  function onTrackPointerDown(event: PointerEvent) {
    if (event.target !== track) return;
    event.preventDefault();
    scrollFromClientY(event.clientY, thumbHeight / 2);
    markScrolled();
  }

  $effect(() => {
    const el = viewport;
    if (!el) return;
    const ro = new ResizeObserver(() => layout());
    ro.observe(el);
    const mo = new MutationObserver(() => layout());
    mo.observe(el, { childList: true, subtree: true });
    el.addEventListener("scroll", onScroll, { passive: true });
    layout();
    return () => {
      ro.disconnect();
      mo.disconnect();
      el.removeEventListener("scroll", onScroll);
      if (hideTimer) clearTimeout(hideTimer);
    };
  });

  $effect(() => {
    if (!track) return;
    layout();
  });
</script>

<div
  class="scroll-area {className}"
  class:is-dragging={dragging}
>
  <div bind:this={viewport} class="scroll-area-viewport {viewportClass}" {...rest} id={viewportId}>
    {@render children()}
  </div>

  {#if overflow}
    <div
      bind:this={track}
      class="scroll-area-track"
      role="presentation"
      onpointerdown={onTrackPointerDown}
    >
      <div
        class="scroll-area-thumb"
        role="scrollbar"
        aria-controls={viewportId}
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={scrollPct}
        tabindex={-1}
        style="height: {thumbHeight}px; transform: translateY({thumbTop}px)"
        onpointerdown={onThumbPointerDown}
        onpointermove={onThumbPointerMove}
        onpointerup={onThumbPointerUp}
        onpointercancel={onThumbPointerUp}
      ></div>
    </div>
  {/if}
</div>

<style>
  .scroll-area {
    position: relative;
    display: flex;
    min-height: 0;
    flex-direction: column;
  }

  .scroll-area-viewport {
    min-height: 0;
    flex: 1 1 0%;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .scroll-area-viewport::-webkit-scrollbar {
    width: 0;
    height: 0;
  }

  .scroll-area-track {
    position: absolute;
    top: 4px;
    right: 2px;
    bottom: 4px;
    width: 8px;
    pointer-events: auto;
  }

  .scroll-area-thumb {
    position: absolute;
    left: 1px;
    width: 6px;
    border-radius: 999px;
    background: var(--color-hairline-strong);
    cursor: default;
    touch-action: none;
    transition: background-color 0.15s ease-out;
  }

  .scroll-area-thumb:hover,
  .scroll-area.is-dragging .scroll-area-thumb {
    background: var(--color-ink-subtle);
  }

  @media (prefers-reduced-motion: reduce) {
    .scroll-area-track,
    .scroll-area-thumb {
      transition: none;
    }
  }
</style>
