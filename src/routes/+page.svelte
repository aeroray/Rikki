<script lang="ts">
  import "$lib/commands/anniversary";
  import "$lib/commands/base64";
  import "$lib/commands/calendar";
  import "$lib/commands/calc";
  import "$lib/commands/clip";
  import "$lib/commands/color";
  import "$lib/commands/emoji";
  import "$lib/commands/json";
  import "$lib/commands/qrcode";
  import "$lib/commands/settings";
  import "$lib/commands/snippet";
  import "$lib/commands/sys";
  import "$lib/commands/timestamp";
  import "$lib/commands/todo";
  import "$lib/commands/translate";
  import "$lib/commands/web";
  import CalcResult from "$lib/commands/calc/CalcResult.svelte";
  import AnniversaryPanel from "$lib/commands/anniversary/AnniversaryPanel.svelte";
  import CalendarPanel from "$lib/commands/calendar/CalendarPanel.svelte";
  import ClipPanel from "$lib/commands/clip/ClipPanel.svelte";
  import ClipConfirm from "$lib/commands/clip/ClipConfirm.svelte";
  import ColorPanel from "$lib/commands/color/ColorPanel.svelte";
  import Base64Panel from "$lib/commands/base64/Base64Panel.svelte";
  import JsonPanel from "$lib/commands/json/JsonPanel.svelte";
  import ImagePreview from "$lib/commands/clip/ImagePreview.svelte";
  import EmojiPanel from "$lib/commands/emoji/EmojiPanel.svelte";
  import SettingsPanel from "$lib/commands/settings/SettingsPanel.svelte";
  import SnippetPanel from "$lib/commands/snippet/SnippetPanel.svelte";
  import { toggleSelectedImagePreview } from "$lib/commands/clip/preview";
  import { escapePalette } from "$lib/commands/escape";
  import { toggleBase64Mode } from "$lib/commands/base64/actions";
  import { saveQrPng } from "$lib/commands/qrcode/actions";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import ResultList from "$lib/components/ResultList.svelte";
  import SearchBar from "$lib/components/SearchBar.svelte";
  import TodoInput from "$lib/commands/todo/TodoInput.svelte";
  import TodoList from "$lib/commands/todo/TodoList.svelte";
  import TranslatePanel from "$lib/commands/translate/TranslatePanel.svelte";
  import TimestampPanel from "$lib/commands/timestamp/TimestampPanel.svelte";
  import QRPanel from "$lib/commands/qrcode/QRPanel.svelte";
  import QRDecodePanel from "$lib/commands/qrcode/QRDecodePanel.svelte";
  import { homeUsageCommandId } from "$lib/commands/registry";
  import { apps } from "$lib/stores/apps.svelte";
  import { clipboard } from "$lib/stores/clipboard.svelte";
  import { json } from "$lib/stores/json.svelte";
  import { translate } from "$lib/stores/translate.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { listen } from "@tauri-apps/api/event";
  import { onMount } from "svelte";

  onMount(() => {
    const native =
      "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
    if (!native) {
      ui.shellOpen = true;
    }
    ui.focusField = "search";
    void clipboard.start();
    apps.start();
    ui.start();
    const stops: Array<() => void> = [];

    void listen("palette-shown", () => {
      ui.beginShow();
    })
      .then((stop) => stops.push(stop))
      .catch(() => {});

    void listen("palette-request-hide", () => {
      ui.beginHide();
    })
      .then((stop) => stops.push(stop))
      .catch(() => {});

    return () => {
      for (const stop of stops) stop();
    };
  });

  $effect(() => {
    if (ui.view !== "clip" && ui.imagePreviewSrc) {
      ui.imagePreviewSrc = null;
    }
  });

  $effect(() => {
    const id = homeUsageCommandId(
      ui.view,
      ui.matchedCommand?.id ?? null,
      ui.searchText,
      ui.commandRest,
    );
    if (id) ui.enterCommand(id);
    else if (ui.view === "empty") ui.leaveCommand();
  });

  function onWindowKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      escapePalette();
      return;
    }
    if (event.key === "Tab" && ui.view === "qr") {
      event.preventDefault();
      void saveQrPng();
    }
    if (event.key === "Tab" && ui.view === "json" && !json.editing) {
      event.preventDefault();
      json.toggleCompact();
    }
    if (event.key === "Tab" && ui.view === "base64") {
      event.preventDefault();
      toggleBase64Mode();
    }
    if (event.key === "Tab" && clipboard.confirm) {
      event.preventDefault();
      return;
    }
    if (event.key === "Tab" && ui.view === "clip") {
      event.preventDefault();
      toggleSelectedImagePreview();
    }
    if (event.key === "Tab" && ui.view === "translate" && translate.wordMode) {
      event.preventDefault();
      translate.swap();
    }
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<!-- The window shell is inlined rather than named: it is used exactly once, and
     the open/exiting states are Svelte-driven, so a pair of modifier classes in
     CSS would have to be kept in step with the two ternaries below anyway. -->
<div class="box-border size-full p-2">
<div
  class="relative box-border size-full rounded-lg bg-[var(--app-shell-bg)] [box-shadow:var(--app-shell-shadow)] backdrop-blur-[20px] transition-[opacity,transform] ease-out motion-reduce:scale-100 motion-reduce:opacity-100 motion-reduce:transition-none {ui.shellOpen &&
  !ui.shellExiting
    ? 'scale-100 opacity-100'
    : 'scale-95 opacity-0'} {ui.shellExiting ? 'duration-100' : 'duration-150'}"
>
<div class="relative flex size-full flex-col overflow-hidden rounded-[inherit]">
  <SearchBar />

  <div id="command-results" class="flex min-h-0 flex-1 flex-col" class:pb-14={Boolean(ui.notice)}>
    {#if ui.view === "empty"}
      <EmptyState />
    {:else if ui.view === "todo"}
      <TodoInput />
      <TodoList />
    {:else if ui.view === "calc"}
      <CalcResult />
    {:else if ui.view === "anniversary"}
      <AnniversaryPanel />
    {:else if ui.view === "calendar"}
      <CalendarPanel />
    {:else if ui.view === "clip"}
      <ClipPanel />
    {:else if ui.view === "snippet"}
      <SnippetPanel />
    {:else if ui.view === "settings"}
      <SettingsPanel />
    {:else if ui.view === "emoji"}
      <EmojiPanel />
    {:else if ui.view === "translate"}
      <TranslatePanel />
    {:else if ui.view === "color"}
      <ColorPanel />
    {:else if ui.view === "json"}
      <JsonPanel />
    {:else if ui.view === "base64"}
      <Base64Panel />
    {:else if ui.view === "timestamp"}
      <TimestampPanel />
    {:else if ui.view === "qr"}
      <QRPanel />
    {:else if ui.view === "qrdecode"}
      <QRDecodePanel />
    {:else}
      <ResultList />
    {/if}
  </div>

  <ImagePreview src={ui.imagePreviewSrc} onclose={() => (ui.imagePreviewSrc = null)} />
  <ClipConfirm />

  {#if ui.notice}
    <p class="pointer-events-none absolute inset-x-3 bottom-3 z-20 rounded-md bg-surface-2 px-3 py-2 text-[12px] leading-[1.45] text-pretty text-ink outline outline-1 outline-hairline">
      {ui.notice}
    </p>
  {/if}
</div>
</div>
</div>
