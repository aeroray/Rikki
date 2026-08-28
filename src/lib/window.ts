import { invoke } from "@tauri-apps/api/core";

export async function requestHidePalette(): Promise<void> {
  try {
    await invoke("request_hide_window");
  } catch {
    // Browser preview has no Tauri runtime; CSS exit still runs.
  }
}
