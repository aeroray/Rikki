<script lang="ts">
  import EmojiCell from "$lib/commands/emoji/EmojiCell.svelte";
  import { EMOJI_GRID_COLS } from "$lib/commands/emoji/categories";
  import type { EmojiItem } from "$lib/commands/emoji/types";
  import { i18n } from "$lib/i18n";
  import { emojis } from "$lib/stores/emojis.svelte";

  let { items }: { items: EmojiItem[] } = $props();
</script>

<!-- The column count comes from EMOJI_GRID_COLS so the arrow-key row jumps in
     `emoji/actions.ts` can never drift away from the rendered grid. -->
<div
  class="grid gap-1"
  style="grid-template-columns: repeat({EMOJI_GRID_COLS}, minmax(0, 1fr))"
  role="listbox"
  aria-label={i18n.t("emoji.grid")}
>
  {#each items as item, index (item.id)}
    <EmojiCell
      id="emoji-{item.id}"
      native={item.native}
      name={item.name}
      selected={index === emojis.selectedIndex}
      onselect={() => {
        emojis.selectedIndex = index;
        void emojis.copy(item.native);
      }}
    />
  {/each}
</div>
