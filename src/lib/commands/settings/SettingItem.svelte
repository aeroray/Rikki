<script lang="ts">
  import { i18n } from "$lib/i18n";
  import {
    Compass,
    Download,
    Eraser,
    FileJson,
    FolderOpen,
    Globe,
    HardDriveDownload,
    Keyboard,
    KeyRound,
    Languages,
    Palette,
    Timer,
    Upload,
  } from "@lucide/svelte";

  let {
    id,
    title,
    value,
    icon,
    selected,
    onselect,
    current = true,
  }: {
    /** The `aria-activedescendant` target, built from the item id. */
    id: string;
    title: string;
    value: string;
    icon:
      | "Globe"
      | "Compass"
      | "Palette"
      | "Keyboard"
      | "Languages"
      | "KeyRound"
      | "Timer"
      | "Eraser"
      | "Download"
      | "Upload"
      | "FileJson"
      | "HardDriveDownload"
      | "FolderOpen";
    selected: boolean;
    onselect: () => void;
    current?: boolean;
  } = $props();

  const icons = {
    Globe,
    Compass,
    Palette,
    Keyboard,
    Languages,
    KeyRound,
    Download,
    Upload,
    Timer,
    Eraser,
    FileJson,
    HardDriveDownload,
    FolderOpen,
  };
  const Icon = $derived(icons[icon]);
  let row: HTMLButtonElement | undefined = $state();

  $effect(() => {
    if (selected) row?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
</script>

<!-- The id is what `aria-activedescendant` names while the arrows walk the list.
     It comes from the item id, not the title: the title is unique today but
     changes with the interface language, so an id built from it would move. -->
<button
  bind:this={row}
  type="button"
  {id}
  role="option"
  aria-selected={selected}
  class="row-hit flex w-full items-center gap-2 px-4 py-3 text-left active:scale-[0.96]"
  onclick={onselect}
>
  <span class="flex size-8 shrink-0 items-center justify-center rounded-sm bg-surface-1 text-ink-muted">
    <Icon class="size-4" strokeWidth={1.5} aria-hidden="true" />
  </span>
  <span class="min-w-0 flex-1">
    <span class="block truncate text-[14px] font-medium leading-[1.45] text-ink">{title}</span>
        <span class="block truncate text-[12px] font-normal leading-[1.45] text-ink-subtle">{current ? i18n.t("settings.current", { value }) : value}</span>
  </span>
</button>
