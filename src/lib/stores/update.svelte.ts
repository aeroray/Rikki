import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { i18n } from "$lib/i18n";
import { ui } from "$lib/stores/ui.svelte";

/**
 * How long an answer is trusted before asking again.
 *
 * This app lives in the tray, which is what makes the schedule worth thinking
 * about. "Check on startup" would mean once a week for someone who never quits it,
 * and a timer would mean waking an idle machine to ask a question nobody is
 * waiting for. Instead the check is driven by the palette opening, throttled to
 * this interval: the moment the user is actually here is the only moment the
 * answer can be acted on, and opening the palette twenty times in a day still asks
 * once. Nothing runs while the app sits idle.
 */
const CHECK_INTERVAL = 6 * 60 * 60 * 1000;

/**
 * Checking for a release, installing it in place, and offering it in the footer.
 *
 * The background check is a change from the first version of this, which ran only
 * when the user asked. A launcher that interrupts a keystroke with a card is still
 * the wrong shape; a footer that quietly gains a line is not an interruption, and
 * the footer is already where the app says things without taking the keyboard.
 *
 * Installing is the app's existing destructive-action dialog when it is asked for
 * from the settings row, and a plain press when it comes from the footer: reaching
 * for the shortcut or the button is already an answer to "do you want this?".
 */
class UpdateStore {
  /** The running version, shown on the settings row. */
  version = $state("");
  /** True while a check or an install is in flight, so nothing fires twice. */
  busy = $state(false);
  /** The version waiting to be installed, or null when there is nothing to say. */
  available = $state<string | null>(null);

  private lastCheck = 0;
  /**
   * The `check()` result, held rather than closed.
   *
   * `check` hands back a resource that has to be closed or installed, and this is
   * the only handle to the update the footer is about to offer.
   */
  private pending: Update | null = null;

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

  /**
   * Looks for a release, if it is worth looking.
   *
   * Called when the palette opens, and silent by design: no notice, no dialog, and
   * nothing at all when the answer is "no" or the request fails.
   */
  async checkQuietly(): Promise<void> {
    if (this.pending) return;
    const now = Date.now();
    if (now - this.lastCheck < CHECK_INTERVAL) return;
    // Stamped before the request, so a slow or failing one cannot make every open
    // try again.
    this.lastCheck = now;
    try {
      const found = await check();
      if (!found) return;
      this.pending = found;
      this.available = found.version;
    } catch {
      // Offline, or no release published yet. Nothing to say.
    }
  }

  /** Installs what the footer is offering. */
  async installAvailable(): Promise<void> {
    const found = this.pending;
    if (!found) return;
    this.pending = null;
    this.available = null;
    await this.install(found);
  }

  /** The settings row: asks, then confirms through the dialog. */
  async checkNow(): Promise<void> {
    if (this.busy) return;

    // Already holding an answer from the background check — the dialog is the only
    // thing left to do.
    if (this.pending) {
      const found = this.pending;
      ui.requestConfirm(
        i18n.t("settings.update.action", { version: found.version }),
        () => void this.installHeld(found),
        i18n.t("settings.update.body", { version: found.version }),
      );
      return;
    }

    this.busy = true;
    ui.flash(i18n.t("settings.update.checking"));
    try {
      const found = await check();
      if (!found) {
        ui.flash(i18n.t("settings.update.latest", { version: this.version }));
        this.busy = false;
        return;
      }
      // Cleared before the dialog opens, because cancelling it never reaches
      // `install` — and `install` sets it again for as long as it runs.
      this.busy = false;
      ui.requestConfirm(
        i18n.t("settings.update.action", { version: found.version }),
        () => void this.installHeld(found),
        i18n.t("settings.update.body", { version: found.version }),
      );
    } catch {
      ui.flash(i18n.t("settings.update.failed"));
      this.busy = false;
    }
  }

  private async installHeld(update: Update): Promise<void> {
    this.pending = null;
    this.available = null;
    await this.install(update);
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
