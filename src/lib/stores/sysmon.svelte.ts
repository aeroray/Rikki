import { invoke } from "@tauri-apps/api/core";
import type { SysStats } from "$lib/commands/sysmon/types";

/**
 * Sampling the machine, while the panel is open and not otherwise.
 *
 * A poll rather than a push from Rust: one second is the interval a person reads
 * at, the figures have to be re-read to move at all, and the panel is closed most
 * of the time. Nothing runs while it is shut, which matters for an app that lives
 * in the tray.
 */
const INTERVAL = 1000;

class SysmonStore {
  stats = $state<SysStats | null>(null);

  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;

  /** Called when the panel mounts. */
  start(): void {
    if (this.timer) return;
    void this.sample();
    this.timer = setInterval(() => void this.sample(), INTERVAL);
  }

  /** Called when it goes away, so the timer cannot outlive the panel. */
  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private async sample(): Promise<void> {
    // A slow reading must not queue up behind itself. Both CPU and GPU usage are
    // deltas since the previous sample, so overlapping calls would measure an
    // interval nobody chose and make the numbers jump.
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      this.stats = await invoke<SysStats>("system_stats");
    } catch {
      // Keep the last reading: it is still the most recent truth available, and
      // the next tick tries again.
    } finally {
      this.inFlight = false;
    }
  }
}

export const sysmon = new SysmonStore();
