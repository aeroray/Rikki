<script lang="ts">
  import ScrollArea from "$lib/components/ScrollArea.svelte";
  import { i18n } from "$lib/i18n";
  import { todos } from "$lib/stores/todos.svelte";
  import { Check, Circle, ListTodo, Trash2 } from "@lucide/svelte";
  import { fly } from "svelte/transition";

  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const enter = {
    y: reduceMotion ? 0 : -8,
    duration: reduceMotion ? 0 : 120,
  };
  const leave = {
    y: reduceMotion ? 0 : -4,
    duration: reduceMotion ? 0 : 100,
  };

  function onToggle(id: string) {
    todos.toggle(id);
  }

  function onRemove(id: string) {
    todos.remove(id);
  }
</script>

<div class="flex min-h-0 flex-1 flex-col px-3 pb-3">
  <div class="mb-2 flex items-baseline justify-between px-1 text-[12px] leading-[1.4] text-ink-subtle">
    <span>{i18n.t("todo.title")}</span>
    <span class="tabular-nums">
      {i18n.t("todo.doneCount", { done: todos.completed, total: todos.total })}
    </span>
  </div>

  {#if todos.todos.length === 0}
    <div class="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <span class="flex size-10 items-center justify-center rounded-md bg-surface-1 text-ink-muted">
        <ListTodo class="size-4" strokeWidth={1.5} aria-hidden="true" />
      </span>
      <p class="mt-3 text-[14px] font-medium leading-5 text-ink">{i18n.t("todo.emptyTitle")}</p>
      <p class="mt-2 max-w-[20rem] text-pretty text-[13px] leading-5 text-ink-subtle">
        {i18n.t("todo.empty")}
      </p>
    </div>
  {:else}
    <ScrollArea class="min-h-0 flex-1" viewportClass="flex flex-col">
      <ul class="flex flex-col gap-1 pr-1">
        {#each todos.todos as todo (todo.id)}
          <li
            class="flex items-center gap-2 rounded-md bg-surface-1 px-2 py-1.5"
            in:fly={enter}
            out:fly={leave}
          >
            <button
              type="button"
              class="pressable flex size-10 shrink-0 items-center justify-center rounded-md text-ink-subtle hover:text-ink active:scale-[0.96]"
              aria-label={todo.done ? i18n.t("todo.markUndone") : i18n.t("todo.markDone")}
              aria-pressed={todo.done}
              onclick={() => onToggle(todo.id)}
            >
              {#if todo.done}
                <Check class="size-4 text-primary" strokeWidth={2} fill="currentColor" aria-hidden="true" />
              {:else}
                <Circle class="size-4" strokeWidth={1.5} aria-hidden="true" />
              {/if}
            </button>
            <span
              class="min-w-0 flex-1 text-[14px] leading-5 text-pretty {todo.done
                ? 'text-ink-tertiary line-through'
                : 'text-ink'}"
            >
              {todo.text}
            </span>
            <button
              type="button"
              class="pressable flex size-10 shrink-0 items-center justify-center rounded-md text-ink-tertiary hover:text-ink active:scale-[0.96]"
              aria-label={i18n.t("todo.delete")}
              onclick={() => onRemove(todo.id)}
            >
              <Trash2 class="size-4" strokeWidth={1.5} aria-hidden="true" />
            </button>
          </li>
        {/each}
      </ul>
    </ScrollArea>
  {/if}
</div>
