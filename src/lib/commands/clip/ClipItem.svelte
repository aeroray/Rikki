<script lang="ts">
  import type { ClipboardEntry } from "$lib/commands/types";
  import { convertFileSrc } from "@tauri-apps/api/core";
  import { Clipboard, Image as ImageIcon, Pin, SwatchBook } from "@lucide/svelte";

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

  let broken = $state(false);
  const color = $derived(entry.type === "text" ? detectColor(entry.content) : null);
  const preview = $derived(entry.type === "text" ? truncate(entry.content) : "");
  const isUrl = $derived(entry.type === "text" && /^https?:\/\//i.test(entry.content.trim()));
  const thumb = $derived(entry.type === "image" ? fileSrc(entry.content) : "");
  const dims = $derived(
    entry.width && entry.height ? `${entry.width}×${entry.height}` : "",
  );
  const sizeLabel = $derived(formatSize(entry.size));

  $effect(() => {
    entry.content;
    broken = false;
  });

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

  function fileSrc(path: string): string {
    try {
      return convertFileSrc(path);
    } catch {
      return "";
    }
  }

  function formatSize(bytes?: number): string {
    if (!bytes || bytes <= 0) return "";
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
    aria-label={entry.type === "image" ? `粘贴图片${dims ? ` ${dims}` : ""}` : undefined}
    onclick={onselect}
  >
    {#if entry.type === "image"}
      <span
        class="relative size-10 shrink-0 overflow-hidden rounded-[6px] bg-surface-1 outline outline-1 outline-white/10"
      >
        {#key entry.content}
          {#if thumb && !broken}
            <img
              src={thumb}
              alt=""
              width={entry.width ?? 40}
              height={entry.height ?? 40}
              class="size-full object-cover"
              decoding="async"
              onerror={() => (broken = true)}
            />
          {:else}
            <span class="flex size-full items-center justify-center text-ink-subtle">
              <ImageIcon class="size-4" strokeWidth={1.5} aria-hidden="true" />
            </span>
          {/if}
        {/key}
      </span>
      <span class="min-w-0 flex-1">
        <span class="block truncate text-[13px] leading-5 text-ink">图片</span>
        {#if dims || sizeLabel}
          <span class="block truncate text-[12px] leading-[1.4] text-ink-tertiary tabular-nums">
            {[dims, sizeLabel].filter(Boolean).join(" · ")}
          </span>
        {/if}
      </span>
    {:else if color}
      <span
        class="size-4 shrink-0 rounded-[4px] outline outline-1 outline-white/15"
        style="background-color: {color}"
        aria-hidden="true"
      ></span>
      <SwatchBook class="size-4 shrink-0 text-ink-subtle" strokeWidth={1.5} aria-hidden="true" />
      <span class="min-w-0 flex-1">
        <span class="block truncate font-mono text-[13px] leading-5 text-ink">{preview}</span>
      </span>
    {:else}
      <span class="flex size-4 shrink-0 items-center justify-center text-ink-subtle">
        <Clipboard class="size-4" strokeWidth={1.5} aria-hidden="true" />
      </span>
      <span class="min-w-0 flex-1">
        <span class="block truncate font-mono text-[13px] leading-5 text-ink">{preview}</span>
        {#if isUrl}
          <span class="block text-[12px] leading-[1.4] text-ink-tertiary">链接</span>
        {/if}
      </span>
    {/if}
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
