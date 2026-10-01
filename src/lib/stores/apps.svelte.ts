import { invoke } from "@tauri-apps/api/core";
import type { InstalledApp } from "$lib/commands/types";
import { i18n } from "$lib/i18n";
import { ui } from "$lib/stores/ui.svelte";
import { rankApp } from "$lib/fuzzy";

class AppsStore {
  apps = $state<InstalledApp[]>([]);
  private ready: Promise<void>;

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
