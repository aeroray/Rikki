import { register } from "$lib/commands/registry";
import type { Command } from "$lib/commands/types";
import { ui } from "$lib/stores/ui.svelte";

export const calendarCommand: Command = {
  id: "calendar",
  // `cal` is free: the calculator registers `calc`, and `match()` requires a
  // whole prefix or prefix+space, so the two never shadow each other.
  prefix: "cal",
  aliases: ["calendar", "date", "日历", "万年历"],
  title: "Calendar",
  titleZh: "万年历",
  description: "Month calendar with lunar dates",
  descriptionZh: "带农历的月历",
  icon: "CalendarDays",
  run(input) {
    const text = input.trim();
    if (ui.view !== "calendar") {
      ui.searchText = text ? `cal ${text}` : "cal ";
      ui.focusField = "search";
    }
  },
};

register(calendarCommand);
