<script lang="ts">
  import { scanQrDecode, scanQrFromBlob } from "$lib/commands/qrcode/actions";
  import { payloadKind } from "$lib/commands/qrcode/generate";
  import ScrollArea from "$lib/components/ScrollArea.svelte";
  import { i18n } from "$lib/i18n";
  import { clipboard } from "$lib/stores/clipboard.svelte";
  import { qrdecode } from "$lib/stores/qrdecode.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { onDestroy } from "svelte";

  const kind = $derived(qrdecode.data ? payloadKind(qrdecode.data) : "text");
  const kindLabel = $derived(
    kind === "url" ? i18n.t("qr.kind.url") : kind === "json" ? i18n.t("qr.kind.json") : i18n.t("qr.kind.text"),
  );
  const latestImage = $derived(clipboard.entries.find((entry) => entry.type === "image")?.id ?? "");

  $effect(() => {
    if (ui.view !== "qrdecode") return;
    const key = `${ui.showNonce}:${latestImage}`;
    if (qrdecode.scannedKey === key) return;
    qrdecode.scannedKey = key;
    void scanQrDecode();
  });

  onDestroy(() => {
    qrdecode.reset();
  });

  function onPaste(event: ClipboardEvent) {
    const items = event.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (!item.type.startsWith("image/")) continue;
      const file = item.getAsFile();
      if (!file) continue;
      event.preventDefault();
      void scanQrFromBlob(file);
      return;
    }
  }
</script>

<svelte:window onpaste={onPaste} />

<div class="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-1">
  {#if qrdecode.loading}
    <p class="px-1 text-[14px] leading-5 text-ink-tertiary">{i18n.t("qr.decodeLoading")}</p>
  {:else if qrdecode.data}
    <p class="px-1 text-[12px] leading-[1.4] text-ink-subtle">{i18n.t("qr.decodeOk")}</p>
    <ScrollArea class="mt-3 min-h-0 flex-1" viewportClass="flex flex-col">
      <p class="px-1 text-[16px] leading-6 tracking-[-0.05px] text-pretty break-all text-ink">
        {qrdecode.data}
      </p>
    </ScrollArea>
    <p class="palette-hint">
      {kindLabel} · {i18n.t("qr.decodeCopy")}
    </p>
  {:else if qrdecode.reason === "empty"}
    <p class="px-1 text-[14px] leading-5 text-ink">{i18n.t("qr.decodeEmptyTitle")}</p>
    <p class="mt-2 px-1 text-pretty text-[13px] leading-5 text-ink-subtle">{i18n.t("qr.decodeEmptyBody")}</p>
  {:else}
    <p class="px-1 text-[14px] leading-5 text-ink">{i18n.t("qr.decodeNoneTitle")}</p>
    <p class="mt-2 px-1 text-pretty text-[13px] leading-5 text-ink-subtle">{i18n.t("qr.decodeNoneBody")}</p>
  {/if}
</div>
