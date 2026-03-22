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
  generators: "#00ff41",
  effects: "#ff1493",
  modulators: "#8b5cf6",
  utilities: "#ffd700",
  io: "#00d4ff",
  sequencers: "#8b5cf6",
  midi: "#a855f7",
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
        background: "#1a1a2e",
        border: isSelected ? "3px solid #00ff41" : "3px solid #000",
        borderRadius: 0,
        minWidth: 160,
        fontFamily:
          '"JetBrains Mono", ui-monospace, "SF Mono", monospace',
        fontSize: 12,
        color: "#ffffff",
        boxShadow: isSelected
          ? "0 0 12px rgba(0, 255, 65, 0.4), 4px 4px 0px #000"
          : "4px 4px 0px #000",
        transition: "border-color 0.15s, box-shadow 0.15s",
        overflow: "visible",
      }}
    >
      {/* Title bar */}
      <div
        style={{
          background: accentColor,
          padding: "6px 12px",
          borderRadius: 0,
          borderBottom: "3px solid #000",
          fontWeight: 800,
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: "#000",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "grab",
        }}
      >
        <span>{label}</span>
        <span style={{ opacity: 0.7, fontSize: 9, fontWeight: 700, marginLeft: 8 }}>
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
                    width: 14,
                    height: 14,
                    background: PORT_COLORS[port.type] ?? PORT_COLORS.audio,
                    border: "2px solid #000",
                    borderRadius: "50%",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: 16,
                    top: topPx - 7,
                    fontSize: 10,
                    fontWeight: 700,
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
                    width: 14,
                    height: 14,
                    background: PORT_COLORS[port.type] ?? PORT_COLORS.audio,
                    border: "2px solid #000",
                    borderRadius: "50%",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    right: 16,
                    top: topPx - 7,
                    fontSize: 10,
                    fontWeight: 700,
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
