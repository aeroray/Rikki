<script lang="ts">
  import Sparkline from "$lib/commands/sysmon/Sparkline.svelte";
  import { bytes, clock, duration, fill, percent, rate, shortBrand } from "$lib/commands/sysmon/format";
  import PanelFooter, { type FooterShortcut } from "$lib/components/PanelFooter.svelte";
  import ScrollArea from "$lib/components/ScrollArea.svelte";
  import { i18n } from "$lib/i18n";
  import { sysmon } from "$lib/stores/sysmon.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { BatteryCharging, Plug } from "@lucide/svelte";
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
   * The largest disk, which is the one the figure and the chart are about.
   *
   * `read_disks` already sorts by size, so the first row is the biggest volume.
   * Charting all of them would be several lines saying the same thing: none of
   * them fills up on the scale of a minute.
   */
  const mainDisk = $derived(stats?.disks[0] ?? null);

  /** Total throughput, which is what the network figure and chart show. */
  const networkRate = $derived(
    stats ? stats.network.reduce((sum, row) => sum + row.receivedPerSec + row.transmittedPerSec, 0) : 0,
  );

  /**
   * The battery's state in words.
   *
   * Charging and plugged in are different states and the panel says which: a full
   * battery on mains is plugged in and not charging, and calling that "charging"
   * is the kind of small lie a status panel should not tell.
   */
  const batteryState = $derived.by(() => {
    const battery = stats?.battery;
    if (!battery) return "";
    if (battery.charging) return i18n.t("sysmon.batteryCharging");
    if (battery.plugged) return i18n.t("sysmon.batteryPlugged");
    if (battery.secondsLeft !== null) {
      return i18n.t("sysmon.batteryLeft", { time: clock(battery.secondsLeft) });
    }
    return i18n.t("sysmon.batteryDischarging");
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
      <!-- The subject sits beside its own section label rather than on a line of
           its own: "独立显卡  NVIDIA GeForce RTX 4060" is one thought, and splitting
           it cost a row and left the name looking like a stray caption. -->
      {#if subject}
        <span class="min-w-0 flex-1 truncate pt-px text-[11px] leading-none text-ink-tertiary">
          {subject}
        </span>
      {/if}
      <!-- `ml-auto` on the value, not on the label: with a subject in between, the
           label must not push the number to the right. -->
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
    <!-- One line, and it truncates rather than wraps: a detail that grew to two
         lines would move the section below it on every repaint. Omitted entirely
         when there is nothing to say, so a GPU row that carries its name beside the
         label does not leave a blank line under its chart. -->
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

        <!-- Battery, when there is one. A desktop has none and the section is
             dropped rather than showing a zero: `battery` is null there, not 0%,
             because "no battery" and "empty battery" are different facts.

             A level, not a sparkline: the chart would be a flat line at the
             current percentage for an hour, which says nothing the number beside
             it has not already said. A bar is the shape a level wants. -->
        {#if stats.battery}
          <section class="flex flex-col gap-1 border-t border-hairline pt-3">
            <div class="flex items-center gap-2">
              <h3 class="text-[11px] font-medium uppercase leading-none tracking-wider text-ink-subtle">
                {i18n.t("sysmon.battery")}
              </h3>
              {#if stats.battery.charging}
                <BatteryCharging class="size-3.5 shrink-0 text-success" strokeWidth={1.5} aria-hidden="true" />
              {:else if stats.battery.plugged}
                <Plug class="size-3.5 shrink-0 text-ink-tertiary" strokeWidth={1.5} aria-hidden="true" />
              {/if}
              <span class="ml-auto shrink-0 text-[20px] font-semibold leading-none text-ink tabular-nums">
                {percent(stats.battery.percent)}
              </span>
            </div>
            <div class="h-2 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
              <!-- Deliberately not `danger` at a low level. That colour means "this
                   cannot be undone" in this design and keeps that meaning by not
                   also meaning "this needs attention" — the same reasoning that
                   keeps it off a failed copy. The number says the level. -->
              <span
                class="block h-full rounded-full bg-primary/60"
                style="width: {Math.max(2, Math.min(100, stats.battery.percent))}%"
              ></span>
            </div>
            <p class="truncate text-[11px] leading-4 text-ink-tertiary">{batteryState}</p>
          </section>
        {/if}

        <!-- Disk and network as two full-width sections rather than two figures
             side by side. Each one owns a list — the mounts, the interfaces — and
             side by side those lists had to be stacked underneath both figures,
             where the network row read as a continuation of the disk block. The
             label at the top of each section is what makes the ownership obvious. -->
        {#if stats.disks.length > 0}
          <section class="flex flex-col gap-1.5 border-t border-hairline pt-3">
            {@render figure(
              i18n.t("sysmon.disk"),
              mainDisk ? percent(fill(mainDisk.total - mainDisk.free, mainDisk.total)) : "—",
              mainDisk ? `${bytes(mainDisk.free)} ${i18n.t("sysmon.free")}` : "",
              sysmon.diskHistory,
            )}
            <div class="flex flex-col gap-1">
              {#each stats.disks as disk (disk.mount)}
                <div class="flex items-baseline gap-3">
                  <span class="min-w-0 flex-1 truncate text-[12px] leading-[1.45] text-ink">
                    {disk.name || disk.mount}
                  </span>
                  <span class="shrink-0 text-[11px] leading-4 text-ink-tertiary tabular-nums">
                    {bytes(disk.total - disk.free)} / {bytes(disk.total)}
                  </span>
                  <span class="w-10 shrink-0 text-right text-[11px] leading-4 text-ink-subtle tabular-nums">
                    {percent(fill(disk.total - disk.free, disk.total))}
                  </span>
                </div>
              {/each}
              <!-- The throughput once, under the list: the platform counters are
                   per device, so every mount on one physical disk would otherwise
                   print the same two numbers. -->
              <div class="flex items-baseline gap-3 pt-0.5">
                <span class="text-[11px] leading-4 text-ink-subtle">{i18n.t("sysmon.diskIo")}</span>
                <span class="ml-auto text-[11px] leading-4 text-ink-tertiary tabular-nums">
                  {i18n.t("sysmon.read")} {rate(mainDisk?.readPerSec ?? 0)} · {i18n.t("sysmon.write")}
                  {rate(mainDisk?.writePerSec ?? 0)}
                </span>
              </div>
            </div>
          </section>
        {/if}

        {#if stats.network.length > 0}
          <section class="flex flex-col gap-1.5 border-t border-hairline pt-3">
            {@render figure(
              i18n.t("sysmon.network"),
              rate(networkRate),
              // The subject only when there is more than one interface: with one,
              // the row below already names it and the label would say it twice.
              stats.network.length > 1 ? stats.network[0].name : "",
              sysmon.networkHistory,
              false,
              "",
              null,
            )}
            <div class="flex flex-col gap-1">
              {#each stats.network as row (row.name)}
                <div class="flex items-baseline gap-3">
                  <span class="min-w-0 flex-1 truncate text-[12px] leading-[1.45] text-ink">
                    {row.name}
                  </span>
                  <span class="shrink-0 text-[11px] leading-4 text-ink-tertiary tabular-nums">
                    ↓ {rate(row.receivedPerSec)}
                  </span>
                  <span class="w-20 shrink-0 text-right text-[11px] leading-4 text-ink-subtle tabular-nums">
                    ↑ {rate(row.transmittedPerSec)}
                  </span>
                </div>
              {/each}
            </div>
          </section>
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
                  group.gpus.length > 1 ? gpu.name : "",
                  sysmon.gpuHistory[gpu.name] ?? [],
                  true,
                  group.gpus.length === 1 ? gpu.name : "",
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
