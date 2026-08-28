<script lang="ts">
  import { startSnippetCreate } from "$lib/commands/snippet/actions";
  import { parseSnippetAction, snippetListQuery } from "$lib/commands/snippet/parse";
  import SnippetCreate from "$lib/commands/snippet/SnippetCreate.svelte";
  import SnippetItem from "$lib/commands/snippet/SnippetItem.svelte";
  import ScrollArea from "$lib/components/ScrollArea.svelte";
  import { snippets } from "$lib/stores/snippets.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { FileText } from "@lucide/svelte";

  const action = $derived(parseSnippetAction(ui.commandRest));
  const items = $derived(snippets.filtered(ui.commandRest));
  const querying = $derived(Boolean(snippetListQuery(ui.commandRest).trim()));

  $effect(() => {
    if (ui.view !== "snippet") {
      if (snippets.draft) snippets.closeDraft();
      return;
    }
    if (action.type === "add") {
      if (!snippets.draft) snippets.openCreate();
      return;
    }
    if (snippets.draft?.id === null) {
      snippets.closeDraft();
    }
  });

  $effect(() => {
    snippets.clampSelection(items.length);
  });
</script>

{#if snippets.draft}
  <SnippetCreate />
{:else}
  <div class="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-1">
    {#if items.length === 0}
      {#if querying}
        <p class="px-1 py-6 text-center text-[13px] leading-5 text-ink-subtle">没有匹配的片段</p>
      {:else}
        <div class="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <span class="flex size-10 items-center justify-center rounded-md bg-surface-1 text-ink-muted">
            <FileText class="size-4" strokeWidth={1.5} aria-hidden="true" />
          </span>
          <p class="mt-3 text-[14px] font-medium leading-5 text-ink">还没有片段</p>
          <p class="mt-2 max-w-[20rem] text-pretty text-[13px] leading-5 text-ink-subtle">
            把地址、签名、常用回复存成模板，下次回车就能复制。
          </p>
          <button
            type="button"
            class="mt-4 flex h-10 items-center gap-2 rounded-md bg-surface-1 px-3 text-[14px] leading-5 text-ink transition-colors duration-150 ease-out hover:bg-surface-2 active:scale-[0.96]"
            onclick={() => startSnippetCreate()}
          >
            创建第一条片段
          </button>
          <p class="mt-3 flex items-center justify-center gap-2 text-[12px] leading-[1.4] text-ink-tertiary">
            <kbd class="rounded-sm bg-canvas px-1.5 py-0.5 font-sans">sn add</kbd>
            <span>或</span>
            <kbd class="rounded-sm bg-canvas px-1.5 py-0.5 font-sans">Ctrl+N</kbd>
          </p>
        </div>
      {/if}
    {:else}
      <p class="mb-1 px-1 text-[12px] leading-[1.4] text-ink-subtle">
        {querying ? "匹配结果" : action.type === "edit" ? "管理片段" : "全部片段"}
        <span class="tabular-nums">{items.length}</span>
      </p>
      <ScrollArea
        class="min-h-0 flex-1"
        viewportClass="flex flex-col gap-1"
        role="listbox"
        tabindex={-1}
        aria-label="Snippets"
      >
        {#each items as snippet, index (snippet.id)}
          <SnippetItem
            {snippet}
            selected={index === snippets.selectedIndex}
            onselect={() => {
              if (snippet.sensitive) {
                snippets.selectedIndex = index;
                return;
              }
              void snippets.copy(snippet.id);
            }}
            onedit={() => snippets.openEdit(snippet)}
            onremove={() => void snippets.remove(snippet.id)}
          />
        {/each}
      </ScrollArea>
    {/if}
    <p class="mt-2 px-1 text-[12px] leading-[1.4] text-ink-tertiary">
      {#if snippets.notice}
        {snippets.notice}
      {:else if items.length === 0 && !querying}
        sn add 或 Ctrl+N 新建
      {:else}
        Enter 复制 · Ctrl+N 新建 · Ctrl+E 编辑 · Delete 删除
      {/if}
    </p>
  </div>
{/if}
