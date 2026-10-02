import {
  Activity,
  Binary,
  Braces,
  Calculator,
  CalendarDays,
  CalendarHeart,
  Clipboard,
  Clock,
  Compass,
  Download,
  Droplet,
  Eraser,
  FileText,
  Globe,
  Keyboard,
  Languages,
  ListTodo,
  Lock,
  LogOut,
  Moon,
  Palette,
  Power,
  QrCode,
  RefreshCw,
  Rocket,
  RotateCw,
  ScanQrCode,
  Search,
  Settings,
  Smile,
  Timer,
  Upload,
} from "@lucide/svelte";

/**
 * Every glyph a command or a settings row can name, in one table.
 *
 * Commands and settings rows each carried their own copy, and the search field
 * needed a third: it draws the current command's glyph, so it has to resolve the
 * same names. Three tables for one vocabulary is three places for a name to be
 * missing, and a missing name silently becomes the fallback magnifier — which
 * looks deliberate.
 */
export const ICONS = {
  Activity,
  Binary,
  Braces,
  Calculator,
  CalendarDays,
  CalendarHeart,
  Clipboard,
  Clock,
  Compass,
  Download,
  Droplet,
  Eraser,
  FileText,
  Globe,
  Keyboard,
  Languages,
  ListTodo,
  Lock,
  LogOut,
  Moon,
  Palette,
  Power,
  QrCode,
  RefreshCw,
  Rocket,
  RotateCw,
  ScanQrCode,
  Search,
  Settings,
  Smile,
  Timer,
  Upload,
};

/** The glyph for a name, or the magnifier when there is none to draw. */
export function commandIcon(name: string | undefined) {
  return ICONS[name as keyof typeof ICONS] ?? Search;
}
