import { describe, expect, it } from "vitest";
import { bytes, fill, percent, shortBrand } from "$lib/commands/sysmon/format";

describe("shortBrand", () => {
  /**
   * The CPU line shares half a row with the memory figure, so the vendor's
   * boilerplate has to go. Every case here is a real brand string from
   * `sysinfo` — the regexes were written against these, not imagined.
   */
  it("keeps the model and drops the marketing words", () => {
    expect(shortBrand("12th Gen Intel(R) Core(TM) i5-12400F")).toBe("i5-12400F");
    expect(shortBrand("Intel(R) Xeon(R) W-2145 CPU @ 3.70GHz")).toBe("Xeon W-2145");
    expect(shortBrand("Intel Core i7-9750H CPU @ 2.60GHz")).toBe("i7-9750H");
  });

  it("drops the core count rather than leaving it dangling", () => {
    // Stripping the bare word "Core" first left "Ryzen 7 5800X 8-", which is
    // what this case exists to catch.
    expect(shortBrand("AMD Ryzen 7 5800X 8-Core Processor")).toBe("Ryzen 7 5800X");
    expect(shortBrand("AMD Ryzen 9 7950X 16-Core Processor")).toBe("Ryzen 9 7950X");
  });

  it("leaves a brand it does not recognise alone", () => {
    expect(shortBrand("Apple M3 Pro")).toBe("Apple M3 Pro");
    expect(shortBrand("Snapdragon(R) X Elite - X1E80100")).toBe("Snapdragon X Elite - X1E80100");
  });

  it("never returns an empty string", () => {
    // A brand made entirely of words the filter removes would otherwise leave the
    // line blank, which reads as a rendering bug rather than a missing name.
    expect(shortBrand("Intel Core Processor")).not.toBe("");
  });
});

describe("byte and percentage formatting", () => {
  it("scales to the largest unit that keeps the number small", () => {
    expect(bytes(0)).toBe("0 B");
    expect(bytes(512)).toBe("512 B");
    expect(bytes(1024)).toBe("1.0 KB");
    expect(bytes(1024 * 1024 * 1.5)).toBe("1.5 MB");
    // Above 100 the decimal is noise, so it goes.
    expect(bytes(1024 * 1024 * 412)).toBe("412 MB");
  });

  it("survives a zero total", () => {
    // Dividing by it would be NaN, which renders as "NaN%" rather than failing.
    expect(fill(100, 0)).toBe(0);
    expect(percent(fill(100, 0))).toBe("0%");
  });

  it("clamps to the range the bar can draw", () => {
    expect(fill(200, 100)).toBe(100);
    expect(fill(50, 100)).toBe(50);
  });
});
