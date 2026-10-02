import { parseColor } from "$lib/commands/color/parse";
import { listCommands, listHomeCommands, match, rankCommand } from "$lib/commands/registry";
import type { RootHit, Todo } from "$lib/commands/types";
import { i18n } from "$lib/i18n";
import { usageBonus } from "$lib/fuzzy";
import { apps } from "$lib/stores/apps.svelte";
import { requestHidePalette } from "$lib/window";
import { invoke } from "@tauri-apps/api/core";

const COMMAND_USAGE_PREFIX = "command:";

const ROOT_HIT_LIMIT = 20;

/**
 * What Tab opens over the palette in the clipboard panel.
 *
 * Three kinds share one overlay because they are one interaction: show the whole
 * thing, which a row only has room to summarise. Images came first, and the
 * footer advertised "Tab previews" long before anything else could answer it —
 * pressing Tab on a paragraph did nothing at all.
 */
export type ClipPreview =
  | { kind: "image"; src: string }
  | { kind: "text"; body: string }
  | { kind: "color"; content: string };

class UiStore {
  searchText = $state("");
  selectedIndex = $state(0);
  todoPanelOpen = $state(false);
  focusField = $state<"search" | "snippet-title" | "snippet-keyword" | "snippet-content" | "engine-name" | "engine-url" | "json-editor" | "anniversary-title" | "anniversary-date">("search");
  showNonce = $state(0);
  shellOpen = $state(false);
  shellExiting = $state(false);
  preview = $state<ClipPreview | null>(null);
  /**
   * The todo opened by `Tab`, shown over the panel.
   *
   * Its own field rather than a `ClipPreview` kind: the two are drawn alike but
   * share nothing else — a clip preview is built from a body string and a kind
   * the clipboard store decided, while this is one todo the list handed over.
   */
  todoPreview = $state<Todo | null>(null);
  /**
   * Caps Lock, shown as a badge on the search field.
   *
   * The page reads this itself on every keystroke. The command is only for the
   * moment before the first one, when the badge would otherwise be guessing.
   */
  capsLock = $state(false);
  notice = $state<string | null>(null);
  /**
   * A destructive action waiting for a second Enter. Held as state rather than
   * run straight away so `SearchBar` can route the next key to it.
   */
  pendingConfirm = $state<{ action: string; body: string } | null>(null);
  private pendingConfirmRun: (() => void) | null = null;
  /** Runs when the dialog is declined, for a caller holding a resource. */
  private pendingConfirmCancel: (() => void) | null = null;
  private pendingReset = false;
  private hideFlushers = new Set<() => void>();
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionCommandId: string | null = null;
  private usageReady: Promise<void>;
  commandCounts = $state<Record<string, number>>({});

  matched = $derived(match(this.searchText));
  matchedCommand = $derived(this.matched?.command ?? null);
  commandRest = $derived(this.matched?.rest ?? "");
  view = $derived.by((): "empty" | "suggest" | "todo" | "calc" | "clip" | "snippet" | "settings" | "emoji" | "translate" | "color" | "json" | "base64" | "timestamp" | "qr" | "qrdecode" | "anniversary" | "calendar" | "sysmon" | "power" => {
    if (!this.searchText.trim()) return "empty";
    if (this.isCommandActive("todo")) return "todo";
    if (this.isCommandActive("calc")) return "calc";
    if (this.isCommandActive("clip")) return "clip";
    if (this.isCommandActive("snippet")) return "snippet";
    if (this.isCommandActive("anniversary")) return "anniversary";
    if (this.isCommandActive("calendar")) return "calendar";
    if (this.isCommandActive("sysmon")) return "sysmon";
    // All five system commands share one panel: a lock takes a delay the same way
    // a shutdown does.
    if (
      this.isCommandActive("lock") ||
      this.isCommandActive("sleep") ||
      this.isCommandActive("shutdown") ||
      this.isCommandActive("reboot") ||
      this.isCommandActive("logout")
    ) {
      return "power";
    }
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
      .map((command) => {
        const match = rankCommand(query, command, i18n.locale);
        // Command and app hits share one ranked list, so both sides must score
        // on the same scale. Apps add up to USAGE_CAP points for launch count,
        // so commands add the same bonus from `commandCounts` — which is already
        // persisted and already orders the home list. Giving commands the bonus
        // rather than dropping the app one keeps the "frequently used rises"
        // behaviour the home list has. The bonus never invents a hit: a command
        // that does not match the query keeps score 0.
        return {
          kind: "command" as const,
          id: `command:${command.id}`,
          score: match > 0 ? match + usageBonus(this.commandCounts[command.id] ?? 0) : 0,
          command,
        };
      })
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

  enterCommand(id: string) {
    if (!id || this.sessionCommandId === id) return;
    this.sessionCommandId = id;
    this.commandCounts = { ...this.commandCounts, [id]: (this.commandCounts[id] ?? 0) + 1 };
    // Usage counting is bookkeeping; a failure here (no Tauri runtime, or a bad
    // key) must not surface as an unhandled rejection on every panel entry.
    void invoke("bump_usage", { key: `${COMMAND_USAGE_PREFIX}${id}` }).catch(() => {});
  }

  leaveCommand() {
    this.sessionCommandId = null;
  }

  resetSearch() {
    this.searchText = "";
    this.selectedIndex = 0;
    this.todoPanelOpen = false;
    this.focusField = "search";
    this.preview = null;
    this.notice = null;
    this.cancelConfirm();
    this.showNonce += 1;
  }

  /**
   * Arms a destructive action; `runConfirm` carries it out.
   *
   * `oncancel` runs only when the user declines, and exists because a caller can
   * hold something that has to be given back either way — the updater holds a
   * Rust-side resource, and a cancelled dialog used to drop the handle silently.
   * It is not called by `requestConfirm` replacing an earlier one, which is a
   * caller mistake rather than a user decision.
   */
  requestConfirm(
    action: string,
    run: () => void,
    body: string = i18n.t("confirm.body"),
    oncancel?: () => void,
  ) {
    this.pendingConfirmRun = run;
    this.pendingConfirmCancel = oncancel ?? null;
    this.pendingConfirm = { action, body };
  }

  runConfirm() {
    const run = this.pendingConfirmRun;
    this.pendingConfirm = null;
    this.pendingConfirmRun = null;
    this.pendingConfirmCancel = null;
    run?.();
  }

  cancelConfirm() {
    const oncancel = this.pendingConfirmCancel;
    this.pendingConfirm = null;
    this.pendingConfirmRun = null;
    this.pendingConfirmCancel = null;
    oncancel?.();
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
    // Before the first keystroke, so the badge is right while the user is about to
    // type rather than after they have.
    void this.refreshCapsLock();
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
    this.cancelConfirm();
    if (this.noticeTimer) {
      clearTimeout(this.noticeTimer);
      this.noticeTimer = null;
    }
    this.preview = null;
    this.todoPreview = null;
    this.shellExiting = true;
    this.shellOpen = false;
    void requestHidePalette();
  }

  /** Re-reads Caps Lock. */
  async refreshCapsLock(): Promise<void> {
    try {
      this.capsLock = await invoke<boolean>("caps_lock_state");
    } catch {
      // No answer means no badge, which is how the field behaved before.
    }
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
