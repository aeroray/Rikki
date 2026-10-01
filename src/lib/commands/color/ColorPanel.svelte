<script lang="ts">
  import { applyRecentColor, copyColorValue } from "$lib/commands/color/actions";
  import ColorSwatch from "$lib/commands/color/ColorSwatch.svelte";
  import { colorQuery, parseColor } from "$lib/commands/color/parse";
  import { colorOptions, parsedColor } from "$lib/commands/color/selection";
  import PanelEmpty from "$lib/components/PanelEmpty.svelte";
  import PanelFooter, { type FooterShortcut } from "$lib/components/PanelFooter.svelte";
  import ScrollArea from "$lib/components/ScrollArea.svelte";
  import { i18n } from "$lib/i18n";
  import { ui } from "$lib/stores/ui.svelte";
  import { Droplet } from "@lucide/svelte";

  const query = $derived(colorQuery(ui.searchText, ui.commandRest, ui.matchedCommand?.id ?? null));
  const parsed = $derived(parsedColor());
  // One list, so the arrows and the highlight agree with what is on screen. The
  // order lives in `selection.ts` because the key handler walks the same one.
  const options = $derived(colorOptions());
  const formats = $derived(options.filter((option) => option.kind === "format"));
  const recents = $derived(options.filter((option) => option.kind === "recent"));

  // Key glyphs are not translated: they name physical keys, which read the same
  // in every locale. Enter takes whichever row is highlighted, which is HEX until
  // the arrows move — so the chips only appear while the query parses.
  const footerShortcuts = $derived.by((): FooterShortcut[] =>
    parsed ? [{ keys: "Enter", label: i18n.t("color.keyCopy") }] : [],
  );

  const footerMessage = $derived.by((): string | null =>
    parsed ? i18n.t("color.noteAnyFormat") : null,
  );

  $effect(() => {
    ui.selectedIndex = Math.min(ui.selectedIndex, Math.max(0, options.length - 1));
  });
</script>

<!-- The footer is a sibling of the content column, not inside it, so it stays
     pinned to the bottom however long the recents strip grows. -->
<div class="flex min-h-0 flex-1 flex-col">
  <div class="flex min-h-0 flex-1 flex-col px-3 pt-1">
    <ScrollArea
      class="min-h-0 flex-1"
      viewportClass="flex flex-col"
      role="listbox"
      aria-label={i18n.t("color.listLabel")}
    >
      {#if parsed}
        <ColorSwatch color={parsed} />
      {/if}

      {#if formats.length > 0}
        <ul class="mt-4 flex flex-col gap-1">
          {#each formats as row, index (row.id)}
            <li>
              <button
                type="button"
                role="option"
                aria-selected={ui.selectedIndex === index}
                class="row-hit flex w-full items-center gap-2 px-3 py-2 text-left active:scale-[0.96] {ui
                  .selectedIndex === index
                  ? 'is-selected'
                  : ''}"
                onclick={() => void copyColorValue(row.value)}
              >
                <span class="w-12 shrink-0 text-[12px] leading-[1.4] text-ink-subtle">{row.label}</span>
                <span class="min-w-0 flex-1 truncate text-[13px] leading-5 text-ink">{row.value}</span>
                <span class="shrink-0 text-[12px] leading-[1.4] text-ink-tertiary">{i18n.t("color.copy")}</span>
              </button>
            </li>
          {/each}
        </ul>
      {:else if query}
        <p class="px-1 text-[14px] leading-5 text-ink-tertiary">{i18n.t("color.invalid")}</p>
      {:else if recents.length === 0}
        <!-- Nothing typed and nothing remembered: the panel is genuinely empty,
             so the state takes the whole column the way every other panel's
             does, instead of sitting above a heading that introduces nothing. -->
        <PanelEmpty class="flex-1" icon={Droplet} hint={i18n.t("color.emptyHint")} />
      {/if}

      {#if recents.length > 0}
        <!-- The strip is the panel's own explanation when it exists, and the
             heading alone says what it is. Showing both used to say the same
             thing twice: an empty-state line about typing a colour, and another
             about colours from the clipboard appearing here.

             The gap is only for when something sits above it — on its own it was
             16px of nothing between the search field and the heading. -->
        <div class={formats.length > 0 || query ? "mt-4" : ""}>
          <p class="mb-2 px-1 text-[12px] leading-[1.4] text-ink-subtle">{i18n.t("color.recent")}</p>
          <ul class="flex flex-wrap gap-2 px-1 pb-1">
            {#each recents as color, index (color.id)}
              {@const selected = ui.selectedIndex === formats.length + index}
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  class="row-hit flex w-[4.5rem] flex-col items-center gap-1 p-1 text-left active:scale-[0.96] {selected
                    ? 'is-selected'
                    : ''}"
                  aria-label={i18n.t("color.useRecent", { hex: color.hex })}
                  onclick={() => applyRecentColor(color.hex)}
                >
                  <span
                    class="relative size-8 overflow-hidden rounded-md media-outline"
                    class:color-check={color.translucent}
                    aria-hidden="true"
                  >
                    <span class="absolute inset-0" style="background-color: {color.rgbaCss}"></span>
                  </span>
                  <span class="w-full truncate text-center text-[11px] leading-[1.3] text-ink-tertiary tabular-nums">
                    {color.hex}
                  </span>
                </button>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </ScrollArea>
  </div>

  <PanelFooter shortcuts={footerShortcuts} message={footerMessage} />
</div>

<style>
  .color-check {
    background-color: var(--color-surface-1);
    background-image:
      linear-gradient(45deg, var(--color-hairline) 25%, transparent 25%),
      linear-gradient(-45deg, var(--color-hairline) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, var(--color-hairline) 75%),
      linear-gradient(-45deg, transparent 75%, var(--color-hairline) 75%);
    background-size: 8px 8px;
    background-position:
      0 0,
      0 4px,
      4px -4px,
      -4px 0;
  }
</style>
