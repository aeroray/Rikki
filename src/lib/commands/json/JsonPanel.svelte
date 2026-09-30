<script lang="ts">
  import ScrollArea from "$lib/components/ScrollArea.svelte";
  import PanelFooter, { type FooterShortcut } from "$lib/components/PanelFooter.svelte";
  import { i18n } from "$lib/i18n";
  import { json } from "$lib/stores/json.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { onDestroy } from "svelte";

  let editor: HTMLTextAreaElement | undefined = $state();

  const inspected = $derived(json.inspected);
  const html = $derived(
    inspected.ok ? (json.compact ? inspected.htmlCompact : inspected.htmlPretty) : "",
  );
  const errorLines = $derived(
    !inspected.ok && !inspected.empty && inspected.error.line > 0
      ? json.source.split("\n")
      : [],
  );

  // Key glyphs are not translated: they name physical keys, which read the same
  // in every locale. The footer is permanent chrome, so its state follows the
  // same priority as the panel's branch chain.
  const footerShortcuts = $derived.by((): FooterShortcut[] => {
    if (json.editing) return [{ keys: "Esc", label: i18n.t("key.back") }];
    if (inspected.ok) {
      return [
        { keys: "Enter", label: i18n.t("json.keyCopyView") },
        { keys: "Esc", label: i18n.t("key.back") },
      ];
    }
    if (inspected.empty) {
      return [
        { keys: "Enter", label: i18n.t("key.edit") },
        { keys: "Esc", label: i18n.t("key.back") },
      ];
    }
    return [{ keys: "Enter", label: i18n.t("json.keyEnterEdit") }];
  });

  const footerMessage = $derived.by((): string | null =>
    json.editing ? i18n.t("json.noteAutoFormat") : null,
  );

  $effect(() => {
    json.hydrate(ui.commandRest);
  });

  $effect(() => {
    if (ui.focusField !== "json-editor") return;
    requestAnimationFrame(() => editor?.focus());
  });

  onDestroy(() => {
    json.reset();
  });

  function onDraftInput(event: Event) {
    json.source = (event.currentTarget as HTMLTextAreaElement).value;
  }

  function onEditorKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      json.stopEdit();
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      insertTab(event.currentTarget as HTMLTextAreaElement);
    }
  }

  function insertTab(area: HTMLTextAreaElement) {
    const start = area.selectionStart;
    const end = area.selectionEnd;
    const next = `${area.value.slice(0, start)}  ${area.value.slice(end)}`;
    json.source = next;
    requestAnimationFrame(() => {
      area.selectionStart = start + 2;
      area.selectionEnd = start + 2;
    });
  }
</script>

<!-- The footer is a sibling of the content column, not inside it, so it stays
     pinned to the bottom whatever state the panel is in. -->
<div class="flex min-h-0 flex-1 flex-col">
  <div class="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-1">
    {#if json.editing}
      <p class="px-1 text-[12px] leading-[1.4] text-ink-subtle">
        {inspected.ok ? i18n.t("json.valid") : inspected.empty ? i18n.t("json.editing") : i18n.t("json.invalid")}
      </p>
      {#if !inspected.ok && !inspected.empty}
        {#if inspected.error.line > 0}
          <p class="mt-1 px-1 text-[12px] leading-[1.4] text-ink-tertiary tabular-nums">
            {i18n.t("json.errorAt", { line: inspected.error.line, column: inspected.error.column })}
          </p>
        {/if}
        <p class="mt-1 px-1 text-[12px] leading-[1.4] text-ink-tertiary">{inspected.error.message}</p>
      {/if}
      <textarea
        bind:this={editor}
        class="mt-3 min-h-0 flex-1 resize-none rounded-md bg-surface-1 px-3 py-2 text-[13px] leading-5 text-ink outline-none"
        value={json.source}
        spellcheck="false"
        aria-label={i18n.t("json.editor")}
        oninput={onDraftInput}
        onkeydown={onEditorKeydown}
        onfocus={() => (ui.focusField = "json-editor")}
      ></textarea>
    {:else if inspected.ok}
      <p class="px-1 text-[12px] leading-[1.4] text-ink-subtle">{i18n.t("json.valid")}</p>
      <p class="mt-1 px-1 text-[12px] leading-[1.4] text-ink-tertiary">
        {json.compact ? i18n.t("json.modeCompact") : i18n.t("json.modePretty")}
        · {i18n.t("json.viewHint")}
      </p>
      <ScrollArea class="mt-3 min-h-0 flex-1" viewportClass="flex flex-col">
        <button
          type="button"
          class="w-full rounded-md bg-surface-1 px-3 py-2 text-left text-[13px] leading-5 text-ink"
          onclick={() => json.startEdit()}
        >
          <pre class="json-view m-0 whitespace-pre-wrap break-all">{@html html}</pre>
        </button>
      </ScrollArea>
    {:else if inspected.empty}
      <p class="px-1 text-[14px] leading-5 text-ink-tertiary">{i18n.t("json.emptyHint")}</p>
    {:else}
      <p class="px-1 text-[12px] leading-[1.4] text-ink-subtle">{i18n.t("json.invalid")}</p>
      <!-- V8 omits the position for several common errors (`[1,2,]`, a bare
           word, a truncated document), and `locateError` then reports 0/0.
           Printing "line 0, column 0" is worse than saying nothing. -->
      {#if inspected.error.line > 0}
        <p class="mt-1 px-1 text-[12px] leading-[1.4] text-ink-tertiary tabular-nums">
          {i18n.t("json.errorAt", { line: inspected.error.line, column: inspected.error.column })}
        </p>
      {/if}
      <p class="mt-1 px-1 text-[12px] leading-[1.4] text-ink-tertiary">{inspected.error.message}</p>
      <ScrollArea class="mt-3 min-h-0 flex-1" viewportClass="flex flex-col">
        <button
          type="button"
          class="w-full rounded-md bg-surface-1 px-3 py-2 text-left text-[13px] leading-5 text-ink"
          onclick={() => json.startEdit()}
        >
          {#if errorLines.length > 0}
            {#each errorLines as line, index (index)}
              <p
                class="whitespace-pre-wrap break-all {index + 1 === inspected.error.line
                  ? 'rounded-sm bg-surface-2 text-ink'
                  : 'text-ink-muted'}"
              >
                {line || " "}
                {#if index + 1 === inspected.error.line}
                  <span class="text-ink-subtle"> ← {i18n.t("json.errorMark")}</span>
                {/if}
              </p>
            {/each}
          {:else}
            <pre class="m-0 whitespace-pre-wrap break-all text-ink-muted">{json.source}</pre>
          {/if}
        </button>
      </ScrollArea>
    {/if}
  </div>

  <PanelFooter shortcuts={footerShortcuts} message={footerMessage} />
</div>

<style>
  .json-view :global(.json-key) {
    color: var(--color-ink);
  }
  .json-view :global(.json-string) {
    color: var(--color-ink-muted);
  }
  .json-view :global(.json-number) {
    color: var(--color-primary);
  }
  .json-view :global(.json-boolean),
  .json-view :global(.json-null) {
    color: var(--color-ink-subtle);
  }
</style>
