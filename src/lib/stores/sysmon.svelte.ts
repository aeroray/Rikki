import { invoke } from "@tauri-apps/api/core";
import { fill } from "$lib/commands/sysmon/format";
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

/**
 * How many samples the charts keep — one a second, so a minute of history.
 *
 * A minute is what the panel has room for at this width and what the eye reads
 * without a time axis. Longer windows need downsampling and a legend, which is a
 * different kind of chart from a glance.
 */
const HISTORY = 60;

/** Append, dropping the oldest once the window is full. */
function push(values: number[], value: number): number[] {
  const next = values.length >= HISTORY ? values.slice(1) : values.slice();
  next.push(value);
  return next;
}

class SysmonStore {
  stats = $state<SysStats | null>(null);
  /** Percentages, oldest first. */
  cpuHistory = $state<number[]>([]);
  memoryHistory = $state<number[]>([]);
  /** Percentages per GPU, keyed by the name the panel shows. */
  gpuHistory = $state<Record<string, number[]>>({});

  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;

  /** Called when the panel mounts. */
  start(): void {
    if (this.timer) return;
    // Started clean: the gap between two openings is not part of the history, and
    // a chart that silently spanned it would be drawing a line through nothing.
    this.cpuHistory = [];
    this.memoryHistory = [];
    this.gpuHistory = {};
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
      const stats = await invoke<SysStats>("system_stats");
      this.stats = stats;
      this.record(stats);
    } catch {
      // Keep the last reading: it is still the most recent truth available, and
      // the next tick tries again.
    } finally {
      this.inFlight = false;
    }
  }

  private record(stats: SysStats): void {
    this.cpuHistory = push(this.cpuHistory, stats.cpu.usage);
    // Memory as a share of the total, because the total does not move and a line
    // drawn in bytes would sit flat against the top of the box.
    this.memoryHistory = push(this.memoryHistory, fill(stats.memory.used, stats.memory.total));

    // Rebuilt rather than written into: `$state` tracks this object by identity,
    // and mutating a property of it is not a change it can see.
    const next: Record<string, number[]> = {};
    for (const gpu of stats.gpus) {
      next[gpu.name] = push(this.gpuHistory[gpu.name] ?? [], gpu.usage ?? 0);
    }
    this.gpuHistory = next;
  }
}

export const sysmon = new SysmonStore();
