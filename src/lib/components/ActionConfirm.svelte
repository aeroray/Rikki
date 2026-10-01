<script lang="ts">
  /**
   * The second confirmation for a destructive command.
   *
   * `shutdown`, `reboot` and `logout` cannot be undone, and the palette is a
   * launcher people drive quickly from muscle memory, so the prefix alone is not
   * enough of a guard. Enter arms the action and a second Enter carries it out;
   * Esc or clicking away cancels.
   *
   * Every caller of `requestConfirm` is irreversible — the three system actions,
   * deleting a custom engine, and importing a configuration over the current one
   * — so the dialog is drawn as a destructive one unconditionally: a warning
   * glyph beside the title and the confirm button in `danger`. Two signals
   * rather than one, because the colour alone is not a message to anyone who
   * cannot see it.
   */
  import KeyChip from "$lib/components/KeyChip.svelte";
  import { i18n } from "$lib/i18n";
  import { ui } from "$lib/stores/ui.svelte";
  import { TriangleAlert } from "@lucide/svelte";
  import { fade, scale } from "svelte/transition";

  const confirm = $derived(ui.pendingConfirm);
  let card: HTMLDivElement | undefined = $state();

  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /**
   * A modal alertdialog is not announced until focus is inside it, and the
   * palette keeps focus on the search input otherwise.
   *
   * Focus goes to the card rather than to a button on purpose: a focused button
   * would fire on Space as well as Enter, and this dialog is one keystroke away
   * from shutting the machine down. `SearchBar` hands focus back to the input
   * when `pendingConfirm` clears.
   */
  $effect(() => {
    if (confirm) card?.focus();
  });

  /**
   * Enter is caught here because focus is in the dialog, not in the search input
   * that normally routes it. A focused button inside the dialog already owns
   * Enter, so those events are left alone — acting on them twice would either run
   * the action twice or confirm while the user was aiming at Cancel.
   */
  function onKeydown(event: KeyboardEvent) {
    if (event.key !== "Enter") return;
    if ((event.target as HTMLElement | null)?.closest("button")) return;
    event.preventDefault();
    ui.runConfirm();
  }
</script>

{#if confirm}
  <!-- The overlay layer is the window's shape, and the backdrop paints that
       shape itself. The backdrop is a flat tint and not a `backdrop-blur`: the
       blur is a `backdrop-filter` layer, and at the rounded corner that layer is
       clipped less than the tint it sits under, so it smears the pale shell into
       the corner and leaves a white sliver along the arc. The wrapper carries the
       radius only so the backdrop's `rounded-[inherit]` has something to inherit. -->
  <div class="absolute inset-0 z-40 flex items-center justify-center rounded-[inherit]">
    <button
      type="button"
      class="absolute inset-0 rounded-[inherit] bg-black/55"
      aria-label={i18n.t("key.cancel")}
      onclick={() => ui.cancelConfirm()}
      in:fade={{ duration: reduceMotion ? 0 : 150 }}
      out:fade={{ duration: reduceMotion ? 0 : 100 }}
    ></button>
    <!-- The dialog role sits on the card, which is also the element that takes
         focus: that is the combination screen readers announce. The backdrop
         stays outside it, where `aria-modal` keeps it out of the way. -->
    <div
      bind:this={card}
      tabindex="-1"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="action-confirm-title"
      aria-describedby="action-confirm-body"
      class="relative z-10 mx-3 w-[min(100%-24px,20rem)] rounded-lg bg-surface-1 p-4 outline outline-1 outline-hairline [box-shadow:var(--dialog-shadow)]"
      in:scale={{ duration: reduceMotion ? 0 : 150, start: 0.95 }}
      out:scale={{ duration: reduceMotion ? 0 : 100, start: 0.95 }}
      onkeydown={onKeydown}
    >
      <div class="flex items-start gap-2">
        <TriangleAlert
          class="mt-0.5 size-4 shrink-0 text-danger"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <h2 id="action-confirm-title" class="text-balance text-[14px] font-medium leading-5 text-ink">
          {i18n.t("confirm.title", { action: confirm.action })}
        </h2>
      </div>
      <p id="action-confirm-body" class="mt-2 text-pretty text-[13px] leading-5 text-ink-muted">{confirm.body}</p>
      <!-- The key hint lives inside the button rather than in a separate row
           beside it: the same two words twice was both redundant and, in
           English, wider than the card. -->
      <div class="mt-4 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          class="pressable flex h-8 items-center rounded-sm px-2.5 hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-focus active:scale-[0.96]"
          onclick={() => ui.cancelConfirm()}
        >
          <KeyChip keys="Esc" label={i18n.t("key.cancel")} />
        </button>
        <button
          type="button"
          class="pressable flex h-8 items-center rounded-sm bg-danger/15 px-2.5 outline outline-1 outline-danger/30 hover:bg-danger/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-focus active:scale-[0.96]"
          onclick={() => ui.runConfirm()}
        >
          <KeyChip keys="Enter" label={i18n.t("key.confirm")} tone="danger" />
        </button>
      </div>
    </div>
  </div>
{/if}
