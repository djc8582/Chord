/**
 * Typed Tauri IPC bridge types.
 *
 * These mirror the Rust command signatures in src-tauri/src/commands.rs.
 * NEVER use invoke() with raw strings — always go through the typed wrappers.
 */

import type { Vec2, PortRef } from "@chord/document-model";

// Re-export the document-model types used in bridge commands
export type { Vec2, PortRef };

// Type aliases used across the bridge
export type NodeId = string;
export type ConnectionId = string;
export type PortId = string;

/** Signal statistics returned by the audio engine. */
export interface SignalStats {
  peak: number;
  rms: number;
  clipping: boolean;
}

/** Result of a full diagnostics run. */
export interface DiagnosticReport {
  cpu_usage: number;
  buffer_underruns: number;
  node_count: number;
  sample_rate: number;
}

/** Export target identifier. */
export type ExportTarget = string;

/** Options for the export command. */
export interface ExportOptions {
  optimize: boolean;
  target_sample_rate?: number;
}

/**
 * The full set of typed commands available over the Tauri IPC bridge.
 * Every method maps 1:1 to a #[tauri::command] in commands.rs.
 */
export interface BridgeCommands {
  // Graph manipulation
  clearGraph(): Promise<void>;
  addNode(type: string, position: Vec2, frontendId?: string): Promise<NodeId>;
  removeNode(id: NodeId): Promise<void>;
  connect(from: PortRef, to: PortRef): Promise<ConnectionId>;
  disconnect(id: ConnectionId): Promise<void>;
  setParameter(nodeId: NodeId, param: string, value: number): Promise<void>;

  // Transport
  syncAndPlay(nodes: Array<{id: string; node_type: string; x: number; y: number; parameters: Record<string, number>}>, connections: Array<{from_node: string; from_port: string; to_node: string; to_port: string}>): Promise<void>;
  play(): Promise<void>;
  stop(): Promise<void>;
  setTempo(bpm: number): Promise<void>;

  // Audio engine
  getSignalStats(nodeId: NodeId, port: PortId): Promise<SignalStats>;
  runDiagnostics(): Promise<DiagnosticReport>;
  getWaveformData(): Promise<number[]>;

  // State
  loadPatch(path: string): Promise<void>;
  savePatch(path: string): Promise<void>;
  exportPatch(target: ExportTarget, options: ExportOptions): Promise<string>;
}
