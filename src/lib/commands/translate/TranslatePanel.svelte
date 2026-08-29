<script lang="ts">
  import { openTranslateSettings } from "$lib/commands/settings/actions";
  import { langLabel, parseTranslateInput } from "$lib/commands/translate/parse";
  import ScrollArea from "$lib/components/ScrollArea.svelte";
  import { i18n } from "$lib/i18n";
  import type { MessageKey } from "$lib/i18n/zh-CN";
  import { settings } from "$lib/stores/settings.svelte";
  import { translate } from "$lib/stores/translate.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { Languages } from "@lucide/svelte";
  import { untrack } from "svelte";

  const query = $derived(
    parseTranslateInput(ui.commandRest, {
      defaultTarget: settings.translateDefaultTarget,
      secondTarget: settings.translateSecondTarget,
    }),
  );
  const configured = $derived(settings.translateConfigured);
  const errorKey = $derived(translateErrorKey(translate.error));

  $effect(() => {
    if (ui.view !== "translate") return;
    const rest = ui.commandRest;
    untrack(() => translate.schedule(rest));
  });

  function translateErrorKey(error: string | null): MessageKey {
    if (error === "not_configured") return "translate.notConfigured";
    if (error === "too_long") return "translate.tooLong";
    if (error === "network") return "translate.network";
    if (error === "quota") return "translate.quota";
    if (error === "invalid") return "translate.invalid";
    if (error === "lang") return "translate.lang";
    if (error === "empty") return "translate.emptyHint";
    return "translate.failed";
  }
</script>

<div class="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-1">
  {#if !configured}
    <div class="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <span class="flex size-10 items-center justify-center rounded-md bg-surface-1 text-ink-muted">
        <Languages class="size-4" strokeWidth={1.5} aria-hidden="true" />
      </span>
      <p class="mt-3 text-[14px] font-medium leading-5 text-ink">{i18n.t("translate.setupTitle")}</p>
      <p class="mt-2 max-w-[22rem] text-pretty text-[13px] leading-5 text-ink-subtle">
        {i18n.t("translate.setupBody")}
      </p>
      <button
        type="button"
        class="mt-4 flex h-10 items-center rounded-md bg-surface-1 px-3 text-[14px] leading-5 text-ink transition-colors duration-150 ease-out hover:bg-surface-2 active:scale-[0.96]"
        onclick={() => openTranslateSettings()}
      >
        {i18n.t("translate.setupCta")}
      </button>
    </div>
  {:else if !query.text}
    <div class="flex flex-1 flex-col justify-center px-2">
      <p class="text-[14px] font-medium leading-5 text-ink">{i18n.t("translate.hint")}</p>
      <p class="mt-3 font-sans text-[13px] leading-6 text-ink-subtle">
        <span class="block">tr hello</span>
        <span class="block">tr en 你好</span>
        <span class="block">tr en ja ありがとう</span>
      </p>
    </div>
  {:else if translate.error}
    <div class="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <p class="text-[14px] font-medium leading-5 text-ink">{i18n.t(errorKey)}</p>
      {#if translate.error === "not_configured"}
        <button
          type="button"
          class="mt-4 flex h-10 items-center rounded-md bg-surface-1 px-3 text-[14px] leading-5 text-ink transition-colors duration-150 ease-out hover:bg-surface-2 active:scale-[0.96]"
          onclick={() => openTranslateSettings()}
        >
          {i18n.t("translate.setupCta")}
        </button>
      {/if}
    </div>
  {:else if translate.result}
    {@const result = translate.result}
    <p class="mb-2 px-1 text-[12px] leading-[1.4] text-ink-subtle">
      {langLabel(result.from)} → {langLabel(result.to)}
    </p>
    <ScrollArea class="min-h-0 flex-1" viewportClass="flex flex-col gap-3 pr-1">
      {#if translate.wordMode}
        <div class="px-1">
          <p class="font-medium text-[24px] leading-8 tracking-[-0.05px] text-pretty text-ink">{result.sourceText}</p>
          {#if result.phonetic}
            <p class="mt-1 text-[13px] leading-5 text-ink-subtle">/{result.phonetic}/</p>
          {/if}
        </div>
        {#if result.parts.length > 0}
          <ul class="flex flex-col gap-1 px-1">
            {#each result.parts as part, index (`${part.part}-${index}`)}
              <li class="text-[14px] leading-5 text-ink">
                {#if part.part}
                  <span class="text-ink-subtle">{part.part}</span>
                  {" "}
                {/if}
                {part.means.join("，")}
              </li>
            {/each}
          </ul>
        {:else}
          <p class="px-1 text-[18px] font-medium leading-6 text-pretty text-ink">{result.translatedText}</p>
        {/if}
        {#if result.sentences.length > 0}
          <div class="px-1">
            <p class="mb-2 text-[12px] leading-[1.4] text-ink-subtle">{i18n.t("translate.examples")}</p>
            <ul class="flex flex-col gap-2">
              {#each result.sentences as example, index (`${example.orig}-${index}`)}
                <li>
                  <p class="text-[13px] leading-5 text-ink">{example.orig}</p>
                  <p class="text-[13px] leading-5 text-ink-subtle">{example.trans}</p>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      {:else}
        <p class="px-1 text-[14px] leading-5 text-pretty text-ink-subtle">{result.sourceText}</p>
        <div class="mx-1 border-t border-hairline"></div>
        <p class="px-1 text-[18px] font-medium leading-6 text-pretty text-ink">{result.translatedText}</p>
      {/if}
    </ScrollArea>
  {:else}
    <p class="px-1 text-[13px] leading-5 text-ink-tertiary">
      {translate.loading ? i18n.t("translate.loading") : i18n.t("translate.emptyHint")}
    </p>
  {/if}

  <p class="mt-2 px-1 text-[12px] leading-[1.4] text-ink-tertiary">
    {#if !configured}
      {i18n.t("translate.setupCta")}
    {:else if translate.result && translate.wordMode}
      {i18n.t("translate.wordHint")}
    {:else if translate.result}
      {i18n.t("translate.copyHint")}
    {:else}
      {i18n.t("translate.hint")}
    {/if}
  </p>
</div>
