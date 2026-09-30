<script lang="ts">
  import { generateQrSvg } from "$lib/commands/qrcode/generate";
  import PanelFooter, { type FooterShortcut } from "$lib/components/PanelFooter.svelte";
  import { i18n } from "$lib/i18n";
  import { ui } from "$lib/stores/ui.svelte";

  const text = $derived(ui.commandRest.trim());
  let svg = $state("");
  let failed = $state(false);
  let pending = $state(false);

  // Key glyphs are not translated: they name physical keys.
  const footerShortcuts = $derived.by((): FooterShortcut[] =>
    svg
      ? [
          { keys: "Enter", label: i18n.t("qr.keyCopySvg") },
          { keys: "Tab", label: i18n.t("qr.keySavePng") },
        ]
      : [],
  );

  $effect(() => {
    const value = text;
    if (!value) {
      svg = "";
      failed = false;
      pending = false;
      return;
    }
    let cancelled = false;
    pending = true;
    failed = false;
    void generateQrSvg(value)
      .then((next) => {
        if (!cancelled) {
          svg = next;
          pending = false;
        }
      })
      .catch(() => {
        if (!cancelled) {
          svg = "";
          failed = true;
          pending = false;
        }
      });
    return () => {
      cancelled = true;
    };
  });
</script>

<!-- The footer is a sibling of the content column, not inside it, so it stays
     pinned to the bottom and does not double up the panel's horizontal padding. -->
<div class="flex min-h-0 flex-1 flex-col">
  <div class="flex min-h-0 flex-1 flex-col px-3 pt-1">
    {#if svg}
      <div class="flex min-h-0 flex-1 flex-col items-center justify-center">
        <div class="qr-frame rounded-md bg-white p-2 outline outline-1 outline-hairline">
          {@html svg}
        </div>
        <p class="mt-3 max-w-full truncate px-1 text-[13px] leading-5 text-ink">{text}</p>
      </div>
    {:else if pending}
      <p class="px-1 text-[14px] leading-5 text-ink-tertiary">{i18n.t("qr.loading")}</p>
    {:else if failed}
      <p class="px-1 text-[14px] leading-5 text-ink-tertiary">{i18n.t("qr.invalid")}</p>
    {:else}
      <p class="px-1 text-[14px] leading-5 text-ink-tertiary">{i18n.t("qr.emptyHint")}</p>
      <p class="mt-3 px-1 font-sans text-[13px] leading-6 text-ink-subtle">
        <span class="block">qr https://example.com</span>
        <span class="block">qr WIFI:T:WPA;S:Rikki;P:secret;;</span>
      </p>
    {/if}
  </div>

  <PanelFooter shortcuts={footerShortcuts} />
</div>

<style>
  .qr-frame :global(svg) {
    display: block;
    width: 160px;
    height: 160px;
  }
</style>
