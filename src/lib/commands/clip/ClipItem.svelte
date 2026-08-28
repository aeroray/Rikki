<script lang="ts">
  import type { ClipboardEntry } from "$lib/commands/types";
  import { Clipboard, Pin, SwatchBook } from "@lucide/svelte";

  let {
    entry,
    selected,
    onselect,
    onpin,
  }: {
    entry: ClipboardEntry;
    selected: boolean;
    onselect: () => void;
    onpin: () => void;
  } = $props();

  const color = $derived(detectColor(entry.content));
  const preview = $derived(truncate(entry.content));
  const isUrl = $derived(/^https?:\/\//i.test(entry.content.trim()));

  function detectColor(content: string): string | null {
    const value = content.trim();
    if (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)) return value;
    if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(value)) {
      return value;
    }
    if (/^hsla?\(\s*-?\d+(?:\.\d+)?\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(value)) {
      return value;
    }
    return null;
  }

  function truncate(text: string): string {
    const compact = text.replace(/\s+/g, " ").trim();
    return compact.length > 60 ? `${compact.slice(0, 60)}…` : compact;
  }
</script>

<div
  class="flex items-center gap-2 rounded-md border-2 px-2 py-1.5 transition-[background-color,border-color] duration-150 ease-out {selected
    ? 'border-primary-focus/50 bg-surface-2'
    : 'border-transparent hover:bg-surface-2/70'}"
>
  <button
    type="button"
    class="flex min-w-0 flex-1 items-center gap-3 rounded-md px-1 py-1 text-left active:scale-[0.96]"
    onclick={onselect}
  >
    {#if color}
      <span
        class="size-4 shrink-0 rounded-[4px] outline outline-1 outline-white/15"
        style="background-color: {color}"
        aria-hidden="true"
      ></span>
      <SwatchBook class="size-4 shrink-0 text-ink-subtle" strokeWidth={1.5} aria-hidden="true" />
    {:else}
      <span class="flex size-4 shrink-0 items-center justify-center text-ink-subtle">
        <Clipboard class="size-4" strokeWidth={1.5} aria-hidden="true" />
      </span>
    {/if}
    <span class="min-w-0 flex-1">
      <span class="block truncate font-mono text-[13px] leading-5 text-ink">{preview}</span>
      {#if isUrl}
        <span class="block text-[12px] leading-[1.4] text-ink-tertiary">链接</span>
      {/if}
    </span>
  </button>
  <button
    type="button"
    class="flex size-10 shrink-0 items-center justify-center rounded-md transition-colors duration-150 ease-out {entry.pinned
      ? 'text-primary'
      : 'text-ink-tertiary hover:text-ink'}"
    aria-label={entry.pinned ? "取消固定" : "固定"}
    aria-pressed={entry.pinned}
    onclick={onpin}
  >
    <Pin class="size-4" strokeWidth={1.5} aria-hidden="true" />
  </button>
</div>
