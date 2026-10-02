import { invoke } from "@tauri-apps/api/core";
import { i18n } from "$lib/i18n";
import { ui } from "$lib/stores/ui.svelte";

/** The five power commands, all of which take a delay. */
export type PowerAction = "lock" | "sleep" | "shutdown" | "restart" | "logout";

/**
 * A scheduled action waiting on its timer.
 *
 * `secondsLeft` comes from Rust rather than being counted down here: the OS holds
 * the timer, and a frontend that decremented its own copy would drift from it and
 * keep counting after a cancel from somewhere else.
 */
type PendingPower = {
  action: PowerAction;
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
   * Bumped whenever the answer on its way back may no longer be wanted.
   *
   * A read is a round trip, and one that started before a schedule finished
   * answers "nothing pending" — which used to be written straight over the timer
   * that had just been set, and stopped the poll with it. That is why the footer
   * only sometimes showed a countdown. A response whose generation is stale is now
   * dropped instead of applied.
   */
  private generation = 0;

  /**
   * Schedules an action, and starts the countdown.
   *
   * The palette is hidden on success: the user has just answered a question that
   * only needed one answer, and the footer carries the countdown from here.
   */
  async schedule(action: PowerAction, seconds: number): Promise<void> {
    try {
      await invoke("schedule_power", { action, seconds });
      ui.beginHide({ reset: true });
      // Restarts the read as well as the interval, so the footer is correct on the
      // next frame rather than up to a second later.
      this.watch();
    } catch (error) {
      ui.flash(i18n.t("power.failed", { reason: String(error) }));
    }
  }

  /** Cancels whatever is pending, including a timer this app did not set. */
  async cancel(): Promise<void> {
    // Before the request, so a read already in flight cannot restore the row we
    // are about to remove.
    this.generation += 1;
    try {
      await invoke("cancel_power");
      ui.flash(i18n.t("power.cancelled"));
    } catch {
      // Nothing was scheduled, which is the state the caller wanted anyway.
    }
    this.stop();
    this.pending = null;
  }

  /**
   * Starts polling and reads once, now.
   *
   * Called on every palette opening as well as after scheduling, because a timer
   * set in an earlier session is still running and the footer should say so.
   */
  watch(): void {
    this.generation += 1;
    if (!this.timer) {
      this.timer = setInterval(() => void this.refresh(), POLL);
    }
    void this.refresh();
  }

  private stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private async refresh(): Promise<void> {
    const mine = this.generation;
    try {
      const pending = await invoke<PendingPower | null>("pending_power");
      // Something newer happened while this was in flight; its answer wins.
      if (mine !== this.generation) return;
      this.pending = pending;
      // Nothing left to count down: stop asking, and the next opening restarts it.
      if (!pending) this.stop();
    } catch {
      if (mine !== this.generation) return;
      // A failed read must not leave a timer polling forever.
      this.stop();
      this.pending = null;
    }
  }
}

export const power = new PowerStore();
