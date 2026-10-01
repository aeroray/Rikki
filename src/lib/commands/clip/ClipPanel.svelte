<script lang="ts">
  import ClipItem from "$lib/commands/clip/ClipItem.svelte";
  import { primaryShortcut } from "$lib/commands/settings/engines";
  import PanelEmpty from "$lib/components/PanelEmpty.svelte";
  import PanelFooter, { type FooterShortcut } from "$lib/components/PanelFooter.svelte";
  import ScrollArea from "$lib/components/ScrollArea.svelte";
  import { i18n } from "$lib/i18n";
  import { clipboard } from "$lib/stores/clipboard.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { Clipboard } from "@lucide/svelte";
  import { onDestroy, onMount } from "svelte";

  const items = $derived(clipboard.filtered(ui.commandRest));
  const pinned = $derived(items.filter((entry) => entry.pinned));
  const recent = $derived(items.filter((entry) => !entry.pinned));
  let now = $state(Date.now());

  // Key glyphs are not translated: they name physical keys, which read the same
  // in every locale.
  const footerShortcuts = $derived.by((): FooterShortcut[] => {
    if (items.length === 0) return [];
    return [
      { keys: "Enter", label: i18n.t("clip.keyPaste") },
      { keys: "Tab", label: i18n.t("clip.keyPreview") },
      { keys: "Delete", label: i18n.t("key.delete") },
      { keys: "Shift+Delete", label: i18n.t("clip.keyClear") },
      { keys: primaryShortcut("P"), label: i18n.t("clip.keyPin") },
    ];
  });

  const footerMessage = $derived.by((): string | null => {
    if (items.length === 0) return null;
    return i18n.t("clip.count", { count: items.length });
  });

  $effect(() => {
    clipboard.clampSelection(items.length);
  });

  onMount(() => {
    const tick = setInterval(() => {
      now = Date.now();
    }, 10_000);
    return () => clearInterval(tick);
  });

  onDestroy(() => {
    clipboard.closeConfirm();
  });

  function paste(id: string) {
    void clipboard.paste(id);
  }
</script>

<!-- The footer is a sibling of the content column, not inside it, so it stays
     pinned to the bottom however long the list is. -->
<div class="relative flex min-h-0 flex-1 flex-col">
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pt-1">
    {#if items.length === 0}
      <!-- One block for both empty states: a query that found nothing is the
           same panel with different copy, not a different kind of screen. -->
      {#if ui.commandRest.trim()}
        <PanelEmpty class="flex-1" icon={Clipboard} title={i18n.t("clip.noMatch")} />
      {:else}
        <PanelEmpty
          class="flex-1"
          icon={Clipboard}
          title={i18n.t("clip.emptyTitle")}
          hint={i18n.t("clip.empty")}
        />
      {/if}
    {:else}
      <ScrollArea
        class="min-h-0 flex-1"
        viewportClass="flex flex-col gap-3"
        role="listbox"
        aria-label={i18n.t("clip.listLabel")}
      >
        {#if pinned.length > 0}
          <section>
            <p class="mb-1 px-1 text-[12px] leading-[1.4] text-ink-subtle">
              {i18n.t("clip.pinned")} <span class="tabular-nums">{pinned.length}</span>
            </p>
            <ul class="flex flex-col gap-1">
              {#each pinned as entry, index (entry.id)}
                <li>
                  <ClipItem
                    {entry}
                    {now}
                    selected={clipboard.selectedIndex === index}
                    onselect={() => paste(entry.id)}
                    onpin={() => clipboard.togglePin(entry.id)}
                  />
                </li>
              {/each}
            </ul>
          </section>
        {/if}

        <!-- The recent block has no heading: everything below the pinned ones is
             recent, so the label only repeated what the list already showed. The
             pinned block keeps its own, because that split is the one a reader
             cannot see for themselves. -->
        {#if recent.length > 0}
          <ul class="flex flex-col gap-1">
            {#each recent as entry, index (entry.id)}
              <li>
                <ClipItem
                  {entry}
                  {now}
                  selected={clipboard.selectedIndex === pinned.length + index}
                  onselect={() => paste(entry.id)}
                  onpin={() => clipboard.togglePin(entry.id)}
                />
              </li>
            {/each}
          </ul>
        {/if}
      </ScrollArea>
    {/if}
  </div>

  <PanelFooter shortcuts={footerShortcuts} message={footerMessage} />
</div>
