<script lang="ts">
  import PanelEmpty from "$lib/components/PanelEmpty.svelte";
  import PanelFooter, { type FooterShortcut } from "$lib/components/PanelFooter.svelte";
  import PendingPowerBar from "$lib/components/PendingPowerBar.svelte";
  import ScrollArea from "$lib/components/ScrollArea.svelte";
  import UpdateBar from "$lib/components/UpdateBar.svelte";
  import { relativeTime } from "$lib/commands/todo/format";
  import { filterTagOf } from "$lib/commands/todo/parse";
  import { i18n } from "$lib/i18n";
  import { todos } from "$lib/stores/todos.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { Check, Circle, ListTodo, Trash2 } from "@lucide/svelte";
  import { fly } from "svelte/transition";
  import { onMount } from "svelte";

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

  /**
   * The label the query filters to; empty means everything.
   *
   * Read from the query rather than kept as state of its own. `Tab` filters by
   * rewriting the field, so the field is the only place the answer lives and the
   * list cannot disagree with what the user sees they typed.
   */
  const filterTag = $derived(filterTagOf(ui.commandRest));

  const visible = $derived(todos.filtered(filterTag));

  const doneCount = $derived(visible.filter((todo) => todo.done).length);

  function timeLabel(createdAt: number): string {
    const { key, vars } = relativeTime(createdAt, Date.now());
    return i18n.t(key, vars);
  }

  /**
   * The chips describe the row the highlight is on, and withhold what would do
   * nothing — the same rule the settings list follows. `Tab` only appears when
   * there is a label to cycle to.
   */
  const footerShortcuts = $derived.by((): FooterShortcut[] => {
    const chips: FooterShortcut[] = [];
    const selected = visible[ui.selectedIndex];
    if (selected) {
      chips.push({
        keys: "Enter",
        label: i18n.t(selected.done ? "todo.keyUndone" : "todo.keyDone"),
      });
      chips.push({ keys: "Delete", label: i18n.t("key.delete") });
    }
    if (todos.tags.length > 0) {
      chips.push({ keys: "Tab", label: i18n.t("todo.keyFilter") });
    }
    chips.push({ keys: "Esc", label: i18n.t("key.back") });
    return chips;
  });

  const footerMessage = $derived(
    i18n.t("todo.doneCount", { done: doneCount, total: visible.length }),
  );

  function onToggle(id: string) {
    todos.toggle(id);
  }

  function onRemove(id: string) {
    todos.remove(id);
  }

  // The palette keeps one selection index for whatever list is on screen, and in
  // this view it points at a todo. Opening the panel starts on the first row
  // rather than inheriting the index the home or result list left behind.
  onMount(() => {
    ui.selectedIndex = 0;
  });

  // Removing rows, or filtering down to fewer of them, can leave the index past
  // the end, where Enter would act on nothing.
  $effect(() => {
    const last = visible.length - 1;
    if (ui.selectedIndex > last) ui.selectedIndex = Math.max(0, last);
  });

  /** Keeps the highlighted row on screen as the arrows walk past the viewport. */
  function scrollWhen(node: HTMLElement, selected: boolean) {
    const apply = (value: boolean) => {
      if (value) node.scrollIntoView({ block: "nearest", inline: "nearest" });
    };
    apply(selected);
    return { update: apply };
  }
</script>

<!-- The content keeps its own padding, and the bars sit outside it: they draw
     their own full-width top borders, which an inset wrapper would cut short. -->
<div class="flex min-h-0 flex-1 flex-col">
  <div class="flex min-h-0 flex-1 flex-col px-3 pb-3">
    <div class="mb-2 flex items-baseline justify-between px-1 text-[12px] leading-[1.4] text-ink-subtle">
      <span>{i18n.t("todo.title")}</span>
      <!-- Which slice of the list is on screen, because the field says what is
           typed but not what that means for the rows below it. -->
      <span class="truncate pl-3">
        {filterTag ? `#${filterTag}` : i18n.t("todo.filter.all")}
      </span>
    </div>

    {#if visible.length === 0}
      {#if filterTag}
        <PanelEmpty
          class="flex-1"
          icon={ListTodo}
          title={i18n.t("todo.filter.empty", { tag: filterTag })}
          hint={i18n.t("todo.filter.emptyHint")}
        />
      {:else}
        <PanelEmpty
          class="flex-1"
          icon={ListTodo}
          title={i18n.t("todo.emptyTitle")}
          hint={i18n.t("todo.empty")}
        />
      {/if}
    {:else}
      <ScrollArea class="min-h-0 flex-1" viewportClass="flex flex-col">
        <ul class="flex flex-col gap-1 pr-1">
          {#each visible as todo, index (todo.id)}
            <!-- The rows are not listbox options: each one carries two buttons, and
                 an option may not contain interactive children. Selection is shown
                 with the raised surface instead, and the arrows move it. -->
            <li
              class="flex items-center gap-2 rounded-md px-2 py-1.5 {index === ui.selectedIndex
                ? 'bg-surface-2'
                : 'bg-surface-1'}"
              use:scrollWhen={index === ui.selectedIndex}
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
              {#if todo.tag}
                <span
                  class="shrink-0 rounded-sm bg-surface-2 px-1.5 py-0.5 text-[11px] leading-4 text-ink-subtle"
                >
                  #{todo.tag}
                </span>
              {/if}
              <!-- The age is the one thing a row cannot show by being read: it is
                   what tells the user whether this is still worth doing. -->
              <span class="shrink-0 text-[11px] leading-4 text-ink-tertiary">
                {timeLabel(todo.createdAt)}
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
  <!-- This view is not a `PanelFooter`-only panel, so the countdown and the update
       notice are added here as well: both have to be visible from every view, not
       only the ones that already shared a footer. -->
  <PendingPowerBar />
  <UpdateBar />
  <PanelFooter shortcuts={footerShortcuts} message={footerMessage} />
</div>
