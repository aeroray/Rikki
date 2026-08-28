<script lang="ts">
  import { activateCommand } from "$lib/commands/activate";
  import CommandItem from "$lib/components/CommandItem.svelte";
  import ScrollArea from "$lib/components/ScrollArea.svelte";
  import { ui } from "$lib/stores/ui.svelte";

  $effect(() => {
    ui.clampSelection();
  });
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <ScrollArea
    class="min-h-0 flex-1"
    viewportClass="flex flex-col gap-1 px-3 pb-3 pt-1"
    role="listbox"
    tabindex={-1}
    aria-label="Available commands"
    aria-activedescendant={ui.homeCommands[ui.selectedIndex]
      ? `home-${ui.homeCommands[ui.selectedIndex].id}`
      : undefined}
  >
    {#each ui.homeCommands as command, index (command.id)}
      <CommandItem
        command={command}
        selected={index === ui.selectedIndex}
        optionId="home-{command.id}"
        onselect={() => {
          ui.selectedIndex = index;
          activateCommand(command);
        }}
      />
    {/each}
  </ScrollArea>
</div>
