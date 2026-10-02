import { register } from "$lib/commands/registry";
import type { Command } from "$lib/commands/types";
import { ui } from "$lib/stores/ui.svelte";

/**
 * The five system commands.
 *
 * All five open the same panel, which is where a delay is chosen. They used to run
 * the moment Enter was pressed, which meant there was no way to say "in an hour" —
 * and the answer to that is one panel, not five.
 */
const commands: Array<Omit<Command, "run"> & { prefix: string }> = [
  {
    id: "lock",
    prefix: "lock",
    title: "Lock",
    titleZh: "锁屏",
    description: "Lock now, or after a delay",
    descriptionZh: "立即锁屏，或指定时间后锁屏",
    icon: "Lock",
    aliases: ["lockscreen"],
  },
  {
    id: "sleep",
    prefix: "sleep",
    title: "Sleep",
    titleZh: "休眠",
    description: "Sleep now, or after a delay",
    descriptionZh: "立即休眠，或指定时间后休眠",
    icon: "Moon",
    aliases: ["suspend"],
  },
  {
    id: "shutdown",
    prefix: "shutdown",
    title: "Shutdown",
    titleZh: "关机",
    description: "Shut down now, or after a delay",
    descriptionZh: "立即关机，或指定时间后关机",
    icon: "Power",
    aliases: ["off"],
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
  },
  {
    id: "logout",
    prefix: "logout",
    title: "Logout",
    titleZh: "注销",
    description: "Sign out now, or after a delay",
    descriptionZh: "立即注销，或指定时间后注销",
    icon: "LogOut",
    aliases: ["signout"],
  },
];

for (const command of commands) {
  register({
    ...command,
    run(input) {
      // `shutdown 30` from the root list goes straight to the panel with the delay
      // already typed, so the mouse-free path is two keystrokes shorter.
      const rest = input.trim();
      ui.searchText = rest ? `${command.prefix} ${rest}` : `${command.prefix} `;
      ui.focusField = "search";
    },
  });
}
