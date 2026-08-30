<script lang="ts">
  import { applyRecentColor, copyColorValue } from "$lib/commands/color/actions";
  import ColorSwatch from "$lib/commands/color/ColorSwatch.svelte";
  import { colorQuery, parseColor, type ParsedColor } from "$lib/commands/color/parse";
  import { recentColors } from "$lib/commands/color/recents";
  import ScrollArea from "$lib/components/ScrollArea.svelte";
  import { i18n } from "$lib/i18n";
  import { clipboard } from "$lib/stores/clipboard.svelte";
  import { ui } from "$lib/stores/ui.svelte";

  const query = $derived(colorQuery(ui.searchText, ui.commandRest, ui.matchedCommand?.id ?? null));
  const parsed = $derived(parseColor(query));
  const recents = $derived(recentColors(clipboard.entries));
  const formats = $derived(parsed ? formatRows(parsed) : []);

  function formatRows(color: ParsedColor): Array<{ id: string; label: string; value: string }> {
    return [
      { id: "hex", label: i18n.t("color.hex"), value: color.hex },
      { id: "rgb", label: i18n.t("color.rgb"), value: color.rgb },
      { id: "hsl", label: i18n.t("color.hsl"), value: color.hsl },
      { id: "rgba", label: i18n.t("color.rgba"), value: color.rgbaCss },
      { id: "hsla", label: i18n.t("color.hsla"), value: color.hsla },
    ];
  }
</script>

<div class="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-1">
  <ScrollArea class="min-h-0 flex-1" viewportClass="flex flex-col">
    {#if parsed}
      <ColorSwatch color={parsed} />
      <ul class="mt-4 flex flex-col gap-1">
        {#each formats as row (row.id)}
          <li>
            <button
              type="button"
              class="row-hit flex w-full items-center gap-2 px-3 py-2 text-left active:scale-[0.96]"
              onclick={() => void copyColorValue(row.value)}
            >
              <span class="w-12 shrink-0 text-[12px] leading-[1.4] text-ink-subtle">{row.label}</span>
              <span class="min-w-0 flex-1 truncate text-[13px] leading-5 text-ink">{row.value}</span>
              <span class="shrink-0 text-[12px] leading-[1.4] text-ink-tertiary">{i18n.t("color.copy")}</span>
            </button>
          </li>
        {/each}
      </ul>
      <p class="palette-hint">{i18n.t("color.copyHint")}</p>
    {:else if query}
      <p class="px-1 text-[14px] leading-5 text-ink-tertiary">{i18n.t("color.invalid")}</p>
    {:else}
      <p class="px-1 text-[14px] leading-5 text-ink-tertiary">{i18n.t("color.emptyHint")}</p>
    {/if}

    <div class="mt-4">
      <p class="mb-2 px-1 text-[12px] leading-[1.4] text-ink-subtle">{i18n.t("color.recent")}</p>
      {#if recents.length === 0}
        <p class="px-1 text-[13px] leading-5 text-ink-tertiary">{i18n.t("color.recentEmpty")}</p>
      {:else}
        <ul class="flex flex-wrap gap-2 px-1 pb-1">
          {#each recents as color (color.hex)}
            <li>
              <button
                type="button"
                class="row-hit flex w-[4.5rem] flex-col items-center gap-1 p-1 text-left active:scale-[0.96]"
                aria-label={i18n.t("color.useRecent", { hex: color.hex })}
                onclick={() => applyRecentColor(color.hex)}
              >
                <span
                  class="relative size-8 overflow-hidden rounded-md media-outline"
                  class:color-check={color.rgba.a < 1 - 0.5 / 255}
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
      {/if}
    </div>
  </ScrollArea>
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
