<script lang="ts">
  import CalendarDay from "$lib/commands/calendar/CalendarDay.svelte";
  import CalendarDetail from "$lib/commands/calendar/CalendarDetail.svelte";
  import { parseCalendarScreen } from "$lib/commands/calendar/parse";
  import { sameDate, type SolarDate } from "$lib/commands/calendar/grid";
  import { i18n } from "$lib/i18n";
  import { calendar } from "$lib/stores/calendar.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { ChevronLeft, ChevronRight } from "@lucide/svelte";

  const screen = $derived(parseCalendarScreen(ui.commandRest));
  const now = $derived(new Date());
  const grid = $derived(calendar.grid(now));

  const monthLabel = $derived(
    i18n.locale === "zh-CN"
      ? i18n.t("calendar.monthTitle", { year: grid.year, month: grid.month })
      : new Intl.DateTimeFormat(i18n.locale, { year: "numeric", month: "long" }).format(
          new Date(grid.year, grid.month - 1, 1),
        ),
  );

  const weekdayLabels = $derived.by(() => {
    // Monday-first names, formatted once for the active locale.
    const fmt = new Intl.DateTimeFormat(i18n.locale, { weekday: "short" });
    // 2026-06-01 is a Monday, so this walks Mon..Sun.
    return Array.from({ length: 7 }, (_, i) =>
      fmt.format(new Date(2026, 5, 1 + i)),
    );
  });

  $effect(() => {
    void calendar.ensureLunar();
  });

  // `cal 20261001` jumps the cursor; do it once per distinct input.
  let lastJump = "";
  $effect(() => {
    if (screen.type !== "jump") {
      lastJump = "";
      return;
    }
    const key = `${screen.date.year}-${screen.date.month}-${screen.date.day}`;
    if (key === lastJump) return;
    lastJump = key;
    calendar.jumpTo(screen.date);
  });

  $effect(() => {
    if (ui.view !== "calendar") calendar.reset();
  });

  function select(date: SolarDate) {
    calendar.select(date);
  }
</script>

<div class="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-1">
  <!-- Month header: arrows are real buttons so the mouse works too. -->
  <div class="flex items-center justify-between gap-2 px-1">
    <button
      type="button"
      class="pressable flex size-8 items-center justify-center rounded-md text-ink-subtle hover:text-ink active:scale-[0.96]"
      aria-label={i18n.t("calendar.prevMonth")}
      onclick={() => calendar.moveMonth(-1)}
    >
      <ChevronLeft class="size-4" strokeWidth={1.5} aria-hidden="true" />
    </button>
    <div class="min-w-0 text-center">
      <span class="block truncate text-[14px] font-medium leading-5 text-ink">{monthLabel}</span>
      {#if grid.lunarYear}
        <span class="block truncate text-[11px] leading-[1.3] text-ink-subtle">
          {i18n.t("calendar.lunarYear", {
            ganZhi: grid.lunarYear.ganZhi,
            zodiac: grid.lunarYear.zodiac,
            days: grid.lunarYear.days,
          })}
        </span>
      {/if}
    </div>
    <button
      type="button"
      class="pressable flex size-8 items-center justify-center rounded-md text-ink-subtle hover:text-ink active:scale-[0.96]"
      aria-label={i18n.t("calendar.nextMonth")}
      onclick={() => calendar.moveMonth(1)}
    >
      <ChevronRight class="size-4" strokeWidth={1.5} aria-hidden="true" />
    </button>
  </div>

  <!-- Weekday header -->
  <div class="mt-2 grid grid-cols-7 gap-1 px-1" aria-hidden="true">
    {#each weekdayLabels as label, index (index)}
      <span class="text-center text-[11px] leading-[1.3] text-ink-subtle">{label}</span>
    {/each}
  </div>

  <!-- Day grid -->
  <div class="mt-1 grid grid-cols-7 gap-1 px-1" role="grid" aria-label={monthLabel}>
    {#each grid.weeks as week, weekIndex (weekIndex)}
      {#each week as cell, dayIndex (`${weekIndex}-${dayIndex}`)}
        <CalendarDay
          {cell}
          selected={cell.day > 0 && sameDate({ year: grid.year, month: grid.month, day: cell.day }, calendar.selected)}
          onselect={() => select({ year: grid.year, month: grid.month, day: cell.day })}
        />
      {/each}
    {/each}
  </div>

  <CalendarDetail date={calendar.selected} />

  <p class="palette-hint">
    {#if screen.type === "invalid"}
      {i18n.t("calendar.invalidDate", { text: screen.text })}
    {:else if calendar.notice}
      {calendar.notice}
    {:else}
      {i18n.t("calendar.footer")}
    {/if}
  </p>
</div>
