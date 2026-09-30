<script lang="ts">
  import type { Accent } from "$lib/stores/translate.svelte";
  import { translate } from "$lib/stores/translate.svelte";
  import PanelFooter, { type FooterShortcut } from "$lib/components/PanelFooter.svelte";
  import ScrollArea from "$lib/components/ScrollArea.svelte";
  import { i18n } from "$lib/i18n";
  import type { MessageKey } from "$lib/i18n/zh-CN";
  import { ui } from "$lib/stores/ui.svelte";
  import { Volume2 } from "@lucide/svelte";
  import { untrack } from "svelte";

  type AccentInfo = {
    accent: Accent;
    labelKey: MessageKey;
    phone: string | null;
  };

  const text = $derived(ui.commandRest.trim());

  $effect(() => {
    if (ui.view !== "translate") return;
    const rest = ui.commandRest;
    untrack(() => translate.sync(rest));
  });

  /**
   * An accent is shown whole or not at all. A phonetic with no clip sitting
   * beside one that has a play button reads as a missing control, and the
   * dictionary only reports audio through `has*Audio`.
   */
  const accents = $derived.by((): AccentInfo[] => {
    const entry = translate.result?.entry ?? null;
    if (!entry) return [];
    const items: AccentInfo[] = [];
    if (entry.hasUsAudio) {
      items.push({ accent: "us", labelKey: "translate.phonetic.us", phone: entry.usPhone });
    }
    if (entry.hasUkAudio) {
      items.push({ accent: "uk", labelKey: "translate.phonetic.uk", phone: entry.ukPhone });
    }
    return items;
  });

  // The backend speaks in transport terms, and a failed request and a rejected
  // language pair deserve different titles; anything else is the generic one.
  const errorTitle = $derived(
    translate.error && /http|request|response|network|dictionary/i.test(translate.error)
      ? i18n.t("translate.network")
      : i18n.t("translate.failed"),
  );

  function onWindowKeydown(event: KeyboardEvent) {
    if (ui.view !== "translate") return;
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    if (event.key === "1") {
      event.preventDefault();
      void translate.play("us");
      return;
    }
    if (event.key === "2") {
      event.preventDefault();
      void translate.play("uk");
    }
  }

  // Key glyphs are not translated: they name physical keys. The chips follow the
  // panel's own state, so a key that would do nothing here is never advertised.
  const footerShortcuts = $derived.by((): FooterShortcut[] => {
    const shortcuts: FooterShortcut[] = [];
    if (translate.loading) {
      // Enter is ignored while a request is in flight.
    } else if (translate.error !== null) {
      shortcuts.push({ keys: "Enter", label: i18n.t("translate.keyRetry") });
    } else if (translate.result) {
      shortcuts.push({ keys: "Enter", label: i18n.t("translate.keyCopyTranslation") });
    } else if (text) {
      shortcuts.push({ keys: "Enter", label: i18n.t("translate.keyTranslate") });
    }
    // Tab always has something to do, including before anything is typed.
    shortcuts.push({ keys: "Tab", label: i18n.t("translate.keyCycleTarget") });
    if (translate.hasAudio("us")) {
      shortcuts.push({ keys: "Ctrl+1", label: i18n.t("translate.keyPlayUs") });
    }
    if (translate.hasAudio("uk")) {
      shortcuts.push({ keys: "Ctrl+2", label: i18n.t("translate.keyPlayUk") });
    }
    return shortcuts;
  });

  const footerMessage = $derived(i18n.t("translate.footerTarget", { name: translate.targetName }));
</script>

<svelte:window onkeydown={onWindowKeydown} />

<!-- The footer is a sibling of the content column, not inside it, so it stays
     pinned to the bottom and long content scrolls in the body instead. -->
<div class="flex min-h-0 flex-1 flex-col">
  <div class="flex min-h-0 flex-1 flex-col px-3 pt-1">
    {#if translate.error !== null}
      <div class="flex flex-1 flex-col justify-center px-1">
        <p class="text-[14px] font-medium leading-5 text-ink">{errorTitle}</p>
        {#if translate.error}
          <p class="mt-1 text-pretty text-[12px] leading-[1.5] text-ink-subtle">{translate.error}</p>
        {/if}
      </div>
    {:else if translate.loading}
      <div class="flex flex-1 flex-col justify-center px-1">
        <p class="text-[14px] leading-5 text-ink-subtle">{i18n.t("translate.loading")}</p>
      </div>
    {:else if translate.result}
      {@const result = translate.result}
      {#if result.entry}
        {@const entry = result.entry}
        <ScrollArea class="min-h-0 flex-1" viewportClass="flex flex-col gap-2.5 pr-1">
          <div class="px-1">
            <p class="text-[22px] font-medium leading-7 tracking-[-0.05px] text-pretty text-ink">
              {entry.headword}
            </p>
            {#if accents.length > 0}
              <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                {#each accents as item (item.accent)}
                  <span class="flex items-center gap-1 text-[13px] leading-5 text-ink-subtle">
                    <span>{i18n.t(item.labelKey)}{item.phone ? ` /${item.phone}/` : ""}</span>
                    <button
                      type="button"
                      class="pressable flex size-6 items-center justify-center rounded-md text-ink-tertiary hover:text-ink active:scale-[0.96]"
                      aria-label={i18n.t(item.accent === "us" ? "translate.keyPlayUs" : "translate.keyPlayUk")}
                      onclick={() => void translate.play(item.accent)}
                    >
                      <Volume2 class="size-3.5" strokeWidth={1.5} aria-hidden="true" />
                    </button>
                  </span>
                {/each}
              </div>
            {/if}
          </div>

          <p class="px-1 text-[17px] font-medium leading-6 text-pretty text-ink">
            {result.translation.text}
          </p>

          {#if entry.definitions.length > 0}
            <ul class="flex flex-col gap-1 px-1">
              {#each entry.definitions as definition, index (`${index}-${definition.meaning}`)}
                <li class="text-[13px] leading-5 text-ink">
                  {#if definition.partOfSpeech}
                    <span class="text-ink-subtle">{definition.partOfSpeech}</span>
                    {" "}
                  {/if}
                  {definition.meaning}
                </li>
              {/each}
            </ul>
          {/if}

          {#if entry.forms.length > 0}
            <p class="px-1 text-[12px] leading-[1.5] text-ink-subtle">
              {entry.forms.map((form) => `${form.name} ${form.value}`).join(" · ")}
            </p>
          {/if}

          {#if entry.examples.length > 0}
            <div class="px-1">
              <p class="mb-1.5 text-[12px] leading-[1.4] text-ink-subtle">
                {i18n.t("translate.examples")}
              </p>
              <ul class="flex flex-col gap-2">
                {#each entry.examples.slice(0, 3) as example, index (`${index}-${example.en}`)}
                  <li>
                    <p class="text-[13px] leading-5 text-ink">{example.en}</p>
                    <p class="text-[13px] leading-5 text-ink-subtle">{example.zh}</p>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
        </ScrollArea>
      {:else}
        <!-- A sentence gets the model's answer and nothing else. -->
        <ScrollArea class="min-h-0 flex-1" viewportClass="pr-1">
          <p class="text-[18px] font-medium leading-7 text-pretty text-ink">
            {result.translation.text}
          </p>
        </ScrollArea>
      {/if}
    {:else}
      <div class="flex flex-1 flex-col justify-center px-1">
        <p class="text-[14px] leading-5 text-ink-subtle">{i18n.t("translate.hint")}</p>
      </div>
    {/if}
  </div>

  <PanelFooter shortcuts={footerShortcuts} message={footerMessage} />
</div>
