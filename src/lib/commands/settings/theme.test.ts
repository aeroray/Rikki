import { describe, expect, it } from "vitest";
import { parseThemePref, resolveTheme, systemPrefersDark } from "$lib/commands/settings/theme";

describe("resolving a theme preference", () => {
  it("paints the theme the user named", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("follows the OS when the user asked it to", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("reading a stored preference", () => {
  it("keeps the three values it knows", () => {
    expect(parseThemePref("system")).toBe("system");
    expect(parseThemePref("dark")).toBe("dark");
    expect(parseThemePref("light")).toBe("light");
  });

  /**
   * A file written before `system` existed holds only `light` or `dark`, and one
   * edited by hand can hold anything. Both land on the answer that needs no
   * further decision from the user rather than on an error.
   */
  it("falls back to following the system", () => {
    expect(parseThemePref("neon")).toBe("system");
    expect(parseThemePref("")).toBe("system");
    expect(parseThemePref(undefined)).toBe("system");
    expect(parseThemePref(null)).toBe("system");
  });
});

describe("asking the OS", () => {
  /** No `matchMedia` is a test runner or an old engine; dark is the app's own default. */
  it("answers dark where there is nothing to ask", () => {
    expect(systemPrefersDark()).toBe(true);
  });
});
