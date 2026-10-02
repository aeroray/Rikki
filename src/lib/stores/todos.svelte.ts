import { invoke } from "@tauri-apps/api/core";
import type { Todo } from "$lib/commands/types";
import { i18n } from "$lib/i18n";
import { ui } from "$lib/stores/ui.svelte";

class TodoStore {
  todos = $state<Todo[]>([]);
  private ready: Promise<void>;
  private writes: Promise<void> = Promise.resolve();
  /**
   * True only once a read actually returned the persisted file. `save_todos`
   * replaces that file with the whole in-memory array, so writing after a failed
   * hydration would persist the list we failed to read. The Rust side moves a
   * genuinely corrupt file aside, so this guards IO and permission failures.
   */
  private hydrated = false;
  private refusedWriteNotified = false;

  constructor() {
    this.ready = this.hydrate();
  }

  /**
   * Every label in use, in the order the `Tab` cycle walks them.
   *
   * Derived from the items rather than kept as its own list: a label nobody is
   * using is a filter that can only ever show an empty panel, and a second list
   * to maintain is a second list that can disagree with what is on screen.
   */
  readonly tags = $derived.by((): string[] => {
    const seen = new Set<string>();
    for (const todo of this.todos) {
      if (todo.tag) seen.add(todo.tag);
    }
    return [...seen].sort((a, b) => a.localeCompare(b, i18n.locale));
  });

  /** The items under one label, or all of them when the label is empty. */
  filtered(tag: string): Todo[] {
    if (!tag) return this.todos;
    return this.todos.filter((todo) => todo.tag === tag);
  }

  /**
   * The todo whose label is being picked right now, or null.
   *
   * The id rather than a boolean, because the row the picker will write to has
   * to survive the list re-sorting or filtering underneath it while it is open.
   */
  assigning = $state<string | null>(null);

  /** Whether a label is one the list actually holds. */
  hasTag(tag: string): boolean {
    return tag !== "" && this.tags.includes(tag);
  }

  /**
   * The labels a partial query matches, in the order the picker lists them.
   *
   * Substring rather than prefix: the labels are the user's own words, and
   * `#项目` should find 老项目 as readily as 项目A — the picker is a short list
   * read at a glance, not a search field that has to be typed exactly.
   */
  matchTags(query: string): string[] {
    const needle = query.trim().toLowerCase();
    if (!needle) return this.tags;
    return this.tags.filter((tag) => tag.toLowerCase().includes(needle));
  }

  setTag(id: string, tag: string) {
    const label = tag.trim();
    void this.ready.then(() => {
      this.todos = this.todos.map((todo) => (todo.id === id ? { ...todo, tag: label } : todo));
      this.enqueueWrite();
    });
  }

  async reload() {
    await this.hydrate();
  }

  add(text: string, tag = "") {
    const value = text.trim();
    if (!value) return;
    const label = tag.trim();
    void this.ready.then(() => {
      this.todos = [
        {
          id: crypto.randomUUID(),
          text: value,
          done: false,
          createdAt: Date.now(),
          tag: label,
        },
        ...this.todos,
      ];
      this.enqueueWrite();
    });
  }

  toggle(id: string) {
    void this.ready.then(() => {
      this.todos = this.todos.map((todo) =>
        todo.id === id ? { ...todo, done: !todo.done } : todo,
      );
      this.enqueueWrite();
    });
  }

  remove(id: string) {
    void this.ready.then(() => {
      this.todos = this.todos.filter((todo) => todo.id !== id);
      this.enqueueWrite();
    });
  }

  private async hydrate() {
    try {
      this.todos = await invoke<Todo[]>("get_todos");
      this.hydrated = true;
      this.refusedWriteNotified = false;
    } catch {
      // Deliberately keep the in-memory list: overwriting it with [] is what
      // turned a transient read failure into permanent data loss.
      this.hydrated = false;
    }
  }

  private enqueueWrite() {
    this.writes = this.writes
      .then(() => this.write())
      .catch(() => {
        // Keep the in-memory list if a write fails; the next mutation retries.
      });
  }

  private async write() {
    if (!this.hydrated) {
      this.notifyRefusedWrite();
      return;
    }
    try {
      await invoke("save_todos", { todos: this.todos });
    } catch {
      // Browser preview has no Tauri runtime.
    }
  }

  private notifyRefusedWrite() {
    if (this.refusedWriteNotified) return;
    this.refusedWriteNotified = true;
    // No todos-specific key exists and new i18n keys are out of scope, so reuse
    // the generic save-failure text: it says exactly what happened. Once only —
    // a notice per mutation would bury the palette.
    ui.flash(i18n.t("clip.saveFailed"));
  }
}

export const todos = new TodoStore();
