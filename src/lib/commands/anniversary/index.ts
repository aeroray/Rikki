import { register } from "$lib/commands/registry";
import type { Command } from "$lib/commands/types";
import { anniversaries } from "$lib/stores/anniversaries.svelte";
import { ui } from "$lib/stores/ui.svelte";
import { startAnniversaryCreate } from "./actions";

export const anniversaryCommand: Command = {
  id: "anniversary",
  prefix: "ann",
  aliases: ["anniversary", "days", "纪念日", "倒计时"],
  title: "Anniversary",
  titleZh: "纪念日",
  description: "Count down to birthdays and anniversaries",
  descriptionZh: "生日和纪念日倒计时",
  icon: "CalendarHeart",
  run(input) {
    const text = input.trim();
    if (ui.view !== "anniversary") {
      ui.searchText = text ? `ann ${text}` : "ann ";
      ui.focusField = "search";
      return;
    }
    // Enter from the search field opens the create form when the list is empty.
    if (!anniversaries.items.length) startAnniversaryCreate();
  },
};

register(anniversaryCommand);
