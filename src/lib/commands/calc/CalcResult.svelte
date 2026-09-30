<script lang="ts">
  import { CALC_EXAMPLES } from "$lib/commands/calc/evaluate";
  import { calcEngine } from "$lib/commands/calc/engine.svelte";
  import PanelFooter, { type FooterShortcut } from "$lib/components/PanelFooter.svelte";
  import ScrollArea from "$lib/components/ScrollArea.svelte";
  import { i18n } from "$lib/i18n";
  import { calcHistory } from "$lib/stores/calcHistory.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { Trash2 } from "@lucide/svelte";
  import { fly } from "svelte/transition";

  const outcome = $derived.by(() => {
    calcEngine.ready;
    return calcEngine.evaluate(ui.commandRest);
  });

  // Key glyphs are not translated: they name physical keys. The footer carries
  // the same state priority the inline hints used to: a copy affordance once the
  // expression evaluates, the examples while it is empty or still pending, and
  // the failure reason otherwise.
  const footerShortcuts = $derived.by((): FooterShortcut[] =>
    outcome.ok ? [{ keys: "Enter", label: i18n.t("calc.keyCopyResult") }] : [],
  );

  const footerMessage = $derived.by(() => {
    if (outcome.ok) return null;
    if (outcome.reason === "empty" || outcome.reason === "pending") {
      return CALC_EXAMPLES.join("  ·  ");
    }
    // The invalid and unavailable branches already render their own body text,
    // so the footer stays empty rather than repeating the sentence twice.
    return null;
  });

  $effect(() => {
    // The engine is a lazy chunk; a failed load is reported through
    // `calcEngine.failed`, so swallow the rejection here rather than letting it
    // surface as an unhandled promise rejection.
    void calcEngine.ensure().catch(() => {});
  });

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

<!-- The footer is a sibling of the content column, not inside it, so it stays
     pinned to the bottom however long the history list gets. -->
<div class="flex min-h-0 flex-1 flex-col">
  <div class="flex min-h-0 flex-1 flex-col px-3 pt-1">
    <p class="px-1 text-[12px] leading-[1.4] text-ink-subtle">{i18n.t("calc.title")}</p>

    {#if outcome.ok}
      <p
        class="row-fade mt-3 px-1 text-[24px] font-medium leading-8 tracking-[-0.05px] text-pretty text-ink tabular-nums"
      >
        {outcome.display}
      </p>
    {:else if outcome.reason === "empty"}
      <p class="mt-3 px-1 text-[14px] leading-5 text-ink-tertiary">{i18n.t("calc.emptyHint")}</p>
    {:else if outcome.reason === "pending"}
      <p class="mt-3 px-1 text-[14px] leading-5 text-ink-tertiary">{i18n.t("calc.incomplete")}</p>
    {:else if outcome.reason === "unavailable"}
      <p class="mt-3 px-1 text-[14px] leading-5 text-ink-tertiary">{i18n.t("calc.unavailable")}</p>
    {:else}
      <p class="mt-3 px-1 text-[14px] leading-5 text-ink-tertiary">{i18n.t("calc.error")}</p>
    {/if}

    <div class="mt-4 flex min-h-0 flex-1 flex-col">
      <div class="mb-2 flex items-baseline justify-between px-1 text-[12px] leading-[1.4] text-ink-subtle">
        <span>{i18n.t("calc.history")}</span>
        <span class="tabular-nums">{calcHistory.entries.length}</span>
      </div>

      {#if calcHistory.entries.length === 0}
        <p class="px-1 text-[13px] leading-5 text-ink-tertiary">{i18n.t("calc.historyEmpty")}</p>
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
                  class="row-hit min-w-0 flex-1 px-1 py-1 text-left active:scale-[0.96]"
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
                  class="pressable flex size-10 shrink-0 items-center justify-center rounded-md text-ink-tertiary hover:text-ink active:scale-[0.96]"
                  aria-label={i18n.t("calc.delete")}
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

  <PanelFooter shortcuts={footerShortcuts} message={footerMessage} />
</div>
