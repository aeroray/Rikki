<script lang="ts">
  import { isMac } from "$lib/commands/settings/engines";
  import { settings } from "$lib/stores/settings.svelte";
  import { Keyboard } from "@lucide/svelte";
</script>

<div class="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
  <span class="flex size-10 items-center justify-center rounded-md bg-surface-1 text-ink-muted">
    <Keyboard class="size-4" strokeWidth={1.5} aria-hidden="true" />
  </span>
  <p class="mt-3 text-[14px] font-medium leading-5 text-ink">按下新的快捷键</p>
  <p class="mt-2 text-[13px] leading-5 text-ink-subtle">
    需包含 Ctrl、Alt 或 {isMac() ? "⌘" : "Win"}
  </p>
  <p class="mt-4 rounded-md bg-surface-1 px-3 py-2 text-[14px] leading-5 text-ink">
    当前：{settings.hotkeyLabel}
  </p>
  <p class="mt-3 text-[12px] leading-[1.4] text-ink-tertiary">
    {settings.notice ?? "Esc 取消"}
  </p>
</div>
