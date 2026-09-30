<script lang="ts">
  import { i18n } from "$lib/i18n";
  import { clipboard } from "$lib/stores/clipboard.svelte";
  import { fade, scale } from "svelte/transition";

  const confirm = $derived(clipboard.confirm);
  const canConfirm = $derived(
    confirm?.kind === "expire"
      ? confirm.texts > 0 || confirm.images > 0
      : confirm?.kind === "clear"
        ? confirm.count > 0
        : false,
  );

  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let card: HTMLDivElement | undefined = $state();

  /**
   * A modal dialog is not announced until focus is inside it, and the palette
   * keeps focus on the search input otherwise. The card takes focus rather than a
   * button, so Enter keeps meaning "the action" instead of "whatever is focused";
   * `SearchBar` hands focus back to the input when `clipboard.confirm` clears.
   */
  $effect(() => {
    if (confirm) card?.focus();
  });

  /**
   * Enter is caught here because focus is in the dialog, not in the search input
   * that normally routes it. A focused button already owns Enter, so those events
   * are left alone — acting on them twice would confirm twice, or confirm while
   * the user was aiming at Cancel.
   */
  function onKeydown(event: KeyboardEvent) {
    if (event.key !== "Enter") return;
    if ((event.target as HTMLElement | null)?.closest("button")) return;
    event.preventDefault();
    ok();
  }

  function cancel() {
    clipboard.closeConfirm();
  }

  function ok() {
    clipboard.confirmAction();
  }
</script>

{#if confirm}
  <!-- The overlay layer is the window's shape, and the backdrop paints that
       shape itself: `backdrop-filter` makes it a composited layer, so its
       rounded edge has to travel with the layer rather than rely on the shell's
       `overflow-hidden` above it. The wrapper carries the radius only so the
       backdrop's `rounded-[inherit]` has something to inherit. -->
  <div class="absolute inset-0 z-40 flex items-center justify-center rounded-[inherit]">
    <button
      type="button"
      class="absolute inset-0 rounded-[inherit] bg-black/55 backdrop-blur-xl"
      aria-label={i18n.t("clip.cleanupCancel")}
      onclick={cancel}
      in:fade={{ duration: reduceMotion ? 0 : 150 }}
      out:fade={{ duration: reduceMotion ? 0 : 100 }}
    ></button>
    <!-- The dialog role sits on the card, which is also the element that takes
         focus: that is the combination screen readers announce. The backdrop
         stays outside it, where `aria-modal` keeps it out of the way. -->
    <div
      bind:this={card}
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      aria-labelledby="clip-confirm-title"
      class="relative z-10 mx-3 w-[min(100%-24px,20rem)] rounded-lg bg-surface-1 p-4 outline outline-1 outline-hairline"
      in:scale={{ duration: reduceMotion ? 0 : 150, start: 0.95 }}
      out:scale={{ duration: reduceMotion ? 0 : 100, start: 0.95 }}
      onkeydown={onKeydown}
    >
      {#if confirm.kind === "expire"}
        <h2 id="clip-confirm-title" class="text-balance text-[14px] font-medium leading-5 text-ink">
          {i18n.t("clip.cleanupTitle")}
        </h2>
        <p class="mt-3 text-pretty text-[13px] leading-5 text-ink-muted">{i18n.t("clip.cleanupIntro")}</p>
        <ul class="mt-2 flex flex-col gap-1 text-[13px] leading-5 text-ink tabular-nums">
          <li>{i18n.t("clip.cleanupTexts", { count: confirm.texts, days: confirm.days })}</li>
          <li>{i18n.t("clip.cleanupImages", { count: confirm.images })}</li>
        </ul>
        <p class="mt-2 text-pretty text-[12px] leading-[1.4] text-ink-subtle">{i18n.t("clip.cleanupPinned")}</p>
      {:else}
        <h2 id="clip-confirm-title" class="text-balance text-[14px] font-medium leading-5 text-ink">
          {i18n.t("clip.clearTitle")}
        </h2>
        <p class="mt-3 text-pretty text-[13px] leading-5 text-ink-muted">
          {i18n.t("clip.clearBody", { count: confirm.count })}
        </p>
      {/if}
      <div class="mt-4 flex justify-end gap-2">
        <button
          type="button"
          class="pressable flex h-10 items-center rounded-sm px-3 text-[13px] leading-5 text-ink-subtle hover:text-ink active:scale-[0.96]"
          onclick={cancel}
        >
          {i18n.t("clip.cleanupCancel")}
        </button>
        <button
          type="button"
          class="pressable flex h-10 items-center rounded-sm bg-surface-2 px-3 text-[13px] leading-5 text-ink outline outline-1 outline-hairline enabled:hover:bg-surface-1 enabled:active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!canConfirm}
          onclick={ok}
        >
          {confirm.kind === "expire" ? i18n.t("clip.cleanupConfirm") : i18n.t("clip.clearConfirm")}
        </button>
      </div>
    </div>
  </div>
{/if}
