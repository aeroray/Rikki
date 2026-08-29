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
  class="flex aspect-square items-center justify-center rounded-md border-2 text-[28px] leading-none transition-[background-color,border-color,transform] duration-150 ease-out active:scale-[0.96] {selected
    ? 'border-primary-focus/50 bg-surface-2'
    : 'border-transparent hover:bg-surface-2/70'}"
  onclick={onselect}
>
  {native}
</button>
