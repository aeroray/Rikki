import { invoke } from "@tauri-apps/api/core";
import type { CalcHistoryEntry } from "$lib/commands/types";
import { i18n } from "$lib/i18n";
import { ui } from "$lib/stores/ui.svelte";

const MAX_ENTRIES = 50;

class CalcHistoryStore {
  entries = $state<CalcHistoryEntry[]>([]);
  private ready: Promise<void>;
  private writes: Promise<void> = Promise.resolve();
  /**
   * True only once a read actually returned the persisted file.
   * `save_calc_history` replaces that file with the whole in-memory array, so
   * writing after a failed hydration would persist the list we failed to read.
   */
  private hydrated = false;
  private refusedWriteNotified = false;

  constructor() {
    this.ready = this.hydrate();
  }

  add(expression: string, result: string) {
    const expr = expression.trim();
    const value = result.trim();
    if (!expr || !value) return;
    void this.ready.then(() => {
      const latest = this.entries[0];
      if (latest && latest.expression === expr && latest.result === value) return;
      this.entries = [
        {
          id: crypto.randomUUID(),
          expression: expr,
          result: value,
          createdAt: Date.now(),
        },
        ...this.entries,
      ].slice(0, MAX_ENTRIES);
      this.enqueueWrite();
    });
  }

  remove(id: string) {
    void this.ready.then(() => {
      this.entries = this.entries.filter((entry) => entry.id !== id);
      this.enqueueWrite();
    });
  }

  private async hydrate() {
    try {
      this.entries = await invoke<CalcHistoryEntry[]>("get_calc_history");
      this.hydrated = true;
      this.refusedWriteNotified = false;
    } catch {
      // Deliberately keep the in-memory list: overwriting it with [] is what
      // turned a transient read failure into permanent data loss.
      this.hydrated = false;
    }
  }

  private enqueueWrite() {
    this.writes = this.writes
      .then(() => this.write())
      .catch(() => {});
  }

  private async write() {
    if (!this.hydrated) {
      this.notifyRefusedWrite();
      return;
    }
    try {
      await invoke("save_calc_history", { entries: this.entries });
    } catch {
      // Browser preview has no Tauri runtime.
    }
  }

  private notifyRefusedWrite() {
    if (this.refusedWriteNotified) return;
    this.refusedWriteNotified = true;
    // Reuses the generic save-failure text; no calc-specific key exists and new
    // i18n keys are out of scope. Once only, so a notice per calculation does
    // not bury the palette.
    ui.flash(i18n.t("clip.saveFailed"));
  }
}

export const calcHistory = new CalcHistoryStore();
