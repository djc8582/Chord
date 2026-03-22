/**
 * GravitySequencerNode — Custom React Flow node for the gravity sequencer.
 *
 * Shows a 2D field with particles (small circles) that move under gravitational
 * attraction toward note attractors (labeled dots). When a particle gets close
 * to an attractor, that note triggers. Particle positions animate in real time.
 */

import { memo, useState, useEffect, useRef } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { PORT_COLORS } from "../store";

interface GravitySequencerData {
  label: string;
  nodeType: string;
  parameters: Record<string, number>;
  color?: string;
  collapsed: boolean;
  inputs: { id: string; label: string; type: string }[];
  outputs: { id: string; label: string; type: string }[];
  [key: string]: unknown;
}

const NOTE_NAMES = ["C", "D", "E", "F", "G", "A", "B"];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Attractor {
  x: number;
  y: number;
  note: string;
}

const NODE_WIDTH = 220;
const NODE_HEIGHT = 160;
const FIELD_WIDTH = 180;
const FIELD_HEIGHT = 90;

function GravitySequencerNodeComponent(props: NodeProps) {
  const data = props.data as GravitySequencerData;
  const { label, parameters } = data;
  const isSelected = props.selected;

  const gravity = parameters.gravity ?? 0.5;
  const numParticles = Math.max(1, Math.min(6, Math.round(parameters.particles ?? 3)));
  const numAttractors = Math.max(2, Math.min(7, Math.round(parameters.attractors ?? 5)));

  // Stable attractors based on count
  const attractorsRef = useRef<Attractor[]>([]);
  if (attractorsRef.current.length !== numAttractors) {
    attractorsRef.current = Array.from({ length: numAttractors }, (_, i) => ({
      x: 20 + ((i * FIELD_WIDTH * 0.8) / (numAttractors - 1 || 1)),
      y: 15 + ((i % 3) * 25) + (i % 2) * 10,
      note: NOTE_NAMES[i % NOTE_NAMES.length],
    }));
  }

  // Particle state with physics simulation
  const particlesRef = useRef<Particle[]>([]);
  if (particlesRef.current.length !== numParticles) {
    particlesRef.current = Array.from({ length: numParticles }, (_, i) => ({
      x: 30 + i * 35,
      y: 40 + (i % 2) * 20,
      vx: (Math.sin(i * 2.7) * 0.8),
      vy: (Math.cos(i * 1.3) * 0.8),
    }));
  }

  const [particles, setParticles] = useState<Particle[]>(particlesRef.current);
  const [activeNote, setActiveNote] = useState<string | null>(null);

  useEffect(() => {
    const attractors = attractorsRef.current;
    const dt = 1;

    const timer = setInterval(() => {
      particlesRef.current = particlesRef.current.map((p) => {
        let ax = 0;
        let ay = 0;
        let closestDist = Infinity;
        let closestNote = "";

        for (const att of attractors) {
          const dx = att.x - p.x;
          const dy = att.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy) + 5;
          const force = (gravity * 40) / (dist * dist);
          ax += (dx / dist) * force;
          ay += (dy / dist) * force;

          if (dist < closestDist) {
            closestDist = dist;
            closestNote = att.note;
          }
        }

        let nvx = (p.vx + ax * dt) * 0.98;
        let nvy = (p.vy + ay * dt) * 0.98;
        let nx = p.x + nvx * dt;
        let ny = p.y + nvy * dt;

        // Bounce off walls
        if (nx < 2 || nx > FIELD_WIDTH - 2) { nvx = -nvx * 0.7; nx = Math.max(2, Math.min(FIELD_WIDTH - 2, nx)); }
        if (ny < 2 || ny > FIELD_HEIGHT - 2) { nvy = -nvy * 0.7; ny = Math.max(2, Math.min(FIELD_HEIGHT - 2, ny)); }

        if (closestDist < 12) {
          setActiveNote(closestNote);
        }

        return { x: nx, y: ny, vx: nvx, vy: nvy };
      });

      setParticles([...particlesRef.current]);
    }, 40);

    return () => clearInterval(timer);
  }, [gravity, numParticles, numAttractors]);

  // Clear active note after flash
  useEffect(() => {
    if (activeNote) {
      const t = setTimeout(() => setActiveNote(null), 200);
      return () => clearTimeout(t);
    }
  }, [activeNote]);

  const attractors = attractorsRef.current;

  return (
    <div
      style={{
        background: "#1a1a2e",
        border: isSelected ? "3px solid #00ff41" : "3px solid #000",
        borderRadius: 0,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", monospace',
        fontSize: 11,
        color: "#ffffff",
        boxShadow: isSelected
          ? "0 0 12px rgba(0, 255, 65, 0.4), 4px 4px 0px #000"
          : "4px 4px 0px #000",
        transition: "border-color 0.15s, box-shadow 0.15s",
        overflow: "visible",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Title bar */}
      <div
        style={{
          background: "#8b5cf6",
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
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: activeNote ? "#ffd700" : "#00000080",
            transition: "color 0.1s",
          }}
        >
          {activeNote ?? "--"}
        </span>
      </div>

      {/* Gravity field */}
      <div style={{ flex: 1, padding: "4px 10px 6px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <svg
          width={FIELD_WIDTH}
          height={FIELD_HEIGHT}
          style={{
            background: "#0a0a1a",
            borderRadius: 0,
            border: "2px solid #000",
          }}
        >
          {/* Attractors */}
          {attractors.map((att, i) => (
            <g key={`att-${i}`}>
              {/* Gravity well ring */}
              <circle
                cx={att.x}
                cy={att.y}
                r={10}
                fill="none"
                stroke="#8b5cf620"
                strokeWidth={1}
              />
              {/* Attractor dot */}
              <circle
                cx={att.x}
                cy={att.y}
                r={4}
                fill={att.note === activeNote ? "#ffd700" : "#8b5cf6"}
                opacity={att.note === activeNote ? 1 : 0.6}
              />
              {/* Label */}
              <text
                x={att.x}
                y={att.y - 7}
                textAnchor="middle"
                fill="#888"
                fontSize={7}
                fontFamily="monospace"
              >
                {att.note}
              </text>
            </g>
          ))}

          {/* Particles */}
          {particles.map((p, i) => (
            <circle
              key={`p-${i}`}
              cx={p.x}
              cy={p.y}
              r={3}
              fill="#00ff41"
              opacity={0.9}
            >
              {/* Glow */}
            </circle>
          ))}
        </svg>

        <div style={{ fontSize: 9, color: "#666", marginTop: 2 }}>
          G={gravity.toFixed(2)} | {numParticles}p / {numAttractors}a
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

export const GravitySequencerNode = memo(GravitySequencerNodeComponent);
