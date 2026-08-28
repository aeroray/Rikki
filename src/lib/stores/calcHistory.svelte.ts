import { invoke } from "@tauri-apps/api/core";
import type { CalcHistoryEntry } from "$lib/commands/types";

const MAX_ENTRIES = 50;

class CalcHistoryStore {
  entries = $state<CalcHistoryEntry[]>([]);
  private ready: Promise<void>;
  private writes: Promise<void> = Promise.resolve();

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
    } catch {
      this.entries = [];
    }
  }

  private enqueueWrite() {
    this.writes = this.writes
      .then(() => this.write())
      .catch(() => {});
  }

  private async write() {
    try {
      await invoke("save_calc_history", { entries: this.entries });
    } catch {
      // Browser preview has no Tauri runtime.
    }
  }
}

export const calcHistory = new CalcHistoryStore();
