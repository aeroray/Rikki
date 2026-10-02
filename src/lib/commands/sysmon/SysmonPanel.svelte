<script lang="ts">
  import Sparkline from "$lib/commands/sysmon/Sparkline.svelte";
  import { bytes, duration, fill, percent, rate, shortBrand, volumeLabel } from "$lib/commands/sysmon/format";
  import PanelFooter, { type FooterShortcut } from "$lib/components/PanelFooter.svelte";
  import ScrollArea from "$lib/components/ScrollArea.svelte";
  import { i18n } from "$lib/i18n";
  import { sysmon } from "$lib/stores/sysmon.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { onDestroy } from "svelte";

  /**
   * Sampling follows the palette being *open*, not this component being mounted.
   *
   * Hiding the palette only fades the shell — the panel stays mounted, and for a
   * tray app hidden is the normal state, so tying the timer to mount/unmount left
   * it reading the machine every second forever. `ui.shellOpen` is the real signal,
   * and it is also what the renderer already animates on.
   */
  $effect(() => {
    if (ui.shellOpen && ui.view === "sysmon") sysmon.start();
    else sysmon.stop();
  });

  // The timer is a singleton on the store, so it has to be stopped explicitly when
  // this component goes away rather than left to the effect's cleanup.
  onDestroy(() => sysmon.stop());

  const stats = $derived(sysmon.stats);

  /**
   * The CPU in a few characters: model, cores, clock.
   *
   * The full brand is vendor boilerplate around one model number and does not fit
   * half a row, which is why it used to have a full-width line of its own below the
   * chart. `shortBrand` drops the marketing words so it fits where the memory's
   * figure sits, and the two columns then carry the same kind of line.
   */
  const cpuDetail = $derived.by(() => {
    if (!stats) return "";
    const { brand, cores, frequency } = stats.cpu;
    const ghz = frequency > 0 ? `${(frequency / 1000).toFixed(1)} GHz` : "";
    return [shortBrand(brand), i18n.t("sysmon.cores", { count: cores }), ghz]
      .filter(Boolean)
      .join(" · ");
  });

  const footerShortcuts = $derived<FooterShortcut[]>([
    { keys: "↑↓", label: i18n.t("sysmon.scroll") },
    { keys: "Esc", label: i18n.t("key.back") },
  ]);

  /**
   * What kind of adapter a GPU is, in words.
   *
   * The counters only ever gave a LUID, which is why the panel used to say "GPU 0"
   * and "GPU 1" — labels that tell nobody which one they are looking at. The name
   * comes from DXGI now, and the kind is what the section is *called*: a machine
   * with one card and no integrated graphics should say 独立显卡 and name it, not
   * print a generic 显卡 heading above an anonymous row.
   *
   * `unknown` covers a Mac, where there is one SoC with one GPU in it and nothing
   * to tell apart, so it keeps the plain heading.
   */
  function gpuKindLabel(kind: "discrete" | "integrated" | "unknown"): string {
    if (kind === "discrete") return i18n.t("sysmon.gpuDiscrete");
    if (kind === "integrated") return i18n.t("sysmon.gpuIntegrated");
    return i18n.t("sysmon.gpu");
  }

  /**
   * The GPUs split by kind, discrete first.
   *
   * One section per kind rather than one list of everything: a laptop with both
   * shows two, and the reader wants to know which is which before reading either
   * number. An empty kind is dropped, so a desktop with one card shows one section.
   */
  const gpuGroups = $derived.by(() => {
    if (!stats) return [];
    const order = ["discrete", "integrated", "unknown"] as const;
    return order
      .map((kind) => ({
        kind,
        label: gpuKindLabel(kind),
        gpus: stats.gpus.filter((gpu) => gpu.kind === kind),
      }))
      .filter((group) => group.gpus.length > 0);
  });

  /**
   * The disk throughput, read off any row because every row carries the same one.
   *
   * The platform counters are per device, so `read_disks` puts the machine's whole
   * figure on each row rather than pretending it can split it between volumes. The
   * panel prints it once, under the list, which is why this is only ever used for
   * that one line.
   */
  const diskIo = $derived(stats?.disks[0] ?? null);

  /**
   * Every volume added up, which is what the disk figure is about.
   *
   * The alternative was to make it about the largest volume, and that reads worse:
   * the number would need the volume's name beside it to mean anything, and the
   * name is already the first row of the list below — so the same words would
   * appear twice and the figure would still be ambiguous without them. Summed, the
   * figure answers "how full is this machine" and the list answers "which disk",
   * with nothing repeated.
   */
  const diskTotal = $derived(
    stats ? stats.disks.reduce((sum, disk) => sum + disk.total, 0) : 0,
  );
  const diskUsed = $derived(
    stats ? stats.disks.reduce((sum, disk) => sum + (disk.total - disk.free), 0) : 0,
  );

  /** Total throughput, which is what the network figure and chart show. */
  const networkDown = $derived(
    stats ? stats.network.reduce((sum, row) => sum + row.receivedPerSec, 0) : 0,
  );
  const networkUp = $derived(
    stats ? stats.network.reduce((sum, row) => sum + row.transmittedPerSec, 0) : 0,
  );

  /**
   * Which interface is carrying the traffic.
   *
   * Named when there is one, counted when there are several: a laptop with a VPN
   * up has three or four adapters and the panel is not the place to tell them
   * apart — the numbers above are the whole machine's, and this says what they
   * came from without turning the column into a table.
   */
  const networkSubject = $derived.by(() => {
    if (!stats || stats.network.length === 0) return "";
    if (stats.network.length === 1) return stats.network[0].name;
    return i18n.t("sysmon.interfaces", { count: stats.network.length });
  });

  /**
   * Everything this machine has sent and received, since each interface came up.
   *
   * The line under the two charts, and the reason the column has one: the disk side
   * carries a row per volume plus a throughput line, so without this the network
   * column came up short and the grid showed a hole. It is also the honest answer
   * to "how much has this machine actually moved", which an instantaneous rate
   * cannot give.
   */
  const networkTotals = $derived.by(() => {
    if (!stats || stats.network.length === 0) return "";
    const down = stats.network.reduce((sum, row) => sum + row.totalReceived, 0);
    const up = stats.network.reduce((sum, row) => sum + row.totalTransmitted, 0);
    return i18n.t("sysmon.totalTraffic", { down: bytes(down), up: bytes(up) });
  });
