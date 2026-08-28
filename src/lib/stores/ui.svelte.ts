import { listCommands, match, rankCommand } from "$lib/commands/registry";
import type { RootHit } from "$lib/commands/types";
import { apps } from "$lib/stores/apps.svelte";
import { requestHidePalette } from "$lib/window";

const ROOT_HIT_LIMIT = 20;

class UiStore {
  searchText = $state("");
  selectedIndex = $state(0);
  todoPanelOpen = $state(false);
  focusField = $state<"search" | "todo-input" | "snippet-title" | "snippet-keyword" | "snippet-content" | "engine-name" | "engine-url">("search");
  showNonce = $state(0);
  shellOpen = $state(false);
  shellExiting = $state(false);
  imagePreviewSrc = $state<string | null>(null);

  matched = $derived(match(this.searchText));
  matchedCommand = $derived(this.matched?.command ?? null);
  commandRest = $derived(this.matched?.rest ?? "");
  view = $derived.by((): "empty" | "suggest" | "todo" | "calc" | "clip" | "snippet" | "settings" => {
    if (!this.searchText.trim()) return "empty";
    if (this.isCommandActive("todo")) return "todo";
    if (this.isCommandActive("calc")) return "calc";
    if (this.isCommandActive("clip")) return "clip";
    if (this.isCommandActive("snippet")) return "snippet";
    if (this.isCommandActive("settings")) return "settings";
    return "suggest";
  });
  rootHits = $derived.by((): RootHit[] => {
    if (this.view !== "suggest") return [];
    const query = this.searchText.trim();
    if (!query) return [];
    const commands = listCommands()
      .map((command) => ({
        kind: "command" as const,
        id: `command:${command.id}`,
        score: rankCommand(query, command),
        command,
      }))
      .filter((hit) => hit.score > 0);
    const appHits = apps.ranked(query).map(({ app, score }) => ({
      kind: "app" as const,
      id: `app:${app.id}`,
      score,
      app,
    }));
    return [...commands, ...appHits]
      .sort((a, b) => b.score - a.score)
      .slice(0, ROOT_HIT_LIMIT);
  });

  resetSearch() {
    this.searchText = "";
    this.selectedIndex = 0;
    this.todoPanelOpen = false;
    this.focusField = "search";
    this.imagePreviewSrc = null;
    this.showNonce += 1;
  }

  isCommandActive(id: string): boolean {
    if (this.matchedCommand?.id !== id) return false;
    if (this.commandRest.length > 0 || this.searchText.endsWith(" ")) return true;
    return id === "todo" && this.todoPanelOpen;
  }

  beginShow() {
    const reversing = this.shellExiting;
    this.shellExiting = false;
    this.resetSearch();
    if (reversing) {
      this.shellOpen = true;
      return;
    }
    this.shellOpen = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.shellOpen = true;
      });
    });
  }

  beginHide() {
    if (this.shellExiting) return;
    this.imagePreviewSrc = null;
    this.shellExiting = true;
    this.shellOpen = false;
    void requestHidePalette();
  }

  clampSelection() {
    if (this.selectedIndex < 0) this.selectedIndex = 0;
    const count = this.rootHits.length;
    if (count === 0) {
      this.selectedIndex = 0;
      return;
    }
    if (this.selectedIndex >= count) {
      this.selectedIndex = count - 1;
    }
  }
}

export const ui = new UiStore();
