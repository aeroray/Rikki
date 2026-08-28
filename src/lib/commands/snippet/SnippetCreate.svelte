<script lang="ts">
  import { snippets } from "$lib/stores/snippets.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { cancelSnippetDraft } from "$lib/commands/snippet/actions";
  import { Check } from "@lucide/svelte";

  const canSave = $derived(
    Boolean(snippets.draft && snippets.draft.title.trim() && snippets.draft.content.trim()),
  );

  let titleEl: HTMLInputElement | undefined = $state();
  let composing = $state(false);

  $effect(() => {
    if (ui.focusField === "snippet-title") {
      titleEl?.focus();
    }
  });

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancelSnippetDraft();
      return;
    }
    if (event.isComposing || composing) return;
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void snippets.saveDraft();
    }
  }
</script>

{#if snippets.draft}
  <form
    class="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-3 pt-1"
    onsubmit={(event) => {
      event.preventDefault();
      void snippets.saveDraft();
    }}
  >
    <p class="px-1 text-[12px] leading-[1.4] text-ink-subtle">
      {snippets.draft.id ? "编辑片段" : "新建片段"}
    </p>
    <label class="flex items-center rounded-md bg-surface-1 px-3 py-2">
      <span class="sr-only">标题</span>
      <input
        bind:this={titleEl}
        bind:value={snippets.draft.title}
        class="w-full bg-transparent text-[14px] leading-5 text-ink outline-none placeholder:text-ink-tertiary"
        placeholder="标题"
        autocomplete="off"
        spellcheck="false"
        onfocus={() => (ui.focusField = "snippet-title")}
        onkeydown={onKeydown}
        oncompositionstart={() => (composing = true)}
        oncompositionend={() => (composing = false)}
      />
    </label>
    <label class="flex items-center rounded-md bg-surface-1 px-3 py-2">
      <span class="sr-only">关键字</span>
      <input
        bind:value={snippets.draft.keyword}
        class="w-full bg-transparent font-sans text-[14px] leading-5 text-ink outline-none placeholder:text-ink-tertiary"
        placeholder="关键字，如 addr"
        autocomplete="off"
        spellcheck="false"
        onfocus={() => (ui.focusField = "snippet-keyword")}
        onkeydown={onKeydown}
        oncompositionstart={() => (composing = true)}
        oncompositionend={() => (composing = false)}
      />
    </label>
    <label class="flex min-h-0 flex-1 flex-col rounded-md bg-surface-1 px-3 py-2">
      <span class="sr-only">内容</span>
      <textarea
        bind:value={snippets.draft.content}
        class="min-h-[5.5rem] flex-1 resize-none bg-transparent text-[14px] leading-5 text-ink outline-none placeholder:text-ink-tertiary"
        placeholder={'片段内容，可用 {{date}} {{time}} {{clipboard}}'}
        spellcheck="false"
        onfocus={() => (ui.focusField = "snippet-content")}
        onkeydown={onKeydown}
        oncompositionstart={() => (composing = true)}
        oncompositionend={() => (composing = false)}
      ></textarea>
    </label>
    <button
      type="button"
      class="flex h-10 items-center gap-2 rounded-md px-1 text-left text-[13px] leading-5 text-ink transition-colors duration-150 ease-out hover:bg-surface-1 active:scale-[0.96]"
      aria-pressed={snippets.draft.sensitive}
      onclick={() => {
        if (snippets.draft) snippets.draft.sensitive = !snippets.draft.sensitive;
      }}
    >
      <span
        class="flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-hairline bg-surface-1"
        aria-hidden="true"
      >
        {#if snippets.draft.sensitive}
          <Check class="size-3 text-primary" strokeWidth={2} />
        {/if}
      </span>
      <span>敏感内容</span>
      <span class="text-[12px] leading-[1.4] text-ink-tertiary">列表中显示 ******</span>
    </button>
    <div class="flex items-center justify-between px-1">
      <p class="text-[12px] leading-[1.4] text-ink-tertiary">Ctrl+Enter 保存 · Esc 取消</p>
      <button
        type="submit"
        class="rounded-md px-2 py-1 text-[12px] leading-[1.4] transition-colors duration-150 ease-out {canSave
          ? 'text-primary hover:text-primary-hover'
          : 'text-ink-tertiary'}"
        disabled={!canSave}
      >
        保存
      </button>
    </div>
  </form>
{/if}
