/**
 * The shape of one reading, mirroring `src-tauri/src/sysmon.rs`.
 *
 * Bytes and seconds rather than preformatted strings: the panel is the only place
 * that knows how much room a row has, and a number that arrives as text cannot be
 * laid out or abbreviated.
 */
export type SysStats = {
  cpu: {
    /** Percent, 0..100, across every core. */
    usage: number;
    /** Percent per core, in the order the system reports them. */
    perCore: number[];
    /** MHz. */
    frequency: number;
    brand: string;
    cores: number;
  };
  memory: {
    /** Bytes. */
    total: number;
    used: number;
    swapTotal: number;
    swapUsed: number;
  };
  gpus: Array<{
    name: string;
    /** What kind of adapter it is, so the panel can say which is which. */
    kind: "discrete" | "integrated" | "unknown";
    /** Percent, 0..100, or null when the platform cannot say. */
    usage: number | null;
  }>;
  system: {
    name: string;
    osVersion: string;
    kernel: string;
    hostname: string;
    /** Seconds since boot. */
    uptime: number;
  };
  processes: Array<{
    pid: number;
    name: string;
    cpu: number;
    /** Bytes. */
    memory: number;
  }>;
};
