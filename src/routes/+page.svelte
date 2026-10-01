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
  import ActionConfirm from "$lib/components/ActionConfirm.svelte";
  import ColorPanel from "$lib/commands/color/ColorPanel.svelte";
  import Base64Panel from "$lib/commands/base64/Base64Panel.svelte";
  import JsonPanel from "$lib/commands/json/JsonPanel.svelte";
  import ClipPreview from "$lib/commands/clip/ClipPreview.svelte";
  import EmojiPanel from "$lib/commands/emoji/EmojiPanel.svelte";
  import SettingsPanel from "$lib/commands/settings/SettingsPanel.svelte";
  import SnippetPanel from "$lib/commands/snippet/SnippetPanel.svelte";
  import { toggleSelectedPreview } from "$lib/commands/clip/preview";
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
  import { update } from "$lib/stores/update.svelte";
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
    // `apps.start()` and `ui.start()` were no-ops: both promises are kicked off
    // in their constructors, so the calls only looked like initialisation.
    const stops: Array<() => void> = [];

    void listen("palette-shown", () => {
      ui.beginShow();
      // The two things worth asking about on a schedule, and both throttle
      // themselves: a release, and whether the app list still matches the Start
      // Menu. Opening the palette is the app's only regular moment, and the only
      // one where either answer can be acted on.
      void update.checkQuietly();
      void apps.refresh();
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
    if (ui.view !== "clip" && ui.preview) {
      ui.preview = null;
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

  /**
   * The palette's Tab shortcuts live here and nowhere else.
   *
   * They used to exist twice — once on the search input and once here as a
   * fallback — which meant two copies to keep in step, and the fallback only
   * worked at all because the input's copy called `stopPropagation`. One
   * implementation can also be given the guard the input's copy could not need:
   * Tab must keep moving focus inside a form.
   */
  function onWindowKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      escapePalette();
      return;
    }

    if (event.key !== "Tab" || event.ctrlKey || event.metaKey || event.altKey) return;

    // Tab belongs to the field it is pressed in. These shortcuts apply while the
    // search input, or nothing in particular, holds focus.
    const active = document.activeElement;
    const inAnotherField =
      active instanceof HTMLElement &&
      active.id !== "palette-search" &&
      active.closest("input, textarea, [contenteditable='true']") !== null;
    if (inAnotherField) return;

    // A dialog owns the keyboard while it is open, so Tab moves inside it.
    if (ui.pendingConfirm || clipboard.confirm) return;

    if (ui.view === "clip") {
      event.preventDefault();
      toggleSelectedPreview();
      return;
    }
    if (ui.view === "json") {
      if (json.editing) return;
      event.preventDefault();
      json.toggleCompact();
      return;
    }
    if (ui.view === "base64") {
      event.preventDefault();
      toggleBase64Mode();
      return;
    }
    if (ui.view === "qr") {
      event.preventDefault();
      void saveQrPng();
      return;
    }
    if (ui.view === "translate") {
      event.preventDefault();
      void translate.cycleTarget(event.shiftKey);
    }
  }
</script>

<!-- Bubbles, not captures. The autofill dropdown that used to swallow Tab is
     switched off at the source (`src-tauri/src/autofill.rs`), and claiming keys in
     the capture phase turned out to cost more than it bought: `SearchBar` handles
     Escape on the input, so a capture-phase handler here ran it twice and one Esc
     walked two steps back and hid the palette. -->
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

  <!-- No padding reserved for the toast: it is absolutely positioned, so the
       old `pb-14` only made the panel jump by 56px for the 2.2s it was visible. -->
  <div id="command-results" class="flex min-h-0 flex-1 flex-col">
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

  <!-- The live region stays in the DOM whether or not it has anything to say:
       assistive tech has to be observing the node before its text changes, so a
       container created together with the message is announced unreliably, if at
       all. Only the styling is conditional, so an empty region paints nothing. -->
  <div
    role="status"
    aria-live="polite"
    class="pointer-events-none absolute inset-x-3 bottom-3 z-20 {ui.notice
      ? 'rounded-md bg-surface-2 px-3 py-2 text-[12px] leading-[1.45] text-pretty break-words text-ink outline outline-1 outline-hairline'
      : ''}"
  >
    {ui.notice}
  </div>
</div>

<!-- The three modals are siblings of the clipped column rather than children of
     it, and that placement is the fix for a bright 1px arc at the window's four
     rounded corners.

     Their backdrop is a `backdrop-filter` layer. Chromium clips such a layer to
     its own `border-radius` but not to a rounded ancestor's `overflow-hidden`,
     so inside the column above the tint was clipped twice — once by the column,
     once by the backdrop's own radius — while the blur was clipped once. At the
     corner the tint therefore covered about half of what the blur did, and the
     undimmed shell showed through as a white sliver along the arc. Out here the
     only rounded clip on the path is the backdrop's own, so the two agree. -->
<ClipPreview preview={ui.preview} onclose={() => (ui.preview = null)} />
<ClipConfirm />
<ActionConfirm />
</div>
</div>
