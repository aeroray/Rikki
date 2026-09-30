import { register } from "$lib/commands/registry";
import { SEARCH_ENGINES, searchUrl } from "$lib/commands/settings/engines";
import type { Command } from "$lib/commands/types";
import { openWebUrl } from "$lib/commands/web/open";
import { i18n } from "$lib/i18n";
import { ui } from "$lib/stores/ui.svelte";

const WEB_SEARCH = [
  { prefix: "gg", engineId: "google", title: "Google", titleZh: "谷歌", description: "Search with Google", descriptionZh: "使用 Google 搜索" },
  { prefix: "bd", engineId: "baidu", title: "Baidu", titleZh: "百度", description: "Search with Baidu", descriptionZh: "使用百度搜索" },
  { prefix: "bing", engineId: "bing", title: "Bing", titleZh: "必应", description: "Search with Bing", descriptionZh: "使用必应搜索" },
  { prefix: "ddg", engineId: "duckduckgo", title: "DuckDuckGo", titleZh: undefined, description: "Search with DuckDuckGo", descriptionZh: "使用 DuckDuckGo 搜索" },
  { prefix: "sogou", engineId: "sogou", title: "Sogou", titleZh: "搜狗", description: "Search with Sogou", descriptionZh: "使用搜狗搜索" },
] as const;

/**
 * The engine behind each web-search command, keyed by command id.
 *
 * `SearchBar` reads this to put the engine's own mark in the field, so it has to
 * be the same mapping the commands below are built from rather than a second
 * table that can drift away from it.
 */
const ENGINE_BY_COMMAND = new Map<string, string>(
  WEB_SEARCH.map((item) => [`web-${item.prefix}`, item.engineId]),
);

/** The engine a command searches with, or `null` for a command that is not one. */
export function engineIdForCommand(commandId: string): string | null {
  return ENGINE_BY_COMMAND.get(commandId) ?? null;
}

for (const item of WEB_SEARCH) {
  const engine = SEARCH_ENGINES.find((entry) => entry.id === item.engineId)!;
  const command: Command = {
    id: `web-${item.prefix}`,
    prefix: item.prefix,
    title: item.title,
    titleZh: item.titleZh || undefined,
    description: item.description,
    descriptionZh: item.descriptionZh,
    icon: "Globe",
    run(input) {
      const query = input.trim();
      if (!query) {
        ui.searchText = `${item.prefix} `;
        ui.focusField = "search";
        return;
      }
      void openWebUrl(searchUrl(engine, query))
        .then(() => ui.beginHide({ reset: true }))
        .catch(() => ui.flash(i18n.t("search.openFailed")));
    },
  };
  register(command);
}
