/**
 * Concrete Tauri IPC bridge implementation.
 *
 * Each function maps to exactly one #[tauri::command] on the Rust side.
 * The `invoke` import is lazy so the module can be loaded in tests where
 * @tauri-apps/api is unavailable (tests should mock via the BridgeCommands
 * interface instead).
 */

import type {
  BridgeCommands,
  NodeId,
  ConnectionId,
  SignalStats,
  DiagnosticReport,
  ExportOptions,
} from "./types.js";
import type { Vec2, PortRef } from "@chord/document-model";

// ---------------------------------------------------------------------------
// Tauri invoke wrapper
// ---------------------------------------------------------------------------

/**
 * Lazy-loaded invoke so the module can be imported in non-Tauri environments
 * (e.g. tests, Storybook) without throwing at import time.
 */
async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

// ---------------------------------------------------------------------------
// Bridge singleton implementing BridgeCommands
// ---------------------------------------------------------------------------

export const bridge: BridgeCommands = {
  // -- Graph manipulation ---------------------------------------------------
  addNode(type: string, position: Vec2): Promise<NodeId> {
    return tauriInvoke<NodeId>("add_node", { nodeType: type, position });
  },

  removeNode(id: NodeId): Promise<void> {
    return tauriInvoke<void>("remove_node", { id });
  },

  connect(from: PortRef, to: PortRef): Promise<ConnectionId> {
    return tauriInvoke<ConnectionId>("connect_ports", { from, to });
  },

  disconnect(id: ConnectionId): Promise<void> {
    return tauriInvoke<void>("disconnect", { id });
  },

  setParameter(nodeId: NodeId, param: string, value: number): Promise<void> {
    return tauriInvoke<void>("set_parameter", { nodeId, param, value });
  },

  // -- Transport ------------------------------------------------------------
  play(): Promise<void> {
    return tauriInvoke<void>("play");
  },

  stop(): Promise<void> {
    return tauriInvoke<void>("stop");
  },

  setTempo(bpm: number): Promise<void> {
    return tauriInvoke<void>("set_tempo", { bpm });
  },

  // -- Audio engine ---------------------------------------------------------
  getSignalStats(nodeId: string, port: string): Promise<SignalStats> {
    return tauriInvoke<SignalStats>("get_signal_stats", { nodeId, port });
  },

  runDiagnostics(): Promise<DiagnosticReport> {
    return tauriInvoke<DiagnosticReport>("run_diagnostics");
  },

  // -- State ----------------------------------------------------------------
  loadPatch(path: string): Promise<void> {
    return tauriInvoke<void>("load_patch", { path });
  },

  savePatch(path: string): Promise<void> {
    return tauriInvoke<void>("save_patch", { path });
  },

  exportPatch(target: string, options: ExportOptions): Promise<string> {
    return tauriInvoke<string>("export_patch", { target, options });
  },
};

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

/**
 * Returns the typed bridge commands object. In production this calls real
 * Tauri IPC; tests can wrap this with a mock provider if needed.
 */
export function useBridge(): BridgeCommands {
  return bridge;
}
