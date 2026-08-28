<script lang="ts">
  import { listCommands } from "$lib/commands/registry";
  import CommandItem from "$lib/components/CommandItem.svelte";
  import { ui } from "$lib/stores/ui.svelte";

  const commands = listCommands();

  function pick(prefix: string, id: string) {
    ui.searchText = `${prefix} `;
    ui.todoPanelOpen = id === "todo";
    ui.focusField = id === "todo" ? "todo-input" : "search";
  }
</script>

<div class="flex flex-1 flex-col px-3 pb-3">
  <div class="flex flex-1 flex-col items-center justify-center px-6 text-center">
    <p class="text-[13px] font-medium tracking-[0.4px] text-primary">Rikki</p>
    <p class="mt-2 max-w-[22rem] text-pretty text-[16px] leading-6 tracking-[-0.05px] text-ink-muted">
      试试输入应用名，或 todo、calc、clip
    </p>
    <p class="mt-2 text-[13px] leading-5 text-ink-subtle">
      Type an app name or a command prefix, then press Enter.
    </p>
  </div>

  <div class="flex flex-col gap-1" role="list" aria-label="Available commands">
    {#each commands as command (command.id)}
      <CommandItem command={command} selected={false} onselect={() => pick(command.prefix, command.id)} />
    {/each}
  </div>
</div>
