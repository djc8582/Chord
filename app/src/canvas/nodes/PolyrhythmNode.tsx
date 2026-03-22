/**
 * PolyrhythmNode — Custom React Flow node for the polyrhythm generator.
 *
 * Shows 3 concentric rings (A/B/C) each with dots for their pattern length.
 * The current position on each ring is highlighted. When multiple patterns
 * trigger simultaneously, a combined indicator lights up in the center.
 */

import { memo, useState, useEffect } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { PORT_COLORS } from "../store";

interface PolyrhythmData {
  label: string;
  nodeType: string;
  parameters: Record<string, number>;
  color?: string;
  collapsed: boolean;
  inputs: { id: string; label: string; type: string }[];
  outputs: { id: string; label: string; type: string }[];
  [key: string]: unknown;
}

const NODE_WIDTH = 200;
const NODE_HEIGHT = 160;
const CX = 85;
const CY = 55;

const RING_COLORS = ["#f97316", "#3b82f6", "#22c55e"]; // A=orange, B=blue, C=green
const RING_LABELS = ["A", "B", "C"];

function PolyrhythmNodeComponent(props: NodeProps) {
  const data = props.data as PolyrhythmData;
  const { label, parameters } = data;
  const isSelected = props.selected;

  const rate = parameters.rate ?? 4.0;
  const lengthA = Math.max(2, Math.min(16, Math.round(parameters.length_a ?? 4)));
  const lengthB = Math.max(2, Math.min(16, Math.round(parameters.length_b ?? 5)));
  const lengthC = Math.max(2, Math.min(16, Math.round(parameters.length_c ?? 7)));
  const lengths = [lengthA, lengthB, lengthC];

  const [tick, setTick] = useState(0);

  useEffect(() => {
    const intervalMs = Math.max(60, (60_000 / (120 * rate)));
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [rate]);

  const positions = lengths.map((len) => tick % len);

  // Check coincidence: how many patterns are at step 0 (trigger point)
  const triggering = positions.filter((p) => p === 0);
  const coincidence = triggering.length;

  const radii = [40, 30, 20];

  return (
    <div
      style={{
        background: "#1a1a1a",
        border: `2px solid ${isSelected ? "#60a5fa" : "#333"}`,
        borderRadius: 8,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
        fontSize: 11,
        color: "#e0e0e0",
        boxShadow: isSelected
          ? "0 0 0 2px rgba(96, 165, 250, 0.3)"
          : "0 2px 8px rgba(0, 0, 0, 0.4)",
        overflow: "visible",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Title bar */}
      <div
        style={{
          background: "#6366f1",
          padding: "5px 10px",
          borderRadius: "6px 6px 0 0",
          fontWeight: 600,
          fontSize: 10,
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
        <span style={{ opacity: 0.7, fontSize: 9 }}>
          {lengthA}:{lengthB}:{lengthC}
        </span>
      </div>

      {/* Concentric rings */}
      <div style={{ flex: 1, padding: "4px 10px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <svg
          width={170}
          height={110}
          style={{
            background: "#111",
            borderRadius: 4,
            border: "1px solid #333",
          }}
        >
          {/* Draw rings */}
          {lengths.map((len, ringIdx) => {
            const radius = radii[ringIdx];
            const color = RING_COLORS[ringIdx];
            const currentPos = positions[ringIdx];

            // Ring circle
            const dots = [];
            for (let i = 0; i < len; i++) {
              const angle = (i / len) * Math.PI * 2 - Math.PI / 2;
              const x = CX + Math.cos(angle) * radius;
              const y = CY + Math.sin(angle) * radius;
              const isCurrent = i === currentPos;
              const isTrigger = i === 0;

              dots.push(
                <circle
                  key={`ring-${ringIdx}-${i}`}
                  cx={x}
                  cy={y}
                  r={isCurrent ? 4 : 2.5}
                  fill={isCurrent ? color : (isTrigger ? `${color}80` : `${color}40`)}
                  stroke={isCurrent ? "#fff" : "none"}
                  strokeWidth={isCurrent ? 1.5 : 0}
                />
              );
            }

            return (
              <g key={`ring-${ringIdx}`}>
                {/* Ring path */}
                <circle
                  cx={CX}
                  cy={CY}
                  r={radius}
                  fill="none"
                  stroke={`${color}20`}
                  strokeWidth={1}
                />
                {/* Ring label */}
                <text
                  x={CX + radius + 6}
                  y={CY - radius + 8}
                  fill={`${color}80`}
                  fontSize={7}
                  fontFamily="monospace"
                >
                  {RING_LABELS[ringIdx]}
                </text>
                {dots}
              </g>
            );
          })}

          {/* Center coincidence indicator */}
          <circle
            cx={CX}
            cy={CY}
            r={coincidence >= 2 ? 8 : 5}
            fill={
              coincidence >= 3
                ? "#fbbf24"
                : coincidence >= 2
                ? "#f97316"
                : "#333"
            }
            opacity={coincidence >= 2 ? 1 : 0.3}
            stroke={coincidence >= 2 ? "#fff" : "none"}
            strokeWidth={coincidence >= 2 ? 1.5 : 0}
          />
          {coincidence >= 2 && (
            <text
              x={CX}
              y={CY + 3}
              textAnchor="middle"
              fill="#fff"
              fontSize={8}
              fontWeight={700}
              fontFamily="monospace"
            >
              {coincidence}
            </text>
          )}
        </svg>

        <div style={{ fontSize: 9, color: "#666", marginTop: 2, display: "flex", gap: 8 }}>
          {RING_LABELS.map((lbl, i) => (
            <span key={lbl} style={{ color: RING_COLORS[i] }}>
              {lbl}:{positions[i] + 1}/{lengths[i]}
            </span>
          ))}
        </div>
      </div>

      {/* Handles */}
      <Handle
        type="target"
        position={Position.Left}
        id="clock"
        style={{
          top: "50%",
          width: 10,
          height: 10,
          background: PORT_COLORS.audio,
          border: "2px solid #0f172a",
          borderRadius: "50%",
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        style={{
          top: "50%",
          width: 10,
          height: 10,
          background: PORT_COLORS.audio,
          border: "2px solid #0f172a",
          borderRadius: "50%",
        }}
      />
    </div>
  );
}

export const PolyrhythmNode = memo(PolyrhythmNodeComponent);
