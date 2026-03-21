/**
 * Canvas module — public API
 *
 * The node graph canvas is the primary interaction surface for Chord.
 * Import `Canvas` as the top-level component and `useCanvasStore` for
 * programmatic access to the canvas state.
 */

export { Canvas } from "./Canvas";
export { useCanvasStore, setCanvasBridge } from "./store";
export type { CanvasStore, NodeTypeDefinition, PortDefinition } from "./store";
export { NODE_TYPE_REGISTRY, PORT_COLORS } from "./store";
export {
  nodeDataToFlowNode,
  connectionDataToFlowEdge,
} from "./store";
export { ChordNode } from "./ChordNode";
export { NodeSearchPalette } from "./NodeSearchPalette";
