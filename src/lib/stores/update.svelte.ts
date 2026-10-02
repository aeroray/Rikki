import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { i18n } from "$lib/i18n";
import { ui } from "$lib/stores/ui.svelte";

/**
 * How long after the process starts the launch check runs.
 *
 * Not at once: the first seconds of a launch belong to the window, the tray and
 * the Start Menu scan, and a request competing with them buys nothing — the
 * answer is not wanted until the palette comes up anyway.
 */
const STARTUP_DELAY = 3_000;

/**
 * How long an answer is trusted before asking again.
 *
 * This app lives in the tray, which is what makes the schedule worth thinking
 * about. "Check on startup" alone would mean once a week for someone who never
 * quits it, and a timer would mean waking an idle machine to ask a question
 * nobody is waiting for. So there are two triggers and this is the throttle on
 * the second one: the launch check (`start`) runs once per process, and the
 * palette opening asks again only once this much time has passed. Opening the
 * palette twenty times in a day still asks once, and nothing runs while the app
 * sits idle.
 */
const CHECK_INTERVAL = 6 * 60 * 60 * 1000;

/**
 * A one-line reason for a failed check, for the notice the settings row shows.
 *
 * An unreachable network, a release that is not there and a rejected signature
 * all arrive as the same kind of value, so the text is all there is to go on.
 * It is flattened and truncated because a `reqwest` error carries a URL and a
 * source chain, and the notice is a two-line box in a 600px palette.
 */
