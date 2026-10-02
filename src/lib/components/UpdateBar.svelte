<script lang="ts">
  import KeyChip from "$lib/components/KeyChip.svelte";
  import { primaryShortcut } from "$lib/commands/settings/engines";
  import { i18n } from "$lib/i18n";
  import { update } from "$lib/stores/update.svelte";
  import { ArrowUpCircle, X } from "@lucide/svelte";

  /**
   * The "a new version is waiting" bar.
   *
   * Its own component for the same reason `PendingPowerBar` is: it has to appear
   * where there is no `PanelFooter` at all — the empty state and the root list,
   * which are exactly where the user arrives when they open the palette. A
   * release found while the app was starting would otherwise be invisible until
   * something was typed, which is the opposite of being told about it.
   *
   * It stacks *below* the countdown bar rather than replacing it. A pending
   * shutdown outranks an update — the machine is about to close everything the
   * user has open, and the only useful thing to offer is a way to stop it — but
   * the two are not alternatives. An update is still worth knowing about, and
   * hiding it until the timer fires would be the one case where the user could
   * not act on it in time.
   */
</script>

{#if update.available}
  <div class="flex min-h-8 shrink-0 items-center gap-3 border-t border-hairline px-3">
    <!-- Same shape as every other footer: what the keyboard can do on the left,
         what the mouse can do on the right. -->
    <ul class="flex min-w-0 shrink items-center gap-x-3 overflow-hidden">
      <li class="flex min-w-0 items-center gap-1.5">
        <ArrowUpCircle class="size-4 shrink-0 text-success" strokeWidth={1.5} aria-hidden="true" />
        <span class="min-w-0 truncate text-[11px] leading-4 text-ink-subtle">
          {i18n.t("update.available", { version: update.available })}
        </span>
      </li>
      <li class="shrink-0">
        <KeyChip keys={primaryShortcut("U")} label={i18n.t("update.install")} />
      </li>
    </ul>
    <!-- The mouse's way in. A plain press, with no confirmation: reaching for
         either the shortcut or this button is already the answer. -->
    <button
      type="button"
      class="pressable ml-auto shrink-0 rounded px-1 text-[11px] leading-4 text-primary hover:text-primary-hover active:scale-[0.96]"
      onclick={() => void update.installAvailable()}
    >
      {i18n.t("update.install")}
    </button>
    <!-- Closing is not refusing. The release is still held, so the settings row
         finds it on purpose and offers it through the usual confirmation; all
         that stops is this bar announcing this one version. A newer release is
         a different string and is announced as usual. -->
    <button
      type="button"
      class="pressable grid size-6 shrink-0 place-items-center rounded text-ink-subtle hover:text-ink active:scale-[0.96]"
      aria-label={i18n.t("update.dismiss")}
      title={i18n.t("update.dismiss")}
      onclick={() => void update.dismiss()}
    >
      <X class="size-3.5" strokeWidth={1.5} aria-hidden="true" />
    </button>
  </div>
{/if}
