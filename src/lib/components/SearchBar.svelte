<script lang="ts">
  import { clipboard } from "$lib/stores/clipboard.svelte";
  import { apps } from "$lib/stores/apps.svelte";
  import { snippets } from "$lib/stores/snippets.svelte";
  import { settings } from "$lib/stores/settings.svelte";
  import { emojis } from "$lib/stores/emojis.svelte";
  import { translate } from "$lib/stores/translate.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { i18n } from "$lib/i18n";
  import EngineMark from "$lib/components/EngineMark.svelte";
  import { activateCommand } from "$lib/commands/activate";
  import { canFallbackSearch, runFallbackSearch } from "$lib/commands/fallback";
  import { engineIdForCommand } from "$lib/commands/web";
  import { toggleSelectedImagePreview } from "$lib/commands/clip/preview";
  import {
    handleSnippetEnter,
    startSnippetCreate,
    startSnippetEdit,
  } from "$lib/commands/snippet/actions";
  import { parseSnippetAction } from "$lib/commands/snippet/parse";
  import {
    handleSettingsEnter,
    startEngineCreate,
  } from "$lib/commands/settings/actions";
  import { parseSettingsScreen } from "$lib/commands/settings/parse";
  import { copyColorHex } from "$lib/commands/color/actions";
  import { handleEmojiArrow, handleEmojiEnter } from "$lib/commands/emoji/actions";
  import { handleJsonEnter } from "$lib/commands/json/actions";
  import { escapePalette } from "$lib/commands/escape";
  import { copyBase64Result, toggleBase64Mode } from "$lib/commands/base64/actions";
  import { copyTimestampResult } from "$lib/commands/timestamp/actions";
  import { copyQrDecode, copyQrSvg, saveQrPng } from "$lib/commands/qrcode/actions";
  import { copyCalendarDate } from "$lib/commands/calendar/actions";
  import { calendar } from "$lib/stores/calendar.svelte";
  import {
    anniversaryRows,
    handleAnniversaryEnter,
    startAnniversaryCreate,
  } from "$lib/commands/anniversary/actions";
  import { parseAnniversaryScreen } from "$lib/commands/anniversary/parse";
  import { anniversaries } from "$lib/stores/anniversaries.svelte";
  import { parseEmojiScreen } from "$lib/commands/emoji/parse";
  import { json } from "$lib/stores/json.svelte";
  import { todos } from "$lib/stores/todos.svelte";

  let inputEl: HTMLInputElement | undefined = $state();
  let composing = $state(false);

  /**
   * ARIA 1.2 requires `aria-activedescendant` on the element that actually holds
   * focus — the input — not on the listbox it controls. It used to sit on the
   * listbox, where assistive tech ignores it.
   *
   * Every branch mirrors the id its row component renders, because an id that
   * resolves to nothing is silence: arrowing through a panel announced neither
   * the row nor the fact that the highlight had moved. Only the views that
   * render a listbox are listed, and each one is read exactly the way the panel
   * reads it, so keyboard and highlight cannot disagree about which row is
   * selected.
   */
  const activeOptionId = $derived.by((): string | undefined => {
    if (ui.view === "empty") {
      const command = ui.homeCommands[ui.selectedIndex];
      return command ? `home-${command.id}` : undefined;
    }
    if (ui.view === "suggest") {
      return ui.rootHits[ui.selectedIndex] ? `hit-${ui.selectedIndex}` : undefined;
    }
    if (ui.view === "clip") {
      const entry = clipboard.filtered(ui.commandRest)[clipboard.selectedIndex];
      return entry ? `clip-${entry.id}` : undefined;
    }
    if (ui.view === "snippet") {
      if (snippets.draft) return undefined;
      const snippet = snippets.filtered(ui.commandRest)[snippets.selectedIndex];
      return snippet ? `snippet-${snippet.id}` : undefined;
    }
    if (ui.view === "anniversary") {
      // The draft and preview screens replace the list, so the row the index
      // points at is not on screen there.
      if (anniversaries.draft) return undefined;
      if (parseAnniversaryScreen(ui.commandRest).type === "preview") return undefined;
      const row = anniversaryRows()[anniversaries.selectedIndex];
      return row ? `anniversary-${row.item.id}` : undefined;
    }
    if (ui.view === "emoji") {
      if (parseEmojiScreen(ui.commandRest).type === "categories") {
        const category = emojis.categories[emojis.selectedIndex];
        return category ? `emoji-category-${category.id}` : undefined;
      }
      const item = emojis.visible(ui.commandRest)[emojis.selectedIndex];
      return item ? `emoji-${item.id}` : undefined;
    }
    if (ui.view === "settings") {
      if (settings.engineDraft) return undefined;
      const screen = parseSettingsScreen(ui.commandRest);
      const index = settings.selectedIndex;
      if (screen === "hotkey") return undefined;
      if (screen === "engine") {
        const engine = settings.engines[index];
        return engine ? `engine-${engine.id}` : undefined;
      }
      if (screen === "theme") {
        const option = settings.themes[index];
        return option ? `theme-${option.id}` : undefined;
      }
      if (screen === "language") {
        const option = settings.locales[index];
        return option ? `language-${option.id}` : undefined;
      }
      if (screen === "retention") {
        const option = settings.retentionOptions[index];
        return option ? `retention-${option.id}` : undefined;
      }
      if (screen === "browser") {
        // Numbered rather than keyed by the executable path, which contains
        // spaces and is not a valid id.
        return settings.browserOptions[index] ? `browser-${index}` : undefined;
      }
      const item = settings.listItems[index];
      return item ? `setting-${item.id}` : undefined;
    }
    return undefined;
  });

  /**
   * Whether the current view has rows to show.
   *
   * `aria-expanded` used to be `view === "suggest" || view === "empty"`, which
   * reported a collapsed combobox while a full listbox sat on screen. The panels
   * keep `#command-results` mounted in every state, so the flag has to come from
   * the rows themselves rather than from the name of the view.
   */
  const optionCount = $derived.by((): number => {
    if (ui.view === "empty") return ui.homeCommands.length;
    if (ui.view === "suggest") return ui.rootHits.length;
    if (ui.view === "todo") return todos.todos.length;
    if (ui.view === "clip") return clipboard.filtered(ui.commandRest).length;
    if (ui.view === "snippet") {
      return snippets.draft ? 0 : snippets.filtered(ui.commandRest).length;
    }
    if (ui.view === "anniversary") {
      if (anniversaries.draft) return 0;
      if (parseAnniversaryScreen(ui.commandRest).type === "preview") return 0;
      return anniversaryRows().length;
    }
    if (ui.view === "emoji") {
      return parseEmojiScreen(ui.commandRest).type === "categories"
        ? emojis.categories.length
        : emojis.visible(ui.commandRest).length;
    }
    if (ui.view === "settings") {
      // The draft replaces the panel; `countFor` already reports 0 for the
      // screens that render a form or the recorder instead of a list.
      if (settings.engineDraft) return 0;
      return settings.countFor(parseSettingsScreen(ui.commandRest));
    }
    return 0;
  });

  /**
   * The engine the field is searching with, or `null` when it is not a web
   * search.
   *
   * A web-search prefix is the obvious case. The other one is the fallback row
   * an unmatched query offers, which goes to the default engine — and that
   * engine may be a custom one, which has no mark and so keeps the magnifier.
   */
  const searchEngineId = $derived.by((): string | null => {
    if (ui.matchedCommand) return engineIdForCommand(ui.matchedCommand.id);
    if (canFallbackSearch(ui.searchText, ui.rootHits.length)) return settings.engine.id;
    return null;
  });

  $effect(() => {
    ui.showNonce;
    ui.imagePreviewSrc;
    // Closing either dialog removes the button that had focus, which drops focus
    // to <body> with nobody to take it back.
    ui.pendingConfirm;
    clipboard.confirm;
    // An open dialog holds focus on purpose — it is modal, and it is not
    // announced until focus is inside it. Pulling focus back to the input here
    // would undo that on the very frame it happens.
    if (ui.pendingConfirm || clipboard.confirm) return;
    if (ui.focusField === "search" && !ui.imagePreviewSrc && !snippets.draft && !settings.engineDraft) {
      requestAnimationFrame(() => inputEl?.focus());
    }
  });

  /**
   * Keep the keyboard alive.
   *
   * Every shortcut in the palette is bound to the search input, so a list row or
   * a dialog button that takes focus disables the whole thing silently: nothing
   * looks different, but typing, the arrows and Enter all stop working until Esc
   * happens to reset the search. Rows are reachable by Tab as well as by click,
   * so this catches both. Text fields are exempt, because the panels that own one
   * are supposed to keep it.
   */
  function onFocusIn(event: FocusEvent) {
    const target = event.target as HTMLElement | null;
    if (!target || target === inputEl) return;
    if (target.closest("input, textarea, [contenteditable='true']")) return;
    if (target === document.body || target.closest('[role="option"], [role="gridcell"]')) {
      inputEl?.focus();
    }
  }

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
    // IME composition owns Escape: while a candidate list is open it means
    // "cancel the candidate", not "clear the search and leave the command".
    if (event.isComposing || composing) return;

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      escapePalette();
      return;
    }

    // A destructive action waiting on confirmation takes every key. Escape is
    // already handled above, where `escapePalette` cancels it.
    if (ui.pendingConfirm) {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Enter") ui.runConfirm();
      return;
    }

    if (clipboard.confirm) {
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        clipboard.confirmAction();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (ui.view === "todo") {
      // Every key here arrives through the input's own handler, so the panel's
      // text field — a separate focus target — never sees them: the arrows cannot
      // move the highlight while someone is typing a new item.
      const items = todos.todos;
      const selected = items[ui.selectedIndex];
      if (event.key === "ArrowDown" && items.length > 0) {
        event.preventDefault();
        ui.selectedIndex = Math.min(items.length - 1, ui.selectedIndex + 1);
        return;
      }
      if (event.key === "ArrowUp" && items.length > 0) {
        event.preventDefault();
        ui.selectedIndex = Math.max(0, ui.selectedIndex - 1);
        return;
      }
      if (event.key === "Delete" && selected) {
        event.preventDefault();
        todos.remove(selected.id);
        return;
      }
      // `todo buy milk` + Enter adds that item, so Enter only takes the
      // highlighted row when the rest of the line is empty. Intercepting it in
      // both states would silently turn the inline add into a toggle, and with
      // nothing selected the fall-through below is what puts the cursor in the
      // new-item field.
      if (event.key === "Enter" && selected && !ui.commandRest.trim()) {
        event.preventDefault();
        todos.toggle(selected.id);
        return;
      }
    }

    if (ui.view === "clip") {
      const items = clipboard.filtered(ui.commandRest);
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
      if (event.key === "Delete" && event.shiftKey) {
        event.preventDefault();
        clipboard.openClearConfirm();
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

    if (ui.view === "anniversary") {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        startAnniversaryCreate();
        return;
      }
      if (anniversaries.draft) {
        if (event.key === "Enter") {
          event.preventDefault();
          void anniversaries.saveDraft();
        }
        return;
      }
      const rows = anniversaryRows();
      // The preview and invalid-date screens replace the list, but
      // `anniversaryRows()` still returns every row there. Navigating or
      // deleting would act on an entry the user cannot see, with nothing on
      // screen changing to show it happened.
      const listVisible = ["list", "filter"].includes(
        parseAnniversaryScreen(ui.commandRest).type,
      );
      if (listVisible) {
        if (event.key === "ArrowDown" && rows.length > 0) {
          event.preventDefault();
          anniversaries.selectedIndex = Math.min(rows.length - 1, anniversaries.selectedIndex + 1);
          return;
        }
        if (event.key === "ArrowUp" && rows.length > 0) {
          event.preventDefault();
          anniversaries.selectedIndex = Math.max(0, anniversaries.selectedIndex - 1);
          return;
        }
        if (event.key === "Delete") {
          event.preventDefault();
          const row = rows[anniversaries.selectedIndex];
          if (row) void anniversaries.remove(row.item.id);
          return;
        }
      }
      if (event.key === "Enter") {
        event.preventDefault();
        handleAnniversaryEnter(rows);
        return;
      }
    }

    if (ui.view === "calendar") {
      // Arrows walk the grid, PageUp/Down jump months, Shift+arrows jump years,
      // and Enter copies the selected date.
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        calendar.moveDay(-1);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        calendar.moveDay(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (event.shiftKey) calendar.moveYear(-1);
        else calendar.moveWeek(-1);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (event.shiftKey) calendar.moveYear(1);
        else calendar.moveWeek(1);
        return;
      }
      if (event.key === "PageUp") {
        event.preventDefault();
        calendar.moveMonth(-1);
        return;
      }
      if (event.key === "PageDown") {
        event.preventDefault();
        calendar.moveMonth(1);
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        calendar.reset();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        void copyCalendarDate();
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
      if (event.key === "Enter") {
        event.preventDefault();
        void translate.submit(event.shiftKey);
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
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        startEngineCreate();
        return;
      }
      const screen = parseSettingsScreen(ui.commandRest);
      if (event.key === "Delete" && screen === "engine") {
        event.preventDefault();
        const engine = settings.engines[settings.selectedIndex];
        // Removing a custom engine throws away the name and URL that were typed
        // in, so it asks first like the system commands do.
        if (engine?.custom) {
          ui.requestConfirm(engine.name, () => void settings.removeEngine(engine.id), i18n.t("settings.engineDeleteBody"));
        }
        return;
      }
      const count = settings.countFor(screen);
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
      const hit = ui.rootHits[ui.selectedIndex];
      // The pinned command row sits at index 0. Running it unconditionally meant
      // Enter executed it even after the highlight had moved onto an app row, so
      // the keyboard disagreed with the highlight and with what a click does.
      if (ui.selectedIndex === 0 && ui.matchedCommand && ui.commandRest.trim()) {
        ui.matchedCommand.run(ui.commandRest);
        return;
      }
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

<svelte:window onfocusin={onFocusIn} />

<label
  class="m-3 flex items-center gap-2 rounded-lg bg-surface-1 px-4 py-3 transition-shadow duration-150 ease-out focus-within:animate-[glowPulse_1.2s_ease-in-out_infinite] motion-reduce:focus-within:animate-none motion-reduce:focus-within:outline motion-reduce:focus-within:outline-1 motion-reduce:focus-within:outline-primary-focus/55"
>
  <EngineMark engineId={searchEngineId} />
  <span class="sr-only">{i18n.t("search.placeholder")}</span>
  <input
    bind:this={inputEl}
    id="palette-search"
    bind:value={ui.searchText}
    class="w-full bg-transparent text-[16px] font-medium leading-[1.45] tracking-[-0.05px] text-ink outline-none placeholder:font-normal placeholder:text-ink-tertiary"
    placeholder={i18n.t("search.placeholder")}
    autocomplete="off"
    spellcheck="false"
    role="combobox"
    aria-autocomplete="list"
    aria-controls="command-results"
    aria-activedescendant={activeOptionId}
    aria-expanded={optionCount > 0}
    oninput={onInput}
    onkeydown={onKeydown}
    oncompositionstart={() => (composing = true)}
    oncompositionend={() => (composing = false)}
    onfocus={() => (ui.focusField = "search")}
  />
</label>
