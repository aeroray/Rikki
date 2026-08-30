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

<button
  bind:this={cell}
  type="button"
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
