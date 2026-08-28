<script lang="ts">
  import CommandItem from "$lib/components/CommandItem.svelte";
  import ScrollArea from "$lib/components/ScrollArea.svelte";
  import { ui } from "$lib/stores/ui.svelte";

  $effect(() => {
    ui.clampSelection();
  });

  function choose(index: number) {
    const command = ui.suggestions[index];
    if (!command) return;
    ui.selectedIndex = index;
    ui.searchText = `${command.prefix} `;
    ui.todoPanelOpen = command.id === "todo";
    ui.focusField = command.id === "todo" ? "todo-input" : "search";
  }
</script>

<ScrollArea
  class="min-h-0 flex-1"
  viewportClass="flex flex-col gap-1 px-3 pb-3 pt-1"
  role="listbox"
  tabindex={-1}
  aria-label="Command suggestions"
  aria-activedescendant={ui.suggestions[ui.selectedIndex]
    ? `command-${ui.suggestions[ui.selectedIndex].id}`
    : undefined}
>
  {#if ui.matchedCommand && ui.suggestions.length === 0}
    <CommandItem
      command={ui.matchedCommand}
      selected={true}
      onselect={() => ui.matchedCommand?.run(ui.commandRest)}
    />
  {:else if ui.suggestions.length === 0}
    <p class="px-1 py-6 text-center text-[13px] leading-5 text-ink-subtle">没有匹配的命令</p>
  {:else}
    {#each ui.suggestions as command, index (command.id)}
      <CommandItem
        {command}
        selected={index === ui.selectedIndex}
        onselect={() => choose(index)}
      />
    {/each}
  {/if}
</ScrollArea>
