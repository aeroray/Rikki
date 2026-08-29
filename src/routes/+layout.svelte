<script lang="ts">
  import "../app.css";
  import { i18n } from "$lib/i18n";
  import { settings } from "$lib/stores/settings.svelte";

  let { children } = $props();

  $effect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.lang = i18n.locale;
  });
</script>

{@render children()}
