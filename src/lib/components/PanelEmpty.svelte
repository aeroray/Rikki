<script lang="ts">
  import type { Component, Snippet } from "svelte";

  /**
   * The empty state of a command panel, in one place.
   *
   * A hint alone, vertically centred in a tall empty column, reads as something
   * that failed to load; an icon above a centred block says the space is meant
   * to be empty. Eleven panels had their own version of that idea — a bare
   * `ink-tertiary` line, a bold title, an icon tile — so the size, colour and
   * measure are settled here instead of drifting panel by panel.
   *
   * `title` is the heading for the panels whose empty state explains itself in
   * two lines; `hint` is the single line, or the second line under it. Panels
   * with both keep both. The icon is the command's own.
   *
   * `class` carries the layout the panel owns, because how much room the state
   * takes is not a property of the style: `flex-1` where it has the column to
   * itself, nothing where a second section (a history list, the recent colours)
   * shares the same column.
   */
  let {
    icon: Icon,
    title = "",
    hint = "",
    class: className = "",
    children,
  }: {
    icon: Component<{ class?: string; strokeWidth?: number; "aria-hidden"?: "true" | "false" | boolean }>;
    title?: string;
    hint?: string;
    class?: string;
    /** Anything else the state needs: a create button, a list of examples. */
    children?: Snippet;
  } = $props();
</script>

<div class="flex flex-col items-center justify-center gap-2 px-1 text-center {className}">
  <Icon class="size-5 text-ink-tertiary" strokeWidth={1.5} aria-hidden="true" />
  <div class="flex flex-col items-center gap-1">
    {#if title}
      <p class="max-w-[36ch] text-pretty text-[13px] font-medium leading-5 text-ink">{title}</p>
    {/if}
    {#if hint}
      <p class="max-w-[36ch] text-pretty text-[13px] leading-5 text-ink-subtle">{hint}</p>
    {/if}
    {#if children}
      {@render children()}
    {/if}
  </div>
</div>
