import { invoke } from "@tauri-apps/api/core";
import { logout, sleep } from "tauri-plugin-power-manager-api";
import { register } from "$lib/commands/registry";
import type { Command } from "$lib/commands/types";
import { i18n } from "$lib/i18n";
import { ui } from "$lib/stores/ui.svelte";

function action(
  command: Omit<Command, "run" | "mode">,
  run: () => Promise<void>,
): Command {
  return {
    ...command,
    mode: "action",
    run() {
      void run()
        .then(() => ui.beginHide({ reset: true }))
        .catch(() => ui.flash(i18n.t("sys.failed")));
    },
  };
}

const commands: Command[] = [
  action(
    {
      id: "lock",
      prefix: "lock",
      title: "Lock",
      titleZh: "锁屏",
      description: "Lock this session",
      descriptionZh: "锁定当前会话",
      icon: "Lock",
    },
    () => invoke("lock_screen"),
  ),
  action(
    {
      id: "sleep",
      prefix: "sleep",
      title: "Sleep",
      titleZh: "休眠",
      description: "Put the computer to sleep",
      descriptionZh: "将电脑置于睡眠状态",
      icon: "Moon",
    },
    () => sleep(),
  ),
  // Shutdown and reboot open a panel rather than running at once: both take a
  // delay, and the panel is where the delay is chosen. Enter on the row opens it,
  // and every key inside belongs to the panel.
  {
    id: "shutdown",
    prefix: "shutdown",
    title: "Shutdown",
    titleZh: "关机",
    description: "Shut down now, or after a delay",
    descriptionZh: "立即关机，或指定时间后关机",
    icon: "Power",
    aliases: ["off"],
    run(input) {
      const rest = input.trim();
      // `shutdown 30` from the root list goes straight to the panel with the
      // delay already typed, so the mouse-free path is two keystrokes shorter.
      ui.searchText = rest ? `shutdown ${rest}` : "shutdown ";
      ui.focusField = "search";
    },
  },
  {
    id: "reboot",
    prefix: "reboot",
    title: "Reboot",
    titleZh: "重启",
    description: "Restart now, or after a delay",
    descriptionZh: "立即重启，或指定时间后重启",
    icon: "RotateCw",
    aliases: ["restart"],
    run(input) {
      const rest = input.trim();
      ui.searchText = rest ? `reboot ${rest}` : "reboot ";
      ui.focusField = "search";
    },
  },
  action(
    {
      id: "logout",
      prefix: "logout",
      title: "Logout",
      titleZh: "注销",
      description: "Sign out of this account",
      descriptionZh: "注销当前用户",
      icon: "LogOut",
      confirm: true,
    },
    () => logout(),
  ),
];

for (const command of commands) {
  register(command);
}
