<script lang="ts">
  import type { Command } from "$lib/commands/types";
  import { commandDescription, commandTitle } from "$lib/i18n/command";
  import { i18n } from "$lib/i18n";
  import { Calculator, Clipboard, FileText, Globe, Languages, ListTodo, Lock, LogOut, Moon, Power, RotateCw, Search, Settings, Smile } from "@lucide/svelte";

  let { command, selected, onselect, optionId }: { command: Command; selected: boolean; onselect: () => void; optionId?: string } =
    $props();

  const icons = {
    Calculator,
    Clipboard,
    FileText,
    Globe,
    Languages,
    ListTodo,
    Lock,
    LogOut,
    Moon,
    Power,
    RotateCw,
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
  class="slide-in flex w-full items-center gap-3 rounded-md border-2 px-3 py-2.5 text-left transition-[background-color,border-color,transform] duration-150 ease-out active:scale-[0.96] {selected
    ? 'border-primary-focus/50 bg-surface-2'
    : 'border-transparent hover:bg-surface-2/70'}"
  onclick={onselect}
>
  <span class="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-1 text-ink-muted">
    <Icon class="size-4" strokeWidth={1.5} aria-hidden="true" />
  </span>
  <span class="min-w-0 flex-1">
    <span class="block truncate text-[14px] font-medium leading-5 text-ink">{commandTitle(command, i18n.locale)}</span>
    <span class="block truncate text-[12px] leading-[1.4] text-ink-subtle">{commandDescription(command, i18n.locale)}</span>
  </span>
  <kbd class="rounded-sm bg-canvas px-1.5 py-0.5 font-sans text-[12px] text-ink-tertiary">
    {command.prefix}
  </kbd>
</button>
