<script lang="ts">
  import { activateCommand } from "$lib/commands/activate";
  import CommandItem from "$lib/components/CommandItem.svelte";
  import PendingPowerBar from "$lib/components/PendingPowerBar.svelte";
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
  <!-- The empty state has no `PanelFooter`, so without this a scheduled action was
       invisible until something was typed — the panel a user opens first was the
       one place it could not be seen. -->
  <PendingPowerBar />
</div>
