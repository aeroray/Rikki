<script lang="ts">
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
    /** Replaces the shortcuts when set, e.g. an error or a confirmation. */
    message?: string | null;
  } = $props();
</script>

<div
  class="flex shrink-0 items-center gap-3 border-t border-hairline px-3 py-2"
  role="status"
  aria-live="polite"
>
  {#if message}
    <p class="min-w-0 flex-1 truncate text-[11px] leading-4 text-ink-subtle">{message}</p>
  {:else}
    <ul class="flex min-w-0 flex-1 items-center gap-x-3 overflow-hidden">
      {#each shortcuts as shortcut (shortcut.keys + shortcut.label)}
        <li class="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
          <kbd
            class="rounded bg-surface-2 px-1.5 py-[3px] font-sans text-[10px] leading-none text-ink-muted"
          >
            {shortcut.keys}
          </kbd>
          <span class="text-[11px] leading-4 text-ink-subtle">{shortcut.label}</span>
        </li>
      {/each}
    </ul>
  {/if}
</div>
