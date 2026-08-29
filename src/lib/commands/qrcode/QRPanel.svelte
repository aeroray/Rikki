<script lang="ts">
  import { generateQrSvg } from "$lib/commands/qrcode/generate";
  import { i18n } from "$lib/i18n";
  import { ui } from "$lib/stores/ui.svelte";

  const text = $derived(ui.commandRest.trim());
  let svg = $state("");
  let failed = $state(false);

  $effect(() => {
    const value = text;
    if (!value) {
      svg = "";
      failed = false;
      return;
    }
    let cancelled = false;
    failed = false;
    void generateQrSvg(value)
      .then((next) => {
        if (!cancelled) svg = next;
      })
      .catch(() => {
        if (!cancelled) {
          svg = "";
          failed = true;
        }
      });
    return () => {
      cancelled = true;
    };
  });
</script>

<div class="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-1">
  {#if svg}
    <div class="flex min-h-0 flex-1 flex-col items-center justify-center">
      <div class="qr-frame rounded-md bg-white p-2 outline outline-1 outline-hairline">
        {@html svg}
      </div>
      <p class="mt-3 max-w-full truncate px-1 text-[13px] leading-5 text-ink">{text}</p>
    </div>
    <p class="mt-2 px-1 text-[12px] leading-[1.4] text-ink-tertiary">{i18n.t("qr.copyHint")}</p>
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

<style>
  .qr-frame :global(svg) {
    display: block;
    width: 160px;
    height: 160px;
  }
</style>
