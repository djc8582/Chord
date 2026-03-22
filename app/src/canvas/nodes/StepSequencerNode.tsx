/**
 * StepSequencerNode — Custom React Flow node for the step sequencer.
 *
 * Displays a row of step boxes that cycle with an internal clock.
 * Active steps are lit up in orange, inactive steps are dim.
 * The current step is highlighted with a blue border.
 * Shows the current pitch value for the active step.
 */

import { memo, useState, useEffect, useCallback, useRef } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { PORT_COLORS } from "../store";

interface StepSequencerData {
  label: string;
  nodeType: string;
  parameters: Record<string, number>;
  color?: string;
  collapsed: boolean;
  inputs: { id: string; label: string; type: string }[];
  outputs: { id: string; label: string; type: string }[];
  [key: string]: unknown;
}

// Note names for display
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function midiToNoteName(midi: number): string {
  const note = NOTE_NAMES[Math.round(midi) % 12];
  const octave = Math.floor(Math.round(midi) / 12) - 1;
  return `${note}${octave}`;
}

function StepSequencerNodeComponent(props: NodeProps) {
  const data = props.data as StepSequencerData;
  const { label, parameters } = data;
  const isSelected = props.selected;

  const numSteps = Math.max(4, Math.min(32, Math.round(parameters.steps ?? 16)));
  const rate = parameters.rate ?? 4.0;

  // Generate deterministic step pattern from parameters
  const stepsRef = useRef<{ active: boolean; pitch: number }[]>([]);
  if (stepsRef.current.length !== numSteps) {
    stepsRef.current = Array.from({ length: numSteps }, (_, i) => ({
      active: i % 2 === 0 || i % 3 === 0,
      pitch: 48 + (i * 7) % 24,
    }));
  }

  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const intervalMs = Math.max(50, (60_000 / (120 * rate)) * 1);
    const timer = setInterval(() => {
      setCurrentStep((s) => (s + 1) % numSteps);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [numSteps, rate]);

  const steps = stepsRef.current;
  const activePitch = steps[currentStep]?.active ? steps[currentStep].pitch : null;

  // Layout: show 2 rows if > 16 steps
  const showTwoRows = numSteps > 16;
  const stepsPerRow = showTwoRows ? Math.ceil(numSteps / 2) : numSteps;
  const stepSize = Math.max(8, Math.min(14, Math.floor(180 / stepsPerRow)));
  const gap = 2;

  const nodeWidth = Math.max(200, stepsPerRow * (stepSize + gap) + 24);
  const nodeHeight = showTwoRows ? 150 : 130;

  const renderStepRow = useCallback(
    (startIdx: number, count: number, yOffset: number) => {
      const rowSteps = [];
      for (let i = 0; i < count && startIdx + i < numSteps; i++) {
        const idx = startIdx + i;
        const step = steps[idx];
        const isCurrent = idx === currentStep;
        const isActive = step?.active ?? false;

        rowSteps.push(
          <div
            key={idx}
            style={{
              width: stepSize,
              height: stepSize * 1.5,
              background: isActive ? "#00ff41" : "#2a2a2a",
              border: `1.5px solid ${isCurrent ? "#ff1493" : isActive ? "#00ff4180" : "#444"}`,
              borderRadius: 14,
              opacity: isActive ? (isCurrent ? 1 : 0.7) : 0.3,
              transition: "opacity 0.05s, background 0.05s",
              boxShadow: isCurrent ? "0 0 6px #ff1493" : "none",
            }}
          />
        );
      }
      return (
        <div
          key={`row-${startIdx}`}
          style={{
            display: "flex",
            gap,
            justifyContent: "center",
            marginTop: yOffset,
          }}
        >
          {rowSteps}
        </div>
      );
    },
    [steps, currentStep, numSteps, stepSize]
  );

  return (
    <div
      style={{
        background: "#ffffff",
        border: isSelected ? "3px solid #c8ff00" : "3px solid #000",
        borderRadius: 14,
        width: nodeWidth,
        height: nodeHeight,
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
          {activePitch !== null ? midiToNoteName(activePitch) : "--"}
        </span>
      </div>

      {/* Step grid */}
      <div style={{ flex: 1, padding: "6px 10px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        {renderStepRow(0, stepsPerRow, 0)}
        {showTwoRows && renderStepRow(stepsPerRow, stepsPerRow, 4)}

        {/* Step counter */}
        <div style={{ textAlign: "center", marginTop: 6, fontSize: 9, color: "#888" }}>
          Step {currentStep + 1}/{numSteps} | Rate {rate.toFixed(1)}x
        </div>
      </div>

      {/* Input handles (left) */}
      <Handle type="target" position={Position.Left} id="clock"
        style={{ top: 75, width: 14, height: 14, background: PORT_COLORS.audio, border: "2px solid #000", borderRadius: "50%" }} />

      {/* Output handles (right) */}
      <Handle type="source" position={Position.Right} id="freq"
        style={{ top: 60, width: 14, height: 14, background: PORT_COLORS.audio, border: "2px solid #000", borderRadius: "50%" }} />
      <Handle type="source" position={Position.Right} id="gate"
        style={{ top: 90, width: 14, height: 14, background: PORT_COLORS.audio, border: "2px solid #000", borderRadius: "50%" }} />
    </div>
  );
}

export const StepSequencerNode = memo(StepSequencerNodeComponent);
