/**
 * Hook to register a command in the shell command system.
 *
 * Commands are automatically unregistered when the component unmounts.
 */

import { useEffect } from "react";
import { useShellStore } from "./store.js";
import type { Command } from "./types.js";

/**
 * Register a command with the command system. The command will be
 * available in the command palette and can be triggered programmatically.
 *
 * @param id       Unique command identifier (e.g. "transport.play")
 * @param handler  Function to execute when the command fires
 * @param options  Optional label, category, and default shortcut
 */
export function useCommand(
  id: string,
  handler: () => void,
  options?: { label?: string; category?: string; shortcut?: string },
): void {
  const registerCommand = useShellStore((s) => s.registerCommand);
  const unregisterCommand = useShellStore((s) => s.unregisterCommand);

  useEffect(() => {
    const cmd: Command = {
      id,
      label: options?.label ?? id,
      category: options?.category,
      shortcut: options?.shortcut,
      execute: handler,
    };
    registerCommand(cmd);
    return () => unregisterCommand(id);
  }, [id, handler, options?.label, options?.category, options?.shortcut, registerCommand, unregisterCommand]);
}
