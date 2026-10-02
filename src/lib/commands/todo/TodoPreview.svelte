<script lang="ts">
  import { relativeTime } from "$lib/commands/todo/format";
  import { i18n } from "$lib/i18n";
  import { ui } from "$lib/stores/ui.svelte";
  import { fade, scale } from "svelte/transition";

  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let scroller: HTMLDivElement | undefined = $state();

  const age = $derived.by(() => {
    const todo = ui.todoPreview;
    if (!todo) return "";
    const { key, vars } = relativeTime(todo.createdAt, Date.now());
    return i18n.t(key, vars);
  });

  /**
   * Focus the body so the arrow keys page through a long todo.
   *
   * A scrollable element that holds focus scrolls on the arrows by itself, which
   * is what makes "press Tab, then read the rest" work without a key handler
   * here — and without it, the arrows would keep moving the selection behind the
   * overlay, changing what is being previewed.
   */
  $effect(() => {
    if (!ui.todoPreview) return;
    requestAnimationFrame(() => scroller?.focus());
  });
</script>

<!-- The same overlay `ClipPreview` draws, and for the same reason: a row is one
     line so the list can be walked, and this is where the rest of it is read. It
     is a sibling of the clipped content column rather than a child, so the
     backdrop's blur is not clipped differently from its tint at the corners. -->
{#if ui.todoPreview}
  <div
    class="absolute inset-0 z-40 flex items-center justify-center rounded-[inherit]"
    role="dialog"
    aria-modal="true"
    aria-label={i18n.t("todo.previewTitle")}
  >
    <button
      type="button"
      class="absolute inset-0 rounded-[inherit] bg-black/55 backdrop-blur-md"
      aria-label={i18n.t("todo.closePreview")}
      onclick={() => (ui.todoPreview = null)}
      in:fade={{ duration: reduceMotion ? 0 : 150 }}
      out:fade={{ duration: reduceMotion ? 0 : 100 }}
    ></button>

    <!-- `tabindex` so the arrow keys page through a long body: a scrollable
         element that holds focus scrolls by itself, which is what makes "press
         Tab, then read the rest" work without a key handler of its own. Svelte
         flags a focusable non-interactive box, and this is exactly that — a
         reading surface, not a control. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      bind:this={scroller}
      tabindex="0"
      role="region"
      aria-label={i18n.t("todo.previewTitle")}
      class="relative z-10 max-h-[calc(100%-40px)] w-[min(100%-40px,32rem)] overflow-y-auto overscroll-contain rounded-lg bg-surface-1 p-3 [box-shadow:var(--dialog-shadow)] outline-none"
      in:scale={{ duration: reduceMotion ? 0 : 150, start: 0.95 }}
      out:scale={{ duration: reduceMotion ? 0 : 100, start: 0.95 }}
    >
      <p
        class="text-pretty whitespace-pre-wrap break-words text-[13px] leading-5 text-ink {ui.todoPreview
          .done
          ? 'text-ink-tertiary line-through'
          : ''}"
      >
        {ui.todoPreview.text}
      </p>
      <div class="mt-3 flex items-center gap-2 text-[11px] leading-4 text-ink-tertiary">
        {#if ui.todoPreview.tag}
          <span class="rounded-sm bg-surface-2 px-1.5 py-0.5 text-ink-subtle">
            #{ui.todoPreview.tag}
          </span>
        {/if}
        <span>{age}</span>
        {#if ui.todoPreview.done}
          <span>· {i18n.t("todo.doneLabel")}</span>
        {/if}
      </div>
    </div>
  </div>
{/if}
