<script lang="ts">
  import BrowserSelector from "$lib/commands/settings/BrowserSelector.svelte";
  import EngineCreate from "$lib/commands/settings/EngineCreate.svelte";
  import EngineSelector from "$lib/commands/settings/EngineSelector.svelte";
  import HotkeyRecorder from "$lib/commands/settings/HotkeyRecorder.svelte";
  import { parseSettingsScreen, type SettingsScreen } from "$lib/commands/settings/parse";
  import { primaryShortcut } from "$lib/commands/settings/engines";
  import SettingItem from "$lib/commands/settings/SettingItem.svelte";
  import ThemeSelector from "$lib/commands/settings/ThemeSelector.svelte";
  import LanguageSelector from "$lib/commands/settings/LanguageSelector.svelte";
  import ClipRetentionSelector from "$lib/commands/settings/ClipRetentionSelector.svelte";
  import {
    confirmRemoveEngine,
    runSettingItem,
    startEngineCreate,
  } from "$lib/commands/settings/actions";
  import PanelFooter, { type FooterShortcut } from "$lib/components/PanelFooter.svelte";
  import ScrollArea from "$lib/components/ScrollArea.svelte";
  import { settings } from "$lib/stores/settings.svelte";
  import { clipboard } from "$lib/stores/clipboard.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { i18n } from "$lib/i18n";
  import { Plus } from "@lucide/svelte";
  import { onDestroy, onMount, untrack } from "svelte";

  const screen = $derived(parseSettingsScreen(ui.commandRest));
  let lastScreen = $state<SettingsScreen | null>(null);

  // The login item can be changed from outside the app — Task Manager's Startup
  // tab, `msconfig`, macOS's Login Items — so the row is re-read each time this
  // panel is opened rather than only at boot. One IPC call, and the alternative
  // is a row showing a state the OS no longer agrees with.
  onMount(() => {
    void settings.loadAutostart();
  });

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

  // `list_browsers` answers after the picker is already on screen, and until it
  // does the list holds only the system-default row. The highlight has to be
  // placed again once the installed browsers arrive, or it would sit on the
  // wrong row and Enter would change the setting to something the user did not
  // point at.
  $effect(() => {
    if (!settings.browsersLoaded) return;
    if (ui.view === "settings" && parseSettingsScreen(ui.commandRest) === "browser") {
      settings.selectCurrentBrowser();
    }
  });

  $effect(() => {
    const onHotkey = ui.view === "settings" && parseSettingsScreen(ui.commandRest) === "hotkey";
    if (onHotkey) untrack(() => void settings.startRecording());
    return () => untrack(() => void settings.stopRecording());
  });

  // A hide cancels the capture on the Rust side, and the palette restores the
  // query when it comes back — so the recorder is on screen again with nothing
  // listening, while it still says to press a key. Arming it again on every show
  // is what keeps the screen honest; the effect above cannot do it, because its
  // dependencies (the view and the query) are exactly what a hide preserves.
  $effect(() => {
    ui.showNonce;
    if (ui.view === "settings" && parseSettingsScreen(ui.commandRest) === "hotkey") {
      untrack(() => void settings.startRecording());
    }
  });

  // Key glyphs are not translated: they name physical keys, which read the same
  // in every locale.
  const selectedItemId = $derived(settings.listItems[settings.selectedIndex]?.id);

  const screenTitle = $derived.by((): string => {
    if (screen === "engine") return i18n.t("settings.engine");
    if (screen === "browser") return i18n.t("settings.browser");
    if (screen === "theme") return i18n.t("settings.theme");
    if (screen === "language") return i18n.t("settings.language");
    if (screen === "retention") return i18n.t("settings.clipRetention");
    return i18n.t("settings.title");
  });

  const footerShortcuts = $derived.by((): FooterShortcut[] => {
    // A notice replaces the actions with a single remark, so it carries no chips.
    if (settings.notice) return [];
    if (screen === "engine") {
      const shortcuts: FooterShortcut[] = [
        { keys: "Enter", label: i18n.t("settings.keySetDefault") },
        { keys: primaryShortcut("N"), label: i18n.t("key.add") },
      ];
      // Delete only reaches a custom engine, and the row the highlight is on is
      // what the chip would act on: offering it over a built-in is a key that
      // does nothing, which is the same reason the cleanup row withholds Enter.
      if (settings.engines[settings.selectedIndex]?.custom) {
        shortcuts.push({ keys: "Delete", label: i18n.t("settings.keyDeleteCustom") });
      }
      shortcuts.push({ keys: "Esc", label: i18n.t("key.back") });
      return shortcuts;
    }
    if (
      screen === "browser" ||
      screen === "theme" ||
      screen === "language" ||
      screen === "retention"
    ) {
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
    // The rows that act rather than open name their own action, the way the
    // cleanup row does: "打开" would be a lie about what Enter does here.
    if (selectedItemId === "export") {
      return [{ keys: "Enter", label: i18n.t("settings.keyExport") }];
    }
    if (selectedItemId === "import") {
      return [{ keys: "Enter", label: i18n.t("settings.keyImport") }];
    }
    if (selectedItemId === "update") {
      return [{ keys: "Enter", label: i18n.t("settings.keyCheck") }];
    }
    return [{ keys: "Enter", label: i18n.t("key.open") }];
  });

  const footerMessage = $derived.by((): string | null => {
    if (settings.notice) return settings.notice;
    if (screen === "browser") {
      // Only once the read has come back: saying "nothing found" while the list
      // is still on its way would be a lie for a frame.
      return settings.browsersLoaded && settings.installedBrowsers.length === 0
        ? i18n.t("settings.browser.empty")
        : null;
    }
    if (screen === "engine" || screen === "theme" || screen === "language" || screen === "retention") {
      return null;
    }
    if (selectedItemId === "cleanup") {
      return settings.clipTextRetentionDays > 0
        ? i18n.t("settings.notePinnedKept")
        : i18n.t("clip.cleanupDisabledHint");
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
        <div class="min-w-0">
          <p class="text-[12px] leading-[1.4] text-ink-subtle">
            {screenTitle}
          </p>
        </div>
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
        aria-label={screenTitle}
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
              onremove={engine.custom ? () => confirmRemoveEngine(engine) : undefined}
            />
          {/each}
        {:else if screen === "browser"}
          {#each settings.browserOptions as option, index (option.id)}
            <BrowserSelector
              id="browser-{index}"
              {option}
              selected={index === settings.selectedIndex}
              current={option.path === settings.browserPath}
              onselect={() => {
                settings.selectedIndex = index;
                void settings.setBrowser(option.path);
              }}
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
                runSettingItem(item.id);
              }}
            />
          {/each}
        {/if}
      </ScrollArea>
    </div>

    <PanelFooter shortcuts={footerShortcuts} message={footerMessage} />
  </div>
{/if}
