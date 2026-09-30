<script lang="ts">
  import type { Accent } from "$lib/stores/translate.svelte";
  import { translate } from "$lib/stores/translate.svelte";
  import { SUPPORTED_TARGETS } from "$lib/commands/translate/parse";
  import PanelEmpty from "$lib/components/PanelEmpty.svelte";
  import PanelFooter, { type FooterShortcut } from "$lib/components/PanelFooter.svelte";
  import ScrollArea from "$lib/components/ScrollArea.svelte";
  import { i18n } from "$lib/i18n";
  import type { MessageKey } from "$lib/i18n/zh-CN";
  import { ui } from "$lib/stores/ui.svelte";
  import { Languages, Volume2 } from "@lucide/svelte";
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
      // The same two keys carry the word card's accents and the sentence's two
      // translations; only one of the two shapes is ever on screen.
      if (translate.result?.entry) void translate.play("us");
      else void translate.copyMachine();
      return;
    }
    if (event.key === "2") {
      event.preventDefault();
      if (translate.result?.entry) void translate.play("uk");
      else void translate.copyLlm();
    }
  }

  // Key glyphs are not translated: they name physical keys. The chips follow the
  // panel's own state, so a key that would do nothing here is never advertised.
  const footerShortcuts = $derived.by((): FooterShortcut[] => {
    const shortcuts: FooterShortcut[] = [];
    // A sentence has two translations and Enter takes the slow one, so both the
    // key that copies it and the key that copies the other are named outright.
    // "Copy translation" said nothing about which of the two was meant.
    const twoTranslations = translate.result !== null && translate.llmApplies;
    if (translate.loading) {
      // Enter is ignored while a request is in flight.
    } else if (translate.error !== null) {
      shortcuts.push({ keys: "Enter", label: i18n.t("translate.keyRetry") });
    } else if (translate.llmReady) {
      shortcuts.push({ keys: "Enter", label: i18n.t("translate.keyCopyLlm") });
      if (twoTranslations) {
        shortcuts.push({ keys: "Shift+Enter", label: i18n.t("translate.keyCopyMachine") });
      }
    } else if (translate.result) {
      // Nothing slow to copy yet, so Enter is unambiguously the fast one.
      shortcuts.push({
        keys: "Enter",
        label: i18n.t(twoTranslations ? "translate.keyCopyMachine" : "translate.keyCopyTranslation"),
      });
    } else if (text) {
      shortcuts.push({ keys: "Enter", label: i18n.t("translate.keyTranslate") });
    }
    // Tab always has something to do, including before anything is typed.
    shortcuts.push({ keys: "Tab", label: i18n.t("translate.keyCycleTarget") });
    // The accents keep their keys: a word card has no second translation for
    // them to conflict with, and there is no other way to play a clip.
    if (translate.hasAudio("us")) {
      shortcuts.push({ keys: "Ctrl+1", label: i18n.t("translate.keyPlayUs") });
    }
    if (translate.hasAudio("uk")) {
      shortcuts.push({ keys: "Ctrl+2", label: i18n.t("translate.keyPlayUk") });
    }
    return shortcuts;
  });

  // The language list is wider than the footer, so the one in use is kept in
  // view. Without this, cycling past the visible end would change a setting the
  // user can no longer see.
  let picker = $state<HTMLDivElement | undefined>();

  $effect(() => {
    const active = translate.query.target;
    picker
      ?.querySelector(`[data-target="${active}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
</script>

<svelte:window onkeydown={onWindowKeydown} />

<!-- The footer is a sibling of the content column, not inside it, so it stays
     pinned to the bottom and long content scrolls in the body instead. -->
<div class="flex min-h-0 flex-1 flex-col">
  <div class="flex min-h-0 flex-1 flex-col px-3 pt-1">
    {#if translate.error !== null}
      <div class="flex flex-col px-1 pt-2">
        <p class="text-[14px] font-medium leading-5 text-ink">{errorTitle}</p>
        {#if translate.error}
          <p class="mt-1 text-pretty text-[12px] leading-[1.5] text-ink-subtle">{translate.error}</p>
        {/if}
      </div>
    {:else if translate.loading}
      <div class="flex flex-1 items-center justify-center px-1">
        <p class="text-[13px] leading-5 text-ink-subtle">{i18n.t("translate.loading")}</p>
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
        <!-- A sentence gets two answers: the fast one immediately, the AI one as
             it is written. The source is already in the search bar above, so
             neither repeats it, and the labels are what keeps the two apart at a
             glance. Both live in the scroll area, so a long pair scrolls instead
             of pushing the footer off the bottom. -->
        <ScrollArea class="min-h-0 flex-1" viewportClass="flex flex-col gap-2.5 pr-1">
          <section class="px-1">
            {#if translate.llmApplies}
              <div class="flex items-center gap-1.5">
                <p class="text-[11px] leading-4 text-ink-subtle">{i18n.t("translate.machine")}</p>
                <!-- One control, not two: a sentence has no US/UK pair to choose
                     between. It sits on the label rather than on the text below,
                     because it reads that translation and not the AI one — and
                     the label is the only thing on screen that says which of the
                     two answers the clip would be. It is drawn only when the
                     store has a clip to ask for, so the button never appears on a
                     sentence whose language the voice endpoint does not answer
                     for. -->
                {#if translate.sentenceVoice}
                  <button
                    type="button"
                    class="pressable flex size-6 items-center justify-center rounded-md text-ink-tertiary hover:text-ink active:scale-[0.96]"
                    aria-label={i18n.t("translate.playMachine")}
                    onclick={() => void translate.playSentence()}
                  >
                    <Volume2 class="size-3.5" strokeWidth={1.5} aria-hidden="true" />
                  </button>
                {/if}
              </div>
            {/if}
            <p class="mt-1 text-[17px] font-medium leading-6 text-pretty text-ink">
              {result.translation.text}
            </p>
          </section>

          {#if translate.llmApplies}
            <section class="border-t border-hairline px-1 pt-2.5">
              <div class="flex items-center gap-1.5">
                <p class="text-[11px] leading-4 text-ink-subtle">{i18n.t("translate.llm")}</p>
                {#if translate.llmVoice}
                  <button
                    type="button"
                    class="pressable flex size-6 items-center justify-center rounded-md text-ink-tertiary hover:text-ink active:scale-[0.96]"
                    aria-label={i18n.t("translate.playLlm")}
                    onclick={() => void translate.playSentence(true)}
                  >
                    <Volume2 class="size-3.5" strokeWidth={1.5} aria-hidden="true" />
                  </button>
                {/if}
              </div>
              {#if translate.llmText}
                <!-- The text is whatever has arrived so far, so it is already on
                     screen while the call is still running and does not jump when
                     the whole answer lands. -->
                <p class="mt-1 text-[17px] font-medium leading-6 text-pretty text-ink">
                  {translate.llmText}
                </p>
              {:else if translate.llmError}
                <div class="mt-1 flex items-center gap-2">
                  <p class="text-[13px] leading-5 text-pretty text-ink-subtle">
                    {i18n.t("translate.llmFailed")}
                  </p>
                  <!-- There is no second provider behind this one, so a failure
                       is the end of the road for the request rather than a
                       handoff. The text is still on screen, so retrying is one
                       click instead of a retype. -->
                  <button
                    type="button"
                    class="pressable shrink-0 rounded px-1.5 py-0.5 text-[11px] leading-4 text-ink-subtle hover:bg-surface-2 hover:text-ink active:scale-[0.97]"
                    onclick={() => void translate.retryLlm()}
                  >
                    {i18n.t("translate.keyRetry")}
                  </button>
                </div>
              {:else}
                <p class="mt-1 text-[13px] leading-5 text-ink-subtle">
                  {i18n.t("translate.llmLoading")}
                </p>
              {/if}
            </section>
          {/if}
        </ScrollArea>
      {/if}
    {:else}
      <PanelEmpty class="flex-1" icon={Languages} hint={i18n.t("translate.hint")} />
    {/if}
  </div>

  <PanelFooter shortcuts={footerShortcuts}>
    {#snippet children()}
      <!-- Four targets fit the bar with room to spare, so the row is clipped
           rather than scrollable: `overflow-x-auto` would draw the platform's
           own scrollbar, which is the one thing the palette never shows. If the
           list ever grows, it needs the custom track rather than this. -->
      <div
        bind:this={picker}
        class="flex items-center gap-0.5 overflow-hidden"
        role="radiogroup"
        aria-label={i18n.t("translate.keyCycleTarget")}
      >
        {#each SUPPORTED_TARGETS as target (target.code)}
          {@const active = target.code === translate.query.target}
          <button
            type="button"
            data-target={target.code}
            role="radio"
            aria-checked={active}
            class="shrink-0 rounded px-1.5 py-0.5 text-[11px] leading-4 {active
              ? 'bg-surface-2 font-medium text-ink'
              : 'text-ink-subtle hover:text-ink'}"
            onclick={() => void translate.setTarget(target.code)}
          >
            {target.short}
          </button>
        {/each}
      </div>
    {/snippet}
  </PanelFooter>
</div>
