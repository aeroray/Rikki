<script lang="ts">
  import ClipItem from "$lib/commands/clip/ClipItem.svelte";
  import ScrollArea from "$lib/components/ScrollArea.svelte";
  import { clipboard } from "$lib/stores/clipboard.svelte";
  import { ui } from "$lib/stores/ui.svelte";

  const items = $derived(clipboard.filtered(ui.commandRest));
  const pinned = $derived(items.filter((entry) => entry.pinned));
  const recent = $derived(items.filter((entry) => !entry.pinned));

  $effect(() => {
    clipboard.clampSelection(items.length);
  });

  function paste(id: string) {
    void clipboard.paste(id).then((ok) => {
      if (ok) ui.beginHide();
    });
  }
</script>

<div class="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-1">
  {#if items.length === 0}
    <p class="px-1 py-6 text-center text-[13px] leading-5 text-ink-subtle">
      {ui.commandRest.trim() ? "没有匹配的剪贴板记录" : "复制文本后会出现在这里"}
    </p>
  {:else}
    <ScrollArea class="min-h-0 flex-1" viewportClass="flex flex-col gap-3">
      {#if pinned.length > 0}
        <section>
          <p class="mb-1 px-1 text-[12px] leading-[1.4] text-ink-subtle">
            已固定 <span class="tabular-nums">{pinned.length}</span>
          </p>
          <ul class="flex flex-col gap-1">
            {#each pinned as entry, index (entry.id)}
              <li>
                <ClipItem
                  {entry}
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
            最近 <span class="tabular-nums">{recent.length}</span>
          </p>
          <ul class="flex flex-col gap-1">
            {#each recent as entry, index (entry.id)}
              <li>
                <ClipItem
                  {entry}
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
      {items.length} 条 · 回车粘贴 · Delete 删除 · Ctrl+P 固定
    </p>
  {/if}
</div>
