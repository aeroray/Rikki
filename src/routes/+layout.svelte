<script lang="ts">
  import "../app.css";
  import { settings } from "$lib/stores/settings.svelte";

  let { children } = $props();

  $effect(() => {
    document.documentElement.dataset.theme = settings.theme;
  });
</script>

{@render children()}
