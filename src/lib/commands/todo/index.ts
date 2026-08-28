import { register } from "$lib/commands/registry";
import type { Command } from "$lib/commands/types";
import { todos } from "$lib/stores/todos.svelte";
import { ui } from "$lib/stores/ui.svelte";

export const todoCommand: Command = {
  id: "todo",
  prefix: "todo",
  title: "待办 · Todo",
  description: "快速记录待办事项",
  icon: "ListTodo",
  run(input) {
    const text = input.trim();
    if (!text) {
      ui.todoPanelOpen = true;
      ui.searchText = "todo ";
      ui.focusField = "todo-input";
      return;
    }
    todos.add(text);
    ui.todoPanelOpen = true;
    ui.searchText = "todo ";
    ui.focusField = "search";
  },
};

register(todoCommand);
