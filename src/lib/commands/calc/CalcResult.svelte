<script lang="ts">
  import { CALC_EXAMPLES, evaluateExpression } from "$lib/commands/calc/evaluate";
  import ScrollArea from "$lib/components/ScrollArea.svelte";
  import { calcHistory } from "$lib/stores/calcHistory.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { Trash2 } from "@lucide/svelte";
  import { fly } from "svelte/transition";

  const outcome = $derived(evaluateExpression(ui.commandRest));

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

  function reuse(expression: string) {
    ui.searchText = `calc ${expression}`;
    ui.focusField = "search";
  }

  function remove(id: string) {
    calcHistory.remove(id);
  }
</script>

<div class="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-1">
  <p class="px-1 text-[12px] leading-[1.4] text-ink-subtle">计算器</p>

  {#if outcome.ok}
    <p
      class="slide-in mt-3 px-1 font-medium text-[24px] leading-8 tracking-[-0.05px] text-pretty text-ink tabular-nums"
    >
      {outcome.display}
    </p>
    <p class="mt-2 px-1 text-[13px] leading-5 text-ink-tertiary">回车复制结果并记入历史</p>
  {:else if outcome.reason === "empty" || outcome.reason === "pending"}
    <p class="mt-3 px-1 text-[14px] leading-5 text-ink-tertiary">输入表达式后回车保存</p>
    <p class="mt-2 px-1 text-[12px] leading-[1.4] text-ink-tertiary">
      {CALC_EXAMPLES.join("  ·  ")}
    </p>
  {:else}
    <p class="mt-3 px-1 text-[14px] leading-5 text-ink-tertiary">无法计算</p>
  {/if}

  <div class="mt-4 flex min-h-0 flex-1 flex-col">
    <div class="mb-2 flex items-baseline justify-between px-1 text-[12px] leading-[1.4] text-ink-subtle">
      <span>历史</span>
      <span class="tabular-nums">{calcHistory.entries.length}</span>
    </div>

    {#if calcHistory.entries.length === 0}
      <p class="px-1 text-[13px] leading-5 text-ink-tertiary">还没有记录。算出结果后按回车保存。</p>
    {:else}
      <ScrollArea class="min-h-0 flex-1" viewportClass="flex flex-col">
        <ul class="flex flex-col gap-1 pr-1">
          {#each calcHistory.entries as entry (entry.id)}
            <li
              class="flex items-center gap-2 rounded-md bg-surface-1 px-2 py-1.5"
              in:fly={enter}
              out:fly={leave}
            >
              <button
                type="button"
                class="min-w-0 flex-1 rounded-md px-1 py-1 text-left transition-colors duration-150 ease-out hover:bg-surface-2/70 active:scale-[0.96]"
                onclick={() => reuse(entry.expression)}
              >
                <span class="block truncate text-[12px] leading-[1.4] text-ink-subtle">
                  {entry.expression}
                </span>
                <span class="mt-0.5 block truncate text-[14px] leading-5 text-ink tabular-nums">
                  {entry.result}
                </span>
              </button>
              <button
                type="button"
                class="flex size-10 shrink-0 items-center justify-center rounded-md text-ink-tertiary transition-colors duration-150 ease-out hover:text-ink active:scale-[0.96]"
                aria-label="删除这条记录"
                onclick={() => remove(entry.id)}
              >
                <Trash2 class="size-4" strokeWidth={1.5} aria-hidden="true" />
              </button>
            </li>
          {/each}
        </ul>
      </ScrollArea>
    {/if}
  </div>
</div>
