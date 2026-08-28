<script lang="ts">
  import "$lib/commands/calc";
  import "$lib/commands/clip";
  import "$lib/commands/emoji";
  import "$lib/commands/settings";
  import "$lib/commands/snippet";
  import "$lib/commands/sys";
  import "$lib/commands/todo";
  import "$lib/commands/web";
  import CalcResult from "$lib/commands/calc/CalcResult.svelte";
  import ClipPanel from "$lib/commands/clip/ClipPanel.svelte";
  import ImagePreview from "$lib/commands/clip/ImagePreview.svelte";
  import EmojiPanel from "$lib/commands/emoji/EmojiPanel.svelte";
  import SettingsPanel from "$lib/commands/settings/SettingsPanel.svelte";
  import SnippetPanel from "$lib/commands/snippet/SnippetPanel.svelte";
  import { toggleSelectedImagePreview } from "$lib/commands/clip/preview";
  import { closeEmojiDrill } from "$lib/commands/emoji/actions";
  import { closeSettingsDrill } from "$lib/commands/settings/actions";
  import { cancelSnippetDraft } from "$lib/commands/snippet/actions";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import ResultList from "$lib/components/ResultList.svelte";
  import SearchBar from "$lib/components/SearchBar.svelte";
  import TodoInput from "$lib/commands/todo/TodoInput.svelte";
  import TodoList from "$lib/commands/todo/TodoList.svelte";
  import { apps } from "$lib/stores/apps.svelte";
  import { clipboard } from "$lib/stores/clipboard.svelte";
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

  function onWindowKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (ui.imagePreviewSrc) {
        ui.imagePreviewSrc = null;
        return;
      }
      if (closeSettingsDrill()) return;
      if (closeEmojiDrill()) return;
      if (cancelSnippetDraft()) return;
      ui.beginHide();
      return;
    }
    if (event.key === "Tab" && ui.view === "clip") {
      event.preventDefault();
      toggleSelectedImagePreview();
    }
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div
  class="app-shell relative flex flex-col"
  class:is-open={ui.shellOpen && !ui.shellExiting}
  class:is-exiting={ui.shellExiting}
>
  <SearchBar />

  <div id="command-results" class="flex min-h-0 flex-1 flex-col">
    {#if ui.view === "empty"}
      <EmptyState />
    {:else if ui.view === "todo"}
      <TodoInput />
      <TodoList />
    {:else if ui.view === "calc"}
      <CalcResult />
    {:else if ui.view === "clip"}
      <ClipPanel />
    {:else if ui.view === "snippet"}
      <SnippetPanel />
    {:else if ui.view === "settings"}
      <SettingsPanel />
    {:else if ui.view === "emoji"}
      <EmojiPanel />
    {:else}
      <ResultList />
    {/if}
  </div>

  {#if ui.imagePreviewSrc}
    <ImagePreview src={ui.imagePreviewSrc} onclose={() => (ui.imagePreviewSrc = null)} />
  {/if}
</div>
