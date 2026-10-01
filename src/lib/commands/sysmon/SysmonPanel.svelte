<script lang="ts">
  import Sparkline from "$lib/commands/sysmon/Sparkline.svelte";
  import { bytes, duration, fill, percent } from "$lib/commands/sysmon/format";
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
   * The CPU's own description, short enough to sit beside its label.
   *
   * It used to be a line under the chart, which cost a row of height to say
   * something that never changes. In the heading it costs nothing, and the brand is
   * the part worth keeping — the core count and clock are already visible in the
   * equalizer below.
   */
  const cpuDetail = $derived.by(() => {
    if (!stats) return "";
    const { brand, cores, frequency } = stats.cpu;
    const ghz = frequency > 0 ? `${(frequency / 1000).toFixed(1)} GHz` : "";
    return [brand, i18n.t("sysmon.cores", { count: cores }), ghz].filter(Boolean).join(" · ");
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
   * comes from DXGI now, and this says whether it is the one in the CPU or a card
   * of its own, which is the distinction that matters on a laptop.
   */
  function gpuKind(kind: "discrete" | "integrated" | "unknown"): string {
    if (kind === "discrete") return i18n.t("sysmon.gpuDiscrete");
    if (kind === "integrated") return i18n.t("sysmon.gpuIntegrated");
    return "";
  }
</script>

{#snippet figure(label: string, value: string, detail: string, values: number[], grow = false)}
  <!-- A number over its own recent shape. The chart is a fixed height so the box
       cannot resize as it fills, and the value is set in tabular figures so a
       changing number does not shift the ones beside it. -->
  <section class="flex min-w-0 flex-col gap-1 {grow ? 'flex-1' : ''}">
    <div class="flex items-baseline gap-2">
      <h3 class="min-w-0 truncate text-[11px] font-medium uppercase tracking-wider text-ink-subtle">
        {label}
      </h3>
      <span class="ml-auto shrink-0 text-[20px] font-semibold leading-7 text-ink tabular-nums">
        {value}
      </span>
    </div>
    <div class="h-8 w-full">
      <Sparkline {values} />
    </div>
    <!-- One line, and it truncates rather than wraps: a detail that grew to two
         lines would move the section below it on every repaint. -->
    <p class="truncate text-[11px] leading-4 text-ink-tertiary">{detail}</p>
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
        <p class="text-[13px] leading-5 text-ink-tertiary">{i18n.t("sysmon.reading")}</p>
      {:else}
        <!-- CPU and memory side by side: they are the two figures read together,
             and a full-width chart each wasted half of every row. -->
        <div class="flex gap-4">
          {@render figure(
            i18n.t("sysmon.cpu"),
            percent(stats.cpu.usage),
            "",
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

        <!-- The CPU's own description on its own line. In the heading it was
             truncated to "12th Gen Intel(R) Core(TM) i5-12400F · 12 核 · 2.5 …" —
             the columns are half-width now, and a name that long does not fit in
             one. Here it has the whole row. -->
        <p class="-mt-2 truncate text-[11px] leading-4 text-ink-tertiary">{cpuDetail}</p>

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
          <div class="flex items-baseline gap-2">
            <span class="text-[11px] leading-4 text-ink-subtle">{i18n.t("sysmon.swap")}</span>
            <span class="ml-auto text-[11px] leading-4 text-ink-tertiary tabular-nums">
              {bytes(stats.memory.swapUsed)} / {bytes(stats.memory.swapTotal)}
            </span>
          </div>
        {/if}

        {#if stats.gpus.length > 0}
          <section class="flex flex-col gap-2 border-t border-hairline pt-3">
            <h3 class="text-[11px] font-medium uppercase tracking-wider text-ink-subtle">
              {i18n.t("sysmon.gpu")}
            </h3>
            <!-- Side by side, the way CPU and memory are: two adapters on one
                 machine are usually the integrated one and the discrete one, and
                 comparing them is the reason to look. -->
            <div class="flex gap-4">
              {#each stats.gpus as gpu (gpu.name)}
                {@render figure(
                  gpu.name,
                  gpu.usage === null ? "—" : percent(gpu.usage),
                  gpuKind(gpu.kind),
                  sysmon.gpuHistory[gpu.name] ?? [],
                  true,
                )}
              {/each}
            </div>
          </section>
        {/if}

        <section class="flex flex-col gap-1.5 border-t border-hairline pt-3">
          <h3 class="text-[11px] font-medium uppercase tracking-wider text-ink-subtle">
            {i18n.t("sysmon.system")}
          </h3>
          <div class="flex flex-col gap-1">
            <div class="flex items-baseline gap-3">
              <span class="text-[12px] leading-[1.45] text-ink">{stats.system.name}</span>
              <span class="ml-auto text-[12px] leading-[1.45] text-ink-tertiary">
                {stats.system.osVersion}
              </span>
            </div>
            <div class="flex items-baseline gap-3">
              <span class="text-[12px] leading-[1.45] text-ink-subtle">{i18n.t("sysmon.host")}</span>
              <span class="ml-auto text-[12px] leading-[1.45] text-ink-tertiary">
                {stats.system.hostname}
              </span>
            </div>
            <div class="flex items-baseline gap-3">
              <span class="text-[12px] leading-[1.45] text-ink-subtle">{i18n.t("sysmon.uptime")}</span>
              <span class="ml-auto text-[12px] leading-[1.45] text-ink-tertiary tabular-nums">
                {duration(stats.system.uptime)}
              </span>
            </div>
          </div>
        </section>

        <section class="flex flex-col gap-1.5 border-t border-hairline pt-3">
          <h3 class="text-[11px] font-medium uppercase tracking-wider text-ink-subtle">
            {i18n.t("sysmon.processes")}
          </h3>
          <div class="flex flex-col">
            {#each stats.processes as process (process.pid)}
              <div class="flex items-baseline gap-3 py-0.5">
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
