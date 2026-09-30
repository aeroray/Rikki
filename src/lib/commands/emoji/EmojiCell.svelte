<script lang="ts">
  let {
    native,
    name,
    selected,
    onselect,
  }: {
    native: string;
    name: string;
    selected: boolean;
    onselect: () => void;
  } = $props();

  let cell: HTMLButtonElement | undefined = $state();

  $effect(() => {
    if (selected) cell?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
</script>

<!-- The id is what `aria-activedescendant` points at while the arrows walk the
     grid. A cell is handed the glyph and nothing else, and glyphs are unique in
     the dataset, so the glyph is what this cell and SearchBar both build it
     from. -->
<button
  bind:this={cell}
  type="button"
  id="emoji-{native}"
  role="option"
  aria-selected={selected}
  aria-label={name}
  title={name}
  class="row-hit flex aspect-square items-center justify-center text-[28px] leading-none active:scale-[0.96] {selected
    ? 'is-selected'
    : ''}"
  onclick={onselect}
>
  {native}
</button>
