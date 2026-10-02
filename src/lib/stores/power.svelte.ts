import { invoke } from "@tauri-apps/api/core";
import { i18n } from "$lib/i18n";
import { ui } from "$lib/stores/ui.svelte";

/**
 * A shutdown or restart waiting on its timer.
 *
 * `secondsLeft` comes from Rust rather than being counted down here: the OS holds
 * the timer, and a frontend that decremented its own copy would drift from it and
 * keep counting after a cancel from somewhere else.
 */
type PendingPower = {
  action: "shutdown" | "restart";
  secondsLeft: number;
};

/**
 * How often the countdown is re-read while one is pending.
 *
 * Once a second, because that is the unit the footer shows under a minute and the
 * only one that visibly moves. The poll stops as soon as there is nothing pending,
 * so a launcher that is idle pays nothing for this.
 */
const POLL = 1000;

class PowerStore {
  pending = $state<PendingPower | null>(null);

  private timer: ReturnType<typeof setInterval> | null = null;

  /**
   * Schedules a shutdown or restart, and starts the countdown.
   *
   * The palette is hidden on success: the user has just answered a question that
   * only needed one answer, and the footer will carry the countdown from here.
   */
  async schedule(action: "shutdown" | "restart", seconds: number): Promise<void> {
    try {
      await invoke("schedule_power", { action, seconds });
      ui.beginHide({ reset: true });
      this.watch();
    } catch (error) {
      ui.flash(i18n.t("power.failed", { reason: String(error) }));
    }
  }

  /** Cancels whatever is pending, including a timer this app did not set. */
  async cancel(): Promise<void> {
    try {
      await invoke("cancel_power");
      this.stop();
      this.pending = null;
      ui.flash(i18n.t("power.cancelled"));
    } catch {
      // Nothing was scheduled, which is the state the caller wanted anyway.
      this.stop();
      this.pending = null;
    }
  }

  /**
   * Starts polling, if it is not already.
   *
   * Called on every palette opening as well as after scheduling, because a timer
   * set in a previous session is still running and the footer should say so.
   */
  watch(): void {
    if (this.timer) return;
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), POLL);
  }

  private stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private async refresh(): Promise<void> {
    try {
      const pending = await invoke<PendingPower | null>("pending_power");
      this.pending = pending;
      // Nothing left to count down: stop asking, and the next opening restarts it.
      if (!pending) this.stop();
    } catch {
      // A failed read must not leave a timer polling forever.
      this.stop();
      this.pending = null;
    }
  }
}

export const power = new PowerStore();
