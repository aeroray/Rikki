<script lang="ts">
  import type { ThemeOption } from "$lib/stores/settings.svelte";
  import { i18n } from "$lib/i18n";
  import { Check, Moon, Sun } from "@lucide/svelte";

  let {
    option,
    selected,
    current,
    onselect,
  }: {
    option: ThemeOption;
    selected: boolean;
    current: boolean;
    onselect: () => void;
  } = $props();

  let row: HTMLButtonElement | undefined = $state();
  const Icon = $derived(option.id === "light" ? Sun : Moon);

  $effect(() => {
    if (selected) row?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
</script>

<button
  bind:this={row}
  type="button"
  id="theme-{option.id}"
  role="option"
  aria-selected={selected}
  class="row-hit flex w-full items-center gap-2 px-4 py-3 text-left active:scale-[0.96]"
  onclick={onselect}
>
  <span class="flex size-8 shrink-0 items-center justify-center rounded-sm bg-surface-1 text-ink-muted">
    <Icon class="size-4" strokeWidth={1.5} aria-hidden="true" />
  </span>
  <span class="min-w-0 flex-1 truncate text-[14px] font-medium leading-[1.45] text-ink">
    {option.name}
    {#if current}
      <span class="ml-1 font-normal text-ink-subtle">{i18n.t("settings.now")}</span>
    {/if}
  </span>
  {#if current}
    <Check class="size-4 shrink-0 text-primary" strokeWidth={2} fill="currentColor" aria-hidden="true" />
  {/if}
</button>
