<script lang="ts">
  import type { InstalledApp } from "$lib/commands/types";
  import { i18n } from "$lib/i18n";
  import { convertFileSrc } from "@tauri-apps/api/core";
  import { AppWindow } from "@lucide/svelte";

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
  const iconSrc = $derived(fileSrc(app.icon));

  $effect(() => {
    app.icon;
    broken = false;
  });

  $effect(() => {
    if (selected) row?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });

  function fileSrc(path: string): string {
    if (!path) return "";
    try {
      return convertFileSrc(path);
    } catch {
      return "";
    }
  }
</script>

<button
  bind:this={row}
  id={optionId}
  type="button"
  role="option"
  aria-selected={selected}
  class="row-hit flex w-full items-center gap-2 px-4 py-3 text-left active:scale-[0.96]"
  onclick={onselect}
>
  <span
    class="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-surface-1 text-ink-muted media-outline"
  >
    {#if iconSrc && !broken}
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
