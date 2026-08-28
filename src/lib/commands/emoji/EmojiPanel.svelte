<script lang="ts">
  import { openEmojiCategory } from "$lib/commands/emoji/actions";
  import EmojiGrid from "$lib/commands/emoji/EmojiGrid.svelte";
  import { parseEmojiScreen } from "$lib/commands/emoji/parse";
  import ScrollArea from "$lib/components/ScrollArea.svelte";
  import { emojis } from "$lib/stores/emojis.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { Smile } from "@lucide/svelte";
  import { untrack } from "svelte";

  const screen = $derived(parseEmojiScreen(ui.commandRest));
  const items = $derived(emojis.visible(ui.commandRest));
  const count = $derived(screen.type === "categories" ? emojis.categories.length : items.length);

  $effect(() => {
    ui.commandRest;
    untrack(() => {
      emojis.selectedIndex = 0;
    });
  });

  $effect(() => {
    emojis.clampSelection(count);
  });

  function scrollWhen(node: HTMLElement, selected: boolean) {
    const apply = (value: boolean) => {
      if (value) node.scrollIntoView({ block: "nearest", inline: "nearest" });
    };
    apply(selected);
    return { update: apply };
  }
</script>

<div class="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-1">
  {#if screen.type === "categories"}
    <p class="mb-1 px-1 text-[12px] leading-[1.4] text-ink-subtle">分类</p>
    <ScrollArea
      class="min-h-0 flex-1"
      viewportClass="flex flex-col gap-1"
      role="listbox"
      tabindex={-1}
      aria-label="Emoji categories"
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
          onclick={() => openEmojiCategory(category.name)}
        >
          <span class="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-1 text-[20px] leading-none">
            {category.icon}
          </span>
          <span class="min-w-0 flex-1 truncate text-[14px] font-medium leading-5 text-ink">{category.name}</span>
          <span class="tabular-nums text-[12px] leading-[1.4] text-ink-tertiary">{category.emojis.length}</span>
        </button>
      {/each}
    </ScrollArea>
  {:else if items.length === 0}
    <div class="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <span class="flex size-10 items-center justify-center rounded-md bg-surface-1 text-ink-muted">
        <Smile class="size-4" strokeWidth={1.5} aria-hidden="true" />
      </span>
      <p class="mt-3 text-[14px] font-medium leading-5 text-ink">没有匹配的表情</p>
      <p class="mt-2 max-w-[20rem] text-pretty text-[13px] leading-5 text-ink-subtle">试试英文关键词，比如 smile 或 rocket</p>
    </div>
  {:else}
    <p class="mb-1 px-1 text-[12px] leading-[1.4] text-ink-subtle">
      {screen.type === "category" ? screen.category.name : "搜索结果"}
      <span class="tabular-nums">{items.length}</span>
    </p>
    <ScrollArea class="min-h-0 flex-1" viewportClass="p-0.5 pb-1" aria-label="Emoji grid">
      <EmojiGrid {items} />
    </ScrollArea>
  {/if}

  <p class="mt-2 px-1 text-[12px] leading-[1.4] text-ink-tertiary">
    {#if emojis.notice}
      {emojis.notice}
    {:else if screen.type === "categories"}
      Enter 打开 · Esc 关闭
    {:else if items.length === 0}
      Esc 返回分类
    {:else}
      Enter 复制 · Esc 返回
    {/if}
  </p>
</div>