function describeError(error: unknown): string {
  const text = (error instanceof Error ? error.message : String(error))
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "unknown";
  return text.length > 140 ? `${text.slice(0, 139)}…` : text;
}

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
   * True while a background check is in flight.
   *
   * `lastCheck` alone is not enough to keep two overlapping checks apart, and a
   * second `Update` that nobody installs holds a Rust-side resource until it is
   * closed.
   */
  private checking = false;
  /**
   * The `check()` result, held rather than closed.
   *
   * `check` hands back a resource that has to be closed or installed, and this is
   * the only handle to the update the footer is about to offer.
   */
  private pending: Update | null = null;
  /**
   * True once the launch check has been armed.
   *
   * The palette is shown many times per process, but the launch check is one per
   * process: `start()` is called from the one `onMount` that owns the window, and
   * a second call would only schedule a second timer.
   */
  private started = false;
  /**
   * The release the user closed from the bar, read from `settings.json`.
   *
   * Held here rather than on the settings store because this is the only thing
   * that reads it, and the settings store already imports this one — reaching
   * back the other way would be a cycle.
   */
  private dismissed = "";
  /** The one in-flight read of `dismissed`, shared by both triggers. */
  private dismissedLoad: Promise<void> | null = null;

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
   * The check nobody asked for: one per launch, in the background.
   *
   * This is what makes a release knowable without the user going looking for one.
   * The palette opening used to be the only trigger, which meant an update could
   * only be discovered by the act of searching for something else — and a
   * launcher left in the tray for a week was never told at all. The answer is
   * held on the store, and `UpdateBar` shows it the next time the palette comes
   * up, below the countdown bar if a power action is pending.
   *
   * Deliberately outside `CHECK_INTERVAL`: that interval exists so that opening
   * the palette twenty times in a day still asks once, and the first check of a
   * process is not a repeat of anything. It does stamp `lastCheck`, so the
   * palette opening just after a launch does not ask again.
   */
  start(): void {
    if (this.started) return;
    this.started = true;
    setTimeout(() => void this.launchCheck(), STARTUP_DELAY);
  }

  /**
   * The launch check, and the one place the dismissal has to be read first.
   *
   * The palette's own checks run long after the store was hydrated, but this one
   * fires into a process that may not have read `settings.json` yet — and a
   * release the user closed last week must not reappear in the seconds after a
   * launch, which is exactly the "it keeps coming back" complaint the close
   * button exists to answer.
   */
  private async launchCheck(): Promise<void> {
    await this.ensureDismissed();
    if (this.pending || this.checking) return;
    this.lastCheck = Date.now();
    await this.run();
  }

  /**
   * Reads the dismissal once, whichever trigger gets there first.
   *
   * Both triggers have to wait for it, not just the launch one: the palette can
   * be opened inside the three seconds before the launch timer fires, and that
   * check would otherwise compare against an empty string and announce a release
   * the user had already closed.
   */
  private ensureDismissed(): Promise<void> {
    this.dismissedLoad ??= this.loadDismissed();
    return this.dismissedLoad;
  }

  private async loadDismissed(): Promise<void> {
    try {
      const settings = await invoke<{ dismissedUpdateVersion?: string }>("get_settings");
      this.dismissed = settings.dismissedUpdateVersion?.trim() ?? "";
    } catch {
      // No runtime, or the command is not permitted. Nothing is dismissed, which
      // is the same answer as a fresh install.
      this.dismissed = "";
    }
  }

  /**
   * Looks for a release, if it is worth looking.
   *
   * Called when the palette opens, and silent by design: no notice, no dialog, and
   * nothing at all when the answer is "no" or the request fails.
   */
  async checkQuietly(): Promise<void> {
    if (this.pending || this.checking) return;
    const now = Date.now();
    if (now - this.lastCheck < CHECK_INTERVAL) return;
    // Stamped before the request, so a slow or failing one cannot make every open
    // try again.
    this.lastCheck = now;
    await this.ensureDismissed();
    await this.run();
  }

  /**
   * The request itself, shared by both triggers.
   *
   * The `pending`/`checking` guard is repeated here rather than only in the two
   * callers, because the launch check reaches this from a timer: a palette
   * opening in the seconds before that timer fires would otherwise start a second
   * request, and the loser's `Update` would be dropped without being closed.
   */
  private async run(): Promise<void> {
    if (this.pending || this.checking) return;
    this.checking = true;
    try {
      const found = await check();
      if (!found) return;
      this.pending = found;
      // Held either way, so the settings row can still offer it: closing the
      // notice means "stop telling me", not "never install this".
      if (found.version !== this.dismissed) this.available = found.version;
    } catch (error) {
      // Offline, no release published yet, or an endpoint that answers 404 — the
      // plugin reports all three as one error, and a background check that was
      // never asked for must not interrupt with it. The console line is for
      // whoever has to work out why nothing is ever offered; the settings row
      // prints the same reason when the user asks on purpose.
      console.warn("rikki: update check failed:", describeError(error));
    } finally {
      // Cleared in a `finally`, not after the `await`: two palette openings a
      // second apart while the first request is still in flight both passed the
      // stamp check, and the loser's `Update` was dropped without being closed.
      this.checking = false;
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

  /**
   * Closes the bar, and remembers which release it was about.
   *
   * The held `Update` is kept rather than closed: the user said "not now", not
   * "not ever", and the settings row's own check still has to be able to offer
   * it — that path goes through the confirmation dialog and never touches
   * `available`. Only the version is written down, so the next release is
   * announced as usual.
   */
  async dismiss(): Promise<void> {
    const version = this.available;
    this.available = null;
    if (!version) return;
    this.dismissed = version;
    try {
      await invoke("update_setting", { key: "dismissedUpdateVersion", value: version });
    } catch {
      // A write that failed only means the bar comes back on the next launch;
      // the one the user just closed stays closed for this session either way.
    }
  }

  /** The settings row: asks, then confirms through the dialog. */
  async checkNow(): Promise<void> {
    if (this.busy || this.checking) return;

    // Already holding an answer from the background check — the dialog is the only
    // thing left to do.
    if (this.pending) {
      this.confirmHeld();
      return;
    }

    this.checking = true;
    ui.flash(i18n.t("settings.update.checking"));
    try {
      const found = await check();
      if (!found) {
        ui.flash(i18n.t("settings.update.latest", { version: this.version }));
        return;
      }
      this.pending = found;
      this.confirmHeld();
    } catch (error) {
      // The reason, not just "failed": this row is the one place the user asks on
      // purpose, and a check that has never once succeeded is undiagnosable from
      // a notice that says only that it did not.
      console.warn("rikki: update check failed:", describeError(error));
      ui.flash(i18n.t("settings.update.failedReason", { reason: describeError(error) }));
    } finally {
      this.checking = false;
    }
  }

  /**
   * Asks about the held update, and closes it if the user says no.
   *
   * The `Update` holds a resource on the Rust side, so a cancelled dialog has to
   * give it back — the confirm dialog is generic and knows nothing about it, and
   * cancelling used to drop the handle silently.
   */
  private confirmHeld(): void {
    const found = this.pending;
    if (!found) return;
    ui.requestConfirm(
      i18n.t("settings.update.action", { version: found.version }),
      () => void this.installHeld(found),
      i18n.t("settings.update.body", { version: found.version }),
      () => this.discard(),
    );
  }

  /** Gives back a held update nobody is going to install. */
  private discard(): void {
    const found = this.pending;
    this.pending = null;
    this.available = null;
    void found?.close().catch(() => {
      // Nothing to do about it: the resource is going away with the process anyway.
    });
  }

  private async installHeld(update: Update): Promise<void> {
    // Cleared without closing: this is the path that consumes the resource.
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
