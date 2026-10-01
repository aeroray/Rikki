import { invoke } from "@tauri-apps/api/core";
import type { InstalledApp } from "$lib/commands/types";
import { i18n } from "$lib/i18n";
import { ui } from "$lib/stores/ui.svelte";
import { rankApp } from "$lib/fuzzy";

/**
 * How long a scan answer is trusted before asking again.
 *
 * The Rust side compares a fingerprint of the scan roots and returns the cached
 * list when it matches, so asking is a few directory reads — but a cold scan walks
 * the whole Start Menu and extracts every icon, and the answer cannot change
 * between two openings a second apart.
 */
const REFRESH_INTERVAL = 60_000;

class AppsStore {
  apps = $state<InstalledApp[]>([]);
  private ready: Promise<void>;
  /** Stamped at boot, because that is when the first scan happened. */
  private lastRefresh = Date.now();

  constructor() {
    this.ready = this.hydrate();
  }

  ranked(query: string): Array<{ app: InstalledApp; score: number }> {
    const value = query.trim();
    if (!value) return [];
    return this.apps
      .map((app) => ({
        app,
        score: rankApp(value, app.name, app.alias, app.usageCount ?? 0),
      }))
      .filter((entry) => entry.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          (b.app.usageCount ?? 0) - (a.app.usageCount ?? 0) ||
          a.app.name.localeCompare(b.app.name),
      );
  }

  async launch(path: string): Promise<boolean> {
    try {
      await invoke("launch_app", { path });
      this.apps = this.apps.map((app) =>
        app.path === path ? { ...app, usageCount: (app.usageCount ?? 0) + 1 } : app,
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Opens the app's folder with the file selected.
   *
   * The palette stays open: the point is to look at where the thing lives, not to
   * leave. `reveal_app` refuses a path that has gone, which is the one case worth
   * a notice — the row would otherwise do nothing at all.
   */
  async reveal(path: string): Promise<void> {
    try {
      await invoke("reveal_app", { path });
    } catch {
      ui.flash(i18n.t("app.revealFailed"));
    }
  }

  /**
   * Picks up apps installed or removed while this was running.
   *
   * The list is scanned once and then never looked at again, which is fine for a
   * launcher that is restarted often and wrong for one that lives in the tray: it
   * kept offering shortcuts that had been deleted and missed everything installed
   * since boot. Called when the palette opens, which is the moment the list is
   * about to be read.
   */
  async refresh(): Promise<void> {
    const now = Date.now();
    if (now - this.lastRefresh < REFRESH_INTERVAL) return;
    this.lastRefresh = now;
    try {
      this.apps = await invoke<InstalledApp[]>("refresh_apps");
    } catch {
      // Keep the list we have: it is still the best answer available, and the
      // next opening tries again once the interval has passed.
    }
  }

  private async hydrate() {
    try {
      this.apps = await invoke<InstalledApp[]>("get_installed_apps");
    } catch {
      this.apps = [];
    }
  }

  start() {
    void this.ready;
  }
}

export const apps = new AppsStore();
