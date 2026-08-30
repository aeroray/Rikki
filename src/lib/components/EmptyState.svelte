<script lang="ts">
  import { activateCommand } from "$lib/commands/activate";
  import CommandItem from "$lib/components/CommandItem.svelte";
  import ScrollArea from "$lib/components/ScrollArea.svelte";
  import { i18n } from "$lib/i18n";
  import { ui } from "$lib/stores/ui.svelte";

  $effect(() => {
    ui.clampSelection();
  });
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <ScrollArea
    class="min-h-0 flex-1"
    viewportClass="flex flex-col gap-2 px-3 pb-3 pt-1"
    role="listbox"
    tabindex={-1}
    aria-label={i18n.t("search.list")}
    aria-activedescendant={ui.homeCommands[ui.selectedIndex]
      ? `home-${ui.homeCommands[ui.selectedIndex].id}`
      : undefined}
  >
    {#key ui.showNonce}
    {#each ui.homeCommands as command, index (command.id)}
      <CommandItem
        command={command}
        selected={index === ui.selectedIndex}
        optionId="home-{command.id}"
        staggerIndex={index}
        onselect={() => {
          ui.selectedIndex = index;
          activateCommand(command);
        }}
      />
    {/each}
    {/key}
  </ScrollArea>
</div>
