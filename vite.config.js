import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [tailwindcss(), sveltekit()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // `src-tauri` is built by cargo, not bundled.
      //
      // The `*.tmp`/`*.tmpdir` patterns are for editors and tools that write a
      // file through a temporary next to it — this repository is edited that way.
      // On Windows the watcher can reach the temp file while the writer still
      // holds it, and `EBUSY` from chokidar is not a warning: it kills the dev
      // server, which leaves the app window running on the page it had already
      // loaded. A fix that never reaches the running app looks exactly like a fix
      // that did not work.
      ignored: ["**/src-tauri/**", "**/*.tmp", "**/*.tmpdir", "**/*.tmpdir/**"],
    },
  },
}));
