import { register } from "$lib/commands/registry";
import type { Command } from "$lib/commands/types";
import { calcHistory } from "$lib/stores/calcHistory.svelte";
import { ui } from "$lib/stores/ui.svelte";
import { evaluateExpression } from "./evaluate";

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
    const outcome = evaluateExpression(expr);
    if (!outcome.ok) return;
    calcHistory.add(expr, outcome.display);
    void copyResult(outcome.display);
  },
};

async function copyResult(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    ui.beginHide();
  } catch {
    // Keep the palette open if the clipboard is unavailable.
  }
}

register(calcCommand);
