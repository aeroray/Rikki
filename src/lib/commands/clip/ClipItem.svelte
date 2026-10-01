<script lang="ts">
  import type { ClipboardEntry } from "$lib/commands/types";
  import {
    clipFileName,
    clipFilePaths,
    clipKind,
    clipLineCount,
    clipPreview,
    type ClipKind,
  } from "$lib/commands/clip/content";
  import { parseColor } from "$lib/commands/color/parse";
  import { i18n } from "$lib/i18n";
  import { relativeTime } from "$lib/relativeTime";
  import { imagePreviewSrc } from "$lib/commands/clip/preview";
  import { ui } from "$lib/stores/ui.svelte";
  import {
    File as FileIcon,
    FileText,
    Files,
    Image as ImageIcon,
    Link,
    Mail,
    Pin,
    Type,
    ZoomIn,
  } from "@lucide/svelte";

  /**
   * One glyph per kind, and none for the two that carry their own picture: an
   * image shows its thumbnail and a colour shows its swatch, so a glyph beside
   * either would only be saying the same thing twice.
   */
  type IconKind = Exclude<ClipKind, "image" | "color">;
  const KIND_ICON: Record<IconKind, typeof Type> = {
    url: Link,
    email: Mail,
    path: FileIcon,
    files: Files,
    multiline: FileText,
    text: Type,
  };

  /** A line count past this is not worth printing exactly. */
  const LINE_LIMIT = 99;

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

  const kind = $derived(clipKind(entry));
  const KindIcon = $derived(kind === "image" || kind === "color" ? Type : KIND_ICON[kind]);
  const color = $derived(kind === "color" ? parseColor(entry.content) : null);
  const paths = $derived(clipFilePaths(entry));
  const thumb = $derived(entry.type === "image" ? (imagePreviewSrc(entry) ?? "") : "");
  const dims = $derived(entry.width && entry.height ? `${entry.width}×${entry.height}` : "");
  const sizeLabel = $derived(formatSize(entry.size));
  const ago = $derived(relativeTime(entry.createdAt, now));

  const title = $derived.by(() => {
    if (entry.type === "image") return i18n.t("clip.image");
    if (entry.type === "files") return paths[0] ? clipFileName(paths[0]) : "";
    return clipPreview(entry.content);
  });

  const meta = $derived.by(() => {
    const parts: string[] = [];
    if (entry.appName) parts.push(entry.appName);
    if (entry.type === "image") {
      if (dims) parts.push(dims);
      if (sizeLabel) parts.push(sizeLabel);
    } else if (entry.type === "files") {
      parts.push(i18n.t("clip.files", { count: paths.length }));
      if (sizeLabel) parts.push(sizeLabel);
    } else {
      if (kind === "url") parts.push(i18n.t("clip.link"));
      if (kind === "multiline") {
        parts.push(i18n.t("clip.lines", { count: lineLabel(entry.content) }));
      }
    }
    parts.push(ago);
    return parts.join(" · ");
  });

  /**
   * The hover tooltip. A file list is the one kind whose row cannot show what it
   * holds — the title is the first name and the count is in the meta — so the
   * paths go here, where there is room for them.
   */
  const tooltip = $derived.by(() => {
    const when = [entry.appName, new Date(entry.createdAt).toLocaleString()]
      .filter(Boolean)
      .join(" · ");
    if (entry.type !== "files") return when;
    return [pathSummary(paths), when].filter(Boolean).join("\n");
  });

  function pathSummary(list: string[], limit = 10): string {
    if (list.length <= limit) return list.join("\n");
    return [...list.slice(0, limit), "…"].join("\n");
  }

  /** `99+` rather than a number nobody reads, and never a walk over the body. */
  function lineLabel(content: string): string {
    const count = clipLineCount(content, LINE_LIMIT);
    return count > LINE_LIMIT ? `${LINE_LIMIT}+` : String(count);
  }

  $effect(() => {
    entry.content;
    broken = false;
  });

  $effect(() => {
    if (selected) {
      row?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  });

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

  function pasteLabel(): string | undefined {
    if (entry.type === "image") return i18n.t("clip.pasteImage", { dims: dims ? ` ${dims}` : "", ago });
    if (entry.type === "files") return i18n.t("clip.pasteFiles", { count: paths.length, ago });
    return undefined;
  }
</script>

<div
  bind:this={row}
  class="row-hit flex items-center gap-2 px-3 py-2 {selected ? 'is-selected' : ''}"
  role="presentation"
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
    id="clip-{entry.id}"
    role="option"
    aria-selected={selected}
    class="pressable flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left active:scale-[0.96]"
    aria-label={pasteLabel()}
    title={tooltip}
    onclick={onselect}
  >
    {#if entry.type === "image"}
      <span class="min-w-0 flex-1">
        <span class="block truncate text-[14px] font-medium leading-[1.45] text-ink">{title}</span>
        <span class="block truncate text-[12px] font-normal leading-[1.45] text-ink-tertiary tabular-nums">
          {meta}
        </span>
      </span>
    {:else}
      {#if kind === "color"}
        <!-- The swatch is this row's icon: it shows the colour the row holds. -->
        <span
          class="media-outline size-4 shrink-0 rounded-sm"
          style="background-color: {color?.rgbaCss}"
          aria-hidden="true"
        ></span>
      {:else}
        <span class="flex size-4 shrink-0 items-center justify-center text-ink-subtle">
          <KindIcon class="size-4" strokeWidth={1.5} aria-hidden="true" />
        </span>
      {/if}
      <span class="min-w-0 flex-1">
        <span class="block truncate text-[14px] font-medium leading-[1.45] text-ink">{title}</span>
        <span class="block truncate text-[12px] font-normal leading-[1.45] text-ink-tertiary tabular-nums">
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
