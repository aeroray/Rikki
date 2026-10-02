import { register } from "$lib/commands/registry";
import { parseTodoInput } from "$lib/commands/todo/parse";
import type { Command } from "$lib/commands/types";
import { todos } from "$lib/stores/todos.svelte";
import { ui } from "$lib/stores/ui.svelte";

export const todoCommand: Command = {
  id: "todo",
  prefix: "todo",
  title: "Todo",
  titleZh: "待办",
  description: "Quick todos",
  descriptionZh: "快速记录待办事项",
  icon: "ListTodo",
  run(input) {
    const draft = parseTodoInput(input);
    if (draft.kind === "create") {
      todos.add(draft.text, draft.tag);
      ui.todoPanelOpen = true;
      // The label is kept in the query while the text is cleared: having just
      // filed something under 购物, the next thing typed is usually the next item
      // for it, and retyping the label every time is the cost this feature exists
      // to remove.
      ui.searchText = draft.tag ? `todo #${draft.tag} ` : "todo ";
      ui.focusField = "search";
      return;
    }
    // Nothing to create. An empty line opens the panel, and a line that is only a
    // label is already filtering it — neither moves the field, because the field
    // is where the user is typing. There is no second input inside the panel to
    // send them to.
    ui.todoPanelOpen = true;
    ui.focusField = "search";
  },
};

register(todoCommand);
