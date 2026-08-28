import { defaultHotkey, isMac } from "$lib/commands/settings/engines";

const ARROWS: Record<string, string> = {
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
};

export function eventToHotkey(event: KeyboardEvent): string | null {
  if (event.isComposing) return null;
  if (event.key === "Escape" || event.key === "Tab" || event.key === "Dead") return null;
  if (event.key === "Shift" || event.key === "Control" || event.key === "Alt" || event.key === "Meta") {
    return null;
  }

  const mods: string[] = [];
  if (event.ctrlKey) mods.push("Control");
  if (event.altKey) mods.push("Alt");
  if (event.metaKey) mods.push(isMac() ? "Command" : "Super");
  if (event.shiftKey) mods.push("Shift");
  if (!mods.some((mod) => mod !== "Shift")) return null;

  const key = hotkeyKey(event);
  if (!key) return null;
  return [...mods, key].join("+");
}

function hotkeyKey(event: KeyboardEvent): string | null {
  if (event.key === " " || event.code === "Space") return "Space";
  if (/^F\d{1,2}$/.test(event.key)) return event.key;
  if (event.key.length === 1 && /[a-zA-Z0-9]/.test(event.key)) return event.key.toUpperCase();
  return ARROWS[event.key] ?? null;
}

export function formatHotkey(shortcut: string): string {
  const value = (shortcut.trim() || defaultHotkey()).split("+");
  const mac = isMac();
  return value
    .map((part) => {
      switch (part) {
        case "Command":
        case "Cmd":
          return mac ? "⌘" : "Ctrl";
        case "Control":
        case "Ctrl":
          return mac ? "⌃" : "Ctrl";
        case "Alt":
        case "Option":
          return mac ? "⌥" : "Alt";
        case "Shift":
          return mac ? "⇧" : "Shift";
        case "Super":
        case "Meta":
          return mac ? "⌘" : "Win";
        case "Space":
          return "Space";
        default:
          return part;
      }
    })
    .join(mac ? "" : "+");
}
