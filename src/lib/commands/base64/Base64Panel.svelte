<script lang="ts">
  import { inspectBase64 } from "$lib/commands/base64/parse";
  import PanelEmpty from "$lib/components/PanelEmpty.svelte";
  import PanelFooter, { type FooterShortcut } from "$lib/components/PanelFooter.svelte";
  import ScrollArea from "$lib/components/ScrollArea.svelte";
  import { i18n } from "$lib/i18n";
  import { ui } from "$lib/stores/ui.svelte";
  import { Binary } from "@lucide/svelte";

  const inspected = $derived(inspectBase64(ui.searchText, ui.commandRest));

  // Key glyphs are not translated: they name physical keys, which read the same
  // in every locale. Tab stays advertised even for input that cannot be decoded,
  // because switching to encode still turns that same text into base64.
  const footerShortcuts = $derived.by((): FooterShortcut[] => {
    if (inspected.ok) {
      return [
        { keys: "Enter", label: i18n.t("base64.keyCopyResult") },
        { keys: "Tab", label: i18n.t("base64.keySwitch") },
      ];
    }
    return [{ keys: "Tab", label: i18n.t("base64.keySwitch") }];
  });
</script>

<!-- The footer is a sibling of the content column, not inside it, so it stays
     pinned to the bottom whatever the converted text does. -->
<div class="flex min-h-0 flex-1 flex-col">
  <div class="flex min-h-0 flex-1 flex-col px-3 pt-1">
    <p class="px-1 text-[12px] leading-[1.4] text-ink-subtle">
      {inspected.mode === "decode" ? i18n.t("base64.decode") : i18n.t("base64.encode")}
    </p>

    {#if inspected.ok}
      <ScrollArea class="mt-3 min-h-0 flex-1" viewportClass="flex flex-col">
        <p class="px-1 text-[16px] leading-6 tracking-[-0.05px] text-pretty break-all text-ink">
          {inspected.output}
        </p>
      </ScrollArea>
    {:else if inspected.empty}
      <PanelEmpty
        class="flex-1"
        icon={Binary}
        hint={inspected.mode === "decode" ? i18n.t("base64.emptyDecode") : i18n.t("base64.emptyEncode")}
      />
    {:else}
      <p class="mt-3 px-1 text-[14px] leading-5 text-ink-tertiary">{i18n.t("base64.invalid")}</p>
    {/if}
  </div>

  <PanelFooter shortcuts={footerShortcuts} />
</div>
