<script lang="ts">
  import { i18n } from "$lib/i18n";
  import type { SettingItem as SettingItemModel } from "$lib/stores/settings.svelte";
  import { commandIcon } from "$lib/components/icons";
  import { LoaderCircle } from "@lucide/svelte";

  let {
    id,
    title,
    value,
    icon,
    selected,
    onselect,
    current = true,
    busy = false,
  }: {
    /** The `aria-activedescendant` target, built from the item id. */
    id: string;
    title: string;
    value: string;
    /** The list's own union rather than a second copy of it: the two had already
     * drifted apart once, which is how an icon nothing could reach stayed here. */
    icon: SettingItemModel["icon"];
    selected: boolean;
    onselect: () => void;
    current?: boolean;
    /**
     * True while the row's own action is still running.
     *
     * The glyph becomes a spinner, because a row whose only sign of life is its
     * text is a row the user cannot tell from one whose key press never landed.
     */
    busy?: boolean;
  } = $props();

  const Icon = $derived(commandIcon(icon));
  let row: HTMLButtonElement | undefined = $state();

  $effect(() => {
    if (selected) row?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
</script>

<!-- The id is what `aria-activedescendant` names while the arrows walk the list.
     It comes from the item id, not the title: the title is unique today but
     changes with the interface language, so an id built from it would move. -->
<button
  bind:this={row}
  type="button"
  {id}
  role="option"
  aria-selected={selected}
  class="row-hit flex w-full items-center gap-2 px-4 py-3 text-left active:scale-[0.96]"
  onclick={onselect}
>
  <span class="flex size-8 shrink-0 items-center justify-center rounded-sm bg-surface-1 text-ink-muted">
    {#if busy}
      <!-- Replaced rather than decorated: a spinner beside a refresh arrow is two
           glyphs saying the same thing at different speeds. -->
      <LoaderCircle
        class="size-4 animate-spin motion-reduce:animate-none"
        strokeWidth={1.5}
        aria-hidden="true"
      />
    {:else}
      <Icon class="size-4" strokeWidth={1.5} aria-hidden="true" />
    {/if}
  </span>
  <span class="min-w-0 flex-1">
    <span class="block truncate text-[14px] font-medium leading-[1.45] text-ink">{title}</span>
        <span class="block truncate text-[12px] font-normal leading-[1.45] text-ink-subtle">{current ? i18n.t("settings.current", { value }) : value}</span>
  </span>
</button>
