<script lang="ts">
  import ClipItem from "$lib/commands/clip/ClipItem.svelte";
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
      { keys: "Ctrl+P", label: i18n.t("clip.keyPin") },
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
      <div class="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <span class="flex size-10 items-center justify-center rounded-md bg-surface-1 text-ink-muted">
          <Clipboard class="size-4" strokeWidth={1.5} aria-hidden="true" />
        </span>
        {#if ui.commandRest.trim()}
          <p class="mt-3 text-[14px] font-medium leading-5 text-ink">{i18n.t("clip.noMatch")}</p>
        {:else}
          <p class="mt-3 text-[14px] font-medium leading-5 text-ink">{i18n.t("clip.emptyTitle")}</p>
          <p class="mt-2 max-w-[20rem] text-pretty text-[13px] leading-5 text-ink-subtle">
            {i18n.t("clip.empty")}
          </p>
        {/if}
      </div>
    {:else}
      <ScrollArea class="min-h-0 flex-1" viewportClass="flex flex-col gap-3">
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

        {#if recent.length > 0}
          <section>
            <p class="mb-1 px-1 text-[12px] leading-[1.4] text-ink-subtle">
              {i18n.t("clip.recent")} <span class="tabular-nums">{recent.length}</span>
            </p>
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
          </section>
        {/if}
      </ScrollArea>
    {/if}
  </div>

  <PanelFooter shortcuts={footerShortcuts} message={footerMessage} />
</div>
