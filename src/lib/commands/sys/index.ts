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
    { id: "lock", prefix: "lock", title: "锁屏", description: "锁定当前会话", icon: "Lock" },
    () => invoke("lock_screen"),
  ),
  action(
    { id: "sleep", prefix: "sleep", title: "休眠", description: "将电脑置于睡眠状态", icon: "Moon" },
    () => sleep(),
  ),
  action(
    {
      id: "shutdown",
      prefix: "shutdown",
      title: "关机",
      description: "关闭电脑",
      icon: "Power",
    },
    () => shutdown(),
  ),
  action(
    { id: "reboot", prefix: "reboot", title: "重启", description: "重新启动电脑", icon: "RotateCw" },
    () => reboot(),
  ),
  action(
    { id: "logout", prefix: "logout", title: "注销", description: "注销当前用户", icon: "LogOut" },
    () => logout(),
  ),
];

for (const command of commands) {
  register(command);
}
