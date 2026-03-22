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
        background: "#ffffff",
        border: isSelected ? "3px solid #c8ff00" : "3px solid #000",
        borderRadius: 14,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", monospace',
        fontSize: 11,
        color: "#ffffff",
        boxShadow: isSelected
          ? "0 0 12px rgba(0, 255, 65, 0.4), 4px 4px 0px #000"
          : "5px 5px 0px #000",
        transition: "border-color 0.15s, box-shadow 0.15s",
        overflow: "visible",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Title bar */}
      <div
        style={{
          background: "#f472b6",
          padding: "6px 12px",
          borderRadius: 14,
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
          {DEGREE_LABELS[currentNote]}
        </span>
      </div>

      {/* State diagram */}
      <div style={{ flex: 1, padding: "4px 10px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <svg
          width={170}
          height={110}
          style={{
            background: "#f5f3ff",
            borderRadius: 14,
            border: "2px solid #000",
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
                stroke="#ff149380"
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
              stroke="#ffd700"
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
                  fill={isCurrent ? "#ff1493" : "#2a2a2a"}
                  stroke={isCurrent ? "#ffd700" : "#555"}
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
          width: 14,
          height: 14,
          background: PORT_COLORS.audio,
          border: "2px solid #000",
          borderRadius: "50%",
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="freq"
        style={{
          top: 60,
          width: 14,
          height: 14,
          background: PORT_COLORS.audio,
          border: "2px solid #000",
          borderRadius: "50%",
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="gate"
        style={{
          top: 90,
          width: 14,
          height: 14,
          background: PORT_COLORS.audio,
          border: "2px solid #000",
          borderRadius: "50%",
        }}
      />
    </div>
  );
}

export const MarkovChainNode = memo(MarkovChainNodeComponent);
