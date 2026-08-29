<script lang="ts">
  import { clipboard } from "$lib/stores/clipboard.svelte";
  import { apps } from "$lib/stores/apps.svelte";
  import { snippets } from "$lib/stores/snippets.svelte";
  import { settings } from "$lib/stores/settings.svelte";
  import { emojis } from "$lib/stores/emojis.svelte";
  import { translate } from "$lib/stores/translate.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { i18n } from "$lib/i18n";
  import { Search } from "@lucide/svelte";
  import { activateCommand } from "$lib/commands/activate";
  import { canFallbackSearch, runFallbackSearch } from "$lib/commands/fallback";
  import { toggleSelectedImagePreview } from "$lib/commands/clip/preview";
  import {
    cancelSnippetDraft,
    handleSnippetEnter,
    startSnippetCreate,
    startSnippetEdit,
  } from "$lib/commands/snippet/actions";
  import { parseSnippetAction } from "$lib/commands/snippet/parse";
  import {
    closeSettingsDrill,
    handleSettingsEnter,
    startEngineCreate,
  } from "$lib/commands/settings/actions";
  import { parseSettingsScreen } from "$lib/commands/settings/parse";
  import { copyColorHex } from "$lib/commands/color/actions";
  import { closeEmojiDrill, handleEmojiArrow, handleEmojiEnter } from "$lib/commands/emoji/actions";
  import { closeJsonEdit, handleJsonEnter } from "$lib/commands/json/actions";
  import { copyBase64Result, toggleBase64Mode } from "$lib/commands/base64/actions";
  import { copyTimestampResult } from "$lib/commands/timestamp/actions";
  import { copyQrDecode, copyQrSvg, saveQrPng } from "$lib/commands/qrcode/actions";
  import { json } from "$lib/stores/json.svelte";

  let inputEl: HTMLInputElement | undefined = $state();
  let composing = $state(false);

  $effect(() => {
    ui.showNonce;
    ui.imagePreviewSrc;
    if (ui.focusField === "search" && !ui.imagePreviewSrc && !snippets.draft && !settings.engineDraft && !settings.translateDraft) {
      requestAnimationFrame(() => inputEl?.focus());
    }
  });

  function onInput() {
    ui.selectedIndex = 0;
    clipboard.selectedIndex = 0;
    snippets.selectedIndex = 0;
    emojis.selectedIndex = 0;
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
      if (closeSettingsDrill()) {
        event.stopPropagation();
        return;
      }
      if (closeEmojiDrill()) {
        event.stopPropagation();
        return;
      }
      if (closeJsonEdit()) {
        event.stopPropagation();
        return;
      }
      if (cancelSnippetDraft()) {
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

    if (ui.view === "snippet") {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        startSnippetCreate();
        return;
      }
      if (snippets.draft) {
        if (event.key === "Enter") {
          event.preventDefault();
          void handleSnippetEnter();
        }
        return;
      }
      const action = parseSnippetAction(ui.commandRest);
      if (action.type === "add") {
        if (event.key === "Enter") {
          event.preventDefault();
          void handleSnippetEnter();
        }
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "e") {
        event.preventDefault();
        startSnippetEdit();
        return;
      }
      const items = snippets.filtered(ui.commandRest);
      if (event.key === "ArrowDown" && items.length > 0) {
        event.preventDefault();
        snippets.selectedIndex = Math.min(items.length - 1, snippets.selectedIndex + 1);
        return;
      }
      if (event.key === "ArrowUp" && items.length > 0) {
        event.preventDefault();
        snippets.selectedIndex = Math.max(0, snippets.selectedIndex - 1);
        return;
      }
      if (event.key === "Delete") {
        event.preventDefault();
        const snippet = items[snippets.selectedIndex];
        if (snippet) void snippets.remove(snippet.id);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        void handleSnippetEnter();
        return;
      }
    }

    if (ui.view === "emoji") {
      if (handleEmojiArrow(event.key)) {
        event.preventDefault();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        handleEmojiEnter();
        return;
      }
    }

    if (ui.view === "json") {
      if (json.editing) return;
      if (event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        json.toggleCompact();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "e") {
        event.preventDefault();
        json.startEdit();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        void handleJsonEnter();
        return;
      }
    }

    if (ui.view === "base64") {
      if (event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        toggleBase64Mode();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        void copyBase64Result();
        return;
      }
    }

    if (ui.view === "timestamp") {
      if (event.key === "Enter") {
        event.preventDefault();
        void copyTimestampResult();
        return;
      }
    }

    if (ui.view === "qr") {
      if (event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        void saveQrPng();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        void copyQrSvg();
        return;
      }
    }

    if (ui.view === "qrdecode") {
      if (event.key === "Enter") {
        event.preventDefault();
        void copyQrDecode();
        return;
      }
    }

    if (ui.view === "color") {
      if (event.key === "Enter") {
        event.preventDefault();
        void copyColorHex();
        return;
      }
    }

    if (ui.view === "translate") {
      if (event.key === "Tab") {
        if (!translate.wordMode) return;
        event.preventDefault();
        event.stopPropagation();
        translate.swap();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        void translate.submit();
        return;
      }
    }

    if (ui.view === "settings") {
      if (settings.recording) {
        event.preventDefault();
        void settings.captureHotkey(event);
        return;
      }
      if (settings.engineDraft) {
        if (event.key === "Enter") {
          event.preventDefault();
          void settings.saveEngineDraft();
        }
        return;
      }
      if (settings.translateDraft) {
        if (event.key === "Enter") event.preventDefault();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        startEngineCreate();
        return;
      }
      const screen = parseSettingsScreen(ui.commandRest);
      if (event.key === "Delete" && screen === "engine") {
        event.preventDefault();
        const engine = settings.engines[settings.selectedIndex];
        if (engine?.custom) void settings.removeEngine(engine.id);
        return;
      }
      const count =
        screen === "engine"
          ? settings.engines.length
          : screen === "theme"
            ? settings.themes.length
            : screen === "language"
              ? settings.locales.length
              : screen === "translate" || screen === "hotkey"
                ? 0
                : settings.listItems.length;
      if (event.key === "ArrowDown" && count > 0) {
        event.preventDefault();
        settings.selectedIndex = Math.min(count - 1, settings.selectedIndex + 1);
        return;
      }
      if (event.key === "ArrowUp" && count > 0) {
        event.preventDefault();
        settings.selectedIndex = Math.max(0, settings.selectedIndex - 1);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        void handleSettingsEnter();
        return;
      }
    }

    const rootCount =
      ui.view === "empty" ? ui.homeCommands.length : ui.view === "suggest" ? ui.rootHits.length : 0;
    if (event.key === "ArrowDown" && rootCount > 0) {
      event.preventDefault();
      ui.selectedIndex = Math.min(rootCount - 1, ui.selectedIndex + 1);
      return;
    }

    if (event.key === "ArrowUp" && rootCount > 0) {
      event.preventDefault();
      ui.selectedIndex = Math.max(0, ui.selectedIndex - 1);
      return;
    }

    if (event.key !== "Enter") return;
    event.preventDefault();

    if (ui.view === "empty") {
      const command = ui.homeCommands[ui.selectedIndex];
      if (command) activateCommand(command);
      return;
    }

    if (ui.view === "suggest") {
      if (ui.matchedCommand && ui.commandRest.trim()) {
        ui.matchedCommand.run(ui.commandRest);
        return;
      }
      const hit = ui.rootHits[ui.selectedIndex];
      if (hit?.kind === "app") {
        void apps.launch(hit.app.path).then((ok) => {
          if (ok) ui.beginHide({ reset: true });
          else ui.flash(i18n.t("app.launchFailed"));
        });
        return;
      }
      if (hit?.kind === "command") {
        activateCommand(hit.command);
        return;
      }
      if (canFallbackSearch(ui.searchText, ui.rootHits.length)) {
        void runFallbackSearch(ui.searchText);
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
  <span class="sr-only">{i18n.t("search.placeholder")}</span>
  <input
    bind:this={inputEl}
    bind:value={ui.searchText}
    class="w-full bg-transparent text-[16px] leading-6 tracking-[-0.05px] text-ink outline-none placeholder:text-ink-tertiary"
    placeholder={i18n.t("search.placeholder")}
    autocomplete="off"
    spellcheck="false"
    aria-autocomplete="list"
    aria-controls="command-results"
    aria-expanded={ui.view === "suggest" || ui.view === "empty"}
    oninput={onInput}
    onkeydown={onKeydown}
    oncompositionstart={() => (composing = true)}
    oncompositionend={() => (composing = false)}
    onfocus={() => (ui.focusField = "search")}
  />
</label>
