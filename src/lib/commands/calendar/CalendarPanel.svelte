<script lang="ts">
  import CalendarDay from "$lib/commands/calendar/CalendarDay.svelte";
  import CalendarDetail from "$lib/commands/calendar/CalendarDetail.svelte";
  import PanelFooter, { type FooterShortcut } from "$lib/components/PanelFooter.svelte";
  import { parseCalendarScreen } from "$lib/commands/calendar/parse";
  import { sameDate, type SolarDate } from "$lib/commands/calendar/grid";
  import { i18n } from "$lib/i18n";
  import { calendar } from "$lib/stores/calendar.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { ChevronLeft, ChevronRight } from "@lucide/svelte";

  const screen = $derived(parseCalendarScreen(ui.commandRest));
  const now = $derived(new Date());
  const grid = $derived(calendar.grid(now));

  /**
   * A month spans 4, 5 or 6 weeks (6 in about a fifth of months, never 7), so a
   * grid sized to its content changes height as you page through months. That
   * pushed the footer out of the 600x400 palette on 6-week months and made the
   * whole panel jump. `grid-rows-6` below pins the grid to six equal rows
   * whatever the month contains, and letting it flex means the rows take the
   * space that is actually left rather than a hard-coded cell height.
   */

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
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2026, 5, 1 + i)));
  });

  // Key glyphs are not translated: they name physical keys, which read the same
  // in every locale.
  const shortcuts = $derived.by((): FooterShortcut[] => [
    { keys: "←→↑↓", label: i18n.t("calendar.keyPick") },
    { keys: "PgUp/PgDn", label: i18n.t("calendar.keyMonth") },
    { keys: "Shift+↑↓", label: i18n.t("calendar.keyYear") },
    { keys: "Home", label: i18n.t("calendar.keyToday") },
    { keys: "Enter", label: i18n.t("calendar.keyCopy") },
  ]);

  const message = $derived(
    screen.type === "invalid"
      ? i18n.t("calendar.invalidDate", { text: screen.text })
      : calendar.notice,
  );

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

<!-- The footer is a sibling of the content column, not inside it, so it stays
     pinned to the bottom no matter how tall the month is. -->
<div class="flex min-h-0 flex-1 flex-col">
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pt-1">
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

    <!-- Day grid: six equal rows whatever the month contains, taking the space
         left over between the weekday header and the detail strip. -->
    <div
      class="mt-1 grid min-h-0 flex-1 grid-cols-7 grid-rows-6 gap-1 px-1"
      role="grid"
      aria-label={monthLabel}
    >
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
  </div>

  <PanelFooter {shortcuts} {message} />
</div>
