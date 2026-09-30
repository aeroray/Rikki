<script lang="ts">
  import type { Command } from "$lib/commands/types";
  import { commandDescription, commandTitle } from "$lib/i18n/command";
  import { i18n } from "$lib/i18n";
  import { Binary, Braces, Calculator, CalendarDays, CalendarHeart, Clipboard, Clock, Droplet, FileText, Globe, Languages, ListTodo, Lock, LogOut, Moon, Power, QrCode, RotateCw, ScanQrCode, Search, Settings, Smile } from "@lucide/svelte";

  let { command, selected, onselect, optionId, staggerIndex }: { command: Command; selected: boolean; onselect: () => void; optionId?: string; staggerIndex?: number } =
    $props();

  const icons = {
    Binary,
    Braces,
    Calculator,
    CalendarDays,
    CalendarHeart,
    Clipboard,
    Clock,
    Droplet,
    FileText,
    Globe,
    Languages,
    ListTodo,
    Lock,
    LogOut,
    Moon,
    Power,
    QrCode,
    RotateCw,
    ScanQrCode,
    Search,
    Settings,
    Smile,
  };

  const Icon = $derived(icons[command.icon as keyof typeof icons] ?? Search);
  let row: HTMLButtonElement | undefined = $state();

  $effect(() => {
    if (selected) row?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
</script>

<button
  bind:this={row}
  id={optionId ?? `command-${command.id}`}
  type="button"
  role="option"
  aria-selected={selected}
  class="row-hit flex w-full items-center gap-2 px-4 py-3 text-left active:scale-[0.96] {staggerIndex == null
    ? ''
    : 'row-fade'}"
  style={staggerIndex == null ? undefined : `animation-delay: ${Math.min(staggerIndex, 12) * 30}ms`}
  onclick={onselect}
>
  <span class="flex size-8 shrink-0 items-center justify-center rounded-sm bg-surface-1 text-ink-muted">
    <Icon class="size-4" strokeWidth={1.5} aria-hidden="true" />
  </span>
  <span class="min-w-0 flex-1">
    <span class="block truncate text-[14px] font-medium leading-[1.45] text-ink">{commandTitle(command, i18n.locale)}</span>
    <span class="block truncate text-[12px] font-normal leading-[1.45] text-ink-subtle">{commandDescription(command, i18n.locale)}</span>
  </span>
  <kbd class="rounded bg-surface-2 px-1.5 py-0.5 font-sans text-[12px] font-normal text-ink-tertiary">
    {command.prefix}
  </kbd>
</button>
