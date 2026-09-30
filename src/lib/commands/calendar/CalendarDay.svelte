<script lang="ts">
  import type { CalendarCell } from "$lib/commands/calendar/grid";

  let {
    cell,
    selected,
    onselect,
  }: {
    cell: CalendarCell;
    selected: boolean;
    onselect: () => void;
  } = $props();

  const blank = $derived(cell.day === 0);
  // Today needs a marker that survives on the panel: a surface-1 fill on a
  // surface-1 panel was invisible, so it gets a ring plus the accent colour.
  const todayRing = $derived(cell.isToday && !selected);
</script>

{#if blank}
  <span class="h-8"></span>
{:else}
  <button
    type="button"
    role="gridcell"
    aria-selected={selected}
    aria-current={cell.isToday ? "date" : undefined}
    aria-label={cell.lunarLabel ? `${cell.day} ${cell.lunarLabel}` : String(cell.day)}
    class="relative flex h-8 flex-col items-center justify-center rounded-md transition-colors duration-150 {selected
      ? 'bg-surface-2 text-ink'
      : todayRing
        ? 'text-primary outline outline-1 -outline-offset-1 outline-primary/45 hover:bg-surface-1'
        : 'text-ink hover:bg-surface-1'}"
    onclick={onselect}
  >
    <span
      class="text-[12px] leading-none tabular-nums {cell.isToday && !selected
        ? 'font-medium'
        : ''} {cell.isWeekend && !selected && !cell.isToday
        ? 'text-ink-muted'
        : ''}"
    >
      {cell.day}
    </span>
    {#if cell.lunarLabel}
      <span
        class="mt-px max-w-full truncate px-0.5 text-[9px] leading-none {selected
          ? 'text-ink-subtle'
          : 'text-ink-tertiary'}"
      >
        {cell.lunarLabel}
      </span>
    {/if}
  </button>
{/if}
