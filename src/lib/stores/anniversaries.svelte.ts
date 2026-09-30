import { invoke } from "@tauri-apps/api/core";
import {
  draftFrom,
  emptyDraft,
  parseDateQuery,
  sortByOccurrence,
  type Anniversary,
  type AnniversaryDraft,
  type Occurrence,
} from "$lib/commands/anniversary/dates";
import { ensureLunar as loadLunarTables } from "$lib/commands/anniversary/lunar";
import { i18n } from "$lib/i18n";
import { ui } from "$lib/stores/ui.svelte";

export type AnniversaryRow = {
  item: Anniversary;
  occurrence: Occurrence | null;
};

class AnniversaryStore {
  items = $state<Anniversary[]>([]);
  selectedIndex = $state(0);
  draft = $state<AnniversaryDraft | null>(null);
  /** Set while editing an existing row; `null` means the draft is a new one. */
  editingId = $state<string | null>(null);
  /** Drives the panel's re-derive when the lunar tables finish loading. */
  lunarReady = $state(false);
  lunarFailed = $state(false);
  notice = $state<string | null>(null);
  private ready: Promise<void>;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  private lunarPending: Promise<void> | null = null;

  constructor() {
    this.ready = this.hydrate();
  }

  /** Soonest first. `now` is passed in so the list shares one clock reading. */
  sorted(now: Date): AnniversaryRow[] {
    return sortByOccurrence(this.items, now);
  }

  clampSelection(count: number) {
    if (this.selectedIndex < 0) this.selectedIndex = 0;
    if (count === 0) {
      this.selectedIndex = 0;
      return;
    }
    if (this.selectedIndex >= count) this.selectedIndex = count - 1;
  }

  /**
   * Loads the lunar tables once, on demand. Solar-only users never pay for the
   * ~30KB of tables, and a failed import stays retryable.
   */
  ensureLunar(): Promise<void> {
    if (this.lunarReady) return Promise.resolve();
    if (!this.lunarPending) {
      this.lunarPending = loadLunarTables()
        .then(() => {
          this.lunarReady = true;
          this.lunarFailed = false;
        })
        .catch(() => {
          this.lunarPending = null;
          this.lunarFailed = true;
          ui.flash(i18n.t("anniversary.lunarFailed"));
        });
    }
    return this.lunarPending;
  }

  /** True while a lunar row exists but its tables have not arrived yet. */
  get awaitingLunar(): boolean {
    return !this.lunarReady && this.items.some((item) => item.calendar === "lunar");
  }

  openCreate(dateText = "") {
    this.editingId = null;
    this.draft = emptyDraft(dateText);
    ui.focusField = "anniversary-title";
  }

  openEdit(item: Anniversary) {
    this.editingId = item.id;
    this.draft = draftFrom(item);
    ui.focusField = "anniversary-title";
  }

  closeDraft() {
    this.draft = null;
    this.editingId = null;
    ui.focusField = "search";
  }

  async reload() {
    await this.hydrate();
  }

  async saveDraft(): Promise<boolean> {
    const draft = this.draft;
    if (!draft) return false;
    const title = draft.title.trim();
    if (!title) return false;

    // The single date field carries the calendar and the start year too, so it
    // is parsed once here rather than mirrored across separate inputs.
    const query = parseDateQuery(draft.dateText);
    if (query.kind !== "date") {
      this.flash(i18n.t("anniversary.invalidDate"));
      return false;
    }

    await this.ready;
    const payload = {
      title,
      month: query.month,
      day: query.day,
      calendar: query.calendar,
      // Explicit from the input (`nr…`), never guessed: a year whose leap month
      // is the 5th leaves "month 5" ambiguous between regular and leap.
      leapMonth: query.leapMonth,
      startYear: query.year,
    };

    try {
      const editing = this.editingId;
      const saved = editing
        ? await invoke<Anniversary>("update_anniversary", { id: editing, ...payload })
        : await invoke<Anniversary>("create_anniversary", payload);
      this.items = editing
        ? this.items.map((item) => (item.id === editing ? saved : item))
        : [saved, ...this.items];
      this.closeDraft();
      this.flash(
        editing
          ? i18n.t("anniversary.updated", { title: saved.title })
          : i18n.t("anniversary.created", { title: saved.title }),
      );
      // A lunar row cannot show a countdown until the tables are in.
      if (saved.calendar === "lunar") void this.ensureLunar();
      return true;
    } catch {
      this.flash(i18n.t("anniversary.saveFailed"));
      return false;
    }
  }

  async remove(id: string): Promise<boolean> {
    await this.ready;
    const current = this.items.find((item) => item.id === id);
    try {
      await invoke("delete_anniversary", { id });
      this.items = this.items.filter((item) => item.id !== id);
      if (this.editingId === id) this.closeDraft();
      this.clampSelection(this.items.length);
      this.flash(
        current
          ? i18n.t("anniversary.deleted", { title: current.title })
          : i18n.t("anniversary.deletedGeneric"),
      );
      return true;
    } catch {
      this.flash(i18n.t("anniversary.deleteFailed"));
      return false;
    }
  }

  private async hydrate() {
    try {
      const loaded = await invoke<Anniversary[]>("get_anniversaries");
      // Normalise rows written by an older build.
      this.items = loaded.map((item) => ({
        ...item,
        calendar: item.calendar === "lunar" ? "lunar" : "solar",
        leapMonth: Boolean(item.leapMonth),
        startYear: item.startYear ?? null,
      }));
      if (this.items.some((item) => item.calendar === "lunar")) void this.ensureLunar();
    } catch {
      this.items = [];
    }
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

export const anniversaries = new AnniversaryStore();
