<script lang="ts">
  import { copyTimestampValue } from "$lib/commands/timestamp/actions";
  import { inspectTimestamp, type TimestampInspect } from "$lib/commands/timestamp/parse";
  import PanelEmpty from "$lib/components/PanelEmpty.svelte";
  import PanelFooter, { type FooterShortcut } from "$lib/components/PanelFooter.svelte";
  import { i18n } from "$lib/i18n";
  import { ui } from "$lib/stores/ui.svelte";
  import { Clock } from "@lucide/svelte";

  const inspected = $derived(inspectTimestamp(ui.commandRest));
  const rows = $derived(inspected.ok ? resultRows(inspected) : []);

  // Key glyphs are not translated: they name physical keys. Enter copies the
  // row that matters for the parsed direction, and the note reminds the user
  // that any row is clickable.
  const footerShortcuts = $derived.by((): FooterShortcut[] =>
    inspected.ok
      ? [
          {
            keys: "Enter",
            label: i18n.t(inspected.kind === "from-unix" ? "ts.keyCopyLocal" : "ts.keyCopySeconds"),
          },
        ]
      : [],
  );
  const footerMessage = $derived(inspected.ok ? i18n.t("ts.noteClickRow") : null);

  function resultRows(result: Extract<TimestampInspect, { ok: true }>): Array<{
    id: string;
    label: string;
    value: string;
  }> {
    if (result.kind === "from-unix") {
      return [
        { id: "unix", label: i18n.t("ts.unix"), value: String(result.unit === "ms" ? result.unixMs : result.unixSeconds) },
        { id: "local", label: i18n.t("ts.local"), value: result.local },
        { id: "utc", label: i18n.t("ts.utc"), value: result.utc },
      ];
    }
    return [
      { id: "date", label: i18n.t("ts.date"), value: result.input },
      { id: "seconds", label: i18n.t("ts.seconds"), value: String(result.unixSeconds) },
      { id: "millis", label: i18n.t("ts.millis"), value: String(result.unixMs) },
    ];
  }
</script>

<!-- The footer is a sibling of the content column, not inside it, so it stays
     pinned to the bottom and does not double up the panel's horizontal padding. -->
<div class="flex min-h-0 flex-1 flex-col">
  <div class="flex min-h-0 flex-1 flex-col px-3 pt-1">
    {#if inspected.ok}
      <p class="px-1 text-[12px] leading-[1.4] text-ink-subtle">
        {inspected.kind === "from-unix" ? i18n.t("ts.fromUnix") : i18n.t("ts.fromDate")}
      </p>
      <ul class="mt-3 flex flex-col gap-1">
        {#each rows as row (row.id)}
          <li>
            <button
              type="button"
              class="row-hit flex w-full items-center gap-2 px-3 py-2 text-left active:scale-[0.96]"
              onclick={() => void copyTimestampValue(row.value)}
            >
              <span class="w-20 shrink-0 text-[12px] leading-[1.4] text-ink-subtle">{row.label}</span>
              <span class="min-w-0 flex-1 truncate text-[13px] leading-5 text-ink tabular-nums">{row.value}</span>
              <span class="shrink-0 text-[12px] leading-[1.4] text-ink-tertiary">{i18n.t("ts.copy")}</span>
            </button>
          </li>
        {/each}
      </ul>
    {:else if inspected.empty}
      <PanelEmpty class="flex-1" icon={Clock} hint={i18n.t("ts.emptyHint")}>
        <p class="mt-2 font-sans text-[13px] leading-6 text-ink-subtle">
          <span class="block">ts 1724860000</span>
          <span class="block">ts 1724860000000</span>
          <span class="block">ts 2026-08-29</span>
          <span class="block">ts 2026-08-29 15:13:20</span>
          <span class="block">ts {i18n.locale === "zh-CN" ? "今天" : "now"}</span>
        </p>
      </PanelEmpty>
    {:else}
      <p class="px-1 text-[14px] leading-5 text-ink-tertiary">{i18n.t("ts.invalid")}</p>
    {/if}
  </div>

  <PanelFooter shortcuts={footerShortcuts} message={footerMessage} />
</div>
