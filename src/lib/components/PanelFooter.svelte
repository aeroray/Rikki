<script lang="ts">
  import KeyChip from "$lib/components/KeyChip.svelte";

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
  }: {
    shortcuts?: FooterShortcut[];
    /**
     * A note, error or confirmation. Shown alone when there are no shortcuts,
     * and otherwise right-aligned beside them, since a panel often wants both a
     * hint and a remark about the current state.
     */
    message?: string | null;
  } = $props();
</script>

<!-- With neither shortcuts nor a message there is nothing to say, and a bare
     hairline plus padding would just be a stray divider in the most cramped
     states (an empty or invalid panel). -->
{#if shortcuts.length > 0 || message}
  <div class="flex shrink-0 items-center gap-3 border-t border-hairline px-3 py-2">
    {#if shortcuts.length > 0}
      <ul class="flex min-w-0 shrink items-center gap-x-3 overflow-hidden">
        {#each shortcuts as shortcut (shortcut.keys + shortcut.label)}
          <li>
            <KeyChip keys={shortcut.keys} label={shortcut.label} />
          </li>
        {/each}
      </ul>
    {/if}

    {#if message}
      <p
        class="min-w-0 flex-1 truncate text-[11px] leading-4 text-ink-subtle"
        aria-live="polite"
      >
        {message}
      </p>
    {/if}
  </div>
{/if}
