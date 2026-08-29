import { copyAndHide } from "$lib/clipboard/write";
import { register } from "$lib/commands/registry";
import type { Command } from "$lib/commands/types";
import { calcHistory } from "$lib/stores/calcHistory.svelte";
import { ui } from "$lib/stores/ui.svelte";
import { calcEngine } from "./engine.svelte";

export const calcCommand: Command = {
  id: "calc",
  prefix: "calc",
  title: "Calculator",
  titleZh: "计算器",
  description: "Evaluate expressions",
  descriptionZh: "计算表达式",
  icon: "Calculator",
  run(input) {
    const expr = input.trim();
    if (!expr) {
      ui.searchText = "calc ";
      ui.focusField = "search";
      return;
    }
    void calcEngine.ensure().then(() => {
      const outcome = calcEngine.evaluate(expr);
      if (!outcome.ok) return;
      calcHistory.add(expr, outcome.display);
      void copyAndHide(outcome.display);
    });
  },
};

register(calcCommand);
