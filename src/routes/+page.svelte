<script lang="ts">
  import "$lib/commands/calc";
  import "$lib/commands/todo";
  import CalcResult from "$lib/commands/calc/CalcResult.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import ResultList from "$lib/components/ResultList.svelte";
  import SearchBar from "$lib/components/SearchBar.svelte";
  import TodoInput from "$lib/commands/todo/TodoInput.svelte";
  import TodoList from "$lib/commands/todo/TodoList.svelte";
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

  function onWindowKeydown(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    ui.beginHide();
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div
  class="app-shell flex flex-col"
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
    {:else}
      <ResultList />
    {/if}
  </div>
</div>
