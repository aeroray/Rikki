<script lang="ts">
  let {
    id,
    native,
    name,
    selected,
    onselect,
  }: {
    /** The `aria-activedescendant` target, built from the item id. */
    id: string;
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
     grid. It comes from the item id rather than the glyph: the glyph happens to
     be unique in today's dataset, but the id is the stable key the grid already
     renders with. -->
<button
  bind:this={cell}
  type="button"
  {id}
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
