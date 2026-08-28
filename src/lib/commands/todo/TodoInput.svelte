<script lang="ts">
  import { todos } from "$lib/stores/todos.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { slide } from "svelte/transition";

  let text = $state("");
  let inputEl: HTMLInputElement | undefined = $state();
  let composing = $state(false);

  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  $effect(() => {
    if (ui.focusField === "todo-input") {
      inputEl?.focus();
    }
  });

  function add() {
    const value = text.trim();
    if (!value) return;
    todos.add(value);
    text = "";
    ui.searchText = "todo ";
    ui.todoPanelOpen = true;
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.isComposing || composing) return;
    if (event.key !== "Enter") return;
    event.preventDefault();
    add();
  }
</script>

<label
  class="mx-3 mb-2 flex items-center rounded-md bg-surface-1 px-3 py-2"
  transition:slide={{ duration: reduceMotion ? 0 : 150, axis: "y" }}
>
  <span class="sr-only">New todo</span>
  <input
    bind:this={inputEl}
    bind:value={text}
    class="w-full bg-transparent text-[14px] leading-5 text-ink outline-none placeholder:text-ink-tertiary"
    placeholder="添加待办，回车确认"
    autocomplete="off"
    spellcheck="false"
    onkeydown={onKeydown}
    oncompositionstart={() => (composing = true)}
    oncompositionend={() => (composing = false)}
    onfocus={() => (ui.focusField = "todo-input")}
  />
</label>
