<script lang="ts">
  import type { ClipboardEntry } from "$lib/commands/types";
  import { parseColor } from "$lib/commands/color/parse";
  import { i18n } from "$lib/i18n";
  import { relativeTime } from "$lib/relativeTime";
  import { imagePreviewSrc } from "$lib/commands/clip/preview";
  import { ui } from "$lib/stores/ui.svelte";
  import { Clipboard, Image as ImageIcon, Pin, SwatchBook, ZoomIn } from "@lucide/svelte";

  let {
    entry,
    selected,
    now,
    onselect,
    onpin,
  }: {
    entry: ClipboardEntry;
    selected: boolean;
    now: number;
    onselect: () => void;
    onpin: () => void;
  } = $props();

  let row: HTMLDivElement | undefined = $state();
  let broken = $state(false);
  const color = $derived(entry.type === "text" ? parseColor(entry.content) : null);
  const preview = $derived(entry.type === "text" ? truncate(entry.content) : "");
  const isUrl = $derived(entry.type === "text" && /^https?:\/\//i.test(entry.content.trim()));
  const thumb = $derived(entry.type === "image" ? (imagePreviewSrc(entry) ?? "") : "");
  const dims = $derived(
    entry.width && entry.height ? `${entry.width}×${entry.height}` : "",
  );
  const sizeLabel = $derived(formatSize(entry.size));
  const ago = $derived(relativeTime(entry.createdAt, now));
  const meta = $derived(
    buildMeta(entry.type === "image", dims, sizeLabel, isUrl, entry.appName, ago),
  );

  $effect(() => {
    entry.content;
    broken = false;
  });

  $effect(() => {
    if (selected) {
      row?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  });

  function truncate(text: string): string {
    const compact = text.replace(/\s+/g, " ").trim();
    return compact.length > 60 ? `${compact.slice(0, 60)}…` : compact;
  }

  function openPreview(event: MouseEvent) {
    event.stopPropagation();
    if (!thumb || broken) return;
    ui.imagePreviewSrc = thumb;
  }

  function formatSize(bytes?: number): string {
    if (!bytes || bytes <= 0) return "";
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function buildMeta(
    image: boolean,
    dimensions: string,
    size: string,
    url: boolean,
    appName: string,
    time: string,
  ): string {
    const parts: string[] = [];
    if (appName) parts.push(appName);
    if (image) {
      if (dimensions) parts.push(dimensions);
      if (size) parts.push(size);
    } else if (url) {
      parts.push(i18n.t("clip.link"));
    }
    parts.push(time);
    return parts.join(" · ");
  }
</script>

<div
  bind:this={row}
  class="flex items-center gap-2 rounded-md border-2 px-2 py-1.5 transition-[background-color,border-color] duration-150 ease-out {selected
    ? 'border-primary-focus/50 bg-surface-2'
    : 'border-transparent hover:bg-surface-2/70'}"
>
  {#if entry.type === "image"}
    <button
      type="button"
      class="pressable relative size-10 shrink-0 overflow-hidden rounded-md bg-surface-1 media-outline active:scale-[0.96]"
      aria-label={i18n.t("clip.preview", { dims: dims ? ` ${dims}` : "" })}
      onclick={openPreview}
    >
      {#key entry.content}
        {#if thumb && !broken}
          <img
            src={thumb}
            alt=""
            width={entry.width ?? 40}
            height={entry.height ?? 40}
            class="size-full object-cover"
            loading="lazy"
            decoding="async"
            onerror={() => (broken = true)}
          />
        {:else}
          <span class="flex size-full items-center justify-center text-ink-subtle">
            <ImageIcon class="size-4" strokeWidth={1.5} aria-hidden="true" />
          </span>
        {/if}
      {/key}
      <span
        class="pointer-events-none absolute right-0.5 bottom-0.5 flex size-4 items-center justify-center rounded-[3px] bg-black/70"
      >
        <ZoomIn class="size-2.5 text-white" strokeWidth={2} aria-hidden="true" />
      </span>
    </button>
  {/if}
  <button
    type="button"
    class="pressable flex min-w-0 flex-1 items-center gap-3 rounded-md px-1 py-1 text-left active:scale-[0.96]"
    aria-label={entry.type === "image" ? i18n.t("clip.pasteImage", { dims: dims ? ` ${dims}` : "", ago }) : undefined}
    title={[entry.appName, new Date(entry.createdAt).toLocaleString()].filter(Boolean).join(" · ")}
    onclick={onselect}
  >
    {#if entry.type === "image"}
      <span class="min-w-0 flex-1">
        <span class="block truncate text-[14px] font-medium leading-5 text-ink">{i18n.t("clip.image")}</span>
        <span class="block truncate text-[12px] leading-[1.4] text-ink-tertiary tabular-nums">
          {meta}
        </span>
      </span>
    {:else if color}
      <span
        class="media-outline size-4 shrink-0 rounded-sm"
        style="background-color: {color.rgbaCss}"
        aria-hidden="true"
      ></span>
      <SwatchBook class="size-4 shrink-0 text-ink-subtle" strokeWidth={1.5} aria-hidden="true" />
      <span class="min-w-0 flex-1">
        <span class="block truncate text-[14px] font-medium leading-5 text-ink">{preview}</span>
        <span class="block truncate text-[12px] leading-[1.4] text-ink-tertiary tabular-nums">
          {meta}
        </span>
      </span>
    {:else}
      <span class="flex size-4 shrink-0 items-center justify-center text-ink-subtle">
        <Clipboard class="size-4" strokeWidth={1.5} aria-hidden="true" />
      </span>
      <span class="min-w-0 flex-1">
        <span class="block truncate text-[14px] font-medium leading-5 text-ink">{preview}</span>
        <span class="block truncate text-[12px] leading-[1.4] text-ink-tertiary tabular-nums">
          {meta}
        </span>
      </span>
    {/if}
  </button>
  <button
    type="button"
    class="pressable flex size-10 shrink-0 items-center justify-center rounded-md {entry.pinned
      ? 'text-primary'
      : 'text-ink-tertiary hover:text-ink'} active:scale-[0.96]"
    aria-label={entry.pinned ? i18n.t("clip.unpin") : i18n.t("clip.pin")}
    aria-pressed={entry.pinned}
    onclick={onpin}
  >
    <Pin
      class="size-4"
      strokeWidth={entry.pinned ? 2 : 1.5}
      fill={entry.pinned ? "currentColor" : "none"}
      aria-hidden="true"
    />
  </button>
</div>
