import type { ThemeId, ThemePref } from "$lib/commands/types";

/**
 * Theme preference: what the user picked, and what that means right now.
 *
 * The preference and the painted theme are two different things as soon as
 * `system` exists, and keeping them apart is what stops the rest of the app from
 * having to ask "and what does `system` mean today?" every time it wants a
 * colour. `resolveTheme` is the one place that answers it.
 */

/** The choices the picker offers, in the order it shows them. */
export const THEME_PREFS: ThemePref[] = ["system", "dark", "light"];

/**
 * Whether the OS is asking for a dark interface.
 *
 * Dark is the fallback when there is no `matchMedia` — a test runner, or a
 * browser without it — because that is the palette's own default and the one
 * its canvas was designed around.
 */
export function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** The theme to paint for a preference. */
export function resolveTheme(pref: ThemePref, prefersDark: boolean): ThemeId {
  if (pref === "system") return prefersDark ? "dark" : "light";
  return pref;
}

/**
 * A stored value, narrowed to a preference.
 *
 * Anything unrecognised — an older file that only ever held `light` or `dark`, a
 * file edited by hand — lands on `system` rather than being rejected, because
 * following the OS is the answer that needs no further decision from the user.
 */
export function parseThemePref(value: string | null | undefined): ThemePref {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}
