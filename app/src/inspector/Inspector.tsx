/**
 * Inspector — Parameter editor panel.
 *
 * Shows parameters for the currently selected node. When a node is selected
 * on the canvas, the inspector displays:
 *   - Node name (editable)
 *   - Node type
 *   - All parameters as controls (sliders with numeric input)
 *   - Port information (inputs and outputs)
 *
 * Parameter changes update both the Yjs document (via document-model) and
 * the Rust backend (via the bridge).
 */

import React, { useCallback, useEffect, useState } from "react";
import { useCanvasStore } from "../canvas/store.js";
import { useInspectorStore } from "./store.js";
import { Slider } from "./Slider.js";
import { Knob } from "./Knob.js";
import type { BridgeCommands } from "../bridge/types.js";

// ---------------------------------------------------------------------------
// Bridge integration — optional; gracefully degrades when unavailable
// ---------------------------------------------------------------------------

let bridgeRef: BridgeCommands | null = null;

/** Node types that support loading audio files via load_audio_data. */
const AUDIO_LOADABLE_TYPES = new Set(["granular", "sampler", "file_player"]);

/**
 * Provide a bridge instance for the inspector to call setParameter on the
 * Rust backend. When running in tests or without Tauri, this can be omitted
 * and parameter changes will only update the Yjs document.
 */
