<script lang="ts">
  import { commitPower, powerQueryUnreadable, type PowerAction } from "$lib/commands/sys/actions";
  import { delayOptions } from "$lib/commands/sys/schedule";
  import PanelFooter, { type FooterShortcut } from "$lib/components/PanelFooter.svelte";
  import ScrollArea from "$lib/components/ScrollArea.svelte";
  import { i18n } from "$lib/i18n";
  import { ui } from "$lib/stores/ui.svelte";
  import { Power, RotateCw } from "@lucide/svelte";

  let { action }: { action: PowerAction } = $props();

  // Recomputed on every render so the wall-clock column stays honest while the
  // panel is open; the presets are minute-granular, so a stale minute would show.
  const now = $derived(new Date());
  const options = $derived(delayOptions(ui.commandRest, now));

  const label = $derived(action === "shutdown" ? i18n.t("sys.shutdown") : i18n.t("sys.reboot"));
  const Icon = $derived(action === "shutdown" ? Power : RotateCw);

  const footerShortcuts = $derived<FooterShortcut[]>([
    { keys: "↑↓", label: i18n.t("key.select") },
    { keys: "Enter", label: i18n.t("power.schedule") },
    { keys: "Esc", label: i18n.t("key.cancel") },
  ]);

  // Text that is not a delay at all, which is worth saying rather than silently
  // offering the presets as though the typing had been understood.
  const footerMessage = $derived(powerQueryUnreadable() ? i18n.t("power.unreadable") : null);

  /**
   * The row's label.
   *
   * A lookup rather than a template string, because the catalog is typed and
   * `power.preset.${id}` is not a key it can check — a typo would compile and then
   * render the key itself.
   */
  const PRESET_LABELS = {
    now: "power.preset.now",
    "15m": "power.preset.15m",
    "30m": "power.preset.30m",
    "1h": "power.preset.1h",
    "2h": "power.preset.2h",
    "4h": "power.preset.4h",
  } as const;

  function optionLabel(id: string): string {
    if (id === "typed") return i18n.t("power.custom");
    return i18n.t(PRESET_LABELS[id as keyof typeof PRESET_LABELS]);
  }

  $effect(() => {
    ui.selectedIndex = Math.min(ui.selectedIndex, Math.max(0, options.length - 1));
  });
</script>

<!-- The footer is a sibling of the content column, not inside it, so it stays
     pinned while the list scrolls. -->
<div class="flex min-h-0 flex-1 flex-col">
  <div class="flex min-h-0 flex-1 flex-col px-3 pt-1">
    <ScrollArea
      class="min-h-0 flex-1"
      viewportClass="flex flex-col gap-1 py-1"
      role="listbox"
      aria-label={i18n.t("power.listLabel", { action: label })}
    >
      {#each options as option, index (option.id)}
        {@const selected = ui.selectedIndex === index}
        <button
          type="button"
          role="option"
          aria-selected={selected}
          class="row-hit flex w-full items-center gap-3 rounded-md px-3 py-2 text-left active:scale-[0.96] {selected
            ? 'is-selected'
            : ''}"
          onclick={() => commitPower(action, index)}
        >
          <Icon class="size-4 shrink-0 text-ink-subtle" strokeWidth={1.5} aria-hidden="true" />
          <span class="min-w-0 flex-1 truncate text-[13px] leading-5 text-ink">
            {optionLabel(option.id)}
          </span>
          <!-- The wall-clock time is the point of this column: "2 小时" is harder
               to place than "14:00", and it is what the user checks before
               committing to losing their session. -->
          <span class="shrink-0 text-[13px] leading-5 text-ink-subtle tabular-nums">
            {option.detail}
          </span>
        </button>
      {/each}
    </ScrollArea>
  </div>

  <PanelFooter shortcuts={footerShortcuts} message={footerMessage} />
</div>
