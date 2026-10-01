<script lang="ts">
  /**
   * Importing a backup from a path that is not in the app's folder.
   *
   * The field is the primary way in — a path from a chat message, a download, a
   * sync folder is one paste — and the native picker is offered beside it for
   * the case where there is no path to type. The line under the field describes
   * the file the moment it can be read, so the second Enter in the confirmation
   * is a decision about something the user has already seen.
   */
  import { closeSettingsDrill } from "$lib/commands/settings/actions";
  import { backupCounts, backupLabel } from "$lib/commands/settings/backup";
  import KeyChip from "$lib/components/KeyChip.svelte";
  import { i18n } from "$lib/i18n";
  import { settings } from "$lib/stores/settings.svelte";
  import { ui } from "$lib/stores/ui.svelte";

  let pathEl: HTMLInputElement | undefined = $state();
  let composing = $state(false);

  const preview = $derived(settings.importPreview);

  const message = $derived.by((): string => {
    if (!settings.importDraft?.path.trim()) return i18n.t("settings.backup.importHint");
    // Nothing while the read is in flight: the previous file's counts under a
    // path that no longer points at it would be worse than a blank line.
    if (!preview) return "";
    if (preview.kind === "bad") return i18n.t("settings.backup.fail");
    return `${backupCounts(preview.file.todos, preview.file.snippets)} · ${backupLabel(preview.file.exportedAt)}`;
  });

  $effect(() => {
    // Focus on arrival, and again once the confirmation dialog closes: that
    // dialog deliberately takes focus into itself, and the field it was opened
    // from is not handed it back by anything.
    if (ui.focusField !== "backup-path" || ui.pendingConfirm) return;
    pathEl?.focus();
    pathEl?.select();
  });

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeSettingsDrill();
      return;
    }
    if (event.isComposing || composing) return;
    if (event.key === "Enter") {
      event.preventDefault();
      void settings.submitImportDraft();
    }
  }
</script>

{#if settings.importDraft}
  <form
    class="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-3 pt-1"
    onsubmit={(event) => {
      event.preventDefault();
      void settings.submitImportDraft();
    }}
  >
    <p class="px-1 text-[12px] leading-[1.4] text-ink-subtle">
      {i18n.t("settings.backup.importTitle")}
    </p>
    <label class="flex items-center rounded-md bg-surface-1 px-3 py-2">
      <span class="sr-only">{i18n.t("settings.backup.pathLabel")}</span>
      <input
        bind:this={pathEl}
        bind:value={settings.importDraft.path}
        class="w-full bg-transparent text-[14px] leading-5 text-ink outline-none placeholder:text-ink-tertiary"
        placeholder={i18n.t("settings.backup.pathPlaceholder")}
        autocomplete="off"
        spellcheck="false"
        oninput={(event) => settings.previewImportPath(event.currentTarget.value)}
        onfocus={() => (ui.focusField = "backup-path")}
        onkeydown={onKeydown}
        oncompositionstart={() => (composing = true)}
        oncompositionend={() => (composing = false)}
      />
    </label>
    <p class="px-1 text-[12px] leading-[1.4] text-ink-tertiary" aria-live="polite">{message}</p>
    <!-- This screen carries its own bottom row rather than the panel's footer,
         the way the other sub-screens with their own chrome do. -->
    <div class="mt-auto flex items-center justify-between px-1">
      <span class="flex items-center gap-3">
        <KeyChip keys="Enter" label={i18n.t("settings.backup.keyImport")} />
        <KeyChip keys="Esc" label={i18n.t("key.cancel")} />
      </span>
      <button
        type="button"
        class="pressable flex h-10 items-center rounded-md px-2 text-[12px] leading-[1.4] text-ink-muted hover:text-ink active:scale-[0.96]"
        onclick={() => void settings.pickBackupFile()}
      >
        {i18n.t("settings.backup.chooseFile")}
      </button>
    </div>
  </form>
{/if}
