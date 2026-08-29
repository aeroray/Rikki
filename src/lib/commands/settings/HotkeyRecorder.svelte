<script lang="ts">
  import { isMac } from "$lib/commands/settings/engines";
  import { i18n } from "$lib/i18n";
  import { settings } from "$lib/stores/settings.svelte";
  import { Keyboard } from "@lucide/svelte";
</script>

<div class="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
  <span class="flex size-10 items-center justify-center rounded-md bg-surface-1 text-ink-muted">
    <Keyboard class="size-4" strokeWidth={1.5} aria-hidden="true" />
  </span>
  <p class="mt-3 text-[14px] font-medium leading-5 text-ink">{i18n.t("hotkey.prompt")}</p>
  <p class="mt-2 max-w-[20rem] text-pretty text-[13px] leading-5 text-ink-subtle">
    {i18n.t("hotkey.needModifier", { key: isMac() ? "⌘" : "Win" })}
  </p>
  <p class="mt-4 rounded-md bg-surface-1 px-3 py-2 text-[14px] leading-5 text-ink">
    {i18n.t("hotkey.current", { value: settings.hotkeyLabel })}
  </p>
  <p class="mt-3 text-[12px] leading-[1.4] text-ink-tertiary">
    {settings.notice ?? i18n.t("hotkey.esc")}
  </p>
</div>