export function setInspectorBridge(bridge: BridgeCommands | null): void {
  bridgeRef = bridge;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Heuristic: use knob for parameters with small integer ranges, slider otherwise. */
function shouldUseKnob(min: number, max: number, step: number): boolean {
  const range = max - min;
  // Use knobs for small-range integer-step parameters (e.g. waveform select)
  return step >= 1 && range <= 10;
}

// ---------------------------------------------------------------------------
// Inspector component
// ---------------------------------------------------------------------------

export interface InspectorProps {
  "data-testid"?: string;
}

export const Inspector: React.FC<InspectorProps> = ({
  "data-testid": testId = "inspector",
}) => {
  const selectedNodeIds = useCanvasStore((s) => s.selectedNodeIds);
  const inspectedNode = useInspectorStore((s) => s.inspectedNode);
  const parameterDescriptors = useInspectorStore((s) => s.parameterDescriptors);
  const nodeTypeDef = useInspectorStore((s) => s.nodeTypeDef);
  const syncFromCanvas = useInspectorStore((s) => s.syncFromCanvas);
  const setParam = useInspectorStore((s) => s.setParameter);
  const setNodeName = useInspectorStore((s) => s.setNodeName);

  // -- Audio file loading state ---
  const [loadedFileName, setLoadedFileName] = useState<string | null>(null);

  // Re-sync whenever canvas selection changes
  useEffect(() => {
    syncFromCanvas();
  }, [selectedNodeIds, syncFromCanvas]);

  // Also subscribe to Yjs document changes so values stay up to date
  useEffect(() => {
    const unsub = useCanvasStore.subscribe(
      (state) => state.nodes,
      () => {
        syncFromCanvas();
      },
    );
    // For zustand v5, subscribe returns unsubscribe function.
    // Fallback: basic subscribe
    return typeof unsub === "function" ? unsub : undefined;
  }, [syncFromCanvas]);

  const handleParameterChange = useCallback(
    (param: string, value: number) => {
      setParam(param, value);

      // Also notify the Rust backend
      const nodeId = useInspectorStore.getState().inspectedNodeId;
      if (bridgeRef && nodeId) {
        bridgeRef.setParameter(nodeId, param, value).catch(() => {
          // Bridge call failed (e.g. engine not running) — silently ignore.
          // The Yjs document is already updated.
        });
      }
    },
    [setParam],
  );

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setNodeName(e.target.value);
    },
    [setNodeName],
  );

  // ------- Empty state -------
  if (!inspectedNode) {
    return (
      <div
        data-testid={testId}
        style={{
          padding: 16,
          color: "#94a3b8",
          fontSize: 13,
          fontWeight: 700,
          fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", monospace',
          textAlign: "center",
        }}
      >
        <p data-testid={`${testId}-empty`}>No node selected</p>
        <p style={{ fontSize: 11, marginTop: 8, fontWeight: 700 }}>
          Select a node on the canvas to view its parameters.
        </p>
      </div>
    );
  }

  // ------- Node inspector -------
  return (
    <div
      data-testid={testId}
      style={{
        padding: 12,
        color: "#ffffff",
        fontSize: 13,
        fontWeight: 700,
        fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", monospace',
        overflowY: "auto",
      }}
    >
      {/* Header: Name + Type */}
      <div style={{ marginBottom: 12 }}>
        <input
          type="text"
          value={inspectedNode.name}
          onChange={handleNameChange}
          aria-label="Node name"
          data-testid={`${testId}-name`}
          style={{
            width: "100%",
            padding: "4px 6px",
            border: "3px solid #000",
            borderRadius: 0,
            background: "#0a0a0a",
            color: "#ffffff",
            fontSize: 14,
            fontWeight: 800,
            fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", monospace',
            outline: "none",
            boxSizing: "border-box",
          }}
        />
        <div
          data-testid={`${testId}-type`}
          style={{ fontSize: 11, color: "#94a3b8", marginTop: 4, fontWeight: 700 }}
        >
          {nodeTypeDef?.label ?? inspectedNode.type}
          {nodeTypeDef?.category ? (
            <span style={{ marginLeft: 6, color: "#8b5cf6", fontWeight: 700 }}>
              ({nodeTypeDef.category})
            </span>
          ) : null}
        </div>
      </div>

      {/* Parameters section */}
      {parameterDescriptors.length > 0 ? (
        <div data-testid={`${testId}-parameters`}>
          <div
            style={{
              fontSize: 11,
              color: "#00ff41",
              textTransform: "uppercase",
              letterSpacing: 1,
              marginBottom: 8,
              fontWeight: 800,
              fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", monospace',
            }}
          >
            Parameters
          </div>
          {parameterDescriptors.map((desc) => {
            const currentValue =
              inspectedNode.parameters[desc.id] ?? desc.defaultValue;

            if (shouldUseKnob(desc.min, desc.max, desc.step)) {
              return (
                <Knob
                  key={desc.id}
                  label={desc.label}
                  value={currentValue}
                  min={desc.min}
                  max={desc.max}
                  step={desc.step}
                  unit={desc.unit}
                  onChange={(v) => handleParameterChange(desc.id, v)}
                  data-testid={`${testId}-param-${desc.id}`}
                />
              );
            }

            return (
              <Slider
                key={desc.id}
                label={desc.label}
                value={currentValue}
                min={desc.min}
                max={desc.max}
                step={desc.step}
                unit={desc.unit}
                onChange={(v) => handleParameterChange(desc.id, v)}
                data-testid={`${testId}-param-${desc.id}`}
              />
            );
          })}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic", fontWeight: 700 }}>
          No parameters
        </div>
      )}

      {/* Load Audio File button — shown for granular, sampler, etc. */}
      {AUDIO_LOADABLE_TYPES.has(inspectedNode.type) && (
        <div style={{ marginTop: 12 }}>
          <button
            onClick={async () => {
              if (!bridgeRef) return;
              const nodeId = useInspectorStore.getState().inspectedNodeId;
              if (!nodeId) return;
              try {
                const { invoke } = await import("@tauri-apps/api/core");
                const result = await invoke<{ ok: boolean; path: string; samples: number; duration: number }>(
                  "pick_and_load_audio", { nodeId }
                );
                if (result?.ok) {
                  setLoadedFileName(result.path.split("/").pop()?.split("\\").pop() ?? "loaded");
                }
              } catch {
                const path = window.prompt("Enter path to WAV file:");
                if (path) {
                  const result = await bridgeRef.loadAudioFile(nodeId, path);
                  if (result?.ok) {
                    setLoadedFileName(path.split("/").pop()?.split("\\").pop() ?? "loaded");
                  }
                }
              }
            }}
            style={{
              width: "100%",
              padding: "8px 12px",
              fontSize: 12,
              fontWeight: 800,
              fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", monospace',
              color: "#000",
              backgroundColor: "#00ff41",
              border: "3px solid #000",
              borderRadius: 0,
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            Load Audio File
          </button>
          {loadedFileName && (
            <div style={{ fontSize: 11, color: "#00ff41", marginTop: 4, fontWeight: 700 }}>
              {loadedFileName}
            </div>
          )}
        </div>
      )}

      {/* Ports section */}
      {nodeTypeDef ? (
        <div data-testid={`${testId}-ports`} style={{ marginTop: 16 }}>
          <div
            style={{
              fontSize: 11,
              color: "#00d4ff",
              textTransform: "uppercase",
              letterSpacing: 1,
              marginBottom: 8,
              fontWeight: 800,
              fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", monospace',
            }}
          >
            Ports
          </div>

          {nodeTypeDef.inputs.length > 0 ? (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: "#ffd700", marginBottom: 4, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>
                Inputs
              </div>
              {nodeTypeDef.inputs.map((port) => (
                <div
                  key={port.id}
                  data-testid={`${testId}-port-in-${port.id}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "2px 0",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      border: "2px solid #000",
                      background:
                        port.type === "audio"
                          ? "#ff6b00"
                          : port.type === "control"
                            ? "#00d4ff"
                            : port.type === "midi"
                              ? "#a855f7"
                              : "#00ff41",
                      display: "inline-block",
                    }}
                  />
                  <span>{port.label}</span>
                  <span style={{ color: "#94a3b8", fontSize: 10, fontWeight: 700 }}>
                    ({port.type})
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          {nodeTypeDef.outputs.length > 0 ? (
            <div>
              <div style={{ fontSize: 11, color: "#ffd700", marginBottom: 4, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>
                Outputs
              </div>
              {nodeTypeDef.outputs.map((port) => (
                <div
                  key={port.id}
                  data-testid={`${testId}-port-out-${port.id}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "2px 0",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      border: "2px solid #000",
                      background:
                        port.type === "audio"
                          ? "#ff6b00"
                          : port.type === "control"
                            ? "#00d4ff"
                            : port.type === "midi"
                              ? "#a855f7"
                              : "#00ff41",
                      display: "inline-block",
                    }}
                  />
                  <span>{port.label}</span>
                  <span style={{ color: "#94a3b8", fontSize: 10, fontWeight: 700 }}>
                    ({port.type})
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
