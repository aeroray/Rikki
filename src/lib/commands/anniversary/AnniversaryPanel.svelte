<script lang="ts">
  import { anniversaryRows, startAnniversaryCreate } from "$lib/commands/anniversary/actions";
  import AnniversaryCreate from "$lib/commands/anniversary/AnniversaryCreate.svelte";
  import AnniversaryItem from "$lib/commands/anniversary/AnniversaryItem.svelte";
  import AnniversaryPreview from "$lib/commands/anniversary/AnniversaryPreview.svelte";
  import { parseAnniversaryScreen } from "$lib/commands/anniversary/parse";
  import { primaryModifier, primaryShortcut } from "$lib/commands/settings/engines";
  import PanelEmpty from "$lib/components/PanelEmpty.svelte";
  import PanelFooter, { type FooterShortcut } from "$lib/components/PanelFooter.svelte";
  import ScrollArea from "$lib/components/ScrollArea.svelte";
  import { i18n } from "$lib/i18n";
  import { anniversaries } from "$lib/stores/anniversaries.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { CalendarHeart } from "@lucide/svelte";

  const screen = $derived(parseAnniversaryScreen(ui.commandRest));
  // One clock reading per render keeps every row's countdown consistent.
  const now = $derived(new Date());
  const visible = $derived.by(() => {
    // Reading `lunarReady` here is what makes the rows recompute when the lunar
    // tables land: `lunarApi()` is a plain module value, invisible to Svelte, so
    // without this dependency every lunar row stayed on "loading" forever.
    anniversaries.lunarReady;
    return anniversaryRows(ui.commandRest, now);
  });
  const querying = $derived(screen.type === "filter" && Boolean(screen.query.trim()));

  // Key glyphs are not translated: they name physical keys, which read the same
  // in every locale.
  const footerShortcuts = $derived.by((): FooterShortcut[] => {
    // A notice, an empty list and an unreadable date each replace the actions
    // with a single remark, so they carry no chips.
    if (anniversaries.notice || anniversaries.items.length === 0 || screen.type === "invalid") {
      return [];
    }
    return [
      { keys: "Enter", label: i18n.t("key.edit") },
      { keys: primaryShortcut("N"), label: i18n.t("key.add") },
      { keys: "Delete", label: i18n.t("key.delete") },
      { keys: "Esc", label: i18n.t("key.back") },
    ];
  });

  const footerMessage = $derived.by((): string | null => {
    if (anniversaries.notice) return anniversaries.notice;
    if (anniversaries.items.length === 0)
      return i18n.t("anniversary.emptyHint", { mod: primaryModifier() });
    if (screen.type === "invalid") return i18n.t("anniversary.invalidDate");
    return null;
  });

  $effect(() => {
    // Kick off the tables on first paint for a list that already has lunar rows.
    anniversaries.lunarReady;
    anniversaries.items;
    if (anniversaries.awaitingLunar) void anniversaries.ensureLunar();
  });

  $effect(() => {
    anniversaries.clampSelection(visible.length);
  });

  $effect(() => {
    if (ui.view !== "anniversary" && anniversaries.draft) anniversaries.closeDraft();
  });
</script>

{#if anniversaries.draft}
  <AnniversaryCreate />
{:else if screen.type === "preview"}
  <AnniversaryPreview query={screen.query} {now} />
{:else}
  <!-- The footer is a sibling of the content column, not inside it, so it stays
       pinned to the bottom in the empty, no-match and list states alike. -->
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pt-1">
      {#if anniversaries.items.length === 0}
        <PanelEmpty
          class="flex-1"
          icon={CalendarHeart}
          title={i18n.t("anniversary.emptyTitle")}
          hint={i18n.t("anniversary.emptyBody")}
        >
          <button
            type="button"
            class="pressable mt-3 flex h-10 items-center gap-2 rounded-md bg-surface-1 px-3 text-[14px] leading-5 text-ink hover:bg-surface-2 active:scale-[0.96]"
            onclick={() => startAnniversaryCreate()}
          >
            {i18n.t("anniversary.emptyCreate")}
          </button>
          <p class="mt-2 flex items-center justify-center gap-2 text-[12px] leading-[1.4] text-ink-tertiary">
            <kbd class="rounded-sm bg-canvas px-1.5 py-0.5 font-sans">ann 10-01</kbd>
            <span>{i18n.t("anniversary.or")}</span>
            <kbd class="rounded-sm bg-canvas px-1.5 py-0.5 font-sans">{primaryShortcut("N")}</kbd>
          </p>
        </PanelEmpty>
      {:else if visible.length === 0}
        <p class="px-1 py-6 text-center text-[13px] leading-5 text-ink-subtle">
          {i18n.t("anniversary.noMatch")}
        </p>
      {:else}
        <p class="mb-1 px-1 text-[12px] leading-[1.4] text-ink-subtle">
          {querying ? i18n.t("anniversary.matches") : i18n.t("anniversary.all")}
          <span class="tabular-nums">{visible.length}</span>
        </p>
        <ScrollArea
          class="min-h-0 flex-1"
          viewportClass="flex flex-col gap-2"
          role="listbox"
          tabindex={-1}
          aria-label={i18n.t("anniversary.all")}
        >
          {#each visible as row, index (row.item.id)}
            <AnniversaryItem
              item={row.item}
              occurrence={row.occurrence}
              selected={index === anniversaries.selectedIndex}
              onedit={() => {
                anniversaries.selectedIndex = index;
                anniversaries.openEdit(row.item);
              }}
              onremove={() => void anniversaries.remove(row.item.id)}
            />
          {/each}
        </ScrollArea>
      {/if}
    </div>

    <PanelFooter shortcuts={footerShortcuts} message={footerMessage} />
  </div>
{/if}
