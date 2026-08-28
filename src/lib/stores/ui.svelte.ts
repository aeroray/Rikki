import { match, suggest } from "$lib/commands/registry";
import { requestHidePalette } from "$lib/window";

class UiStore {
  searchText = $state("");
  selectedIndex = $state(0);
  todoPanelOpen = $state(false);
  focusField = $state<"search" | "todo-input">("search");
  showNonce = $state(0);
  shellOpen = $state(false);
  shellExiting = $state(false);

  matched = $derived(match(this.searchText));
  matchedCommand = $derived(this.matched?.command ?? null);
  commandRest = $derived(this.matched?.rest ?? "");
  suggestions = $derived(suggest(this.searchText));

  view = $derived.by((): "empty" | "suggest" | "todo" | "calc" => {
    if (!this.searchText.trim()) return "empty";
    if (this.isCommandActive("todo")) return "todo";
    if (this.isCommandActive("calc")) return "calc";
    return "suggest";
  });

  resetSearch() {
    this.searchText = "";
    this.selectedIndex = 0;
    this.todoPanelOpen = false;
    this.focusField = "search";
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
    this.shellExiting = true;
    this.shellOpen = false;
    void requestHidePalette();
  }

  clampSelection() {
    if (this.selectedIndex < 0) this.selectedIndex = 0;
    if (this.suggestions.length === 0) {
      this.selectedIndex = 0;
      return;
    }
    if (this.selectedIndex >= this.suggestions.length) {
      this.selectedIndex = this.suggestions.length - 1;
    }
  }
}

export const ui = new UiStore();
