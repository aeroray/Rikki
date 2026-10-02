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
  /** Percent of the first disk's space used, which is the volume people watch. */
  diskHistory = $state<number[]>([]);
  /** Bytes per second received, summed across the interfaces. */
  networkDownHistory = $state<number[]>([]);
  /** Bytes per second transmitted, summed across the interfaces. */
  networkUpHistory = $state<number[]>([]);

  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;
  /**
   * The panel's scroll container, while it is open.
   *
   * Held here rather than handled by the panel's own `onkeydown`, because the
   * search field always has focus and key events bubble from it, never through the
   * panel. The palette's key handler is the only thing that sees them, so the
   * scrolling has to be reachable from there.
   */
  viewport: HTMLDivElement | null = null;

  /** Moves the panel by a distance, or a screenful when `page` is set. */
  scroll(direction: 1 | -1, page = false): void {
    const el = this.viewport;
    if (!el) return;
    const distance = page ? el.clientHeight * 0.9 : 48;
    el.scrollBy({ top: direction * distance, behavior: "smooth" });
  }

  scrollTo(edge: "start" | "end"): void {
    const el = this.viewport;
    if (!el) return;
    el.scrollTo({ top: edge === "start" ? 0 : el.scrollHeight, behavior: "smooth" });
  }

  /** Called when the panel mounts. */
  start(): void {
    if (this.timer) return;
    // Started clean: the gap between two openings is not part of the history, and
    // a chart that silently spanned it would be drawing a line through nothing.
    this.cpuHistory = [];
    this.memoryHistory = [];
    this.gpuHistory = {};
    this.diskHistory = [];
    this.networkDownHistory = [];
    this.networkUpHistory = [];
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

    // Every volume added up, matching the figure the chart sits under. It used to
    // track the first disk alone, which drew one volume's line beneath a number
    // that claims to be about the machine — a chart and a figure that disagree are
    // worse than either alone.
    const total = stats.disks.reduce((sum, disk) => sum + disk.total, 0);
    const used = stats.disks.reduce((sum, disk) => sum + (disk.total - disk.free), 0);
    if (total > 0) this.diskHistory = push(this.diskHistory, fill(used, total));

    // Two series rather than one sum: upload and download are different things to
    // watch — a backup saturating the uplink looks nothing like a download — and
    // added together the line cannot say which one moved.
    const down = stats.network.reduce((sum, row) => sum + row.receivedPerSec, 0);
    const up = stats.network.reduce((sum, row) => sum + row.transmittedPerSec, 0);
    this.networkDownHistory = push(this.networkDownHistory, down);
    this.networkUpHistory = push(this.networkUpHistory, up);
  }
}

export const sysmon = new SysmonStore();
