<script lang="ts">
  /**
   * One keyboard shortcut rendered as a key chip plus its action.
   *
   * Extracted so the pinned `PanelFooter` and the sub-screens that carry their
   * own bottom row (`AnniversaryCreate`, `SnippetCreate`, `EngineCreate`,
   * `HotkeyRecorder`) render shortcuts the same way. Those screens used to spell
   * the same keys out as prose, which is how "Ctrl+Enter 保存 · Esc 取消" ended
   * up written four different ways.
   *
   * `tone` exists for the one place a chip sits on a coloured button rather than
   * on a panel: the confirm button of a destructive dialog, where a neutral chip
   * would read as a hole in the button. The cap takes `surface-1`, the colour of
   * the card behind the button, so it reads as an inset key in both themes — and
   * so the 10px key name keeps its contrast, which a second danger tint on top
   * of the first would have cost it.
   */
  let {
    keys,
    label,
    tone = "neutral",
  }: { keys: string; label: string; tone?: "neutral" | "danger" } = $props();
</script>

<span class="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
  <kbd
    class="rounded px-1.5 py-[3px] font-sans text-[10px] leading-none {tone === "danger"
      ? 'bg-surface-1 text-danger'
      : 'bg-surface-2 text-ink-muted'}"
  >
    {keys}
  </kbd>
  <span class="text-[11px] leading-4 {tone === 'danger' ? 'text-danger' : 'text-ink-subtle'}">
    {label}
  </span>
</span>
