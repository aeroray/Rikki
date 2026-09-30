import { addDays, addMonths, buildGrid, today, type SolarDate } from "$lib/commands/calendar/grid";
import { ensureLunar } from "$lib/commands/anniversary/lunar";
import { i18n } from "$lib/i18n";

class CalendarStore {
  /** The month currently shown. */
  year = $state(new Date().getFullYear());
  month = $state(new Date().getMonth() + 1);
  /** The highlighted day; drives the detail panel. */
  selected = $state<SolarDate>(today());
  /** Bumped when the lunar tables land so derived grids recompute. */
  lunarReady = $state(false);
  lunarFailed = $state(false);
  notice = $state<string | null>(null);
  private lunarPending: Promise<void> | null = null;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;

  /** Moves the cursor to today, keeping the selection. */
  reset() {
    const now = today();
    this.year = now.year;
    this.month = now.month;
    this.selected = now;
  }

  /** Jumps to a specific date, e.g. from `cal 20261001`. */
  jumpTo(date: SolarDate) {
    this.year = date.year;
    this.month = date.month;
    this.selected = date;
  }

  /** Moves by whole months, carrying the selected day along. */
  moveMonth(delta: number) {
    const next = addMonths({ year: this.year, month: this.month, day: 1 }, delta);
    this.year = next.year;
    this.month = next.month;
    // Keep the selection inside the new month so the detail never goes stale.
    const day = Math.min(this.selected.day, new Date(next.year, next.month, 0).getDate());
    this.selected = { year: next.year, month: next.month, day };
  }

  moveYear(delta: number) {
    this.moveMonth(delta * 12);
  }

  /** Moves the highlight by whole days, following it across month boundaries. */
  moveDay(delta: number) {
    const next = addDays(this.selected, delta);
    this.selected = next;
    this.year = next.year;
    this.month = next.month;
  }

  /** Moves the highlight by whole weeks. */
  moveWeek(delta: number) {
    this.moveDay(delta * 7);
  }

  select(date: SolarDate) {
    this.selected = date;
  }

  grid(now = new Date()) {
    // Reading `lunarReady` makes the grid recompute once the tables arrive.
    this.lunarReady;
    return buildGrid(this.year, this.month, now);
  }

  ensureLunar(): Promise<void> {
    if (this.lunarReady) return Promise.resolve();
    if (!this.lunarPending) {
      this.lunarPending = ensureLunar()
        .then(() => {
          this.lunarReady = true;
          this.lunarFailed = false;
        })
        .catch(() => {
          this.lunarPending = null;
          this.lunarFailed = true;
          this.flash(i18n.t("calendar.lunarFailed"));
        });
    }
    return this.lunarPending;
  }

  private flash(message: string) {
    this.notice = message;
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => {
      this.notice = null;
      this.noticeTimer = null;
    }, 2000);
  }
}

export const calendar = new CalendarStore();
