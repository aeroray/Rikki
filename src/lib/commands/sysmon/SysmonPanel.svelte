<script lang="ts">
  import Sparkline from "$lib/commands/sysmon/Sparkline.svelte";
  import { bytes, duration, fill, percent, shortBrand } from "$lib/commands/sysmon/format";
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
      .join(" 路 ");
  });

  const footerShortcuts = $derived<FooterShortcut[]>([
    { keys: "鈫戔啌", label: i18n.t("sysmon.scroll") },
    { keys: "Esc", label: i18n.t("key.back") },
  ]);

  /** How many placeholder bars the loading state draws. */
  const SKELETON_CORES = 12;

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
</script>

{#snippet figure(
  label: string,
  value: string,
  detail: string,
  values: number[],
  grow = false,
  subject = "",
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
           its own: "鏄惧崱  NVIDIA GEFORCE RTX 4060" is one thought, and splitting it
           cost a row and left the name looking like a stray caption. -->
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
    <div class="h-8 w-full">
      <Sparkline {values} />
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

{#snippet skeleton(grow = false)}
  <!-- The same box as `figure`, with the same three heights, so the panel does not
       move when the first reading lands. A spinner or a line of text would both
       leave the layout to jump the moment the numbers arrived, which is the jitter
       this avoids. -->
  <section class="flex min-w-0 flex-col gap-1 {grow ? 'flex-1' : ''}" aria-hidden="true">
    <div class="flex items-start gap-2">
      <span class="h-5 w-12 animate-pulse rounded-sm bg-surface-2 motion-reduce:animate-none"></span>
      <span class="ml-auto h-5 w-14 animate-pulse rounded-sm bg-surface-2 motion-reduce:animate-none"></span>
    </div>
    <div class="h-8 w-full animate-pulse rounded-sm bg-surface-2 motion-reduce:animate-none"></div>
    <span class="h-4 w-28 animate-pulse rounded-sm bg-surface-2 motion-reduce:animate-none"></span>
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
        <!-- The whole panel in skeleton, not a "reading…" line: the shapes are the
             ones about to be filled, so the first paint already has its final
             layout. -->
        <div class="flex gap-4">
          {@render skeleton(true)}
          {@render skeleton(true)}
        </div>
        <div class="flex gap-2" aria-hidden="true">
          <div class="flex flex-1 gap-0.5" style="height: 18px">
            {#each Array.from({ length: SKELETON_CORES }) as _, index (index)}
              <span
                class="flex-1 self-end animate-pulse rounded-[2px] bg-surface-2 motion-reduce:animate-none"
                style="height: 18px"
              ></span>
            {/each}
          </div>
        </div>
        <div class="flex gap-2" aria-hidden="true">
          <span class="h-4 w-20 animate-pulse rounded-sm bg-surface-2 motion-reduce:animate-none"></span>
        </div>
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
