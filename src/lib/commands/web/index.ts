import { openUrl } from "@tauri-apps/plugin-opener";
import { register } from "$lib/commands/registry";
import { SEARCH_ENGINES, searchUrl } from "$lib/commands/settings/engines";
import type { Command } from "$lib/commands/types";
import { ui } from "$lib/stores/ui.svelte";

const WEB_SEARCH = [
  { prefix: "gg", engineId: "google", title: "谷歌 · Google", description: "使用 Google 搜索" },
  { prefix: "bd", engineId: "baidu", title: "百度 · Baidu", description: "使用百度搜索" },
  { prefix: "bing", engineId: "bing", title: "必应 · Bing", description: "使用必应搜索" },
  { prefix: "ddg", engineId: "duckduckgo", title: "DuckDuckGo", description: "使用 DuckDuckGo 搜索" },
  { prefix: "sogou", engineId: "sogou", title: "搜狗 · Sogou", description: "使用搜狗搜索" },
] as const;

for (const item of WEB_SEARCH) {
  const engine = SEARCH_ENGINES.find((entry) => entry.id === item.engineId)!;
  const command: Command = {
    id: `web-${item.prefix}`,
    prefix: item.prefix,
    title: item.title,
    description: item.description,
    icon: "Globe",
    run(input) {
      const query = input.trim();
      if (!query) {
        ui.searchText = `${item.prefix} `;
        ui.focusField = "search";
        return;
      }
      void openUrl(searchUrl(engine, query))
        .then(() => ui.beginHide())
        .catch(() => {});
    },
  };
  register(command);
}
