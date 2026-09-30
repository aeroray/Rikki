<script lang="ts">
  import { openEmojiCategory } from "$lib/commands/emoji/actions";
  import EmojiGrid from "$lib/commands/emoji/EmojiGrid.svelte";
  import { emojiCategoryLabel } from "$lib/commands/emoji/categories";
  import { parseEmojiScreen } from "$lib/commands/emoji/parse";
  import PanelFooter, { type FooterShortcut } from "$lib/components/PanelFooter.svelte";
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

  // Key glyphs are not translated: they name physical keys, which read the same
  // in every locale. The footer keeps the old hint chain's priority exactly: a
  // notice wins, then the category list, then the loading overlay, then the
  // empty state, and the copy hint comes last.
  const footerShortcuts = $derived.by((): FooterShortcut[] => {
    if (emojis.notice) return [];
    if (screen.type === "categories") {
      return [
        { keys: "Enter", label: i18n.t("key.open") },
        { keys: "Esc", label: i18n.t("key.back") },
      ];
    }
    if (overlay) return [];
    if (items.length === 0) return [{ keys: "Esc", label: i18n.t("emoji.keyBackToCategories") }];
    return [
      { keys: "Enter", label: i18n.t("key.copy") },
      { keys: "Esc", label: i18n.t("key.back") },
    ];
  });

  const footerMessage = $derived.by((): string | null => {
    if (emojis.notice) return emojis.notice;
    if (screen.type === "categories") return null;
    return overlay ? i18n.t("emoji.loading") : null;
  });

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
    if (!ready && !emojis.failed) {
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

<!-- The footer is a sibling of the content column, not inside it, so it stays
     pinned to the bottom whatever the grid does. The loading scrim is absolute,
     so it still covers the whole panel. -->
<div class="relative flex min-h-0 flex-1 flex-col">
  <div class="flex min-h-0 flex-1 flex-col px-3 pt-1">
    {#if screen.type === "categories"}
      <p class="mb-1 px-1 text-[12px] leading-[1.4] text-ink-subtle">{i18n.t("emoji.categories")}</p>
      <ScrollArea
        class="min-h-0 flex-1"
        viewportClass="flex flex-col gap-2"
        role="listbox"
        tabindex={-1}
        aria-label={i18n.t("emoji.categories")}
      >
        {#each emojis.categories as category, index (category.id)}
          <button
            type="button"
            role="option"
            aria-selected={index === emojis.selectedIndex}
            class="row-hit flex w-full items-center gap-2 px-4 py-3 text-left active:scale-[0.96]"
            use:scrollWhen={index === emojis.selectedIndex}
            onclick={() => openEmojiCategory(category.id)}
          >
            <span class="flex size-8 shrink-0 items-center justify-center rounded-sm bg-surface-1 text-[20px] leading-none">
              {category.icon}
            </span>
            <span class="min-w-0 flex-1 truncate text-[14px] font-medium leading-[1.45] text-ink">{emojiCategoryLabel(category.id)}</span>
            <span class="tabular-nums text-[12px] font-normal leading-[1.45] text-ink-tertiary">{emojis.ready ? category.emojis.length : ""}</span>
          </button>
        {/each}
      </ScrollArea>
    {:else if showGrid && items.length > 0}
      <p class="mb-1 px-1 text-[12px] leading-[1.4] text-ink-subtle">
        {screen.type === "category" ? emojiCategoryLabel(screen.category.id) : i18n.t("emoji.results")}
        <span class="tabular-nums">{items.length}</span>
      </p>
      <ScrollArea class="min-h-0 flex-1" viewportClass="p-0.5 pb-1">
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
  </div>

  {#if overlay}
    <div
      class="absolute inset-0 z-10 flex items-center justify-center bg-canvas/50 backdrop-blur-md"
      aria-busy="true"
      aria-live="polite"
    >
      <p class="px-3 text-[14px] leading-5 text-ink">{i18n.t("emoji.loading")}</p>
    </div>
  {/if}

  <PanelFooter shortcuts={footerShortcuts} message={footerMessage} />
</div>
