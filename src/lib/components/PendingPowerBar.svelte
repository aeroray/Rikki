<script lang="ts">
  import KeyChip from "$lib/components/KeyChip.svelte";
  import { primaryShortcut } from "$lib/commands/settings/engines";
  import { describeDelay } from "$lib/commands/sys/schedule";
  import { i18n } from "$lib/i18n";
  import { power } from "$lib/stores/power.svelte";
  import { Power } from "@lucide/svelte";

  /**
   * The countdown bar, shown while a shutdown or restart is pending.
   *
   * Its own component because it has to appear in two places that do not share a
   * footer: the panels, which render `PanelFooter`, and the root list, which does
   * not. A timer set an hour ago has to be visible from wherever the user happens
   * to be — and the root list is where they usually are.
   */
  const when = $derived(
    (() => {
      const { key, params } = describeDelay(power.pending?.secondsLeft ?? 0);
      return i18n.t(key, params);
    })(),
  );
</script>

{#if power.pending}
  <div class="flex min-h-8 shrink-0 items-center gap-3 border-t border-hairline px-3">
    <ul class="flex min-w-0 shrink items-center gap-x-3 overflow-hidden">
      <li class="flex min-w-0 items-center gap-1.5">
        <Power class="size-4 shrink-0 text-danger" strokeWidth={1.5} aria-hidden="true" />
        <span class="min-w-0 truncate text-[11px] leading-4 text-ink-subtle">
          {i18n.t("power.pending", {
            action:
              power.pending.action === "restart"
                ? i18n.t("sys.reboot")
                : i18n.t("sys.shutdown"),
            when,
          })}
        </span>
      </li>
      <li class="shrink-0">
        <KeyChip keys={primaryShortcut("Z")} label={i18n.t("power.cancelHint")} />
      </li>
    </ul>
    <!-- The mouse's way in, as everywhere else in the chrome. -->
    <button
      type="button"
      class="pressable ml-auto shrink-0 rounded px-1 text-[11px] leading-4 text-primary hover:text-primary-hover active:scale-[0.96]"
      onclick={() => void power.cancel()}
    >
      {i18n.t("power.cancelHint")}
    </button>
  </div>
{/if}
