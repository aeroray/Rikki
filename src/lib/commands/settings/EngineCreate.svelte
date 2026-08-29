<script lang="ts">
  import { settings } from "$lib/stores/settings.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { i18n } from "$lib/i18n";
  import { closeSettingsDrill } from "$lib/commands/settings/actions";

  const canSave = $derived(
    Boolean(settings.engineDraft && settings.engineDraft.name.trim() && settings.engineDraft.url.trim()),
  );

  let nameEl: HTMLInputElement | undefined = $state();
  let composing = $state(false);

  $effect(() => {
    if (ui.focusField === "engine-name") {
      nameEl?.focus();
      nameEl?.select();
    }
  });

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeSettingsDrill();
      return;
    }
    if (event.isComposing || composing) return;
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void settings.saveEngineDraft();
    }
  }
</script>

{#if settings.engineDraft}
  <form
    class="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-3 pt-1"
    onsubmit={(event) => {
      event.preventDefault();
      void settings.saveEngineDraft();
    }}
  >
    <p class="px-1 text-[12px] leading-[1.4] text-ink-subtle">{i18n.t("engine.addTitle")}</p>
    <label class="flex items-center rounded-md bg-surface-1 px-3 py-2">
      <span class="sr-only">{i18n.t("engine.name")}</span>
      <input
        bind:this={nameEl}
        bind:value={settings.engineDraft.name}
        class="w-full bg-transparent text-[14px] leading-5 text-ink outline-none placeholder:text-ink-tertiary"
        placeholder={i18n.t("engine.namePlaceholder")}
        autocomplete="off"
        spellcheck="false"
        onfocus={() => (ui.focusField = "engine-name")}
        onkeydown={onKeydown}
        oncompositionstart={() => (composing = true)}
        oncompositionend={() => (composing = false)}
      />
    </label>
    <label class="flex items-center rounded-md bg-surface-1 px-3 py-2">
      <span class="sr-only">{i18n.t("engine.url")}</span>
      <input
        bind:value={settings.engineDraft.url}
        class="w-full bg-transparent text-[14px] leading-5 text-ink outline-none placeholder:text-ink-tertiary"
        placeholder="https://example.com/search?q=%s"
        autocomplete="off"
        spellcheck="false"
        onfocus={() => (ui.focusField = "engine-url")}
        onkeydown={onKeydown}
        oncompositionstart={() => (composing = true)}
        oncompositionend={() => (composing = false)}
      />
    </label>
    <p class="px-1 text-[12px] leading-[1.4] text-ink-tertiary">{i18n.t("engine.urlHint")}</p>
    <div class="mt-auto flex items-center justify-between px-1">
      <p class="text-[12px] leading-[1.4] text-ink-tertiary">{i18n.t("engine.saveHint")}</p>
      <button
        type="submit"
        class="rounded-md px-2 py-1 text-[12px] leading-[1.4] transition-colors duration-150 ease-out {canSave
          ? 'text-primary hover:text-primary-hover'
          : 'text-ink-tertiary'}"
        disabled={!canSave}
      >
        {i18n.t("engine.save")}
      </button>
    </div>
  </form>
{/if}
