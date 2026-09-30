<script lang="ts">
  import { openTranslateSettings } from "$lib/commands/settings/actions";
  import { langLabel, parseTranslateInput } from "$lib/commands/translate/parse";
  import type { WordForm } from "$lib/commands/translate/types";
  import ScrollArea from "$lib/components/ScrollArea.svelte";
  import PanelFooter, { type FooterShortcut } from "$lib/components/PanelFooter.svelte";
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
  const ERROR_KEYS: Record<string, MessageKey> = {
    not_configured: "translate.notConfigured",
    too_long: "translate.tooLong",
    network: "translate.network",
    quota: "translate.quota",
    invalid: "translate.invalid",
    lang: "translate.lang",
    empty: "translate.emptyHint",
    unknown: "translate.failed",
  };

  const errorKey = $derived(ERROR_KEYS[translate.error ?? ""] ?? "translate.failed");
  /** True when the raw backend message is worth showing next to the mapped one. */
  const mappedError = $derived(!translate.error || translate.error in ERROR_KEYS);

  $effect(() => {
    if (ui.view !== "translate") return;
    const rest = ui.commandRest;
    untrack(() => translate.preview(rest));
  });

  const FORM_KEYS: Record<string, MessageKey> = {
    pl: "translate.form.pl",
    third: "translate.form.third",
    past: "translate.form.past",
    done: "translate.form.done",
    ing: "translate.form.ing",
    er: "translate.form.er",
    est: "translate.form.est",
  };

  function formLabel(form: WordForm): string {
    const key = FORM_KEYS[form.kind];
    return key ? i18n.t(key) : form.kind;
  }

  // Key glyphs are not translated: they name physical keys, which read the same
  // in every locale. Both values follow the panel's state priority so the
  // permanent footer always describes the state the panel is actually in.
  const footerShortcuts = $derived.by((): FooterShortcut[] => {
    if (!configured) return [];
    if (translate.result && translate.wordMode) {
      return [
        { keys: "Enter", label: i18n.t("translate.keyCopyTranslation") },
        { keys: "Tab", label: i18n.t("translate.keySwapDirection") },
      ];
    }
    if (translate.result) return [{ keys: "Enter", label: i18n.t("translate.keyCopyTranslation") }];
    if (translate.loading) return [];
    if (query.text) return [{ keys: "Enter", label: i18n.t("translate.keyTranslate") }];
    return [];
  });

  const footerMessage = $derived.by((): string | null => {
    if (!configured) return i18n.t("translate.setupCta");
    if (translate.result) return null;
    if (translate.loading) return i18n.t("translate.loading");
    if (query.text) return null;
    return i18n.t("translate.hint");
  });
</script>

<!-- The footer is a sibling of the content column, not inside it, so it stays
     pinned to the bottom whatever state the panel is in. -->
<div class="flex min-h-0 flex-1 flex-col">
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
          class="pressable mt-4 flex h-10 items-center rounded-md bg-surface-1 px-3 text-[14px] leading-5 text-ink hover:bg-surface-2 active:scale-[0.96]"
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
        {#if !mappedError && translate.error}
          <p class="mt-2 max-w-[22rem] text-pretty text-[13px] leading-5 text-ink-subtle">{translate.error}</p>
        {/if}
        {#if translate.error === "not_configured"}
          <button
            type="button"
            class="pressable mt-4 flex h-10 items-center rounded-md bg-surface-1 px-3 text-[14px] leading-5 text-ink hover:bg-surface-2 active:scale-[0.96]"
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
            {#if result.phoneticUk || result.phoneticUs}
              <p class="mt-1 text-[13px] leading-5 text-ink-subtle">
                {#if result.phoneticUk}
                  <span>{i18n.t("translate.phonetic.uk")} /{result.phoneticUk}/</span>
                {/if}
                {#if result.phoneticUk && result.phoneticUs}
                  <span class="text-ink-tertiary"> · </span>
                {/if}
                {#if result.phoneticUs}
                  <span>{i18n.t("translate.phonetic.us")} /{result.phoneticUs}/</span>
                {/if}
              </p>
            {:else if result.phonetic}
              <p class="mt-1 text-[13px] leading-5 text-ink-subtle">/{result.phonetic}/</p>
            {/if}
            {#if result.tags.length > 0}
              <p class="mt-2 flex flex-wrap gap-1">
                {#each result.tags as tag (tag)}
                  <span class="rounded-md bg-surface-1 px-1.5 py-0.5 text-[11px] leading-4 text-ink-subtle">{tag}</span>
                {/each}
              </p>
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
          {#if result.forms.length > 0}
            <ul class="flex flex-col gap-1 px-1">
              {#each result.forms as form (form.kind)}
                <li class="text-[13px] leading-5 text-ink">
                  <span class="text-ink-subtle">{formLabel(form)}</span>
                  {" "}
                  {form.values.join(" / ")}
                </li>
              {/each}
            </ul>
          {/if}
          {#if result.similar.length > 0}
            <div class="px-1">
              <p class="mb-1 text-[12px] leading-[1.4] text-ink-subtle">{i18n.t("translate.similar")}</p>
              <p class="text-[13px] leading-5 text-ink">{result.similar.join(" · ")}</p>
            </div>
          {/if}
          {#if result.sentences.length > 0}
            <div class="px-1">
              <p class="mb-2 text-[12px] leading-[1.4] text-ink-subtle">{i18n.t("translate.examples")}</p>
              <ul class="flex flex-col gap-2">
                {#each result.sentences as example, index (`${example.orig}-${index}`)}
                  <li>
                    <p class="text-[13px] leading-5 text-ink">{example.orig}</p>
                    {#if example.trans}
                      <p class="text-[13px] leading-5 text-ink-subtle">{example.trans}</p>
                    {/if}
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
        {translate.loading ? i18n.t("translate.loading") : i18n.t("translate.keyTranslate")}
      </p>
    {/if}
  </div>

  <PanelFooter shortcuts={footerShortcuts} message={footerMessage} />
</div>
