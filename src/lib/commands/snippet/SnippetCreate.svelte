<script lang="ts">
  import { snippets } from "$lib/stores/snippets.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { i18n } from "$lib/i18n";
  import { cancelSnippetDraft } from "$lib/commands/snippet/actions";
  import KeyChip from "$lib/components/KeyChip.svelte";
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
      {snippets.draft.id ? i18n.t("snippet.edit") : i18n.t("snippet.create")}
    </p>
    <label class="flex items-center rounded-md bg-surface-1 px-3 py-2">
      <span class="sr-only">{i18n.t("snippet.title")}</span>
      <input
        bind:this={titleEl}
        bind:value={snippets.draft.title}
        class="w-full bg-transparent text-[14px] leading-5 text-ink outline-none placeholder:text-ink-tertiary"
        placeholder={i18n.t("snippet.title")}
        autocomplete="off"
        spellcheck="false"
        onfocus={() => (ui.focusField = "snippet-title")}
        onkeydown={onKeydown}
        oncompositionstart={() => (composing = true)}
        oncompositionend={() => (composing = false)}
      />
    </label>
    <label class="flex items-center rounded-md bg-surface-1 px-3 py-2">
      <span class="sr-only">{i18n.t("snippet.keyword")}</span>
      <input
        bind:value={snippets.draft.keyword}
        class="w-full bg-transparent font-sans text-[14px] leading-5 text-ink outline-none placeholder:text-ink-tertiary"
        placeholder={i18n.t("snippet.keywordPlaceholder")}
        autocomplete="off"
        spellcheck="false"
        onfocus={() => (ui.focusField = "snippet-keyword")}
        onkeydown={onKeydown}
        oncompositionstart={() => (composing = true)}
        oncompositionend={() => (composing = false)}
      />
    </label>
    <label class="flex min-h-0 flex-1 flex-col rounded-md bg-surface-1 px-3 py-2">
      <span class="sr-only">{i18n.t("snippet.content")}</span>
      <textarea
        bind:value={snippets.draft.content}
        class="min-h-[5.5rem] flex-1 resize-none bg-transparent text-[14px] leading-5 text-ink outline-none placeholder:text-ink-tertiary"
        placeholder={i18n.t("snippet.contentPlaceholder")}
        spellcheck="false"
        onfocus={() => (ui.focusField = "snippet-content")}
        onkeydown={onKeydown}
        oncompositionstart={() => (composing = true)}
        oncompositionend={() => (composing = false)}
      ></textarea>
    </label>
    <button
      type="button"
      class="pressable flex h-10 items-center gap-2 rounded-md px-1 text-left text-[13px] leading-5 text-ink hover:bg-surface-1 active:scale-[0.96]"
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
          <Check class="size-3 text-primary" strokeWidth={2} fill="currentColor" />
        {/if}
      </span>
      <span>{i18n.t("snippet.sensitive")}</span>
      <span class="text-[12px] leading-[1.4] text-ink-tertiary">{i18n.t("snippet.sensitiveHint")}</span>
    </button>
    <div class="flex items-center justify-between px-1">
      <span class="flex items-center gap-3">
        <KeyChip keys="Ctrl+Enter" label={i18n.t("key.save")} />
        <KeyChip keys="Esc" label={i18n.t("key.cancel")} />
      </span>
      <button
        type="submit"
        class="pressable flex h-10 items-center rounded-md px-2 text-[12px] leading-[1.4] {canSave
          ? 'text-primary hover:text-primary-hover'
          : 'text-ink-tertiary'}"
        disabled={!canSave}
      >
        {i18n.t("snippet.save")}
      </button>
    </div>
  </form>
{/if}
