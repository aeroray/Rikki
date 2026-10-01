<script lang="ts">
  import Sparkline from "$lib/commands/sysmon/Sparkline.svelte";
  import { bytes, duration, fill, percent } from "$lib/commands/sysmon/format";
  import PanelFooter, { type FooterShortcut } from "$lib/components/PanelFooter.svelte";
  import ScrollArea from "$lib/components/ScrollArea.svelte";
  import { i18n } from "$lib/i18n";
  import { sysmon } from "$lib/stores/sysmon.svelte";
  import { onMount } from "svelte";

  // Sampling runs while the panel is on screen and stops with it. A tray app that
  // polled the machine around the clock would be trading battery for nothing.
  onMount(() => {
    sysmon.start();
    return () => sysmon.stop();
  });

  const stats = $derived(sysmon.stats);

  const cpuDetail = $derived.by(() => {
    if (!stats) return "";
    const { brand, cores, frequency } = stats.cpu;
    const ghz = frequency > 0 ? `${(frequency / 1000).toFixed(1)} GHz` : "";
    return [brand, i18n.t("sysmon.cores", { count: cores }), ghz].filter(Boolean).join(" · ");
  });

  const footerShortcuts = $derived<FooterShortcut[]>([{ keys: "Esc", label: i18n.t("key.back") }]);
</script>

{#snippet hero(label: string, value: string, values: number[], detail?: string)}
  <!-- The number is the reading and the chart is the shape of it: a line alone
       cannot be read to a value, and a value alone cannot say whether it is
       climbing. Both, then. -->
  <section class="flex flex-col gap-1.5">
    <div class="flex items-baseline gap-3">
      <h3 class="text-[11px] font-medium uppercase tracking-wider text-ink-subtle">{label}</h3>
      <span class="ml-auto text-[20px] font-semibold leading-7 text-ink tabular-nums">
        {value}
      </span>
    </div>
    <!-- A fixed height, so the chart cannot resize the panel as it fills: space
         reserved rather than a layout that shifts once a second. -->
    <div class="h-9 w-full">
      <Sparkline {values} />
    </div>
    {#if detail}
      <p class="text-[11px] leading-4 text-ink-tertiary">{detail}</p>
    {/if}
  </section>
{/snippet}

<!-- The footer is a sibling of the content column, not inside it, so it stays
     pinned while the figures scroll. -->
<div class="flex min-h-0 flex-1 flex-col">
  <div class="flex min-h-0 flex-1 flex-col px-4 pt-2">
    <ScrollArea class="min-h-0 flex-1" viewportClass="flex flex-col gap-4 pb-2">
      {#if !stats}
        <p class="text-[13px] leading-5 text-ink-tertiary">{i18n.t("sysmon.reading")}</p>
      {:else}
        {@render hero(i18n.t("sysmon.cpu"), percent(stats.cpu.usage), sysmon.cpuHistory, cpuDetail)}
        <!-- One bar per core, height as usage. An equalizer shows a load
             imbalance at a glance, which a single percentage cannot.

             Heights are inline pixels rather than percentages. A percentage
             height inside a flex row does not resolve — the row's height comes
             from `align-items: stretch`, which the browser does not treat as a
             definite height — so the bars drew at zero however the classes were
             arranged. 20px is the row; each bar is a share of it. -->
        <div class="flex gap-0.5" style="height: 20px" aria-hidden="true">
          {#each stats.cpu.perCore as usage, index (index)}
            <span
              class="flex-1 self-end rounded-[2px] bg-primary/60"
              style="height: {Math.max(2, Math.round((Math.min(100, usage) / 100) * 20))}px"
            ></span>
          {/each}
        </div>

        {@render hero(
          i18n.t("sysmon.memory"),
          percent(fill(stats.memory.used, stats.memory.total)),
          sysmon.memoryHistory,
          `${bytes(stats.memory.used)} / ${bytes(stats.memory.total)}`,
        )}
        {#if stats.memory.swapTotal > 0}
          <div class="flex items-baseline gap-3">
            <span class="text-[11px] leading-4 text-ink-subtle">{i18n.t("sysmon.swap")}</span>
            <span class="ml-auto text-[11px] leading-4 text-ink-tertiary tabular-nums">
              {bytes(stats.memory.swapUsed)} / {bytes(stats.memory.swapTotal)}
            </span>
          </div>
        {/if}

        {#each stats.gpus as gpu (gpu.name)}
          {@render hero(
            gpu.name,
            gpu.usage === null ? "—" : percent(gpu.usage),
            sysmon.gpuHistory[gpu.name] ?? [],
          )}
        {/each}

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
