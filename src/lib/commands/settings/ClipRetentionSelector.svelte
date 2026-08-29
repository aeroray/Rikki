<script lang="ts">
  import type { ClipRetentionDays } from "$lib/commands/clip/cleanup";
  import { i18n } from "$lib/i18n";
  import { settings } from "$lib/stores/settings.svelte";
  import { Check, Timer } from "@lucide/svelte";

  let {
    days,
    selected,
    current,
    onselect,
  }: {
    days: ClipRetentionDays;
    selected: boolean;
    current: boolean;
    onselect: () => void;
  } = $props();

  let row: HTMLButtonElement | undefined = $state();
  const name = $derived(settings.retentionPrefLabel(days));

  $effect(() => {
    if (selected) row?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
</script>

<button
  bind:this={row}
  type="button"
  role="option"
  aria-selected={selected}
  class="slide-in flex w-full items-center gap-3 rounded-md border-2 px-3 py-2.5 text-left transition-[background-color,border-color,transform] duration-150 ease-out active:scale-[0.96] {selected
    ? 'border-primary-focus/50 bg-surface-2'
    : 'border-transparent hover:bg-surface-2/70'}"
  onclick={onselect}
>
  <span class="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-1 text-ink-muted">
    <Timer class="size-4" strokeWidth={1.5} aria-hidden="true" />
  </span>
  <span class="min-w-0 flex-1 truncate text-[14px] font-medium leading-5 text-ink">
    {name}
    {#if current}
      <span class="ml-1 font-normal text-ink-subtle">{i18n.t("settings.now")}</span>
    {/if}
  </span>
  {#if current}
    <Check class="size-4 shrink-0 text-primary" strokeWidth={2} fill="currentColor" aria-hidden="true" />
  {/if}
</button>
