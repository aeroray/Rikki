<script lang="ts">
  import { parseColor } from "$lib/commands/color/parse";
  import { i18n } from "$lib/i18n";
  import type { ClipPreview } from "$lib/stores/ui.svelte";
  import { fade, scale } from "svelte/transition";

  let {
    preview,
    onclose,
  }: {
    preview: ClipPreview | null;
    onclose: () => void;
  } = $props();

  let broken = $state(false);
  let scroller: HTMLDivElement | undefined = $state();

  const color = $derived(preview?.kind === "color" ? parseColor(preview.content) : null);

  const rows = $derived.by(() => {
    if (!color) return [];
    return [
      { id: "hex", label: i18n.t("color.hex"), value: color.hex },
      { id: "rgb", label: i18n.t("color.rgb"), value: color.rgb },
      { id: "hsl", label: i18n.t("color.hsl"), value: color.hsl },
      { id: "rgba", label: i18n.t("color.rgba"), value: color.rgbaCss },
      { id: "hsla", label: i18n.t("color.hsla"), value: color.hsla },
    ];
  });

  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  $effect(() => {
    preview;
    broken = false;
  });

  /**
   * Focus the body of a text preview so the arrow keys page through it.
   *
   * A scrollable element that holds focus scrolls on the arrow keys by itself,
   * which is what makes "press Tab, then read the rest" work without a key
   * handler here — and without one, the arrows would keep moving the selection
   * behind the overlay, changing what is being previewed.
   */
  $effect(() => {
    if (preview?.kind !== "text") return;
    requestAnimationFrame(() => scroller?.focus());
  });
</script>

{#if preview}
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

    {#if preview.kind === "image"}
      {#if broken}
        <p class="relative z-10 px-4 text-[14px] leading-5 text-ink">{i18n.t("clip.previewMissing")}</p>
      {:else}
        <img
          src={preview.src}
          alt={i18n.t("clip.previewAlt")}
          draggable="false"
          class="media-outline relative z-10 max-h-[calc(100%-40px)] max-w-[calc(100%-40px)] object-contain"
          in:scale={{ duration: reduceMotion ? 0 : 150, start: 0.95 }}
          out:scale={{ duration: reduceMotion ? 0 : 100, start: 0.95 }}
          onerror={() => (broken = true)}
        />
      {/if}
    {:else if preview.kind === "color" && color}
      <div
        class="relative z-10 w-[min(100%-40px,20rem)] rounded-lg bg-surface-1 p-3 [box-shadow:var(--dialog-shadow)]"
        in:scale={{ duration: reduceMotion ? 0 : 150, start: 0.95 }}
        out:scale={{ duration: reduceMotion ? 0 : 100, start: 0.95 }}
      >
        <span
          class="media-outline block h-16 rounded-md"
          style="background-color: {color.rgbaCss}"
          aria-hidden="true"
        ></span>
        <ul class="mt-3 flex flex-col gap-1">
          {#each rows as row (row.id)}
            <li class="flex items-center gap-2">
              <span class="w-12 shrink-0 text-[12px] leading-[1.4] text-ink-subtle">{row.label}</span>
              <span class="min-w-0 flex-1 truncate text-[13px] leading-5 text-ink tabular-nums">
                {row.value}
              </span>
            </li>
          {/each}
        </ul>
      </div>
    {:else if preview.kind === "text"}
      <!--
        `tabindex` so the arrow keys page through a long body: a scrollable
        element that holds focus scrolls by itself, which is what makes "press
        Tab, then read the rest" work without a key handler of its own.

        Svelte flags a focusable non-interactive box, and this is exactly that —
        a reading surface, not a control. Making it a button or a textbox to
        satisfy the rule would misdescribe it to assistive tech.
      -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div
        bind:this={scroller}
        tabindex="0"
        role="region"
        aria-label={i18n.t("clip.previewTitle")}
        class="relative z-10 max-h-[calc(100%-40px)] w-[min(100%-40px,32rem)] overflow-y-auto overscroll-contain rounded-lg bg-surface-1 p-3 [box-shadow:var(--dialog-shadow)] outline-none"
        in:scale={{ duration: reduceMotion ? 0 : 150, start: 0.95 }}
        out:scale={{ duration: reduceMotion ? 0 : 100, start: 0.95 }}
      >
        <!-- `whitespace-pre-wrap` keeps the line breaks a copied paragraph or a
             snippet has, and `break-words` stops a long URL from scrolling the
             card sideways. -->
        <p class="text-pretty whitespace-pre-wrap break-words text-[13px] leading-5 text-ink">{preview.body}</p>
      </div>
    {/if}
  </div>
{/if}
