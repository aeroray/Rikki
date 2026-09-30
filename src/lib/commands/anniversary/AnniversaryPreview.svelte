<script lang="ts">
  import { queryOccurrence, type DateQuery } from "$lib/commands/anniversary/dates";
  import { countdownLabel, previewLines, weekdayLabel } from "$lib/commands/anniversary/format";
  import PanelFooter, { type FooterShortcut } from "$lib/components/PanelFooter.svelte";
  import { i18n } from "$lib/i18n";
  import { anniversaries } from "$lib/stores/anniversaries.svelte";

  let { query, now }: { query: Extract<DateQuery, { kind: "date" }>; now: Date } = $props();

  const occurrence = $derived.by(() => {
    // A lunar preview needs the tables, and `lunarApi()` is a plain module
    // value Svelte cannot see: reading `lunarReady` here is what makes this
    // recompute once they arrive.
    anniversaries.lunarReady;
    return queryOccurrence(query, now);
  });
  const lines = $derived(occurrence ? previewLines(query, occurrence) : []);

  // Key glyphs are not translated: they name physical keys, which read the same
  // in every locale.
  const footerShortcuts = $derived.by((): FooterShortcut[] => [
    { keys: "Enter", label: i18n.t("anniversary.keySaveAs") },
  ]);

  $effect(() => {
    if (query.calendar === "lunar" && !anniversaries.lunarReady) void anniversaries.ensureLunar();
  });
</script>

<!-- The footer is a sibling of the content column, not inside it, so it stays
     pinned to the bottom in both the ready and the awaiting-lunar state. -->
<div class="flex min-h-0 flex-1 flex-col">
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pt-1">
    {#if occurrence}
      <p class="px-1 text-[12px] leading-[1.4] text-ink-subtle">
        {query.calendar === "lunar"
          ? i18n.t("anniversary.previewLunar")
          : i18n.t("anniversary.previewSolar")}
      </p>

      <!-- The countdown is the whole point, so it gets the display size the calc
           result uses rather than a row. -->
      <p
        class="row-fade mt-3 px-1 text-[24px] font-medium leading-8 tracking-[-0.05px] text-pretty text-ink tabular-nums"
      >
        {countdownLabel(occurrence.days)}
      </p>
      <p class="mt-1 px-1 text-[13px] leading-5 text-ink-subtle">
        {weekdayLabel(occurrence.date)}
      </p>

      <ul class="mt-4 flex flex-col gap-1">
        {#each lines as line (line.id)}
          <li class="flex items-center gap-2 px-3 py-1">
            <span class="w-20 shrink-0 text-[12px] leading-[1.4] text-ink-subtle">{line.label}</span>
            <span class="min-w-0 flex-1 truncate text-[13px] leading-5 text-ink tabular-nums">{line.value}</span>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="px-1 text-[14px] leading-5 text-ink-tertiary">{i18n.t("anniversary.awaitingLunar")}</p>
    {/if}
  </div>

  <PanelFooter shortcuts={footerShortcuts} />
</div>
