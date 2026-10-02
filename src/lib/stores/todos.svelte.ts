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
   * The next label in the cycle: everything, then each label, then back.
   *
   * A cycle rather than a list to pick from, because the labels are the user's
   * own words and reading them off a menu is slower than pressing Tab until the
   * right one is on screen — which is also why the result is written back into
   * the query instead of living in a field of its own.
   */
  nextTag(current: string): string {
    const tags = this.tags;
    if (tags.length === 0) return "";
    const index = tags.indexOf(current);
    if (index === -1) return tags[0];
    if (index === tags.length - 1) return "";
    return tags[index + 1];
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
