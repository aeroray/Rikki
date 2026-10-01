<script lang="ts">
  import { closeAnniversaryDrill } from "$lib/commands/anniversary/actions";
  import {
    draftTextFor,
    lunarLeapMonth,
    parseDateQuery,
    toLunarText,
  } from "$lib/commands/anniversary/dates";
  import { recurrenceLabel } from "$lib/commands/anniversary/format";
  import { primaryShortcut } from "$lib/commands/settings/engines";
  import { anniversaries } from "$lib/stores/anniversaries.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { i18n } from "$lib/i18n";
  import PanelFooter, { type FooterShortcut } from "$lib/components/PanelFooter.svelte";
  import { Check } from "@lucide/svelte";

  let titleEl: HTMLInputElement | undefined = $state();
  let dateEl: HTMLInputElement | undefined = $state();
  let composing = $state(false);

  const draft = $derived(anniversaries.draft);
  const query = $derived(draft ? parseDateQuery(draft.dateText) : ({ kind: "empty" } as const));

  const canSave = $derived(Boolean(draft && draft.title.trim() && query.kind === "date"));

  /** What the date field resolves to, echoed back as confirmation. */
  const resolved = $derived.by(() => {
    if (query.kind !== "date") return null;
    const lunar = query.calendar === "lunar";
    // Lunar month names come from the tables, and `lunarApi()` is a plain
    // module value Svelte cannot see; reading `lunarReady` here is what makes
    // the label recompute (without it the form showed `10月01日（10月01日）`).
    anniversaries.lunarReady;
    // The leap flag comes from the input (`nr…`): a year whose leap month is
    // the 5th leaves "month 5" ambiguous, so it cannot be inferred.
    const leap = query.leapMonth;
    const yearLeap = lunar && query.year !== null ? lunarLeapMonth(query.year) : 0;
    return {
      label: recurrenceLabel(query.month, query.day, query.calendar, leap),
      calendar: lunar ? i18n.t("anniversary.lunar") : i18n.t("anniversary.solar"),
      year: query.year,
      leap,
      // Offered only for the one month the question is about.
      //
      // This used to announce the year's leap month whenever the year had one,
      // which is noise to anyone entering 十月初三 in a year that repeats 六月:
      // the two have nothing to do with each other. Worse, it answered a
      // question that only exists for that single month by asking the user to
      // type an `r` into the field themselves.
      leapMonth: lunar && query.month === yearLeap ? yearLeap : 0,
      // Warn when the leap month was asked for but the year has none; the
      // occurrence then falls back to the regular month.
      leapMissing: lunar && leap && query.year !== null && yearLeap === 0,
    };
  });

  /**
   * The lunar reading of what is typed, offered as a one-press conversion.
   *
   * Only for a solar date: a lunar one has nothing to convert to, and the button
   * disappears with the value once it has been pressed.
   */
  const lunarText = $derived.by(() => {
    if (!draft) return null;
    // `lunarApi()` is a plain module value Svelte cannot see, so reading the flag
    // is what makes this recompute once the tables land.
    anniversaries.lunarReady;
    return toLunarText(draft.dateText);
  });

  const footerShortcuts = $derived.by((): FooterShortcut[] => {
    const shortcuts: FooterShortcut[] = [
      { keys: primaryShortcut("Enter"), label: i18n.t("key.save") },
    ];
    // Offered only while it would do something, the way the cleanup row hides its
    // own key when retention is off.
    if (lunarText)
      shortcuts.push({ keys: primaryShortcut("L"), label: i18n.t("anniversary.toLunar") });
    if (resolved?.leapMonth) {
      shortcuts.push({
        keys: primaryShortcut("R"),
        label: i18n.t("anniversary.leapToggle", { month: resolved.leapMonth }),
      });
    }
    shortcuts.push({ keys: "Esc", label: i18n.t("key.back") });
    return shortcuts;
  });

  function convertToLunar() {
    if (draft && lunarText) draft.dateText = lunarText;
  }

  /**
   * Flips the leap-month flag by rewriting the field.
   *
   * `draftTextFor` is the same function that renders a saved anniversary back
   * into the field, so the round trip is the one already covered by tests: the
   * marker ends up exactly where the parser expects it, whatever the user had
   * typed by hand (`农1003`, `10-03`, `n20250615`).
   */
  function toggleLeap() {
    if (!draft || query.kind !== "date") return;
    draft.dateText = draftTextFor({
      month: query.month,
      day: query.day,
      calendar: query.calendar,
      leapMonth: !query.leapMonth,
      startYear: query.year,
    });
  }

  $effect(() => {
    // Any valid date wants the tables now, not just a lunar one: the conversion
    // button reads them too.
    if (query.kind !== "date" || anniversaries.lunarReady) return;
    void anniversaries.ensureLunar();
  });

  $effect(() => {
    if (ui.focusField === "anniversary-title") {
      titleEl?.focus();
      titleEl?.select();
    }
  });

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeAnniversaryDrill();
      return;
    }
    if (event.isComposing || composing) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "l") {
      event.preventDefault();
      convertToLunar();
      return;
    }
    // Guarded, because `toggleLeap` would happily mark any month as the leap one
    // and leave the form warning that the year has no such month.
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r" && resolved?.leapMonth) {
      event.preventDefault();
      toggleLeap();
      return;
    }
    if (event.key === "Tab") {
      // Tab moves between the two fields instead of leaving the form.
      event.preventDefault();
      event.stopPropagation();
      if (event.currentTarget === titleEl) dateEl?.focus();
      else titleEl?.focus();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void anniversaries.saveDraft();
    }
  }
