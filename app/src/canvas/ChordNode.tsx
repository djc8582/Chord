/**
 * ChordNode — Custom React Flow node component
 *
 * Renders a node with typed input/output port handles, a title bar,
 * and optional parameter display. Port colors indicate signal type:
 * - orange = audio
 * - blue = control
 * - purple = midi
 * - green = trigger
 */

import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { PORT_COLORS } from "./store";
import type { PortDefinition } from "./store";

interface ChordNodeData {
  label: string;
  nodeType: string;
  parameters: Record<string, number>;
  color?: string;
  collapsed: boolean;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  [key: string]: unknown;
}

const CATEGORY_COLORS: Record<string, string> = {
  generators: "#f97316",
  effects: "#8b5cf6",
  modulators: "#3b82f6",
  utilities: "#6b7280",
  io: "#22c55e",
};

function getCategoryForType(nodeType: string): string {
  const categories: Record<string, string> = {
    oscillator: "generators",
    noise: "generators",
    filter: "effects",
    delay: "effects",
    reverb: "effects",
    gain: "utilities",
    mixer: "utilities",
    envelope: "modulators",
    lfo: "modulators",
    output: "io",
    input: "io",
    midi_in: "io",
  };
  return categories[nodeType] ?? "utilities";
}

function ChordNodeComponent(props: NodeProps) {
  const data = props.data as ChordNodeData;
  const { label, nodeType, inputs, outputs, collapsed, color } = data;
  const category = getCategoryForType(nodeType);
  const accentColor = color ?? CATEGORY_COLORS[category] ?? "#6b7280";
  const isSelected = props.selected;

  const handleSpacing = 24;
  const maxPorts = Math.max(inputs.length, outputs.length, 1);
  const bodyHeight = collapsed ? 0 : maxPorts * handleSpacing + 8;

  return (
    <div
      style={{
        background: "#1e293b",
        border: `2px solid ${isSelected ? "#60a5fa" : "#334155"}`,
        borderRadius: 8,
        minWidth: 160,
        fontFamily:
          'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
        fontSize: 12,
        color: "#e2e8f0",
        boxShadow: isSelected
          ? "0 0 0 2px rgba(96, 165, 250, 0.3)"
          : "0 2px 8px rgba(0, 0, 0, 0.3)",
        transition: "border-color 0.15s, box-shadow 0.15s",
        overflow: "visible",
      }}
    >
      {/* Title bar */}
      <div
        style={{
          background: accentColor,
          padding: "6px 12px",
          borderRadius: "6px 6px 0 0",
          fontWeight: 600,
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "grab",
        }}
      >
        <span>{label}</span>
        <span style={{ opacity: 0.6, fontSize: 9, marginLeft: 8 }}>
          {nodeType}
        </span>
      </div>

      {/* Port area */}
      {!collapsed && (
        <div
          style={{
            position: "relative",
            minHeight: bodyHeight,
            padding: "4px 0",
          }}
        >
          {/* Input ports (left side) */}
          {inputs.map((port, i) => {
            const topPx = 12 + i * handleSpacing;
            return (
              <div key={`in-${port.id}`}>
                <Handle
                  type="target"
                  position={Position.Left}
                  id={port.id}
                  style={{
                    top: topPx,
                    width: 10,
                    height: 10,
                    background: PORT_COLORS[port.type] ?? PORT_COLORS.audio,
                    border: "2px solid #0f172a",
                    borderRadius: "50%",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: 14,
                    top: topPx - 7,
                    fontSize: 10,
                    color: "#94a3b8",
                    pointerEvents: "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  {port.label}
                </div>
              </div>
            );
          })}

          {/* Output ports (right side) */}
          {outputs.map((port, i) => {
            const topPx = 12 + i * handleSpacing;
            return (
              <div key={`out-${port.id}`}>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={port.id}
                  style={{
                    top: topPx,
                    width: 10,
                    height: 10,
                    background: PORT_COLORS[port.type] ?? PORT_COLORS.audio,
                    border: "2px solid #0f172a",
                    borderRadius: "50%",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    right: 14,
                    top: topPx - 7,
                    fontSize: 10,
                    color: "#94a3b8",
                    pointerEvents: "none",
                    whiteSpace: "nowrap",
                    textAlign: "right",
                  }}
                >
                  {port.label}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const ChordNode = memo(ChordNodeComponent);