</script>

{#snippet figure(
  label: string,
  value: string,
  detail: string,
  values: number[],
  grow = false,
  subject = "",
  max: number | null | undefined = undefined,
)}
  <!-- A number over its own recent shape.
       `items-start` aligns the boxes, and `leading-none` on the small text aligns
       the *glyphs*: the label carried a 20px line-height against an 11px font, so
       its half-leading pushed its capital letters 4px below the top of the 20px
       number beside it. Measured, not guessed — the caps now start on one line. -->
  <section class="flex min-w-0 flex-col gap-1 {grow ? 'flex-1' : ''}">
    <div class="flex items-start gap-2">
      <h3 class="min-w-0 truncate text-[11px] font-medium uppercase leading-none tracking-wider text-ink-subtle">
        {label}
      </h3>
      <!-- `ml-auto` on the value, not on the label, so a second column in the same
           row cannot push the number around. -->
      <span class="ml-auto shrink-0 text-[20px] font-semibold leading-none text-ink tabular-nums">
        {value}
      </span>
    </div>
    <!-- The chart is the only part that has nothing to draw at first: a sparkline
         needs two readings, so it is empty for the first second while every number
         beside it is already correct. The loading effect belongs here rather than
         over the whole panel — the figures are real from the first frame, and a
         page of grey boxes hid them for no reason.
         The box is `h-8` either way, so nothing moves when the line appears. -->
    <div class="h-8 w-full">
      {#if values.length < 2}
        <span
          class="block h-full w-full animate-pulse rounded-sm bg-surface-2 motion-reduce:animate-none"
          aria-hidden="true"
        ></span>
      {:else}
        <Sparkline {values} {max} />
      {/if}
    </div>
    <!-- What the figure is *about*, under its own number rather than over the rows
         it summarises. A GPU names its adapter here, a disk names its volume, and
         the network names its interface when there is only one — so the heading can
         stay a category and the specifics stay attached to the number they qualify.
         Omitted entirely when there is nothing to say, so the row keeps its height
         rather than reserving a blank line. -->
    {#if subject}
      <p class="truncate text-[11px] leading-4 text-ink-subtle">{subject}</p>
    {/if}
    <!-- One line, and it truncates rather than wraps: a detail that grew to two
         lines would move the section below it on every repaint. -->
    {#if detail}
      <p class="truncate text-[11px] leading-4 text-ink-tertiary">{detail}</p>
    {/if}
  </section>
{/snippet}

<!-- The footer is a sibling of the content column, not inside it, so it stays
     pinned while the figures scroll. -->
<div class="flex min-h-0 flex-1 flex-col">
  <!-- `bind:viewport` hands the scroll container to the store, which is where the
       palette's key handler reaches it: the search field always has focus, so keys
       never bubble through this element. -->
  <div class="flex min-h-0 flex-1 flex-col px-4 pt-2">
    <ScrollArea
      bind:viewport={sysmon.viewport}
      class="min-h-0 flex-1"
      viewportClass="flex flex-col gap-4 pb-2"
    >
      {#if !stats}
        <!-- Nothing, not a skeleton. `sysmon.stats` lives on the store and outlives
             the panel, so this is only ever true for the very first open of a
             process, for as long as one IPC round trip takes — a few milliseconds.
             A page of grey boxes for that long reads as a flash, and the numbers
             that follow are correct from the first frame; the only thing genuinely
             empty at that point is each chart, which handles itself in `figure`. -->
      {:else}
        <!-- CPU and memory side by side: they are the two figures read together,
             and a full-width chart each wasted half of every row. -->
        <div class="flex gap-4">
          {@render figure(
            i18n.t("sysmon.cpu"),
            percent(stats.cpu.usage),
            cpuDetail,
            sysmon.cpuHistory,
            true,
          )}
          {@render figure(
            i18n.t("sysmon.memory"),
            percent(fill(stats.memory.used, stats.memory.total)),
            `${bytes(stats.memory.used)} / ${bytes(stats.memory.total)}`,
            sysmon.memoryHistory,
            true,
          )}
        </div>

        <!-- One bar per core. Fixed height cells with the bar drawn from the
             bottom, so a core going from 3% to 90% changes the bar and nothing
             else — a layout that reflows on every sample is what made this shake.
             Inline pixels rather than percentages: a percentage height inside a
             flex row does not resolve, because the row's height comes from
             `align-items: stretch` and that is not a definite height. -->
        <div class="flex gap-2">
          <div class="flex flex-1 gap-0.5" style="height: 18px" aria-hidden="true">
            {#each stats.cpu.perCore as usage, index (index)}
              <span
                class="flex-1 self-end rounded-[2px] bg-primary/60"
                style="height: {Math.max(2, Math.round((Math.min(100, usage) / 100) * 18))}px"
              ></span>
            {/each}
          </div>
          <span class="shrink-0 text-[11px] leading-[18px] text-ink-tertiary tabular-nums">
            {i18n.t("sysmon.peak", { percent: percent(Math.max(...stats.cpu.perCore)) })}
          </span>
        </div>

        {#if stats.memory.swapTotal > 0}
          <div class="flex items-start gap-2">
            <span class="text-[11px] leading-4 text-ink-subtle">{i18n.t("sysmon.swap")}</span>
            <span class="ml-auto text-[11px] leading-4 text-ink-tertiary tabular-nums">
              {bytes(stats.memory.swapUsed)} / {bytes(stats.memory.swapTotal)}
            </span>
          </div>
        {/if}

        <!-- Disk and network side by side, the way CPU and memory are: two
             throughput figures read together, and a full-width chart each wasted
             half of every row.

             A two-column grid rather than one flex row of figures with the lists
             stacked underneath, which is what this was and what it got wrong: the
             disk rows pushed the network rows below both figures, so the network
             chart sat directly above a list belonging to the other section. Here
             each column holds its own figure *and* its own rows, so proximity says
             what the labels say. -->
        {#if stats.disks.length > 0 || stats.network.length > 0}
          <!-- One column when only one section has anything to show: a fixed
               two-column grid would leave the survivor at half width with an empty
               half beside it, which reads as something failing to load. -->
          <div
            class="grid gap-4 border-t border-hairline pt-3 {stats.disks.length > 0 &&
            stats.network.length > 0
              ? 'grid-cols-2'
              : 'grid-cols-1'}"
          >
            {#if stats.disks.length > 0}
              <div class="flex min-w-0 flex-col gap-2">
                {@render figure(
                  i18n.t("sysmon.disk"),
                  percent(fill(diskUsed, diskTotal)),
                  `${bytes(diskUsed)} / ${bytes(diskTotal)}`,
                  sysmon.diskHistory,
                )}
                <!-- A row per volume, then the throughput as a second labelled
                     block. The disk column has to reach roughly the height of the
                     two network charts beside it, and the way to do that is with
                     information rather than padding: the read and write rates were
                     one cramped line and are now the same shape as a volume row,
                     each direction on its own. -->
                <div class="flex flex-col gap-1">
                  {#each stats.disks as disk (disk.mount)}
                    <div class="flex items-baseline gap-2">
                      <span class="shrink-0 text-[12px] leading-[1.45] text-ink">
                        {volumeLabel(disk.name, disk.mount, (letter) =>
                          i18n.t("sysmon.drive", { letter }),
                        )}
                      </span>
                      <!-- The free space rather than the used: on a disk that is
                           filling up the question is how much room is left, and
                           `used / total` makes the reader subtract to answer it.
                           The total is dropped — the percentage beside it already
                           says how much of the whole that is. -->
                      <span class="min-w-0 flex-1 truncate text-[11px] leading-4 text-ink-subtle tabular-nums">
                        {i18n.t("sysmon.free", { free: bytes(disk.free) })}
                      </span>
                      <span class="shrink-0 text-[11px] leading-4 text-ink-tertiary tabular-nums">
                        {percent(fill(disk.total - disk.free, disk.total))}
                      </span>
                    </div>
                  {/each}
                  <!-- The throughput once, under the list: the platform counters
                       are per device, so every mount on one physical disk would
                       otherwise print the same two numbers. Read and write on their
                       own lines, matching the two directions the network column
                       shows, because a bare pair of rates leaves the reader to work
                       out which is which. -->
                  <div class="flex items-baseline gap-2">
                    <span class="shrink-0 text-[12px] leading-[1.45] text-ink-subtle">
                      {i18n.t("sysmon.read")}
                    </span>
                    <span class="ml-auto shrink-0 text-[11px] leading-4 text-ink-tertiary tabular-nums">
                      {rate(diskIo?.readPerSec ?? 0)}
                    </span>
                  </div>
                  <div class="flex items-baseline gap-2">
                    <span class="shrink-0 text-[12px] leading-[1.45] text-ink-subtle">
                      {i18n.t("sysmon.write")}
                    </span>
                    <span class="ml-auto shrink-0 text-[11px] leading-4 text-ink-tertiary tabular-nums">
                      {rate(diskIo?.writePerSec ?? 0)}
                    </span>
                  </div>
                </div>
              </div>
            {/if}

            {#if stats.network.length > 0}
              <div class="flex min-w-0 flex-col gap-2">
                <!-- Download and upload as two stacked figures, each with its own
                     chart. Summed into one line the reader cannot tell which
                     direction moved — a backup saturating the uplink and a large
                     download draw the same shape — and the two are different things
                     to watch. Stacked rather than side by side because a chart in
                     half a column is too narrow to read a shape from. -->
                {@render figure(
                  i18n.t("sysmon.download"),
                  rate(networkDown),
                  "",
                  sysmon.networkDownHistory,
                  false,
                  "",
                  null,
                )}
                {@render figure(
                  i18n.t("sysmon.upload"),
                  rate(networkUp),
                  "",
                  sysmon.networkUpHistory,
                  false,
                  "",
                  null,
                )}
                <!-- What the two numbers came from, and what has gone through in
                     total. Under both charts rather than beside either, because
                     both describe the machine rather than one direction. -->
                <div class="flex items-baseline gap-2">
                  <span class="min-w-0 truncate text-[11px] leading-4 text-ink-subtle">
                    {networkSubject}
                  </span>
                  <span class="ml-auto shrink-0 text-[11px] leading-4 text-ink-tertiary tabular-nums">
                    {networkTotals}
                  </span>
                </div>
              </div>
            {/if}
          </div>
        {/if}

        {#each gpuGroups as group (group.kind)}
          <section class="flex flex-col gap-2 border-t border-hairline pt-3">
            <!-- Side by side when a kind has more than one adapter, which is rare
                 but real: two cards in one machine. -->
            <div class="flex gap-4">
              {#each group.gpus as gpu (gpu.name)}
                {@render figure(
                  group.label,
                  gpu.usage === null ? "—" : percent(gpu.usage),
                  "",
                  sysmon.gpuHistory[gpu.name] ?? [],
                  true,
                  // Always named, whether there is one card or two: the panel used
                  // to print the model only when a kind held two adapters, which
                  // left the common single-GPU machine with a number and no idea
                  // which chip it came from.
                  gpu.name,
                )}
              {/each}
            </div>
          </section>
        {/each}

        <section class="flex flex-col gap-1.5 border-t border-hairline pt-3">
          <h3 class="text-[11px] font-medium uppercase leading-none tracking-wider text-ink-subtle">
            {i18n.t("sysmon.system")}
          </h3>
          <div class="flex flex-col gap-1">
            <div class="flex items-start gap-3">
              <span class="text-[12px] leading-[1.45] text-ink">{stats.system.name}</span>
              <span class="ml-auto text-[12px] leading-[1.45] text-ink-tertiary">
                {stats.system.osVersion}
              </span>
            </div>
            <div class="flex items-start gap-3">
              <span class="text-[12px] leading-[1.45] text-ink-subtle">{i18n.t("sysmon.host")}</span>
              <span class="ml-auto text-[12px] leading-[1.45] text-ink-tertiary">
                {stats.system.hostname}
              </span>
            </div>
            <div class="flex items-start gap-3">
              <span class="text-[12px] leading-[1.45] text-ink-subtle">{i18n.t("sysmon.uptime")}</span>
              <span class="ml-auto text-[12px] leading-[1.45] text-ink-tertiary tabular-nums">
                {duration(stats.system.uptime)}
              </span>
            </div>
          </div>
        </section>

        <section class="flex flex-col gap-1.5 border-t border-hairline pt-3">
          <h3 class="text-[11px] font-medium uppercase leading-none tracking-wider text-ink-subtle">
            {i18n.t("sysmon.processes")}
          </h3>
          <div class="flex flex-col">
            {#each stats.processes as process (process.pid)}
              <div class="flex items-start gap-3 py-0.5">
                <span class="min-w-0 flex-1 truncate text-[12px] leading-[1.45] text-ink">
                  {process.name}
                </span>
                <span class="w-16 shrink-0 text-right text-[11px] leading-4 text-ink-tertiary tabular-nums">
                  {bytes(process.memory)}
                </span>
                <span class="w-10 shrink-0 text-right text-[11px] leading-4 text-ink-subtle tabular-nums">
                  {percent(process.cpu)}
                </span>
              </div>
            {/each}
          </div>
        </section>
      {/if}
    </ScrollArea>
  </div>

  <PanelFooter shortcuts={footerShortcuts} />
</div>
