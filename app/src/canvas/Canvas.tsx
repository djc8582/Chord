/**
 * Canvas — Main node graph canvas component
 *
 * The primary interaction surface for Chord. Renders nodes from the
 * document-model, handles connections, drag, zoom, selection, and
 * provides the node search palette.
 *
 * Keyboard shortcuts:
 *   N / Cmd+K      — Open node search palette
 *   Delete/Backspace — Delete selected nodes/edges
 *   Cmd+A          — Select all
 *   Cmd+C          — Copy selected
 *   Cmd+V          — Paste
 *   Cmd+D          — Duplicate selected
 *   Cmd+Z          — Undo
 *   Cmd+Shift+Z    — Redo
 *   Escape         — Clear selection / close search
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import {
  ReactFlow,
  MiniMap,
  Background,
  BackgroundVariant,
  SelectionMode,
  useReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import type { NodeTypes, OnSelectionChangeParams } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useCanvasStore } from "./store";
import { ChordNode } from "./ChordNode";
import { NodeSearchPalette } from "./NodeSearchPalette";
import {
  StepSequencerNode,
  GravitySequencerNode,
  GameOfLifeNode,
  MarkovChainNode,
  PolyrhythmNode,
} from "./nodes";

// Register custom node types
const nodeTypes: NodeTypes = {
  chordNode: ChordNode,
  stepSequencerNode: StepSequencerNode,
  gravitySequencerNode: GravitySequencerNode,
  gameOfLifeNode: GameOfLifeNode,
  markovChainNode: MarkovChainNode,
  polyrhythmNode: PolyrhythmNode,
};

// Default viewport
const DEFAULT_VIEWPORT = { x: 0, y: 0, zoom: 1 };

// Minimap style
const minimapStyle = {
  background: "#0f172a",
  maskColor: "rgba(15, 23, 42, 0.7)",
};

function CanvasInner() {
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const onNodesChange = useCanvasStore((s) => s.onNodesChange);
  const onEdgesChange = useCanvasStore((s) => s.onEdgesChange);
  const onConnect = useCanvasStore((s) => s.onConnect);
  const removeSelectedNodes = useCanvasStore((s) => s.removeSelectedNodes);
  const selectAll = useCanvasStore((s) => s.selectAll);
  const clearSelection = useCanvasStore((s) => s.clearSelection);
  const openSearch = useCanvasStore((s) => s.openSearch);
  const closeSearch = useCanvasStore((s) => s.closeSearch);
  const searchOpen = useCanvasStore((s) => s.searchOpen);
  const copySelected = useCanvasStore((s) => s.copySelected);
  const pasteClipboard = useCanvasStore((s) => s.pasteClipboard);
  const duplicateSelected = useCanvasStore((s) => s.duplicateSelected);
  const reactFlowInstance = useReactFlow();
  const containerRef = useRef<HTMLDivElement>(null);

  // Get viewport center for node spawning
  const getViewportCenter = useCallback((): { x: number; y: number } => {
    try {
      const viewport = reactFlowInstance.getViewport();
      const container = containerRef.current;
      if (!container) return { x: 400, y: 300 };

      const rect = container.getBoundingClientRect();
      return {
        x: (rect.width / 2 - viewport.x) / viewport.zoom,
        y: (rect.height / 2 - viewport.y) / viewport.zoom,
      };
    } catch {
      return { x: 400, y: 300 };
    }
  }, [reactFlowInstance]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when typing in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      const isMod = e.metaKey || e.ctrlKey;

      // N — open search
      if (e.key === "n" && !isMod && !searchOpen) {
        e.preventDefault();
        openSearch();
        return;
      }

      // Cmd+K — open search
      if (e.key === "k" && isMod) {
        e.preventDefault();
        openSearch();
        return;
      }

      // Escape — close search or clear selection
      if (e.key === "Escape") {
        if (searchOpen) {
          closeSearch();
        } else {
          clearSelection();
        }
        return;
      }

      // Delete/Backspace — remove selected nodes AND edges
      if (e.key === "Delete" || e.key === "Backspace") {
        if (!searchOpen) {
          e.preventDefault();
          // Remove selected edges first
          const selectedEdges = useCanvasStore.getState().edges.filter((e) => e.selected);
          for (const edge of selectedEdges) {
            useCanvasStore.getState().disconnectEdge(edge.id);
          }
          // Then remove selected nodes
          removeSelectedNodes();
        }
        return;
      }

      // Cmd+A — select all
      if (e.key === "a" && isMod) {
        e.preventDefault();
        selectAll();
        return;
      }

      // Cmd+C — copy
      if (e.key === "c" && isMod) {
        e.preventDefault();
        copySelected();
        return;
      }

      // Cmd+V — paste
      if (e.key === "v" && isMod) {
        e.preventDefault();
        pasteClipboard();
        return;
      }

      // Cmd+D — duplicate
      if (e.key === "d" && isMod) {
        e.preventDefault();
        duplicateSelected();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    searchOpen,
    openSearch,
    closeSearch,
    clearSelection,
    removeSelectedNodes,
    selectAll,
    copySelected,
    pasteClipboard,
    duplicateSelected,
  ]);

  // Handle selection changes from React Flow
  const onSelectionChange = useCallback(
    (params: OnSelectionChangeParams) => {
      const ids = params.nodes.map((n) => n.id);
      useCanvasStore.getState().setSelectedNodeIds(ids);
    },
    [],
  );

  // Memoize spawn position for search palette
  const spawnPosition = useMemo(
    () => getViewportCenter(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchOpen],
  );

  return (
    <div
      ref={containerRef}
      data-testid="canvas-container"
      style={{
        width: "100%",
        height: "100%",
        background: "#0f172a",
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        nodeTypes={nodeTypes}
        defaultViewport={DEFAULT_VIEWPORT}
        fitView={false}
        selectionMode={SelectionMode.Partial}
        selectionOnDrag
        panOnDrag={[1]} // Middle mouse / two-finger pan
        selectNodesOnDrag={false}
        multiSelectionKeyCode="Meta"
        deleteKeyCode={null} // We handle delete ourselves
        edgesFocusable
        edgesReconnectable
        snapToGrid
        snapGrid={[10, 10]}
        minZoom={0.1}
        maxZoom={4}
        connectionLineStyle={{ stroke: "#60a5fa", strokeWidth: 2 }}
        proOptions={{ hideAttribution: true }}
        style={{ background: "#0f172a" }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#1e293b"
        />
        <MiniMap
          style={minimapStyle}
          nodeColor="#334155"
          nodeStrokeWidth={0}
          pannable
          zoomable
        />
      </ReactFlow>

      {/* Node search palette overlay */}
      <NodeSearchPalette spawnPosition={spawnPosition} />
    </div>
  );
}

/**
 * Canvas — The main node graph canvas component.
 *
 * Wraps the inner canvas in a ReactFlowProvider to ensure the
 * useReactFlow hook is available.
 */
export function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
