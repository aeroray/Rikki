<script lang="ts">
  import EngineCreate from "$lib/commands/settings/EngineCreate.svelte";
  import EngineSelector from "$lib/commands/settings/EngineSelector.svelte";
  import HotkeyRecorder from "$lib/commands/settings/HotkeyRecorder.svelte";
  import { parseSettingsScreen, type SettingsScreen } from "$lib/commands/settings/parse";
  import SettingItem from "$lib/commands/settings/SettingItem.svelte";
  import ThemeSelector from "$lib/commands/settings/ThemeSelector.svelte";
  import LanguageSelector from "$lib/commands/settings/LanguageSelector.svelte";
  import ClipRetentionSelector from "$lib/commands/settings/ClipRetentionSelector.svelte";
  import {
    openEngineSettings,
    openHotkeySettings,
    openLanguageSettings,
    openRetentionSettings,
    openThemeSettings,
    startEngineCreate,
    startClipCleanup,
  } from "$lib/commands/settings/actions";
  import PanelFooter, { type FooterShortcut } from "$lib/components/PanelFooter.svelte";
  import ScrollArea from "$lib/components/ScrollArea.svelte";
  import { settings } from "$lib/stores/settings.svelte";
  import { clipboard } from "$lib/stores/clipboard.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { i18n } from "$lib/i18n";
  import { Plus } from "@lucide/svelte";
  import { onDestroy, untrack } from "svelte";

  const screen = $derived(parseSettingsScreen(ui.commandRest));
  let lastScreen = $state<SettingsScreen | null>(null);

  onDestroy(() => {
    settings.cancelReturn();
    clipboard.closeConfirm();
    if (settings.engineDraft) settings.closeEngineDraft();
  });

  $effect(() => {
    if (ui.view !== "settings") {
      if (lastScreen !== null) lastScreen = null;
      settings.cancelReturn();
      clipboard.closeConfirm();
      if (settings.engineDraft) settings.closeEngineDraft();
      return;
    }
    const next = parseSettingsScreen(ui.commandRest);
    if (next !== lastScreen) {
      lastScreen = next;
      if (next === "engine") {
        const index = settings.engines.findIndex((engine) => engine.id === settings.engineId);
        settings.selectedIndex = index >= 0 ? index : 0;
      } else if (next === "theme") {
        const index = settings.themes.findIndex((theme) => theme.id === settings.theme);
        settings.selectedIndex = index >= 0 ? index : 0;
      } else if (next === "language") {
        const index = settings.locales.findIndex((option) => option.id === settings.localePref);
        settings.selectedIndex = index >= 0 ? index : 0;
      } else if (next === "retention") {
        const index = settings.retentionOptions.findIndex((option) => option.id === settings.clipTextRetentionDays);
        settings.selectedIndex = index >= 0 ? index : 0;
      } else {
        settings.selectedIndex = 0;
      }
    }
    settings.clampSelection(settings.countFor(next));
  });

  $effect(() => {
    const onHotkey = ui.view === "settings" && parseSettingsScreen(ui.commandRest) === "hotkey";
    if (onHotkey) untrack(() => void settings.startRecording());
    return () => untrack(() => void settings.stopRecording());
  });

  // Key glyphs are not translated: they name physical keys, which read the same
  // in every locale.
  const selectedItemId = $derived(settings.listItems[settings.selectedIndex]?.id);

  const footerShortcuts = $derived.by((): FooterShortcut[] => {
    // A notice replaces the actions with a single remark, so it carries no chips.
    if (settings.notice) return [];
    if (screen === "engine") {
      return [
        { keys: "Enter", label: i18n.t("settings.keySetDefault") },
        { keys: "Ctrl+N", label: i18n.t("key.add") },
        { keys: "Delete", label: i18n.t("settings.keyDeleteCustom") },
        { keys: "Esc", label: i18n.t("key.back") },
      ];
    }
    if (screen === "theme" || screen === "language" || screen === "retention") {
      return [
        { keys: "Enter", label: i18n.t("key.confirm") },
        { keys: "Esc", label: i18n.t("key.back") },
      ];
    }
    if (selectedItemId === "cleanup") {
      // Cleaning is off, so Enter would do nothing: say why instead of offering it.
      return settings.clipTextRetentionDays > 0
        ? [{ keys: "Enter", label: i18n.t("settings.keyClean") }]
        : [];
    }
    if (selectedItemId === "export" || selectedItemId === "import") {
      return [{ keys: "Enter", label: i18n.t("settings.keyBackup") }];
    }
    return [{ keys: "Enter", label: i18n.t("key.open") }];
  });

  const footerMessage = $derived.by((): string | null => {
    if (settings.notice) return settings.notice;
    if (
      screen === "engine" ||
      screen === "theme" ||
      screen === "language" ||
      screen === "retention"
    ) {
      return null;
    }
    if (selectedItemId === "cleanup") {
      return settings.clipTextRetentionDays > 0
        ? i18n.t("settings.notePinnedKept")
        : i18n.t("clip.cleanupDisabledHint");
    }
    if (selectedItemId === "export" || selectedItemId === "import") {
      return i18n.t("settings.noteNoClipboard");
    }
    return null;
  });
