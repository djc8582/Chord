/**
 * MarkovChainNode — Custom React Flow node for the Markov chain sequencer.
 *
 * Shows the current note prominently in the center, with transition probability
 * arrows radiating outward to neighboring notes. The arrow thickness and opacity
 * indicate transition probability. Displays the scale degree below.
 */

import { memo, useState, useEffect } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { PORT_COLORS } from "../store";

interface MarkovChainData {
  label: string;
  nodeType: string;
  parameters: Record<string, number>;
  color?: string;
  collapsed: boolean;
  inputs: { id: string; label: string; type: string }[];
  outputs: { id: string; label: string; type: string }[];
  [key: string]: unknown;
}

const SCALE_NOTES = ["C", "D", "E", "F", "G", "A", "B"];
const DEGREE_LABELS = ["I", "II", "III", "IV", "V", "VI", "VII"];

// Simple Markov transition matrix (row = from, col = to)
// Higher values = more likely transitions
const TRANSITION_WEIGHTS = [
  [0.1, 0.2, 0.1, 0.25, 0.2, 0.05, 0.1],  // from C
  [0.15, 0.1, 0.2, 0.1, 0.25, 0.1, 0.1],   // from D
  [0.1, 0.1, 0.1, 0.2, 0.15, 0.25, 0.1],   // from E
  [0.2, 0.1, 0.1, 0.1, 0.3, 0.1, 0.1],     // from F
  [0.3, 0.1, 0.1, 0.15, 0.1, 0.15, 0.1],   // from G
  [0.1, 0.15, 0.1, 0.2, 0.15, 0.1, 0.2],   // from A
  [0.25, 0.1, 0.15, 0.1, 0.2, 0.1, 0.1],   // from B
];

function weightedRandom(weights: number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

const NODE_WIDTH = 200;
const NODE_HEIGHT = 160;
const CENTER_X = 85;
const CENTER_Y = 52;
const RADIUS = 38;

function MarkovChainNodeComponent(props: NodeProps) {
  const data = props.data as MarkovChainData;
  const { label, parameters } = data;
  const isSelected = props.selected;

  const rate = parameters.rate ?? 2.0;
  const chaos = Math.min(1, Math.max(0, parameters.chaos ?? 0.3));

  const [currentNote, setCurrentNote] = useState(0);
  const [prevNote, setPrevNote] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    const intervalMs = Math.max(150, (60_000 / (120 * rate)));
    const timer = setInterval(() => {
      setCurrentNote((cur) => {
        setPrevNote(cur);
        // Mix between structured transitions and random (chaos parameter)
        if (Math.random() < chaos) {
          return Math.floor(Math.random() * 7);
        }
        return weightedRandom(TRANSITION_WEIGHTS[cur]);
      });
      setFlash(true);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [rate, chaos]);

  useEffect(() => {
    if (flash) {
      const t = setTimeout(() => setFlash(false), 120);
      return () => clearTimeout(t);
    }
  }, [flash]);

  // Current transition probabilities
  const transitions = TRANSITION_WEIGHTS[currentNote];

  // Position neighboring notes in a circle
  const neighborPositions = SCALE_NOTES.map((_, i) => {
    const angle = (i / 7) * Math.PI * 2 - Math.PI / 2;
    return {
      x: CENTER_X + Math.cos(angle) * RADIUS,
      y: CENTER_Y + Math.sin(angle) * RADIUS,
    };
  });

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
          background: "#ec4899",
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
          {DEGREE_LABELS[currentNote]}
        </span>
      </div>

      {/* State diagram */}
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
          {/* Transition arrows from current note to neighbors */}
          {neighborPositions.map((pos, i) => {
            if (i === currentNote) return null;
            const prob = transitions[i];
            const opacity = 0.15 + prob * 2.5;
            const strokeWidth = 0.5 + prob * 4;
            return (
              <line
                key={`arrow-${i}`}
                x1={CENTER_X}
                y1={CENTER_Y}
                x2={pos.x}
                y2={pos.y}
                stroke="#f9731680"
                strokeWidth={strokeWidth}
                opacity={Math.min(1, opacity)}
                strokeLinecap="round"
              />
            );
          })}

          {/* Previous note highlight (transition just happened) */}
          {prevNote !== null && prevNote !== currentNote && flash && (
            <line
              x1={neighborPositions[prevNote].x}
              y1={neighborPositions[prevNote].y}
              x2={CENTER_X}
              y2={CENTER_Y}
              stroke="#fbbf24"
              strokeWidth={2.5}
              opacity={0.8}
              strokeLinecap="round"
            />
          )}

          {/* Neighbor note circles */}
          {neighborPositions.map((pos, i) => {
            const isCurrent = i === currentNote;
            return (
              <g key={`note-${i}`}>
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={isCurrent ? 14 : 10}
                  fill={isCurrent ? "#f97316" : "#2a2a2a"}
                  stroke={isCurrent ? "#fbbf24" : "#555"}
                  strokeWidth={isCurrent ? 2 : 1}
                  opacity={isCurrent ? 1 : 0.7}
                />
                <text
                  x={pos.x}
                  y={pos.y + (isCurrent ? 4 : 3)}
                  textAnchor="middle"
                  fill={isCurrent ? "#fff" : "#aaa"}
                  fontSize={isCurrent ? 11 : 8}
                  fontWeight={isCurrent ? 700 : 400}
                  fontFamily="monospace"
                >
                  {SCALE_NOTES[i]}
                </text>
              </g>
            );
          })}
        </svg>

        <div style={{ fontSize: 9, color: "#666", marginTop: 2 }}>
          Chaos {(chaos * 100).toFixed(0)}% | Rate {rate.toFixed(1)}x
        </div>
      </div>

      {/* Handles */}
      <Handle
        type="target"
        position={Position.Left}
        id="clock"
        style={{
          top: 75,
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
        id="freq"
        style={{
          top: 60,
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
        id="gate"
        style={{
          top: 90,
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

export const MarkovChainNode = memo(MarkovChainNodeComponent);
