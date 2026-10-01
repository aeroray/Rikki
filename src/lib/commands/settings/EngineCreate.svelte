<script lang="ts">
  import { settings } from "$lib/stores/settings.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { i18n } from "$lib/i18n";
  import { closeSettingsDrill } from "$lib/commands/settings/actions";
  import PanelFooter, { type FooterShortcut } from "$lib/components/PanelFooter.svelte";

  const canSave = $derived(
    Boolean(settings.engineDraft && settings.engineDraft.name.trim() && settings.engineDraft.url.trim()),
  );

  // Key glyphs are not translated: they name physical keys, which read the same
  // in every locale.
  const footerShortcuts = $derived<FooterShortcut[]>([
    { keys: "Ctrl+Enter", label: i18n.t("key.save") },
    { keys: "Esc", label: i18n.t("key.cancel") },
  ]);

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
  <!-- The form is the content column and the footer is its sibling, so this screen
       wears the same chrome as every panel instead of a hand-rolled row. -->
  <div class="flex min-h-0 flex-1 flex-col">
    <form
      class="flex min-h-0 flex-1 flex-col gap-2 px-3 pt-1"
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
      <!-- This screen replaces the panel's list and its footer, so the store's
           notice has nowhere else to land: a rejected name or URL used to leave
           the form looking exactly as it did, with the save apparently ignored.
           The hint gives way to the reason, the way the footer's key chips do. -->
      <p class="px-1 text-[12px] leading-[1.4] text-ink-tertiary" aria-live="polite">
        {settings.notice ?? i18n.t("engine.urlHint")}
      </p>
    </form>

    <PanelFooter shortcuts={footerShortcuts}>
      <div class="flex justify-end">
        <button
          type="button"
          class="pressable flex h-8 items-center rounded-md px-2 text-[12px] leading-[1.4] {canSave
            ? 'text-primary hover:text-primary-hover'
            : 'text-ink-tertiary'}"
          disabled={!canSave}
          onclick={() => void settings.saveEngineDraft()}
        >
          {i18n.t("engine.save")}
        </button>
      </div>
    </PanelFooter>
  </div>
{/if}
