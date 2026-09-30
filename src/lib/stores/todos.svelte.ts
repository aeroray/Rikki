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

  get total() {
    return this.todos.length;
  }

  get completed() {
    return this.todos.filter((todo) => todo.done).length;
  }

  async reload() {
    await this.hydrate();
  }

  add(text: string) {
    const value = text.trim();
    if (!value) return;
    void this.ready.then(() => {
      this.todos = [
        {
          id: crypto.randomUUID(),
          text: value,
          done: false,
          createdAt: Date.now(),
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
