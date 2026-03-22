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

import { memo, useMemo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { PORT_COLORS } from "./store";
import type { PortDefinition } from "./store";

// ---------------------------------------------------------------------------
// Mini-display visualizations for specific node types
// ---------------------------------------------------------------------------

/** Oscillator: SVG waveform preview based on waveform parameter */
function OscillatorMiniDisplay({ waveform }: { waveform?: number }) {
  const w = 140;
  const h = 40;
  const mid = h / 2;
  const amp = 14;

  const pathD = useMemo(() => {
    const wave = Math.round(waveform ?? 0);
    const pts: string[] = [];
    for (let x = 0; x <= w; x++) {
      const t = (x / w) * Math.PI * 4;
      let y: number;
      switch (wave) {
        case 1: // saw
          y = mid - amp * (1 - 2 * ((t / (Math.PI * 2)) % 1));
          break;
        case 2: // square
          y = mid - amp * (Math.sin(t) >= 0 ? 1 : -1);
          break;
        case 3: // triangle
          y = mid - amp * (2 * Math.abs(2 * ((t / (Math.PI * 2)) % 1) - 1) - 1);
          break;
        default: // sine
          y = mid - amp * Math.sin(t);
      }
      pts.push(`${x === 0 ? "M" : "L"}${x},${y.toFixed(1)}`);
    }
    return pts.join(" ");
  }, [waveform, w, h]);

  return (
    <svg width={w} height={h} style={{ display: "block", margin: "0 auto" }}>
      <path d={pathD} fill="none" stroke="#00ff41" strokeWidth={2} opacity={0.9} />
    </svg>
  );
}

/** Filter: frequency response curve */
function FilterMiniDisplay({ filterType }: { filterType?: number }) {
  const w = 140;
  const h = 40;

  const pathD = useMemo(() => {
    const fType = Math.round(filterType ?? 0);
    const pts: string[] = [];
    for (let x = 0; x <= w; x++) {
      const t = x / w;
      let y: number;
      switch (fType) {
        case 1: // high-pass
          y = h - 4 - (h - 8) * (1 / (1 + Math.exp(-12 * (t - 0.35))));
          break;
        case 2: // band-pass
          y = h - 4 - (h - 8) * Math.exp(-18 * Math.pow(t - 0.5, 2));
          break;
        default: // low-pass
          y = h - 4 - (h - 8) * (1 / (1 + Math.exp(12 * (t - 0.65))));
      }
      pts.push(`${x === 0 ? "M" : "L"}${x},${y.toFixed(1)}`);
    }
    return pts.join(" ");
  }, [filterType, w, h]);

  return (
    <svg width={w} height={h} style={{ display: "block", margin: "0 auto" }}>
      <path d={pathD} fill="none" stroke="#ff1493" strokeWidth={2} opacity={0.9} />
      <line x1={0} y1={h - 2} x2={w} y2={h - 2} stroke="#ffffff20" strokeWidth={1} />
    </svg>
  );
}

/** LFO: animated waveform indicator with CSS pulsing */
function LfoMiniDisplay() {
  const w = 140;
  const h = 40;
  const mid = h / 2;

  const pathD = useMemo(() => {
    const pts: string[] = [];
    for (let x = 0; x <= w; x++) {
      const t = (x / w) * Math.PI * 3;
      const y = mid - 12 * Math.sin(t);
      pts.push(`${x === 0 ? "M" : "L"}${x},${y.toFixed(1)}`);
    }
    return pts.join(" ");
  }, [w, h]);

  return (
    <svg width={w} height={h} style={{ display: "block", margin: "0 auto" }}>
      <path d={pathD} fill="none" stroke="#8b5cf6" strokeWidth={2} opacity={0.8} />
      <circle cx={w / 2} cy={mid} r={4} fill="#8b5cf6" opacity={0.6}>
        <animate attributeName="opacity" values="0.3;1;0.3" dur="1.5s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

/** Gain: level bar */
function GainMiniDisplay({ level }: { level?: number }) {
  const w = 140;
  const h = 40;
  const gainVal = Math.max(0, Math.min(2, level ?? 1));
  const barWidth = (gainVal / 2) * (w - 8);

  return (
    <svg width={w} height={h} style={{ display: "block", margin: "0 auto" }}>
      {/* Background track */}
      <rect x={4} y={14} width={w - 8} height={12} rx={0} fill="#1a1a2e" stroke="#333" strokeWidth={1} />
      {/* Level bar */}
      <rect x={4} y={14} width={barWidth} height={12} rx={0} fill={gainVal > 1.5 ? "#ff1493" : "#ffd700"} opacity={0.9} />
      {/* dB markers */}
      <line x1={w / 2} y1={12} x2={w / 2} y2={28} stroke="#ffffff30" strokeWidth={1} />
      <text x={w / 2} y={38} textAnchor="middle" fill="#94a3b8" fontSize={8} fontFamily="monospace">
        {(20 * Math.log10(Math.max(0.001, gainVal))).toFixed(1)}dB
      </text>
    </svg>
  );
}

/** Delay: echo dots (cascading circles) */
function DelayMiniDisplay() {
  const w = 140;
  const h = 40;
  const mid = h / 2;

  return (
    <svg width={w} height={h} style={{ display: "block", margin: "0 auto" }}>
      {[0, 1, 2, 3, 4].map((i) => {
        const x = 15 + i * 28;
        const r = 8 - i * 1.2;
        const opacity = 1 - i * 0.18;
        return (
          <circle key={i} cx={x} cy={mid} r={r} fill="#00ff41" opacity={opacity} />
        );
      })}
      {/* Connecting line */}
      <line x1={15} y1={mid} x2={127} y2={mid} stroke="#00ff4140" strokeWidth={1} strokeDasharray="3,3" />
    </svg>
  );
}

/** Reverb: IR decay shape */
function ReverbMiniDisplay() {
  const w = 140;
  const h = 40;

  const pathD = useMemo(() => {
    const pts: string[] = [];
    for (let x = 0; x <= w; x++) {
      const t = x / w;
      const envelope = Math.exp(-3.5 * t);
      const noise = Math.sin(t * 80) * 0.3 + Math.sin(t * 137) * 0.2;
      const y = h - 4 - (h - 8) * envelope * (0.5 + noise * 0.5);
      pts.push(`${x === 0 ? "M" : "L"}${x},${Math.max(2, y).toFixed(1)}`);
    }
    return pts.join(" ");
  }, [w, h]);

  return (
    <svg width={w} height={h} style={{ display: "block", margin: "0 auto" }}>
      <path d={pathD} fill="none" stroke="#ff1493" strokeWidth={1.5} opacity={0.8} />
      <line x1={0} y1={h - 2} x2={w} y2={h - 2} stroke="#ffffff15" strokeWidth={1} />
    </svg>
  );
}

/** Noise: static grain texture */
function NoiseMiniDisplay() {
  const w = 140;
  const h = 40;

  // Pre-generate deterministic "random" dots
  const dots = useMemo(() => {
    const result: { x: number; y: number; opacity: number }[] = [];
    for (let i = 0; i < 80; i++) {
      result.push({
        x: ((i * 47 + 13) % w),
        y: ((i * 31 + 7) % h),
        opacity: 0.3 + ((i * 17) % 7) / 10,
      });
    }
    return result;
  }, [w, h]);

  return (
    <svg width={w} height={h} style={{ display: "block", margin: "0 auto" }}>
      {dots.map((d, i) => (
        <rect key={i} x={d.x} y={d.y} width={2} height={2} fill="#00ff41" opacity={d.opacity} />
      ))}
    </svg>
  );
}

/** Envelope: ADSR shape */
function EnvelopeMiniDisplay({
  attack,
  decay,
  sustain,
  release,
}: {
  attack?: number;
  decay?: number;
  sustain?: number;
  release?: number;
}) {
  const w = 140;
  const h = 40;
  const pad = 4;
  const top = pad;
  const bot = h - pad;
  const hRange = bot - top;

  const a = Math.max(0.01, attack ?? 0.1);
  const d = Math.max(0.01, decay ?? 0.2);
  const s = Math.max(0, Math.min(1, sustain ?? 0.7));
  const r = Math.max(0.01, release ?? 0.3);

  const total = a + d + 0.3 + r;
  const ax = pad + (a / total) * (w - 2 * pad);
  const dx = ax + (d / total) * (w - 2 * pad);
  const sx = dx + (0.3 / total) * (w - 2 * pad);
  const rx = sx + (r / total) * (w - 2 * pad);

  const sLevel = bot - s * hRange;

  const pathD = `M${pad},${bot} L${ax.toFixed(1)},${top} L${dx.toFixed(1)},${sLevel.toFixed(1)} L${sx.toFixed(1)},${sLevel.toFixed(1)} L${rx.toFixed(1)},${bot}`;

  return (
    <svg width={w} height={h} style={{ display: "block", margin: "0 auto" }}>
      <path d={pathD} fill="none" stroke="#8b5cf6" strokeWidth={2} opacity={0.9} />
      {/* ADSR markers */}
      <circle cx={ax} cy={top} r={2.5} fill="#ffd700" />
      <circle cx={dx} cy={sLevel} r={2.5} fill="#ffd700" />
      <circle cx={sx} cy={sLevel} r={2.5} fill="#ffd700" />
    </svg>
  );
}

/** Returns the mini-display component for a node type, or null */
function NodeMiniDisplay({ nodeType, parameters }: { nodeType: string; parameters?: Record<string, number> }) {
  switch (nodeType) {
    case "oscillator":
      return <OscillatorMiniDisplay waveform={parameters?.waveform} />;
    case "filter":
      return <FilterMiniDisplay filterType={parameters?.filter_type} />;
    case "lfo":
      return <LfoMiniDisplay />;
    case "gain":
      return <GainMiniDisplay level={parameters?.gain} />;
    case "delay":
      return <DelayMiniDisplay />;
    case "reverb":
      return <ReverbMiniDisplay />;
    case "noise":
      return <NoiseMiniDisplay />;
    case "envelope":
      return (
        <EnvelopeMiniDisplay
          attack={parameters?.attack}
          decay={parameters?.decay}
          sustain={parameters?.sustain}
          release={parameters?.release}
        />
      );
    default:
      return null;
  }
}

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
  generators: "#c8ff00",     // Lime green
  effects: "#ff6b6b",        // Coral/salmon
  modulators: "#7c3aed",     // Purple
  utilities: "#fbbf24",      // Warm yellow
  io: "#34d399",             // Mint green
  sequencers: "#f472b6",     // Pink
  midi: "#a78bfa",           // Light purple
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
        background: "#ffffff",
        border: isSelected ? `3px solid ${accentColor}` : "3px solid #000",
        borderRadius: 14,
        minWidth: 170,
        fontFamily:
          '"JetBrains Mono", ui-monospace, "SF Mono", monospace',
        fontSize: 12,
        color: "#000",
        boxShadow: isSelected
          ? `6px 6px 0px ${accentColor}`
          : "5px 5px 0px #000",
        transition: "border-color 0.15s, box-shadow 0.15s",
        overflow: "hidden",
      }}
    >
      {/* Title bar */}
      <div
        style={{
          background: accentColor,
          padding: "8px 14px",
          borderRadius: "11px 11px 0 0",
          borderBottom: "3px solid #000",
          fontWeight: 900,
          fontSize: 13,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#000",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "grab",
        }}
      >
        <span>{label}</span>
        <span style={{
          fontSize: 9,
          fontWeight: 800,
          background: "rgba(0,0,0,0.15)",
          padding: "2px 6px",
          borderRadius: 6,
        }}>
          {nodeType}
        </span>
      </div>

      {/* Mini-display visualization */}
      {!collapsed && (
        <NodeMiniDisplay nodeType={nodeType} parameters={data.parameters} />
      )}

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
                    color: "#666",
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
                    color: "#666",
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
