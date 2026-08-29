<script lang="ts">
  import { openEmojiCategory } from "$lib/commands/emoji/actions";
  import EmojiGrid from "$lib/commands/emoji/EmojiGrid.svelte";
  import { emojiCategoryLabel } from "$lib/commands/emoji/categories";
  import { parseEmojiScreen } from "$lib/commands/emoji/parse";
  import ScrollArea from "$lib/components/ScrollArea.svelte";
  import { i18n } from "$lib/i18n";
  import { emojis } from "$lib/stores/emojis.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { Smile } from "@lucide/svelte";
  import { untrack } from "svelte";

  const HEAVY = 48;

  const screen = $derived(parseEmojiScreen(ui.commandRest));
  const items = $derived(emojis.visible(ui.commandRest));
  const count = $derived(screen.type === "categories" ? emojis.categories.length : items.length);
  let overlay = $state(false);
  let showGrid = $state(false);

  $effect(() => {
    void emojis.ensure();
  });

  $effect(() => {
    ui.commandRest;
    untrack(() => {
      emojis.selectedIndex = 0;
    });
  });

  $effect(() => {
    emojis.clampSelection(count);
  });

  $effect(() => {
    ui.commandRest;
    const ready = emojis.ready;
    const n = items.length;
    const kind = screen.type;
    if (kind === "categories") {
      untrack(() => {
        overlay = false;
        showGrid = false;
      });
      return;
    }
    if (!ready) {
      untrack(() => {
        overlay = true;
        showGrid = false;
      });
      return;
    }
    if (n < HEAVY) {
      untrack(() => {
        overlay = false;
        showGrid = true;
      });
      return;
    }
    untrack(() => {
      overlay = true;
      showGrid = false;
    });
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      if (cancelled) return;
      showGrid = true;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!cancelled) overlay = false;
        });
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  });

  function scrollWhen(node: HTMLElement, selected: boolean) {
    const apply = (value: boolean) => {
      if (value) node.scrollIntoView({ block: "nearest", inline: "nearest" });
    };
    apply(selected);
    return { update: apply };
  }
</script>

<div class="relative flex min-h-0 flex-1 flex-col px-3 pb-3 pt-1">
  {#if screen.type === "categories"}
    <p class="mb-1 px-1 text-[12px] leading-[1.4] text-ink-subtle">{i18n.t("emoji.categories")}</p>
    <ScrollArea
      class="min-h-0 flex-1"
      viewportClass="flex flex-col gap-1"
      role="listbox"
      tabindex={-1}
      aria-label={i18n.t("emoji.categories")}
    >
      {#each emojis.categories as category, index (category.id)}
        <button
          type="button"
          role="option"
          aria-selected={index === emojis.selectedIndex}
          class="slide-in flex w-full items-center gap-3 rounded-md border-2 px-3 py-2.5 text-left transition-[background-color,border-color,transform] duration-150 ease-out active:scale-[0.96] {index === emojis.selectedIndex
            ? 'border-primary-focus/50 bg-surface-2'
            : 'border-transparent hover:bg-surface-2/70'}"
          use:scrollWhen={index === emojis.selectedIndex}
          onclick={() => openEmojiCategory(category.id)}
        >
          <span class="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-1 text-[20px] leading-none">
            {category.icon}
          </span>
          <span class="min-w-0 flex-1 truncate text-[14px] font-medium leading-5 text-ink">{emojiCategoryLabel(category.id)}</span>
          <span class="tabular-nums text-[12px] leading-[1.4] text-ink-tertiary">{emojis.ready ? category.emojis.length : ""}</span>
        </button>
      {/each}
    </ScrollArea>
  {:else if showGrid && items.length > 0}
    <p class="mb-1 px-1 text-[12px] leading-[1.4] text-ink-subtle">
      {screen.type === "category" ? emojiCategoryLabel(screen.category.id) : i18n.t("emoji.results")}
      <span class="tabular-nums">{items.length}</span>
    </p>
    <ScrollArea class="min-h-0 flex-1" viewportClass="p-0.5 pb-1" aria-label="Emoji grid">
      <EmojiGrid {items} />
    </ScrollArea>
  {:else if !overlay}
    <div class="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <span class="flex size-10 items-center justify-center rounded-md bg-surface-1 text-ink-muted">
        <Smile class="size-4" strokeWidth={1.5} aria-hidden="true" />
      </span>
      <p class="mt-3 text-[14px] font-medium leading-5 text-ink">{i18n.t("emoji.emptyTitle")}</p>
      <p class="mt-2 max-w-[20rem] text-pretty text-[13px] leading-5 text-ink-subtle">{i18n.t("emoji.emptyBody")}</p>
    </div>
  {:else}
    <div class="min-h-0 flex-1"></div>
  {/if}

  <p class="mt-2 px-1 text-[12px] leading-[1.4] text-ink-tertiary">
    {#if emojis.notice}
      {emojis.notice}
    {:else if screen.type === "categories"}
      {i18n.t("emoji.open")}
    {:else if overlay}
      {i18n.t("emoji.loading")}
    {:else if items.length === 0}
      {i18n.t("emoji.back")}
    {:else}
      {i18n.t("emoji.copyHint")}
    {/if}
  </p>

  {#if overlay}
    <div
      class="absolute inset-0 z-10 flex items-center justify-center bg-canvas/50 backdrop-blur-md"
      aria-busy="true"
      aria-live="polite"
    >
      <p class="px-3 text-[14px] leading-5 text-ink">{i18n.t("emoji.loading")}</p>
    </div>
  {/if}
</div>
