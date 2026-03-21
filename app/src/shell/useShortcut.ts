/**
 * Keyboard shortcut hook.
 *
 * Shortcut strings use a simple format:
 *   "mod+k"       -> Cmd+K on Mac, Ctrl+K on Windows/Linux
 *   "space"       -> Space key
 *   "shift+n"     -> Shift+N
 *   "mod+shift+z" -> Cmd+Shift+Z on Mac
 *
 * The hook registers/unregisters the listener on mount/unmount.
 */

import { useEffect } from "react";

const isMac =
  typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);

/**
 * Parse a shortcut string into its constituent parts.
 */
export interface ParsedShortcut {
  mod: boolean;
  shift: boolean;
  alt: boolean;
  key: string; // lowercase
}

export function parseShortcut(keys: string): ParsedShortcut {
  const parts = keys.toLowerCase().split("+").map((s) => s.trim());
  return {
    mod: parts.includes("mod"),
    shift: parts.includes("shift"),
    alt: parts.includes("alt"),
    key: parts.filter((p) => !["mod", "shift", "alt"].includes(p))[0] ?? "",
  };
}

/**
 * Check whether a keyboard event matches a parsed shortcut.
 */
export function matchesShortcut(event: KeyboardEvent, shortcut: ParsedShortcut): boolean {
  const modKey = isMac ? event.metaKey : event.ctrlKey;
  if (shortcut.mod && !modKey) return false;
  if (!shortcut.mod && modKey) return false;
  if (shortcut.shift !== event.shiftKey) return false;
  if (shortcut.alt !== event.altKey) return false;

  const eventKey = event.key.toLowerCase();
  // Handle special keys
  if (shortcut.key === "space") return eventKey === " " || event.code === "Space";
  return eventKey === shortcut.key;
}

/**
 * React hook: register a keyboard shortcut.
 *
 * @param keys  Shortcut string, e.g. "mod+k", "space", "shift+n"
 * @param handler Callback invoked when the shortcut fires
 * @param enabled Optional flag to disable the shortcut dynamically
 */
export function useShortcut(
  keys: string,
  handler: () => void,
  enabled: boolean = true,
): void {
  useEffect(() => {
    if (!enabled) return;

    const parsed = parseShortcut(keys);

    const onKeyDown = (e: KeyboardEvent) => {
      // Don't intercept shortcuts when user is typing in an input
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      if (matchesShortcut(e, parsed)) {
        e.preventDefault();
        e.stopPropagation();
        handler();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [keys, handler, enabled]);
}
