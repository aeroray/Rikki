<script lang="ts">
  import AppItem from "$lib/components/AppItem.svelte";
  import CommandItem from "$lib/components/CommandItem.svelte";
  import ScrollArea from "$lib/components/ScrollArea.svelte";
  import { apps } from "$lib/stores/apps.svelte";
  import { ui } from "$lib/stores/ui.svelte";

  $effect(() => {
    ui.clampSelection();
  });

  function choose(index: number) {
    const hit = ui.rootHits[index];
    if (!hit) return;
    ui.selectedIndex = index;
    if (hit.kind === "command") {
      ui.searchText = `${hit.command.prefix} `;
      ui.todoPanelOpen = hit.command.id === "todo";
      ui.focusField = hit.command.id === "todo" ? "todo-input" : "search";
      return;
    }
    void apps.launch(hit.app.path).then((ok) => {
      if (ok) ui.beginHide();
    });
  }
</script>

<ScrollArea
  class="min-h-0 flex-1"
  viewportClass="flex flex-col gap-1 px-3 pb-3 pt-1"
  role="listbox"
  tabindex={-1}
  aria-label="Apps and commands"
  aria-activedescendant={ui.rootHits[ui.selectedIndex]
    ? `hit-${ui.selectedIndex}`
    : undefined}
>
  {#if ui.rootHits.length === 0}
    <p class="px-1 py-6 text-center text-[13px] leading-5 text-ink-subtle">没有匹配的应用或命令</p>
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
