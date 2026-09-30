<script lang="ts">
  import { lunarApi } from "$lib/commands/anniversary/lunar";
  import { dateKey, dayDelta, today, type SolarDate } from "$lib/commands/calendar/grid";
  import { calendar } from "$lib/stores/calendar.svelte";
  import { i18n } from "$lib/i18n";

  let { date }: { date: SolarDate } = $props();

  // `lunarReady` is read so the detail recomputes once the tables land.
  const lunar = $derived.by(() => {
    calendar.lunarReady;
    return lunarApi()?.solarToLunar(date) ?? null;
  });

  const monthDays = $derived.by(() => {
    calendar.lunarReady;
    return lunarApi()?.lunarMonthDays(date) ?? 0;
  });

  const weekday = $derived(
    new Intl.DateTimeFormat(i18n.locale, { weekday: "short" }).format(
      new Date(date.year, date.month - 1, date.day),
    ),
  );

  /** Days from today, so the strip answers "how far off is this?". */
  const offset = $derived(dayDelta(today(), date));

  /**
   * One compact line rather than a stacked block: the 600x400 palette leaves
   * about 40px under the grid, and a taller panel pushed this out of view.
   */
  const parts = $derived.by(() => {
    const out: string[] = [weekday];
    if (lunar) {
      out.push(`${lunar.leap ? i18n.t("calendar.leap") : ""}${lunar.monthName}月${lunar.dayName}`);
      out.push(`${lunar.ganZhiYear}${i18n.t("calendar.yearSuffix")} · ${lunar.zodiac}`);
    }
    if (monthDays > 0) out.push(i18n.t("calendar.days", { n: monthDays }));
    if (offset !== 0) {
      out.push(offset > 0 ? i18n.t("calendar.after", { n: offset }) : i18n.t("calendar.before", { n: -offset }));
    }
    return out;
  });
</script>

<div class="mt-1.5 flex items-baseline gap-2 rounded-md bg-surface-1 px-2.5 py-1.5">
  <span class="shrink-0 text-[13px] font-medium leading-4 text-ink tabular-nums">
    {i18n.t("calendar.selected", { year: date.year, month: date.month, day: date.day })}
  </span>
  <span class="min-w-0 flex-1 truncate text-[11px] leading-4 text-ink-subtle">
    {parts.join(" · ")}
  </span>
  <span class="shrink-0 text-[11px] leading-4 text-ink-tertiary tabular-nums">{dateKey(date)}</span>
</div>
