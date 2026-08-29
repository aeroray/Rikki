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
  expr = expr.replace(/(\d+(?:\.\d+)?|\))%(?!\s*[\d(.])/g, "$1/100");
  return expr.trim();
}

export function isPending(expr: string): boolean {
  if (TRAILING_OP.test(expr)) return true;
  let depth = 0;
  for (const char of expr) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
  }
  return depth > 0;
}

export function isDisplayable(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "function") return false;
  return true;
}
