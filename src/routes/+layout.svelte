<script lang="ts">
  import "../app.css";
  import { i18n } from "$lib/i18n";
  import { settings } from "$lib/stores/settings.svelte";

  let { children } = $props();

  // The store resolves `system` against the OS, so this is the one place the
  // theme is painted, and it re-runs when either the preference or the OS
  // changes.
  $effect(() => {
    document.documentElement.dataset.theme = settings.resolvedTheme;
    document.documentElement.lang = i18n.locale;
  });
</script>

{@render children()}
