<script lang="ts">
  import { commandIcon } from "$lib/components/icons";
  import { engineMark } from "$lib/commands/web/brands";
  import { Search } from "@lucide/svelte";

  let {
    engineId,
    commandIconName,
  }: {
    /** The engine a web-search command hands its query to, if this is one. */
    engineId: string | null;
    /** The current command's own glyph name, if it has one. */
    commandIconName?: string;
  } = $props();

  // A search command shows the engine's own mark, which says more than a glyph:
  // it names the thing the query is about to be handed to. Everything else shows
  // its own glyph, so the field says where the keystroke is going — 设置 draws the
  // gear, 万年历 the calendar. A custom engine has no mark and falls through to
  // the glyph, and a bare field keeps the magnifier.
  const mark = $derived(engineId ? engineMark(engineId) : undefined);
  const Icon = $derived(commandIconName ? commandIcon(commandIconName) : Search);
</script>

{#if mark}
  <!--
    Every mark is a single path that fills with `currentColor`, so it takes the
    colour of the field rather than the brand's own. The body is a build-time
    constant from the icon package, never anything the user typed.
  -->
  <svg
    viewBox="0 0 {mark.width} {mark.height}"
    class="size-4 shrink-0 text-ink-subtle"
    aria-hidden="true"
  >
    {@html mark.body}
  </svg>
{:else}
  <Icon class="size-4 shrink-0 text-ink-subtle" strokeWidth={1.5} aria-hidden="true" />
{/if}
