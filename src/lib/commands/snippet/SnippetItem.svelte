<script lang="ts">
  import type { Snippet } from "$lib/commands/types";
  import { FileText, Pencil, Trash2 } from "@lucide/svelte";

  let {
    snippet,
    selected,
    onselect,
    onedit,
    onremove,
  }: {
    snippet: Snippet;
    selected: boolean;
    onselect: () => void;
    onedit: () => void;
    onremove: () => void;
  } = $props();

  let row: HTMLDivElement | undefined = $state();
  const preview = $derived(snippet.sensitive ? "******" : truncate(snippet.content));

  $effect(() => {
    if (selected) row?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });

  function truncate(text: string): string {
    const compact = text.replace(/\s+/g, " ").trim();
    return compact.length > 60 ? `${compact.slice(0, 60)}…` : compact;
  }
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
      <FileText class="size-4" strokeWidth={1.5} aria-hidden="true" />
    </span>
    <span class="min-w-0 flex-1">
      <span class="block truncate text-[14px] font-medium leading-5 text-ink">{snippet.title}</span>
      <span class="block truncate text-[12px] leading-[1.4] text-ink-subtle {snippet.sensitive
        ? 'tracking-[0.2em]'
        : ''}">{preview}</span>
    </span>
    {#if snippet.keyword}
      <kbd class="rounded-sm bg-canvas px-1.5 py-0.5 font-sans text-[12px] text-ink-tertiary">
        {snippet.keyword}
      </kbd>
    {/if}
  </button>
  <button
    type="button"
    class="flex size-10 shrink-0 items-center justify-center rounded-md text-ink-tertiary transition-colors duration-150 ease-out hover:text-ink active:scale-[0.96]"
    aria-label={`编辑 ${snippet.title}`}
    onclick={(event) => {
      event.stopPropagation();
      onedit();
    }}
  >
    <Pencil class="size-4" strokeWidth={1.5} aria-hidden="true" />
  </button>
  <button
    type="button"
    class="flex size-10 shrink-0 items-center justify-center rounded-md text-ink-tertiary transition-colors duration-150 ease-out hover:text-ink active:scale-[0.96]"
    aria-label={`删除 ${snippet.title}`}
    onclick={(event) => {
      event.stopPropagation();
      onremove();
    }}
  >
    <Trash2 class="size-4" strokeWidth={1.5} aria-hidden="true" />
  </button>
</div>
