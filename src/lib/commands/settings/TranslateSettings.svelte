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
  import { untrack } from "svelte";

  let appIdEl: HTMLInputElement | undefined = $state();
  let secretEl: HTMLInputElement | undefined = $state();
  let urlEl: HTMLInputElement | undefined = $state();

  $effect(() => {
    ui.showNonce;
    untrack(() => {
      if (!settings.baiduAppId.trim()) ui.focusField = "translate-appid";
      else if (!settings.baiduSecret.trim()) ui.focusField = "translate-secret";
      const field = ui.focusField;
      if (field === "translate-appid") {
        appIdEl?.focus();
        if (!settings.baiduAppId) appIdEl?.select();
      } else if (field === "translate-secret") {
        secretEl?.focus();
        if (!settings.baiduSecret) secretEl?.select();
      } else if (field === "translate-url") {
        urlEl?.focus();
      }
    });
  });

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeSettingsDrill();
      return;
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
    onsubmit={(event) => event.preventDefault()}
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
      <label class="flex items-center gap-3 rounded-md bg-surface-1 px-3 py-2">
        <span class="w-14 shrink-0 text-[13px] leading-5 text-ink-subtle">{i18n.t("settings.translate.appId")}</span>
        <input
          bind:this={appIdEl}
          value={settings.baiduAppId}
          class="min-w-0 flex-1 bg-transparent font-sans text-[14px] leading-5 text-ink outline-none placeholder:text-ink-tertiary"
          placeholder={i18n.t("settings.translate.appIdPlaceholder")}
          autocomplete="off"
          spellcheck="false"
          oninput={(event) => settings.queueTranslateField("baiduTranslateAppId", (event.currentTarget as HTMLInputElement).value)}
          onblur={() => void settings.flushTranslatePersist()}
          onfocus={() => (ui.focusField = "translate-appid")}
          onkeydown={onKeydown}
        />
      </label>
      <label class="flex items-center gap-3 rounded-md bg-surface-1 px-3 py-2">
        <span class="w-14 shrink-0 text-[13px] leading-5 text-ink-subtle">{i18n.t("settings.translate.secret")}</span>
        <input
          bind:this={secretEl}
          value={settings.baiduSecret}
          class="min-w-0 flex-1 bg-transparent font-sans text-[14px] leading-5 text-ink outline-none placeholder:text-ink-tertiary"
          placeholder={i18n.t("settings.translate.secretPlaceholder")}
          type="password"
          autocomplete="off"
          spellcheck="false"
          oninput={(event) => settings.queueTranslateField("baiduTranslateSecretKey", (event.currentTarget as HTMLInputElement).value)}
          onblur={() => void settings.flushTranslatePersist()}
          onfocus={() => (ui.focusField = "translate-secret")}
          onkeydown={onKeydown}
        />
      </label>
      <label class="flex items-center gap-3 rounded-md bg-surface-1 px-3 py-2">
        <span class="w-14 shrink-0 text-[13px] leading-5 text-ink-subtle">{i18n.t("settings.translate.url")}</span>
        <input
          bind:this={urlEl}
          value={settings.translateApiUrl}
          class="min-w-0 flex-1 bg-transparent font-sans text-[14px] leading-5 text-ink outline-none placeholder:text-ink-tertiary"
          placeholder="https://api.fanyi.baidu.com/api/trans/vip/translate"
          autocomplete="off"
          spellcheck="false"
          oninput={(event) => settings.queueTranslateField("translationApiUrl", (event.currentTarget as HTMLInputElement).value)}
          onblur={() => void settings.flushTranslatePersist()}
          onfocus={() => (ui.focusField = "translate-url")}
          onkeydown={onKeydown}
        />
      </label>
      <p class="px-1 text-[12px] leading-[1.4] text-ink-tertiary">{i18n.t("settings.translate.urlHint")}</p>
      <p class="px-1 text-[12px] leading-[1.4] text-ink-tertiary">{i18n.t("settings.translate.dictHint")}</p>
      <button
        type="button"
        class="px-1 text-left text-[12px] leading-[1.4] text-primary hover:text-primary-hover"
        onclick={() => {
          void settings.flushTranslatePersist();
          void openUrl("https://api.fanyi.baidu.com/").catch(() => {});
        }}
      >
        {i18n.t("settings.translate.openSignup")}
      </button>
    </ScrollArea>
    <div class="px-3 pb-3 pt-1">
      <p class="text-[12px] leading-[1.4] text-ink-tertiary">{i18n.t("settings.translate.saveHint")}</p>
    </div>
    {#if settings.notice}
      <p class="px-3 pb-3 text-[12px] leading-[1.4] text-ink-tertiary">{settings.notice}</p>
    {/if}
  </form>
{/if}
