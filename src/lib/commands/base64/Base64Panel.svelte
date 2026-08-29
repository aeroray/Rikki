<script lang="ts">
  import { inspectBase64 } from "$lib/commands/base64/parse";
  import ScrollArea from "$lib/components/ScrollArea.svelte";
  import { i18n } from "$lib/i18n";
  import { ui } from "$lib/stores/ui.svelte";

  const inspected = $derived(inspectBase64(ui.searchText, ui.commandRest));
</script>

<div class="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-1">
  <p class="px-1 text-[12px] leading-[1.4] text-ink-subtle">
    {inspected.mode === "decode" ? i18n.t("base64.decode") : i18n.t("base64.encode")}
  </p>

  {#if inspected.ok}
    <ScrollArea class="mt-3 min-h-0 flex-1" viewportClass="flex flex-col">
      <p class="px-1 text-[16px] leading-6 tracking-[-0.05px] text-pretty break-all text-ink">
        {inspected.output}
      </p>
    </ScrollArea>
    <p class="mt-2 px-1 text-[12px] leading-[1.4] text-ink-tertiary">
      {i18n.t("base64.copyHint")} · {i18n.t("base64.tabHint")}
    </p>
  {:else if inspected.empty}
    <p class="mt-3 px-1 text-[14px] leading-5 text-ink-tertiary">
      {inspected.mode === "decode" ? i18n.t("base64.emptyDecode") : i18n.t("base64.emptyEncode")}
    </p>
    <p class="mt-2 px-1 text-[12px] leading-[1.4] text-ink-tertiary">{i18n.t("base64.tabHint")}</p>
  {:else}
    <p class="mt-3 px-1 text-[14px] leading-5 text-ink-tertiary">{i18n.t("base64.invalid")}</p>
  {/if}
</div>
