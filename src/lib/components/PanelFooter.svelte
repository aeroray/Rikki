<script lang="ts">
  import KeyChip from "$lib/components/KeyChip.svelte";
  import { i18n } from "$lib/i18n";
  import { update } from "$lib/stores/update.svelte";
  import { ArrowUpCircle } from "@lucide/svelte";
  import type { Snippet } from "svelte";

  /**
   * A pinned panel footer: shortcut chips on the left, optional status on the
   * right.
   *
   * It replaces the loose `.palette-hint` paragraph that panels used to end
   * with. That paragraph was part of the scrolling content, so a tall panel
   * pushed it out of view; this is chrome, separated from the content by a
   * hairline and pinned to the bottom by the parent's flex layout.
   *
   * Keys are rendered as chips because they are keyboard glyphs, not prose, and
   * reading "PgUp/PgDn 换月" is far faster than parsing a run-on sentence.
   *
   * Text stays on `ink-subtle`: DESIGN.md maps it to "hints, icons", while
   * `ink-tertiary` only reaches 3.1–3.5:1 on the palette background, below
   * WCAG AA for text this size. The key chips use `ink-muted` on `surface-2`,
   * which clears AA comfortably.
   */
  export type FooterShortcut = {
    /** The key or key combination, e.g. `↑↓` or `Ctrl+N`. Not translated. */
    keys: string;
    /** What the key does. */
    label: string;
  };

  let {
    shortcuts = [],
    message = null,
    children,
  }: {
    shortcuts?: FooterShortcut[];
    /**
     * A note, error or confirmation. Shown alone when there are no shortcuts,
     * and otherwise right-aligned beside them, since a panel often wants both a
     * hint and a remark about the current state.
     */
    message?: string | null;
    /**
     * Controls that belong in the chrome rather than the content — a mode
     * picker, say. Takes the space the message would have used, because the two
     * want the same room and a panel showing both would have room for neither.
     */
    children?: Snippet;
  } = $props();

  /**
   * Where a status goes when shortcuts share the row.
   *
   * The far right, pushed by an auto margin rather than by `flex-1`: the message
   * keeps its own width, and it truncates from its end instead of losing its
   * first word, which is what right-aligning the text itself would do.
   */
  const messageAlign = $derived(shortcuts.length > 0 ? "ml-auto" : "mx-auto");
</script>

<!-- An available update replaces the bar rather than joining it. It is the one
     thing here the user cannot do later — a release is missed by not acting, while
     every panel shortcut still works once this is gone — and the two of them
     sharing a 32px row would leave room for neither. -->
{#if update.available}
  <div class="flex min-h-8 shrink-0 items-center gap-3 border-t border-hairline px-3">
    <!-- Same shape as every other footer: what the keyboard can do on the left,
         what the mouse can do on the right. -->
    <ul class="flex min-w-0 shrink items-center gap-x-3 overflow-hidden">
      <li class="flex min-w-0 items-center gap-1.5">
        <ArrowUpCircle class="size-4 shrink-0 text-ink-subtle" strokeWidth={1.5} aria-hidden="true" />
        <span class="min-w-0 truncate text-[11px] leading-4 text-ink-subtle">
          {i18n.t("update.available", { version: update.available })}
        </span>
      </li>
      <li class="shrink-0">
        <KeyChip keys="Ctrl+U" label={i18n.t("update.install")} />
      </li>
    </ul>
    <!-- The mouse's way in. A plain press, with no confirmation: reaching for
         either the shortcut or this button is already the answer. -->
    <button
      type="button"
      class="pressable ml-auto shrink-0 rounded px-1 text-[11px] leading-4 text-primary hover:text-primary-hover active:scale-[0.96]"
      onclick={() => void update.installAvailable()}
    >
      {i18n.t("update.install")}
    </button>
  </div>
{:else if shortcuts.length > 0 || message || children}
  <!-- With neither shortcuts nor a message there is nothing to say, and a bare
       hairline plus padding would just be a stray divider in the most cramped
       states (an empty or invalid panel). -->
  <!-- A fixed 32px, not padding around whatever is inside.
       A key chip is 16px tall and a form's save button is 32px, so padding-based
       height made the footer of a form half again as tall as the footer of the
       panel that opened it — the same chrome at two different sizes, one
       keystroke apart. `min-h` rather than `h` so a caller that puts something
       taller in the `children` slot is not clipped by the bar. -->
  <div class="flex min-h-8 shrink-0 items-center gap-3 border-t border-hairline px-3">
    {#if shortcuts.length > 0}
      <ul class="flex min-w-0 shrink items-center gap-x-3 overflow-hidden">
        {#each shortcuts as shortcut (shortcut.keys + shortcut.label)}
          <li>
            <KeyChip keys={shortcut.keys} label={shortcut.label} />
          </li>
        {/each}
      </ul>
    {/if}

    {#if children}
      <div class="min-w-0 flex-1">
        {@render children()}
      </div>
    {:else if message}
      <!-- The status used to take `flex-1` and nothing else, which left it jammed
           against the last chip, where it read as one more shortcut instead of a
           remark about the panel. -->
      <p
        class="min-w-0 truncate text-[11px] leading-4 text-ink-subtle tabular-nums {messageAlign}"
        aria-live="polite"
      >
        {message}
      </p>
    {/if}
  </div>
{/if}
