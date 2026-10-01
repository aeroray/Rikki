<script lang="ts">
  import type { InstalledApp } from "$lib/commands/types";
  import { i18n } from "$lib/i18n";
  import { assetUrl } from "$lib/assetUrl";
  import { apps } from "$lib/stores/apps.svelte";
  import { AppWindow, FolderOpen } from "@lucide/svelte";

  let {
    app,
    selected,
    onselect,
    optionId,
  }: {
    app: InstalledApp;
    selected: boolean;
    onselect: () => void;
    optionId: string;
  } = $props();

  let row: HTMLButtonElement | undefined = $state();
  let broken = $state(false);
  const iconSrc = $derived(assetUrl(app.icon));
  const hasIcon = $derived(Boolean(iconSrc) && !broken);

  $effect(() => {
    app.icon;
    broken = false;
  });

  $effect(() => {
    if (selected) row?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
</script>

<!-- `role="presentation"` keeps the option button as the listbox's own child in
     the accessibility tree, the way the clipboard rows do. The wrapper is a `div`
     rather than a button because a button cannot hold another one, and it is a
     `group` so the folder button can appear on hover. -->
<div
  class="group row-hit flex items-center gap-2 pr-1 {selected ? 'is-selected' : ''}"
  role="presentation"
>
  <button
    bind:this={row}
    id={optionId}
    type="button"
    role="option"
    aria-selected={selected}
    class="pressable flex min-w-0 flex-1 items-center gap-2 px-4 py-3 text-left active:scale-[0.96]"
    onclick={onselect}
  >
    <!-- The tile is the design's stand-in for a glyph. An extracted icon is a
         transparent PNG with a shape of its own, so it is drawn straight onto the
         canvas: an opaque tile behind it is a white square in light mode. -->
    <span
      class="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-sm text-ink-muted {hasIcon
        ? ''
        : 'bg-surface-1'}"
    >
      {#if hasIcon}
        <img
          src={iconSrc}
          alt=""
          width="32"
          height="32"
          class="size-full object-cover"
          decoding="async"
          onerror={() => (broken = true)}
        />
      {:else}
        <AppWindow class="size-4" strokeWidth={1.5} aria-hidden="true" />
      {/if}
    </span>
    <span class="min-w-0 flex-1">
      <span class="block truncate text-[14px] font-medium leading-[1.45] text-ink">{app.name}</span>
      <span class="block truncate text-[12px] font-normal leading-[1.45] text-ink-subtle">{i18n.t("app.kind")}</span>
    </span>
  </button>
  <!-- The keyboard's row shows it, and so does a mouse hovering the row: the app
       is keyboard-first, not keyboard-only. It stays in the layout at
       `opacity-0` rather than appearing, so the row's text does not shift when it
       fades in. No shortcut either — the footer is for keys people press often. -->
  <button
    type="button"
    class="pressable flex size-8 shrink-0 items-center justify-center rounded-md text-ink-tertiary hover:text-ink active:scale-[0.96] {selected
      ? 'opacity-100'
      : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}"
    aria-label={i18n.t("app.reveal", { name: app.name })}
    onclick={(event) => {
      event.stopPropagation();
      void apps.reveal(app.path);
    }}
  >
    <FolderOpen class="size-4" strokeWidth={1.5} aria-hidden="true" />
  </button>
</div>
