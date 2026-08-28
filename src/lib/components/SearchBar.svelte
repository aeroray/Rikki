<script lang="ts">
  import { clipboard } from "$lib/stores/clipboard.svelte";
  import { apps } from "$lib/stores/apps.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { Search } from "@lucide/svelte";
  import { activateCommand } from "$lib/commands/activate";
  import { toggleSelectedImagePreview } from "$lib/commands/clip/preview";

  let inputEl: HTMLInputElement | undefined = $state();
  let composing = $state(false);

  $effect(() => {
    ui.showNonce;
    ui.imagePreviewSrc;
    if (ui.focusField === "search" && !ui.imagePreviewSrc) {
      requestAnimationFrame(() => inputEl?.focus());
    }
  });

  function onInput() {
    ui.selectedIndex = 0;
    clipboard.selectedIndex = 0;
    if (ui.matchedCommand?.id !== "todo") {
      ui.todoPanelOpen = false;
    }
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (ui.imagePreviewSrc) {
        ui.imagePreviewSrc = null;
        event.stopPropagation();
        return;
      }
      void ui.beginHide();
      return;
    }

    if (event.isComposing || composing) return;

    if (ui.view === "clip") {
      const items = clipboard.filtered(ui.commandRest);
      if (event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        toggleSelectedImagePreview();
        return;
      }
      if (event.key === "ArrowDown" && items.length > 0) {
        event.preventDefault();
        clipboard.selectedIndex = Math.min(items.length - 1, clipboard.selectedIndex + 1);
        return;
      }
      if (event.key === "ArrowUp" && items.length > 0) {
        event.preventDefault();
        clipboard.selectedIndex = Math.max(0, clipboard.selectedIndex - 1);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "p") {
        event.preventDefault();
        const entry = items[clipboard.selectedIndex];
        if (entry) clipboard.togglePin(entry.id);
        return;
      }
      if (event.key === "Delete") {
        event.preventDefault();
        const entry = items[clipboard.selectedIndex];
        if (entry) clipboard.remove(entry.id);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const entry = items[clipboard.selectedIndex];
        if (entry) void clipboard.paste(entry.id);
        return;
      }
    }

    if (event.key === "ArrowDown" && ui.view === "suggest" && ui.rootHits.length > 0) {
      event.preventDefault();
      ui.selectedIndex = Math.min(ui.rootHits.length - 1, ui.selectedIndex + 1);
      return;
    }

    if (event.key === "ArrowUp" && ui.view === "suggest" && ui.rootHits.length > 0) {
      event.preventDefault();
      ui.selectedIndex = Math.max(0, ui.selectedIndex - 1);
      return;
    }

    if (event.key !== "Enter") return;
    event.preventDefault();

    if (ui.view === "suggest") {
      const hit = ui.rootHits[ui.selectedIndex];
      if (hit?.kind === "app") {
        void apps.launch(hit.app.path).then((ok) => {
          if (ok) ui.beginHide();
        });
        return;
      }
      if (hit?.kind === "command") {
        activateCommand(hit.command);
        return;
      }
      if (ui.matchedCommand) {
        ui.matchedCommand.run(ui.commandRest);
      }
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
    placeholder="Search apps or type a command…"
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
