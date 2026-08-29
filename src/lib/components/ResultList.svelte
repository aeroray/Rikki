<script lang="ts">
  import { activateCommand } from "$lib/commands/activate";
  import { canFallbackSearch } from "$lib/commands/fallback";
  import AppItem from "$lib/components/AppItem.svelte";
  import CommandItem from "$lib/components/CommandItem.svelte";
  import ScrollArea from "$lib/components/ScrollArea.svelte";
  import { engineDisplayName } from "$lib/commands/settings/engines";
  import { i18n } from "$lib/i18n";
  import { apps } from "$lib/stores/apps.svelte";
  import { settings } from "$lib/stores/settings.svelte";
  import { ui } from "$lib/stores/ui.svelte";

  const fallback = $derived(canFallbackSearch(ui.searchText, ui.rootHits.length));

  $effect(() => {
    ui.clampSelection();
  });

  function choose(index: number) {
    const hit = ui.rootHits[index];
    if (!hit) return;
    ui.selectedIndex = index;
    if (hit.kind === "command") {
      activateCommand(hit.command);
      return;
    }
        void apps.launch(hit.app.path).then((ok) => {
          if (ok) ui.beginHide({ reset: true });
        });
  }
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <ScrollArea
    class="min-h-0 flex-1"
    viewportClass="flex flex-col gap-1 px-3 pb-3 pt-1"
    role="listbox"
    tabindex={-1}
    aria-label={i18n.t("search.list")}
    aria-activedescendant={ui.rootHits[ui.selectedIndex]
      ? `hit-${ui.selectedIndex}`
      : undefined}
  >
    {#if ui.rootHits.length === 0}
      <p class="px-1 py-6 text-center text-[13px] leading-5 text-ink-subtle">{i18n.t("result.empty")}</p>
    {:else}
      {#each ui.rootHits as hit, index (hit.id)}
        {#if hit.kind === "command"}
          <CommandItem
            command={hit.command}
            selected={index === ui.selectedIndex}
            optionId="hit-{index}"
            onselect={() => choose(index)}
          />
        {:else}
          <AppItem
            app={hit.app}
            selected={index === ui.selectedIndex}
            optionId="hit-{index}"
            onselect={() => choose(index)}
          />
        {/if}
      {/each}
    {/if}
  </ScrollArea>
  {#if fallback}
    <p class="px-4 pb-3 text-[12px] leading-[1.4] text-ink-tertiary">
      {i18n.t("result.fallback", { engine: engineDisplayName(settings.engine) })}
    </p>
  {/if}
</div>
