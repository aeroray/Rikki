<script lang="ts">
  import { ui } from "$lib/stores/ui.svelte";
  import { Search } from "@lucide/svelte";

  let inputEl: HTMLInputElement | undefined = $state();
  let composing = $state(false);

  $effect(() => {
    ui.showNonce;
    if (ui.focusField === "search") {
      requestAnimationFrame(() => inputEl?.focus());
    }
  });

  function onInput() {
    ui.selectedIndex = 0;
    if (ui.matchedCommand?.id !== "todo") {
      ui.todoPanelOpen = false;
    }
  }

  function activateSuggestion() {
    const command = ui.suggestions[ui.selectedIndex] ?? ui.matchedCommand;
    if (!command) return;
    ui.searchText = `${command.prefix} `;
    ui.todoPanelOpen = command.id === "todo";
    ui.focusField = command.id === "todo" ? "todo-input" : "search";
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      void ui.beginHide();
      return;
    }

    if (event.isComposing || composing) return;

    if (event.key === "ArrowDown" && ui.view === "suggest" && ui.suggestions.length > 0) {
      event.preventDefault();
      ui.selectedIndex = (ui.selectedIndex + 1) % ui.suggestions.length;
      return;
    }

    if (event.key === "ArrowUp" && ui.view === "suggest" && ui.suggestions.length > 0) {
      event.preventDefault();
      ui.selectedIndex =
        (ui.selectedIndex - 1 + ui.suggestions.length) % ui.suggestions.length;
      return;
    }

    if (event.key !== "Enter") return;
    event.preventDefault();

    if (ui.view === "suggest") {
      if (ui.matchedCommand) {
        ui.matchedCommand.run(ui.commandRest);
        return;
      }
      activateSuggestion();
      return;
    }

    if (ui.matchedCommand) {
      ui.matchedCommand.run(ui.commandRest);
    }
  }
</script>

<label class="search-glow m-3 flex items-center gap-3 rounded-md bg-surface-1 px-3 py-2.5">
  <Search class="size-4 shrink-0 text-ink-subtle" strokeWidth={1.5} aria-hidden="true" />
  <span class="sr-only">Search commands</span>
  <input
    bind:this={inputEl}
    bind:value={ui.searchText}
    class="w-full bg-transparent text-[16px] leading-6 tracking-[-0.05px] text-ink outline-none placeholder:text-ink-tertiary"
    placeholder="Search or type a command…"
    autocomplete="off"
    spellcheck="false"
    aria-autocomplete="list"
    aria-controls="command-results"
    aria-expanded={ui.view === "suggest"}
    oninput={onInput}
    onkeydown={onKeydown}
    oncompositionstart={() => (composing = true)}
    oncompositionend={() => (composing = false)}
    onfocus={() => (ui.focusField = "search")}
  />
</label>