</script>

{#if draft}
  <!-- The form is the content column and the footer is its sibling, the way every
       other panel is built: the shared footer brings its own hairline and padding,
       which is what the hand-rolled row here used to be missing. -->
  <div class="flex min-h-0 flex-1 flex-col">
    <form
      class="flex min-h-0 flex-1 flex-col gap-2 px-3 pt-1"
      onsubmit={(event) => {
        event.preventDefault();
        void anniversaries.saveDraft();
      }}
    >
      <p class="px-1 text-[12px] leading-[1.4] text-ink-subtle">
        {anniversaries.editingId ? i18n.t("anniversary.editTitle") : i18n.t("anniversary.addTitle")}
      </p>

      <label class="flex items-center rounded-md bg-surface-1 px-3 py-2">
        <span class="sr-only">{i18n.t("anniversary.name")}</span>
        <input
          bind:this={titleEl}
          bind:value={draft.title}
          class="w-full bg-transparent text-[14px] leading-5 text-ink outline-none placeholder:text-ink-tertiary"
          placeholder={i18n.t("anniversary.namePlaceholder")}
          maxlength={60}
          autocomplete="off"
          spellcheck="false"
          onfocus={() => (ui.focusField = "anniversary-title")}
          onkeydown={onKeydown}
          oncompositionstart={() => (composing = true)}
          oncompositionend={() => (composing = false)}
        />
      </label>

      <!-- One field carries the date, the calendar, and the start year: `n1001`
           is lunar Oct 1, `19900515` is solar May 15 first marked in 1990. -->
      <div class="flex items-center gap-2">
        <label class="flex min-w-0 flex-1 items-center gap-3 rounded-md bg-surface-1 px-3 py-2">
          <span class="shrink-0 text-[12px] leading-[1.4] text-ink-subtle">{i18n.t("anniversary.date")}</span>
          <input
            bind:this={dateEl}
            bind:value={draft.dateText}
            class="min-w-0 flex-1 bg-transparent font-sans text-[14px] leading-5 text-ink outline-none placeholder:text-ink-tertiary tabular-nums"
            placeholder={i18n.t("anniversary.datePlaceholder")}
            autocomplete="off"
            spellcheck="false"
            onfocus={() => (ui.focusField = "anniversary-date")}
            onkeydown={onKeydown}
            oncompositionstart={() => (composing = true)}
            oncompositionend={() => (composing = false)}
          />
        </label>
        <!-- Offered only while there is something to convert: pressing it turns
             the field lunar, and a lunar date has nothing left to convert to. -->
        {#if lunarText}
          <button
            type="button"
            class="pressable flex h-9 shrink-0 items-center rounded-md bg-surface-1 px-2.5 text-[12px] leading-[1.4] text-primary hover:text-primary-hover active:scale-[0.96]"
            onclick={convertToLunar}
          >
            {i18n.t("anniversary.toLunar")}
          </button>
        {/if}
      </div>

      {#if resolved}
        <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-1">
          <span class="text-[13px] leading-5 text-ink">{resolved.label}</span>
          <span class="text-[12px] leading-[1.4] text-ink-subtle">{resolved.calendar}</span>
          {#if resolved.year}
            <span class="text-[12px] leading-[1.4] text-ink-subtle">
              {i18n.t("anniversary.startsFrom", { year: resolved.year })}
            </span>
          {/if}
        </div>
        {#if resolved.leapMissing && resolved.year !== null}
          <p class="px-1 text-[12px] leading-[1.4] text-ink-tertiary">
            {i18n.t("anniversary.leapMissing", { year: resolved.year })}
          </p>
        {/if}
        <!-- The leap question, asked only for the month it applies to, and
             answered by pressing rather than by editing the date text. -->
        {#if resolved.leapMonth}
          <button
            type="button"
            aria-pressed={resolved.leap}
            class="pressable flex items-center gap-2 self-start rounded-md px-1 py-1 text-[12px] leading-[1.4] {resolved.leap
              ? 'text-primary hover:text-primary-hover'
              : 'text-ink-subtle hover:text-ink'} active:scale-[0.96]"
            onclick={toggleLeap}
          >
            <span
              class="flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-hairline bg-surface-1"
              aria-hidden="true"
            >
              {#if resolved.leap}
                <Check class="size-3 text-primary" strokeWidth={2} fill="currentColor" />
              {/if}
            </span>
            <span>{i18n.t("anniversary.leapToggle", { month: resolved.leapMonth })}</span>
          </button>
        {/if}
      {:else}
        <p class="px-1 text-[12px] leading-[1.4] text-ink-tertiary">{i18n.t("anniversary.dateHint")}</p>
      {/if}
    </form>

    <PanelFooter shortcuts={footerShortcuts}>
      <div class="flex justify-end">
        <button
          type="button"
          class="pressable flex h-8 items-center rounded-md px-2 text-[12px] leading-[1.4] {canSave
            ? 'text-primary hover:text-primary-hover'
            : 'text-ink-tertiary'}"
          disabled={!canSave}
          onclick={() => void anniversaries.saveDraft()}
        >
          {i18n.t("anniversary.save")}
        </button>
      </div>
    </PanelFooter>
  </div>
{/if}
