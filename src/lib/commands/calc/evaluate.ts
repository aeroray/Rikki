import { create, all, format } from "mathjs";

const math = create(all, { number: "number" });

export type CalcOutcome =
  | { ok: true; display: string }
  | { ok: false; reason: "empty" | "pending" | "invalid" };

export const CALC_EXAMPLES = [
  "3*4+5",
  "sin(30°)",
  "2+3i",
  "5 cm to inch",
  "5!",
] as const;

const TRAILING_OP = /[+\-*/^%(,]$/;

export function evaluateExpression(raw: string): CalcOutcome {
  const expr = normalize(raw);
  if (!expr) return { ok: false, reason: "empty" };
  if (isPending(expr)) return { ok: false, reason: "pending" };

  try {
    const value = math.parser().evaluate(expr);
    if (!isDisplayable(value)) return { ok: false, reason: "invalid" };
    const display = formatValue(value);
    if (!display) return { ok: false, reason: "invalid" };
    return { ok: true, display };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

export function normalize(raw: string): string {
  let expr = raw.trim().replace(/^=+/, "").replace(/=+$/, "").trim();
  expr = expr
    .replaceAll("×", "*")
    .replaceAll("÷", "/")
    .replaceAll("π", "(pi)")
    .replaceAll("Π", "(pi)")
    .replace(/√\s*\(/g, "sqrt(")
    .replace(/√\s*(\d+(?:\.\d+)?)/g, "sqrt($1)")
    .replaceAll("√", "sqrt")
    .replaceAll("²", "^2")
    .replaceAll("³", "^3")
    .replaceAll("°", " deg");
  // Postfix percent: 15% → 15/100. "10 % 3" stays modulo.
  expr = expr.replace(/(\d+(?:\.\d+)?|\))%(?!\s*[\d(.])/g, "$1/100");
  return expr.trim();
}

function isPending(expr: string): boolean {
  if (TRAILING_OP.test(expr)) return true;
  let depth = 0;
  for (const char of expr) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
  }
  return depth > 0;
}

function isDisplayable(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "function") return false;
  return true;
}

function formatValue(value: unknown): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    if (Object.is(value, -0)) return "0";
    if (Number.isInteger(value)) return String(value);
  }
  try {
    return format(value as never, { precision: 12, notation: "auto" });
  } catch {
    return String(value);
  }
}
