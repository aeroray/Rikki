<script lang="ts">
  /**
   * The second confirmation for a destructive command.
   *
   * `shutdown`, `reboot` and `logout` cannot be undone, and the palette is a
   * launcher people drive quickly from muscle memory, so the prefix alone is not
   * enough of a guard. Enter arms the action and a second Enter carries it out;
   * Esc or clicking away cancels.
   */
  import KeyChip from "$lib/components/KeyChip.svelte";
  import { i18n } from "$lib/i18n";
  import { ui } from "$lib/stores/ui.svelte";
  import { fade, scale } from "svelte/transition";

  const confirm = $derived(ui.pendingConfirm);

  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
</script>

{#if confirm}
  <div
    class="absolute inset-0 z-40 flex items-center justify-center"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="action-confirm-title"
  >
    <button
      type="button"
      class="absolute inset-0 bg-black/55 backdrop-blur-xl"
      aria-label={i18n.t("key.cancel")}
      onclick={() => ui.cancelConfirm()}
      in:fade={{ duration: reduceMotion ? 0 : 150 }}
      out:fade={{ duration: reduceMotion ? 0 : 100 }}
    ></button>
    <div
      class="relative z-10 mx-3 w-[min(100%-24px,20rem)] rounded-lg bg-surface-1 p-4 outline outline-1 outline-hairline"
      in:scale={{ duration: reduceMotion ? 0 : 150, start: 0.95 }}
      out:scale={{ duration: reduceMotion ? 0 : 100, start: 0.95 }}
    >
      <h2 id="action-confirm-title" class="text-balance text-[14px] font-medium leading-5 text-ink">
        {i18n.t("confirm.title", { action: confirm.action })}
      </h2>
      <p class="mt-2 text-pretty text-[13px] leading-5 text-ink-muted">{confirm.body}</p>
      <!-- The key hint lives inside the button rather than in a separate row
           beside it: the same two words twice was both redundant and, in
           English, wider than the card. -->
      <div class="mt-4 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          class="pressable flex h-10 items-center rounded-sm px-3 hover:bg-surface-2 active:scale-[0.96]"
          onclick={() => ui.cancelConfirm()}
        >
          <KeyChip keys="Esc" label={i18n.t("key.cancel")} />
        </button>
        <button
          type="button"
          class="pressable flex h-10 items-center rounded-sm bg-surface-2 px-3 outline outline-1 outline-hairline hover:bg-surface-1 active:scale-[0.96]"
          onclick={() => ui.runConfirm()}
        >
          <KeyChip keys="Enter" label={i18n.t("key.confirm")} />
        </button>
      </div>
    </div>
  </div>
{/if}
