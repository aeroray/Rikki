<script lang="ts">
  import { closeSettingsDrill } from "$lib/commands/settings/actions";
  import {
    TARGET_LANG_CODES,
    parseTargetLangCode,
    translateLangKey,
  } from "$lib/commands/translate/parse";
  import ScrollArea from "$lib/components/ScrollArea.svelte";
  import { i18n } from "$lib/i18n";
  import { settings } from "$lib/stores/settings.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { openUrl } from "@tauri-apps/plugin-opener";

  const canSave = $derived(
    Boolean(settings.translateDraft && settings.translateDraft.appId.trim() && settings.translateDraft.secret.trim()),
  );

  let appIdEl: HTMLInputElement | undefined = $state();
  let composing = $state(false);

  $effect(() => {
    if (ui.focusField === "translate-appid") {
      appIdEl?.focus();
      appIdEl?.select();
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
      void settings.saveTranslateDraft();
    }
  }

  function onDefaultChange(event: Event) {
    const code = parseTargetLangCode((event.currentTarget as HTMLSelectElement).value);
    if (code) void settings.setTranslateDefaultTarget(code);
  }

  function onSecondChange(event: Event) {
    const code = parseTargetLangCode((event.currentTarget as HTMLSelectElement).value);
    if (code) void settings.setTranslateSecondTarget(code);
  }
</script>

{#if settings.translateDraft}
  <form
    class="flex min-h-0 flex-1 flex-col"
    onsubmit={(event) => {
      event.preventDefault();
      void settings.saveTranslateDraft();
    }}
  >
    <ScrollArea class="min-h-0 flex-1" viewportClass="flex flex-col gap-2 px-3 pt-1 pb-2">
      <p class="px-1 text-[12px] leading-[1.4] text-ink-subtle">{i18n.t("settings.translate")}</p>
      <label class="flex items-center justify-between gap-3 rounded-md bg-surface-1 px-3 py-2">
        <span class="text-[13px] leading-5 text-ink">{i18n.t("settings.translate.defaultTarget")}</span>
        <select
          class="h-8 min-w-[7.5rem] rounded-md bg-canvas px-2 font-sans text-[13px] leading-5 text-ink outline-none"
          value={settings.translateDefaultTarget}
          onchange={onDefaultChange}
          onkeydown={onKeydown}
        >
          {#each TARGET_LANG_CODES as code (code)}
            <option value={code}>{i18n.t(translateLangKey(code))}</option>
          {/each}
        </select>
      </label>
      <label class="flex items-center justify-between gap-3 rounded-md bg-surface-1 px-3 py-2">
        <span class="text-[13px] leading-5 text-ink">{i18n.t("settings.translate.secondTarget")}</span>
        <select
          class="h-8 min-w-[7.5rem] rounded-md bg-canvas px-2 font-sans text-[13px] leading-5 text-ink outline-none"
          value={settings.translateSecondTarget}
          onchange={onSecondChange}
          onkeydown={onKeydown}
        >
          {#each TARGET_LANG_CODES as code (code)}
            <option value={code}>{i18n.t(translateLangKey(code))}</option>
          {/each}
        </select>
      </label>
      <p class="px-1 text-[12px] leading-[1.4] text-ink-tertiary">{i18n.t("settings.translate.langHint")}</p>
      <label class="flex items-center rounded-md bg-surface-1 px-3 py-2">
        <span class="sr-only">{i18n.t("settings.translate.appId")}</span>
        <input
          bind:this={appIdEl}
          bind:value={settings.translateDraft.appId}
          class="w-full bg-transparent font-sans text-[14px] leading-5 text-ink outline-none placeholder:text-ink-tertiary"
          placeholder={i18n.t("settings.translate.appIdPlaceholder")}
          autocomplete="off"
          spellcheck="false"
          onfocus={() => (ui.focusField = "translate-appid")}
          onkeydown={onKeydown}
          oncompositionstart={() => (composing = true)}
          oncompositionend={() => (composing = false)}
        />
      </label>
      <label class="flex items-center rounded-md bg-surface-1 px-3 py-2">
        <span class="sr-only">{i18n.t("settings.translate.secret")}</span>
        <input
          bind:value={settings.translateDraft.secret}
          class="w-full bg-transparent font-sans text-[14px] leading-5 text-ink outline-none placeholder:text-ink-tertiary"
          placeholder={i18n.t("settings.translate.secretPlaceholder")}
          type="password"
          autocomplete="off"
          spellcheck="false"
          onfocus={() => (ui.focusField = "translate-secret")}
          onkeydown={onKeydown}
          oncompositionstart={() => (composing = true)}
          oncompositionend={() => (composing = false)}
        />
      </label>
      <label class="flex items-center rounded-md bg-surface-1 px-3 py-2">
        <span class="sr-only">{i18n.t("settings.translate.url")}</span>
        <input
          bind:value={settings.translateDraft.url}
          class="w-full bg-transparent font-sans text-[14px] leading-5 text-ink outline-none placeholder:text-ink-tertiary"
          placeholder="https://api.fanyi.baidu.com/api/trans/vip/translate"
          autocomplete="off"
          spellcheck="false"
          onfocus={() => (ui.focusField = "translate-url")}
          onkeydown={onKeydown}
          oncompositionstart={() => (composing = true)}
          oncompositionend={() => (composing = false)}
        />
      </label>
      <p class="px-1 text-[12px] leading-[1.4] text-ink-tertiary">{i18n.t("settings.translate.urlHint")}</p>
      <button
        type="button"
        class="px-1 text-left text-[12px] leading-[1.4] text-primary hover:text-primary-hover"
        onclick={() => void openUrl("https://api.fanyi.baidu.com/").catch(() => {})}
      >
        {i18n.t("settings.translate.openSignup")}
      </button>
    </ScrollArea>
    <div class="flex items-center justify-between px-3 pb-3 pt-1">
      <p class="text-[12px] leading-[1.4] text-ink-tertiary">{i18n.t("settings.translate.saveHint")}</p>
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
    {#if settings.notice}
      <p class="px-3 pb-3 text-[12px] leading-[1.4] text-ink-tertiary">{settings.notice}</p>
    {/if}
  </form>
{/if}
