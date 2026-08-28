<script lang="ts">
  import EmojiCell from "$lib/commands/emoji/EmojiCell.svelte";
  import type { EmojiItem } from "$lib/commands/emoji/types";
  import { emojis } from "$lib/stores/emojis.svelte";

  let { items }: { items: EmojiItem[] } = $props();
</script>

<div class="grid grid-cols-12 gap-1" role="listbox" aria-label="Emoji">
  {#each items as item, index (item.id)}
    <EmojiCell
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
