<script lang="ts">
  import { i18n } from "$lib/i18n";
  import { clipboard } from "$lib/stores/clipboard.svelte";
  import { scale } from "svelte/transition";

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

  function cancel() {
    clipboard.closeConfirm();
  }

  function ok() {
    clipboard.confirmAction();
  }
</script>

{#if confirm}
  <div
    class="absolute inset-0 z-20 flex items-center justify-center"
    role="dialog"
    aria-modal="true"
    aria-labelledby="clip-confirm-title"
    tabindex="-1"
    in:scale={{ duration: reduceMotion ? 0 : 150, start: 0.96 }}
    out:scale={{ duration: reduceMotion ? 0 : 100, start: 0.96 }}
  >
    <button
      type="button"
      class="absolute inset-0 bg-black/55 backdrop-blur-xl"
      aria-label={i18n.t("clip.cleanupCancel")}
      onclick={cancel}
    ></button>
    <div
      class="relative z-10 mx-3 w-[min(100%-24px,20rem)] rounded-md bg-surface-1 p-4 outline outline-1 outline-hairline"
    >
      {#if confirm.kind === "expire"}
        <h2 id="clip-confirm-title" class="text-[14px] font-medium leading-5 text-ink">
          {i18n.t("clip.cleanupTitle")}
        </h2>
        <p class="mt-3 text-[13px] leading-5 text-ink-muted">{i18n.t("clip.cleanupIntro")}</p>
        <ul class="mt-2 flex flex-col gap-1 text-[13px] leading-5 text-ink tabular-nums">
          <li>{i18n.t("clip.cleanupTexts", { count: confirm.texts, days: confirm.days })}</li>
          <li>{i18n.t("clip.cleanupImages", { count: confirm.images })}</li>
        </ul>
        <p class="mt-2 text-[12px] leading-[1.4] text-ink-subtle">{i18n.t("clip.cleanupPinned")}</p>
      {:else}
        <h2 id="clip-confirm-title" class="text-[14px] font-medium leading-5 text-ink">
          {i18n.t("clip.clearTitle")}
        </h2>
        <p class="mt-3 text-[13px] leading-5 text-ink-muted">
          {i18n.t("clip.clearBody", { count: confirm.count })}
        </p>
      {/if}
      <div class="mt-4 flex justify-end gap-2">
        <button
          type="button"
          class="flex h-10 items-center rounded-md px-3 text-[13px] leading-5 text-ink-subtle transition-colors duration-150 ease-out hover:text-ink active:scale-[0.96]"
          onclick={cancel}
        >
          {i18n.t("clip.cleanupCancel")}
        </button>
        <button
          type="button"
          class="flex h-10 items-center rounded-md bg-surface-2 px-3 text-[13px] leading-5 text-ink outline outline-1 outline-hairline transition-colors duration-150 ease-out enabled:hover:bg-surface-1 enabled:active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!canConfirm}
          onclick={ok}
        >
          {confirm.kind === "expire" ? i18n.t("clip.cleanupConfirm") : i18n.t("clip.clearConfirm")}
        </button>
      </div>
    </div>
  </div>
{/if}
