<script lang="ts">
  /**
   * One keyboard shortcut rendered as a key chip plus its action.
   *
   * Extracted so the pinned `PanelFooter` and the sub-screens that carry their
   * own bottom row (`AnniversaryCreate`, `SnippetCreate`, `EngineCreate`,
   * `TranslateSettings`, `HotkeyRecorder`) render shortcuts the same way. Those
   * screens used to spell the same keys out as prose, which is how "Ctrl+Enter
   * 保存 · Esc 取消" ended up written four different ways.
   */
  let { keys, label }: { keys: string; label: string } = $props();
</script>

<span class="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
  <kbd
    class="rounded bg-surface-2 px-1.5 py-[3px] font-sans text-[10px] leading-none text-ink-muted"
  >
    {keys}
  </kbd>
  <span class="text-[11px] leading-4 text-ink-subtle">{label}</span>
</span>
