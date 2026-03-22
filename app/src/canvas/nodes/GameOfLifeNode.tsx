/**
 * GameOfLifeNode — Custom React Flow node for the Game of Life sequencer.
 *
 * Displays a small grid where live cells are colored and dead cells are dark.
 * A playhead column sweeps left to right, highlighting the current column.
 * The grid evolves according to Conway's Game of Life rules on each clock tick.
 */

import { memo, useState, useEffect, useRef } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { PORT_COLORS } from "../store";

interface GameOfLifeData {
  label: string;
  nodeType: string;
  parameters: Record<string, number>;
  color?: string;
  collapsed: boolean;
  inputs: { id: string; label: string; type: string }[];
  outputs: { id: string; label: string; type: string }[];
  [key: string]: unknown;
}

const NODE_WIDTH = 220;
const NODE_HEIGHT = 155;
const COLS = 16;
const ROWS = 8;

function createInitialGrid(): boolean[][] {
  return Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c) => {
      // Seed with a mix of patterns
      const hash = (r * 31 + c * 17 + 7) % 13;
      return hash < 4;
    })
  );
}

function evolveGrid(grid: boolean[][]): boolean[][] {
  const rows = grid.length;
  const cols = grid[0].length;
  return grid.map((row, r) =>
    row.map((cell, c) => {
      let neighbors = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = (r + dr + rows) % rows;
          const nc = (c + dc + cols) % cols;
          if (grid[nr][nc]) neighbors++;
        }
      }
      if (cell) return neighbors === 2 || neighbors === 3;
      return neighbors === 3;
    })
  );
}

function GameOfLifeNodeComponent(props: NodeProps) {
  const data = props.data as GameOfLifeData;
  const { label, parameters } = data;
  const isSelected = props.selected;

  const rate = parameters.rate ?? 4.0;
  const density = parameters.density ?? 0.3;

  const gridRef = useRef<boolean[][]>(createInitialGrid());
  const [grid, setGrid] = useState<boolean[][]>(gridRef.current);
  const [playheadCol, setPlayheadCol] = useState(0);
  const generationRef = useRef(0);

  // Reseed if density changes significantly
  const lastDensityRef = useRef(density);
  if (Math.abs(density - lastDensityRef.current) > 0.15) {
    lastDensityRef.current = density;
    gridRef.current = Array.from({ length: ROWS }, () =>
      Array.from({ length: COLS }, () => Math.random() < density)
    );
  }

  useEffect(() => {
    const intervalMs = Math.max(80, (60_000 / (120 * rate)));
    const timer = setInterval(() => {
      gridRef.current = evolveGrid(gridRef.current);
      generationRef.current++;

      // Re-seed if grid dies out
      const alive = gridRef.current.flat().filter(Boolean).length;
      if (alive < 3) {
        gridRef.current = createInitialGrid();
      }

      setGrid([...gridRef.current.map((r) => [...r])]);
      setPlayheadCol((c) => (c + 1) % COLS);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [rate, density]);

  // Count active cells in playhead column
  const activeCells = grid.reduce((acc, row) => acc + (row[playheadCol] ? 1 : 0), 0);

  const cellW = Math.floor((NODE_WIDTH - 28) / COLS);
  const cellH = Math.floor(72 / ROWS);

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
          background: "#22c55e",
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
          Gen {generationRef.current}
        </span>
      </div>

      {/* Grid */}
      <div style={{ flex: 1, padding: "6px 10px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${COLS}, ${cellW}px)`,
            gridTemplateRows: `repeat(${ROWS}, ${cellH}px)`,
            gap: 1,
            background: "#111",
            borderRadius: 3,
            padding: 2,
            border: "1px solid #333",
          }}
        >
          {grid.map((row, r) =>
            row.map((alive, c) => {
              const isPlayhead = c === playheadCol;
              let bg = "#1a1a1a";
              if (alive && isPlayhead) bg = "#fbbf24";
              else if (alive) bg = "#22c55e";
              else if (isPlayhead) bg = "#22c55e20";

              return (
                <div
                  key={`${r}-${c}`}
                  style={{
                    width: cellW,
                    height: cellH,
                    background: bg,
                    borderRadius: 1,
                    opacity: alive ? (isPlayhead ? 1 : 0.6) : (isPlayhead ? 0.4 : 0.15),
                    transition: "background 0.06s",
                  }}
                />
              );
            })
          )}
        </div>

        <div style={{ fontSize: 9, color: "#666", marginTop: 4 }}>
          Col {playheadCol + 1}/{COLS} | {activeCells} active
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

export const GameOfLifeNode = memo(GameOfLifeNodeComponent);
