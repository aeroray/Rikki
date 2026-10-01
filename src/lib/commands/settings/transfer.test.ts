import { describe, expect, it } from "vitest";
import { exportStamp, transferCounts } from "$lib/commands/settings/transfer";
import { i18n } from "$lib/i18n";

i18n.locale = "en";

describe("naming an export", () => {
  it("shapes the local clock like the file name it becomes", () => {
    expect(exportStamp(new Date(2026, 9, 1, 14, 32, 5))).toBe("2026-10-01-143205");
    expect(exportStamp(new Date(2026, 0, 9, 3, 4, 5))).toBe("2026-01-09-030405");
  });

  /** The stamp is the middle of `rikki-<stamp>.json`, so it may not carry a
   * separator, a dot, or a second dash that the reader would parse as one. */
  it("holds only digits and single dashes", () => {
    expect(exportStamp(new Date(2026, 11, 31, 23, 59, 59))).toMatch(/^\d{4}-\d{2}-\d{2}-\d{6}$/);
  });
});

describe("describing what an import replaces", () => {
  it("names both stores and the settings, with the locale's separator", () => {
    const text = transferCounts(12, 8);
    expect(text).toContain("12");
    expect(text).toContain("8");
    expect(text).toContain(i18n.t("settings.transfer.settings"));
    expect(text).toContain(i18n.t("settings.transfer.join"));
  });

  it("still reads when there is nothing to replace", () => {
    expect(transferCounts(0, 0)).toContain("0");
  });
});
