/**
 * Tauri IPC Bridge
 *
 * Typed wrappers around @tauri-apps/api invoke().
 * NEVER call invoke() with raw strings elsewhere — import from here.
 */

export type {
  BridgeCommands,
  NodeId,
  ConnectionId,
  PortId,
  SignalStats,
  DiagnosticReport,
  ExportTarget,
  ExportOptions,
} from "./types.js";

export { useBridge, bridge } from "./bridge.js";
