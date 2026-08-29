import { isDisplayable, isPending, normalize, type CalcOutcome } from "./evaluate";

type MathEngine = {
  parser: () => { evaluate: (expr: string) => unknown };
};

class CalcEngine {
  ready = $state(false);
  private math: MathEngine | null = null;
  private formatValueFn: ((value: unknown) => string) | null = null;
  private pending: Promise<void> | null = null;

  ensure(): Promise<void> {
    this.pending ??= this.load();
    return this.pending;
  }

  evaluate(raw: string): CalcOutcome {
    const expr = normalize(raw);
    if (!expr) return { ok: false, reason: "empty" };
    if (isPending(expr)) return { ok: false, reason: "pending" };
    if (!this.math || !this.formatValueFn) {
      void this.ensure();
      return { ok: false, reason: "pending" };
    }

    try {
      const value = this.math.parser().evaluate(expr);
      if (!isDisplayable(value)) return { ok: false, reason: "invalid" };
      const display = this.formatValueFn(value);
      if (!display) return { ok: false, reason: "invalid" };
      return { ok: true, display };
    } catch {
      return { ok: false, reason: "invalid" };
    }
  }

  private async load() {
    const { create, all, format } = await import("mathjs");
    this.math = create(all, { number: "number" });
    this.formatValueFn = (value: unknown) => {
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
    };
    this.ready = true;
  }
}

export const calcEngine = new CalcEngine();
