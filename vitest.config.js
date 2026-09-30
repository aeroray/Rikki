import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

// A plain `$lib` alias rather than the SvelteKit plugin. The modules under test
// are pure TypeScript, but `registry.ts` reaches the i18n store, so `.svelte.ts`
// runes still have to compile — which is what the svelte plugin is here for.
export default defineConfig({
  plugins: [svelte({ hot: false })],
  resolve: {
    alias: { $lib: fileURLToPath(new URL("./src/lib", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
