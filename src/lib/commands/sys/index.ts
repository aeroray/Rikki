import { invoke } from "@tauri-apps/api/core";
import { logout, reboot, shutdown, sleep } from "tauri-plugin-power-manager-api";
import { register } from "$lib/commands/registry";
import type { Command } from "$lib/commands/types";
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
        .then(() => ui.beginHide())
        .catch(() => {});
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
  action(
    {
      id: "shutdown",
      prefix: "shutdown",
      title: "Shutdown",
      titleZh: "关机",
      description: "Shut down the computer",
      descriptionZh: "关闭电脑",
      icon: "Power",
    },
    () => shutdown(),
  ),
  action(
    {
      id: "reboot",
      prefix: "reboot",
      title: "Reboot",
      titleZh: "重启",
      description: "Restart the computer",
      descriptionZh: "重新启动电脑",
      icon: "RotateCw",
    },
    () => reboot(),
  ),
  action(
    {
      id: "logout",
      prefix: "logout",
      title: "Logout",
      titleZh: "注销",
      description: "Sign out of this account",
      descriptionZh: "注销当前用户",
      icon: "LogOut",
    },
    () => logout(),
  ),
];

for (const command of commands) {
  register(command);
}