</script>

{#if settings.engineDraft}
  <EngineCreate />
{:else if screen === "hotkey"}
  <HotkeyRecorder />
{:else}
  <!-- The footer is a sibling of the content column, not inside it, so it stays
       pinned to the bottom on every screen and in every list state. -->
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pt-1">
      <div class="mb-1 flex items-center justify-between px-1">
        <p class="text-[12px] leading-[1.4] text-ink-subtle">
          {#if screen === "engine"}
            {i18n.t("settings.engine")}
          {:else if screen === "theme"}
            {i18n.t("settings.theme")}
          {:else if screen === "language"}
            {i18n.t("settings.language")}
          {:else if screen === "retention"}
            {i18n.t("settings.clipRetention")}
          {:else}
            {i18n.t("settings.title")}
          {/if}
        </p>
        {#if screen === "engine"}
          <button
            type="button"
            class="pressable flex size-10 items-center justify-center rounded-md text-ink-tertiary hover:text-ink active:scale-[0.96]"
            aria-label={i18n.t("settings.addEngine")}
            onclick={() => startEngineCreate()}
          >
            <Plus class="size-4" strokeWidth={1.5} aria-hidden="true" />
          </button>
        {/if}
      </div>
      <ScrollArea
        class="min-h-0 flex-1"
        viewportClass="flex flex-col gap-2"
        role="listbox"
        tabindex={-1}
        aria-label={i18n.t("settings.title")}
      >
        {#if screen === "engine"}
          {#each settings.engines as engine, index (engine.id)}
            <EngineSelector
              {engine}
              selected={index === settings.selectedIndex}
              current={engine.id === settings.engineId}
              onselect={() => {
                settings.selectedIndex = index;
                void settings.setEngine(engine.id);
              }}
              onremove={engine.custom ? () => void settings.removeEngine(engine.id) : undefined}
            />
          {/each}
        {:else if screen === "theme"}
          {#each settings.themes as option, index (option.id)}
            <ThemeSelector
              {option}
              selected={index === settings.selectedIndex}
              current={option.id === settings.theme}
              onselect={() => {
                settings.selectedIndex = index;
                void settings.setTheme(option.id);
              }}
            />
          {/each}
        {:else if screen === "language"}
          {#each settings.locales as option, index (option.id)}
            <LanguageSelector
              pref={option.id}
              selected={index === settings.selectedIndex}
              current={option.id === settings.localePref}
              onselect={() => {
                settings.selectedIndex = index;
                void settings.setLocale(option.id);
              }}
            />
          {/each}
        {:else if screen === "retention"}
          {#each settings.retentionOptions as option, index (option.id)}
            <ClipRetentionSelector
              days={option.id}
              selected={index === settings.selectedIndex}
              current={option.id === settings.clipTextRetentionDays}
              onselect={() => {
                settings.selectedIndex = index;
                void settings.setClipRetention(option.id);
              }}
            />
          {/each}
        {:else}
          {#each settings.listItems as item, index (item.id)}
            <SettingItem
              id="setting-{item.id}"
              title={item.title}
              value={item.value}
              icon={item.icon}
              current={item.current !== false}
              selected={index === settings.selectedIndex}
              onselect={() => {
                settings.selectedIndex = index;
                if (item.id === "engine") openEngineSettings();
                if (item.id === "theme") openThemeSettings();
                if (item.id === "hotkey") openHotkeySettings();
                if (item.id === "language") openLanguageSettings();
                if (item.id === "retention") openRetentionSettings();
                if (item.id === "cleanup") startClipCleanup();
                if (item.id === "export") void settings.exportBackup();
                if (item.id === "import") void settings.importBackup();
              }}
            />
          {/each}
        {/if}
      </ScrollArea>
    </div>

    <PanelFooter shortcuts={footerShortcuts} message={footerMessage} />
  </div>
{/if}
