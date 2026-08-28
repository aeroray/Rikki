import { invoke } from "@tauri-apps/api/core";
import type { Todo } from "$lib/commands/types";

class TodoStore {
  todos = $state<Todo[]>([]);
  private ready: Promise<void>;
  private writes: Promise<void> = Promise.resolve();

  constructor() {
    this.ready = this.hydrate();
  }

  get total() {
    return this.todos.length;
  }

  get completed() {
    return this.todos.filter((todo) => todo.done).length;
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
    } catch {
      this.todos = [];
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
    try {
      await invoke("save_todos", { todos: this.todos });
    } catch {
      // Browser preview has no Tauri runtime.
    }
  }
}

export const todos = new TodoStore();
