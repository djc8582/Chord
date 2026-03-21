/**
 * Inspector module — Parameter editor panel.
 *
 * Shows all parameters of the selected node(s) with appropriate widgets
 * (knobs, sliders, numeric inputs).
 */

// Main component
export { Inspector, setInspectorBridge } from "./Inspector.js";
export type { InspectorProps } from "./Inspector.js";

// Store
export { useInspectorStore, PARAMETER_DEFINITIONS } from "./store.js";
export type { InspectorStore, ParameterDescriptor } from "./store.js";

// Controls
export { Slider } from "./Slider.js";
export type { SliderProps } from "./Slider.js";

export { Knob } from "./Knob.js";
export type { KnobProps } from "./Knob.js";

export { NumberInput } from "./NumberInput.js";
export type { NumberInputProps } from "./NumberInput.js";
