import { parseColor } from "$lib/commands/color/parse";
import { searchUrl } from "$lib/commands/settings/engines";
import { i18n } from "$lib/i18n";
import { settings } from "$lib/stores/settings.svelte";
import { ui } from "$lib/stores/ui.svelte";
import { openUrl } from "@tauri-apps/plugin-opener";

export const FALLBACK_MIN_LENGTH = 2;

export function canFallbackSearch(query: string, hitCount: number): boolean {
  if (hitCount !== 0 || query.trim().length < FALLBACK_MIN_LENGTH) return false;
  if (ui.matchedCommand && ui.commandRest.trim()) return false;
  if (parseColor(query.trim())) return false;
  return true;
}

export async function runFallbackSearch(query: string): Promise<boolean> {
  const text = query.trim();
  if (text.length < FALLBACK_MIN_LENGTH) return false;
  try {
    await openUrl(searchUrl(settings.engine, text));
    ui.beginHide({ reset: true });
    return true;
  } catch {
    // Staying open with no feedback looked identical to a successful search.
    ui.flash(i18n.t("search.openFailed"));
    return false;
  }
}
