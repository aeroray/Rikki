<script lang="ts">
  import type { Anniversary, Occurrence } from "$lib/commands/anniversary/dates";
  import { countdownLabel, isToday, occurrenceMeta } from "$lib/commands/anniversary/format";
  import { i18n } from "$lib/i18n";
  import { CalendarHeart, Cake, Pencil, Trash2 } from "@lucide/svelte";

  let {
    item,
    occurrence,
    selected,
    onedit,
    onremove,
  }: {
    item: Anniversary;
    occurrence: Occurrence | null;
    selected: boolean;
    onedit: () => void;
    onremove: () => void;
  } = $props();

  let row: HTMLDivElement | undefined = $state();

  const today = $derived(occurrence !== null && isToday(occurrence.days));
  const Icon = $derived(item.calendar === "lunar" ? CalendarHeart : Cake);

  $effect(() => {
    if (selected) row?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
</script>

<!-- `role="presentation"` keeps the option buttons as the listbox's own
     children in the accessibility tree. -->
<div
  bind:this={row}
  class="row-hit flex w-full items-center gap-1 pr-1 {selected ? 'is-selected' : ''}"
  role="presentation"
>
  <button
    type="button"
    id="anniversary-{item.id}"
    role="option"
    aria-selected={selected}
    class="pressable flex min-w-0 flex-1 items-center gap-2 px-4 py-3 text-left active:scale-[0.96]"
    onclick={onedit}
  >
    <span
      class="flex size-8 shrink-0 items-center justify-center rounded-sm {today
        ? 'bg-surface-2 text-primary'
        : 'bg-surface-1 text-ink-muted'}"
    >
      <Icon class="size-4" strokeWidth={1.5} aria-hidden="true" />
    </span>
    <span class="min-w-0 flex-1">
      <span class="block truncate text-[14px] font-medium leading-[1.45] text-ink">{item.title}</span>
      <span class="block truncate text-[12px] font-normal leading-[1.45] text-ink-subtle">
        {occurrenceMeta(item, occurrence)}
      </span>
    </span>
    {#if occurrence}
      <!-- The countdown and the anniversary number describe the same upcoming
           date, so they sit together: "283 天后 / 33 周年" reads as one event.
           Split apart, "33 周年" looked like it might mean the present age. -->
      <span class="flex shrink-0 flex-col items-end gap-0.5">
        <span
          class="text-[13px] leading-5 tabular-nums {today ? 'font-medium text-primary' : 'text-ink-muted'}"
        >
          {countdownLabel(occurrence.days)}
        </span>
        {#if occurrence.ordinal !== null && occurrence.ordinal >= 1}
          <span class="text-[11px] leading-[1.3] tabular-nums text-ink-subtle">
            {i18n.t("anniversary.years", { n: occurrence.ordinal })}
          </span>
        {/if}
      </span>
    {/if}
  </button>
  <button
    type="button"
    class="pressable flex size-10 shrink-0 items-center justify-center rounded-md text-ink-tertiary hover:text-ink active:scale-[0.96]"
    aria-label={i18n.t("anniversary.editItem", { title: item.title })}
    onclick={(event) => {
      event.stopPropagation();
      onedit();
    }}
  >
    <Pencil class="size-4" strokeWidth={1.5} aria-hidden="true" />
  </button>
  <button
    type="button"
    class="pressable flex size-10 shrink-0 items-center justify-center rounded-md text-ink-tertiary hover:text-ink active:scale-[0.96]"
    aria-label={i18n.t("anniversary.deleteItem", { title: item.title })}
    onclick={(event) => {
      event.stopPropagation();
      onremove();
    }}
  >
    <Trash2 class="size-4" strokeWidth={1.5} aria-hidden="true" />
  </button>
</div>
