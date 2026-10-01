import { clipboard } from "$lib/stores/clipboard.svelte";
import { ui } from "$lib/stores/ui.svelte";
import { i18n } from "$lib/i18n";
import { applyRecentColor, copyColorValue } from "./actions";
import { colorQuery, parseColor } from "./parse";
import { recentColors } from "./recents";

/**
 * What the arrow keys walk in the colour panel.
 *
 * The panel shows two lists — the formats of the colour being typed, and the
 * strip of recent ones — and the keyboard has to treat them as one, in the order
 * they appear on screen. This module is that order, shared between the panel that
 * renders it and the key handler that moves through it: two copies of "the formats
 * come first" would drift, and the highlight would land on the wrong row.
 */
export type ColorOption =
  | { id: string; kind: "format"; label: string; value: string }
  | { id: string; kind: "recent"; hex: string; rgbaCss: string; translucent: boolean };

/** The colour the query currently parses to, or null. */
export function parsedColor() {
  return parseColor(colorQuery(ui.searchText, ui.commandRest, ui.matchedCommand?.id ?? null));
}

export function colorOptions(): ColorOption[] {
  const parsed = parsedColor();
  const formats: ColorOption[] = parsed
    ? [
        { id: "hex", kind: "format", label: i18n.t("color.hex"), value: parsed.hex },
        { id: "rgb", kind: "format", label: i18n.t("color.rgb"), value: parsed.rgb },
        { id: "hsl", kind: "format", label: i18n.t("color.hsl"), value: parsed.hsl },
        { id: "rgba", kind: "format", label: i18n.t("color.rgba"), value: parsed.rgbaCss },
        { id: "hsla", kind: "format", label: i18n.t("color.hsla"), value: parsed.hsla },
      ]
    : [];

  const recents: ColorOption[] = recentColors(clipboard.entries).map((color) => ({
    id: color.hex,
    kind: "recent",
    hex: color.hex,
    rgbaCss: color.rgbaCss,
    translucent: color.rgba.a < 1 - 0.5 / 255,
  }));

  return [...formats, ...recents];
}

/** Copies the highlighted format, or applies the highlighted recent colour. */
export function runColorOption(index: number): void {
  const option = colorOptions()[index];
  if (!option) return;
  if (option.kind === "format") {
    void copyColorValue(option.value);
    return;
  }
  applyRecentColor(option.hex);
}
