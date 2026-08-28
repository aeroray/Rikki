<script lang="ts">
  import type { InstalledApp } from "$lib/commands/types";
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
  class="slide-in flex w-full items-center gap-3 rounded-md border-2 px-3 py-2.5 text-left transition-[background-color,border-color,transform] duration-150 ease-out active:scale-[0.96] {selected
    ? 'border-primary-focus/50 bg-surface-2'
    : 'border-transparent hover:bg-surface-2/70'}"
  onclick={onselect}
>
  <span
    class="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-1 text-ink-muted outline outline-1 outline-hairline"
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
    <span class="block truncate text-[14px] font-medium leading-5 text-ink">{app.name}</span>
    <span class="block truncate text-[12px] leading-[1.4] text-ink-subtle">应用</span>
  </span>
</button>
