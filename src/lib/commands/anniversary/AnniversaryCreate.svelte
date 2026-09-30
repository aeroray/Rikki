<script lang="ts">
  import { closeAnniversaryDrill } from "$lib/commands/anniversary/actions";
  import { lunarLeapMonth, parseDateQuery } from "$lib/commands/anniversary/dates";
  import { recurrenceLabel } from "$lib/commands/anniversary/format";
  import { anniversaries } from "$lib/stores/anniversaries.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { i18n } from "$lib/i18n";
  import KeyChip from "$lib/components/KeyChip.svelte";

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
      // Explained when the date is not a leap month but the year does repeat one.
      leapNote:
        lunar && query.year !== null && !leap && yearLeap > 0
          ? i18n.t("anniversary.leapNote", { month: yearLeap })
          : null,
      // Warn when the leap month was asked for but the year has none; the
      // occurrence then falls back to the regular month.
      leapMissing: lunar && leap && query.year !== null && yearLeap === 0,
    };
  });

  $effect(() => {
    if (query.kind === "date" && query.calendar === "lunar" && !anniversaries.lunarReady) {
      void anniversaries.ensureLunar();
    }
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
  <form
    class="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-3 pt-1"
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
    <label class="flex items-center gap-3 rounded-md bg-surface-1 px-3 py-2">
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
      {:else if resolved.leap}
        <p class="px-1 text-[12px] leading-[1.4] text-ink-subtle">{i18n.t("anniversary.leapDetected")}</p>
      {:else if resolved.leapNote}
        <p class="px-1 text-[12px] leading-[1.4] text-ink-tertiary">{resolved.leapNote}</p>
      {/if}
    {:else}
      <p class="px-1 text-[12px] leading-[1.4] text-ink-tertiary">{i18n.t("anniversary.dateHint")}</p>
    {/if}

    <div class="mt-auto flex items-center justify-between gap-2 px-1">
      <span class="flex items-center gap-3">
        <KeyChip keys="Ctrl+Enter" label={i18n.t("key.save")} />
        <KeyChip keys="Esc" label={i18n.t("key.back")} />
      </span>
      <button
        type="submit"
        class="pressable flex h-10 items-center rounded-md px-2 text-[12px] leading-[1.4] {canSave
          ? 'text-primary hover:text-primary-hover'
          : 'text-ink-tertiary'}"
        disabled={!canSave}
      >
        {i18n.t("anniversary.save")}
      </button>
    </div>
  </form>
{/if}
