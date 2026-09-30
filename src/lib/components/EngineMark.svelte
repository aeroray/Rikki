<script lang="ts">
  import { engineMark } from "$lib/commands/web/brands";
  import { Search } from "@lucide/svelte";

  let { engineId }: { engineId: string | null } = $props();

  // An engine with no mark — a custom one, which is a URL the user typed —
  // leaves the field looking the way it always has.
  const mark = $derived(engineId ? engineMark(engineId) : undefined);
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
  <Search class="size-4 shrink-0 text-ink-subtle" strokeWidth={1.5} aria-hidden="true" />
{/if}
