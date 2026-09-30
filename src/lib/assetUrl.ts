import { convertFileSrc } from "@tauri-apps/api/core";

/**
 * A filesystem path as a URL the webview is allowed to load, or `""` when there
 * is none.
 *
 * `convertFileSrc` only means anything inside the Tauri webview — it throws
 * anywhere else, and the vitest run is anywhere else — so a path that cannot be
 * turned into a URL reads as "no image" rather than taking the row down with it.
 */
export function assetUrl(path: string): string {
  if (!path) return "";
  try {
    return convertFileSrc(path);
  } catch {
    return "";
  }
}
