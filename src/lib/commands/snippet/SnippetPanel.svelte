<script lang="ts">
  import { startSnippetCreate } from "$lib/commands/snippet/actions";
  import { parseSnippetAction, snippetListQuery } from "$lib/commands/snippet/parse";
  import SnippetCreate from "$lib/commands/snippet/SnippetCreate.svelte";
  import SnippetItem from "$lib/commands/snippet/SnippetItem.svelte";
  import ScrollArea from "$lib/components/ScrollArea.svelte";
  import { i18n } from "$lib/i18n";
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
        <p class="px-1 py-6 text-center text-[13px] leading-5 text-ink-subtle">{i18n.t("snippet.noMatch")}</p>
      {:else}
        <div class="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <span class="flex size-10 items-center justify-center rounded-md bg-surface-1 text-ink-muted">
            <FileText class="size-4" strokeWidth={1.5} aria-hidden="true" />
          </span>
          <p class="mt-3 text-[14px] font-medium leading-5 text-ink">{i18n.t("snippet.emptyTitle")}</p>
          <p class="mt-2 max-w-[20rem] text-pretty text-[13px] leading-5 text-ink-subtle">
            {i18n.t("snippet.emptyBody")}
          </p>
          <button
            type="button"
            class="pressable mt-4 flex h-10 items-center gap-2 rounded-md bg-surface-1 px-3 text-[14px] leading-5 text-ink hover:bg-surface-2 active:scale-[0.96]"
            onclick={() => startSnippetCreate()}
          >
            {i18n.t("snippet.emptyCreate")}
          </button>
          <p class="mt-3 flex items-center justify-center gap-2 text-[12px] leading-[1.4] text-ink-tertiary">
            <kbd class="rounded-sm bg-canvas px-1.5 py-0.5 font-sans">sn add</kbd>
            <span>{i18n.t("snippet.or")}</span>
            <kbd class="rounded-sm bg-canvas px-1.5 py-0.5 font-sans">Ctrl+N</kbd>
          </p>
        </div>
      {/if}
    {:else}
      <p class="mb-1 px-1 text-[12px] leading-[1.4] text-ink-subtle">
        {querying ? i18n.t("snippet.matches") : action.type === "edit" ? i18n.t("snippet.manage") : i18n.t("snippet.all")}
        <span class="tabular-nums">{items.length}</span>
      </p>
      <ScrollArea
        class="min-h-0 flex-1"
        viewportClass="flex flex-col gap-2"
        role="listbox"
        tabindex={-1}
        aria-label={i18n.t("snippet.all")}
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
    <p class="palette-hint">
      {#if snippets.notice}
        {snippets.notice}
      {:else if items.length === 0 && !querying}
        {i18n.t("snippet.emptyHint")}
      {:else}
        {i18n.t("snippet.footer")}
      {/if}
    </p>
  </div>
{/if}
