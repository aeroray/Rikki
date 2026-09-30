<script lang="ts">
  import { scanQrDecode, scanQrFromBlob } from "$lib/commands/qrcode/actions";
  import { payloadKind } from "$lib/commands/qrcode/generate";
  import PanelEmpty from "$lib/components/PanelEmpty.svelte";
  import PanelFooter, { type FooterShortcut } from "$lib/components/PanelFooter.svelte";
  import ScrollArea from "$lib/components/ScrollArea.svelte";
  import { i18n } from "$lib/i18n";
  import { clipboard } from "$lib/stores/clipboard.svelte";
  import { qrdecode } from "$lib/stores/qrdecode.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { ScanQrCode } from "@lucide/svelte";
  import { onDestroy } from "svelte";

  const kind = $derived(qrdecode.data ? payloadKind(qrdecode.data) : "text");
  const kindLabel = $derived(
    kind === "url" ? i18n.t("qr.kind.url") : kind === "json" ? i18n.t("qr.kind.json") : i18n.t("qr.kind.text"),
  );
  const latestImage = $derived(clipboard.entries.find((entry) => entry.type === "image")?.id ?? "");

  // Key glyphs are not translated: they name physical keys. The payload kind
  // used to sit on the hint line, so it becomes the footer's message.
  const footerShortcuts = $derived.by((): FooterShortcut[] =>
    qrdecode.data ? [{ keys: "Enter", label: i18n.t("qr.keyCopyContent") }] : [],
  );
  const footerMessage = $derived(qrdecode.data ? kindLabel : null);

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

<!-- The footer is a sibling of the content column, not inside it, so it stays
     pinned to the bottom and does not double up the panel's horizontal padding. -->
<div class="flex min-h-0 flex-1 flex-col">
  <div class="flex min-h-0 flex-1 flex-col px-3 pt-1">
    {#if qrdecode.loading}
      <p class="px-1 text-[14px] leading-5 text-ink-tertiary">{i18n.t("qr.decodeLoading")}</p>
    {:else if qrdecode.data}
      <p class="px-1 text-[12px] leading-[1.4] text-ink-subtle">{i18n.t("qr.decodeOk")}</p>
      <ScrollArea class="mt-3 min-h-0 flex-1" viewportClass="flex flex-col">
        <p class="px-1 text-[16px] leading-6 tracking-[-0.05px] text-pretty break-all text-ink">
          {qrdecode.data}
        </p>
      </ScrollArea>
    {:else if qrdecode.reason === "empty"}
      <PanelEmpty
        class="flex-1"
        icon={ScanQrCode}
        title={i18n.t("qr.decodeEmptyTitle")}
        hint={i18n.t("qr.decodeEmptyBody")}
      />
    {:else}
      <!-- The same block as the empty state above: an image with no QR code in
           it is this panel with different copy, not a different screen. -->
      <PanelEmpty
        class="flex-1"
        icon={ScanQrCode}
        title={i18n.t("qr.decodeNoneTitle")}
        hint={i18n.t("qr.decodeNoneBody")}
      />
    {/if}
  </div>

  <PanelFooter shortcuts={footerShortcuts} message={footerMessage} />
</div>
