import { hasText, readText } from "tauri-plugin-clipboard-x-api";

const PLACEHOLDER_RE = /\{\{\s*(date|time|clipboard)\s*\}\}/i;

export function formatSnippetDate(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatSnippetTime(now = new Date()): string {
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  const second = String(now.getSeconds()).padStart(2, "0");
  return `${hour}:${minute}:${second}`;
}

export function hasSnippetPlaceholder(content: string): boolean {
  return PLACEHOLDER_RE.test(content);
}

export async function expandSnippetContent(content: string, now = new Date()): Promise<string> {
  if (!PLACEHOLDER_RE.test(content)) return content;

  let clipboardText = "";
  if (/\{\{\s*clipboard\s*\}\}/i.test(content)) {
    try {
      clipboardText = (await hasText()) ? await readText() : "";
    } catch {
      clipboardText = "";
    }
  }

  const date = formatSnippetDate(now);
  const time = formatSnippetTime(now);
  return content.replace(/\{\{\s*(date|time|clipboard)\s*\}\}/gi, (_match, name: string) => {
    const key = name.toLowerCase();
    if (key === "date") return date;
    if (key === "time") return time;
    return clipboardText;
  });
}
