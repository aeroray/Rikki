import { invoke } from "@tauri-apps/api/core";

/**
 * Opens a URL in the browser chosen in settings, or the system default.
 *
 * Deliberately not `openUrl` from `@tauri-apps/plugin-opener`: that plugin only
 * ever asks the OS for the default browser. The choice lives in `settings.json`
 * and the executable has to be verified before it is launched, so the call goes
 * through Rust, which re-reads the setting and checks the file each time.
 */
export async function openWebUrl(url: string): Promise<void> {
  await invoke("open_web_url", { url });
}
