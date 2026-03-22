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

import React, { useCallback, useEffect } from "react";
import { useCanvasStore } from "../canvas/store.js";
import { useInspectorStore } from "./store.js";
import { Slider } from "./Slider.js";
import { Knob } from "./Knob.js";
import type { BridgeCommands } from "../bridge/types.js";

// ---------------------------------------------------------------------------
// Bridge integration — optional; gracefully degrades when unavailable
// ---------------------------------------------------------------------------

let bridgeRef: BridgeCommands | null = null;

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

      // Also notify the Rust backend using the mapped numeric ID.
      const nodeId = useInspectorStore.getState().inspectedNodeId;
      if (bridgeRef && nodeId) {
        const backendId = useCanvasStore.getState().getBackendId(nodeId);
        bridgeRef.setParameter(backendId, param, value).catch(() => {
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
          color: "#888",
          fontSize: 13,
          textAlign: "center",
        }}
      >
        <p data-testid={`${testId}-empty`}>No node selected</p>
        <p style={{ fontSize: 11, marginTop: 8 }}>
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
        color: "#e0e0e0",
        fontSize: 13,
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
            border: "1px solid #555",
            borderRadius: 3,
            background: "#1a1a1a",
            color: "#e0e0e0",
            fontSize: 14,
            fontWeight: 600,
            outline: "none",
            boxSizing: "border-box",
          }}
        />
        <div
          data-testid={`${testId}-type`}
          style={{ fontSize: 11, color: "#888", marginTop: 4 }}
        >
          {nodeTypeDef?.label ?? inspectedNode.type}
          {nodeTypeDef?.category ? (
            <span style={{ marginLeft: 6, color: "#666" }}>
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
              color: "#666",
              textTransform: "uppercase",
              letterSpacing: 1,
              marginBottom: 8,
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
        <div style={{ fontSize: 12, color: "#666", fontStyle: "italic" }}>
          No parameters
        </div>
      )}

      {/* Ports section */}
      {nodeTypeDef ? (
        <div data-testid={`${testId}-ports`} style={{ marginTop: 16 }}>
          <div
            style={{
              fontSize: 11,
              color: "#666",
              textTransform: "uppercase",
              letterSpacing: 1,
              marginBottom: 8,
            }}
          >
            Ports
          </div>

          {nodeTypeDef.inputs.length > 0 ? (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>
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
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background:
                        port.type === "audio"
                          ? "#f97316"
                          : port.type === "control"
                            ? "#3b82f6"
                            : port.type === "midi"
                              ? "#a855f7"
                              : "#22c55e",
                      display: "inline-block",
                    }}
                  />
                  <span>{port.label}</span>
                  <span style={{ color: "#666", fontSize: 10 }}>
                    ({port.type})
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          {nodeTypeDef.outputs.length > 0 ? (
            <div>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>
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
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background:
                        port.type === "audio"
                          ? "#f97316"
                          : port.type === "control"
                            ? "#3b82f6"
                            : port.type === "midi"
                              ? "#a855f7"
                              : "#22c55e",
                      display: "inline-block",
                    }}
                  />
                  <span>{port.label}</span>
                  <span style={{ color: "#666", fontSize: 10 }}>
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
