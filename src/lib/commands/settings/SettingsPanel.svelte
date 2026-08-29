<script lang="ts">
  import EngineCreate from "$lib/commands/settings/EngineCreate.svelte";
  import EngineSelector from "$lib/commands/settings/EngineSelector.svelte";
  import HotkeyRecorder from "$lib/commands/settings/HotkeyRecorder.svelte";
  import { parseSettingsScreen } from "$lib/commands/settings/parse";
  import SettingItem from "$lib/commands/settings/SettingItem.svelte";
  import ThemeSelector from "$lib/commands/settings/ThemeSelector.svelte";
  import LanguageSelector from "$lib/commands/settings/LanguageSelector.svelte";
  import {
    openEngineSettings,
    openHotkeySettings,
    openLanguageSettings,
    openThemeSettings,
    startEngineCreate,
  } from "$lib/commands/settings/actions";
  import ScrollArea from "$lib/components/ScrollArea.svelte";
  import { settings } from "$lib/stores/settings.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { i18n } from "$lib/i18n";
  import { Plus } from "@lucide/svelte";
  import { untrack } from "svelte";

  const screen = $derived(parseSettingsScreen(ui.commandRest));
  let lastScreen = $state<"list" | "engine" | "theme" | "hotkey" | "language" | null>(null);

  $effect(() => {
    if (ui.view !== "settings") {
      if (lastScreen !== null) lastScreen = null;
      settings.cancelReturn();
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
      } else {
        settings.selectedIndex = 0;
      }
    }
    const count =
      next === "engine"
        ? settings.engines.length
        : next === "theme"
          ? settings.themes.length
          : next === "language"
            ? settings.locales.length
            : settings.listItems.length;
    settings.clampSelection(count);
  });

  $effect(() => {
    const onHotkey = ui.view === "settings" && parseSettingsScreen(ui.commandRest) === "hotkey";
    if (onHotkey) untrack(() => void settings.startRecording());
    return () => untrack(() => void settings.stopRecording());
  });
</script>

{#if settings.engineDraft}
  <EngineCreate />
{:else if screen === "hotkey"}
  <HotkeyRecorder />
{:else}
  <div class="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-1">
    <div class="mb-1 flex items-center justify-between px-1">
      <p class="text-[12px] leading-[1.4] text-ink-subtle">
        {#if screen === "engine"}
          {i18n.t("settings.engine")}
        {:else if screen === "theme"}
          {i18n.t("settings.theme")}
        {:else if screen === "language"}
          {i18n.t("settings.language")}
        {:else}
          {i18n.t("settings.title")}
        {/if}
      </p>
      {#if screen === "engine"}
        <button
          type="button"
          class="flex size-8 items-center justify-center rounded-md text-ink-tertiary transition-colors duration-150 ease-out hover:text-ink active:scale-[0.96]"
          aria-label={i18n.t("settings.addEngine")}
          onclick={() => startEngineCreate()}
        >
          <Plus class="size-4" strokeWidth={1.5} aria-hidden="true" />
        </button>
      {/if}
    </div>
    <ScrollArea
      class="min-h-0 flex-1"
      viewportClass="flex flex-col gap-1"
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
      {:else}
        {#each settings.listItems as item, index (item.id)}
          <SettingItem
            title={item.title}
            value={item.value}
            icon={item.icon}
            selected={index === settings.selectedIndex}
            onselect={() => {
              settings.selectedIndex = index;
              if (item.id === "engine") openEngineSettings();
              if (item.id === "theme") openThemeSettings();
              if (item.id === "hotkey") openHotkeySettings();
              if (item.id === "language") openLanguageSettings();
            }}
          />
        {/each}
      {/if}
    </ScrollArea>
    <p class="mt-2 px-1 text-[12px] leading-[1.4] text-ink-tertiary">
      {#if settings.notice}
        {settings.notice}
      {:else if screen === "engine"}
        {i18n.t("settings.engineHint")}
      {:else if screen === "theme" || screen === "language"}
        {i18n.t("settings.confirm")}
      {:else}
        {i18n.t("settings.open")}
      {/if}
    </p>
  </div>
{/if}
