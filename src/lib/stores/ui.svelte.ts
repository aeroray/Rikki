import { parseColor } from "$lib/commands/color/parse";
import { listCommands, listHomeCommands, match, rankCommand } from "$lib/commands/registry";
import type { RootHit } from "$lib/commands/types";
import { i18n } from "$lib/i18n";
import { apps } from "$lib/stores/apps.svelte";
import { requestHidePalette } from "$lib/window";
import { invoke } from "@tauri-apps/api/core";

const COMMAND_USAGE_PREFIX = "command:";

const ROOT_HIT_LIMIT = 20;

class UiStore {
  searchText = $state("");
  selectedIndex = $state(0);
  todoPanelOpen = $state(false);
  focusField = $state<"search" | "todo-input" | "snippet-title" | "snippet-keyword" | "snippet-content" | "engine-name" | "engine-url" | "translate-appid" | "translate-secret" | "translate-url" | "json-editor">("search");
  showNonce = $state(0);
  shellOpen = $state(false);
  shellExiting = $state(false);
  imagePreviewSrc = $state<string | null>(null);
  notice = $state<string | null>(null);
  private pendingReset = false;
  private hideFlushers = new Set<() => void>();
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionCommandId: string | null = null;
  private usageReady: Promise<void>;
  commandCounts = $state<Record<string, number>>({});

  matched = $derived(match(this.searchText));
  matchedCommand = $derived(this.matched?.command ?? null);
  commandRest = $derived(this.matched?.rest ?? "");
  view = $derived.by((): "empty" | "suggest" | "todo" | "calc" | "clip" | "snippet" | "settings" | "emoji" | "translate" | "color" | "json" | "base64" | "timestamp" | "qr" | "qrdecode" => {
    if (!this.searchText.trim()) return "empty";
    if (this.isCommandActive("todo")) return "todo";
    if (this.isCommandActive("calc")) return "calc";
    if (this.isCommandActive("clip")) return "clip";
    if (this.isCommandActive("snippet")) return "snippet";
    if (this.isCommandActive("settings")) return "settings";
    if (this.isCommandActive("emoji")) return "emoji";
    if (this.isCommandActive("translate")) return "translate";
    if (this.isCommandActive("color")) return "color";
    if (this.isCommandActive("json")) return "json";
    if (this.isCommandActive("base64") || this.isCommandActive("base64d")) return "base64";
    if (this.isCommandActive("timestamp")) return "timestamp";
    if (this.isCommandActive("qr")) return "qr";
    if (this.isCommandActive("qrdecode")) return "qrdecode";
    if (!this.matchedCommand && parseColor(this.searchText.trim())) return "color";
    return "suggest";
  });
  homeCommands = $derived(listHomeCommands(this.commandCounts));
  rootHits = $derived.by((): RootHit[] => {
    if (this.view !== "suggest") return [];
    const query = this.searchText.trim();
    if (!query) return [];
    const commands = listCommands()
      .map((command) => ({
        kind: "command" as const,
        id: `command:${command.id}`,
        score: rankCommand(query, command, i18n.locale),
        command,
      }))
      .filter((hit) => hit.score > 0);
    const appHits = apps.ranked(query).map(({ app, score }) => ({
      kind: "app" as const,
      id: `app:${app.id}`,
      score,
      app,
    }));
    const hits: RootHit[] = [...commands, ...appHits]
      .sort((a, b) => b.score - a.score)
      .slice(0, ROOT_HIT_LIMIT);
    const matched = this.matchedCommand;
    if (matched && this.commandRest.trim()) {
      const id = `command:${matched.id}`;
      const existing = hits.findIndex((hit) => hit.id === id);
      const rest = this.commandRest.trim();
      const pinned: RootHit = {
        kind: "command",
        id,
        score: Number.POSITIVE_INFINITY,
        command: { ...matched, description: i18n.t("search.query", { query: rest }), descriptionZh: undefined },
      };
      if (existing >= 0) hits.splice(existing, 1);
      hits.unshift(pinned);
      if (hits.length > ROOT_HIT_LIMIT) hits.pop();
    }
    return hits;
  });

  constructor() {
    this.usageReady = this.hydrateCommandUsage();
  }

  start() {
    void this.usageReady;
  }

  enterCommand(id: string) {
    if (!id || this.sessionCommandId === id) return;
    this.sessionCommandId = id;
    this.commandCounts = { ...this.commandCounts, [id]: (this.commandCounts[id] ?? 0) + 1 };
    void invoke("bump_usage", { key: `${COMMAND_USAGE_PREFIX}${id}` });
  }

  leaveCommand() {
    this.sessionCommandId = null;
  }

  resetSearch() {
    this.searchText = "";
    this.selectedIndex = 0;
    this.todoPanelOpen = false;
    this.focusField = "search";
    this.imagePreviewSrc = null;
    this.notice = null;
    this.showNonce += 1;
  }

  flash(message: string) {
    this.notice = message;
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => {
      this.notice = null;
      this.noticeTimer = null;
    }, 2200);
  }

  isCommandActive(id: string): boolean {
    if (this.matchedCommand?.id !== id) return false;
    if (this.commandRest.length > 0 || this.searchText.endsWith(" ")) return true;
    return id === "todo" && this.todoPanelOpen;
  }

  onHideFlush(fn: () => void): () => void {
    this.hideFlushers.add(fn);
    return () => {
      this.hideFlushers.delete(fn);
    };
  }

  beginShow() {
    const reversing = this.shellExiting;
    this.shellExiting = false;
    if (this.pendingReset) {
      this.pendingReset = false;
      this.resetSearch();
    } else {
      this.showNonce += 1;
    }
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

  beginHide(options?: { reset?: boolean }) {
    if (this.shellExiting) return;
    if (options?.reset) this.pendingReset = true;
    for (const flush of this.hideFlushers) flush();
    this.notice = null;
    if (this.noticeTimer) {
      clearTimeout(this.noticeTimer);
      this.noticeTimer = null;
    }
    this.imagePreviewSrc = null;
    this.shellExiting = true;
    this.shellOpen = false;
    void requestHidePalette();
  }

  clampSelection() {
    if (this.selectedIndex < 0) this.selectedIndex = 0;
    const count = this.view === "empty" ? this.homeCommands.length : this.rootHits.length;
    if (count === 0) {
      this.selectedIndex = 0;
      return;
    }
    if (this.selectedIndex >= count) {
      this.selectedIndex = count - 1;
    }
  }

  private async hydrateCommandUsage() {
    try {
      const all = await invoke<Record<string, number>>("get_usage_counts");
      const next: Record<string, number> = {};
      for (const [key, count] of Object.entries(all)) {
        if (!key.startsWith(COMMAND_USAGE_PREFIX)) continue;
        next[key.slice(COMMAND_USAGE_PREFIX.length)] = count;
      }
      const merged = { ...next };
      for (const [id, count] of Object.entries(this.commandCounts)) {
        merged[id] = Math.max(merged[id] ?? 0, count);
      }
      this.commandCounts = merged;
    } catch {
      // Keep any counts already recorded this session.
    }
  }
}

export const ui = new UiStore();
