import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { i18n } from "$lib/i18n";
import { ui } from "$lib/stores/ui.svelte";

/**
 * Checking for a release, and installing it in place.
 *
 * The confirmation is the app's existing destructive-action dialog, which is the
 * right shape for this: installing an update replaces the binary that is running
 * and cannot be taken back. The download reports through the palette's notice,
 * because a release is tens of megabytes and a toast that fades after two
 * seconds would leave the user with no idea whether anything is happening.
 *
 * Nothing here runs on its own. A launcher that interrupts a keystroke with an
 * "update available" card is the behaviour this app exists to avoid, so the
 * check is a settings row the user opens on purpose.
 */
class UpdateStore {
  /** The running version, shown on the settings row. */
  version = $state("");
  /** True while a check or an install is in flight, so the row cannot fire twice. */
  busy = $state(false);

  constructor() {
    void getVersion()
      .then((value) => {
        this.version = value;
      })
      .catch(() => {
        // No Tauri runtime, or the command is not permitted: the row then shows
        // no version rather than a wrong one.
      });
  }

  async checkNow(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    ui.flash(i18n.t("settings.update.checking"));
    try {
      const update = await check();
      if (!update) {
        ui.flash(i18n.t("settings.update.latest", { version: this.version }));
        this.busy = false;
        return;
      }
      // Cleared before the dialog opens, because cancelling it never reaches
      // `install` — and `install` sets it again for as long as it runs.
      this.busy = false;
      ui.requestConfirm(
        i18n.t("settings.update.action", { version: update.version }),
        () => void this.install(update),
        i18n.t("settings.update.body", { version: update.version }),
      );
    } catch {
      ui.flash(i18n.t("settings.update.failed"));
      this.busy = false;
    }
  }

  private async install(update: Update): Promise<void> {
    this.busy = true;
    let total = 0;
    let downloaded = 0;
    let shown = -1;
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
          ui.flash(i18n.t("settings.update.downloading", { percent: 0 }));
          return;
        }
        if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          if (total <= 0) return;
          // One notice per whole percent: the event fires per chunk, and a
          // notice per chunk would repaint the palette thousands of times.
          const percent = Math.floor((downloaded / total) * 100);
          if (percent === shown) return;
          shown = percent;
          ui.flash(i18n.t("settings.update.downloading", { percent }));
          return;
        }
        ui.flash(i18n.t("settings.update.installing"));
      });
      // Windows does not get here: the installer takes over and the app exits.
      // Everywhere else the new bundle is on disk but not running yet.
      await relaunch();
    } catch {
      ui.flash(i18n.t("settings.update.failed"));
      this.busy = false;
    }
  }
}

export const update = new UpdateStore();
