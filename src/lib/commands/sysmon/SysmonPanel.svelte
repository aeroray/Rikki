<script lang="ts">
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

  const footerShortcuts = $derived<FooterShortcut[]>([
    { keys: "Esc", label: i18n.t("key.back") },
  ]);
</script>

{#snippet bar(value: number, tone: string)}
  <!-- A hairline track rather than a filled block: at a glance the length is what
       reads, and a solid bar at 90% is a wall of colour. -->
  <span class="block h-1 w-full overflow-hidden rounded-full bg-surface-2">
    <span class="block h-full rounded-full {tone}" style="width: {Math.max(1, value)}%"></span>
  </span>
{/snippet}

<!-- The footer is a sibling of the content column, not inside it, so it stays
     pinned while the figures scroll. -->
<div class="flex min-h-0 flex-1 flex-col">
  <div class="flex min-h-0 flex-1 flex-col px-3 pt-1">
    <ScrollArea class="min-h-0 flex-1" viewportClass="flex flex-col gap-3">
      {#if !stats}
        <p class="px-1 text-[13px] leading-5 text-ink-tertiary">{i18n.t("sysmon.reading")}</p>
      {:else}
        <section class="flex flex-col gap-1.5">
          <div class="flex items-baseline gap-2 px-1">
            <span class="text-[12px] leading-[1.4] text-ink-subtle">{i18n.t("sysmon.cpu")}</span>
            <span class="ml-auto text-[16px] font-medium leading-6 text-ink tabular-nums">
              {percent(stats.cpu.usage)}
            </span>
          </div>
          {@render bar(stats.cpu.usage, "bg-primary")}
          <p class="px-1 text-[11px] leading-4 text-ink-tertiary">{cpuDetail}</p>
          <!-- One tick per core, so an unbalanced load is visible without a
               number for every one of them. -->
          <div class="flex gap-0.5 px-1" aria-hidden="true">
            {#each stats.cpu.perCore as usage, index (index)}
              <span class="block h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
                <span class="block h-full rounded-full bg-primary/70" style="width: {Math.max(2, usage)}%"></span>
              </span>
            {/each}
          </div>
        </section>

        <section class="flex flex-col gap-1.5">
          <div class="flex items-baseline gap-2 px-1">
            <span class="text-[12px] leading-[1.4] text-ink-subtle">{i18n.t("sysmon.memory")}</span>
            <span class="ml-auto text-[13px] leading-5 text-ink tabular-nums">
              {bytes(stats.memory.used)} / {bytes(stats.memory.total)}
            </span>
          </div>
          {@render bar(fill(stats.memory.used, stats.memory.total), "bg-primary")}
          {#if stats.memory.swapTotal > 0}
            <div class="flex items-baseline gap-2 px-1">
              <span class="text-[12px] leading-[1.4] text-ink-subtle">{i18n.t("sysmon.swap")}</span>
              <span class="ml-auto text-[12px] leading-[1.4] text-ink-subtle tabular-nums">
                {bytes(stats.memory.swapUsed)} / {bytes(stats.memory.swapTotal)}
              </span>
            </div>
          {/if}
        </section>

        {#if stats.gpus.length > 0}
          <section class="flex flex-col gap-1.5">
            {#each stats.gpus as gpu (gpu.name)}
              <div class="flex items-baseline gap-2 px-1">
                <span class="text-[12px] leading-[1.4] text-ink-subtle">{gpu.name}</span>
                <span class="ml-auto text-[13px] leading-5 text-ink tabular-nums">
                  {gpu.usage === null ? "—" : percent(gpu.usage)}
                </span>
              </div>
              {@render bar(gpu.usage ?? 0, "bg-primary")}
            {/each}
          </section>
        {/if}

        <section class="flex flex-col gap-1">
          <p class="px-1 text-[12px] leading-[1.4] text-ink-subtle">{i18n.t("sysmon.system")}</p>
          <p class="px-1 text-[12px] leading-[1.45] text-ink-tertiary">
            {[stats.system.name, stats.system.osVersion, stats.system.hostname]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div class="flex items-baseline gap-2 px-1">
            <span class="text-[12px] leading-[1.4] text-ink-subtle">{i18n.t("sysmon.uptime")}</span>
            <span class="ml-auto text-[12px] leading-[1.4] text-ink-subtle tabular-nums">
              {duration(stats.system.uptime)}
            </span>
          </div>
        </section>

        <section class="flex flex-col gap-1">
          <p class="px-1 text-[12px] leading-[1.4] text-ink-subtle">{i18n.t("sysmon.processes")}</p>
          {#each stats.processes as process (process.pid)}
            <div class="flex items-baseline gap-2 px-1">
              <span class="min-w-0 flex-1 truncate text-[12px] leading-[1.45] text-ink">
                {process.name}
              </span>
              <span class="shrink-0 text-[11px] leading-4 text-ink-tertiary tabular-nums">
                {bytes(process.memory)}
              </span>
              <span class="w-12 shrink-0 text-right text-[11px] leading-4 text-ink-subtle tabular-nums">
                {percent(process.cpu)}
              </span>
            </div>
          {/each}
        </section>
      {/if}
    </ScrollArea>
  </div>

  <PanelFooter shortcuts={footerShortcuts} />
</div>
