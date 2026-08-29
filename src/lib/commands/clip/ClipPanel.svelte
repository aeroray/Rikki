<script lang="ts">
  import ClipConfirm from "$lib/commands/clip/ClipConfirm.svelte";
  import ClipItem from "$lib/commands/clip/ClipItem.svelte";
  import ScrollArea from "$lib/components/ScrollArea.svelte";
  import { i18n } from "$lib/i18n";
  import { clipboard } from "$lib/stores/clipboard.svelte";
  import { settings } from "$lib/stores/settings.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { onDestroy, onMount } from "svelte";

  const items = $derived(clipboard.filtered(ui.commandRest));
  const pinned = $derived(items.filter((entry) => entry.pinned));
  const recent = $derived(items.filter((entry) => !entry.pinned));
  const unpinnedCount = $derived(clipboard.entries.filter((entry) => !entry.pinned).length);
  const retentionDays = $derived(settings.clipTextRetentionDays);
  const cleanupEnabled = $derived(retentionDays > 0);
  let now = $state(Date.now());

  $effect(() => {
    clipboard.clampSelection(items.length);
  });

  onMount(() => {
    const tick = setInterval(() => {
      now = Date.now();
    }, 10_000);
    return () => clearInterval(tick);
  });

  onDestroy(() => {
    clipboard.closeConfirm();
  });

  function paste(id: string) {
    void clipboard.paste(id);
  }
</script>

<div class="relative flex min-h-0 flex-1 flex-col px-3 pb-3 pt-1">
  {#if items.length === 0}
    <p class="flex-1 px-1 py-6 text-center text-[13px] leading-5 text-ink-subtle">
      {ui.commandRest.trim() ? i18n.t("clip.noMatch") : i18n.t("clip.empty")}
    </p>
  {:else}
    <ScrollArea class="min-h-0 flex-1" viewportClass="flex flex-col gap-3">
      {#if pinned.length > 0}
        <section>
          <p class="mb-1 px-1 text-[12px] leading-[1.4] text-ink-subtle">
            {i18n.t("clip.pinned")} <span class="tabular-nums">{pinned.length}</span>
          </p>
          <ul class="flex flex-col gap-1">
            {#each pinned as entry, index (entry.id)}
              <li>
                <ClipItem
                  {entry}
                  {now}
                  selected={clipboard.selectedIndex === index}
                  onselect={() => paste(entry.id)}
                  onpin={() => clipboard.togglePin(entry.id)}
                />
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if recent.length > 0}
        <section>
          <p class="mb-1 px-1 text-[12px] leading-[1.4] text-ink-subtle">
            {i18n.t("clip.recent")} <span class="tabular-nums">{recent.length}</span>
          </p>
          <ul class="flex flex-col gap-1">
            {#each recent as entry, index (entry.id)}
              <li>
                <ClipItem
                  {entry}
                  {now}
                  selected={clipboard.selectedIndex === pinned.length + index}
                  onselect={() => paste(entry.id)}
                  onpin={() => clipboard.togglePin(entry.id)}
                />
              </li>
            {/each}
          </ul>
        </section>
      {/if}
    </ScrollArea>
    <p class="mt-2 px-1 text-[12px] leading-[1.4] text-ink-tertiary tabular-nums">
      {i18n.t("clip.footer", { count: items.length })}
    </p>
  {/if}

  <div class="mt-2 flex items-stretch gap-2 px-1">
    <button
      type="button"
      class="flex h-10 shrink-0 items-center rounded-md px-2 text-[12px] leading-[1.4] text-ink-subtle outline outline-1 outline-hairline transition-colors duration-150 ease-out enabled:hover:bg-surface-2 enabled:hover:text-ink enabled:active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40"
      disabled={unpinnedCount === 0}
      onclick={() => clipboard.openClearConfirm()}
    >
      {i18n.t("clip.clear")}
    </button>
    <button
      type="button"
      class="flex h-10 min-w-0 flex-1 items-center justify-center rounded-md px-2 text-center text-[12px] leading-[1.4] text-ink-subtle outline outline-1 outline-hairline transition-colors duration-150 ease-out enabled:hover:bg-surface-2 enabled:hover:text-ink enabled:active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40"
      disabled={!cleanupEnabled}
      title={cleanupEnabled ? undefined : i18n.t("clip.cleanupDisabledHint")}
      onclick={() => clipboard.openExpireConfirm(retentionDays)}
    >
      <span class="truncate">
        {cleanupEnabled
          ? i18n.t("clip.cleanupAction", { days: retentionDays })
          : i18n.t("clip.cleanupDisabled")}
      </span>
    </button>
  </div>
  <ClipConfirm />
</div>
