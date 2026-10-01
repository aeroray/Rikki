#!/usr/bin/env node
/**
 * Rebuilds every desktop icon from the approved master.
 *
 * `tauri icon` writes the whole set the bundler, the tray and the Windows tile
 * assets need — the PNGs, the `.ico` and the `.icns` — into `src-tauri/icons/`.
 * It takes the master exactly as it is, so any transparent margin in the master
 * is carried into every size and the artwork ends up looking small wherever the
 * icon is drawn. `design/brand/icon-source.png` is therefore trimmed to its
 * content once, by hand, and this script is not where that gets fixed.
 *
 * Two of the files the web needs are not Tauri's to make: the browser favicon is
 * the 64px PNG and the logo the READMEs show is the 512px one, so both are
 * copied out of the generated set. What the CLI also writes for iOS and Android
 * is removed again, because this app is a desktop launcher and the brand README
 * promises the repository holds desktop assets only.
 *
 * `icons/tray.png` is deliberately not generated here. The tray wants the
 * transparent mark rather than the backed icon — a black tile on a dark taskbar
 * is invisible — and producing it means cropping `design/brand/mark.png` to its
 * content, which Node cannot do without an image library. The brand README says
 * how it was made.
 *
 * Run with `pnpm icons` after changing the master.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const master = join("design", "brand", "icon-source.png");
const iconsDir = join(root, "src-tauri", "icons");
const cli = join(root, "node_modules", "@tauri-apps", "cli", "tauri.js");

/** Taken from the generated set rather than generated a second time. */
const WEB_ASSETS = [
  { from: "64x64.png", to: join("static", "favicon.png") },
  { from: "icon.png", to: join("static", "logo.png") },
];

/** Written for platforms this app does not target. */
const MOBILE_ASSETS = ["android", "ios"];

function tauri(args) {
  // The CLI's own entry point, run by the Node that is already running: `pnpm`
  // is a `.cmd` shim on Windows, which needs a shell, and a shell would re-parse
  // the paths this file builds.
  execFileSync(process.execPath, [cli, "icon", ...args], { cwd: root, stdio: "inherit" });
}

if (!existsSync(cli)) {
  console.error(`missing Tauri CLI at ${cli} — run pnpm install first`);
  process.exit(1);
}
if (!existsSync(join(root, master))) {
  console.error(`missing brand master: ${master}`);
  process.exit(1);
}

// The default set, then the one size it does not cover on its own: `--png`
// replaces the default set rather than adding to it, so this runs twice.
tauri([master]);
tauri([master, "--png", "64"]);

for (const dir of MOBILE_ASSETS) {
  rmSync(join(iconsDir, dir), { recursive: true, force: true });
}

for (const { from, to } of WEB_ASSETS) {
  const source = join(iconsDir, from);
  if (!existsSync(source)) {
    console.error(`tauri icon did not produce ${from}`);
    process.exit(1);
  }
  copyFileSync(source, join(root, to));
  console.log(`icons: ${from} -> ${to}`);
}
