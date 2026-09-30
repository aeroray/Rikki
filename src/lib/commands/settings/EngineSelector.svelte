<script lang="ts">
  import { engineDisplayName, type SearchEngine } from "$lib/commands/settings/engines";
  import { i18n } from "$lib/i18n";
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
  class="row-hit flex w-full items-center gap-1 pr-1 {selected ? 'is-selected' : ''}"
  role="presentation"
>
  <button
    type="button"
    role="option"
    aria-selected={selected}
    class="pressable flex min-w-0 flex-1 items-center gap-2 px-4 py-3 text-left active:scale-[0.96]"
    onclick={onselect}
  >
    <span class="flex size-8 shrink-0 items-center justify-center rounded-sm bg-surface-1 text-ink-muted">
      <Globe class="size-4" strokeWidth={1.5} aria-hidden="true" />
    </span>
    <span class="min-w-0 flex-1 truncate text-[14px] font-medium leading-[1.45] text-ink">
      {engineDisplayName(engine)}
      {#if current}
        <span class="ml-1 font-normal text-ink-subtle">{i18n.t("settings.now")}</span>
      {/if}
    </span>
    {#if current}
      <Check class="size-4 shrink-0 text-primary" strokeWidth={2} fill="currentColor" aria-hidden="true" />
    {/if}
  </button>
  {#if engine.custom && onremove}
    <button
      type="button"
      class="pressable flex size-10 shrink-0 items-center justify-center rounded-md text-ink-tertiary hover:text-ink active:scale-[0.96]"
      aria-label={i18n.t("engine.delete", { name: engine.name })}
      onclick={(event) => {
        event.stopPropagation();
        onremove();
      }}
    >
      <Trash2 class="size-4" strokeWidth={1.5} aria-hidden="true" />
    </button>
  {/if}
</div>
