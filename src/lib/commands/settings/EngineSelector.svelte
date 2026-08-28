<script lang="ts">
  import type { SearchEngine } from "$lib/commands/settings/engines";
  import { Check, Globe, Trash2 } from "@lucide/svelte";

  let {
    engine,
    selected,
    current,
    onselect,
    onremove,
  }: {
    engine: SearchEngine;
    selected: boolean;
    current: boolean;
    onselect: () => void;
    onremove?: () => void;
  } = $props();

  let row: HTMLDivElement | undefined = $state();

  $effect(() => {
    if (selected) row?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
</script>

<div
  bind:this={row}
  class="slide-in flex w-full items-center gap-1 rounded-md border-2 pr-1 transition-[background-color,border-color] duration-150 ease-out {selected
    ? 'border-primary-focus/50 bg-surface-2'
    : 'border-transparent hover:bg-surface-2/70'}"
>
  <button
    type="button"
    role="option"
    aria-selected={selected}
    class="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left active:scale-[0.96]"
    onclick={onselect}
  >
    <span class="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-1 text-ink-muted">
      <Globe class="size-4" strokeWidth={1.5} aria-hidden="true" />
    </span>
    <span class="min-w-0 flex-1 truncate text-[14px] font-medium leading-5 text-ink">
      {engine.name}
      {#if current}
        <span class="ml-1 font-normal text-ink-subtle">（当前）</span>
      {/if}
    </span>
    {#if current}
      <Check class="size-4 shrink-0 text-primary" strokeWidth={2} aria-hidden="true" />
    {/if}
  </button>
  {#if engine.custom && onremove}
    <button
      type="button"
      class="flex size-10 shrink-0 items-center justify-center rounded-md text-ink-tertiary transition-colors duration-150 ease-out hover:text-ink active:scale-[0.96]"
      aria-label={`删除 ${engine.name}`}
      onclick={(event) => {
        event.stopPropagation();
        onremove();
      }}
    >
      <Trash2 class="size-4" strokeWidth={1.5} aria-hidden="true" />
    </button>
  {/if}
</div>
